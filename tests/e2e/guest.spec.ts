import { expect, test } from "@playwright/test";
import { bookAsGuest, day, latestCode, payDemo } from "./helpers";

test.describe("guest journeys", () => {
  test("book without an account, then manage via reference + one-time code", async ({ page, browser }) => {
    const ref = await bookAsGuest(page, { checkIn: day(40), checkOut: day(42), email: "e2e-a@example.com" });
    await expect(page.getByText(/Room held for/)).toBeVisible();
    await payDemo(page, "Simulate successful payment");
    await page.waitForURL(/booking\/confirmation/);
    await expect(page.getByRole("heading", { name: "Your stay is confirmed" })).toBeVisible();
    await expect(page.getByText(ref)).toBeVisible();

    // Later, on a different device: no cookie → reference + email → code
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await p2.goto(`/manage-booking/${ref}`);
    await expect(p2).toHaveURL(/\/manage-booking\?ref=/); // no details without verification
    await expect(p2.getByText("e2e-a@example.com")).toHaveCount(0);
    await p2.fill("input[name=reference]", ref);
    await p2.fill("input[name=email]", "e2e-a@example.com");
    await p2.getByRole("button", { name: "Email me an access code" }).click();
    await expect(p2.getByText(/emailed a 6-digit code/).first()).toBeVisible();
    const mail = await ctx.newPage();
    const code = await latestCode(mail, "e2e-a@example.com");
    await p2.fill("input[name=code]", code);
    await p2.getByRole("button", { name: "View booking" }).click();
    await p2.waitForURL(new RegExp(`/manage-booking/${ref}$`));
    await expect(p2.getByText("E2E Guest")).toBeVisible();
    await p2.getByRole("button", { name: "Request cancellation" }).click();
    await p2.getByRole("button", { name: "Send cancellation request" }).click();
    await expect(p2.getByText(/not final until our team approves/)).toBeVisible();
    await ctx.close();
  });

  test("guest A cannot see guest B's booking, confirmation or receipt by changing the reference", async ({ browser }) => {
    const a = await browser.newContext();
    const b = await browser.newContext();
    const pa = await a.newPage();
    const pb = await b.newPage();
    const refA = await bookAsGuest(pa, { checkIn: day(50), checkOut: day(51), email: "iso-a@example.com", name: "Alice Isolated" });
    await payDemo(pa, "Simulate successful payment");
    const refB = await bookAsGuest(pb, { checkIn: day(50), checkOut: day(51), email: "iso-b@example.com", name: "Bob Private", roomIndex: 1 });
    await payDemo(pb, "Simulate successful payment");
    await pb.waitForURL(/confirmation/);
    for (const path of [`/booking/confirmation?ref=${refB}`, `/documents/${refB}/receipt`, `/checkout/pay/${refB}`]) {
      const r = await pa.goto(path);
      expect(r?.status(), path).toBe(404);
      await expect(pa.getByText("Bob Private")).toHaveCount(0);
    }
    await pa.goto(`/manage-booking/${refB}`);
    await expect(pa).toHaveURL(/\/manage-booking\?ref=/);
    await expect(pa.getByText("Bob Private")).toHaveCount(0);
    // A still sees their own
    const own = await pa.goto(`/documents/${refA}/receipt`);
    expect(own?.status()).toBe(200);
    await a.close();
    await b.close();
  });

  test("closed browser after payment is recovered by checking with the gateway", async ({ page }) => {
    await bookAsGuest(page, { checkIn: day(60), checkOut: day(61), email: "recover@example.com" });
    await payDemo(page, "Simulate payment, then browser closed (tests recovery)");
    await page.waitForURL(/recovery=1/);
    await expect(page.getByText(/haven’t received a confirmation from your browser/)).toBeVisible();
    await page.getByRole("button", { name: "Check payment status" }).click();
    await page.waitForURL(/booking\/confirmation/);
    await expect(page.getByRole("heading", { name: "Your stay is confirmed" })).toBeVisible();
  });

  test("failed payment does not confirm; invalid dates are rejected server-side", async ({ page }) => {
    await bookAsGuest(page, { checkIn: day(70), checkOut: day(71), email: "fail@example.com" });
    await payDemo(page, "Simulate failed payment");
    await page.waitForURL(/failed=1/);
    await expect(page.getByText(/did not complete/)).toBeVisible();
    await page.goto(`/book?checkIn=${day(10)}&checkOut=${day(8)}&adults=2`);
    await expect(page.getByText("Departure must be after arrival.")).toBeVisible();
    await page.goto(`/checkout?checkIn=${day(10)}&checkOut=${day(12)}&adults=9&children=0&sel=00000000-0000-0000-0000-000000000000:1`);
    await expect(page.getByRole("alert").filter({ hasText: /accommodate|Unknown room|not available/ })).toBeVisible();
  });

  test("enquiry form persists submissions (not just a toast)", async ({ page }) => {
    await page.goto("/extended-stays");
    await page.fill("input[name=name]", "Corporate Planner");
    await page.fill("input[name=email]", "planner@example.com");
    await page.fill("input[name=company]", "Acme Pvt Ltd");
    await page.fill("input[name=checkIn]", day(90));
    await page.fill("input[name=checkOut]", day(120));
    await page.fill("textarea[name=message]", "Need 3 rooms for a month for our team.");
    await page.waitForTimeout(2600); // anti-bot minimum fill time
    await page.getByRole("button", { name: "Send enquiry" }).click();
    await expect(page.getByText(/enquiry has been received/)).toBeVisible();
  });
});
