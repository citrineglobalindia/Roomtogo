/**
 * Stay-date helpers. Stay dates are calendar dates ('YYYY-MM-DD') in the PROPERTY timezone.
 * Arrival is inclusive, departure exclusive: a stay 2026-11-10 → 2026-11-12 occupies nights 10 and 11.
 * Calendar-date arithmetic is done in UTC so it is independent of the server's timezone.
 */
const RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toUtc(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(s: string, n: number): string {
  return fromUtc(toUtc(s) + n * 86400000);
}

export function diffDays(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / 86400000);
}

/** Nights occupied by a stay (arrival inclusive, departure exclusive). */
export function eachNight(checkIn: string, checkOut: string): string[] {
  const n = diffDays(checkIn, checkOut);
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(addDays(checkIn, i));
  return out;
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(s: string): number {
  return new Date(toUtc(s)).getUTCDay();
}

/** Today's calendar date in the given IANA timezone. */
export function todayInTz(tz: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** UTC instant for a local wall-clock time (HH:mm) on a property-local date. */
export function zonedTimeToUtc(dateStr: string, hhmm: string, tz: string): Date {
  const [h, mi] = hhmm.split(":").map(Number);
  const guess = new Date(toUtc(dateStr) + (h * 60 + mi) * 60000);
  // offset of tz at that instant
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const p = Object.fromEntries(fmt.formatToParts(guess).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  const offset = asUtc - guess.getTime();
  return new Date(guess.getTime() - offset);
}

export function formatDate(s: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  return new Intl.DateTimeFormat("en-IN", { ...opts, timeZone: "UTC" }).format(new Date(toUtc(s)));
}

export function formatDateTime(d: Date | string | null | undefined, tz = "Asia/Kolkata") {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(new Date(d));
}

export function startOfMonth(s: string) {
  return s.slice(0, 8) + "01";
}
export function endOfMonthExclusive(s: string) {
  const [y, m] = s.split("-").map(Number);
  return fromUtc(Date.UTC(y, m, 1));
}

/** Current instant in ms (helper keeps render functions free of direct impure calls). */
export function nowMs() {
  return Date.now();
}
