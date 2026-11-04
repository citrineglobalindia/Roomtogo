import { asc } from "drizzle-orm";
import { ActionButton, AForm, CB, Disclosure, F, S } from "@/components/admin/forms";
import { ImagePicker } from "@/components/admin/image-picker";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { db } from "@/db";
import { galleryCategories, mediaAssets, roomTypes } from "@/db/schema";
import { storageConfig } from "@/lib/config";
import { requireStaffPage } from "@/lib/staff";
import { categoryAction, mediaAction } from "../../../actions";

export const metadata = { title: "Photo library" };

export default async function Media() {
  await requireStaffPage("media.manage");
  const [rows, cats, types] = await Promise.all([db.select().from(mediaAssets).orderBy(asc(mediaAssets.sortOrder)), db.select().from(galleryCategories).orderBy(asc(galleryCategories.sortOrder)), db.select().from(roomTypes)]);
  const catOpts: [string, string][] = [["", "No category"], ...cats.map((c) => [c.id, c.name] as [string, string])];
  const typeOpts: [string, string][] = [["", "Not a room photo"], ...types.map((t) => [t.id, t.name] as [string, string])];
  const store = storageConfig();
  return (
    <>
      <PageHeader title="Photo library" subtitle="Every uploaded photo. Room photos: Rooms & units · Gallery order: Gallery · Fixed site photos: Site images. Uploads are re-encoded to WebP (metadata such as GPS is stripped). Images marked SAMPLE are illustrative and are hidden in production." />
      <div className="grid gap-6 xl:grid-cols-[1fr_2fr]">
        <div className="space-y-6">
          <Panel title="Upload photo">
            {store.provider === "none" ? <p className="text-sm text-danger">{store.reason}</p> : (
              <AForm action={mediaAction} hidden={{ op: "upload" }} submit="Upload">
                <ImagePicker label="Photos (JPEG, PNG or WebP — up to 8 at once)" />
                <F label="Alt text (describe the photo)" name="alt" required />
                <F label="Caption" name="caption" />
                <S label="Gallery category" name="categoryId" options={catOpts} />
                <S label="Room category" name="roomTypeId" options={typeOpts} />
                <CB label="Show in gallery" name="inGallery" defaultChecked />
                <CB label="Publish now" name="publish" defaultChecked />
              </AForm>
            )}
          </Panel>
          <Panel title="Gallery categories">
            <ul className="mb-3 text-sm">{cats.map((c) => <li key={c.id}>{c.name}</li>)}</ul>
            <AForm action={categoryAction} submit="Add category" className="flex items-end gap-2"><F label="Name" name="name" required /></AForm>
          </Panel>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((m) => (
            <li key={m.id} className="overflow-hidden rounded-lg border border-sand bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.alt} className="aspect-[4/3] w-full object-cover" loading="lazy" />
              <div className="space-y-1 p-3 text-xs">
                <div className="flex flex-wrap gap-1"><Badge value={m.status} />{m.isSample && <span className="badge-sample">SAMPLE</span>}{m.inGallery && <Badge value="active" label="gallery" />}</div>
                <p className="font-medium">{m.caption ?? "—"}</p>
                <p className="text-muted">{m.alt}</p>
                <div className="flex gap-2 pt-1">
                  <Disclosure label="Edit">
                    <AForm action={mediaAction} hidden={{ op: "update", id: m.id }}>
                      <F label="Alt text" name="alt" defaultValue={m.alt} required />
                      <F label="Caption" name="caption" defaultValue={m.caption} />
                      <S label="Category" name="categoryId" defaultValue={m.categoryId} options={catOpts} />
                      <S label="Room" name="roomTypeId" defaultValue={m.roomTypeId} options={typeOpts} />
                      <S label="Status" name="status" defaultValue={m.status} options={[["draft", "Draft"], ["published", "Published"]]} />
                      <F label="Order" name="sortOrder" type="number" defaultValue={m.sortOrder} />
                      <CB label="Show in gallery" name="inGallery" defaultChecked={m.inGallery} />
                    </AForm>
                  </Disclosure>
                  <ActionButton action={mediaAction} hidden={{ op: "delete", id: m.id }} label="Delete" confirm="Delete this photo?" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
