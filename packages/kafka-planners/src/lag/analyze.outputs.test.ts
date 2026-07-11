import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeLag,
  exportLagMarkdown,
  exportLagJson,
  redactLabel,
  DEFAULT_HOT_MULTIPLIER,
  DEFAULT_HOT_MIN_LAG,
  RESOURCE_LINKS,
  makePartition,
  makeInput,
} from "./analyze.test-support";

// ─── Throughput & Capacity ──────────────────────────────────────────────────

describe("throughput and capacity", () => {
  test("throughput to hold steady equals ingress rate", () => {
    const input = makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 0, 0)] },
      snapshotAfter: { partitions: [makePartition("p0", 0, 600)] },
      intervalSeconds: 60,
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.result.throughputRequirements.toHoldSteady, 10); // 600/60
  });

  test("throughput to drain includes backlog", () => {
    const input = makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 0, 0)] },
      snapshotAfter: { partitions: [makePartition("p0", 0, 600)] },
      intervalSeconds: 60,
      assumptions: {
        perConsumerThroughput: 100,
        drainTargetSeconds: 120,
      },
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    // ingress = 10, lag = 600, drain target = 120
    // toDrain = 10 + 600/120 = 10 + 5 = 15
    assert.equal(result.result.throughputRequirements.toDrainByTarget, 15);
  });

  test("capacity returns uncapped required, capped effective, and shortfall", () => {
    const input = makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 0, 0)] },
      snapshotAfter: { partitions: [makePartition("p0", 0, 60000)] },
      intervalSeconds: 60,
      assumptions: {
        perConsumerThroughput: 10, // very low → many consumers needed
        drainTargetSeconds: 60,
      },
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const cap = result.result.capacity!;
    // ingress = 60000/60 = 1000 r/s
    // requiredToHoldSteady = ceil(1000/10) = 100
    assert.equal(cap.requiredToHoldSteady, 100);
    assert.equal(cap.effectiveToHoldSteady, 1); // capped at 1 partition
    assert.equal(cap.maxActiveConsumers, 1);
    assert.equal(cap.maxThroughputAtCap, 10); // 1 * 10
    assert.equal(cap.cappedAtPartitions, true);

    // toDrainByTarget = 1000 + 60000/60 = 1000 + 1000 = 2000
    // requiredToDrain = ceil(2000/10) = 200
    assert.equal(cap.requiredToDrain, 200);
    assert.equal(cap.effectiveToDrain, 1);

    // shortfall = max(0, 2000 - 10) = 1990
    assert.equal(cap.throughputShortfall, 1990);
  });

  test("capacity rounding uses ceil", () => {
    const input = makeInput({
      snapshotBefore: {
        partitions: [
          makePartition("p0", 0, 0),
          makePartition("p1", 0, 0),
          makePartition("p2", 0, 0),
          makePartition("p3", 0, 0),
          makePartition("p4", 0, 0),
        ],
      },
      snapshotAfter: {
        partitions: [
          makePartition("p0", 0, 100),
          makePartition("p1", 0, 100),
          makePartition("p2", 0, 100),
          makePartition("p3", 0, 100),
          makePartition("p4", 0, 100),
        ],
      },
      intervalSeconds: 60,
      assumptions: {
        perConsumerThroughput: 3, // total ingress = 500/60 ≈ 8.33, ceil(8.33/3) = 3
      },
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.result.capacity?.requiredToHoldSteady, 3);
    assert.equal(result.result.capacity?.effectiveToHoldSteady, 3); // 3 <= 5 partitions
  });

  test("capacity with zero ingress", () => {
    const input = makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 0, 100)] },
      snapshotAfter: { partitions: [makePartition("p0", 50, 100)] }, // no new ingress
      intervalSeconds: 60,
      assumptions: { perConsumerThroughput: 100 },
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.result.capacity?.requiredToHoldSteady, 0);
    assert.equal(result.result.capacity?.effectiveToHoldSteady, 0);
    assert.equal(result.result.capacity?.throughputShortfall, 0);
  });

  test("no shortfall when not capped", () => {
    const input = makeInput({
      snapshotBefore: {
        partitions: [
          makePartition("p0", 0, 0),
          makePartition("p1", 0, 0),
          makePartition("p2", 0, 0),
        ],
      },
      snapshotAfter: {
        partitions: [
          makePartition("p0", 0, 10),
          makePartition("p1", 0, 10),
          makePartition("p2", 0, 10),
        ],
      },
      intervalSeconds: 60,
      assumptions: { perConsumerThroughput: 1000 }, // way more than needed
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.result.capacity?.cappedAtPartitions, false);
    assert.equal(result.result.capacity?.throughputShortfall, 0);
  });

  test("no capacity when no assumptions provided", () => {
    const input = makeInput();
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.result.capacity, undefined);
  });
});

// ─── Unit Conversion Verification ───────────────────────────────────────────

describe("unit conversion", () => {
  test("rates are per second regardless of interval length", () => {
    const input300s = makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 0, 0)] },
      snapshotAfter: { partitions: [makePartition("p0", 300, 600)] },
      intervalSeconds: 300,
    });
    const input60s = makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 0, 0)] },
      snapshotAfter: { partitions: [makePartition("p0", 60, 120)] },
      intervalSeconds: 60,
    });

    const r300 = analyzeLag(input300s);
    const r60 = analyzeLag(input60s);
    assert.equal(r300.ok, true);
    assert.equal(r60.ok, true);
    if (!r300.ok || !r60.ok) return;

    // Both should report 2 r/s ingress and 1 r/s committed
    assert.equal(r300.result.totalIngressRatePerSec, 2);
    assert.equal(r60.result.totalIngressRatePerSec, 2);
    assert.equal(r300.result.totalCommittedRatePerSec, 1);
    assert.equal(r60.result.totalCommittedRatePerSec, 1);
  });
});

// ─── Deterministic Ordering ─────────────────────────────────────────────────

describe("deterministic ordering", () => {
  test("partitions are sorted by ID", () => {
    const input = makeInput({
      snapshotBefore: {
        partitions: [
          makePartition("z-part", 0, 100),
          makePartition("a-part", 0, 100),
          makePartition("m-part", 0, 100),
        ],
      },
      snapshotAfter: {
        partitions: [
          makePartition("z-part", 50, 150),
          makePartition("a-part", 50, 150),
          makePartition("m-part", 50, 150),
        ],
      },
      intervalSeconds: 60,
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const ids = result.result.partitions.map((p) => p.partitionId);
    assert.deepEqual(ids, ["a-part", "m-part", "z-part"]);
  });
});

// ─── Export & Redaction ─────────────────────────────────────────────────────

describe("export", () => {
  test("Markdown export includes condition and partitions", () => {
    const input = makeInput();
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const md = exportLagMarkdown(result.result);
    assert.ok(md.content.includes("Consumer Lag Triage Report"));
    assert.ok(md.content.includes("p0"));
    assert.ok(md.content.includes("p1"));
    assert.ok(md.content.includes("Generated by"));
  });

  test("Markdown export includes current-position metrics", () => {
    const input = makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 100, 200, 120)] },
      snapshotAfter: { partitions: [makePartition("p0", 140, 280, 180)] },
      intervalSeconds: 20,
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const md = exportLagMarkdown(result.result);
    assert.ok(md.content.includes("Current-position delta"));
    assert.ok(md.content.includes("Current-position rate"));
    assert.ok(md.content.includes("Cur Delta"));
  });

  test("Markdown export includes peer-baseline hot partition explanation", () => {
    const input = makeInput();
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const md = exportLagMarkdown(result.result);
    assert.ok(md.content.includes("peer-baseline"));
  });

  test("JSON export is valid JSON with no NaN/Infinity", () => {
    const input = makeInput();
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const json = exportLagJson(result.result);
    const content = json.content;
    // Verify no NaN or Infinity in JSON output
    assert.ok(!content.includes("NaN"), "JSON should not contain NaN");
    assert.ok(!content.includes("Infinity"), "JSON should not contain Infinity");
    const parsed = JSON.parse(content);
    assert.equal(typeof parsed.generatedAt, "string");
    assert.equal(parsed.condition, result.result.condition);
  });

  test("JSON export includes current-position data", () => {
    const input = makeInput();
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const json = exportLagJson(result.result);
    const parsed = JSON.parse(json.content);
    assert.ok("totalCurrentDelta" in parsed.summary);
    assert.ok("totalCurrentRatePerSec" in parsed.summary);
  });

  test("JSON export includes disclaimer without universal thresholds", () => {
    const input = makeInput();
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const json = exportLagJson(result.result);
    const parsed = JSON.parse(json.content);
    assert.ok(parsed.disclaimer.includes("not a live diagnosis"));
    assert.ok(parsed.disclaimer.includes("baseline") || parsed.disclaimer.includes("SLO"));
  });

  test("JSON export includes capacity shortfall fields", () => {
    const input = makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 0, 0)] },
      snapshotAfter: { partitions: [makePartition("p0", 0, 60000)] },
      intervalSeconds: 60,
      assumptions: { perConsumerThroughput: 10, drainTargetSeconds: 60 },
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const json = exportLagJson(result.result);
    const parsed = JSON.parse(json.content);
    assert.ok("requiredToHoldSteady" in parsed.capacity);
    assert.ok("effectiveToHoldSteady" in parsed.capacity);
    assert.ok("maxThroughputAtCap" in parsed.capacity);
    assert.ok("throughputShortfall" in parsed.capacity);
  });

  test("redactLabel sanitizes secret-like partition names", () => {
    const sanitized = redactLabel("******");
    assert.ok(!sanitized.includes("mySecretPassword123"));
  });

  test("redactLabel passes through safe strings", () => {
    const safe = redactLabel("my-topic-0");
    assert.equal(safe, "my-topic-0");
  });

  test("export includes generated timestamp", () => {
    const input = makeInput();
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const json = exportLagJson(result.result);
    const parsed = JSON.parse(json.content);
    assert.ok(parsed.generatedAt);
    assert.ok(!isNaN(Date.parse(parsed.generatedAt)));
  });

  test("result does not carry analyzedAt field", () => {
    const input = makeInput();
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    // LagTriageResult should not have an analyzedAt field
    assert.ok(!("analyzedAt" in result.result));
  });
});

// ─── Observability Recommendations ──────────────────────────────────────────

describe("observability recommendations", () => {
  test("recommendations are always present", () => {
    const input = makeInput();
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.result.recommendations.length > 0);
  });

  test("every recommendation has caveat with no-alert-alone guidance", () => {
    const input = makeInput();
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    for (const rec of result.result.recommendations) {
      assert.ok(rec.caveat.length > 0, `Missing caveat for ${rec.metric}`);
      assert.ok(
        rec.caveat.toLowerCase().includes("do not alert") ||
          rec.caveat.toLowerCase().includes("alone"),
        `Caveat for ${rec.metric} should include "do not alert ... alone" guidance`,
      );
    }
  });

  test("no caveat contains universal numeric example thresholds like '> 5 min'", () => {
    const input = makeInput();
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    for (const rec of result.result.recommendations) {
      // Should not contain specific threshold examples like "> 5 min", "> 10 min", etc.
      assert.ok(
        !/>\s*\d+\s*min/i.test(rec.caveat),
        `Caveat for ${rec.metric} contains a universal numeric threshold: "${rec.caveat}"`,
      );
    }
  });

  test("recommendations cover key signals", () => {
    const input = makeInput();
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const metrics = result.result.recommendations.map((r) => r.metric.toLowerCase());
    assert.ok(metrics.some((m) => m.includes("lag")));
    assert.ok(metrics.some((m) => m.includes("state") || m.includes("group")));
    assert.ok(metrics.some((m) => m.includes("skew") || m.includes("variation")));
  });
});

// ─── Resource Links ─────────────────────────────────────────────────────────

describe("resource links", () => {
  test("resource links are always present", () => {
    const input = makeInput();
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.result.resourceLinks.length > 0);
  });

  test("runbook link points to /runbooks/consumer-lag-climbing", () => {
    const runbook = RESOURCE_LINKS.find((l) => l.surface === "runbooks");
    assert.ok(runbook);
    assert.equal(runbook!.href, "/runbooks/consumer-lag-climbing");
  });

  test("learn link points to /learn/consumer-rebalance", () => {
    const learn = RESOURCE_LINKS.find((l) => l.surface === "learn");
    assert.ok(learn);
    assert.equal(learn!.href, "/learn/consumer-rebalance");
  });

  test("simulate link uses existing slow-consumer scenario slug", () => {
    const sim = RESOURCE_LINKS.find((l) => l.surface === "simulate");
    assert.ok(sim);
    assert.ok(sim!.href.includes("slow-consumer"), "Simulate link should reference slow-consumer scenario");
    assert.equal(sim!.href, "/simulate/embed/slow-consumer");
  });

  test("every resource link has label, href, and valid surface", () => {
    const validSurfaces = ["learn", "runbooks", "errors", "simulate", "diagnose", "workbench"];
    for (const link of RESOURCE_LINKS) {
      assert.ok(link.label.length > 0, `Link missing label`);
      assert.ok(link.href.startsWith("/"), `Link href should start with /: ${link.href}`);
      assert.ok(validSurfaces.includes(link.surface), `Invalid surface: ${link.surface}`);
    }
  });
});

// ─── Confidence ─────────────────────────────────────────────────────────────

describe("confidence", () => {
  test("short interval reduces confidence", () => {
    const input = makeInput({ intervalSeconds: 5 });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(
      result.result.confidence.level === "low" ||
        result.result.confidence.level === "moderate",
    );
    assert.ok(result.result.confidence.reason.includes("noise") || result.result.confidence.reason.includes("short"));
  });

  test("long interval and stable group gives high confidence", () => {
    const input = makeInput({
      intervalSeconds: 300,
      snapshotBefore: {
        partitions: [
          makePartition("p0", 100, 200),
          makePartition("p1", 100, 200),
        ],
        groupState: "stable",
      },
      snapshotAfter: {
        partitions: [
          makePartition("p0", 200, 300),
          makePartition("p1", 200, 300),
        ],
        groupState: "stable",
      },
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.result.confidence.level, "high");
  });

  test("committed regression reduces confidence", () => {
    const input = makeInput({
      intervalSeconds: 300,
      snapshotBefore: {
        partitions: [makePartition("p0", 200, 300)],
        groupState: "stable",
      },
      snapshotAfter: {
        partitions: [makePartition("p0", 100, 350)],
        groupState: "stable",
      },
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.result.confidence.reason.includes("regression"));
  });
});

// ─── Defaults ───────────────────────────────────────────────────────────────

describe("defaults", () => {
  test("DEFAULT_HOT_MULTIPLIER is 2.0", () => {
    assert.equal(DEFAULT_HOT_MULTIPLIER, 2.0);
  });

  test("DEFAULT_HOT_MIN_LAG is 1000", () => {
    assert.equal(DEFAULT_HOT_MIN_LAG, 1000);
  });
});

// ─── Assumptions in Result ──────────────────────────────────────────────────

describe("assumptions in result", () => {
  test("assumptions reflect input values", () => {
    const input = makeInput({
      intervalSeconds: 120,
      hotPartitionMultiplier: 3.0,
      hotPartitionMinLag: 500,
      assumptions: {
        perConsumerThroughput: 5000,
        drainTargetSeconds: 600,
      },
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const a = result.result.assumptions;
    assert.equal(a.intervalSeconds, 120);
    assert.equal(a.hotPartitionMultiplier, 3.0);
    assert.equal(a.hotPartitionMinLag, 500);
    assert.equal(a.perConsumerThroughput, 5000);
    assert.equal(a.drainTargetSeconds, 600);
  });

  test("groupStateAfter shows not-provided when absent", () => {
    const input = makeInput();
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.result.assumptions.groupStateAfter, "not-provided");
  });
});
