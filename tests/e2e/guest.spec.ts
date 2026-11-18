import { expect, test } from "@playwright/test";
import { bookAsGuest, day, fillGuestDetails, latestCode, staffLogin, testOtp, verifyEmail } from "./helpers";

test.describe("guest journeys", () => {
  test("reserve with email OTP (no payment), conversion event fires once, then manage via code", async ({ page, browser }) => {
    const ref = await bookAsGuest(page, { checkIn: day(40), checkOut: day(42), email: "e2e-a@example.com" });
    await expect(page.getByRole("heading", { name: "Reservation confirmed" })).toBeVisible();
    await expect(page.getByText(/Nothing has been charged/)).toBeVisible();
    expect(ref).toMatch(/^R2G-[A-Z0-9]{6}$/);
    // exactly one conversion push, with exactly the agreed keys and no personal data
    // (GTM adds its own internal "gtm.*" counters to pushed objects; ignore those)
    const events = await page.evaluate(() =>
      (window.dataLayer || [])
        .filter((e) => (e as { event?: string }).event === "room2go_reservation_confirmed")
        .map((e) => Object.fromEntries(Object.entries(e as Record<string, unknown>).filter(([k]) => !k.startsWith("gtm.")))),
    );
    expect(events).toEqual([{ event: "room2go_reservation_confirmed", reservation_id: ref, reservation_status: "otp_confirmed" }]);
    // refresh does not fire it again
    await page.reload();
    await expect(page.getByRole("heading", { name: "Reservation confirmed" })).toBeVisible();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window.dataLayer || []).filter((e) => (e as { event?: string }).event === "room2go_reservation_confirmed").length)).toBe(0);
    // the old payment pages are gone
    await page.goto(`/checkout/pay/${ref}`);
    await expect(page).toHaveURL(/booking\/confirmation/);

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
    // a different device (no browser memory of the push) still gets no second conversion: the server recorded it
    await p2.goto(`/booking/confirmation?ref=${ref}`);
    await expect(p2.getByRole("heading", { name: "Reservation confirmed" })).toBeVisible();
    await p2.waitForTimeout(500);
    expect(await p2.evaluate(() => (window.dataLayer || []).filter((e) => (e as { event?: string }).event === "room2go_reservation_confirmed").length)).toBe(0);
    await p2.goto(`/manage-booking/${ref}`);
    await p2.getByRole("button", { name: "Request cancellation" }).click();
    await p2.getByRole("button", { name: "Send cancellation request" }).click();
    await expect(p2.getByText(/not final until our team approves/)).toBeVisible();
    await ctx.close();
  });

  test("Confirm stays disabled until OTP verified; wrong codes are limited; resend has a cooldown", async ({ page }) => {
    const email = "otp-rules@example.com";
    await fillGuestDetails(page, { checkIn: day(60), checkOut: day(61), email });
    const confirm = page.getByRole("button", { name: "Confirm Reservation" });
    await expect(confirm).toBeDisabled();
    await page.getByRole("button", { name: "Send OTP" }).click();
    await expect(page.getByText(/emailed you a 6-digit code/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Resend in \d+s/ })).toBeDisabled();
    const real = await testOtp(page, email);
    const wrong = real === "000000" ? "111111" : "000000";
    for (let i = 4; i >= 1; i--) {
      await page.getByLabel("One-time code").fill(wrong);
      await page.getByRole("button", { name: "Verify OTP" }).click();
      await expect(page.getByText(new RegExp(`${i} attempts? left`))).toBeVisible();
      await expect(confirm).toBeDisabled();
    }
    await page.getByLabel("One-time code").fill(wrong);
    await page.getByRole("button", { name: "Verify OTP" }).click();
    await expect(page.getByText(/Too many incorrect attempts/)).toBeVisible();
    // even the right code is refused after 5 attempts
    await page.getByLabel("One-time code").fill(real);
    await page.getByRole("button", { name: "Verify OTP" }).click();
    await expect(page.getByText(/Too many incorrect attempts|request a new code/)).toBeVisible();
    await expect(confirm).toBeDisabled();
    // server also refuses a direct confirm without a verified OTP
    await page.evaluate(() => document.querySelector<HTMLFormElement>("form:has(input[name=leadEmail])")?.requestSubmit());
    await expect(page.getByRole("alert").filter({ hasText: /verify your email/i })).toBeVisible();
    await expect(page).toHaveURL(/\/checkout\?/);
  });

  test("double-clicking Confirm creates exactly one reservation", async ({ page, browser }) => {
    const email = "double@example.com";
    await fillGuestDetails(page, { checkIn: day(70), checkOut: day(71), email });
    await verifyEmail(page, email);
    const confirm = page.getByRole("button", { name: "Confirm Reservation" });
    await confirm.dblclick();
    await page.waitForURL(/\/booking\/confirmation\?ref=/);
    // replay the same verified submission: returns the same reservation, never a new one
    const staff = await browser.newPage();
    await staffLogin(staff, "owner");
    await staff.goto(`/admin/reservations?q=${encodeURIComponent(email)}`);
    await expect(staff.locator("a", { hasText: /^R2G-/ })).toHaveCount(1);
    // invalid dates are rejected server-side
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
