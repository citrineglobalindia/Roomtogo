import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { CheckStatusButton, HoldCountdown, RazorpayPayButton } from "@/components/site/booking-client";
import { PriceSummary } from "@/components/site/price-summary";
import { Notice } from "@/components/site/sections";
import { db } from "@/db";
import { inventoryHolds } from "@/db/schema";
import type { Quote } from "@/domain/pricing";
import { startPayment } from "@/domain/payments";
import { bookingForViewer } from "@/lib/booking-access";
import { formatDate } from "@/lib/dates";
import { safeMessage } from "@/lib/errors";
import { formatINR } from "@/lib/money";

export const metadata: Metadata = { title: "Payment — Room2Go", robots: { index: false, follow: false } };

export default async function Pay({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<Record<string, string>> }) {
  const { ref } = await params;
  const sp = await searchParams;
  const v = await bookingForViewer(ref);
  if (!v) notFound();
  const b = v.booking;
  if (["confirmed", "checked_in", "checked_out"].includes(b.status)) redirect(`/booking/confirmation?ref=${b.reference}`);
  const [hold] = await db.select().from(inventoryHolds).where(eq(inventoryHolds.bookingId, b.id));
  let pay: Awaited<ReturnType<typeof startPayment>> | null = null;
  let error: string | null = null;
  if (b.status === "pending_payment") {
    try {
      pay = await startPayment(b.id);
    } catch (e) {
      error = safeMessage(e);
    }
  } else {
    error = b.status === "expired" ? "Your reservation hold expired before payment was confirmed." : `This booking is ${b.status.replace("_", " ")}.`;
  }
  return (
    <div className="container-site max-w-4xl py-10">
      <h1 className="text-[40px]">Payment</h1>
      <p className="mt-1 text-sm text-muted">Booking reference <strong className="text-ink">{b.reference}</strong></p>
      <div className="mt-6 grid gap-8 md:grid-cols-[1fr_340px]">
        <div className="card space-y-5 p-6">
          {sp.failed && <Notice tone="error">The payment did not complete. No booking has been confirmed. You can try again while your room is held.</Notice>}
          {sp.recovery && <Notice tone="info">We haven’t received a confirmation from your browser. If you completed the payment, it will be verified with the payment provider automatically — you can also check now.</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
          {pay && hold && <HoldCountdown expiresAt={hold.expiresAt.toISOString()} />}
          {pay?.provider === "razorpay" && (
            <>
              {pay.mode === "test" && <Notice tone="warn">Razorpay TEST mode — use test cards/UPI only. No real money moves.</Notice>}
              <RazorpayPayButton options={pay.checkout} label={`Pay ${formatINR(pay.order.amountPaise)} securely`} />
              <p className="text-xs text-muted">You’ll complete payment in Razorpay’s secure window (UPI, cards, netbanking and other methods enabled for Room2Go’s merchant account). We never see or store your card details.</p>
            </>
          )}
          {pay?.provider === "demo" && (
            <>
              <Notice tone="warn">DEMO gateway — simulated payment, no money moves.</Notice>
              <Link href={`/demo-gateway/${pay.order.providerOrderId}`} className="btn-primary w-full">
                Continue to DEMO payment ({formatINR(pay.order.amountPaise)})
              </Link>
            </>
          )}
          {(b.status === "pending_payment" || b.status === "expired") && <CheckStatusButton reference={b.reference} />}
          {b.status === "expired" && (
            <Link href={`/book?checkIn=${b.checkIn}&checkOut=${b.checkOut}&adults=${b.adults}&children=${b.children}`} className="btn-outline w-full">
              Search again
            </Link>
          )}
        </div>
        <aside className="card p-5">
          <h2 className="text-xl">
            {formatDate(b.checkIn)} → {formatDate(b.checkOut)}
          </h2>
          <div className="mt-4">
            <PriceSummary quote={b.priceSnapshot as Quote} showNights={false} />
          </div>
        </aside>
      </div>
    </div>
  );
}
