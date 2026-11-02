/**
 * Seeds the database.
 *
 *   npm run db:seed            → DEMO seed (development only): sample rooms/units/rates/policies/photos,
 *                                all flagged as sample, plus demo staff with random passwords.
 *   npm run db:seed -- --base  → production-safe baseline: settings row from the CONFIRMED brief context,
 *                                gallery categories and unverified amenity drafts. No rates, no units,
 *                                no reviews, no policies, enquiry-only mode, no staff.
 *
 * The demo seed refuses to run when APP_ENV=production.
 */
import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { getDb, getPool } from "@/db";
import * as s from "@/db/schema";

const BASE_ONLY = process.argv.includes("--base");
const RESET = process.argv.includes("--reset");

async function main() {
  const db = getDb();
  if (!BASE_ONLY && process.env.APP_ENV === "production") throw new Error("Refusing to run the DEMO seed in production. Use --base.");

  if (RESET) {
    if (process.env.APP_ENV === "production") throw new Error("--reset is not allowed in production");
    await db.execute(sql`TRUNCATE unit_nights, booking_nights, booking_units, inventory_holds, booking_requests, booking_adjustments, booking_notes,
      access_challenges, refunds, payment_exceptions, payment_transactions, payment_orders, gateway_events, demo_gateway_payments,
      review_invitations, reviews, bookings, guest_notes, guests, availability_blocks, date_rates, rate_rules, room_type_amenities,
      room_units, room_types, media_assets, gallery_categories, amenities, faqs, policy_versions, content_blocks, enquiry_notes,
      enquiries, notification_outbox, audit_logs, app_rate_limits, job_runs, staff_members, two_factor, session, account, verification,
      rate_limit, "user", property_settings CASCADE`);
  }

  const now = new Date().toISOString();
  await db
    .insert(s.propertySettings)
    .values({
      id: 1,
      name: "Room2Go",
      addressLine: "J. P. Nagar, 2nd Phase",
      locality: "J. P. Nagar",
      city: "Bengaluru",
      region: "Karnataka",
      postalCode: "560078",
      country: "IN",
      phone: "+91 90355 99205",
      email: "roomtogo10@gmail.com",
      whatsappNumber: null, // existing site lists a separate WhatsApp number — unconfirmed, see BUSINESS_INPUTS.md
      timezone: "Asia/Kolkata",
      currency: "INR",
      holdMinutes: 10,
      bookingMode: BASE_ONLY ? "enquiry_only" : "instant",
      paymentRule: "full",
      advancePercent: 100,
      confirmedFields: { contact: { by: "Requirements brief v1.0 (2 Nov 2026)", at: now } },
    })
    .onConflictDoNothing();

  const cats = [
    { slug: "rooms", name: "Rooms", sortOrder: 1 },
    { slug: "interiors", name: "Interiors", sortOrder: 2 },
    { slug: "dining", name: "Dining", sortOrder: 3 },
  ];
  await db.insert(s.galleryCategories).values(cats).onConflictDoNothing();
  const catRows = await db.select().from(s.galleryCategories);
  const cat = (slug: string) => catRows.find((c) => c.slug === slug)!.id;

  // Facilities listed on the existing website — UNVERIFIED until the client confirms them.
  const existingAmenities = (await db.select().from(s.amenities)).length;
  if (!existingAmenities) {
    await db.insert(s.amenities).values([
      { name: "Wi-Fi", description: "Stay connected", icon: "wifi", scope: "shared", charge: "unknown", showInStrip: true, sortOrder: 1 },
      { name: "In-house restaurant", description: "Good food, everyday", icon: "restaurant", scope: "shared", charge: "unknown", showInStrip: true, sortOrder: 2 },
      { name: "Parking", description: "Parking at the property", icon: "parking", scope: "shared", charge: "unknown", showInStrip: true, sortOrder: 3 },
      { name: "24/7 assistance", description: "We're always here to help", icon: "support", scope: "service", charge: "unknown", showInStrip: true, sortOrder: 4 },
      { name: "Room service", description: "Comfort and convenience at your doorstep", icon: "bell", scope: "service", charge: "unknown", sortOrder: 5 },
      { name: "Laundry service", description: "Keep your clothes fresh during your stay", icon: "laundry", scope: "service", charge: "unknown", sortOrder: 6 },
      { name: "Travel assistance", description: "Help with local travel arrangements", icon: "travel", scope: "service", charge: "unknown", sortOrder: 7 },
    ].map((a) => ({ ...a, scope: a.scope as "shared" | "service", charge: "unknown" as const, verified: false, status: (BASE_ONLY ? "draft" : "published") as "draft" | "published" })));
  }

  if (BASE_ONLY) {
    console.log("Baseline seed complete (enquiry-only, no sample data).");
    await getPool().end();
    return;
  }

  /* ---------------- DEMO DATA (development only, all flagged) ---------------- */
  const media = [
    { file: "executive-room", alt: "Sample bedroom with king bed and teal throw", caption: "Executive Room", category: "rooms" },
    { file: "suite-room", alt: "Sample suite bedroom with seating area", caption: "Suite Room", category: "rooms" },
    { file: "little-details", alt: "Sample tea tray and fresh towels", caption: "Little details", category: "interiors" },
    { file: "lobby", alt: "Sample lobby lounge with sofas", caption: "Welcoming spaces", category: "interiors" },
    { file: "dining", alt: "Sample dining room with set tables", caption: "Dining", category: "dining" },
    { file: "teal-bedroom", alt: "Sample bedroom with teal headboard", caption: "Room interior", category: "rooms" },
    { file: "living-area", alt: "Sample living area with sofa and armchair", caption: "Living area", category: "interiors" },
    { file: "headboard-detail", alt: "Sample bedside lamp and pillows", caption: "Bedside", category: "rooms" },
    { file: "lounge", alt: "Sample lounge with armchairs", caption: "Lounge", category: "interiors" },
    { file: "reception", alt: "Sample reception desk", caption: "Reception", category: "interiors" },
    { file: "entrance", alt: "Sample building entrance at dusk", caption: "Entrance", category: "interiors" },
    { file: "suite-home", alt: "Sample suite with sitting area", caption: "Suite living", category: "rooms" },
  ];
  const existingMedia = await db.select().from(s.mediaAssets);
  if (!existingMedia.length) {
    await db.insert(s.mediaAssets).values(
      media.map((m, i) => ({
        storageKey: `sample/${m.file}.webp`,
        url: `/sample/${m.file}.webp`,
        alt: m.alt,
        caption: m.caption,
        mimeType: "image/webp",
        isSample: true,
        categoryId: cat(m.category),
        status: "published" as const,
        inGallery: !["entrance", "reception", "lounge"].includes(m.file),
        sortOrder: i,
      })),
    );
  }
  const mediaRows = await db.select().from(s.mediaAssets);
  const mid = (file: string) => mediaRows.find((m) => m.storageKey === `sample/${file}.webp`)?.id ?? null;

  const existingTypes = await db.select().from(s.roomTypes);
  if (!existingTypes.length) {
    const [exec, suite] = await db
      .insert(s.roomTypes)
      .values([
        {
          slug: "executive-room",
          name: "Executive Room",
          summary: "A relaxing space with all the essentials for a comfortable stay.",
          description: "SAMPLE DESCRIPTION — replace with the verified description, bed configuration and size supplied by Room2Go.",
          bedConfiguration: null,
          baseOccupancy: 2,
          maxAdults: 2,
          maxChildren: 1,
          maxOccupancy: 3,
          extraAdultPaise: 0,
          extraChildPaise: 0,
          inclusions: [],
          baseRatePaise: 100000, // SAMPLE ₹1,000 — not a Room2Go price
          ratesAreSample: true,
          factsConfirmed: false,
          coverMediaId: mid("executive-room"),
          publicStatus: "published",
          sortOrder: 1,
        },
        {
          slug: "suite-room",
          name: "Suite Room",
          summary: "More space to unwind, work or just be yourself.",
          description: "SAMPLE DESCRIPTION — replace with the verified description, bed configuration and size supplied by Room2Go.",
          bedConfiguration: null,
          baseOccupancy: 2,
          maxAdults: 3,
          maxChildren: 2,
          maxOccupancy: 4,
          extraAdultPaise: 0,
          extraChildPaise: 0,
          inclusions: [],
          baseRatePaise: 200000, // SAMPLE ₹2,000 — not a Room2Go price
          ratesAreSample: true,
          factsConfirmed: false,
          coverMediaId: mid("suite-room"),
          publicStatus: "published",
          sortOrder: 2,
        },
      ])
      .returning();
    await db.update(s.mediaAssets).set({ roomTypeId: exec.id }).where(sql`${s.mediaAssets.storageKey} IN ('sample/executive-room.webp','sample/teal-bedroom.webp','sample/headboard-detail.webp')`);
    await db.update(s.mediaAssets).set({ roomTypeId: suite.id }).where(sql`${s.mediaAssets.storageKey} IN ('sample/suite-room.webp','sample/suite-home.webp','sample/living-area.webp')`);
    // Sample units: counts are NOT Room2Go's real inventory.
    await db.insert(s.roomUnits).values([
      { roomTypeId: exec.id, label: "DEMO-E1", isSample: true, sortOrder: 1 },
      { roomTypeId: exec.id, label: "DEMO-E2", isSample: true, sortOrder: 2 },
      { roomTypeId: suite.id, label: "DEMO-S1", isSample: true, sortOrder: 3 },
    ]);
    const am = await db.select().from(s.amenities);
    const byName = (n: string) => am.find((a) => a.name === n)!.id;
    await db.insert(s.roomTypeAmenities).values([
      { roomTypeId: exec.id, amenityId: byName("Wi-Fi") },
      { roomTypeId: exec.id, amenityId: byName("Room service") },
      { roomTypeId: suite.id, amenityId: byName("Wi-Fi") },
      { roomTypeId: suite.id, amenityId: byName("Room service") },
    ]);
  }

  if (!(await db.select().from(s.faqs)).length) {
    await db.insert(s.faqs).values([
      { question: "How can I book a room?", answer: "Choose your dates, guests and room type, review the full price and policies, then pay securely online. You can also call our team.", sortOrder: 1, status: "published" },
      { question: "Can I enquire about an extended stay?", answer: "Yes. Use the extended-stay enquiry form with your dates, number of guests and requirements and our team will reply with a quote.", sortOrder: 2, status: "published" },
      { question: "How do I confirm rates and availability?", answer: "Search your dates on the booking page. Prices shown are final before payment; availability is confirmed when your reservation hold is created.", sortOrder: 3, status: "published" },
    ]);
  }

  if (!(await db.select().from(s.policyVersions)).length) {
    const sample = (t: string) =>
      `SAMPLE ${t.toUpperCase()} — NOT APPROVED BY ROOM2GO.\n\nThis placeholder exists so the booking flow can be tested in demo mode. It must be replaced with Room2Go's approved ${t.toLowerCase()} before any live booking. It creates no obligation for guests or the property.`;
    await db.insert(s.policyVersions).values([
      { kind: "privacy", version: 1, title: "Privacy policy", body: sample("privacy policy"), status: "published", approved: false, isSample: true, publishedAt: new Date() },
      { kind: "terms", version: 1, title: "Booking terms", body: sample("booking terms"), status: "published", approved: false, isSample: true, publishedAt: new Date() },
      { kind: "cancellation", version: 1, title: "Cancellation policy", body: sample("cancellation and refund policy"), status: "published", approved: false, isSample: true, publishedAt: new Date(), rules: null },
      { kind: "house_rules", version: 1, title: "House rules", body: sample("house rules"), status: "published", approved: false, isSample: true, publishedAt: new Date() },
    ]);
  }

  // Sample testimonials exactly as labelled in the approved design ("Sample review"). Shown only in demo mode.
  if (!(await db.select().from(s.reviews)).length) {
    const sr = [
      ["A warm and comfortable stay with genuinely helpful staff. Everything felt easy from check-in to check-out.", "Business traveller"],
      ["A convenient location and well-appointed rooms made our city visit really enjoyable. We felt right at home.", "City visitor"],
      ["The rooms are spacious, clean and thoughtfully designed. It's a great place to relax after a busy day.", "Weekend traveller"],
      ["Ideal for business trips. Reliable Wi-Fi, a comfortable workspace and a peaceful environment made it easy to stay productive.", "Business traveller"],
      ["We stayed for an extended period and it truly felt like a home away from home. The team was always friendly and attentive.", "Extended-stay guest"],
      ["A convenient and comfortable stay with all the essentials we needed. Great hospitality and a relaxing atmosphere.", "City visitor"],
    ];
    await db.insert(s.reviews).values(sr.map(([body, label]) => ({ authorName: "Sample", displayLabel: label, body, source: "sample" as const, status: "approved" as const, consentToPublish: true })));
  }

  // Demo staff: random passwords, printed once and written to a gitignored file. Never fixed/public.
  const ctx = await (await import("@/lib/auth")).auth.$context;
  const creds: string[] = [];
  for (const [role, email, name] of [
    ["owner", "owner@demo.room2go.local", "Demo Owner"],
    ["reception", "reception@demo.room2go.local", "Demo Reception"],
    ["content", "content@demo.room2go.local", "Demo Content Editor"],
  ] as const) {
    const [existing] = await db.select().from(s.user).where(eq(s.user.email, email));
    if (existing) continue;
    const password = randomBytes(9).toString("base64url");
    const id = randomUUID();
    await db.insert(s.user).values({ id, name, email, emailVerified: true });
    await db.insert(s.account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: await ctx.password.hash(password) });
    await db.insert(s.staffMembers).values({ userId: id, role });
    creds.push(`${role.padEnd(10)} ${email}  ${password}`);
  }
  if (creds.length) {
    const text = `DEMO staff credentials (development only — regenerate with npm run db:seed -- --reset)\n${creds.join("\n")}\n`;
    writeFileSync(process.env.SEED_CREDENTIALS_FILE ?? ".demo-credentials", text, { mode: 0o600 });
    console.log(text);
  }
  await db.update(s.propertySettings).set({ notificationEmails: ["owner@demo.room2go.local"] }).where(eq(s.propertySettings.id, 1));
  console.log("Demo seed complete. All sample rooms, units, rates, photos, policies and reviews are flagged as SAMPLE.");
  await getPool().end();
}

main().catch(async (e) => {
  console.error(e);
  await getPool().end().catch(() => undefined);
  process.exit(1);
});
