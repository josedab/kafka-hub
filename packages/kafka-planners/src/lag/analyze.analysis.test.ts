import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeLag,
  makePartition,
  makeInput,
} from "./analyze.test-support";
import type {
  LagTriageInput,
  LagCondition,
} from "./analyze.test-support";

// ─── Classification Tests (table-driven) ────────────────────────────────────

const CLASSIFICATION_CASES: Array<{
  name: string;
  input: LagTriageInput;
  expected: LagCondition;
}> = [
  {
    name: "caught-up: all lag is zero",
    input: makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 100, 100)] },
      snapshotAfter: { partitions: [makePartition("p0", 200, 200)] },
    }),
    expected: "caught-up",
  },
  {
    name: "growing: lag increases",
    input: makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 100, 200)] },
      snapshotAfter: { partitions: [makePartition("p0", 110, 300)] },
      intervalSeconds: 60,
    }),
    expected: "growing",
  },
  {
    name: "draining: lag decreases",
    input: makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 100, 300)] },
      snapshotAfter: { partitions: [makePartition("p0", 250, 310)] },
      intervalSeconds: 60,
    }),
    expected: "draining",
  },
  {
    name: "stable-backlog: lag exists but unchanged",
    input: makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 0, 100)] },
      snapshotAfter: { partitions: [makePartition("p0", 50, 150)] },
      intervalSeconds: 60,
    }),
    expected: "stable-backlog",
  },
  {
    name: "stalled: consumer makes no progress with lag",
    input: makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 100, 200)] },
      snapshotAfter: { partitions: [makePartition("p0", 100, 200)] },
      intervalSeconds: 60,
    }),
    expected: "stalled",
  },
  {
    name: "group-unstable: group in preparing-rebalance",
    input: makeInput({
      snapshotBefore: {
        partitions: [makePartition("p0", 100, 200)],
        groupState: "stable",
      },
      snapshotAfter: {
        partitions: [makePartition("p0", 150, 260)],
        groupState: "preparing-rebalance",
      },
    }),
    expected: "group-unstable",
  },
  {
    name: "group-unstable: group dead",
    input: makeInput({
      snapshotAfter: {
        partitions: [makePartition("p0", 150, 260), makePartition("p1", 200, 310)],
        groupState: "dead",
      },
    }),
    expected: "group-unstable",
  },
  {
    name: "group-unstable: committed offset regression (even with stable group)",
    input: makeInput({
      snapshotBefore: {
        partitions: [makePartition("p0", 200, 300)],
        groupState: "stable",
      },
      snapshotAfter: {
        partitions: [makePartition("p0", 100, 350)],
        groupState: "stable",
      },
    }),
    expected: "group-unstable",
  },
  {
    name: "group-unstable: current offset regression triggers unstable",
    input: makeInput({
      snapshotBefore: {
        partitions: [makePartition("p0", 100, 200, 150)],
        groupState: "stable",
      },
      snapshotAfter: {
        partitions: [makePartition("p0", 150, 260, 100)],
        groupState: "stable",
      },
    }),
    expected: "group-unstable",
  },
  {
    name: "hot-partition: one partition has disproportionate lag (3 partitions)",
    input: makeInput({
      snapshotBefore: {
        partitions: [
          makePartition("p0", 0, 100),
          makePartition("p1", 0, 100),
          makePartition("p2", 0, 100),
        ],
      },
      snapshotAfter: {
        partitions: [
          makePartition("p0", 50, 150),
          makePartition("p1", 50, 150),
          makePartition("p2", 50, 10150), // lag = 10100 >> peer mean
        ],
      },
      hotPartitionMinLag: 1000,
      intervalSeconds: 60,
    }),
    expected: "hot-partition",
  },
];

describe("classification", () => {
  for (const tc of CLASSIFICATION_CASES) {
    test(tc.name, () => {
      const result = analyzeLag(tc.input);
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(
          result.result.condition,
          tc.expected,
          `Expected condition "${tc.expected}" but got "${result.result.condition}"`,
        );
      }
    });
  }
});

// ─── Exact Math Tests ───────────────────────────────────────────────────────

describe("exact math", () => {
  test("per-partition lag, delta, and rates", () => {
    const input = makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 100, 200)] },
      snapshotAfter: { partitions: [makePartition("p0", 140, 280)] },
      intervalSeconds: 20,
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const p = result.result.partitions[0];
    assert.equal(p.lagBefore, 100); // 200 - 100
    assert.equal(p.lagAfter, 140); // 280 - 140
    assert.equal(p.lagDelta, 40); // 140 - 100
    assert.equal(p.lagRatePerSec, 2); // 40 / 20
    assert.equal(p.ingressRatePerSec, 4); // (280 - 200) / 20
    assert.equal(p.committedRatePerSec, 2); // (140 - 100) / 20
  });

  test("per-partition current-offset metrics", () => {
    const input = makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 100, 200, 120)] },
      snapshotAfter: { partitions: [makePartition("p0", 140, 280, 180)] },
      intervalSeconds: 20,
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const p = result.result.partitions[0];
    assert.equal(p.currentBefore, 120);
    assert.equal(p.currentAfter, 180);
    assert.equal(p.currentDelta, 60); // 180 - 120
    assert.equal(p.currentRatePerSec, 3); // 60 / 20
    assert.equal(p.currentRegression, false);
  });

  test("total aggregates sum correctly", () => {
    const input = makeInput({
      snapshotBefore: {
        partitions: [
          makePartition("p0", 100, 200),
          makePartition("p1", 50, 100),
        ],
      },
      snapshotAfter: {
        partitions: [
          makePartition("p0", 150, 300),
          makePartition("p1", 80, 140),
        ],
      },
      intervalSeconds: 10,
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    // p0: lagBefore=100, lagAfter=150, p1: lagBefore=50, lagAfter=60
    assert.equal(result.result.totalLagBefore, 150);
    assert.equal(result.result.totalLagAfter, 210);
    assert.equal(result.result.totalLagDelta, 60);
    assert.equal(result.result.totalLagRatePerSec, 6); // 60 / 10
  });

  test("aggregate current-offset metrics", () => {
    const input = makeInput({
      snapshotBefore: {
        partitions: [
          makePartition("p0", 100, 200, 110),
          makePartition("p1", 50, 100, 60),
        ],
      },
      snapshotAfter: {
        partitions: [
          makePartition("p0", 150, 300, 170),
          makePartition("p1", 80, 140, 90),
        ],
      },
      intervalSeconds: 10,
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    // p0: currentDelta = 170 - 110 = 60, p1: currentDelta = 90 - 60 = 30
    assert.equal(result.result.totalCurrentDelta, 90);
    assert.equal(result.result.totalCurrentRatePerSec, 9); // 90 / 10
  });

  test("skew metrics: mean, max, CV", () => {
    const input = makeInput({
      snapshotBefore: {
        partitions: [
          makePartition("p0", 0, 0),
          makePartition("p1", 0, 0),
        ],
      },
      snapshotAfter: {
        partitions: [
          makePartition("p0", 0, 100), // lag = 100
          makePartition("p1", 0, 300), // lag = 300
        ],
      },
      intervalSeconds: 60,
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.result.partitionSkew.maxLag, 300);
    assert.equal(result.result.partitionSkew.meanLag, 200);
    // stddev = sqrt(((100-200)^2 + (300-200)^2) / 2) = sqrt(10000) = 100
    // CV = 100 / 200 = 0.5
    assert.ok(
      Math.abs(result.result.partitionSkew.coefficientOfVariation! - 0.5) < 0.001,
    );
  });

  test("CV is null when mean lag is 0", () => {
    const input = makeInput({
      snapshotBefore: {
        partitions: [makePartition("p0", 100, 100)],
      },
      snapshotAfter: {
        partitions: [makePartition("p0", 200, 200)],
      },
      intervalSeconds: 60,
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.result.partitionSkew.coefficientOfVariation, null);
  });
});

// ─── Partition Skew & Hot Partitions (peer-baseline) ────────────────────────

describe("partition skew and hot partitions", () => {
  test("hot partition detection with peer-baseline (3 partitions)", () => {
    // p0 lag=10, p1 lag=10, p2 lag=5010
    // For p2: peerMean = (10+10)/2 = 10, threshold = 10*2 = 20
    // p2 lag = 5010 > 20 AND >= 1000 → hot
    const input = makeInput({
      snapshotBefore: {
        partitions: [
          makePartition("p0", 0, 10),
          makePartition("p1", 0, 10),
          makePartition("p2", 0, 10),
        ],
      },
      snapshotAfter: {
        partitions: [
          makePartition("p0", 0, 10),
          makePartition("p1", 0, 10),
          makePartition("p2", 0, 5010),
        ],
      },
      intervalSeconds: 60,
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.result.hotPartitions, ["p2"]);
    assert.equal(result.result.partitions.find((p) => p.partitionId === "p2")?.isHot, true);
  });

  test("hot partition detection works for 2 partitions", () => {
    // p0 lag=100, p1 lag=5100
    // For p1: peerMean = 100/1 = 100, threshold = 100*2 = 200
    // p1 lag = 5100 > 200 AND >= 1000 → hot
    const input = makeInput({
      snapshotBefore: {
        partitions: [
          makePartition("p0", 0, 100),
          makePartition("p1", 0, 100),
        ],
      },
      snapshotAfter: {
        partitions: [
          makePartition("p0", 0, 100),
          makePartition("p1", 0, 5100),
        ],
      },
      intervalSeconds: 60,
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.result.hotPartitions, ["p1"]);
  });

  test("single-partition group cannot have hot partitions", () => {
    // With only one partition, there are no peers → no hot detection
    const input = makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 0, 10000)] },
      snapshotAfter: { partitions: [makePartition("p0", 0, 50000)] },
      intervalSeconds: 60,
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.result.hotPartitions, []);
    assert.equal(result.result.conditionFlags.hasHotPartitions, false);
  });

  test("not hot when below minimum lag threshold", () => {
    // peerMean = 1, threshold = 2, p2 lag=5 > 2, but 5 < 1000 (default min lag)
    const input = makeInput({
      snapshotBefore: {
        partitions: [
          makePartition("p0", 0, 1),
          makePartition("p1", 0, 1),
          makePartition("p2", 0, 1),
        ],
      },
      snapshotAfter: {
        partitions: [
          makePartition("p0", 0, 1),
          makePartition("p1", 0, 1),
          makePartition("p2", 0, 5),
        ],
      },
      intervalSeconds: 60,
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.result.hotPartitions, []);
  });

  test("custom hot partition multiplier and min lag", () => {
    // p0 lag=10, p1 lag=10, p2 lag=30
    // For p2: peerMean = (10+10)/2 = 10, threshold = 10*1.5 = 15
    // p2 lag=30 > 15 AND >= 10 → hot
    const input = makeInput({
      snapshotBefore: {
        partitions: [
          makePartition("p0", 0, 10),
          makePartition("p1", 0, 10),
          makePartition("p2", 0, 10),
        ],
      },
      snapshotAfter: {
        partitions: [
          makePartition("p0", 0, 10),
          makePartition("p1", 0, 10),
          makePartition("p2", 0, 30),
        ],
      },
      hotPartitionMultiplier: 1.5,
      hotPartitionMinLag: 10,
      intervalSeconds: 60,
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.result.hotPartitions, ["p2"]);
  });
});

// ─── Offset Regression ──────────────────────────────────────────────────────

describe("offset regression", () => {
  test("detects committed offset regression", () => {
    const input = makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 200, 300)] },
      snapshotAfter: { partitions: [makePartition("p0", 100, 350)] },
      intervalSeconds: 60,
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.result.committedRegressions, ["p0"]);
    assert.equal(result.result.conditionFlags.hasCommittedRegressions, true);
    assert.equal(result.result.condition, "group-unstable");
  });

  test("detects current offset regression", () => {
    const input = makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 100, 300, 200)] },
      snapshotAfter: { partitions: [makePartition("p0", 150, 350, 140)] },
      intervalSeconds: 60,
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.result.currentRegressions, ["p0"]);
    assert.equal(result.result.conditionFlags.hasCurrentRegressions, true);
    assert.equal(result.result.condition, "group-unstable");
  });

  test("no regression when offsets advance", () => {
    const input = makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 100, 200)] },
      snapshotAfter: { partitions: [makePartition("p0", 150, 300)] },
      intervalSeconds: 60,
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.result.committedRegressions, []);
    assert.deepEqual(result.result.currentRegressions, []);
  });

  test("committed regression makes drain ETA unavailable", () => {
    const input = makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 200, 300)] },
      snapshotAfter: { partitions: [makePartition("p0", 100, 350)] },
      intervalSeconds: 60,
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.result.drainEta.etaSeconds, null);
    assert.ok(result.result.drainEta.unavailableReason?.includes("regression"));
  });

  test("current regression makes drain ETA unavailable", () => {
    const input = makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 100, 300, 200)] },
      snapshotAfter: { partitions: [makePartition("p0", 250, 350, 140)] },
      intervalSeconds: 60,
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.result.drainEta.etaSeconds, null);
    assert.ok(result.result.drainEta.unavailableReason?.includes("regression"));
  });

  test("negative committed progress does not produce falsely optimistic ETA", () => {
    // Committed offset went backward → negative consumerRate.
    // Without regression safety: netDrain would be negative → ETA null anyway,
    // but the classification must still be group-unstable.
    const input = makeInput({
      snapshotBefore: {
        partitions: [makePartition("p0", 200, 300)],
        groupState: "stable",
      },
      snapshotAfter: {
        partitions: [makePartition("p0", 100, 350)],
        groupState: "stable",
      },
      intervalSeconds: 60,
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.result.condition, "group-unstable");
    assert.equal(result.result.drainEta.etaSeconds, null);
  });
});

// ─── Group Instability Precedence ───────────────────────────────────────────

describe("group instability", () => {
  test("completing-rebalance triggers group-unstable", () => {
    const input = makeInput({
      snapshotAfter: {
        partitions: [makePartition("p0", 150, 260), makePartition("p1", 200, 310)],
        groupState: "completing-rebalance",
      },
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.result.condition, "group-unstable");
    assert.equal(result.result.conditionFlags.groupStateUnstable, true);
  });

  test("stable group does not trigger flag", () => {
    const input = makeInput({
      snapshotAfter: {
        partitions: [makePartition("p0", 150, 260), makePartition("p1", 200, 310)],
        groupState: "stable",
      },
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.result.conditionFlags.groupStateUnstable, false);
  });

  test("unknown group state does not trigger flag", () => {
    const input = makeInput({
      snapshotAfter: {
        partitions: [makePartition("p0", 150, 260), makePartition("p1", 200, 310)],
        groupState: "unknown",
      },
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.result.conditionFlags.groupStateUnstable, false);
  });

  test("group-unstable takes precedence over hot-partition", () => {
    // Even if a partition is hot, group-unstable from regressions wins
    const input = makeInput({
      snapshotBefore: {
        partitions: [
          makePartition("p0", 200, 300),
          makePartition("p1", 0, 100),
          makePartition("p2", 0, 100),
        ],
        groupState: "stable",
      },
      snapshotAfter: {
        partitions: [
          makePartition("p0", 100, 350), // committed regression
          makePartition("p1", 0, 100),
          makePartition("p2", 0, 10100), // hot lag
        ],
        groupState: "stable",
      },
      hotPartitionMinLag: 1000,
      intervalSeconds: 60,
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.result.condition, "group-unstable");
    assert.equal(result.result.conditionFlags.hasCommittedRegressions, true);
    assert.equal(result.result.conditionFlags.hasHotPartitions, true);
  });
});

