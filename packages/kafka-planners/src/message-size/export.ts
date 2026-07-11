/**
 * Export / sanitization module for message-size analysis results.
 *
 * Produces Markdown and JSON exports with secret redaction.
 * Reuses @kafka-hub/kafka-diagnose redaction primitives.
 *
 * The result payload is deterministic. Export helpers stamp a `generatedAt`
 * timestamp at export time — the analysis result itself carries no timestamp.
 */

import type { MessageSizeAnalysisResult, MessageSizeStageResult, MessageSizeAlignmentGap } from "./types";
import { redactSecrets } from "@kafka-hub/kafka-diagnose";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MessageSizeExportResult {
  /** The exported content (Markdown or JSON string). */
  readonly content: string;
  /** Summary of what was redacted. */
  readonly redactionSummary: string;
  /** Number of strings that were redacted. */
  readonly redactedCount: number;
}

// ─── Redaction ──────────────────────────────────────────────────────────────

export function redactMessageSizeLabel(text: string): string {
  return redactSecrets(text).redacted;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  if (bytes < 1024 * 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GiB`;
  return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TiB`;
}

function safeNumber(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

function stageStatusLabel(stage: MessageSizeStageResult): string {
  switch (stage.status) {
    case "pass": return "PASS";
    case "pass-without-headroom": return "PASS (no headroom)";
    case "fail": return "FAIL";
  }
}

const ZONE_LABELS: Record<string, string> = {
  "all-clear": "All Clear",
  "replication-risk": "Replication Risk",
  "consumption-risk": "Consumption Risk",
  "rejected": "Rejected",
};

// ─── Markdown Export ────────────────────────────────────────────────────────

export function exportMessageSizeMarkdown(result: MessageSizeAnalysisResult): MessageSizeExportResult {
  const now = new Date().toISOString();
  const lines: string[] = [];

  lines.push("# Message Size Chain Checker Report");
  lines.push("");
  lines.push(`**Generated:** ${now}`);
  lines.push(`**Zone:** ${ZONE_LABELS[result.zone] ?? result.zone}`);
  lines.push("");
  lines.push(result.zoneExplanation);
  lines.push("");

  // Input assumptions
  lines.push("## Input Parameters");
  lines.push("");
  lines.push("| Parameter | Value |");
  lines.push("| --- | --- |");
  lines.push(`| Record size | ${fmtBytes(result.assumptions.recordSizeBytes)} |`);
  lines.push(`| Batch size (produced) | ${fmtBytes(result.assumptions.batchSizeBytes)} |`);
  lines.push(`| Producer max.request.size | ${fmtBytes(result.assumptions.producerMaxRequestSize)} |`);
  lines.push(`| Broker message.max.bytes | ${fmtBytes(result.assumptions.brokerMessageMaxBytes)} |`);
  if (result.assumptions.topicOverrideMaxMessageBytes !== null) {
    lines.push(`| Topic max.message.bytes (override) | ${fmtBytes(result.assumptions.topicOverrideMaxMessageBytes)} |`);
  }
  lines.push(`| Effective acceptance limit | ${fmtBytes(result.assumptions.effectiveAcceptanceLimitBytes)} |`);
  lines.push(`| Follower replica.fetch.max.bytes | ${fmtBytes(result.assumptions.replicaFetchMaxBytes)} |`);
  lines.push(`| Consumer max.partition.fetch.bytes | ${fmtBytes(result.assumptions.consumerMaxPartitionFetchBytes)} |`);
  lines.push(`| Consumer fetch.max.bytes | ${fmtBytes(result.assumptions.consumerFetchMaxBytes)} |`);
  lines.push(`| Safety headroom | ${(result.assumptions.safetyHeadroomFraction * 100).toFixed(0)}% |`);
  lines.push(`| Required aligned limit | ${fmtBytes(result.assumptions.requiredAlignedLimitBytes)} |`);
  lines.push(`| Blob storage threshold | ${fmtBytes(result.assumptions.blobStorageThresholdBytes)} |`);
  lines.push("");

  // Stages
  lines.push("## Stage Chain");
  lines.push("");
  lines.push("| # | Stage | Configured | Actual Required | Aligned Required | Status |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  result.stages.forEach((s: MessageSizeStageResult, i: number) => {
    lines.push(
      `| ${i + 1} | ${s.label} | ${fmtBytes(s.configuredLimitBytes)} | ${fmtBytes(s.actualRequiredBytes)} | ${fmtBytes(s.alignedRequiredBytes)} | ${stageStatusLabel(s)} |`,
    );
  });
  lines.push("");

  // First failure
  if (result.firstFailure) {
    lines.push("## First Hard Failure");
    lines.push("");
    lines.push(`**Stage:** ${result.firstFailure.label} (${result.firstFailure.stageId})`);
    lines.push("");
    lines.push(result.firstFailure.rationale);
    lines.push("");
  }

  // First alignment gap
  if (result.firstAlignmentGap) {
    lines.push("## First Alignment Gap");
    lines.push("");
    lines.push(`**Stage:** ${result.firstAlignmentGap.label} (${result.firstAlignmentGap.stageId})`);
    lines.push(`**Reason:** ${result.firstAlignmentGap.reason}`);
    lines.push("");
    lines.push(result.firstAlignmentGap.explanation);
    lines.push("");
  }

  // All alignment gaps
  if (result.alignmentGaps.length > 0) {
    lines.push("## Alignment Gaps");
    lines.push("");
    for (const gap of result.alignmentGaps) {
      lines.push(`### ${gap.label} — ${gap.reason}`);
      lines.push("");
      lines.push(gap.explanation);
      lines.push("");
    }
  }

  // Patch
  lines.push("## Aligned Configuration Patch");
  lines.push("");
  lines.push(result.patch.explanation);
  lines.push("");
  lines.push("```properties");
  lines.push(result.patch.snippet);
  lines.push("```");
  lines.push("");

  // Blob recommendation
  lines.push("## Blob Storage Recommendation");
  lines.push("");
  lines.push(result.blobRecommendation.guidance);
  lines.push("");

  // Observability
  lines.push("## Observability Recommendations");
  lines.push("");
  for (const rec of result.observability) {
    lines.push(`### ${rec.metric}`);
    lines.push("");
    lines.push(rec.description);
    lines.push("");
    lines.push(`**Rationale:** ${rec.rationale}`);
    lines.push("");
    lines.push(`**Caveat:** ${rec.caveat}`);
    lines.push("");
  }

  // Resource links
  if (result.resourceLinks.length > 0) {
    lines.push("## Related Resources");
    lines.push("");
    for (const rl of result.resourceLinks) {
      lines.push(`- [${rl.label}](${rl.href})`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("Generated by @kafka-hub/kafka-planners/message-size. Static analysis — not a live diagnosis.");
  lines.push("The produced batch size model assumes the on-wire (potentially compressed) size. Calibrate to your workload.");
  lines.push("");

  const content = lines.join("\n");
  return { content, redactionSummary: "No user-supplied labels in message-size input.", redactedCount: 0 };
}

// ─── JSON Export ────────────────────────────────────────────────────────────

export function exportMessageSizeJson(result: MessageSizeAnalysisResult): MessageSizeExportResult {
  const now = new Date().toISOString();

  function safeGap(gap: MessageSizeAlignmentGap) {
    return {
      stageId: gap.stageId,
      label: gap.label,
      reason: gap.reason,
      configuredLimitBytes: safeNumber(gap.configuredLimitBytes),
      targetBytes: safeNumber(gap.targetBytes),
      explanation: gap.explanation,
    };
  }

  const payload = {
    generatedAt: now,
    zone: result.zone,
    zoneLabel: ZONE_LABELS[result.zone] ?? result.zone,
    zoneExplanation: result.zoneExplanation,
    stages: result.stages.map((s) => ({
      stageId: s.stageId,
      label: s.label,
      configuredLimitBytes: safeNumber(s.configuredLimitBytes),
      actualRequiredBytes: safeNumber(s.actualRequiredBytes),
      alignedRequiredBytes: safeNumber(s.alignedRequiredBytes),
      actualPass: s.actualPass,
      alignedPass: s.alignedPass,
      status: s.status,
      rationale: s.rationale,
      // backward compat
      requiredBytes: safeNumber(s.requiredBytes),
      pass: s.pass,
    })),
    firstFailure: result.firstFailure
      ? {
          stageId: result.firstFailure.stageId,
          label: result.firstFailure.label,
          configuredLimitBytes: safeNumber(result.firstFailure.configuredLimitBytes),
          actualRequiredBytes: safeNumber(result.firstFailure.actualRequiredBytes),
          alignedRequiredBytes: safeNumber(result.firstFailure.alignedRequiredBytes),
          actualPass: result.firstFailure.actualPass,
          alignedPass: result.firstFailure.alignedPass,
          status: result.firstFailure.status,
          rationale: result.firstFailure.rationale,
        }
      : null,
    firstAlignmentGap: result.firstAlignmentGap
      ? safeGap(result.firstAlignmentGap)
      : null,
    alignmentGaps: result.alignmentGaps.map(safeGap),
    patch: {
      entries: result.patch.entries.map((e) => ({
        property: e.property,
        scope: e.scope,
        recommendedBytes: safeNumber(e.recommendedBytes),
        currentBytes: safeNumber(e.currentBytes),
        changed: e.changed,
        targetReason: e.targetReason,
        note: e.note,
      })),
      snippet: result.patch.snippet,
      explanation: result.patch.explanation,
    },
    blobRecommendation: {
      recommended: result.blobRecommendation.recommended,
      thresholdBytes: safeNumber(result.blobRecommendation.thresholdBytes),
      trigger: result.blobRecommendation.trigger,
      guidance: result.blobRecommendation.guidance,
    },
    assumptions: {
      recordSizeBytes: safeNumber(result.assumptions.recordSizeBytes),
      batchSizeBytes: safeNumber(result.assumptions.batchSizeBytes),
      producerMaxRequestSize: safeNumber(result.assumptions.producerMaxRequestSize),
      brokerMessageMaxBytes: safeNumber(result.assumptions.brokerMessageMaxBytes),
      topicOverrideMaxMessageBytes: result.assumptions.topicOverrideMaxMessageBytes !== null
        ? safeNumber(result.assumptions.topicOverrideMaxMessageBytes)
        : null,
      effectiveAcceptanceLimitBytes: safeNumber(result.assumptions.effectiveAcceptanceLimitBytes),
      replicaFetchMaxBytes: safeNumber(result.assumptions.replicaFetchMaxBytes),
      consumerMaxPartitionFetchBytes: safeNumber(result.assumptions.consumerMaxPartitionFetchBytes),
      consumerFetchMaxBytes: safeNumber(result.assumptions.consumerFetchMaxBytes),
      safetyHeadroomFraction: safeNumber(result.assumptions.safetyHeadroomFraction),
      requiredAlignedLimitBytes: safeNumber(result.assumptions.requiredAlignedLimitBytes),
      blobStorageThresholdBytes: safeNumber(result.assumptions.blobStorageThresholdBytes),
    },
    observability: result.observability,
    resourceLinks: result.resourceLinks,
    disclaimer:
      "Static analysis — not a live diagnosis. The produced batch size model assumes the on-wire (potentially compressed) size. Calibrate to your workload.",
  };

  const content = JSON.stringify(payload, null, 2);
  return { content, redactionSummary: "No user-supplied labels in message-size input.", redactedCount: 0 };
}
