import { asc, eq } from "drizzle-orm";
import { ActionButton, AForm, F, S } from "@/components/admin/forms";
import { Badge, PageHeader, Panel, Table, Td } from "@/components/admin/ui";
import { db } from "@/db";
import { staffMembers, user } from "@/db/schema";
import { formatDateTime } from "@/lib/dates";
import { ROLE_LABELS } from "@/lib/permissions";
import { requireStaffPage } from "@/lib/staff";
import { staffAction } from "../../actions";

export const metadata = { title: "Staff" };
const ROLES: [string, string][] = Object.entries(ROLE_LABELS);

export default async function Staff() {
  const me = await requireStaffPage("staff.manage");
  const rows = await db.select({ m: staffMembers, u: user }).from(staffMembers).innerJoin(user, eq(user.id, staffMembers.userId)).orderBy(asc(user.name));
  return (
    <>
      <PageHeader title="Staff" subtitle="Individual accounts only — no shared logins. Public guest accounts can never be given staff roles except by an owner here." />
      <Table head={["Name", "Email", "Role", "Status", "2FA", "Since", ""]}>
        {rows.map(({ m, u }) => (
          <tr key={m.id}>
            <Td>{u.name}{m.id === me.staffId && <span className="ml-1 text-xs text-muted">(you)</span>}</Td>
            <Td>{u.email}</Td>
            <Td>
              <AForm action={staffAction} hidden={{ op: "role", staffId: m.id }} submit="Change" className="flex items-end gap-2">
                <S label="" name="role" defaultValue={m.role} options={ROLES} />
              </AForm>
            </Td>
            <Td><Badge value={m.active ? "active" : "inactive"} /></Td>
            <Td>{u.twoFactorEnabled ? "On" : "Off"}</Td>
            <Td className="text-xs">{formatDateTime(m.createdAt)}</Td>
            <Td>{m.id !== me.staffId && <ActionButton action={staffAction} hidden={{ op: "toggle", staffId: m.id }} label={m.active ? "Deactivate" : "Reactivate"} confirm={m.active ? "Deactivate and sign out this staff member?" : undefined} />}</Td>
          </tr>
        ))}
      </Table>
      <Panel title="Invite staff member" className="mt-6 max-w-xl">
        <AForm action={staffAction} hidden={{ op: "invite" }} submit="Send invitation">
          <F label="Name" name="name" required />
          <F label="Email" name="email" type="email" required />
          <S label="Role" name="role" options={ROLES} defaultValue="reception" />
          <p className="text-xs text-muted">Reception: reservations, arrivals, guest contact, enquiries and offline payments (no refunds, staff or settings). Content editor: website content, photos, FAQs and reviews only (no guest financial data).</p>
        </AForm>
      </Panel>
    </>
  );
}
