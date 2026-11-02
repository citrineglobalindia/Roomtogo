import { NextResponse, type NextRequest } from "next/server";
import { bookingByTokenLink, grantBookingAccess } from "@/domain/guest-access";
import { rateLimit } from "@/lib/rate-limit";

/** Exchanges a time-limited link token for a short-lived signed cookie, then strips the token from the URL. */
export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("ref") ?? "";
  const t = req.nextUrl.searchParams.get("t") ?? "";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!(await rateLimit(`link:${ip}`, 30, 600))) return new NextResponse("Too many attempts", { status: 429 });
  const b = await bookingByTokenLink(ref, t);
  if (!b) return NextResponse.redirect(new URL("/manage-booking?invalid=1", req.url));
  await grantBookingAccess(b.id);
  return NextResponse.redirect(new URL(`/manage-booking/${b.reference}`, req.url));
}
