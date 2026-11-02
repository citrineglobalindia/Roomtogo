/**
 * Runtime configuration and feature flags.
 *
 * Safety rules enforced here (not just documented):
 * - In APP_ENV=production, DEMO adapters are never used: demo payments/emails are refused.
 * - Razorpay LIVE keys are refused unless ALLOW_LIVE_PAYMENTS=true is set deliberately by the owner.
 * - Missing provider credentials resolve to "unconfigured" (visible in admin) instead of pretend success.
 */
export type AppEnv = "development" | "test" | "production";

export type PaymentProviderId = "razorpay" | "demo" | "none";
export type EmailProviderId = "smtp" | "demo" | "none";

function bool(v: string | undefined, def = false) {
  if (v === undefined || v === "") return def;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

export function appEnv(): AppEnv {
  const v = (process.env.APP_ENV ?? (process.env.NODE_ENV === "production" ? "production" : "development")) as AppEnv;
  return ["development", "test", "production"].includes(v) ? v : "development";
}

export const isProduction = () => appEnv() === "production";

/** Demo mode: sample content and simulated adapters are allowed and loudly labelled. Never in production. */
export function isDemoMode(): boolean {
  return !isProduction() && bool(process.env.DEMO_MODE, false);
}

export function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function appSecret(): string {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) {
    if (isProduction()) throw new Error("APP_SECRET must be set (>= 32 chars) in production.");
    return "insecure-development-secret-do-not-use-in-production";
  }
  return s;
}

export type PaymentConfig =
  | { provider: "razorpay"; mode: "test" | "live"; keyId: string; keySecret: string; webhookSecret: string | null }
  | { provider: "demo"; mode: "demo" }
  | { provider: "none"; reason: string };

export function paymentConfig(): PaymentConfig {
  const requested = (process.env.PAYMENT_PROVIDER ?? "none") as PaymentProviderId;
  if (requested === "demo") {
    if (isProduction()) return { provider: "none", reason: "Demo payments are disabled in production." };
    return { provider: "demo", mode: "demo" };
  }
  if (requested === "razorpay") {
    const keyId = process.env.RAZORPAY_KEY_ID ?? "";
    const keySecret = process.env.RAZORPAY_KEY_SECRET ?? "";
    if (!keyId || !keySecret) return { provider: "none", reason: "Razorpay key ID / secret not configured." };
    const mode = keyId.startsWith("rzp_live_") ? "live" : "test";
    if (mode === "live" && !bool(process.env.ALLOW_LIVE_PAYMENTS)) {
      return { provider: "none", reason: "Live Razorpay keys present but ALLOW_LIVE_PAYMENTS is not enabled." };
    }
    if (mode === "test" && isProduction() && !bool(process.env.ALLOW_TEST_PAYMENTS_IN_PRODUCTION)) {
      return { provider: "none", reason: "Razorpay TEST keys cannot take bookings in production." };
    }
    return { provider: "razorpay", mode, keyId, keySecret, webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || null };
  }
  return { provider: "none", reason: "No payment provider configured (PAYMENT_PROVIDER)." };
}

export type EmailConfig =
  | { provider: "smtp"; host: string; port: number; user?: string; pass?: string; secure: boolean; from: string }
  | { provider: "demo"; from: string }
  | { provider: "none"; reason: string };

export function emailConfig(): EmailConfig {
  const requested = (process.env.EMAIL_PROVIDER ?? "none") as EmailProviderId;
  const from = process.env.EMAIL_FROM ?? "Room2Go <no-reply@localhost>";
  if (requested === "demo") {
    if (isProduction()) return { provider: "none", reason: "Demo email capture is disabled in production." };
    return { provider: "demo", from };
  }
  if (requested === "smtp") {
    const host = process.env.SMTP_HOST;
    if (!host || !process.env.EMAIL_FROM) return { provider: "none", reason: "SMTP_HOST / EMAIL_FROM not configured." };
    const port = Number(process.env.SMTP_PORT ?? 587);
    return {
      provider: "smtp",
      host,
      port,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      secure: bool(process.env.SMTP_SECURE, port === 465),
      from,
    };
  }
  return { provider: "none", reason: "No email provider configured (EMAIL_PROVIDER)." };
}

export type StorageConfig =
  | { provider: "s3"; bucket: string; region: string; endpoint?: string; accessKeyId: string; secretAccessKey: string; publicBaseUrl?: string }
  | { provider: "local"; dir: string }
  | { provider: "none"; reason: string };

export function storageConfig(): StorageConfig {
  const p = process.env.STORAGE_PROVIDER ?? "local";
  if (p === "s3") {
    const { S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
    if (!S3_BUCKET || !S3_REGION || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY)
      return { provider: "none", reason: "S3 storage variables incomplete." };
    return {
      provider: "s3",
      bucket: S3_BUCKET,
      region: S3_REGION,
      endpoint: process.env.S3_ENDPOINT || undefined,
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
      publicBaseUrl: process.env.S3_PUBLIC_BASE_URL || undefined,
    };
  }
  if (isProduction() && !bool(process.env.ALLOW_LOCAL_STORAGE_IN_PRODUCTION))
    return { provider: "none", reason: "Local disk storage is not allowed in production; configure S3-compatible storage." };
  return { provider: "local", dir: process.env.LOCAL_STORAGE_DIR ?? "./storage" };
}

export function channelConfig() {
  const p = process.env.CHANNEL_PROVIDER ?? "none";
  return {
    provider: p as "none",
    note:
      "No PMS / channel manager is connected. External platforms are NOT automatically synchronised; staff must enter OTA/phone bookings manually.",
  };
}

export function requireOwnerMfa(): boolean {
  return bool(process.env.REQUIRE_OWNER_MFA, isProduction());
}

export function analyticsConfig() {
  return {
    provider: (process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER ?? "none") as "none" | "ga4" | "gtm",
    ga4Id: process.env.NEXT_PUBLIC_GA4_ID ?? "",
    gtmId: process.env.NEXT_PUBLIC_GTM_ID ?? "",
  };
}
