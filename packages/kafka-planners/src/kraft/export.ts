/**
 * Export / sanitization module for KRaft analysis results.
 *
 * Produces Markdown, JSON, and print-friendly checklist exports.
 * Reuses @kafka-hub/kafka-diagnose redaction primitives as defense in depth.
 * Excludes NaN/Infinity and applies best-effort common-pattern redaction.
 *
 * Core safety: This tool does NOT execute commands, change any cluster,
 * or automatically finalize any migration.
 */

import type { KRaftAnalysisResult, KRaftChecklistItem } from "./types";
import { KRAFT_MIGRATION_PHASES } from "./types";
import { redactSecrets } from "@kafka-hub/kafka-diagnose";
import { sanitizeForDisplay } from "./validate";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface KRaftExportResult {
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
 */
export function redactKRaftLabel(text: string): string {
  return redactSecrets(text).redacted;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  ready: "Ready",
  warnings: "Warnings",
  blocked: "Blocked",
};

const SEVERITY_LABELS: Record<string, string> = {
  blocker: "BLOCKER",
  warning: "WARNING",
  info: "INFO",
};

function safeNumber(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

function safeStr(s: string): string {
  return sanitizeForDisplay(redactSecrets(s).redacted);
}

// ─── Markdown Export ────────────────────────────────────────────────────────

/**
 * Export KRaft analysis result as sanitized Markdown.
 */
export function exportKRaftMarkdown(result: KRaftAnalysisResult): KRaftExportResult {
  const now = new Date().toISOString();
  const lines: string[] = [];

  lines.push("# KRaft Transition and Kafka 4.x Readiness Report");
  lines.push("");
  lines.push("> **Safety:** ZooKeeper-to-KRaft migration must complete on a supported Kafka 3.x release before upgrading to 4.x. Kafka 4.x is KRaft-only. Finalization is irreversible. This report is a planning aid — it does NOT execute commands or change any cluster.");
  lines.push("");
  lines.push(`**Generated:** ${now}`);
  lines.push(`**Status:** ${STATUS_LABELS[result.status] ?? result.status}`);
  lines.push(`**Kafka Version:** ${result.assumptions.kafkaVersion}`);
  lines.push(`**Metadata Mode:** ${result.assumptions.metadataMode}`);
  lines.push(`**Migration Phase:** ${result.phaseNavigation.currentPhase.label}`);
  lines.push(`**Vendor:** ${safeStr(result.assumptions.vendorLabel)}`);
  lines.push(`**Quorum Mode:** ${result.assumptions.quorumMode}`);
  lines.push("");

  // Version baseline
  lines.push("## Version Baseline");
  lines.push("");
  lines.push(`Reviewed release: Kafka ${result.versionBaseline.reviewedRelease} (released ${result.versionBaseline.releaseDate}).`);
  lines.push(`Review date: ${result.versionBaseline.reviewDate}.`);
  lines.push(`${result.versionBaseline.caveat}`);
  lines.push("");

  // Phase timeline
  lines.push("## Migration Phase Timeline");
  lines.push("");
  lines.push("| # | Phase | Rollback | Status |");
  lines.push("| - | ----- | -------- | ------ |");
  for (const phase of KRAFT_MIGRATION_PHASES) {
    const isCurrent = phase.id === result.assumptions.migrationPhase;
    const rollback = phase.rollbackSupported ? "Supported (not risk-free)" : "NOT supported (irreversible)";
    const status = isCurrent ? "**Current**" : "";
    lines.push(`| ${phase.order} | ${phase.label} | ${rollback} | ${status} |`);
  }
  lines.push("");
  lines.push(`**Rollback from current phase:** ${result.phaseNavigation.rollbackSupported ? "Supported (not risk-free)" : "NOT supported"} — ${result.phaseNavigation.rollbackNote}`);
  if (result.phaseNavigation.nextPhase) {
    lines.push(`**Next phase:** ${result.phaseNavigation.nextPhase.label}`);
  }
  lines.push("");

  // Quorum configuration
  lines.push("## Quorum Configuration");
  lines.push("");
  lines.push(`**Quorum Mode:** ${result.assumptions.quorumMode}`);
  if (result.assumptions.quorumMode === "static") {
    lines.push(`**Quorum Voters:** ${result.assumptions.quorumVoters.map((v) => `${v.nodeId}@${safeStr(v.host)}:${v.port}`).join(", ") || "none"}`);
  } else {
    lines.push(`**Bootstrap Servers:** ${result.assumptions.bootstrapServers.map((s) => `${safeStr(s.host)}:${s.port}`).join(", ") || "none"}`);
  }
  lines.push("");

  // Findings
  lines.push("## Findings");
  lines.push("");
  const blockers = result.findings.filter((f) => f.severity === "blocker");
  const warnings = result.findings.filter((f) => f.severity === "warning");
  const infos = result.findings.filter((f) => f.severity === "info");

  if (blockers.length > 0) {
    lines.push("### Blockers");
    lines.push("");
    for (const f of blockers) {
      lines.push(`- **[${SEVERITY_LABELS[f.severity]}]** ${f.message}`);
      if (f.detail) lines.push(`  - ${f.detail}`);
    }
    lines.push("");
  }

  if (warnings.length > 0) {
    lines.push("### Warnings");
    lines.push("");
    for (const f of warnings) {
      lines.push(`- **[${SEVERITY_LABELS[f.severity]}]** ${f.message}`);
      if (f.detail) lines.push(`  - ${f.detail}`);
    }
    lines.push("");
  }

  if (infos.length > 0) {
    lines.push("### Informational");
    lines.push("");
    for (const f of infos) {
      lines.push(`- **[${SEVERITY_LABELS[f.severity]}]** ${f.message}`);
      if (f.detail) lines.push(`  - ${f.detail}`);
    }
    lines.push("");
  }

  // Checklist
  lines.push("## Preflight Checklist");
  lines.push("");
  for (const item of result.checklist) {
    const check = item.satisfied ? "[x]" : "[ ]";
    lines.push(`- ${check} ${item.text}`);
    lines.push(`  - ${item.detail}`);
  }
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

  // Sources
  lines.push("## Sources");
  lines.push("");
  for (const source of result.sources) {
    lines.push(`- [${source.label}](${source.url}) — ${source.scope}`);
  }
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("Generated by @kafka-hub/kafka-planners/kraft. Deterministic planning aid — not a live diagnosis.");
  lines.push("This tool does NOT execute commands, change any cluster, or automatically finalize any migration.");
  lines.push("");

  const content = lines.join("\n");
  const redaction = redactSecrets(content);
  return {
    content: redaction.redacted,
    redactionSummary: redaction.entries.length > 0
      ? `${redaction.entries.length} potential secret(s) redacted. Review before sharing.`
      : "No common secret patterns detected; review before sharing.",
    redactedCount: redaction.entries.length,
  };
}

// ─── JSON Export ────────────────────────────────────────────────────────────

/**
 * Export KRaft analysis result as sanitized JSON.
 * Ensures no NaN/Infinity values appear in the output.
 */
export function exportKRaftJson(result: KRaftAnalysisResult): KRaftExportResult {
  const now = new Date().toISOString();

  const payload = {
    generatedAt: now,
    safety:
      "ZooKeeper-to-KRaft migration must complete on a supported Kafka 3.x release before upgrading to 4.x. Kafka 4.x is KRaft-only. Finalization is irreversible. This is a planning aid — not an automation tool.",
    status: result.status,
    statusLabel: STATUS_LABELS[result.status] ?? result.status,
    kafkaVersion: result.assumptions.kafkaVersion,
    metadataMode: result.assumptions.metadataMode,
    vendor: result.assumptions.vendor,
    vendorLabel: safeStr(result.assumptions.vendorLabel),
    quorumMode: result.assumptions.quorumMode,
    migrationPhase: result.phaseNavigation.currentPhase.id,
    migrationPhaseLabel: result.phaseNavigation.currentPhase.label,
    rollbackSupported: result.phaseNavigation.rollbackSupported,
    rollbackNote: result.phaseNavigation.rollbackNote,
    nextPhase: result.phaseNavigation.nextPhase?.id ?? null,
    versionBaseline: result.versionBaseline,
    findings: result.findings.map((f) => ({
      id: f.id,
      severity: f.severity,
      message: f.message,
      ...(f.detail ? { detail: f.detail } : {}),
    })),
    checklist: result.checklist.map((c) => ({
      id: c.id,
      text: c.text,
      satisfied: c.satisfied,
      detail: c.detail,
      category: c.category,
    })),
    observability: result.observability,
    sources: result.sources,
    resourceLinks: result.resourceLinks,
    assumptions: {
      kafkaVersion: result.assumptions.kafkaVersion,
      parsedVersion: result.assumptions.parsedVersion,
      metadataMode: result.assumptions.metadataMode,
      vendor: result.assumptions.vendor,
      vendorLabel: safeStr(result.assumptions.vendorLabel),
      controllerCount: safeNumber(result.assumptions.controllerCount),
      controllerNodeIds: result.assumptions.controllerNodeIds,
      brokerNodeIds: result.assumptions.brokerNodeIds,
      controllerListenerNames: result.assumptions.controllerListenerNames,
      quorumMode: result.assumptions.quorumMode,
      quorumVoters: result.assumptions.quorumVoters.map((v) => ({
        nodeId: safeNumber(v.nodeId),
        host: safeStr(v.host),
        port: safeNumber(v.port),
      })),
      bootstrapServers: result.assumptions.bootstrapServers.map((s) => ({
        host: safeStr(s.host),
        port: safeNumber(s.port),
      })),
      interBrokerConfigPresent: result.assumptions.interBrokerConfigPresent,
      controllerConfigPresent: result.assumptions.controllerConfigPresent,
      aclHealth: result.assumptions.aclHealth,
      logDirHealth: result.assumptions.logDirHealth,
      failedLogDirCount: safeNumber(result.assumptions.failedLogDirCount),
      migrationPhase: result.assumptions.migrationPhase,
      production: result.assumptions.production,
    },
    disclaimer:
      "Deterministic planning aid. Does NOT execute commands, change any cluster, or automatically finalize any migration.",
  };

  const rawJson = JSON.stringify(payload, null, 2);
  const redaction = redactSecrets(rawJson);
  return {
    content: redaction.redacted,
    redactionSummary: redaction.entries.length > 0
      ? `${redaction.entries.length} potential secret(s) redacted. Review before sharing.`
      : "No common secret patterns detected; review before sharing.",
    redactedCount: redaction.entries.length,
  };
}

// ─── Checklist Export ───────────────────────────────────────────────────────

/**
 * Export a print-friendly checklist as plain text.
 * Contains verification actions only — no commands, no automation.
 */
export function exportKRaftChecklist(result: KRaftAnalysisResult): KRaftExportResult {
  const now = new Date().toISOString();
  const lines: string[] = [];

  lines.push("KRAFT TRANSITION PREFLIGHT CHECKLIST");
  lines.push("====================================");
  lines.push("");
  lines.push("SAFETY: ZooKeeper-to-KRaft migration must complete on a supported");
  lines.push("Kafka 3.x release before upgrading to 4.x. Finalization is irreversible.");
  lines.push("This checklist is a planning aid — it does NOT execute commands.");
  lines.push("");
  lines.push(`Generated: ${now}`);
  lines.push(`Kafka Version: ${result.assumptions.kafkaVersion}`);
  lines.push(`Phase: ${result.phaseNavigation.currentPhase.label}`);
  lines.push(`Quorum Mode: ${result.assumptions.quorumMode}`);
  if (result.assumptions.quorumMode === "static") {
    lines.push(`Quorum Voters: ${result.assumptions.quorumVoters.map((v) => `${v.nodeId}@${sanitizeForDisplay(v.host)}:${v.port}`).join(", ") || "none"}`);
  } else {
    lines.push(`Bootstrap Servers: ${result.assumptions.bootstrapServers.map((s) => `${sanitizeForDisplay(s.host)}:${s.port}`).join(", ") || "none"}`);
  }
  lines.push(`Rollback: ${result.phaseNavigation.rollbackSupported ? "Supported (not risk-free)" : "NOT SUPPORTED"}`);
  lines.push(`Status: ${STATUS_LABELS[result.status] ?? result.status}`);
  lines.push("");
  lines.push("------------------------------------");
  lines.push("");

  const categories = new Map<string, KRaftChecklistItem[]>();
  for (const item of result.checklist) {
    const existing = categories.get(item.category) ?? [];
    existing.push(item);
    categories.set(item.category, existing);
  }

  for (const [category, items] of categories) {
    lines.push(`[${category.toUpperCase()}]`);
    for (const item of items) {
      const check = item.satisfied ? "[x]" : "[ ]";
      lines.push(`  ${check} ${item.text}`);
      lines.push(`      ${item.detail}`);
    }
    lines.push("");
  }

  lines.push("------------------------------------");
  lines.push("Generated by @kafka-hub/kafka-planners/kraft");
  lines.push("");

  const content = lines.join("\n");
  const redaction = redactSecrets(content);
  return {
    content: redaction.redacted,
    redactionSummary:
      redaction.entries.length > 0
        ? `${redaction.entries.length} potential secret(s) redacted. Review before sharing.`
        : "No common secret patterns detected; review before sharing.",
    redactedCount: redaction.entries.length,
  };
}
