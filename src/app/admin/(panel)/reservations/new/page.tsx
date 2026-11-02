import { asc, eq } from "drizzle-orm";
import { ManualBookingForm } from "@/components/admin/manual-booking";
import { PageHeader } from "@/components/admin/ui";
import { db } from "@/db";
import { roomTypes, roomUnits } from "@/db/schema";
import { freeUnits } from "@/domain/inventory";
import { isIsoDate } from "@/lib/dates";
import { requireStaffPage } from "@/lib/staff";

export const metadata = { title: "New reservation" };

export default async function NewReservation({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireStaffPage("bookings.manage");
  const sp = await searchParams;
  const types = await db.select().from(roomTypes).where(eq(roomTypes.status, "active")).orderBy(asc(roomTypes.sortOrder));
  const units = await db.select().from(roomUnits).where(eq(roomUnits.status, "active")).orderBy(asc(roomUnits.sortOrder));
  const free = isIsoDate(sp.checkIn) && isIsoDate(sp.checkOut) && sp.checkOut > sp.checkIn ? new Set((await freeUnits({ checkIn: sp.checkIn, checkOut: sp.checkOut, directOnly: false })).map((u) => u.id)) : null;
  return (
    <>
      <PageHeader title="New reservation" subtitle="Phone, WhatsApp, walk-in, email or externally received bookings. External platforms are NOT synchronised automatically — enter OTA bookings here to protect inventory." />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-sand bg-white p-3 text-sm">
        <label><span className="field-label">Arrival</span><input className="field" type="date" name="checkIn" defaultValue={sp.checkIn} /></label>
        <label><span className="field-label">Departure</span><input className="field" type="date" name="checkOut" defaultValue={sp.checkOut} /></label>
        <button className="btn-outline btn-sm">Show free units</button>
        {free && <span className="text-muted">{free.size} unit(s) free for the whole stay.</span>}
      </form>
      <div className="rounded-lg border border-sand bg-white p-5">
        <ManualBookingForm types={types.map((t) => ({ id: t.id, name: t.name }))} units={units.map((u) => ({ id: u.id, label: u.label, roomTypeId: u.roomTypeId, free: free?.has(u.id) ?? false }))} defaults={sp} />
      </div>
    </>
  );
}
