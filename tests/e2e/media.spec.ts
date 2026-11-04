import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { staffLogin } from "./helpers";

async function png(color: string) {
  const buffer = await sharp({ create: { width: 1200, height: 800, channels: 3, background: color } }).png().toBuffer();
  return { name: `${color.slice(1)}.png`, mimeType: "image/png", buffer };
}

async function pick(page: Page, scope: ReturnType<Page["locator"]>, files: Awaited<ReturnType<typeof png>>[]) {
  await scope.locator('input[type=file]').setInputFiles(files);
  await expect(scope.getByText(/ready \(/)).toBeVisible();
}

test.describe("photos: rooms, gallery, site images (db storage)", () => {
  test("owner uploads room photos, sets cover, adds to gallery, replaces the home banner", async ({ page, request }) => {
    await staffLogin(page, "owner");

    // 1. Room photos
    await page.goto("/admin/rooms");
    const room = page.locator("section", { has: page.getByRole("heading", { name: "Executive Room" }) }).first();
    await room.getByRole("button", { name: "Upload photos" }).click();
    await pick(page, room, [await png("#aa3322"), await png("#2233aa")]);
    await room.getByRole("button", { name: "Upload to room" }).click();
    await expect(page.getByText("2 photos added to Executive Room.")).toBeVisible();

    await page.goto("/rooms/executive-room");
    const src = await page.locator('img[src^="/media/uploads/"]').first().getAttribute("src");
    expect(src).toBeTruthy();
    const img = await request.get(src!);
    expect(img.status()).toBe(200);
    expect(img.headers()["content-type"]).toBe("image/webp");

    // Make the second one the cover, then add it to the gallery from the Gallery tab
    await page.goto("/admin/rooms");
    const room2 = page.locator("section", { has: page.getByRole("heading", { name: "Executive Room" }) }).first();
    const before = await room2.locator('img[src^="/media/uploads/"]').count();
    expect(before).toBeGreaterThanOrEqual(2);
    const target = room2.locator("li", { has: page.locator('img[src^="/media/uploads/"]') }).last();
    const targetSrc = await target.locator("img").getAttribute("src");
    await target.getByRole("button", { name: "Make cover" }).click();
    await expect(room2.locator("li", { has: page.locator(`img[src="${targetSrc}"]`) }).getByText("Cover", { exact: true })).toBeVisible();

    await page.goto("/admin/gallery");
    const addForm = page.locator("form", { hasText: "Executive Room" }).first();
    const tick = addForm.locator('label:has(img[src^="/media/uploads/"])').first();
    const added = await tick.locator("img").getAttribute("src");
    await tick.click();
    await addForm.getByRole("button", { name: /Add selected Executive Room photos/ }).click();
    await expect(page.getByText("1 photo added to the gallery.")).toBeVisible();
    await page.goto("/gallery");
    await expect(page.locator(`img[src="${added}"]`).first()).toBeAttached();

    // 2. Site-wide image: replace the home banner
    await page.goto("/admin/site-images");
    const hero = page.locator("section", { has: page.getByRole("heading", { name: "Home — top banner" }) });
    await hero.getByRole("button", { name: "Upload new photo" }).click();
    await pick(page, hero, [await png("#118844")]);
    await hero.getByRole("button", { name: "Upload & use" }).click();
    await expect(page.getByText("Home — top banner updated.")).toBeVisible();
    await page.goto("/");
    await expect(page.locator('section img[src^="/media/uploads/"]').first()).toBeAttached();

    // Reset restores the default
    await page.goto("/admin/site-images");
    await page.locator("section", { has: page.getByRole("heading", { name: "Home — top banner" }) }).getByRole("button", { name: "Reset to default" }).click();
    await expect(page.locator("section", { has: page.getByRole("heading", { name: "Home — top banner" }) }).getByText(/^Default/)).toBeVisible();
  });

  test("booking page offers an extended-stay enquiry", async ({ page }) => {
    await page.goto("/book");
    await page.getByRole("link", { name: /Staying a week or longer/ }).click();
    const sec = page.locator("#extended-stay");
    await expect(sec.getByRole("heading", { name: "Staying a week or longer?" })).toBeVisible();
    await expect(sec.locator('input[value="extended_stay"]')).toBeChecked();
  });
});
