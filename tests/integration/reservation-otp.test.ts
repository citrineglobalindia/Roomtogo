import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { d, db, guestInput, resetDb, seedFixture, type Fixture } from "./helpers";
import * as s from "@/db/schema";
import { createOtpReservation } from "@/domain/booking";
import { setEmailAdapterForTests, type OutgoingEmail } from "@/integrations/email";
import { keyedHash } from "@/lib/tokens";

// next/headers cookies() outside a request: keep an in-memory jar
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined), set: (k: string, v: string) => jar.set(k, v), delete: (k: string) => jar.delete(k) }),
  headers: async () => new Headers(),
}));
const { sendReservationOtp, verifyReservationOtp, verifiedOtpFor, OTP_MAX_ATTEMPTS } = await import("@/domain/reservation-otp");

let f: Fixture;
const sent: OutgoingEmail[] = [];
beforeEach(async () => {
  await resetDb();
  f = await seedFixture();
  jar.clear();
  sent.length = 0;
  setEmailAdapterForTests({ send: async (m) => (sent.push(m), { status: "sent", providerMessageId: "t" }) });
  process.env.RATE_LIMIT_IN_TESTS = "true";
  await db.execute(sql`delete from app_rate_limits`);
});
afterEach(() => {
  setEmailAdapterForTests(null);
  delete process.env.RATE_LIMIT_IN_TESTS;
});

const codeFrom = (m: OutgoingEmail) => m.text.match(/\b(\d{6})\b/)![1];

describe("email OTP reservations", () => {
  it("stores only a hash, enforces the 60 s resend cooldown and email/IP rate limits", async () => {
    await sendReservationOtp("Guest@Example.com", "ip1");
    const [row] = await db.select().from(s.reservationOtps);
    const code = codeFrom(sent[0]);
    expect(row.email).toBe("guest@example.com");
    expect(row.codeHash).not.toContain(code);
    expect(row.codeHash).toBe(keyedHash(`resv-otp:${row.id}:guest@example.com:${code}`));
    expect(Math.round((row.expiresAt.getTime() - row.createdAt.getTime()) / 60000)).toBe(10);
    // nothing about the code is written to the outbox
    const outbox = await db.select().from(s.notificationOutbox);
    expect(outbox.some((o) => o.text.includes(code) || o.html.includes(code))).toBe(false);
    await expect(sendReservationOtp("guest@example.com", "ip1")).rejects.toThrow(/wait \d+ seconds/);
    // per-email limit (5/hour) even from different IPs once the cooldown has passed
    for (let i = 0; i < 4; i++) {
      await db.execute(sql`update reservation_otps set created_at = created_at - interval '2 minutes'`);
      await sendReservationOtp("guest@example.com", `ip-${i}`);
    }
    await db.execute(sql`update reservation_otps set created_at = created_at - interval '2 minutes'`);
    await expect(sendReservationOtp("guest@example.com", "ip-x")).rejects.toThrow(/Too many attempts/);
  });

  it("expires after 10 minutes and locks after 5 wrong attempts", async () => {
    await sendReservationOtp("a@example.com", "ip");
    const good = codeFrom(sent[0]);
    const bad = good === "000000" ? "111111" : "000000";
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) await expect(verifyReservationOtp("a@example.com", bad, "ip")).rejects.toThrow();
    await expect(verifyReservationOtp("a@example.com", good, "ip")).rejects.toThrow(/Too many incorrect attempts/);
    expect(await verifiedOtpFor("a@example.com")).toBeNull();

    await db.execute(sql`update reservation_otps set created_at = created_at - interval '2 minutes'`);
    await sendReservationOtp("b@example.com", "ip");
    await db.execute(sql`update reservation_otps set expires_at = now() - interval '1 second' where email = 'b@example.com'`);
    await expect(verifyReservationOtp("b@example.com", codeFrom(sent[1]), "ip")).rejects.toThrow(/expired/);
  });

  it("verified OTP creates exactly one reservation_confirmed booking, even with concurrent double submits", async () => {
    const email = "asha@example.com";
    await sendReservationOtp(email, "ip");
    await verifyReservationOtp(email, codeFrom(sent[0]), "ip");
    const otpId = (await verifiedOtpFor(email))!;
    expect(otpId).toBeTruthy();
    const input = guestInput({ roomTypeId: f.exec.id, checkIn: d(20), checkOut: d(22) });
    const [a, b] = await Promise.all([createOtpReservation(input, otpId), createOtpReservation(input, otpId)]);
    expect(a.booking.id).toBe(b.booking.id);
    const rows = await db.select().from(s.bookings).where(eq(s.bookings.leadEmail, email));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "confirmed", reservationStatus: "reservation_confirmed", confirmationMethod: "email_otp", paymentStatus: "unpaid", dueNowPaise: 0 });
    expect(rows[0].reference).toMatch(/^R2G-[A-Z0-9]{6}$/);
    // a different email cannot use this OTP
    await expect(createOtpReservation({ ...input, leadEmail: "other@example.com" }, otpId)).rejects.toThrow(/verify your email/);
  });
});
