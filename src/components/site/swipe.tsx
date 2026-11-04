"use client";
import { Children, useEffect, useRef, useState } from "react";

/**
 * Mobile: horizontal, snap-scrolling swipe row with position dots.
 * Desktop (md+): regular grid. Native scrolling = smooth momentum + accessibility for free.
 */
export function SwipeRow({ children, cols = 3, label, className = "" }: { children: React.ReactNode; cols?: 2 | 3; label: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const items = Children.toArray(children);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const kids = [...el.children] as HTMLElement[];
      const left = el.scrollLeft;
      let best = 0;
      kids.forEach((k, i) => {
        if (Math.abs(k.offsetLeft - el.offsetLeft - left) < Math.abs(kids[best].offsetLeft - el.offsetLeft - left)) best = i;
      });
      setActive(best);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  const go = (i: number) => {
    const el = ref.current;
    const kid = el?.children[i] as HTMLElement | undefined;
    if (el && kid) el.scrollTo({ left: kid.offsetLeft - el.offsetLeft, behavior: "smooth" });
  };
  return (
    <div className={className}>
      <div
        ref={ref}
        role="region"
        aria-label={label}
        tabIndex={0}
        className={`snap-row md:mx-0 md:grid md:gap-5 md:overflow-visible md:px-0 md:pb-0 ${cols === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}
      >
        {items.map((c, i) => (
          <div key={i} className="snap-item md:w-auto">
            {c}
          </div>
        ))}
      </div>
      {items.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5 md:hidden" aria-hidden>
          {items.map((_, i) => (
            <button key={i} tabIndex={-1} onClick={() => go(i)} className={`h-1.5 rounded-full transition-all duration-300 ${i === active ? "w-6 bg-forest-800" : "w-1.5 bg-forest-800/25"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Mobile-only collapsible: a summary bar that reveals its children; always expanded from sm up. */
export function MobileCollapse({ summary, children, startOpen = false }: { summary: React.ReactNode; children: React.ReactNode; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="card flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left sm:hidden">
        <span className="min-w-0 truncate text-sm">{summary}</span>
        <span className="shrink-0 text-sm font-medium text-gold-700">{open ? "Close" : "Change"}</span>
      </button>
      <div className={`${open ? "animate-fade-down mt-3 block" : "hidden"} sm:mt-0 sm:block`}>{children}</div>
    </div>
  );
}
