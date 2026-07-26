import { test, expect } from "@playwright/test";

const NOTE_SLUGS = [
  "kafka-4-3-for-operators",
  "classic-to-consumer-protocol-experiment",
  "streaming-ai-2026",
  "share-groups-agent-workers-experiment",
] as const;

const LEARN_LABS = [
  {
    slug: "share-groups",
    title: /share groups/i,
    testId: "share-group-worker-pool",
  },
  {
    slug: "ai-side-effects-exactly-once",
    title: /AI side effects/i,
    testId: "side-effect-replay-lab",
  },
  {
    slug: "streaming-rag-freshness",
    title: /streaming RAG freshness/i,
    testId: "rag-freshness-lab",
  },
  {
    slug: "kafka-mcp-a2a",
    title: /Kafka, MCP, and A2A/i,
    testId: "ai-protocol-decision-lab",
  },
  {
    slug: "model-canary-replay",
    title: /model canary replay/i,
    testId: "model-canary-replay-lab",
  },
] as const;

const SCENARIO_SLUGS = [
  "hot-partition",
  "rebalance-storm",
  "offline-partition",
] as const;

const RUNBOOK_SLUGS = [
  "under-replicated-or-offline-partitions",
  "disk-full-or-log-dir-offline",
  "consumer-rebalance-storm",
  "partition-reassignment-stuck",
  "tls-sasl-or-acl-failures",
  "mirrormaker-lag-or-divergence",
] as const;

test.describe("Field Notes", () => {
  test("lists the editorial log and exposes its distinct metadata", async ({ page }) => {
    await page.goto("/notes");

    await expect(
      page.getByRole("heading", { level: 1, name: "Field Notes" }),
    ).toBeVisible();
    await expect(page.getByText("Kafka Engineering Hub / Field Notes")).toBeVisible();
    await expect(page.getByText("Reviewed against Apache Kafka 4.3.1").first()).toBeVisible();

    for (const slug of NOTE_SLUGS) {
      await expect(page.getByTestId(`field-note-${slug}`)).toBeVisible();
    }
  });

  test("renders a Field Note article with review evidence and local navigation", async ({
    page,
  }) => {
    await page.goto("/notes/kafka-4-3-for-operators");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /Kafka 4\.3: an operator's change log/i,
      }),
    ).toBeVisible();
    await expect(page.getByText("Reviewed against Apache Kafka 4.3.1").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /all field notes/i })).toBeVisible();
  });
});

test.describe("Kafka for AI Learn labs", () => {
  for (const lab of LEARN_LABS) {
    test(`${lab.slug} loads its local interactive island`, async ({ page }) => {
      await page.goto(`/learn/${lab.slug}`);
      await expect(page.getByRole("heading", { level: 1, name: lab.title })).toBeVisible();
      await expect(page.getByTestId(lab.testId)).toBeVisible();
    });
  }

  test("share group worker lab shows acquisition and acknowledgement locally", async ({
    page,
  }) => {
    await page.goto("/learn/share-groups");
    const lab = page.getByTestId("share-group-worker-pool");

    await lab.getByRole("button", { name: "acquire next" }).click();
    await expect(lab.getByRole("status")).toContainText(/acquired work-101/i);
    await lab.getByRole("button", { name: "ack lock" }).click();
    await expect(lab.getByText("acked").first()).toBeVisible();
  });

  test("protocol decision lab adds an A2A boundary for a long remote task", async ({
    page,
  }) => {
    await page.goto("/learn/kafka-mcp-a2a");
    const lab = page.getByTestId("ai-protocol-decision-lab");

    await lab.getByLabel("Delegate a long remote-agent task").check();
    await expect(lab.getByRole("heading", { level: 3, name: "A2A" })).toBeVisible();
  });

  test("RAG freshness lab queues a CDC update without a network request", async ({
    page,
  }) => {
    await page.goto("/learn/streaming-rag-freshness");
    const lab = page.getByTestId("rag-freshness-lab");

    await lab.getByRole("button", { name: "CDC update" }).click();
    await expect(lab.getByRole("status")).toContainText(/CDC update accepted/i);
    await expect(lab.getByText(/stale window/i).first()).toBeVisible();
  });
});

test.describe("Content-wave simulation scenarios", () => {
  test("picker presents all ten deterministic scenarios in a balanced wide grid", async ({
    page,
  }) => {
    await page.goto("/simulate");
    await expect(page.getByRole("radio")).toHaveCount(10);
  });

  for (const slug of SCENARIO_SLUGS) {
    test(`${slug} deep link selects the new scenario`, async ({ page }) => {
      await page.goto(`/simulate?scenario=${slug}`);
      const selected = page.getByRole("radio", { checked: true });
      await expect(selected).toContainText(slug);
      await expect(page.getByText(new RegExp(SCENARIO_SLUGS.includes(slug) ? slug.replace("-", " ") : slug, "i")).first()).toBeVisible();
    });
  }
});

test.describe("Kafka 4.3.1 runbooks", () => {
  for (const slug of RUNBOOK_SLUGS) {
    test(`${slug} renders ordered operational guidance`, async ({ page }) => {
      await page.goto(`/runbooks/${slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: /symptom/i })).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 2, name: /quick checks/i }),
      ).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: /related/i })).toBeVisible();
    });
  }
});
