/** Recreates the isolated e2e database, applies migrations and runs the demo seed. Never touches dev/prod DBs. */
import { execFileSync } from "node:child_process";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const url = process.env.E2E_DATABASE_URL ?? "postgres://room2go:room2go@localhost:5432/room2go_e2e";
if (!/e2e/.test(url)) throw new Error("Refusing: E2E_DATABASE_URL must point at an e2e database");

async function main() {
  const pool = new Pool({ connectionString: url });
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
  execFileSync("npx", ["tsx", "scripts/seed.ts"], { stdio: "inherit", env: { ...process.env, DATABASE_URL: url, APP_ENV: "development", SEED_CREDENTIALS_FILE: ".e2e-credentials" } });
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
