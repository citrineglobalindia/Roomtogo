"use server";
/**
 * Admin server actions. EVERY action authorises on the server with requireStaff(<permission>) before
 * touching data — hidden menu items are not a security boundary. Material changes are audited.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import sharp from "sharp";
import type { ActionState } from "@/components/ui/form";
import { db } from "@/db";
import * as s from "@/db/schema";
import {
  addPriceAdjustment,
  applyDateChange,
  cancelBooking,
  checkInBooking,
  checkOutBooking,
  createManualBooking,
  markNoShow,
  queueConfirmationMessages,
  rejectRequest,
} from "@/domain/booking";
import { CONTENT_DEFAULTS, type ContentKey } from "@/domain/content";
import { updateEnquiry } from "@/domain/enquiries";
import { createBlock, reassignUnit, releaseBlock } from "@/domain/inventory";
import { processOutbox, requeueMessages, enqueue } from "@/domain/notifications";
import { reconcilePayments, recordOfflinePayment, requestRefund, resolveException } from "@/domain/payments";
import { moderateReview } from "@/domain/reviews";
import { CONFIRMABLE_FACTS, getSettings, type ConfirmableFact } from "@/domain/settings";
import { authEmail } from "@/domain/templates";
import { getStorage } from "@/integrations/storage";
import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { publicBaseUrl } from "@/lib/config";
import { eachNight, isIsoDate, todayInTz } from "@/lib/dates";
import { safeMessage, UserError } from "@/lib/errors";
import { rupeesToPaise } from "@/lib/money";
import type { Permission } from "@/lib/permissions";
import { requireStaff, type StaffContext } from "@/lib/staff";

type Fn = (staff: StaffContext) => Promise<string | void | ActionState>;

async function act(perm: Permission, fn: Fn, paths: string[] = []): Promise<ActionState> {
  try {
    const staff = await requireStaff(perm);
    const r = await fn(staff);
    for (const p of paths) revalidatePath(p);
    if (typeof r === "string") return { ok: true, message: r };
    return r ?? { ok: true, message: "Saved." };
  } catch (e) {
    unstable_rethrow(e);
    return { error: safeMessage(e) };
  }
}

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const int = (fd: FormData, k: string, def: number | null = null) => {
  const v = str(fd, k);
  if (v === "") return def;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new UserError(`${k} must be a whole number.`);
  return n;
};
const money = (fd: FormData, k: string) => rupeesToPaise(str(fd, k));
const bool = (fd: FormData, k: string) => fd.get(k) === "on";
const date = (fd: FormData, k: string, required = true) => {
  const v = str(fd, k);
  if (!v && !required) return null;
  if (!isIsoDate(v)) throw new UserError(`Enter a valid date for ${k}.`);
  return v;
};

/* ------------------------------ Reservations ------------------------------ */

export async function manualBookingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const r = await act("bookings.manage", async (st) => {
    const rooms = fd
      .getAll("roomTypeId")
      .map(String)
      .map((roomTypeId, i) => ({ roomTypeId, unitId: String(fd.getAll("unitId")[i] ?? "") || null }))
      .filter((x) => x.roomTypeId);
    const agreed = money(fd, "agreedTotal");
    const { booking } = await createManualBooking(st.actor, {
      source: str(fd, "source") as "phone",
      externalRef: str(fd, "externalRef") || null,
      checkIn: date(fd, "checkIn")!,
      checkOut: date(fd, "checkOut")!,
      adults: int(fd, "adults", 1)!,
      children: int(fd, "children", 0)!,
      rooms,
      leadName: str(fd, "leadName"),
      leadEmail: str(fd, "leadEmail"),
      leadPhone: str(fd, "leadPhone"),
      specialRequests: str(fd, "specialRequests") || null,
      agreedTotalPaise: agreed,
      adjustmentReason: str(fd, "adjustmentReason") || null,
      sendConfirmation: bool(fd, "sendConfirmation"),
    });
    id = booking.id;
  });
  if (r?.error) return r;
  redirect(`/admin/reservations/${id}`);
}

export async function bookingOpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const op = str(fd, "op");
  const id = str(fd, "bookingId");
  const perm: Permission = op === "cancel" ? "bookings.cancel" : op === "adjust" ? "bookings.modify_price" : "bookings.manage";
  return act(
    perm,
    async (st) => {
      switch (op) {
        case "check_in":
          await checkInBooking(st.actor, id);
          return "Checked in.";
        case "check_out":
          await checkOutBooking(st.actor, id);
          return "Checked out.";
        case "no_show":
          await markNoShow(st.actor, id);
          return "Marked as no-show; remaining nights released.";
        case "cancel":
          await cancelBooking(st.actor, id, str(fd, "reason"), { notifyGuest: bool(fd, "notify") });
          return "Booking cancelled and inventory released. Process any refund from the payments panel.";
        case "adjust": {
          const amt = money(fd, "amount");
          if (amt == null) throw new UserError("Enter an amount.");
          await addPriceAdjustment(st.actor, id, str(fd, "direction") === "reduce" ? -amt : amt, str(fd, "reason"));
          return "Adjustment recorded.";
        }
        case "reassign":
          await db.transaction((tx) => reassignUnit(tx, str(fd, "bookingUnitId"), str(fd, "unitId"), str(fd, "fromNight") || null));
          await audit(db, st.actor, "booking.unit_reassigned", "booking", id, null, { bookingUnitId: str(fd, "bookingUnitId"), unitId: str(fd, "unitId") });
          return "Unit reassigned.";
        case "date_change": {
          const res = await applyDateChange(st.actor, id, date(fd, "checkIn")!, date(fd, "checkOut")!, str(fd, "requestId") || null);
          return `Dates changed. Price difference: ₹${(res.deltaPaise / 100).toFixed(2)} (recorded as an adjustment).`;
        }
        case "reject_request":
          await rejectRequest(st.actor, str(fd, "requestId"), str(fd, "response") || "Not possible");
          return "Request declined.";
        case "note":
          if (!str(fd, "body")) throw new UserError("Note is empty.");
          await db.insert(s.bookingNotes).values({ bookingId: id, staffId: st.staffId, body: str(fd, "body").slice(0, 4000) });
          return "Note added.";
        case "resend": {
          const [b] = await db.select().from(s.bookings).where(eq(s.bookings.id, id));
          if (!b || !["confirmed", "checked_in"].includes(b.status)) throw new UserError("Only confirmed bookings can be re-sent.");
          const settings = await getSettings();
          // new dedupe key for an explicit resend
          await db.transaction(async (tx) => {
            const { bookingConfirmedEmail } = await import("@/domain/templates");
            const { roomSummary, manageUrl } = await import("@/domain/booking");
            const token = randomBytes(24).toString("base64url");
            const { keyedHash } = await import("@/lib/tokens");
            await tx.update(s.bookings).set({ manageTokenHash: keyedHash(token) }).where(eq(s.bookings.id, id));
            const m = bookingConfirmedEmail(b, await roomSummary(tx, id), settings, manageUrl(b.reference, token));
            await enqueue(tx, { template: "booking_confirmed", to: b.leadEmail, ...m, dedupeKey: `booking-confirmed-resend:${id}:${Date.now()}`, bookingId: id });
            await audit(tx, st.actor, "booking.confirmation_resent", "booking", id);
          });
          void queueConfirmationMessages;
          processOutbox(5).catch(() => undefined);
          return "Confirmation queued.";
        }
        default:
          throw new UserError("Unknown operation.");
      }
    },
    [`/admin/reservations/${id}`, "/admin/reservations", "/admin/calendar", "/admin"],
  );
}

/* -------------------------------- Payments -------------------------------- */

export async function paymentOpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const op = str(fd, "op");
  const bookingId = str(fd, "bookingId");
  const perm: Permission =
    op === "offline" ? "payments.record_offline" : op === "refund" ? "refunds.manage" : op === "reconcile" ? "payments.reconcile" : op === "resolve" ? "exceptions.resolve" : "payments.view";
  return act(
    perm,
    async (st) => {
      if (op === "offline") {
        const amount = money(fd, "amount");
        if (!amount) throw new UserError("Enter the amount received.");
        await recordOfflinePayment(st.actor, { bookingId, amountPaise: amount, method: str(fd, "method"), reference: str(fd, "reference") || null });
        return "Payment recorded (offline, staff-entered).";
      }
      if (op === "refund") {
        const amount = money(fd, "amount");
        if (!amount) throw new UserError("Enter the refund amount.");
        const r = await requestRefund(st.actor, { paymentTransactionId: str(fd, "paymentTransactionId"), amountPaise: amount, reason: str(fd, "reason") });
        return r.status === "succeeded" ? "Refund recorded." : "Refund sent to the payment provider. Status will update when the provider confirms.";
      }
      if (op === "reconcile") {
        const r = await reconcilePayments(bookingId ? { bookingId, sinceHours: 24 * 30 } : {});
        return `Reconciliation checked ${r.checked} order(s), recorded ${r.recorded} payment(s)${r.errors ? `, ${r.errors} error(s)` : ""}.`;
      }
      if (op === "resolve") {
        await resolveException(st.actor, str(fd, "exceptionId"), str(fd, "resolution"));
        return "Exception resolved.";
      }
      throw new UserError("Unknown operation.");
    },
    ["/admin/payments", `/admin/reservations/${bookingId}`, "/admin"],
  );
}

export async function requeueAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act("settings.manage", async () => {
    const id = str(fd, "id");
    await requeueMessages(id ? [id] : undefined);
    const r = await processOutbox(20);
    return `Re-queued. Sent ${r.sent}, failed ${r.failed}, blocked ${r.blocked}, demo-captured ${r.captured_demo}.`;
  }, ["/admin/messages"]);
}

/* ------------------------------- Inventory -------------------------------- */

export async function saveRoomTypeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act("inventory.manage", async (st) => {
    const id = str(fd, "id");
    const slug = str(fd, "slug").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
    if (!slug || !str(fd, "name")) throw new UserError("Name and URL slug are required.");
    const values = {
      slug,
      name: str(fd, "name"),
      summary: str(fd, "summary"),
      description: str(fd, "description"),
      bedConfiguration: str(fd, "bedConfiguration") || null,
      sizeSqft: int(fd, "sizeSqft"),
      baseOccupancy: int(fd, "baseOccupancy", 2)!,
      maxAdults: int(fd, "maxAdults", 2)!,
      maxChildren: int(fd, "maxChildren", 0)!,
      maxOccupancy: int(fd, "maxOccupancy", 2)!,
      extraBedsAllowed: int(fd, "extraBedsAllowed", 0)!,
      inclusions: str(fd, "inclusions").split("\n").map((x) => x.trim()).filter(Boolean),
      factsConfirmed: bool(fd, "factsConfirmed"),
      status: (str(fd, "status") || "active") as "active",
      publicStatus: (str(fd, "publicStatus") || "draft") as "draft",
      sortOrder: int(fd, "sortOrder", 0)!,
      coverMediaId: str(fd, "coverMediaId") || null,
      updatedAt: new Date(),
    };
    if (id) {
      const [before] = await db.select().from(s.roomTypes).where(eq(s.roomTypes.id, id));
      // Guard: changes that would invalidate future reservations
      const settings = await getSettings();
      const future = await db.execute<{ n: number }>(sql`
        SELECT count(*)::int n FROM booking_units bu JOIN bookings b ON b.id = bu.booking_id
        WHERE bu.room_type_id = ${id} AND b.check_out > ${todayInTz(settings.timezone)} AND b.status IN ('pending_payment','confirmed','checked_in')
          AND (bu.adults > ${values.maxAdults} OR bu.children > ${values.maxChildren} OR bu.adults + bu.children > ${values.maxOccupancy})`);
      if (future.rows[0].n > 0) throw new UserError(`${future.rows[0].n} upcoming reservation(s) exceed the new occupancy limits. Adjust them first.`);
      await db.update(s.roomTypes).set(values).where(eq(s.roomTypes.id, id));
      await audit(db, st.actor, "room_type.updated", "room_type", id, before, values);
      const am = fd.getAll("amenityIds").map(String);
      await db.delete(s.roomTypeAmenities).where(eq(s.roomTypeAmenities.roomTypeId, id));
      if (am.length) await db.insert(s.roomTypeAmenities).values(am.map((amenityId) => ({ roomTypeId: id, amenityId })));
      return "Room category saved.";
    }
    const [t] = await db.insert(s.roomTypes).values(values).returning();
    await audit(db, st.actor, "room_type.created", "room_type", t.id, null, values);
    return "Room category created. Add physical units and rates next.";
  }, ["/admin/rooms", "/rooms", "/"]);
}

export async function saveUnitAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act("inventory.manage", async (st) => {
    const id = str(fd, "id");
    const label = str(fd, "label");
    if (!label) throw new UserError("Unit identifier is required.");
    const values = {
      roomTypeId: str(fd, "roomTypeId"),
      label,
      floor: str(fd, "floor") || null,
      status: (str(fd, "status") || "active") as "active" | "inactive",
      directSale: bool(fd, "directSale"),
      isSample: bool(fd, "isSample"),
      notes: str(fd, "notes") || null,
      sortOrder: int(fd, "sortOrder", 0)!,
      updatedAt: new Date(),
    };
    if (id) {
      const [before] = await db.select().from(s.roomUnits).where(eq(s.roomUnits.id, id));
      const settings = await getSettings();
      const future = await db.execute<{ n: number }>(sql`SELECT count(*)::int n FROM unit_nights WHERE unit_id = ${id} AND kind = 'booking' AND night >= ${todayInTz(settings.timezone)}`);
      if ((values.status === "inactive" || values.roomTypeId !== before.roomTypeId) && future.rows[0].n > 0)
        throw new UserError(`This unit has ${future.rows[0].n} upcoming booked night(s). Reassign those reservations before deactivating or changing its category.`);
      await db.update(s.roomUnits).set(values).where(eq(s.roomUnits.id, id));
      await audit(db, st.actor, "unit.updated", "room_unit", id, before, values);
      return "Unit saved.";
    }
    const [u] = await db.insert(s.roomUnits).values(values).returning();
    await audit(db, st.actor, "unit.created", "room_unit", u.id, null, values);
    return "Unit added.";
  }, ["/admin/rooms", "/admin/calendar"]);
}

export async function blockAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act("availability.manage", async (st) => {
    if (str(fd, "op") === "release") {
      const b = await releaseBlock(db, str(fd, "blockId"), st.staffId);
      await audit(db, st.actor, "block.released", "availability_block", b.id, null, b);
      return "Block released; dates reopened.";
    }
    const unitIds = fd.getAll("unitId").map(String).filter(Boolean);
    if (!unitIds.length) throw new UserError("Choose at least one unit.");
    const created = await db.transaction(async (tx) => {
      const out = [];
      for (const unitId of unitIds)
        out.push(await createBlock(tx, { unitId, startDate: date(fd, "startDate")!, endDate: date(fd, "endDate")!, kind: str(fd, "kind") as "maintenance", reason: str(fd, "reason") || "Blocked", staffId: st.staffId }));
      return out;
    });
    for (const b of created) await audit(db, st.actor, "block.created", "availability_block", b.id, null, b);
    return `${created.length} block(s) created.`;
  }, ["/admin/availability", "/admin/calendar"]);
}

/* --------------------------------- Rates ---------------------------------- */

export async function saveRatesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act("rates.manage", async (st) => {
    const id = str(fd, "roomTypeId");
    const [before] = await db.select().from(s.roomTypes).where(eq(s.roomTypes.id, id));
    const values = {
      baseRatePaise: money(fd, "baseRate"),
      weekendRatePaise: money(fd, "weekendRate"),
      weekendDays: fd.getAll("weekendDays").map(Number).filter((n) => n >= 0 && n <= 6),
      extraAdultPaise: money(fd, "extraAdult") ?? 0,
      extraChildPaise: money(fd, "extraChild") ?? 0,
      minStayNights: int(fd, "minStay", 1)!,
      ratesAreSample: !bool(fd, "ratesApproved"),
      updatedAt: new Date(),
    };
    await db.update(s.roomTypes).set(values).where(eq(s.roomTypes.id, id));
    await audit(db, st.actor, "rates.updated", "room_type", id, { base: before.baseRatePaise, weekend: before.weekendRatePaise, extraAdult: before.extraAdultPaise, minStay: before.minStayNights, sample: before.ratesAreSample }, values);
    return "Rates saved. Existing bookings keep their original price snapshot.";
  }, ["/admin/rates", "/rooms", "/"]);
}

export async function rateRuleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act("rates.manage", async (st) => {
    if (str(fd, "op") === "deactivate") {
      await db.update(s.rateRules).set({ active: false }).where(eq(s.rateRules.id, str(fd, "id")));
      await audit(db, st.actor, "rate_rule.deactivated", "rate_rule", str(fd, "id"));
      return "Rule deactivated.";
    }
    const v = {
      roomTypeId: str(fd, "roomTypeId"),
      name: str(fd, "name") || "Seasonal rate",
      startDate: date(fd, "startDate")!,
      endDate: date(fd, "endDate")!,
      daysOfWeek: fd.getAll("days").length ? fd.getAll("days").map(Number) : null,
      ratePaise: money(fd, "rate") ?? (() => { throw new UserError("Enter a rate."); })(),
      minStayNights: int(fd, "minStay"),
      priority: int(fd, "priority", 0)!,
    };
    if (v.endDate < v.startDate) throw new UserError("End date must be on or after the start date.");
    const [r] = await db.insert(s.rateRules).values(v).returning();
    await audit(db, st.actor, "rate_rule.created", "rate_rule", r.id, null, v);
    return "Rule added.";
  }, ["/admin/rates"]);
}

export async function dateOverrideAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act("rates.manage", async (st) => {
    const roomTypeIds = fd.getAll("roomTypeId").map(String).filter(Boolean);
    const from = date(fd, "from")!;
    const to = date(fd, "to")!;
    if (to < from) throw new UserError("'To' must be on or after 'From'.");
    const nights = eachNight(from, (await import("@/lib/dates")).addDays(to, 1));
    if (nights.length > 366) throw new UserError("Choose at most one year.");
    if (str(fd, "op") === "clear") {
      await db.delete(s.dateRates).where(and(inArray(s.dateRates.roomTypeId, roomTypeIds), inArray(s.dateRates.night, nights)));
      await audit(db, st.actor, "date_rates.cleared", "room_type", roomTypeIds.join(","), null, { from, to });
      return "Overrides cleared.";
    }
    const v = { ratePaise: money(fd, "rate"), minStayNights: int(fd, "minStay"), closed: bool(fd, "closed"), closedToArrival: bool(fd, "cta"), updatedAt: new Date() };
    for (const roomTypeId of roomTypeIds)
      await db
        .insert(s.dateRates)
        .values(nights.map((night) => ({ roomTypeId, night, ...v })))
        .onConflictDoUpdate({ target: [s.dateRates.roomTypeId, s.dateRates.night], set: v });
    await audit(db, st.actor, "date_rates.set", "room_type", roomTypeIds.join(","), null, { from, to, ...v });
    return `Applied to ${nights.length} night(s).`;
  }, ["/admin/rates", "/admin/availability"]);
}

/* -------------------------------- Settings -------------------------------- */

export async function saveSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act("settings.manage", async (st) => {
    const before = await getSettings();
    const taxLines = str(fd, "taxRules")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        // Format: Label | percent | min nightly ₹ (optional) | max nightly ₹ (optional)
        const [label, pct, min, max] = l.split("|").map((x) => x.trim());
        const p = Number(pct);
        if (!label || !Number.isFinite(p) || p < 0 || p > 100) throw new UserError(`Invalid tax line: "${l}"`);
        return { label, rateBps: Math.round(p * 100), minNightlyPaise: min ? rupeesToPaise(min) : null, maxNightlyPaise: max ? rupeesToPaise(max) : null };
      });
    const emails = str(fd, "notificationEmails").split(/[\s,;]+/).filter(Boolean);
    if (emails.some((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e))) throw new UserError("Check the notification email addresses.");
    const v = {
      name: str(fd, "name") || "Room2Go",
      legalName: str(fd, "legalName") || null,
      addressLine: str(fd, "addressLine"),
      city: str(fd, "city"),
      region: str(fd, "region"),
      postalCode: str(fd, "postalCode"),
      phone: str(fd, "phone"),
      email: str(fd, "email"),
      whatsappNumber: str(fd, "whatsappNumber") || null,
      mapLat: str(fd, "mapLat") || null,
      mapLng: str(fd, "mapLng") || null,
      mapUrl: str(fd, "mapUrl") || null,
      checkInTime: str(fd, "checkInTime") || null,
      checkOutTime: str(fd, "checkOutTime") || null,
      holdMinutes: int(fd, "holdMinutes", 10)!,
      bookingMode: (str(fd, "bookingMode") || "enquiry_only") as "instant",
      paymentRule: (str(fd, "paymentRule") || "full") as "full",
      advancePercent: int(fd, "advancePercent", 100)!,
      maxRoomsPerBooking: int(fd, "maxRoomsPerBooking", 4)!,
      bookingWindowDays: int(fd, "bookingWindowDays", 365)!,
      taxEnabled: bool(fd, "taxEnabled"),
      taxRules: taxLines,
      taxInvoicesEnabled: bool(fd, "taxInvoicesEnabled"),
      taxRegistrationNumber: str(fd, "taxRegistrationNumber") || null,
      invoicePrefix: str(fd, "invoicePrefix") || "R2G",
      notificationEmails: emails,
      socialLinks: Object.fromEntries(["instagram", "facebook", "linkedin"].map((k) => [k, str(fd, `social_${k}`)]).filter(([, u]) => u)),
      reviewInvitesEnabled: bool(fd, "reviewInvitesEnabled"),
      preArrivalReminderDays: int(fd, "preArrivalReminderDays"),
      guestDataRetentionDays: int(fd, "guestDataRetentionDays"),
      updatedAt: new Date(),
    };
    if (v.holdMinutes < 2 || v.holdMinutes > 120) throw new UserError("Hold time must be 2–120 minutes.");
    if (v.taxEnabled && !taxLines.length) throw new UserError("Add at least one tax line or disable taxes.");
    // Changing a confirmed fact un-confirms it so the owner re-approves it.
    const confirmed = { ...before.confirmedFields };
    const changed = (f: ConfirmableFact, keys: (keyof typeof v)[]) => keys.some((k) => JSON.stringify(v[k]) !== JSON.stringify(before[k as keyof typeof before])) && delete confirmed[f];
    changed("contact", ["addressLine", "city", "postalCode", "phone", "email"]);
    changed("map", ["mapLat", "mapLng", "mapUrl"]);
    changed("whatsapp", ["whatsappNumber"]);
    changed("times", ["checkInTime", "checkOutTime"]);
    changed("payment_rule", ["paymentRule", "advancePercent"]);
    changed("tax", ["taxEnabled", "taxRules", "taxRegistrationNumber", "legalName"]);
    changed("notifications", ["notificationEmails"]);
    await db.update(s.propertySettings).set({ ...v, confirmedFields: confirmed }).where(eq(s.propertySettings.id, 1));
    await audit(db, st.actor, "settings.updated", "property_settings", "1", before, v);
    return "Settings saved. Changed business facts must be re-confirmed below.";
  }, ["/admin/settings", "/", "/contact"]);
}

export async function confirmFactAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act("settings.manage", async (st) => {
    const fact = str(fd, "fact") as ConfirmableFact;
    if (!(fact in CONFIRMABLE_FACTS)) throw new UserError("Unknown fact.");
    const before = await getSettings();
    const confirmed = { ...before.confirmedFields };
    if (str(fd, "op") === "unconfirm") delete confirmed[fact];
    else confirmed[fact] = { by: st.actor.label, at: new Date().toISOString() };
    await db.update(s.propertySettings).set({ confirmedFields: confirmed }).where(eq(s.propertySettings.id, 1));
    await audit(db, st.actor, `settings.fact_${str(fd, "op") === "unconfirm" ? "unconfirmed" : "confirmed"}`, "property_settings", "1", null, { fact });
    return "Updated.";
  }, ["/admin/settings", "/admin"]);
}

/* ---------------------------------- Staff --------------------------------- */

export async function staffAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act("staff.manage", async (st) => {
    const op = str(fd, "op");
    if (op === "invite") {
      const email = str(fd, "email").toLowerCase();
      const role = str(fd, "role") as "owner" | "reception" | "content";
      if (!["owner", "reception", "content"].includes(role)) throw new UserError("Choose a role.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new UserError("Enter a valid email.");
      const [existing] = await db.select().from(s.user).where(eq(s.user.email, email));
      let userId = existing?.id;
      if (!existing) {
        const ctx = await auth.$context;
        userId = randomUUID();
        await db.insert(s.user).values({ id: userId, name: str(fd, "name") || email, email, emailVerified: true });
        // Random unknown password: the invitee sets their own via the reset link (proves inbox control).
        await db.insert(s.account).values({ id: randomUUID(), accountId: userId, providerId: "credential", userId, password: await ctx.password.hash(randomBytes(24).toString("base64url")) });
      }
      const [m] = await db.select().from(s.staffMembers).where(eq(s.staffMembers.userId, userId!));
      if (m) throw new UserError("That person is already a staff member.");
      await db.insert(s.staffMembers).values({ userId: userId!, role, createdByStaffId: st.staffId });
      await auth.api.requestPasswordReset({ body: { email, redirectTo: `${publicBaseUrl()}/admin/reset` } });
      await audit(db, st.actor, "staff.invited", "staff", userId!, null, { email, role });
      void authEmail;
      return "Invitation sent: the staff member will receive a link to set their password.";
    }
    const id = str(fd, "staffId");
    const [target] = await db.select().from(s.staffMembers).where(eq(s.staffMembers.id, id));
    if (!target) throw new UserError("Staff member not found.");
    const owners = await db.select().from(s.staffMembers).where(and(eq(s.staffMembers.role, "owner"), eq(s.staffMembers.active, true)));
    const lastOwner = target.role === "owner" && owners.length <= 1;
    if (op === "role") {
      const role = str(fd, "role") as "owner";
      if (lastOwner && role !== "owner") throw new UserError("At least one active owner is required.");
      await db.update(s.staffMembers).set({ role, updatedAt: new Date() }).where(eq(s.staffMembers.id, id));
      await db.delete(s.session).where(eq(s.session.userId, target.userId));
      await audit(db, st.actor, "staff.role_changed", "staff", id, { role: target.role }, { role });
      return "Role updated; their sessions were signed out.";
    }
    if (op === "toggle") {
      if (target.id === st.staffId) throw new UserError("You cannot deactivate yourself.");
      if (lastOwner && target.active) throw new UserError("At least one active owner is required.");
      await db.update(s.staffMembers).set({ active: !target.active, updatedAt: new Date() }).where(eq(s.staffMembers.id, id));
      if (target.active) await db.delete(s.session).where(eq(s.session.userId, target.userId));
      await audit(db, st.actor, target.active ? "staff.deactivated" : "staff.reactivated", "staff", id);
      return target.active ? "Deactivated and signed out." : "Reactivated.";
    }
    throw new UserError("Unknown operation.");
  }, ["/admin/staff"]);
}

/* --------------------------------- Content -------------------------------- */

export async function contentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act("content.manage", async (st) => {
    const key = str(fd, "key") as ContentKey;
    if (!(key in CONTENT_DEFAULTS)) throw new UserError("Unknown content block.");
    const fields = Object.keys(CONTENT_DEFAULTS[key]);
    const draft = Object.fromEntries(fields.map((f) => [f, str(fd, f).slice(0, 5000)]));
    const [row] = await db.select().from(s.contentBlocks).where(eq(s.contentBlocks.key, key));
    const publish = str(fd, "op") === "publish";
    await db
      .insert(s.contentBlocks)
      .values({ key, draft, published: publish ? draft : null, publishedAt: publish ? new Date() : null, updatedByStaffId: st.staffId })
      .onConflictDoUpdate({ target: s.contentBlocks.key, set: { draft, ...(publish ? { published: draft, publishedAt: new Date() } : {}), updatedByStaffId: st.staffId, updatedAt: new Date() } });
    await audit(db, st.actor, publish ? "content.published" : "content.draft_saved", "content", key, row?.published ?? null, draft);
    return publish ? "Published." : "Draft saved. Use Preview to check it before publishing.";
  }, ["/", "/about", "/gallery", "/reviews", "/contact", "/extended-stays", "/amenities", "/rooms", "/admin/content"]);
}

export async function policyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act("content.manage", async (st) => {
    const op = str(fd, "op");
    if (op === "publish") {
      const id = str(fd, "id");
      const [p] = await db.select().from(s.policyVersions).where(eq(s.policyVersions.id, id));
      if (!p) throw new UserError("Version not found.");
      const approved = bool(fd, "approved");
      if (approved && st.role !== "owner") throw new UserError("Only the owner can mark a policy as approved.");
      await db.transaction(async (tx) => {
        await tx.update(s.policyVersions).set({ status: "archived" }).where(and(eq(s.policyVersions.kind, p.kind), eq(s.policyVersions.status, "published")));
        await tx.update(s.policyVersions).set({ status: "published", publishedAt: new Date(), approved }).where(eq(s.policyVersions.id, id));
      });
      await audit(db, st.actor, "policy.published", "policy", id, null, { kind: p.kind, version: p.version, approved });
      return "Published. Existing bookings keep the version they accepted.";
    }
    const kind = str(fd, "kind") as "terms" | "cancellation" | "privacy" | "house_rules";
    if (!["terms", "cancellation", "privacy", "house_rules"].includes(kind)) throw new UserError("Unknown policy.");
    const [{ v }] = await db.select({ v: sql<number>`coalesce(max(${s.policyVersions.version}),0)::int` }).from(s.policyVersions).where(eq(s.policyVersions.kind, kind));
    const rules =
      kind === "cancellation" && (str(fd, "freeHours") || str(fd, "lateRefundPct"))
        ? { freeCancellationHours: int(fd, "freeHours"), lateRefundBps: str(fd, "lateRefundPct") ? Math.round(Number(str(fd, "lateRefundPct")) * 100) : null, noShowRefundBps: str(fd, "noShowRefundPct") ? Math.round(Number(str(fd, "noShowRefundPct")) * 100) : null }
        : null;
    const [p] = await db.insert(s.policyVersions).values({ kind, version: v + 1, title: str(fd, "title"), body: str(fd, "body"), status: "draft", rules, createdByStaffId: st.staffId }).returning();
    await audit(db, st.actor, "policy.version_created", "policy", p.id, null, { kind, version: p.version });
    return `Draft version ${p.version} created.`;
  }, ["/admin/content/policies", "/privacy", "/terms", "/cancellation-policy", "/house-rules"]);
}

export async function faqAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act("content.manage", async (st) => {
    const id = str(fd, "id");
    if (str(fd, "op") === "delete") {
      await db.delete(s.faqs).where(eq(s.faqs.id, id));
      await audit(db, st.actor, "faq.deleted", "faq", id);
      return "Deleted.";
    }
    const v = { question: str(fd, "question"), answer: str(fd, "answer"), sortOrder: int(fd, "sortOrder", 0)!, status: (str(fd, "status") || "draft") as "draft", updatedAt: new Date() };
    if (!v.question || !v.answer) throw new UserError("Question and answer are required.");
    if (id) await db.update(s.faqs).set(v).where(eq(s.faqs.id, id));
    else await db.insert(s.faqs).values(v);
    await audit(db, st.actor, id ? "faq.updated" : "faq.created", "faq", id || null, null, v);
    return "FAQ saved.";
  }, ["/admin/content/faqs", "/"]);
}

export async function amenityAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act("content.manage", async (st) => {
    const id = str(fd, "id");
    const v = {
      name: str(fd, "name"),
      description: str(fd, "description") || null,
      icon: str(fd, "icon") || "check",
      scope: str(fd, "scope") as "shared",
      charge: str(fd, "charge") as "unknown",
      verified: bool(fd, "verified"),
      showInStrip: bool(fd, "showInStrip"),
      status: (str(fd, "status") || "draft") as "draft",
      sortOrder: int(fd, "sortOrder", 0)!,
      updatedAt: new Date(),
    };
    if (!v.name) throw new UserError("Name is required.");
    if (v.verified && st.role !== "owner") throw new UserError("Only the owner can mark a facility as verified.");
    if (id) {
      const [before] = await db.select().from(s.amenities).where(eq(s.amenities.id, id));
      if (before.verified && !v.verified && st.role !== "owner") v.verified = true;
      await db.update(s.amenities).set(v).where(eq(s.amenities.id, id));
    } else await db.insert(s.amenities).values(v);
    await audit(db, st.actor, id ? "amenity.updated" : "amenity.created", "amenity", id || null, null, v);
    return "Amenity saved.";
  }, ["/admin/content/amenities", "/amenities", "/"]);
}

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function mediaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act("media.manage", async (st) => {
    const op = str(fd, "op");
    if (op === "upload") {
      const file = fd.get("file");
      if (!(file instanceof File) || file.size === 0) throw new UserError("Choose an image.");
      if (!ALLOWED_MIME.has(file.type)) throw new UserError("Only JPEG, PNG or WebP images are allowed.");
      if (file.size > 10 * 1024 * 1024) throw new UserError("Image must be under 10 MB.");
      const alt = str(fd, "alt");
      if (alt.length < 4) throw new UserError("Describe the photo (alt text) for accessibility.");
      const store = getStorage();
      if (!store) throw new UserError("Media storage is not configured.");
      let out: Buffer;
      let meta: { width: number; height: number };
      try {
        // Decode + re-encode: verifies it's a real image, strips EXIF/GPS metadata, caps dimensions.
        ({ data: out, info: meta } = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 50_000_000 })
          .rotate()
          .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer({ resolveWithObject: true }));
      } catch {
        throw new UserError("That file could not be read as an image.");
      }
      const key = `uploads/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.webp`;
      await store.put(key, out, "image/webp");
      const [m] = await db
        .insert(s.mediaAssets)
        .values({ storageKey: key, url: store.publicUrl(key), alt, caption: str(fd, "caption") || null, width: meta.width, height: meta.height, mimeType: "image/webp", bytes: out.length, categoryId: str(fd, "categoryId") || null, roomTypeId: str(fd, "roomTypeId") || null, status: "draft", uploadedByStaffId: st.staffId })
        .returning();
      await audit(db, st.actor, "media.uploaded", "media", m.id, null, { key, alt });
      return "Uploaded as draft. Publish it when ready.";
    }
    const id = str(fd, "id");
    if (op === "delete") {
      const [m] = await db.select().from(s.mediaAssets).where(eq(s.mediaAssets.id, id));
      await db.update(s.roomTypes).set({ coverMediaId: null }).where(eq(s.roomTypes.coverMediaId, id));
      await db.delete(s.mediaAssets).where(eq(s.mediaAssets.id, id));
      if (m && !m.storageKey.startsWith("sample/")) await getStorage()?.delete(m.storageKey);
      await audit(db, st.actor, "media.deleted", "media", id, m);
      return "Deleted.";
    }
    const v = { alt: str(fd, "alt"), caption: str(fd, "caption") || null, categoryId: str(fd, "categoryId") || null, roomTypeId: str(fd, "roomTypeId") || null, status: (str(fd, "status") || "draft") as "draft", inGallery: bool(fd, "inGallery"), sortOrder: int(fd, "sortOrder", 0)! };
    await db.update(s.mediaAssets).set(v).where(eq(s.mediaAssets.id, id));
    await audit(db, st.actor, "media.updated", "media", id, null, v);
    return "Saved.";
  }, ["/admin/content/media", "/gallery", "/"]);
}

/* ------------------------------ Reviews/Enquiries/Guests ------------------ */

export async function reviewAdminAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act("reviews.moderate", async (st) => {
    const op = str(fd, "op");
    if (op === "approve" || op === "reject") {
      await moderateReview(st.actor, str(fd, "id"), op === "approve" ? "approved" : "rejected", str(fd, "note") || undefined);
      return op === "approve" ? "Published." : "Rejected.";
    }
    if (op === "add_external") {
      if (!bool(fd, "genuine")) throw new UserError("Confirm the review is genuine and you have permission to republish it.");
      const src = str(fd, "source") as "google";
      if (!["google", "booking_com", "email", "other"].includes(src)) throw new UserError("Choose the source.");
      await db.insert(s.reviews).values({
        authorName: str(fd, "authorName"),
        displayLabel: str(fd, "displayLabel") || null,
        rating: int(fd, "rating"),
        body: str(fd, "body"),
        source: src,
        sourceUrl: str(fd, "sourceUrl") || null,
        consentToPublish: true,
        status: "pending",
      });
      await audit(db, st.actor, "review.external_added", "review", null, null, { source: src });
      return "Added for moderation.";
    }
    throw new UserError("Unknown operation.");
  }, ["/admin/reviews", "/reviews", "/"]);
}

export async function enquiryAdminAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act("enquiries.manage", async (st) => {
    await updateEnquiry(st.actor, str(fd, "id"), { status: (str(fd, "status") || undefined) as "new" | undefined, followUpDate: str(fd, "followUpDate") || null, note: str(fd, "note") || null });
    return "Enquiry updated.";
  }, ["/admin/enquiries"]);
}

export async function guestNoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act("guests.notes", async (st) => {
    if (!str(fd, "body")) throw new UserError("Note is empty.");
    await db.insert(s.guestNotes).values({ guestId: str(fd, "guestId"), staffId: st.staffId, body: str(fd, "body").slice(0, 4000) });
    await audit(db, st.actor, "guest.note_added", "guest", str(fd, "guestId"));
    return "Note added (staff only).";
  }, ["/admin/guests"]);
}

export async function categoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act("media.manage", async () => {
    const name = str(fd, "name");
    if (!name) throw new UserError("Name required.");
    await db.insert(s.galleryCategories).values({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), sortOrder: int(fd, "sortOrder", 0)! }).onConflictDoNothing();
    return "Category added.";
  }, ["/admin/content/media", "/gallery"]);
}
