/**
 * Report definitions (all date ranges are property-local dates, [from, to) — `to` exclusive):
 *
 * - Sellable unit-nights: active units × nights in range, MINUS nights blocked for maintenance,
 *   owner use or closure. ("external" blocks = reservations received elsewhere → counted as sold.)
 * - Sold unit-nights: booking nights of confirmed / checked-in / checked-out bookings + external blocks.
 *   no_show nights are reported separately and are not counted as sold.
 * - Occupancy % = sold / sellable.
 * - Stay revenue (accrual, excl. tax): nightly rate + extra-guest snapshot for nights in range, same statuses.
 *   Staff adjustments are reported separately (they are not per-night).
 * - Collections (cash basis): captured payments whose received_at falls in range, gateway vs offline.
 * - Refunds: refunds with status succeeded whose completed_at falls in range.
 * - Outstanding balances (as of now): total − (paid − refunded) for confirmed / checked-in / checked-out / no-show.
 * - Cancellations: bookings cancelled in range (count, value).
 * - Sources: bookings created in range by source (excluding expired holds).
 * Demo bookings are excluded unless includeDemo is true.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { diffDays } from "@/lib/dates";

export type ReportInput = { from: string; to: string; tz: string; includeDemo: boolean };

export async function buildReport({ from, to, tz, includeDemo }: ReportInput) {
  const demo = includeDemo ? sql`TRUE` : sql`b.is_demo = FALSE`;
  const nights = diffDays(from, to);
  const q = async <T,>(s: ReturnType<typeof sql>) => (await db.execute(s)).rows as T[];

  const [units] = await q<{ n: number }>(sql`SELECT count(*)::int AS n FROM room_units WHERE status = 'active'`);
  const [blocked] = await q<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM unit_nights un JOIN availability_blocks ab ON ab.id = un.block_id
    WHERE un.night >= ${from} AND un.night < ${to} AND ab.kind IN ('maintenance','owner_use','closure')`);
  const [external] = await q<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM unit_nights un JOIN availability_blocks ab ON ab.id = un.block_id
    WHERE un.night >= ${from} AND un.night < ${to} AND ab.kind = 'external'`);
  const [sold] = await q<{ n: number; revenue: number }>(sql`
    SELECT count(*)::int AS n, coalesce(sum(bn.rate_paise + bn.extra_guest_paise),0)::bigint AS revenue
    FROM booking_nights bn JOIN booking_units bu ON bu.id = bn.booking_unit_id JOIN bookings b ON b.id = bu.booking_id
    WHERE bn.night >= ${from} AND bn.night < ${to} AND b.status IN ('confirmed','checked_in','checked_out') AND ${demo}`);
  const [noShow] = await q<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM booking_nights bn JOIN booking_units bu ON bu.id = bn.booking_unit_id JOIN bookings b ON b.id = bu.booking_id
    WHERE bn.night >= ${from} AND bn.night < ${to} AND b.status = 'no_show' AND ${demo}`);
  const startTs = sql`(${from}::date)::timestamp AT TIME ZONE ${tz}`;
  const endTs = sql`(${to}::date)::timestamp AT TIME ZONE ${tz}`;
  const collections = await q<{ channel: string; method: string | null; amount: number; n: number }>(sql`
    SELECT pt.channel, pt.method, coalesce(sum(pt.amount_paise),0)::bigint AS amount, count(*)::int AS n
    FROM payment_transactions pt JOIN bookings b ON b.id = pt.booking_id
    WHERE pt.status = 'captured' AND pt.received_at >= ${startTs} AND pt.received_at < ${endTs} AND ${demo}
    GROUP BY pt.channel, pt.method ORDER BY pt.channel, pt.method`);
  const [refundRow] = await q<{ amount: number; n: number }>(sql`
    SELECT coalesce(sum(r.amount_paise),0)::bigint AS amount, count(*)::int AS n FROM refunds r JOIN bookings b ON b.id = r.booking_id
    WHERE r.status = 'succeeded' AND r.completed_at >= ${startTs} AND r.completed_at < ${endTs} AND ${demo}`);
  const [pendingRefunds] = await q<{ amount: number; n: number }>(sql`
    SELECT coalesce(sum(r.amount_paise),0)::bigint AS amount, count(*)::int AS n FROM refunds r JOIN bookings b ON b.id = r.booking_id
    WHERE r.status IN ('requested','processing') AND ${demo}`);
  const [balances] = await q<{ amount: number; n: number }>(sql`
    SELECT coalesce(sum(b.total_paise - (b.amount_paid_paise - b.amount_refunded_paise)),0)::bigint AS amount, count(*)::int AS n
    FROM bookings b WHERE b.status IN ('confirmed','checked_in','checked_out','no_show')
      AND b.total_paise > (b.amount_paid_paise - b.amount_refunded_paise) AND ${demo}`);
  const [cancellations] = await q<{ n: number; value: number }>(sql`
    SELECT count(*)::int AS n, coalesce(sum(b.total_paise),0)::bigint AS value FROM bookings b
    WHERE b.status = 'cancelled' AND b.cancelled_at >= ${startTs} AND b.cancelled_at < ${endTs} AND ${demo}`);
  const sources = await q<{ source: string; n: number; value: number }>(sql`
    SELECT b.source, count(*)::int AS n, coalesce(sum(b.total_paise),0)::bigint AS value FROM bookings b
    WHERE b.created_at >= ${startTs} AND b.created_at < ${endTs} AND b.status <> 'expired' AND ${demo}
    GROUP BY b.source ORDER BY n DESC`);
  const [adjustments] = await q<{ amount: number }>(sql`
    SELECT coalesce(sum(a.amount_paise),0)::bigint AS amount FROM booking_adjustments a JOIN bookings b ON b.id = a.booking_id
    WHERE a.created_at >= ${startTs} AND a.created_at < ${endTs} AND ${demo}`);

  const sellable = units.n * nights - blocked.n;
  const soldN = sold.n + external.n;
  const collected = collections.reduce((s, c) => s + Number(c.amount), 0);
  return {
    range: { from, to, nights, tz },
    occupancy: { activeUnits: units.n, sellableUnitNights: sellable, blockedUnitNights: blocked.n, soldUnitNights: soldN, externalBlockNights: external.n, noShowNights: noShow.n, occupancyPct: sellable > 0 ? Math.round((soldN / sellable) * 1000) / 10 : 0 },
    stayRevenuePaise: Number(sold.revenue),
    adjustmentsPaise: Number(adjustments.amount),
    collections: collections.map((c) => ({ ...c, amount: Number(c.amount) })),
    collectedPaise: collected,
    refundsPaise: Number(refundRow.amount),
    refundsCount: refundRow.n,
    netCollectedPaise: collected - Number(refundRow.amount),
    pendingRefundsPaise: Number(pendingRefunds.amount),
    outstandingBalancesPaise: Number(balances.amount),
    outstandingBookings: balances.n,
    cancellations: { count: cancellations.n, valuePaise: Number(cancellations.value) },
    sources: sources.map((s) => ({ ...s, value: Number(s.value) })),
  };
}

export function reportToCsv(r: Awaited<ReturnType<typeof buildReport>>) {
  const rows: (string | number)[][] = [
    ["metric", "value", "notes"],
    ["range_from", r.range.from, "property-local date, inclusive"],
    ["range_to", r.range.to, "exclusive"],
    ["active_units", r.occupancy.activeUnits, ""],
    ["sellable_unit_nights", r.occupancy.sellableUnitNights, "excludes maintenance/owner/closure blocks"],
    ["sold_unit_nights", r.occupancy.soldUnitNights, "confirmed/checked-in/out + external blocks"],
    ["occupancy_pct", r.occupancy.occupancyPct, ""],
    ["no_show_nights", r.occupancy.noShowNights, ""],
    ["stay_revenue_inr", (r.stayRevenuePaise / 100).toFixed(2), "accrual, excl. tax"],
    ["adjustments_inr", (r.adjustmentsPaise / 100).toFixed(2), "staff adjustments created in range"],
    ...r.collections.map((c) => [`collected_${c.channel}_${c.method ?? "unknown"}_inr`, (c.amount / 100).toFixed(2), `${c.n} payment(s)`]),
    ["collected_total_inr", (r.collectedPaise / 100).toFixed(2), "cash basis"],
    ["refunds_succeeded_inr", (r.refundsPaise / 100).toFixed(2), `${r.refundsCount} refund(s)`],
    ["net_collected_inr", (r.netCollectedPaise / 100).toFixed(2), ""],
    ["refunds_pending_inr", (r.pendingRefundsPaise / 100).toFixed(2), "requested/processing (all time)"],
    ["outstanding_balances_inr", (r.outstandingBalancesPaise / 100).toFixed(2), `${r.outstandingBookings} booking(s), as of now`],
    ["cancellations_count", r.cancellations.count, ""],
    ["cancellations_value_inr", (r.cancellations.valuePaise / 100).toFixed(2), ""],
    ...r.sources.map((s) => [`bookings_source_${s.source}`, s.n, `value ${(s.value / 100).toFixed(2)}`]),
  ];
  return rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}
