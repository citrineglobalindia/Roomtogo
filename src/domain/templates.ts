import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { emailLayout, esc, link } from "./notifications";
import type { Settings } from "./settings";

type B = {
  id: string;
  reference: string;
  leadName: string;
  leadEmail: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  roomsCount: number;
  totalPaise: number;
  amountPaidPaise: number;
  amountRefundedPaise: number;
  isDemo: boolean;
};

const demoNote = (b: { isDemo: boolean }) =>
  b.isDemo ? `<p style="background:#fff3cd;padding:8px 12px;border-radius:6px;font-size:13px"><strong>DEMO booking</strong> — created in demo mode. No real payment was taken.</p>` : "";

function summary(b: B, rooms: string) {
  return `<table cellpadding="6" style="font-size:14px;border-collapse:collapse;width:100%">
<tr><td style="color:#6b6b63">Booking reference</td><td><strong>${esc(b.reference)}</strong></td></tr>
<tr><td style="color:#6b6b63">Check-in</td><td>${esc(formatDate(b.checkIn, { weekday: "short", day: "numeric", month: "short", year: "numeric" }))}</td></tr>
<tr><td style="color:#6b6b63">Check-out</td><td>${esc(formatDate(b.checkOut, { weekday: "short", day: "numeric", month: "short", year: "numeric" }))}</td></tr>
<tr><td style="color:#6b6b63">Stay</td><td>${b.nights} night(s) · ${b.roomsCount} room(s) · ${b.adults} adult(s)${b.children ? `, ${b.children} child(ren)` : ""}</td></tr>
<tr><td style="color:#6b6b63">Accommodation</td><td>${esc(rooms)}</td></tr>
<tr><td style="color:#6b6b63">Total</td><td>${formatINR(b.totalPaise)}</td></tr>
<tr><td style="color:#6b6b63">Paid</td><td>${formatINR(b.amountPaidPaise - b.amountRefundedPaise)}</td></tr>
<tr><td style="color:#6b6b63">Balance</td><td>${formatINR(Math.max(0, b.totalPaise - (b.amountPaidPaise - b.amountRefundedPaise)))}</td></tr>
</table>`;
}

export function bookingConfirmedEmail(b: B, rooms: string, s: Settings, manageUrl: string) {
  const times =
    s.checkInTime && s.checkOutTime ? `<p>Check-in from ${esc(s.checkInTime)} · Check-out by ${esc(s.checkOutTime)}</p>` : "";
  const html = emailLayout(
    "Your stay is confirmed",
    `${demoNote(b)}<p>Dear ${esc(b.leadName)},</p><p>Thank you for booking directly with Room2Go. Your reservation is confirmed.</p>${summary(b, rooms)}${times}
<p><strong>Address:</strong> ${esc(s.addressLine)}, ${esc(s.city)} ${esc(s.postalCode)}${s.mapUrl ? ` · <a href="${esc(s.mapUrl)}">Directions</a>` : ""}</p>
<p><a href="${esc(manageUrl)}" style="display:inline-block;background:#173d2f;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">View or manage your booking</a></p>
<p style="font-size:12px;color:#6b6b63">This link is personal — please don't forward it. Questions? Call ${esc(s.phone)} or reply to ${esc(s.email)}.</p>`,
  );
  const text = `Your Room2Go stay is confirmed.\nReference: ${b.reference}\nCheck-in: ${b.checkIn}\nCheck-out: ${b.checkOut}\nAccommodation: ${rooms}\nTotal: ${formatINR(b.totalPaise)}\nManage: ${manageUrl}\n${b.isDemo ? "DEMO booking — no real payment.\n" : ""}`;
  return { subject: `${b.isDemo ? "[DEMO] " : ""}Booking confirmed — ${b.reference}`, html, text };
}

export function staffNewBookingEmail(b: B & { source: string }, rooms: string) {
  const url = link(`/admin/reservations/${b.id}`);
  const html = emailLayout(
    `New booking ${b.reference}`,
    `${demoNote(b)}<p>Source: ${esc(b.source)}</p>${summary(b, rooms)}<p><a href="${esc(url)}">Open in admin</a></p>`,
  );
  return { subject: `${b.isDemo ? "[DEMO] " : ""}New booking ${b.reference} (${b.checkIn} → ${b.checkOut})`, html, text: `New booking ${b.reference}. ${url}` };
}

export function bookingCancelledEmail(b: B, refundNote: string) {
  const html = emailLayout(
    "Your booking has been cancelled",
    `${demoNote(b)}<p>Dear ${esc(b.leadName)},</p><p>Booking <strong>${esc(b.reference)}</strong> (${esc(b.checkIn)} → ${esc(b.checkOut)}) has been cancelled.</p><p>${esc(refundNote)}</p>`,
  );
  return { subject: `Booking cancelled — ${b.reference}`, html, text: `Booking ${b.reference} has been cancelled. ${refundNote}` };
}

export function refundUpdateEmail(b: B, amountPaise: number, status: "processing" | "succeeded" | "failed") {
  const msg =
    status === "succeeded"
      ? `Your refund of ${formatINR(amountPaise)} has been processed by our payment provider. Banks can take several working days to show it.`
      : status === "processing"
        ? `A refund of ${formatINR(amountPaise)} has been initiated and is being processed by our payment provider. We will email you when it completes.`
        : `We could not complete a refund of ${formatINR(amountPaise)}. Our team will contact you.`;
  const html = emailLayout("Refund update", `${demoNote(b)}<p>Dear ${esc(b.leadName)},</p><p>Booking <strong>${esc(b.reference)}</strong>.</p><p>${esc(msg)}</p>`);
  return { subject: `Refund update — ${b.reference}`, html, text: msg };
}

export function bookingChangedEmail(b: B, what: string, manageUrl: string) {
  const html = emailLayout(
    "Your booking has been updated",
    `${demoNote(b)}<p>Dear ${esc(b.leadName)},</p><p>${esc(what)}</p>${summary(b, "")}<p><a href="${esc(manageUrl)}">View your booking</a></p>`,
  );
  return { subject: `Booking updated — ${b.reference}`, html, text: `${what}\n${manageUrl}` };
}

export function requestReceivedEmail(b: B, kind: string) {
  const html = emailLayout(
    "We received your request",
    `<p>Dear ${esc(b.leadName)},</p><p>We have received your ${esc(kind.replace("_", " "))} request for booking <strong>${esc(b.reference)}</strong>. It is not yet approved — our team will review it and reply by email.</p>`,
  );
  return { subject: `Request received — ${b.reference}`, html, text: `We received your ${kind} request for ${b.reference}. It is pending staff review.` };
}

export function otpEmail(reference: string, code: string) {
  const html = emailLayout(
    "Your booking access code",
    `<p>Use this code to view booking <strong>${esc(reference)}</strong>:</p><p style="font-size:28px;letter-spacing:6px;font-weight:bold">${esc(code)}</p><p style="font-size:12px;color:#6b6b63">The code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>`,
  );
  return { subject: `Your Room2Go access code`, html, text: `Your access code for ${reference}: ${code} (expires in 10 minutes)` };
}

export function authEmail(kind: "verify" | "reset" | "staff_invite", url: string) {
  const title = kind === "verify" ? "Confirm your email" : kind === "reset" ? "Reset your password" : "You've been invited to Room2Go admin";
  const cta = kind === "verify" ? "Confirm email" : kind === "reset" ? "Choose a new password" : "Set your password";
  const html = emailLayout(
    title,
    `<p><a href="${esc(url)}" style="display:inline-block;background:#173d2f;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${cta}</a></p><p style="font-size:12px;color:#6b6b63">If you didn't request this, you can ignore this email.</p>`,
  );
  return { subject: `Room2Go — ${title}`, html, text: `${title}: ${url}` };
}

export function enquiryStaffEmail(e: { id: string; kind: string; name: string; checkIn: string | null; checkOut: string | null }) {
  const url = link(`/admin/enquiries/${e.id}`);
  return {
    subject: `New ${e.kind.replace("_", " ")} enquiry`,
    html: emailLayout("New enquiry", `<p>${esc(e.kind)} enquiry from ${esc(e.name)}${e.checkIn ? ` for ${esc(e.checkIn)} → ${esc(e.checkOut)}` : ""}.</p><p><a href="${esc(url)}">Open in admin</a></p>`),
    text: `New enquiry: ${url}`,
  };
}

export function enquiryAckEmail(name: string) {
  return {
    subject: "We received your enquiry — Room2Go",
    html: emailLayout("Thank you for your enquiry", `<p>Dear ${esc(name)},</p><p>We have received your message and will get back to you soon.</p>`),
    text: "Thank you — we received your enquiry and will reply soon.",
  };
}

export function preArrivalEmail(b: B, s: Settings, manageUrl: string) {
  const html = emailLayout(
    "We look forward to welcoming you",
    `<p>Dear ${esc(b.leadName)},</p><p>Your stay (${esc(b.reference)}) begins on ${esc(formatDate(b.checkIn))}.</p>
${s.checkInTime ? `<p>Check-in from ${esc(s.checkInTime)}.</p>` : ""}<p><strong>Address:</strong> ${esc(s.addressLine)}, ${esc(s.city)} ${esc(s.postalCode)}${s.mapUrl ? ` · <a href="${esc(s.mapUrl)}">Directions</a>` : ""}</p><p><a href="${esc(manageUrl)}">View your booking</a></p>`,
  );
  return { subject: `Your upcoming stay — ${b.reference}`, html, text: `Your stay ${b.reference} starts ${b.checkIn}. ${manageUrl}` };
}

export function reviewInviteEmail(b: B, url: string) {
  const html = emailLayout(
    "How was your stay?",
    `<p>Dear ${esc(b.leadName)},</p><p>Thank you for staying with Room2Go. We'd value your feedback — reviews are read by our team and, with your permission, may be published after moderation.</p><p><a href="${esc(url)}">Share your experience</a></p>`,
  );
  return { subject: "How was your stay at Room2Go?", html, text: `Share your experience: ${url}` };
}

export function paymentExceptionStaffEmail(ref: string, bookingId: string, kind: string, details: string) {
  const url = link(`/admin/reservations/${bookingId}`);
  return {
    subject: `ACTION NEEDED: payment exception on ${ref}`,
    html: emailLayout("Payment exception", `<p><strong>${esc(kind)}</strong></p><p>${esc(details)}</p><p><a href="${esc(url)}">Open booking</a></p>`),
    text: `${kind}: ${details} ${url}`,
  };
}
