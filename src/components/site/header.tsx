"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icons";
import { Logo } from "./chrome";

const NAV = [
  ["About", "/about"],
  ["Rooms", "/rooms"],
  ["Amenities", "/amenities"],
  ["Gallery", "/gallery"],
  ["Reviews", "/reviews"],
  ["Contact", "/contact"],
] as const;
const MORE = [
  ["Extended & corporate stays", "/extended-stays"],
  ["Manage a booking", "/manage-booking"],
  ["Your account", "/account"],
] as const;

export function SiteHeader({ phone, phoneHref }: { phone?: string; phoneHref?: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [menuTop, setMenuTop] = useState(60);
  const headerRef = useRef<HTMLElement>(null);
  const [lastPath, setLastPath] = useState(path);
  if (path !== lastPath) {
    setLastPath(path);
    setOpen(false);
  }
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (!open) return;
    const h = headerRef.current;
    if (h) setMenuTop(Math.max(0, Math.round(h.getBoundingClientRect().bottom)));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);
  const active = (h: string) => path === h || path.startsWith(h + "/");
  const overHero = path === "/" && !scrolled && !open;
  return (
    <header ref={headerRef} className={`sticky top-0 z-40 border-b text-cream-100 transition-[background-color,border-color,box-shadow] duration-300 ${open ? "border-gold-300/15 bg-forest-975" : overHero ? "border-transparent bg-transparent" : "border-gold-300/15 bg-forest-975/85 shadow-[0_10px_30px_-18px_rgb(0_0_0_/_0.6)] backdrop-blur-xl"}`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="container-site flex h-[60px] items-center justify-between gap-4 sm:h-[68px] sm:gap-6">
        <Link href="/" aria-label="Room2Go home" className="-ml-1 p-1">
          <Logo light className="!text-[24px] sm:!text-[27px]" tileClassName="!h-[38px] sm:!h-[46px]" />
        </Link>
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-8 text-[14px]">
            {NAV.map(([l, h]) => (
              <li key={h}>
                <Link
                  href={h}
                  aria-current={active(h) ? "page" : undefined}
                  className={`relative py-2 text-[13px] uppercase tracking-[0.16em] transition-colors hover:text-gold-300 ${active(h) ? "text-gold-300 after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:bg-gold-400" : "text-cream-100/85"}`}
                >
                  {l}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-1 sm:gap-2">
          <Link href="/book" className="btn-gold hidden sm:inline-flex">
            Book your stay <Icon name="arrow" size={16} />
          </Link>
          <Link href="/account" className="hidden p-2 text-cream-100/85 hover:text-gold-300 lg:inline-flex" aria-label="Your account">
            <Icon name="user" />
          </Link>
          <button
            type="button"
            className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-cream-50 transition-colors active:bg-white/10 lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            <span className="relative block h-4 w-5" aria-hidden>
              <span className={`absolute left-0 h-[1.5px] w-5 rounded bg-current transition-all duration-200 ${open ? "top-[7px] rotate-45" : "top-0"}`} />
              <span className={`absolute left-0 top-[7px] h-[1.5px] w-5 rounded bg-current transition-opacity duration-150 ${open ? "opacity-0" : ""}`} />
              <span className={`absolute left-0 h-[1.5px] w-5 rounded bg-current transition-all duration-200 ${open ? "top-[7px] -rotate-45" : "top-[14px]"}`} />
            </span>
          </button>
        </div>
      </div>
      {open && (
        <div id="mobile-nav" className="animate-fade-down section-dark fixed inset-x-0 bottom-0 z-40 overflow-y-auto overscroll-contain border-t border-gold-300/15 lg:hidden" style={{ top: menuTop, paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
          <nav aria-label="Mobile" className="container-site pt-2">
            <ul className="divide-y divide-gold-300/15">
              {NAV.map(([l, h]) => (
                <li key={h}>
                  <Link href={h} aria-current={active(h) ? "page" : undefined} className={`flex items-center justify-between py-4 font-serif text-[26px] font-light ${active(h) ? "text-gold-300" : "text-cream-50"}`}>
                    {l}
                    <Icon name="chevronRight" size={20} className="text-gold-400/70" />
                  </Link>
                </li>
              ))}
            </ul>
            <ul className="mt-4 space-y-1">
              {MORE.map(([l, h]) => (
                <li key={h}>
                  <Link href={h} className="block py-2.5 text-[15px] text-cream-100/75">
                    {l}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-6 grid gap-3">
              <Link href="/book" className="btn-gold w-full">
                Check availability <Icon name="arrow" size={16} />
              </Link>
              {phoneHref && (
                <a href={phoneHref} data-track="call" className="btn-ghost-light w-full">
                  <Icon name="phone" size={18} /> Call {phone}
                </a>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
