import type { MetadataRoute } from "next";
import { publicRoomTypes } from "@/domain/content";
import { publicBaseUrl } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicBaseUrl();
  const pages = ["", "/about", "/rooms", "/amenities", "/gallery", "/reviews", "/contact", "/extended-stays", "/privacy", "/terms", "/cancellation-policy", "/house-rules"];
  const rooms = await publicRoomTypes().catch(() => []);
  return [...pages.map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" as const })), ...rooms.map((r) => ({ url: `${base}/rooms/${r.slug}`, changeFrequency: "weekly" as const }))];
}
