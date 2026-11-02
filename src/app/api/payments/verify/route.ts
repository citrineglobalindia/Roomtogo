import { NextResponse, type NextRequest } from "next/server";
import { verifyCheckoutReturn } from "@/domain/payments";
import { safeMessage } from "@/lib/errors";

/** Browser callback after hosted checkout. The signature AND a provider fetch are verified server-side. */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.nextUrl.host) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  let body: { razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!body.razorpay_order_id || !body.razorpay_payment_id || !body.razorpay_signature) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  try {
    const r = await verifyCheckoutReturn({ providerOrderId: body.razorpay_order_id, providerPaymentId: body.razorpay_payment_id, signature: body.razorpay_signature });
    const ref = r.booking.reference;
    return NextResponse.json({ outcome: r.outcome, redirect: r.outcome === "pending" ? `/checkout/pay/${ref}?failed=1` : `/booking/confirmation?ref=${ref}` });
  } catch (e) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
