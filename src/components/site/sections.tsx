import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { formatINR } from "@/lib/money";
import { addDays } from "@/lib/dates";

export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`eyebrow ${className}`}>{children}</p>;
}

/** Headline with an italic accent: "Your stay. Made effortless." → second sentence in italic gold. */
export function Lux({ text }: { text: string }) {
  const m = text.match(/^(.+?[.!?])\s+(.+)$/);
  if (!m) return <>{text}</>;
  return (
    <>
      {m[1]} <em>{m[2]}</em>
    </>
  );
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
    <div className={`mb-6 flex flex-wrap items-end justify-between gap-3 sm:mb-8 sm:gap-4 ${center ? "flex-col !items-center text-center" : ""}`}>
      <div className={center ? "max-w-2xl" : "max-w-xl"}>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2 className="mt-3 text-[32px] leading-[1.08] sm:mt-4 sm:text-[48px]">
          <Lux text={title} />
        </h2>
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
  tone = "light",
}: {
  today: string;
  roomTypes: { id: string; name: string }[];
  defaults?: { checkIn?: string; checkOut?: string; adults?: number; children?: number; rooms?: number; roomType?: string };
  title?: string;
  compact?: boolean;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  const ci = defaults?.checkIn ?? "";
  const co = defaults?.checkOut ?? "";
  return (
    <form
      action="/book"
      method="get"
      data-booking-panel
      className={`rounded-[12px] p-4 sm:p-6 ${compact ? "" : "lg:w-[360px]"} ${dark ? "border border-gold-300/30 bg-forest-975/65 shadow-[var(--shadow-lux)] backdrop-blur-xl [&_.field-label]:!text-[11px] [&_.field-label]:uppercase [&_.field-label]:tracking-[0.14em] [&_.field-label]:!text-cream-200/75 [&_.field]:border-transparent [&_.field]:bg-cream-50/95" : "card"}`}
      aria-label="Check availability"
    >
      {title && (
        <div className="mb-4 sm:mb-5">
          <h2 className={`text-[24px] sm:text-[28px] ${dark ? "!text-cream-50" : ""}`}>{title}</h2>
          <span className="gold-rule mt-3 !ml-0 !w-12" style={{ background: "linear-gradient(90deg, var(--color-gold-400), transparent)" }} />
        </div>
      )}
      <div className={`grid gap-x-3 gap-y-3 [&>label]:min-w-0 ${compact ? "grid-cols-2 lg:grid-cols-6 lg:items-end" : "grid-cols-2"}`}>
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
        <button className={`${dark ? "btn-gold" : "btn-primary"} mt-1 w-full ${compact ? "col-span-2 lg:col-span-6" : "col-span-2"}`} type="submit">
          Check availability <Icon name="arrow" size={16} />
        </button>
      </div>
      {!compact && <p className={`mt-3 text-[11px] ${dark ? "text-cream-200/60" : "text-muted"}`}>Rates and availability are confirmed on the next step.</p>}
    </form>
  );
}

export type AmenityData = { id: string; name: string; description: string | null; icon: string; verified: boolean; scope: string; charge: string };

export function AmenityItem({ a, showUnverified }: { a: AmenityData; showUnverified: boolean }) {
  return (
    <div className="flex items-start gap-4">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-gold-400/60 text-gold-600">
        <Icon name={a.icon} size={22} />
      </span>
      <div>
        <h3 className="font-serif text-xl text-forest-900">
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
  tone = "light",
}: {
  room: { slug: string; name: string; summary: string; id: string };
  photo: PhotoData | null;
  amenities: { name: string; icon: string }[];
  fromPaise: number | null;
  sample: boolean;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  return (
    <article className={`group flex flex-col overflow-hidden rounded-[12px] ${dark ? "border border-gold-300/20 bg-white/[0.035] shadow-[var(--shadow-lux)]" : "card"}`}>
      <Link href={`/rooms/${room.slug}`} className="img-zoom relative block" tabIndex={-1} aria-hidden>
        <Photo photo={photo} className="aspect-[4/3]" sizes="(min-width: 768px) 50vw, 100vw" />
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
        {fromPaise != null && (
          <span className="absolute bottom-4 left-4 rounded-full border border-gold-300/50 bg-forest-975/70 px-3.5 py-1.5 text-xs text-cream-100 backdrop-blur">
            from <span className="font-serif text-[17px] text-gold-200">{formatINR(fromPaise)}</span> / night
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[28px] font-light">{room.name}</h3>
          {sample && fromPaise != null && <span className="badge-sample">Sample rate</span>}
        </div>
        <span className="gold-rule mt-3 !w-12" style={{ background: "linear-gradient(90deg, var(--color-gold-400), transparent)" }} />
        <p className="mt-4 text-sm text-muted">{room.summary}</p>
        {amenities.length > 0 && (
          <ul className={`mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm ${dark ? "text-cream-100/80" : "text-ink/80"}`}>
            {amenities.slice(0, 4).map((a) => (
              <li key={a.name} className="flex items-center gap-2">
                <Icon name={a.icon} size={18} className={dark ? "text-gold-300" : "text-gold-600"} /> {a.name}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto grid gap-2.5 pt-7 min-[400px]:grid-cols-2 sm:gap-3">
          <Link href={`/rooms/${room.slug}`} className={dark ? "btn-ghost-light" : "btn-outline"}>
            View room details
          </Link>
          <Link href={`/book?roomType=${room.id}`} className={dark ? "btn-gold" : "btn-primary"}>
            Book this room <Icon name="arrow" size={16} />
          </Link>
        </div>
      </div>
    </article>
  );
}

export type ReviewData = { id: string; body: string; displayLabel: string | null; authorName: string; source: string; rating: number | null; title: string | null };

export function ReviewCard({ r, tinted = false, tone = "light" }: { r: ReviewData; tinted?: boolean; tone?: "light" | "dark" }) {
  const isSample = r.source === "sample";
  const dark = tone === "dark";
  return (
    <figure className={`flex h-full flex-col rounded-[12px] p-6 sm:p-8 ${dark ? "border border-gold-300/20 bg-white/[0.04] text-cream-100" : tinted ? "bg-sage-100" : "card"}`}>
      <div className="flex items-center gap-4">
        <Icon name="quote" size={34} className="text-gold-500" />
        {isSample && <span className={`text-xs tracking-wide ${dark ? "text-cream-200/60" : "text-muted"}`}>Sample review</span>}
      </div>
      {r.title && <p className={`mt-4 font-serif text-lg ${dark ? "text-cream-50" : "text-forest-900"}`}>{r.title}</p>}
      <blockquote className={`mt-4 font-serif text-[19px] font-light italic leading-snug sm:text-[21px] ${dark ? "text-cream-50" : "text-ink"}`}>“{r.body}”</blockquote>
      <figcaption className="mt-auto pt-6">
        <span className="mb-3 block h-px w-8 bg-gold-500" />
        <span className={`text-xs uppercase tracking-[0.18em] ${dark ? "text-gold-200" : "text-ink/80"}`}>{r.displayLabel || r.authorName}</span>
        {r.rating != null && <span className="ml-2 text-xs text-muted">{r.rating}/5</span>}
      </figcaption>
    </figure>
  );
}

export function FaqList({ faqs }: { faqs: { id: string; question: string; answer: string }[] }) {
  return (
    <div className="card divide-y divide-gold-300/30">
      {faqs.map((f, i) => (
        <details key={f.id} className="group px-5 py-5 sm:px-6" open={i === 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-serif text-[19px] text-forest-900 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gold-400 text-gold-600 group-open:bg-forest-900 group-open:text-gold-200">
                <Icon name={"plus"} size={12} className="group-open:rotate-45 transition-transform" />
              </span>
              {f.question}
            </span>
            <Icon name="chevronDown" size={18} className="transition-transform group-open:rotate-180" />
          </summary>
          <p className="mt-3 pl-9 text-sm text-muted">{f.answer}</p>
        </details>
      ))}
    </div>
  );
}

export function CtaBand({ eyebrow, title, subtitle, phone, phoneHref, whatsappHref }: { eyebrow: string; title: string; subtitle: string; phone: string; phoneHref: string; whatsappHref: string | null }) {
  return (
    <section className="section-dark overflow-hidden border-t border-gold-300/15">
      <svg className="pointer-events-none absolute -right-10 -bottom-10 h-80 w-80 text-gold-300/[0.06]" viewBox="0 0 24 24" aria-hidden>
        <path d="M4 20C4 10 10 4 21 3c-1 11-7 17-17 17Z" fill="currentColor" />
      </svg>
      <div className="container-site reveal relative grid gap-8 py-16 sm:py-24 md:grid-cols-[1.4fr_1fr] md:items-center">
        <div>
          <p className="eyebrow !text-gold-300">{eyebrow}</p>
          <h2 className="mt-4 text-[36px] !text-cream-50 sm:text-[52px]">
            <Lux text={title} />
          </h2>
          <p className="mt-2 text-cream-200/85">{subtitle}</p>
        </div>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Link href="/book" className="btn-gold">
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
    <section className="section-dark overflow-hidden border-b border-gold-300/15">
      <svg className="pointer-events-none absolute -left-10 top-4 h-56 w-56 text-gold-300/[0.07]" viewBox="0 0 24 24" aria-hidden>
        <path d="M4 20C4 10 10 4 21 3c-1 11-7 17-17 17Zm0 0 9-9" fill="currentColor" stroke="currentColor" />
      </svg>
      <svg className="pointer-events-none absolute -right-12 -bottom-16 h-72 w-72 rotate-180 text-gold-300/[0.05]" viewBox="0 0 24 24" aria-hidden>
        <path d="M4 20C4 10 10 4 21 3c-1 11-7 17-17 17Z" fill="currentColor" />
      </svg>
      <div className="container-site rise relative py-14 text-center sm:py-24">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="mx-auto mt-4 max-w-4xl text-[38px] leading-[1.05] sm:text-[64px]">
          <Lux text={title} />
        </h1>
        <span className="gold-rule mx-auto mt-7 !w-24" />
        {subtitle && <p className="mx-auto mt-6 max-w-2xl text-[17px] text-cream-200/80">{subtitle}</p>}
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
