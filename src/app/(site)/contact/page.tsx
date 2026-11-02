import type { Metadata } from "next";
import { EnquiryForm } from "@/components/site/forms";
import { PageHero } from "@/components/site/sections";
import { Icon } from "@/components/ui/icons";
import { getContent } from "@/domain/content";
import { getSettings } from "@/domain/settings";
import { todayInTz } from "@/lib/dates";
import { getSiteInfo } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const c = await getContent("contact");
  return { title: c.seoTitle, description: c.seoDescription, alternates: { canonical: "/contact" } };
}

export default async function Contact() {
  const [c, info, s] = await Promise.all([getContent("contact"), getSiteInfo(), getSettings()]);
  const mapEmbed = info.mapUrl && s.mapLat && s.mapLng ? `https://www.google.com/maps?q=${encodeURIComponent(`${s.mapLat},${s.mapLng}`)}&output=embed` : null;
  return (
    <>
      <PageHero eyebrow="Contact" title={c.title} subtitle={c.subtitle} />
      <section className="container-site grid gap-10 py-14 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-6">
          <a href={info.phoneHref} data-track="call" className="card flex items-center gap-4 p-5 hover:border-forest-700">
            <Icon name="phone" size={24} className="text-forest-800" />
            <span>
              <span className="block font-serif text-xl">{info.phone}</span>
              <span className="text-sm text-muted">Tap to call</span>
            </span>
          </a>
          {info.whatsappHref ? (
            <a href={info.whatsappHref} data-track="whatsapp" target="_blank" rel="noopener" className="card flex items-center gap-4 p-5 hover:border-forest-700">
              <Icon name="whatsapp" size={24} className="text-forest-800" />
              <span>
                <span className="block font-serif text-xl">WhatsApp</span>
                <span className="text-sm text-muted">Message our team</span>
              </span>
            </a>
          ) : (
            info.demo && <p className="rounded-md border border-dashed border-gold-300 p-4 text-xs text-gold-700">WhatsApp button hidden: destination number not yet confirmed by the property.</p>
          )}
          <a href={`mailto:${info.email}`} className="card flex items-center gap-4 p-5 hover:border-forest-700">
            <Icon name="mail" size={24} className="text-forest-800" />
            <span>
              <span className="block font-serif text-xl">{info.email}</span>
              <span className="text-sm text-muted">We reply as soon as we can</span>
            </span>
          </a>
          <div className="card p-5">
            <p className="flex gap-3">
              <Icon name="pin" size={24} className="shrink-0 text-forest-800" /> {info.address}
            </p>
            {mapEmbed ? (
              <>
                <iframe title="Map showing Room2Go" src={mapEmbed} loading="lazy" className="mt-4 h-64 w-full rounded-md border-0" referrerPolicy="no-referrer-when-downgrade" />
                <a href={info.mapUrl!} target="_blank" rel="noopener" className="btn-outline btn-sm mt-3">
                  Get directions <Icon name="arrow" size={14} />
                </a>
              </>
            ) : (
              <p className="mt-3 text-xs text-muted">Exact map pin and directions will be added once confirmed by the property.</p>
            )}
          </div>
        </div>
        <div className="card p-6 sm:p-8">
          <h2 className="mb-5 text-3xl">Send us a message</h2>
          <EnquiryForm kind="general" today={todayInTz(s.timezone)} />
        </div>
      </section>
    </>
  );
}
