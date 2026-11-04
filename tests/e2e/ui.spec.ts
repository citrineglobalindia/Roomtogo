import { expect, test } from "@playwright/test";

test.describe("accessibility & responsive UI", () => {
  test("gallery filters and lightbox work with the keyboard and restore focus", async ({ page }) => {
    await page.goto("/gallery");
    await page.getByRole("button", { name: "Dining", exact: true }).click();
    await expect(page.getByRole("button", { name: "Dining", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "All", exact: true }).click();
    const first = page.getByRole("button", { name: /^Open photo/ }).first();
    await first.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("button", { name: "Close photo viewer" })).toBeFocused();
    await expect(dialog).toContainText("1 /");
    await page.keyboard.press("ArrowRight");
    await expect(dialog).toContainText("2 /");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(first).toBeFocused();
  });

  for (const width of [360, 768, 1024, 1440]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/", "/gallery", "/reviews", "/rooms", "/rooms/executive-room", "/contact", "/book"]) {
        await page.goto(path);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${path} @${width}`).toBeLessThanOrEqual(0);
      }
    });
  }

  test("mobile menu and booking bar", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    const nav = page.getByRole("navigation", { name: "Mobile" });
    await expect(nav).toBeVisible();
    await nav.getByRole("link", { name: "Gallery" }).click();
    await expect(page).toHaveURL(/\/gallery/);
    await expect(page.getByRole("link", { name: "Check availability" }).last()).toBeVisible();
    // footer reserves room for the bar, and the bar slides away once the footer is on screen
    const pad = await page.evaluate(() => getComputedStyle(document.querySelector("footer")!).paddingBottom);
    expect(parseInt(pad)).toBeGreaterThanOrEqual(72);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator("div.fixed.bottom-0[aria-hidden='true']")).toHaveCount(1);
    // the bar never appears inside the booking flow
    await page.goto("/book");
    await expect(page.locator("div.fixed.bottom-0.sm\\:hidden")).toHaveCount(0);
  });

  test("private pages are not indexable; public pages have canonical + structured data without ratings", async ({ page, request }) => {
    const r = await request.get("/admin/login");
    expect(r.headers()["x-robots-tag"]).toContain("noindex");
    expect(r.headers()["cache-control"]).toContain("no-store");
    await page.goto("/");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /^http:\/\/localhost:3100\/?$/);
    const ld = await page.locator('script[type="application/ld+json"]').innerText();
    expect(ld).toContain("LodgingBusiness");
    expect(ld).not.toMatch(/aggregateRating|review|priceRange/i);
  });
});
