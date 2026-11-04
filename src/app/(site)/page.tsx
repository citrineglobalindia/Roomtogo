import type { Metadata } from "next";
import Link from "next/link";
import { SwipeRow } from "@/components/site/swipe";
import { BookingSearchPanel, CtaBand, Eyebrow, FaqList, Photo, ReviewCard, RoomCard, SectionHead, AmenityItem } from "@/components/site/sections";
import { GalleryStrip } from "@/components/site/gallery";
import { Icon } from "@/components/ui/icons";
import { getContent } from "@/domain/content";
import { getSettings } from "@/domain/settings";
import { isProduction } from "@/lib/config";
import { todayInTz } from "@/lib/dates";
import { canPreview, getSiteInfo } from "@/lib/site";
import { siteImagesFor } from "@/lib/site-images";
import { galleryItems, publicAmenities, publicFaqs, publicReviews, roomCards } from "@/lib/site-data";
import { publicBaseUrl } from "@/lib/config";

type SP = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata(): Promise<Metadata> {
  const c = await getContent("home");
  return { title: c.seoTitle, description: c.seoDescription, alternates: { canonical: "/" }, openGraph: { title: c.seoTitle, description: c.seoDescription, url: "/" } };
}

export default async function Home({ searchParams }: { searchParams: SP }) {
  const preview = await canPreview(await searchParams);
  const [c, s, info, rooms, ams, gallery, reviews, faqs] = await Promise.all([
    getContent("home", preview),
    getSettings(),
    getSiteInfo(),
    roomCards(),
    publicAmenities(),
    galleryItems(),
    publicReviews(),
    publicFaqs(),
  ]);
  const { home_hero: hero, home_about: about, home_location: entrance } = await siteImagesFor(["home_hero", "home_about", "home_location"]);
  const strip = ams.filter((a) => a.showInStrip).slice(0, 4);
  const showUnverified = !isProduction();
  const today = todayInTz(s.timezone);
  // Structured data: verified facts only (no ratings, prices or review markup).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    name: s.name,
    url: publicBaseUrl(),
    telephone: s.phone,
    email: s.email,
    address: { "@type": "PostalAddress", streetAddress: s.addressLine, addressLocality: s.city, addressRegion: s.region, postalCode: s.postalCode, addressCountry: s.country },
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {preview && <p className="bg-forest-800 py-1 text-center text-xs text-white">Previewing draft content</p>}
      {/* HERO: image + heading left, booking panel right */}
      <section className="sm:mx-auto sm:w-full sm:max-w-[1240px] sm:px-8 sm:pt-6">
        <div className="relative overflow-hidden sm:rounded-[10px] sm:bg-forest-900">
          <Photo photo={hero} priority className="absolute inset-x-0 top-0 h-[400px] w-full bg-forest-900 sm:inset-0 sm:h-full" imgClassName="opacity-90" showSampleBadge={false} />
          <div className="absolute inset-x-0 top-0 h-[400px] bg-gradient-to-t from-black/75 via-black/30 to-black/10 sm:inset-0 sm:h-full sm:bg-gradient-to-r sm:from-black/65 sm:via-black/35 sm:to-transparent" />
          <div className="relative grid gap-6 px-4 sm:gap-8 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center lg:p-12">
            <div className="animate-fade-up flex min-h-[330px] max-w-xl flex-col justify-end px-1 pb-2 pt-10 text-white sm:block sm:min-h-0 sm:px-0 sm:py-6 lg:py-16">
              <p className="eyebrow !text-gold-300">{c.heroEyebrow}</p>
              <h1 className="mt-3 text-[38px] leading-[1.04] !text-white sm:mt-4 sm:text-[60px]">{c.heroTitle}</h1>
              <p className="mt-4 max-w-md text-[16px] text-white/90 sm:mt-5 sm:text-[17px]">{c.heroSubtitle}</p>
              {hero?.isSample && <p className="mt-6 inline-block rounded bg-black/40 px-2 py-0.5 text-[10px] uppercase tracking-wider">Illustrative sample photo</p>}
            </div>
            <BookingSearchPanel today={today} roomTypes={rooms.map((r) => ({ id: r.type.id, name: r.type.name }))} />
          </div>
        </div>
        {strip.length > 0 && (
          <ul className="mx-4 mt-4 grid grid-cols-2 gap-x-4 gap-y-5 rounded-[10px] border border-sand bg-cream-50 px-5 py-5 sm:mx-0 sm:mt-px sm:grid-cols-4 sm:divide-x sm:divide-sand sm:rounded-t-none sm:border-t-0 sm:px-6">
            {strip.map((a) => (
              <li key={a.id} className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:justify-center sm:gap-3 sm:px-4">
                <Icon name={a.icon} size={26} className="text-forest-800" />
                <span>
                  <span className="block font-serif text-[17px] text-forest-900">{a.name}</span>
                  <span className="block text-xs text-muted">{a.description}{showUnverified && !a.verified ? <span className="ml-1 text-gold-700">(unverified)</span> : null}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ABOUT */}
      <section className="container-site grid gap-8 py-12 sm:gap-10 sm:py-20 md:grid-cols-2 md:items-center">
        <div>
          <Eyebrow>{c.aboutEyebrow}</Eyebrow>
          <h2 className="mt-3 text-[32px] leading-tight sm:mt-4 sm:text-[46px]">{c.aboutTitle}</h2>
          <p className="mt-5 max-w-md text-muted">{c.aboutBody}</p>
          <Link href="/about" className="btn-primary mt-7">
            Learn more about us <Icon name="arrow" size={16} />
          </Link>
        </div>
        <Photo photo={about} className="aspect-[16/10] rounded-[10px]" sizes="(min-width: 768px) 50vw, 100vw" />
      </section>

      {/* ROOMS */}
      <section className="container-site pb-12 sm:pb-20">
        <SectionHead eyebrow={c.roomsEyebrow} title={c.roomsTitle} subtitle={c.roomsSubtitle} />
        <div className="grid gap-6 md:grid-cols-2">
          {rooms.map((r) => (
            <RoomCard key={r.type.id} room={r.type} photo={r.photo} amenities={r.amenities} fromPaise={r.fromPaise} sample={r.type.ratesAreSample} />
          ))}
        </div>
      </section>

      {/* AMENITIES */}
      {ams.length > 0 && (
        <section className="border-y border-sand bg-cream-50 py-12 sm:py-20">
          <div className="container-site">
            <SectionHead eyebrow={c.amenitiesEyebrow} title={c.amenitiesTitle} aside={<Link href="/amenities" className="text-sm font-medium text-forest-800 underline-offset-4 hover:underline">All amenities</Link>} />
            <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {ams.slice(0, 6).map((a) => (
                <AmenityItem key={a.id} a={a} showUnverified={showUnverified} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* GALLERY */}
      {gallery.length > 0 && (
        <section className="container-site py-12 sm:py-20">
          <SectionHead eyebrow={c.galleryEyebrow} title={c.galleryTitle} aside={<p className="text-sm text-muted">{c.gallerySubtitle} <Link href="/gallery" className="ml-2 font-medium text-forest-800 underline-offset-4 hover:underline">View gallery</Link></p>} />
          <GalleryStrip items={gallery} />
        </section>
      )}

      {/* TESTIMONIALS (approved only; hidden when none) */}
      {reviews.length > 0 && (
        <section className="container-site pb-12 sm:pb-20">
          <SectionHead
            eyebrow={c.reviewsEyebrow}
            title={c.reviewsTitle}
            aside={reviews.some((r) => r.source === "sample") ? <p className="text-xs text-muted">Sample testimonials — replace with verified guest reviews.</p> : <Link href="/reviews" className="text-sm font-medium text-forest-800 hover:underline">All reviews</Link>}
          />
          <SwipeRow cols={3} label="Guest reviews">
            {reviews.slice(0, 3).map((r) => (
              <ReviewCard key={r.id} r={r} />
            ))}
          </SwipeRow>
        </section>
      )}

      {/* LOCATION / CONTACT */}
      <section className="container-site grid gap-8 pb-12 sm:pb-20 md:grid-cols-[1.1fr_1fr] md:items-center">
        <Photo photo={entrance} className="aspect-[16/11] rounded-[10px]" sizes="(min-width: 768px) 50vw, 100vw" />
        <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <Eyebrow>{c.locationEyebrow}</Eyebrow>
            <h2 className="mt-3 text-[34px]">{c.locationTitle}</h2>
            <p className="mt-3 text-sm text-muted">{c.locationBody}</p>
            <p className="mt-4 flex gap-2 text-sm">
              <Icon name="pin" size={18} className="mt-0.5 shrink-0 text-forest-800" /> {info.address}
            </p>
            {info.mapUrl ? (
              <a href={info.mapUrl} target="_blank" rel="noopener" className="btn-outline btn-sm mt-5">
                View on Google Maps <Icon name="arrow" size={14} />
              </a>
            ) : (
              <p className="mt-5 text-xs text-muted">Map pin to be confirmed by the property.</p>
            )}
          </div>
          <div className="space-y-5 border-sand lg:border-l lg:pl-8">
            <a href={info.phoneHref} data-track="call" className="flex gap-3">
              <Icon name="phone" size={20} className="text-forest-800" />
              <span>
                <span className="block font-medium">{info.phone}</span>
                <span className="text-xs text-muted">Call us for enquiries</span>
              </span>
            </a>
            <a href={`mailto:${info.email}`} className="flex gap-3">
              <Icon name="mail" size={20} className="text-forest-800" />
              <span>
                <span className="block font-medium">{info.email}</span>
                <span className="text-xs text-muted">Drop us an email</span>
              </span>
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      {faqs.length > 0 && (
        <section className="container-site grid gap-8 pb-12 sm:pb-20 md:grid-cols-[1fr_1.4fr]">
          <div>
            <Eyebrow>{c.faqEyebrow}</Eyebrow>
            <h2 className="mt-3 text-[34px]">{c.faqTitle}</h2>
            <p className="mt-3 text-sm text-muted">{c.faqSubtitle}</p>
          </div>
          <FaqList faqs={faqs} />
        </section>
      )}

      <CtaBand eyebrow={c.ctaEyebrow} title={c.ctaTitle} subtitle={c.ctaSubtitle} phone={info.phone} phoneHref={info.phoneHref} whatsappHref={info.whatsappHref} />
    </>
  );
}
