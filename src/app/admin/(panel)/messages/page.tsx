import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ActionButton } from "@/components/admin/forms";
import { Badge, PageHeader, Table, Td } from "@/components/admin/ui";
import { db } from "@/db";
import { notificationOutbox } from "@/db/schema";
import { formatDateTime } from "@/lib/dates";
import { requireStaffPage } from "@/lib/staff";
import { requeueAction } from "../../actions";

export const metadata = { title: "Messages" };
const STATUSES = ["pending", "sending", "sent", "failed", "captured_demo", "blocked_unconfigured"] as const;

export default async function Messages({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const st = await requireStaffPage("outbox.view");
  const { status } = await searchParams;
  const rows = await db.select().from(notificationOutbox).where(status && (STATUSES as readonly string[]).includes(status) ? eq(notificationOutbox.status, status as "sent") : undefined).orderBy(desc(notificationOutbox.createdAt)).limit(150);
  return (
    <>
      <PageHeader title="Messages (email outbox)" subtitle="Delivery status for every transactional email. A failed email never changes a booking." actions={st.can("settings.manage") ? <ActionButton action={requeueAction} hidden={{ id: "" }} label="Retry all failed / blocked" className="btn-primary btn-sm" /> : null} />
      <nav className="mb-3 flex flex-wrap gap-2 text-sm">{["", ...STATUSES].map((s) => <Link key={s} href={`?status=${s}`} className={`rounded px-2 py-1 ${status === s || (!status && !s) ? "bg-forest-800 text-white" : "bg-white"}`}>{s ? s.replace(/_/g, " ") : "all"}</Link>)}</nav>
      <Table head={["Created", "Template", "To", "Subject", "Status", "Attempts", "Error", ""]} empty="No messages.">
        {rows.map((m) => (
          <tr key={m.id}>
            <Td className="text-xs">{formatDateTime(m.createdAt)}</Td><Td className="text-xs">{m.template}</Td><Td className="text-xs">{m.toAddress}</Td><Td className="text-xs">{m.subject}</Td>
            <Td><Badge value={m.status} /></Td><Td>{m.attempts}</Td><Td className="max-w-[240px] truncate text-xs text-danger">{m.lastError}</Td>
            <Td>{st.can("settings.manage") && ["failed", "blocked_unconfigured"].includes(m.status) && <ActionButton action={requeueAction} hidden={{ id: m.id }} label="Retry" />}</Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
