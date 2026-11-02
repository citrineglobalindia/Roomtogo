import Link from "next/link";
import { formatINR } from "@/lib/money";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[30px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, children, actions, className = "" }: { title?: string; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-sand bg-white ${className}`}>
      {title && (
        <div className="flex items-center justify-between border-b border-sand px-5 py-3">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-forest-800">{title}</h2>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, href, tone }: { label: string; value: React.ReactNode; hint?: string; href?: string; tone?: "warn" | "ok" }) {
  const body = (
    <div className={`rounded-lg border bg-white p-4 ${tone === "warn" ? "border-gold-500" : "border-sand"}`}>
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 font-serif text-3xl text-forest-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{body}</Link> : body;
}

const STATUS_STYLE: Record<string, string> = {
  pending_payment: "bg-gold-100 text-gold-700",
  confirmed: "bg-forest-100 text-forest-800",
  checked_in: "bg-sky-100 text-sky-800",
  checked_out: "bg-stone-200 text-stone-700",
  cancelled: "bg-red-100 text-red-800",
  no_show: "bg-red-50 text-red-700",
  expired: "bg-stone-100 text-stone-500",
  unpaid: "bg-red-50 text-red-700",
  partially_paid: "bg-gold-100 text-gold-700",
  paid: "bg-forest-100 text-forest-800",
  overpaid: "bg-purple-100 text-purple-800",
  open: "bg-red-100 text-red-800",
  resolved: "bg-stone-100 text-stone-600",
  new: "bg-gold-100 text-gold-700",
  contacted: "bg-sky-100 text-sky-800",
  quoted: "bg-forest-100 text-forest-800",
  closed: "bg-stone-100 text-stone-600",
  pending: "bg-gold-100 text-gold-700",
  approved: "bg-forest-100 text-forest-800",
  rejected: "bg-stone-200 text-stone-600",
  requested: "bg-gold-100 text-gold-700",
  processing: "bg-sky-100 text-sky-800",
  succeeded: "bg-forest-100 text-forest-800",
  failed: "bg-red-100 text-red-800",
  sent: "bg-forest-100 text-forest-800",
  captured_demo: "bg-gold-100 text-gold-700",
  blocked_unconfigured: "bg-red-100 text-red-800",
  draft: "bg-stone-100 text-stone-600",
  published: "bg-forest-100 text-forest-800",
  active: "bg-forest-100 text-forest-800",
  inactive: "bg-stone-200 text-stone-600",
};

export function Badge({ value, label }: { value: string; label?: string }) {
  return <span className={`inline-flex rounded px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLE[value] ?? "bg-stone-100 text-stone-700"}`}>{label ?? value.replace(/_/g, " ")}</span>;
}

export function Money({ paise }: { paise: number }) {
  return <span className="tabular-nums">{formatINR(paise)}</span>;
}

export function Table({ head, children, empty }: { head: React.ReactNode[]; children: React.ReactNode; empty?: string }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="overflow-x-auto rounded-lg border border-sand bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-cream-100 text-xs uppercase tracking-wider text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-4 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-sand">
          {hasRows ? children : (
            <tr>
              <td colSpan={head.length} className="px-4 py-8 text-center text-muted">
                {empty ?? "Nothing to show."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 align-top ${className}`}>{children}</td>;
}

export function Unconfirmed({ show, children = "Unconfirmed" }: { show: boolean; children?: React.ReactNode }) {
  if (!show) return null;
  return <span className="ml-2 inline-flex rounded bg-gold-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gold-700">{children}</span>;
}

export function DL({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-muted">{k}</dt>
          <dd>{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
