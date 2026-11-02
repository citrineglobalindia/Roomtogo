import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/admin/ui";
import { db } from "@/db";
import { roomTypes, roomUnits } from "@/db/schema";
import { calendarOccupancy } from "@/domain/inventory";
import { getSettings } from "@/domain/settings";
import { addDays, dayOfWeek, endOfMonthExclusive, formatDate, isIsoDate, nowMs, startOfMonth, todayInTz } from "@/lib/dates";
import { requireStaffPage } from "@/lib/staff";

export const metadata = { title: "Calendar" };

const CELL: Record<string, string> = {
  confirmed: "bg-forest-700 text-white",
  checked_in: "bg-sky-700 text-white",
  checked_out: "bg-stone-400 text-white",
  no_show: "bg-red-300 text-red-950",
  pending_payment: "bg-gold-300 text-forest-950",
  hold_expired: "bg-stone-200 text-stone-500 line-through",
  maintenance: "bg-[repeating-linear-gradient(45deg,#e7d9bf,#e7d9bf_4px,#f6ead3_4px,#f6ead3_8px)] text-gold-700",
  owner_use: "bg-purple-200 text-purple-900",
  closure: "bg-stone-500 text-white",
  external: "bg-orange-200 text-orange-900",
};

export default async function Calendar({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  await requireStaffPage("calendar.view");
  const sp = await searchParams;
  const s = await getSettings();
  const today = todayInTz(s.timezone);
  const view = sp.view === "day" ? "day" : sp.view === "month" ? "month" : "week";
  const anchor = isIsoDate(sp.date) ? sp.date! : today;
  const from = view === "month" ? startOfMonth(anchor) : view === "week" ? addDays(anchor, -((dayOfWeek(anchor) + 6) % 7)) : anchor;
  const to = view === "month" ? endOfMonthExclusive(anchor) : view === "week" ? addDays(from, 7) : addDays(from, 1);
  const prev = view === "month" ? startOfMonth(addDays(from, -1)) : addDays(from, view === "week" ? -7 : -1);
  const next = view === "month" ? to : addDays(from, view === "week" ? 7 : 1);
  const days: string[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) days.push(d);
  const units = await db.select({ u: roomUnits, t: roomTypes }).from(roomUnits).innerJoin(roomTypes, eq(roomTypes.id, roomUnits.roomTypeId)).orderBy(asc(roomTypes.sortOrder), asc(roomUnits.sortOrder));
  const occ = await calendarOccupancy(from, to);
  const key = (u: string, d: string) => `${u}|${d}`;
  const map = new Map(occ.map((o) => [key(o.unit_id, o.night), o]));
  const now = nowMs();
  const link = (v: string, d: string) => `/admin/calendar?view=${v}&date=${d}`;
  return (
    <>
      <PageHeader title="Reservation calendar" subtitle={`${formatDate(from)} – ${formatDate(addDays(to, -1))} · property time (${s.timezone})`} />
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <nav aria-label="Calendar view" className="flex overflow-hidden rounded-md border border-sand bg-white">
          {(["day", "week", "month"] as const).map((v) => <Link key={v} href={link(v, anchor)} aria-current={view === v ? "page" : undefined} className={`px-3 py-1.5 capitalize ${view === v ? "bg-forest-800 text-white" : ""}`}>{v}</Link>)}
        </nav>
        <Link className="btn-outline btn-sm" href={link(view, prev)} aria-label="Previous period">←</Link>
        <Link className="btn-outline btn-sm" href={link(view, today)}>Today</Link>
        <Link className="btn-outline btn-sm" href={link(view, next)} aria-label="Next period">→</Link>
        <form className="flex items-center gap-1"><input type="hidden" name="view" value={view} /><input type="date" name="date" defaultValue={anchor} className="field py-1.5" aria-label="Go to date" /><button className="btn-outline btn-sm">Go</button></form>
      </div>
      <ul className="mb-3 flex flex-wrap gap-3 text-xs" aria-label="Legend">
        {[["confirmed", "Confirmed"], ["checked_in", "Checked in"], ["checked_out", "Checked out"], ["pending_payment", "Checkout hold (unpaid)"], ["hold_expired", "Expired hold (free)"], ["no_show", "No-show"], ["maintenance", "Maintenance"], ["owner_use", "Owner use"], ["closure", "Closure"], ["external", "External booking block"]].map(([k, l]) => (
          <li key={k} className="flex items-center gap-1.5"><span className={`inline-block h-3 w-5 rounded ${CELL[k]}`} /> {l}</li>
        ))}
      </ul>
      <div className="overflow-x-auto rounded-lg border border-sand bg-white">
        <table className="w-full border-collapse text-xs">
          <caption className="sr-only">Occupancy by unit and night</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 min-w-[150px] bg-cream-100 px-3 py-2 text-left">Unit</th>
              {days.map((d) => (
                <th key={d} scope="col" className={`min-w-[44px] px-1 py-2 font-normal ${d === today ? "bg-gold-100 font-semibold" : "bg-cream-100"} ${[0, 6].includes(dayOfWeek(d)) ? "text-gold-700" : ""}`}>
                  <span className="block">{formatDate(d, { weekday: "short" })}</span>{formatDate(d, { day: "numeric", month: view === "month" ? undefined : "short" })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {units.map(({ u, t }) => (
              <tr key={u.id} className="border-t border-sand">
                <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-1.5 text-left font-medium">
                  {u.label} <span className="block font-normal text-muted">{t.name}{u.status === "inactive" ? " · inactive" : ""}{!u.directSale ? " · not sold online" : ""}</span>
                </th>
                {days.map((d) => {
                  const o = map.get(key(u.id, d));
                  if (!o) return <td key={d} className="border-l border-sand/60" aria-label={`${u.label} ${d} free`} />;
                  if (o.kind === "block") return <td key={d} className={`border-l border-white px-1 text-center ${CELL[o.block_kind ?? "maintenance"]}`} title={`${o.block_kind}: ${o.block_reason}`}><span className="sr-only">{o.block_kind} block</span>▧</td>;
                  const expired = o.status === "pending_payment" && o.hold_expires_at && new Date(o.hold_expires_at).getTime() < now;
                  const cls = expired ? CELL.hold_expired : CELL[o.status ?? "confirmed"];
                  const startsHere = !map.get(key(u.id, addDays(d, -1)))?.booking_id || map.get(key(u.id, addDays(d, -1)))?.booking_id !== o.booking_id || d === from;
                  return (
                    <td key={d} className={`border-l border-white px-0.5 ${cls}`}>
                      <Link href={`/admin/reservations/${o.booking_id}`} className="block truncate py-1.5" title={`${o.reference} · ${o.lead_name} · ${o.status}`} aria-label={`${u.label} ${d}: ${o.reference} ${o.lead_name} (${o.status})`}>
                        {startsHere ? o.lead_name?.split(" ")[0] : " "}
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
