import { NextResponse, type NextRequest } from "next/server";
import { buildReport, reportToCsv } from "@/domain/reports";
import { getSettings } from "@/domain/settings";
import { addDays, isIsoDate } from "@/lib/dates";
import { getStaff } from "@/lib/staff";

export async function GET(req: NextRequest) {
  const st = await getStaff();
  if (!st?.can("reports.view")) return new NextResponse("Forbidden", { status: 403 });
  const p = req.nextUrl.searchParams;
  const from = p.get("from") ?? "";
  const to = p.get("to") ?? "";
  if (!isIsoDate(from) || !isIsoDate(to) || to < from) return new NextResponse("Invalid range", { status: 400 });
  const s = await getSettings();
  const r = await buildReport({ from, to: addDays(to, 1), tz: s.timezone, includeDemo: p.get("demo") === "1" });
  return new NextResponse(reportToCsv(r), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="room2go-report-${from}-${to}.csv"`, "cache-control": "no-store" } });
}
