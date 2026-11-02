import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import { AForm, CB, Disclosure, F, TA } from "@/components/admin/forms";
import { Badge, PageHeader, Panel, Unconfirmed } from "@/components/admin/ui";
import { db } from "@/db";
import { policyVersions } from "@/db/schema";
import { formatDateTime } from "@/lib/dates";
import { requireStaffPage } from "@/lib/staff";
import { policyAction } from "../../../actions";

export const metadata = { title: "Policies" };
const KINDS = [["cancellation", "Cancellation & refund policy", "/cancellation-policy"], ["terms", "Booking terms", "/terms"], ["privacy", "Privacy policy", "/privacy"], ["house_rules", "House rules", "/house-rules"]] as const;

export default async function Policies() {
  const st = await requireStaffPage("content.manage");
  const rows = await db.select().from(policyVersions).orderBy(asc(policyVersions.kind), desc(policyVersions.version));
  return (
    <>
      <PageHeader title="Policies" subtitle="Each edit creates a new version. Bookings permanently keep the version the guest accepted. Only the owner can mark a version as approved." />
      <div className="space-y-6">
        {KINDS.map(([kind, label, path]) => {
          const versions = rows.filter((r) => r.kind === kind);
          const current = versions.find((v) => v.status === "published");
          return (
            <Panel key={kind} title={label} actions={<Link className="text-xs underline" href={path} target="_blank">View public page</Link>}>
              <p className="text-sm">Published: {current ? <>v{current.version} · {formatDateTime(current.publishedAt)} <Unconfirmed show={!current.approved}>Not approved</Unconfirmed>{current.isSample && <span className="badge-sample ml-1">SAMPLE</span>}</> : <em>none — the public page shows a neutral notice</em>}</p>
              <ul className="mt-3 space-y-2 text-sm">
                {versions.map((v) => (
                  <li key={v.id} className="rounded border border-sand p-2">
                    <div className="flex flex-wrap items-center gap-2">v{v.version} <Badge value={v.status} /> {v.approved && <Badge value="approved" />} <span className="text-xs text-muted">{formatDateTime(v.createdAt)}</span></div>
                    <details className="mt-1 text-xs"><summary className="cursor-pointer">Text</summary><p className="mt-1 whitespace-pre-line">{v.body}</p>{v.rules && <pre className="mt-1">{JSON.stringify(v.rules)}</pre>}</details>
                    {v.status === "draft" && (
                      <AForm action={policyAction} hidden={{ op: "publish", id: v.id }} submit="Publish this version" className="mt-2 flex flex-wrap items-center gap-3" confirm="Publish this version? New bookings will accept it.">
                        {st.role === "owner" && <CB label="Approved by Room2Go (owner)" name="approved" />}
                      </AForm>
                    )}
                  </li>
                ))}
              </ul>
              <div className="mt-3">
                <Disclosure label="New version">
                  <AForm action={policyAction} hidden={{ op: "create", kind }} submit="Save as draft">
                    <F label="Title" name="title" required defaultValue={current?.title ?? label} />
                    <TA label="Text" name="body" rows={10} required defaultValue={current && !current.isSample ? current.body : ""} />
                    {kind === "cancellation" && (
                      <div className="grid gap-3 sm:grid-cols-3">
                        <F label="Free cancellation (hours before check-in)" name="freeHours" type="number" min={0} />
                        <F label="Refund % after free window" name="lateRefundPct" type="number" min={0} max={100} />
                        <F label="Refund % for no-show" name="noShowRefundPct" type="number" min={0} max={100} />
                      </div>
                    )}
                    {kind === "cancellation" && <p className="text-xs text-muted">Structured values are shown to staff as refund guidance; the text above is what guests accept.</p>}
                  </AForm>
                </Disclosure>
              </div>
            </Panel>
          );
        })}
      </div>
    </>
  );
}
