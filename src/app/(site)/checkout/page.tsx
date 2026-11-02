import type { Metadata } from "next";
import Link from "next/link";
import { GuestDetailsForm } from "@/components/site/booking-client";
import { PriceSummary } from "@/components/site/price-summary";
import { Notice } from "@/components/site/sections";
import { quoteSelection } from "@/domain/booking";
import { publishedPolicy } from "@/domain/content";
import { getSettings, onlineBookingStatus } from "@/domain/settings";
import { formatDate } from "@/lib/dates";
import { UserError } from "@/lib/errors";
import { formatINR } from "@/lib/money";

export const metadata: Metadata = { title: "Your stay — Room2Go", robots: { index: false, follow: false } };

export default async function Checkout({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined)) ?? "";
  const sel = ([] as string[]).concat(sp.sel ?? []);
  const s = await getSettings();
  const status = await onlineBookingStatus();
  const input = {
    checkIn: one("checkIn"),
    checkOut: one("checkOut"),
    adults: Number(one("adults")),
    children: Number(one("children") || 0),
    selections: sel.map((x) => {
      const [roomTypeId, qn] = x.split(":");
      return { roomTypeId, quantity: Number(qn) };
    }),
  };
  let result: Awaited<ReturnType<typeof quoteSelection>> | null = null;
  let error: string | null = null;
  try {
    if (!status.open) throw new UserError("Online booking isn't available right now. Please send an enquiry.");
    result = await quoteSelection(input, s);
  } catch (e) {
    error = e instanceof UserError ? e.message : "This selection is no longer valid.";
  }
  const cancellation = await publishedPolicy("cancellation");
  return (
    <div className="container-site py-10">
      <nav aria-label="Booking steps" className="mb-6 text-xs text-muted">
        <ol className="flex flex-wrap gap-2">
          <li>1. Dates &amp; room</li>
          <li aria-hidden>›</li>
          <li className="font-semibold text-forest-900" aria-current="step">2. Your details</li>
          <li aria-hidden>›</li>
          <li>3. Payment</li>
          <li aria-hidden>›</li>
          <li>4. Confirmation</li>
        </ol>
      </nav>
      <h1 className="text-[40px]">Review your stay</h1>
      {error || !result ? (
        <div className="mt-6 space-y-4">
          <Notice tone="error">{error}</Notice>
          <Link href="/book" className="btn-outline">Back to availability</Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_380px]">
          <div className="card p-6 sm:p-8">
            <h2 className="mb-5 text-2xl">Lead guest details</h2>
            <GuestDetailsForm
              hidden={{ checkIn: input.checkIn, checkOut: input.checkOut, adults: String(input.adults), children: String(input.children), sel }}
              totalPaise={result.quote.totalPaise}
              cancellationTitle={cancellation?.title ?? "Cancellation policy"}
            >
              <div className="rounded-md border border-sand bg-cream-100 p-4 text-sm">
                <h3 className="font-serif text-lg">{cancellation?.title ?? "Cancellation policy"}</h3>
                {cancellation?.isSample && <p className="badge-sample my-1">Sample — not approved</p>}
                <p className="mt-1 line-clamp-6 whitespace-pre-line text-muted">{cancellation?.body ?? "Policy not yet published."}</p>
                <p className="mt-2 text-xs text-muted">The version shown here is stored with your booking.</p>
              </div>
            </GuestDetailsForm>
          </div>
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="card p-5">
              <h2 className="text-2xl">Stay summary</h2>
              <p className="mt-2 text-sm text-muted">
                {formatDate(input.checkIn, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} → {formatDate(input.checkOut, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                <br />
                {input.adults} adult{input.adults > 1 ? "s" : ""}
                {input.children ? `, ${input.children} child${input.children > 1 ? "ren" : ""}` : ""}
                {s.checkInTime && s.checkOutTime ? ` · check-in ${s.checkInTime}, check-out ${s.checkOutTime}` : ""}
              </p>
              <div className="mt-4">
                <PriceSummary quote={result.quote} />
              </div>
              {result.quote.balanceLaterPaise > 0 && <p className="mt-3 text-xs text-muted">You pay {formatINR(result.quote.dueNowPaise)} now; the balance is collected at the property.</p>}
            </div>
            <Link href={`/book?checkIn=${input.checkIn}&checkOut=${input.checkOut}&adults=${input.adults}&children=${input.children}`} className="text-sm text-forest-800 underline">
              Change selection
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}
