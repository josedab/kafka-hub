import { test, expect } from "@playwright/test";

/**
 * Table-driven Workbench tool smoke tests.
 * Each tool follows: navigate → load sample → run analysis → assert result/export.
 */

interface WorkbenchToolTest {
  name: string;
  path: string;
  heading: RegExp;
  loadSample: string | RegExp;
  analyze: string | RegExp;
  resultIndicator: RegExp;
  exportIndicator: RegExp;
}

const WORKBENCH_TOOLS: WorkbenchToolTest[] = [
  {
    name: "Incident Triage",
    path: "/workbench/incident",
    heading: /incident triage/i,
    loadSample: /load sample/i,
    analyze: /analyze evidence/i,
    resultIndicator: /hypothesis|confidence|signature|NotEnoughReplicas/i,
    exportIndicator: /export|download|markdown|json/i,
  },
  {
    name: "Consumer Lag Triage",
    path: "/workbench/lag",
    heading: /consumer lag triage/i,
    loadSample: /load sample/i,
    analyze: /analyze lag/i,
    resultIndicator: /classification|growing|stable|caught.?up|drain|skew|partition/i,
    exportIndicator: /export|download|markdown|json/i,
  },
  {
    name: "Capacity Planner",
    path: "/workbench/capacity",
    heading: /capacity.*headroom/i,
    loadSample: /load sample/i,
    analyze: /analyze capacity/i,
    resultIndicator: /storage|network|headroom|N.?1|broker|pass|warning|fail/i,
    exportIndicator: /export|download|markdown|json/i,
  },
  {
    name: "Listener Topology",
    path: "/workbench/listeners",
    heading: /listener topology/i,
    loadSample: /same.host development/i,
    analyze: /analyze listener topology/i,
    resultIndicator: /listeners|advertised|bootstrap|connection.*flow|topology|diagnostic/i,
    exportIndicator: /export|download|markdown|json/i,
  },
  {
    name: "Message Size",
    path: "/workbench/message-size",
    heading: /message size/i,
    loadSample: /load sample data/i,
    analyze: /analyze message size/i,
    resultIndicator: /stage|pass|fail|record|batch|producer|broker|consumer|pipeline/i,
    exportIndicator: /export|download|markdown|json/i,
  },
  {
    name: "KRaft Transition",
    path: "/workbench/kraft",
    heading: /kraft.*readiness|kraft.*transition/i,
    loadSample: /load sample.*static/i,
    analyze: /analyze readiness/i,
    resultIndicator: /phase|readiness|preflight|kraft|migration|blocker|checklist/i,
    exportIndicator: /export|download|markdown|json|checklist/i,
  },
  {
    name: "DR Tabletop",
    path: "/workbench/dr",
    heading: /dr tabletop/i,
    loadSample: /load.*generic.*sample/i,
    analyze: /analyze dr/i,
    resultIndicator: /RPO|RTO|best|likely|worst|phase|failover|duplicate/i,
    exportIndicator: /export|download|markdown|json|checklist/i,
  },
];

for (const tool of WORKBENCH_TOOLS) {
  test.describe(`Workbench: ${tool.name}`, () => {
    test("load sample, analyze, verify result and export", async ({ page }) => {
      await page.goto(tool.path);
      await expect(
        page.getByRole("heading", { level: 1, name: tool.heading }),
      ).toBeVisible();

      // Load sample data
      const sampleButton = page.getByRole("button", { name: tool.loadSample }).first();
      await expect(sampleButton).toBeVisible({ timeout: 5000 });
      await sampleButton.click();

      // Run analysis
      const analyzeButton = page.getByRole("button", { name: tool.analyze }).first();
      await expect(analyzeButton).toBeVisible();
      await analyzeButton.click();

      // Wait for result
      await expect(
        page.getByText(tool.resultIndicator).first(),
      ).toBeVisible({ timeout: 10000 });

      // Verify export actions are available
      await expect(
        page.getByRole("button", { name: tool.exportIndicator }).first(),
      ).toBeVisible({ timeout: 5000 });
    });
  });
}
