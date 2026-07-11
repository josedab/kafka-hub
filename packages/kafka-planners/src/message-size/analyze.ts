/**
 * Message-size chain checker analysis engine.
 *
 * Deterministic: same input always produces the same result.
 * Framework-free, browser/Node compatible.
 *
 * ─── Formulas ────────────────────────────────────────────────────────────
 *
 * Required aligned limit:
 *   requiredAlignedLimit = ceil(batchSizeBytes × (1 + safetyHeadroomFraction))
 *
 *   Rounding strategy: we use Math.ceil to round up to the next whole byte.
 *   This ensures the recommended limit is always sufficient — never truncated.
 *   When safetyHeadroomFraction is 0, requiredAlignedLimit = batchSizeBytes.
 *
 * Effective acceptance limit:
 *   If topicOverride is provided:
 *     effectiveAcceptance = topicOverride.maxMessageBytes
 *   Else:
 *     effectiveAcceptance = brokerMessageMaxBytes
 *
 *   The topic `max.message.bytes` is an **override** of the broker default
 *   for that specific topic. They are NOT independent hard gates when an
 *   override exists. If no topic override is set, the broker default applies.
 *
 * Stage evaluation order (deterministic):
 *   1. record-batch-consistency:    batchSizeBytes >= recordSizeBytes
 *   2. producer-request:            batchSizeBytes <= producerMaxRequestSize      (actual)
 *                                   requiredAligned <= producerMaxRequestSize     (aligned)
 *   3. topic-or-broker-acceptance:  batchSizeBytes <= effectiveAcceptance         (actual)
 *                                   requiredAligned <= effectiveAcceptance        (aligned)
 *   4. replica-fetch:               batchSizeBytes <= replicaFetchMaxBytes        (actual)
 *                                   max(requiredAligned, effectiveAcceptance) <=  (aligned/envelope)
 *   5. consumer-partition-fetch:    similar to replica-fetch
 *   6. consumer-total-fetch:        similar, also >= per-partition target
 *
 * Zone classification (based on ACTUAL pass/fail, not headroom):
 *   - If stages 1-3 actualPass fail: "rejected" (broker won't accept)
 *   - If stages 1-3 pass but stage 4 actualPass fails: "replication-risk"
 *   - If stages 1-4 pass but stage 5 or 6 actualPass fails: "consumption-risk"
 *   - If all actualPass: "all-clear"
 *
 * Patch strategy:
 *   For producer & acceptance: max(current, requiredAligned). Never lower.
 *   For follower & consumer: max(current, requiredAligned, effectiveAcceptance).
 *     This ensures downstream settings can handle ANY batch the broker accepts.
 *   Consumer total fetch: also >= recommended per-partition fetch target.
 *
 * Alignment gaps:
 *   - headroom-gap: actual passes but aligned does not at a stage.
 *   - acceptance-envelope-gap: downstream limit < effectiveAcceptance.
 *     Any batch the broker accepts could exceed the downstream setting.
 *
 * Blob storage recommendation:
 *   Triggered when recordSizeBytes >= threshold OR batchSizeBytes >= threshold.
 *   This is a design recommendation, not a universal Kafka limit.
 *
 * ─── Kafka Fetch Progress Exception Nuance ───────────────────────────────
 *
 * Kafka's ReplicaFetcherThread and consumer fetch protocol have a progress
 * exception: when a partition has no data fetched yet, at least one complete
 * record batch is returned even if it exceeds the configured fetch size.
 * This means follower/consumer settings smaller than the batch size do NOT
 * cause an absolute inability to replicate or consume. However, relying on
 * this behavior is fragile — it causes extra round-trips, increases latency,
 * and risks under-replication under load. The planner labels undersized
 * downstream settings as "replication risk" / "consumption risk" rather than
 * absolute "not replicated" / "not consumable".
 */

import type {
  MessageSizeInput,
  MessageSizeAnalysisResult,
  MessageSizePlannerResult,
  MessageSizeStageResult,
  MessageSizeStageStatus,
  MessageSizeZone,
  MessageSizePatch,
  MessageSizePatchEntry,
  MessageSizeAlignmentGap,
  MessageSizeAnalysisAssumptions,
} from "./types";
import {
  validateUnknownMessageSizeInput,
  validateMessageSizeInput,
} from "./validate";
import {
  evaluateBlobRecommendation,
  OBSERVABILITY_RECOMMENDATIONS,
  RESOURCE_LINKS,
} from "./recommendations";

export { RESOURCE_LINKS } from "./recommendations";

// ─── Stage Evaluation ───────────────────────────────────────────────────────

function stageStatus(actualPass: boolean, alignedPass: boolean): MessageSizeStageStatus {
  if (!actualPass) return "fail";
  if (!alignedPass) return "pass-without-headroom";
  return "pass";
}

function evaluateStages(
  input: MessageSizeInput,
  requiredAligned: number,
  effectiveAcceptance: number,
  hasTopicOverride: boolean,
): MessageSizeStageResult[] {
  const stages: MessageSizeStageResult[] = [];

  // 1. Record-batch consistency (actual = aligned for this stage)
  const consistencyActualPass = input.batchSizeBytes >= input.recordSizeBytes;
  stages.push({
    stageId: "record-batch-consistency",
    label: "Record → Batch consistency",
    configuredLimitBytes: input.batchSizeBytes,
    actualRequiredBytes: input.recordSizeBytes,
    alignedRequiredBytes: input.recordSizeBytes,
    actualPass: consistencyActualPass,
    alignedPass: consistencyActualPass,
    status: stageStatus(consistencyActualPass, consistencyActualPass),
    rationale:
      `The produced record batch (${input.batchSizeBytes} B) must be ≥ the serialized record (${input.recordSizeBytes} B). ` +
      `A batch always contains at least one record plus batch-level overhead (magic byte, CRC, timestamps, producer state).`,
    // backward compat
    requiredBytes: input.recordSizeBytes,
    pass: consistencyActualPass,
  });

  // 2. Producer request
  const producerActualPass = input.batchSizeBytes <= input.producerMaxRequestSize;
  const producerAlignedPass = requiredAligned <= input.producerMaxRequestSize;
  stages.push({
    stageId: "producer-request",
    label: "Producer max.request.size",
    configuredLimitBytes: input.producerMaxRequestSize,
    actualRequiredBytes: input.batchSizeBytes,
    alignedRequiredBytes: requiredAligned,
    actualPass: producerActualPass,
    alignedPass: producerAlignedPass,
    status: stageStatus(producerActualPass, producerAlignedPass),
    rationale:
      `Actual batch (${input.batchSizeBytes} B) ${producerActualPass ? "fits" : "exceeds"} producer max.request.size (${input.producerMaxRequestSize} B). ` +
      `Aligned target with headroom (${requiredAligned} B) ${producerAlignedPass ? "fits" : "exceeds"} the limit. ` +
      `For conservative analysis, we model the worst case where a single batch dominates the request.`,
    requiredBytes: requiredAligned,
    pass: producerAlignedPass,
  });

  // 3. Topic-or-broker acceptance
  const acceptanceLabel = hasTopicOverride
    ? `Topic max.message.bytes override`
    : `Broker message.max.bytes default`;
  const acceptanceNote = hasTopicOverride
    ? `The topic-level max.message.bytes (${effectiveAcceptance} B) overrides the broker default (${input.brokerMessageMaxBytes} B) for this topic.`
    : `No topic-level override is set. The broker default message.max.bytes (${effectiveAcceptance} B) is the effective acceptance limit.`;

  const acceptanceActualPass = input.batchSizeBytes <= effectiveAcceptance;
  const acceptanceAlignedPass = requiredAligned <= effectiveAcceptance;
  stages.push({
    stageId: "topic-or-broker-acceptance",
    label: acceptanceLabel,
    configuredLimitBytes: effectiveAcceptance,
    actualRequiredBytes: input.batchSizeBytes,
    alignedRequiredBytes: requiredAligned,
    actualPass: acceptanceActualPass,
    alignedPass: acceptanceAlignedPass,
    status: stageStatus(acceptanceActualPass, acceptanceAlignedPass),
    rationale:
      `Actual batch (${input.batchSizeBytes} B) ${acceptanceActualPass ? "fits" : "exceeds"} the effective acceptance limit (${effectiveAcceptance} B). ` +
      `Aligned target (${requiredAligned} B) ${acceptanceAlignedPass ? "fits" : "exceeds"} it. ` +
      acceptanceNote,
    requiredBytes: requiredAligned,
    pass: acceptanceAlignedPass,
  });

  // 4. Replica fetch — downstream checks compare actual batch against limit
  // and the aligned/envelope target = max(requiredAligned, effectiveAcceptance)
  const replicaEnvelopeTarget = Math.max(requiredAligned, effectiveAcceptance);
  const replicaActualPass = input.batchSizeBytes <= input.replicaFetchMaxBytes;
  const replicaAlignedPass = replicaEnvelopeTarget <= input.replicaFetchMaxBytes;
  stages.push({
    stageId: "replica-fetch",
    label: "Follower replica.fetch.max.bytes",
    configuredLimitBytes: input.replicaFetchMaxBytes,
    actualRequiredBytes: input.batchSizeBytes,
    alignedRequiredBytes: replicaEnvelopeTarget,
    actualPass: replicaActualPass,
    alignedPass: replicaAlignedPass,
    status: stageStatus(replicaActualPass, replicaAlignedPass),
    rationale:
      `Actual batch (${input.batchSizeBytes} B) ${replicaActualPass ? "fits" : "exceeds"} follower replica.fetch.max.bytes (${input.replicaFetchMaxBytes} B). ` +
      `Envelope target (max of aligned ${requiredAligned} B and effective acceptance ${effectiveAcceptance} B = ${replicaEnvelopeTarget} B) ${replicaAlignedPass ? "fits" : "exceeds"} the limit. ` +
      `Kafka's ReplicaFetcherThread has a progress exception that returns at least one batch even if oversized, ` +
      `but relying on this causes extra round-trips and risks under-replication under load. ` +
      `Aligning fetch limits avoids depending on this behavior.`,
    requiredBytes: replicaEnvelopeTarget,
    pass: replicaAlignedPass,
  });

  // 5. Consumer partition fetch
  const consumerPartEnvelopeTarget = Math.max(requiredAligned, effectiveAcceptance);
  const consumerPartActualPass = input.batchSizeBytes <= input.consumerMaxPartitionFetchBytes;
  const consumerPartAlignedPass = consumerPartEnvelopeTarget <= input.consumerMaxPartitionFetchBytes;
  stages.push({
    stageId: "consumer-partition-fetch",
    label: "Consumer max.partition.fetch.bytes",
    configuredLimitBytes: input.consumerMaxPartitionFetchBytes,
    actualRequiredBytes: input.batchSizeBytes,
    alignedRequiredBytes: consumerPartEnvelopeTarget,
    actualPass: consumerPartActualPass,
    alignedPass: consumerPartAlignedPass,
    status: stageStatus(consumerPartActualPass, consumerPartAlignedPass),
    rationale:
      `Actual batch (${input.batchSizeBytes} B) ${consumerPartActualPass ? "fits" : "exceeds"} consumer max.partition.fetch.bytes (${input.consumerMaxPartitionFetchBytes} B). ` +
      `Envelope target (${consumerPartEnvelopeTarget} B) ${consumerPartAlignedPass ? "fits" : "exceeds"} it. ` +
      `Kafka consumers have a similar progress exception for first-batch fetches, ` +
      `but undersized settings cause extra round-trips and increased latency.`,
    requiredBytes: consumerPartEnvelopeTarget,
    pass: consumerPartAlignedPass,
  });

  // 6. Consumer total fetch — must also >= per-partition target
  const consumerTotalEnvelopeTarget = Math.max(
    requiredAligned,
    effectiveAcceptance,
    input.consumerMaxPartitionFetchBytes,
  );
  const consumerTotalActualPass = input.batchSizeBytes <= input.consumerFetchMaxBytes;
  const consumerTotalAlignedPass = consumerTotalEnvelopeTarget <= input.consumerFetchMaxBytes;
  stages.push({
    stageId: "consumer-total-fetch",
    label: "Consumer fetch.max.bytes",
    configuredLimitBytes: input.consumerFetchMaxBytes,
    actualRequiredBytes: input.batchSizeBytes,
    alignedRequiredBytes: consumerTotalEnvelopeTarget,
    actualPass: consumerTotalActualPass,
    alignedPass: consumerTotalAlignedPass,
    status: stageStatus(consumerTotalActualPass, consumerTotalAlignedPass),
    rationale:
      `Actual batch (${input.batchSizeBytes} B) ${consumerTotalActualPass ? "fits" : "exceeds"} consumer fetch.max.bytes (${input.consumerFetchMaxBytes} B). ` +
      `Envelope target (${consumerTotalEnvelopeTarget} B), including the configured per-partition fetch limit, ${consumerTotalAlignedPass ? "fits" : "exceeds"} it. ` +
      `This is the overall cap on total bytes per fetch response across all partitions. ` +
      `Even when max.partition.fetch.bytes is adequate, a low fetch.max.bytes can limit throughput.`,
    requiredBytes: consumerTotalEnvelopeTarget,
    pass: consumerTotalAlignedPass,
  });

  return stages;
}

// ─── Zone Classification ────────────────────────────────────────────────────

function classifyZone(stages: readonly MessageSizeStageResult[]): { zone: MessageSizeZone; explanation: string } {
  const byId = new Map(stages.map((s) => [s.stageId, s]));

  const consistency = byId.get("record-batch-consistency")!;
  const producer = byId.get("producer-request")!;
  const acceptance = byId.get("topic-or-broker-acceptance")!;
  const replica = byId.get("replica-fetch")!;
  const consumerPartition = byId.get("consumer-partition-fetch")!;
  const consumerTotal = byId.get("consumer-total-fetch")!;

  // Rejected: stages 1-3 actual fail — hard gate
  if (!consistency.actualPass || !producer.actualPass || !acceptance.actualPass) {
    return {
      zone: "rejected",
      explanation:
        "The producer or broker will reject the message. " +
        "The batch fails a hard gate before reaching followers or consumers. " +
        "Fix the failing stage(s) before addressing downstream alignment.",
    };
  }

  // Replication risk: actual batch fits broker but exceeds follower fetch
  if (!replica.actualPass) {
    return {
      zone: "replication-risk",
      explanation:
        "The broker accepts the batch, but follower replicas have fetch settings smaller than the batch. " +
        "Kafka's ReplicaFetcherThread has a progress exception that can return an oversized first batch, " +
        "so replication can still occur — but relying on this behavior risks under-replication under load " +
        "and causes extra round-trips. Align replica.fetch.max.bytes to avoid depending on progress exceptions.",
    };
  }

  // Consumption risk: actual batch fits replica but exceeds consumer settings
  if (!consumerPartition.actualPass || !consumerTotal.actualPass) {
    return {
      zone: "consumption-risk",
      explanation:
        "The broker accepts the batch and followers can replicate it, " +
        "but consumer fetch settings are smaller than the batch. " +
        "Kafka consumers have a similar progress exception for first-batch fetches, " +
        "so consumption can still occur — but undersized settings cause extra round-trips, " +
        "increased latency, and fragile behavior. Align consumer fetch settings to avoid " +
        "depending on progress exceptions.",
    };
  }

  return {
    zone: "all-clear",
    explanation:
      "All stages pass for the actual batch size. " +
      (stages.some(s => s.status === "pass-without-headroom")
        ? "Some stages lack the recommended safety headroom — see alignment gaps for details. "
        : "") +
      "Producer, broker, followers, and consumers are aligned for this batch size.",
  };
}

// ─── Alignment Gaps ─────────────────────────────────────────────────────────

function computeAlignmentGaps(
  stages: readonly MessageSizeStageResult[],
  effectiveAcceptance: number,
): MessageSizeAlignmentGap[] {
  const gaps: MessageSizeAlignmentGap[] = [];

  for (const stage of stages) {
    // Skip record-batch-consistency (no headroom concept)
    if (stage.stageId === "record-batch-consistency") continue;

    // Headroom gap: actual passes but aligned does not
    if (stage.actualPass && !stage.alignedPass) {
      gaps.push({
        stageId: stage.stageId,
        label: stage.label,
        reason: "headroom-gap",
        configuredLimitBytes: stage.configuredLimitBytes,
        targetBytes: stage.alignedRequiredBytes,
        explanation:
          `${stage.label}: the actual batch fits (${stage.actualRequiredBytes} B ≤ ${stage.configuredLimitBytes} B) ` +
          `but the recommended headroom/envelope target (${stage.alignedRequiredBytes} B) exceeds the configured limit. ` +
          `Kafka will not reject this batch, but the safety margin is not met.`,
      });
    }

    // Acceptance-envelope gap for downstream stages
    const isDownstream = ["replica-fetch", "consumer-partition-fetch", "consumer-total-fetch"].includes(stage.stageId);
    if (isDownstream && stage.actualPass && stage.configuredLimitBytes < effectiveAcceptance) {
      gaps.push({
        stageId: stage.stageId,
        label: stage.label,
        reason: "acceptance-envelope-gap",
        configuredLimitBytes: stage.configuredLimitBytes,
        targetBytes: effectiveAcceptance,
        explanation:
          `${stage.label}: configured at ${stage.configuredLimitBytes} B but the effective acceptance limit is ${effectiveAcceptance} B. ` +
          `The topic/broker can accept batches larger than this downstream component is configured for. ` +
          `While Kafka's fetch progress exception can return an oversized first batch, ` +
          `aligning downstream settings to at least the acceptance limit avoids relying on this behavior.`,
      });
    }
  }

  return gaps;
}

// ─── Patch Generation ───────────────────────────────────────────────────────

function patchTargetReason(
  rec: number,
  current: number,
  requiredAligned: number,
  envelopeTarget: number,
): "headroom" | "acceptance-envelope" | "both" | "none" {
  if (rec <= current) return "none";
  const needsHeadroom = requiredAligned > current;
  const needsEnvelope = envelopeTarget > current && envelopeTarget > requiredAligned;
  if (needsHeadroom && needsEnvelope) return "both";
  if (needsEnvelope) return "acceptance-envelope";
  if (needsHeadroom) return "headroom";
  return "headroom"; // default when rec > current
}

function generatePatch(
  input: MessageSizeInput,
  requiredAligned: number,
  effectiveAcceptance: number,
  hasTopicOverride: boolean,
): MessageSizePatch {
  const entries: MessageSizePatchEntry[] = [];

  // Producer max.request.size — target is requiredAligned (headroom only)
  const producerRec = Math.max(input.producerMaxRequestSize, requiredAligned);
  entries.push({
    property: "max.request.size",
    scope: "producer",
    recommendedBytes: producerRec,
    currentBytes: input.producerMaxRequestSize,
    changed: producerRec > input.producerMaxRequestSize,
    targetReason: patchTargetReason(producerRec, input.producerMaxRequestSize, requiredAligned, requiredAligned),
    note: "Producer-side limit on the total produce request size. Target: headroom alignment.",
  });

  // Topic max.message.bytes (only if override modeled)
  if (hasTopicOverride) {
    const topicCurrent = input.topicOverride!.maxMessageBytes;
    const topicRec = Math.max(topicCurrent, requiredAligned);
    entries.push({
      property: "max.message.bytes",
      scope: "topic",
      recommendedBytes: topicRec,
      currentBytes: topicCurrent,
      changed: topicRec > topicCurrent,
      targetReason: patchTargetReason(topicRec, topicCurrent, requiredAligned, requiredAligned),
      note: "Topic-level override. Target: headroom alignment for this topic.",
    });
  }

  // Broker message.max.bytes — target is requiredAligned
  const brokerRec = Math.max(input.brokerMessageMaxBytes, requiredAligned);
  entries.push({
    property: "message.max.bytes",
    scope: "broker",
    recommendedBytes: brokerRec,
    currentBytes: input.brokerMessageMaxBytes,
    changed: brokerRec > input.brokerMessageMaxBytes,
    targetReason: patchTargetReason(brokerRec, input.brokerMessageMaxBytes, requiredAligned, requiredAligned),
    note: "Broker default. Only affects topics without an explicit max.message.bytes override. Target: headroom alignment.",
  });

  // Downstream: target = max(requiredAligned, effectiveAcceptance)
  const downstreamTarget = Math.max(requiredAligned, effectiveAcceptance);

  // Follower replica.fetch.max.bytes
  const replicaRec = Math.max(input.replicaFetchMaxBytes, downstreamTarget);
  entries.push({
    property: "replica.fetch.max.bytes",
    scope: "follower",
    recommendedBytes: replicaRec,
    currentBytes: input.replicaFetchMaxBytes,
    changed: replicaRec > input.replicaFetchMaxBytes,
    targetReason: patchTargetReason(replicaRec, input.replicaFetchMaxBytes, requiredAligned, downstreamTarget),
    note: `Follower fetch size. Target: max(headroom ${requiredAligned}, acceptance ${effectiveAcceptance}) = ${downstreamTarget} B to handle any accepted batch.`,
  });

  // Consumer max.partition.fetch.bytes
  const consumerPartRec = Math.max(input.consumerMaxPartitionFetchBytes, downstreamTarget);
  entries.push({
    property: "max.partition.fetch.bytes",
    scope: "consumer",
    recommendedBytes: consumerPartRec,
    currentBytes: input.consumerMaxPartitionFetchBytes,
    changed: consumerPartRec > input.consumerMaxPartitionFetchBytes,
    targetReason: patchTargetReason(consumerPartRec, input.consumerMaxPartitionFetchBytes, requiredAligned, downstreamTarget),
    note: `Per-partition consumer fetch size. Target: max(headroom, acceptance) = ${downstreamTarget} B.`,
  });

  // Consumer fetch.max.bytes — also must be >= per-partition target
  const consumerTotalTarget = Math.max(downstreamTarget, consumerPartRec);
  const consumerTotalRec = Math.max(input.consumerFetchMaxBytes, consumerTotalTarget);
  entries.push({
    property: "fetch.max.bytes",
    scope: "consumer",
    recommendedBytes: consumerTotalRec,
    currentBytes: input.consumerFetchMaxBytes,
    changed: consumerTotalRec > input.consumerFetchMaxBytes,
    targetReason: patchTargetReason(consumerTotalRec, input.consumerFetchMaxBytes, requiredAligned, consumerTotalTarget),
    note: `Total consumer fetch size across all partitions. Must be ≥ per-partition fetch target (${consumerPartRec} B).`,
  });

  // Render snippet
  const snippetLines: string[] = [];
  snippetLines.push("# ─── Message Size Alignment Patch ───");
  snippetLines.push(`# Required aligned limit: ${requiredAligned} bytes`);
  snippetLines.push(`# Effective acceptance: ${effectiveAcceptance} bytes`);
  snippetLines.push(`# Downstream envelope target: max(aligned, acceptance) = ${downstreamTarget} bytes`);
  snippetLines.push(`# Strategy: max(current, target) — never lowers existing values`);
  snippetLines.push("");

  const grouped: Record<string, MessageSizePatchEntry[]> = {};
  for (const entry of entries) {
    const key = entry.scope;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(entry);
  }

  const scopeOrder: Array<"producer" | "topic" | "broker" | "follower" | "consumer"> =
    ["producer", "topic", "broker", "follower", "consumer"];

  const scopeLabels: Record<string, string> = {
    producer: "Producer (client config)",
    topic: "Topic (topic-level override)",
    broker: "Broker (server config — default for topics without override)",
    follower: "Follower (server config)",
    consumer: "Consumer (client config)",
  };

  for (const scope of scopeOrder) {
    const scopeEntries = grouped[scope];
    if (!scopeEntries) continue;
    snippetLines.push(`# ${scopeLabels[scope]}`);
    for (const entry of scopeEntries) {
      const changeMarker = entry.changed
        ? ` # ← CHANGED (${entry.targetReason})`
        : " # unchanged";
      snippetLines.push(`${entry.property}=${entry.recommendedBytes}${changeMarker}`);
    }
    snippetLines.push("");
  }

  const explanation =
    `Patch generated with required aligned limit = ceil(${input.batchSizeBytes} × (1 + ${input.safetyHeadroomFraction})) = ${requiredAligned} bytes. ` +
    `Effective acceptance = ${effectiveAcceptance} bytes. ` +
    `Upstream (producer, acceptance): target = requiredAligned. ` +
    `Downstream (follower, consumer): target = max(requiredAligned, effectiveAcceptance) = ${downstreamTarget} bytes, ` +
    `so any batch the broker accepts fits within the downstream envelope. ` +
    `Consumer fetch.max.bytes is also ≥ the per-partition target. ` +
    `Existing larger values are preserved — this patch never recommends lowering a value. ` +
    (hasTopicOverride
      ? `A topic-level max.message.bytes override is included. The broker message.max.bytes default only affects topics without explicit overrides.`
      : `No topic-level override is modeled. The broker message.max.bytes default applies to all topics.`);

  return {
    entries,
    snippet: snippetLines.join("\n"),
    explanation,
  };
}

// ─── Main Analysis ──────────────────────────────────────────────────────────

/**
 * Analyse message size alignment across the Kafka pipeline.
 *
 * Accepts `unknown` at runtime. Returns either a successful analysis
 * result or typed validation issues. Never throws.
 */
export function analyzeMessageSize(input: unknown): MessageSizePlannerResult {
  // Structural validation
  const structural = validateUnknownMessageSizeInput(input);
  if (!structural.ok) return { ok: false, issues: structural.issues };

  // Semantic validation
  const semanticIssues = validateMessageSizeInput(structural.input);
  if (semanticIssues.length > 0) return { ok: false, issues: semanticIssues };

  const typedInput = structural.input;
  const hasTopicOverride = typedInput.topicOverride !== undefined && typedInput.topicOverride !== null;
  const effectiveAcceptance = hasTopicOverride
    ? typedInput.topicOverride!.maxMessageBytes
    : typedInput.brokerMessageMaxBytes;

  // Required aligned limit = ceil(batchSize × (1 + headroom))
  const requiredAligned = Math.ceil(typedInput.batchSizeBytes * (1 + typedInput.safetyHeadroomFraction));

  // Stage evaluation
  const stages = evaluateStages(typedInput, requiredAligned, effectiveAcceptance, hasTopicOverride);

  // First actual (hard) failure
  const firstFailure = stages.find((s) => !s.actualPass) ?? null;

  // Zone classification (based on actual pass/fail)
  const { zone, explanation: zoneExplanation } = classifyZone(stages);

  // Alignment gaps
  const alignmentGaps = computeAlignmentGaps(stages, effectiveAcceptance);
  const firstAlignmentGap = alignmentGaps.length > 0 ? alignmentGaps[0] : null;

  // Patch
  const patch = generatePatch(typedInput, requiredAligned, effectiveAcceptance, hasTopicOverride);

  // Blob recommendation
  const blobRecommendation = evaluateBlobRecommendation(typedInput);

  // Assumptions
  const assumptions: MessageSizeAnalysisAssumptions = {
    recordSizeBytes: typedInput.recordSizeBytes,
    batchSizeBytes: typedInput.batchSizeBytes,
    producerMaxRequestSize: typedInput.producerMaxRequestSize,
    brokerMessageMaxBytes: typedInput.brokerMessageMaxBytes,
    topicOverrideMaxMessageBytes: hasTopicOverride ? typedInput.topicOverride!.maxMessageBytes : null,
    effectiveAcceptanceLimitBytes: effectiveAcceptance,
    replicaFetchMaxBytes: typedInput.replicaFetchMaxBytes,
    consumerMaxPartitionFetchBytes: typedInput.consumerMaxPartitionFetchBytes,
    consumerFetchMaxBytes: typedInput.consumerFetchMaxBytes,
    safetyHeadroomFraction: typedInput.safetyHeadroomFraction,
    requiredAlignedLimitBytes: requiredAligned,
    blobStorageThresholdBytes: typedInput.blobStorageThresholdBytes,
  };

  const result: MessageSizeAnalysisResult = {
    stages,
    firstFailure,
    firstAlignmentGap,
    alignmentGaps,
    zone,
    zoneExplanation,
    patch,
    blobRecommendation,
    observability: OBSERVABILITY_RECOMMENDATIONS,
    resourceLinks: RESOURCE_LINKS,
    assumptions,
  };

  return { ok: true, result };
}
