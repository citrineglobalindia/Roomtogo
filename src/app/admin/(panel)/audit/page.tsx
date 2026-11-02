import Link from "next/link";
import { and, desc, eq, ilike, type SQL } from "drizzle-orm";
import { PageHeader, Table, Td } from "@/components/admin/ui";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { formatDateTime } from "@/lib/dates";
import { requireStaffPage } from "@/lib/staff";

export const metadata = { title: "Audit log" };

export default async function Audit({ searchParams }: { searchParams: Promise<{ entity?: string; action?: string; page?: string }> }) {
  await requireStaffPage("audit.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const c: SQL[] = [];
  if (sp.entity) c.push(eq(auditLogs.entityType, sp.entity));
  if (sp.action) c.push(ilike(auditLogs.action, `%${sp.action}%`));
  const rows = await db.select().from(auditLogs).where(c.length ? and(...c) : undefined).orderBy(desc(auditLogs.createdAt)).limit(100).offset((page - 1) * 100);
  return (
    <>
      <PageHeader title="Audit log" subtitle="Actor, action, entity, time and before/after details for material changes." />
      <form className="mb-3 flex gap-2"><input name="entity" defaultValue={sp.entity} placeholder="entity (booking, room_type…)" className="field max-w-xs" /><input name="action" defaultValue={sp.action} placeholder="action contains…" className="field max-w-xs" /><button className="btn-primary btn-sm">Filter</button></form>
      <Table head={["Time", "Actor", "Action", "Entity", "Change"]}>
        {rows.map((r) => (
          <tr key={r.id}>
            <Td className="whitespace-nowrap text-xs">{formatDateTime(r.createdAt)}</Td>
            <Td className="text-xs">{r.actorLabel ?? r.actorType}</Td>
            <Td className="text-xs font-medium">{r.action}</Td>
            <Td className="text-xs">{r.entityType === "booking" && r.entityId ? <Link className="underline" href={`/admin/reservations/${r.entityId}`}>booking</Link> : r.entityType} <span className="text-muted">{r.entityId?.slice(0, 8)}</span></Td>
            <Td className="text-[11px]">
              {(r.before != null || r.after != null) && (
                <details><summary className="cursor-pointer">details</summary><pre className="max-w-[520px] overflow-x-auto whitespace-pre-wrap">{r.before != null && `before: ${JSON.stringify(r.before, null, 1)}\n`}{r.after != null && `after: ${JSON.stringify(r.after, null, 1)}`}</pre></details>
              )}
            </Td>
          </tr>
        ))}
      </Table>
      <div className="mt-3 flex gap-3 text-sm">{page > 1 && <Link className="underline" href={`?entity=${sp.entity ?? ""}&action=${sp.action ?? ""}&page=${page - 1}`}>← Newer</Link>}{rows.length === 100 && <Link className="underline" href={`?entity=${sp.entity ?? ""}&action=${sp.action ?? ""}&page=${page + 1}`}>Older →</Link>}</div>
    </>
  );
}
