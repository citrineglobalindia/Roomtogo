"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icons";

function add(d: string, n: number) {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
const nightsBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const nice = (d: string) => {
  const t = new Date(d + "T00:00:00Z");
  return `${DAYS[t.getUTCDay()]} ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}`;
};

/**
 * Check-in / check-out pair: pre-filled (tonight → tomorrow) so a guest can search in one tap,
 * check-out always stays after check-in, quick picks, and a plain-language summary of the stay.
 */
export function StayDates({ today, checkIn, checkOut, dark = false, compact = false }: { today: string; checkIn?: string; checkOut?: string; dark?: boolean; compact?: boolean }) {
  const [ci, setCi] = useState(checkIn || today);
  const [co, setCo] = useState(checkOut && checkOut > (checkIn || today) ? checkOut : add(checkIn || today, 1));
  const n = nightsBetween(ci, co);

  const onCheckIn = (v: string) => {
    if (!v) return;
    setCi(v);
    if (co <= v) setCo(add(v, Math.max(1, n)));
  };
  // Next Saturday → Monday (or this weekend if today is Sat)
  const dow = new Date(today + "T00:00:00Z").getUTCDay();
  const sat = add(today, (6 - dow + 7) % 7);
  const picks: [string, string, string][] = [
    ["Tonight", today, add(today, 1)],
    ["This weekend", sat, add(sat, 2)],
    ["1 week", ci, add(ci, 7)],
  ];
  const chip = dark ? "border-gold-300/35 text-cream-100/85 hover:border-gold-300 hover:text-gold-200" : "border-gold-400/50 text-forest-900 hover:border-forest-900";
  const on = dark ? "!border-gold-300 !bg-gold-300/15 !text-gold-200" : "!border-forest-900 !bg-forest-900 !text-cream-50";

  return (
    <>
      <label className={compact ? "lg:col-span-1" : "col-span-1"}>
        <span className="field-label">Check-in</span>
        <input className="field" type="date" name="checkIn" min={today} max={add(today, 365)} value={ci} onChange={(e) => onCheckIn(e.target.value)} required />
      </label>
      <label className={compact ? "lg:col-span-1" : "col-span-1"}>
        <span className="field-label">Check-out</span>
        <input className="field" type="date" name="checkOut" min={add(ci, 1)} max={add(today, 400)} value={co} onChange={(e) => e.target.value && setCo(e.target.value)} required />
      </label>
      <div className={`col-span-2 -mt-0.5 flex flex-wrap items-center gap-1.5 ${compact ? "lg:order-last lg:col-span-6" : ""}`}>
        {picks.map(([label, a, b]) => (
          <button key={label} type="button" onClick={() => { setCi(a); setCo(b); }} className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${chip} ${ci === a && co === b ? on : ""}`}>
            {label}
          </button>
        ))}
        {n > 0 && (
          <span className={`ml-auto text-[12px] ${dark ? "text-cream-200/75" : "text-muted"}`} aria-live="polite">
            {nice(ci)} → {nice(co)} · <strong className={dark ? "text-gold-200" : "text-forest-900"}>{n} night{n > 1 ? "s" : ""}</strong>
          </span>
        )}
      </div>
    </>
  );
}

/** Submit button that shows progress while the next page loads (prevents double taps). */
export function SearchButton({ className, children }: { className: string; children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const reset = () => setBusy(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  return (
    <button
      type="submit"
      aria-busy={busy}
      onClick={(e) => {
        const f = e.currentTarget.form;
        if (f && f.checkValidity()) setBusy(true);
      }}
      className={`${className} ${busy ? "pointer-events-none opacity-80" : ""}`}
    >
      {busy ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden /> Searching…
        </>
      ) : (
        children
      )}
    </button>
  );
}

/** Floating "back to top" button for long pages. */
export function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(window.scrollY > 1400);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={`fixed bottom-6 right-6 z-30 hidden h-11 w-11 items-center justify-center rounded-full border border-gold-300/40 bg-forest-975/85 text-gold-200 shadow-[var(--shadow-lux)] backdrop-blur transition-all duration-300 hover:border-gold-300 sm:flex ${show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}
    >
      <Icon name="arrow" size={18} className="-rotate-90" />
    </button>
  );
}
