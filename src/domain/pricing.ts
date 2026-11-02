/**
 * Pricing engine — server-side only. Browser totals are never trusted.
 *
 * Nightly rate precedence (highest first):
 *   1. Explicit date override (date_rates.rate_paise) for that room type and night
 *   2. Active seasonal rate rule covering the night (highest priority, then most recently created)
 *   3. Weekend rate, if the night's weekday is in room_types.weekend_days
 *   4. Base rate (room_types.base_rate_paise)
 * A night with no resolvable rate is not bookable online.
 *
 * Closures: any night with date_rates.closed = true blocks the stay; closed_to_arrival blocks arrivals.
 * Minimum stay: max(room type minimum, arrival-night override/rule minimum).
 * Extra guests: guests above base_occupancy, adults first, charged per night.
 * Taxes: only when settings.taxEnabled AND rules are configured; per rule, the taxable amount of each
 *   matching night line is summed and the rule's tax is rounded once (half-up) — see lib/money.
 */
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { dateRates, rateRules, roomTypes, type TaxRule } from "@/db/schema";
import { addDays, dayOfWeek, diffDays, eachNight } from "@/lib/dates";
import { applyBps, percentOf } from "@/lib/money";
import type { Settings } from "./settings";

export type RoomTypeRow = typeof roomTypes.$inferSelect;
type RuleRow = typeof rateRules.$inferSelect;
type OverrideRow = typeof dateRates.$inferSelect;

export type RateContext = { roomType: RoomTypeRow; rules: RuleRow[]; overrides: Map<string, OverrideRow> };

export type NightPrice = { night: string; ratePaise: number | null; source: string; closed: boolean; closedToArrival: boolean; minStay: number | null };

export function resolveNight(ctx: RateContext, night: string): NightPrice {
  const o = ctx.overrides.get(night);
  const dow = dayOfWeek(night);
  const rules = ctx.rules
    .filter((r) => r.active && r.startDate <= night && r.endDate >= night && (!r.daysOfWeek || r.daysOfWeek.length === 0 || r.daysOfWeek.includes(dow)))
    .sort((a, b) => b.priority - a.priority || b.createdAt.getTime() - a.createdAt.getTime());
  const rule = rules[0];
  let ratePaise: number | null = null;
  let source = "none";
  if (o?.ratePaise != null) {
    ratePaise = o.ratePaise;
    source = "date_override";
  } else if (rule) {
    ratePaise = rule.ratePaise;
    source = `rule:${rule.name}`;
  } else if (ctx.roomType.weekendRatePaise != null && ctx.roomType.weekendDays.includes(dow)) {
    ratePaise = ctx.roomType.weekendRatePaise;
    source = "weekend";
  } else if (ctx.roomType.baseRatePaise != null) {
    ratePaise = ctx.roomType.baseRatePaise;
    source = "base";
  }
  return {
    night,
    ratePaise,
    source,
    closed: Boolean(o?.closed),
    closedToArrival: Boolean(o?.closedToArrival),
    minStay: o?.minStayNights ?? rule?.minStayNights ?? null,
  };
}

export async function loadRateContexts(roomTypeIds: string[], checkIn: string, checkOut: string, tx: DbOrTx = db) {
  const map = new Map<string, RateContext>();
  if (roomTypeIds.length === 0) return map;
  const last = addDays(checkOut, -1);
  // Sequential on purpose: inside a transaction all queries share one connection.
  const types = await tx.select().from(roomTypes).where(inArray(roomTypes.id, roomTypeIds));
  const rules = await tx
    .select()
    .from(rateRules)
    .where(and(inArray(rateRules.roomTypeId, roomTypeIds), lte(rateRules.startDate, last), gte(rateRules.endDate, checkIn)));
  const overrides = await tx
    .select()
    .from(dateRates)
    .where(and(inArray(dateRates.roomTypeId, roomTypeIds), gte(dateRates.night, checkIn), lte(dateRates.night, last)));
  for (const t of types) {
    map.set(t.id, {
      roomType: t,
      rules: rules.filter((r) => r.roomTypeId === t.id),
      overrides: new Map(overrides.filter((o) => o.roomTypeId === t.id).map((o) => [o.night, o])),
    });
  }
  return map;
}

export type RoomOccupancy = { roomTypeId: string; adults: number; children: number };

export type RoomQuote = {
  roomTypeId: string;
  roomTypeName: string;
  adults: number;
  children: number;
  nights: { night: string; ratePaise: number; extraGuestPaise: number; source: string }[];
  roomSubtotalPaise: number;
  extrasPaise: number;
};

export type Quote = {
  checkIn: string;
  checkOut: string;
  nights: number;
  rooms: RoomQuote[];
  subtotalPaise: number; // accommodation (nightly rates)
  extrasPaise: number; // extra-guest charges
  discountPaise: number;
  taxLines: { label: string; rateBps: number; taxablePaise: number; taxPaise: number }[];
  taxPaise: number;
  totalPaise: number;
  dueNowPaise: number;
  balanceLaterPaise: number;
  paymentRule: { rule: "full" | "advance"; advancePercent: number };
  sampleRates: boolean;
};

export class PricingError extends Error {
  constructor(public reasons: string[]) {
    super(reasons.join(" "));
  }
}

/** Validate occupancy for a single room of a type. Returns problems (empty = ok). */
export function occupancyProblems(t: RoomTypeRow, adults: number, children: number): string[] {
  const p: string[] = [];
  if (adults < 1) p.push(`Each ${t.name} needs at least one adult.`);
  if (adults > t.maxAdults) p.push(`${t.name} allows at most ${t.maxAdults} adult(s).`);
  if (children > t.maxChildren) p.push(`${t.name} allows at most ${t.maxChildren} child(ren).`);
  if (adults + children > t.maxOccupancy) p.push(`${t.name} sleeps at most ${t.maxOccupancy} guest(s).`);
  return p;
}

export function stayRuleProblems(ctx: RateContext, checkIn: string, checkOut: string): string[] {
  const p: string[] = [];
  const nights = eachNight(checkIn, checkOut);
  const resolved = nights.map((n) => resolveNight(ctx, n));
  if (resolved.some((r) => r.closed)) p.push(`${ctx.roomType.name} is closed on one or more selected nights.`);
  if (resolved[0]?.closedToArrival) p.push(`Arrivals are not available on this date for ${ctx.roomType.name}.`);
  const minStay = Math.max(ctx.roomType.minStayNights, resolved[0]?.minStay ?? 1);
  if (nights.length < minStay) p.push(`${ctx.roomType.name} requires a minimum stay of ${minStay} night(s) for this arrival date.`);
  if (resolved.some((r) => r.ratePaise == null)) p.push(`No approved rate is set for ${ctx.roomType.name} on some selected nights.`);
  return p;
}

export function priceRoom(ctx: RateContext, occ: RoomOccupancy, checkIn: string, checkOut: string): RoomQuote {
  const t = ctx.roomType;
  const included = t.baseOccupancy;
  const extraAdults = Math.max(0, occ.adults - included);
  const remaining = Math.max(0, included - occ.adults);
  const extraChildren = Math.max(0, occ.children - remaining);
  const perNightExtra = extraAdults * t.extraAdultPaise + extraChildren * t.extraChildPaise;
  const nights = eachNight(checkIn, checkOut).map((n) => {
    const r = resolveNight(ctx, n);
    if (r.ratePaise == null) throw new PricingError([`No rate for ${t.name} on ${n}.`]);
    return { night: n, ratePaise: r.ratePaise, extraGuestPaise: perNightExtra, source: r.source };
  });
  return {
    roomTypeId: t.id,
    roomTypeName: t.name,
    adults: occ.adults,
    children: occ.children,
    nights,
    roomSubtotalPaise: nights.reduce((s, n) => s + n.ratePaise, 0),
    extrasPaise: nights.reduce((s, n) => s + n.extraGuestPaise, 0),
  };
}

export function computeTaxes(settings: Pick<Settings, "taxEnabled" | "taxRules">, rooms: RoomQuote[]) {
  if (!settings.taxEnabled || !settings.taxRules?.length) return [];
  return (settings.taxRules as TaxRule[]).map((rule) => {
    let taxable = 0;
    for (const r of rooms)
      for (const n of r.nights) {
        const tariff = n.ratePaise + n.extraGuestPaise;
        const okMin = rule.minNightlyPaise == null || tariff >= rule.minNightlyPaise;
        const okMax = rule.maxNightlyPaise == null || tariff <= rule.maxNightlyPaise;
        if (okMin && okMax) taxable += tariff;
      }
    return { label: rule.label, rateBps: rule.rateBps, taxablePaise: taxable, taxPaise: applyBps(taxable, rule.rateBps) };
  }).filter((l) => l.taxablePaise > 0);
}

export function dueNow(total: number, s: Pick<Settings, "paymentRule" | "advancePercent">) {
  if (s.paymentRule === "advance" && s.advancePercent < 100) {
    const due = Math.max(percentOf(total, s.advancePercent), total > 0 ? 100 : 0);
    return Math.min(due, total);
  }
  return total;
}

/**
 * Distribute a party across selected rooms: each room gets one adult, remaining adults then children are
 * placed round-robin where capacity allows. Throws PricingError if the party cannot be accommodated.
 */
export function distributeGuests(types: RoomTypeRow[], adults: number, children: number): RoomOccupancy[] {
  if (types.length === 0) throw new PricingError(["Select at least one room."]);
  if (adults < types.length) throw new PricingError(["Each room needs at least one adult. Reduce the number of rooms or add adults."]);
  const rooms = types.map((t) => ({ t, adults: 1, children: 0 }));
  let a = adults - types.length;
  let c = children;
  const fits = (r: (typeof rooms)[number], kind: "a" | "c") =>
    r.adults + r.children < r.t.maxOccupancy && (kind === "a" ? r.adults < r.t.maxAdults : r.children < r.t.maxChildren);
  let progress = true;
  while ((a > 0 || c > 0) && progress) {
    progress = false;
    for (const r of rooms) {
      if (a > 0 && fits(r, "a")) {
        r.adults++;
        a--;
        progress = true;
      } else if (a === 0 && c > 0 && fits(r, "c")) {
        r.children++;
        c--;
        progress = true;
      }
    }
  }
  if (a > 0 || c > 0) throw new PricingError(["The selected rooms cannot accommodate this many guests. Add a room or choose a larger category."]);
  return rooms.map((r) => ({ roomTypeId: r.t.id, adults: r.adults, children: r.children }));
}

/** Full server-side quote for a stay. Validates closures, min stay, occupancy and rates. */
export async function quoteStay(
  input: { checkIn: string; checkOut: string; rooms: RoomOccupancy[] },
  settings: Settings,
  tx: DbOrTx = db,
): Promise<Quote> {
  const { checkIn, checkOut } = input;
  const ids = [...new Set(input.rooms.map((r) => r.roomTypeId))];
  const ctxs = await loadRateContexts(ids, checkIn, checkOut, tx);
  const problems: string[] = [];
  for (const id of ids) {
    const ctx = ctxs.get(id);
    if (!ctx) {
      problems.push("Unknown room category.");
      continue;
    }
    problems.push(...stayRuleProblems(ctx, checkIn, checkOut));
  }
  for (const r of input.rooms) {
    const ctx = ctxs.get(r.roomTypeId);
    if (ctx) problems.push(...occupancyProblems(ctx.roomType, r.adults, r.children));
  }
  if (problems.length) throw new PricingError([...new Set(problems)]);
  const rooms = input.rooms.map((r) => priceRoom(ctxs.get(r.roomTypeId)!, r, checkIn, checkOut));
  const subtotal = rooms.reduce((s, r) => s + r.roomSubtotalPaise, 0);
  const extras = rooms.reduce((s, r) => s + r.extrasPaise, 0);
  const discount = 0; // extension point: coupons / packages (future scope)
  const taxLines = computeTaxes(settings, rooms);
  const tax = taxLines.reduce((s, l) => s + l.taxPaise, 0);
  const total = subtotal + extras - discount + tax;
  const due = dueNow(total, settings);
  return {
    checkIn,
    checkOut,
    nights: diffDays(checkIn, checkOut),
    rooms,
    subtotalPaise: subtotal,
    extrasPaise: extras,
    discountPaise: discount,
    taxLines,
    taxPaise: tax,
    totalPaise: total,
    dueNowPaise: due,
    balanceLaterPaise: total - due,
    paymentRule: { rule: settings.paymentRule, advancePercent: settings.advancePercent },
    sampleRates: ids.some((id) => ctxs.get(id)!.roomType.ratesAreSample),
  };
}

export async function getRoomType(id: string, tx: DbOrTx = db) {
  const [t] = await tx.select().from(roomTypes).where(eq(roomTypes.id, id));
  return t ?? null;
}
