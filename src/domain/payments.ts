/**
 * Payment orchestration.
 *
 * Payment order states:   created ─▶ attempted ─▶ paid | failed     (never moves backwards)
 * Transaction states:     captured | failed | pending  (gateway rows only after provider verification)
 * Refund states:          requested ─▶ processing ─▶ succeeded | failed   (succeeded only on provider confirmation)
 *
 * Guarantees
 * - A browser callback alone never confirms: the checkout signature is verified AND the payment is
 *   fetched from the provider, and order id, amount, currency and captured status are checked.
 * - Idempotent: payment_transactions has UNIQUE (provider, provider_payment_id); gateway_events has
 *   UNIQUE (provider, event_id). Replayed / out-of-order notifications cannot duplicate money, bookings
 *   or emails (outbox dedupe keys).
 * - Late payment after hold expiry: re-allocation is attempted transactionally; if impossible the booking
 *   stays expired and an open payment exception is raised for staff + refund. Never overlaps a stay.
 * - Multiple successful payments for one booking: the extra payment is flagged `is_excess` and raises an
 *   exception for refund; it never allocates additional rooms.
 */
import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { bookings, gatewayEvents, inventoryHolds, paymentExceptions, paymentOrders, paymentTransactions, refunds } from "@/db/schema";
import { getAdapterFor, getPaymentAdapter, type PaymentAdapter } from "@/integrations/payments";
import type { ProviderPayment } from "@/integrations/payments/types";
import { audit, SYSTEM, type Actor } from "@/lib/audit";
import { AllocationError, ForbiddenError, UserError } from "@/lib/errors";
import { confirmPendingBooking, refreshPaymentTotals, type Booking } from "./booking";
import { reallocateBooking } from "./inventory";
import { enqueue } from "./notifications";
import { getSettings } from "./settings";
import { paymentExceptionStaffEmail, refundUpdateEmail } from "./templates";

type Order = typeof paymentOrders.$inferSelect;

/** Create or reuse a gateway order for the amount currently due on a pending booking. */
export async function startPayment(bookingId: string) {
  const adapter = getPaymentAdapter();
  if (!adapter) throw new UserError("Online payment is not available. Please contact us to complete your booking.");
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b) throw new UserError("Booking not found.");
  if (b.status !== "pending_payment") throw new UserError(b.status === "expired" ? "This reservation hold has expired. Please search again." : "This booking does not need payment online.");
  const [hold] = await db.select().from(inventoryHolds).where(eq(inventoryHolds.bookingId, b.id));
  if (!hold || hold.status !== "active" || hold.expiresAt.getTime() < Date.now()) throw new UserError("Your reservation hold has expired. Please search again.");
  const amount = b.dueNowPaise - (b.amountPaidPaise - b.amountRefundedPaise);
  if (amount <= 0) throw new UserError("Nothing is due for this booking.");

  // Reuse an open order for the same amount (retry safety: same reservation intent, no new allocation)
  const [existing] = await db
    .select()
    .from(paymentOrders)
    .where(
      and(
        eq(paymentOrders.bookingId, b.id),
        eq(paymentOrders.provider, adapter.provider),
        eq(paymentOrders.amountPaise, amount),
        inArray(paymentOrders.status, ["created", "attempted"]),
      ),
    )
    .orderBy(desc(paymentOrders.createdAt))
    .limit(1);
  let order = existing;
  if (!order) {
    const o = await adapter.createOrder({ amountPaise: amount, currency: b.currency, receipt: b.reference, notes: { booking_ref: b.reference, booking_id: b.id } });
    if (o.amountPaise !== amount || o.currency !== b.currency) throw new Error("Gateway order amount mismatch");
    [order] = await db
      .insert(paymentOrders)
      .values({ bookingId: b.id, provider: adapter.provider, providerMode: adapter.mode, providerOrderId: o.id, amountPaise: amount, currency: b.currency })
      .returning();
  }
  return {
    order,
    booking: b,
    holdExpiresAt: hold.expiresAt,
    checkout: adapter.checkoutOptions({ orderId: order.providerOrderId, amountPaise: order.amountPaise, currency: order.currency, bookingRef: b.reference, name: b.leadName, email: b.leadEmail, phone: b.leadPhone }),
    provider: adapter.provider,
    mode: adapter.mode,
  };
}

export type VerifyResult =
  | { outcome: "confirmed"; booking: Booking }
  | { outcome: "already_processed"; booking: Booking }
  | { outcome: "exception"; booking: Booking; message: string }
  | { outcome: "pending"; booking: Booking };

/** Browser returned from hosted checkout. Verify signature, then verify with provider, then record. */
export async function verifyCheckoutReturn(input: { providerOrderId: string; providerPaymentId: string; signature: string }): Promise<VerifyResult> {
  const adapter = getPaymentAdapter();
  if (!adapter) throw new UserError("Payments are not configured.");
  const [order] = await db
    .select()
    .from(paymentOrders)
    .where(and(eq(paymentOrders.provider, adapter.provider), eq(paymentOrders.providerOrderId, input.providerOrderId)));
  if (!order) throw new UserError("Payment could not be verified.");
  if (!adapter.verifyCheckoutSignature({ orderId: input.providerOrderId, paymentId: input.providerPaymentId, signature: input.signature })) {
    await audit(db, SYSTEM, "payment.signature_invalid", "payment_order", order.id, null, { providerPaymentId: input.providerPaymentId });
    throw new UserError("Payment could not be verified.", "bad_signature");
  }
  let payment = await adapter.fetchPayment(input.providerPaymentId);
  if (payment.status === "authorized") payment = await adapter.capture(payment.id, order.amountPaise, order.currency);
  return recordProviderPayment(adapter, order, payment, "checkout_signature");
}

/** Core idempotent recorder used by checkout return, webhooks and reconciliation. */
export async function recordProviderPayment(adapter: PaymentAdapter, order: Order, payment: ProviderPayment, via: string): Promise<VerifyResult> {
  if (payment.orderId !== order.providerOrderId) throw new UserError("Payment does not belong to this order.", "order_mismatch");
  if (payment.status === "failed" || payment.status === "created") {
    await db
      .update(paymentOrders)
      .set({ status: "attempted", updatedAt: new Date() })
      .where(and(eq(paymentOrders.id, order.id), eq(paymentOrders.status, "created")));
    const [b] = await db.select().from(bookings).where(eq(bookings.id, order.bookingId));
    return { outcome: "pending", booking: b };
  }
  if (payment.status === "authorized") {
    const [b] = await db.select().from(bookings).where(eq(bookings.id, order.bookingId));
    return { outcome: "pending", booking: b };
  }
  // captured (or later refunded — money was received)
  return db.transaction(async (tx) => {
    const [b] = await tx.select().from(bookings).where(eq(bookings.id, order.bookingId)).for("update");
    const mismatch = payment.amountPaise !== order.amountPaise || payment.currency !== order.currency;
    const inserted = await tx
      .insert(paymentTransactions)
      .values({
        bookingId: b.id,
        paymentOrderId: order.id,
        channel: "gateway",
        provider: adapter.provider,
        providerPaymentId: payment.id,
        method: payment.method,
        amountPaise: payment.amountPaise,
        currency: payment.currency,
        status: "captured",
        verifiedVia: via,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) {
      return { outcome: "already_processed" as const, booking: b };
    }
    const txn = inserted[0];
    await tx.update(paymentOrders).set({ status: "paid", updatedAt: new Date() }).where(eq(paymentOrders.id, order.id));
    await audit(tx, SYSTEM, "payment.captured", "booking", b.id, null, { providerPaymentId: payment.id, amountPaise: payment.amountPaise, via });

    if (mismatch) {
      await raiseException(tx, b, txn.id, "amount_mismatch", `Captured ${payment.amountPaise} ${payment.currency} but order was ${order.amountPaise} ${order.currency}. Booking NOT confirmed.`);
      await refreshPaymentTotals(tx, b.id);
      return { outcome: "exception" as const, booking: b, message: "Payment amount did not match. Our team has been alerted and will contact you." };
    }

    // Already covered by an earlier successful payment → excess, never allocate more rooms
    const netBefore = b.amountPaidPaise - b.amountRefundedPaise;
    if (["confirmed", "checked_in", "checked_out"].includes(b.status) && netBefore >= b.dueNowPaise) {
      await tx.update(paymentTransactions).set({ isExcess: true }).where(eq(paymentTransactions.id, txn.id));
      await raiseException(tx, b, txn.id, "excess_payment", `Additional successful payment ${payment.id} received for an already-paid booking. Refund the excess.`);
      await refreshPaymentTotals(tx, b.id);
      return { outcome: "already_processed" as const, booking: b };
    }

    if (b.status === "cancelled" || b.status === "no_show") {
      await raiseException(tx, b, txn.id, "paid_for_cancelled_booking", `Payment ${payment.id} received for a ${b.status} booking. Refund required.`);
      await refreshPaymentTotals(tx, b.id);
      return { outcome: "exception" as const, booking: b, message: "This booking was cancelled. Our team has been alerted and will refund your payment." };
    }

    if (b.status === "pending_payment" || b.status === "expired") {
      const [hold] = await tx.select().from(inventoryHolds).where(eq(inventoryHolds.bookingId, b.id)).for("update");
      const holdValid = b.status === "pending_payment" && hold?.status === "active" && hold.expiresAt.getTime() >= Date.now();
      if (!holdValid) {
        // Late payment: hold expired. Re-check allocation transactionally (savepoint).
        try {
          await tx.transaction(async (sp) => {
            const [{ n }] = await sp.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM unit_nights un JOIN booking_units bu ON bu.id = un.booking_unit_id WHERE bu.booking_id = ${b.id}`).then((r) => r.rows);
            if (n > 0) {
              // nights still held (expired but not swept): release first so reallocation sees consistent state
              await sp.execute(sql`DELETE FROM unit_nights WHERE booking_unit_id IN (SELECT id FROM booking_units WHERE booking_id = ${b.id})`);
            }
            await sp.update(inventoryHolds).set({ status: "expired", resolvedAt: new Date() }).where(and(eq(inventoryHolds.bookingId, b.id), eq(inventoryHolds.status, "active")));
            await reallocateBooking(sp, b.id, b.checkIn, b.checkOut, true);
          });
        } catch (e) {
          if (!(e instanceof AllocationError)) throw e;
          await tx.update(bookings).set({ status: "expired", updatedAt: new Date() }).where(eq(bookings.id, b.id));
          await raiseException(tx, b, txn.id, "paid_after_hold_expired", `Payment ${payment.id} arrived after the hold expired and the accommodation is no longer available. Booking NOT confirmed — refund or offer alternatives.`);
          await refreshPaymentTotals(tx, b.id);
          const [fresh] = await tx.select().from(bookings).where(eq(bookings.id, b.id));
          return { outcome: "exception" as const, booking: fresh, message: "Your payment was received, but your reservation hold had expired and the room is no longer available. Our team has been alerted and will contact you about a refund or alternative." };
        }
      }
      await refreshPaymentTotals(tx, b.id);
      const [fresh] = await tx.select().from(bookings).where(eq(bookings.id, b.id));
      if (fresh.amountPaidPaise - fresh.amountRefundedPaise >= fresh.dueNowPaise) {
        const confirmed = await confirmPendingBooking(tx, fresh, SYSTEM);
        return { outcome: "confirmed" as const, booking: confirmed };
      }
      return { outcome: "pending" as const, booking: fresh };
    }
    await refreshPaymentTotals(tx, b.id);
    const [fresh] = await tx.select().from(bookings).where(eq(bookings.id, b.id));
    return { outcome: "already_processed" as const, booking: fresh };
  });
}

async function raiseException(tx: Tx, b: Booking, txnId: string | null, kind: (typeof paymentExceptions.$inferInsert)["kind"], details: string) {
  const r = await tx
    .insert(paymentExceptions)
    .values({ bookingId: b.id, paymentTransactionId: txnId, kind, details })
    .onConflictDoNothing()
    .returning();
  if (r.length) {
    await audit(tx, SYSTEM, "payment.exception_raised", "booking", b.id, null, { kind, details });
    const s = await getSettings(tx);
    const m = paymentExceptionStaffEmail(b.reference, b.id, kind, details);
    for (const to of s.notificationEmails)
      await enqueue(tx, { template: "payment_exception", to, ...m, dedupeKey: `payment-exception:${r[0].id}:${to}`, bookingId: b.id });
  }
}

/** Signed gateway notification. Returns HTTP-ish status for the route. */
export async function handleWebhook(rawBody: string, headers: Headers, signature: string | null): Promise<{ status: number; body: string }> {
  const adapter = getPaymentAdapter();
  if (!adapter) return { status: 503, body: "payments not configured" };
  if (!adapter.verifyWebhookSignature(rawBody, signature)) return { status: 400, body: "invalid signature" };
  const ev = adapter.parseWebhook(rawBody, headers);
  const ins = await db
    .insert(gatewayEvents)
    .values({ provider: adapter.provider, eventId: ev.eventId, eventType: ev.type === "ignored" ? ev.rawType : ev.type })
    .onConflictDoNothing()
    .returning();
  if (ins.length === 0) {
    const [prev] = await db.select().from(gatewayEvents).where(and(eq(gatewayEvents.provider, adapter.provider), eq(gatewayEvents.eventId, ev.eventId)));
    if (prev?.status === "processed" || prev?.status === "ignored") return { status: 200, body: "duplicate" };
  }
  const mark = (status: string, error?: string) =>
    db
      .update(gatewayEvents)
      .set({ status, error: error ?? null, processedAt: new Date() })
      .where(and(eq(gatewayEvents.provider, adapter.provider), eq(gatewayEvents.eventId, ev.eventId)));
  try {
    if (ev.type === "ignored") {
      await mark("ignored");
      return { status: 200, body: "ignored" };
    }
    if (ev.type === "refund.processed" || ev.type === "refund.failed" || ev.type === "refund.created") {
      await applyRefundStatus(adapter.provider, ev.refund.id, ev.refund.status);
      await mark("processed");
      return { status: 200, body: "ok" };
    }
    if (!("payment" in ev)) {
      await mark("ignored");
      return { status: 200, body: "ignored" };
    }
    const payment = ev.payment;
    if (!payment.orderId) {
      await mark("ignored", "payment without order");
      return { status: 200, body: "ignored" };
    }
    const [order] = await db.select().from(paymentOrders).where(and(eq(paymentOrders.provider, adapter.provider), eq(paymentOrders.providerOrderId, payment.orderId)));
    if (!order) {
      await mark("ignored", "unknown order");
      return { status: 200, body: "unknown order" };
    }
    // Re-fetch from provider: webhook body is a hint, provider API is the authority.
    let fresh = await adapter.fetchPayment(payment.id);
    if (fresh.status === "authorized") fresh = await adapter.capture(fresh.id, order.amountPaise, order.currency);
    await recordProviderPayment(adapter, order, fresh, "webhook");
    await mark("processed");
    return { status: 200, body: "ok" };
  } catch (e) {
    await mark("error", e instanceof Error ? e.message : String(e));
    return { status: 500, body: "error" }; // provider will retry
  }
}

/** Reconcile unresolved orders with the provider (closed browser, missed webhook). Runs from cron. */
export async function reconcilePayments(opts: { sinceHours?: number; bookingId?: string } = {}) {
  const adapter = getPaymentAdapter();
  if (!adapter) return { checked: 0, recorded: 0, errors: 0, skipped: "payments not configured" };
  const since = new Date(Date.now() - (opts.sinceHours ?? 72) * 3600_000);
  const conds = [eq(paymentOrders.provider, adapter.provider), inArray(paymentOrders.status, ["created", "attempted"]), gte(paymentOrders.createdAt, since)];
  if (opts.bookingId) conds.push(eq(paymentOrders.bookingId, opts.bookingId));
  const orders = await db.select().from(paymentOrders).where(and(...conds));
  let recorded = 0;
  let errors = 0;
  for (const o of orders) {
    try {
      const pays = await adapter.fetchOrderPayments(o.providerOrderId);
      for (const p of pays) {
        if (p.status === "captured" || p.status === "authorized" || p.status === "refunded") {
          const fresh = p.status === "authorized" ? await adapter.capture(p.id, o.amountPaise, o.currency) : p;
          const r = await recordProviderPayment(adapter, o, fresh, "reconciliation");
          if (r.outcome !== "already_processed") recorded++;
        }
      }
      if (pays.length && pays.every((p) => p.status === "failed")) {
        await db.update(paymentOrders).set({ status: "attempted" }).where(and(eq(paymentOrders.id, o.id), eq(paymentOrders.status, "created")));
      }
      await db.update(paymentOrders).set({ lastReconciledAt: new Date() }).where(eq(paymentOrders.id, o.id));
    } catch (e) {
      errors++;
      console.error("reconcile error", o.id, e instanceof Error ? e.message : e);
    }
  }
  // Refunds still processing
  const processing = await db.select().from(refunds).where(and(eq(refunds.status, "processing"), eq(refunds.channel, "gateway")));
  for (const r of processing) {
    const a = getAdapterFor(r.provider ?? "");
    if (!a || !r.providerRefundId) continue;
    try {
      const [txn] = await db.select().from(paymentTransactions).where(eq(paymentTransactions.id, r.paymentTransactionId));
      const pr = await a.fetchRefund(txn.providerPaymentId!, r.providerRefundId);
      await applyRefundStatus(a.provider, r.providerRefundId, pr.status);
    } catch {
      errors++;
    }
  }
  return { checked: orders.length, recorded, errors };
}

/** Staff-recorded money received outside the gateway (cash / bank transfer / UPI to property). */
export async function recordOfflinePayment(
  actor: Extract<Actor, { type: "staff" }>,
  input: { bookingId: string; amountPaise: number; method: string; reference?: string | null; receivedAt?: Date },
) {
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0) throw new UserError("Enter a positive amount.");
  if (!["cash", "bank_transfer", "upi", "card_terminal", "other"].includes(input.method)) throw new UserError("Choose a payment method.");
  return db.transaction(async (tx) => {
    const [b] = await tx.select().from(bookings).where(eq(bookings.id, input.bookingId)).for("update");
    if (!b) throw new UserError("Booking not found.");
    if (["expired"].includes(b.status)) throw new UserError("Cannot record payment on an expired hold.");
    const [t] = await tx
      .insert(paymentTransactions)
      .values({
        bookingId: b.id,
        channel: "offline",
        method: input.method,
        reference: input.reference || null,
        amountPaise: input.amountPaise,
        status: "captured",
        verifiedVia: "staff",
        recordedByStaffId: actor.id,
        receivedAt: input.receivedAt ?? new Date(),
      })
      .returning();
    const totals = await refreshPaymentTotals(tx, b.id);
    await audit(tx, actor, "payment.offline_recorded", "booking", b.id, null, { amountPaise: input.amountPaise, method: input.method, reference: input.reference, txnId: t.id });
    return { txn: t, totals };
  });
}

/** Refundable remaining on a transaction = amount − (requested + processing + succeeded refunds). */
export async function refundableRemaining(tx: Tx | typeof db, paymentTransactionId: string) {
  const [t] = await tx.select().from(paymentTransactions).where(eq(paymentTransactions.id, paymentTransactionId));
  const [{ v }] = await tx
    .select({ v: sql<number>`coalesce(sum(${refunds.amountPaise}),0)::int` })
    .from(refunds)
    .where(and(eq(refunds.paymentTransactionId, paymentTransactionId), ne(refunds.status, "failed")));
  return t ? t.amountPaise - v : 0;
}

/**
 * Owner-only. Creates the refund record first (prevents duplicate/excess refunds under concurrency via a
 * row lock on the transaction), then calls the provider. Succeeds only on provider confirmation.
 */
export async function requestRefund(
  actor: Extract<Actor, { type: "staff" }>,
  input: { paymentTransactionId: string; amountPaise: number; reason: string },
) {
  if (actor.role !== "owner") throw new ForbiddenError("Only the owner can approve refunds.");
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0) throw new UserError("Enter a positive refund amount.");
  if (!input.reason.trim()) throw new UserError("A refund reason is required.");
  const refund = await db.transaction(async (tx) => {
    const [t] = await tx.select().from(paymentTransactions).where(eq(paymentTransactions.id, input.paymentTransactionId)).for("update");
    if (!t || t.status !== "captured") throw new UserError("Only captured payments can be refunded.");
    const remaining = await refundableRemaining(tx, t.id);
    if (input.amountPaise > remaining) throw new UserError(`Refund exceeds the refundable amount (₹${(remaining / 100).toFixed(2)} remaining).`);
    const [r] = await tx
      .insert(refunds)
      .values({
        bookingId: t.bookingId,
        paymentTransactionId: t.id,
        amountPaise: input.amountPaise,
        status: t.channel === "offline" ? "succeeded" : "requested",
        channel: t.channel,
        provider: t.provider,
        reason: input.reason,
        requestedByStaffId: actor.id,
        approvedByStaffId: actor.id,
        completedAt: t.channel === "offline" ? new Date() : null,
      })
      .returning();
    await audit(tx, actor, "refund.requested", "booking", t.bookingId, null, { refundId: r.id, amountPaise: r.amountPaise, channel: r.channel, reason: input.reason });
    if (t.channel === "offline") {
      await refreshPaymentTotals(tx, t.bookingId);
      const [b] = await tx.select().from(bookings).where(eq(bookings.id, t.bookingId));
      const m = refundUpdateEmail(b, r.amountPaise, "succeeded");
      await enqueue(tx, { template: "refund_update", to: b.leadEmail, ...m, dedupeKey: `refund:${r.id}:succeeded`, bookingId: b.id });
    }
    return { refund: r, txn: t };
  });
  if (refund.txn.channel === "offline") return refund.refund;

  const adapter = getAdapterFor(refund.txn.provider ?? "");
  if (!adapter) {
    await db.update(refunds).set({ status: "failed", failureReason: "Payment provider not configured", updatedAt: new Date() }).where(eq(refunds.id, refund.refund.id));
    throw new UserError("The payment provider is not configured, so the refund could not be sent. It has been marked failed.");
  }
  try {
    const pr = await adapter.createRefund({ paymentId: refund.txn.providerPaymentId!, amountPaise: refund.refund.amountPaise, notes: { refund_id: refund.refund.id } });
    await db.update(refunds).set({ status: "processing", providerRefundId: pr.id, updatedAt: new Date() }).where(eq(refunds.id, refund.refund.id));
    await db.transaction(async (tx) => {
      const [b] = await tx.select().from(bookings).where(eq(bookings.id, refund.txn.bookingId));
      const m = refundUpdateEmail(b, refund.refund.amountPaise, "processing");
      await enqueue(tx, { template: "refund_update", to: b.leadEmail, ...m, dedupeKey: `refund:${refund.refund.id}:processing`, bookingId: b.id });
    });
    if (pr.status === "processed" || pr.status === "failed") await applyRefundStatus(adapter.provider, pr.id, pr.status);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.update(refunds).set({ status: "failed", failureReason: msg.slice(0, 300), updatedAt: new Date() }).where(eq(refunds.id, refund.refund.id));
    await db.transaction(async (tx) => {
      const [b] = await tx.select().from(bookings).where(eq(bookings.id, refund.txn.bookingId));
      await raiseException(tx, b, refund.txn.id, "refund_failed", `Refund ${refund.refund.id} failed at provider: ${msg.slice(0, 200)}`);
    });
    throw new UserError(`The provider rejected the refund: ${msg.slice(0, 200)}`);
  }
  const [r] = await db.select().from(refunds).where(eq(refunds.id, refund.refund.id));
  return r;
}

/** Apply provider-confirmed refund status (webhook / reconciliation). Idempotent and forward-only. */
export async function applyRefundStatus(provider: string, providerRefundId: string, status: "pending" | "processed" | "failed") {
  if (status === "pending") return;
  await db.transaction(async (tx) => {
    const [r] = await tx
      .select()
      .from(refunds)
      .where(and(eq(refunds.provider, provider), eq(refunds.providerRefundId, providerRefundId)))
      .for("update");
    if (!r || r.status === "succeeded" || r.status === "failed") return;
    const next = status === "processed" ? "succeeded" : "failed";
    await tx.update(refunds).set({ status: next, completedAt: new Date(), updatedAt: new Date() }).where(eq(refunds.id, r.id));
    await refreshPaymentTotals(tx, r.bookingId);
    await audit(tx, SYSTEM, `refund.${next}`, "booking", r.bookingId, { status: r.status }, { status: next, refundId: r.id });
    const [b] = await tx.select().from(bookings).where(eq(bookings.id, r.bookingId));
    const m = refundUpdateEmail(b, r.amountPaise, next);
    await enqueue(tx, { template: "refund_update", to: b.leadEmail, ...m, dedupeKey: `refund:${r.id}:${next}`, bookingId: b.id });
    if (next === "failed") await raiseException(tx, b, r.paymentTransactionId, "refund_failed", `Provider reported refund ${providerRefundId} failed.`);
  });
}

export async function resolveException(actor: Extract<Actor, { type: "staff" }>, id: string, resolution: string) {
  if (!resolution.trim()) throw new UserError("Describe how the exception was resolved.");
  await db.transaction(async (tx) => {
    const [e] = await tx.select().from(paymentExceptions).where(eq(paymentExceptions.id, id)).for("update");
    if (!e || e.status !== "open") throw new UserError("Exception is not open.");
    await tx.update(paymentExceptions).set({ status: "resolved", resolution, resolvedAt: new Date(), resolvedByStaffId: actor.id }).where(eq(paymentExceptions.id, id));
    await audit(tx, actor, "payment.exception_resolved", "booking", e.bookingId, { status: "open" }, { status: "resolved", resolution });
  });
}

export async function markOrderCancelledForBooking(bookingId: string) {
  await db
    .update(paymentOrders)
    .set({ status: "cancelled" })
    .where(and(eq(paymentOrders.bookingId, bookingId), inArray(paymentOrders.status, ["created"])));
}
