import { NextResponse, type NextRequest } from "next/server";
import { handleWebhook } from "@/domain/payments";

/** Configure in Razorpay Dashboard → Webhooks: URL https://<domain>/api/webhooks/razorpay, events payment.*, order.paid, refund.* */
export async function POST(req: NextRequest) {
  const raw = await req.text(); // raw body is required for signature verification
  const sig = req.headers.get("x-razorpay-signature") ?? req.headers.get("x-demo-signature");
  const r = await handleWebhook(raw, req.headers, sig);
  return new NextResponse(r.body, { status: r.status });
}
