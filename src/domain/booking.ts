/**
 * Reservation lifecycle.
 *
 * Reservation states (bookings.status) — separate from payment state (bookings.payment_status):
 *   pending_payment ──(payment verified, hold active)──▶ confirmed
 *   pending_payment ──(hold expires)──▶ expired           [nights released]
 *   expired ──(late payment AND units still free)──▶ confirmed  [re-allocated transactionally]
 *   expired ──(late payment, no units)──▶ expired + payment exception for staff/refund
 *   confirmed ──▶ checked_in ──▶ checked_out              [early departure releases future nights]
 *   confirmed ──▶ no_show                                  [nights from today released]
 *   pending_payment | confirmed ──▶ cancelled              [all nights released; refunds tracked separately]
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, type DbOrTx, type Tx } from "@/db";
import {
  bookingAdjustments,
  bookingNights,
  bookingRequests,
  bookingUnits,
  bookings,
  guests,
  inventoryHolds,
  paymentTransactions,
  policyVersions,
  refunds,
  roomTypes,
  roomUnits,
  user,
} from "@/db/schema";
import { audit, type Actor } from "@/lib/audit";
import { isDemoMode } from "@/lib/config";
import { addDays, diffDays, isIsoDate, todayInTz } from "@/lib/dates";
import { AllocationError, UserError } from "@/lib/errors";
import { bookingReference, keyedHash, randomToken, safeEqual } from "@/lib/tokens";
import { allocateRooms, reallocateBooking, releaseBookingNights, type AllocationRequest } from "./inventory";
import { enqueue, link } from "./notifications";
import { distributeGuests, PricingError, quoteStay, type Quote } from "./pricing";
import { getSettings, onlineBookingStatus, type Settings } from "./settings";
import {
  bookingCancelledEmail,
  bookingChangedEmail,
  bookingConfirmedEmail,
  requestReceivedEmail,
  staffNewBookingEmail,
} from "./templates";

export const MAX_ONLINE_NIGHTS = 30;

export type Booking = typeof bookings.$inferSelect;

export function validateStayDates(checkIn: string, checkOut: string, s: Settings, opts: { staff?: boolean } = {}) {
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) throw new UserError("Please choose valid arrival and departure dates.");
  if (checkOut <= checkIn) throw new UserError("Departure must be after arrival.");
  const today = todayInTz(s.timezone);
  if (!opts.staff && checkIn < today) throw new UserError("Arrival date cannot be in the past.");
  if (!opts.staff && checkIn > addDays(today, s.bookingWindowDays))
    throw new UserError(`Online bookings are available up to ${s.bookingWindowDays} days ahead.`);
  if (!opts.staff && diffDays(checkIn, checkOut) > MAX_ONLINE_NIGHTS)
    throw new UserError(`For stays longer than ${MAX_ONLINE_NIGHTS} nights please send an extended-stay enquiry.`);
}

export type Selection = { roomTypeId: string; quantity: number };

export function expandSelections(sel: Selection[]): string[] {
  const out: string[] = [];
  for (const s of sel) {
    if (!Number.isInteger(s.quantity) || s.quantity < 0 || s.quantity > 20) throw new UserError("Invalid room quantity.");
    for (let i = 0; i < s.quantity; i++) out.push(s.roomTypeId);
  }
  return out;
}

/** Server-side quote for a guest selection (used for summary display AND for the authoritative booking). */
export async function quoteSelection(
  input: { checkIn: string; checkOut: string; adults: number; children: number; selections: Selection[] },
  s: Settings,
  tx: DbOrTx = db,
  opts: { staff?: boolean } = {},
) {
  validateStayDates(input.checkIn, input.checkOut, s, opts);
  if (!Number.isInteger(input.adults) || input.adults < 1) throw new UserError("At least one adult is required.");
  if (!Number.isInteger(input.children) || input.children < 0) throw new UserError("Invalid number of children.");
  const typeIds = expandSelections(input.selections);
  if (typeIds.length === 0) throw new UserError("Please select at least one room.");
  if (!opts.staff && typeIds.length > s.maxRoomsPerBooking)
    throw new UserError(`Up to ${s.maxRoomsPerBooking} rooms can be booked online. Please enquire for larger groups.`);
  const types = await tx.select().from(roomTypes).where(inArray(roomTypes.id, [...new Set(typeIds)]));
  if (types.length !== new Set(typeIds).size) throw new UserError("Unknown room category.");
  for (const t of types) {
    if (t.status !== "active" || (!opts.staff && t.publicStatus !== "published")) throw new UserError(`${t.name} is not available for booking.`);
  }
  const ordered = typeIds.map((id) => types.find((t) => t.id === id)!);
  try {
    const occupancy = distributeGuests(ordered, input.adults, input.children);
    const quote = await quoteStay({ checkIn: input.checkIn, checkOut: input.checkOut, rooms: occupancy }, s, tx);
    return { quote, occupancy };
  } catch (e) {
    if (e instanceof PricingError) throw new UserError(e.reasons.join(" "));
    throw e;
  }
}

async function upsertGuest(tx: Tx, g: { name: string; email: string; phone: string; marketingOptIn: boolean; userId?: string | null }) {
  const email = g.email.trim().toLowerCase();
  const [existing] = await tx.select().from(guests).where(sql`lower(${guests.email}) = ${email}`).for("update");
  if (existing) {
    const [u] = await tx
      .update(guests)
      .set({
        name: g.name,
        phone: g.phone,
        updatedAt: new Date(),
        ...(g.marketingOptIn && !existing.marketingOptIn ? { marketingOptIn: true, marketingOptInAt: new Date() } : {}),
        ...(g.userId && !existing.userId ? { userId: g.userId } : {}),
      })
      .where(eq(guests.id, existing.id))
      .returning();
    return u;
  }
  const [created] = await tx
    .insert(guests)
    .values({ name: g.name, email, phone: g.phone, marketingOptIn: g.marketingOptIn, marketingOptInAt: g.marketingOptIn ? new Date() : null, userId: g.userId ?? null })
    .returning();
  return created;
}

async function currentPolicies(tx: DbOrTx) {
  const rows = await tx
    .select()
    .from(policyVersions)
    .where(eq(policyVersions.status, "published"))
    .orderBy(desc(policyVersions.version));
  const pick = (k: string) => rows.find((r) => r.kind === k) ?? null;
  return { cancellation: pick("cancellation"), terms: pick("terms"), house_rules: pick("house_rules"), privacy: pick("privacy") };
}

function policySnapshot(s: Settings, p: Awaited<ReturnType<typeof currentPolicies>>) {
  const snap = (v: (typeof p)["terms"]) =>
    v ? { id: v.id, version: v.version, title: v.title, body: v.body, approved: v.approved, isSample: v.isSample, rules: v.rules } : null;
  return {
    capturedAt: new Date().toISOString(),
    paymentRule: s.paymentRule,
    advancePercent: s.advancePercent,
    checkInTime: s.checkInTime,
    checkOutTime: s.checkOutTime,
    cancellation: snap(p.cancellation),
    terms: snap(p.terms),
    houseRules: snap(p.house_rules),
  };
}

/** Issue a guest access token (link in confirmation email). Only a keyed hash is stored. */
async function issueManageToken(tx: DbOrTx, bookingId: string, checkOut: string) {
  const token = randomToken(24);
  const expires = new Date(Date.parse(addDays(checkOut, 60) + "T00:00:00Z"));
  await tx.update(bookings).set({ manageTokenHash: keyedHash(token), manageTokenExpiresAt: expires }).where(eq(bookings.id, bookingId));
  return token;
}

export function verifyManageToken(b: Pick<Booking, "manageTokenHash" | "manageTokenExpiresAt">, token: string | null | undefined) {
  if (!token || !b.manageTokenHash || !b.manageTokenExpiresAt) return false;
  if (b.manageTokenExpiresAt.getTime() < Date.now()) return false;
  return safeEqual(keyedHash(token), b.manageTokenHash);
}

export function manageUrl(reference: string, token: string) {
  return link(`/manage-booking/${encodeURIComponent(reference)}?t=${encodeURIComponent(token)}`);
}

async function writeNightsSnapshot(tx: Tx, quote: Quote, allocated: { bookingUnitId: string }[]) {
  const rows = quote.rooms.flatMap((r, i) =>
    r.nights.map((n) => ({ bookingUnitId: allocated[i].bookingUnitId, night: n.night, ratePaise: n.ratePaise, extraGuestPaise: n.extraGuestPaise, rateSource: n.source })),
  );
  if (rows.length) await tx.insert(bookingNights).values(rows);
}

export type WebsiteBookingInput = {
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  selections: Selection[];
  leadName: string;
  leadEmail: string;
  leadPhone: string;
  arrivalEta?: string | null;
  specialRequests?: string | null;
  acceptPolicies: boolean;
  marketingOptIn: boolean;
  userId?: string | null;
  /** Total the guest saw; used only to detect price changes, never as the charge amount. */
  displayedTotalPaise?: number | null;
};

/**
 * Website checkout step 6: authoritative re-quote, inventory allocation and a short-lived hold, all in
 * one transaction. Returns the booking and a one-time access token.
 */
export async function createWebsiteBooking(input: WebsiteBookingInput) {
  const status = await onlineBookingStatus();
  if (!status.open) throw new UserError("Online booking is not available right now. Please send an enquiry and our team will help.");
  if (!input.acceptPolicies) throw new UserError("Please accept the booking terms and cancellation policy to continue.");
  const s = await getSettings();

  return db.transaction(async (tx) => {
    const { quote, occupancy } = await quoteSelection(input, s, tx);
    if (input.displayedTotalPaise != null && input.displayedTotalPaise !== quote.totalPaise) {
      throw new UserError("The price for your stay has changed since you started. Please review the updated total and try again.", "price_changed");
    }
    const policies = await currentPolicies(tx);
    if (!policies.cancellation || !policies.terms) throw new UserError("Booking policies are not yet published. Please send an enquiry instead.");
    const guest = await upsertGuest(tx, { name: input.leadName, email: input.leadEmail, phone: input.leadPhone, marketingOptIn: input.marketingOptIn, userId: input.userId });
    const [b] = await tx
      .insert(bookings)
      .values({
        reference: bookingReference(),
        status: "pending_payment",
        source: "website",
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        nights: quote.nights,
        adults: input.adults,
        children: input.children,
        roomsCount: occupancy.length,
        guestId: guest.id,
        userId: input.userId ?? null,
        leadName: input.leadName,
        leadEmail: input.leadEmail.trim().toLowerCase(),
        leadPhone: input.leadPhone,
        arrivalEta: input.arrivalEta || null,
        specialRequests: input.specialRequests || null,
        subtotalPaise: quote.subtotalPaise,
        extrasPaise: quote.extrasPaise,
        discountPaise: quote.discountPaise,
        taxPaise: quote.taxPaise,
        totalPaise: quote.totalPaise,
        dueNowPaise: quote.dueNowPaise,
        priceSnapshot: quote,
        policySnapshot: policySnapshot(s, policies),
        policyAcceptedAt: new Date(),
        marketingOptIn: input.marketingOptIn,
        isDemo: isDemoMode(),
      })
      .returning();
    const allocated = await allocateRooms(tx, b.id, input.checkIn, input.checkOut, occupancy as AllocationRequest[], { directOnly: true });
    await writeNightsSnapshot(tx, quote, allocated);
    await tx.insert(inventoryHolds).values({ bookingId: b.id, expiresAt: sql`now() + make_interval(mins => ${s.holdMinutes})` as unknown as Date });
    const token = await issueManageToken(tx, b.id, b.checkOut);
    await audit(tx, { type: "guest", label: input.leadEmail.replace(/(.).+@/, "$1***@") }, "booking.hold_created", "booking", b.id, null, {
      reference: b.reference,
      totalPaise: b.totalPaise,
      units: allocated.map((a) => a.unitLabel),
    });
    return { booking: b, token };
  });
}

export type ManualBookingInput = {
  source: "phone" | "whatsapp" | "walk_in" | "email" | "external_ota" | "other";
  externalRef?: string | null;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  rooms: { roomTypeId: string; unitId?: string | null }[];
  leadName: string;
  leadEmail: string;
  leadPhone: string;
  specialRequests?: string | null;
  /** Optional negotiated total (paise). Difference from the rate engine is stored as an audited adjustment. */
  agreedTotalPaise?: number | null;
  adjustmentReason?: string | null;
  sendConfirmation: boolean;
};

/** Staff-entered reservations use exactly the same allocation and conflict rules as the website. */
export async function createManualBooking(actor: Extract<Actor, { type: "staff" }>, input: ManualBookingInput) {
  const s = await getSettings();
  return db.transaction(async (tx) => {
    const selections = Object.entries(
      input.rooms.reduce<Record<string, number>>((acc, r) => ((acc[r.roomTypeId] = (acc[r.roomTypeId] ?? 0) + 1), acc), {}),
    ).map(([roomTypeId, quantity]) => ({ roomTypeId, quantity }));
    let quote: Quote;
    let occupancy;
    try {
      ({ quote, occupancy } = await quoteSelection({ ...input, selections }, s, tx, { staff: true }));
    } catch (e) {
      if (!(e instanceof UserError) || input.agreedTotalPaise == null) throw e;
      throw new UserError(`${e.message} (Set rates or closures first; a negotiated total cannot bypass availability rules.)`);
    }
    // keep staff-preferred unit per room (matching room type order)
    const prefs = [...input.rooms];
    const allocReq: AllocationRequest[] = occupancy.map((o) => {
      const idx = prefs.findIndex((p) => p.roomTypeId === o.roomTypeId);
      const p = prefs.splice(idx, 1)[0];
      return { ...o, preferredUnitId: p?.unitId || null };
    });
    const policies = await currentPolicies(tx);
    const guest = await upsertGuest(tx, { name: input.leadName, email: input.leadEmail, phone: input.leadPhone, marketingOptIn: false });
    let total = quote.totalPaise;
    let adjustment = 0;
    if (input.agreedTotalPaise != null && input.agreedTotalPaise !== quote.totalPaise) {
      if (!input.adjustmentReason) throw new UserError("A reason is required when the agreed total differs from the calculated rate.");
      if (input.agreedTotalPaise < 0) throw new UserError("Agreed total cannot be negative.");
      adjustment = input.agreedTotalPaise - quote.totalPaise;
      total = input.agreedTotalPaise;
    }
    const [b] = await tx
      .insert(bookings)
      .values({
        reference: bookingReference(),
        status: "confirmed",
        source: input.source,
        externalRef: input.externalRef || null,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        nights: quote.nights,
        adults: input.adults,
        children: input.children,
        roomsCount: occupancy.length,
        guestId: guest.id,
        leadName: input.leadName,
        leadEmail: input.leadEmail.trim().toLowerCase(),
        leadPhone: input.leadPhone,
        specialRequests: input.specialRequests || null,
        subtotalPaise: quote.subtotalPaise,
        extrasPaise: quote.extrasPaise,
        discountPaise: quote.discountPaise,
        taxPaise: quote.taxPaise,
        totalPaise: total,
        dueNowPaise: 0,
        priceSnapshot: quote,
        policySnapshot: policySnapshot(s, policies),
        isDemo: isDemoMode(),
        createdByStaffId: actor.id,
        confirmedAt: new Date(),
      })
      .returning();
    const allocated = await allocateRooms(tx, b.id, input.checkIn, input.checkOut, allocReq, { directOnly: false });
    await writeNightsSnapshot(tx, quote, allocated);
    if (adjustment !== 0)
      await tx.insert(bookingAdjustments).values({ bookingId: b.id, amountPaise: adjustment, reason: input.adjustmentReason!, kind: "manual", staffId: actor.id });
    const token = await issueManageToken(tx, b.id, b.checkOut);
    await audit(tx, actor, "booking.manual_created", "booking", b.id, null, {
      reference: b.reference,
      source: b.source,
      totalPaise: total,
      adjustmentPaise: adjustment,
      units: allocated.map((a) => a.unitLabel),
    });
    await queueConfirmationMessages(tx, { ...b, totalPaise: total }, token, s, { guest: input.sendConfirmation });
    return { booking: b, token };
  });
}

export async function roomSummary(tx: DbOrTx, bookingId: string) {
  const rows = await tx
    .select({ name: roomTypes.name })
    .from(bookingUnits)
    .innerJoin(roomTypes, eq(roomTypes.id, bookingUnits.roomTypeId))
    .where(eq(bookingUnits.bookingId, bookingId));
  const counts = rows.reduce<Record<string, number>>((a, r) => ((a[r.name] = (a[r.name] ?? 0) + 1), a), {});
  return Object.entries(counts)
    .map(([n, c]) => `${c} × ${n}`)
    .join(", ");
}

export async function queueConfirmationMessages(tx: DbOrTx, b: Booking, token: string | null, s: Settings, opts: { guest: boolean } = { guest: true }) {
  const rooms = await roomSummary(tx, b.id);
  const url = token ? manageUrl(b.reference, token) : link(`/manage-booking`);
  if (opts.guest) {
    const m = bookingConfirmedEmail(b, rooms, s, url);
    await enqueue(tx, { template: "booking_confirmed", to: b.leadEmail, ...m, dedupeKey: `booking-confirmed:${b.id}`, bookingId: b.id });
  }
  const staff = staffNewBookingEmail(b, rooms);
  for (const to of s.notificationEmails)
    await enqueue(tx, { template: "staff_new_booking", to, ...staff, dedupeKey: `staff-new-booking:${b.id}:${to}`, bookingId: b.id });
}

/** Mark a pending booking confirmed (caller holds the booking row lock and has verified payment). */
export async function confirmPendingBooking(tx: Tx, b: Booking, actor: Actor) {
  const s = await getSettings(tx);
  await tx
    .update(inventoryHolds)
    .set({ status: "converted", resolvedAt: new Date() })
    .where(eq(inventoryHolds.bookingId, b.id));
  const [updated] = await tx
    .update(bookings)
    .set({ status: "confirmed", confirmedAt: new Date(), updatedAt: new Date() })
    .where(eq(bookings.id, b.id))
    .returning();
  // New token so the email link works even though the original raw token was only held by the browser.
  const token = await issueManageToken(tx, b.id, b.checkOut);
  await audit(tx, actor, "booking.confirmed", "booking", b.id, { status: b.status }, { status: "confirmed" });
  await queueConfirmationMessages(tx, updated, token, s);
  return updated;
}

/** Recompute cached payment totals/status from the ledger. Call inside the transaction that changed money. */
export async function refreshPaymentTotals(tx: DbOrTx, bookingId: string) {
  const [paid] = await tx
    .select({ v: sql<number>`coalesce(sum(${paymentTransactions.amountPaise}),0)::int` })
    .from(paymentTransactions)
    .where(and(eq(paymentTransactions.bookingId, bookingId), eq(paymentTransactions.status, "captured")));
  const [refunded] = await tx
    .select({ v: sql<number>`coalesce(sum(${refunds.amountPaise}),0)::int` })
    .from(refunds)
    .where(and(eq(refunds.bookingId, bookingId), eq(refunds.status, "succeeded")));
  const [b] = await tx.select().from(bookings).where(eq(bookings.id, bookingId));
  const net = paid.v - refunded.v;
  const status = net <= 0 ? "unpaid" : net < b.totalPaise ? "partially_paid" : net === b.totalPaise ? "paid" : "overpaid";
  await tx
    .update(bookings)
    .set({ amountPaidPaise: paid.v, amountRefundedPaise: refunded.v, paymentStatus: status, updatedAt: new Date() })
    .where(eq(bookings.id, bookingId));
  return { paid: paid.v, refunded: refunded.v, net, status };
}

async function lockBooking(tx: Tx, id: string) {
  const [b] = await tx.select().from(bookings).where(eq(bookings.id, id)).for("update");
  if (!b) throw new UserError("Booking not found.");
  return b;
}

export async function cancelBooking(actor: Actor, bookingId: string, reason: string, opts: { notifyGuest?: boolean } = {}) {
  if (!reason?.trim()) throw new UserError("A cancellation reason is required.");
  return db.transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    if (!["pending_payment", "confirmed"].includes(b.status)) throw new UserError(`A ${b.status.replace("_", " ")} booking cannot be cancelled.`);
    await releaseBookingNights(tx, b.id);
    await tx
      .update(inventoryHolds)
      .set({ status: "released", resolvedAt: new Date() })
      .where(and(eq(inventoryHolds.bookingId, b.id), eq(inventoryHolds.status, "active")));
    const [u] = await tx
      .update(bookings)
      .set({ status: "cancelled", cancelledAt: new Date(), cancelReason: reason, updatedAt: new Date() })
      .where(eq(bookings.id, b.id))
      .returning();
    await tx
      .update(bookingRequests)
      .set({ status: "approved", resolvedAt: new Date(), resolvedByStaffId: actor.type === "staff" ? actor.id : null })
      .where(and(eq(bookingRequests.bookingId, b.id), eq(bookingRequests.kind, "cancellation"), eq(bookingRequests.status, "requested")));
    await audit(tx, actor, "booking.cancelled", "booking", b.id, { status: b.status }, { status: "cancelled", reason });
    if (opts.notifyGuest !== false && b.status === "confirmed") {
      const net = b.amountPaidPaise - b.amountRefundedPaise;
      const note = net > 0 ? "Any refund due under the cancellation policy you accepted will be processed separately and you will receive refund updates by email." : "No payment was collected for this booking.";
      const m = bookingCancelledEmail(u, note);
      await enqueue(tx, { template: "booking_cancelled", to: b.leadEmail, ...m, dedupeKey: `booking-cancelled:${b.id}`, bookingId: b.id });
    }
    return u;
  });
}

export async function checkInBooking(actor: Actor, bookingId: string) {
  return db.transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    if (b.status !== "confirmed") throw new UserError("Only confirmed bookings can be checked in.");
    const s = await getSettings(tx);
    const today = todayInTz(s.timezone);
    if (today < b.checkIn) throw new UserError("Check-in is only possible from the arrival date.");
    const [u] = await tx.update(bookings).set({ status: "checked_in", checkedInAt: new Date(), updatedAt: new Date() }).where(eq(bookings.id, b.id)).returning();
    await audit(tx, actor, "booking.checked_in", "booking", b.id, { status: b.status }, { status: u.status });
    return u;
  });
}

export async function checkOutBooking(actor: Actor, bookingId: string) {
  return db.transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    if (b.status !== "checked_in") throw new UserError("Only checked-in bookings can be checked out.");
    const s = await getSettings(tx);
    const today = todayInTz(s.timezone);
    if (today < b.checkOut) await releaseBookingNights(tx, b.id, today); // early departure frees remaining nights
    const [u] = await tx.update(bookings).set({ status: "checked_out", checkedOutAt: new Date(), updatedAt: new Date() }).where(eq(bookings.id, b.id)).returning();
    await audit(tx, actor, "booking.checked_out", "booking", b.id, { status: b.status }, { status: u.status, early: today < b.checkOut });
    return u;
  });
}

export async function markNoShow(actor: Actor, bookingId: string) {
  return db.transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    if (b.status !== "confirmed") throw new UserError("Only confirmed bookings can be marked as no-show.");
    const s = await getSettings(tx);
    const today = todayInTz(s.timezone);
    if (today < b.checkIn) throw new UserError("A booking can only be marked no-show on or after the arrival date.");
    await releaseBookingNights(tx, b.id, today);
    const [u] = await tx.update(bookings).set({ status: "no_show", updatedAt: new Date() }).where(eq(bookings.id, b.id)).returning();
    await audit(tx, actor, "booking.no_show", "booking", b.id, { status: b.status }, { status: u.status });
    return u;
  });
}

/** Guest-originated request; never changes the booking itself. */
export async function createGuestRequest(bookingId: string, kind: "cancellation" | "date_change", data: { checkIn?: string; checkOut?: string; message?: string }) {
  return db.transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    if (!["confirmed", "pending_payment"].includes(b.status)) throw new UserError("This booking can no longer be changed online. Please contact us.");
    const [open] = await tx
      .select()
      .from(bookingRequests)
      .where(and(eq(bookingRequests.bookingId, b.id), eq(bookingRequests.kind, kind), eq(bookingRequests.status, "requested")));
    if (open) throw new UserError("You already have a pending request of this type. Our team will respond soon.");
    if (kind === "date_change") {
      if (!data.checkIn || !data.checkOut || !isIsoDate(data.checkIn) || !isIsoDate(data.checkOut) || data.checkOut <= data.checkIn)
        throw new UserError("Please provide valid new dates.");
    }
    const [r] = await tx
      .insert(bookingRequests)
      .values({ bookingId: b.id, kind, requestedCheckIn: data.checkIn ?? null, requestedCheckOut: data.checkOut ?? null, guestMessage: data.message?.slice(0, 2000) ?? null })
      .returning();
    await audit(tx, { type: "guest", label: "guest" }, `request.${kind}`, "booking", b.id, null, { requestId: r.id });
    const m = requestReceivedEmail(b, kind);
    await enqueue(tx, { template: "request_received", to: b.leadEmail, ...m, dedupeKey: `request-received:${r.id}`, bookingId: b.id });
    return r;
  });
}

export async function rejectRequest(actor: Extract<Actor, { type: "staff" }>, requestId: string, response: string) {
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(bookingRequests).where(eq(bookingRequests.id, requestId)).for("update");
    if (!r || r.status !== "requested") throw new UserError("Request is not pending.");
    await tx
      .update(bookingRequests)
      .set({ status: "rejected", staffResponse: response, resolvedAt: new Date(), resolvedByStaffId: actor.id })
      .where(eq(bookingRequests.id, requestId));
    await audit(tx, actor, "request.rejected", "booking", r.bookingId, null, { requestId, response });
  });
}

/** Preview a date change with a FRESH availability and price check. No changes are written. */
export async function previewDateChange(bookingId: string, checkIn: string, checkOut: string) {
  const s = await getSettings();
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b) throw new UserError("Booking not found.");
  const bus = await db.select().from(bookingUnits).where(eq(bookingUnits.bookingId, bookingId));
  validateStayDates(checkIn, checkOut, s, { staff: true });
  const quote = await quoteStay({ checkIn, checkOut, rooms: bus.map((u) => ({ roomTypeId: u.roomTypeId, adults: u.adults, children: u.children })) }, s).catch((e) => {
    if (e instanceof PricingError) throw new UserError(e.reasons.join(" "));
    throw e;
  });
  // availability check: simulate inside a rolled-back transaction
  let available = true;
  try {
    await db.transaction(async (tx) => {
      await releaseBookingNights(tx, b.id);
      await reallocateBooking(tx, b.id, checkIn, checkOut, false);
      throw new Error("__rollback__");
    });
  } catch (e) {
    if (e instanceof AllocationError) available = false;
    else if (!(e instanceof Error && e.message === "__rollback__")) throw e;
  }
  const [adj] = await db
    .select({ v: sql<number>`coalesce(sum(${bookingAdjustments.amountPaise}),0)::int` })
    .from(bookingAdjustments)
    .where(and(eq(bookingAdjustments.bookingId, bookingId), eq(bookingAdjustments.kind, "manual")));
  const newTotal = quote.totalPaise + adj.v;
  const net = b.amountPaidPaise - b.amountRefundedPaise;
  return {
    available,
    quote,
    currentTotalPaise: b.totalPaise,
    newTotalPaise: newTotal,
    deltaPaise: newTotal - b.totalPaise,
    additionalDuePaise: Math.max(0, newTotal - net),
    refundDuePaise: Math.max(0, net - newTotal),
  };
}

/** Apply an approved date change: release, re-allocate, re-price; delta recorded as an audited adjustment. */
export async function applyDateChange(actor: Extract<Actor, { type: "staff" }>, bookingId: string, checkIn: string, checkOut: string, requestId?: string | null) {
  const s = await getSettings();
  return db.transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    if (b.status !== "confirmed") throw new UserError("Only confirmed (not yet arrived) bookings can change dates.");
    validateStayDates(checkIn, checkOut, s, { staff: true });
    const bus = await tx.select().from(bookingUnits).where(eq(bookingUnits.bookingId, b.id));
    let quote: Quote;
    try {
      quote = await quoteStay({ checkIn, checkOut, rooms: bus.map((u) => ({ roomTypeId: u.roomTypeId, adults: u.adults, children: u.children })) }, s, tx);
    } catch (e) {
      if (e instanceof PricingError) throw new UserError(e.reasons.join(" "));
      throw e;
    }
    await releaseBookingNights(tx, b.id);
    await reallocateBooking(tx, b.id, checkIn, checkOut, false);
    await tx.delete(bookingNights).where(inArray(bookingNights.bookingUnitId, bus.map((u) => u.id)));
    await writeNightsSnapshot(tx, quote, bus.map((u) => ({ bookingUnitId: u.id })));
    const [adj] = await tx
      .select({ v: sql<number>`coalesce(sum(${bookingAdjustments.amountPaise}),0)::int` })
      .from(bookingAdjustments)
      .where(and(eq(bookingAdjustments.bookingId, b.id), eq(bookingAdjustments.kind, "manual")));
    const newTotal = quote.totalPaise + adj.v;
    const delta = newTotal - b.totalPaise;
    const prevSnapshot = b.priceSnapshot as Quote & { revisions?: unknown[] };
    const [u] = await tx
      .update(bookings)
      .set({
        checkIn,
        checkOut,
        nights: quote.nights,
        subtotalPaise: quote.subtotalPaise,
        extrasPaise: quote.extrasPaise,
        taxPaise: quote.taxPaise,
        totalPaise: newTotal,
        priceSnapshot: { ...quote, revisions: [...(prevSnapshot.revisions ?? []), { at: new Date().toISOString(), by: actor.label, previous: { ...prevSnapshot, revisions: undefined } }] },
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, b.id))
      .returning();
    if (delta !== 0)
      await tx.insert(bookingAdjustments).values({ bookingId: b.id, amountPaise: delta, reason: `Date change ${b.checkIn}→${b.checkOut} to ${checkIn}→${checkOut}`, kind: "date_change", staffId: actor.id });
    if (requestId)
      await tx
        .update(bookingRequests)
        .set({ status: "approved", resolvedAt: new Date(), resolvedByStaffId: actor.id })
        .where(and(eq(bookingRequests.id, requestId), eq(bookingRequests.bookingId, b.id)));
    await refreshPaymentTotals(tx, b.id);
    await audit(tx, actor, "booking.dates_changed", "booking", b.id, { checkIn: b.checkIn, checkOut: b.checkOut, totalPaise: b.totalPaise }, { checkIn, checkOut, totalPaise: newTotal, deltaPaise: delta });
    const token = await issueManageToken(tx, b.id, checkOut);
    const m = bookingChangedEmail(u, `Your stay dates have been changed to ${checkIn} → ${checkOut}. New total: ₹${(newTotal / 100).toFixed(2)}.`, manageUrl(u.reference, token));
    await enqueue(tx, { template: "booking_changed", to: b.leadEmail, ...m, dedupeKey: `booking-changed:${b.id}:${checkIn}:${checkOut}:${Date.now()}`, bookingId: b.id });
    return { booking: u, deltaPaise: delta };
  });
}

/** Audited manual price adjustment (charge or reduction). Never silently rewrites the snapshot. */
export async function addPriceAdjustment(actor: Extract<Actor, { type: "staff" }>, bookingId: string, amountPaise: number, reason: string) {
  if (!Number.isSafeInteger(amountPaise) || amountPaise === 0) throw new UserError("Enter a non-zero adjustment amount.");
  if (!reason.trim()) throw new UserError("A reason is required.");
  return db.transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    if (["cancelled", "expired"].includes(b.status)) throw new UserError("Cannot adjust a cancelled or expired booking.");
    const newTotal = b.totalPaise + amountPaise;
    if (newTotal < 0) throw new UserError("Adjustment would make the total negative.");
    await tx.insert(bookingAdjustments).values({ bookingId, amountPaise, reason, kind: "manual", staffId: actor.id });
    await tx.update(bookings).set({ totalPaise: newTotal, updatedAt: new Date() }).where(eq(bookings.id, bookingId));
    const totals = await refreshPaymentTotals(tx, bookingId);
    await audit(tx, actor, "booking.price_adjusted", "booking", bookingId, { totalPaise: b.totalPaise }, { totalPaise: newTotal, amountPaise, reason });
    return { newTotal, ...totals };
  });
}

/** Link bookings made with a verified email to the user account (ownership proven by email verification). */
export async function linkVerifiedBookings(userId: string) {
  const [u] = await db.select().from(user).where(eq(user.id, userId));
  if (!u?.emailVerified) return 0;
  const email = u.email.toLowerCase();
  const res = await db
    .update(bookings)
    .set({ userId })
    .where(and(sql`lower(${bookings.leadEmail}) = ${email}`, sql`${bookings.userId} IS NULL`))
    .returning({ id: bookings.id });
  await db.update(guests).set({ userId }).where(and(sql`lower(${guests.email}) = ${email}`, sql`${guests.userId} IS NULL`));
  return res.length;
}

export async function bookingDetail(bookingId: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b) return null;
  const units = await db
    .select({ id: bookingUnits.id, unitId: bookingUnits.unitId, unitLabel: roomUnits.label, roomTypeId: bookingUnits.roomTypeId, roomTypeName: roomTypes.name, adults: bookingUnits.adults, children: bookingUnits.children })
    .from(bookingUnits)
    .innerJoin(roomUnits, eq(roomUnits.id, bookingUnits.unitId))
    .innerJoin(roomTypes, eq(roomTypes.id, bookingUnits.roomTypeId))
    .where(eq(bookingUnits.bookingId, bookingId));
  const [hold] = await db.select().from(inventoryHolds).where(eq(inventoryHolds.bookingId, bookingId));
  return { booking: b, units, hold: hold ?? null };
}
