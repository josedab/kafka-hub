/**
 * Export / sanitization module for DR tabletop results.
 *
 * Produces Markdown, JSON, and checklist exports.
 * Outputs exclude NaN/Infinity and use best-effort common-pattern redaction.
 * Uses @kafka-hub/kafka-diagnose redaction as defense in depth.
 */

import type { DrTabletopResult } from "./types";
import { redactSecrets } from "@kafka-hub/kafka-diagnose";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DrExportResult {
  /** The exported content (Markdown or JSON string). */
  readonly content: string;
  /** Summary of what was redacted. */
  readonly redactionSummary: string;
  /** Number of strings that were redacted. */
  readonly redactedCount: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "N/A";
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function safeNumber(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

/**
 * Redact text through kafka-diagnose.
 * Defense in depth — DR input shouldn't contain secrets, but we route
 * all user-visible text through redaction as a safety net.
 */
function redactText(text: string): { text: string; count: number } {
  const { redacted, entries } = redactSecrets(text);
  return { text: redacted, count: entries.length };
}

const STATUS_LABELS: Record<string, string> = {
  "ready": "Ready",
  "concerns": "Concerns",
  "at-risk": "At Risk",
};

const SEVERITY_LABELS: Record<string, string> = {
  "critical": "CRITICAL",
  "warning": "WARNING",
  "info": "INFO",
};

// ─── Markdown Export ────────────────────────────────────────────────────────

/**
 * Export DR tabletop result as sanitized Markdown.
 */
export function exportDrMarkdown(result: DrTabletopResult): DrExportResult {
  const now = new Date().toISOString();
  const lines: string[] = [];

  lines.push("# DR Tabletop Planner Report");
  lines.push("");
  lines.push(`**Generated:** ${now}`);
  lines.push(`**Status:** ${STATUS_LABELS[result.status] ?? result.status}`);
  lines.push(`**Strategy:** ${result.strategyNotes.label}`);
  lines.push("");

  // RPO
  lines.push("## Recovery-Point Exposure (RPO Estimate)");
  lines.push("");
  lines.push("RPO decomposes into: (1) replicated data loss — records not yet replicated to the target, and (2) checkpoint/offset uncertainty — staleness of consumer offset translation that may require replay/reconciliation even when records exist on the target. All values in seconds.");
  lines.push("");
  lines.push("| Scenario | Time | Formula |");
  lines.push("| --- | ---: | --- |");
  for (const scenario of ["best", "likely", "worst"] as const) {
    const est = result.rpo[scenario];
    lines.push(`| ${scenario} | ${fmtDuration(est.seconds)} (${est.seconds}s) | ${est.formula} |`);
  }
  lines.push("");

  // RPO assumptions
  lines.push("### RPO Assumptions");
  lines.push("");
  for (const scenario of ["best", "likely", "worst"] as const) {
    lines.push(`**${scenario}:**`);
    for (const a of result.rpo[scenario].assumptions) {
      lines.push(`- ${a}`);
    }
    lines.push("");
  }

  // RTO
  lines.push("## Recovery Time Objective (RTO) — Downtime");
  lines.push("");
  lines.push("All values in seconds. RTO measures total service downtime.");
  lines.push("");
  lines.push("| Scenario | Time | Formula |");
  lines.push("| --- | ---: | --- |");
  for (const scenario of ["best", "likely", "worst"] as const) {
    const est = result.rto[scenario];
    lines.push(`| ${scenario} | ${fmtDuration(est.seconds)} (${est.seconds}s) | ${est.formula} |`);
  }
  lines.push("");

  // RTO assumptions
  lines.push("### RTO Assumptions");
  lines.push("");
  for (const scenario of ["best", "likely", "worst"] as const) {
    lines.push(`**${scenario}:**`);
    for (const a of result.rto[scenario].assumptions) {
      lines.push(`- ${a}`);
    }
    lines.push("");
  }

  // Duplicate exposure
  lines.push("## Duplicate / Replay Exposure");
  lines.push("");
  lines.push(`- **Worst-case replay:** ${result.duplicateExposure.worstCaseReplaySeconds}s`);
  lines.push(`- **Tolerance:** ${result.duplicateExposure.toleranceSeconds}s`);
  lines.push(`- **Exceeds tolerance:** ${result.duplicateExposure.exceedsTolerance ? "YES" : "No"}`);
  lines.push("");
  lines.push(result.duplicateExposure.explanation);
  lines.push("");

  // Warnings
  if (result.warnings.length > 0) {
    lines.push("## Warnings");
    lines.push("");
    for (const w of result.warnings) {
      lines.push(`- **[${SEVERITY_LABELS[w.severity] ?? w.severity}]** ${w.message}`);
    }
    lines.push("");
  }

  // Checklists
  lines.push("## DR Phase Checklists");
  lines.push("");
  for (const phase of result.checklists) {
    lines.push(`### Phase ${phase.order}: ${phase.label}`);
    lines.push("");
    for (const ci of phase.items) {
      lines.push(`- [ ] ${ci.text} *(Owner: ${ci.owner})*`);
    }
    lines.push("");
  }

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

  // Strategy notes
  lines.push(`## Strategy Notes: ${result.strategyNotes.label}`);
  lines.push("");
  for (const note of result.strategyNotes.notes) {
    lines.push(`- ${note}`);
  }
  lines.push("");

  // Assumptions
  lines.push("## Input Assumptions");
  lines.push("");
  lines.push(`- Replication lag: ${result.assumptions.replicationLagSeconds}s`);
  lines.push(`- Checkpoint interval: ${result.assumptions.checkpointIntervalSeconds}s`);
  lines.push(`- Incident detection: ${result.assumptions.incidentDetectionSeconds}s`);
  lines.push(`- Promotion time: ${result.assumptions.promotionSeconds}s`);
  lines.push(`- DNS TTL: ${result.assumptions.dnsTtlSeconds}s`);
  lines.push(`- Client reconnect: ${result.assumptions.clientReconnectSeconds}s`);
  lines.push(`- Validation time: ${result.assumptions.validationSeconds}s`);
  lines.push(`- Duplicate tolerance: ${result.assumptions.duplicateToleranceSeconds}s`);
  lines.push(`- Strategy: ${result.assumptions.strategy}`);
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("Generated by @kafka-hub/kafka-planners/dr. Deterministic planning aid — not a live diagnosis. Does NOT execute commands or automate failover.");
  lines.push("");

  // Final shared redaction pass over the entire output (defense in depth)
  const rawContent = lines.join("\n");
  const finalPass = redactText(rawContent);
  const finalRedacted = finalPass.count;
  const content = finalPass.text;
  const redactionSummary =
    finalRedacted > 0
      ? `Redacted ${finalRedacted} potential secret(s) in final pass. Review before sharing.`
      : "No common secret patterns detected; review before sharing.";

  return { content, redactionSummary, redactedCount: finalRedacted };
}

// ─── JSON Export ────────────────────────────────────────────────────────────

/**
 * Export DR tabletop result as sanitized JSON.
 * Ensures no NaN/Infinity values.
 */
export function exportDrJson(result: DrTabletopResult): DrExportResult {
  const now = new Date().toISOString();
  const safeEstimate = (est: DrTabletopResult["rpo"]["best"]) => ({
    seconds: safeNumber(est.seconds),
    formula: est.formula,
    components: est.components.map((c) => ({
      ...c,
      valueSeconds: safeNumber(c.valueSeconds),
    })),
    assumptions: est.assumptions,
  });

  const safeChecklists = result.checklists.map((phase) => ({
    ...phase,
    items: phase.items.map((ci) => ({ ...ci })),
  }));

  const payload = {
    generatedAt: now,
    status: result.status,
    statusLabel: STATUS_LABELS[result.status] ?? result.status,
    rpo: {
      best: safeEstimate(result.rpo.best),
      likely: safeEstimate(result.rpo.likely),
      worst: safeEstimate(result.rpo.worst),
    },
    rto: {
      best: safeEstimate(result.rto.best),
      likely: safeEstimate(result.rto.likely),
      worst: safeEstimate(result.rto.worst),
    },
    duplicateExposure: {
      ...result.duplicateExposure,
      worstCaseReplaySeconds: safeNumber(result.duplicateExposure.worstCaseReplaySeconds),
      toleranceSeconds: safeNumber(result.duplicateExposure.toleranceSeconds),
    },
    warnings: result.warnings,
    checklists: safeChecklists,
    observability: result.observability,
    strategyNotes: result.strategyNotes,
    resourceLinks: result.resourceLinks,
    assumptions: {
      ...result.assumptions,
      replicationLagSeconds: safeNumber(result.assumptions.replicationLagSeconds),
      checkpointIntervalSeconds: safeNumber(result.assumptions.checkpointIntervalSeconds),
      incidentDetectionSeconds: safeNumber(result.assumptions.incidentDetectionSeconds),
      promotionSeconds: safeNumber(result.assumptions.promotionSeconds),
      dnsTtlSeconds: safeNumber(result.assumptions.dnsTtlSeconds),
      clientReconnectSeconds: safeNumber(result.assumptions.clientReconnectSeconds),
      validationSeconds: safeNumber(result.assumptions.validationSeconds),
      duplicateToleranceSeconds: safeNumber(result.assumptions.duplicateToleranceSeconds),
    },
    disclaimer:
      "Deterministic planning aid — not a live diagnosis. Does NOT execute commands or automate failover.",
  };

  // Final shared redaction pass over the entire JSON string (defense in depth)
  const rawContent = JSON.stringify(payload, null, 2);
  const finalPass = redactText(rawContent);
  const finalRedacted = finalPass.count;
  const content = finalPass.text;
  const redactionSummary =
    finalRedacted > 0
      ? `Redacted ${finalRedacted} potential secret(s) in final pass. Review before sharing.`
      : "No common secret patterns detected; review before sharing.";

  return { content, redactionSummary, redactedCount: finalRedacted };
}

// ─── Checklist-Only Export ──────────────────────────────────────────────────

/**
 * Export only the DR checklists as printable Markdown.
 * Designed for printing / sharing as a standalone document.
 */
export function exportDrChecklist(result: DrTabletopResult): DrExportResult {
  const now = new Date().toISOString();
  const lines: string[] = [];

  lines.push("# DR Tabletop Checklist");
  lines.push("");
  lines.push(`**Generated:** ${now}`);
  lines.push(`**Strategy:** ${result.strategyNotes.label}`);
  lines.push("");

  for (const phase of result.checklists) {
    lines.push(`## Phase ${phase.order}: ${phase.label}`);
    lines.push("");
    for (const ci of phase.items) {
      lines.push(`- [ ] ${ci.text} *(Owner: ${ci.owner})*`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("Generated by @kafka-hub/kafka-planners/dr. Verification/coordination actions only — no commands.");
  lines.push("");

  // Final shared redaction pass over the entire checklist output (defense in depth)
  const rawContent = lines.join("\n");
  const finalPass = redactText(rawContent);
  const finalRedacted = finalPass.count;
  const content = finalPass.text;
  const redactionSummary =
    finalRedacted > 0
      ? `Redacted ${finalRedacted} potential secret(s) in final pass. Review before sharing.`
      : "No common secret patterns detected; review before sharing.";

  return { content, redactionSummary, redactedCount: finalRedacted };
}
