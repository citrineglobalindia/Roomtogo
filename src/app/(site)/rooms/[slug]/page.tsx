import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { SwipeRow } from "@/components/site/swipe";
import { BookingSearchPanel, Notice, Photo } from "@/components/site/sections";
import { Icon } from "@/components/ui/icons";
import { db } from "@/db";
import { amenities, roomTypeAmenities } from "@/db/schema";
import { roomTypeWithUnits } from "@/domain/content";
import { getSettings } from "@/domain/settings";
import { isProduction } from "@/lib/config";
import { todayInTz } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { roomPhotos } from "@/lib/site-data";

type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const r = await roomTypeWithUnits((await params).slug);
  if (!r || r.type.publicStatus !== "published") return {};
  return { title: `${r.type.name} — Room2Go Bengaluru`, description: r.type.summary, alternates: { canonical: `/rooms/${r.type.slug}` } };
}

export default async function RoomDetail({ params }: P) {
  const r = await roomTypeWithUnits((await params).slug);
  if (!r || r.type.publicStatus !== "published") notFound();
  const t = r.type;
  const s = await getSettings();
  const photos = await roomPhotos(t.id);
  const ams = await db
    .select({ a: amenities })
    .from(roomTypeAmenities)
    .innerJoin(amenities, eq(amenities.id, roomTypeAmenities.amenityId))
    .where(eq(roomTypeAmenities.roomTypeId, t.id));
  const visible = ams.map((x) => x.a).filter((a) => a.status === "published" && (a.verified || !isProduction()));
  void inArray;
  const showRate = t.baseRatePaise != null && (!isProduction() || !t.ratesAreSample);
  return (
    <>
      <div className="section-dark -mt-px pb-8 pt-5 sm:pb-14 sm:pt-8">
      <section className="container-site md:hidden">
        <SwipeRow label="Room photos" className="[&>div:first-child>*]:!w-[92%]">
          {photos.slice(0, 6).map((p, i) => (
            <Photo key={i} photo={p} priority={i === 0} className="aspect-[4/3] rounded-[12px]" />
          ))}
        </SwipeRow>
      </section>
      <section className="container-site hidden gap-4 md:grid md:grid-cols-[2fr_1fr]">
        <div className="img-zoom overflow-hidden rounded-[12px]"><Photo photo={photos[0]} priority className="aspect-[16/10] h-full rounded-[12px]" /></div>
        <div className="grid gap-3">
          <Photo photo={photos[1]} className="aspect-[16/10] rounded-[12px]" />
          <Photo photo={photos[2]} className="aspect-[16/10] rounded-[12px]" />
        </div>
      </section>
      </div>
      <section className="container-site grid gap-12 py-12 sm:py-16 lg:grid-cols-[1fr_380px]">
        <div>
          <p className="eyebrow">Accommodation</p>
          <h1 className="mt-3 text-[40px] font-light leading-tight sm:mt-4 sm:text-[60px]">{t.name}</h1>
          <span className="gold-rule mt-5 !w-20" style={{ background: "linear-gradient(90deg, var(--color-gold-400), transparent)" }} />
          <p className="mt-5 text-lg text-muted">{t.summary}</p>
          {!t.factsConfirmed && !isProduction() && (
            <div className="mt-5">
              <Notice tone="warn">Room facts (occupancy, beds, size) are placeholders awaiting confirmation from Room2Go.</Notice>
            </div>
          )}
          <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["Sleeps", `${t.maxOccupancy} guest${t.maxOccupancy > 1 ? "s" : ""}`],
              ["Adults", `up to ${t.maxAdults}`],
              ["Children", t.maxChildren ? `up to ${t.maxChildren}` : "not specified"],
              ["Beds", t.bedConfiguration ?? "to be confirmed"],
            ].map(([k, v]) => (
              <div key={k} className="card p-4 sm:p-5">
                <dt className="text-[11px] uppercase tracking-[0.18em] text-gold-700">{k}</dt>
                <dd className="mt-1.5 font-serif text-xl text-forest-900">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="prose-r2g mt-8 text-ink/85">
            {t.description.split(/\n{2,}/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          {t.inclusions.length > 0 && (
            <>
              <h2 className="mt-8 text-2xl">Included</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {t.inclusions.map((i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <Icon name="check" size={18} className="text-forest-700" /> {i}
                  </li>
                ))}
              </ul>
            </>
          )}
          {visible.length > 0 && (
            <>
              <h2 className="mt-8 text-2xl">Amenities</h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {visible.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 text-sm">
                    <Icon name={a.icon} size={20} className="text-forest-700" /> {a.name}
                    {!a.verified && <span className="badge-sample">Unverified</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
          {t.extraAdultPaise > 0 || t.extraChildPaise > 0 ? (
            <p className="mt-6 text-sm text-muted">
              Rate includes {t.baseOccupancy} guests. Extra adult {formatINR(t.extraAdultPaise)} / night{t.extraChildPaise ? `, extra child ${formatINR(t.extraChildPaise)} / night` : ""}.
            </p>
          ) : null}
        </div>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          {showRate && (
            <p className="mb-3 text-sm text-muted">
              From <span className="font-serif text-2xl text-forest-900">{formatINR(t.baseRatePaise!)}</span> / night {t.ratesAreSample && <span className="badge-sample">Sample rate</span>}
            </p>
          )}
          <BookingSearchPanel today={todayInTz(s.timezone)} roomTypes={[{ id: t.id, name: t.name }]} defaults={{ roomType: t.id }} title={`Book the ${t.name}`} compact={false} />
        </aside>
      </section>
    </>
  );
}
