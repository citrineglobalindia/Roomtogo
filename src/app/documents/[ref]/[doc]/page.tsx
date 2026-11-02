import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { paymentTransactions, refunds } from "@/db/schema";
import { bookingDetail } from "@/domain/booking";
import type { Quote } from "@/domain/pricing";
import { getSettings, isConfirmed } from "@/domain/settings";
import { bookingForViewer } from "@/lib/booking-access";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { PrintButton } from "./print";

export const metadata: Metadata = { title: "Document — Room2Go", robots: { index: false, follow: false } };

/**
 * Printable documents (browser "Save as PDF"). A payment receipt acknowledges money received; a TAX
 * invoice is issued only when the owner has enabled tax invoices with confirmed tax configuration and a
 * registration number.
 */
export default async function Doc({ params }: { params: Promise<{ ref: string; doc: string }> }) {
  const { ref, doc } = await params;
  if (!["receipt", "invoice", "confirmation"].includes(doc)) notFound();
  const v = await bookingForViewer(ref);
  if (!v) notFound();
  const d = (await bookingDetail(v.booking.id))!;
  const b = d.booking;
  const s = await getSettings();
  const q = b.priceSnapshot as Quote;
  if (doc === "invoice" && !(s.taxInvoicesEnabled && isConfirmed(s, "tax") && s.taxRegistrationNumber && s.legalName)) {
    return <main className="mx-auto max-w-2xl p-10"><h1 className="text-3xl">Tax invoice not available</h1><p className="mt-3">Tax invoices are issued once Room2Go’s business and tax details are configured and approved. A payment receipt is available instead.</p></main>;
  }
  const pays = await db.select().from(paymentTransactions).where(and(eq(paymentTransactions.bookingId, b.id), eq(paymentTransactions.status, "captured")));
  const refs = await db.select().from(refunds).where(and(eq(refunds.bookingId, b.id), eq(refunds.status, "succeeded")));
  const title = doc === "receipt" ? "Payment receipt" : doc === "invoice" ? "Tax invoice" : "Booking confirmation";
  return (
    <main className="mx-auto max-w-3xl bg-white p-8 text-sm text-ink print:p-0">
      <div className="flex items-start justify-between border-b border-sand pb-5">
        <div>
          <p className="font-serif text-3xl text-forest-900">room2go</p>
          <p className="mt-1 text-muted">{s.legalName ?? s.name}<br />{s.addressLine}, {s.city} {s.postalCode}<br />{s.phone} · {s.email}</p>
          {doc === "invoice" && <p className="mt-1">Tax registration: {s.taxRegistrationNumber}</p>}
        </div>
        <div className="text-right">
          <h1 className="text-2xl">{title}</h1>
          <p className="text-muted">{doc === "invoice" ? `${s.invoicePrefix}-${b.reference.slice(4)}` : b.reference}</p>
          <p className="text-muted">{formatDateTime(new Date())}</p>
          {b.isDemo && <p className="mt-1 font-bold text-gold-700">DEMO — NOT A REAL DOCUMENT</p>}
        </div>
      </div>
      {doc !== "invoice" && doc === "receipt" && <p className="mt-4 rounded bg-cream-100 p-2 text-xs">This is an acknowledgement of payment received. It is not a tax invoice.</p>}
      <dl className="mt-5 grid grid-cols-2 gap-3">
        <div><dt className="text-muted">Guest</dt><dd>{b.leadName}</dd></div>
        <div><dt className="text-muted">Booking</dt><dd>{b.reference} ({b.status.replace("_", " ")})</dd></div>
        <div><dt className="text-muted">Stay</dt><dd>{formatDate(b.checkIn)} → {formatDate(b.checkOut)} · {b.nights} night(s)</dd></div>
        <div><dt className="text-muted">Accommodation</dt><dd>{d.units.map((u) => u.roomTypeName).join(", ")}</dd></div>
      </dl>
      <table className="mt-6 w-full border-collapse">
        <tbody>
          <tr className="border-b border-sand"><td className="py-1.5">Accommodation</td><td className="text-right">{formatINR(q.subtotalPaise)}</td></tr>
          {q.extrasPaise > 0 && <tr className="border-b border-sand"><td className="py-1.5">Extra guests</td><td className="text-right">{formatINR(q.extrasPaise)}</td></tr>}
          {q.taxLines.map((t) => <tr key={t.label} className="border-b border-sand"><td className="py-1.5">{t.label} ({(t.rateBps / 100).toFixed(2)}% on {formatINR(t.taxablePaise)})</td><td className="text-right">{formatINR(t.taxPaise)}</td></tr>)}
          {b.totalPaise !== q.totalPaise && <tr className="border-b border-sand"><td className="py-1.5">Approved adjustments</td><td className="text-right">{formatINR(b.totalPaise - q.totalPaise)}</td></tr>}
          <tr className="font-semibold"><td className="py-2">Total</td><td className="text-right">{formatINR(b.totalPaise)}</td></tr>
        </tbody>
      </table>
      {doc !== "confirmation" && (
        <table className="mt-6 w-full border-collapse">
          <thead><tr className="text-left text-muted"><th className="py-1">Payment</th><th>Method</th><th className="text-right">Amount</th></tr></thead>
          <tbody>
            {pays.map((p) => <tr key={p.id} className="border-t border-sand"><td className="py-1.5">{formatDateTime(p.receivedAt)}</td><td>{p.channel === "gateway" ? `Online (${p.method ?? "gateway"}) ${p.providerPaymentId}` : `${p.method} — recorded by staff${p.reference ? ` (${p.reference})` : ""}`}</td><td className="text-right">{formatINR(p.amountPaise)}</td></tr>)}
            {refs.map((r) => <tr key={r.id} className="border-t border-sand"><td className="py-1.5">{formatDateTime(r.completedAt)}</td><td>Refund</td><td className="text-right">− {formatINR(r.amountPaise)}</td></tr>)}
            <tr className="border-t border-sand font-semibold"><td className="py-2" colSpan={2}>Balance due</td><td className="text-right">{formatINR(Math.max(0, b.totalPaise - b.amountPaidPaise + b.amountRefundedPaise))}</td></tr>
          </tbody>
        </table>
      )}
      <PrintButton />
    </main>
  );
}
