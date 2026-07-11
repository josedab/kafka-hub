import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeOk,
} from "./analyze.test-support";

// ─── RPO Formula Tests (table-driven) ───────────────────────────────────────

describe("RPO formulas", () => {
  const RPO_CASES: Array<{
    name: string;
    lag: number;
    cp: number;
    expectedBest: number;
    expectedLikely: number;
    expectedWorst: number;
  }> = [
    {
      name: "standard values: lag=5, cp=60",
      lag: 5, cp: 60,
      expectedBest: 5,
      expectedLikely: 35, // 5 + 60/2
      expectedWorst: 65,  // 5 + 60
    },
    {
      name: "zero lag: lag=0, cp=60",
      lag: 0, cp: 60,
      expectedBest: 0,
      expectedLikely: 30, // 0 + 60/2
      expectedWorst: 60,  // 0 + 60
    },
    {
      name: "large lag: lag=120, cp=30",
      lag: 120, cp: 30,
      expectedBest: 120,
      expectedLikely: 135, // 120 + 30/2
      expectedWorst: 150,  // 120 + 30
    },
    {
      name: "small checkpoint: lag=2, cp=10",
      lag: 2, cp: 10,
      expectedBest: 2,
      expectedLikely: 7,  // 2 + 10/2
      expectedWorst: 12,  // 2 + 10
    },
    {
      name: "checkpoint half is exact: lag=0, cp=1",
      lag: 0, cp: 1,
      expectedBest: 0,
      expectedLikely: 0.5, // 0 + 1/2
      expectedWorst: 1,    // 0 + 1
    },
  ];

  for (const tc of RPO_CASES) {
    test(tc.name, () => {
      const r = analyzeOk({
        replicationLagSeconds: tc.lag,
        checkpointIntervalSeconds: tc.cp,
      });
      assert.equal(r.rpo.best.seconds, tc.expectedBest, "RPO best");
      assert.equal(r.rpo.likely.seconds, tc.expectedLikely, "RPO likely");
      assert.equal(r.rpo.worst.seconds, tc.expectedWorst, "RPO worst");
    });
  }

  test("RPO best formula text is documented", () => {
    const r = analyzeOk();
    assert.equal(r.rpo.best.formula, "replicationLag");
  });

  test("RPO likely formula text is documented", () => {
    const r = analyzeOk();
    assert.equal(r.rpo.likely.formula, "replicationLag + checkpointInterval / 2");
  });

  test("RPO worst formula text is documented", () => {
    const r = analyzeOk();
    assert.equal(r.rpo.worst.formula, "replicationLag + checkpointInterval");
  });

  test("RPO components are populated", () => {
    const r = analyzeOk({ replicationLagSeconds: 10, checkpointIntervalSeconds: 60 });
    assert.ok(r.rpo.best.components.length >= 1, "best has components");
    assert.ok(r.rpo.likely.components.length >= 2, "likely has components");
    assert.ok(r.rpo.worst.components.length >= 2, "worst has components");
  });

  test("RPO assumptions are populated", () => {
    const r = analyzeOk();
    assert.ok(r.rpo.best.assumptions.length > 0, "best has assumptions");
    assert.ok(r.rpo.likely.assumptions.length > 0, "likely has assumptions");
    assert.ok(r.rpo.worst.assumptions.length > 0, "worst has assumptions");
  });

  test("RPO decomposes into replicated data loss and checkpoint uncertainty", () => {
    const r = analyzeOk({ replicationLagSeconds: 10, checkpointIntervalSeconds: 60 });
    // Best: only replicated data loss
    assert.ok(r.rpo.best.components[0].description.includes("Replicated data loss"), "best describes replicated data loss");
    // Likely/worst: checkpoint component describes uncertainty/replay, not additional loss
    const likelyCp = r.rpo.likely.components[1];
    assert.ok(likelyCp.description.includes("uncertainty") || likelyCp.description.includes("replay"), "likely checkpoint describes uncertainty");
    assert.ok(!likelyCp.description.includes("potentially lost"), "likely checkpoint should not say 'potentially lost'");
    const worstCp = r.rpo.worst.components[1];
    assert.ok(worstCp.description.includes("uncertainty") || worstCp.description.includes("replay"), "worst checkpoint describes uncertainty");
    assert.ok(!worstCp.description.includes("potentially lost"), "worst checkpoint should not say 'potentially lost'");
  });

  test("RPO worst assumption does NOT say data is lost due to checkpoint staleness", () => {
    const r = analyzeOk();
    for (const a of r.rpo.worst.assumptions) {
      assert.ok(
        !a.includes("All data since that checkpoint") || !a.includes("potentially lost"),
        "RPO worst must not claim checkpoint staleness means data is lost",
      );
    }
  });

  test("RPO worst assumption explains replay/reconciliation uncertainty", () => {
    const r = analyzeOk();
    const hasReplay = r.rpo.worst.assumptions.some(
      (a) => a.includes("replay") || a.includes("reconciliation"),
    );
    assert.ok(hasReplay, "worst assumption should mention replay or reconciliation");
  });
});

// ─── RTO Formula Tests ──────────────────────────────────────────────────────

describe("RTO formulas", () => {
  const RTO_CASES: Array<{
    name: string;
    det: number;
    pro: number;
    dns: number;
    cli: number;
    val: number;
    expectedBest: number;
    expectedLikely: number;
    expectedWorst: number;
  }> = [
    {
      name: "standard serial path",
      det: 120, pro: 30, dns: 60, cli: 30, val: 60,
      // best: 120 + 30 + max(60,30) + 60 = 270
      // likely: 120 + 30 + 60 + 30 + 60 = 300
      // worst: 120 + 30 + 60 + 30 + 2*60 = 360
      expectedBest: 270,
      expectedLikely: 300,
      expectedWorst: 360,
    },
    {
      name: "client reconnect dominates parallel step",
      det: 60, pro: 15, dns: 10, cli: 45, val: 30,
      // best: 60 + 15 + max(10,45) + 30 = 150
      // likely: 60 + 15 + 10 + 45 + 30 = 160
      // worst: 60 + 15 + 10 + 45 + 2*30 = 190
      expectedBest: 150,
      expectedLikely: 160,
      expectedWorst: 190,
    },
    {
      name: "zero detection and promotion",
      det: 0, pro: 0, dns: 30, cli: 30, val: 30,
      // best: 0 + 0 + max(30,30) + 30 = 60
      // likely: 0 + 0 + 30 + 30 + 30 = 90
      // worst: 0 + 0 + 30 + 30 + 2*30 = 120
      expectedBest: 60,
      expectedLikely: 90,
      expectedWorst: 120,
    },
    {
      name: "dns equals client (parallel same as single)",
      det: 10, pro: 10, dns: 50, cli: 50, val: 20,
      // best: 10 + 10 + max(50,50) + 20 = 90
      // likely: 10 + 10 + 50 + 50 + 20 = 140
      // worst: 10 + 10 + 50 + 50 + 2*20 = 160
      expectedBest: 90,
      expectedLikely: 140,
      expectedWorst: 160,
    },
  ];

  for (const tc of RTO_CASES) {
    test(tc.name, () => {
      const r = analyzeOk({
        incidentDetectionSeconds: tc.det,
        promotionSeconds: tc.pro,
        dnsTtlSeconds: tc.dns,
        clientReconnectSeconds: tc.cli,
        validationSeconds: tc.val,
      });
      assert.equal(r.rto.best.seconds, tc.expectedBest, "RTO best");
      assert.equal(r.rto.likely.seconds, tc.expectedLikely, "RTO likely");
      assert.equal(r.rto.worst.seconds, tc.expectedWorst, "RTO worst");
    });
  }

  test("RTO best uses max(dns, client) for parallel step", () => {
    const r = analyzeOk();
    assert.ok(r.rto.best.formula.includes("max(dnsTtl, clientReconnect)"), "best formula shows parallel");
  });

  test("RTO worst has 2× validation retry", () => {
    const r = analyzeOk();
    assert.ok(r.rto.worst.formula.includes("2"), "worst formula shows 2× validation");
    // Verify the retry cycle is explicitly documented in assumptions
    const retryAssumption = r.rto.worst.assumptions.find(
      (a) => a.includes("retry") && a.includes("one"),
    );
    assert.ok(retryAssumption, "worst assumptions explain one retry cycle");
  });

  test("RTO components show serial vs parallel path", () => {
    const r = analyzeOk();
    // Best has a parallel component
    const parallelComp = r.rto.best.components.find((c) =>
      c.name.includes("max("),
    );
    assert.ok(parallelComp, "best RTO has parallel component");

    // Likely has separate dns and client components
    const likelyComps = r.rto.likely.components.map((c) => c.name);
    assert.ok(likelyComps.includes("dnsTtl"), "likely has separate dnsTtl");
    assert.ok(likelyComps.includes("clientReconnect"), "likely has separate clientReconnect");
  });
});

// ─── Duplicate Tolerance Tests ──────────────────────────────────────────────

describe("duplicate tolerance", () => {
  test("exact boundary: checkpoint equals tolerance", () => {
    const r = analyzeOk({
      checkpointIntervalSeconds: 60,
      duplicateToleranceSeconds: 60,
    });
    assert.equal(r.duplicateExposure.worstCaseReplaySeconds, 60);
    assert.equal(r.duplicateExposure.toleranceSeconds, 60);
    assert.equal(r.duplicateExposure.exceedsTolerance, false, "equal does not exceed");
  });

  test("just over tolerance", () => {
    const r = analyzeOk({
      checkpointIntervalSeconds: 61,
      duplicateToleranceSeconds: 60,
    });
    assert.equal(r.duplicateExposure.exceedsTolerance, true, "61 > 60 exceeds");
  });

  test("well within tolerance", () => {
    const r = analyzeOk({
      checkpointIntervalSeconds: 30,
      duplicateToleranceSeconds: 120,
    });
    assert.equal(r.duplicateExposure.exceedsTolerance, false);
  });

  test("exceeds tolerance triggers critical warning", () => {
    const r = analyzeOk({
      checkpointIntervalSeconds: 120,
      duplicateToleranceSeconds: 60,
    });
    assert.equal(r.duplicateExposure.exceedsTolerance, true);
    const w = r.warnings.find((w) => w.id === "duplicate-exceeds-tolerance");
    assert.ok(w, "should have duplicate-exceeds-tolerance warning");
    assert.equal(w!.severity, "critical");
  });

  test("duplicate exposure explanation distinguishes from RPO", () => {
    const r = analyzeOk();
    assert.ok(
      r.duplicateExposure.explanation.includes("distinct from data loss"),
      "explanation mentions data loss distinction",
    );
  });
});

// ─── Checklist Phase Tests ──────────────────────────────────────────────────

describe("checklist phases", () => {
  test("exactly 7 phases in order", () => {
    const r = analyzeOk();
    assert.equal(r.checklists.length, 7, "should have 7 phases");
    const phases = r.checklists.map((c) => c.phase);
    assert.deepEqual(phases, [
      "declare", "freeze", "verify", "promote", "redirect", "validate", "failback",
    ]);
  });

  test("phases have correct order numbers 1-7", () => {
    const r = analyzeOk();
    for (let i = 0; i < r.checklists.length; i++) {
      assert.equal(r.checklists[i].order, i + 1, `phase ${r.checklists[i].phase} should be order ${i + 1}`);
    }
  });

  test("all phases have non-empty labels", () => {
    const r = analyzeOk();
    for (const cl of r.checklists) {
      assert.ok(cl.label.length > 0, `phase ${cl.phase} must have a label`);
    }
  });

  test("all phases have at least one checklist item", () => {
    const r = analyzeOk();
    for (const cl of r.checklists) {
      assert.ok(cl.items.length > 0, `phase ${cl.phase} must have items`);
    }
  });

  test("checklist items have unique IDs", () => {
    const r = analyzeOk();
    const allIds = r.checklists.flatMap((c) => c.items.map((i) => i.id));
    const uniqueIds = new Set(allIds);
    assert.equal(uniqueIds.size, allIds.length, "all checklist item IDs must be unique");
  });

  test("checklist items have owners", () => {
    const r = analyzeOk();
    for (const cl of r.checklists) {
      for (const ci of cl.items) {
        assert.ok(ci.owner.length > 0, `item ${ci.id} must have an owner`);
      }
    }
  });

  test("checklist items have categories", () => {
    const r = analyzeOk();
    for (const cl of r.checklists) {
      for (const ci of cl.items) {
        assert.ok(ci.category.length > 0, `item ${ci.id} must have a category`);
      }
    }
  });

  test("no checklist item contains command language", () => {
    const r = analyzeOk();
    const commandPatterns = [
      /\brun\b/i, /\bexecute\b/i, /\bkafka-/i, /\bcurl\b/i,
      /\bssh\b/i, /\bsudo\b/i, /\baws\s+(?!console|documentation|doc)\w+/i, /\bkubectl\b/i,
    ];
    for (const cl of r.checklists) {
      for (const ci of cl.items) {
        for (const pattern of commandPatterns) {
          assert.equal(
            pattern.test(ci.text),
            false,
            `item ${ci.id} should not contain command language: "${ci.text}" matches ${pattern}`,
          );
        }
      }
    }
  });

  test("required categories are covered across all items", () => {
    const r = analyzeOk();
    const allCategories = new Set<string>(r.checklists.flatMap((c) => c.items.map((i) => i.category)));
    const required = [
      "decision", "evidence", "source-freeze", "target-health",
      "checkpoint-state", "data-validation", "acl-config-parity",
      "client-redirect", "business-validation", "monitoring",
      "reconciliation",
    ];
    for (const cat of required) {
      assert.ok(allCategories.has(cat), `category "${cat}" must be present`);
    }
  });

  // Phase completeness: each phase has items touching specific categories
  test("declare phase covers decision and evidence", () => {
    const r = analyzeOk();
    const declare = r.checklists.find((c) => c.phase === "declare")!;
    const cats = new Set(declare.items.map((i) => i.category));
    assert.ok(cats.has("decision"), "declare has decision items");
    assert.ok(cats.has("evidence"), "declare has evidence items");
  });

  test("freeze phase covers source-freeze", () => {
    const r = analyzeOk();
    const freeze = r.checklists.find((c) => c.phase === "freeze")!;
    const cats = new Set(freeze.items.map((i) => i.category));
    assert.ok(cats.has("source-freeze"), "freeze has source-freeze items");
  });

  test("verify phase covers target-health and checkpoint-state", () => {
    const r = analyzeOk();
    const verify = r.checklists.find((c) => c.phase === "verify")!;
    const cats = new Set(verify.items.map((i) => i.category));
    assert.ok(cats.has("target-health"), "verify has target-health items");
    assert.ok(cats.has("checkpoint-state"), "verify has checkpoint-state items");
  });

  test("redirect phase covers client-redirect", () => {
    const r = analyzeOk();
    const redirect = r.checklists.find((c) => c.phase === "redirect")!;
    const cats = new Set(redirect.items.map((i) => i.category));
    assert.ok(cats.has("client-redirect"), "redirect has client-redirect items");
  });

  test("validate phase covers business-validation and monitoring", () => {
    const r = analyzeOk();
    const validate = r.checklists.find((c) => c.phase === "validate")!;
    const cats = new Set(validate.items.map((i) => i.category));
    assert.ok(cats.has("business-validation"), "validate has business-validation");
    assert.ok(cats.has("monitoring"), "validate has monitoring");
  });

  test("failback phase covers reconciliation", () => {
    const r = analyzeOk();
    const failback = r.checklists.find((c) => c.phase === "failback")!;
    const cats = new Set(failback.items.map((i) => i.category));
    assert.ok(cats.has("reconciliation"), "failback has reconciliation items");
  });
});

// ─── Strategy-Specific Notes ────────────────────────────────────────────────

describe("strategy-specific notes", () => {
  test("generic strategy returns generic notes", () => {
    const r = analyzeOk({ strategy: "generic" });
    assert.equal(r.strategyNotes.strategy, "generic");
    assert.ok(r.strategyNotes.notes.length > 0, "has notes");
  });

  test("MM2 strategy returns MM2-specific notes", () => {
    const r = analyzeOk({ strategy: "mirror-maker-2" });
    assert.equal(r.strategyNotes.strategy, "mirror-maker-2");
    assert.equal(r.strategyNotes.label, "MirrorMaker 2 (MM2)");
    // Should mention checkpoints, offset translation, failback
    const allNotes = r.strategyNotes.notes.join(" ");
    assert.ok(allNotes.includes("checkpoint"), "MM2 notes mention checkpoints");
    assert.ok(allNotes.includes("offset translation") || allNotes.includes("offset"), "MM2 notes mention offsets");
    assert.ok(allNotes.includes("failback") || allNotes.includes("Failback"), "MM2 notes mention failback");
    assert.ok(allNotes.includes("duplicate") || allNotes.includes("Duplicate"), "MM2 notes mention duplicates");
  });

  test("MSK Replicator strategy returns MSK-specific notes", () => {
    const r = analyzeOk({ strategy: "msk-replicator" });
    assert.equal(r.strategyNotes.strategy, "msk-replicator");
    assert.equal(r.strategyNotes.label, "Amazon MSK Replicator");
    const allNotes = r.strategyNotes.notes.join(" ");
    assert.ok(allNotes.includes("managed service") || allNotes.includes("AWS"), "MSK notes mention AWS/managed");
    assert.ok(allNotes.includes("failback") || allNotes.includes("Failback"), "MSK notes mention failback");
  });

  test("default strategy is generic when not specified", () => {
    const r = analyzeOk({});
    assert.equal(r.strategyNotes.strategy, "generic");
    assert.equal(r.assumptions.strategy, "generic");
  });

  test("MM2 strategy adds MM2-specific checklist items", () => {
    const r = analyzeOk({ strategy: "mirror-maker-2" });
    const allIds = r.checklists.flatMap((c) => c.items.map((i) => i.id));
    assert.ok(allIds.some((id) => id.includes("mm2")), "MM2 items present in checklists");
  });

  test("MSK strategy adds MSK-specific checklist items", () => {
    const r = analyzeOk({ strategy: "msk-replicator" });
    const allIds = r.checklists.flatMap((c) => c.items.map((i) => i.id));
    assert.ok(allIds.some((id) => id.includes("msk")), "MSK items present in checklists");
  });

  test("generic strategy has no MM2/MSK-specific checklist items", () => {
    const r = analyzeOk({ strategy: "generic" });
    const allIds = r.checklists.flatMap((c) => c.items.map((i) => i.id));
    assert.ok(!allIds.some((id) => id.includes("mm2")), "no MM2 items in generic");
    assert.ok(!allIds.some((id) => id.includes("msk")), "no MSK items in generic");
  });
});

