import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeCapacity,
  validateUnknownCapacityInput,
  exportCapacityMarkdown,
  exportCapacityJson,
  redactCapacityLabel,
  DEFAULT_SAFETY_HEADROOM_TARGET,
  DEFAULT_SKEW_FACTOR,
} from "./index";
import { RESOURCE_LINKS } from "./analyze";
import type { CapacityPlannerInput } from "./types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeInput(overrides?: Partial<CapacityPlannerInput>): CapacityPlannerInput {
  return {
    peakIngressRate: 10000,           // 10k records/sec
    avgRecordSizeBytes: 1024,         // 1 KiB per record
    compressionRatio: 0.5,            // 50% compression
    retentionSeconds: 604800,         // 7 days
    replicationFactor: 3,
    partitionCount: 30,
    brokerCount: 5,
    fullReadConsumerGroupCount: 2,
    perPartitionTargetThroughput: 1048576, // 1 MiB/s per partition
    perBrokerStorageBytes: 1099511627776,  // 1 TiB per broker
    perBrokerNetworkBytesPerSec: 125000000, // ~1 Gbps
    ...overrides,
  };
}

// ─── Exact Formula Tests ────────────────────────────────────────────────────

describe("exact formula calculations", () => {
  test("storage breakdown", () => {
    const input = makeInput();
    const r = analyzeCapacity(input);
    assert.ok(r.ok);

    // logicalUncompressedIngress = 10000 * 1024 = 10_240_000 bytes/sec
    assert.equal(r.result.storage.logicalUncompressedIngressBytesPerSec, 10000 * 1024);

    // logicalUncompressedRetained = 10_240_000 * 604800 = 6_193_152_000_000
    assert.equal(r.result.storage.logicalUncompressedRetainedBytes, 10000 * 1024 * 604800);

    // compressedPrimaryRetained = 6_193_152_000_000 * 0.5 = 3_096_576_000_000
    assert.equal(r.result.storage.compressedPrimaryRetainedBytes, 10000 * 1024 * 604800 * 0.5);

    // physicalRetained = 3_096_576_000_000 * 3 = 9_289_728_000_000
    assert.equal(r.result.storage.physicalRetainedBytes, 10000 * 1024 * 604800 * 0.5 * 3);
  });

  test("network breakdown", () => {
    const input = makeInput();
    const r = analyzeCapacity(input);
    assert.ok(r.ok);

    // compressedIngress = 10000 * 1024 * 0.5 = 5_120_000 bytes/sec
    assert.equal(r.result.network.compressedIngressBytesPerSec, 10000 * 1024 * 0.5);

    // followerReplication = 5_120_000 * (3-1) = 10_240_000 bytes/sec
    assert.equal(r.result.network.followerReplicationBytesPerSec, 10000 * 1024 * 0.5 * 2);

    // consumerRead = 5_120_000 * 2 = 10_240_000 bytes/sec
    assert.equal(r.result.network.consumerReadBytesPerSec, 10000 * 1024 * 0.5 * 2);

    // totalCluster = 5_120_000 + 10_240_000 + 10_240_000 = 25_600_000
    assert.equal(r.result.network.totalClusterNetworkBytesPerSec,
      10000 * 1024 * 0.5 + 10000 * 1024 * 0.5 * 2 + 10000 * 1024 * 0.5 * 2);
  });

  test("partition analysis", () => {
    const input = makeInput();
    const r = analyzeCapacity(input);
    assert.ok(r.ok);

    // minimum partitions = ceil(5_120_000 / 1_048_576) = ceil(4.88) = 5
    const compressedIngress = 10000 * 1024 * 0.5;
    assert.equal(r.result.partitions.minimumPartitionsFromTarget,
      Math.ceil(compressedIngress / 1048576));

    // avg per-partition = 5_120_000 / 30 = 170666.67
    assert.ok(Math.abs(r.result.partitions.avgPerPartitionThroughput - compressedIngress / 30) < 0.01);

    assert.equal(r.result.partitions.partitionCountSufficient, true);
  });

  test("broker load average", () => {
    const input = makeInput();
    const r = analyzeCapacity(input);
    assert.ok(r.ok);

    const physicalRetained = 10000 * 1024 * 604800 * 0.5 * 3;
    const totalNetwork = 10000 * 1024 * 0.5 * (1 + 2 + 2);

    // storage per broker = physicalRetained / 5
    assert.equal(r.result.averageLoad.storagePerBroker, physicalRetained / 5);
    assert.equal(r.result.averageLoad.activeBrokers, 5);

    // network per broker = totalNetwork / 5
    assert.equal(r.result.averageLoad.networkPerBroker, totalNetwork / 5);

    // utilization = storagePerBroker / perBrokerStorageBytes
    const expectedStorageUtil = (physicalRetained / 5) / 1099511627776;
    assert.ok(Math.abs(r.result.averageLoad.storageUtilization - expectedStorageUtil) < 1e-10);

    // headroom = 1 - utilization
    assert.ok(Math.abs(r.result.averageLoad.storageHeadroom - (1 - expectedStorageUtil)) < 1e-10);
  });

  test("broker load N-1", () => {
    const input = makeInput();
    const r = analyzeCapacity(input);
    assert.ok(r.ok);
    assert.ok(r.result.n1Load);

    assert.equal(r.result.n1Load.scenario, "n-1");
    assert.equal(r.result.n1Load.activeBrokers, 4);

    const physicalRetained = 10000 * 1024 * 604800 * 0.5 * 3;
    assert.equal(r.result.n1Load.storagePerBroker, physicalRetained / 4);

    const totalNetwork = 10000 * 1024 * 0.5 * (1 + 2 + 2);
    assert.equal(r.result.n1Load.networkPerBroker, totalNetwork / 4);
  });
});

// ─── Compression/RF/Retention Conversions ───────────────────────────────────

describe("compression/RF/retention conversions", () => {
  test("compressionRatio=1.0 (no compression)", () => {
    const r = analyzeCapacity(makeInput({ compressionRatio: 1.0 }));
    assert.ok(r.ok);
    // compressed should equal uncompressed
    assert.equal(
      r.result.storage.compressedPrimaryRetainedBytes,
      r.result.storage.logicalUncompressedRetainedBytes,
    );
    assert.equal(
      r.result.network.compressedIngressBytesPerSec,
      r.result.storage.logicalUncompressedIngressBytesPerSec,
    );
  });

  test("compressionRatio=0.1 (high compression)", () => {
    const r = analyzeCapacity(makeInput({ compressionRatio: 0.1 }));
    assert.ok(r.ok);
    assert.equal(
      r.result.storage.compressedPrimaryRetainedBytes,
      r.result.storage.logicalUncompressedRetainedBytes * 0.1,
    );
  });

  test("RF=1 produces no replication traffic", () => {
    // RF=1 + 1 broker => validation warns but still single broker
    const r = analyzeCapacity(makeInput({ replicationFactor: 1, brokerCount: 1 }));
    // n1-requires-two-brokers is a validation issue for brokerCount=1
    assert.ok(!r.ok);
  });

  test("RF=1 with 3 brokers", () => {
    const r = analyzeCapacity(makeInput({ replicationFactor: 1, brokerCount: 3 }));
    assert.ok(r.ok);
    assert.equal(r.result.network.followerReplicationBytesPerSec, 0);
    // Physical = compressed primary (no replication copies)
    assert.equal(r.result.storage.physicalRetainedBytes, r.result.storage.compressedPrimaryRetainedBytes);
  });

  test("RF=brokers", () => {
    const r = analyzeCapacity(makeInput({ replicationFactor: 3, brokerCount: 3 }));
    assert.ok(r.ok);
    // warnings should include rf-equals-brokers
    assert.ok(r.result.warnings.some(w => w.id === "rf-equals-brokers"));
  });

  test("retention conversion: 1 day vs 7 days scales storage linearly", () => {
    const r1 = analyzeCapacity(makeInput({ retentionSeconds: 86400 }));
    const r7 = analyzeCapacity(makeInput({ retentionSeconds: 604800 }));
    assert.ok(r1.ok && r7.ok);
    assert.ok(Math.abs(
      r7.result.storage.physicalRetainedBytes / r1.result.storage.physicalRetainedBytes - 7
    ) < 0.001);
  });
});

// ─── Brokers=1 N-1 Rejection ────────────────────────────────────────────────

describe("brokers=1 N-1 rejection", () => {
  test("single broker is rejected with n1-requires-two-brokers", () => {
    const r = analyzeCapacity(makeInput({ brokerCount: 1, replicationFactor: 1 }));
    assert.ok(!r.ok);
    assert.ok(r.issues.some(i => i.kind === "n1-requires-two-brokers"));
  });

  test("two brokers pass N-1 requirement", () => {
    const r = analyzeCapacity(makeInput({ brokerCount: 2, replicationFactor: 2 }));
    assert.ok(r.ok);
    assert.ok(r.result.n1Load);
    assert.equal(r.result.n1Load.activeBrokers, 1);
  });
});

// ─── Minimum Partition Ceil ─────────────────────────────────────────────────

describe("minimum partition ceil", () => {
  test("exact division rounds to exact", () => {
    // compressedIngress = 10000 * 1024 * 0.5 = 5_120_000
    // target = 5_120_000 => ceil(1) = 1
    const r = analyzeCapacity(makeInput({ perPartitionTargetThroughput: 5120000 }));
    assert.ok(r.ok);
    assert.equal(r.result.partitions.minimumPartitionsFromTarget, 1);
  });

  test("non-exact division rounds up", () => {
    // compressedIngress = 5_120_000, target = 3_000_000
    // ceil(5_120_000 / 3_000_000) = ceil(1.707) = 2
    const r = analyzeCapacity(makeInput({ perPartitionTargetThroughput: 3000000 }));
    assert.ok(r.ok);
    assert.equal(r.result.partitions.minimumPartitionsFromTarget, 2);
  });
});

// ─── Zero Consumer Groups ───────────────────────────────────────────────────

describe("zero consumer groups", () => {
  test("zero groups produce zero consumer read traffic", () => {
    const r = analyzeCapacity(makeInput({ fullReadConsumerGroupCount: 0 }));
    assert.ok(r.ok);
    assert.equal(r.result.network.consumerReadBytesPerSec, 0);
    // Total = ingress + replication only
    assert.equal(
      r.result.network.totalClusterNetworkBytesPerSec,
      r.result.network.compressedIngressBytesPerSec + r.result.network.followerReplicationBytesPerSec,
    );
  });
});

// ─── Average vs N-1 Pass/Fail ───────────────────────────────────────────────

describe("average vs N-1 pass/fail", () => {
  test("average pass, N-1 fail => status=fail", () => {
    // Use small storage so N-1 overflows it
    const r = analyzeCapacity(makeInput({
      brokerCount: 3,
      replicationFactor: 3,
      // Physical retained = 10000*1024*604800*0.5*3 = 9_289_728_000_000
      // Per broker avg = 9_289_728_000_000 / 3 = 3_096_576_000_000
      // Per broker N-1 = 9_289_728_000_000 / 2 = 4_644_864_000_000
      perBrokerStorageBytes: 4_000_000_000_000, // avg fits, N-1 doesn't
    }));
    assert.ok(r.ok);
    assert.equal(r.result.averageLoad.storageShortfall, false);
    assert.ok(r.result.n1Load);
    assert.equal(r.result.n1Load.storageShortfall, true);
    assert.equal(r.result.status, "fail");
    // Should have average-only-misleading warning
    assert.ok(r.result.warnings.some(w => w.id === "average-only-misleading"));
  });

  test("both pass with headroom => status=pass", () => {
    const r = analyzeCapacity(makeInput({
      perBrokerStorageBytes: 10_000_000_000_000, // 10 TiB
      perBrokerNetworkBytesPerSec: 1_000_000_000, // 1 GB/s
    }));
    assert.ok(r.ok);
    assert.equal(r.result.status, "pass");
    assert.equal(r.result.averageLoad.storageShortfall, false);
    assert.equal(r.result.averageLoad.networkShortfall, false);
  });

  test("average fails => status=fail regardless of N-1", () => {
    const r = analyzeCapacity(makeInput({
      perBrokerStorageBytes: 100_000, // way too small
    }));
    assert.ok(r.ok);
    assert.equal(r.result.averageLoad.storageShortfall, true);
    assert.equal(r.result.status, "fail");
  });
});

// ─── Storage/Network Shortfalls ─────────────────────────────────────────────

describe("storage/network shortfalls", () => {
  test("network shortfall produces critical warning", () => {
    const r = analyzeCapacity(makeInput({
      perBrokerNetworkBytesPerSec: 1000, // way too little
    }));
    assert.ok(r.ok);
    assert.equal(r.result.averageLoad.networkShortfall, true);
    assert.ok(r.result.warnings.some(w => w.id === "avg-network-shortfall" && w.severity === "critical"));
  });

  test("N-1 network shortfall", () => {
    // compressedIngress = 10000 * 1024 * 0.5 = 5_120_000
    // totalNetwork = 5_120_000 * (1+2+2) = 25_600_000
    // Per broker N-1 (4 brokers) = 25_600_000/4 = 6_400_000
    // Set just above avg but below N-1
    const r = analyzeCapacity(makeInput({
      perBrokerNetworkBytesPerSec: 5_500_000, // avg=5_120_000 fits, N-1=6_400_000 doesn't
    }));
    assert.ok(r.ok);
    assert.equal(r.result.averageLoad.networkShortfall, false);
    assert.ok(r.result.n1Load);
    assert.equal(r.result.n1Load.networkShortfall, true);
  });
});

// ─── Skew/Hot Warning ───────────────────────────────────────────────────────

describe("skew/hot partition warning", () => {
  test("skewFactor=1.0 produces info warning about balanced assumption", () => {
    const r = analyzeCapacity(makeInput({ skewFactor: 1.0 }));
    assert.ok(r.ok);
    assert.ok(r.result.warnings.some(w => w.id === "skew-not-modeled" && w.severity === "info"));
  });

  test("high skew factor triggers warning when hottest exceeds target", () => {
    // avg throughput = 5_120_000 / 30 = 170_666.67
    // with skew=10, hottest = 1_706_667 > target of 1_048_576
    const r = analyzeCapacity(makeInput({ skewFactor: 10 }));
    assert.ok(r.ok);
    assert.ok(r.result.partitions.hottestPartitionExceedsTarget);
    assert.ok(r.result.warnings.some(w => w.id === "skew-hot-partition"));
  });

  test("moderate skew doesn't trigger when under target", () => {
    // avg throughput = 170_666.67, skew=2 => 341_333.33, target=1_048_576
    const r = analyzeCapacity(makeInput({ skewFactor: 2 }));
    assert.ok(r.ok);
    assert.equal(r.result.partitions.hottestPartitionExceedsTarget, false);
    assert.ok(!r.result.warnings.some(w => w.id === "skew-hot-partition"));
  });
});

// ─── Unit Conversion/Overflow ───────────────────────────────────────────────

describe("unit conversion/overflow", () => {
  test("retention overflow is caught", () => {
    const r = analyzeCapacity(makeInput({
      peakIngressRate: 1e12,
      avgRecordSizeBytes: 1e6,
      retentionSeconds: 1e10,
      replicationFactor: 3,
      brokerCount: 3,
    }));
    assert.ok(!r.ok);
    assert.ok(r.issues.some(i => i.kind === "retention-overflow"));
  });

  test("safe retention does not flag overflow", () => {
    const r = analyzeCapacity(makeInput());
    assert.ok(r.ok);
  });
});

// ─── Malformed Unknown Input Never Throws ───────────────────────────────────

describe("malformed unknown input never throws", () => {
  const malformedInputs: [string, unknown][] = [
    ["null", null],
    ["undefined", undefined],
    ["number", 42],
    ["string", "hello"],
    ["boolean", true],
    ["array", [1, 2, 3]],
    ["empty object", {}],
    ["nested null fields", { peakIngressRate: null, brokerCount: "abc" }],
    ["NaN fields", { peakIngressRate: NaN, avgRecordSizeBytes: Infinity }],
    ["partial input", { peakIngressRate: 1000 }],
    ["wrong types", {
      peakIngressRate: "ten",
      avgRecordSizeBytes: true,
      compressionRatio: [],
      retentionSeconds: {},
      replicationFactor: "3",
      partitionCount: null,
      brokerCount: undefined,
      fullReadConsumerGroupCount: 1.5,
      perPartitionTargetThroughput: NaN,
      perBrokerStorageBytes: Infinity,
      perBrokerNetworkBytesPerSec: -Infinity,
    }],
  ];

  for (const [label, input] of malformedInputs) {
    test(`handles ${label} without throwing`, () => {
      const r = analyzeCapacity(input);
      assert.ok(!r.ok);
      assert.ok(r.issues.length > 0);
    });
  }
});

// ─── Deterministic Results ──────────────────────────────────────────────────

describe("deterministic results", () => {
  test("same input produces identical results", () => {
    const input = makeInput();
    const r1 = analyzeCapacity(input);
    const r2 = analyzeCapacity(input);
    assert.ok(r1.ok && r2.ok);

    // Compare all computed fields
    assert.deepEqual(r1.result.storage, r2.result.storage);
    assert.deepEqual(r1.result.network, r2.result.network);
    assert.deepEqual(r1.result.partitions, r2.result.partitions);
    assert.deepEqual(r1.result.averageLoad, r2.result.averageLoad);
    assert.deepEqual(r1.result.n1Load, r2.result.n1Load);
    assert.equal(r1.result.status, r2.result.status);
    assert.deepEqual(r1.result.warnings, r2.result.warnings);
    assert.deepEqual(r1.result.assumptions, r2.result.assumptions);
  });
});

// ─── Exports/Redaction/No NaN ───────────────────────────────────────────────

describe("exports/redaction/no NaN", () => {
  test("Markdown export produces valid content", () => {
    const r = analyzeCapacity(makeInput());
    assert.ok(r.ok);
    const md = exportCapacityMarkdown(r.result);
    assert.ok(md.content.includes("# Capacity and N-1 Headroom Report"));
    assert.ok(md.content.includes("Generated:"));
    assert.ok(md.content.includes("Storage"));
    assert.ok(md.content.includes("Network"));
    assert.ok(md.content.includes("Broker Load"));
    assert.ok(md.content.includes("Observability"));
    assert.equal(typeof md.redactionSummary, "string");
    assert.equal(typeof md.redactedCount, "number");
  });

  test("JSON export produces valid JSON with no NaN/Infinity", () => {
    const r = analyzeCapacity(makeInput());
    assert.ok(r.ok);
    const json = exportCapacityJson(r.result);
    const content = json.content;

    // Must be valid JSON
    const parsed = JSON.parse(content);
    assert.ok(parsed.generatedAt);
    assert.equal(parsed.status, r.result.status);

    // No NaN or Infinity in output
    assert.ok(!content.includes("NaN"));
    assert.ok(!content.includes("Infinity"));
  });

  test("Markdown export has no NaN/Infinity", () => {
    const r = analyzeCapacity(makeInput());
    assert.ok(r.ok);
    const md = exportCapacityMarkdown(r.result);
    assert.ok(!md.content.includes("NaN"));
    assert.ok(!md.content.includes("Infinity"));
  });

  test("redactCapacityLabel passes through redaction", () => {
    const clean = redactCapacityLabel("my-topic-0");
    assert.equal(typeof clean, "string");
    // Normal labels should pass through unchanged
    assert.equal(clean, "my-topic-0");
  });
});

// ─── Observability Caveats/No Universal Thresholds ──────────────────────────

describe("observability caveats/no universal thresholds", () => {
  test("every recommendation has a caveat with 'do not' guidance", () => {
    const r = analyzeCapacity(makeInput());
    assert.ok(r.ok);
    assert.ok(r.result.recommendations.length > 0);
    for (const rec of r.result.recommendations) {
      assert.ok(rec.metric.length > 0, `Recommendation missing metric`);
      assert.ok(rec.description.length > 0, `Recommendation missing description`);
      assert.ok(rec.rationale.length > 0, `Recommendation missing rationale`);
      assert.ok(rec.caveat.length > 0, `Recommendation missing caveat`);
      // Caveat should contain "do not" guidance
      assert.ok(
        rec.caveat.toLowerCase().includes("do not"),
        `Caveat for "${rec.metric}" should contain "do not" guidance but got: "${rec.caveat}"`,
      );
    }
  });

  test("no universal fixed thresholds in recommendations", () => {
    const r = analyzeCapacity(makeInput());
    assert.ok(r.ok);
    for (const rec of r.result.recommendations) {
      // Should not contain universal fixed alert thresholds like "alert at 80%"
      assert.ok(
        !rec.caveat.match(/alert (?:at|above|when|if) \d+%/i),
        `Recommendation "${rec.metric}" caveat should not contain universal fixed thresholds`,
      );
      assert.doesNotMatch(
        rec.caveat,
        /[<>]\s*\d+\s*(?:ms|s|sec|seconds?|min|minutes?|hours?)|\d+\s*-\s*\d+\s*(?:min|minutes?|hours?)/i,
        `Recommendation "${rec.metric}" caveat should not contain universal duration examples`,
      );
    }
  });
});

// ─── Resource Link Integrity ────────────────────────────────────────────────

describe("resource link integrity", () => {
  test("all resource links have valid structure", () => {
    const r = analyzeCapacity(makeInput());
    assert.ok(r.ok);
    assert.ok(r.result.resourceLinks.length > 0);
    for (const rl of r.result.resourceLinks) {
      assert.ok(rl.label.length > 0, "Resource link missing label");
      assert.ok(rl.href.startsWith("/"), `Resource link href should start with / but got: ${rl.href}`);
      assert.ok(
        ["learn", "runbooks", "errors", "simulate", "diagnose", "workbench"].includes(rl.surface),
        `Invalid surface: ${rl.surface}`,
      );
    }
  });

  test("resource links use shipped route slugs", () => {
    const hrefs = new Set(RESOURCE_LINKS.map((link) => link.href));
    assert.ok(hrefs.has("/runbooks/broker-wont-restart"));
    assert.ok(hrefs.has("/learn/isr-and-acks"));
    assert.ok(!hrefs.has("/runbooks/broker-restart"));
    assert.ok(!hrefs.has("/learn/replication-deep-dive"));
  });

  test("RESOURCE_LINKS export is stable", () => {
    assert.ok(RESOURCE_LINKS.length > 0);
    for (const rl of RESOURCE_LINKS) {
      assert.ok(rl.href.startsWith("/"));
    }
  });
});

// ─── Validation Edge Cases ──────────────────────────────────────────────────

describe("validation edge cases", () => {
  test("NaN fields rejected", () => {
    const r = analyzeCapacity(makeInput({ peakIngressRate: NaN }));
    assert.ok(!r.ok);
    assert.ok(r.issues.some(i => i.kind === "non-finite-value"));
  });

  test("Infinity fields rejected", () => {
    const r = analyzeCapacity(makeInput({ avgRecordSizeBytes: Infinity }));
    assert.ok(!r.ok);
    assert.ok(r.issues.some(i => i.kind === "non-finite-value"));
  });

  test("negative values rejected", () => {
    const r = analyzeCapacity(makeInput({ peakIngressRate: -100 }));
    assert.ok(!r.ok);
    assert.ok(r.issues.some(i => i.kind === "non-positive-value"));
  });

  test("non-integer RF rejected", () => {
    const r = analyzeCapacity(makeInput({ replicationFactor: 2.5 }));
    assert.ok(!r.ok);
    assert.ok(r.issues.some(i => i.kind === "non-integer-value"));
  });

  test("non-integer partitions rejected", () => {
    const r = analyzeCapacity(makeInput({ partitionCount: 10.5 }));
    assert.ok(!r.ok);
    assert.ok(r.issues.some(i => i.kind === "non-integer-value"));
  });

  test("non-integer brokers rejected", () => {
    const r = analyzeCapacity(makeInput({ brokerCount: 3.7 }));
    assert.ok(!r.ok);
    assert.ok(r.issues.some(i => i.kind === "non-integer-value"));
  });

  test("non-integer consumer groups rejected", () => {
    const r = analyzeCapacity(makeInput({ fullReadConsumerGroupCount: 1.5 }));
    assert.ok(!r.ok);
    assert.ok(r.issues.some(i => i.kind === "non-integer-value"));
  });

  test("negative consumer groups rejected", () => {
    const r = analyzeCapacity(makeInput({ fullReadConsumerGroupCount: -1 }));
    assert.ok(!r.ok);
    assert.ok(r.issues.some(i => i.kind === "non-negative-value"));
  });

  test("RF > brokers rejected", () => {
    const r = analyzeCapacity(makeInput({ replicationFactor: 5, brokerCount: 3 }));
    assert.ok(!r.ok);
    assert.ok(r.issues.some(i => i.kind === "rf-exceeds-brokers"));
  });

  test("compression ratio 0 rejected", () => {
    const r = analyzeCapacity(makeInput({ compressionRatio: 0 }));
    assert.ok(!r.ok);
    assert.ok(r.issues.some(i => i.kind === "compression-ratio-range"));
  });

  test("compression ratio > 1 rejected", () => {
    const r = analyzeCapacity(makeInput({ compressionRatio: 1.5 }));
    assert.ok(!r.ok);
    assert.ok(r.issues.some(i => i.kind === "compression-ratio-range"));
  });

  test("safety headroom 0 rejected", () => {
    const r = analyzeCapacity(makeInput({ safetyHeadroomTarget: 0 }));
    assert.ok(!r.ok);
    assert.ok(r.issues.some(i => i.kind === "safety-headroom-range"));
  });

  test("safety headroom 1 rejected", () => {
    const r = analyzeCapacity(makeInput({ safetyHeadroomTarget: 1 }));
    assert.ok(!r.ok);
    assert.ok(r.issues.some(i => i.kind === "safety-headroom-range"));
  });

  test("skew factor < 1 rejected", () => {
    const r = analyzeCapacity(makeInput({ skewFactor: 0.5 }));
    assert.ok(!r.ok);
    assert.ok(r.issues.some(i => i.kind === "skew-factor-range"));
  });

  test("structural validation catches missing fields", () => {
    const result = validateUnknownCapacityInput({ peakIngressRate: "abc" });
    assert.ok(!result.ok);
    assert.ok(result.issues.some(i => i.kind === "invalid-field-type"));
  });

  test("structural validation catches optional field wrong type", () => {
    const result = validateUnknownCapacityInput({
      ...makeInput(),
      safetyHeadroomTarget: "high",
    });
    assert.ok(!result.ok);
    assert.ok(result.issues.some(i => i.field === "safetyHeadroomTarget"));
  });
});

// ─── Default Assumptions ────────────────────────────────────────────────────

describe("default assumptions", () => {
  test("default safety headroom target is 0.7", () => {
    assert.equal(DEFAULT_SAFETY_HEADROOM_TARGET, 0.7);
    const r = analyzeCapacity(makeInput());
    assert.ok(r.ok);
    assert.equal(r.result.assumptions.safetyHeadroomTarget, 0.7);
  });

  test("default skew factor is 1.0", () => {
    assert.equal(DEFAULT_SKEW_FACTOR, 1.0);
    const r = analyzeCapacity(makeInput());
    assert.ok(r.ok);
    assert.equal(r.result.assumptions.skewFactor, 1.0);
  });

  test("custom safety headroom is used", () => {
    const r = analyzeCapacity(makeInput({ safetyHeadroomTarget: 0.8 }));
    assert.ok(r.ok);
    assert.equal(r.result.assumptions.safetyHeadroomTarget, 0.8);
  });

  test("custom skew factor is used", () => {
    const r = analyzeCapacity(makeInput({ skewFactor: 3.0 }));
    assert.ok(r.ok);
    assert.equal(r.result.assumptions.skewFactor, 3.0);
  });
});

// ─── Status Logic ───────────────────────────────────────────────────────────

describe("status logic", () => {
  test("insufficient partitions produce warning status", () => {
    // compressedIngress = 5_120_000, target = 100_000 => need ceil(51.2) = 52 partitions
    const r = analyzeCapacity(makeInput({
      perPartitionTargetThroughput: 100000,
      partitionCount: 10,
      // Make sure storage/network are fine
      perBrokerStorageBytes: 100_000_000_000_000,
      perBrokerNetworkBytesPerSec: 100_000_000_000,
    }));
    assert.ok(r.ok);
    assert.equal(r.result.partitions.partitionCountSufficient, false);
    assert.equal(r.result.status, "warning");
  });

  test("safety target exceeded produces warning status", () => {
    // Force avg storage utilization ~75% (above 70% safety), N-1 ~94% (under 100%)
    // Physical retained = 10000 * 1024 * 604800 * 0.5 * 3 = 9_289_728_000_000
    // Avg per broker (5 brokers) = 1_857_945_600_000
    // Set per broker storage so avg utilization = 75% => storage = avgPerBroker / 0.75
    // N-1 per broker (4 brokers) = 9_289_728_000_000 / 4 = 2_322_432_000_000
    // N-1 utilization = 2_322_432_000_000 / (1_857_945_600_000 / 0.75) = 0.9375 (< 1.0)
    const physicalRetained = 10000 * 1024 * 604800 * 0.5 * 3;
    const avgPerBroker = physicalRetained / 5;
    const storage = avgPerBroker / 0.75;
    const r = analyzeCapacity(makeInput({
      perBrokerStorageBytes: storage,
      perBrokerNetworkBytesPerSec: 100_000_000_000,
    }));
    assert.ok(r.ok);
    assert.ok(r.result.averageLoad.storageExceedsSafetyTarget);
    assert.equal(r.result.averageLoad.storageShortfall, false);
    assert.ok(r.result.n1Load);
    assert.equal(r.result.n1Load.storageShortfall, false);
    assert.equal(r.result.status, "warning");
  });
});

// ─── RF=1 Warning ───────────────────────────────────────────────────────────

describe("RF=1 specific behavior", () => {
  test("RF=1 triggers critical no-redundancy warning", () => {
    const r = analyzeCapacity(makeInput({ replicationFactor: 1, brokerCount: 3 }));
    assert.ok(r.ok);
    assert.ok(r.result.warnings.some(w => w.id === "rf-one-no-redundancy" && w.severity === "critical"));
    assert.equal(r.result.status, "fail");
  });
});

// ─── Assumptions Echo ───────────────────────────────────────────────────────

describe("assumptions echo", () => {
  test("all input values echoed in assumptions", () => {
    const input = makeInput({ safetyHeadroomTarget: 0.8, skewFactor: 2.5 });
    const r = analyzeCapacity(input);
    assert.ok(r.ok);
    assert.equal(r.result.assumptions.peakIngressRate, input.peakIngressRate);
    assert.equal(r.result.assumptions.avgRecordSizeBytes, input.avgRecordSizeBytes);
    assert.equal(r.result.assumptions.compressionRatio, input.compressionRatio);
    assert.equal(r.result.assumptions.retentionSeconds, input.retentionSeconds);
    assert.equal(r.result.assumptions.replicationFactor, input.replicationFactor);
    assert.equal(r.result.assumptions.partitionCount, input.partitionCount);
    assert.equal(r.result.assumptions.brokerCount, input.brokerCount);
    assert.equal(r.result.assumptions.fullReadConsumerGroupCount, input.fullReadConsumerGroupCount);
    assert.equal(r.result.assumptions.perPartitionTargetThroughput, input.perPartitionTargetThroughput);
    assert.equal(r.result.assumptions.perBrokerStorageBytes, input.perBrokerStorageBytes);
    assert.equal(r.result.assumptions.perBrokerNetworkBytesPerSec, input.perBrokerNetworkBytesPerSec);
    assert.equal(r.result.assumptions.safetyHeadroomTarget, 0.8);
    assert.equal(r.result.assumptions.skewFactor, 2.5);
  });
});

// ─── N-1 Safety Target Warning ──────────────────────────────────────────────

describe("N-1 safety target warning", () => {
  test("average-only-warning when N-1 exceeds safety but not 100%", () => {
    // Force avg utilization ~60% (below 70% safety), N-1 ~75% (above 70% safety)
    const physicalRetained = 10000 * 1024 * 604800 * 0.5 * 3; // 9_289_728_000_000
    const avgPerBroker = physicalRetained / 5; // 1_857_945_600_000
    // avg utilization = 60% => storage = avgPerBroker / 0.60
    const storage = avgPerBroker / 0.60;
    // N-1 per broker = physicalRetained / 4 = 2_322_432_000_000
    // N-1 utilization = 2_322_432_000_000 / (avgPerBroker / 0.60) = 0.75
    const r = analyzeCapacity(makeInput({
      perBrokerStorageBytes: storage,
      perBrokerNetworkBytesPerSec: 100_000_000_000,
    }));
    assert.ok(r.ok);
    // Average should be under safety target
    assert.equal(r.result.averageLoad.storageExceedsSafetyTarget, false);
    // N-1 should exceed safety target
    assert.ok(r.result.n1Load);
    assert.equal(r.result.n1Load.storageExceedsSafetyTarget, true);
    assert.equal(r.result.n1Load.storageShortfall, false);
    // Should have average-only-warning
    assert.ok(r.result.warnings.some(w => w.id === "average-only-warning"));
  });
});
