/** Server-only module (never import from client components). */
import { RUNTIME_SECRETS } from "@/generated/runtime-secrets";

type Key = keyof typeof RUNTIME_SECRETS;
/** Env var first, then the build-generated value persisted in the database. */
export function secretValue(key: Key): string | undefined {
  const v = process.env[key];
  return v && v.length > 0 ? v : RUNTIME_SECRETS[key];
}
