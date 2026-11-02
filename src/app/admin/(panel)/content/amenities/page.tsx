import { asc } from "drizzle-orm";
import { AForm, CB, Disclosure, F, S } from "@/components/admin/forms";
import { Badge, PageHeader, Panel, Table, Td, Unconfirmed } from "@/components/admin/ui";
import { db } from "@/db";
import { amenities } from "@/db/schema";
import { requireStaffPage } from "@/lib/staff";
import { amenityAction } from "../../../actions";

export const metadata = { title: "Amenities" };
const ICONS = ["wifi", "restaurant", "parking", "support", "bell", "laundry", "travel", "bed", "check", "clock", "lock"];

export default async function Amenities() {
  const st = await requireStaffPage("content.manage");
  const rows = await db.select().from(amenities).orderBy(asc(amenities.sortOrder));
  const fields = (a?: (typeof rows)[number]) => (
    <div className="grid gap-3 sm:grid-cols-3">
      <F label="Name" name="name" defaultValue={a?.name} required />
      <F label="Short description" name="description" defaultValue={a?.description} />
      <S label="Icon" name="icon" defaultValue={a?.icon ?? "check"} options={ICONS.map((i) => [i, i])} />
      <S label="Where" name="scope" defaultValue={a?.scope ?? "shared"} options={[["in_room", "In room (private)"], ["shared", "Shared facility"], ["service", "Service"]]} />
      <S label="Charge" name="charge" defaultValue={a?.charge ?? "unknown"} options={[["included", "Included"], ["chargeable", "Chargeable"], ["on_request", "On request"], ["unknown", "Not confirmed"]]} />
      <S label="Status" name="status" defaultValue={a?.status ?? "draft"} options={[["draft", "Draft"], ["published", "Published"]]} />
      <F label="Order" name="sortOrder" type="number" defaultValue={a?.sortOrder ?? 0} />
      <CB label="Show in homepage strip" name="showInStrip" defaultChecked={a?.showInStrip} />
      <CB label={`Verified by Room2Go${st.role === "owner" ? "" : " (owner only)"}`} name="verified" defaultChecked={a?.verified} />
    </div>
  );
  return (
    <>
      <PageHeader title="Amenities" subtitle="Only verified + published amenities appear on the production site." />
      <Table head={["Amenity", "Where", "Charge", "Status", ""]}>
        {rows.map((a) => (
          <tr key={a.id}>
            <Td className="font-medium">{a.name}<Unconfirmed show={!a.verified}>Unverified</Unconfirmed></Td><Td className="capitalize">{a.scope.replace("_", " ")}</Td><Td className="capitalize">{a.charge.replace("_", " ")}</Td><Td><Badge value={a.status} /></Td>
            <Td><Disclosure label="Edit"><AForm action={amenityAction} hidden={{ id: a.id }}>{fields(a)}</AForm></Disclosure></Td>
          </tr>
        ))}
      </Table>
      <Panel title="Add amenity" className="mt-6"><AForm action={amenityAction} submit="Add">{fields()}</AForm></Panel>
    </>
  );
}
