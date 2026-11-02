/**
 * Transactional messages go through a database outbox:
 *  - enqueue() inserts inside the caller's transaction with a unique dedupe key → no duplicate messages,
 *    and a message is only queued if the business change commits.
 *  - processOutbox() (cron/worker) claims due rows with FOR UPDATE SKIP LOCKED, sends, and retries with
 *    exponential backoff. Failures are visible to staff in Admin → Messages. A failed email never changes
 *    a booking's status.
 */
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { notificationOutbox } from "@/db/schema";
import { getEmailAdapter } from "@/integrations/email";
import { publicBaseUrl } from "@/lib/config";

export function esc(s: string | number | null | undefined) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function emailLayout(title: string, bodyHtml: string, footer?: string) {
  return `<!doctype html><html><body style="margin:0;background:#f7f2ea;font-family:Arial,Helvetica,sans-serif;color:#1f2a24">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fffdf9;border:1px solid #e8dfd0;border-radius:10px">
<tr><td style="padding:24px 28px;border-bottom:1px solid #e8dfd0;font-family:Georgia,serif;font-size:26px;color:#173d2f">room2go</td></tr>
<tr><td style="padding:24px 28px"><h1 style="font-family:Georgia,serif;font-weight:normal;color:#173d2f;font-size:24px;margin:0 0 16px">${esc(title)}</h1>${bodyHtml}</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e8dfd0;font-size:12px;color:#6b6b63">${footer ?? "Room2Go · J. P. Nagar, 2nd Phase, Bengaluru 560078 · +91 90355 99205"}</td></tr>
</table></td></tr></table></body></html>`;
}

export type EnqueueInput = {
  template: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  dedupeKey: string;
  bookingId?: string | null;
};

/** Returns true if newly queued, false if an identical message (same dedupe key) already exists. */
export async function enqueue(tx: DbOrTx, m: EnqueueInput): Promise<boolean> {
  const r = await tx
    .insert(notificationOutbox)
    .values({ template: m.template, toAddress: m.to, subject: m.subject, html: m.html, text: m.text, dedupeKey: m.dedupeKey, bookingId: m.bookingId ?? null })
    .onConflictDoNothing({ target: notificationOutbox.dedupeKey })
    .returning({ id: notificationOutbox.id });
  return r.length > 0;
}

export async function processOutbox(limit = 20) {
  // Claim
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      SELECT id FROM notification_outbox
      WHERE status IN ('pending','failed') AND attempts < max_attempts AND next_attempt_at <= now()
        AND (locked_until IS NULL OR locked_until < now())
      ORDER BY next_attempt_at ASC LIMIT ${limit} FOR UPDATE SKIP LOCKED`);
    const ids = rows.rows.map((r) => r.id);
    if (ids.length)
      await tx
        .update(notificationOutbox)
        .set({ status: "sending", lockedUntil: sql`now() + interval '2 minutes'` })
        .where(inArray(notificationOutbox.id, ids));
    return ids;
  });
  const adapter = getEmailAdapter();
  const summary = { sent: 0, failed: 0, captured_demo: 0, blocked: 0 };
  for (const id of claimed) {
    const [m] = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, id));
    try {
      const r = await adapter.send({ to: m.toAddress, subject: m.subject, html: m.html, text: m.text });
      if (r.status === "sent") {
        summary.sent++;
        await db
          .update(notificationOutbox)
          .set({ status: "sent", sentAt: new Date(), providerMessageId: r.providerMessageId, attempts: m.attempts + 1, lastError: null, lockedUntil: null })
          .where(eq(notificationOutbox.id, id));
      } else if (r.status === "captured_demo") {
        summary.captured_demo++;
        await db
          .update(notificationOutbox)
          .set({ status: "captured_demo", attempts: m.attempts + 1, lockedUntil: null, lastError: "DEMO mode: captured, not delivered" })
          .where(eq(notificationOutbox.id, id));
      } else {
        summary.blocked++;
        await db
          .update(notificationOutbox)
          .set({ status: "blocked_unconfigured", lastError: r.reason, lockedUntil: null })
          .where(eq(notificationOutbox.id, id));
      }
    } catch (e) {
      summary.failed++;
      const attempts = m.attempts + 1;
      const backoffMin = Math.min(2 ** attempts, 240);
      await db
        .update(notificationOutbox)
        .set({
          status: "failed",
          attempts,
          lockedUntil: null,
          lastError: (e instanceof Error ? e.message : String(e)).slice(0, 500),
          nextAttemptAt: sql`now() + make_interval(mins => ${backoffMin})`,
        })
        .where(eq(notificationOutbox.id, id));
    }
  }
  return { claimed: claimed.length, ...summary };
}

/** Staff action: requeue failed / blocked messages (e.g. after configuring SMTP). */
export async function requeueMessages(ids?: string[]) {
  const cond = ids?.length
    ? inArray(notificationOutbox.id, ids)
    : inArray(notificationOutbox.status, ["failed", "blocked_unconfigured"]);
  await db
    .update(notificationOutbox)
    .set({ status: "pending", nextAttemptAt: new Date(), attempts: 0, lockedUntil: null })
    .where(and(cond, inArray(notificationOutbox.status, ["failed", "blocked_unconfigured"])));
}

export async function outboxHealth() {
  const rows = await db
    .select({ status: notificationOutbox.status, n: sql<number>`count(*)::int` })
    .from(notificationOutbox)
    .groupBy(notificationOutbox.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
}

export async function staleSendingReset() {
  await db
    .update(notificationOutbox)
    .set({ status: "failed", lockedUntil: null })
    .where(and(eq(notificationOutbox.status, "sending"), lte(notificationOutbox.lockedUntil, new Date())));
}

export const link = (p: string) => `${publicBaseUrl()}${p}`;
