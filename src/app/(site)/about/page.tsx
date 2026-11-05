import type { Metadata } from "next";
import { CtaBand, PageHero, Photo } from "@/components/site/sections";
import { getContent } from "@/domain/content";
import { canPreview, getSiteInfo } from "@/lib/site";
import { siteImagesFor } from "@/lib/site-images";

export async function generateMetadata(): Promise<Metadata> {
  const c = await getContent("about");
  return { title: c.seoTitle, description: c.seoDescription, alternates: { canonical: "/about" } };
}

export default async function About({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const c = await getContent("about", await canPreview(await searchParams));
  const info = await getSiteInfo();
  const { about_primary: a, about_secondary: b } = await siteImagesFor(["about_primary", "about_secondary"]);
  return (
    <>
      <PageHero eyebrow="About us" title={c.title} subtitle={c.intro} />
      <section className="container-site reveal grid gap-14 py-20 sm:py-28 md:grid-cols-2 md:items-start md:gap-16">
        <div className="prose-r2g max-w-prose text-[17px] leading-relaxed text-ink/85 first-letter:float-left first-letter:mr-3 first-letter:font-serif first-letter:text-[64px] first-letter:leading-[0.85] first-letter:text-gold-600">
          {c.body.split(/\n{2,}/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <h2 className="!mt-12 !text-[30px]">Verified details</h2>
          <span className="gold-rule mb-6 !w-16" style={{ background: "linear-gradient(90deg, var(--color-gold-400), transparent)" }} />
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
        <div className="grid gap-10">
          <div className="frame-gold mr-4 rounded-[12px]">
            <Photo photo={a} className="aspect-[16/10] rounded-[12px] shadow-[var(--shadow-lux)]" />
          </div>
          <div className="frame-gold mr-4 rounded-[12px] md:ml-12">
            <Photo photo={b} className="aspect-[16/9] rounded-[12px] shadow-[var(--shadow-lux)]" />
          </div>
        </div>
      </section>
      <CtaBand eyebrow="Ready to stay?" title="Ready for your Bengaluru stay?" subtitle="Comfortable rooms, thoughtful amenities and a more relaxed way to be in the city." phone={info.phone} phoneHref={info.phoneHref} whatsappHref={info.whatsappHref} />
    </>
  );
}
