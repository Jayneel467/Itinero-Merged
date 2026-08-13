import { defineConfig, devices } from "@playwright/test";

const ITINERO_URL = process.env.ITINERO_URL || "http://127.0.0.1:5173/itinero/";
const ITINERO_WEB_URL = process.env.ITINERO_WEB_URL || "http://127.0.0.1:3001/";
const UI_URL = process.env.UI_URL || "http://127.0.0.1:3000/";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ["list"],
    ["html", { outputFolder: "reports/playwright", open: "never" }],
    ["json", { outputFile: "reports/playwright-results.json" }],
  ],
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "itinero",
      testDir: "./tests/itinero",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: ITINERO_URL,
      },
    },
    {
      name: "itinero-web",
      testDir: "./tests/itinero-web",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: ITINERO_WEB_URL,
      },
    },
    {
      name: "ui",
      testDir: "./tests/ui",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: UI_URL,
      },
    },
  ],
});
