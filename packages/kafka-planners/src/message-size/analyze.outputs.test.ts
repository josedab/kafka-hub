import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeMessageSize,
  validateUnknownMessageSizeInput,
  exportMessageSizeMarkdown,
  exportMessageSizeJson,
  redactMessageSizeLabel,
  RESOURCE_LINKS,
  makeInput,
} from "./analyze.test-support";

// ─── Exports / No NaN / Redaction ───────────────────────────────────────────

describe("exports and no NaN/redaction", () => {
  test("Markdown export contains no NaN or Infinity", () => {
    const input = makeInput();
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    const md = exportMessageSizeMarkdown(r.result);
    assert.ok(!md.content.includes("NaN"));
    assert.ok(!md.content.includes("Infinity"));
    assert.ok(md.content.includes("Message Size Chain Checker Report"));
    assert.ok(md.redactedCount === 0);
  });

  test("Markdown export includes actual and aligned columns", () => {
    const input = makeInput();
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    const md = exportMessageSizeMarkdown(r.result);
    assert.ok(md.content.includes("Actual Required"));
    assert.ok(md.content.includes("Aligned Required"));
  });

  test("Markdown export includes firstAlignmentGap when present", () => {
    const input = makeInput({
      batchSizeBytes: 1000,
      producerMaxRequestSize: 1050,
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 2000,
      consumerMaxPartitionFetchBytes: 2000,
      consumerFetchMaxBytes: 2000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.notEqual(r.result.firstAlignmentGap, null);
    const md = exportMessageSizeMarkdown(r.result);
    assert.ok(md.content.includes("First Alignment Gap"));
  });

  test("JSON export contains no NaN or Infinity", () => {
    const input = makeInput();
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    const json = exportMessageSizeJson(r.result);
    assert.ok(!json.content.includes("NaN"));
    assert.ok(!json.content.includes("Infinity"));
    const parsed = JSON.parse(json.content);
    assert.ok(parsed.generatedAt);
    assert.equal(parsed.zone, "all-clear");
    assert.ok(Array.isArray(parsed.stages));
    assert.equal(json.redactedCount, 0);
  });

  test("JSON export includes firstAlignmentGap and alignmentGaps", () => {
    const input = makeInput({
      batchSizeBytes: 1000,
      producerMaxRequestSize: 1050,
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 2000,
      consumerMaxPartitionFetchBytes: 2000,
      consumerFetchMaxBytes: 2000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    const json = exportMessageSizeJson(r.result);
    const parsed = JSON.parse(json.content);
    assert.notEqual(parsed.firstAlignmentGap, null);
    assert.ok(Array.isArray(parsed.alignmentGaps));
    assert.ok(parsed.alignmentGaps.length > 0);
  });

  test("JSON export stages include actual/aligned fields", () => {
    const input = makeInput();
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    const json = exportMessageSizeJson(r.result);
    const parsed = JSON.parse(json.content);
    for (const stage of parsed.stages) {
      assert.ok("actualRequiredBytes" in stage);
      assert.ok("alignedRequiredBytes" in stage);
      assert.ok("actualPass" in stage);
      assert.ok("alignedPass" in stage);
      assert.ok("status" in stage);
    }
  });

  test("JSON export patch entries include targetReason", () => {
    const input = makeInput();
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    const json = exportMessageSizeJson(r.result);
    const parsed = JSON.parse(json.content);
    for (const entry of parsed.patch.entries) {
      assert.ok("targetReason" in entry);
    }
  });

  test("JSON export stages match analysis stages", () => {
    const input = makeInput();
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    const json = exportMessageSizeJson(r.result);
    const parsed = JSON.parse(json.content);
    assert.equal(parsed.stages.length, r.result.stages.length);
    for (let i = 0; i < parsed.stages.length; i++) {
      assert.equal(parsed.stages[i].stageId, r.result.stages[i].stageId);
      assert.equal(parsed.stages[i].actualPass, r.result.stages[i].actualPass);
    }
  });

  test("redactMessageSizeLabel passes through plain text", () => {
    const result = redactMessageSizeLabel("just a label");
    assert.equal(typeof result, "string");
    assert.ok(result.length > 0);
  });

  test("Markdown export includes patch snippet", () => {
    const input = makeInput();
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    const md = exportMessageSizeMarkdown(r.result);
    assert.ok(md.content.includes("max.request.size"));
    assert.ok(md.content.includes("message.max.bytes"));
  });

  test("JSON export has disclaimer", () => {
    const input = makeInput();
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    const json = exportMessageSizeJson(r.result);
    const parsed = JSON.parse(json.content);
    assert.ok(parsed.disclaimer.includes("Static analysis"));
  });
});

// ─── Observability Caveats / No Universal Thresholds ────────────────────────

describe("observability caveats and no universal thresholds", () => {
  test("all observability recs have caveat", () => {
    const input = makeInput();
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    for (const rec of r.result.observability) {
      assert.ok(rec.caveat.length > 0, `Metric ${rec.metric} should have a caveat`);
      assert.ok(rec.caveat.toLowerCase().includes("not") || rec.caveat.toLowerCase().includes("alone"),
        `Metric ${rec.metric} caveat should include "do not alert on this alone" guidance`);
    }
  });

  test("all observability recs have metric, description, rationale", () => {
    const input = makeInput();
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    for (const rec of r.result.observability) {
      assert.ok(rec.metric.length > 0);
      assert.ok(rec.description.length > 0);
      assert.ok(rec.rationale.length > 0);
    }
  });

  test("observability includes units/context", () => {
    const input = makeInput();
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    const hasUnits = r.result.observability.some(
      rec => rec.description.includes("bytes") ||
             rec.description.includes("sec") ||
             rec.description.includes("milliseconds") ||
             rec.description.includes("count"),
    );
    assert.ok(hasUnits, "At least some observability recs should mention units");
  });

  test("no universal numeric thresholds in caveats", () => {
    const input = makeInput();
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    for (const rec of r.result.observability) {
      assert.ok(!/alert (?:at|above|when exceeds?) \d+%/.test(rec.caveat),
        `Metric ${rec.metric} caveat should not contain universal thresholds`);
    }
  });
});

// ─── Resource Links ─────────────────────────────────────────────────────────

describe("resource links", () => {
  test("resource links are present and well-formed", () => {
    const input = makeInput();
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.ok(r.result.resourceLinks.length > 0);
    for (const rl of r.result.resourceLinks) {
      assert.ok(rl.label.length > 0);
      assert.ok(rl.href.startsWith("/"), `href should be a local path: ${rl.href}`);
      assert.ok(rl.surface.length > 0);
    }
  });

  test("RESOURCE_LINKS exported for integrity testing", () => {
    assert.ok(Array.isArray(RESOURCE_LINKS));
    assert.ok(RESOURCE_LINKS.length > 0);
    for (const rl of RESOURCE_LINKS) {
      assert.ok(rl.href.startsWith("/"));
    }
  });

  test("resource links include error pages", () => {
    const input = makeInput();
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.ok(r.result.resourceLinks.some(rl => rl.surface === "errors"));
  });

  test("resource links include diagnose", () => {
    const input = makeInput();
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.ok(r.result.resourceLinks.some(rl => rl.surface === "diagnose"));
  });

  test("resource links use correct shipped error page IDs", () => {
    assert.ok(RESOURCE_LINKS.some(rl => rl.href === "/errors/record-too-large-exception"),
      "Should link to /errors/record-too-large-exception");
    assert.ok(RESOURCE_LINKS.some(rl => rl.href === "/errors/message-size-too-large-exception"),
      "Should link to /errors/message-size-too-large-exception");
  });

  test("resource links surface uses normal union values only", () => {
    const validSurfaces = new Set(["errors", "diagnose", "workbench", "simulate"]);
    for (const rl of RESOURCE_LINKS) {
      assert.ok(validSurfaces.has(rl.surface),
        `Surface "${rl.surface}" for ${rl.label} should be one of: ${[...validSurfaces].join(", ")}`);
    }
  });

  test("no path-like surface values", () => {
    for (const rl of RESOURCE_LINKS) {
      assert.ok(!rl.surface.includes("/"),
        `Surface "${rl.surface}" should not contain "/" (path-like)`);
    }
  });
});

// ─── Structural Validation ──────────────────────────────────────────────────

describe("structural validation", () => {
  test("validateUnknownMessageSizeInput returns ok for valid input", () => {
    const r = validateUnknownMessageSizeInput(makeInput());
    assert.equal(r.ok, true);
  });

  test("validateUnknownMessageSizeInput rejects number", () => {
    const r = validateUnknownMessageSizeInput(42);
    assert.equal(r.ok, false);
    assert.ok(r.issues[0].kind === "invalid-root");
  });

  test("validateUnknownMessageSizeInput rejects missing fields", () => {
    const r = validateUnknownMessageSizeInput({ recordSizeBytes: 100 });
    assert.equal(r.ok, false);
    assert.ok(r.issues.length >= 1);
  });
});

// ─── All Clear Scenario ─────────────────────────────────────────────────────

describe("all-clear scenario", () => {
  test("typical mid-size message passes all stages", () => {
    const input = makeInput({
      recordSizeBytes: 1000,
      batchSizeBytes: 1100,
      producerMaxRequestSize: 1_048_576,
      brokerMessageMaxBytes: 1_048_576,
      replicaFetchMaxBytes: 1_048_576,
      consumerMaxPartitionFetchBytes: 1_048_576,
      consumerFetchMaxBytes: 52_428_800,
      safetyHeadroomFraction: 0.10,
      blobStorageThresholdBytes: 1_048_576,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.zone, "all-clear");
    assert.equal(r.result.firstFailure, null);
    assert.equal(r.result.stages.length, 6);
  });
});

// ─── Patch Snippet Format ───────────────────────────────────────────────────

describe("patch snippet format", () => {
  test("snippet contains property=value format", () => {
    const input = makeInput();
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.ok(r.result.patch.snippet.includes("max.request.size="));
    assert.ok(r.result.patch.snippet.includes("message.max.bytes="));
    assert.ok(r.result.patch.snippet.includes("replica.fetch.max.bytes="));
    assert.ok(r.result.patch.snippet.includes("max.partition.fetch.bytes="));
    assert.ok(r.result.patch.snippet.includes("fetch.max.bytes="));
  });

  test("patch explanation mentions rounding", () => {
    const input = makeInput();
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.ok(r.result.patch.explanation.includes("ceil") || r.result.patch.explanation.includes("round"));
  });

  test("patch explanation notes broker default scope", () => {
    const input = makeInput();
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.ok(r.result.patch.explanation.toLowerCase().includes("override") ||
              r.result.patch.explanation.toLowerCase().includes("default"));
  });

  test("patch snippet includes targetReason comments", () => {
    const input = makeInput({
      recordSizeBytes: 400,
      batchSizeBytes: 500,
      producerMaxRequestSize: 100,
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 100,
      consumerMaxPartitionFetchBytes: 100,
      consumerFetchMaxBytes: 100,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    // Changed entries should include reason in comments
    assert.ok(r.result.patch.snippet.includes("CHANGED"));
  });
});

// ─── Assumptions Transparency ───────────────────────────────────────────────

describe("assumptions transparency", () => {
  test("assumptions reflect input values", () => {
    const input = makeInput({
      recordSizeBytes: 500,
      batchSizeBytes: 700,
      safetyHeadroomFraction: 0.20,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.assumptions.recordSizeBytes, 500);
    assert.equal(r.result.assumptions.batchSizeBytes, 700);
    assert.equal(r.result.assumptions.safetyHeadroomFraction, 0.20);
    // requiredAligned = ceil(700 * 1.20) = 840
    assert.equal(r.result.assumptions.requiredAlignedLimitBytes, 840);
  });
});

// ─── Kafka Nuance Wording ───────────────────────────────────────────────────

describe("kafka nuance wording", () => {
  test("zone names use risk instead of absolute terms", () => {
    // Verify zone type values do not include "not-replicated" or "not-consumable"
    const input1 = makeInput({
      producerMaxRequestSize: 2000,
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 500,
      consumerMaxPartitionFetchBytes: 2000,
      consumerFetchMaxBytes: 2000,
    });
    const r1 = analyzeMessageSize(input1);
    assert.ok(r1.ok);
    assert.equal(r1.result.zone, "replication-risk");
    assert.ok(!r1.result.zone.includes("not-replicated"));

    const input2 = makeInput({
      producerMaxRequestSize: 2000,
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 2000,
      consumerMaxPartitionFetchBytes: 500,
      consumerFetchMaxBytes: 2000,
    });
    const r2 = analyzeMessageSize(input2);
    assert.ok(r2.ok);
    assert.equal(r2.result.zone, "consumption-risk");
    assert.ok(!r2.result.zone.includes("not-consumable"));
  });

  test("replication zone explanation mentions progress exception", () => {
    const input = makeInput({
      producerMaxRequestSize: 2000,
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 500,
      consumerMaxPartitionFetchBytes: 2000,
      consumerFetchMaxBytes: 2000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.ok(r.result.zoneExplanation.includes("progress exception"));
    // Should NOT claim replication is impossible
    assert.ok(r.result.zoneExplanation.includes("can still occur"));
    assert.ok(!r.result.zoneExplanation.includes("will not replicate"));
  });

  test("consumption zone explanation mentions progress exception", () => {
    const input = makeInput({
      producerMaxRequestSize: 2000,
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 2000,
      consumerMaxPartitionFetchBytes: 500,
      consumerFetchMaxBytes: 2000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.ok(r.result.zoneExplanation.includes("progress exception"));
    assert.ok(r.result.zoneExplanation.includes("can still occur"));
  });
});
