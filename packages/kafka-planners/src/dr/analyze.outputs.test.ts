import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  exportDrMarkdown,
  exportDrJson,
  exportDrChecklist,
  makeInput,
  analyzeOk,
} from "./analyze.test-support";

// ─── Export Tests ───────────────────────────────────────────────────────────

describe("exports", () => {
  test("markdown export produces non-empty content", () => {
    const r = analyzeOk();
    const exported = exportDrMarkdown(r);
    assert.ok(exported.content.length > 0);
    assert.ok(exported.content.includes("# DR Tabletop Planner Report"));
    assert.ok(exported.content.includes("RPO"));
    assert.ok(exported.content.includes("RTO"));
  });

  test("JSON export produces valid JSON with no NaN/Infinity", () => {
    const r = analyzeOk();
    const exported = exportDrJson(r);
    assert.ok(exported.content.length > 0);
    const parsed = JSON.parse(exported.content);
    assert.ok(parsed.generatedAt);
    assert.ok(parsed.rpo);
    assert.ok(parsed.rto);
    // Verify no NaN or Infinity in stringified output
    assert.equal(exported.content.includes("NaN"), false, "no NaN in JSON");
    assert.equal(exported.content.includes("Infinity"), false, "no Infinity in JSON");
  });

  test("checklist export produces Markdown with phases", () => {
    const r = analyzeOk();
    const exported = exportDrChecklist(r);
    assert.ok(exported.content.includes("# DR Tabletop Checklist"));
    assert.ok(exported.content.includes("Phase 1"));
    assert.ok(exported.content.includes("Phase 7"));
    assert.ok(exported.content.includes("- [ ]"), "has checkbox markers");
  });

  test("exports have redaction summary", () => {
    const r = analyzeOk();
    const md = exportDrMarkdown(r);
    const json = exportDrJson(r);
    const cl = exportDrChecklist(r);
    assert.ok(md.redactionSummary.length > 0);
    assert.ok(json.redactionSummary.length > 0);
    assert.ok(cl.redactionSummary.length > 0);
  });

  test("markdown export includes checklists with owners", () => {
    const r = analyzeOk();
    const exported = exportDrMarkdown(r);
    assert.ok(exported.content.includes("Owner:"), "includes owner annotations");
  });

  test("JSON export has disclaimer", () => {
    const r = analyzeOk();
    const exported = exportDrJson(r);
    const parsed = JSON.parse(exported.content);
    assert.ok(parsed.disclaimer);
    assert.ok(parsed.disclaimer.includes("not a live diagnosis"));
  });
});

// ─── Observability Tests ────────────────────────────────────────────────────

describe("observability recommendations", () => {
  test("has recommendations", () => {
    const r = analyzeOk();
    assert.ok(r.observability.length > 0, "should have observability recommendations");
  });

  test("all recommendations have required fields", () => {
    const r = analyzeOk();
    for (const rec of r.observability) {
      assert.ok(rec.metric.length > 0, `metric name non-empty`);
      assert.ok(rec.description.length > 0, `description non-empty for ${rec.metric}`);
      assert.ok(rec.rationale.length > 0, `rationale non-empty for ${rec.metric}`);
      assert.ok(rec.caveat.length > 0, `caveat non-empty for ${rec.metric}`);
    }
  });

  test("all caveats include 'do not alert on this alone' guidance", () => {
    const r = analyzeOk();
    for (const rec of r.observability) {
      assert.ok(
        rec.caveat.toLowerCase().includes("do not alert on this alone"),
        `caveat for ${rec.metric} should include 'do not alert on this alone'`,
      );
    }
  });

  test("no universal thresholds in recommendations", () => {
    const r = analyzeOk();
    // Recommendations should not prescribe absolute numbers as universal thresholds
    const thresholdPatterns = [
      /alert when .+ exceeds \d+/i,
      /threshold.+\d+/i,
    ];
    for (const rec of r.observability) {
      for (const pattern of thresholdPatterns) {
        assert.equal(
          pattern.test(rec.description + rec.rationale),
          false,
          `${rec.metric} should not have universal threshold: ${pattern}`,
        );
      }
    }
  });
});

// ─── Resource Links ─────────────────────────────────────────────────────────

describe("resource links", () => {
  test("has resource links", () => {
    const r = analyzeOk();
    assert.ok(r.resourceLinks.length > 0);
  });

  test("all links have href and label", () => {
    const r = analyzeOk();
    for (const link of r.resourceLinks) {
      assert.ok(link.label.length > 0, "link has label");
      assert.ok(link.href.length > 0, "link has href");
      assert.ok(link.surface.length > 0, "link has surface");
    }
  });

  test("resource links include shipped workbench tools", () => {
    const r = analyzeOk();
    const hrefs = r.resourceLinks.map((l) => l.href);
    assert.ok(hrefs.some((h) => h.includes("/workbench/")), "links to workbench");
  });
});

// ─── Assumptions Transparency ───────────────────────────────────────────────

describe("assumptions transparency", () => {
  test("assumptions reflect input values", () => {
    const input = makeInput({
      replicationLagSeconds: 10,
      checkpointIntervalSeconds: 30,
      strategy: "mirror-maker-2",
    });
    const r = analyzeOk(input);
    assert.equal(r.assumptions.replicationLagSeconds, 10);
    assert.equal(r.assumptions.checkpointIntervalSeconds, 30);
    assert.equal(r.assumptions.strategy, "mirror-maker-2");
  });
});

// ─── Warnings Tests ─────────────────────────────────────────────────────────

describe("warnings — no universal fixed thresholds", () => {
  test("no fixed-threshold warnings exist for any input values", () => {
    // These old IDs must NEVER appear regardless of input magnitude
    const BANNED_IDS = [
      "high-replication-lag",
      "large-checkpoint-interval",
      "slow-detection",
      "high-dns-ttl",
    ];
    // Extreme values that would have triggered old thresholds
    const r = analyzeOk({
      replicationLagSeconds: 99999,
      checkpointIntervalSeconds: 99999,
      incidentDetectionSeconds: 99999,
      promotionSeconds: 99999,
      dnsTtlSeconds: 99999,
      clientReconnectSeconds: 99999,
      validationSeconds: 99999,
      duplicateToleranceSeconds: 999999,
    });
    for (const banned of BANNED_IDS) {
      assert.ok(
        !r.warnings.some((w) => w.id === banned),
        `banned fixed-threshold warning "${banned}" must not appear`,
      );
    }
  });

  test("no warning has severity 'warning' — only 'critical' (user tolerance) and 'info' (relational)", () => {
    // With various input combinations, all warnings should be "critical" or "info"
    const scenarios = [
      { replicationLagSeconds: 999, checkpointIntervalSeconds: 500, duplicateToleranceSeconds: 100 },
      { replicationLagSeconds: 5, checkpointIntervalSeconds: 60, duplicateToleranceSeconds: 120 },
      { replicationLagSeconds: 0, checkpointIntervalSeconds: 1, duplicateToleranceSeconds: 0 },
    ];
    for (const overrides of scenarios) {
      const r = analyzeOk(overrides);
      for (const w of r.warnings) {
        assert.ok(
          w.severity === "critical" || w.severity === "info",
          `warning "${w.id}" has unexpected severity "${w.severity}" — only critical (user tolerance) and info (relational) are allowed`,
        );
      }
    }
  });

  test("status never becomes 'concerns' from info-only relational warnings", () => {
    // Relational observations are info-only. Status should be "ready" or "at-risk" only.
    const r = analyzeOk({
      replicationLagSeconds: 99999,
      checkpointIntervalSeconds: 99999,
      incidentDetectionSeconds: 99999,
      dnsTtlSeconds: 99999,
      duplicateToleranceSeconds: 999999, // within tolerance
    });
    assert.notEqual(r.status, "concerns", "info-only warnings must not trigger 'concerns' status");
  });

  test("duplicate-exceeds-tolerance is the only critical warning", () => {
    const r = analyzeOk({
      checkpointIntervalSeconds: 120,
      duplicateToleranceSeconds: 60,
    });
    const criticals = r.warnings.filter((w) => w.severity === "critical");
    assert.equal(criticals.length, 1);
    assert.equal(criticals[0].id, "duplicate-exceeds-tolerance");
  });
});

describe("relational observations", () => {
  test("checkpoint-dominates-lag appears when checkpoint > lag and lag > 0", () => {
    const r = analyzeOk({
      replicationLagSeconds: 5,
      checkpointIntervalSeconds: 60,
    });
    const w = r.warnings.find((w) => w.id === "checkpoint-dominates-lag");
    assert.ok(w, "should have checkpoint-dominates-lag observation");
    assert.equal(w!.severity, "info");
    assert.ok(w!.message.includes("12.0\u00d7") || w!.message.includes("12.0×"), "shows ratio");
  });

  test("checkpoint-dominates-lag does NOT appear when lag is 0", () => {
    const r = analyzeOk({
      replicationLagSeconds: 0,
      checkpointIntervalSeconds: 60,
    });
    assert.ok(
      !r.warnings.some((w) => w.id === "checkpoint-dominates-lag"),
      "should not appear when lag is 0",
    );
  });

  test("checkpoint-dominates-lag does NOT appear when checkpoint <= lag", () => {
    const r = analyzeOk({
      replicationLagSeconds: 100,
      checkpointIntervalSeconds: 50,
    });
    assert.ok(
      !r.warnings.some((w) => w.id === "checkpoint-dominates-lag"),
    );
  });

  test("largest-rto-component identifies the dominant RTO component", () => {
    const r = analyzeOk({
      incidentDetectionSeconds: 600,
      promotionSeconds: 10,
      dnsTtlSeconds: 10,
      clientReconnectSeconds: 10,
      validationSeconds: 10,
    });
    const w = r.warnings.find((w) => w.id === "largest-rto-component");
    assert.ok(w, "should have largest-rto-component");
    assert.equal(w!.severity, "info");
    assert.ok(w!.message.includes("detection"), "should identify detection as largest");
  });

  test("dns-dominates-redirect when DNS > client reconnect", () => {
    const r = analyzeOk({
      dnsTtlSeconds: 120,
      clientReconnectSeconds: 30,
    });
    const w = r.warnings.find((w) => w.id === "dns-dominates-redirect");
    assert.ok(w, "should have dns-dominates-redirect");
    assert.equal(w!.severity, "info");
  });

  test("client-dominates-redirect when client > DNS", () => {
    const r = analyzeOk({
      dnsTtlSeconds: 10,
      clientReconnectSeconds: 90,
    });
    const w = r.warnings.find((w) => w.id === "client-dominates-redirect");
    assert.ok(w, "should have client-dominates-redirect");
    assert.equal(w!.severity, "info");
  });

  test("all relational observations are info severity", () => {
    const r = analyzeOk({
      replicationLagSeconds: 5,
      checkpointIntervalSeconds: 300,
      incidentDetectionSeconds: 600,
      dnsTtlSeconds: 120,
      clientReconnectSeconds: 30,
    });
    const relational = r.warnings.filter((w) =>
      ["checkpoint-dominates-lag", "largest-rto-component", "dns-dominates-redirect", "client-dominates-redirect"].includes(w.id),
    );
    assert.ok(relational.length > 0, "should have at least one relational observation");
    for (const w of relational) {
      assert.equal(w.severity, "info", `relational observation ${w.id} must be info`);
    }
  });
});

describe("strategy-specific warnings (preserved)", () => {
  test("MM2 does not introduce a fixed checkpoint threshold warning", () => {
    const r = analyzeOk({
      strategy: "mirror-maker-2",
      checkpointIntervalSeconds: 5,
    });
    assert.ok(
      !r.warnings.some((w) => w.id === "mm2-aggressive-checkpoint"),
    );
  });

  test("MSK replicator triggers managed service info", () => {
    const r = analyzeOk({ strategy: "msk-replicator" });
    assert.ok(
      r.warnings.some((w) => w.id === "msk-replicator-managed"),
    );
  });
});

