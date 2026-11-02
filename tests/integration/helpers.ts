import { eq, sql } from "drizzle-orm";
import { vi } from "vitest";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { addDays, todayInTz } from "@/lib/dates";
import type { Actor } from "@/lib/audit";

// Domain modules that touch request cookies are exercised with an in-memory cookie jar.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined),
    set: (k: string, v: string) => void jar.set(k, v),
    delete: (k: string) => void jar.delete(k),
  }),
  headers: async () => new Headers(),
}));
export const cookieJar = jar;

export const db = getDb();
export const today = () => todayInTz("Asia/Kolkata");
export const d = (offset: number) => addDays(today(), offset);

export async function resetDb() {
  const tables = await db.execute<{ tablename: string }>(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  const list = tables.rows.map((r) => `"${r.tablename}"`).join(", ");
  await db.execute(sql.raw(`TRUNCATE ${list} RESTART IDENTITY CASCADE`));
  jar.clear();
}

export type Fixture = Awaited<ReturnType<typeof seedFixture>>;

/** Small, explicit fixture: Exec type (2 units, ₹1,000 base) and Suite type (1 unit, ₹2,000 base). */
export async function seedFixture(opts: { execUnits?: number } = {}) {
  await db.insert(s.propertySettings).values({
    id: 1,
    addressLine: "Test address",
    city: "Bengaluru",
    region: "Karnataka",
    postalCode: "560078",
    phone: "+91 00000 00000",
    email: "test@example.com",
    bookingMode: "instant",
    notificationEmails: ["staff@example.com"],
    holdMinutes: 10,
  });
  const [exec, suite] = await db
    .insert(s.roomTypes)
    .values([
      { slug: "exec", name: "Exec", baseOccupancy: 2, maxAdults: 2, maxChildren: 1, maxOccupancy: 3, baseRatePaise: 100000, extraChildPaise: 0, publicStatus: "published" },
      { slug: "suite", name: "Suite", baseOccupancy: 2, maxAdults: 3, maxChildren: 2, maxOccupancy: 4, baseRatePaise: 200000, extraAdultPaise: 50000, publicStatus: "published" },
    ])
    .returning();
  const n = opts.execUnits ?? 2;
  const units = await db
    .insert(s.roomUnits)
    .values([...Array.from({ length: n }, (_, i) => ({ roomTypeId: exec.id, label: `E${i + 1}`, sortOrder: i })), { roomTypeId: suite.id, label: "S1", sortOrder: 10 }])
    .returning();
  await db.insert(s.policyVersions).values([
    { kind: "terms", version: 1, title: "Terms", body: "T", status: "published", approved: true },
    { kind: "cancellation", version: 1, title: "Cancel", body: "C v1", status: "published", approved: true },
  ]);
  const staff = await makeStaff("owner");
  const reception = await makeStaff("reception");
  return { exec, suite, units, staff, reception };
}

let staffN = 0;
export async function makeStaff(role: "owner" | "reception" | "content"): Promise<Extract<Actor, { type: "staff" }>> {
  const id = `u-${role}-${++staffN}`;
  await db.insert(s.user).values({ id, name: role, email: `${id}@example.com`, emailVerified: true });
  const [m] = await db.insert(s.staffMembers).values({ userId: id, role }).returning();
  return { type: "staff", id: m.id, label: role, role };
}

export function guestInput(over: Partial<Parameters<typeof import("@/domain/booking").createWebsiteBooking>[0]> & { roomTypeId?: string } = {}) {
  const { roomTypeId, ...rest } = over;
  return {
    checkIn: d(10),
    checkOut: d(12),
    adults: 2,
    children: 0,
    selections: roomTypeId ? [{ roomTypeId, quantity: 1 }] : [],
    leadName: "Asha Guest",
    leadEmail: "asha@example.com",
    leadPhone: "+91 99999 00000",
    acceptPolicies: true,
    marketingOptIn: false,
    ...rest,
  };
}

export async function expireHold(bookingId: string) {
  await db.update(s.inventoryHolds).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(s.inventoryHolds.bookingId, bookingId));
}

export async function unitNightCount(bookingId: string) {
  const r = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM unit_nights un JOIN booking_units bu ON bu.id = un.booking_unit_id WHERE bu.booking_id = ${bookingId}`);
  return r.rows[0].n;
}
