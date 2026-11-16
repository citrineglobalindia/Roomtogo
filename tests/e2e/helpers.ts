import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

export function creds(role: "owner" | "reception" | "content") {
  const line = readFileSync(".e2e-credentials", "utf8").split("\n").find((l) => l.startsWith(role))!;
  const [, email, password] = line.trim().split(/\s+/);
  return { email, password };
}

export async function staffLogin(page: Page, role: "owner" | "reception" | "content") {
  const c = creds(role);
  await page.goto("/admin/login");
  await page.fill("input[name=email]", c.email);
  await page.fill("input[name=password]", c.password);
  await page.getByRole("button", { name: "Sign in to admin" }).click();
  await page.waitForURL(/\/admin(\?|$)/);
}

/** Property-local date offset (Asia/Kolkata). */
export function day(offset: number) {
  const now = new Date(Date.now() + 5.5 * 3600_000 + offset * 86400_000);
  return now.toISOString().slice(0, 10);
}

/** Fill the checkout form up to (not including) Confirm Reservation. */
export async function fillGuestDetails(page: Page, o: { checkIn: string; checkOut: string; email: string; name?: string; roomIndex?: number }) {
  await page.goto(`/book?checkIn=${o.checkIn}&checkOut=${o.checkOut}&adults=2&children=0&rooms=1`);
  await page.getByRole("link", { name: "Select" }).nth(o.roomIndex ?? 0).click();
  await page.waitForURL(/\/checkout\?/);
  await page.fill("input[name=leadName]", o.name ?? "E2E Guest");
  await page.fill("input[name=leadPhone]", "+91 98765 43210");
  await page.fill("input[name=leadEmail]", o.email);
  await page.check("input[name=acceptPolicies]");
}

/** Test-only: read the last OTP the e2e server generated for this email (E2E_OTP_ECHO). */
export async function testOtp(page: Page, email: string) {
  const r = await page.request.get(`/api/test/otp?email=${encodeURIComponent(email)}`);
  const { code } = (await r.json()) as { code: string | null };
  expect(code).toMatch(/^\d{6}$/);
  return code!;
}

export async function verifyEmail(page: Page, email: string) {
  await page.getByRole("button", { name: /Send OTP|Resend OTP/ }).click();
  await expect(page.getByText(/emailed you a 6-digit code/)).toBeVisible();
  await page.getByLabel("One-time code").fill(await testOtp(page, email));
  await page.getByRole("button", { name: "Verify OTP" }).click();
  await expect(page.getByText(/Email verified/)).toBeVisible();
}

/** Full website reservation: details → OTP → Confirm Reservation. Returns the reservation ID. */
export async function bookAsGuest(page: Page, o: { checkIn: string; checkOut: string; email: string; name?: string; roomIndex?: number }) {
  await fillGuestDetails(page, o);
  await verifyEmail(page, o.email);
  await page.getByRole("button", { name: "Confirm Reservation" }).click();
  await page.waitForURL(/\/booking\/confirmation\?ref=/);
  return (await page.getByTestId("reservation-id").innerText()).trim();
}

export async function latestCode(page: Page, email: string) {
  await page.goto(`/demo/mailbox?to=${encodeURIComponent(email)}`);
  const text = await page.locator("[data-testid=demo-mail]").filter({ hasText: "access code" }).first().innerText();
  const m = text.match(/\b(\d{6})\b/);
  expect(m).not.toBeNull();
  return m![1];
}
