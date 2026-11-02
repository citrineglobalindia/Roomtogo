"use client";
/**
 * Configurable analytics layer. No personal data ever leaves this function: only whitelisted keys with
 * primitive values are forwarded, and only after the visitor has granted consent.
 */
type Params = Record<string, string | number | boolean | undefined>;
const ALLOWED = new Set(["room_type", "nights", "rooms", "adults", "children", "value", "currency", "transaction_id", "channel", "enquiry_type", "page"]);
const CONSENT_KEY = "r2g_analytics_consent";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function getConsent(): "granted" | "denied" | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}
export function setConsent(v: "granted" | "denied") {
  try {
    localStorage.setItem(CONSENT_KEY, v);
  } catch {}
  window.dispatchEvent(new Event("r2g-consent"));
}

export function track(event: "search_availability" | "begin_checkout" | "generate_lead" | "contact_click" | "purchase", params: Params = {}) {
  if (typeof window === "undefined") return;
  const provider = process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER ?? "none";
  if (provider === "none" || getConsent() !== "granted") return;
  const clean: Params = {};
  for (const [k, v] of Object.entries(params)) if (ALLOWED.has(k) && v !== undefined) clean[k] = v;
  if (event === "purchase") {
    // Deduplicate by stable booking reference (also server-side via conversion_tracked_at).
    const key = `r2g_purchase_${clean.transaction_id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
  }
  window.dataLayer = window.dataLayer ?? [];
  if (window.gtag) window.gtag("event", event, clean);
  else window.dataLayer.push({ event, ...clean });
}
