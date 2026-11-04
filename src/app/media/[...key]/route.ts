import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { getStorage } from "@/integrations/storage";
import { getStaff } from "@/lib/staff";

/** Serves stored media. Published assets are public; drafts only to staff with media permission. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  if (key.includes("..")) return new NextResponse("Not found", { status: 404 });
  const [m] = await db.select().from(mediaAssets).where(eq(mediaAssets.storageKey, key));
  if (!m) return new NextResponse("Not found", { status: 404 });
  if (m.status !== "published") {
    const staff = await getStaff();
    if (!staff?.can("media.manage")) return new NextResponse("Not found", { status: 404 });
  }
  const store = getStorage();
  const obj = await store?.get(key);
  if (!obj) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(obj.body), {
    headers: {
      "content-type": obj.contentType,
      "cache-control": m.status === "published" ? key.startsWith("uploads/") ? "public, max-age=31536000, immutable" : "public, max-age=86400, stale-while-revalidate=604800" : "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
