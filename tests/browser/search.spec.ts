import { test, expect } from "@playwright/test";

test.describe("Unified search UI", () => {
  test("opens search via accessible button and searches KIP-848", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Open search via button with accessible label
    const searchButton = page.getByRole("button", { name: /open search/i });
    await expect(searchButton).toBeVisible();
    await searchButton.click();

    // Search dialog should open
    const dialog = page.getByRole("dialog", { name: /search/i });
    await expect(dialog).toBeVisible();

    const searchInput = dialog.getByRole("textbox");
    await expect(searchInput).toBeVisible();

    // Type search query
    await searchInput.fill("KIP-848");

    // Wait for results rendered as buttons inside the dialog
    await expect(
      dialog.getByRole("button", { name: /KIP-848/i }).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("opens search via keyboard shortcut", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Use Cmd/Ctrl+K to open search
    await page.keyboard.press(
      process.platform === "darwin" ? "Meta+k" : "Control+k",
    );

    const dialog = page.getByRole("dialog", { name: /search/i });
    await expect(dialog).toBeVisible({ timeout: 3000 });
  });

  test("searches NotEnoughReplicasException and navigates to result", async ({ page }) => {
    await page.goto("/");

    // Open search
    const searchButton = page.getByRole("button", { name: /open search/i });
    await searchButton.click();

    const dialog = page.getByRole("dialog", { name: /search/i });
    await expect(dialog).toBeVisible();

    const searchInput = dialog.getByRole("textbox");
    await searchInput.fill("NotEnoughReplicasException");

    // Wait for a result button
    const resultButton = dialog.getByRole("button", { name: /NotEnoughReplicas/i }).first();
    await expect(resultButton).toBeVisible({ timeout: 5000 });

    // Click the result
    await resultButton.click();

    await expect(page).toHaveURL(
      /\/errors\/not-enough-replicas-exception$/,
      { timeout: 5000 },
    );
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "NotEnoughReplicasException",
      }),
    ).toBeVisible();
  });
});
