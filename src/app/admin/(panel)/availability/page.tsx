import Link from "next/link";
import { and, asc, desc, eq, gte, isNull } from "drizzle-orm";
import { ActionButton, AForm, F, S } from "@/components/admin/forms";
import { Badge, PageHeader, Panel, Table, Td } from "@/components/admin/ui";
import { db } from "@/db";
import { availabilityBlocks, inventoryHolds, bookings, roomUnits } from "@/db/schema";
import { getSettings } from "@/domain/settings";
import { formatDate, formatDateTime, nowMs, todayInTz } from "@/lib/dates";
import { requireStaffPage } from "@/lib/staff";
import { blockAction } from "../../actions";

export const metadata = { title: "Availability" };

export default async function Availability() {
  await requireStaffPage("availability.manage");
  const s = await getSettings();
  const now = nowMs();
  const today = todayInTz(s.timezone);
  const units = await db.select().from(roomUnits).where(eq(roomUnits.status, "active")).orderBy(asc(roomUnits.sortOrder));
  const blocks = await db.select({ b: availabilityBlocks, u: roomUnits }).from(availabilityBlocks).innerJoin(roomUnits, eq(roomUnits.id, availabilityBlocks.unitId)).where(and(isNull(availabilityBlocks.releasedAt), gte(availabilityBlocks.endDate, today))).orderBy(asc(availabilityBlocks.startDate));
  const holds = await db.select({ h: inventoryHolds, b: bookings }).from(inventoryHolds).innerJoin(bookings, eq(bookings.id, inventoryHolds.bookingId)).where(eq(inventoryHolds.status, "active")).orderBy(desc(inventoryHolds.createdAt));
  return (
    <>
      <PageHeader title="Availability & blocks" subtitle="Blocks use the same conflict protection as bookings: they never overwrite an active reservation." />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Panel title="Block units">
          <AForm action={blockAction} submit="Create block">
            <fieldset><legend className="field-label">Units</legend><div className="flex flex-wrap gap-3">{units.map((u) => <label key={u.id} className="flex items-center gap-1 text-sm"><input type="checkbox" name="unitId" value={u.id} />{u.label}</label>)}</div></fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="From (first blocked night)" name="startDate" type="date" required min={today} />
              <F label="Until (reopens on)" name="endDate" type="date" required min={today} />
            </div>
            <S label="Type" name="kind" options={[["maintenance", "Maintenance"], ["owner_use", "Owner use"], ["closure", "Closure"], ["external", "External booking (OTA/other channel)"]]} />
            <F label="Reason" name="reason" required />
          </AForm>
          <p className="mt-3 text-xs text-muted">Whole-category closures, minimum stays and closed-to-arrival are set as date overrides on <Link className="underline" href="/admin/rates">Rates</Link>.</p>
        </Panel>
        <div className="space-y-6">
          <Panel title="Current & upcoming blocks">
            <Table head={["Unit", "Dates", "Type", "Reason", ""]} empty="No blocks.">
              {blocks.map(({ b, u }) => (
                <tr key={b.id}>
                  <Td className="font-medium">{u.label}</Td>
                  <Td>{formatDate(b.startDate)} → {formatDate(b.endDate)}</Td>
                  <Td className="capitalize">{b.kind.replace("_", " ")}</Td>
                  <Td>{b.reason}</Td>
                  <Td><ActionButton action={blockAction} hidden={{ op: "release", blockId: b.id }} label="Release" confirm="Reopen these dates for sale?" /></Td>
                </tr>
              ))}
            </Table>
          </Panel>
          <Panel title="Active checkout holds">
            <Table head={["Booking", "Guest", "Stay", "Expires"]} empty="No active holds.">
              {holds.map(({ h, b }) => (
                <tr key={h.id}>
                  <Td><Link className="underline" href={`/admin/reservations/${b.id}`}>{b.reference}</Link></Td>
                  <Td>{b.leadName}</Td>
                  <Td>{formatDate(b.checkIn)} → {formatDate(b.checkOut)}</Td>
                  <Td>{h.expiresAt.getTime() < now ? <Badge value="expired" /> : formatDateTime(h.expiresAt)}</Td>
                </tr>
              ))}
            </Table>
            <p className="mt-2 text-xs text-muted">Holds last {s.holdMinutes} minutes (Settings). Expired holds are released automatically by the background job and inside every new allocation.</p>
          </Panel>
        </div>
      </div>
    </>
  );
}
