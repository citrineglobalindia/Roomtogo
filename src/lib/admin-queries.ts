import { and, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { bookingRequests, bookings } from "@/db/schema";

export const STATUSES = ["pending_payment", "confirmed", "checked_in", "checked_out", "cancelled", "no_show", "expired"] as const;
export const SOURCES = ["website", "phone", "whatsapp", "walk_in", "email", "external_ota", "other"] as const;

export function reservationFilters(sp: Record<string, string | undefined>) {
  const c: SQL[] = [];
  if (sp.q) {
    const q = `%${sp.q.trim()}%`;
    c.push(or(ilike(bookings.reference, q), ilike(bookings.leadName, q), ilike(bookings.leadEmail, q), ilike(bookings.leadPhone, q))!);
  }
  if (sp.status && (STATUSES as readonly string[]).includes(sp.status)) c.push(eq(bookings.status, sp.status as (typeof STATUSES)[number]));
  if (sp.source && (SOURCES as readonly string[]).includes(sp.source)) c.push(eq(bookings.source, sp.source as (typeof SOURCES)[number]));
  if (sp.from) c.push(gte(bookings.checkIn, sp.from));
  if (sp.to) c.push(lte(bookings.checkIn, sp.to));
  if (sp.requests) c.push(inArray(bookings.id, db.select({ id: bookingRequests.bookingId }).from(bookingRequests).where(eq(bookingRequests.status, "requested"))));
  if (!sp.status && !sp.q && !sp.showExpired) c.push(sql`${bookings.status} <> 'expired'`);
  return c.length ? and(...c) : undefined;
}

