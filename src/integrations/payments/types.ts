/** Provider-neutral payment gateway contract. Every value here is re-verified server-side. */
export type ProviderPaymentStatus = "created" | "authorized" | "captured" | "refunded" | "failed";

export type ProviderPayment = {
  id: string;
  orderId: string | null;
  amountPaise: number;
  currency: string;
  status: ProviderPaymentStatus;
  method: string | null;
};

export type ProviderRefund = { id: string; paymentId: string; amountPaise: number; status: "pending" | "processed" | "failed" };

export type WebhookEvent =
  | { eventId: string; type: "payment.captured" | "payment.authorized" | "order.paid"; payment: ProviderPayment }
  | { eventId: string; type: "payment.failed"; payment: ProviderPayment }
  | { eventId: string; type: "refund.processed" | "refund.failed" | "refund.created"; refund: ProviderRefund }
  | { eventId: string; type: "ignored"; rawType: string };

export interface PaymentAdapter {
  readonly provider: "razorpay" | "demo";
  readonly mode: "test" | "live" | "demo";
  createOrder(input: { amountPaise: number; currency: string; receipt: string; notes: Record<string, string> }): Promise<{ id: string; amountPaise: number; currency: string }>;
  /** Payload the browser needs to open hosted checkout (public values only). */
  checkoutOptions(input: { orderId: string; amountPaise: number; currency: string; bookingRef: string; name: string; email: string; phone: string }): Record<string, unknown>;
  verifyCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }): boolean;
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean;
  parseWebhook(rawBody: string, headers: Headers): WebhookEvent;
  fetchPayment(paymentId: string): Promise<ProviderPayment>;
  fetchOrderPayments(orderId: string): Promise<ProviderPayment[]>;
  capture(paymentId: string, amountPaise: number, currency: string): Promise<ProviderPayment>;
  createRefund(input: { paymentId: string; amountPaise: number; notes: Record<string, string> }): Promise<ProviderRefund>;
  fetchRefund(paymentId: string, refundId: string): Promise<ProviderRefund>;
}
