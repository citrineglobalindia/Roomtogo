import type { Metadata } from "next";
import { PageHero, RoomCard } from "@/components/site/sections";
import { getContent } from "@/domain/content";
import { roomCards } from "@/lib/site-data";
import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { bhkLabel, formatINR } from "@/lib/money";

export async function generateMetadata(): Promise<Metadata> {
  const c = await getContent("rooms");
  return { title: c.seoTitle, description: c.seoDescription, alternates: { canonical: "/rooms" } };
}

export default async function Rooms() {
  const [c, rooms] = await Promise.all([getContent("rooms"), roomCards()]);
  return (
    <>
      <PageHero eyebrow="Our rooms" title={c.title} subtitle={c.subtitle} />
      <section className="container-site reveal py-16 sm:py-24">
        {rooms.length === 0 ? (
          <p className="text-center text-muted">Room details are being updated. Please contact us for availability.</p>
        ) : (
          <div className={`grid gap-8 md:grid-cols-2 ${rooms.length === 3 ? "lg:grid-cols-3 lg:gap-6" : ""}`}>
            {rooms.map((r) => (
              <RoomCard key={r.type.id} room={r.type} photo={r.photo} amenities={r.amenities} fromPaise={r.fromPaise} sample={r.type.ratesAreSample} />
            ))}
          </div>
        )}
      </section>
      {rooms.length > 1 && <Compare rooms={rooms} />}
    </>
  );
}

type Rooms = Awaited<ReturnType<typeof roomCards>>;

/** Side-by-side comparison of every apartment: layout, guests, nightly price and what's included. */
function Compare({ rooms }: { rooms: Rooms }) {
  const names = [...new Map(rooms.flatMap((r) => r.amenities).map((a) => [a.name, a])).values()];
  return (
    <section className="bg-cream-100/60 py-16 sm:py-20">
      <div className="container-site reveal">
        <p className="text-center text-xs uppercase tracking-[0.28em] text-gold-700">Compare</p>
        <h2 className="mt-3 text-center text-3xl sm:text-4xl">Find the right apartment</h2>
        <div className="mt-10 overflow-x-auto rounded-2xl border border-gold-200/70 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">Comparison of Room2Go apartments</caption>
            <thead>
              <tr className="bg-forest-950 text-cream-50">
                <th scope="col" className="p-4 text-left font-medium">&nbsp;</th>
                {rooms.map((r) => (
                  <th key={r.type.id} scope="col" className="p-4 text-left align-top">
                    <span className="block font-serif text-lg">{r.type.name}</span>
                    {bhkLabel(r.type.name) && <span className="text-[11px] uppercase tracking-[0.16em] text-gold-300">{bhkLabel(r.type.name)} · entire apartment</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gold-100">
              <Row label="Guests">{rooms.map((r) => <td key={r.type.id} className="p-4">Up to {r.type.maxOccupancy}</td>)}</Row>
              <Row label="Layout">{rooms.map((r) => <td key={r.type.id} className="p-4">{r.type.bedConfiguration ?? "—"}</td>)}</Row>
              <Row label="Price / night">
                {rooms.map((r) => (
                  <td key={r.type.id} className="p-4 font-serif text-xl text-forest-900">{r.fromPaise != null ? formatINR(r.fromPaise) : "On request"}</td>
                ))}
              </Row>
              {names.map((a) => (
                <Row key={a.name} label={a.name} icon={a.icon}>
                  {rooms.map((r) => (
                    <td key={r.type.id} className="p-4">
                      {r.amenities.some((x) => x.name === a.name) ? <Icon name="check" size={18} className="text-forest-700" aria-label="Included" /> : <span className="text-muted" aria-label="Not included">—</span>}
                    </td>
                  ))}
                </Row>
              ))}
              <tr>
                <td className="p-4" />
                {rooms.map((r) => (
                  <td key={r.type.id} className="p-4">
                    <Link href={`/book?roomType=${r.type.id}`} className="btn-primary inline-flex !px-4 !py-2 text-xs">Check availability</Link>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Row({ label, icon, children }: { label: string; icon?: string; children: React.ReactNode }) {
  return (
    <tr className="even:bg-cream-50/60">
      <th scope="row" className="p-4 text-left font-medium text-forest-900">
        <span className="inline-flex items-center gap-2">{icon && <Icon name={icon} size={18} className="text-gold-600" />}{label}</span>
      </th>
      {children}
    </tr>
  );
}
