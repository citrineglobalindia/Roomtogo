/**
 * Secure booking access for guest-checkout customers.
 *  - Time-limited link (token in confirmation email; only a keyed hash stored), or
 *  - Booking reference + one-time code sent to the booking's email address.
 * Reference + email alone never reveals booking details. Responses are identical whether or not the
 * reference/email match, to avoid enumeration.
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { accessChallenges, bookings } from "@/db/schema";
import { isProduction, publicBaseUrl } from "@/lib/config";
import { UserError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { keyedHash, numericCode, safeEqual, signValue, verifySignedValue } from "@/lib/tokens";
import { enqueue, processOutbox } from "./notifications";
import { otpEmail } from "./templates";
import { verifyManageToken } from "./booking";

export const ACCESS_COOKIE = "r2g_booking_access";
const ACCESS_MINUTES = 30;

export async function requestAccessCode(reference: string, email: string, clientKey: string) {
  const ref = reference.trim().toUpperCase();
  await enforceRateLimit(`otp-req:${clientKey}`, 8, 900);
  await enforceRateLimit(`otp-req-ref:${ref}`, 5, 900);
  const [b] = await db.select().from(bookings).where(eq(bookings.reference, ref));
  if (b && b.leadEmail.toLowerCase() === email.trim().toLowerCase() && b.status !== "expired") {
    const code = numericCode(6);
    await db.transaction(async (tx) => {
      const [c] = await tx
        .insert(accessChallenges)
        .values({ bookingId: b.id, codeHash: keyedHash(`${b.id}:${code}`), expiresAt: sql`now() + interval '10 minutes'` as unknown as Date })
        .returning();
      const m = otpEmail(b.reference, code);
      await enqueue(tx, { template: "access_code", to: b.leadEmail, ...m, dedupeKey: `access-code:${c.id}`, bookingId: b.id });
    });
    processOutbox(5).catch(() => undefined);
  }
  // Same response either way.
  return { ok: true };
}

export async function verifyAccessCode(reference: string, code: string, clientKey: string) {
  const ref = reference.trim().toUpperCase();
  await enforceRateLimit(`otp-verify:${clientKey}`, 15, 900);
  const [b] = await db.select().from(bookings).where(eq(bookings.reference, ref));
  const fail = new UserError("That code is not valid or has expired. Request a new code.");
  if (!b) throw fail;
  const [c] = await db
    .select()
    .from(accessChallenges)
    .where(and(eq(accessChallenges.bookingId, b.id), isNull(accessChallenges.consumedAt)))
    .orderBy(desc(accessChallenges.createdAt))
    .limit(1);
  if (!c || c.expiresAt.getTime() < Date.now() || c.attempts >= 5) throw fail;
  await db.update(accessChallenges).set({ attempts: c.attempts + 1 }).where(eq(accessChallenges.id, c.id));
  if (!safeEqual(keyedHash(`${b.id}:${code.trim()}`), c.codeHash)) throw fail;
  await db.update(accessChallenges).set({ consumedAt: new Date() }).where(eq(accessChallenges.id, c.id));
  await grantBookingAccess(b.id);
  return b;
}

export async function grantBookingAccess(bookingId: string) {
  const jar = await cookies();
  const value = signValue({ bid: bookingId, exp: Date.now() + ACCESS_MINUTES * 60_000 });
  jar.set(ACCESS_COOKIE, value, { httpOnly: true, secure: isProduction() || publicBaseUrl().startsWith("https://"), sameSite: "lax", path: "/", maxAge: ACCESS_MINUTES * 60 });
}

/** Booking IDs this browser has been granted access to (single booking per cookie). */
export async function accessibleBookingId(): Promise<string | null> {
  const jar = await cookies();
  const v = verifySignedValue<{ bid: string }>(jar.get(ACCESS_COOKIE)?.value);
  return v?.bid ?? null;
}

export async function bookingByTokenLink(reference: string, token: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.reference, reference.trim().toUpperCase()));
  if (!b || !verifyManageToken(b, token)) return null;
  return b;
}
