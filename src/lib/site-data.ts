import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { amenities, mediaAssets, roomTypeAmenities, roomTypes } from "@/db/schema";
import { galleryCats, publicAmenities, publicFaqs, publicMedia, publicRoomTypes } from "@/domain/content";
import { publicReviews } from "@/domain/reviews";
import { isProduction } from "./config";
import type { GalleryItem } from "@/components/site/gallery";
import type { PhotoData } from "@/components/site/sections";

export async function roomCards() {
  const types = await publicRoomTypes();
  const ids = types.map((t) => t.id);
  const covers = types.map((t) => t.coverMediaId).filter(Boolean) as string[];
  const media = covers.length ? await db.select().from(mediaAssets).where(inArray(mediaAssets.id, covers)) : [];
  // Rooms without a cover fall back to their first published room photo.
  const roomMedia = ids.length ? await db.select().from(mediaAssets).where(and(inArray(mediaAssets.roomTypeId, ids), eq(mediaAssets.status, "published"))).orderBy(asc(mediaAssets.sortOrder), asc(mediaAssets.createdAt)) : [];
  const links = ids.length
    ? await db.select({ rt: roomTypeAmenities.roomTypeId, a: amenities }).from(roomTypeAmenities).innerJoin(amenities, eq(amenities.id, roomTypeAmenities.amenityId)).where(inArray(roomTypeAmenities.roomTypeId, ids))
    : [];
  return types.map((t) => {
    const m = media.find((x) => x.id === t.coverMediaId && x.status === "published") ?? roomMedia.find((x) => x.roomTypeId === t.id && (!isProduction() || !x.isSample));
    const photo: PhotoData | null = m && (!isProduction() || !m.isSample) ? { url: m.url, alt: m.alt, isSample: m.isSample } : null;
    return {
      type: t,
      photo,
      amenities: links.filter((l) => l.rt === t.id && l.a.status === "published" && (l.a.verified || !isProduction())).map((l) => ({ name: l.a.name, icon: l.a.icon })),
      fromPaise: t.baseRatePaise != null && (!isProduction() || !t.ratesAreSample) ? t.baseRatePaise : null,
    };
  });
}

export async function galleryItems(onlyGallery = true): Promise<GalleryItem[]> {
  const rows = await publicMedia();
  return rows
    .filter((r) => !onlyGallery || r.m.inGallery)
    .sort((a, b) => a.m.gallerySortOrder - b.m.gallerySortOrder || a.m.sortOrder - b.m.sortOrder)
    .map((r) => ({ id: r.m.id, url: r.m.url, alt: r.m.alt, caption: r.m.caption, category: r.c?.slug ?? null, isSample: r.m.isSample }));
}

export async function mediaByStorageKey(key: string): Promise<PhotoData | null> {
  const [m] = await db.select().from(mediaAssets).where(eq(mediaAssets.storageKey, key));
  if (!m || m.status !== "published" || (isProduction() && m.isSample)) return null;
  return { url: m.url, alt: m.alt, isSample: m.isSample };
}

/** Published photos of a room category, cover photo first, then in the order staff set. */
export async function roomPhotos(roomTypeId: string): Promise<PhotoData[]> {
  const [t] = await db.select({ cover: roomTypes.coverMediaId }).from(roomTypes).where(eq(roomTypes.id, roomTypeId));
  const rows = await db.select().from(mediaAssets).where(eq(mediaAssets.roomTypeId, roomTypeId)).orderBy(asc(mediaAssets.sortOrder), asc(mediaAssets.createdAt));
  if (t?.cover && !rows.some((m) => m.id === t.cover)) {
    const [c] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, t.cover));
    if (c) rows.unshift(c);
  }
  rows.sort((a, b) => (a.id === t?.cover ? -1 : b.id === t?.cover ? 1 : 0));
  return rows.filter((m) => m.status === "published" && (!isProduction() || !m.isSample)).map((m) => ({ url: m.url, alt: m.alt, isSample: m.isSample, caption: m.caption }));
}

export { publicAmenities, publicFaqs, publicReviews, galleryCats };
