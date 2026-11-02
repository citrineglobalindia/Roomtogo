import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { GuestRequestForms } from "@/components/site/manage-client";
import { PriceSummary } from "@/components/site/price-summary";
import { Notice } from "@/components/site/sections";
import { db } from "@/db";
import { bookingRequests, paymentTransactions, refunds } from "@/db/schema";
import { bookingDetail } from "@/domain/booking";
import type { Quote } from "@/domain/pricing";
import { getSettings } from "@/domain/settings";
import { bookingForViewer } from "@/lib/booking-access";
import { formatDate, formatDateTime, todayInTz } from "@/lib/dates";
import { formatINR } from "@/lib/money";

export const metadata: Metadata = { title: "Your booking — Room2Go", robots: { index: false, follow: false } };

const PAYMENT_LABEL = { unpaid: "Not paid", partially_paid: "Partly paid", paid: "Paid", overpaid: "Overpaid — refund due" } as const;

export default async function ManageRef({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ t?: string }> }) {
  const { ref } = await params;
  const { t } = await searchParams;
  if (t) redirect(`/api/booking-access?ref=${encodeURIComponent(ref)}&t=${encodeURIComponent(t)}`);
  const v = await bookingForViewer(ref);
  if (!v) redirect(`/manage-booking?ref=${encodeURIComponent(ref)}`);
  const d = (await bookingDetail(v.booking.id))!;
  const b = d.booking;
  const s = await getSettings();
  const requests = await db.select().from(bookingRequests).where(eq(bookingRequests.bookingId, b.id)).orderBy(desc(bookingRequests.createdAt));
  const pays = await db.select().from(paymentTransactions).where(eq(paymentTransactions.bookingId, b.id));
  const refs = await db.select().from(refunds).where(eq(refunds.bookingId, b.id));
  const net = b.amountPaidPaise - b.amountRefundedPaise;
  const canRequest = ["confirmed", "pending_payment"].includes(b.status) && v.via !== "staff";
  return (
    <div className="container-site max-w-4xl py-10">
      <p className="text-sm text-muted">Booking {b.reference}</p>
      <h1 className="text-[40px]">
        {formatDate(b.checkIn)} → {formatDate(b.checkOut)}
      </h1>
      <p className="mt-1 capitalize text-forest-800">
        {b.status.replace("_", " ")} · {PAYMENT_LABEL[b.paymentStatus]}
      </p>
      {b.isDemo && <span className="badge-sample mt-2">DEMO booking</span>}
      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="text-2xl">Stay details</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-muted">Lead guest</dt><dd>{b.leadName}</dd></div>
              <div><dt className="text-muted">Guests</dt><dd>{b.adults} adult(s){b.children ? `, ${b.children} child(ren)` : ""}</dd></div>
              <div><dt className="text-muted">Accommodation</dt><dd>{d.units.map((u) => u.roomTypeName).join(", ")}</dd></div>
              <div><dt className="text-muted">Check-in / out</dt><dd>{s.checkInTime ?? "time to be confirmed"} / {s.checkOutTime ?? "time to be confirmed"}</dd></div>
              {b.specialRequests && <div className="sm:col-span-2"><dt className="text-muted">Special requests</dt><dd>{b.specialRequests}</dd></div>}
            </dl>
          </section>
          <section className="card p-6">
            <h2 className="text-2xl">Payments</h2>
            <ul className="mt-3 divide-y divide-sand text-sm">
              {pays.map((p) => (
                <li key={p.id} className="flex justify-between py-2">
                  <span>{formatDateTime(p.receivedAt)} · {p.channel === "gateway" ? "Online" : `Paid at property (${p.method})`}</span>
                  <span className="tabular-nums">{formatINR(p.amountPaise)}</span>
                </li>
              ))}
              {refs.map((r) => (
                <li key={r.id} className="flex justify-between py-2 text-muted">
                  <span>Refund · {r.status}</span>
                  <span className="tabular-nums">− {formatINR(r.amountPaise)}</span>
                </li>
              ))}
              {pays.length === 0 && <li className="py-2 text-muted">No payments recorded.</li>}
            </ul>
            <div className="mt-3 flex justify-between font-medium"><span>Balance due</span><span>{formatINR(Math.max(0, b.totalPaise - net))}</span></div>
            <div className="mt-4 flex flex-wrap gap-3">
              {net > 0 && <Link href={`/documents/${b.reference}/receipt`} target="_blank" className="btn-outline btn-sm">Payment receipt</Link>}
              {s.taxInvoicesEnabled && <Link href={`/documents/${b.reference}/invoice`} target="_blank" className="btn-outline btn-sm">Tax invoice</Link>}
              <Link href={`/documents/${b.reference}/confirmation`} target="_blank" className="btn-outline btn-sm">Booking confirmation</Link>
            </div>
          </section>
          {requests.length > 0 && (
            <section className="card p-6">
              <h2 className="text-2xl">Your requests</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {requests.map((r) => (
                  <li key={r.id} className="rounded border border-sand p-3">
                    <strong className="capitalize">{r.kind.replace("_", " ")}</strong> · {r.status}
                    {r.requestedCheckIn && ` · ${r.requestedCheckIn} → ${r.requestedCheckOut}`}
                    {r.staffResponse && <p className="mt-1 text-muted">Response: {r.staffResponse}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {canRequest && (
            <section className="card p-6">
              <h2 className="mb-3 text-2xl">Need to change something?</h2>
              <GuestRequestForms reference={b.reference} today={todayInTz(s.timezone)} />
            </section>
          )}
          {b.status === "pending_payment" && <Notice tone="info">Payment pending. <Link className="underline" href={`/checkout/pay/${b.reference}`}>Complete payment</Link></Notice>}
        </div>
        <aside className="card h-fit p-5">
          <h2 className="text-xl">Price breakdown</h2>
          <p className="mb-3 text-xs text-muted">As agreed when you booked.</p>
          <PriceSummary quote={b.priceSnapshot as Quote} showNights={false} />
          {b.totalPaise !== (b.priceSnapshot as Quote).totalPaise && <p className="mt-2 text-xs text-muted">Current total after approved changes: {formatINR(b.totalPaise)}</p>}
        </aside>
      </div>
    </div>
  );
}
