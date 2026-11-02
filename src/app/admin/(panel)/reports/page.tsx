import Link from "next/link";
import { Money, PageHeader, Panel, Stat, Table, Td } from "@/components/admin/ui";
import { buildReport } from "@/domain/reports";
import { getSettings } from "@/domain/settings";
import { isDemoMode } from "@/lib/config";
import { addDays, isIsoDate, startOfMonth, todayInTz } from "@/lib/dates";
import { requireStaffPage } from "@/lib/staff";

export const metadata = { title: "Reports" };

export default async function Reports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; demo?: string }> }) {
  await requireStaffPage("reports.view");
  const sp = await searchParams;
  const s = await getSettings();
  const today = todayInTz(s.timezone);
  const from = isIsoDate(sp.from) ? sp.from! : startOfMonth(today);
  const toInclusive = isIsoDate(sp.to) ? sp.to! : addDays(today, 30);
  const includeDemo = sp.demo === "1" || (isDemoMode() && sp.demo !== "0");
  const r = await buildReport({ from, to: addDays(toInclusive, 1), tz: s.timezone, includeDemo });
  const qs = `from=${from}&to=${toInclusive}&demo=${includeDemo ? 1 : 0}`;
  return (
    <>
      <PageHeader title="Reports" subtitle={`${from} to ${toInclusive} (inclusive, ${s.timezone})${includeDemo ? " · including DEMO bookings" : ""}`} actions={<Link href={`/api/admin/report.csv?${qs}`} className="btn-outline btn-sm">Export CSV</Link>} />
      <form className="mb-6 flex flex-wrap items-end gap-2 rounded-lg border border-sand bg-white p-3 text-sm">
        <label><span className="field-label">From</span><input type="date" name="from" defaultValue={from} className="field" /></label>
        <label><span className="field-label">To (inclusive)</span><input type="date" name="to" defaultValue={toInclusive} className="field" /></label>
        <label className="flex items-center gap-2"><input type="checkbox" name="demo" value="1" defaultChecked={includeDemo} /> Include demo bookings</label>
        <button className="btn-primary btn-sm">Run</button>
      </form>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Occupancy" value={`${r.occupancy.occupancyPct}%`} hint={`${r.occupancy.soldUnitNights} sold of ${r.occupancy.sellableUnitNights} sellable unit-nights (${r.occupancy.blockedUnitNights} blocked excluded)`} />
        <Stat label="Stay revenue (accrual, excl. tax)" value={<Money paise={r.stayRevenuePaise} />} hint={`Adjustments in range: ₹${(r.adjustmentsPaise / 100).toLocaleString("en-IN")}`} />
        <Stat label="Money collected" value={<Money paise={r.collectedPaise} />} hint={`Refunds ₹${(r.refundsPaise / 100).toLocaleString("en-IN")} · net ₹${(r.netCollectedPaise / 100).toLocaleString("en-IN")}`} />
        <Stat label="Outstanding balances (now)" value={<Money paise={r.outstandingBalancesPaise} />} hint={`${r.outstandingBookings} booking(s) · pending refunds ₹${(r.pendingRefundsPaise / 100).toLocaleString("en-IN")}`} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Collections by channel">
          <Table head={["Channel", "Method", "Payments", "Amount"]} empty="No payments in range.">{r.collections.map((c, i) => <tr key={i}><Td className="capitalize">{c.channel}</Td><Td>{c.method}</Td><Td>{c.n}</Td><Td><Money paise={c.amount} /></Td></tr>)}</Table>
        </Panel>
        <Panel title="Bookings by source (created in range)">
          <Table head={["Source", "Bookings", "Value"]} empty="No bookings.">{r.sources.map((x) => <tr key={x.source}><Td className="capitalize">{x.source.replace("_", " ")}</Td><Td>{x.n}</Td><Td><Money paise={x.value} /></Td></tr>)}</Table>
          <p className="mt-3 text-sm">Cancellations in range: {r.cancellations.count} (value <Money paise={r.cancellations.valuePaise} />) · No-show nights: {r.occupancy.noShowNights}</p>
        </Panel>
      </div>
      <Panel title="Definitions" className="mt-6">
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
          <li>Sellable unit-nights = active units × nights, minus maintenance / owner-use / closure blocks. External-booking blocks count as sold.</li>
          <li>Stay revenue = nightly rate + extra-guest amounts for nights in range, for confirmed, checked-in and checked-out bookings (no-shows excluded). Taxes are not revenue.</li>
          <li>Collections = captured payments received in range (gateway verified + staff-recorded offline). Refunds = provider-confirmed refunds completed in range.</li>
          <li>Outstanding balances are calculated as of now for confirmed, in-house, departed and no-show bookings.</li>
        </ul>
      </Panel>
    </>
  );
}
