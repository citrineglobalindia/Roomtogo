import Link from "next/link";
import { desc } from "drizzle-orm";
import { reservationFilters, SOURCES, STATUSES } from "@/lib/admin-queries";
import { Badge, Money, PageHeader, Table, Td } from "@/components/admin/ui";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { formatDate } from "@/lib/dates";
import { requireStaffPage } from "@/lib/staff";

export const metadata = { title: "Reservations" };
export default async function Reservations({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaffPage("bookings.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const rows = await db.select().from(bookings).where(reservationFilters(sp)).orderBy(desc(bookings.checkIn), desc(bookings.createdAt)).limit(50).offset((page - 1) * 50);
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]).toString();
  return (
    <>
      <PageHeader title="Reservations" actions={<><Link href={`/api/admin/reservations.csv?${qs}`} className="btn-outline btn-sm">Export CSV</Link><Link href="/admin/reservations/new" className="btn-primary btn-sm">New reservation</Link></>} />
      <form className="mb-4 grid gap-2 rounded-lg border border-sand bg-white p-3 sm:grid-cols-6" role="search">
        <input name="q" defaultValue={sp.q} placeholder="Reference, name, email, phone" aria-label="Search" className="field sm:col-span-2" />
        <select name="status" defaultValue={sp.status ?? ""} aria-label="Status" className="field"><option value="">Any status</option>{STATUSES.map((x) => <option key={x} value={x}>{x.replace("_", " ")}</option>)}</select>
        <select name="source" defaultValue={sp.source ?? ""} aria-label="Source" className="field"><option value="">Any source</option>{SOURCES.map((x) => <option key={x} value={x}>{x.replace("_", " ")}</option>)}</select>
        <input type="date" name="from" defaultValue={sp.from} aria-label="Arrival from" className="field" />
        <input type="date" name="to" defaultValue={sp.to} aria-label="Arrival to" className="field" />
        <label className="flex items-center gap-2 text-xs sm:col-span-2"><input type="checkbox" name="requests" value="1" defaultChecked={!!sp.requests} /> Only with pending guest requests</label>
        <label className="flex items-center gap-2 text-xs sm:col-span-2"><input type="checkbox" name="showExpired" value="1" defaultChecked={!!sp.showExpired} /> Include expired holds</label>
        <button className="btn-primary btn-sm sm:col-span-2">Filter</button>
      </form>
      <Table head={["Reference", "Guest", "Arrival", "Departure", "Rooms", "Source", "Status", "Payment", "Total"]} empty="No reservations match.">
        {rows.map((b) => (
          <tr key={b.id} className="hover:bg-cream-100">
            <Td><Link href={`/admin/reservations/${b.id}`} className="font-medium text-forest-800 underline">{b.reference}</Link>{b.isDemo && <span className="ml-1 text-[10px] text-gold-700">DEMO</span>}</Td>
            <Td>{b.leadName}<span className="block text-xs text-muted">{b.leadPhone}</span></Td>
            <Td>{formatDate(b.checkIn)}</Td>
            <Td>{formatDate(b.checkOut)}</Td>
            <Td>{b.roomsCount}</Td>
            <Td className="capitalize">{b.source.replace("_", " ")}</Td>
            <Td><Badge value={b.status} /></Td>
            <Td><Badge value={b.paymentStatus} /></Td>
            <Td><Money paise={b.totalPaise} /></Td>
          </tr>
        ))}
      </Table>
      <div className="mt-3 flex gap-2 text-sm">
        {page > 1 && <Link className="underline" href={`?${qs}&page=${page - 1}`}>← Previous</Link>}
        {rows.length === 50 && <Link className="underline" href={`?${qs}&page=${page + 1}`}>Next →</Link>}
      </div>
    </>
  );
}
