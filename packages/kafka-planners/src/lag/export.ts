/**
 * Export / sanitization module for lag triage results.
 *
 * Produces Markdown and JSON exports with secret redaction.
 * Reuses @kafka-hub/kafka-diagnose redaction primitives.
 *
 * The result payload is deterministic. Export helpers stamp a `generatedAt`
 * timestamp at export time — the analysis result itself carries no timestamp.
 */

import type { LagTriageResult } from "./types";
import { redactSecrets } from "@kafka-hub/kafka-diagnose";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LagExportResult {
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
 * Lag input should not normally contain credentials, but all user-supplied
 * text still passes through best-effort common-pattern redaction.
 */
export function redactLabel(text: string): string {
  return redactSecrets(text).redacted;
}

/**
 * Redact all user-supplied partition IDs in a result.
 */
function redactResult(result: LagTriageResult): {
  redacted: LagTriageResult;
  count: number;
} {
  let count = 0;
  const partitionIdMap = new Map<string, string>();

  const safeId = (id: string): string => {
    if (partitionIdMap.has(id)) return partitionIdMap.get(id)!;
    const { redacted, entries } = redactSecrets(id);
    count += entries.length;
    partitionIdMap.set(id, redacted);
    return redacted;
  };

  const redactedPartitions = result.partitions.map((p) => ({
    ...p,
    partitionId: safeId(p.partitionId),
  }));

  const redactedHotPartitions = result.hotPartitions.map(safeId);
  const redactedCommittedRegressions = result.committedRegressions.map(safeId);
  const redactedCurrentRegressions = result.currentRegressions.map(safeId);
  const redactedSkew = {
    ...result.partitionSkew,
    maxLagPartitions: result.partitionSkew.maxLagPartitions.map(safeId),
  };

  return {
    redacted: {
      ...result,
      partitions: redactedPartitions,
      hotPartitions: redactedHotPartitions,
      committedRegressions: redactedCommittedRegressions,
      currentRegressions: redactedCurrentRegressions,
      partitionSkew: redactedSkew,
    },
    count,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtRate(rate: number): string {
  if (!Number.isFinite(rate)) return "0.00";
  return rate.toFixed(2);
}

function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "N/A";
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

const CONDITION_LABELS: Record<string, string> = {
  "caught-up": "Caught Up",
  "stable-backlog": "Stable Backlog",
  "growing": "Growing",
  "draining": "Draining",
  "stalled": "Stalled",
  "hot-partition": "Hot Partition",
  "group-unstable": "Group Unstable",
};

/**
 * Sanitize a number for JSON serialization — replaces NaN/Infinity with null.
 */
function safeNumber(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

// ─── Markdown Export ────────────────────────────────────────────────────────

/**
 * Export lag triage result as sanitized Markdown.
 */
export function exportLagMarkdown(result: LagTriageResult): LagExportResult {
  const now = new Date().toISOString();
  const { redacted: r, count } = redactResult(result);
  const lines: string[] = [];

  lines.push("# Consumer Lag Triage Report");
  lines.push("");
  lines.push(`**Generated:** ${now}`);
  lines.push(`**Condition:** ${CONDITION_LABELS[r.condition] ?? r.condition}`);
  lines.push(`**Confidence:** ${r.confidence.level} — ${r.confidence.reason}`);
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Total lag (before) | ${r.totalLagBefore.toLocaleString()} records |`);
  lines.push(`| Total lag (after) | ${r.totalLagAfter.toLocaleString()} records |`);
  lines.push(`| Lag delta | ${r.totalLagDelta >= 0 ? "+" : ""}${r.totalLagDelta.toLocaleString()} records |`);
  lines.push(`| Lag rate | ${fmtRate(r.totalLagRatePerSec)} records/sec |`);
  lines.push(`| Ingress rate | ${fmtRate(r.totalIngressRatePerSec)} records/sec |`);
  lines.push(`| Committed rate | ${fmtRate(r.totalCommittedRatePerSec)} records/sec |`);
  lines.push(`| Current-position delta | ${r.totalCurrentDelta >= 0 ? "+" : ""}${r.totalCurrentDelta.toLocaleString()} records |`);
  lines.push(`| Current-position rate | ${fmtRate(r.totalCurrentRatePerSec)} records/sec |`);
  lines.push(`| Partitions | ${r.partitions.length} |`);
  lines.push(`| Hot partitions | ${r.hotPartitions.length} |`);
  lines.push(`| Committed regressions | ${r.committedRegressions.length} |`);
  lines.push(`| Current regressions | ${r.currentRegressions.length} |`);
  if (r.drainEta.etaSeconds !== null) {
    lines.push(`| Drain ETA (committed) | ${fmtDuration(r.drainEta.etaSeconds)} |`);
  } else {
    lines.push(`| Drain ETA (committed) | N/A — ${r.drainEta.unavailableReason ?? "unknown"} |`);
  }
  lines.push("");

  // Partition skew
  lines.push("## Partition Skew");
  lines.push("");
  lines.push(`- **Max lag:** ${r.partitionSkew.maxLag.toLocaleString()} (${r.partitionSkew.maxLagPartitions.join(", ")})`);
  lines.push(`- **Mean lag:** ${r.partitionSkew.meanLag.toFixed(1)}`);
  lines.push(`- **CV:** ${r.partitionSkew.coefficientOfVariation !== null ? r.partitionSkew.coefficientOfVariation.toFixed(3) : "N/A (mean is 0)"}`);
  lines.push("");

  // Throughput requirements
  lines.push("## Throughput Requirements");
  lines.push("");
  lines.push(`- **To hold steady:** ${fmtRate(r.throughputRequirements.toHoldSteady)} records/sec`);
  if (r.throughputRequirements.toDrainByTarget !== undefined) {
    lines.push(`- **To drain by target:** ${fmtRate(r.throughputRequirements.toDrainByTarget)} records/sec`);
  }
  lines.push("");

  // Capacity
  if (r.capacity) {
    lines.push("## Capacity Planning");
    lines.push("");
    lines.push(`- **Per-consumer throughput:** ${fmtRate(r.capacity.perConsumerThroughput)} records/sec`);
    lines.push(`- **Required consumers (hold steady):** ${r.capacity.requiredToHoldSteady} (uncapped)`);
    lines.push(`- **Effective consumers (hold steady):** ${r.capacity.effectiveToHoldSteady} (capped at partitions)`);
    if (r.capacity.requiredToDrain !== undefined) {
      lines.push(`- **Required consumers (drain target):** ${r.capacity.requiredToDrain} (uncapped)`);
    }
    if (r.capacity.effectiveToDrain !== undefined) {
      lines.push(`- **Effective consumers (drain target):** ${r.capacity.effectiveToDrain} (capped at partitions)`);
    }
    lines.push(`- **Max active consumers:** ${r.capacity.maxActiveConsumers} (= partition count)`);
    lines.push(`- **Max throughput at cap:** ${fmtRate(r.capacity.maxThroughputAtCap)} records/sec`);
    if (r.capacity.throughputShortfall > 0) {
      lines.push(`- **Throughput shortfall:** ${fmtRate(r.capacity.throughputShortfall)} records/sec`);
    }
    if (r.capacity.cappedAtPartitions) {
      lines.push(`- **Warning:** Consumer count capped at partition count. Even maximum parallelism may be insufficient.`);
    }
    lines.push("");
  }

  // Condition flags
  lines.push("## Condition Flags");
  lines.push("");
  lines.push(`- Group state unstable: ${r.conditionFlags.groupStateUnstable ? "Yes" : "No"}`);
  lines.push(`- Committed regressions: ${r.conditionFlags.hasCommittedRegressions ? "Yes" : "No"}`);
  lines.push(`- Current regressions: ${r.conditionFlags.hasCurrentRegressions ? "Yes" : "No"}`);
  lines.push(`- Hot partitions: ${r.conditionFlags.hasHotPartitions ? "Yes" : "No"}`);
  lines.push(`- Lag growing: ${r.conditionFlags.lagGrowing ? "Yes" : "No"}`);
  lines.push(`- Consumers stalled: ${r.conditionFlags.consumersStalled ? "Yes" : "No"}`);
  lines.push("");

  // Per-partition table
  lines.push("## Per-Partition Detail");
  lines.push("");
  lines.push("| Partition | Lag Before | Lag After | Delta | Rate (r/s) | Ingress (r/s) | Committed (r/s) | Cur Delta | Cur Rate (r/s) | Hot | Committed Regr | Current Regr |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |");
  for (const p of r.partitions) {
    lines.push(
      `| ${p.partitionId} | ${p.lagBefore} | ${p.lagAfter} | ${p.lagDelta >= 0 ? "+" : ""}${p.lagDelta} | ${fmtRate(p.lagRatePerSec)} | ${fmtRate(p.ingressRatePerSec)} | ${fmtRate(p.committedRatePerSec)} | ${p.currentDelta >= 0 ? "+" : ""}${p.currentDelta} | ${fmtRate(p.currentRatePerSec)} | ${p.isHot ? "Yes" : "No"} | ${p.committedRegression ? "Yes" : "No"} | ${p.currentRegression ? "Yes" : "No"} |`,
    );
  }
  lines.push("");

  // Observability
  lines.push("## Observability Recommendations");
  lines.push("");
  for (const rec of r.recommendations) {
    lines.push(`### ${rec.metric}`);
    lines.push("");
    lines.push(rec.description);
    lines.push("");
    lines.push(`**Rationale:** ${rec.rationale}`);
    lines.push("");
    lines.push(`**Caveat:** ${rec.caveat}`);
    lines.push("");
  }

  // Assumptions
  lines.push("## Assumptions");
  lines.push("");
  lines.push(`- Interval: ${r.assumptions.intervalSeconds}s`);
  lines.push(`- Hot partition detection: peer-baseline method — each partition's lag is compared to the mean lag of all other partitions × ${r.assumptions.hotPartitionMultiplier}, with a minimum lag of ${r.assumptions.hotPartitionMinLag}. Single-partition groups cannot have hot partitions.`);
  if (r.assumptions.perConsumerThroughput !== undefined) {
    lines.push(`- Per-consumer throughput: ${fmtRate(r.assumptions.perConsumerThroughput)} records/sec`);
  }
  if (r.assumptions.drainTargetSeconds !== undefined) {
    lines.push(`- Drain target: ${fmtDuration(r.assumptions.drainTargetSeconds)}`);
  }
  lines.push(`- Group state (after): ${r.assumptions.groupStateAfter}`);
  lines.push(`- Committed lag is based on committed offsets; current-position progress is tracked separately.`);
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("Generated by @kafka-hub/kafka-planners/lag. Static analysis — not a live diagnosis. Calibrate alert thresholds to your workload baseline and SLO.");
  lines.push("");

  const content = lines.join("\n");
  const redactionSummary =
    count > 0
      ? `Redacted ${count} potential secret(s) from partition labels. Review before sharing.`
      : "No common secret patterns detected in partition labels; review before sharing.";

  return { content, redactionSummary, redactedCount: count };
}

// ─── JSON Export ────────────────────────────────────────────────────────────

/**
 * Export lag triage result as sanitized JSON.
 * Ensures no NaN/Infinity values appear in the output.
 */
export function exportLagJson(result: LagTriageResult): LagExportResult {
  const now = new Date().toISOString();
  const { redacted, count } = redactResult(result);

  const payload = {
    generatedAt: now,
    condition: redacted.condition,
    conditionLabel: CONDITION_LABELS[redacted.condition] ?? redacted.condition,
    confidence: redacted.confidence,
    summary: {
      totalLagBefore: safeNumber(redacted.totalLagBefore),
      totalLagAfter: safeNumber(redacted.totalLagAfter),
      totalLagDelta: safeNumber(redacted.totalLagDelta),
      totalLagRatePerSec: safeNumber(redacted.totalLagRatePerSec),
      totalIngressRatePerSec: safeNumber(redacted.totalIngressRatePerSec),
      totalCommittedRatePerSec: safeNumber(redacted.totalCommittedRatePerSec),
      totalCurrentDelta: safeNumber(redacted.totalCurrentDelta),
      totalCurrentRatePerSec: safeNumber(redacted.totalCurrentRatePerSec),
    },
    partitionSkew: {
      ...redacted.partitionSkew,
      maxLag: safeNumber(redacted.partitionSkew.maxLag),
      meanLag: safeNumber(redacted.partitionSkew.meanLag),
      coefficientOfVariation: redacted.partitionSkew.coefficientOfVariation !== null
        ? safeNumber(redacted.partitionSkew.coefficientOfVariation)
        : null,
    },
    hotPartitions: redacted.hotPartitions,
    committedRegressions: redacted.committedRegressions,
    currentRegressions: redacted.currentRegressions,
    drainEta: {
      ...redacted.drainEta,
      etaSeconds: redacted.drainEta.etaSeconds !== null
        ? safeNumber(redacted.drainEta.etaSeconds)
        : null,
    },
    throughputRequirements: {
      toHoldSteady: safeNumber(redacted.throughputRequirements.toHoldSteady),
      ...(redacted.throughputRequirements.toDrainByTarget !== undefined
        ? { toDrainByTarget: safeNumber(redacted.throughputRequirements.toDrainByTarget) }
        : {}),
    },
    ...(redacted.capacity ? {
      capacity: {
        ...redacted.capacity,
        maxThroughputAtCap: safeNumber(redacted.capacity.maxThroughputAtCap),
        throughputShortfall: safeNumber(redacted.capacity.throughputShortfall),
      },
    } : {}),
    conditionFlags: redacted.conditionFlags,
    assumptions: redacted.assumptions,
    partitions: redacted.partitions.map((p) => ({
      ...p,
      lagRatePerSec: safeNumber(p.lagRatePerSec),
      ingressRatePerSec: safeNumber(p.ingressRatePerSec),
      committedRatePerSec: safeNumber(p.committedRatePerSec),
      currentRatePerSec: safeNumber(p.currentRatePerSec),
    })),
    recommendations: redacted.recommendations,
    resourceLinks: redacted.resourceLinks,
    ...(count > 0
      ? { redacted: { count, note: "Partition labels redacted." } }
      : {}),
    disclaimer:
      "Static analysis — not a live diagnosis. Calibrate alert thresholds to your workload baseline and SLO.",
  };

  const content = JSON.stringify(payload, null, 2);
  const redactionSummary =
    count > 0
      ? `Redacted ${count} potential secret(s) from partition labels. Review before sharing.`
      : "No common secret patterns detected in partition labels; review before sharing.";

  return { content, redactionSummary, redactedCount: count };
}
