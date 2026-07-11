/**
 * Export / sanitization module for incident analysis results.
 *
 * Produces Markdown and JSON exports with secret redaction.
 * Reuses @kafka-hub/kafka-diagnose redaction primitives to avoid
 * duplicating weaker secret detection logic.
 *
 * Never includes raw evidence in exports — only excerpts that
 * have been through redaction. Shows exactly what was redacted.
 */

import type {
  EvidenceExcerpt,
  IncidentAnalysis,
  Hypothesis,
} from "./types";
import {
  redactSecrets,
  type RedactionEntry,
  type RedactionResult,
} from "@kafka-hub/kafka-diagnose";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ExportResult {
  /** The exported content (Markdown or JSON string). */
  readonly content: string;
  /** Summary of what was redacted. */
  readonly redactionSummary: string;
  /** Number of secrets redacted. */
  readonly redactedCount: number;
  /** Keys that were redacted. */
  readonly redactedKeys: readonly string[];
}

// ─── Redaction Helper ───────────────────────────────────────────────────────

/**
 * Redact secrets from an evidence excerpt string.
 * Delegates to kafka-diagnose's redactSecrets for consistent behavior.
 */
export function redactExcerpt(text: string): RedactionResult {
  return redactSecrets(text);
}

/**
 * Redact all evidence excerpts in an analysis result.
 * Returns a new analysis with redacted excerpts and a summary.
 */
function redactAnalysis(analysis: IncidentAnalysis): {
  redacted: IncidentAnalysis;
  totalRedacted: number;
  redactedKeys: string[];
} {
  const redactedOccurrences = new Set<string>();
  const allKeys = new Set<string>();

  const recordEntries = (
    entries: readonly RedactionEntry[],
    sourceLine: number,
  ) => {
    for (const entry of entries) {
      redactedOccurrences.add(
        `${sourceLine}:${entry.key}:${entry.category}`,
      );
      allKeys.add(entry.key);
    }
  };

  const redactEvidence = (evidence: EvidenceExcerpt): EvidenceExcerpt => {
    const excerptResult = redactExcerpt(evidence.text);
    const sourceLines = evidence.sourceLines.map((sourceLine) => {
      const lineResult = redactExcerpt(sourceLine.text);
      recordEntries(lineResult.entries, sourceLine.line);
      return { ...sourceLine, text: lineResult.redacted };
    });

    // Evidence excerpts normally duplicate their first source line. Count
    // from source lines so one secret occurrence is not reported twice.
    if (sourceLines.length === 0) {
      recordEntries(excerptResult.entries, 0);
    }

    return {
      ...evidence,
      text: excerptResult.redacted,
      sourceLines,
    };
  };

  const redactedHypotheses = analysis.hypotheses.map((h): Hypothesis => ({
    ...h,
    supportingEvidence: h.supportingEvidence.map(redactEvidence),
    conflictingEvidence: h.conflictingEvidence.map(redactEvidence),
  }));

  return {
    redacted: { ...analysis, hypotheses: redactedHypotheses },
    totalRedacted: redactedOccurrences.size,
    redactedKeys: [...allKeys].sort(),
  };
}

// ─── Markdown Export ────────────────────────────────────────────────────────

/**
 * Export analysis as sanitized Markdown.
 */
export function exportMarkdown(analysis: IncidentAnalysis): ExportResult {
  const { redacted, totalRedacted, redactedKeys } = redactAnalysis(analysis);
  const lines: string[] = [];

  lines.push("# Kafka Incident Triage Report");
  lines.push("");
  lines.push(`**Analyzed:** ${redacted.analyzedAt}`);
  lines.push(`**Engine version:** ${redacted.engineVersion}`);
  lines.push(`**Evidence:** ${redacted.evidence.byteCount} bytes, ${redacted.evidence.lineCount} lines`);
  lines.push(`**Detected types:** ${redacted.evidence.kinds.join(", ")}`);
  lines.push("");

  if (totalRedacted > 0) {
    lines.push(`> **Redacted:** ${totalRedacted} secret(s) removed from evidence excerpts.`);
    if (redactedKeys.length > 0) {
      lines.push(`> Keys: ${redactedKeys.join(", ")}`);
    }
    lines.push("");
  }

  if (redacted.hypotheses.length === 0) {
    lines.push("## No matching signatures");
    lines.push("");
    lines.push("No known Kafka failure signatures matched the provided evidence.");
    lines.push("This does not mean the evidence is clean — it may represent a");
    lines.push("scenario not yet covered by the pattern library.");
  } else {
    lines.push(`## Hypotheses (${redacted.hypotheses.length})`);
    lines.push("");

    for (const h of redacted.hypotheses) {
      lines.push(`### ${h.title}`);
      lines.push("");
      lines.push(`- **ID:** \`${h.id}\``);
      lines.push(`- **Severity:** ${h.severity}`);
      lines.push(`- **Confidence:** ${h.confidence}%`);
      lines.push(`- **Reason:** ${h.confidenceReason}`);
      lines.push("");

      if (h.supportingEvidence.length > 0) {
        lines.push("**Supporting evidence:**");
        lines.push("");
        for (const e of h.supportingEvidence) {
          const lineRefs = e.sourceLines.map((sl) => `L${sl.line}`).join(", ");
          lines.push(`- \`${e.text}\` (${e.kind}, ${lineRefs})`);
        }
        lines.push("");
      }

      if (h.conflictingEvidence.length > 0) {
        lines.push("**Conflicting evidence:**");
        lines.push("");
        for (const e of h.conflictingEvidence) {
          const lineRefs = e.sourceLines.map((sl) => `L${sl.line}`).join(", ");
          lines.push(`- \`${e.text}\` (${e.kind}, ${lineRefs})`);
        }
        lines.push("");
      }

      if (h.missingEvidence.length > 0) {
        lines.push("**Missing evidence:**");
        lines.push("");
        for (const me of h.missingEvidence) {
          lines.push(`- ${me}`);
        }
        lines.push("");
      }

      if (h.recommendedNextEvidence.length > 0) {
        lines.push("**Recommended next evidence:**");
        lines.push("");
        for (const re of h.recommendedNextEvidence) {
          lines.push(`- ${re}`);
        }
        lines.push("");
      }

      if (h.observability.length > 0) {
        lines.push("**Observability recommendations:**");
        lines.push("");
        for (const obs of h.observability) {
          lines.push(`- **${obs.metric}**: ${obs.description}`);
          lines.push(`  - Rationale: ${obs.rationale}`);
          lines.push(`  - Caveat: ${obs.caveat}`);
        }
        lines.push("");
      }

      if (h.resourceLinks.length > 0) {
        lines.push("**Resources:**");
        lines.push("");
        for (const rl of h.resourceLinks) {
          lines.push(`- [${rl.label}](${rl.href})`);
        }
        lines.push("");
      }

      lines.push("---");
      lines.push("");
    }
  }

  lines.push("");
  lines.push("## Assumptions and source notes");
  lines.push("");
  lines.push("- This analysis is based on static pattern matching against known Kafka failure signatures.");
  lines.push("- No live cluster connection was used. Results are hypotheses, not diagnoses.");
  lines.push("- Confidence scores reflect pattern match strength, not certainty of root cause.");
  lines.push("- Evidence was processed locally. No data was sent to any external service.");
  lines.push(`- Generated by @kafka-hub/incident-parser v${redacted.engineVersion}.`);
  lines.push("");

  const content = lines.join("\n");
  const redactionSummary = totalRedacted > 0
    ? `Redacted ${totalRedacted} potential secret(s): ${redactedKeys.join(", ")}. Review before sharing.`
    : "No common secret patterns detected in evidence excerpts; review before sharing.";

  return {
    content,
    redactionSummary,
    redactedCount: totalRedacted,
    redactedKeys,
  };
}

// ─── JSON Export ────────────────────────────────────────────────────────────

/**
 * Export analysis as sanitized JSON.
 */
export function exportJson(analysis: IncidentAnalysis): ExportResult {
  const { redacted, totalRedacted, redactedKeys } = redactAnalysis(analysis);

  const payload = {
    generatedAt: redacted.analyzedAt,
    engineVersion: redacted.engineVersion,
    evidence: redacted.evidence,
    hypotheses: redacted.hypotheses,
    ...(totalRedacted > 0 ? {
      redacted: {
        count: totalRedacted,
        keys: redactedKeys,
      },
    } : {}),
    assumptions: [
      "Static pattern matching — not a live diagnosis.",
      "Confidence reflects match strength, not certainty.",
      "No data sent to external services.",
    ],
  };

  const content = JSON.stringify(payload, null, 2);
  const redactionSummary = totalRedacted > 0
    ? `Redacted ${totalRedacted} potential secret(s): ${redactedKeys.join(", ")}. Review before sharing.`
    : "No common secret patterns detected in evidence excerpts; review before sharing.";

  return {
    content,
    redactionSummary,
    redactedCount: totalRedacted,
    redactedKeys,
  };
}
