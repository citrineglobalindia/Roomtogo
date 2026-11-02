"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icons";
import { getConsent, setConsent, track } from "@/lib/analytics";

/** Mobile booking action bar. The layout reserves bottom padding so it never covers content. */
export function MobileBookBar({ phoneHref, whatsappHref }: { phoneHref: string; whatsappHref: string | null }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-sand bg-cream-50/95 backdrop-blur sm:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex items-center gap-2 px-4 py-2.5">
        <a href={phoneHref} onClick={() => track("contact_click", { channel: "call" })} className="btn-outline btn-sm h-11 w-11 !p-0" aria-label="Call Room2Go">
          <Icon name="phone" size={18} />
        </a>
        {whatsappHref && (
          <a href={whatsappHref} target="_blank" rel="noopener" onClick={() => track("contact_click", { channel: "whatsapp" })} className="btn-outline btn-sm h-11 w-11 !p-0" aria-label="WhatsApp Room2Go">
            <Icon name="whatsapp" size={18} />
          </a>
        )}
        <Link href="/book" className="btn-primary h-11 flex-1">
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
