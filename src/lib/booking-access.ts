import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { accessibleBookingId } from "@/domain/guest-access";
import { getSession, getStaff } from "./staff";

export type AccessVia = "guest_link" | "account" | "staff";

/**
 * Authorise access to a booking by reference. Allowed only for:
 *  - the browser holding a signed access cookie for THIS booking id (link token / OTP / checkout), or
 *  - the signed-in guest account that owns the booking (email verified), or
 *  - staff with bookings.view.
 * Guessing or changing the reference in the URL reveals nothing.
 */
export async function bookingForViewer(reference: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.reference, reference.trim().toUpperCase()));
  if (!b) return null;
  if ((await accessibleBookingId()) === b.id) return { booking: b, via: "guest_link" as AccessVia };
  const session = await getSession();
  if (session?.user && session.user.emailVerified && b.userId === session.user.id) return { booking: b, via: "account" as AccessVia };
  const staff = await getStaff();
  if (staff?.can("bookings.view")) return { booking: b, via: "staff" as AccessVia };
  return null;
}
