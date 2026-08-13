import { test, expect } from "@playwright/test";
import { attachConsoleGuard } from "../../utils/console";
import { flightConfirmationState } from "../../fixtures/booking-states";

test.describe("flight booking success actions", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((payload) => {
      sessionStorage.setItem("itinero_flight_confirmation", JSON.stringify(payload));
      sessionStorage.setItem("itinero_selected_flight", JSON.stringify(payload.flight));
    }, flightConfirmationState);
  });

  test("success page renders and primary buttons click", async ({ page }) => {
    const guard = attachConsoleGuard(page);
    await page.goto("/flights/booking-success", { waitUntil: "networkidle" });

    await expect(page.getByText(/booking|confirmed|ticket/i).first()).toBeVisible();

    const pdfBtn = page.getByRole("button", { name: /save pdf|download/i }).first();
    if (await pdfBtn.isVisible().catch(() => false)) {
      await pdfBtn.click();
    }

    const tripsBtn = page.getByRole("button", { name: /my trips|view in trips/i }).first();
    if (await tripsBtn.isVisible().catch(() => false)) {
      await tripsBtn.click();
      await expect(page).toHaveURL(/trips/);
    }

    guard.assertClean();
  });
});
