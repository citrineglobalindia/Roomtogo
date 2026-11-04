/**
 * Server-only secrets generated at build time by scripts/ensure-secrets.ts (Vercel builds) and stored in
 * the database table app_secrets. Environment variables always take precedence. This committed version
 * is intentionally empty; the build overwrites it inside the build container only.
 */
export const RUNTIME_SECRETS: Partial<Record<"BETTER_AUTH_SECRET" | "APP_SECRET" | "CRON_SECRET" | "SETUP_TOKEN", string>> = {};
