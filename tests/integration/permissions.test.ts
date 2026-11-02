/**
 * Calls the real admin server actions directly (as a forged request would) with different identities.
 * Only the session lookup is stubbed; requireStaff(), the role matrix and every action body are real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { d, db, guestInput, resetDb, seedFixture, type Fixture } from "./helpers";
import * as s from "@/db/schema";

let currentUserId: string | null = null;
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () =>
        currentUserId ? { user: { id: currentUserId, email: `${currentUserId}@example.com`, emailVerified: true, name: "x" }, session: { createdAt: new Date(), userId: currentUserId } } : null,
      requestPasswordReset: async () => ({ status: true }),
    },
    $context: Promise.resolve({ password: { hash: async (p: string) => `hashed:${p}` } }),
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const A = await import("@/app/admin/actions");
const { createWebsiteBooking } = await import("@/domain/booking");
const { startPayment, verifyCheckoutReturn } = await import("@/domain/payments");
const { DemoPaymentAdapter } = await import("@/integrations/payments/demo");

let f: Fixture;
let content: Awaited<ReturnType<typeof makeStaffWithUser>>;
async function makeStaffWithUser(role: "owner" | "reception" | "content") {
  const id = `perm-${role}-${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(s.user).values({ id, name: role, email: `${id}@example.com`, emailVerified: true });
  const [m] = await db.insert(s.staffMembers).values({ userId: id, role }).returning();
  return { userId: id, staffId: m.id };
}
const fd = (o: Record<string, string | string[]>) => {
  const x = new FormData();
  for (const [k, v] of Object.entries(o)) for (const vv of [v].flat()) x.append(k, vv);
  return x;
};
const as = (userId: string | null) => (currentUserId = userId);

let owner: Awaited<ReturnType<typeof makeStaffWithUser>>;
let reception: Awaited<ReturnType<typeof makeStaffWithUser>>;
let bookingId: string;
let txnId: string;

beforeEach(async () => {
  await resetDb();
  f = await seedFixture();
  owner = await makeStaffWithUser("owner");
  reception = await makeStaffWithUser("reception");
  content = await makeStaffWithUser("content");
  const { booking } = await createWebsiteBooking(guestInput({ roomTypeId: f.exec.id, checkIn: d(10), checkOut: d(12) }));
  const { order } = await startPayment(booking.id);
  const p = await new DemoPaymentAdapter().simulatePayment(order.providerOrderId, order.amountPaise, "INR", "captured");
  await verifyCheckoutReturn({ providerOrderId: order.providerOrderId, providerPaymentId: p.paymentId, signature: p.signature });
  bookingId = booking.id;
  [{ id: txnId }] = await db.select({ id: s.paymentTransactions.id }).from(s.paymentTransactions).where(eq(s.paymentTransactions.bookingId, booking.id));
});

const DENIED = /permission|sign in/i;

describe("server actions enforce permissions regardless of UI", () => {
  it("unauthenticated and non-staff (public guest account) requests are rejected", async () => {
    as(null);
    expect((await A.bookingOpAction(null, fd({ op: "cancel", bookingId, reason: "x" })))?.error).toMatch(/sign in/i);
    await db.insert(s.user).values({ id: "public-guest", name: "Guest", email: "public@example.com", emailVerified: true });
    as("public-guest");
    expect((await A.paymentOpAction(null, fd({ op: "refund", bookingId, paymentTransactionId: txnId, amount: "100", reason: "x" })))?.error).toMatch(DENIED);
    expect((await A.staffAction(null, fd({ op: "invite", email: "me@example.com", role: "owner" })))?.error).toMatch(DENIED);
    expect(await db.select().from(s.staffMembers).where(eq(s.staffMembers.userId, "public-guest"))).toEqual([]);
  });

  it("reception is denied refunds, rates, settings, staff, content and blocks — but can operate reservations", async () => {
    as(reception.userId);
    for (const [name, r] of [
      ["refund", A.paymentOpAction(null, fd({ op: "refund", bookingId, paymentTransactionId: txnId, amount: "100", reason: "x" }))],
      ["rates", A.saveRatesAction(null, fd({ roomTypeId: f.exec.id, baseRate: "1", minStay: "1" }))],
      ["settings", A.saveSettingsAction(null, fd({ name: "Hacked" }))],
      ["staff", A.staffAction(null, fd({ op: "invite", email: "x@example.com", role: "owner" }))],
      ["content", A.contentAction(null, fd({ key: "home", heroTitle: "Hacked" }))],
      ["block", A.blockAction(null, fd({ unitId: f.units[0].id, startDate: d(30), endDate: d(31), kind: "maintenance", reason: "x" }))],
      ["price adjust", A.bookingOpAction(null, fd({ op: "adjust", bookingId, amount: "100", reason: "x" }))],
      ["inventory", A.saveUnitAction(null, fd({ label: "NEW", roomTypeId: f.exec.id, status: "active" }))],
    ] as const) {
      expect((await r)?.error, name).toMatch(DENIED);
    }
    expect((await db.select().from(s.refunds)).length).toBe(0);
    expect((await db.select().from(s.propertySettings))[0].name).not.toBe("Hacked");
    // allowed operations
    expect((await A.bookingOpAction(null, fd({ op: "note", bookingId, body: "Late arrival" })))?.ok).toBe(true);
    expect((await A.paymentOpAction(null, fd({ op: "offline", bookingId, amount: "50", method: "cash" })))?.ok).toBe(true);
  });

  it("content editor cannot touch reservations, guests or money", async () => {
    as(content.userId);
    for (const r of [
      A.bookingOpAction(null, fd({ op: "cancel", bookingId, reason: "x" })),
      A.paymentOpAction(null, fd({ op: "offline", bookingId, amount: "50", method: "cash" })),
      A.guestNoteAction(null, fd({ guestId: "00000000-0000-0000-0000-000000000000", body: "x" })),
      A.enquiryAdminAction(null, fd({ id: "00000000-0000-0000-0000-000000000000", status: "closed" })),
    ]) expect((await r)?.error).toMatch(DENIED);
    const [b] = await db.select().from(s.bookings).where(eq(s.bookings.id, bookingId));
    expect(b.status).toBe("confirmed");
    // allowed: content, but cannot self-approve policies or verify facilities (owner-only facts)
    expect((await A.contentAction(null, fd({ key: "home", op: "draft", heroTitle: "New title" })))?.ok).toBe(true);
    expect((await A.amenityAction(null, fd({ name: "Pool", scope: "shared", charge: "unknown", verified: "on" })))?.error).toMatch(/Only the owner/);
  });

  it("deactivated staff lose access immediately; the last owner cannot be removed", async () => {
    as(owner.userId);
    expect((await A.staffAction(null, fd({ op: "toggle", staffId: reception.staffId })))?.ok).toBe(true);
    as(reception.userId);
    expect((await A.bookingOpAction(null, fd({ op: "note", bookingId, body: "x" })))?.error).toMatch(DENIED);
    as(owner.userId);
    const [fixtureOwner] = await db.select().from(s.staffMembers).where(eq(s.staffMembers.id, f.staff.id));
    await db.update(s.staffMembers).set({ active: false }).where(eq(s.staffMembers.id, fixtureOwner.id));
    expect((await A.staffAction(null, fd({ op: "role", staffId: owner.staffId, role: "reception" })))?.error).toMatch(/one active owner/);
  });

  it("owner can refund within limits; refunds are audited", async () => {
    as(owner.userId);
    expect((await A.paymentOpAction(null, fd({ op: "refund", bookingId, paymentTransactionId: txnId, amount: "5000", reason: "too much" })))?.error).toMatch(/exceeds/);
    expect((await A.paymentOpAction(null, fd({ op: "refund", bookingId, paymentTransactionId: txnId, amount: "500", reason: "goodwill" })))?.ok).toBe(true);
    const logs = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "refund.requested"));
    expect(logs.length).toBe(1);
  });
});
