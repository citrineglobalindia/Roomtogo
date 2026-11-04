"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icons";
import { getConsent, setConsent, track } from "@/lib/analytics";

const HIDE_ON = ["/book", "/checkout", "/booking", "/demo-gateway", "/manage-booking", "/account", "/documents"];

/**
 * Mobile booking action bar. Slides away inside the booking flow, while a booking form is on screen
 * ([data-booking-panel]) and over the footer, so it never covers a form or content. The footer
 * reserves space for it.
 */
export function MobileBookBar({ phoneHref, whatsappHref }: { phoneHref: string; whatsappHref: string | null }) {
  const path = usePathname();
  const [hidden, setHidden] = useState(false);
  const routeHidden = HIDE_ON.some((p) => path === p || path.startsWith(p + "/"));
  useEffect(() => {
    if (routeHidden) return;
    const targets = [...document.querySelectorAll("[data-booking-panel], footer")];
    const visible = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) e.isIntersecting ? visible.add(e.target) : visible.delete(e.target);
        setHidden(visible.size > 0);
      },
      { threshold: 0.15 },
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [path, routeHidden]);
  if (routeHidden) return null;
  return (
    <div
      aria-hidden={hidden}
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-sand bg-cream-50/95 backdrop-blur-md transition-transform duration-300 ease-out sm:hidden ${hidden ? "translate-y-full" : "translate-y-0"}`}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center gap-2 px-4 py-2.5">
        <a href={phoneHref} tabIndex={hidden ? -1 : 0} onClick={() => track("contact_click", { channel: "call" })} className="btn-outline h-12 w-12 shrink-0 !p-0" aria-label="Call Room2Go">
          <Icon name="phone" size={19} />
        </a>
        {whatsappHref && (
          <a href={whatsappHref} tabIndex={hidden ? -1 : 0} target="_blank" rel="noopener" onClick={() => track("contact_click", { channel: "whatsapp" })} className="btn-outline h-12 w-12 shrink-0 !p-0" aria-label="WhatsApp Room2Go">
            <Icon name="whatsapp" size={19} />
          </a>
        )}
        <Link href="/book" tabIndex={hidden ? -1 : 0} className="btn-primary h-12 flex-1 text-[15px]">
          Check availability <Icon name="arrow" size={16} />
        </Link>
      </div>
    </div>
  );
}

/** Delegated click tracking for call / WhatsApp links rendered by server components. */
export function ContactClickTracker() {
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a[data-track]") as HTMLAnchorElement | null;
      if (a) track("contact_click", { channel: a.dataset.track });
    };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);
  return null;
}

export function ConsentBanner({ enabled }: { enabled: boolean }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(enabled && getConsent() === null), 0);
    return () => clearTimeout(t);
  }, [enabled]);
  if (!show) return null;
  return (
    <div role="dialog" aria-label="Analytics consent" className="fixed inset-x-3 bottom-20 z-40 mx-auto max-w-xl rounded-lg border border-sand bg-white p-4 text-sm shadow-lg sm:bottom-4">
      <p>We use privacy-friendly analytics to understand which pages help guests book. No personal details are shared. Allow analytics?</p>
      <div className="mt-3 flex gap-2">
        <button className="btn-primary btn-sm" onClick={() => (setConsent("granted"), setShow(false))}>Allow</button>
        <button className="btn-outline btn-sm" onClick={() => (setConsent("denied"), setShow(false))}>Decline</button>
      </div>
    </div>
  );
}

export function TrackOnMount({ event, params }: { event: Parameters<typeof track>[0]; params: Parameters<typeof track>[1] }) {
  useEffect(() => {
    track(event, params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
