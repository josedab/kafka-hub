import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { OBSERVABILITY_RECOMMENDATIONS } from "@kafka-hub/kafka-diagnose";
import { SIGNATURES } from "@kafka-hub/incident-parser";
import { analyzeLag } from "@kafka-hub/kafka-planners/lag";
import { analyzeCapacity } from "@kafka-hub/kafka-planners/capacity";
import { analyzeKRaft } from "@kafka-hub/kafka-planners/kraft";
import { analyzeDr } from "@kafka-hub/kafka-planners/dr";

interface NormalizedRecommendation {
  metric: string;
  context: string;
  rationale: string;
  caveat: string;
}

function plannerRecommendations(): Record<string, NormalizedRecommendation[]> {
  const lag = analyzeLag({
    snapshotBefore: {
      partitions: [
        { partitionId: "orders-0", committedOffset: 100, currentOffset: 100, logEndOffset: 200 },
        { partitionId: "orders-1", committedOffset: 100, currentOffset: 100, logEndOffset: 200 },
      ],
      groupState: "stable",
    },
    snapshotAfter: {
      partitions: [
        { partitionId: "orders-0", committedOffset: 130, currentOffset: 135, logEndOffset: 260 },
        { partitionId: "orders-1", committedOffset: 130, currentOffset: 135, logEndOffset: 260 },
      ],
      groupState: "stable",
    },
    intervalSeconds: 60,
  });
  assert.ok(lag.ok);

  const capacity = analyzeCapacity({
    peakIngressRate: 10_000,
    avgRecordSizeBytes: 1024,
    compressionRatio: 0.5,
    retentionSeconds: 86_400,
    replicationFactor: 3,
    partitionCount: 24,
    brokerCount: 5,
    fullReadConsumerGroupCount: 2,
    perPartitionTargetThroughput: 1_048_576,
    perBrokerStorageBytes: 10_000_000_000_000,
    perBrokerNetworkBytesPerSec: 1_000_000_000,
  });
  assert.ok(capacity.ok);

  const kraft = analyzeKRaft({
    kafkaVersion: "3.9.2",
    metadataMode: "zookeeper",
    vendor: "apache",
    controllerCount: 3,
    controllerNodeIds: [1, 2, 3],
    brokerNodeIds: [4, 5, 6],
    controllerListenerNames: ["CONTROLLER"],
    quorumMode: "dynamic",
    quorumVoters: [],
    bootstrapServers: [
      { host: "ctrl1.example.net", port: 9093 },
      { host: "ctrl2.example.net", port: 9093 },
      { host: "ctrl3.example.net", port: 9093 },
    ],
    interBrokerConfigPresent: true,
    controllerConfigPresent: true,
    aclHealth: "healthy",
    logDirHealth: "healthy",
    failedLogDirCount: 0,
    migrationPhase: "preflight-zookeeper",
    production: true,
  });
  assert.ok(kraft.ok);

  const dr = analyzeDr({
    replicationLagSeconds: 10,
    checkpointIntervalSeconds: 60,
    incidentDetectionSeconds: 30,
    promotionSeconds: 30,
    dnsTtlSeconds: 60,
    clientReconnectSeconds: 20,
    validationSeconds: 60,
    duplicateToleranceSeconds: 120,
    strategy: "generic",
  });
  assert.ok(dr.ok);

  const normalize = (
    recommendations: readonly {
      metric: string;
      description: string;
      rationale: string;
      caveat: string;
    }[],
  ): NormalizedRecommendation[] =>
    recommendations.map((recommendation) => ({
      metric: recommendation.metric,
      context: recommendation.description,
      rationale: recommendation.rationale,
      caveat: recommendation.caveat,
    }));

  return {
    diagnose: Object.values(OBSERVABILITY_RECOMMENDATIONS)
      .flat()
      .map((recommendation) => ({
        metric: recommendation.metric,
        context: `${recommendation.description} ${recommendation.baseline}`,
        rationale: recommendation.rationale,
        caveat: recommendation.caveat,
      })),
    incident: normalize(SIGNATURES.flatMap((signature) => signature.observability)),
    lag: normalize(lag.result.recommendations),
    capacity: normalize(capacity.result.recommendations),
    kraft: normalize(kraft.result.observability),
    dr: normalize(dr.result.observability),
  };
}

describe("integrated observability recommendations", () => {
  const surfaces = plannerRecommendations();
  const all = Object.values(surfaces).flat();

  test("every required result surface includes recommendations", () => {
    for (const [surface, recommendations] of Object.entries(surfaces)) {
      assert.ok(recommendations.length > 0, `${surface}: no recommendations`);
    }
  });

  test("every recommendation has context, rationale, and explicit caveat guidance", () => {
    for (const recommendation of all) {
      assert.ok(recommendation.metric.trim());
      assert.ok(recommendation.context.trim());
      assert.ok(recommendation.rationale.trim());
      assert.match(
        recommendation.caveat,
        /do not|not sufficient alone|correlate|baseline|workload|slo|expected|alone/i,
        `${recommendation.metric}: weak caveat`,
      );
      assert.doesNotMatch(
        recommendation.caveat,
        /[<>]\s*\d+\s*(?:ms|s|sec|seconds?|min|minutes?|hours?)|\d+\s*-\s*\d+\s*(?:ms|s|sec|minutes?|hours?)/i,
        `${recommendation.metric}: universal numeric threshold in caveat`,
      );
    }
  });

  test("combined recommendations cover every requested operational signal", () => {
    const haystack = all
      .map((recommendation) =>
        `${recommendation.metric} ${recommendation.context} ${recommendation.rationale}`.toLowerCase(),
      )
      .join("\n");
    const signals = [
      ["offline partitions", /offline.?partitions?/],
      ["under-min-ISR", /under.?min.?isr/],
      ["under-replicated partitions", /under.?replicated/],
      ["disk/log-directory health", /disk|log director/],
      ["controller/quorum", /controller|quorum|raft/],
      ["request errors", /request.*error|errorspersec|record-error/],
      ["request latency", /request.*latency|totaltimems|latency/],
      ["lag growth", /lag.?delta|lag growth|records-lag/],
    ] as const;

    for (const [name, pattern] of signals) {
      assert.match(haystack, pattern, `missing observability coverage: ${name}`);
    }
  });
});
