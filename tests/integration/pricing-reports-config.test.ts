import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { d, db, guestInput, resetDb, seedFixture, type Fixture } from "./helpers";
import * as s from "@/db/schema";
import { cancelBooking, checkInBooking, createManualBooking, createWebsiteBooking, quoteSelection } from "@/domain/booking";
import { getSettings, onlineBookingStatus, setupChecklist } from "@/domain/settings";
import { createBlock } from "@/domain/inventory";
import { recordOfflinePayment, requestRefund, reconcilePayments, startPayment, verifyCheckoutReturn } from "@/domain/payments";
import { buildReport } from "@/domain/reports";
import { DemoPaymentAdapter } from "@/integrations/payments/demo";
import { applyBps, rupeesToPaise } from "@/lib/money";
import { emailConfig, paymentConfig, isDemoMode } from "@/lib/config";
import { processOutbox } from "@/domain/notifications";
import { publicReviews } from "@/domain/reviews";
import { publicMedia, publishedPolicy } from "@/domain/content";
import { setEmailAdapterForTests } from "@/integrations/email";

let f: Fixture;
beforeEach(async () => {
  await resetDb();
  f = await seedFixture();
  setEmailAdapterForTests(null);
});

describe("pricing engine", () => {
  it("applies documented precedence: date override > seasonal rule (priority) > weekend > base", async () => {
    // find a Friday ≥ 30 days ahead
    let fri = d(30);
    while (new Date(fri + "T00:00:00Z").getUTCDay() !== 5) fri = await nextDay(fri);
    const sun = await nextDay(await nextDay(fri)); // Fri, Sat nights → departure Sun
    const mon = await nextDay(sun);
    await db.update(s.roomTypes).set({ weekendRatePaise: 150000, weekendDays: [5, 6] }).where(eq(s.roomTypes.id, f.exec.id));
    const st = await getSettings();
    const q = async (ci: string, co: string) =>
      (await quoteSelection({ checkIn: ci, checkOut: co, adults: 2, children: 0, selections: [{ roomTypeId: f.exec.id, quantity: 1 }] }, st)).quote;
    let quote = await q(fri, mon); // Fri, Sat (weekend) + Sun (base)
    expect(quote.rooms[0].nights.map((n) => [n.ratePaise, n.source])).toEqual([[150000, "weekend"], [150000, "weekend"], [100000, "base"]]);
    await db.insert(s.rateRules).values([
      { roomTypeId: f.exec.id, name: "Festive", startDate: fri, endDate: sun, ratePaise: 180000, priority: 1 },
      { roomTypeId: f.exec.id, name: "Low", startDate: fri, endDate: sun, ratePaise: 90000, priority: 0 },
    ]);
    await db.insert(s.dateRates).values({ roomTypeId: f.exec.id, night: await nextDay(fri), ratePaise: 210000 });
    quote = await q(fri, mon);
    expect(quote.rooms[0].nights.map((n) => n.source)).toEqual(["rule:Festive", "date_override", "rule:Festive"]);
    expect(quote.subtotalPaise).toBe(180000 + 210000 + 180000);
  });

  it("charges extra guests per night, adults first, and only when configured", async () => {
    const st = await getSettings();
    const { quote } = await quoteSelection({ checkIn: d(5), checkOut: d(7), adults: 3, children: 1, selections: [{ roomTypeId: f.suite.id, quantity: 1 }] }, st);
    expect(quote.extrasPaise).toBe(2 * 50000); // 1 extra adult × ₹500 × 2 nights; child within base? no: base 2 → 3 adults uses all, child is extra at ₹0
    expect(quote.totalPaise).toBe(400000 + 100000);
  });

  it("taxes are off by default, and when confirmed are computed per slab with half-up paise rounding", async () => {
    let st = await getSettings();
    let { quote } = await quoteSelection({ checkIn: d(5), checkOut: d(6), adults: 1, children: 0, selections: [{ roomTypeId: f.exec.id, quantity: 1 }] }, st);
    expect(quote.taxPaise).toBe(0);
    await db.update(s.roomTypes).set({ baseRatePaise: 100001 }).where(eq(s.roomTypes.id, f.exec.id));
    await db.update(s.propertySettings).set({ taxEnabled: true, taxRules: [{ label: "Test tax A", rateBps: 1250, minNightlyPaise: 0, maxNightlyPaise: 150000 }, { label: "Never", rateBps: 9999, minNightlyPaise: 999999999 }] });
    st = await getSettings();
    ({ quote } = await quoteSelection({ checkIn: d(5), checkOut: d(6), adults: 1, children: 0, selections: [{ roomTypeId: f.exec.id, quantity: 1 }] }, st));
    expect(quote.taxLines).toEqual([{ label: "Test tax A", rateBps: 1250, taxablePaise: 100001, taxPaise: 12500 }]); // 12500.125 → 12500
    expect(applyBps(4, 1250)).toBe(1); // 0.5 → rounds half up
    expect(quote.totalPaise).toBe(112501);
  });

  it("advance payment rule splits due-now and balance; money parsing is exact", async () => {
    await db.update(s.propertySettings).set({ paymentRule: "advance", advancePercent: 30 });
    const st = await getSettings();
    const { quote } = await quoteSelection({ checkIn: d(5), checkOut: d(8), adults: 2, children: 0, selections: [{ roomTypeId: f.exec.id, quantity: 1 }] }, st);
    expect(quote.dueNowPaise).toBe(90000);
    expect(quote.balanceLaterPaise).toBe(210000);
    expect(rupeesToPaise("2,499.5")).toBe(249950);
    expect(() => rupeesToPaise("12.345")).toThrow();
  });
});

async function nextDay(x: string) {
  const dt = new Date(x + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

describe("reports match a seeded scenario", () => {
  it("separates stay revenue, collections, refunds, balances, occupancy and sources", async () => {
    const demo = new DemoPaymentAdapter();
    // 1) website booking E: d(1)→d(3), paid ₹2,000 online
    const w = await createWebsiteBooking(guestInput({ roomTypeId: f.exec.id, checkIn: d(1), checkOut: d(3) }));
    const o = (await startPayment(w.booking.id)).order;
    const p = await demo.simulatePayment(o.providerOrderId, o.amountPaise, "INR", "captured");
    await verifyCheckoutReturn({ providerOrderId: o.providerOrderId, providerPaymentId: p.paymentId, signature: p.signature });
    // 2) phone booking Suite d(2)→d(4) ₹4,000, ₹1,000 cash received
    const m = await createManualBooking(f.reception, { source: "phone", checkIn: d(2), checkOut: d(4), adults: 2, children: 0, rooms: [{ roomTypeId: f.suite.id }], leadName: "P", leadEmail: "p@example.com", leadPhone: "+91 9000000000", sendConfirmation: false });
    await recordOfflinePayment(f.reception, { bookingId: m.booking.id, amountPaise: 100000, method: "cash" });
    // 3) whatsapp booking E d(1)→d(2) then cancelled
    const c = await createManualBooking(f.reception, { source: "whatsapp", checkIn: d(1), checkOut: d(2), adults: 1, children: 0, rooms: [{ roomTypeId: f.exec.id }], leadName: "C", leadEmail: "c@example.com", leadPhone: "+91 9000000001", sendConfirmation: false });
    await cancelBooking(f.reception, c.booking.id, "changed plans");
    // 4) maintenance block on E2 d(3)→d(4)
    await db.transaction((tx) => createBlock(tx, { unitId: f.units[1].id, startDate: d(3), endDate: d(4), kind: "maintenance", reason: "AC", staffId: f.staff.id }));
    // 5) refund ₹500 of the online payment (provider-confirmed)
    const [txn] = await db.select().from(s.paymentTransactions).where(eq(s.paymentTransactions.bookingId, w.booking.id));
    await requestRefund(f.staff, { paymentTransactionId: txn.id, amountPaise: 50000, reason: "goodwill" });
    await reconcilePayments();

    const r = await buildReport({ from: d(0), to: d(4), tz: "Asia/Kolkata", includeDemo: true });
    // 3 units × 4 nights = 12, minus 1 maintenance night = 11 sellable; sold: website 2 + phone 2 = 4
    expect(r.occupancy.sellableUnitNights).toBe(11);
    expect(r.occupancy.blockedUnitNights).toBe(1);
    expect(r.occupancy.soldUnitNights).toBe(4);
    expect(r.occupancy.occupancyPct).toBe(36.4);
    expect(r.stayRevenuePaise).toBe(200000 + 400000); // cancelled booking excluded
    expect(r.collectedPaise).toBe(300000); // ₹2,000 gateway + ₹1,000 cash, received today
    expect(r.collections.find((c) => c.channel === "offline")?.amount).toBe(100000);
    expect(r.refundsPaise).toBe(50000);
    expect(r.netCollectedPaise).toBe(250000);
    expect(r.outstandingBalancesPaise).toBe(50000 + 300000);
    expect(r.outstandingBookings).toBe(2);
    expect(r.cancellations).toEqual({ count: 1, valuePaise: 100000 });
    expect(Object.fromEntries(r.sources.map((x) => [x.source, x.n]))).toEqual({ website: 1, phone: 1, whatsapp: 1 });
    // demo exclusion works
    const live = await buildReport({ from: d(0), to: d(4), tz: "Asia/Kolkata", includeDemo: false });
    expect(live.stayRevenuePaise).toBe(0);
  });
});

describe("integration honesty & production safety", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("missing gateway closes online booking; nothing pretends to succeed", async () => {
    process.env.PAYMENT_PROVIDER = "none";
    const st = await onlineBookingStatus();
    expect(st.open).toBe(false);
    await expect(createWebsiteBooking(guestInput({ roomTypeId: f.exec.id }))).rejects.toThrow(/not available/);
    process.env.PAYMENT_PROVIDER = "razorpay"; // without keys
    expect(paymentConfig().provider).toBe("none");
    process.env.RAZORPAY_KEY_ID = "rzp_live_x";
    process.env.RAZORPAY_KEY_SECRET = "y";
    expect(paymentConfig()).toMatchObject({ provider: "none", reason: expect.stringMatching(/ALLOW_LIVE_PAYMENTS/) });
  });

  it("missing email provider marks messages blocked (never 'sent'); demo adapters are refused in production", async () => {
    process.env.EMAIL_PROVIDER = "none";
    await db.insert(s.notificationOutbox).values({ template: "t", toAddress: "a@example.com", subject: "s", html: "h", text: "t", dedupeKey: "k1" });
    await processOutbox();
    const [m] = await db.select().from(s.notificationOutbox);
    expect(m.status).toBe("blocked_unconfigured");
    process.env.APP_ENV = "production";
    process.env.EMAIL_PROVIDER = "demo";
    process.env.PAYMENT_PROVIDER = "demo";
    expect(isDemoMode()).toBe(false);
    expect(emailConfig().provider).toBe("none");
    expect(paymentConfig().provider).toBe("none");
  });

  it("production hides sample reviews/photos/policies and requires every blocking setup item", async () => {
    await db.insert(s.reviews).values({ authorName: "Sample", body: "x".repeat(30), source: "sample", status: "approved", consentToPublish: true });
    await db.insert(s.mediaAssets).values({ storageKey: "sample/a.webp", url: "/sample/a.webp", alt: "a", mimeType: "image/webp", isSample: true, status: "published" });
    await db.update(s.policyVersions).set({ isSample: true });
    process.env.APP_ENV = "production";
    expect(await publicReviews()).toEqual([]);
    expect(await publicMedia()).toEqual([]);
    expect(await publishedPolicy("terms")).toBeNull();
    process.env.PAYMENT_PROVIDER = "none";
    const st = await onlineBookingStatus();
    expect(st.open).toBe(false);
    const items = await setupChecklist();
    expect(items.filter((i) => i.blocking && !i.done).map((i) => i.key)).toEqual(
      expect.arrayContaining(["times", "room_types", "policy_cancellation", "gateway", "email", "tax", "payment_rule", "channel"]),
    );
  });
});

describe("check-in rules", () => {
  it("cannot check in before the arrival date", async () => {
    const m = await createManualBooking(f.reception, { source: "phone", checkIn: d(3), checkOut: d(4), adults: 1, children: 0, rooms: [{ roomTypeId: f.exec.id }], leadName: "P", leadEmail: "p@example.com", leadPhone: "+91 9000000000", sendConfirmation: false });
    await expect(checkInBooking(f.reception, m.booking.id)).rejects.toThrow(/arrival date/);
  });
});
