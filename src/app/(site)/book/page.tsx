import type { Metadata } from "next";
import Link from "next/link";
import { MobileCollapse } from "@/components/site/swipe";
import { BookingSearchPanel, Notice, Photo } from "@/components/site/sections";
import { TrackOnMount } from "@/components/site/client-bits";
import { EnquiryForm } from "@/components/site/forms";
import { Icon } from "@/components/ui/icons";
import { MAX_ONLINE_NIGHTS, quoteSelection, validateStayDates } from "@/domain/booking";
import { availabilityByType } from "@/domain/inventory";
import { getSettings, onlineBookingStatus } from "@/domain/settings";
import { addDays, diffDays, formatDate, isIsoDate, todayInTz } from "@/lib/dates";
import { UserError } from "@/lib/errors";
import { formatINR } from "@/lib/money";
import { roomCards } from "@/lib/site-data";

export const metadata: Metadata = { title: "Check availability — Room2Go", robots: { index: false } };

type SP = Promise<Record<string, string | undefined>>;
const int = (v: string | undefined, d: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : d;
};

export default async function Book({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const s = await getSettings();
  const today = todayInTz(s.timezone);
  const rooms = await roomCards();
  const q = {
    checkIn: sp.checkIn ?? "",
    checkOut: sp.checkOut ?? "",
    adults: int(sp.adults, 2, 1, 20),
    children: int(sp.children, 0, 0, 20),
    rooms: int(sp.rooms, 1, 1, 10),
    roomType: sp.roomType ?? "",
  };
  const status = await onlineBookingStatus();
  const hasDates = isIsoDate(q.checkIn) && isIsoDate(q.checkOut);
  let error: string | null = null;
  let results: { card: (typeof rooms)[number]; available: number; quote: Awaited<ReturnType<typeof quoteSelection>>["quote"] | null; problem: string | null }[] = [];
  const long = hasDates && q.checkOut > q.checkIn && diffDays(q.checkIn, q.checkOut) > MAX_ONLINE_NIGHTS;
  if (hasDates && !long) {
    try {
      validateStayDates(q.checkIn, q.checkOut, s);
      const avail = await availabilityByType(q.checkIn, q.checkOut);
      const filtered = q.roomType ? rooms.filter((r) => r.type.id === q.roomType) : rooms;
      results = await Promise.all(
        filtered.map(async (card) => {
          const available = avail.get(card.type.id) ?? 0;
          if (available < q.rooms) return { card, available, quote: null, problem: available === 0 ? "Not available for these dates" : `Only ${available} available` };
          try {
            const { quote } = await quoteSelection({ checkIn: q.checkIn, checkOut: q.checkOut, adults: q.adults, children: q.children, selections: [{ roomTypeId: card.type.id, quantity: q.rooms }] }, s);
            return { card, available, quote, problem: null };
          } catch (e) {
            return { card, available, quote: null, problem: e instanceof UserError ? e.message : "Unavailable" };
          }
        }),
      );
    } catch (e) {
      error = e instanceof UserError ? e.message : "Please check your dates.";
    }
  }
  const nights = hasDates && q.checkOut > q.checkIn ? diffDays(q.checkIn, q.checkOut) : 0;
  return (
    <div className="container-site py-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h1 className="text-[32px] leading-tight sm:text-[40px]">Check availability</h1>
        <a href="#extended-stay" className="pb-1 text-sm font-medium text-forest-800 underline-offset-4 hover:underline">Staying a week or longer? Enquire →</a>
      </div>
      <div className="mt-4 sm:mt-6">
        <MobileCollapse
          startOpen={!(hasDates && !error)}
          summary={
            hasDates ? (
              <>
                <span className="font-medium text-forest-900">{formatDate(q.checkIn, { day: "numeric", month: "short" })} → {formatDate(q.checkOut, { day: "numeric", month: "short" })}</span>
                <span className="text-muted"> · {q.adults + q.children} guest{q.adults + q.children > 1 ? "s" : ""} · {q.rooms} room{q.rooms > 1 ? "s" : ""}</span>
              </>
            ) : (
              "Choose your dates"
            )
          }
        >
          <BookingSearchPanel compact title="" today={today} roomTypes={rooms.map((r) => ({ id: r.type.id, name: r.type.name }))} defaults={{ ...q, checkIn: q.checkIn || today, checkOut: q.checkOut || addDays(today, 1) }} />
        </MobileCollapse>
      </div>
      <div className="mt-6 space-y-4 sm:mt-8" aria-live="polite">
        {!status.open && (
          <Notice tone="info">
            Online booking isn’t open yet. Please <Link className="underline" href={`/contact`}>send an enquiry</Link> or call us — our team will confirm availability and rates.
          </Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        {long && (
          <Notice tone="info">
            Stays longer than {MAX_ONLINE_NIGHTS} nights are arranged by our team.{" "}
            <Link className="font-medium underline" href="#extended-stay">
              Send an extended-stay enquiry
            </Link>
            .
          </Notice>
        )}
        {hasDates && !error && !long && (
          <>
            <TrackOnMount event="search_availability" params={{ nights, rooms: q.rooms, adults: q.adults, children: q.children }} />
            <p className="text-sm text-muted">
              {formatDate(q.checkIn)} → {formatDate(q.checkOut)} · {nights} night{nights > 1 ? "s" : ""} · {q.adults} adult{q.adults > 1 ? "s" : ""}
              {q.children ? `, ${q.children} child${q.children > 1 ? "ren" : ""}` : ""} · {q.rooms} room{q.rooms > 1 ? "s" : ""}. Availability shown is indicative until your room is reserved on the next step.
            </p>
            {results.length === 0 && <Notice tone="info">No room categories match this search.</Notice>}
            {results.map(({ card, quote, problem, available }) => (
              <article key={card.type.id} className="card grid overflow-hidden md:grid-cols-[300px_1fr]">
                <Photo photo={card.photo} className="aspect-[16/10] md:aspect-auto md:h-full" sizes="300px" />
                <div className="flex flex-col gap-4 p-6 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h2 className="text-2xl">{card.type.name}</h2>
                    <p className="mt-1 text-sm text-muted">{card.type.summary}</p>
                    <p className="mt-2 text-xs text-muted">
                      Sleeps up to {card.type.maxOccupancy} · {card.type.inclusions.length ? card.type.inclusions.join(" · ") : "Inclusions to be confirmed"}
                    </p>
                    {available > 0 && available <= 2 && !problem && <p className="mt-2 text-xs font-medium text-gold-700">{available} left for these dates</p>}
                    <Link href={`/rooms/${card.type.slug}`} className="mt-3 inline-block text-sm text-forest-800 underline-offset-4 hover:underline">
                      Room details
                    </Link>
                  </div>
                  <div className="min-w-[220px] md:text-right">
                    {quote ? (
                      <>
                        <p className="text-xs text-muted">
                          Total for {q.rooms} room{q.rooms > 1 ? "s" : ""}, {nights} night{nights > 1 ? "s" : ""}
                          {quote.taxLines.length ? " incl. taxes" : ""}
                        </p>
                        <p className="font-serif text-3xl text-forest-900">{formatINR(quote.totalPaise)}</p>
                        {quote.sampleRates && <p className="badge-sample mt-1">Sample rate</p>}
                        {status.open ? (
                          <Link
                            className="btn-primary mt-3 w-full"
                            href={`/checkout?checkIn=${q.checkIn}&checkOut=${q.checkOut}&adults=${q.adults}&children=${q.children}&sel=${card.type.id}:${q.rooms}`}
                          >
                            Select <Icon name="arrow" size={16} />
                          </Link>
                        ) : (
                          <Link className="btn-outline mt-3 w-full" href="/contact">
                            Enquire
                          </Link>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-danger">{problem}</p>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </>
        )}
      </div>

      {/* EXTENDED / CORPORATE STAYS */}
      <section id="extended-stay" className="mt-12 scroll-mt-24 overflow-hidden rounded-[10px] border border-sand bg-cream-50 sm:mt-16">
        <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[1fr_1.4fr] lg:gap-12 lg:p-10">
          <div>
            <p className="eyebrow">Extended &amp; corporate stays</p>
            <h2 className="mt-3 text-[28px] leading-tight sm:text-[34px]">Staying a week or longer?</h2>
            <p className="mt-3 text-muted">Weekly, monthly and corporate stays are arranged directly by our team. Tell us your dates and we’ll come back with availability and a quote.</p>
            <ul className="mt-5 space-y-2.5 text-sm">
              <li className="flex gap-2"><Icon name="check" size={18} className="mt-0.5 shrink-0 text-gold-600" /> Weekly and monthly stays</li>
              <li className="flex gap-2"><Icon name="check" size={18} className="mt-0.5 shrink-0 text-gold-600" /> Corporate and team accommodation</li>
              <li className="flex gap-2"><Icon name="check" size={18} className="mt-0.5 shrink-0 text-gold-600" /> Quotes prepared by our team — no automatic long-stay pricing</li>
            </ul>
            <Link href="/extended-stays" className="mt-6 inline-block text-sm font-medium text-forest-800 underline-offset-4 hover:underline">More about extended stays</Link>
          </div>
          <div className="card p-5 sm:p-6">
            <EnquiryForm kind="extended_stay" today={today} defaults={{ checkIn: hasDates ? q.checkIn : "", checkOut: hasDates ? q.checkOut : "", guests: String((q.adults || 1) + (q.children || 0)) }} />
          </div>
        </div>
      </section>
    </div>
  );
}
