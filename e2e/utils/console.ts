import type { Page } from "@playwright/test";

const IGNORE_PATTERNS = [
  /favicon/i,
  /Failed to load resource.*404/i,
  /DevTools/i,
  /React Router Future Flag Warning/i,
  /Download the React DevTools/i,
  /Stripe\.js/i,
  /Content Security Policy/i,
];

export function attachConsoleGuard(page: Page) {
  const errors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORE_PATTERNS.some((re) => re.test(text))) return;
    errors.push(text);
  });

  page.on("pageerror", (err) => {
    errors.push(err.message);
  });

  return {
    assertClean() {
      if (errors.length) {
        throw new Error(`Console/page errors:\n${errors.join("\n")}`);
      }
    },
    errors,
  };
}

export async function seedSessionStorage(
  page: Page,
  key: string,
  value: Record<string, unknown>
) {
  await page.addInitScript(
    ({ storageKey, storageValue }) => {
      sessionStorage.setItem(storageKey, JSON.stringify(storageValue));
    },
    { storageKey: key, storageValue: value }
  );
}
