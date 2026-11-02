"use server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/ui/form";
import { db } from "@/db";
import { bookings, paymentOrders } from "@/db/schema";
import { createGuestRequest, createWebsiteBooking } from "@/domain/booking";
import { grantBookingAccess, requestAccessCode, verifyAccessCode } from "@/domain/guest-access";
import { reconcilePayments, verifyCheckoutReturn } from "@/domain/payments";
import { DemoPaymentAdapter } from "@/integrations/payments/demo";
import { bookingForViewer } from "@/lib/booking-access";
import { isDemoMode, paymentConfig } from "@/lib/config";
import { safeMessage, UserError } from "@/lib/errors";
import { clientKey } from "@/lib/request";
import { getSession } from "@/lib/staff";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+\d][\d\s-]{6,19}$/;

export async function createHoldAction(_: ActionState, fd: FormData): Promise<ActionState> {
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
    const session = await getSession();
    const { booking } = await createWebsiteBooking({
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
    });
    await grantBookingAccess(booking.id);
    ref = booking.reference;
  } catch (e) {
    return { error: safeMessage(e) };
  }
  redirect(`/checkout/pay/${ref}`);
}

/** DEMO gateway only. Refused unless the configured provider is the demo adapter. */
export async function demoGatewayAction(_: ActionState, fd: FormData): Promise<ActionState> {
  if (!isDemoMode() || paymentConfig().provider !== "demo") return { error: "Demo gateway is disabled." };
  const orderId = str(fd, "orderId");
  const outcome = str(fd, "outcome") as "success" | "fail" | "close";
  const [order] = await db.select().from(paymentOrders).where(eq(paymentOrders.providerOrderId, orderId));
  if (!order) return { error: "Unknown demo order." };
  const [b] = await db.select().from(bookings).where(eq(bookings.id, order.bookingId));
  const demo = new DemoPaymentAdapter();
  let dest: string;
  try {
    const p = await demo.simulatePayment(orderId, order.amountPaise, order.currency, outcome === "fail" ? "failed" : "captured");
    if (outcome === "close") {
      // Browser "closed": no callback reaches the server. Reconciliation must recover it.
      dest = `/checkout/pay/${b.reference}?recovery=1`;
    } else {
      const r = await verifyCheckoutReturn({ providerOrderId: orderId, providerPaymentId: p.paymentId, signature: p.signature });
      dest = r.outcome === "pending" ? `/checkout/pay/${b.reference}?failed=1` : `/booking/confirmation?ref=${b.reference}`;
    }
  } catch (e) {
    return { error: safeMessage(e) };
  }
  redirect(dest);
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
