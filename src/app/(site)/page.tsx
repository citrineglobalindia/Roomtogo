import type { Metadata } from "next";
import Link from "next/link";
import { SwipeRow } from "@/components/site/swipe";
import { BookingSearchPanel, CtaBand, Eyebrow, FaqList, Lux, Photo, ReviewCard, RoomCard, SectionHead, AmenityItem } from "@/components/site/sections";
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
      {/* HERO: full-bleed photo under a transparent header, glass booking panel */}
      <section className="relative isolate -mt-[60px] overflow-hidden bg-forest-975 text-cream-50 sm:-mt-[68px]">
        <div className="absolute inset-0 -z-10">
          <Photo photo={hero} priority className="ken-burns h-full w-full" imgClassName="opacity-95" showSampleBadge={false} />
          <div className="absolute inset-0 bg-gradient-to-t from-forest-975 via-forest-975/55 to-forest-975/35 lg:bg-gradient-to-r lg:from-forest-975/90 lg:via-forest-975/50 lg:to-forest-975/20" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-forest-975 to-transparent" />
        </div>
        <div className="container-site grid min-h-[100svh] gap-8 pb-10 pt-[120px] sm:pb-16 sm:pt-[150px] lg:min-h-[92vh] lg:grid-cols-[1fr_auto] lg:items-center lg:gap-16">
          <div className="rise flex max-w-2xl flex-col justify-end lg:block">
            <p className="eyebrow !text-gold-300">{c.heroEyebrow}</p>
            <h1 className="mt-5 text-[46px] leading-[1.0] !text-cream-50 sm:text-[76px] lg:text-[86px]">
              <Lux text={c.heroTitle} />
            </h1>
            <p className="mt-6 max-w-md text-[17px] leading-relaxed text-cream-100/85 sm:text-[18px]">{c.heroSubtitle}</p>
            <div className="mt-8 hidden flex-wrap gap-3 sm:flex">
              <Link href="/rooms" className="btn-ghost-light">
                Explore our rooms
              </Link>
              <a href={info.phoneHref} data-track="call" className="btn inline-flex text-cream-100/85 hover:text-gold-200">
                <Icon name="phone" size={18} className="text-gold-300" /> {info.phone}
              </a>
            </div>
            {hero?.isSample && <p className="mt-6 inline-block rounded bg-black/40 px-2 py-0.5 text-[10px] uppercase tracking-wider">Illustrative sample photo</p>}
          </div>
          <div className="rise [animation-delay:150ms]">
            <BookingSearchPanel tone="dark" today={today} roomTypes={rooms.map((r) => ({ id: r.type.id, name: r.type.name }))} />
          </div>
        </div>
      </section>

      {/* SIGNATURE AMENITIES: continues the hero band */}
      {strip.length > 0 && (
        <section className="section-dark border-t border-gold-300/15 !bg-forest-975 !bg-none">
          <ul className="container-site grid grid-cols-2 gap-x-6 gap-y-7 py-9 sm:py-10 lg:grid-cols-4 lg:divide-x lg:divide-gold-300/15">
            {strip.map((a) => (
              <li key={a.id} className="flex flex-col items-start gap-3 sm:flex-row sm:items-center lg:justify-center lg:px-6">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gold-400/50 text-gold-300">
                  <Icon name={a.icon} size={22} />
                </span>
                <span>
                  <span className="block font-serif text-[19px] text-cream-50">{a.name}</span>
                  <span className="block text-xs text-cream-200/65">
                    {a.description}
                    {showUnverified && !a.verified ? <span className="ml-1 text-gold-300/80">(unverified)</span> : null}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ABOUT */}
      <section className="container-site reveal grid gap-12 py-20 sm:py-28 md:grid-cols-[1fr_1.1fr] md:items-center md:gap-16">
        <div className="order-2 md:order-1">
          <Eyebrow>{c.aboutEyebrow}</Eyebrow>
          <h2 className="mt-4 text-[36px] leading-[1.06] sm:text-[54px]">
            <Lux text={c.aboutTitle} />
          </h2>
          <span className="gold-rule mt-7 !w-20" style={{ background: "linear-gradient(90deg, var(--color-gold-400), transparent)" }} />
          <p className="mt-7 max-w-md text-[17px] leading-relaxed text-muted">{c.aboutBody}</p>
          <Link href="/about" className="btn-primary mt-9">
            Discover Room2Go <Icon name="arrow" size={16} />
          </Link>
        </div>
        <div className="frame-gold order-1 mr-4 rounded-[12px] md:order-2">
          <Photo photo={about} className="aspect-[4/3] rounded-[12px] shadow-[var(--shadow-lux)]" sizes="(min-width: 768px) 50vw, 100vw" />
        </div>
      </section>

      {/* ROOMS */}
      <section className="section-dark py-20 sm:py-28">
        <div className="container-site reveal">
          <SectionHead eyebrow={c.roomsEyebrow} title={c.roomsTitle} subtitle={c.roomsSubtitle} aside={<Link href="/rooms" className="text-sm uppercase tracking-[0.16em] text-gold-300 hover:text-gold-200">All rooms →</Link>} />
          <div className="mt-4 grid gap-6 md:grid-cols-2 lg:gap-8">
            {rooms.map((r) => (
              <RoomCard key={r.type.id} tone="dark" room={r.type} photo={r.photo} amenities={r.amenities} fromPaise={r.fromPaise} sample={r.type.ratesAreSample} />
            ))}
          </div>
        </div>
      </section>

      {/* AMENITIES */}
      {ams.length > 0 && (
        <section className="py-20 sm:py-28">
          <div className="container-site reveal">
            <SectionHead center eyebrow={c.amenitiesEyebrow} title={c.amenitiesTitle} />
            <div className="mt-6 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {ams.slice(0, 6).map((a) => (
                <AmenityItem key={a.id} a={a} showUnverified={showUnverified} />
              ))}
            </div>
            <div className="mt-12 text-center">
              <Link href="/amenities" className="btn-outline">
                All amenities
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* GALLERY */}
      {gallery.length > 0 && (
        <section className="border-y border-gold-300/25 bg-cream-200/60 py-20 sm:py-28">
          <div className="container-site reveal">
            <SectionHead eyebrow={c.galleryEyebrow} title={c.galleryTitle} aside={<p className="text-sm text-muted">{c.gallerySubtitle} <Link href="/gallery" className="ml-2 font-medium text-forest-900 underline decoration-gold-400 underline-offset-4">View gallery</Link></p>} />
            <GalleryStrip items={gallery} />
          </div>
        </section>
      )}

      {/* TESTIMONIALS (approved only; hidden when none) */}
      {reviews.length > 0 && (
        <section className="section-dark py-20 sm:py-28">
          <div className="container-site reveal">
            <SectionHead
              eyebrow={c.reviewsEyebrow}
              title={c.reviewsTitle}
              aside={reviews.some((r) => r.source === "sample") ? <p className="text-xs text-cream-200/60">Sample testimonials — replace with verified guest reviews.</p> : <Link href="/reviews" className="text-sm uppercase tracking-[0.16em] text-gold-300 hover:text-gold-200">All reviews →</Link>}
            />
            <SwipeRow cols={3} label="Guest reviews">
              {reviews.slice(0, 3).map((r) => (
                <ReviewCard key={r.id} r={r} tone="dark" />
              ))}
            </SwipeRow>
          </div>
        </section>
      )}

      {/* LOCATION / CONTACT */}
      <section className="container-site reveal grid gap-12 py-20 sm:py-28 md:grid-cols-[1.1fr_1fr] md:items-center md:gap-16">
        <div className="frame-gold mr-4 rounded-[12px]">
          <Photo photo={entrance} className="aspect-[4/3] rounded-[12px] shadow-[var(--shadow-lux)]" sizes="(min-width: 768px) 50vw, 100vw" />
        </div>
        <div>
          <Eyebrow>{c.locationEyebrow}</Eyebrow>
          <h2 className="mt-4 text-[34px] sm:text-[48px]">
            <Lux text={c.locationTitle} />
          </h2>
          <p className="mt-5 text-muted">{c.locationBody}</p>
          <ul className="mt-8 divide-y divide-gold-300/30 border-y border-gold-300/30">
            <li className="flex gap-4 py-4">
              <Icon name="pin" size={20} className="mt-0.5 shrink-0 text-gold-600" />
              <span className="text-[15px]">{info.address}</span>
            </li>
            <li>
              <a href={info.phoneHref} data-track="call" className="flex gap-4 py-4 hover:text-gold-700">
                <Icon name="phone" size={20} className="mt-0.5 shrink-0 text-gold-600" />
                <span>
                  <span className="block font-serif text-lg">{info.phone}</span>
                  <span className="text-xs text-muted">Call us for enquiries</span>
                </span>
              </a>
            </li>
            <li>
              <a href={`mailto:${info.email}`} className="flex gap-4 py-4 hover:text-gold-700">
                <Icon name="mail" size={20} className="mt-0.5 shrink-0 text-gold-600" />
                <span>
                  <span className="block font-serif text-lg break-all">{info.email}</span>
                  <span className="text-xs text-muted">Drop us an email</span>
                </span>
              </a>
            </li>
          </ul>
          {info.mapUrl ? (
            <a href={info.mapUrl} target="_blank" rel="noopener" className="btn-outline mt-8">
              View on Google Maps <Icon name="arrow" size={14} />
            </a>
          ) : (
            <p className="mt-6 text-xs text-muted">Map pin to be confirmed by the property.</p>
          )}
        </div>
      </section>

      {/* FAQ */}
      {faqs.length > 0 && (
        <section className="border-t border-gold-300/25 bg-cream-200/60 py-20 sm:py-28">
          <div className="container-site reveal grid gap-10 md:grid-cols-[1fr_1.4fr] md:gap-16">
            <div>
              <Eyebrow>{c.faqEyebrow}</Eyebrow>
              <h2 className="mt-4 text-[34px] sm:text-[46px]">
                <Lux text={c.faqTitle} />
              </h2>
              <p className="mt-4 text-muted">{c.faqSubtitle}</p>
            </div>
            <FaqList faqs={faqs} />
          </div>
        </section>
      )}

      <CtaBand eyebrow={c.ctaEyebrow} title={c.ctaTitle} subtitle={c.ctaSubtitle} phone={info.phone} phoneHref={info.phoneHref} whatsappHref={info.whatsappHref} />
    </>
  );
}
