import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { jobRuns } from "@/db/schema";

/** Liveness + basic readiness for uptime monitors. Exposes no configuration secrets. */
export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    const jobs = await db.select({ job: jobRuns.job, lastFinishedAt: jobRuns.lastFinishedAt, lastStatus: jobRuns.lastStatus }).from(jobRuns);
    const stale = jobs.filter((j) => j.job === "expire-holds" && j.lastFinishedAt && Date.now() - j.lastFinishedAt.getTime() > 15 * 60_000);
    return NextResponse.json({ ok: true, db: "up", jobs, warnings: stale.length ? ["expire-holds job has not run in 15 minutes"] : [] });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
