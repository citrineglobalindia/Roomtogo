import { asc } from "drizzle-orm";
import { ActionButton, AForm, Disclosure, F, S, TA } from "@/components/admin/forms";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { db } from "@/db";
import { faqs } from "@/db/schema";
import { requireStaffPage } from "@/lib/staff";
import { faqAction } from "../../../actions";

export const metadata = { title: "FAQs" };

export default async function Faqs() {
  await requireStaffPage("content.manage");
  const rows = await db.select().from(faqs).orderBy(asc(faqs.sortOrder));
  const fields = (f?: (typeof rows)[number]) => (
    <>
      <F label="Question" name="question" defaultValue={f?.question} required />
      <TA label="Answer" name="answer" defaultValue={f?.answer} required rows={3} />
      <div className="grid grid-cols-2 gap-3"><F label="Order" name="sortOrder" type="number" defaultValue={f?.sortOrder ?? 0} /><S label="Status" name="status" defaultValue={f?.status ?? "draft"} options={[["draft", "Draft"], ["published", "Published"]]} /></div>
    </>
  );
  return (
    <>
      <PageHeader title="FAQs" />
      <div className="space-y-3">
        {rows.map((f) => (
          <Panel key={f.id}>
            <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium">{f.question}</p><p className="text-sm text-muted">{f.answer}</p></div><Badge value={f.status} /></div>
            <div className="mt-2 flex gap-2"><Disclosure label="Edit"><AForm action={faqAction} hidden={{ id: f.id }}>{fields(f)}</AForm></Disclosure><ActionButton action={faqAction} hidden={{ op: "delete", id: f.id }} label="Delete" confirm="Delete this FAQ?" /></div>
          </Panel>
        ))}
        <Panel title="Add FAQ"><AForm action={faqAction} submit="Add">{fields()}</AForm></Panel>
      </div>
    </>
  );
}
