import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { DemoGatewayButtons } from "@/components/site/booking-client";
import { db } from "@/db";
import { bookings, paymentOrders } from "@/db/schema";
import { isDemoMode, paymentConfig } from "@/lib/config";
import { formatINR } from "@/lib/money";

export const metadata: Metadata = { title: "DEMO payment gateway", robots: { index: false, follow: false } };

export default async function DemoGateway({ params }: { params: Promise<{ orderId: string }> }) {
  if (!isDemoMode() || paymentConfig().provider !== "demo") notFound();
  const { orderId } = await params;
  const [o] = await db.select().from(paymentOrders).where(eq(paymentOrders.providerOrderId, orderId));
  if (!o) notFound();
  const [b] = await db.select().from(bookings).where(eq(bookings.id, o.bookingId));
  return (
    <div className="container-site max-w-md py-14">
      <div className="rounded-xl border-4 border-dashed border-gold-500 bg-white p-7">
        <p className="text-center text-xs font-bold tracking-[0.3em] text-gold-700">DEMO PAYMENT GATEWAY</p>
        <h1 className="mt-3 text-center text-3xl">No real money moves</h1>
        <p className="mt-2 text-center text-sm text-muted">This page simulates a hosted payment provider so the booking flow can be tested end-to-end in development.</p>
        <dl className="my-6 space-y-1 text-sm">
          <div className="flex justify-between"><dt>Booking</dt><dd>{b.reference}</dd></div>
          <div className="flex justify-between"><dt>Order</dt><dd className="font-mono text-xs">{o.providerOrderId}</dd></div>
          <div className="flex justify-between font-semibold"><dt>Amount</dt><dd>{formatINR(o.amountPaise)}</dd></div>
        </dl>
        <DemoGatewayButtons orderId={o.providerOrderId} />
      </div>
    </div>
  );
}
