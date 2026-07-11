/**
 * Export / sanitization module for capacity analysis results.
 *
 * Produces Markdown and JSON exports with secret redaction.
 * Reuses @kafka-hub/kafka-diagnose redaction primitives.
 *
 * The result payload is deterministic. Export helpers stamp a `generatedAt`
 * timestamp at export time — the analysis result itself carries no timestamp.
 */

import type { CapacityAnalysisResult } from "./types";
import { redactSecrets } from "@kafka-hub/kafka-diagnose";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CapacityExportResult {
  /** The exported content (Markdown or JSON string). */
  readonly content: string;
  /** Summary of what was redacted. */
  readonly redactionSummary: string;
  /** Number of strings that were redacted. */
  readonly redactedCount: number;
}

// ─── Redaction ──────────────────────────────────────────────────────────────

/**
 * Redact a user-supplied label/text through kafka-diagnose redaction.
 * Capacity planning typically has no user-supplied text labels, but
 * we route any potential text through redaction as a safety net.
 */
export function redactCapacityLabel(text: string): string {
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

function fmtBytesPerSec(bytesPerSec: number): string {
  return `${fmtBytes(bytesPerSec)}/s`;
}

function fmtPct(ratio: number): string {
  if (!Number.isFinite(ratio)) return "N/A";
  return `${(ratio * 100).toFixed(1)}%`;
}

function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "N/A";
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

/**
 * Sanitize a number for JSON serialization — replaces NaN/Infinity with null.
 */
function safeNumber(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

const STATUS_LABELS: Record<string, string> = {
  pass: "Pass",
  warning: "Warning",
  fail: "Fail",
};

// ─── Markdown Export ────────────────────────────────────────────────────────

/**
 * Export capacity analysis result as sanitized Markdown.
 */
export function exportCapacityMarkdown(result: CapacityAnalysisResult): CapacityExportResult {
  const now = new Date().toISOString();
  const lines: string[] = [];

  lines.push("# Capacity and N-1 Headroom Report");
  lines.push("");
  lines.push(`**Generated:** ${now}`);
  lines.push(`**Status:** ${STATUS_LABELS[result.status] ?? result.status}`);
  lines.push("");

  // Input assumptions
  lines.push("## Input Parameters");
  lines.push("");
  lines.push("| Parameter | Value |");
  lines.push("| --- | --- |");
  lines.push(`| Peak ingress rate | ${result.assumptions.peakIngressRate.toLocaleString()} records/sec |`);
  lines.push(`| Average record size | ${fmtBytes(result.assumptions.avgRecordSizeBytes)} |`);
  lines.push(`| Compression ratio | ${result.assumptions.compressionRatio} (${(result.assumptions.compressionRatio * 100).toFixed(0)}% of uncompressed) |`);
  lines.push(`| Retention | ${fmtDuration(result.assumptions.retentionSeconds)} |`);
  lines.push(`| Replication factor | ${result.assumptions.replicationFactor} |`);
  lines.push(`| Partition count | ${result.assumptions.partitionCount} |`);
  lines.push(`| Broker count | ${result.assumptions.brokerCount} |`);
  lines.push(`| Full-read consumer groups | ${result.assumptions.fullReadConsumerGroupCount} |`);
  lines.push(`| Per-partition target | ${fmtBytesPerSec(result.assumptions.perPartitionTargetThroughput)} |`);
  lines.push(`| Per-broker storage | ${fmtBytes(result.assumptions.perBrokerStorageBytes)} |`);
  lines.push(`| Per-broker network | ${fmtBytesPerSec(result.assumptions.perBrokerNetworkBytesPerSec)} |`);
  lines.push(`| Safety target | ${fmtPct(result.assumptions.safetyHeadroomTarget)} utilization |`);
  lines.push(`| Skew factor | ${result.assumptions.skewFactor}x |`);
  lines.push("");

  // Storage
  lines.push("## Storage");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("| --- | --- |");
  lines.push(`| Logical uncompressed ingress | ${fmtBytesPerSec(result.storage.logicalUncompressedIngressBytesPerSec)} |`);
  lines.push(`| Logical uncompressed retained | ${fmtBytes(result.storage.logicalUncompressedRetainedBytes)} |`);
  lines.push(`| Compressed primary retained | ${fmtBytes(result.storage.compressedPrimaryRetainedBytes)} |`);
  lines.push(`| Physical retained (with RF) | ${fmtBytes(result.storage.physicalRetainedBytes)} |`);
  lines.push("");

  // Network
  lines.push("## Network");
  lines.push("");
  lines.push("Network model: cluster traffic = producer ingress + follower replication + full-read consumer egress.");
  lines.push("Per-broker figures approximate the busiest direction (typically egress-dominated). Bidirectional NIC accounting is simplified.");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("| --- | --- |");
  lines.push(`| Compressed ingress | ${fmtBytesPerSec(result.network.compressedIngressBytesPerSec)} |`);
  lines.push(`| Follower replication | ${fmtBytesPerSec(result.network.followerReplicationBytesPerSec)} |`);
  lines.push(`| Consumer read fan-out | ${fmtBytesPerSec(result.network.consumerReadBytesPerSec)} |`);
  lines.push(`| Total cluster network | ${fmtBytesPerSec(result.network.totalClusterNetworkBytesPerSec)} |`);
  lines.push("");

  // Partitions
  lines.push("## Partitions");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("| --- | --- |");
  lines.push(`| Minimum partitions required | ${result.partitions.minimumPartitionsFromTarget} |`);
  lines.push(`| Configured partitions | ${result.assumptions.partitionCount} |`);
  lines.push(`| Sufficient | ${result.partitions.partitionCountSufficient ? "Yes" : "No"} |`);
  lines.push(`| Avg per-partition throughput | ${fmtBytesPerSec(result.partitions.avgPerPartitionThroughput)} |`);
  lines.push(`| Skew-adjusted hottest | ${fmtBytesPerSec(result.partitions.skewAdjustedHottestPartitionThroughput)} |`);
  lines.push(`| Hottest exceeds target | ${result.partitions.hottestPartitionExceedsTarget ? "Yes" : "No"} |`);
  lines.push("");

  // Broker load comparison
  lines.push("## Broker Load: Average vs N-1");
  lines.push("");
  lines.push("| Metric | Average | N-1 |");
  lines.push("| --- | --- | --- |");
  const n1 = result.n1Load;
  lines.push(`| Active brokers | ${result.averageLoad.activeBrokers} | ${n1 ? n1.activeBrokers : "N/A"} |`);
  lines.push(`| Storage/broker | ${fmtBytes(result.averageLoad.storagePerBroker)} | ${n1 ? fmtBytes(n1.storagePerBroker) : "N/A"} |`);
  lines.push(`| Network/broker | ${fmtBytesPerSec(result.averageLoad.networkPerBroker)} | ${n1 ? fmtBytesPerSec(n1.networkPerBroker) : "N/A"} |`);
  lines.push(`| Storage utilization | ${fmtPct(result.averageLoad.storageUtilization)} | ${n1 ? fmtPct(n1.storageUtilization) : "N/A"} |`);
  lines.push(`| Network utilization | ${fmtPct(result.averageLoad.networkUtilization)} | ${n1 ? fmtPct(n1.networkUtilization) : "N/A"} |`);
  lines.push(`| Storage headroom | ${fmtPct(result.averageLoad.storageHeadroom)} | ${n1 ? fmtPct(n1.storageHeadroom) : "N/A"} |`);
  lines.push(`| Network headroom | ${fmtPct(result.averageLoad.networkHeadroom)} | ${n1 ? fmtPct(n1.networkHeadroom) : "N/A"} |`);
  lines.push("");

  // Warnings
  if (result.warnings.length > 0) {
    lines.push("## Warnings");
    lines.push("");
    for (const w of result.warnings) {
      lines.push(`- **[${w.severity}]** ${w.message}`);
    }
    lines.push("");
  }

  // Observability
  lines.push("## Observability Recommendations");
  lines.push("");
  for (const rec of result.recommendations) {
    lines.push(`### ${rec.metric}`);
    lines.push("");
    lines.push(rec.description);
    lines.push("");
    lines.push(`**Rationale:** ${rec.rationale}`);
    lines.push("");
    lines.push(`**Caveat:** ${rec.caveat}`);
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("Generated by @kafka-hub/kafka-planners/capacity. Static analysis — not a live diagnosis.");
  lines.push("Vendor pricing is out of scope (user-entered). Calibrate thresholds to your workload baseline.");
  lines.push("");

  const content = lines.join("\n");
  return { content, redactionSummary: "No user-supplied labels in capacity input.", redactedCount: 0 };
}

// ─── JSON Export ────────────────────────────────────────────────────────────

/**
 * Export capacity analysis result as sanitized JSON.
 * Ensures no NaN/Infinity values appear in the output.
 */
export function exportCapacityJson(result: CapacityAnalysisResult): CapacityExportResult {
  const now = new Date().toISOString();

  const payload = {
    generatedAt: now,
    status: result.status,
    statusLabel: STATUS_LABELS[result.status] ?? result.status,
    storage: {
      logicalUncompressedIngressBytesPerSec: safeNumber(result.storage.logicalUncompressedIngressBytesPerSec),
      logicalUncompressedRetainedBytes: safeNumber(result.storage.logicalUncompressedRetainedBytes),
      compressedPrimaryRetainedBytes: safeNumber(result.storage.compressedPrimaryRetainedBytes),
      physicalRetainedBytes: safeNumber(result.storage.physicalRetainedBytes),
    },
    network: {
      compressedIngressBytesPerSec: safeNumber(result.network.compressedIngressBytesPerSec),
      followerReplicationBytesPerSec: safeNumber(result.network.followerReplicationBytesPerSec),
      consumerReadBytesPerSec: safeNumber(result.network.consumerReadBytesPerSec),
      totalClusterNetworkBytesPerSec: safeNumber(result.network.totalClusterNetworkBytesPerSec),
    },
    partitions: {
      minimumPartitionsFromTarget: result.partitions.minimumPartitionsFromTarget,
      partitionCountSufficient: result.partitions.partitionCountSufficient,
      avgPerPartitionThroughput: safeNumber(result.partitions.avgPerPartitionThroughput),
      skewAdjustedHottestPartitionThroughput: safeNumber(result.partitions.skewAdjustedHottestPartitionThroughput),
      hottestPartitionExceedsTarget: result.partitions.hottestPartitionExceedsTarget,
    },
    averageLoad: sanitizeBrokerLoad(result.averageLoad),
    ...(result.n1Load ? { n1Load: sanitizeBrokerLoad(result.n1Load) } : {}),
    warnings: result.warnings,
    assumptions: {
      ...result.assumptions,
      peakIngressRate: safeNumber(result.assumptions.peakIngressRate),
      avgRecordSizeBytes: safeNumber(result.assumptions.avgRecordSizeBytes),
      retentionSeconds: safeNumber(result.assumptions.retentionSeconds),
      perPartitionTargetThroughput: safeNumber(result.assumptions.perPartitionTargetThroughput),
      perBrokerStorageBytes: safeNumber(result.assumptions.perBrokerStorageBytes),
      perBrokerNetworkBytesPerSec: safeNumber(result.assumptions.perBrokerNetworkBytesPerSec),
    },
    recommendations: result.recommendations,
    resourceLinks: result.resourceLinks,
    disclaimer:
      "Static analysis — not a live diagnosis. Vendor pricing is out of scope. Calibrate thresholds to your workload baseline.",
  };

  const content = JSON.stringify(payload, null, 2);
  return { content, redactionSummary: "No user-supplied labels in capacity input.", redactedCount: 0 };
}

function sanitizeBrokerLoad(load: { scenario: string; activeBrokers: number; storagePerBroker: number; networkPerBroker: number; storageUtilization: number; networkUtilization: number; storageHeadroom: number; networkHeadroom: number; storageExceedsSafetyTarget: boolean; networkExceedsSafetyTarget: boolean; storageShortfall: boolean; networkShortfall: boolean }) {
  return {
    scenario: load.scenario,
    activeBrokers: load.activeBrokers,
    storagePerBroker: safeNumber(load.storagePerBroker),
    networkPerBroker: safeNumber(load.networkPerBroker),
    storageUtilization: safeNumber(load.storageUtilization),
    networkUtilization: safeNumber(load.networkUtilization),
    storageHeadroom: safeNumber(load.storageHeadroom),
    networkHeadroom: safeNumber(load.networkHeadroom),
    storageExceedsSafetyTarget: load.storageExceedsSafetyTarget,
    networkExceedsSafetyTarget: load.networkExceedsSafetyTarget,
    storageShortfall: load.storageShortfall,
    networkShortfall: load.networkShortfall,
  };
}
