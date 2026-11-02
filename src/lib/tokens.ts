import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { appSecret } from "./config";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Keyed hash for secrets we must compare later (OTP codes, access tokens). */
export function keyedHash(s: string): string {
  return createHmac("sha256", appSecret()).update(s).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function numericCode(digits = 6): string {
  return String(randomInt(0, 10 ** digits)).padStart(digits, "0");
}

/** Booking reference, e.g. R2G-7KQ4M9 (no ambiguous characters). */
export function bookingReference(): string {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[randomInt(0, alphabet.length)];
  return `R2G-${s}`;
}

/** Compact signed value: base64url(payload).sig — used for short-lived guest booking-access cookies. */
export function signValue(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", appSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySignedValue<T = Record<string, unknown>>(value: string | undefined | null): T | null {
  if (!value) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", appSecret()).update(body).digest("base64url");
  if (!safeEqual(sig, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { exp?: number };
    if (parsed.exp && Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}
