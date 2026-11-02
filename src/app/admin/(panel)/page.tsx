import Link from "next/link";
import { and, asc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { Badge, Money, PageHeader, Panel, Stat, Table, Td } from "@/components/admin/ui";
import { Notice } from "@/components/site/sections";
import { db } from "@/db";
import { bookingRequests, bookings, contentBlocks, enquiries, inventoryHolds, mediaAssets, paymentExceptions, paymentTransactions, reviews, roomUnits, unitNights } from "@/db/schema";
import { getSettings, setupChecklist } from "@/domain/settings";
import { addDays, formatDate, todayInTz } from "@/lib/dates";
import { requireStaffPage } from "@/lib/staff";

export const metadata = { title: "Overview" };
const n = sql<number>`count(*)::int`;

export default async function Overview({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const st = await requireStaffPage();
  const { denied } = await searchParams;
  const s = await getSettings();
  const today = todayInTz(s.timezone);
  if (!st.can("bookings.view")) {
    const [[pending], [drafts], [media]] = await Promise.all([
      db.select({ n }).from(reviews).where(eq(reviews.status, "pending")),
      db.select({ n }).from(contentBlocks).where(sql`${contentBlocks.published} IS DISTINCT FROM ${contentBlocks.draft}`),
      db.select({ n }).from(mediaAssets).where(eq(mediaAssets.status, "draft")),
    ]);
    return (
      <>
        <PageHeader title={`Hello, ${st.name}`} subtitle="Content editor workspace" />
        {denied && <Notice tone="warn">You don’t have permission for that page.</Notice>}
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Stat label="Reviews awaiting moderation" value={pending.n} href="/admin/reviews" />
          <Stat label="Content blocks with unpublished drafts" value={drafts.n} href="/admin/content" />
          <Stat label="Draft photos" value={media.n} href="/admin/content/media" />
        </div>
      </>
    );
  }
  const active = ["confirmed", "checked_in"] as const;
  const [arrivals, departures, inHouse, [units], [occTonight], [blockedTonight], [holds], upcoming, [ex], [reqs], [newEnq]] = await Promise.all([
    db.select().from(bookings).where(and(eq(bookings.checkIn, today), inArray(bookings.status, ["confirmed", "checked_in"]))).orderBy(asc(bookings.leadName)),
    db.select().from(bookings).where(and(eq(bookings.checkOut, today), inArray(bookings.status, ["checked_in", "confirmed"]))),
    db.select({ n }).from(bookings).where(eq(bookings.status, "checked_in")),
    db.select({ n }).from(roomUnits).where(eq(roomUnits.status, "active")),
    db.select({ n }).from(unitNights).where(and(eq(unitNights.night, today), eq(unitNights.kind, "booking"))),
    db.select({ n }).from(unitNights).where(and(eq(unitNights.night, today), eq(unitNights.kind, "block"))),
    db.select({ n }).from(inventoryHolds).where(and(eq(inventoryHolds.status, "active"), gte(inventoryHolds.expiresAt, new Date()))),
    db.select().from(bookings).where(and(gte(bookings.checkIn, today), lte(bookings.checkIn, addDays(today, 7)), inArray(bookings.status, [...active]))).orderBy(asc(bookings.checkIn)).limit(15),
    db.select({ n }).from(paymentExceptions).where(eq(paymentExceptions.status, "open")),
    db.select({ n }).from(bookingRequests).where(eq(bookingRequests.status, "requested")),
    db.select({ n }).from(enquiries).where(eq(enquiries.status, "new")),
  ]);
  let money: { today: number; month: number; outstanding: number } | null = null;
  if (st.can("payments.view")) {
    const tz = s.timezone;
    const sum = async (from: string, to: string) =>
      (await db.select({ v: sql<number>`coalesce(sum(${paymentTransactions.amountPaise}),0)::bigint` }).from(paymentTransactions).where(and(eq(paymentTransactions.status, "captured"), gte(paymentTransactions.receivedAt, sql`(${from}::date)::timestamp AT TIME ZONE ${tz}`), lt(paymentTransactions.receivedAt, sql`(${to}::date)::timestamp AT TIME ZONE ${tz}`))))[0].v;
    const [out] = await db.select({ v: sql<number>`coalesce(sum(${bookings.totalPaise} - (${bookings.amountPaidPaise} - ${bookings.amountRefundedPaise})),0)::bigint` }).from(bookings).where(and(inArray(bookings.status, ["confirmed", "checked_in", "checked_out", "no_show"]), sql`${bookings.totalPaise} > ${bookings.amountPaidPaise} - ${bookings.amountRefundedPaise}`));
    money = { today: Number(await sum(today, addDays(today, 1))), month: Number(await sum(today.slice(0, 8) + "01", addDays(today, 1))), outstanding: Number(out.v) };
  }
  const checklist = st.can("settings.manage") ? await setupChecklist() : [];
  const blockingOpen = checklist.filter((i) => i.blocking && !i.done);
  const sellable = units.n - blockedTonight.n;
  return (
    <>
      <PageHeader title="Overview" subtitle={formatDate(today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} actions={st.can("bookings.manage") ? <Link href="/admin/reservations/new" className="btn-primary btn-sm">New reservation</Link> : null} />
      {denied && <div className="mb-4"><Notice tone="warn">You don’t have permission for that page or action.</Notice></div>}
      {blockingOpen.length > 0 && (
        <div className="mb-6 rounded-lg border border-gold-500 bg-gold-100/60 p-4 text-sm">
          <p className="font-semibold text-gold-700">Live booking is not ready: {blockingOpen.length} required setup item(s) open.</p>
          <p className="mt-1 text-gold-700">{blockingOpen.slice(0, 4).map((i) => i.label).join(" · ")}{blockingOpen.length > 4 ? " …" : ""}</p>
          <Link href="/admin/settings" className="mt-2 inline-block font-medium underline">Open setup checklist</Link>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Arrivals today" value={arrivals.length} />
        <Stat label="Departures today" value={departures.length} />
        <Stat label="Occupied tonight" value={`${occTonight.n} / ${sellable}`} hint={`${Math.max(0, sellable - occTonight.n)} available · ${blockedTonight.n} blocked · ${inHouse[0].n} checked in`} href="/admin/calendar" />
        <Stat label="Active checkout holds" value={holds.n} hint="Guests currently paying" />
        <Stat label="Payment exceptions" value={ex.n} tone={ex.n ? "warn" : undefined} href="/admin/payments" hint="Paid bookings needing attention" />
        <Stat label="Guest requests" value={reqs.n} tone={reqs.n ? "warn" : undefined} href="/admin/reservations?requests=1" />
        <Stat label="New enquiries" value={newEnq.n} href="/admin/enquiries" />
        {money && <Stat label="Collected today" value={<Money paise={money.today} />} hint={`This month: ₹${(money.month / 100).toLocaleString("en-IN")} · Outstanding balances: ₹${(money.outstanding / 100).toLocaleString("en-IN")}`} href="/admin/reports" />}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Arrivals today">
          <List rows={arrivals} empty="No arrivals today." />
        </Panel>
        <Panel title="Departures today">
          <List rows={departures} empty="No departures today." />
        </Panel>
      </div>
      <div className="mt-6">
        <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wider text-forest-800">Upcoming 7 days</h2>
        <Table head={["Ref", "Guest", "Stay", "Status", "Payment", "Total"]} empty="No upcoming stays.">
          {upcoming.map((b) => (
            <tr key={b.id}>
              <Td><Link className="font-medium text-forest-800 underline" href={`/admin/reservations/${b.id}`}>{b.reference}</Link></Td>
              <Td>{b.leadName}</Td>
              <Td>{formatDate(b.checkIn)} → {formatDate(b.checkOut)}</Td>
              <Td><Badge value={b.status} /></Td>
              <Td><Badge value={b.paymentStatus} /></Td>
              <Td><Money paise={b.totalPaise} /></Td>
            </tr>
          ))}
        </Table>
      </div>
    </>
  );
}

function List({ rows, empty }: { rows: (typeof bookings.$inferSelect)[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-sand text-sm">
      {rows.map((b) => (
        <li key={b.id} className="flex items-center justify-between py-2">
          <Link href={`/admin/reservations/${b.id}`} className="text-forest-800 underline">{b.leadName} · {b.reference}</Link>
          <span className="flex gap-2"><Badge value={b.status} /><Badge value={b.paymentStatus} /></span>
        </li>
      ))}
    </ul>
  );
}
