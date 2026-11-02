import Link from "next/link";
import { desc, ilike, or, sql } from "drizzle-orm";
import { PageHeader, Table, Td } from "@/components/admin/ui";
import { db } from "@/db";
import { guests } from "@/db/schema";
import { formatDateTime } from "@/lib/dates";
import { requireStaffPage } from "@/lib/staff";

export const metadata = { title: "Guests" };

export default async function Guests({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaffPage("guests.view");
  const { q } = await searchParams;
  const rows = await db
    .select({ g: guests, stays: sql<number>`(SELECT count(*)::int FROM bookings b WHERE b.guest_id = ${guests.id} AND b.status IN ('confirmed','checked_in','checked_out'))` })
    .from(guests)
    .where(q ? or(ilike(guests.name, `%${q}%`), ilike(guests.email, `%${q}%`), ilike(guests.phone, `%${q}%`)) : undefined)
    .orderBy(desc(guests.updatedAt))
    .limit(100);
  return (
    <>
      <PageHeader title="Guests" />
      <form className="mb-4 flex gap-2" role="search"><input name="q" defaultValue={q} className="field max-w-sm" placeholder="Name, email or phone" aria-label="Search guests" /><button className="btn-primary btn-sm">Search</button></form>
      <Table head={["Name", "Email", "Phone", "Stays", "Account", "Marketing", "Updated"]} empty="No guests.">
        {rows.map(({ g, stays }) => (
          <tr key={g.id}><Td><Link className="underline" href={`/admin/guests/${g.id}`}>{g.name}</Link></Td><Td>{g.email}</Td><Td>{g.phone}</Td><Td>{stays}</Td><Td>{g.userId ? "Yes" : "—"}</Td><Td>{g.marketingOptIn ? "Opted in" : "—"}</Td><Td className="text-xs">{formatDateTime(g.updatedAt)}</Td></tr>
        ))}
      </Table>
    </>
  );
}
