import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  acknowledgeShareRecord,
  acquireShareRecord,
  advanceRagFreshness,
  advanceShareTime,
  createRagFreshnessState,
  createSharePoolState,
  deleteRagSource,
  evaluateModelCanary,
  isRagIndexStale,
  processShareRecord,
  ragStaleWindow,
  recommendAiProtocolComposition,
  reembedRagSource,
  releaseShareRecord,
  simulateSideEffectReplay,
  updateRagSource,
} from "./ai-demo-helpers";

describe("ShareGroupWorkerPool helpers", () => {
  it("redelivers a released record and increments delivery count", () => {
    const initial = createSharePoolState();
    const acquired = acquireShareRecord(initial, "worker-1");
    const released = releaseShareRecord(acquired, "worker-1");
    const redelivered = acquireShareRecord(released, "worker-2");

    assert.equal(redelivered.records[0].state, "locked");
    assert.equal(redelivered.records[0].lockedBy, "worker-2");
    assert.equal(redelivered.records[0].deliveryCount, 2);
  });

  it("expires a lock and allows a later worker to acknowledge the record", () => {
    const acquired = acquireShareRecord(createSharePoolState(), "worker-1");
    const expired = advanceShareTime(acquired);
    const reacquired = acquireShareRecord(expired, "worker-2");
    const acknowledged = acknowledgeShareRecord(reacquired, "worker-2");

    assert.equal(acknowledged.records[0].state, "acked");
    assert.equal(acknowledged.records[0].deliveryCount, 2);
  });

  it("makes poison processing explicit before release or rejection", () => {
    let state = createSharePoolState();
    for (const worker of ["worker-1", "worker-2", "worker-3", "worker-4"]) {
      state = acquireShareRecord(state, worker);
    }

    const processed = processShareRecord(state, "worker-4");

    assert.match(processed.event, /validation failed/i);
    assert.equal(
      processed.records.find((record) => record.id === "poison-404")?.state,
      "locked",
    );
  });
});

describe("SideEffectReplayLab helpers", () => {
  it("shows duplicate external executions for a naive crash after an effect", () => {
    const replay = simulateSideEffectReplay(
      "after-effect-before-result",
      "naive",
    );

    assert.equal(replay.modelExecutions, 2);
    assert.equal(replay.toolExecutions, 2);
    assert.equal(replay.resultReused, false);
  });

  it("only deduplicates an honored idempotency-key endpoint", () => {
    const replay = simulateSideEffectReplay(
      "after-effect-before-result",
      "idempotency-key",
    );

    assert.equal(replay.modelRequests, 2);
    assert.equal(replay.modelExecutions, 1);
    assert.equal(replay.resultReused, true);
  });

  it("uses a durable result only after the result was written", () => {
    const replay = simulateSideEffectReplay(
      "after-result-before-commit",
      "durable-result",
    );

    assert.equal(replay.modelExecutions, 1);
    assert.equal(replay.resultReused, true);
  });
});

describe("RagFreshnessLab helpers", () => {
  it("keeps a source update stale until embedding latency elapses", () => {
    const updated = updateRagSource(createRagFreshnessState());
    assert.equal(isRagIndexStale(updated), true);
    assert.equal(ragStaleWindow(updated), 3);

    const partial = advanceRagFreshness(updated, 2);
    assert.equal(isRagIndexStale(partial), true);

    const indexed = advanceRagFreshness(partial);
    assert.equal(isRagIndexStale(indexed), false);
    assert.equal(indexed.primary.version, 2);
  });

  it("propagates a tombstone and builds a separate candidate index", () => {
    const deleted = deleteRagSource(createRagFreshnessState());
    const tombstoned = advanceRagFreshness(deleted, 3);
    assert.equal(tombstoned.primary.deleted, true);

    const backfill = reembedRagSource(createRagFreshnessState(), "embed-v2");
    const candidate = advanceRagFreshness(backfill, 3);
    assert.equal(candidate.candidate?.modelVersion, "embed-v2");
    assert.equal(candidate.candidate?.version, 1);
  });
});

describe("AiProtocolDecisionLab helpers", () => {
  it("composes Kafka, MCP, A2A, and a direct API from distinct requirements", () => {
    const recommendations = recommendAiProtocolComposition({
      needsReplay: true,
      needsToolDiscovery: true,
      needsCrossAgentLongTask: true,
      needsFanout: true,
      needsRequestResponse: true,
    });

    assert.deepEqual(
      recommendations.map((recommendation) => recommendation.name),
      ["Kafka", "MCP", "A2A", "Direct API"],
    );
  });
});

describe("ModelCanaryReplayLab helpers", () => {
  it("approves a candidate that meets quality and cost/latency guardrails", () => {
    const result = evaluateModelCanary({
      baselineQuality: 0.82,
      candidateQuality: 0.86,
      baselineCost: 1,
      candidateCost: 1.05,
      baselineLatency: 800,
      candidateLatency: 850,
      minimumQuality: 0.84,
      maximumCostIncrease: 10,
      maximumLatencyIncrease: 10,
    });

    assert.equal(result.decision, "rollout");
  });

  it("holds a candidate that regresses latency despite quality gains", () => {
    const result = evaluateModelCanary({
      baselineQuality: 0.82,
      candidateQuality: 0.88,
      baselineCost: 1,
      candidateCost: 1.03,
      baselineLatency: 800,
      candidateLatency: 1_100,
      minimumQuality: 0.84,
      maximumCostIncrease: 10,
      maximumLatencyIncrease: 10,
    });

    assert.equal(result.decision, "hold");
    assert.equal(result.latencyPasses, false);
  });
});
