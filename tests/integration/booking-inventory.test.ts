import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { cookieJar, d, db, expireHold, guestInput, resetDb, seedFixture, unitNightCount, type Fixture } from "./helpers";
import * as s from "@/db/schema";
import { cancelBooking, createManualBooking, createWebsiteBooking, quoteSelection } from "@/domain/booking";
import { availabilityByType, createBlock, releaseExpiredHolds } from "@/domain/inventory";
import { getSettings } from "@/domain/settings";
import { requestAccessCode, verifyAccessCode, accessibleBookingId, bookingByTokenLink } from "@/domain/guest-access";

let f: Fixture;
beforeEach(async () => {
  await resetDb();
  f = await seedFixture();
});

describe("date & occupancy validation (server-side)", () => {
  it("rejects invalid ranges, past dates, occupancy violations, closures, min-stay and blocks", async () => {
    const st = await getSettings();
    const q = (o: Partial<Parameters<typeof quoteSelection>[0]>) =>
      quoteSelection({ checkIn: d(5), checkOut: d(7), adults: 2, children: 0, selections: [{ roomTypeId: f.exec.id, quantity: 1 }], ...o }, st);
    await expect(q({ checkOut: d(5) })).rejects.toThrow(/Departure must be after arrival/);
    await expect(q({ checkIn: d(-2), checkOut: d(1) })).rejects.toThrow(/past/);
    await expect(q({ checkIn: "2026-02-30", checkOut: "2026-03-02" })).rejects.toThrow(/valid/);
    await expect(q({ adults: 3 })).rejects.toThrow(/cannot accommodate/);
    await expect(q({ adults: 0 })).rejects.toThrow(/At least one adult/);
    await expect(q({ adults: 1, selections: [{ roomTypeId: f.exec.id, quantity: 2 }] })).rejects.toThrow(/at least one adult/);
    // closed date
    await db.insert(s.dateRates).values({ roomTypeId: f.exec.id, night: d(6), closed: true });
    await expect(q({})).rejects.toThrow(/closed/);
    // min stay on arrival night
    await db.insert(s.dateRates).values({ roomTypeId: f.exec.id, night: d(20), minStayNights: 3 });
    await expect(q({ checkIn: d(20), checkOut: d(22) })).rejects.toThrow(/minimum stay of 3/);
    await expect(q({ checkIn: d(20), checkOut: d(23) })).resolves.toBeTruthy();
  });

  it("maintenance blocks remove the unit from sale and cannot overwrite a reservation", async () => {
    await db.transaction((tx) => createBlock(tx, { unitId: f.units[0].id, startDate: d(10), endDate: d(12), kind: "maintenance", reason: "Paint", staffId: f.staff.id }));
    const avail = await availabilityByType(d(10), d(12));
    expect(avail.get(f.exec.id)).toBe(1);
    const { booking } = await createWebsiteBooking(guestInput({ roomTypeId: f.exec.id }));
    // remaining exec unit is now held — a block on it must be refused, not overwrite
    await expect(
      db.transaction((tx) => createBlock(tx, { unitId: f.units[1].id, startDate: d(11), endDate: d(13), kind: "maintenance", reason: "x", staffId: f.staff.id })),
    ).rejects.toThrow(new RegExp(`Cannot block.*${booking.reference}`));
    await expect(createWebsiteBooking(guestInput({ roomTypeId: f.exec.id }))).rejects.toThrow(/no longer available/);
  });
});

describe("inventory correctness", () => {
  it("never creates an impossible split stay: nightly availability across different units is not a continuous stay", async () => {
    // E1 occupied on night 10, E2 occupied on night 11 → each night has 1 free exec, but no unit is free for 10→12
    await db.transaction((tx) => createBlock(tx, { unitId: f.units[0].id, startDate: d(10), endDate: d(11), kind: "maintenance", reason: "a", staffId: f.staff.id }));
    await db.transaction((tx) => createBlock(tx, { unitId: f.units[1].id, startDate: d(11), endDate: d(12), kind: "maintenance", reason: "b", staffId: f.staff.id }));
    expect((await availabilityByType(d(10), d(11))).get(f.exec.id)).toBe(1);
    expect((await availabilityByType(d(11), d(12))).get(f.exec.id)).toBe(1);
    expect((await availabilityByType(d(10), d(12))).get(f.exec.id) ?? 0).toBe(0);
    await expect(createWebsiteBooking(guestInput({ roomTypeId: f.exec.id }))).rejects.toThrow(/no longer available/);
    expect((await db.select().from(s.bookings)).length).toBe(0);
  });

  it("simultaneous attempts for the final unit: exactly one succeeds, no duplicate unit/night", async () => {
    await resetDb();
    f = await seedFixture({ execUnits: 1 });
    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => createWebsiteBooking(guestInput({ roomTypeId: f.exec.id, leadEmail: `g${i}@example.com` }))),
    );
    const ok = attempts.filter((a) => a.status === "fulfilled");
    expect(ok.length).toBe(1);
    const rows = await db.execute<{ n: number; d: number }>(sql`SELECT count(*)::int n, count(DISTINCT (unit_id, night))::int d FROM unit_nights`);
    expect(rows.rows[0].n).toBe(2);
    expect(rows.rows[0].d).toBe(2);
    expect((await db.select().from(s.bookings)).length).toBe(1);
  });

  it("multi-room requests allocate all rooms atomically or nothing", async () => {
    // occupy one exec unit
    await createWebsiteBooking(guestInput({ roomTypeId: f.exec.id }));
    await expect(
      createWebsiteBooking(guestInput({ adults: 2, selections: [{ roomTypeId: f.exec.id, quantity: 2 }] })),
    ).rejects.toThrow(/no longer available/);
    expect((await db.select().from(s.bookings)).length).toBe(1);
    expect((await db.select().from(s.bookingUnits)).length).toBe(1);
    // mixed multi-room that fits
    const { booking } = await createWebsiteBooking(guestInput({ adults: 3, leadEmail: "x@example.com", selections: [{ roomTypeId: f.exec.id, quantity: 1 }, { roomTypeId: f.suite.id, quantity: 1 }] }));
    expect(booking.roomsCount).toBe(2);
    expect(await unitNightCount(booking.id)).toBe(4);
  });

  it("adjacent stays: departure and next arrival on the same date are compatible", async () => {
    await resetDb();
    f = await seedFixture({ execUnits: 1 });
    await createWebsiteBooking(guestInput({ roomTypeId: f.exec.id, checkIn: d(10), checkOut: d(12) }));
    const second = await createWebsiteBooking(guestInput({ roomTypeId: f.exec.id, checkIn: d(12), checkOut: d(14), leadEmail: "b@example.com" }));
    expect(second.booking.status).toBe("pending_payment");
    await expect(createWebsiteBooking(guestInput({ roomTypeId: f.exec.id, checkIn: d(11), checkOut: d(13), leadEmail: "c@example.com" }))).rejects.toThrow();
  });

  it("abandoned holds release inventory; expired holds are swept and bookings marked expired", async () => {
    await resetDb();
    f = await seedFixture({ execUnits: 1 });
    const first = await createWebsiteBooking(guestInput({ roomTypeId: f.exec.id }));
    expect((await availabilityByType(d(10), d(12))).get(f.exec.id) ?? 0).toBe(0);
    await expireHold(first.booking.id);
    // search treats expired-but-unswept hold as free
    expect((await availabilityByType(d(10), d(12))).get(f.exec.id)).toBe(1);
    // a new booking sweeps and takes the unit
    const second = await createWebsiteBooking(guestInput({ roomTypeId: f.exec.id, leadEmail: "z@example.com" }));
    expect(second.booking.id).not.toBe(first.booking.id);
    const [b1] = await db.select().from(s.bookings).where(eq(s.bookings.id, first.booking.id));
    expect(b1.status).toBe("expired");
    expect(await unitNightCount(first.booking.id)).toBe(0);
    // sweeping again is a no-op
    expect(await releaseExpiredHolds()).toEqual([]);
  });

  it("staff-entered (offline) bookings block conflicting website sales", async () => {
    await resetDb();
    f = await seedFixture({ execUnits: 1 });
    const { booking } = await createManualBooking(f.reception, {
      source: "phone",
      checkIn: d(10),
      checkOut: d(13),
      adults: 2,
      children: 0,
      rooms: [{ roomTypeId: f.exec.id }],
      leadName: "Phone Guest",
      leadEmail: "phone@example.com",
      leadPhone: "+91 88888 00000",
      sendConfirmation: false,
    });
    expect(booking.status).toBe("confirmed");
    await expect(createWebsiteBooking(guestInput({ roomTypeId: f.exec.id, checkIn: d(12), checkOut: d(14) }))).rejects.toThrow(/no longer available/);
    // cancelling releases the stock
    await cancelBooking(f.reception, booking.id, "Guest called to cancel");
    await expect(createWebsiteBooking(guestInput({ roomTypeId: f.exec.id, checkIn: d(12), checkOut: d(14) }))).resolves.toBeTruthy();
  });

  it("negotiated manual totals require a reason and are stored as an audited adjustment", async () => {
    const base = { source: "whatsapp" as const, checkIn: d(10), checkOut: d(12), adults: 1, children: 0, rooms: [{ roomTypeId: f.exec.id }], leadName: "W", leadEmail: "w@example.com", leadPhone: "+91 7777777777", sendConfirmation: false };
    await expect(createManualBooking(f.reception, { ...base, agreedTotalPaise: 150000 })).rejects.toThrow(/reason is required/);
    const { booking } = await createManualBooking(f.reception, { ...base, agreedTotalPaise: 150000, adjustmentReason: "Corporate rate agreed by owner" });
    expect(booking.totalPaise).toBe(150000);
    const adj = await db.select().from(s.bookingAdjustments).where(eq(s.bookingAdjustments.bookingId, booking.id));
    expect(adj[0].amountPaise).toBe(-50000);
    const logs = await db.select().from(s.auditLogs).where(eq(s.auditLogs.entityId, booking.id));
    expect(logs.some((l) => l.action === "booking.manual_created")).toBe(true);
  });
});

describe("guest booking access isolation", () => {
  it("a booking reference + email alone never grants access; OTP and link tokens are booking-specific", async () => {
    const a = await createWebsiteBooking(guestInput({ roomTypeId: f.exec.id, leadEmail: "a@example.com" }));
    const b = await createWebsiteBooking(guestInput({ roomTypeId: f.suite.id, leadEmail: "b@example.com" }));
    // token for A does not open B
    expect(await bookingByTokenLink(a.booking.reference, a.token)).not.toBeNull();
    expect(await bookingByTokenLink(b.booking.reference, a.token)).toBeNull();
    // wrong email: no challenge created, same generic response
    await expect(requestAccessCode(a.booking.reference, "b@example.com", "ip1")).resolves.toEqual({ ok: true });
    expect((await db.select().from(s.accessChallenges)).length).toBe(0);
    await expect(verifyAccessCode(a.booking.reference, "000000", "ip1")).rejects.toThrow(/not valid/);
    expect(await accessibleBookingId()).toBeNull();
    // correct email → code emailed (read from outbox, as the guest would from their inbox)
    await requestAccessCode(a.booking.reference, "A@Example.com", "ip1");
    const [msg] = await db.select().from(s.notificationOutbox).where(eq(s.notificationOutbox.template, "access_code"));
    const code = msg.text.match(/(\d{6})/)![1];
    expect(msg.toAddress).toBe("a@example.com");
    await expect(verifyAccessCode(b.booking.reference, code, "ip1")).rejects.toThrow(/not valid/); // A's code can't open B
    await verifyAccessCode(a.booking.reference, code, "ip1");
    expect(await accessibleBookingId()).toBe(a.booking.id);
    // codes are single use
    cookieJar.clear();
    await expect(verifyAccessCode(a.booking.reference, code, "ip1")).rejects.toThrow(/not valid/);
  });
});
