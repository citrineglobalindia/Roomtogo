import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { bookings, reviewInvitations, reviews } from "@/db/schema";
import { audit, type Actor } from "@/lib/audit";
import { isProduction } from "@/lib/config";
import { UserError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { keyedHash, randomToken } from "@/lib/tokens";
import { enqueue, link } from "./notifications";
import { reviewInviteEmail } from "./templates";

/** Public reviews: approved only; sample reviews are never shown in production. */
export async function publicReviews() {
  const rows = await db.select().from(reviews).where(eq(reviews.status, "approved"));
  return rows.filter((r) => r.consentToPublish && (!isProduction() ? true : r.source !== "sample"));
}

export async function submitReview(
  input: { authorName: string; displayLabel?: string; email: string; rating?: number | null; title?: string; body: string; stayMonth?: string; consent: boolean; inviteToken?: string | null; website?: string },
  clientKey: string,
) {
  if (input.website) return { ok: true };
  await enforceRateLimit(`review:${clientKey}`, 4, 3600);
  if (!input.authorName?.trim() || !input.body?.trim() || input.body.length < 20) throw new UserError("Please share at least a couple of sentences about your stay.");
  if (input.body.length > 3000) throw new UserError("Review is too long.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.email ?? "")) throw new UserError("Please enter a valid email (not published).");
  if (input.rating != null && (input.rating < 1 || input.rating > 5)) throw new UserError("Rating must be 1–5.");
  let bookingId: string | null = null;
  let source: "website_form" | "stay_invitation" = "website_form";
  if (input.inviteToken) {
    const [match] = await db
      .select()
      .from(reviewInvitations)
      .where(and(eq(reviewInvitations.tokenHash, keyedHash(input.inviteToken)), isNull(reviewInvitations.usedAt)));
    if (match && match.expiresAt.getTime() > Date.now()) {
      bookingId = match.bookingId;
      source = "stay_invitation";
      await db.update(reviewInvitations).set({ usedAt: new Date() }).where(eq(reviewInvitations.id, match.id));
    }
  }
  await db.insert(reviews).values({
    authorName: input.authorName.trim(),
    displayLabel: input.displayLabel?.trim() || null,
    email: input.email.trim().toLowerCase(),
    rating: input.rating ?? null,
    title: input.title?.trim() || null,
    body: input.body.trim(),
    stayMonth: input.stayMonth || null,
    source,
    bookingId,
    consentToPublish: Boolean(input.consent),
    status: "pending",
  });
  return { ok: true };
}

export async function moderateReview(actor: Extract<Actor, { type: "staff" }>, id: string, status: "approved" | "rejected", note?: string) {
  await db.transaction(async (tx) => {
    const [r] = await tx.select().from(reviews).where(eq(reviews.id, id)).for("update");
    if (!r) throw new UserError("Review not found.");
    if (status === "approved" && !r.consentToPublish) throw new UserError("The reviewer did not consent to publication.");
    if (status === "approved" && r.source === "sample" && isProduction()) throw new UserError("Sample reviews can never be published in production.");
    await tx.update(reviews).set({ status, moderatedByStaffId: actor.id, moderatedAt: new Date(), moderationNote: note ?? null }).where(eq(reviews.id, id));
    await audit(tx, actor, `review.${status}`, "review", id, { status: r.status }, { status, note });
  });
}

/** After checkout, queue one review invitation per booking (if enabled by the owner). */
export async function queueReviewInvites() {
  const rows = await db
    .select()
    .from(bookings)
    .leftJoin(reviewInvitations, eq(reviewInvitations.bookingId, bookings.id))
    .where(and(eq(bookings.status, "checked_out"), isNull(reviewInvitations.id)));
  let n = 0;
  for (const { bookings: b } of rows) {
    const token = randomToken(24);
    await db.transaction(async (tx) => {
      const ins = await tx
        .insert(reviewInvitations)
        .values({ bookingId: b.id, tokenHash: keyedHash(token), expiresAt: new Date(Date.now() + 60 * 86400_000) })
        .onConflictDoNothing()
        .returning();
      if (!ins.length) return;
      const m = reviewInviteEmail(b, link(`/reviews/submit?invite=${encodeURIComponent(token)}`));
      await enqueue(tx, { template: "review_invite", to: b.leadEmail, ...m, dedupeKey: `review-invite:${b.id}`, bookingId: b.id });
      n++;
    });
  }
  return { invited: n };
}
