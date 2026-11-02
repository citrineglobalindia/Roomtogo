"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/icons";

export type NavItem = { href: string; label: string; badge?: number };

export function AdminNav({ groups }: { groups: { title: string; items: NavItem[] }[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (h: string) => (h === "/admin" ? path === "/admin" : path === h || path.startsWith(h + "/"));
  const nav = (
    <nav aria-label="Admin" className="space-y-5 text-sm">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-cream-200/60">{g.title}</p>
          <ul>
            {g.items.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(i.href) ? "page" : undefined}
                  className={`flex items-center justify-between rounded-md px-3 py-1.5 ${isActive(i.href) ? "bg-white/15 text-white" : "text-cream-100/85 hover:bg-white/10"}`}
                >
                  {i.label}
                  {i.badge ? <span className="rounded-full bg-gold-500 px-1.5 text-[10px] font-bold text-forest-950">{i.badge}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
  return (
    <>
      <button className="fixed left-3 top-3 z-50 inline-flex h-10 w-10 items-center justify-center rounded-md bg-forest-900 text-white lg:hidden" aria-label="Admin menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name={open ? "close" : "menu"} />
      </button>
      <aside className={`fixed inset-y-0 left-0 z-40 w-60 overflow-y-auto bg-forest-900 px-3 pb-6 pt-16 lg:pt-5 ${open ? "block" : "hidden"} lg:block`}>
        <Link href="/admin" className="mb-6 block px-3 font-serif text-2xl text-cream-50">room2go <span className="font-sans text-xs text-gold-300">admin</span></Link>
        {nav}
      </aside>
    </>
  );
}
