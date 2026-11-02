import { headers } from "next/headers";
import { sha256 } from "./tokens";

/** Hashed client identifier for rate limiting (no raw IP stored). */
export async function clientKey() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "local";
  return sha256(`${ip}|${h.get("user-agent") ?? ""}`).slice(0, 32);
}
