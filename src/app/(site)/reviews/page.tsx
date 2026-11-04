import type { Metadata } from "next";
import Link from "next/link";
import { Photo, ReviewCard } from "@/components/site/sections";
import { Icon } from "@/components/ui/icons";
import { getContent } from "@/domain/content";
import { getSiteInfo } from "@/lib/site";
import { publicReviews } from "@/lib/site-data";
import { siteImagesFor } from "@/lib/site-images";

export async function generateMetadata(): Promise<Metadata> {
  const c = await getContent("reviews");
  return { title: c.seoTitle, description: c.seoDescription, alternates: { canonical: "/reviews" } };
}

export default async function Reviews() {
  const [c, reviews, info, hero] = await Promise.all([getContent("reviews"), publicReviews(), getSiteInfo(), siteImagesFor(["reviews_hero"]).then((x) => x.reviews_hero)]);
  const anySample = reviews.some((r) => r.source === "sample");
  return (
    <>
      <section className="relative overflow-hidden bg-forest-950">
        <Photo photo={hero} priority className="absolute inset-0" imgClassName="opacity-80" showSampleBadge={false} />
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/10" />
        <div className="container-site relative py-20 sm:py-24">
          <p className="eyebrow !text-cream-100">{c.eyebrow}</p>
          <h1 className="mt-4 max-w-lg text-[48px] leading-[1.02] !text-white sm:text-[64px]">{c.title}</h1>
          <p className="mt-5 text-lg text-white/90">{c.subtitle}</p>
        </div>
      </section>
      <section className="container-site py-10">
        {anySample && (
          <div className="mb-6 flex items-center justify-center gap-3 rounded-md bg-gold-100 px-4 py-3 text-center font-serif text-[17px] text-gold-700">
            <Icon name="info" size={20} /> Design preview: sample testimonials. Replace with verified guest reviews before publishing.
          </div>
        )}
        {reviews.length === 0 ? (
          <div className="card mx-auto max-w-2xl p-10 text-center">
            <h2 className="text-3xl">{c.emptyTitle}</h2>
            <p className="mt-3 text-muted">{c.emptyBody}</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {reviews.map((r, i) => (
              <ReviewCard key={r.id} r={r} tinted={i % 2 === 1} />
            ))}
          </div>
        )}
        <div className="mt-8 flex flex-col items-start gap-6 rounded-[10px] border border-gold-300 bg-cream-50 p-7 sm:flex-row sm:items-center">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-gold-500 text-gold-600">
            <Icon name="chat" size={28} />
          </span>
          <div className="flex-1 sm:border-l sm:border-gold-300 sm:pl-6">
            <p className="text-[11px] uppercase tracking-[0.2em] text-gold-600">Already stayed with us?</p>
            <h2 className="mt-1 text-3xl">Share your experience.</h2>
            <p className="text-muted">We’d love to hear about your stay and what made it special.</p>
          </div>
          <Link href="/reviews/submit" className="btn-outline">
            Share your experience <Icon name="arrow" size={16} />
          </Link>
        </div>
      </section>
      <section className="bg-forest-900">
        <div className="container-site flex flex-col gap-6 py-12 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-cream-200">Your next stay starts here.</p>
            <h2 className="mt-2 text-[40px] !text-cream-50">Book your stay.</h2>
            <p className="text-cream-200/85">Comfortable rooms, thoughtful amenities and a warm welcome await at room2go.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/book" className="btn-gold">
              Book your stay <Icon name="arrow" size={16} />
            </Link>
            <Link href="/contact" className="btn-ghost-light">
              Contact our team
            </Link>
          </div>
        </div>
      </section>
      <span className="sr-only">{info.name}</span>
    </>
  );
}
