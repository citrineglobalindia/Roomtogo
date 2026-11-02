/**
 * Money is integer paise. Rounding rule: half-up to the nearest paisa, applied once per line
 * (each tax line / percentage computation), never on intermediate floats.
 */
export function assertPaise(n: number, label = "amount") {
  if (!Number.isSafeInteger(n)) throw new Error(`${label} must be an integer number of paise`);
}

/** amount * bps / 10000, rounded half-up (amount >= 0). */
export function applyBps(amountPaise: number, bps: number): number {
  assertPaise(amountPaise);
  assertPaise(bps, "bps");
  if (amountPaise < 0 || bps < 0) throw new Error("applyBps expects non-negative inputs");
  return Math.floor((amountPaise * bps + 5000) / 10000);
}

/** Percentage (integer 1..100) of amount, rounded half-up. */
export function percentOf(amountPaise: number, percent: number): number {
  return applyBps(amountPaise, percent * 100);
}

export function formatINR(paise: number, opts: { showPaise?: boolean } = {}): string {
  const rupees = paise / 100;
  const showPaise = opts.showPaise ?? paise % 100 !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: showPaise ? 2 : 0,
    maximumFractionDigits: showPaise ? 2 : 0,
  }).format(rupees);
}

/** Parse a rupee string from a form ("2,499.50") into paise. Returns null for blank. */
export function rupeesToPaise(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = String(input).replace(/[,\s₹]/g, "");
  if (s === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error("Enter an amount in rupees, e.g. 2499 or 2499.50");
  const [r, p = ""] = s.split(".");
  return Number(r) * 100 + Number((p + "00").slice(0, 2));
}

export function paiseToRupeeInput(paise: number | null | undefined): string {
  if (paise == null) return "";
  return (paise / 100).toFixed(paise % 100 === 0 ? 0 : 2);
}
