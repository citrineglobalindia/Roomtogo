import { asc } from "drizzle-orm";
import { ActionButton, AForm, Disclosure, S } from "@/components/admin/forms";
import { ImagePicker } from "@/components/admin/image-picker";
import { LibraryPicker, Thumb } from "@/components/admin/photo-admin";
import { PageHeader, Panel } from "@/components/admin/ui";
import { db } from "@/db";
import { galleryCategories, mediaAssets, roomTypes } from "@/db/schema";
import { requireStaffPage } from "@/lib/staff";
import { categoryAction, mediaAction } from "../../actions";

export const metadata = { title: "Gallery" };
const small = "btn-outline btn-sm !min-h-[32px] !px-2.5 !text-xs";

export default async function GalleryAdmin() {
  await requireStaffPage("media.manage");
  const [all, cats, types] = await Promise.all([
    db.select().from(mediaAssets).orderBy(asc(mediaAssets.gallerySortOrder), asc(mediaAssets.createdAt)),
    db.select().from(galleryCategories).orderBy(asc(galleryCategories.sortOrder)),
    db.select().from(roomTypes).orderBy(asc(roomTypes.sortOrder)),
  ]);
  const catOpts: [string, string][] = cats.map((c) => [c.id, c.name]);
  const shown = all.filter((m) => m.inGallery);
  const roomNotInGallery = types.map((t) => ({ t, photos: all.filter((m) => m.roomTypeId === t.id && !m.inGallery) })).filter((x) => x.photos.length);
  const otherNotInGallery = all.filter((m) => !m.roomTypeId && !m.inGallery);
  return (
    <>
      <PageHeader title="Gallery" subtitle="What visitors see on /gallery and in the home-page photo strip, in this order." />
      <div className="space-y-6">
        <Panel title={`Add room photos to the gallery`}>
          {roomNotInGallery.length === 0 ? (
            <p className="text-sm text-muted">Every room photo is already in the gallery. Upload room photos under Rooms &amp; units.</p>
          ) : (
            <div className="space-y-5">
              {roomNotInGallery.map(({ t, photos }) => (
                <AForm key={t.id} action={mediaAction} hidden={{ op: "gallery_add" }} submit={`Add selected ${t.name} photos`}>
                  <p className="text-sm font-medium">{t.name} <span className="font-normal text-muted">— tick the photos to add</span></p>
                  <LibraryPicker library={photos} name="ids" multiple />
                  <div className="max-w-xs"><S label="Gallery category" name="categoryId" options={[["", "Keep current"], ...catOpts]} /></div>
                </AForm>
              ))}
            </div>
          )}
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Upload directly to the gallery">
            <AForm action={mediaAction} hidden={{ op: "gallery_upload" }} submit="Upload to gallery">
              <ImagePicker label="Photos (up to 8 at once)" />
              <label className="block"><span className="field-label">Caption (optional)</span><input className="field" name="caption" /></label>
              <label className="block"><span className="field-label">Describe the photos (for screen readers)</span><input className="field" name="alt" placeholder="e.g. Reception and lounge at Room2Go" /></label>
              <S label="Gallery category" name="categoryId" options={[["", "No category"], ...catOpts]} />
              <S label="Also attach to a room" name="roomTypeId" options={[["", "No"], ...types.map((t) => [t.id, t.name] as [string, string])]} />
            </AForm>
          </Panel>
          <Panel title="Gallery categories">
            <p className="mb-3 text-sm text-muted">These are the filter buttons on the gallery page.</p>
            <ul className="mb-3 flex flex-wrap gap-2 text-sm">{cats.map((c) => <li key={c.id} className="rounded-full border border-sand px-3 py-1">{c.name}</li>)}</ul>
            <AForm action={categoryAction} submit="Add category" className="flex items-end gap-2"><label className="block flex-1"><span className="field-label">New category</span><input className="field" name="name" required /></label></AForm>
            {otherNotInGallery.length > 0 && (
              <div className="mt-5">
                <Disclosure label={`Add other library photos (${otherNotInGallery.length})`}>
                  <AForm action={mediaAction} hidden={{ op: "gallery_add" }} submit="Add selected">
                    <LibraryPicker library={otherNotInGallery} name="ids" multiple />
                    <S label="Gallery category" name="categoryId" options={[["", "Keep current"], ...catOpts]} />
                  </AForm>
                </Disclosure>
              </div>
            )}
          </Panel>
        </div>

        <Panel title={`In the gallery (${shown.length})`}>
          {shown.length === 0 ? <p className="text-sm text-muted">The gallery is empty.</p> : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {shown.map((m, i) => (
                <li key={m.id} className="rounded-md border border-sand bg-white p-2">
                  <div className="relative">
                    <Thumb m={m} />
                    <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">#{i + 1}</span>
                    {m.status !== "published" && <span className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] uppercase text-white">Draft — hidden</span>}
                    {m.isSample && <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] uppercase text-white">Sample</span>}
                  </div>
                  <p className="mt-1.5 truncate text-xs text-muted">{m.caption ?? m.alt}{m.roomTypeId ? ` · ${types.find((t) => t.id === m.roomTypeId)?.name ?? "room"}` : ""}</p>
                  <AForm action={mediaAction} hidden={{ op: "gallery_category", id: m.id }} submit="Set" submitClass={small} className="mt-1.5 flex items-end gap-1.5 [&_.field]:!min-h-[32px] [&_.field]:!py-1 [&_.field]:!text-xs [&_.field-label]:sr-only">
                    <div className="flex-1"><S label="Category" name="categoryId" defaultValue={m.categoryId} options={[["", "No category"], ...catOpts]} /></div>
                  </AForm>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {i > 0 && <ActionButton action={mediaAction} hidden={{ op: "move_gallery", id: m.id, dir: "up" }} label="← Earlier" className={small} />}
                    {i < shown.length - 1 && <ActionButton action={mediaAction} hidden={{ op: "move_gallery", id: m.id, dir: "down" }} label="Later →" className={small} />}
                    <ActionButton action={mediaAction} hidden={{ op: "gallery_remove", id: m.id }} label="Remove" className={small} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
