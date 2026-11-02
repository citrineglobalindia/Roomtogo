import type { Metadata } from "next";
import { EnquiryForm } from "@/components/site/forms";
import { PageHero } from "@/components/site/sections";
import { getContent } from "@/domain/content";
import { getSettings } from "@/domain/settings";
import { todayInTz } from "@/lib/dates";

export async function generateMetadata(): Promise<Metadata> {
  const c = await getContent("extended");
  return { title: c.seoTitle, description: c.seoDescription, alternates: { canonical: "/extended-stays" } };
}

export default async function Extended({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const [c, s] = await Promise.all([getContent("extended"), getSettings()]);
  return (
    <>
      <PageHero eyebrow="Extended & corporate stays" title={c.title} subtitle={c.subtitle} />
      <section className="container-site grid gap-10 py-14 lg:grid-cols-[1fr_1.5fr]">
        <div className="text-muted">
          <p>{c.body}</p>
          <ul className="mt-6 space-y-2 text-sm">
            <li>• Weekly and monthly stays</li>
            <li>• Corporate and team accommodation</li>
            <li>• Quotes prepared by our team — no automatic long-stay pricing</li>
          </ul>
        </div>
        <div className="card p-6 sm:p-8">
          <EnquiryForm kind={sp.type === "corporate" ? "corporate" : "extended_stay"} today={todayInTz(s.timezone)} defaults={{ checkIn: sp.checkIn ?? "", checkOut: sp.checkOut ?? "", guests: sp.guests ?? "1" }} />
        </div>
      </section>
    </>
  );
}
