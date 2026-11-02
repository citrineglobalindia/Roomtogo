import type { Metadata } from "next";
import { PageHero, RoomCard } from "@/components/site/sections";
import { getContent } from "@/domain/content";
import { roomCards } from "@/lib/site-data";

export async function generateMetadata(): Promise<Metadata> {
  const c = await getContent("rooms");
  return { title: c.seoTitle, description: c.seoDescription, alternates: { canonical: "/rooms" } };
}

export default async function Rooms() {
  const [c, rooms] = await Promise.all([getContent("rooms"), roomCards()]);
  return (
    <>
      <PageHero eyebrow="Our rooms" title={c.title} subtitle={c.subtitle} />
      <section className="container-site py-14">
        {rooms.length === 0 ? (
          <p className="text-center text-muted">Room details are being updated. Please contact us for availability.</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {rooms.map((r) => (
              <RoomCard key={r.type.id} room={r.type} photo={r.photo} amenities={r.amenities} fromPaise={r.fromPaise} sample={r.type.ratesAreSample} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
