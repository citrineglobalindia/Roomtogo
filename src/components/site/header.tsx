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
  return (
    <header ref={headerRef} className={`sticky top-0 z-40 border-b transition-shadow duration-200 ${open ? "bg-cream-50" : "bg-cream-100/90 backdrop-blur-md supports-[backdrop-filter]:bg-cream-100/80"} ${scrolled ? "border-sand shadow-[0_6px_20px_-14px_rgb(31_42_36_/_0.35)]" : "border-transparent"}`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="container-site flex h-[60px] items-center justify-between gap-4 sm:h-[68px] sm:gap-6">
        <Link href="/" aria-label="Room2Go home" className="-ml-1 p-1">
          <Logo className="!text-[25px] sm:!text-[28px]" />
        </Link>
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-8 text-[14px]">
            {NAV.map(([l, h]) => (
              <li key={h}>
                <Link
                  href={h}
                  aria-current={active(h) ? "page" : undefined}
                  className={`relative py-2 text-ink/80 transition-colors hover:text-forest-800 ${active(h) ? "font-medium text-forest-900 after:absolute after:inset-x-0 after:-bottom-0.5 after:h-[2px] after:bg-gold-500" : ""}`}
                >
                  {l}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-1 sm:gap-2">
          <Link href="/book" className="btn-primary hidden sm:inline-flex">
            Book your stay <Icon name="arrow" size={16} />
          </Link>
          <Link href="/account" className="hidden p-2 text-forest-800 hover:text-gold-600 lg:inline-flex" aria-label="Your account">
            <Icon name="user" />
          </Link>
          <button
            type="button"
            className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-forest-900 transition-colors active:bg-cream-300 lg:hidden"
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
        <div id="mobile-nav" className="animate-fade-down fixed inset-x-0 bottom-0 z-40 overflow-y-auto overscroll-contain border-t border-sand bg-cream-50 lg:hidden" style={{ top: menuTop, paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
          <nav aria-label="Mobile" className="container-site pt-2">
            <ul className="divide-y divide-sand">
              {NAV.map(([l, h]) => (
                <li key={h}>
                  <Link href={h} aria-current={active(h) ? "page" : undefined} className={`flex items-center justify-between py-4 font-serif text-[24px] ${active(h) ? "text-gold-600" : "text-forest-900"}`}>
                    {l}
                    <Icon name="chevronRight" size={20} className="text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
            <ul className="mt-4 space-y-1">
              {MORE.map(([l, h]) => (
                <li key={h}>
                  <Link href={h} className="block py-2.5 text-[15px] text-ink/80">
                    {l}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-6 grid gap-3">
              <Link href="/book" className="btn-primary w-full">
                Check availability <Icon name="arrow" size={16} />
              </Link>
              {phoneHref && (
                <a href={phoneHref} data-track="call" className="btn-outline w-full">
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
