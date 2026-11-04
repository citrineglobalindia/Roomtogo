/**
 * HOSTED DEMO DEFAULTS — applied only on Vercel (process.env.VERCEL set) and only for variables that are
 * NOT set in the Vercel project. They make the staging site a clearly labelled DEMO: banner on every page,
 * sample data, simulated payments, captured (undelivered) emails, search engines blocked.
 *
 * GO-LIVE: set APP_ENV=production (plus PAYMENT_PROVIDER=razorpay, EMAIL_PROVIDER=smtp, STORAGE_PROVIDER=s3
 * and their credentials) in Vercel → any variable set there overrides these defaults, and production
 * mode refuses every demo adapter regardless (see lib/config.ts).
 */
export const HOSTED_DEMO_DEFAULTS: Record<string, string> = {
  APP_ENV: "development",
  DEMO_MODE: "true",
  PAYMENT_PROVIDER: "demo",
  EMAIL_PROVIDER: "demo",
  STORAGE_PROVIDER: "local",
};

export function env(key: string): string | undefined {
  const v = process.env[key];
  if (v !== undefined && v !== "") return v;
  return process.env.VERCEL ? HOSTED_DEMO_DEFAULTS[key] : undefined;
}
