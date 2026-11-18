/**
 * One-time content updates supplied by Room2Go, applied on deploy (after migrations + seed).
 * Each patch runs exactly once per database (recorded in `data_patches`) and inside a transaction,
 * so re-deploys never re-apply or half-apply it. Staff can edit everything afterwards in the admin.
 *
 *   npx tsx scripts/content-patches.ts
 */
import "dotenv/config";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, getPool } from "../src/db";
import * as s from "../src/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const rupees = (r: number) => r * 100;

/* ------------------------------------------------------------------ */
/* 2026-11-18 — Room2Go apartments, prices, occupancy and amenities    */
/* ------------------------------------------------------------------ */
const APARTMENT_AMENITIES = [
  { name: "Wi-Fi", description: "Free high-speed Wi-Fi in the apartment", icon: "wifi", scope: "in_room", charge: "included", strip: true },
  { name: "Fully furnished", description: "Move-in ready apartment with furnished bedroom and living area", icon: "sofa", scope: "in_room", charge: "included", strip: true },
  { name: "Ready-to-use kitchen", description: "Kitchen set up so you can cook from day one", icon: "kitchen", scope: "in_room", charge: "included", strip: true },
  { name: "Washing machine", description: "Do your laundry in the apartment", icon: "laundry", scope: "in_room", charge: "included", strip: false },
  { name: "Refrigerator", description: "Your own fridge in the apartment", icon: "fridge", scope: "in_room", charge: "included", strip: false },
  { name: "TV", description: "Television in the apartment", icon: "tv", scope: "in_room", charge: "included", strip: false },
  { name: "Parking space", description: "Parking space at the property", icon: "parking", scope: "shared", charge: "included", strip: true },
] as const;

const FEATURES = "Fully furnished with Wi-Fi, a ready-to-use kitchen, washing machine, refrigerator and TV, plus parking space.";
const TYPES = [
  {
    from: "executive-room",
    slug: "1-bhk-single",
    name: "1 BHK — Single",
    summary: "A private one-bedroom apartment for one guest, with its own living space and kitchen.",
    description: `A complete one-bedroom apartment (1 BHK) for a solo stay — bedroom, living space and kitchen, all to yourself. ${FEATURES} Ideal for business trips and longer solo stays.`,
    layout: "1 bedroom · hall · kitchen",
    rate: 2200,
    adults: 1,
    children: 0,
    max: 1,
    sort: 1,
    photos: [
      "Double bed with white linen and teal throw, mustard curtains and side table",
      "Galley kitchenette with sink, kettle and oven, opening to the bedroom",
      "Bathroom with shower, wall-hung WC and square wash basin",
    ],
  },
  {
    from: null,
    slug: "1-bhk-double",
    name: "1 BHK — Double",
    summary: "A one-bedroom apartment for up to two guests — couples, friends or colleagues.",
    description: `A complete one-bedroom apartment (1 BHK) for up to two guests, with a separate living area and kitchen. ${FEATURES}`,
    layout: "1 bedroom · hall · kitchen",
    rate: 2999,
    adults: 2,
    children: 1,
    max: 2,
    sort: 2,
    photos: [
      "Double bed facing the window with mustard curtains",
      "Living room with blue sofa, wall-mounted TV unit and coffee table",
      "Kitchenette with plum cabinets, marble backsplash, kettle and oven",
    ],
  },
  {
    from: "suite-room",
    slug: "2-bhk",
    name: "2 BHK — Up to 4 guests",
    summary: "A two-bedroom apartment for families and groups of up to four.",
    description: `A spacious two-bedroom apartment (2 BHK) for up to four guests — two bedrooms, a living room and a kitchen. ${FEATURES} Great for families, friends travelling together and extended stays.`,
    layout: "2 bedrooms · hall · kitchen",
    rate: 5500,
    adults: 4,
    children: 2,
    max: 4,
    sort: 3,
    photos: [
      "Living room with blue sofa, round marble-top table and armchair",
      "Double bed with wooden headboard and warm curtain light",
      "Living room with TV unit and hallway leading to the bedroom",
    ],
  },
] as const;

async function apartments2026(tx: Tx) {
  // Amenities: create/update the seven confirmed by Room2Go; hide the unconfirmed placeholders.
  const existing = await tx.select().from(s.amenities);
  const ids: string[] = [];
  for (const [i, a] of APARTMENT_AMENITIES.entries()) {
    const match = existing.find((x) => x.name.toLowerCase() === a.name.toLowerCase() || (a.name === "Parking space" && x.name === "Parking"));
    const values = {
      name: a.name,
      description: a.description,
      icon: a.icon,
      scope: a.scope,
      charge: a.charge,
      verified: true,
      showInStrip: a.strip,
      status: "published" as const,
      sortOrder: i + 1,
    };
    if (match) {
      await tx.update(s.amenities).set(values).where(eq(s.amenities.id, match.id));
      ids.push(match.id);
    } else {
      const [row] = await tx.insert(s.amenities).values(values).returning();
      ids.push(row.id);
    }
  }
  const others = existing.filter((x) => !ids.includes(x.id) && !x.verified).map((x) => x.id);
  if (others.length) await tx.update(s.amenities).set({ status: "draft", showInStrip: false }).where(inArray(s.amenities.id, others));

  // Room types
  const typeIds: string[] = [];
  for (const t of TYPES) {
    const values = {
      slug: t.slug,
      name: t.name,
      summary: t.summary,
      description: t.description,
      bedConfiguration: t.layout,
      baseOccupancy: t.max,
      maxAdults: t.adults,
      maxChildren: t.children,
      maxOccupancy: t.max,
      extraAdultPaise: 0,
      extraChildPaise: 0,
      baseRatePaise: rupees(t.rate),
      weekendRatePaise: null,
      ratesAreSample: false,
      factsConfirmed: true,
      inclusions: [],
      publicStatus: "published" as const,
      status: "active" as const,
      sortOrder: t.sort,
    };
    const [prev] = await tx
      .select()
      .from(s.roomTypes)
      .where(t.from ? sql`${s.roomTypes.slug} in (${t.from}, ${t.slug})` : eq(s.roomTypes.slug, t.slug));
    let id: string;
    if (prev) {
      await tx.update(s.roomTypes).set(values).where(eq(s.roomTypes.id, prev.id));
      id = prev.id;
    } else {
      const [row] = await tx.insert(s.roomTypes).values(values).returning();
      id = row.id;
    }
    typeIds.push(id);
    // flat nightly price as supplied: drop any demo seasonal rules / date overrides on this type
    await tx.delete(s.rateRules).where(eq(s.rateRules.roomTypeId, id));
    await tx.delete(s.dateRates).where(eq(s.dateRates.roomTypeId, id));
    // amenities
    await tx.delete(s.roomTypeAmenities).where(eq(s.roomTypeAmenities.roomTypeId, id));
    await tx.insert(s.roomTypeAmenities).values(ids.map((amenityId) => ({ roomTypeId: id, amenityId })));
    // units: keep existing; a new type gets one placeholder unit so it can be booked (set real units in admin)
    const units = await tx.select().from(s.roomUnits).where(eq(s.roomUnits.roomTypeId, id));
    if (!units.length) {
      await tx.insert(s.roomUnits).values({ roomTypeId: id, label: `DEMO-${t.slug.toUpperCase()}`, isSample: true, sortOrder: 10 + t.sort, notes: "Placeholder unit — replace with the real apartment number(s)." });
    }
    // photos (matched by the descriptions given when they were uploaded)
    let cover: string | null = null;
    for (const [i, alt] of t.photos.entries()) {
      const [m] = await tx.select().from(s.mediaAssets).where(and(eq(s.mediaAssets.alt, alt), eq(s.mediaAssets.isSample, false)));
      if (!m) continue;
      await tx.update(s.mediaAssets).set({ roomTypeId: id, sortOrder: i, caption: t.name, status: "published" }).where(eq(s.mediaAssets.id, m.id));
      cover ??= m.id;
    }
    if (cover) await tx.update(s.roomTypes).set({ coverMediaId: cover }).where(eq(s.roomTypes.id, id));
  }

  // FAQs that still describe online payment
  await tx
    .update(s.faqs)
    .set({ answer: "Choose your dates and apartment, enter your details and verify your email with a one-time code, then confirm your reservation. No payment is taken online — pay later by UPI or at the property. You can also call our team." })
    .where(eq(s.faqs.question, "How can I book a room?"));
  await tx
    .update(s.faqs)
    .set({ answer: "Search your dates on the booking page to see live availability and the full price for your stay. Your apartment is reserved as soon as you confirm with the email code." })
    .where(eq(s.faqs.question, "How do I confirm rates and availability?"));
  return `room types ${typeIds.length}, amenities ${ids.length}, hidden ${others.length}`;
}

const PATCHES: { key: string; when: (tx: Tx) => Promise<boolean>; run: (tx: Tx) => Promise<string> }[] = [
  {
    key: "2026-11-18-room2go-apartments",
    // only on databases that hold the original sample room types (live/staging), never on an empty test DB
    when: async (tx) => (await tx.select({ id: s.roomTypes.id }).from(s.roomTypes).where(inArray(s.roomTypes.slug, ["executive-room", "suite-room", "1-bhk-single"]))).length > 0,
    run: apartments2026,
  },
];

async function main() {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS data_patches (key text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  for (const p of PATCHES) {
    await db.transaction(async (tx) => {
      const claimed = await tx.execute(sql`INSERT INTO data_patches (key) VALUES (${p.key}) ON CONFLICT DO NOTHING RETURNING key`);
      if (!claimed.rows.length) return console.log(`patch ${p.key}: already applied`);
      if (!(await p.when(tx))) {
        await tx.execute(sql`DELETE FROM data_patches WHERE key = ${p.key}`);
        return console.log(`patch ${p.key}: not applicable here`);
      }
      console.log(`patch ${p.key}: ${await p.run(tx)}`);
    });
  }
  await getPool().end();
}

main().catch(async (e) => {
  console.error(e);
  await getPool().end().catch(() => undefined);
  process.exit(1);
});
