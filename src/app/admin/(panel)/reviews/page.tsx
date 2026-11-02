import { desc } from "drizzle-orm";
import { AForm, CB, Disclosure, F, S, TA } from "@/components/admin/forms";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { db } from "@/db";
import { reviews } from "@/db/schema";
import { formatDateTime } from "@/lib/dates";
import { requireStaffPage } from "@/lib/staff";
import { reviewAdminAction } from "../../actions";

export const metadata = { title: "Reviews" };

export default async function Reviews() {
  await requireStaffPage("reviews.moderate");
  const rows = await db.select().from(reviews).orderBy(desc(reviews.createdAt));
  const groups = [["pending", "Awaiting moderation"], ["approved", "Published"], ["rejected", "Rejected"]] as const;
  return (
    <>
      <PageHeader title="Reviews" subtitle="Only genuine reviews with publication consent can be published. Provenance is recorded for every review." />
      <div className="space-y-6">
        {groups.map(([st, label]) => (
          <Panel key={st} title={`${label} (${rows.filter((r) => r.status === st).length})`}>
            <ul className="space-y-3">
              {rows.filter((r) => r.status === st).map((r) => (
                <li key={r.id} className="rounded border border-sand p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{r.authorName}</strong>{r.displayLabel && <span className="text-muted">as “{r.displayLabel}”</span>}
                    <Badge value={r.source === "sample" ? "pending" : "active"} label={`source: ${r.source.replace("_", " ")}`} />
                    {r.bookingId && <Badge value="approved" label="verified stay" />}
                    {!r.consentToPublish && <Badge value="failed" label="no consent" />}
                    {r.rating && <span>{r.rating}/5</span>}
                    <span className="text-xs text-muted">{formatDateTime(r.createdAt)}</span>
                  </div>
                  {r.title && <p className="mt-1 font-medium">{r.title}</p>}
                  <p className="mt-1">{r.body}</p>
                  {r.sourceUrl && <a href={r.sourceUrl} className="text-xs underline" target="_blank" rel="noopener">source</a>}
                  <div className="mt-2 flex gap-2">
                    {r.status !== "approved" && r.consentToPublish && <AForm action={reviewAdminAction} hidden={{ op: "approve", id: r.id }} submit="Approve & publish" className="inline" />}
                    {r.status !== "rejected" && <AForm action={reviewAdminAction} hidden={{ op: "reject", id: r.id }} submit={r.status === "approved" ? "Unpublish" : "Reject"} submitClass="btn-outline btn-sm" className="inline" />}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
        <Panel title="Add a genuine review from another source">
          <Disclosure label="Add review">
            <AForm action={reviewAdminAction} hidden={{ op: "add_external" }} submit="Add for moderation">
              <div className="grid gap-3 sm:grid-cols-2">
                <F label="Reviewer name (as shown at source)" name="authorName" required />
                <F label="Display label (optional)" name="displayLabel" />
                <S label="Source" name="source" options={[["google", "Google"], ["booking_com", "Booking.com"], ["email", "Email to property"], ["other", "Other"]]} />
                <F label="Source URL" name="sourceUrl" />
                <F label="Rating (1–5, optional)" name="rating" type="number" min={1} max={5} />
              </div>
              <TA label="Review text (verbatim)" name="body" required rows={4} />
              <CB label="I confirm this is a genuine guest review and Room2Go may republish it" name="genuine" />
            </AForm>
          </Disclosure>
        </Panel>
      </div>
    </>
  );
}
