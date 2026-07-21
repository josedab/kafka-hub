import { test, expect } from "@playwright/test";

test.describe("Skip link and keyboard focus", () => {
  test("skip link is present and targets focusable main", async ({ page }) => {
    await page.goto("/");

    // Skip link should exist (sr-only until focused)
    const skipLink = page.getByRole("link", { name: /skip to main content/i });
    await expect(skipLink).toBeAttached();

    // Tab to reveal it
    await page.keyboard.press("Tab");
    await expect(skipLink).toBeFocused();

    // Click it — main should receive focus
    await skipLink.click();

    const main = page.locator("main#main-content");
    await expect(main).toBeVisible();
    // main has tabIndex={-1} so it can receive programmatic focus
    await expect(main).toBeFocused();
  });

  test("main content is focusable via id target", async ({ page }) => {
    await page.goto("/#main-content");

    const main = page.locator("main#main-content");
    await expect(main).toBeVisible();
    expect(await main.getAttribute("tabindex")).toBe("-1");
  });
});
