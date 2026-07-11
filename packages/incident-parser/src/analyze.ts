/**
 * Main analysis engine.
 *
 * Orchestrates validation, evidence detection, signature matching,
 * and hypothesis construction. Returns a structured IncidentAnalysis.
 *
 * Analysis content and ordering are deterministic. The default analyzedAt
 * value uses wall time; inject a timestamp or clock for identical full output.
 */

import type {
  Hypothesis,
  IncidentAnalysis,
  ValidationError,
} from "./types";
import { validateInput } from "./validate";
import { parseEvidence } from "./detect";
import { matchSignatures } from "./signatures";

/** Engine version for reproducibility tracking. */
export const ENGINE_VERSION = 1;

/** Result is either a successful analysis or a validation error. */
export type AnalysisResult =
  | { readonly ok: true; readonly analysis: IncidentAnalysis }
  | { readonly ok: false; readonly error: ValidationError };

export interface AnalysisOptions {
  /** Stable timestamp for deterministic callers and tests. */
  readonly analyzedAt?: string;
  /** Injectable clock used when analyzedAt is omitted. */
  readonly now?: () => Date;
}

/**
 * Analyze incident evidence.
 *
 * Validates input, detects evidence types, matches Kafka failure signatures,
 * and returns structured hypotheses with confidence scores.
 *
 * @param input - Raw evidence text or JSON
 * @returns Discriminated union: ok=true with analysis, or ok=false with error
 */
export function analyze(
  input: string,
  options: AnalysisOptions = {},
): AnalysisResult {
  // 1. Validate input
  const validationError = validateInput(input);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  // 2. Parse evidence metadata
  const evidence = parseEvidence(input);

  // 3. Match signatures
  const matches = matchSignatures(input);

  // 4. Build hypotheses with deduplication
  const seen = new Set<string>();
  const hypotheses: Hypothesis[] = [];

  for (const match of matches) {
    // Deduplicate by signature ID
    if (seen.has(match.signature.id)) continue;
    seen.add(match.signature.id);

    hypotheses.push({
      id: match.signature.id,
      title: match.signature.title,
      severity: match.signature.severity,
      confidence: match.confidence,
      confidenceReason: match.confidenceReason,
      supportingEvidence: match.supportingEvidence,
      conflictingEvidence: match.conflictingEvidence,
      missingEvidence: match.signature.missingEvidence,
      recommendedNextEvidence: match.signature.recommendedNextEvidence,
      resourceLinks: match.signature.resourceLinks,
      observability: match.signature.observability,
    });
  }

  // 5. Deterministic ordering: confidence desc, then severity priority, then id
  const severityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  hypotheses.sort((a, b) => {
    // Higher confidence first
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    // Higher severity first
    const sa = severityOrder[a.severity] ?? 9;
    const sb = severityOrder[b.severity] ?? 9;
    if (sa !== sb) return sa - sb;
    // Alphabetical by id for stability
    return a.id.localeCompare(b.id);
  });

  return {
    ok: true,
    analysis: {
      evidence,
      hypotheses,
      analyzedAt:
        options.analyzedAt ??
        (options.now ?? (() => new Date()))().toISOString(),
      engineVersion: ENGINE_VERSION,
    },
  };
}
