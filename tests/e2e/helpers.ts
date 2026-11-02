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

export async function bookAsGuest(page: Page, o: { checkIn: string; checkOut: string; email: string; name?: string; roomIndex?: number }) {
  await page.goto(`/book?checkIn=${o.checkIn}&checkOut=${o.checkOut}&adults=2&children=0&rooms=1`);
  await page.getByRole("link", { name: "Select" }).nth(o.roomIndex ?? 0).click();
  await page.waitForURL(/\/checkout\?/);
  await page.fill("input[name=leadName]", o.name ?? "E2E Guest");
  await page.fill("input[name=leadEmail]", o.email);
  await page.fill("input[name=leadPhone]", "+91 98765 43210");
  await page.check("input[name=acceptPolicies]");
  await page.getByRole("button", { name: /Reserve/ }).click();
  await page.waitForURL(/\/checkout\/pay\//);
  const ref = page.url().split("/").pop()!.split("?")[0];
  return ref;
}

export async function payDemo(page: Page, outcome: "Simulate successful payment" | "Simulate failed payment" | "Simulate payment, then browser closed (tests recovery)") {
  await page.getByRole("link", { name: /Continue to DEMO payment/ }).click();
  await page.waitForURL(/demo-gateway/);
  await page.getByRole("button", { name: outcome }).click();
}

export async function latestCode(page: Page, email: string) {
  await page.goto(`/demo/mailbox?to=${encodeURIComponent(email)}`);
  const text = await page.locator("[data-testid=demo-mail]").filter({ hasText: "access code" }).first().innerText();
  const m = text.match(/\b(\d{6})\b/);
  expect(m).not.toBeNull();
  return m![1];
}
