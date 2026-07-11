import type {
  EvidenceKind,
  HypothesisSeverity,
  ObservabilityRecommendation,
  ResourceLink,
} from "./types";

export interface SignaturePattern {
  readonly pattern: RegExp;
  readonly weight: number;
  readonly expectedKind: EvidenceKind;
}

export interface ConflictPattern {
  readonly pattern: RegExp;
  readonly reduction: number;
  readonly expectedKind: EvidenceKind;
}

export interface SignatureDefinition {
  readonly id: string;
  readonly title: string;
  readonly severity: HypothesisSeverity;
  readonly baseConfidence: number;
  readonly patterns: readonly SignaturePattern[];
  readonly conflicts: readonly ConflictPattern[];
  readonly missingEvidence: readonly string[];
  readonly recommendedNextEvidence: readonly string[];
  readonly resourceLinks: readonly ResourceLink[];
  readonly observability: readonly ObservabilityRecommendation[];
}
