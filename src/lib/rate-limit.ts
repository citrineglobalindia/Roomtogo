import { sql } from "drizzle-orm";
import { db } from "@/db";
import { UserError } from "./errors";
import { sha256 } from "./tokens";

/**
 * Fixed-window limiter stored in Postgres so it works across serverless instances.
 * Keys are hashed so no personal data (email/IP) is stored in clear.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  if (process.env.APP_ENV === "test" && process.env.RATE_LIMIT_IN_TESTS !== "true") return true;
  const k = sha256(key);
  const res = await db.execute<{ count: number }>(sql`
    INSERT INTO app_rate_limits (key, window_start, count) VALUES (${k}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN app_rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN 1 ELSE app_rate_limits.count + 1 END,
      window_start = CASE WHEN app_rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN now() ELSE app_rate_limits.window_start END
    RETURNING count`);
  return Number(res.rows[0]?.count ?? 0) <= limit;
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  if (!(await rateLimit(key, limit, windowSeconds))) {
    throw new UserError("Too many attempts. Please wait a few minutes and try again.", "rate_limited");
  }
}
