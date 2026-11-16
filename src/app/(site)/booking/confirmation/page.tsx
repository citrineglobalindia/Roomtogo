import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { ReservationConfirmedEvent } from "@/components/site/client-bits";
import { Notice } from "@/components/site/sections";
import { Icon } from "@/components/ui/icons";
import { db } from "@/db";
import { bookings, paymentExceptions } from "@/db/schema";
import { bookingDetail } from "@/domain/booking";
import { getSettings } from "@/domain/settings";
import { bookingForViewer } from "@/lib/booking-access";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { getSession, getSiteInfo } from "@/lib/site-session";

export const metadata: Metadata = { title: "Booking confirmation — Room2Go", robots: { index: false, follow: false } };

export default async function Confirmation({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  if (!ref) notFound();
  const v = await bookingForViewer(ref);
  if (!v) notFound();
  const d = (await bookingDetail(v.booking.id))!;
  const b = d.booking;
  const s = await getSettings();
  const info = await getSiteInfo();
  const session = await getSession();
  const [exception] = await db.select().from(paymentExceptions).where(and(eq(paymentExceptions.bookingId, b.id), eq(paymentExceptions.status, "open")));
  const confirmed = ["confirmed", "checked_in", "checked_out"].includes(b.status);
  const net = b.amountPaidPaise - b.amountRefundedPaise;
  const otpReservation = b.reservationStatus === "reservation_confirmed";
  // Conversion event: claimed atomically so only the first view of a saved reservation emits it.
  let fireConversion = false;
  if (confirmed && otpReservation && !b.conversionTrackedAt) {
    const claimed = await db
      .update(bookings)
      .set({ conversionTrackedAt: new Date() })
      .where(and(eq(bookings.id, b.id), isNull(bookings.conversionTrackedAt)))
      .returning({ id: bookings.id });
    fireConversion = claimed.length === 1;
  }
  return (
    <div className="container-site max-w-3xl py-12">
      {fireConversion && <ReservationConfirmedEvent reservationId={b.reference} />}
      {confirmed ? (
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-forest-800 text-white">
            <Icon name="check" size={28} />
          </span>
          <h1 className="mt-4 text-[42px]">{otpReservation ? "Reservation confirmed" : "Your stay is confirmed"}</h1>
          {otpReservation && (
            <p className="mt-3 inline-block rounded-full border border-gold-400/60 px-4 py-1.5 text-sm">
              Reservation ID <strong className="ml-1 font-serif text-lg tracking-wide text-forest-900" data-testid="reservation-id">{b.reference}</strong>
            </p>
          )}
          <p className="mt-3 text-muted">A confirmation email is on its way to {b.leadEmail.replace(/(.{2}).+(@.+)/, "$1•••$2")}.</p>
          {otpReservation && b.amountPaidPaise === 0 && (
            <p className="mx-auto mt-3 max-w-md rounded-md bg-forest-100 px-4 py-2 text-sm text-forest-800">Nothing has been charged. Payment is due later — by UPI QR or at the property.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <h1 className="text-[38px]">{exception ? "We need to review your payment" : "Booking not yet confirmed"}</h1>
          <Notice tone={exception ? "warn" : "info"}>
            {exception
              ? "Your payment was received but the booking could not be confirmed automatically. Our team has been alerted and will contact you about the next step or a refund."
              : b.status === "pending_payment"
                ? "We are waiting for payment verification from the provider. This page will show your confirmation once verified."
                : `This booking is ${b.status.replace("_", " ")}.`}
          </Notice>

        </div>
      )}

      <div className="card mt-8 divide-y divide-sand">
        <dl className="grid gap-4 p-6 sm:grid-cols-2">
          <Item k={otpReservation ? "Reservation ID" : "Booking reference"} v={b.reference} />
          <Item k="Status" v={otpReservation ? "Reservation confirmed" : b.status.replace("_", " ")} />
          <Item k="Check-in" v={`${formatDate(b.checkIn, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${s.checkInTime ? ` from ${s.checkInTime}` : ""}`} />
          <Item k="Check-out" v={`${formatDate(b.checkOut, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${s.checkOutTime ? ` by ${s.checkOutTime}` : ""}`} />
          <Item k="Accommodation" v={d.units.map((u) => u.roomTypeName).join(", ")} />
          <Item k="Guests" v={`${b.adults} adult(s)${b.children ? `, ${b.children} child(ren)` : ""}`} />
        </dl>
        <dl className="grid gap-2 p-6 text-sm">
          <Row k="Total" v={formatINR(b.totalPaise)} />
          <Row k="Paid" v={formatINR(net)} />
          <Row k="Balance due" v={formatINR(Math.max(0, b.totalPaise - net))} />
        </dl>
        <div className="grid gap-4 p-6 text-sm sm:grid-cols-2">
          <div>
            <p className="font-medium">Getting here</p>
            <p className="text-muted">{info.address}</p>
            {info.directionsUrl && <a className="text-forest-800 underline" href={info.directionsUrl} target="_blank" rel="noopener">Directions</a>}
          </div>
          <div>
            <p className="font-medium">Questions?</p>
            <a className="block text-forest-800" href={info.phoneHref}>{info.phone}</a>
            <a className="block text-forest-800" href={`mailto:${info.email}`}>{info.email}</a>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 p-6">
          <Link href={`/manage-booking/${b.reference}`} className="btn-primary">Manage booking</Link>
          {net > 0 && <Link href={`/documents/${b.reference}/receipt`} className="btn-outline" target="_blank">Payment receipt</Link>}
        </div>
      </div>
      {!session && (
        <div className="mt-6 rounded-md border border-sand bg-cream-50 p-5 text-sm">
          <p className="font-medium">Optional: create an account</p>
          <p className="text-muted">See all your stays in one place. Your booking is already confirmed — an account is not required.</p>
          <Link className="mt-2 inline-block text-forest-800 underline" href={`/account/register?email=${encodeURIComponent(b.leadEmail)}`}>Create an account</Link>
        </div>
      )}
    </div>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted">{k}</dt>
      <dd className="mt-1 font-serif text-lg capitalize text-forest-900">{v}</dd>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}
