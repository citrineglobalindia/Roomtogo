/**
 * Background jobs. Triggered by an external scheduler hitting /api/cron/<job> with
 * `Authorization: Bearer $CRON_SECRET` (e.g. Vercel Cron, GitHub Actions, system cron) or by the long-running
 * worker `npm run worker`. Every job is idempotent and safe to run concurrently.
 */
import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, jobRuns } from "@/db/schema";
import { addDays, todayInTz } from "@/lib/dates";
import { manageUrl } from "./booking";
import { releaseExpiredHolds } from "./inventory";
import { enqueue, processOutbox, staleSendingReset } from "./notifications";
import { reconcilePayments } from "./payments";
import { queueReviewInvites } from "./reviews";
import { getSettings } from "./settings";
import { preArrivalEmail } from "./templates";
import { keyedHash, randomToken } from "@/lib/tokens";

async function preArrivalReminders() {
  const s = await getSettings();
  if (s.preArrivalReminderDays == null) return { skipped: "disabled" };
  const target = addDays(todayInTz(s.timezone), s.preArrivalReminderDays);
  const due = await db.select().from(bookings).where(and(eq(bookings.status, "confirmed"), eq(bookings.checkIn, target)));
  let n = 0;
  for (const b of due) {
    await db.transaction(async (tx) => {
      const token = randomToken(24);
      const m = preArrivalEmail(b, s, manageUrl(b.reference, token));
      const queued = await enqueue(tx, { template: "pre_arrival", to: b.leadEmail, ...m, dedupeKey: `pre-arrival:${b.id}:${b.checkIn}`, bookingId: b.id });
      if (queued) {
        await tx.update(bookings).set({ manageTokenHash: keyedHash(token), manageTokenExpiresAt: new Date(Date.parse(addDays(b.checkOut, 60) + "T00:00:00Z")) }).where(eq(bookings.id, b.id));
        n++;
      }
    });
  }
  return { queued: n };
}

/** Anonymise guest contact data on stays older than the configured retention period (if configured). */
async function retention() {
  const s = await getSettings();
  if (!s.guestDataRetentionDays) return { skipped: "retention not configured" };
  const cutoff = addDays(todayInTz(s.timezone), -s.guestDataRetentionDays);
  const res = await db
    .update(bookings)
    .set({ leadName: "Removed", leadEmail: sql`'removed+' || ${bookings.id} || '@invalid'`, leadPhone: "removed", specialRequests: null, arrivalEta: null })
    .where(and(lt(bookings.checkOut, cutoff), sql`${bookings.status} IN ('checked_out','cancelled','expired','no_show')`, sql`${bookings.leadName} <> 'Removed'`))
    .returning({ id: bookings.id });
  return { anonymised: res.length };
}

export const JOBS = {
  "expire-holds": async () => ({ expired: (await releaseExpiredHolds()).length }),
  outbox: async () => {
    await staleSendingReset();
    return processOutbox(50);
  },
  reconcile: () => reconcilePayments(),
  "review-invites": async () => {
    const s = await getSettings();
    return s.reviewInvitesEnabled ? queueReviewInvites() : { skipped: "disabled" };
  },
  "pre-arrival": preArrivalReminders,
  retention,
} as const;

export type JobName = keyof typeof JOBS;

export async function runJob(name: JobName) {
  await db
    .insert(jobRuns)
    .values({ job: name, lastStartedAt: new Date() })
    .onConflictDoUpdate({ target: jobRuns.job, set: { lastStartedAt: new Date() } });
  try {
    const result = await JOBS[name]();
    await db.update(jobRuns).set({ lastFinishedAt: new Date(), lastStatus: "ok", lastError: null, lastResult: result as object }).where(eq(jobRuns.job, name));
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.update(jobRuns).set({ lastFinishedAt: new Date(), lastStatus: "error", lastError: msg.slice(0, 500) }).where(eq(jobRuns.job, name));
    throw e;
  }
}

export async function runAllJobs() {
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(JOBS) as JobName[]) {
    try {
      out[name] = await runJob(name);
    } catch (e) {
      out[name] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return out;
}

export { gte, isNull };
