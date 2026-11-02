import type { Metadata } from "next";
import { AmenityItem, PageHero, Notice } from "@/components/site/sections";
import { getContent, publicAmenities } from "@/domain/content";
import { isProduction } from "@/lib/config";

export async function generateMetadata(): Promise<Metadata> {
  const c = await getContent("amenities");
  return { title: c.seoTitle, description: c.seoDescription, alternates: { canonical: "/amenities" } };
}

const SCOPE = { in_room: "In your room", shared: "Shared facilities", service: "Services" } as const;
const CHARGE = { included: "Included", chargeable: "Chargeable", on_request: "On request", unknown: "Charges to be confirmed" } as const;

export default async function Amenities() {
  const [c, list] = await Promise.all([getContent("amenities"), publicAmenities()]);
  const groups = (Object.keys(SCOPE) as (keyof typeof SCOPE)[]).map((k) => [k, list.filter((a) => a.scope === k)] as const).filter(([, v]) => v.length);
  return (
    <>
      <PageHero eyebrow="Amenities" title={c.title} subtitle={c.subtitle} />
      <section className="container-site space-y-12 py-14">
        {!isProduction() && list.some((a) => !a.verified) && <Notice tone="warn">Facilities marked “Unverified” come from the previous website and must be confirmed by Room2Go before publication. Unverified items are hidden automatically in production.</Notice>}
        {groups.length === 0 && <p className="text-center text-muted">Amenity details are being confirmed. Please contact us with any questions.</p>}
        {groups.map(([k, items]) => (
          <div key={k}>
            <h2 className="mb-6 text-3xl">{SCOPE[k]}</h2>
            <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((a) => (
                <div key={a.id}>
                  <AmenityItem a={a} showUnverified={!isProduction()} />
                  <p className="mt-2 pl-16 text-xs text-muted">{CHARGE[a.charge]}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
