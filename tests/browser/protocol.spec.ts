import { test, expect } from "@playwright/test";

/**
 * Protocol Lab smoke tests: landing page lists all five labs, each detail
 * page loads with the required Kafka baseline disclosure, Sequence/Wire
 * mode switching works, and the player's step/scenario controls work.
 */

const LAB_SLUGS = [
  "produce-record",
  "consumer-group",
  "share-groups",
  "transactions",
  "replication-failover",
] as const;

test.describe("Protocol Lab landing", () => {
  test("lists all five labs and links to each", async ({ page }) => {
    await page.goto("/protocol");
    await expect(page.getByRole("heading", { level: 1, name: /protocol lab/i })).toBeVisible();
    await expect(page.getByText("Reviewed against Apache Kafka 4.3.1")).toBeVisible();

    for (const slug of LAB_SLUGS) {
      await expect(page.locator(`a[href="/protocol/${slug}"]`).first()).toBeVisible();
    }
  });

  test("is reachable from the main navigation", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Protocol", exact: true }).first().click();
    await expect(page).toHaveURL(/\/protocol$/);
    await expect(page.getByRole("heading", { level: 1, name: /protocol lab/i })).toBeVisible();
  });
});

test.describe("Protocol Lab detail pages", () => {
  for (const slug of LAB_SLUGS) {
    test(`${slug}: loads, shows baseline text, and plays a step`, async ({ page }) => {
      await page.goto(`/protocol/${slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByText("Reviewed against Apache Kafka 4.3.1")).toBeVisible();

      // Scenario (variant) selector present with at least one option checked.
      const checkedVariant = page.getByRole("radio", { checked: true });
      await expect(checkedVariant).toBeVisible();

      // Step timeline / step counter visible.
      await expect(page.getByText(/step 1 of \d+/i)).toBeVisible();

      // Advance one step via the Next control.
      const nextButton = page.getByRole("button", { name: /next step/i });
      await expect(nextButton).toBeVisible();
      await nextButton.click();
      await expect(page.getByText(/step 2 of \d+/i)).toBeVisible();

      // Switch to Wire mode and confirm a decoded frame or the
      // internal-step placeholder is shown.
      await page.getByRole("tab", { name: "Wire" }).click();
      await expect(
        page.getByText(/apiKey=|no wire frame for this step/i).first(),
      ).toBeVisible();

      // Reset returns to step 1 deterministically.
      await page.getByRole("button", { name: /reset/i }).click();
      await expect(page.getByText(/step 1 of \d+/i)).toBeVisible();
    });
  }

  test("produce-record: switching scenarios resets to step 1", async ({ page }) => {
    await page.goto("/protocol/produce-record");
    const nextButton = page.getByRole("button", { name: /next step/i });
    await nextButton.click();
    await expect(page.getByText(/step 2 of \d+/i)).toBeVisible();

    const radios = page.getByRole("radio");
    const count = await radios.count();
    expect(count).toBeGreaterThan(1);
    await radios.nth(1).click();

    await expect(page.getByText(/step 1 of \d+/i)).toBeVisible();
  });

  test("keyboard controls stay scoped and scenario radios support arrow navigation", async ({
    page,
  }) => {
    await page.goto("/protocol/produce-record");

    const backLink = page.getByRole("link", { name: /back to protocol lab/i });
    await backLink.focus();
    await page.keyboard.press("End");
    await expect(page.getByText(/step 1 of \d+/i)).toBeVisible();

    const player = page.getByLabel(/protocol player/i);
    await player.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText(/step 2 of \d+/i)).toBeVisible();

    const radios = page.getByRole("radio");
    await radios.first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(radios.nth(1)).toHaveAttribute("aria-checked", "true");
    await expect(radios.nth(1)).toBeFocused();
    await expect(page.getByText(/step 1 of \d+/i)).toBeVisible();
  });
});
