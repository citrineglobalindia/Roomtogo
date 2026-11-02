/**
 * Editable page content with draft / published separation. Code defaults are neutral copy taken from the
 * approved design references; they contain no unverified facility, price, distance or award claims.
 * Staff preview drafts via ?preview=1 while signed in with content permission.
 */
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { amenities, contentBlocks, faqs, galleryCategories, mediaAssets, policyVersions, roomTypes, roomUnits } from "@/db/schema";
import { isProduction } from "@/lib/config";

export const CONTENT_DEFAULTS = {
  home: {
    heroEyebrow: "J. P. Nagar · Bengaluru",
    heroTitle: "Your Bengaluru stay. Made effortless.",
    heroSubtitle: "Comfortable rooms. Thoughtful amenities. A more relaxed way to be in the city.",
    aboutEyebrow: "About us",
    aboutTitle: "Comfort that feels personal.",
    aboutBody:
      "Welcome to Room2Go in J. P. Nagar, Bengaluru. Comfortable rooms, thoughtful amenities and warm hospitality for business trips, city visits and extended stays.",
    roomsEyebrow: "Our rooms",
    roomsTitle: "A room for your kind of stay.",
    roomsSubtitle: "Stylish, comfortable and designed for a better tomorrow.",
    amenitiesEyebrow: "Amenities",
    amenitiesTitle: "Everything for an easier stay.",
    galleryEyebrow: "Gallery",
    galleryTitle: "Take a look around.",
    gallerySubtitle: "A glimpse of our rooms, spaces and experiences.",
    reviewsEyebrow: "Testimonials",
    reviewsTitle: "Stories from our guests.",
    locationEyebrow: "Our location",
    locationTitle: "Stay connected to Bengaluru.",
    locationBody: "Located in J. P. Nagar, 2nd Phase. Great for business, family visits or a relaxed city break.",
    faqEyebrow: "FAQs",
    faqTitle: "Got a question?",
    faqSubtitle: "Here are some quick answers. For anything else, feel free to reach out to our team.",
    ctaEyebrow: "Ready to stay?",
    ctaTitle: "Ready for your Bengaluru stay?",
    ctaSubtitle: "Comfortable rooms, thoughtful amenities and a more relaxed way to be in the city.",
    seoTitle: "Room2Go — Serviced apartments in J. P. Nagar, Bengaluru",
    seoDescription: "Book comfortable serviced-apartment rooms directly with Room2Go in J. P. Nagar 2nd Phase, Bengaluru.",
  },
  about: {
    title: "Comfort that feels personal.",
    intro:
      "Room2Go is a serviced-apartment stay in J. P. Nagar, 2nd Phase, Bengaluru, welcoming business travellers, families, leisure visitors and extended-stay guests.",
    body: "Our team focuses on comfortable rooms, thoughtful amenities and warm hospitality — whether you're here for a short city visit or a longer stay.\n\nThis page is editable by the property team from the admin panel. Please replace this text with the approved Room2Go story.",
    seoTitle: "About Room2Go — J. P. Nagar, Bengaluru",
    seoDescription: "About Room2Go serviced apartments in J. P. Nagar, Bengaluru.",
  },
  gallery: {
    title: "A closer look at your stay.",
    subtitle: "Explore our rooms, spaces and everyday comforts.",
    ctaTitle: "Like what you see?",
    ctaAccent: "Plan your stay.",
    seoTitle: "Gallery — Room2Go Bengaluru",
    seoDescription: "Photos of Room2Go rooms and spaces in J. P. Nagar, Bengaluru.",
  },
  reviews: {
    eyebrow: "Testimonials",
    title: "Stories from our guests.",
    subtitle: "Comfort, convenience and a warm welcome.",
    emptyTitle: "Be among the first to share your experience.",
    emptyBody: "We publish genuine guest reviews after moderation. If you've stayed with us, we'd love to hear from you.",
    seoTitle: "Guest reviews — Room2Go Bengaluru",
    seoDescription: "Read genuine guest reviews of Room2Go and share your own experience.",
  },
  contact: {
    title: "Get in touch.",
    subtitle: "Questions about rooms, availability or a longer stay? Our team will get back to you.",
    seoTitle: "Contact Room2Go — J. P. Nagar, Bengaluru",
    seoDescription: "Phone, email, WhatsApp and directions for Room2Go in J. P. Nagar 2nd Phase, Bengaluru.",
  },
  extended: {
    title: "Weekly, monthly and corporate stays.",
    subtitle: "Planning a longer stay or housing a team? Tell us your dates and requirements and we'll prepare a quote.",
    body: "Extended and corporate stays are arranged by enquiry. Our team will confirm availability, inclusions and pricing with you directly.",
    seoTitle: "Extended & corporate stays — Room2Go Bengaluru",
    seoDescription: "Enquire about weekly, monthly or corporate stays at Room2Go, J. P. Nagar, Bengaluru.",
  },
  amenities: {
    title: "Everything for an easier stay.",
    subtitle: "What's included, what's shared and what's available on request.",
    seoTitle: "Amenities — Room2Go Bengaluru",
    seoDescription: "Amenities and services at Room2Go serviced apartments, J. P. Nagar, Bengaluru.",
  },
  rooms: {
    title: "A room for your kind of stay.",
    subtitle: "Stylish, comfortable and designed for a better tomorrow.",
    seoTitle: "Rooms — Room2Go Bengaluru",
    seoDescription: "Room categories at Room2Go, J. P. Nagar, Bengaluru.",
  },
} as const;

export type ContentKey = keyof typeof CONTENT_DEFAULTS;
export type ContentOf<K extends ContentKey> = { -readonly [P in keyof (typeof CONTENT_DEFAULTS)[K]]: string };

export async function getContent<K extends ContentKey>(key: K, preview = false): Promise<ContentOf<K>> {
  const [row] = await db.select().from(contentBlocks).where(eq(contentBlocks.key, key));
  const base = { ...CONTENT_DEFAULTS[key] } as ContentOf<K>;
  const data = preview ? row?.draft : row?.published;
  return { ...base, ...((data as Partial<ContentOf<K>>) ?? {}) };
}

export async function getContentRow(key: ContentKey) {
  const [row] = await db.select().from(contentBlocks).where(eq(contentBlocks.key, key));
  return row ?? null;
}

const showUnverified = () => !isProduction();

/** Amenities visible publicly: published; in production also verified. */
export async function publicAmenities() {
  const rows = await db.select().from(amenities).where(eq(amenities.status, "published")).orderBy(asc(amenities.sortOrder));
  return rows.filter((a) => a.verified || showUnverified());
}

export async function publicRoomTypes() {
  return db.select().from(roomTypes).where(eq(roomTypes.publicStatus, "published")).orderBy(asc(roomTypes.sortOrder));
}

export async function publicMedia() {
  const rows = await db
    .select({ m: mediaAssets, c: galleryCategories })
    .from(mediaAssets)
    .leftJoin(galleryCategories, eq(galleryCategories.id, mediaAssets.categoryId))
    .where(eq(mediaAssets.status, "published"))
    .orderBy(asc(mediaAssets.sortOrder));
  // Production never shows sample/illustrative assets as property photos.
  return rows.filter((r) => !isProduction() || !r.m.isSample);
}

export async function galleryCats() {
  return db.select().from(galleryCategories).orderBy(asc(galleryCategories.sortOrder));
}

export async function publicFaqs() {
  return db.select().from(faqs).where(eq(faqs.status, "published")).orderBy(asc(faqs.sortOrder));
}

export async function publishedPolicy(kind: "privacy" | "terms" | "cancellation" | "house_rules") {
  const rows = await db.select().from(policyVersions).where(eq(policyVersions.kind, kind)).orderBy(desc(policyVersions.version));
  const pub = rows.find((r) => r.status === "published");
  if (!pub) return null;
  if (isProduction() && pub.isSample) return null;
  return pub;
}

export async function roomTypeWithUnits(slug: string) {
  const [t] = await db.select().from(roomTypes).where(eq(roomTypes.slug, slug));
  if (!t) return null;
  const units = await db.select().from(roomUnits).where(eq(roomUnits.roomTypeId, t.id));
  return { type: t, units };
}
