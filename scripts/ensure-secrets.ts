/**
 * Build step: make sure server secrets exist without anyone having to copy them around.
 * Missing secrets are generated (crypto-random) and stored in the database table app_secrets, so they stay
 * stable across deployments. The values are written into src/generated/runtime-secrets.ts inside the build
 * container (server bundle only). Values are never printed. Env vars, when set, take precedence at runtime.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { Pool } from "pg";
import { poolConfig } from "../src/db";

const KEYS = ["BETTER_AUTH_SECRET", "APP_SECRET", "CRON_SECRET", "SETUP_TOKEN"] as const;

async function main() {
  const pool = new Pool(poolConfig());
  const out: Record<string, string> = {};
  for (const k of KEYS) {
    await pool.query("INSERT INTO app_secrets (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING", [k, randomBytes(32).toString("base64url")]);
    const r = await pool.query<{ value: string }>("SELECT value FROM app_secrets WHERE key = $1", [k]);
    out[k] = r.rows[0].value;
  }
  await pool.end();
  writeFileSync(
    "src/generated/runtime-secrets.ts",
    `// Generated at build time — do not commit.\nexport const RUNTIME_SECRETS: Partial<Record<${KEYS.map((k) => `"${k}"`).join(" | ")}, string>> = ${JSON.stringify(out)};\n`,
  );
  console.log(`Server secrets ready (${KEYS.length} keys; values not shown).`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
