/**
 * DEMO payment gateway — development only. No money moves. The UI labels every screen "DEMO".
 * It behaves like a real provider for testing: orders, captured/failed payments, signatures, webhooks
 * and refunds, all stored in `demo_gateway_payments`. Refused entirely in production (see lib/config).
 */
import { createHmac, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { demoGatewayPayments } from "@/db/schema";
import { appSecret } from "@/lib/config";
import { safeEqual } from "@/lib/tokens";
import type { PaymentAdapter, ProviderPayment, ProviderRefund, WebhookEvent } from "./types";

const id = (p: string) => `${p}_DEMO${randomBytes(7).toString("hex")}`;
const secret = () => `demo:${appSecret()}`;

export function demoSign(data: string) {
  return createHmac("sha256", secret()).update(data).digest("hex");
}

export class DemoPaymentAdapter implements PaymentAdapter {
  readonly provider = "demo" as const;
  readonly mode = "demo" as const;

  async createOrder(i: { amountPaise: number; currency: string }) {
    return { id: id("order"), amountPaise: i.amountPaise, currency: i.currency };
  }
  checkoutOptions(i: { orderId: string; amountPaise: number; currency: string; bookingRef: string }) {
    return { demo: true, order_id: i.orderId, amount: i.amountPaise, currency: i.currency, bookingRef: i.bookingRef };
  }
  verifyCheckoutSignature({ orderId, paymentId, signature }: { orderId: string; paymentId: string; signature: string }) {
    return safeEqual(demoSign(`${orderId}|${paymentId}`), signature);
  }
  verifyWebhookSignature(rawBody: string, signature: string | null) {
    return !!signature && safeEqual(demoSign(rawBody), signature);
  }
  parseWebhook(rawBody: string): WebhookEvent {
    const b = JSON.parse(rawBody) as { id: string; event: string; payment?: ProviderPayment; refund?: ProviderRefund };
    if (b.event === "payment.captured" && b.payment) return { eventId: b.id, type: "payment.captured", payment: b.payment };
    if (b.event === "payment.failed" && b.payment) return { eventId: b.id, type: "payment.failed", payment: b.payment };
    if ((b.event === "refund.processed" || b.event === "refund.failed") && b.refund) return { eventId: b.id, type: b.event, refund: b.refund };
    return { eventId: b.id, type: "ignored", rawType: b.event };
  }

  /** Simulate the hosted checkout completing (used by the DEMO gateway page and tests). */
  async simulatePayment(orderId: string, amountPaise: number, currency: string, outcome: "captured" | "failed") {
    const paymentId = id("pay");
    await db.insert(demoGatewayPayments).values({ id: paymentId, orderId, amountPaise, currency, status: outcome });
    return { paymentId, signature: demoSign(`${orderId}|${paymentId}`) };
  }

  private map(r: typeof demoGatewayPayments.$inferSelect): ProviderPayment {
    return { id: r.id, orderId: r.orderId, amountPaise: r.amountPaise, currency: r.currency, status: r.status as ProviderPayment["status"], method: "demo" };
  }
  async fetchPayment(paymentId: string) {
    const [r] = await db.select().from(demoGatewayPayments).where(eq(demoGatewayPayments.id, paymentId));
    if (!r) throw new Error("Demo payment not found");
    return this.map(r);
  }
  async fetchOrderPayments(orderId: string) {
    const rows = await db.select().from(demoGatewayPayments).where(eq(demoGatewayPayments.orderId, orderId));
    return rows.map((r) => this.map(r));
  }
  async capture(paymentId: string) {
    return this.fetchPayment(paymentId);
  }
  async createRefund(i: { paymentId: string; amountPaise: number }) {
    const p = await this.fetchPayment(i.paymentId);
    if (p.status !== "captured") throw new Error("Demo payment is not captured");
    const [r] = await db.select().from(demoGatewayPayments).where(eq(demoGatewayPayments.id, i.paymentId));
    if (r.refundedPaise + i.amountPaise > r.amountPaise) throw new Error("Refund exceeds captured amount (demo gateway)");
    await db.update(demoGatewayPayments).set({ refundedPaise: r.refundedPaise + i.amountPaise }).where(eq(demoGatewayPayments.id, i.paymentId));
    return { id: id("rfnd"), paymentId: i.paymentId, amountPaise: i.amountPaise, status: "pending" as const };
  }
  async fetchRefund(paymentId: string, refundId: string) {
    // Demo refunds settle on first status check (reconciliation job / admin "check status").
    return { id: refundId, paymentId, amountPaise: 0, status: "processed" as const };
  }
}
