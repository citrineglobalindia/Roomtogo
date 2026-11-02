import type { Quote } from "@/domain/pricing";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";

export function PriceSummary({ quote, showNights = true }: { quote: Quote; showNights?: boolean }) {
  return (
    <div className="space-y-4 text-sm">
      {quote.rooms.map((r, i) => (
        <div key={i} className="rounded-md border border-sand bg-white p-3">
          <p className="font-medium text-forest-900">
            Room {i + 1}: {r.roomTypeName} · {r.adults} adult{r.adults > 1 ? "s" : ""}
            {r.children ? `, ${r.children} child${r.children > 1 ? "ren" : ""}` : ""}
          </p>
          {showNights && (
            <ul className="mt-2 space-y-1 text-muted">
              {r.nights.map((n) => (
                <li key={n.night} className="flex justify-between">
                  <span>{formatDate(n.night, { weekday: "short", day: "numeric", month: "short" })}</span>
                  <span className="tabular-nums">{formatINR(n.ratePaise)}{n.extraGuestPaise ? ` + ${formatINR(n.extraGuestPaise)} extra guest` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <dl className="space-y-1.5">
        <Row k={`Accommodation (${quote.nights} night${quote.nights > 1 ? "s" : ""})`} v={formatINR(quote.subtotalPaise)} />
        {quote.extrasPaise > 0 && <Row k="Extra guests" v={formatINR(quote.extrasPaise)} />}
        {quote.discountPaise > 0 && <Row k="Discount" v={`− ${formatINR(quote.discountPaise)}`} />}
        {quote.taxLines.map((t) => (
          <Row key={t.label} k={`${t.label} (${(t.rateBps / 100).toFixed(2)}%)`} v={formatINR(t.taxPaise)} />
        ))}
        {quote.taxLines.length === 0 && <Row k="Taxes" v="Not configured" muted />}
        <div className="my-2 border-t border-sand" />
        <Row k="Total" v={formatINR(quote.totalPaise)} strong />
        <Row k="Payable now" v={formatINR(quote.dueNowPaise)} strong />
        {quote.balanceLaterPaise > 0 && <Row k="Balance due at the property" v={formatINR(quote.balanceLaterPaise)} />}
      </dl>
      {quote.sampleRates && <p className="badge-sample">Sample rates — not Room2Go prices</p>}
    </div>
  );
}

function Row({ k, v, strong, muted }: { k: string; v: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "text-base font-semibold text-forest-900" : muted ? "text-muted" : ""}`}>
      <dt>{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}
