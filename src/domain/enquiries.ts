import { eq } from "drizzle-orm";
import { db } from "@/db";
import { enquiries, enquiryNotes } from "@/db/schema";
import { audit, type Actor } from "@/lib/audit";
import { isIsoDate } from "@/lib/dates";
import { UserError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { enqueue, processOutbox } from "./notifications";
import { getSettings } from "./settings";
import { enquiryAckEmail, enquiryStaffEmail } from "./templates";

export type EnquiryInput = {
  kind: "general" | "extended_stay" | "corporate" | "booking";
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  guests?: number | null;
  roomsCount?: number | null;
  stayLength?: string | null;
  message: string;
  /** honeypot field — must be empty */
  website?: string | null;
  /** ms since the form rendered — very fast submissions are bots */
  elapsedMs?: number | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function submitEnquiry(input: EnquiryInput, clientKey: string) {
  if (input.website) return { ok: true, spam: true }; // silently drop bots
  if (input.elapsedMs != null && input.elapsedMs < 2500) return { ok: true, spam: true };
  await enforceRateLimit(`enquiry:${clientKey}`, 6, 3600);
  const name = input.name?.trim();
  const email = input.email?.trim().toLowerCase();
  const message = input.message?.trim();
  if (!name || name.length > 120) throw new UserError("Please enter your name.");
  if (!email || !EMAIL_RE.test(email) || email.length > 200) throw new UserError("Please enter a valid email address.");
  if (!message || message.length < 5 || message.length > 4000) throw new UserError("Please enter a message (5–4000 characters).");
  if (input.phone && !/^[+\d][\d\s-]{6,19}$/.test(input.phone.trim())) throw new UserError("Please enter a valid phone number.");
  if ((input.checkIn && !isIsoDate(input.checkIn)) || (input.checkOut && !isIsoDate(input.checkOut))) throw new UserError("Please enter valid dates.");
  if (input.checkIn && input.checkOut && input.checkOut <= input.checkIn) throw new UserError("Departure must be after arrival.");
  if (input.kind === "corporate" && !input.company?.trim()) throw new UserError("Please enter your company name.");
  const s = await getSettings();
  const e = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(enquiries)
      .values({
        kind: input.kind,
        name,
        email,
        phone: input.phone?.trim() || null,
        company: input.company?.trim() || null,
        checkIn: input.checkIn || null,
        checkOut: input.checkOut || null,
        guests: input.guests ?? null,
        roomsCount: input.roomsCount ?? null,
        stayLength: input.stayLength || null,
        message,
      })
      .returning();
    const staff = enquiryStaffEmail(row);
    for (const to of s.notificationEmails)
      await enqueue(tx, { template: "staff_enquiry", to, ...staff, dedupeKey: `staff-enquiry:${row.id}:${to}` });
    const ack = enquiryAckEmail(name);
    await enqueue(tx, { template: "enquiry_ack", to: email, ...ack, dedupeKey: `enquiry-ack:${row.id}` });
    return row;
  });
  processOutbox(5).catch(() => undefined);
  return { ok: true, id: e.id };
}

export async function updateEnquiry(
  actor: Extract<Actor, { type: "staff" }>,
  id: string,
  patch: { status?: "new" | "contacted" | "quoted" | "closed"; followUpDate?: string | null; note?: string | null },
) {
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(enquiries).where(eq(enquiries.id, id)).for("update");
    if (!before) throw new UserError("Enquiry not found.");
    if (patch.followUpDate && !isIsoDate(patch.followUpDate)) throw new UserError("Invalid follow-up date.");
    await tx
      .update(enquiries)
      .set({
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.followUpDate !== undefined ? { followUpDate: patch.followUpDate || null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(enquiries.id, id));
    if (patch.note?.trim()) await tx.insert(enquiryNotes).values({ enquiryId: id, staffId: actor.id, body: patch.note.trim() });
    await audit(tx, actor, "enquiry.updated", "enquiry", id, { status: before.status, followUpDate: before.followUpDate }, patch);
  });
}
