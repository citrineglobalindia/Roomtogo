import Link from "next/link";
import { Icon } from "@/components/ui/icons";

export type SiteInfo = {
  name: string;
  phone: string;
  phoneHref: string;
  email: string;
  address: string;
  whatsappHref: string | null;
  whatsappConfirmed: boolean;
  mapUrl: string | null;
  socials: Record<string, string>;
  demo: boolean;
  bookingOpen: boolean;
};

export function Logo({ light = false, className = "" }: { light?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-1 font-serif text-[28px] leading-none tracking-tight ${light ? "text-cream-50" : "text-forest-900"} ${className}`}>
      room2go
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden className="text-gold-500">
        <path d="M4 20C4 10 10 4 21 3c-1 11-7 17-17 17Zm0 0 9-9" fill="currentColor" stroke="currentColor" strokeWidth="1" />
      </svg>
    </span>
  );
}

export function DemoBanner() {
  return (
    <div role="note" className="bg-gold-100 text-gold-700 border-b border-gold-300 text-xs">
      <div className="container-site flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
        <strong className="tracking-wide">DEMO MODE</strong>
        <span>Sample rooms, rates, photos, policies and reviews. Payments use a simulated gateway — no money moves. Emails are captured, not delivered.</span>
      </div>
    </div>
  );
}

const footerLinks = [
  ["About", "/about"],
  ["Rooms", "/rooms"],
  ["Amenities", "/amenities"],
  ["Gallery", "/gallery"],
  ["Reviews", "/reviews"],
  ["Contact", "/contact"],
  ["Extended stays", "/extended-stays"],
  ["Manage booking", "/manage-booking"],
] as const;

export function SiteFooter({ info }: { info: SiteInfo }) {
  return (
    <footer className="bg-forest-900 text-cream-100">
      <div className="container-site grid gap-10 py-14 md:grid-cols-[1.2fr_1.6fr_1.2fr] md:gap-0">
        <div className="md:pr-10 md:border-r md:border-white/15">
          <Logo light />
          <p className="mt-3 text-sm text-cream-200/80">A more comfortable tomorrow.</p>
          <p className="mt-6 text-sm text-cream-200/80">{info.address}</p>
        </div>
        <nav aria-label="Footer" className="md:px-10 md:border-r md:border-white/15">
          <ul className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            {footerLinks.map(([l, h]) => (
              <li key={h}>
                <Link className="text-cream-100/90 hover:text-gold-300" href={h}>
                  {l}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-3 text-sm md:pl-10">
          <a href={info.phoneHref} className="flex items-center gap-3 hover:text-gold-300" data-track="call">
            <Icon name="phone" size={18} className="text-gold-300" /> {info.phone}
          </a>
          <a href={`mailto:${info.email}`} className="flex items-center gap-3 hover:text-gold-300">
            <Icon name="mail" size={18} className="text-gold-300" /> {info.email}
          </a>
          {info.whatsappHref && (
            <a href={info.whatsappHref} className="flex items-center gap-3 hover:text-gold-300" data-track="whatsapp" rel="noopener" target="_blank">
              <Icon name="whatsapp" size={18} className="text-gold-300" /> WhatsApp
            </a>
          )}
          <div className="flex gap-4 pt-2">
            {Object.entries(info.socials)
              .filter(([, url]) => url)
              .map(([k, url]) => (
                <a key={k} href={url} aria-label={k} className="text-gold-300 hover:text-cream-50" rel="noopener" target="_blank">
                  <Icon name={k} size={20} />
                </a>
              ))}
          </div>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-site flex flex-wrap items-center justify-between gap-3 py-5 text-xs text-cream-200/70">
          <span>© {new Date().getFullYear()} Room2Go. All rights reserved.</span>
          <span className="flex gap-5">
            <Link href="/privacy" className="hover:text-gold-300">Privacy</Link>
            <Link href="/terms" className="hover:text-gold-300">Terms</Link>
            <Link href="/cancellation-policy" className="hover:text-gold-300">Cancellation</Link>
            <Link href="/house-rules" className="hover:text-gold-300">House rules</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
