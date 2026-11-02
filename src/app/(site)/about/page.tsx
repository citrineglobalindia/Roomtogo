import type { Metadata } from "next";
import { CtaBand, PageHero, Photo } from "@/components/site/sections";
import { getContent } from "@/domain/content";
import { canPreview, getSiteInfo } from "@/lib/site";
import { mediaByStorageKey } from "@/lib/site-data";

export async function generateMetadata(): Promise<Metadata> {
  const c = await getContent("about");
  return { title: c.seoTitle, description: c.seoDescription, alternates: { canonical: "/about" } };
}

export default async function About({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const c = await getContent("about", await canPreview(await searchParams));
  const info = await getSiteInfo();
  const [a, b] = await Promise.all([mediaByStorageKey("sample/lobby.webp"), mediaByStorageKey("sample/lounge.webp")]);
  return (
    <>
      <PageHero eyebrow="About us" title={c.title} subtitle={c.intro} />
      <section className="container-site grid gap-10 py-16 md:grid-cols-2 md:items-start">
        <div className="prose-r2g max-w-prose text-[17px] text-ink/85">
          {c.body.split(/\n{2,}/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <h2>Verified details</h2>
          <ul>
            <li>{info.address}</li>
            <li>
              Phone: <a className="underline" href={info.phoneHref}>{info.phone}</a>
            </li>
            <li>
              Email: <a className="underline" href={`mailto:${info.email}`}>{info.email}</a>
            </li>
          </ul>
        </div>
        <div className="grid gap-4">
          <Photo photo={a} className="aspect-[16/10] rounded-[10px]" />
          <Photo photo={b} className="aspect-[16/9] rounded-[10px]" />
        </div>
      </section>
      <CtaBand eyebrow="Ready to stay?" title="Ready for your Bengaluru stay?" subtitle="Comfortable rooms, thoughtful amenities and a more relaxed way to be in the city." phone={info.phone} phoneHref={info.phoneHref} whatsappHref={info.whatsappHref} />
    </>
  );
}
