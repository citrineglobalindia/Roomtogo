import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { formatINR } from "@/lib/money";
import { addDays } from "@/lib/dates";

export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`eyebrow ${className}`}>{children}</p>;
}

export type PhotoData = { url: string; alt: string; isSample: boolean; caption?: string | null; width?: number | null; height?: number | null };

/** Image with honest labelling: sample/illustrative assets carry a visible badge. */
export function Photo({
  photo,
  className = "",
  imgClassName = "",
  priority = false,
  sizes = "100vw",
  showSampleBadge = true,
}: {
  photo: PhotoData | null | undefined;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
  sizes?: string;
  showSampleBadge?: boolean;
}) {
  if (!photo)
    return (
      <div className={`flex items-center justify-center bg-cream-300 text-xs text-muted ${className}`} role="img" aria-label="Photo to be supplied">
        Photo to be supplied
      </div>
    );
  return (
    <div className={`${/\babsolute\b/.test(className) ? "" : "relative"} overflow-hidden ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt={photo.alt}
        sizes={sizes}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        className={`h-full w-full object-cover ${imgClassName}`}
      />
      {photo.isSample && showSampleBadge && (
        <span className="absolute right-2 bottom-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white">Illustrative sample</span>
      )}
    </div>
  );
}

export function SectionHead({ eyebrow, title, subtitle, aside, center = false }: { eyebrow?: string; title: string; subtitle?: string; aside?: React.ReactNode; center?: boolean }) {
  return (
    <div className={`mb-8 flex flex-wrap items-end justify-between gap-4 ${center ? "flex-col !items-center text-center" : ""}`}>
      <div className={center ? "max-w-2xl" : "max-w-xl"}>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2 className="mt-3 text-[34px] sm:text-[42px]">{title}</h2>
        {subtitle && <p className="mt-3 text-muted">{subtitle}</p>}
      </div>
      {aside}
    </div>
  );
}

export function BookingSearchPanel({
  today,
  roomTypes,
  defaults,
  title = "Book your stay",
  compact = false,
}: {
  today: string;
  roomTypes: { id: string; name: string }[];
  defaults?: { checkIn?: string; checkOut?: string; adults?: number; children?: number; rooms?: number; roomType?: string };
  title?: string;
  compact?: boolean;
}) {
  const ci = defaults?.checkIn ?? "";
  const co = defaults?.checkOut ?? "";
  return (
    <form action="/book" method="get" className={`rounded-[10px] bg-cream-50 p-5 shadow-[var(--shadow-card)] ring-1 ring-sand sm:p-6 ${compact ? "" : "lg:w-[340px]"}`} aria-label="Check availability">
      {title && <h2 className="mb-4 text-[26px]">{title}</h2>}
      <div className={`grid gap-3 ${compact ? "sm:grid-cols-2 lg:grid-cols-6 lg:items-end" : "grid-cols-2"}`}>
        <label className={compact ? "lg:col-span-1" : "col-span-1"}>
          <span className="field-label">Check-in</span>
          <input className="field" type="date" name="checkIn" min={today} max={addDays(today, 365)} defaultValue={ci} required />
        </label>
        <label className={compact ? "lg:col-span-1" : "col-span-1"}>
          <span className="field-label">Check-out</span>
          <input className="field" type="date" name="checkOut" min={addDays(today, 1)} max={addDays(today, 400)} defaultValue={co} required />
        </label>
        <label>
          <span className="field-label">Adults</span>
          <select className="field" name="adults" defaultValue={String(defaults?.adults ?? 2)}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">Children</span>
          <select className="field" name="children" defaultValue={String(defaults?.children ?? 0)}>
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className={compact ? "" : "col-span-1"}>
          <span className="field-label">Rooms</span>
          <select className="field" name="rooms" defaultValue={String(defaults?.rooms ?? 1)}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className={compact ? "" : "col-span-1"}>
          <span className="field-label">Room type</span>
          <select className="field" name="roomType" defaultValue={defaults?.roomType ?? ""}>
            <option value="">Any</option>
            {roomTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button className={`btn-primary mt-1 w-full ${compact ? "sm:col-span-2 lg:col-span-6" : "col-span-2"}`} type="submit">
          Check availability <Icon name="arrow" size={16} />
        </button>
      </div>
      {!compact && <p className="mt-3 text-[11px] text-muted">Rates and availability are confirmed on the next step.</p>}
    </form>
  );
}

export type AmenityData = { id: string; name: string; description: string | null; icon: string; verified: boolean; scope: string; charge: string };

export function AmenityItem({ a, showUnverified }: { a: AmenityData; showUnverified: boolean }) {
  return (
    <div className="flex items-start gap-4">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cream-200 text-forest-800">
        <Icon name={a.icon} size={22} />
      </span>
      <div>
        <h3 className="font-serif text-lg text-forest-900">
          {a.name} {showUnverified && !a.verified && <span className="badge-sample align-middle">Unverified</span>}
        </h3>
        {a.description && <p className="text-sm text-muted">{a.description}</p>}
      </div>
    </div>
  );
}

export function RoomCard({
  room,
  photo,
  amenities,
  fromPaise,
  sample,
}: {
  room: { slug: string; name: string; summary: string; id: string };
  photo: PhotoData | null;
  amenities: { name: string; icon: string }[];
  fromPaise: number | null;
  sample: boolean;
}) {
  return (
    <article className="card flex flex-col overflow-hidden">
      <Photo photo={photo} className="aspect-[16/10]" sizes="(min-width: 768px) 50vw, 100vw" />
      <div className="flex flex-1 flex-col p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-2xl">{room.name}</h3>
          {fromPaise != null && (
            <p className="text-sm text-muted">
              from <span className="font-semibold text-forest-900">{formatINR(fromPaise)}</span> / night {sample && <span className="badge-sample ml-1">Sample rate</span>}
            </p>
          )}
        </div>
        <p className="mt-2 text-sm text-muted">{room.summary}</p>
        {amenities.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink/80">
            {amenities.slice(0, 4).map((a) => (
              <li key={a.name} className="flex items-center gap-2">
                <Icon name={a.icon} size={18} className="text-forest-700" /> {a.name}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto grid grid-cols-2 gap-3 pt-6">
          <Link href={`/rooms/${room.slug}`} className="btn-outline">
            View room details
          </Link>
          <Link href={`/book?roomType=${room.id}`} className="btn-primary">
            Book this room <Icon name="arrow" size={16} />
          </Link>
        </div>
      </div>
    </article>
  );
}

export type ReviewData = { id: string; body: string; displayLabel: string | null; authorName: string; source: string; rating: number | null; title: string | null };

export function ReviewCard({ r, tinted = false }: { r: ReviewData; tinted?: boolean }) {
  const isSample = r.source === "sample";
  return (
    <figure className={`flex h-full flex-col rounded-[10px] p-7 ${tinted ? "bg-sage-100" : "bg-cream-200/70"}`}>
      <div className="flex items-center gap-4">
        <Icon name="quote" size={34} className="text-gold-500" />
        {isSample && <span className="text-xs tracking-wide text-muted">Sample review</span>}
      </div>
      {r.title && <p className="mt-4 font-serif text-lg text-forest-900">{r.title}</p>}
      <blockquote className="mt-4 font-serif text-[19px] leading-snug text-ink">“{r.body}”</blockquote>
      <figcaption className="mt-auto pt-6">
        <span className="mb-3 block h-px w-8 bg-gold-500" />
        <span className="text-sm text-ink/80">{r.displayLabel || r.authorName}</span>
        {r.rating != null && <span className="ml-2 text-xs text-muted">{r.rating}/5</span>}
      </figcaption>
    </figure>
  );
}

export function FaqList({ faqs }: { faqs: { id: string; question: string; answer: string }[] }) {
  return (
    <div className="divide-y divide-sand rounded-[10px] border border-sand bg-cream-50">
      {faqs.map((f, i) => (
        <details key={f.id} className="group px-5 py-4" open={i === 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium text-forest-900 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-3">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-forest-700 text-forest-700 group-open:bg-forest-800 group-open:text-white">
                <Icon name={"plus"} size={12} className="group-open:rotate-45 transition-transform" />
              </span>
              {f.question}
            </span>
            <Icon name="chevronDown" size={18} className="transition-transform group-open:rotate-180" />
          </summary>
          <p className="mt-3 pl-8 text-sm text-muted">{f.answer}</p>
        </details>
      ))}
    </div>
  );
}

export function CtaBand({ eyebrow, title, subtitle, phone, phoneHref, whatsappHref }: { eyebrow: string; title: string; subtitle: string; phone: string; phoneHref: string; whatsappHref: string | null }) {
  return (
    <section className="relative overflow-hidden bg-forest-900 text-cream-50">
      <svg className="pointer-events-none absolute -right-10 -bottom-10 h-72 w-72 text-white/5" viewBox="0 0 24 24" aria-hidden>
        <path d="M4 20C4 10 10 4 21 3c-1 11-7 17-17 17Z" fill="currentColor" />
      </svg>
      <div className="container-site relative grid gap-8 py-14 md:grid-cols-[1.4fr_1fr] md:items-center">
        <div>
          <p className="eyebrow !text-gold-300">{eyebrow}</p>
          <h2 className="mt-3 text-[34px] !text-cream-50 sm:text-[40px]">{title}</h2>
          <p className="mt-2 text-cream-200/85">{subtitle}</p>
        </div>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Link href="/book" className="btn bg-cream-50 text-forest-900 hover:bg-white">
              Book your stay <Icon name="arrow" size={16} />
            </Link>
            {whatsappHref ? (
              <a href={whatsappHref} target="_blank" rel="noopener" data-track="whatsapp" className="btn-ghost-light">
                <Icon name="whatsapp" size={18} /> WhatsApp us
              </a>
            ) : (
              <Link href="/contact" className="btn-ghost-light">
                <Icon name="chat" size={18} /> Contact us
              </Link>
            )}
          </div>
          <a href={phoneHref} data-track="call" className="flex items-center gap-3 text-cream-50 hover:text-gold-300">
            <Icon name="phone" size={20} className="text-gold-300" />
            <span>
              <span className="block text-lg">{phone}</span>
              <span className="text-xs text-cream-200/70">Call us for quick assistance</span>
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}

export function PageHero({ title, subtitle, eyebrow }: { title: string; subtitle?: string; eyebrow?: string }) {
  return (
    <section className="relative overflow-hidden border-b border-sand bg-cream-100">
      <svg className="pointer-events-none absolute -left-8 top-6 h-48 w-48 text-forest-800/[0.06]" viewBox="0 0 24 24" aria-hidden>
        <path d="M4 20C4 10 10 4 21 3c-1 11-7 17-17 17Zm0 0 9-9" fill="currentColor" stroke="currentColor" />
      </svg>
      <div className="container-site relative py-14 text-center sm:py-16">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="mt-2 text-[40px] sm:text-[54px]">{title}</h1>
        <span className="mx-auto mt-5 block h-px w-14 bg-gold-500" />
        {subtitle && <p className="mx-auto mt-5 max-w-2xl text-muted">{subtitle}</p>}
      </div>
    </section>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "success"; children: React.ReactNode }) {
  const cls = {
    info: "bg-gold-100/70 border-gold-300 text-gold-700",
    warn: "bg-gold-100 border-gold-500 text-warning",
    error: "bg-red-50 border-red-300 text-danger",
    success: "bg-forest-100 border-forest-600/40 text-forest-800",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-start gap-3 rounded-md border px-4 py-3 text-sm ${cls}`}>
      <Icon name="info" size={18} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
