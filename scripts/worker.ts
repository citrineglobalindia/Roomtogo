/**
 * Long-running background worker for hosts without a scheduler (VM / container).
 *   npm run worker
 * Runs hold expiry + outbox every 30 s, reconciliation every 5 min, daily jobs hourly (idempotent).
 */
import "dotenv/config";
import { runJob } from "@/domain/jobs";

let tick = 0;
async function loop() {
  tick++;
  for (const j of ["expire-holds", "outbox"] as const) await runJob(j).catch((e) => console.error(j, e.message));
  if (tick % 10 === 0) await runJob("reconcile").catch((e) => console.error("reconcile", e.message));
  if (tick % 120 === 0) for (const j of ["review-invites", "pre-arrival", "retention"] as const) await runJob(j).catch((e) => console.error(j, e.message));
}
console.log("Room2Go worker started");
loop();
setInterval(loop, 30_000);
