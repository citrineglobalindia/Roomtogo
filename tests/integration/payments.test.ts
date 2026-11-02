import { beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { d, db, expireHold, guestInput, resetDb, seedFixture, unitNightCount, type Fixture } from "./helpers";
import * as s from "@/db/schema";
import { applyDateChange, cancelBooking, createWebsiteBooking } from "@/domain/booking";
import { handleWebhook, reconcilePayments, recordOfflinePayment, requestRefund, startPayment, verifyCheckoutReturn } from "@/domain/payments";
import { DemoPaymentAdapter, demoSign } from "@/integrations/payments/demo";
import { processOutbox } from "@/domain/notifications";
import { setEmailAdapterForTests } from "@/integrations/email";

let f: Fixture;
const demo = new DemoPaymentAdapter();

beforeEach(async () => {
  await resetDb();
  f = await seedFixture({ execUnits: 1 });
  setEmailAdapterForTests(null);
});

async function bookAndOrder(over = {}) {
  const { booking } = await createWebsiteBooking(guestInput({ roomTypeId: f.exec.id, ...over }));
  const p = await startPayment(booking.id);
  return { booking, order: p.order };
}

async function webhook(body: object) {
  const raw = JSON.stringify(body);
  return handleWebhook(raw, new Headers(), demoSign(raw));
}

describe("payment verification", () => {
  it("valid signature + provider-verified capture confirms; booking total comes from server quote", async () => {
    const { booking, order } = await bookAndOrder();
    expect(order.amountPaise).toBe(200000); // 2 nights × ₹1,000 sample
    const pay = await demo.simulatePayment(order.providerOrderId, order.amountPaise, "INR", "captured");
    const r = await verifyCheckoutReturn({ providerOrderId: order.providerOrderId, providerPaymentId: pay.paymentId, signature: pay.signature });
    expect(r.outcome).toBe("confirmed");
    const [b] = await db.select().from(s.bookings).where(eq(s.bookings.id, booking.id));
    expect(b.status).toBe("confirmed");
    expect(b.paymentStatus).toBe("paid");
    expect(b.amountPaidPaise).toBe(200000);
  });

  it("altered signature, order or amount cannot confirm a booking", async () => {
    const { booking, order } = await bookAndOrder();
    const pay = await demo.simulatePayment(order.providerOrderId, order.amountPaise, "INR", "captured");
    await expect(verifyCheckoutReturn({ providerOrderId: order.providerOrderId, providerPaymentId: pay.paymentId, signature: "0".repeat(64) })).rejects.toThrow(/could not be verified/);
    await expect(verifyCheckoutReturn({ providerOrderId: "order_forged", providerPaymentId: pay.paymentId, signature: pay.signature })).rejects.toThrow(/could not be verified/);
    // a correctly-signed payment for a SMALLER amount (tampered checkout) → exception, not confirmed
    const cheap = await demo.simulatePayment(order.providerOrderId, 100, "INR", "captured");
    const r = await verifyCheckoutReturn({ providerOrderId: order.providerOrderId, providerPaymentId: cheap.paymentId, signature: cheap.signature });
    expect(r.outcome).toBe("exception");
    const [b] = await db.select().from(s.bookings).where(eq(s.bookings.id, booking.id));
    expect(b.status).toBe("pending_payment");
    const ex = await db.select().from(s.paymentExceptions);
    expect(ex.map((e) => e.kind)).toContain("amount_mismatch");
    // a payment from another order cannot be replayed onto this one
    const other = await createWebsiteBooking(guestInput({ roomTypeId: f.suite.id, leadEmail: "o@example.com" }));
    const otherOrder = (await startPayment(other.booking.id)).order;
    const p2 = await demo.simulatePayment(otherOrder.providerOrderId, otherOrder.amountPaise, "INR", "captured");
    await expect(verifyCheckoutReturn({ providerOrderId: order.providerOrderId, providerPaymentId: p2.paymentId, signature: demoSign(`${order.providerOrderId}|${p2.paymentId}`) })).rejects.toThrow(/does not belong/);
  });

  it("failed payment keeps the hold; retry reuses the same reservation and order", async () => {
    const { booking, order } = await bookAndOrder();
    const failed = await demo.simulatePayment(order.providerOrderId, order.amountPaise, "INR", "failed");
    const r = await verifyCheckoutReturn({ providerOrderId: order.providerOrderId, providerPaymentId: failed.paymentId, signature: failed.signature });
    expect(r.outcome).toBe("pending");
    const again = await startPayment(booking.id);
    expect(again.order.id).toBe(order.id);
    expect((await db.select().from(s.bookingUnits)).length).toBe(1);
  });
});

describe("recovery & idempotency", () => {
  it("closed browser: captured payment is reconciled and confirmed by the background job", async () => {
    const { booking, order } = await bookAndOrder();
    await demo.simulatePayment(order.providerOrderId, order.amountPaise, "INR", "captured"); // browser never returns
    const res = await reconcilePayments();
    expect(res.recorded).toBe(1);
    const [b] = await db.select().from(s.bookings).where(eq(s.bookings.id, booking.id));
    expect(b.status).toBe("confirmed");
    expect((await reconcilePayments()).recorded).toBe(0);
  });

  it("duplicate and out-of-order notifications do not duplicate collections, bookings or messages", async () => {
    const { booking, order } = await bookAndOrder();
    const pay = await demo.simulatePayment(order.providerOrderId, order.amountPaise, "INR", "captured");
    const payment = { id: pay.paymentId, orderId: order.providerOrderId, amountPaise: order.amountPaise, currency: "INR", status: "captured", method: "demo" };
    const ev = { id: "evt_1", event: "payment.captured", payment };
    expect((await webhook(ev)).status).toBe(200);
    expect((await webhook(ev)).body).toBe("duplicate");
    expect((await webhook({ ...ev, id: "evt_2" })).status).toBe(200); // different event, same payment
    await verifyCheckoutReturn({ providerOrderId: order.providerOrderId, providerPaymentId: pay.paymentId, signature: pay.signature }); // late browser callback
    // out-of-order failure notice after capture must not downgrade
    expect((await webhook({ id: "evt_3", event: "payment.failed", payment: { ...payment, status: "failed" } })).status).toBe(200);
    const txns = await db.select().from(s.paymentTransactions);
    expect(txns.length).toBe(1);
    const [b] = await db.select().from(s.bookings).where(eq(s.bookings.id, booking.id));
    expect(b.status).toBe("confirmed");
    expect(b.amountPaidPaise).toBe(order.amountPaise);
    const [o] = await db.select().from(s.paymentOrders).where(eq(s.paymentOrders.id, order.id));
    expect(o.status).toBe("paid");
    const confirmations = await db.select().from(s.notificationOutbox).where(eq(s.notificationOutbox.template, "booking_confirmed"));
    expect(confirmations.length).toBe(1);
    // forged webhook rejected
    expect((await handleWebhook(JSON.stringify(ev), new Headers(), "bad")).status).toBe(400);
  });

  it("a second successful payment is flagged as excess and never allocates more rooms", async () => {
    const { booking, order } = await bookAndOrder();
    const p1 = await demo.simulatePayment(order.providerOrderId, order.amountPaise, "INR", "captured");
    const p2 = await demo.simulatePayment(order.providerOrderId, order.amountPaise, "INR", "captured");
    await verifyCheckoutReturn({ providerOrderId: order.providerOrderId, providerPaymentId: p1.paymentId, signature: p1.signature });
    await verifyCheckoutReturn({ providerOrderId: order.providerOrderId, providerPaymentId: p2.paymentId, signature: p2.signature });
    const txns = await db.select().from(s.paymentTransactions).where(eq(s.paymentTransactions.bookingId, booking.id));
    expect(txns.filter((t) => t.isExcess).length).toBe(1);
    expect((await db.select().from(s.paymentExceptions)).map((e) => e.kind)).toEqual(["excess_payment"]);
    expect(await unitNightCount(booking.id)).toBe(2);
    const [b] = await db.select().from(s.bookings).where(eq(s.bookings.id, booking.id));
    expect(b.paymentStatus).toBe("overpaid");
  });
});

describe("late payment after hold expiry", () => {
  it("re-allocates when the unit is still free", async () => {
    const { booking, order } = await bookAndOrder();
    await expireHold(booking.id);
    const pay = await demo.simulatePayment(order.providerOrderId, order.amountPaise, "INR", "captured");
    const r = await verifyCheckoutReturn({ providerOrderId: order.providerOrderId, providerPaymentId: pay.paymentId, signature: pay.signature });
    expect(r.outcome).toBe("confirmed");
    expect(await unitNightCount(booking.id)).toBe(2);
  });

  it("never oversells: if the unit was resold, raises a staff exception and leaves the booking unconfirmed", async () => {
    const { booking, order } = await bookAndOrder();
    await expireHold(booking.id);
    const rival = await createWebsiteBooking(guestInput({ roomTypeId: f.exec.id, leadEmail: "rival@example.com" }));
    const pay = await demo.simulatePayment(order.providerOrderId, order.amountPaise, "INR", "captured");
    const r = await verifyCheckoutReturn({ providerOrderId: order.providerOrderId, providerPaymentId: pay.paymentId, signature: pay.signature });
    expect(r.outcome).toBe("exception");
    const [b] = await db.select().from(s.bookings).where(eq(s.bookings.id, booking.id));
    expect(b.status).toBe("expired");
    expect(b.amountPaidPaise).toBe(order.amountPaise); // money is tracked for refund
    expect(await unitNightCount(booking.id)).toBe(0);
    expect(await unitNightCount(rival.booking.id)).toBe(2);
    const ex = await db.select().from(s.paymentExceptions);
    expect(ex[0].kind).toBe("paid_after_hold_expired");
    expect((await db.select().from(s.notificationOutbox).where(eq(s.notificationOutbox.template, "payment_exception"))).length).toBe(1);
    const dup = await db.execute<{ n: number }>(sql`SELECT count(*)::int n FROM (SELECT unit_id, night FROM unit_nights GROUP BY 1,2 HAVING count(*) > 1) x`);
    expect(dup.rows[0].n).toBe(0);
  });
});

async function paidBooking() {
  const { booking, order } = await bookAndOrder();
  const pay = await demo.simulatePayment(order.providerOrderId, order.amountPaise, "INR", "captured");
  await verifyCheckoutReturn({ providerOrderId: order.providerOrderId, providerPaymentId: pay.paymentId, signature: pay.signature });
  const [txn] = await db.select().from(s.paymentTransactions).where(eq(s.paymentTransactions.bookingId, booking.id));
  return { booking, txn };
}

describe("cancellation & refunds", () => {
  it("cancellation releases stock immediately while refunds progress independently and cannot exceed the payment", async () => {
    const { booking, txn } = await paidBooking();
    await cancelBooking(f.reception, booking.id, "Guest request");
    expect(await unitNightCount(booking.id)).toBe(0);
    // reception may cancel but cannot refund
    await expect(requestRefund(f.reception, { paymentTransactionId: txn.id, amountPaise: 1000, reason: "x" })).rejects.toThrow(/Only the owner/);
    const r1 = await requestRefund(f.staff, { paymentTransactionId: txn.id, amountPaise: 50000, reason: "Partial per policy" });
    expect(r1.status).toBe("processing"); // NOT succeeded until provider confirms
    let [b] = await db.select().from(s.bookings).where(eq(s.bookings.id, booking.id));
    expect(b.amountRefundedPaise).toBe(0);
    await expect(requestRefund(f.staff, { paymentTransactionId: txn.id, amountPaise: 150001, reason: "too much" })).rejects.toThrow(/exceeds the refundable amount/);
    // concurrent refund attempts for the remaining amount: at most one wins
    const both = await Promise.allSettled([
      requestRefund(f.staff, { paymentTransactionId: txn.id, amountPaise: 150000, reason: "rest" }),
      requestRefund(f.staff, { paymentTransactionId: txn.id, amountPaise: 150000, reason: "rest dup" }),
    ]);
    expect(both.filter((x) => x.status === "fulfilled").length).toBe(1);
    // provider confirms via reconciliation
    await reconcilePayments();
    [b] = await db.select().from(s.bookings).where(eq(s.bookings.id, booking.id));
    expect(b.amountRefundedPaise).toBe(200000);
    expect(b.status).toBe("cancelled");
    const rs = await db.select().from(s.refunds);
    expect(rs.every((r) => r.status === "succeeded")).toBe(true);
    const emails = await db.select().from(s.notificationOutbox).where(eq(s.notificationOutbox.template, "refund_update"));
    expect(emails.length).toBe(4); // processing + succeeded for each of two refunds, deduplicated
  });

  it("offline payments are recorded with staff identity and distinguished from gateway payments", async () => {
    const { booking } = await paidBooking();
    const r = await recordOfflinePayment(f.reception, { bookingId: booking.id, amountPaise: 5000, method: "cash", reference: "Receipt 12" });
    expect(r.txn.channel).toBe("offline");
    expect(r.txn.recordedByStaffId).toBe(f.reception.id);
    expect(r.totals.status).toBe("overpaid");
  });
});

describe("pricing snapshot", () => {
  it("rate and policy edits do not change a confirmed booking; a date change re-prices with an audited delta", async () => {
    const { booking } = await paidBooking();
    await db.update(s.roomTypes).set({ baseRatePaise: 999900 }).where(eq(s.roomTypes.id, f.exec.id));
    await db.update(s.policyVersions).set({ body: "C v2 — different" }).where(eq(s.policyVersions.kind, "cancellation"));
    const [b] = await db.select().from(s.bookings).where(eq(s.bookings.id, booking.id));
    expect(b.totalPaise).toBe(200000);
    expect((b.policySnapshot as { cancellation: { body: string } }).cancellation.body).toBe("C v1");
    const nights = await db.execute<{ total: number }>(sql`SELECT sum(rate_paise)::int total FROM booking_nights bn JOIN booking_units bu ON bu.id = bn.booking_unit_id WHERE bu.booking_id = ${booking.id}`);
    expect(nights.rows[0].total).toBe(200000);
    // approved date change: fresh price at current rates, delta stored as adjustment
    const res = await applyDateChange(f.staff, booking.id, d(20), d(21));
    expect(res.booking.totalPaise).toBe(999900);
    expect(res.deltaPaise).toBe(999900 - 200000);
    const adj = await db.select().from(s.bookingAdjustments).where(and(eq(s.bookingAdjustments.bookingId, booking.id), eq(s.bookingAdjustments.kind, "date_change")));
    expect(adj.length).toBe(1);
    expect(await unitNightCount(booking.id)).toBe(1);
  });
});

describe("email failure", () => {
  it("a failing email provider never cancels a paid booking; messages retry and failures are visible", async () => {
    setEmailAdapterForTests({ send: async () => { throw new Error("SMTP 421 try later"); } });
    const { booking } = await paidBooking();
    const r = await processOutbox();
    expect(r.failed).toBeGreaterThan(0);
    const failed = await db.select().from(s.notificationOutbox).where(eq(s.notificationOutbox.status, "failed"));
    expect(failed[0].lastError).toMatch(/SMTP 421/);
    const [b] = await db.select().from(s.bookings).where(eq(s.bookings.id, booking.id));
    expect(b.status).toBe("confirmed");
    // provider recovers → retry sends (make retries due now)
    setEmailAdapterForTests({ send: async () => ({ status: "sent", providerMessageId: "m1" }) });
    await db.update(s.notificationOutbox).set({ nextAttemptAt: new Date(Date.now() - 1000) });
    await processOutbox();
    const sent = await db.select().from(s.notificationOutbox).where(eq(s.notificationOutbox.status, "sent"));
    expect(sent.length).toBe(failed.length);
  });
});
