/**
 * Email OTP for website reservations (no payment at booking time).
 *  - 6-digit code generated on the server; only a keyed HMAC of it is stored
 *  - expires after 10 minutes, max 5 verification attempts per code
 *  - resend allowed after 60 seconds; requests rate-limited per email and per client (hashed IP+UA)
 *  - a verified OTP is bound to this browser via a signed, httpOnly cookie and can create ONE reservation
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { reservationOtps } from "@/db/schema";
import { isProduction, publicBaseUrl } from "@/lib/config";
import { UserError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { keyedHash, numericCode, safeEqual, signValue, verifySignedValue } from "@/lib/tokens";
import { getEmailAdapter } from "@/integrations/email";
import { reservationOtpEmail } from "./templates";

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_SECONDS = 60;
/** How long a verified email stays valid for confirming the reservation */
export const OTP_PROOF_MINUTES = 30;
export const OTP_COOKIE = "r2g_resv_otp";

/**
 * Automated-test hook only: when E2E_OTP_ECHO=1 on a non-Vercel, non-production server, the last code per
 * email is kept in this process's memory so tests can read it via /api/test/otp. Never enabled on Vercel.
 */
const g = globalThis as unknown as { __r2gE2eOtp?: Map<string, string> };
const e2eCodes = (g.__r2gE2eOtp ??= new Map<string, string>());
export const e2eEcho = () => process.env.E2E_OTP_ECHO === "1" && !process.env.VERCEL && !isProduction();
export const e2eLastCode = (email: string) => (e2eEcho() ? (e2eCodes.get(norm(email)) ?? null) : null);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const norm = (email: string) => email.trim().toLowerCase();
const hashFor = (otpId: string, email: string, code: string) => keyedHash(`resv-otp:${otpId}:${email}:${code}`);

export async function sendReservationOtp(rawEmail: string, clientKey: string): Promise<{ resendInSeconds: number }> {
  const email = norm(rawEmail);
  if (!EMAIL_RE.test(email) || email.length > 200) throw new UserError("Enter a valid email address.");
  // Resend cooldown: 60 s since the last code for this email
  const [last] = await db.select().from(reservationOtps).where(eq(reservationOtps.email, email)).orderBy(desc(reservationOtps.createdAt)).limit(1);
  if (last) {
    const wait = OTP_RESEND_SECONDS - Math.floor((Date.now() - last.createdAt.getTime()) / 1000);
    if (wait > 0) throw new UserError(`Please wait ${wait} seconds before requesting a new code.`, "otp_cooldown");
  }
  await enforceRateLimit(`resv-otp-ip:${clientKey}`, 10, 3600);
  await enforceRateLimit(`resv-otp-email:${keyedHash(email).slice(0, 32)}`, 5, 3600);

  const code = numericCode(6);
  const [row] = await db
    .insert(reservationOtps)
    .values({ email, codeHash: "pending", clientKey, expiresAt: sql`now() + make_interval(mins => ${OTP_TTL_MINUTES})` as unknown as Date })
    .returning();
  await db.update(reservationOtps).set({ codeHash: hashFor(row.id, email, code) }).where(eq(reservationOtps.id, row.id));
  // Sent directly (never via the outbox) so the plain code is not stored anywhere.
  const m = reservationOtpEmail(code, OTP_TTL_MINUTES);
  let result: Awaited<ReturnType<ReturnType<typeof getEmailAdapter>["send"]>>;
  try {
    result = await getEmailAdapter().send({ to: email, ...m });
  } catch {
    await db.delete(reservationOtps).where(eq(reservationOtps.id, row.id));
    throw new UserError("We couldn't send the code right now. Please try again in a minute or call us to reserve.");
  }
  if (result.status !== "sent") {
    if (e2eEcho()) {
      e2eCodes.set(email, code);
    } else {
      await db.delete(reservationOtps).where(eq(reservationOtps.id, row.id));
      throw new UserError("Email verification is not available yet (email delivery isn't configured). Please call us or send an enquiry to reserve.", "otp_email_unavailable");
    }
  }
  return { resendInSeconds: OTP_RESEND_SECONDS };
}

export async function verifyReservationOtp(rawEmail: string, rawCode: string, clientKey: string) {
  const email = norm(rawEmail);
  const code = rawCode.replace(/\D/g, "");
  await enforceRateLimit(`resv-otp-verify:${clientKey}`, 20, 900);
  const fail = new UserError("That code is not correct or has expired. Check the email or request a new code.", "otp_invalid");
  if (!EMAIL_RE.test(email) || code.length !== 6) throw fail;
  const [c] = await db
    .select()
    .from(reservationOtps)
    .where(and(eq(reservationOtps.email, email), isNull(reservationOtps.consumedBookingId)))
    .orderBy(desc(reservationOtps.createdAt))
    .limit(1);
  if (!c || c.expiresAt.getTime() < Date.now()) throw fail;
  if (c.attempts >= OTP_MAX_ATTEMPTS) throw new UserError("Too many incorrect attempts for this code. Please request a new code.", "otp_locked");
  const [counted] = await db
    .update(reservationOtps)
    .set({ attempts: sql`${reservationOtps.attempts} + 1` })
    .where(and(eq(reservationOtps.id, c.id), sql`${reservationOtps.attempts} < ${OTP_MAX_ATTEMPTS}`))
    .returning();
  if (!counted) throw new UserError("Too many incorrect attempts for this code. Please request a new code.", "otp_locked");
  if (!safeEqual(hashFor(c.id, email, code), c.codeHash)) {
    const left = OTP_MAX_ATTEMPTS - counted.attempts;
    throw new UserError(left > 0 ? `That code is not correct. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many incorrect attempts. Please request a new code.", "otp_invalid");
  }
  await db.update(reservationOtps).set({ verifiedAt: new Date() }).where(eq(reservationOtps.id, c.id));
  const jar = await cookies();
  jar.set(OTP_COOKIE, signValue({ oid: c.id, em: email, exp: Date.now() + OTP_PROOF_MINUTES * 60_000 }), {
    httpOnly: true,
    secure: isProduction() || publicBaseUrl().startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: OTP_PROOF_MINUTES * 60,
  });
  return { verified: true as const };
}

/** The verified OTP this browser holds for `email`, or null. */
export async function verifiedOtpFor(rawEmail: string): Promise<string | null> {
  const jar = await cookies();
  const v = verifySignedValue<{ oid: string; em: string; exp: number }>(jar.get(OTP_COOKIE)?.value);
  if (!v || v.exp < Date.now() || v.em !== norm(rawEmail)) return null;
  return v.oid;
}

export async function clearOtpCookie() {
  const jar = await cookies();
  jar.delete(OTP_COOKIE);
}
