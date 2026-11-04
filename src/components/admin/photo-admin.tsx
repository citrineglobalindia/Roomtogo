import { ActionButton, AForm, CB, Disclosure, F, S } from "@/components/admin/forms";
import { ImagePicker } from "@/components/admin/image-picker";
import { mediaAction } from "@/app/admin/actions";
import type { mediaAssets } from "@/db/schema";

type Media = typeof mediaAssets.$inferSelect;

export function Thumb({ m, className = "aspect-[4/3]" }: { m: Pick<Media, "url" | "alt">; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={m.url} alt={m.alt} loading="lazy" className={`w-full rounded object-cover ${className}`} />;
}

const small = "btn-outline btn-sm !min-h-[32px] !px-2.5 !text-xs";

/** Photos of one room category: upload, cover, order, gallery toggle, remove. */
export function RoomPhotos({ roomTypeId, roomName, coverId, photos, library, categories }: { roomTypeId: string; roomName: string; coverId: string | null; photos: Media[]; library: Media[]; categories: [string, string][] }) {
  return (
    <div className="mt-4 rounded-md border border-sand bg-cream-50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-serif text-lg">Room photos <span className="text-sm text-muted">({photos.length})</span></h3>
        <p className="text-xs text-muted">The cover shows on room cards; all published photos show on the room page in this order.</p>
      </div>
      {photos.length === 0 ? (
        <p className="mb-3 text-sm text-muted">No photos yet — upload the first one below.</p>
      ) : (
        <ul className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {photos.map((m, i) => (
            <li key={m.id} className="rounded-md border border-sand bg-white p-2">
              <div className="relative">
                <Thumb m={m} />
                <span className="absolute left-1.5 top-1.5 flex gap-1">
                  {m.id === coverId && <span className="rounded bg-forest-800 px-1.5 py-0.5 text-[10px] font-medium uppercase text-white">Cover</span>}
                  {m.inGallery && <span className="rounded bg-gold-500 px-1.5 py-0.5 text-[10px] font-medium uppercase text-white">Gallery</span>}
                  {m.status !== "published" && <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] uppercase text-white">Draft</span>}
                  {m.isSample && <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] uppercase text-white">Sample</span>}
                </span>
              </div>
              <p className="mt-1.5 truncate text-xs text-muted" title={m.alt}>{m.caption ?? m.alt}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {m.id !== coverId && <ActionButton action={mediaAction} hidden={{ op: "set_cover", id: m.id }} label="Make cover" className={small} />}
                {i > 0 && <ActionButton action={mediaAction} hidden={{ op: "move_room", id: m.id, dir: "up" }} label="←" className={small} />}
                {i < photos.length - 1 && <ActionButton action={mediaAction} hidden={{ op: "move_room", id: m.id, dir: "down" }} label="→" className={small} />}
                {m.inGallery ? (
                  <ActionButton action={mediaAction} hidden={{ op: "gallery_remove", id: m.id }} label="Hide from gallery" className={small} />
                ) : (
                  <ActionButton action={mediaAction} hidden={{ op: "gallery_add", id: m.id }} label="Add to gallery" className={small} />
                )}
                <ActionButton action={mediaAction} hidden={{ op: "detach_room", id: m.id }} label="Remove" className={small} confirm={`Remove this photo from ${roomName}? It stays in the photo library.`} />
                <ActionButton action={mediaAction} hidden={{ op: "delete", id: m.id }} label="Delete" className={`${small} !text-danger`} confirm="Delete this photo permanently?" />
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Disclosure label="Upload photos" className="btn-primary btn-sm">
          <AForm action={mediaAction} hidden={{ op: "room_upload", roomTypeId }} submit="Upload to room">
            <ImagePicker label="Photos (up to 8 at once)" />
            <F label="Caption (optional)" name="caption" placeholder={roomName} />
            <F label="Describe the photos (for screen readers)" name="alt" placeholder={`${roomName} at Room2Go`} />
            <CB label="Also show these in the website gallery" name="inGallery" />
            {categories.length > 0 && <S label="Gallery category" name="categoryId" options={[["", "None"], ...categories]} />}
            <CB label="Make the first uploaded photo the cover" name="makeCover" defaultChecked={!coverId} />
          </AForm>
        </Disclosure>
        {library.length > 0 && (
          <Disclosure label="Add from photo library">
            <AForm action={mediaAction} hidden={{ op: "attach_room", roomTypeId }} submit="Add to room">
              <LibraryPicker library={library} />
            </AForm>
          </Disclosure>
        )}
      </div>
    </div>
  );
}

/** Radio grid of existing photos (name="id"). */
export function LibraryPicker({ library, name = "id", multiple = false }: { library: Media[]; name?: string; multiple?: boolean }) {
  return (
    <ul className="grid max-h-[360px] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 lg:grid-cols-6">
      {library.map((m) => (
        <li key={m.id}>
          <label className="block cursor-pointer rounded border-2 border-transparent p-0.5 has-[:checked]:border-forest-800">
            <input type={multiple ? "checkbox" : "radio"} name={name} value={m.id} required={!multiple} className="sr-only" />
            <Thumb m={m} className="aspect-square" />
            <span className="mt-0.5 block truncate text-[10px] text-muted">{m.caption ?? m.alt}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
