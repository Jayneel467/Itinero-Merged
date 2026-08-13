import { test, expect } from "@playwright/test";
import { attachConsoleGuard } from "../../utils/console";

const PUBLIC_ROUTES = [
  "/",
  "/flights",
  "/hotels",
  "/packages",
  "/transits",
  "/trains",
  "/events",
  "/explore",
  "/deals",
  "/trips",
  "/help",
  "/login",
];

test.describe("itinero public routes", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`loads ${route}`, async ({ page }) => {
      const guard = attachConsoleGuard(page);
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBeLessThan(500);
      await expect(page.locator("body")).toBeVisible();
      guard.assertClean();
    });
  }
});

test.describe("itinero navbar actions", () => {
  test("header buttons are clickable", async ({ page }) => {
    const guard = attachConsoleGuard(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const menu = page.getByRole("button", { name: /menu|navigation/i }).first();
    if (await menu.isVisible().catch(() => false)) {
      await menu.click();
    }

    const hotelsLink = page.getByRole("link", { name: /hotels|stays/i }).first();
    if (await hotelsLink.isVisible().catch(() => false)) {
      await hotelsLink.click();
      await expect(page).toHaveURL(/hotels/);
    }

    guard.assertClean();
  });
});
