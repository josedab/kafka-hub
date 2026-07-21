import { test, expect } from "@playwright/test";

const MOBILE_VIEWPORTS = [
  { name: "320px", width: 320, height: 568 },
  { name: "375px", width: 375, height: 667 },
  { name: "414px", width: 414, height: 736 },
] as const;

for (const vp of MOBILE_VIEWPORTS) {
  test.describe(`Mobile nav at ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("no horizontal overflow", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      expect(bodyWidth).toBeLessThanOrEqual(viewportWidth);
    });

    test("menu opens, first link receives focus, active page has aria-current", async ({ page }) => {
      // Navigate to /diagnose so the Diagnose link is active
      await page.goto("/diagnose");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      // Find and click the mobile menu toggle
      const menuButton = page.getByRole("button", {
        name: /open navigation menu|menu/i,
      });
      await expect(menuButton).toBeVisible();
      await menuButton.click();

      // Mobile menu should be visible
      const mobileNav = page.locator("#mobile-nav");
      await expect(mobileNav).toBeVisible({ timeout: 3000 });

      // First link in mobile nav should receive focus
      const firstLink = mobileNav.getByRole("link").first();
      await expect(firstLink).toBeFocused();

      // The Diagnose link should have aria-current="page"
      const activeLink = mobileNav.locator("[aria-current='page']").first();
      await expect(activeLink).toBeVisible();
      await expect(activeLink).toHaveText(/diagnose/i);
    });

    test("Escape closes menu and returns focus to trigger", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const menuButton = page.getByRole("button", {
        name: /open navigation menu|menu/i,
      });
      await menuButton.click();

      const mobileNav = page.locator("#mobile-nav");
      await expect(mobileNav).toBeVisible({ timeout: 3000 });

      // Press Escape
      await page.keyboard.press("Escape");

      // Menu should be closed
      await expect(mobileNav).not.toBeVisible({ timeout: 3000 });

      // Focus should return to the menu trigger button
      const triggerButton = page.getByRole("button", {
        name: /open navigation menu/i,
      });
      await expect(triggerButton).toBeFocused();
    });
  });
}
