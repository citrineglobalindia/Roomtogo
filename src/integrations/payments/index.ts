import { paymentConfig } from "@/lib/config";
import { DemoPaymentAdapter } from "./demo";
import { RazorpayAdapter } from "./razorpay";
import type { PaymentAdapter } from "./types";

/** Returns the configured adapter, or null when payments are not configured (booking stays enquiry-only). */
export function getPaymentAdapter(): PaymentAdapter | null {
  const cfg = paymentConfig();
  if (cfg.provider === "razorpay") return new RazorpayAdapter(cfg);
  if (cfg.provider === "demo") return new DemoPaymentAdapter();
  return null;
}

/** Adapter for a specific provider recorded on an existing order (e.g. reconciling old orders). */
export function getAdapterFor(provider: string): PaymentAdapter | null {
  const a = getPaymentAdapter();
  return a && a.provider === provider ? a : null;
}
export type { PaymentAdapter } from "./types";
