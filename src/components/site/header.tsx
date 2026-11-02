"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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

export function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(path);
  if (path !== lastPath) {
    setLastPath(path);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const active = (h: string) => path === h || path.startsWith(h + "/");
  return (
    <header className="sticky top-0 z-40 border-b border-sand/70 bg-cream-100/95 backdrop-blur supports-[backdrop-filter]:bg-cream-100/85">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="container-site flex h-[68px] items-center justify-between gap-6">
        <Link href="/" aria-label="Room2Go home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-8 text-[14px]">
            {NAV.map(([l, h]) => (
              <li key={h}>
                <Link
                  href={h}
                  aria-current={active(h) ? "page" : undefined}
                  className={`relative py-2 text-ink/80 hover:text-forest-800 ${active(h) ? "text-forest-900 font-medium after:absolute after:inset-x-0 after:-bottom-0.5 after:h-[2px] after:bg-gold-500" : ""}`}
                >
                  {l}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/book" className="btn-primary hidden sm:inline-flex">
            Book your stay <Icon name="arrow" size={16} />
          </Link>
          <Link href="/account" className="hidden p-2 text-forest-800 hover:text-gold-600 lg:inline-flex" aria-label="Your account">
            <Icon name="user" />
          </Link>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-forest-900 lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            <Icon name={open ? "close" : "menu"} size={24} />
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-sand bg-cream-50 lg:hidden">
          <ul className="container-site divide-y divide-sand py-2">
            {[...NAV, ["Extended stays", "/extended-stays"], ["Manage booking", "/manage-booking"], ["Your account", "/account"]].map(([l, h]) => (
              <li key={h}>
                <Link href={h} aria-current={active(h) ? "page" : undefined} className={`block py-3 text-base ${active(h) ? "font-semibold text-forest-900" : "text-ink"}`}>
                  {l}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
