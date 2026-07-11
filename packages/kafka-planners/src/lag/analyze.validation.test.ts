import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeLag,
  validateLagInput,
  validateUnknownInput,
  makePartition,
  makeInput,
} from "./analyze.test-support";

// ─── Semantic Validation Tests ──────────────────────────────────────────────

describe("validation", () => {
  test("interval <= 0 is rejected", () => {
    const input = makeInput({ intervalSeconds: 0 });
    const result = analyzeLag(input);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.kind === "interval-invalid"));
    }
  });

  test("negative interval is rejected", () => {
    const input = makeInput({ intervalSeconds: -10 });
    const result = analyzeLag(input);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.kind === "interval-invalid"));
    }
  });

  test("NaN offset is rejected", () => {
    const input = makeInput({
      snapshotBefore: { partitions: [makePartition("p0", NaN, 100)] },
      snapshotAfter: { partitions: [makePartition("p0", 50, 100)] },
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.kind === "non-finite-offset"));
    }
  });

  test("Infinity offset is rejected", () => {
    const input = makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 100, Infinity)] },
      snapshotAfter: { partitions: [makePartition("p0", 50, 100)] },
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.kind === "non-finite-offset"));
    }
  });

  test("negative offset is rejected", () => {
    const input = makeInput({
      snapshotBefore: { partitions: [makePartition("p0", -1, 100)] },
      snapshotAfter: { partitions: [makePartition("p0", 50, 100)] },
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.kind === "negative-offset"));
    }
  });

  test("non-integer offset is rejected", () => {
    const input = makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 1.5, 100)] },
      snapshotAfter: { partitions: [makePartition("p0", 50, 100)] },
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.kind === "non-integer-offset"));
    }
  });

  test("logEnd < committed is rejected", () => {
    const input = makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 200, 100)] },
      snapshotAfter: { partitions: [makePartition("p0", 50, 100)] },
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.kind === "log-end-below-committed"));
    }
  });

  test("logEnd < currentOffset is rejected", () => {
    const input = makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 50, 100, 200)] },
      snapshotAfter: { partitions: [makePartition("p0", 50, 100)] },
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.kind === "log-end-below-current"));
    }
  });

  test("duplicate partitions are rejected", () => {
    const input = makeInput({
      snapshotBefore: {
        partitions: [
          makePartition("p0", 100, 200),
          makePartition("p0", 100, 200),
        ],
      },
      snapshotAfter: {
        partitions: [makePartition("p0", 150, 260)],
      },
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.kind === "duplicate-partition"));
    }
  });

  test("missing partitions are rejected", () => {
    const input = makeInput({
      snapshotBefore: {
        partitions: [
          makePartition("p0", 100, 200),
          makePartition("p1", 100, 200),
        ],
      },
      snapshotAfter: {
        partitions: [makePartition("p0", 150, 260)],
      },
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.kind === "missing-partition"));
    }
  });

  test("insufficient samples (both empty)", () => {
    const input = makeInput({
      snapshotBefore: { partitions: [] },
      snapshotAfter: { partitions: [] },
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.kind === "insufficient-samples"));
    }
  });

  test("invalid throughput assumption", () => {
    const input = makeInput({
      assumptions: { perConsumerThroughput: 0 },
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.kind === "throughput-invalid"));
    }
  });

  test("invalid drain target", () => {
    const input = makeInput({
      assumptions: { perConsumerThroughput: 1000, drainTargetSeconds: -1 },
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.kind === "drain-target-invalid"));
    }
  });

  test("invalid hot multiplier", () => {
    const input = makeInput({ hotPartitionMultiplier: 0.5 });
    const result = analyzeLag(input);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.kind === "hot-multiplier-invalid"));
    }
  });

  test("invalid hot min lag", () => {
    const input = makeInput({ hotPartitionMinLag: -1 });
    const result = analyzeLag(input);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.kind === "hot-min-lag-invalid"));
    }
  });

  test("log-end regression is rejected as validation issue", () => {
    const input = makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 50, 300)] },
      snapshotAfter: { partitions: [makePartition("p0", 100, 200)] },
      intervalSeconds: 60,
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.kind === "log-end-regression"));
      assert.ok(result.issues.some((i) => i.message.includes("truncation") || i.message.includes("epoch")));
    }
  });
});

// ─── Structural Validation (malformed-shape tests, table-driven) ────────────

describe("structural validation (malformed input)", () => {
  const MALFORMED_CASES: Array<{
    name: string;
    input: unknown;
    expectedKind: string;
  }> = [
    { name: "null input", input: null, expectedKind: "invalid-root" },
    { name: "undefined input", input: undefined, expectedKind: "invalid-root" },
    { name: "number input", input: 42, expectedKind: "invalid-root" },
    { name: "string input", input: "hello", expectedKind: "invalid-root" },
    { name: "array input", input: [1, 2, 3], expectedKind: "invalid-root" },
    { name: "boolean input", input: true, expectedKind: "invalid-root" },
    {
      name: "missing snapshotBefore",
      input: { snapshotAfter: { partitions: [] }, intervalSeconds: 60 },
      expectedKind: "invalid-snapshot",
    },
    {
      name: "missing snapshotAfter",
      input: { snapshotBefore: { partitions: [] }, intervalSeconds: 60 },
      expectedKind: "invalid-snapshot",
    },
    {
      name: "snapshotBefore is null",
      input: { snapshotBefore: null, snapshotAfter: { partitions: [] }, intervalSeconds: 60 },
      expectedKind: "invalid-snapshot",
    },
    {
      name: "snapshotAfter is array",
      input: { snapshotBefore: { partitions: [] }, snapshotAfter: [1, 2], intervalSeconds: 60 },
      expectedKind: "invalid-snapshot",
    },
    {
      name: "snapshotBefore is number",
      input: { snapshotBefore: 42, snapshotAfter: { partitions: [] }, intervalSeconds: 60 },
      expectedKind: "invalid-snapshot",
    },
    {
      name: "partitions is not array",
      input: { snapshotBefore: { partitions: "bad" }, snapshotAfter: { partitions: [] }, intervalSeconds: 60 },
      expectedKind: "invalid-partitions",
    },
    {
      name: "partitions missing from snapshot",
      input: { snapshotBefore: {}, snapshotAfter: { partitions: [] }, intervalSeconds: 60 },
      expectedKind: "invalid-partitions",
    },
    {
      name: "partition entry is null",
      input: {
        snapshotBefore: { partitions: [null] },
        snapshotAfter: { partitions: [] },
        intervalSeconds: 60,
      },
      expectedKind: "invalid-partition-object",
    },
    {
      name: "partition entry is array",
      input: {
        snapshotBefore: { partitions: [[1, 2, 3]] },
        snapshotAfter: { partitions: [] },
        intervalSeconds: 60,
      },
      expectedKind: "invalid-partition-object",
    },
    {
      name: "partition entry is number",
      input: {
        snapshotBefore: { partitions: [42] },
        snapshotAfter: { partitions: [] },
        intervalSeconds: 60,
      },
      expectedKind: "invalid-partition-object",
    },
    {
      name: "partition with missing partitionId",
      input: {
        snapshotBefore: { partitions: [{ committedOffset: 0, currentOffset: 0, logEndOffset: 0 }] },
        snapshotAfter: { partitions: [] },
        intervalSeconds: 60,
      },
      expectedKind: "invalid-partition-id",
    },
    {
      name: "partition with numeric partitionId",
      input: {
        snapshotBefore: { partitions: [{ partitionId: 0, committedOffset: 0, currentOffset: 0, logEndOffset: 0 }] },
        snapshotAfter: { partitions: [] },
        intervalSeconds: 60,
      },
      expectedKind: "invalid-partition-id",
    },
    {
      name: "partition with empty string partitionId",
      input: {
        snapshotBefore: { partitions: [{ partitionId: "", committedOffset: 0, currentOffset: 0, logEndOffset: 0 }] },
        snapshotAfter: { partitions: [] },
        intervalSeconds: 60,
      },
      expectedKind: "invalid-partition-id",
    },
    {
      name: "partition with string offset",
      input: {
        snapshotBefore: { partitions: [{ partitionId: "p0", committedOffset: "abc", currentOffset: 0, logEndOffset: 0 }] },
        snapshotAfter: { partitions: [] },
        intervalSeconds: 60,
      },
      expectedKind: "invalid-field-type",
    },
    {
      name: "partition with missing logEndOffset",
      input: {
        snapshotBefore: { partitions: [{ partitionId: "p0", committedOffset: 0, currentOffset: 0 }] },
        snapshotAfter: { partitions: [] },
        intervalSeconds: 60,
      },
      expectedKind: "invalid-field-type",
    },
    {
      name: "invalid group state string",
      input: {
        snapshotBefore: { partitions: [], groupState: "bogus" },
        snapshotAfter: { partitions: [] },
        intervalSeconds: 60,
      },
      expectedKind: "invalid-group-state",
    },
    {
      name: "numeric group state",
      input: {
        snapshotBefore: { partitions: [], groupState: 42 },
        snapshotAfter: { partitions: [] },
        intervalSeconds: 60,
      },
      expectedKind: "invalid-group-state",
    },
    {
      name: "missing intervalSeconds",
      input: {
        snapshotBefore: { partitions: [] },
        snapshotAfter: { partitions: [] },
      },
      expectedKind: "invalid-field-type",
    },
    {
      name: "string intervalSeconds",
      input: {
        snapshotBefore: { partitions: [] },
        snapshotAfter: { partitions: [] },
        intervalSeconds: "60",
      },
      expectedKind: "invalid-field-type",
    },
    {
      name: "assumptions as array",
      input: {
        snapshotBefore: { partitions: [] },
        snapshotAfter: { partitions: [] },
        intervalSeconds: 60,
        assumptions: [1000],
      },
      expectedKind: "invalid-field-type",
    },
    {
      name: "assumptions with string throughput",
      input: {
        snapshotBefore: { partitions: [] },
        snapshotAfter: { partitions: [] },
        intervalSeconds: 60,
        assumptions: { perConsumerThroughput: "fast" },
      },
      expectedKind: "invalid-field-type",
    },
  ];

  for (const tc of MALFORMED_CASES) {
    test(tc.name, () => {
      const result = analyzeLag(tc.input);
      assert.equal(result.ok, false, `Expected failure for: ${tc.name}`);
      if (!result.ok) {
        assert.ok(
          result.issues.some((i) => i.kind === tc.expectedKind),
          `Expected issue kind "${tc.expectedKind}" for "${tc.name}", got: ${result.issues.map((i) => i.kind).join(", ")}`,
        );
      }
    });
  }

  test("analyzeLag never throws for any malformed input", () => {
    const badInputs: unknown[] = [
      null, undefined, 0, "", true, false, NaN, Infinity,
      [], {}, { snapshotBefore: null }, { snapshotBefore: { partitions: [null, undefined, 42, "bad", []] } },
      Symbol("test"),
    ];
    for (const bad of badInputs) {
      assert.doesNotThrow(() => analyzeLag(bad), `analyzeLag threw for input: ${String(bad)}`);
    }
  });

  test("validateUnknownInput returns ok for valid input", () => {
    const input = makeInput();
    const result = validateUnknownInput(input);
    assert.equal(result.ok, true);
  });
});

// ─── Divide-by-Zero / Edge Cases ────────────────────────────────────────────

describe("divide-by-zero and edge cases", () => {
  test("interval validation prevents divide by zero", () => {
    const issues = validateLagInput(makeInput({ intervalSeconds: 0 }));
    assert.ok(issues.some((i) => i.kind === "interval-invalid"));
  });

  test("drain ETA unavailable when lag is growing", () => {
    const input = makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 100, 200)] },
      snapshotAfter: { partitions: [makePartition("p0", 110, 400)] },
      intervalSeconds: 60,
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.result.drainEta.etaSeconds, null);
    assert.ok(result.result.drainEta.unavailableReason);
  });

  test("drain ETA is 0 when already caught up", () => {
    const input = makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 100, 100)] },
      snapshotAfter: { partitions: [makePartition("p0", 200, 200)] },
      intervalSeconds: 60,
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.result.drainEta.etaSeconds, 0);
  });

  test("drain ETA is calculated when draining (no regressions)", () => {
    // lag after = 260 - 100 = 160
    // ingress rate = (260 - 100) / 60 = 160/60
    // consumer rate = (100 - 0) / 60 = 100/60
    // net drain = 100/60 - 160/60 = -60/60 = -1  (growing, so ETA null)
    const input = makeInput({
      snapshotBefore: { partitions: [makePartition("p0", 0, 100)] },
      snapshotAfter: { partitions: [makePartition("p0", 100, 260)] },
      intervalSeconds: 60,
    });
    const result = analyzeLag(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.result.drainEta.etaSeconds, null);
  });
});

