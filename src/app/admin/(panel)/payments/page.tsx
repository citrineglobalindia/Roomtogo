import Link from "next/link";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { ActionButton, AForm, F } from "@/components/admin/forms";
import { Badge, Money, PageHeader, Panel, Table, Td } from "@/components/admin/ui";
import { db } from "@/db";
import { bookings, paymentExceptions, paymentOrders, paymentTransactions, refunds, staffMembers, user } from "@/db/schema";
import { paymentConfig } from "@/lib/config";
import { formatDateTime } from "@/lib/dates";
import { requireStaffPage } from "@/lib/staff";
import { paymentOpAction } from "../../actions";

export const metadata = { title: "Payments" };

export default async function Payments({ searchParams }: { searchParams: Promise<{ channel?: string }> }) {
  const st = await requireStaffPage("payments.view");
  const { channel } = await searchParams;
  const pay = paymentConfig();
  const [exceptions, txns, refundRows, openOrders, balances] = await Promise.all([
    db.select({ e: paymentExceptions, b: bookings }).from(paymentExceptions).innerJoin(bookings, eq(bookings.id, paymentExceptions.bookingId)).where(eq(paymentExceptions.status, "open")).orderBy(desc(paymentExceptions.createdAt)),
    db.select({ t: paymentTransactions, b: bookings, staff: user.name }).from(paymentTransactions).innerJoin(bookings, eq(bookings.id, paymentTransactions.bookingId)).leftJoin(staffMembers, eq(staffMembers.id, paymentTransactions.recordedByStaffId)).leftJoin(user, eq(user.id, staffMembers.userId)).where(channel === "gateway" || channel === "offline" ? eq(paymentTransactions.channel, channel) : undefined).orderBy(desc(paymentTransactions.receivedAt)).limit(100),
    db.select({ r: refunds, b: bookings }).from(refunds).innerJoin(bookings, eq(bookings.id, refunds.bookingId)).orderBy(desc(refunds.createdAt)).limit(50),
    db.select({ o: paymentOrders, b: bookings }).from(paymentOrders).innerJoin(bookings, eq(bookings.id, paymentOrders.bookingId)).where(and(inArray(paymentOrders.status, ["created", "attempted"]), gte(paymentOrders.createdAt, sql`now() - interval '3 days'`))).orderBy(desc(paymentOrders.createdAt)),
    db.select().from(bookings).where(and(inArray(bookings.status, ["confirmed", "checked_in", "checked_out", "no_show"]), sql`${bookings.totalPaise} > ${bookings.amountPaidPaise} - ${bookings.amountRefundedPaise}`)).orderBy(bookings.checkIn).limit(50),
  ]);
  return (
    <>
      <PageHeader title="Payments & refunds" subtitle={`Gateway: ${pay.provider === "none" ? `not configured — ${pay.reason}` : pay.provider === "demo" ? "DEMO (simulated, no money moves)" : `Razorpay (${pay.mode})`}`} actions={st.can("payments.reconcile") ? <ActionButton action={paymentOpAction} hidden={{ op: "reconcile", bookingId: "" }} label="Reconcile with gateway now" className="btn-primary btn-sm" /> : null} />
      <Panel title={`Open exceptions (${exceptions.length})`} className="mb-6">
        {exceptions.length === 0 ? <p className="text-sm text-muted">No open exceptions.</p> : (
          <ul className="space-y-3 text-sm">
            {exceptions.map(({ e, b }) => (
              <li key={e.id} className="rounded border border-red-200 bg-red-50 p-3">
                <p><strong className="capitalize">{e.kind.replace(/_/g, " ")}</strong> · <Link className="underline" href={`/admin/reservations/${b.id}`}>{b.reference}</Link> · {formatDateTime(e.createdAt)}</p>
                <p className="text-muted">{e.details}</p>
                {st.can("exceptions.resolve") && <AForm action={paymentOpAction} hidden={{ op: "resolve", exceptionId: e.id, bookingId: b.id }} submit="Mark resolved" className="mt-2 flex flex-wrap items-end gap-2"><F label="Resolution (e.g. refunded, moved to another unit)" name="resolution" required /></AForm>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <div className="mb-3 flex gap-2 text-sm">{[["", "All"], ["gateway", "Gateway (verified)"], ["offline", "Offline (staff-recorded)"]].map(([k, l]) => <Link key={k} href={`?channel=${k}`} className={`rounded px-3 py-1 ${channel === k || (!channel && !k) ? "bg-forest-800 text-white" : "bg-white"}`}>{l}</Link>)}</div>
      <Table head={["Received", "Booking", "Channel", "Method / reference", "Amount", "Verified via", "Recorded by"]} empty="No payments.">
        {txns.map(({ t, b, staff }) => (
          <tr key={t.id}>
            <Td>{formatDateTime(t.receivedAt)}</Td>
            <Td><Link className="underline" href={`/admin/reservations/${b.id}`}>{b.reference}</Link>{b.isDemo && <span className="ml-1 text-[10px] text-gold-700">DEMO</span>}</Td>
            <Td><Badge value={t.channel === "gateway" ? "paid" : "pending"} label={t.channel} />{t.isExcess && <Badge value="failed" label="excess" />}</Td>
            <Td className="text-xs">{t.method} {t.providerPaymentId ?? t.reference}</Td>
            <Td><Money paise={t.amountPaise} /></Td>
            <Td className="text-xs">{t.verifiedVia}</Td>
            <Td className="text-xs">{staff ?? "—"}</Td>
          </tr>
        ))}
      </Table>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Refunds">
          <Table head={["Booking", "Amount", "Status", "Reason", "Updated"]} empty="No refunds.">
            {refundRows.map(({ r, b }) => <tr key={r.id}><Td><Link className="underline" href={`/admin/reservations/${b.id}`}>{b.reference}</Link></Td><Td><Money paise={r.amountPaise} /></Td><Td><Badge value={r.status} /> {r.failureReason && <span className="block text-xs text-danger">{r.failureReason}</span>}</Td><Td className="text-xs">{r.reason}</Td><Td className="text-xs">{formatDateTime(r.updatedAt)}</Td></tr>)}
          </Table>
          <p className="mt-2 text-xs text-muted">A refund shows “succeeded” only after the provider confirms it (webhook or reconciliation).</p>
        </Panel>
        <Panel title="Unresolved gateway orders (last 3 days)">
          <Table head={["Booking", "Order", "Amount", "Status", "Last check"]} empty="None.">
            {openOrders.map(({ o, b }) => <tr key={o.id}><Td><Link className="underline" href={`/admin/reservations/${b.id}`}>{b.reference}</Link> <Badge value={b.status} /></Td><Td className="font-mono text-[11px]">{o.providerOrderId}</Td><Td><Money paise={o.amountPaise} /></Td><Td><Badge value={o.status} /></Td><Td className="text-xs">{formatDateTime(o.lastReconciledAt)}</Td></tr>)}
          </Table>
        </Panel>
      </div>
      <Panel title="Outstanding balances" className="mt-6">
        <Table head={["Booking", "Guest", "Arrival", "Total", "Net paid", "Balance"]} empty="No outstanding balances.">
          {balances.map((b) => <tr key={b.id}><Td><Link className="underline" href={`/admin/reservations/${b.id}`}>{b.reference}</Link></Td><Td>{b.leadName}</Td><Td>{b.checkIn}</Td><Td><Money paise={b.totalPaise} /></Td><Td><Money paise={b.amountPaidPaise - b.amountRefundedPaise} /></Td><Td className="font-semibold"><Money paise={b.totalPaise - b.amountPaidPaise + b.amountRefundedPaise} /></Td></tr>)}
        </Table>
      </Panel>
    </>
  );
}
