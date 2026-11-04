import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;
/** A transaction handle has the same query API as the db. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DbOrTx = DB | Tx;

const globalForDb = globalThis as unknown as { __r2gPool?: Pool; __r2gDb?: DB };

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See .env.example.");
  return new Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: true } : process.env.DATABASE_SSL === "no-verify" ? { rejectUnauthorized: false } : undefined,
  });
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
