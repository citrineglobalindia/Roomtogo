import { NextResponse, type NextRequest } from "next/server";
import { JOBS, runAllJobs, runJob, type JobName } from "@/domain/jobs";
import { safeEqual } from "@/lib/tokens";

/** Scheduler entry point. Requires Authorization: Bearer $CRON_SECRET. Supports GET (Vercel Cron) and POST. */
async function handle(req: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { job } = await params;
  try {
    if (job === "all") return NextResponse.json(await runAllJobs());
    if (!(job in JOBS)) return NextResponse.json({ error: "unknown job" }, { status: 404 });
    return NextResponse.json(await runJob(job as JobName));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
export const GET = handle;
export const POST = handle;
