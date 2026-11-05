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

/** Room2Go logo: the orange brand tile plus a serif wordmark (the tile's own lettering is too small at header size). */
export function Logo({ light = false, className = "", tileClassName = "", wordmark = true }: { light?: boolean; className?: string; tileClassName?: string; wordmark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-3 font-serif text-[28px] leading-none tracking-tight ${light ? "text-cream-50" : "text-forest-900"} ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/room2go-logo.png" alt={wordmark ? "" : "Room2Go"} width={238} height={423} className={`h-[42px] w-auto shrink-0 drop-shadow-[0_4px_10px_rgb(0_0_0_/_0.25)] ${tileClassName}`} />
      {wordmark && <span>room2go</span>}
    </span>
  );
}

export function DemoBanner() {
  return (
    <div role="note" className="bg-gold-100 text-gold-700 border-b border-gold-300 text-xs">
      <div className="container-site flex items-center gap-x-3 py-1.5">
        <strong className="shrink-0 tracking-wide">DEMO MODE</strong>
        <span className="truncate sm:hidden">Sample data · simulated payments</span>
        <span className="hidden sm:inline">Sample rooms, rates, photos, policies and reviews. Payments use a simulated gateway — no money moves. Emails are captured, not delivered.</span>
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
    <footer className="section-dark border-t border-gold-300/20 !bg-forest-975 pb-[calc(76px+env(safe-area-inset-bottom))] text-cream-100 sm:pb-0">
      <div className="container-site grid gap-9 py-12 sm:py-14 md:grid-cols-[1.2fr_1.6fr_1.2fr] md:gap-0">
        <div className="md:pr-10 md:border-r md:border-white/15">
          <Logo light tileClassName="!h-[72px]" className="!text-[30px]" />
          <p className="mt-3 text-sm text-cream-200/80">A more comfortable tomorrow.</p>
          <p className="mt-6 text-sm text-cream-200/80">{info.address}</p>
        </div>
        <nav aria-label="Footer" className="md:px-10 md:border-r md:border-white/15">
          <ul className="grid grid-cols-2 gap-x-6 text-[15px] sm:gap-y-0.5 sm:text-sm">
            {footerLinks.map(([l, h]) => (
              <li key={h}>
                <Link className="block py-2 text-cream-100/90 hover:text-gold-300 sm:py-1" href={h}>
                  {l}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-1 text-[15px] sm:text-sm md:pl-10">
          <a href={info.phoneHref} className="flex items-center gap-3 py-2 hover:text-gold-300" data-track="call">
            <Icon name="phone" size={18} className="text-gold-300" /> {info.phone}
          </a>
          <a href={`mailto:${info.email}`} className="flex items-center gap-3 py-2 break-all hover:text-gold-300">
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
          <span className="flex flex-wrap gap-x-5 gap-y-1">
            <Link href="/privacy" className="py-1.5 hover:text-gold-300">Privacy</Link>
            <Link href="/terms" className="py-1.5 hover:text-gold-300">Terms</Link>
            <Link href="/cancellation-policy" className="py-1.5 hover:text-gold-300">Cancellation</Link>
            <Link href="/house-rules" className="py-1.5 hover:text-gold-300">House rules</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
