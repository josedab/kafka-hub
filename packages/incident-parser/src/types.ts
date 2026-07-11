/**
 * Core types for the incident evidence parser and triage engine.
 *
 * Framework-free. Uses only the workspace diagnose package for shared
 * redaction behavior.
 */

// ─── Input / Validation ─────────────────────────────────────────────────────

/** Supported input formats. */
export type InputFormat = "text" | "json";

/** Why input was rejected. */
export type ValidationErrorKind =
  | "empty"
  | "too-large"
  | "too-many-lines"
  | "unsupported-binary"
  | "malformed-json";

export interface ValidationError {
  readonly kind: ValidationErrorKind;
  readonly message: string;
  /** The limit that was exceeded, if applicable. */
  readonly limit?: number;
  /** The actual value that exceeded the limit. */
  readonly actual?: number;
}

/** Documented input limits. */
export interface InputLimits {
  /** Maximum input size in bytes. */
  readonly maxBytes: number;
  /** Maximum number of lines. */
  readonly maxLines: number;
}

// ─── Evidence ───────────────────────────────────────────────────────────────

/** What kind of evidence the input represents. */
export type EvidenceKind =
  | "broker-log"
  | "client-log"
  | "consumer-groups-output"
  | "stack-trace"
  | "config"
  | "metric-snapshot"
  | "unknown";

/** A reference to a specific source line in the evidence. */
export interface SourceLineRef {
  /** 1-based line number. */
  readonly line: number;
  /** The raw text of that line (trimmed). */
  readonly text: string;
}

/** A parsed piece of evidence extracted from the input. */
export interface EvidenceExcerpt {
  /** What was matched. */
  readonly text: string;
  /** Where it was found. */
  readonly sourceLines: readonly SourceLineRef[];
  /** Auto-detected kind of this evidence. */
  readonly kind: EvidenceKind;
}

/** Result of parsing and classifying the input. */
export interface ParsedEvidence {
  /** The auto-detected format. */
  readonly format: InputFormat;
  /** Auto-detected evidence kinds present in the input. */
  readonly kinds: readonly EvidenceKind[];
  /** Total lines in the input. */
  readonly lineCount: number;
  /** Total bytes in the input. */
  readonly byteCount: number;
}

// ─── Hypotheses ─────────────────────────────────────────────────────────────

/** Severity of a hypothesis. */
export type HypothesisSeverity = "critical" | "high" | "medium" | "low";

/** Confidence level (human-readable). */
export type ConfidenceLevel = "high" | "moderate" | "low";

/** Observability recommendation attached to a hypothesis. */
export interface ObservabilityRecommendation {
  /** Metric or signal name. */
  readonly metric: string;
  /** What the metric measures, including units. */
  readonly description: string;
  /** Why this metric matters for this specific incident. */
  readonly rationale: string;
  /** When this signal is NOT sufficient alone. */
  readonly caveat: string;
}

/** A cross-link to a related Kafka Hub resource. */
export interface ResourceLink {
  /** Human-readable label. */
  readonly label: string;
  /** Local path (e.g., "/learn/isr-and-acks"). */
  readonly href: string;
  /** Which surface. */
  readonly surface: "learn" | "runbooks" | "errors" | "simulate" | "diagnose" | "workbench";
}

/** A single triage hypothesis. */
export interface Hypothesis {
  /** Stable machine identifier (e.g., "isr-min-isr-failure"). */
  readonly id: string;
  /** Human-readable title. */
  readonly title: string;
  /** Severity assessment. */
  readonly severity: HypothesisSeverity;
  /** Numeric confidence 0–100. */
  readonly confidence: number;
  /** Human-readable explanation of confidence. */
  readonly confidenceReason: string;
  /** Evidence excerpts supporting this hypothesis. */
  readonly supportingEvidence: readonly EvidenceExcerpt[];
  /** Evidence that conflicts with this hypothesis. */
  readonly conflictingEvidence: readonly EvidenceExcerpt[];
  /** What evidence is missing that would confirm/deny. */
  readonly missingEvidence: readonly string[];
  /** What additional evidence to gather next. */
  readonly recommendedNextEvidence: readonly string[];
  /** Cross-links to relevant hub resources. */
  readonly resourceLinks: readonly ResourceLink[];
  /** Observability recommendations. */
  readonly observability: readonly ObservabilityRecommendation[];
}

// ─── Analysis Result ────────────────────────────────────────────────────────

/** Complete analysis result. */
export interface IncidentAnalysis {
  /** Parsed evidence metadata. */
  readonly evidence: ParsedEvidence;
  /** Hypotheses, deterministically ordered by confidence desc, then severity. */
  readonly hypotheses: readonly Hypothesis[];
  /** Timestamp of analysis. */
  readonly analyzedAt: string;
  /** Engine version for reproducibility. */
  readonly engineVersion: number;
}
