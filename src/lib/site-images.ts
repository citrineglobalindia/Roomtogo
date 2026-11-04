import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { mediaAssets, siteImages } from "@/db/schema";
import type { PhotoData } from "@/components/site/sections";
import { isProduction } from "./config";

/** Fixed image positions on the website that staff can replace from Admin → Site images. */
export const SITE_IMAGE_SLOTS = [
  { slot: "home_hero", label: "Home — top banner", where: "Large photo behind the headline and booking form", fallback: "sample/executive-room.webp", shape: "Wide landscape" },
  { slot: "home_about", label: "Home — About section", where: "Beside “Comfort that feels personal”", fallback: "sample/reception.webp", shape: "Landscape 16:10" },
  { slot: "home_location", label: "Home — Location section", where: "Beside the address and map details", fallback: "sample/entrance.webp", shape: "Landscape 16:11" },
  { slot: "about_primary", label: "About page — first photo", where: "Top photo on /about", fallback: "sample/lobby.webp", shape: "Landscape 16:10" },
  { slot: "about_secondary", label: "About page — second photo", where: "Lower photo on /about", fallback: "sample/lounge.webp", shape: "Landscape 16:9" },
  { slot: "reviews_hero", label: "Reviews page — banner", where: "Photo behind the reviews heading", fallback: "sample/lounge.webp", shape: "Wide landscape" },
] as const;
export type SiteImageSlot = (typeof SITE_IMAGE_SLOTS)[number]["slot"];

const visible = (m: typeof mediaAssets.$inferSelect | undefined): m is typeof mediaAssets.$inferSelect =>
  !!m && m.status === "published" && (!isProduction() || !m.isSample);
const toPhoto = (m: typeof mediaAssets.$inferSelect): PhotoData => ({ url: m.url, alt: m.alt, isSample: m.isSample });

/** Photos for several slots at once: the staff-chosen image, else the built-in default. */
export async function siteImagesFor<S extends SiteImageSlot>(slots: S[]): Promise<Record<S, PhotoData | null>> {
  const defs = SITE_IMAGE_SLOTS.filter((d) => (slots as string[]).includes(d.slot));
  const chosen = await db.select({ slot: siteImages.slot, m: mediaAssets }).from(siteImages).innerJoin(mediaAssets, eq(mediaAssets.id, siteImages.mediaId)).where(inArray(siteImages.slot, slots));
  const fallbacks = await db.select().from(mediaAssets).where(inArray(mediaAssets.storageKey, defs.map((d) => d.fallback)));
  const out = {} as Record<S, PhotoData | null>;
  for (const d of defs) {
    const c = chosen.find((r) => r.slot === d.slot)?.m;
    const f = fallbacks.find((m) => m.storageKey === d.fallback);
    out[d.slot as S] = visible(c) ? toPhoto(c) : visible(f) ? toPhoto(f) : null;
  }
  return out;
}
