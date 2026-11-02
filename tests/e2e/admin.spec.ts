import { expect, test } from "@playwright/test";
import { bookAsGuest, day, payDemo, staffLogin } from "./helpers";

test.describe("staff journeys", () => {
  test("owner: offline phone booking blocks the website sale for the last unit", async ({ page, browser }) => {
    await staffLogin(page, "owner");
    // Suite has a single (sample) unit
    await page.goto(`/admin/reservations/new?checkIn=${day(80)}&checkOut=${day(82)}`);
    await page.selectOption("select[name=source]", "phone");
    await page.fill("input[name=checkIn]", day(80));
    await page.fill("input[name=checkOut]", day(82));
    await page.selectOption("select[name=roomTypeId]", { label: "Suite Room" });
    await page.fill("input[name=leadName]", "Phone Caller");
    await page.fill("input[name=leadEmail]", "caller@example.com");
    await page.fill("input[name=leadPhone]", "+91 90000 00000");
    await page.getByRole("button", { name: "Create confirmed reservation" }).click();
    await page.waitForURL(/\/admin\/reservations\/[0-9a-f-]{36}/);
    await expect(page.getByText("source: phone")).toBeVisible();
    const guest = await browser.newPage();
    await guest.goto(`/book?checkIn=${day(81)}&checkOut=${day(83)}&adults=2&rooms=1`);
    const suite = guest.locator("article", { hasText: "Suite Room" });
    await expect(suite.getByText("Not available for these dates")).toBeVisible();
  });

  test("reception sees no refund controls and is redirected from owner modules", async ({ page, browser }) => {
    const g = await browser.newPage();
    const ref = await bookAsGuest(g, { checkIn: day(85), checkOut: day(86), email: "rcpt@example.com" });
    await payDemo(g, "Simulate successful payment");
    await g.waitForURL(/confirmation/);
    await staffLogin(page, "reception");
    await page.goto(`/admin/reservations?q=${ref}`);
    await page.getByRole("link", { name: ref }).click();
    await expect(page.getByRole("button", { name: "Record offline payment" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Refund" })).toHaveCount(0);
    await page.goto("/admin/rates");
    await expect(page).toHaveURL(/denied=1/);
    const csv = await page.request.get("/api/admin/report.csv?from=2026-01-01&to=2026-12-31");
    expect(csv.status()).toBe(403);
  });

  test("content editor: no reservation or guest data, can edit and preview content", async ({ page }) => {
    await staffLogin(page, "content");
    await page.goto("/admin/reservations");
    await expect(page).toHaveURL(/denied=1/);
    expect((await page.request.get("/api/admin/reservations.csv")).status()).toBe(403);
    await page.goto("/admin/content?key=about");
    await page.fill("input[name=title]", "Comfort that feels personal — draft");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText(/Draft saved/)).toBeVisible();
    await page.goto("/about");
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(/draft/);
    await page.goto("/about?preview=1");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/draft/);
  });

  test("calendar shows bookings and holds with a legend; persistence survives reload", async ({ page }) => {
    await staffLogin(page, "owner");
    await page.goto(`/admin/calendar?view=month&date=${day(80)}`);
    await expect(page.getByRole("list", { name: "Legend" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Phone Caller|R2G-/ }).first()).toBeVisible();
    await page.goto("/admin/settings");
    await page.fill("input[name=holdMinutes]", "12");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText(/Settings saved/)).toBeVisible();
    await page.reload();
    await expect(page.locator("input[name=holdMinutes]")).toHaveValue("12");
  });
});
