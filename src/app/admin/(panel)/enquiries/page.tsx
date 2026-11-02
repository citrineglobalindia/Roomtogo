import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { Badge, PageHeader, Table, Td } from "@/components/admin/ui";
import { db } from "@/db";
import { enquiries } from "@/db/schema";
import { formatDate, formatDateTime } from "@/lib/dates";
import { requireStaffPage } from "@/lib/staff";

export const metadata = { title: "Enquiries" };

export default async function Enquiries({ searchParams }: { searchParams: Promise<{ status?: string; kind?: string }> }) {
  await requireStaffPage("enquiries.manage");
  const sp = await searchParams;
  const c = [];
  if (sp.status && ["new", "contacted", "quoted", "closed"].includes(sp.status)) c.push(eq(enquiries.status, sp.status as "new"));
  if (sp.kind && ["general", "extended_stay", "corporate", "booking"].includes(sp.kind)) c.push(eq(enquiries.kind, sp.kind as "general"));
  const rows = await db.select().from(enquiries).where(c.length ? and(...c) : undefined).orderBy(desc(enquiries.createdAt)).limit(200);
  return (
    <>
      <PageHeader title="Enquiries" subtitle="General, extended-stay and corporate enquiries from the website." />
      <form className="mb-4 flex flex-wrap gap-2">
        <select name="status" defaultValue={sp.status ?? ""} className="field max-w-[180px]" aria-label="Status"><option value="">Any status</option>{["new", "contacted", "quoted", "closed"].map((s) => <option key={s}>{s}</option>)}</select>
        <select name="kind" defaultValue={sp.kind ?? ""} className="field max-w-[180px]" aria-label="Type"><option value="">Any type</option>{["general", "extended_stay", "corporate"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select>
        <button className="btn-primary btn-sm">Filter</button>
      </form>
      <Table head={["Received", "Type", "Name", "Company", "Dates", "Guests", "Status", "Follow-up"]} empty="No enquiries.">
        {rows.map((e) => (
          <tr key={e.id}><Td className="text-xs">{formatDateTime(e.createdAt)}</Td><Td className="capitalize">{e.kind.replace("_", " ")}</Td><Td><Link className="underline" href={`/admin/enquiries/${e.id}`}>{e.name}</Link></Td><Td>{e.company}</Td><Td>{e.checkIn ? `${formatDate(e.checkIn)} → ${e.checkOut ? formatDate(e.checkOut) : "?"}` : "—"}</Td><Td>{e.guests ?? "—"}</Td><Td><Badge value={e.status} /></Td><Td>{e.followUpDate ? formatDate(e.followUpDate) : "—"}</Td></tr>
        ))}
      </Table>
    </>
  );
}
