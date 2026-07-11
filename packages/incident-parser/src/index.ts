/**
 * @kafka-hub/incident-parser
 *
 * Offline incident evidence parser and triage engine for Apache Kafka.
 * Accepts plain text or JSON evidence (configs, logs, stack traces,
 * kafka-consumer-groups output, metric snapshots), auto-detects evidence
 * types, and returns structured hypotheses with confidence scores.
 *
 * Framework-free. No network, no accounts, no cluster connection.
 * Runs in Node and the browser.
 */

// Core analysis
export { analyze, ENGINE_VERSION } from "./analyze";
export type { AnalysisOptions, AnalysisResult } from "./analyze";

// Types
export type {
  InputFormat,
  InputLimits,
  ValidationError,
  ValidationErrorKind,
  EvidenceKind,
  EvidenceExcerpt,
  SourceLineRef,
  ParsedEvidence,
  Hypothesis,
  HypothesisSeverity,
  ConfidenceLevel,
  ObservabilityRecommendation,
  ResourceLink,
  IncidentAnalysis,
} from "./types";

// Validation
export { validateInput, detectFormat, countLines, INPUT_LIMITS } from "./validate";

// Detection
export { detectEvidenceKinds, parseEvidence, indexLines, findMatchingLines } from "./detect";

// Signatures
export { SIGNATURES } from "./signatures";
export type { SignatureDefinition } from "./signatures";

// Export
export { exportMarkdown, exportJson, redactExcerpt } from "./export";
export type { ExportResult } from "./export";
