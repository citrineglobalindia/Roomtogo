import { asc, inArray } from "drizzle-orm";
import { ActionButton, AForm, Disclosure } from "@/components/admin/forms";
import { ImagePicker } from "@/components/admin/image-picker";
import { LibraryPicker, Thumb } from "@/components/admin/photo-admin";
import { PageHeader, Panel } from "@/components/admin/ui";
import { db } from "@/db";
import { mediaAssets, siteImages } from "@/db/schema";
import { SITE_IMAGE_SLOTS } from "@/lib/site-images";
import { requireStaffPage } from "@/lib/staff";
import { mediaAction } from "../../actions";

export const metadata = { title: "Site images" };

export default async function SiteImagesAdmin() {
  await requireStaffPage("media.manage");
  const [chosen, library, defaults] = await Promise.all([
    db.select().from(siteImages),
    db.select().from(mediaAssets).orderBy(asc(mediaAssets.createdAt)),
    db.select().from(mediaAssets).where(inArray(mediaAssets.storageKey, SITE_IMAGE_SLOTS.map((d) => d.fallback))),
  ]);
  return (
    <>
      <PageHeader title="Site images" subtitle="Replace the fixed photos used across the website. Room photos are managed under Rooms & units; the gallery under Gallery." />
      <div className="grid gap-6 lg:grid-cols-2">
        {SITE_IMAGE_SLOTS.map((d) => {
          const pick = chosen.find((c) => c.slot === d.slot);
          const current = (pick && library.find((m) => m.id === pick.mediaId)) || defaults.find((m) => m.storageKey === d.fallback);
          return (
            <Panel key={d.slot} title={d.label}>
              <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
                <div>
                  {current ? <Thumb m={current} className="aspect-[16/10]" /> : <div className="flex aspect-[16/10] items-center justify-center rounded bg-cream-200 text-xs text-muted">No photo</div>}
                  <p className="mt-1 text-[11px] text-muted">{pick ? "Custom photo" : current?.isSample ? "Default sample photo (hidden in production)" : "Default photo"}</p>
                </div>
                <div className="space-y-2 text-sm">
                  <p className="text-muted">{d.where}. Best: {d.shape}.</p>
                  <Disclosure label="Upload new photo" className="btn-primary btn-sm">
                    <AForm action={mediaAction} hidden={{ op: "site_upload", slot: d.slot }} submit="Upload & use">
                      <ImagePicker multiple={false} label="Photo" />
                      <label className="block"><span className="field-label">Describe the photo (for screen readers)</span><input className="field" name="alt" placeholder="e.g. Bright double room with city view" /></label>
                    </AForm>
                  </Disclosure>
                  <Disclosure label="Choose from library">
                    <AForm action={mediaAction} hidden={{ op: "site_set", slot: d.slot }} submit="Use selected photo">
                      <LibraryPicker library={library} />
                    </AForm>
                  </Disclosure>
                  {pick && <ActionButton action={mediaAction} hidden={{ op: "site_reset", slot: d.slot }} label="Reset to default" />}
                </div>
              </div>
            </Panel>
          );
        })}
      </div>
    </>
  );
}
