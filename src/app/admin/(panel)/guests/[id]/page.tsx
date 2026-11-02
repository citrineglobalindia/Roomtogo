import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { AForm, TA } from "@/components/admin/forms";
import { Badge, DL, Money, PageHeader, Panel, Table, Td } from "@/components/admin/ui";
import { db } from "@/db";
import { bookings, guestNotes, guests, staffMembers, user } from "@/db/schema";
import { formatDate, formatDateTime } from "@/lib/dates";
import { requireStaffPage } from "@/lib/staff";
import { guestNoteAction } from "../../../actions";

export default async function Guest({ params }: { params: Promise<{ id: string }> }) {
  const st = await requireStaffPage("guests.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [g] = await db.select().from(guests).where(eq(guests.id, id));
  if (!g) notFound();
  const stays = await db.select().from(bookings).where(eq(bookings.guestId, id)).orderBy(desc(bookings.checkIn));
  const notes = await db.select({ n: guestNotes, name: user.name }).from(guestNotes).leftJoin(staffMembers, eq(staffMembers.id, guestNotes.staffId)).leftJoin(user, eq(user.id, staffMembers.userId)).where(eq(guestNotes.guestId, id)).orderBy(desc(guestNotes.createdAt));
  return (
    <>
      <PageHeader title={g.name} subtitle={g.email} />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Stay history">
          <Table head={["Ref", "Stay", "Status", "Total"]}>{stays.map((b) => <tr key={b.id}><Td><Link className="underline" href={`/admin/reservations/${b.id}`}>{b.reference}</Link></Td><Td>{formatDate(b.checkIn)} → {formatDate(b.checkOut)}</Td><Td><Badge value={b.status} /></Td><Td>{st.can("payments.view") ? <Money paise={b.totalPaise} /> : "—"}</Td></tr>)}</Table>
        </Panel>
        <div className="space-y-6">
          <Panel title="Contact"><DL items={[["Phone", g.phone], ["Account linked", g.userId ? "Yes" : "No"], ["Marketing opt-in", g.marketingOptIn ? `Yes (${formatDateTime(g.marketingOptInAt)})` : "No"], ["First seen", formatDateTime(g.createdAt)]]} /></Panel>
          {st.can("guests.notes") && (
            <Panel title="Internal notes (never shown to guests)">
              <AForm action={guestNoteAction} hidden={{ guestId: g.id }} submit="Add note"><TA label="Note" name="body" rows={2} required /></AForm>
              <ul className="mt-3 space-y-2 text-sm">{notes.map(({ n, name }) => <li key={n.id} className="rounded bg-cream-100 p-2"><span className="text-xs text-muted">{name} · {formatDateTime(n.createdAt)}</span><p>{n.body}</p></li>)}</ul>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
