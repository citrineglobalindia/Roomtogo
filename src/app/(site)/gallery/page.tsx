import type { Metadata } from "next";
import Link from "next/link";
import { GalleryGrid } from "@/components/site/gallery";
import { PageHero } from "@/components/site/sections";
import { Icon } from "@/components/ui/icons";
import { getContent } from "@/domain/content";
import { galleryCats, galleryItems } from "@/lib/site-data";

export async function generateMetadata(): Promise<Metadata> {
  const c = await getContent("gallery");
  return { title: c.seoTitle, description: c.seoDescription, alternates: { canonical: "/gallery" } };
}

export default async function Gallery() {
  const [c, items, cats] = await Promise.all([getContent("gallery"), galleryItems(), galleryCats()]);
  const usedCats = cats.filter((k) => items.some((i) => i.category === k.slug));
  return (
    <>
      <PageHero title={c.title} subtitle={c.subtitle} />
      <section className="container-site py-10">
        <GalleryGrid items={items} categories={usedCats.map((k) => ({ slug: k.slug, name: k.name }))} />
        {items.some((i) => i.isSample) && <p className="mt-4 text-xs text-muted">Illustrative property gallery — sample images to be replaced with Room2Go photographs.</p>}
      </section>
      <section className="relative overflow-hidden bg-forest-900">
        <div className="container-site flex flex-col items-start gap-6 py-14 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[38px] !text-cream-50 sm:text-[46px]">
            {c.ctaTitle}
            <br />
            <span className="text-gold-300">{c.ctaAccent}</span>
          </h2>
          <Link href="/book" className="btn rounded-full border border-gold-300 px-7 text-cream-50 hover:bg-white/10">
            Check availability <Icon name="arrow" size={16} />
          </Link>
        </div>
      </section>
    </>
  );
}
