"use server";
import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/ui/form";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { createGuestRequest, createOtpReservation } from "@/domain/booking";
import { sendReservationOtp, verifiedOtpFor, verifyReservationOtp } from "@/domain/reservation-otp";
import { grantBookingAccess, requestAccessCode, verifyAccessCode } from "@/domain/guest-access";
import { reconcilePayments } from "@/domain/payments";
import { bookingForViewer } from "@/lib/booking-access";
import { safeMessage, UserError } from "@/lib/errors";
import { clientKey } from "@/lib/request";
import { getSession } from "@/lib/staff";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+\d][\d\s-]{6,19}$/;

/* ---------------- Email-OTP reservation (no online payment) ---------------- */

export type OtpResult = { ok: true; message: string; resendInSeconds?: number } | { ok: false; error: string; resendInSeconds?: number };

export async function sendReservationOtpAction(email: string): Promise<OtpResult> {
  try {
    const r = await sendReservationOtp(String(email ?? ""), await clientKey());
    return { ok: true, message: "We've emailed you a 6-digit code. It expires in 10 minutes.", resendInSeconds: r.resendInSeconds };
  } catch (e) {
    const msg = safeMessage(e);
    const wait = /wait (\d+) seconds/.exec(msg);
    return { ok: false, error: msg, resendInSeconds: wait ? Number(wait[1]) : undefined };
  }
}

export async function verifyReservationOtpAction(email: string, code: string): Promise<OtpResult> {
  try {
    await verifyReservationOtp(String(email ?? ""), String(code ?? ""), await clientKey());
    return { ok: true, message: "Email verified." };
  } catch (e) {
    return { ok: false, error: safeMessage(e) };
  }
}

export async function confirmReservationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let ref: string;
  try {
    const selections = fd
      .getAll("sel")
      .map(String)
      .map((s) => {
        const [roomTypeId, q] = s.split(":");
        return { roomTypeId, quantity: Number(q) };
      })
      .filter((s) => s.quantity > 0);
    const leadName = str(fd, "leadName");
    const leadEmail = str(fd, "leadEmail");
    const leadPhone = str(fd, "leadPhone");
    const fieldErrors: Record<string, string> = {};
    if (leadName.length < 2) fieldErrors.leadName = "Enter the lead guest's full name.";
    if (!EMAIL_RE.test(leadEmail)) fieldErrors.leadEmail = "Enter a valid email address.";
    if (!PHONE_RE.test(leadPhone)) fieldErrors.leadPhone = "Enter a valid phone number including country code.";
    if (Object.keys(fieldErrors).length) return { error: Object.values(fieldErrors).join(" "), fieldErrors };
    const otpId = await verifiedOtpFor(leadEmail);
    if (!otpId) return { error: "Please verify your email with the 6-digit code before confirming.", fieldErrors: { leadEmail: "Verify this email first." } };
    const session = await getSession();
    const { booking } = await createOtpReservation(
      {
        checkIn: str(fd, "checkIn"),
        checkOut: str(fd, "checkOut"),
        adults: Number(str(fd, "adults")),
        children: Number(str(fd, "children") || 0),
        selections,
        leadName,
        leadEmail,
        leadPhone,
        arrivalEta: str(fd, "arrivalEta").slice(0, 40) || null,
        specialRequests: str(fd, "specialRequests").slice(0, 1000) || null,
        acceptPolicies: fd.get("acceptPolicies") === "on",
        marketingOptIn: fd.get("marketingOptIn") === "on",
        userId: session?.user.emailVerified && session.user.email.toLowerCase() === leadEmail.toLowerCase() ? session.user.id : null,
        displayedTotalPaise: Number(str(fd, "displayedTotal")) || null,
      },
      otpId,
    );
    await grantBookingAccess(booking.id);
    ref = booking.reference;
  } catch (e) {
    return { error: safeMessage(e) };
  }
  redirect(`/booking/confirmation?ref=${ref}`);
}

export async function checkPaymentStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ref = str(fd, "ref");
  const v = await bookingForViewer(ref);
  if (!v) return { error: "Booking not found." };
  try {
    await reconcilePayments({ bookingId: v.booking.id, sinceHours: 72 });
  } catch (e) {
    return { error: safeMessage(e) };
  }
  const [b] = await db.select().from(bookings).where(eq(bookings.id, v.booking.id));
  if (b.status === "confirmed") redirect(`/booking/confirmation?ref=${b.reference}`);
  return { message: "We haven't received confirmation from the payment provider yet. If you completed payment, please wait a minute and check again — your booking will be confirmed automatically once payment is verified." };
}

export async function requestCodeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ref = str(fd, "reference");
    const email = str(fd, "email");
    if (!ref || !EMAIL_RE.test(email)) return { error: "Enter your booking reference and the email used for the booking." };
    await requestAccessCode(ref, email, await clientKey());
    return { ok: true, message: "If the details match a booking, we've emailed a 6-digit code. It expires in 10 minutes.", data: { reference: ref.toUpperCase() } };
  } catch (e) {
    return { error: safeMessage(e) };
  }
}

export async function verifyCodeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let ref: string;
  try {
    const b = await verifyAccessCode(str(fd, "reference"), str(fd, "code"), await clientKey());
    ref = b.reference;
  } catch (e) {
    return { error: safeMessage(e) };
  }
  redirect(`/manage-booking/${ref}`);
}

export async function guestRequestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const v = await bookingForViewer(str(fd, "ref"));
    if (!v || v.via === "staff") throw new UserError("Please verify access to this booking first.");
    const kind = str(fd, "kind") === "date_change" ? "date_change" : "cancellation";
    await createGuestRequest(v.booking.id, kind, { checkIn: str(fd, "checkIn") || undefined, checkOut: str(fd, "checkOut") || undefined, message: str(fd, "message") });
    return { ok: true, message: kind === "cancellation" ? "Cancellation request sent. It is not final until our team approves it — you'll receive an email." : "Date-change request sent. Our team will check availability and price and reply by email." };
  } catch (e) {
    return { error: safeMessage(e) };
  }
}

/**
 * Called by the confirmation page right after the browser has pushed `room2go_reservation_confirmed`.
 * Marks the reservation's conversion as sent (atomically), so later views never push it again.
 * Only someone who can view the reservation can mark it; it changes nothing else.
 */
export async function markReservationConversionSent(reference: string): Promise<void> {
  const v = await bookingForViewer(reference);
  if (!v) return;
  await db
    .update(bookings)
    .set({ conversionTrackedAt: new Date() })
    .where(and(eq(bookings.id, v.booking.id), isNull(bookings.conversionTrackedAt)));
}
