import Link from "next/link";
import { AForm } from "@/components/admin/forms";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { CONTENT_DEFAULTS, getContentRow, type ContentKey } from "@/domain/content";
import { formatDateTime } from "@/lib/dates";
import { requireStaffPage } from "@/lib/staff";
import { contentAction } from "../../actions";
import { ContentFields } from "./fields";

export const metadata = { title: "Page content" };
const PAGES: Record<ContentKey, [string, string]> = {
  home: ["Homepage", "/"], about: ["About", "/about"], rooms: ["Rooms", "/rooms"], amenities: ["Amenities", "/amenities"], gallery: ["Gallery", "/gallery"], reviews: ["Reviews", "/reviews"], contact: ["Contact", "/contact"], extended: ["Extended stays", "/extended-stays"],
};

export default async function Content({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  await requireStaffPage("content.manage");
  const { key: k } = await searchParams;
  const key = (k && k in CONTENT_DEFAULTS ? k : "home") as ContentKey;
  const row = await getContentRow(key);
  const values = { ...CONTENT_DEFAULTS[key], ...((row?.draft as object) ?? {}) } as Record<string, string>;
  const unpublished = row && JSON.stringify(row.draft) !== JSON.stringify(row.published);
  return (
    <>
      <PageHeader title="Page content" subtitle="Edit text as a draft, preview it on the live page (only you see drafts), then publish." />
      <nav className="mb-4 flex flex-wrap gap-2 text-sm">{(Object.keys(PAGES) as ContentKey[]).map((p) => <Link key={p} href={`?key=${p}`} aria-current={p === key ? "page" : undefined} className={`rounded px-3 py-1 ${p === key ? "bg-forest-800 text-white" : "bg-white"}`}>{PAGES[p][0]}</Link>)}</nav>
      <Panel title={PAGES[key][0]} actions={<span className="flex items-center gap-2">{row?.publishedAt ? <span className="text-xs text-muted">Published {formatDateTime(row.publishedAt)}</span> : <Badge value="draft" label="Using defaults" />}{unpublished && <Badge value="pending" label="Unpublished draft" />}<Link href={`${PAGES[key][1]}?preview=1`} target="_blank" className="btn-outline btn-sm">Preview draft</Link></span>}>
        <AForm action={contentAction} hidden={{ key }} submit={null}>
          <ContentFields values={values} />
          <div className="flex gap-2">
            <button name="op" value="draft" className="btn-outline btn-sm">Save draft</button>
            <button name="op" value="publish" className="btn-primary btn-sm">Save &amp; publish</button>
          </div>
        </AForm>
        <p className="mt-3 text-xs text-muted">Avoid unverified claims (distances, awards, facilities) — keep copy to facts Room2Go has confirmed.</p>
      </Panel>
    </>
  );
}
