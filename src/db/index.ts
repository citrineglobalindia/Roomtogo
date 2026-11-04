import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;
/** A transaction handle has the same query API as the db. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DbOrTx = DB | Tx;

const globalForDb = globalThis as unknown as { __r2gPool?: Pool; __r2gDb?: DB };

/** Connection string: DATABASE_URL, or POSTGRES_URL as set by Vercel's Supabase/Neon integrations. */
export function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
}

/**
 * SSL: DATABASE_SSL=require verifies certificates (Neon). Supabase's pooler uses its own CA, so for
 * supabase hosts (or DATABASE_SSL=no-verify) TLS is used without CA verification. sslmode in the URL is
 * stripped so these explicit settings apply.
 */
export function poolConfig() {
  const raw = databaseUrl();
  if (!raw) throw new Error("DATABASE_URL (or POSTGRES_URL) is not set. See .env.example.");
  const u = new URL(raw);
  const supabase = /supabase\.(co|com)$/.test(u.hostname);
  for (const k of ["sslmode", "supa", "pgbouncer"]) u.searchParams.delete(k);
  const mode = process.env.DATABASE_SSL || (supabase ? "no-verify" : "");
  const ssl = mode === "require" ? { rejectUnauthorized: true } : mode === "no-verify" ? { rejectUnauthorized: false } : undefined;
  return { connectionString: u.toString(), ssl };
}

function createPool() {
  return new Pool({ ...poolConfig(), max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
}

export function getPool(): Pool {
  if (!globalForDb.__r2gPool) globalForDb.__r2gPool = createPool();
  return globalForDb.__r2gPool;
}

export function getDb(): DB {
  if (!globalForDb.__r2gDb) globalForDb.__r2gDb = drizzle(getPool(), { schema });
  return globalForDb.__r2gDb;
}

/** Lazy proxy so importing this module does not require DATABASE_URL at build time. */
export const db: DB = new Proxy({} as DB, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});

export { schema };
