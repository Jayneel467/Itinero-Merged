import { test, expect } from "@playwright/test";
import { attachConsoleGuard } from "../../utils/console";

const ROUTES = ["/", "/book", "/book/hotels", "/ai"];

test.describe("itinero-web routes", () => {
  for (const route of ROUTES) {
    test(`loads ${route}`, async ({ page }) => {
      const guard = attachConsoleGuard(page);
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBeLessThan(500);
      await expect(page.locator("body")).toBeVisible();
      guard.assertClean();
    });
  }

  test("home CTA links navigate", async ({ page }) => {
    const guard = attachConsoleGuard(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const bookLink = page.getByRole("link", { name: /book|travel|hotels/i }).first();
    if (await bookLink.isVisible().catch(() => false)) {
      await bookLink.click();
      await expect(page).not.toHaveURL(/\/$/);
    }

    guard.assertClean();
  });
});
