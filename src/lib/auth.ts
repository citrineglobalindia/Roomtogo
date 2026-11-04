/**
 * Authentication via Better Auth (maintained library): email+password with verified email, password reset,
 * database-backed sessions, built-in rate limiting and TOTP two-factor (required for owners when
 * REQUIRE_OWNER_MFA=true). Staff authorisation is a SEPARATE table (staff_members) — public sign-up can
 * never grant staff roles.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { enqueue } from "@/domain/notifications";
import { authEmail } from "@/domain/templates";
import { appEnv, isProduction, publicBaseUrl, trustedOrigins } from "./config";
import { secretValue } from "./secrets";

function secret() {
  const s = secretValue("BETTER_AUTH_SECRET");
  if (!s || s.length < 32) {
    if (isProduction() || publicBaseUrl().startsWith("https://")) throw new Error("BETTER_AUTH_SECRET must be set (>= 32 chars) on any public deployment.");
    return "insecure-dev-better-auth-secret-change-me-please-123456";
  }
  return s;
}

async function queueAuthEmail(kind: "verify" | "reset", to: string, url: string, token: string) {
  const m = authEmail(kind, url);
  await enqueue(db, { template: `auth_${kind}`, to, ...m, dedupeKey: `auth-${kind}:${token}` });
  // Kick the outbox so auth emails are not delayed until the next cron tick (best effort).
  import("@/domain/notifications").then((n) => n.processOutbox(5)).catch(() => undefined);
}

export const auth = betterAuth({
  appName: "Room2Go",
  baseURL: publicBaseUrl(),
  secret: secret(),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      twoFactor: schema.twoFactor,
      rateLimit: schema.rateLimit,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url, token }) => queueAuthEmail("reset", user.email, url, token),
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url, token }) => queueAuthEmail("verify", user.email, url, token),
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: appEnv() !== "test",
    storage: "database",
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 300, max: 8 },
      "/sign-up/email": { window: 600, max: 5 },
      "/request-password-reset": { window: 600, max: 5 },
      "/send-verification-email": { window: 600, max: 5 },
      "/two-factor/verify-totp": { window: 300, max: 8 },
    },
  },
  advanced: {
    useSecureCookies: isProduction() || publicBaseUrl().startsWith("https://"),
    cookiePrefix: "r2g",
  },
  trustedOrigins: trustedOrigins(),
  plugins: [twoFactor({ issuer: "Room2Go" }), nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
