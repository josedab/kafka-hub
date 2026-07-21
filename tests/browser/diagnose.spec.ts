import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test.describe("Diagnose happy path", () => {
  test("composes fixes and redacts persisted/downloaded secrets", async ({
    page,
  }) => {
    await page.goto("/diagnose");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /configuration diagnostics/i,
      }),
    ).toBeVisible();

    const textarea = page.getByRole("textbox").first();
    await expect(textarea).toBeVisible();
    await expect(page.getByText(/danger|warning/i).first()).toBeVisible();

    const fixCheckbox = page.getByRole("checkbox").first();
    await expect(fixCheckbox).toBeVisible();
    await fixCheckbox.check();
    await expect(page.getByText(/fix composer/i)).toBeVisible();
    await expect(page.getByText(/merged diff preview/i)).toBeVisible();

    await textarea.fill(
      "ssl.keystore.password=browser-secret\nauto.create.topics.enable=true",
    );
    await page.getByRole("button", { name: /^analyze$/i }).click();
    await expect(
      page.getByText(/LLM analysis is not configured|LLM recommendations/i),
    ).toBeVisible();

    const persisted = await page.evaluate(() =>
      Object.values(window.localStorage).join("\n"),
    );
    expect(persisted).not.toContain("browser-secret");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /^JSON$/ }).click(),
    ]);
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const exported = await readFile(downloadPath!, "utf8");
    expect(exported).not.toContain("browser-secret");
    const report = JSON.parse(exported) as {
      redacted?: { count: number; keys: string[] };
    };
    expect(report.redacted?.count).toBe(1);
    expect(report.redacted?.keys).toContain("ssl.keystore.password");
  });
});
