import { test, expect } from "@playwright/test";

test.describe("Simulate deep links", () => {
  test("valid deep link selects the scenario", async ({ page }) => {
    await page.goto("/simulate?scenario=rebalance-consumer-protocol");
    await expect(
      page.getByRole("heading", { level: 1, name: /broker simulator/i }),
    ).toBeVisible();
    // The radio with this slug should be checked
    const radio = page.getByRole("radio", { checked: true });
    await expect(radio).toBeVisible();
    await expect(radio.getByText("rebalance-consumer-protocol")).toBeVisible();
  });

  test("invalid scenario falls back to default", async ({ page }) => {
    await page.goto("/simulate?scenario=nonexistent-scenario-xyz");
    await expect(
      page.getByRole("heading", { level: 1, name: /broker simulator/i }),
    ).toBeVisible();
    // A scenario radio should be checked (falls back to first/default)
    const checkedRadio = page.getByRole("radio", { checked: true });
    await expect(checkedRadio).toBeVisible();
    // Should NOT be the invalid slug
    await expect(checkedRadio.getByText("nonexistent-scenario-xyz")).not.toBeVisible();
  });

  test("selecting a scenario updates the URL", async ({ page }) => {
    await page.goto("/simulate");
    await expect(
      page.getByRole("heading", { level: 1, name: /broker simulator/i }),
    ).toBeVisible();

    // Click the consumer-protocol radio scenario
    const targetRadio = page.getByRole("radio", { name: /consumer.*protocol|KIP-848/i });
    await targetRadio.click();

    // URL should update with the scenario param
    await expect(page).toHaveURL(/scenario=rebalance-consumer-protocol/, { timeout: 5000 });
  });
});
