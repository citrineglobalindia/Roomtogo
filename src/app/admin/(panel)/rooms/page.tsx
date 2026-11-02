import { asc, eq } from "drizzle-orm";
import { AForm, CB, Disclosure, F, S, TA } from "@/components/admin/forms";
import { Badge, PageHeader, Panel, Table, Td, Unconfirmed } from "@/components/admin/ui";
import { db } from "@/db";
import { amenities, mediaAssets, roomTypeAmenities, roomTypes, roomUnits } from "@/db/schema";
import { requireStaffPage } from "@/lib/staff";
import { saveRoomTypeAction, saveUnitAction } from "../../actions";

export const metadata = { title: "Rooms & units" };

type T = typeof roomTypes.$inferSelect;

function TypeFields({ t, media, ams, linked }: { t?: T; media: { id: string; alt: string }[]; ams: { id: string; name: string }[]; linked: string[] }) {
  return (
    <>
      {t && <input type="hidden" name="id" value={t.id} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <F label="Name" name="name" defaultValue={t?.name} required />
        <F label="URL slug" name="slug" defaultValue={t?.slug} required hint="/rooms/<slug>" />
        <F label="Sort order" name="sortOrder" type="number" defaultValue={t?.sortOrder ?? 0} />
      </div>
      <F label="Short summary" name="summary" defaultValue={t?.summary} />
      <TA label="Public description" name="description" defaultValue={t?.description} rows={4} />
      <div className="grid gap-3 sm:grid-cols-4">
        <F label="Guests in base rate" name="baseOccupancy" type="number" min={1} defaultValue={t?.baseOccupancy ?? 2} />
        <F label="Max adults" name="maxAdults" type="number" min={1} defaultValue={t?.maxAdults ?? 2} />
        <F label="Max children" name="maxChildren" type="number" min={0} defaultValue={t?.maxChildren ?? 0} />
        <F label="Max guests" name="maxOccupancy" type="number" min={1} defaultValue={t?.maxOccupancy ?? 2} />
        <F label="Extra beds allowed" name="extraBedsAllowed" type="number" min={0} defaultValue={t?.extraBedsAllowed ?? 0} />
        <F label="Beds" name="bedConfiguration" defaultValue={t?.bedConfiguration} />
        <F label="Size (sq ft)" name="sizeSqft" type="number" defaultValue={t?.sizeSqft} />
        <S label="Cover photo" name="coverMediaId" defaultValue={t?.coverMediaId} options={[["", "None"], ...media.map((m) => [m.id, m.alt] as [string, string])]} />
      </div>
      <TA label="Inclusions (one per line)" name="inclusions" defaultValue={t?.inclusions.join("\n")} rows={3} />
      <fieldset><legend className="field-label">Amenities</legend><div className="flex flex-wrap gap-3">{ams.map((a) => <label key={a.id} className="flex items-center gap-1 text-sm"><input type="checkbox" name="amenityIds" value={a.id} defaultChecked={linked.includes(a.id)} />{a.name}</label>)}</div></fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <S label="Operational status" name="status" defaultValue={t?.status ?? "active"} options={[["active", "Active"], ["inactive", "Inactive (soft-disabled; history kept)"]]} />
        <S label="Website" name="publicStatus" defaultValue={t?.publicStatus ?? "draft"} options={[["draft", "Draft (hidden)"], ["published", "Published"]]} />
        <div className="self-end"><CB label="Facts confirmed by Room2Go" name="factsConfirmed" defaultChecked={t?.factsConfirmed} /></div>
      </div>
    </>
  );
}

export default async function Rooms() {
  const st = await requireStaffPage("inventory.view");
  const edit = st.can("inventory.manage");
  const [types, units, media, ams, links] = await Promise.all([
    db.select().from(roomTypes).orderBy(asc(roomTypes.sortOrder)),
    db.select().from(roomUnits).orderBy(asc(roomUnits.sortOrder), asc(roomUnits.label)),
    db.select({ id: mediaAssets.id, alt: mediaAssets.alt }).from(mediaAssets),
    db.select({ id: amenities.id, name: amenities.name }).from(amenities).orderBy(asc(amenities.sortOrder)),
    db.select().from(roomTypeAmenities),
  ]);
  void eq;
  return (
    <>
      <PageHeader title="Rooms & units" subtitle="Room categories are what guests choose; physical units are what gets allocated. A stay always stays on one unit unless staff move it." />
      <div className="space-y-6">
        {types.map((t) => (
          <Panel key={t.id} title={t.name} actions={<span className="flex gap-1"><Badge value={t.status} /><Badge value={t.publicStatus} /></span>}>
            <p className="text-sm">Sleeps {t.maxOccupancy} (max {t.maxAdults} adults, {t.maxChildren} children) · base occupancy {t.baseOccupancy} <Unconfirmed show={!t.factsConfirmed} /></p>
            <div className="mt-3">
              <Table head={["Unit", "Floor", "Status", "Online sale", "Notes", ""]} empty="No units yet.">
                {units.filter((u) => u.roomTypeId === t.id).map((u) => (
                  <tr key={u.id}>
                    <Td className="font-medium">{u.label}{u.isSample && <span className="badge-sample ml-1">sample</span>}</Td>
                    <Td>{u.floor}</Td>
                    <Td><Badge value={u.status} /></Td>
                    <Td>{u.directSale ? "Yes" : "No (other channels)"}</Td>
                    <Td className="text-xs text-muted">{u.notes}</Td>
                    <Td>{edit && (
                      <Disclosure label="Edit">
                        <AForm action={saveUnitAction} hidden={{ id: u.id }}>
                          <UnitFields u={u} types={types} />
                        </AForm>
                      </Disclosure>
                    )}</Td>
                  </tr>
                ))}
              </Table>
            </div>
            {edit && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Disclosure label="Edit category">
                  <AForm action={saveRoomTypeAction}><TypeFields t={t} media={media} ams={ams} linked={links.filter((l) => l.roomTypeId === t.id).map((l) => l.amenityId)} /></AForm>
                </Disclosure>
                <Disclosure label="Add unit">
                  <AForm action={saveUnitAction} submit="Add unit"><UnitFields types={types} defaultType={t.id} /></AForm>
                </Disclosure>
              </div>
            )}
          </Panel>
        ))}
        {edit && (
          <Panel title="Add room category">
            <AForm action={saveRoomTypeAction} submit="Create category"><TypeFields media={media} ams={ams} linked={[]} /></AForm>
          </Panel>
        )}
      </div>
    </>
  );
}

function UnitFields({ u, types, defaultType }: { u?: typeof roomUnits.$inferSelect; types: T[]; defaultType?: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <F label="Unit identifier" name="label" defaultValue={u?.label} required />
      <S label="Category" name="roomTypeId" defaultValue={u?.roomTypeId ?? defaultType} options={types.map((t) => [t.id, t.name])} />
      <F label="Floor" name="floor" defaultValue={u?.floor} />
      <S label="Status" name="status" defaultValue={u?.status ?? "active"} options={[["active", "Active"], ["inactive", "Inactive"]]} />
      <F label="Sort order" name="sortOrder" type="number" defaultValue={u?.sortOrder ?? 0} />
      <F label="Notes (staff)" name="notes" defaultValue={u?.notes} />
      <CB label="Sold on website (direct allocation)" name="directSale" defaultChecked={u?.directSale ?? true} />
      <CB label="Sample/demo unit" name="isSample" defaultChecked={u?.isSample ?? false} />
    </div>
  );
}
