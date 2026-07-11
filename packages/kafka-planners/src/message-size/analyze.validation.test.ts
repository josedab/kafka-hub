import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeMessageSize,
  makeInput,
} from "./analyze.test-support";

// ─── Non-Integer Record/Batch Validation ────────────────────────────────────

describe("non-integer record/batch validation", () => {
  test("non-integer recordSizeBytes rejected", () => {
    const r = analyzeMessageSize(makeInput({ recordSizeBytes: 1000.5 }));
    assert.equal(r.ok, false);
    assert.ok(r.issues.some(i => i.kind === "non-integer-value" && i.field === "recordSizeBytes"));
  });

  test("non-integer batchSizeBytes rejected", () => {
    const r = analyzeMessageSize(makeInput({ batchSizeBytes: 1100.7 }));
    assert.equal(r.ok, false);
    assert.ok(r.issues.some(i => i.kind === "non-integer-value" && i.field === "batchSizeBytes"));
  });

  test("integer recordSizeBytes accepted", () => {
    const r = analyzeMessageSize(makeInput({ recordSizeBytes: 1000 }));
    assert.ok(r.ok);
  });

  test("integer batchSizeBytes accepted", () => {
    const r = analyzeMessageSize(makeInput({ batchSizeBytes: 1100 }));
    assert.ok(r.ok);
  });
});

// ─── Blob Threshold Exact Boundary ──────────────────────────────────────────

describe("blob threshold exact boundary", () => {
  test("record at threshold triggers recommendation", () => {
    const input = makeInput({
      recordSizeBytes: 1_048_576,
      batchSizeBytes: 1_048_600,
      blobStorageThresholdBytes: 1_048_576,
      producerMaxRequestSize: 5_000_000,
      brokerMessageMaxBytes: 5_000_000,
      replicaFetchMaxBytes: 5_000_000,
      consumerMaxPartitionFetchBytes: 5_000_000,
      consumerFetchMaxBytes: 50_000_000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.blobRecommendation.recommended, true);
    assert.ok(r.result.blobRecommendation.trigger === "both" || r.result.blobRecommendation.trigger === "record");
  });

  test("record 1 byte below threshold — no recommendation if batch also below", () => {
    const input = makeInput({
      recordSizeBytes: 1_048_575,
      batchSizeBytes: 1_048_575,
      blobStorageThresholdBytes: 1_048_576,
      producerMaxRequestSize: 5_000_000,
      brokerMessageMaxBytes: 5_000_000,
      replicaFetchMaxBytes: 5_000_000,
      consumerMaxPartitionFetchBytes: 5_000_000,
      consumerFetchMaxBytes: 50_000_000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.blobRecommendation.recommended, false);
    assert.equal(r.result.blobRecommendation.trigger, "none");
  });

  test("batch at threshold triggers even when record is below", () => {
    const input = makeInput({
      recordSizeBytes: 500_000,
      batchSizeBytes: 1_048_576,
      blobStorageThresholdBytes: 1_048_576,
      producerMaxRequestSize: 5_000_000,
      brokerMessageMaxBytes: 5_000_000,
      replicaFetchMaxBytes: 5_000_000,
      consumerMaxPartitionFetchBytes: 5_000_000,
      consumerFetchMaxBytes: 50_000_000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.blobRecommendation.recommended, true);
    assert.equal(r.result.blobRecommendation.trigger, "batch");
  });

  test("custom blob threshold respected", () => {
    const input = makeInput({
      recordSizeBytes: 500,
      batchSizeBytes: 600,
      blobStorageThresholdBytes: 100_000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.equal(r.result.blobRecommendation.recommended, false);
    assert.equal(r.result.blobRecommendation.thresholdBytes, 100_000);
  });

  test("blob guidance is a design recommendation label", () => {
    const input = makeInput({
      recordSizeBytes: 2_000_000,
      batchSizeBytes: 2_100_000,
      producerMaxRequestSize: 5_000_000,
      brokerMessageMaxBytes: 5_000_000,
      replicaFetchMaxBytes: 5_000_000,
      consumerMaxPartitionFetchBytes: 5_000_000,
      consumerFetchMaxBytes: 50_000_000,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
    assert.ok(r.result.blobRecommendation.guidance.includes("design recommendation"));
  });
});

// ─── Malformed Unknown Never Throws ─────────────────────────────────────────

describe("malformed unknown never throws", () => {
  test("null input returns issues, no throw", () => {
    const r = analyzeMessageSize(null);
    assert.equal(r.ok, false);
    assert.ok(r.issues.length > 0);
    assert.equal(r.issues[0].kind, "invalid-root");
  });

  test("undefined input returns issues", () => {
    const r = analyzeMessageSize(undefined);
    assert.equal(r.ok, false);
  });

  test("string input returns issues", () => {
    const r = analyzeMessageSize("hello");
    assert.equal(r.ok, false);
  });

  test("array input returns issues", () => {
    const r = analyzeMessageSize([1, 2, 3]);
    assert.equal(r.ok, false);
  });

  test("empty object returns field issues", () => {
    const r = analyzeMessageSize({});
    assert.equal(r.ok, false);
    assert.ok(r.issues.length > 0);
    assert.ok(r.issues.some(i => i.kind === "invalid-field-type"));
  });

  test("wrong field types return issues", () => {
    const r = analyzeMessageSize({
      recordSizeBytes: "not a number",
      batchSizeBytes: true,
      producerMaxRequestSize: null,
    });
    assert.equal(r.ok, false);
    assert.ok(r.issues.length >= 3);
  });

  test("NaN values caught", () => {
    const r = analyzeMessageSize(makeInput({ recordSizeBytes: NaN }));
    assert.equal(r.ok, false);
    assert.ok(r.issues.some(i => i.kind === "non-finite-value"));
  });

  test("Infinity values caught", () => {
    const r = analyzeMessageSize(makeInput({ batchSizeBytes: Infinity }));
    assert.equal(r.ok, false);
    assert.ok(r.issues.some(i => i.kind === "non-finite-value"));
  });

  test("negative values caught", () => {
    const r = analyzeMessageSize(makeInput({ recordSizeBytes: -100 }));
    assert.equal(r.ok, false);
    assert.ok(r.issues.some(i => i.kind === "non-positive-value"));
  });

  test("zero values caught", () => {
    const r = analyzeMessageSize(makeInput({ recordSizeBytes: 0 }));
    assert.equal(r.ok, false);
    assert.ok(r.issues.some(i => i.kind === "non-positive-value"));
  });

  test("non-integer config byte fields caught", () => {
    const r = analyzeMessageSize(makeInput({ producerMaxRequestSize: 1000.5 }));
    assert.equal(r.ok, false);
    assert.ok(r.issues.some(i => i.kind === "non-integer-value"));
  });

  test("batch < record caught", () => {
    const r = analyzeMessageSize(makeInput({ recordSizeBytes: 2000, batchSizeBytes: 1000 }));
    assert.equal(r.ok, false);
    assert.ok(r.issues.some(i => i.kind === "batch-smaller-than-record"));
  });

  test("headroom=0 is now valid", () => {
    const r = analyzeMessageSize(makeInput({ safetyHeadroomFraction: 0 }));
    assert.ok(r.ok, "headroom=0 should be valid");
  });

  test("invalid headroom caught (1)", () => {
    const r = analyzeMessageSize(makeInput({ safetyHeadroomFraction: 1 }));
    assert.equal(r.ok, false);
    assert.ok(r.issues.some(i => i.kind === "invalid-headroom"));
  });

  test("invalid headroom caught (> 1)", () => {
    const r = analyzeMessageSize(makeInput({ safetyHeadroomFraction: 1.5 }));
    assert.equal(r.ok, false);
    assert.ok(r.issues.some(i => i.kind === "invalid-headroom"));
  });

  test("invalid headroom caught (negative)", () => {
    const r = analyzeMessageSize(makeInput({ safetyHeadroomFraction: -0.1 }));
    assert.equal(r.ok, false);
    assert.ok(r.issues.some(i => i.kind === "invalid-headroom"));
  });

  test("invalid topic override shape caught (array)", () => {
    const r = analyzeMessageSize({ ...makeInput(), topicOverride: [1, 2] });
    assert.equal(r.ok, false);
    assert.ok(r.issues.some(i => i.kind === "invalid-topic-override"));
  });

  test("invalid topic override shape caught (missing maxMessageBytes)", () => {
    const r = analyzeMessageSize({ ...makeInput(), topicOverride: {} });
    assert.equal(r.ok, false);
    assert.ok(r.issues.some(i => i.kind === "invalid-topic-override"));
  });

  test("invalid topic override maxMessageBytes type", () => {
    const r = analyzeMessageSize({ ...makeInput(), topicOverride: { maxMessageBytes: "big" } });
    assert.equal(r.ok, false);
    assert.ok(r.issues.some(i => i.kind === "invalid-topic-override"));
  });
});

// ─── Blank Topic Override (domain-level) ────────────────────────────────────

describe("blank topic override domain behavior", () => {
  test("topicOverride with maxMessageBytes=0 returns validation issue", () => {
    const r = analyzeMessageSize({
      ...makeInput(),
      topicOverride: { maxMessageBytes: 0 },
    });
    assert.equal(r.ok, false);
    assert.ok(r.issues.some(i => i.field === "topicOverride.maxMessageBytes" && i.kind === "non-positive-value"));
  });

  test("topicOverride with maxMessageBytes=NaN returns validation issue", () => {
    const r = analyzeMessageSize({
      ...makeInput(),
      topicOverride: { maxMessageBytes: NaN },
    });
    assert.equal(r.ok, false);
    assert.ok(r.issues.some(i => i.field === "topicOverride.maxMessageBytes"));
  });

  test("topicOverride with non-integer maxMessageBytes returns issue", () => {
    const r = analyzeMessageSize({
      ...makeInput(),
      topicOverride: { maxMessageBytes: 1000.5 },
    });
    assert.equal(r.ok, false);
    assert.ok(r.issues.some(i => i.kind === "non-integer-value" && i.field === "topicOverride.maxMessageBytes"));
  });
});

// ─── Overflow ───────────────────────────────────────────────────────────────

describe("overflow", () => {
  test("unsafe-number-overflow for values > MAX_SAFE_INTEGER", () => {
    const r = analyzeMessageSize(makeInput({ producerMaxRequestSize: Number.MAX_SAFE_INTEGER + 1 }));
    assert.equal(r.ok, false);
    assert.ok(r.issues.some(i => i.kind === "unsafe-number-overflow"));
  });

  test("MAX_SAFE_INTEGER exactly is accepted", () => {
    const input = makeInput({
      producerMaxRequestSize: Number.MAX_SAFE_INTEGER,
      brokerMessageMaxBytes: Number.MAX_SAFE_INTEGER,
      replicaFetchMaxBytes: Number.MAX_SAFE_INTEGER,
      consumerMaxPartitionFetchBytes: Number.MAX_SAFE_INTEGER,
      consumerFetchMaxBytes: Number.MAX_SAFE_INTEGER,
      blobStorageThresholdBytes: Number.MAX_SAFE_INTEGER,
    });
    const r = analyzeMessageSize(input);
    assert.ok(r.ok);
  });
});

