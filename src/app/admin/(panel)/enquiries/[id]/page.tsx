import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { AForm, F, S, TA } from "@/components/admin/forms";
import { Badge, DL, PageHeader, Panel } from "@/components/admin/ui";
import { db } from "@/db";
import { enquiries, enquiryNotes, staffMembers, user } from "@/db/schema";
import { formatDate, formatDateTime } from "@/lib/dates";
import { requireStaffPage } from "@/lib/staff";
import { enquiryAdminAction } from "../../../actions";

export default async function Enquiry({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage("enquiries.manage");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [e] = await db.select().from(enquiries).where(eq(enquiries.id, id));
  if (!e) notFound();
  const notes = await db.select({ n: enquiryNotes, name: user.name }).from(enquiryNotes).leftJoin(staffMembers, eq(staffMembers.id, enquiryNotes.staffId)).leftJoin(user, eq(user.id, staffMembers.userId)).where(eq(enquiryNotes.enquiryId, id)).orderBy(desc(enquiryNotes.createdAt));
  return (
    <>
      <PageHeader title={`${e.name}`} subtitle={`${e.kind.replace("_", " ")} enquiry · ${formatDateTime(e.createdAt)}`} actions={<Badge value={e.status} />} />
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Panel title="Enquiry">
          <DL items={[["Email", <a key="e" className="underline" href={`mailto:${e.email}`}>{e.email}</a>], ["Phone", e.phone ? <a key="p" className="underline" href={`tel:${e.phone}`}>{e.phone}</a> : null], ["Company", e.company], ["Dates", e.checkIn ? `${formatDate(e.checkIn)} → ${e.checkOut ? formatDate(e.checkOut) : "?"}` : null], ["Guests / rooms", `${e.guests ?? "—"} / ${e.roomsCount ?? "—"}`], ["Length", e.stayLength]]} />
          <p className="mt-4 whitespace-pre-line rounded bg-cream-100 p-3 text-sm">{e.message}</p>
        </Panel>
        <Panel title="Follow-up">
          <AForm action={enquiryAdminAction} hidden={{ id: e.id }} submit="Update">
            <S label="Status" name="status" defaultValue={e.status} options={[["new", "New"], ["contacted", "Contacted"], ["quoted", "Quoted"], ["closed", "Closed"]]} />
            <F label="Follow-up date" name="followUpDate" type="date" defaultValue={e.followUpDate} />
            <TA label="Add note" name="note" rows={3} />
          </AForm>
          <ul className="mt-4 space-y-2 text-sm">{notes.map(({ n, name }) => <li key={n.id} className="rounded bg-cream-100 p-2"><span className="text-xs text-muted">{name} · {formatDateTime(n.createdAt)}</span><p>{n.body}</p></li>)}</ul>
        </Panel>
      </div>
    </>
  );
}
