import { and, asc, eq, gte, lte } from "drizzle-orm";
import { ActionButton, AForm, CB, F } from "@/components/admin/forms";
import { Money, PageHeader, Panel, Table, Td, Unconfirmed } from "@/components/admin/ui";
import { db } from "@/db";
import { dateRates, rateRules, roomTypes } from "@/db/schema";
import { loadRateContexts, resolveNight } from "@/domain/pricing";
import { getSettings } from "@/domain/settings";
import { addDays, eachNight, formatDate, todayInTz } from "@/lib/dates";
import { paiseToRupeeInput } from "@/lib/money";
import { requireStaffPage } from "@/lib/staff";
import { dateOverrideAction, rateRuleAction, saveRatesAction } from "../../actions";

export const metadata = { title: "Rates" };
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function Rates() {
  await requireStaffPage("rates.manage");
  const s = await getSettings();
  const today = todayInTz(s.timezone);
  const types = await db.select().from(roomTypes).orderBy(asc(roomTypes.sortOrder));
  const rules = await db.select().from(rateRules).where(and(eq(rateRules.active, true), gte(rateRules.endDate, today))).orderBy(asc(rateRules.startDate));
  const overrides = await db.select().from(dateRates).where(and(gte(dateRates.night, today), lte(dateRates.night, addDays(today, 120)))).orderBy(asc(dateRates.night));
  const horizon = addDays(today, 14);
  const ctxs = await loadRateContexts(types.map((t) => t.id), today, horizon);
  const nights = eachNight(today, horizon);
  return (
    <>
      <PageHeader title="Rates & rules" subtitle="Precedence: date override › seasonal rule (highest priority) › weekend rate › base rate. Edits never change existing bookings (price snapshots)." />
      <Panel title="Next 14 nights (resolved)" className="mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr><th className="p-1 text-left">Category</th>{nights.map((n) => <th key={n} className="p-1 font-normal">{formatDate(n, { weekday: "short", day: "numeric" })}</th>)}</tr></thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.id} className="border-t border-sand">
                  <th scope="row" className="p-1 text-left font-medium">{t.name}</th>
                  {nights.map((n) => {
                    const r = resolveNight(ctxs.get(t.id)!, n);
                    return <td key={n} className={`p-1 text-center ${r.closed ? "bg-stone-300" : ""}`} title={r.source}>{r.closed ? "closed" : r.ratePaise == null ? "—" : `₹${(r.ratePaise / 100).toLocaleString("en-IN")}`}{r.minStay ? <span className="block text-[10px] text-muted">min {r.minStay}</span> : null}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="grid gap-6 xl:grid-cols-2">
        {types.map((t) => (
          <Panel key={t.id} title={`${t.name} — standard rates`} actions={t.ratesAreSample ? <Unconfirmed show>Sample rates</Unconfirmed> : null}>
            <AForm action={saveRatesAction} hidden={{ roomTypeId: t.id }} submit="Save rates">
              <div className="grid gap-3 sm:grid-cols-3">
                <F label="Base nightly rate (₹)" name="baseRate" defaultValue={paiseToRupeeInput(t.baseRatePaise)} inputMode="decimal" hint="Blank = not bookable online" />
                <F label="Weekend rate (₹)" name="weekendRate" defaultValue={paiseToRupeeInput(t.weekendRatePaise)} inputMode="decimal" />
                <F label="Minimum stay (nights)" name="minStay" type="number" min={1} defaultValue={t.minStayNights} />
                <F label={`Extra adult / night (₹) above ${t.baseOccupancy}`} name="extraAdult" defaultValue={paiseToRupeeInput(t.extraAdultPaise)} inputMode="decimal" />
                <F label="Extra child / night (₹)" name="extraChild" defaultValue={paiseToRupeeInput(t.extraChildPaise)} inputMode="decimal" />
              </div>
              <fieldset><legend className="field-label">Weekend nights</legend><div className="flex gap-3">{DOW.map((d, i) => <label key={d} className="flex items-center gap-1 text-sm"><input type="checkbox" name="weekendDays" value={i} defaultChecked={t.weekendDays.includes(i)} />{d}</label>)}</div></fieldset>
              <CB label="These rates are approved by Room2Go (not sample values)" name="ratesApproved" defaultChecked={!t.ratesAreSample} />
            </AForm>
          </Panel>
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Seasonal / day-of-week rules">
          <Table head={["Category", "Name", "Dates", "Days", "Rate", "Min", "Prio", ""]} empty="No active rules.">
            {rules.map((r) => (
              <tr key={r.id}>
                <Td>{types.find((t) => t.id === r.roomTypeId)?.name}</Td><Td>{r.name}</Td><Td>{formatDate(r.startDate)}–{formatDate(r.endDate)}</Td>
                <Td>{r.daysOfWeek?.map((d) => DOW[d]).join(" ") ?? "All"}</Td><Td><Money paise={r.ratePaise} /></Td><Td>{r.minStayNights ?? "—"}</Td><Td>{r.priority}</Td>
                <Td><ActionButton action={rateRuleAction} hidden={{ op: "deactivate", id: r.id }} label="Remove" /></Td>
              </tr>
            ))}
          </Table>
          <div className="mt-4 border-t border-sand pt-4">
            <AForm action={rateRuleAction} submit="Add rule">
              <div className="grid gap-3 sm:grid-cols-3">
                <label><span className="field-label">Category</span><select name="roomTypeId" className="field">{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
                <F label="Name" name="name" required />
                <F label="Rate (₹/night)" name="rate" required inputMode="decimal" />
                <F label="From" name="startDate" type="date" required />
                <F label="To (inclusive)" name="endDate" type="date" required />
                <F label="Min stay" name="minStay" type="number" min={1} />
                <F label="Priority" name="priority" type="number" defaultValue={0} />
              </div>
              <fieldset><legend className="field-label">Only on (optional)</legend><div className="flex gap-3">{DOW.map((d, i) => <label key={d} className="flex items-center gap-1 text-sm"><input type="checkbox" name="days" value={i} />{d}</label>)}</div></fieldset>
            </AForm>
          </div>
        </Panel>
        <Panel title="Date overrides, closures & minimum stays">
          <AForm action={dateOverrideAction} submit="Apply to dates">
            <fieldset><legend className="field-label">Categories</legend><div className="flex flex-wrap gap-3">{types.map((t) => <label key={t.id} className="flex items-center gap-1 text-sm"><input type="checkbox" name="roomTypeId" value={t.id} defaultChecked />{t.name}</label>)}</div></fieldset>
            <div className="grid gap-3 sm:grid-cols-4">
              <F label="From" name="from" type="date" required />
              <F label="To (inclusive)" name="to" type="date" required />
              <F label="Rate (₹) — blank keeps rules" name="rate" inputMode="decimal" />
              <F label="Min stay (arrival)" name="minStay" type="number" min={1} />
            </div>
            <div className="flex gap-4"><CB label="Closed (no stays)" name="closed" /><CB label="Closed to arrival" name="cta" /></div>
            <label className="flex items-center gap-2 text-xs"><input type="radio" name="op" value="set" defaultChecked /> Set</label>
            <label className="flex items-center gap-2 text-xs"><input type="radio" name="op" value="clear" /> Clear overrides in range</label>
          </AForm>
          <div className="mt-4 max-h-64 overflow-y-auto text-xs">
            <ul className="divide-y divide-sand">{overrides.map((o) => <li key={`${o.roomTypeId}${o.night}`} className="flex justify-between py-1"><span>{formatDate(o.night)} · {types.find((t) => t.id === o.roomTypeId)?.name}</span><span>{o.closed ? "CLOSED " : ""}{o.closedToArrival ? "CTA " : ""}{o.ratePaise != null ? `₹${o.ratePaise / 100}` : ""}{o.minStayNights ? ` min ${o.minStayNights}` : ""}</span></li>)}</ul>
          </div>
        </Panel>
      </div>
    </>
  );
}
