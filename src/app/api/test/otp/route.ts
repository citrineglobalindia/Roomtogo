import { NextResponse } from "next/server";
import { e2eEcho, e2eLastCode } from "@/domain/reservation-otp";

/** Automated-test helper. 404 unless E2E_OTP_ECHO=1 on a non-Vercel, non-production server. */
export async function GET(req: Request) {
  if (!e2eEcho()) return new NextResponse("Not found", { status: 404 });
  const email = new URL(req.url).searchParams.get("email") ?? "";
  return NextResponse.json({ code: e2eLastCode(email) });
}
