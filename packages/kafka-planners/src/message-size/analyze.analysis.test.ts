import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeMessageSize,
  DEFAULT_SAFETY_HEADROOM_FRACTION,
  DEFAULT_BLOB_STORAGE_THRESHOLD_BYTES,
  makeInput,
} from "./analyze.test-support";

// ─── Default Constants ──────────────────────────────────────────────────────

describe("default constants", () => {
  test("DEFAULT_SAFETY_HEADROOM_FRACTION is 0.10", () => {
    assert.equal(DEFAULT_SAFETY_HEADROOM_FRACTION, 0.10);
  });

  test("DEFAULT_BLOB_STORAGE_THRESHOLD_BYTES is 1 MiB", () => {
    assert.equal(DEFAULT_BLOB_STORAGE_THRESHOLD_BYTES, 1_048_576);
  });
});

// ─── Actual vs Aligned Separation ───────────────────────────────────────────

describe("actual vs aligned separation", () => {
  test("stage result includes actual and aligned fields", () => {
    const input = makeInput();
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    for (const stage of r.result.stages) {
      assert.ok("actualRequiredBytes" in stage, `${stage.stageId} should have actualRequiredBytes`);
      assert.ok("alignedRequiredBytes" in stage, `${stage.stageId} should have alignedRequiredBytes`);
      assert.ok("actualPass" in stage, `${stage.stageId} should have actualPass`);
      assert.ok("alignedPass" in stage, `${stage.stageId} should have alignedPass`);
      assert.ok("status" in stage, `${stage.stageId} should have status`);
    }
  });

  test("actual batch pass with headroom gap gives pass-without-headroom status", () => {
    // batch=1000, headroom=10% → aligned=1100
    // Producer limit=1050: actual (1000) fits, aligned (1100) does not
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
    const producer = r.result.stages.find(s => s.stageId === "producer-request")!;
    assert.equal(producer.actualPass, true, "actual batch fits");
    assert.equal(producer.alignedPass, false, "aligned does not fit");
    assert.equal(producer.status, "pass-without-headroom");
    // Zone should NOT be "rejected" because the actual batch fits
    assert.notEqual(r.result.zone, "rejected", "zone must not be rejected when actual fits");
  });

  test("actual batch fails gives fail status and rejected zone", () => {
    // batch=1000, producer limit=500: actual does not fit
    const input = makeInput({
      batchSizeBytes: 1000,
      producerMaxRequestSize: 500,
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 2000,
      consumerMaxPartitionFetchBytes: 2000,
      consumerFetchMaxBytes: 2000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    const producer = r.result.stages.find(s => s.stageId === "producer-request")!;
    assert.equal(producer.actualPass, false);
    assert.equal(producer.status, "fail");
    assert.equal(r.result.zone, "rejected");
  });

  test("both actual and aligned pass gives pass status", () => {
    const input = makeInput({
      batchSizeBytes: 1000,
      producerMaxRequestSize: 5000,
      brokerMessageMaxBytes: 5000,
      replicaFetchMaxBytes: 5000,
      consumerMaxPartitionFetchBytes: 5000,
      consumerFetchMaxBytes: 50000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    for (const stage of r.result.stages) {
      assert.equal(stage.status, "pass", `${stage.stageId} should be pass`);
    }
  });
});

// ─── Zone Based on Actual Pass ──────────────────────────────────────────────

describe("zone based on actual pass", () => {
  test("zone is all-clear when actual passes everywhere even if aligned does not", () => {
    // batch=1000, headroom=10% → aligned=1100
    // All limits=1050: actual fits, aligned does not
    const input = makeInput({
      batchSizeBytes: 1000,
      producerMaxRequestSize: 1050,
      brokerMessageMaxBytes: 1050,
      replicaFetchMaxBytes: 1050,
      consumerMaxPartitionFetchBytes: 1050,
      consumerFetchMaxBytes: 1050,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.zone, "all-clear", "zone should be all-clear based on actual pass");
    assert.equal(r.result.firstFailure, null, "no hard failure");
    assert.ok(r.result.alignmentGaps.length > 0, "should have alignment gaps");
  });

  test("zone is rejected only when actual batch exceeds acceptance", () => {
    const input = makeInput({
      batchSizeBytes: 2000,
      producerMaxRequestSize: 5000,
      brokerMessageMaxBytes: 1500, // actual 2000 > 1500
      replicaFetchMaxBytes: 5000,
      consumerMaxPartitionFetchBytes: 5000,
      consumerFetchMaxBytes: 50000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.zone, "rejected");
    assert.equal(r.result.firstFailure!.stageId, "topic-or-broker-acceptance");
    assert.equal(r.result.firstFailure!.actualPass, false);
  });

  test("zone is replication-risk when replica actual fails (not absolute 'not replicated')", () => {
    // batch=1000, replica=500: actual batch > replica limit
    const input = makeInput({
      batchSizeBytes: 1000,
      producerMaxRequestSize: 2000,
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 500, // actual 1000 > 500
      consumerMaxPartitionFetchBytes: 2000,
      consumerFetchMaxBytes: 2000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.zone, "replication-risk");
    assert.ok(r.result.zoneExplanation.includes("progress exception"),
      "explanation should mention progress exception");
    assert.ok(r.result.zoneExplanation.includes("can still occur"),
      "should say replication can still occur");
  });

  test("zone is consumption-risk when consumer actual fails (not absolute)", () => {
    const input = makeInput({
      batchSizeBytes: 1000,
      producerMaxRequestSize: 2000,
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 2000,
      consumerMaxPartitionFetchBytes: 500,
      consumerFetchMaxBytes: 2000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.zone, "consumption-risk");
    assert.ok(r.result.zoneExplanation.includes("progress exception"));
  });
});

// ─── firstFailure and firstAlignmentGap ─────────────────────────────────────

describe("firstFailure and firstAlignmentGap", () => {
  test("firstFailure is based on actualPass, not alignedPass", () => {
    // batch=1000, headroom=10% → aligned=1100
    // Producer=1050: actual fits (no failure), aligned doesn't (gap)
    // Broker=900: actual 1000 > 900 (hard failure)
    const input = makeInput({
      batchSizeBytes: 1000,
      producerMaxRequestSize: 1050,
      brokerMessageMaxBytes: 900,
      replicaFetchMaxBytes: 2000,
      consumerMaxPartitionFetchBytes: 2000,
      consumerFetchMaxBytes: 2000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.firstFailure!.stageId, "topic-or-broker-acceptance");
    assert.equal(r.result.firstFailure!.actualPass, false);
  });

  test("firstAlignmentGap for headroom gap", () => {
    // batch=1000, headroom=10% → aligned=1100
    // All limits=1050: actual fits, aligned doesn't
    const input = makeInput({
      batchSizeBytes: 1000,
      producerMaxRequestSize: 1050,
      brokerMessageMaxBytes: 1050,
      replicaFetchMaxBytes: 2000,
      consumerMaxPartitionFetchBytes: 2000,
      consumerFetchMaxBytes: 2000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.notEqual(r.result.firstAlignmentGap, null);
    assert.equal(r.result.firstAlignmentGap!.stageId, "producer-request");
    assert.equal(r.result.firstAlignmentGap!.reason, "headroom-gap");
  });

  test("firstAlignmentGap ordering follows stage chain order", () => {
    // batch=1000, headroom=10% → aligned=1100
    // All upstream=2000 (pass). Replica=1050 (actual pass, aligned gap)
    const input = makeInput({
      batchSizeBytes: 1000,
      producerMaxRequestSize: 2000,
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 1050,
      consumerMaxPartitionFetchBytes: 1050,
      consumerFetchMaxBytes: 1050,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.notEqual(r.result.firstAlignmentGap, null);
    // replica-fetch should be the first gap since it comes before consumer stages
    assert.equal(r.result.firstAlignmentGap!.stageId, "replica-fetch");
  });

  test("no firstAlignmentGap when everything is fully aligned", () => {
    const input = makeInput({
      producerMaxRequestSize: 5000,
      brokerMessageMaxBytes: 5000,
      replicaFetchMaxBytes: 5000,
      consumerMaxPartitionFetchBytes: 5000,
      consumerFetchMaxBytes: 50000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.firstAlignmentGap, null);
    assert.equal(r.result.alignmentGaps.length, 0);
  });
});

// ─── Downstream Envelope Gap ────────────────────────────────────────────────

describe("downstream envelope gap", () => {
  test("acceptance-envelope-gap when replica < effectiveAcceptance but actual fits", () => {
    // batch=500, acceptance=2000, replica=1000
    // Actual 500 fits replica 1000, but replica 1000 < acceptance 2000
    const input = makeInput({
      recordSizeBytes: 400,
      batchSizeBytes: 500,
      producerMaxRequestSize: 5000,
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 1000,
      consumerMaxPartitionFetchBytes: 5000,
      consumerFetchMaxBytes: 50000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    const envelopeGaps = r.result.alignmentGaps.filter(g => g.reason === "acceptance-envelope-gap");
    assert.ok(envelopeGaps.length > 0, "should have acceptance-envelope-gap");
    assert.ok(envelopeGaps.some(g => g.stageId === "replica-fetch"));
    assert.ok(envelopeGaps[0].explanation.includes("larger than this downstream"));
  });

  test("consumer partition and total also get envelope gaps", () => {
    // batch=500, acceptance=2000, consumer settings=1000
    const input = makeInput({
      recordSizeBytes: 400,
      batchSizeBytes: 500,
      producerMaxRequestSize: 5000,
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 1000,
      consumerMaxPartitionFetchBytes: 1000,
      consumerFetchMaxBytes: 1000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    const envelopeGaps = r.result.alignmentGaps.filter(g => g.reason === "acceptance-envelope-gap");
    assert.ok(envelopeGaps.length >= 3, "replica, consumer-partition, consumer-total should all have gaps");
  });

  test("no envelope gap when downstream >= acceptance", () => {
    const input = makeInput({
      recordSizeBytes: 400,
      batchSizeBytes: 500,
      producerMaxRequestSize: 5000,
      brokerMessageMaxBytes: 1000,
      replicaFetchMaxBytes: 2000, // > acceptance 1000
      consumerMaxPartitionFetchBytes: 2000,
      consumerFetchMaxBytes: 50000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    const envelopeGaps = r.result.alignmentGaps.filter(g => g.reason === "acceptance-envelope-gap");
    assert.equal(envelopeGaps.length, 0);
  });
});

// ─── Downstream Patch Target = max(aligned, acceptance) ─────────────────────

describe("downstream patch target", () => {
  test("follower patch target is max(requiredAligned, effectiveAcceptance)", () => {
    // batch=500, headroom=10% → aligned=550. acceptance=2000
    // Downstream target should be max(550, 2000) = 2000
    const input = makeInput({
      recordSizeBytes: 400,
      batchSizeBytes: 500,
      safetyHeadroomFraction: 0.10,
      producerMaxRequestSize: 5000,
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 100, // undersized
      consumerMaxPartitionFetchBytes: 100,
      consumerFetchMaxBytes: 100,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    const replicaPatch = r.result.patch.entries.find(e => e.property === "replica.fetch.max.bytes")!;
    assert.equal(replicaPatch.recommendedBytes, 2000, "should be max(aligned 550, acceptance 2000)");
  });

  test("consumer partition fetch patch target = max(aligned, acceptance)", () => {
    const input = makeInput({
      recordSizeBytes: 400,
      batchSizeBytes: 500,
      safetyHeadroomFraction: 0.10,
      producerMaxRequestSize: 5000,
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 100,
      consumerMaxPartitionFetchBytes: 100,
      consumerFetchMaxBytes: 100,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    const consumerPartPatch = r.result.patch.entries.find(e => e.property === "max.partition.fetch.bytes")!;
    assert.equal(consumerPartPatch.recommendedBytes, 2000);
  });

  test("consumer total fetch patch >= per-partition target", () => {
    const input = makeInput({
      recordSizeBytes: 400,
      batchSizeBytes: 500,
      safetyHeadroomFraction: 0.10,
      producerMaxRequestSize: 5000,
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 5000,
      consumerMaxPartitionFetchBytes: 100,
      consumerFetchMaxBytes: 100,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    const consumerPartPatch = r.result.patch.entries.find(e => e.property === "max.partition.fetch.bytes")!;
    const consumerTotalPatch = r.result.patch.entries.find(e => e.property === "fetch.max.bytes")!;
    assert.ok(consumerTotalPatch.recommendedBytes >= consumerPartPatch.recommendedBytes,
      "total fetch should be >= per-partition");
  });

  test("upstream patch target is requiredAligned only (not acceptance-envelope)", () => {
    // batch=500, headroom=10% → aligned=550, acceptance=2000
    // Producer patch target should be 550, not 2000
    const input = makeInput({
      recordSizeBytes: 400,
      batchSizeBytes: 500,
      safetyHeadroomFraction: 0.10,
      producerMaxRequestSize: 100,
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 5000,
      consumerMaxPartitionFetchBytes: 5000,
      consumerFetchMaxBytes: 50000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    const producerPatch = r.result.patch.entries.find(e => e.property === "max.request.size")!;
    assert.equal(producerPatch.recommendedBytes, 550, "producer target should be aligned only");
  });

  test("patch entries expose targetReason", () => {
    const input = makeInput({
      recordSizeBytes: 400,
      batchSizeBytes: 500,
      safetyHeadroomFraction: 0.10,
      producerMaxRequestSize: 5000,
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 100,
      consumerMaxPartitionFetchBytes: 5000,
      consumerFetchMaxBytes: 50000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    const replicaPatch = r.result.patch.entries.find(e => e.property === "replica.fetch.max.bytes")!;
    assert.ok(["headroom", "acceptance-envelope", "both"].includes(replicaPatch.targetReason),
      `targetReason should indicate why: got ${replicaPatch.targetReason}`);
  });
});

// ─── Exact Boundary Pass/Fail ───────────────────────────────────────────────

describe("exact boundary pass/fail", () => {
  test("all stages pass when limits exactly match required aligned", () => {
    // requiredAligned = ceil(1100 * 1.10) = ceil(1210) = 1210
    const input = makeInput({
      producerMaxRequestSize: 1210,
      brokerMessageMaxBytes: 1210,
      replicaFetchMaxBytes: 1210,
      consumerMaxPartitionFetchBytes: 1210,
      consumerFetchMaxBytes: 1210,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.zone, "all-clear");
    for (const stage of r.result.stages) {
      assert.equal(stage.actualPass, true, `Stage ${stage.stageId} actualPass`);
      assert.equal(stage.alignedPass, true, `Stage ${stage.stageId} alignedPass`);
      assert.equal(stage.status, "pass", `Stage ${stage.stageId} status`);
    }
    assert.equal(r.result.firstFailure, null);
  });

  test("producer stage fails when limit is exactly 1 byte below actual batch", () => {
    const input = makeInput({
      batchSizeBytes: 1000,
      producerMaxRequestSize: 999, // actual 1000 > 999
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 2000,
      consumerMaxPartitionFetchBytes: 2000,
      consumerFetchMaxBytes: 2000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.firstFailure!.stageId, "producer-request");
    assert.equal(r.result.firstFailure!.actualPass, false);
    assert.equal(r.result.zone, "rejected");
  });

  test("batch exactly equals record is valid", () => {
    const input = makeInput({ recordSizeBytes: 500, batchSizeBytes: 500 });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    const consistency = r.result.stages.find(s => s.stageId === "record-batch-consistency")!;
    assert.equal(consistency.actualPass, true);
  });
});

// ─── Headroom and Rounding ──────────────────────────────────────────────────

describe("headroom and rounding", () => {
  test("requiredAligned uses Math.ceil rounding", () => {
    // batchSize=1001, headroom=0.10 → 1001 * 1.10 = 1101.1 → ceil = 1102
    const input = makeInput({
      batchSizeBytes: 1001,
      producerMaxRequestSize: 2000,
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 2000,
      consumerMaxPartitionFetchBytes: 2000,
      consumerFetchMaxBytes: 2000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.assumptions.requiredAlignedLimitBytes, 1102);
  });

  test("headroom exactly produces integer (no rounding needed)", () => {
    // batchSize=1000, headroom=0.10 → 1000 * 1.10 = 1100 → ceil = 1100
    const input = makeInput({
      batchSizeBytes: 1000,
      producerMaxRequestSize: 2000,
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 2000,
      consumerMaxPartitionFetchBytes: 2000,
      consumerFetchMaxBytes: 2000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.assumptions.requiredAlignedLimitBytes, 1100);
  });

  test("high headroom fraction (0.99)", () => {
    // batchSize=1000, headroom=0.99 → 1000 * 1.99 = 1990 → ceil = 1990
    const input = makeInput({
      batchSizeBytes: 1000,
      safetyHeadroomFraction: 0.99,
      producerMaxRequestSize: 2000,
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 2000,
      consumerMaxPartitionFetchBytes: 2000,
      consumerFetchMaxBytes: 2000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.assumptions.requiredAlignedLimitBytes, 1990);
  });
});

// ─── Zero Headroom ──────────────────────────────────────────────────────────

describe("zero headroom", () => {
  test("safetyHeadroomFraction=0 is valid (no headroom comparison)", () => {
    const input = makeInput({ safetyHeadroomFraction: 0 });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok, "safetyHeadroomFraction=0 should be accepted");
    // requiredAligned = ceil(1100 * 1.0) = 1100
    assert.equal(r.result.assumptions.requiredAlignedLimitBytes, 1100);
    assert.equal(r.result.assumptions.safetyHeadroomFraction, 0);
  });

  test("zero headroom means aligned equals batch size", () => {
    const input = makeInput({
      batchSizeBytes: 1000,
      safetyHeadroomFraction: 0,
      producerMaxRequestSize: 1000,
      brokerMessageMaxBytes: 1000,
      replicaFetchMaxBytes: 1000,
      consumerMaxPartitionFetchBytes: 1000,
      consumerFetchMaxBytes: 1000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.assumptions.requiredAlignedLimitBytes, 1000);
    assert.equal(r.result.zone, "all-clear");
  });

  test("zero headroom: actual and aligned should agree", () => {
    const input = makeInput({
      batchSizeBytes: 1000,
      safetyHeadroomFraction: 0,
      producerMaxRequestSize: 1000,
      brokerMessageMaxBytes: 1000,
      replicaFetchMaxBytes: 1000,
      consumerMaxPartitionFetchBytes: 1000,
      consumerFetchMaxBytes: 1000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    for (const stage of r.result.stages) {
      if (stage.stageId === "record-batch-consistency") continue;
      assert.equal(stage.actualPass, stage.alignedPass,
        `${stage.stageId}: actual and aligned should agree with 0 headroom`);
    }
  });
});

// ─── Topic Override vs Broker Default ───────────────────────────────────────

describe("topic override vs broker default semantics", () => {
  test("without topic override, broker default is effective acceptance", () => {
    const input = makeInput();
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.assumptions.topicOverrideMaxMessageBytes, null);
    assert.equal(r.result.assumptions.effectiveAcceptanceLimitBytes, input.brokerMessageMaxBytes);
  });

  test("with topic override, topic value is effective acceptance", () => {
    const input = makeInput({
      topicOverride: { maxMessageBytes: 2_000_000 },
      brokerMessageMaxBytes: 1_000_000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.assumptions.topicOverrideMaxMessageBytes, 2_000_000);
    assert.equal(r.result.assumptions.effectiveAcceptanceLimitBytes, 2_000_000);
  });

  test("topic override smaller than broker default — override still applies", () => {
    const input = makeInput({
      topicOverride: { maxMessageBytes: 500_000 },
      brokerMessageMaxBytes: 1_000_000,
      batchSizeBytes: 1100,
      safetyHeadroomFraction: 0.10,
      producerMaxRequestSize: 2_000_000,
      replicaFetchMaxBytes: 2_000_000,
      consumerMaxPartitionFetchBytes: 2_000_000,
      consumerFetchMaxBytes: 2_000_000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.assumptions.effectiveAcceptanceLimitBytes, 500_000);
    const acceptanceStage = r.result.stages.find(s => s.stageId === "topic-or-broker-acceptance")!;
    assert.equal(acceptanceStage.configuredLimitBytes, 500_000);
  });

  test("topic override causes acceptance failure when broker would pass", () => {
    // required actual = 900_000
    const input = makeInput({
      recordSizeBytes: 800_000,
      batchSizeBytes: 900_000,
      topicOverride: { maxMessageBytes: 500_000 },
      brokerMessageMaxBytes: 1_048_576,
      producerMaxRequestSize: 1_048_576,
      replicaFetchMaxBytes: 1_048_576,
      consumerMaxPartitionFetchBytes: 1_048_576,
      consumerFetchMaxBytes: 52_428_800,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.zone, "rejected");
    assert.equal(r.result.firstFailure!.stageId, "topic-or-broker-acceptance");
    assert.equal(r.result.firstFailure!.actualPass, false);
  });

  test("patch includes topic entry only when override is modeled", () => {
    const withOverride = makeInput({ topicOverride: { maxMessageBytes: 2_000_000 } });
    const r1 = analyzeMessageSize(withOverride);
    assert.ok(r1.ok);
    assert.ok(r1.result.patch.entries.some(e => e.scope === "topic"));

    const withoutOverride = makeInput();
    const r2 = analyzeMessageSize(withoutOverride);
    assert.ok(r2.ok);
    assert.ok(!r2.result.patch.entries.some(e => e.scope === "topic"));
  });
});

// ─── First-Failure Ordering ─────────────────────────────────────────────────

describe("first-failure ordering", () => {
  test("first failure is producer when both producer and broker fail", () => {
    const input = makeInput({
      batchSizeBytes: 1000,
      producerMaxRequestSize: 500,
      brokerMessageMaxBytes: 500,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.firstFailure!.stageId, "producer-request");
  });

  test("first failure is acceptance when producer passes but broker fails", () => {
    const input = makeInput({
      batchSizeBytes: 1000,
      producerMaxRequestSize: 5000,
      brokerMessageMaxBytes: 500,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.firstFailure!.stageId, "topic-or-broker-acceptance");
  });

  test("stage order is deterministic", () => {
    const input = makeInput();
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    const ids = r.result.stages.map(s => s.stageId);
    assert.deepEqual(ids, [
      "record-batch-consistency",
      "producer-request",
      "topic-or-broker-acceptance",
      "replica-fetch",
      "consumer-partition-fetch",
      "consumer-total-fetch",
    ]);
  });
});

// ─── Producer Failure Zone ──────────────────────────────────────────────────

describe("producer failure", () => {
  test("producer failure results in rejected zone", () => {
    const input = makeInput({
      batchSizeBytes: 1000,
      producerMaxRequestSize: 100,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.zone, "rejected");
  });
});

// ─── Broker/Topic Failure ───────────────────────────────────────────────────

describe("broker/topic failure", () => {
  test("broker acceptance failure results in rejected zone", () => {
    const input = makeInput({
      batchSizeBytes: 1000,
      brokerMessageMaxBytes: 100,
      producerMaxRequestSize: 5000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.zone, "rejected");
  });
});

// ─── Replication Risk ───────────────────────────────────────────────────────

describe("replication risk", () => {
  test("replication-risk when only replica fetch actual fails", () => {
    // batch=1100, aligned=1210
    const input = makeInput({
      producerMaxRequestSize: 2000,
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 500, // actual 1100 > 500
      consumerMaxPartitionFetchBytes: 2000,
      consumerFetchMaxBytes: 2000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.zone, "replication-risk");
    assert.equal(r.result.firstFailure!.stageId, "replica-fetch");
    assert.equal(r.result.firstFailure!.actualPass, false);
  });

  test("zone explanation mentions progress exception for replication risk", () => {
    const input = makeInput({
      producerMaxRequestSize: 2000,
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 500,
      consumerMaxPartitionFetchBytes: 2000,
      consumerFetchMaxBytes: 2000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.ok(r.result.zoneExplanation.toLowerCase().includes("progress exception"));
    assert.ok(!r.result.zoneExplanation.toLowerCase().includes("not replicated"));
  });
});

// ─── Consumption Risk ───────────────────────────────────────────────────────

describe("consumption risk", () => {
  test("consumer partition fetch actual failure gives consumption-risk zone", () => {
    const input = makeInput({
      producerMaxRequestSize: 2000,
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 2000,
      consumerMaxPartitionFetchBytes: 500,
      consumerFetchMaxBytes: 2000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.zone, "consumption-risk");
    assert.equal(r.result.firstFailure!.stageId, "consumer-partition-fetch");
  });

  test("consumer total fetch actual failure gives consumption-risk zone", () => {
    const input = makeInput({
      producerMaxRequestSize: 2000,
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 2000,
      consumerMaxPartitionFetchBytes: 2000,
      consumerFetchMaxBytes: 500,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.zone, "consumption-risk");
    assert.equal(r.result.firstFailure!.stageId, "consumer-total-fetch");
  });
});

// ─── fetch.max vs partition fetch ───────────────────────────────────────────

describe("fetch.max.bytes vs max.partition.fetch.bytes", () => {
  test("partition fetch passes but total fetch fails", () => {
    const input = makeInput({
      batchSizeBytes: 1000,
      producerMaxRequestSize: 2000,
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 2000,
      consumerMaxPartitionFetchBytes: 2000,
      consumerFetchMaxBytes: 500,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    const partStage = r.result.stages.find(s => s.stageId === "consumer-partition-fetch")!;
    const totalStage = r.result.stages.find(s => s.stageId === "consumer-total-fetch")!;
    assert.equal(partStage.actualPass, true);
    assert.equal(totalStage.actualPass, false);
  });

  test("total fetch passes but partition fetch fails", () => {
    const input = makeInput({
      batchSizeBytes: 1000,
      producerMaxRequestSize: 2000,
      brokerMessageMaxBytes: 2000,
      replicaFetchMaxBytes: 2000,
      consumerMaxPartitionFetchBytes: 500,
      consumerFetchMaxBytes: 50_000_000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    const partStage = r.result.stages.find(s => s.stageId === "consumer-partition-fetch")!;
    const totalStage = r.result.stages.find(s => s.stageId === "consumer-total-fetch")!;
    assert.equal(partStage.actualPass, false);
    assert.equal(totalStage.actualPass, true);
  });

  test("total fetch alignment includes a larger configured partition fetch limit", () => {
    const r = analyzeMessageSize(
      makeInput({
        batchSizeBytes: 1_000,
        brokerMessageMaxBytes: 20_000,
        consumerMaxPartitionFetchBytes: 50_000,
        consumerFetchMaxBytes: 10_000,
      }),
    );
    assert.ok(r.ok);

    const totalStage = r.result.stages.find(
      (stage) => stage.stageId === "consumer-total-fetch",
    )!;
    assert.equal(totalStage.actualPass, true);
    assert.equal(totalStage.alignedRequiredBytes, 50_000);
    assert.equal(totalStage.alignedPass, false);
    assert.ok(
      r.result.alignmentGaps.some(
        (gap) => gap.stageId === "consumer-total-fetch",
      ),
    );

    const fetchPatch = r.result.patch.entries.find(
      (entry) => entry.property === "fetch.max.bytes",
    )!;
    assert.equal(fetchPatch.recommendedBytes, 50_000);
  });
});

// ─── Preserve Larger Patch Values ───────────────────────────────────────────

describe("preserve-larger patch values", () => {
  test("patch never lowers existing values", () => {
    const input = makeInput({
      producerMaxRequestSize: 5_000_000,
      brokerMessageMaxBytes: 5_000_000,
      replicaFetchMaxBytes: 5_000_000,
      consumerMaxPartitionFetchBytes: 5_000_000,
      consumerFetchMaxBytes: 50_000_000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    for (const entry of r.result.patch.entries) {
      assert.ok(entry.recommendedBytes >= entry.currentBytes,
        `${entry.property}: recommended (${entry.recommendedBytes}) should be >= current (${entry.currentBytes})`);
    }
  });

  test("patch increases values when required is larger", () => {
    const input = makeInput({
      producerMaxRequestSize: 500,
      brokerMessageMaxBytes: 500,
      replicaFetchMaxBytes: 500,
      consumerMaxPartitionFetchBytes: 500,
      consumerFetchMaxBytes: 500,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    const changedEntries = r.result.patch.entries.filter(e => e.changed);
    assert.ok(changedEntries.length > 0, "Some entries should be changed");
    for (const entry of changedEntries) {
      assert.ok(entry.recommendedBytes > entry.currentBytes);
    }
  });

  test("unchanged entries keep current value", () => {
    const input = makeInput({
      producerMaxRequestSize: 10_000_000,
      brokerMessageMaxBytes: 10_000_000,
      replicaFetchMaxBytes: 10_000_000,
      consumerMaxPartitionFetchBytes: 10_000_000,
      consumerFetchMaxBytes: 50_000_000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    const unchangedEntries = r.result.patch.entries.filter(e => !e.changed);
    for (const entry of unchangedEntries) {
      assert.equal(entry.recommendedBytes, entry.currentBytes);
    }
  });
});

