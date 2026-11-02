import Razorpay from "razorpay";
import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/tokens";
import type { PaymentAdapter, ProviderPayment, ProviderRefund, WebhookEvent } from "./types";

type RzpPayment = { id: string; order_id: string | null; amount: number | string; currency: string; status: string; method?: string | null };
type RzpRefund = { id: string; payment_id: string; amount: number | string; status: string };

function mapPayment(p: RzpPayment): ProviderPayment {
  const status = (["created", "authorized", "captured", "refunded", "failed"].includes(p.status) ? p.status : "failed") as ProviderPayment["status"];
  return { id: p.id, orderId: p.order_id ?? null, amountPaise: Number(p.amount), currency: p.currency, status, method: p.method ?? null };
}
function mapRefund(r: RzpRefund): ProviderRefund {
  const status = r.status === "processed" ? "processed" : r.status === "failed" ? "failed" : "pending";
  return { id: r.id, paymentId: r.payment_id, amountPaise: Number(r.amount), status };
}

/**
 * Razorpay Standard Checkout adapter (hosted checkout.js). Uses the official `razorpay` Node SDK for
 * API calls; signatures are verified with HMAC-SHA256 as documented by Razorpay:
 *   checkout:  HMAC(key_secret, order_id + "|" + payment_id)
 *   webhook:   HMAC(webhook_secret, raw request body)
 */
export class RazorpayAdapter implements PaymentAdapter {
  readonly provider = "razorpay" as const;
  private client: Razorpay;
  constructor(
    private cfg: { keyId: string; keySecret: string; webhookSecret: string | null; mode: "test" | "live" },
  ) {
    this.client = new Razorpay({ key_id: cfg.keyId, key_secret: cfg.keySecret });
  }
  get mode() {
    return this.cfg.mode;
  }

  async createOrder(input: { amountPaise: number; currency: string; receipt: string; notes: Record<string, string> }) {
    const o = await this.client.orders.create({ amount: input.amountPaise, currency: input.currency, receipt: input.receipt, notes: input.notes });
    return { id: o.id, amountPaise: Number(o.amount), currency: o.currency };
  }

  checkoutOptions(i: { orderId: string; amountPaise: number; currency: string; bookingRef: string; name: string; email: string; phone: string }) {
    return {
      key: this.cfg.keyId, // public key id only
      order_id: i.orderId,
      amount: i.amountPaise,
      currency: i.currency,
      name: "Room2Go",
      description: `Booking ${i.bookingRef}`,
      prefill: { name: i.name, email: i.email, contact: i.phone },
      notes: { booking_ref: i.bookingRef },
      theme: { color: "#173d2f" },
    };
  }

  verifyCheckoutSignature({ orderId, paymentId, signature }: { orderId: string; paymentId: string; signature: string }) {
    const expected = createHmac("sha256", this.cfg.keySecret).update(`${orderId}|${paymentId}`).digest("hex");
    return safeEqual(expected, signature);
  }

  verifyWebhookSignature(rawBody: string, signature: string | null) {
    if (!this.cfg.webhookSecret || !signature) return false;
    const expected = createHmac("sha256", this.cfg.webhookSecret).update(rawBody).digest("hex");
    return safeEqual(expected, signature);
  }

  parseWebhook(rawBody: string, headers: Headers): WebhookEvent {
    const body = JSON.parse(rawBody) as { event: string; payload: { payment?: { entity: RzpPayment }; refund?: { entity: RzpRefund } } };
    const eventId = headers.get("x-razorpay-event-id") ?? `${body.event}:${body.payload.payment?.entity.id ?? body.payload.refund?.entity.id}`;
    switch (body.event) {
      case "payment.captured":
      case "payment.authorized":
      case "order.paid":
        return { eventId, type: body.event, payment: mapPayment(body.payload.payment!.entity) };
      case "payment.failed":
        return { eventId, type: "payment.failed", payment: mapPayment(body.payload.payment!.entity) };
      case "refund.processed":
      case "refund.failed":
      case "refund.created":
        return { eventId, type: body.event, refund: mapRefund(body.payload.refund!.entity) };
      default:
        return { eventId, type: "ignored", rawType: body.event };
    }
  }

  async fetchPayment(paymentId: string) {
    return mapPayment((await this.client.payments.fetch(paymentId)) as unknown as RzpPayment);
  }
  async fetchOrderPayments(orderId: string) {
    const res = (await this.client.orders.fetchPayments(orderId)) as unknown as { items: RzpPayment[] };
    return res.items.map(mapPayment);
  }
  async capture(paymentId: string, amountPaise: number, currency: string) {
    return mapPayment((await this.client.payments.capture(paymentId, amountPaise, currency)) as unknown as RzpPayment);
  }
  async createRefund(i: { paymentId: string; amountPaise: number; notes: Record<string, string> }) {
    return mapRefund((await this.client.payments.refund(i.paymentId, { amount: i.amountPaise, notes: i.notes })) as unknown as RzpRefund);
  }
  async fetchRefund(paymentId: string, refundId: string) {
    return mapRefund((await this.client.payments.fetchRefund(paymentId, refundId)) as unknown as RzpRefund);
  }
}
