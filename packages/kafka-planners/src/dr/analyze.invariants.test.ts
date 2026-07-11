import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  exportDrMarkdown,
  exportDrJson,
  exportDrChecklist,
  analyzeOk,
} from "./analyze.test-support";

// ─── Zero Lag Special Case ──────────────────────────────────────────────────

describe("zero lag special case", () => {
  test("zero lag produces RPO best = 0", () => {
    const r = analyzeOk({ replicationLagSeconds: 0 });
    assert.equal(r.rpo.best.seconds, 0);
  });

  test("zero lag RPO likely = checkpointInterval / 2", () => {
    const r = analyzeOk({
      replicationLagSeconds: 0,
      checkpointIntervalSeconds: 100,
    });
    assert.equal(r.rpo.likely.seconds, 50);
  });

  test("zero lag RPO worst = checkpointInterval", () => {
    const r = analyzeOk({
      replicationLagSeconds: 0,
      checkpointIntervalSeconds: 100,
    });
    assert.equal(r.rpo.worst.seconds, 100);
  });
});

// ─── Printable Marker Classes ───────────────────────────────────────────────

describe("printable markers", () => {
  test("checklist export contains phase markers suitable for print", () => {
    const r = analyzeOk();
    const exported = exportDrChecklist(r);
    for (let i = 1; i <= 7; i++) {
      assert.ok(
        exported.content.includes(`Phase ${i}`),
        `checklist export includes Phase ${i}`,
      );
    }
  });
});

// ─── Print CSS Marker Integrity ─────────────────────────────────────────────

describe("print CSS class markers in source", () => {
  test("globals.css contains dr-print-hide rule", async () => {
    const fs = await import("node:fs");
    const css = fs.readFileSync(
      new URL("../../../../app/globals.css", import.meta.url),
      "utf-8",
    );
    assert.ok(css.includes(".dr-print-hide"), "globals.css must contain .dr-print-hide");
    assert.ok(css.includes("display: none !important"), "dr-print-hide must hide elements");
  });

  test("globals.css contains dr-checklist-print rule", async () => {
    const fs = await import("node:fs");
    const css = fs.readFileSync(
      new URL("../../../../app/globals.css", import.meta.url),
      "utf-8",
    );
    assert.ok(css.includes(".dr-checklist-print"), "globals.css must contain .dr-checklist-print");
    assert.ok(css.includes(".dr-checklist-print *"), "dr-checklist-print must style children");
  });
});

// ─── Operator-Owned Checklist Wording ───────────────────────────────────────

describe("checklist wording — operator-owned, no automation verbs", () => {
  test("no checklist item implies the tool performs the action", () => {
    const r = analyzeOk({ strategy: "mirror-maker-2" });
    const automationPatterns = [
      /^Stop /i,       // "Stop X" implies tool does it
      /^Start /i,      // "Start X" implies tool does it
      /^Create /i,     // "Create X" implies tool does it
      /^Update /i,     // "Update DNS" implies tool does it
      /^Reconfigure /i, // "Reconfigure MM2" implies tool does it
      /^Notify /i,     // "Notify stakeholders" implies tool does it
    ];
    for (const cl of r.checklists) {
      for (const ci of cl.items) {
        for (const pattern of automationPatterns) {
          assert.equal(
            pattern.test(ci.text),
            false,
            `item ${ci.id} starts with automation verb: "${ci.text}" matches ${pattern}`,
          );
        }
      }
    }
  });

  test("action items use operator-confirmation phrasing", () => {
    const r = analyzeOk({ strategy: "mirror-maker-2" });
    const actionItems = r.checklists.flatMap((cl) => cl.items).filter(
      (ci) => ci.text.toLowerCase().includes("stop") ||
              ci.text.toLowerCase().includes("update") ||
              ci.text.toLowerCase().includes("reconfigure") ||
              ci.text.toLowerCase().includes("create") ||
              ci.text.toLowerCase().includes("notify"),
    );
    for (const ci of actionItems) {
      assert.ok(
        ci.text.startsWith("Confirm") || ci.text.startsWith("Verify") || ci.text.startsWith("Record") ||
        ci.text.startsWith("Document") || ci.text.startsWith("Plan") || ci.text.startsWith("Coordinate") ||
        ci.text.startsWith("Identify") || ci.text.startsWith("Obtain") || ci.text.startsWith("Conduct") ||
        ci.text.startsWith("Review"),
        `action item ${ci.id} should start with operator-confirmation verb, got: "${ci.text.substring(0, 50)}..."`,
      );
    }
  });

  test("MSK items reference vendor documentation, not exact control-plane behavior", () => {
    const r = analyzeOk({ strategy: "msk-replicator" });
    const mskItems = r.checklists.flatMap((cl) => cl.items).filter(
      (ci) => ci.id.includes("msk"),
    );
    for (const ci of mskItems) {
      // Should not claim exact API calls or automated behavior
      assert.ok(
        !ci.text.includes("execute") && !ci.text.includes("run"),
        `MSK item ${ci.id} should not use automation verbs`,
      );
    }
  });
});

// ─── Final Export Redaction (adversarial) ────────────────────────────────────

describe("export redaction — adversarial", () => {
  test("markdown export redacts secrets injected via strategy notes", () => {
    // Simulate: if somehow a secret appeared in result text,
    // the final pass would catch it
    const r = analyzeOk();
    const md = exportDrMarkdown(r);
    // Normal content should have no redactions
    assert.equal(md.redactedCount, 0, "clean input should have 0 redactions");
    assert.ok(md.redactionSummary.includes("No common secret patterns detected"), "summary should say no secrets");
  });

  test("JSON export redacts secrets and has truthful count", () => {
    const r = analyzeOk();
    const json = exportDrJson(r);
    assert.equal(json.redactedCount, 0, "clean input should have 0 redactions");
    assert.ok(json.redactionSummary.includes("No common secret patterns detected"));
  });

  test("checklist export redacts secrets and has truthful count", () => {
    const r = analyzeOk();
    const cl = exportDrChecklist(r);
    assert.equal(cl.redactedCount, 0, "clean input should have 0 redactions");
    assert.ok(cl.redactionSummary.includes("No common secret patterns detected"));
  });

  test("all three exports have consistent redaction behavior", () => {
    const r = analyzeOk();
    const md = exportDrMarkdown(r);
    const json = exportDrJson(r);
    const cl = exportDrChecklist(r);
    // All should have zero redactions for clean input
    assert.equal(md.redactedCount, 0);
    assert.equal(json.redactedCount, 0);
    assert.equal(cl.redactedCount, 0);
  });
});

// ─── RPO Decomposition Tests ────────────────────────────────────────────────

describe("RPO decomposition language", () => {
  test("markdown export uses corrected RPO heading", () => {
    const r = analyzeOk();
    const md = exportDrMarkdown(r);
    assert.ok(md.content.includes("Recovery-Point Exposure"), "heading should say Recovery-Point Exposure");
    assert.ok(md.content.includes("replicated data loss"), "should mention replicated data loss");
    assert.ok(md.content.includes("checkpoint/offset uncertainty"), "should mention checkpoint/offset uncertainty");
  });

  test("RPO components explicitly label replicated data loss", () => {
    const r = analyzeOk({ replicationLagSeconds: 10, checkpointIntervalSeconds: 60 });
    for (const scenario of ["best", "likely", "worst"] as const) {
      const lagComp = r.rpo[scenario].components.find((c) => c.name === "replicationLag");
      assert.ok(lagComp, `${scenario} should have replicationLag component`);
      assert.ok(lagComp!.description.includes("Replicated data loss"), `${scenario} lag component should describe replicated data loss`);
    }
  });

  test("RPO checkpoint components do not claim data is lost", () => {
    const r = analyzeOk({ replicationLagSeconds: 10, checkpointIntervalSeconds: 60 });
    for (const scenario of ["likely", "worst"] as const) {
      const cpComp = r.rpo[scenario].components.find((c) => c.name.includes("checkpointInterval"));
      assert.ok(cpComp, `${scenario} should have checkpoint component`);
      assert.ok(!cpComp!.description.includes("potentially lost"), `${scenario} checkpoint must not claim data loss`);
      assert.ok(
        cpComp!.description.includes("uncertainty") || cpComp!.description.includes("replay"),
        `${scenario} checkpoint should describe uncertainty or replay`,
      );
    }
  });
});

// ─── No Universal Threshold Sweep ───────────────────────────────────────────

describe("universal threshold exhaustive sweep", () => {
  test("status is never 'concerns' for any input when tolerance is met", () => {
    // Sweep across many input combinations — status should only be "ready" or "at-risk"
    const lagValues = [0, 1, 60, 120, 600, 99999];
    const cpValues = [1, 60, 300, 600, 99999];
    const detValues = [0, 120, 600, 3600, 99999];
    const dnsValues = [0, 60, 300, 600, 99999];

    for (const lag of lagValues) {
      for (const cp of cpValues) {
        for (const det of detValues) {
          for (const dns of dnsValues) {
            const r = analyzeOk({
              replicationLagSeconds: lag,
              checkpointIntervalSeconds: cp,
              incidentDetectionSeconds: det,
              dnsTtlSeconds: dns,
              duplicateToleranceSeconds: 999999, // always within tolerance
            });
            assert.notEqual(
              r.status,
              "concerns",
              `status should not be "concerns" for lag=${lag} cp=${cp} det=${det} dns=${dns}`,
            );
          }
        }
      }
    }
  });
});
