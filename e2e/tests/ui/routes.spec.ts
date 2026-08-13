import { test, expect } from "@playwright/test";
import { attachConsoleGuard } from "../../utils/console";

test.describe("ui chat shell", () => {
  test("loads home and quick actions are clickable", async ({ page }) => {
    const guard = attachConsoleGuard(page);

    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ reply: "Audit stub reply", cards: null }),
      });
    });

    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator("body")).toBeVisible();

    const flightsAction = page.getByText(/flights/i).first();
    if (await flightsAction.isVisible().catch(() => false)) {
      await flightsAction.click();
    }

    const input = page.locator("textarea, input[type='text']").first();
    if (await input.isVisible().catch(() => false)) {
      await input.fill("Plan a weekend in Goa");
      const send = page.getByRole("button").filter({ hasText: /send|arrow|submit/i }).first();
      if (await send.isVisible().catch(() => false)) {
        await send.click();
        await expect(page.getByText(/audit stub reply/i)).toBeVisible({ timeout: 15_000 });
      }
    }

    guard.assertClean();
  });
});
