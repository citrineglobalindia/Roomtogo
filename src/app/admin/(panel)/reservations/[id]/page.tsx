import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { ActionButton, AForm, CB, Disclosure, F, S, TA } from "@/components/admin/forms";
import { Badge, DL, Money, PageHeader, Panel, Table, Td } from "@/components/admin/ui";
import { db } from "@/db";
import { auditLogs, bookingAdjustments, bookingNotes, bookingRequests, notificationOutbox, paymentExceptions, paymentOrders, paymentTransactions, refunds, roomTypes, roomUnits, staffMembers, user } from "@/db/schema";
import { bookingDetail, previewDateChange } from "@/domain/booking";
import { freeUnits } from "@/domain/inventory";
import type { Quote } from "@/domain/pricing";
import { getSettings } from "@/domain/settings";
import { formatDate, formatDateTime, todayInTz } from "@/lib/dates";
import { UserError } from "@/lib/errors";
import { formatINR } from "@/lib/money";
import { requireStaffPage } from "@/lib/staff";
import { bookingOpAction, paymentOpAction } from "../../../actions";

export const metadata = { title: "Reservation" };

export default async function ReservationDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const st = await requireStaffPage("bookings.view");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const d = await bookingDetail(id);
  if (!d) notFound();
  const { booking: b, units, hold } = d;
  const s = await getSettings();
  const today = todayInTz(s.timezone);
  const [requests, notes, adjustments, txns, refundRows, exceptions, orders, messages, history] = await Promise.all([
    db.select().from(bookingRequests).where(eq(bookingRequests.bookingId, id)).orderBy(desc(bookingRequests.createdAt)),
    st.can("bookings.manage") ? db.select({ n: bookingNotes, name: user.name }).from(bookingNotes).leftJoin(staffMembers, eq(staffMembers.id, bookingNotes.staffId)).leftJoin(user, eq(user.id, staffMembers.userId)).where(eq(bookingNotes.bookingId, id)).orderBy(desc(bookingNotes.createdAt)) : Promise.resolve([]),
    db.select().from(bookingAdjustments).where(eq(bookingAdjustments.bookingId, id)).orderBy(asc(bookingAdjustments.createdAt)),
    st.can("payments.view") ? db.select().from(paymentTransactions).where(eq(paymentTransactions.bookingId, id)).orderBy(asc(paymentTransactions.receivedAt)) : Promise.resolve([]),
    st.can("payments.view") ? db.select().from(refunds).where(eq(refunds.bookingId, id)).orderBy(asc(refunds.createdAt)) : Promise.resolve([]),
    st.can("payments.view") ? db.select().from(paymentExceptions).where(eq(paymentExceptions.bookingId, id)).orderBy(desc(paymentExceptions.createdAt)) : Promise.resolve([]),
    st.can("payments.view") ? db.select().from(paymentOrders).where(eq(paymentOrders.bookingId, id)).orderBy(asc(paymentOrders.createdAt)) : Promise.resolve([]),
    db.select().from(notificationOutbox).where(eq(notificationOutbox.bookingId, id)).orderBy(desc(notificationOutbox.createdAt)),
    db.select().from(auditLogs).where(and(eq(auditLogs.entityType, "booking"), eq(auditLogs.entityId, id))).orderBy(desc(auditLogs.createdAt)).limit(50),
  ]);
  const refundedByTxn = new Map<string, number>();
  for (const r of refundRows) if (r.status !== "failed") refundedByTxn.set(r.paymentTransactionId, (refundedByTxn.get(r.paymentTransactionId) ?? 0) + r.amountPaise);
  const allUnits = await db.select({ u: roomUnits, t: roomTypes }).from(roomUnits).innerJoin(roomTypes, eq(roomTypes.id, roomUnits.roomTypeId)).where(eq(roomUnits.status, "active")).orderBy(asc(roomUnits.sortOrder));
  const remainingFrom = today > b.checkIn ? today : b.checkIn;
  const freeForRemaining = remainingFrom < b.checkOut ? await freeUnits({ checkIn: remainingFrom, checkOut: b.checkOut, directOnly: false }) : [];
  const q = b.priceSnapshot as Quote & { revisions?: unknown[] };
  const net = b.amountPaidPaise - b.amountRefundedPaise;
  const policy = b.policySnapshot as { cancellation?: { version: number; title: string; body: string; isSample: boolean } | null; paymentRule: string; advancePercent: number };
  let preview: Awaited<ReturnType<typeof previewDateChange>> | null = null;
  let previewErr: string | null = null;
  if (sp.newIn && sp.newOut && st.can("bookings.manage")) {
    try {
      preview = await previewDateChange(id, sp.newIn, sp.newOut);
    } catch (e) {
      previewErr = e instanceof UserError ? e.message : "Could not preview.";
    }
  }
  const op = (o: string, extra: Record<string, string> = {}) => ({ op: o, bookingId: id, ...extra });
  return (
    <>
      <PageHeader
        title={`${b.reference} · ${b.leadName}`}
        subtitle={`${formatDate(b.checkIn)} → ${formatDate(b.checkOut)} · ${b.nights} night(s) · source: ${b.source.replace("_", " ")}${b.externalRef ? ` (${b.externalRef})` : ""}`}
        actions={<><Badge value={b.status} /><Badge value={b.paymentStatus} />{b.isDemo && <Badge value="demo" label="DEMO" />}</>}
      />
      {exceptions.some((e) => e.status === "open") && (
        <div className="mb-4 rounded-lg border-2 border-red-300 bg-red-50 p-4 text-sm text-danger">
          <strong>Payment exception needs attention.</strong> {exceptions.filter((e) => e.status === "open").map((e) => e.details).join(" ")}
        </div>
      )}
      {hold && b.status === "pending_payment" && <p className="mb-4 rounded bg-gold-100 p-3 text-sm text-gold-700">Checkout hold {hold.status} — expires {formatDateTime(hold.expiresAt)}.</p>}
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Panel title="Stay & guest">
            <DL items={[
              ["Lead guest", b.leadName],
              ["Email", <a key="e" className="underline" href={`mailto:${b.leadEmail}`}>{b.leadEmail}</a>],
              ["Phone", <a key="p" className="underline" href={`tel:${b.leadPhone}`}>{b.leadPhone}</a>],
              ["Guests", `${b.adults} adult(s), ${b.children} child(ren)`],
              ["Arrival ETA", b.arrivalEta],
              ["Special requests (guest-visible)", b.specialRequests],
              ["Marketing opt-in", b.marketingOptIn ? "Yes" : "No"],
              ["Created", formatDateTime(b.createdAt)],
            ]} />
            {st.can("guests.view") && <Link href={`/admin/guests/${b.guestId}`} className="mt-3 inline-block text-sm underline">Guest record & stay history</Link>}
          </Panel>
          <Panel title="Rooms / units">
            <Table head={["Category", "Unit", "Guests", ""]}>
              {units.map((u) => (
                <tr key={u.id}>
                  <Td>{u.roomTypeName}</Td>
                  <Td className="font-medium">{u.unitLabel}</Td>
                  <Td>{u.adults}A {u.children}C</Td>
                  <Td>
                    {st.can("bookings.manage") && ["confirmed", "checked_in", "pending_payment"].includes(b.status) && freeForRemaining.length > 0 && (
                      <Disclosure label="Reassign">
                        <AForm action={bookingOpAction} hidden={op("reassign", { bookingUnitId: u.id, fromNight: remainingFrom })} submit="Move to unit">
                          <S label={`Free from ${formatDate(remainingFrom)} to departure`} name="unitId" options={freeForRemaining.map((f) => [f.id, `${f.label} · ${allUnits.find((x) => x.u.id === f.id)?.t.name ?? ""}`])} />
                        </AForm>
                      </Disclosure>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          </Panel>
          {st.can("bookings.manage") && (
            <Panel title="Operations">
              <div className="flex flex-wrap gap-2">
                {b.status === "confirmed" && today >= b.checkIn && <ActionButton action={bookingOpAction} hidden={op("check_in")} label="Check in" className="btn-primary btn-sm" />}
                {b.status === "checked_in" && <ActionButton action={bookingOpAction} hidden={op("check_out")} label="Check out" className="btn-primary btn-sm" confirm={today < b.checkOut ? "Early departure: remaining nights will be released. Continue?" : undefined} />}
                {b.status === "confirmed" && today >= b.checkIn && <ActionButton action={bookingOpAction} hidden={op("no_show")} label="Mark no-show" confirm="Mark as no-show and release remaining nights?" />}
                {["confirmed", "checked_in"].includes(b.status) && <ActionButton action={bookingOpAction} hidden={op("resend")} label="Resend confirmation" />}
              </div>
              {st.can("bookings.cancel") && ["confirmed", "pending_payment"].includes(b.status) && (
                <div className="mt-4">
                  <Disclosure label="Cancel booking" className="btn-danger btn-sm">
                    <AForm action={bookingOpAction} hidden={op("cancel")} submit="Cancel booking & release inventory" submitClass="btn-danger btn-sm" confirm="Cancel this booking? Inventory is released immediately.">
                      <TA label="Reason (internal + audit)" name="reason" required rows={2} />
                      <CB label="Email the guest a cancellation notice" name="notify" defaultChecked />
                      {net > 0 && <p className="text-xs text-muted">Paid {formatINR(net)}. Refunds are processed separately by the owner (Payments below).</p>}
                    </AForm>
                  </Disclosure>
                </div>
              )}
              {b.status === "confirmed" && (
                <form className="mt-4 flex flex-wrap items-end gap-2" method="get">
                  <label><span className="field-label">New arrival</span><input className="field" type="date" name="newIn" defaultValue={sp.newIn ?? b.checkIn} /></label>
                  <label><span className="field-label">New departure</span><input className="field" type="date" name="newOut" defaultValue={sp.newOut ?? b.checkOut} /></label>
                  <button className="btn-outline btn-sm">Preview date change</button>
                </form>
              )}
              {previewErr && <p className="mt-2 text-sm text-danger">{previewErr}</p>}
              {preview && (
                <div className="mt-3 rounded-md border border-sand bg-cream-50 p-4 text-sm">
                  <p>Availability: <strong>{preview.available ? "available" : "NOT available"}</strong> · New total {formatINR(preview.newTotalPaise)} (was {formatINR(preview.currentTotalPaise)}) · difference <strong>{formatINR(preview.deltaPaise)}</strong></p>
                  <p className="text-muted">{preview.additionalDuePaise > 0 ? `Guest would owe an additional ${formatINR(preview.additionalDuePaise)}.` : preview.refundDuePaise > 0 ? `A refund of up to ${formatINR(preview.refundDuePaise)} would be due (process separately).` : "No balance change."}</p>
                  {preview.available && (
                    <AForm action={bookingOpAction} hidden={op("date_change", { checkIn: sp.newIn!, checkOut: sp.newOut!, requestId: sp.requestId ?? "" })} submit="Apply date change" confirm="Apply the date change and price difference?" className="mt-2 space-y-2" />
                  )}
                </div>
              )}
            </Panel>
          )}
          {requests.length > 0 && (
            <Panel title="Guest requests">
              <ul className="space-y-3 text-sm">
                {requests.map((r) => (
                  <li key={r.id} className="rounded border border-sand p-3">
                    <div className="flex items-center gap-2"><Badge value={r.status} /> <strong className="capitalize">{r.kind.replace("_", " ")}</strong> <span className="text-muted">{formatDateTime(r.createdAt)}</span></div>
                    {r.requestedCheckIn && <p>Requested: {r.requestedCheckIn} → {r.requestedCheckOut}</p>}
                    {r.guestMessage && <p className="text-muted">“{r.guestMessage}”</p>}
                    {r.status === "requested" && st.can("bookings.manage") && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {r.kind === "date_change" && <Link className="btn-outline btn-sm" href={`?newIn=${r.requestedCheckIn}&newOut=${r.requestedCheckOut}&requestId=${r.id}`}>Check availability & price</Link>}
                        {r.kind === "cancellation" && st.can("bookings.cancel") && <span className="text-xs text-muted">Approve by cancelling the booking above (refund handled separately).</span>}
                        <Disclosure label="Decline">
                          <AForm action={bookingOpAction} hidden={op("reject_request", { requestId: r.id })} submit="Decline request"><TA label="Response to guest" name="response" rows={2} required /></AForm>
                        </Disclosure>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {st.can("bookings.manage") && (
            <Panel title="Internal notes (staff only)">
              <AForm action={bookingOpAction} hidden={op("note")} submit="Add note"><TA label="Note" name="body" rows={2} required /></AForm>
              <ul className="mt-3 space-y-2 text-sm">{notes.map(({ n, name }) => <li key={n.id} className="rounded bg-cream-100 p-2"><span className="text-xs text-muted">{name} · {formatDateTime(n.createdAt)}</span><p>{n.body}</p></li>)}</ul>
            </Panel>
          )}
        </div>
        <div className="space-y-6">
          <Panel title="Price snapshot">
            <ul className="space-y-1 text-sm">
              {q.rooms.map((r, i) => <li key={i} className="flex justify-between"><span>{r.roomTypeName} ({r.adults}A {r.children}C)</span><Money paise={r.roomSubtotalPaise + r.extrasPaise} /></li>)}
              {q.taxLines.map((t) => <li key={t.label} className="flex justify-between text-muted"><span>{t.label}</span><Money paise={t.taxPaise} /></li>)}
              {adjustments.map((a) => <li key={a.id} className="flex justify-between text-muted"><span>Adjustment: {a.reason}</span><Money paise={a.amountPaise} /></li>)}
              <li className="flex justify-between border-t border-sand pt-1 font-semibold"><span>Total</span><Money paise={b.totalPaise} /></li>
              <li className="flex justify-between"><span>Due at booking ({policy.paymentRule === "advance" ? `${policy.advancePercent}% advance` : "full"})</span><Money paise={b.dueNowPaise} /></li>
              <li className="flex justify-between"><span>Net paid</span><Money paise={net} /></li>
              <li className="flex justify-between font-semibold"><span>Balance</span><Money paise={b.totalPaise - net} /></li>
            </ul>
            {q.sampleRates && <p className="badge-sample mt-2">Sample rates</p>}
            {(q.revisions?.length ?? 0) > 0 && <p className="mt-2 text-xs text-muted">{q.revisions!.length} previous price revision(s) kept in the snapshot.</p>}
            {st.can("bookings.modify_price") && !["cancelled", "expired"].includes(b.status) && (
              <div className="mt-3">
                <Disclosure label="Price adjustment">
                  <AForm action={bookingOpAction} hidden={op("adjust")} submit="Record adjustment" confirm="Record this audited adjustment?">
                    <S label="Type" name="direction" options={[["charge", "Additional charge"], ["reduce", "Reduction / discount"]]} />
                    <F label="Amount (₹)" name="amount" required inputMode="decimal" />
                    <F label="Reason" name="reason" required />
                  </AForm>
                </Disclosure>
              </div>
            )}
          </Panel>
          {st.can("payments.view") && (
            <Panel title="Payments">
              <ul className="space-y-2 text-sm">
                {txns.map((t) => (
                  <li key={t.id} className="rounded border border-sand p-2">
                    <div className="flex justify-between"><span>{t.channel === "gateway" ? `Gateway (${t.provider}${t.provider === "demo" ? " — DEMO" : ""})` : `Offline · ${t.method}`}{t.isExcess && <Badge value="failed" label="excess" />}</span><Money paise={t.amountPaise} /></div>
                    <p className="text-xs text-muted">{formatDateTime(t.receivedAt)} · {t.providerPaymentId ?? t.reference ?? ""} · verified via {t.verifiedVia}</p>
                    {refundRows.filter((r) => r.paymentTransactionId === t.id).map((r) => <p key={r.id} className="text-xs">Refund {formatINR(r.amountPaise)} · <Badge value={r.status} /> {r.failureReason}</p>)}
                    {st.can("refunds.manage") && t.amountPaise - (refundedByTxn.get(t.id) ?? 0) > 0 && (
                      <div className="mt-2">
                        <Disclosure label="Refund">
                          <AForm action={paymentOpAction} hidden={{ op: "refund", bookingId: id, paymentTransactionId: t.id }} submit="Issue refund" confirm="Send this refund? This cannot be undone." submitClass="btn-danger btn-sm">
                            <F label={`Amount (₹) — max ${formatINR(t.amountPaise - (refundedByTxn.get(t.id) ?? 0))}`} name="amount" required inputMode="decimal" />
                            <F label="Reason" name="reason" required />
                            <p className="text-xs text-muted">Policy accepted: {policy.cancellation ? `${policy.cancellation.title} v${policy.cancellation.version}${policy.cancellation.isSample ? " (SAMPLE)" : ""}` : "none recorded"}</p>
                          </AForm>
                        </Disclosure>
                      </div>
                    )}
                  </li>
                ))}
                {txns.length === 0 && <li className="text-muted">No payments.</li>}
              </ul>
              {orders.filter((o) => o.status !== "paid").length > 0 && <p className="mt-2 text-xs text-muted">{orders.filter((o) => o.status !== "paid").length} unpaid gateway order(s).</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {st.can("payments.record_offline") && !["expired"].includes(b.status) && (
                  <Disclosure label="Record offline payment">
                    <AForm action={paymentOpAction} hidden={{ op: "offline", bookingId: id }} submit="Record payment">
                      <F label="Amount received (₹)" name="amount" required inputMode="decimal" />
                      <S label="Method" name="method" options={[["cash", "Cash"], ["upi", "UPI to property"], ["bank_transfer", "Bank transfer"], ["card_terminal", "Card terminal"], ["other", "Other"]]} />
                      <F label="Reference / receipt no." name="reference" />
                    </AForm>
                  </Disclosure>
                )}
                {st.can("payments.reconcile") && orders.length > 0 && <ActionButton action={paymentOpAction} hidden={{ op: "reconcile", bookingId: id }} label="Check with gateway" />}
              </div>
              {exceptions.map((e) => (
                <div key={e.id} className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs">
                  <Badge value={e.status} /> <strong>{e.kind.replace(/_/g, " ")}</strong> — {e.details} {e.resolution && <em>Resolution: {e.resolution}</em>}
                  {e.status === "open" && st.can("exceptions.resolve") && (
                    <AForm action={paymentOpAction} hidden={{ op: "resolve", bookingId: id, exceptionId: e.id }} submit="Mark resolved" className="mt-2 space-y-2"><F label="Resolution" name="resolution" required /></AForm>
                  )}
                </div>
              ))}
              <div className="mt-3 flex gap-3 text-xs">
                <Link className="underline" target="_blank" href={`/documents/${b.reference}/receipt`}>Receipt</Link>
                <Link className="underline" target="_blank" href={`/documents/${b.reference}/confirmation`}>Confirmation</Link>
                {s.taxInvoicesEnabled && <Link className="underline" target="_blank" href={`/documents/${b.reference}/invoice`}>Tax invoice</Link>}
              </div>
            </Panel>
          )}
          <Panel title="Policy accepted at booking">
            <p className="text-sm">{policy.cancellation ? `${policy.cancellation.title} v${policy.cancellation.version}` : "—"} {policy.cancellation?.isSample && <span className="badge-sample">SAMPLE</span>}</p>
            {policy.cancellation && <details className="mt-1 text-xs text-muted"><summary className="cursor-pointer">Show text</summary><p className="mt-1 whitespace-pre-line">{policy.cancellation.body}</p></details>}
          </Panel>
          <Panel title="Messages">
            <ul className="space-y-1 text-xs">{messages.map((m) => <li key={m.id} className="flex justify-between gap-2"><span>{m.template} → {m.toAddress}</span><Badge value={m.status} /></li>)}{messages.length === 0 && <li className="text-muted">None.</li>}</ul>
          </Panel>
          <Panel title="History">
            <ul className="space-y-1 text-xs">{history.map((h) => <li key={h.id}><span className="text-muted">{formatDateTime(h.createdAt)}</span> · {h.action} · {h.actorLabel ?? h.actorType}</li>)}</ul>
          </Panel>
        </div>
      </div>
    </>
  );
}

void inArray; void sql;
