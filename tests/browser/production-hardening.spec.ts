import { expect, test, type Page } from "@playwright/test";
import packageJson from "../../package.json";

function captureCspViolations(page: Page): string[] {
  const violations: string[] = [];
  const isCspViolation = (message: string) =>
    /content security policy|violates the following.*directive|refused to (?:load|execute|connect|frame|create a worker)/i.test(
      message,
    );

  page.on("console", (message) => {
    if (isCspViolation(message.text())) violations.push(message.text());
  });
  page.on("pageerror", (error) => {
    if (isCspViolation(error.message)) violations.push(error.message);
  });
  return violations;
}

test.describe("Production hardening", () => {
  test("actual response headers deny framing except on simulator embeds", async ({
    request,
  }) => {
    const [root, diagnose, embed] = await Promise.all([
      request.get("/"),
      request.get("/diagnose"),
      request.get("/simulate/embed/quorum-loss"),
    ]);

    for (const response of [root, diagnose, embed]) {
      expect(response.status()).toBe(200);
      expect(response.headers()["x-content-type-options"]).toBe("nosniff");
      expect(response.headers()["referrer-policy"]).toBe(
        "strict-origin-when-cross-origin",
      );
      expect(response.headers()["permissions-policy"]).toContain("camera=()");
      expect(response.headers()["x-powered-by"]).toBeUndefined();
    }

    for (const response of [root, diagnose]) {
      expect(response.headers()["x-frame-options"]).toBe("DENY");
      expect(response.headers()["content-security-policy"]).toContain(
        "frame-ancestors 'none'",
      );
    }

    const rootCsp = root.headers()["content-security-policy"];
    expect(rootCsp).toContain("script-src 'self' 'unsafe-inline'");
    expect(rootCsp).toContain("https://plausible.io");
    expect(rootCsp).toContain("worker-src 'self' blob:");
    expect(rootCsp).toContain("object-src 'none'");
    expect(rootCsp).toContain("upgrade-insecure-requests");
    expect(rootCsp).not.toContain("'unsafe-eval'");
    expect(root.headers()["strict-transport-security"]).toContain(
      "max-age=31536000",
    );
    expect(root.headers()["strict-transport-security"]).not.toContain(
      "preload",
    );

    expect(embed.headers()["x-frame-options"]).toBeUndefined();
    expect(embed.headers()["content-security-policy"]).toContain(
      "frame-ancestors *",
    );
    expect(embed.headers()["content-security-policy"]).not.toContain(
      "frame-ancestors 'none'",
    );
  });

  test("health GET and HEAD are dynamic, successful, and non-cacheable", async ({
    request,
  }) => {
    const getResponse = await request.get("/api/health");
    expect(getResponse.status()).toBe(200);
    expect(getResponse.headers()["cache-control"]).toContain("no-store");

    const payload = (await getResponse.json()) as {
      status: string;
      version: string;
      commit: string | null;
      features: { llm: string };
    };
    expect(payload.status).toBe("ok");
    expect(payload.version).toBe(packageJson.version);
    expect(payload.commit === null || /^[0-9a-f]{7,12}$/i.test(payload.commit)).toBe(
      true,
    );
    expect(["disabled", "configured", "misconfigured"]).toContain(
      payload.features.llm,
    );
    expect(JSON.stringify(payload)).not.toContain("ANTHROPIC_API_KEY");
    expect(JSON.stringify(payload)).not.toContain("ANTHROPIC_MODEL");

    const headResponse = await request.head("/api/health");
    expect(headResponse.status()).toBe(200);
    expect(headResponse.headers()["cache-control"]).toContain("no-store");
    expect(await headResponse.text()).toBe("");
  });

  test("interactive surfaces operate without browser CSP violations", async ({
    page,
  }) => {
    const cspViolations = captureCspViolations(page);

    await page.goto("/");
    await expect(page.locator("main#main-content")).toBeVisible();

    await page.goto("/diagnose");
    await expect(page.getByRole("textbox").first()).toBeVisible();
    await page.getByRole("button", { name: /^analyze$/i }).click();
    await expect(
      page.getByText(/LLM analysis is not configured|LLM recommendations/i),
    ).toBeVisible();

    await page.goto("/simulate");
    await expect(
      page.getByRole("heading", { level: 1, name: /broker simulator/i }),
    ).toBeVisible();

    await page.goto("/protocol/produce-record");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("button", { name: /next step/i }).click();
    await expect(page.getByText(/step 2 of \d+/i)).toBeVisible();

    await page.goto("/workbench/lag");
    await expect(
      page.getByRole("heading", { level: 1, name: /consumer lag triage/i }),
    ).toBeVisible();

    await page.goto("/learn/unclean-leader-election");
    await expect(
      page.locator('iframe[src="/simulate/embed/quorum-loss"]'),
    ).toBeVisible();

    expect(cspViolations).toEqual([]);
  });
});
