/**
 * Kafka failure signature registry and matching engine.
 *
 * Signature definitions are owned by failure-domain modules under
 * `signatures/`; this file is their single ordered composition point.
 */

import type { EvidenceExcerpt, EvidenceKind } from "./types";
import type { SignatureDefinition } from "./signature-types";
import { indexLines, findMatchingLines, detectEvidenceKinds } from "./detect";
import {
  DISK_STORAGE_SIGNATURE,
  ISR_MIN_ISR_SIGNATURE,
  OVERSIZED_RECORD_SIGNATURE,
} from "./signatures/data-path";
import {
  POLL_TIMEOUT_SIGNATURE,
  SERIALIZER_SIGNATURE,
  STALE_LEADER_SIGNATURE,
} from "./signatures/client";
import { AUTH_SASL_SIGNATURE } from "./signatures/security";
import {
  CONTROLLER_MOVEMENT_SIGNATURE,
  KRAFT_QUORUM_SIGNATURE,
} from "./signatures/control-plane";
import { PRODUCER_FENCING_SIGNATURE } from "./signatures/producer";

export type { SignatureDefinition } from "./signature-types";

export const SIGNATURES: readonly SignatureDefinition[] = [
  ISR_MIN_ISR_SIGNATURE,
  DISK_STORAGE_SIGNATURE,
  STALE_LEADER_SIGNATURE,
  POLL_TIMEOUT_SIGNATURE,
  AUTH_SASL_SIGNATURE,
  SERIALIZER_SIGNATURE,
  CONTROLLER_MOVEMENT_SIGNATURE,
  KRAFT_QUORUM_SIGNATURE,
  OVERSIZED_RECORD_SIGNATURE,
  PRODUCER_FENCING_SIGNATURE,
];

// ─── Matching Engine ────────────────────────────────────────────────────────

interface MatchResult {
  readonly signature: SignatureDefinition;
  readonly confidence: number;
  readonly confidenceReason: string;
  readonly supportingEvidence: readonly EvidenceExcerpt[];
  readonly conflictingEvidence: readonly EvidenceExcerpt[];
}

/**
 * Match all signatures against input evidence and return scored results.
 */
export function matchSignatures(input: string): MatchResult[] {
  const lines = indexLines(input);
  const detectedKinds = detectEvidenceKinds(input);
  const results: MatchResult[] = [];

  for (const sig of SIGNATURES) {
    const supporting: EvidenceExcerpt[] = [];
    const conflicting: EvidenceExcerpt[] = [];
    let totalWeight = sig.baseConfidence;
    const matchedPatternIds = new Set<number>();

    // Check supporting patterns
    for (let pi = 0; pi < sig.patterns.length; pi++) {
      const sp = sig.patterns[pi];
      const matchedLines = findMatchingLines(lines, sp.pattern);
      if (matchedLines.length > 0) {
        matchedPatternIds.add(pi);
        totalWeight += sp.weight;
        // Deduplicate: use first match for excerpt
        const firstMatch = matchedLines[0];
        supporting.push({
          text: firstMatch.text,
          sourceLines: matchedLines.slice(0, 3), // cap at 3 references
          kind: inferKind(firstMatch.text, sp.expectedKind, detectedKinds),
        });
      }
    }

    // Only produce a hypothesis if at least one pattern matched
    if (supporting.length === 0) continue;

    // Check conflicting patterns
    for (const cp of sig.conflicts) {
      const matchedLines = findMatchingLines(lines, cp.pattern);
      if (matchedLines.length > 0) {
        totalWeight -= cp.reduction;
        const firstMatch = matchedLines[0];
        conflicting.push({
          text: firstMatch.text,
          sourceLines: matchedLines.slice(0, 2),
          kind: inferKind(firstMatch.text, cp.expectedKind, detectedKinds),
        });
      }
    }

    // Clamp confidence to 0–100
    const confidence = Math.max(0, Math.min(100, totalWeight));
    const confidenceReason = buildConfidenceReason(
      sig,
      supporting.length,
      conflicting.length,
      confidence,
    );

    results.push({
      signature: sig,
      confidence,
      confidenceReason,
      supportingEvidence: supporting,
      conflictingEvidence: conflicting,
    });
  }

  return results;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function inferKind(
  text: string,
  expectedKind: EvidenceKind,
  detectedKinds: readonly EvidenceKind[],
): EvidenceKind {
  // If the expected kind is among detected kinds, use it
  if (detectedKinds.includes(expectedKind)) return expectedKind;
  // Fallback to first detected kind
  return detectedKinds[0] ?? "unknown";
}

function buildConfidenceReason(
  sig: SignatureDefinition,
  supportCount: number,
  conflictCount: number,
  confidence: number,
): string {
  const parts: string[] = [];

  if (supportCount >= 3) {
    parts.push(`${supportCount} matching evidence patterns`);
  } else if (supportCount === 2) {
    parts.push("2 matching patterns");
  } else {
    parts.push("1 matching pattern");
  }

  if (conflictCount > 0) {
    parts.push(`${conflictCount} conflicting signal${conflictCount > 1 ? "s" : ""} reduced confidence`);
  }

  if (confidence >= 70) {
    parts.push("strong signal alignment");
  } else if (confidence >= 40) {
    parts.push("moderate signal alignment");
  } else {
    parts.push("weak signal — more evidence needed");
  }

  return parts.join("; ");
}
