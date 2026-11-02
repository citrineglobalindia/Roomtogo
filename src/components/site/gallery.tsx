"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icons";

export type GalleryItem = { id: string; url: string; alt: string; caption: string | null; category: string | null; isSample: boolean };

/** Accessible full-screen viewer: Esc closes, ←/→ navigate, swipe on touch, focus is trapped and restored. */
export function Lightbox({ items, index, onClose, onIndex }: { items: GalleryItem[]; index: number; onClose: () => void; onIndex: (i: number) => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchX = useRef<number | null>(null);
  const prev = useCallback(() => onIndex((index - 1 + items.length) % items.length), [index, items.length, onIndex]);
  const next = useCallback(() => onIndex((index + 1) % items.length), [index, items.length, onIndex]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      opener?.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "Tab" && dialogRef.current) {
        const f = dialogRef.current.querySelectorAll<HTMLElement>("button");
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, prev, next]);

  const item = items[index];
  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Photo viewer: ${item.caption ?? item.alt}`}
      className="fixed inset-0 z-50 flex flex-col bg-forest-950/95 text-cream-50"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 50) (dx > 0 ? prev : next)();
        touchX.current = null;
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 text-sm">
        <span aria-live="polite">
          {index + 1} / {items.length}
          {item.caption ? ` · ${item.caption}` : ""}
        </span>
        <button ref={closeRef} onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" aria-label="Close photo viewer">
          <Icon name="close" size={24} />
        </button>
      </div>
      <div className="relative flex flex-1 items-center justify-center px-2 pb-6 sm:px-16" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.url} alt={item.alt} className="max-h-[80vh] max-w-full rounded object-contain" />
        {item.isSample && <span className="absolute bottom-8 rounded bg-black/60 px-2 py-1 text-[11px] uppercase tracking-wider">Illustrative sample — not a property photo</span>}
        <button onClick={prev} className="absolute left-2 top-1/2 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 sm:left-4" aria-label="Previous photo">
          <Icon name="chevronLeft" size={26} />
        </button>
        <button onClick={next} className="absolute right-2 top-1/2 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 sm:right-4" aria-label="Next photo">
          <Icon name="chevronRight" size={26} />
        </button>
      </div>
    </div>
  );
}

/** Asymmetric grid from the approved reference: a 5-photo feature block, then full rows of thirds. */
function spanFor(i: number, n: number) {
  const FEATURE = ["md:col-span-7 md:row-span-2", "md:col-span-5", "md:col-span-5", "md:col-span-7", "md:col-span-5"];
  if (n >= 5 && i < 5) return FEATURE[i];
  const start = n >= 5 ? 5 : 0;
  const rest = n - start;
  const k = i - start;
  const lastRowSize = rest % 3;
  const inLastRow = lastRowSize !== 0 && k >= rest - lastRowSize;
  if (inLastRow) return lastRowSize === 1 ? "md:col-span-12" : "md:col-span-6";
  return "md:col-span-4";
}

export function GalleryGrid({ items, categories }: { items: GalleryItem[]; categories: { slug: string; name: string }[] }) {
  const [cat, setCat] = useState<string>("all");
  const [open, setOpen] = useState<number | null>(null);
  const shown = cat === "all" ? items : items.filter((i) => i.category === cat);
  return (
    <>
      <div role="group" aria-label="Filter photos by category" className="mb-8 flex flex-wrap justify-center gap-3">
        {[{ slug: "all", name: "All" }, ...categories].map((c) => (
          <button
            key={c.slug}
            type="button"
            aria-pressed={cat === c.slug}
            onClick={() => setCat(c.slug)}
            className={`min-w-[92px] rounded-full border px-6 py-2 text-sm transition-colors ${cat === c.slug ? "border-forest-800 bg-forest-800 text-white" : "border-sand bg-cream-50 text-ink hover:border-forest-700"}`}
          >
            {c.name}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="py-16 text-center text-muted">No photos in this category yet.</p>
      ) : (
        <ul className="grid auto-rows-[220px] grid-cols-1 gap-3 sm:grid-cols-2 md:auto-rows-[210px] md:grid-cols-12">
          {shown.map((it, i) => (
            <li key={it.id} className={`group relative overflow-hidden rounded-md ${spanFor(i, shown.length)} ${i === 0 ? "sm:col-span-2 sm:row-span-2" : ""}`}>
              <button type="button" onClick={() => setOpen(i)} className="block h-full w-full text-left" aria-label={`Open photo: ${it.caption ?? it.alt}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.url} alt={it.alt} loading={i < 3 ? "eager" : "lazy"} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                {it.caption && <span className="absolute bottom-3 left-4 font-serif text-lg text-white drop-shadow">{it.caption}</span>}
                <span className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white">
                  <Icon name="expand" size={16} />
                </span>
                {it.isSample && <span className="absolute bottom-3 right-3 rounded bg-black/55 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-white">Sample</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open != null && shown[open] && <Lightbox items={shown} index={open} onClose={() => setOpen(null)} onIndex={setOpen} />}
    </>
  );
}

/** Homepage strip: three photos with prev/next controls and the same lightbox. */
export function GalleryStrip({ items }: { items: GalleryItem[] }) {
  const [start, setStart] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  if (!items.length) return null;
  const visible = [0, 1, 2].map((k) => items[(start + k) % items.length]).filter((v, i, a) => a.indexOf(v) === i);
  return (
    <div className="relative">
      <ul className="grid gap-3 sm:grid-cols-3">
        {visible.map((it, k) => (
          <li key={it.id} className={`relative aspect-[4/3] overflow-hidden rounded-md ${k > 0 ? "hidden sm:block" : ""}`}>
            <button type="button" className="block h-full w-full" onClick={() => setOpen(items.indexOf(it))} aria-label={`Open photo: ${it.caption ?? it.alt}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.url} alt={it.alt} loading="lazy" className="h-full w-full object-cover" />
              {it.isSample && <span className="absolute bottom-2 right-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-white">Sample</span>}
            </button>
          </li>
        ))}
      </ul>
      {items.length > 1 && (
        <>
          <button type="button" onClick={() => setStart((s) => (s - 1 + items.length) % items.length)} className="absolute left-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-cream-50 text-forest-900 shadow" aria-label="Previous photos">
            <Icon name="chevronLeft" />
          </button>
          <button type="button" onClick={() => setStart((s) => (s + 1) % items.length)} className="absolute right-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-cream-50 text-forest-900 shadow" aria-label="Next photos">
            <Icon name="chevronRight" />
          </button>
        </>
      )}
      {open != null && <Lightbox items={items} index={open} onClose={() => setOpen(null)} onIndex={setOpen} />}
    </div>
  );
}
