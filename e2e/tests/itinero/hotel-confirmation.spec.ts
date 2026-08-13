import { test, expect } from "@playwright/test";
import { attachConsoleGuard, seedSessionStorage } from "../../utils/console";
import { hotelConfirmationState } from "../../fixtures/booking-states";

test.describe("hotel confirmation actions", () => {
  test.beforeEach(async ({ page }) => {
    await seedSessionStorage(page, "itinero_hotel_confirmation", hotelConfirmationState);
  });

  test("confirmation buttons work without console errors", async ({ page, context }) => {
    const guard = attachConsoleGuard(page);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/hotel/lp6554d34b/confirmation", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: /booking confirmed/i })).toBeVisible();

    const copyBtn = page.getByRole("button", { name: /copy booking reference/i });
    await copyBtn.click();
    await expect(copyBtn).toContainText(/copied/i);

    const downloadBtn = page.getByRole("button", { name: /download voucher/i });
    await downloadBtn.click();

    const shareBtn = page.getByRole("button", { name: /share booking/i });
    await shareBtn.click();

    const tripsBtn = page.getByRole("button", { name: /view in trips/i });
    await tripsBtn.click();
    await expect(page).toHaveURL(/trips/);

    guard.assertClean();
  });

  test("browse more hotels CTA navigates", async ({ page }) => {
    const guard = attachConsoleGuard(page);
    await page.goto("/hotel/lp6554d34b/confirmation", { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: /browse more hotels/i }).click();
    await expect(page).toHaveURL(/hotels/);
    guard.assertClean();
  });
});
