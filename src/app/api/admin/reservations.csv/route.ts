import { NextResponse, type NextRequest } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { reservationFilters } from "@/lib/admin-queries";
import { audit } from "@/lib/audit";
import { getStaff } from "@/lib/staff";

/** Export of PERMITTED fields only (no internal notes, tokens or payment identifiers). */
export async function GET(req: NextRequest) {
  const st = await getStaff();
  if (!st?.can("bookings.view")) return new NextResponse("Forbidden", { status: 403 });
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const rows = await db.select().from(bookings).where(reservationFilters(sp)).orderBy(desc(bookings.checkIn)).limit(5000);
  const money = st.can("payments.view");
  const head = ["reference", "status", "payment_status", "source", "check_in", "check_out", "nights", "rooms", "adults", "children", "lead_name", "lead_email", "lead_phone", ...(money ? ["total_inr", "paid_inr", "refunded_inr"] : []), "created_at"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((b) =>
    [b.reference, b.status, b.paymentStatus, b.source, b.checkIn, b.checkOut, b.nights, b.roomsCount, b.adults, b.children, b.leadName, b.leadEmail, b.leadPhone, ...(money ? [(b.totalPaise / 100).toFixed(2), (b.amountPaidPaise / 100).toFixed(2), (b.amountRefundedPaise / 100).toFixed(2)] : []), b.createdAt.toISOString()].map(esc).join(","),
  );
  await audit(db, st.actor, "reservations.exported", "booking", null, null, { count: rows.length, filters: sp });
  return new NextResponse([head.join(","), ...lines].join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="reservations.csv"`, "cache-control": "no-store" } });
}
