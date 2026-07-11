/**
 * @kafka-hub/kafka-planners/lag
 *
 * Consumer lag triage planner. Accepts two per-partition offset snapshots
 * and returns a deterministic analysis with classification, metrics,
 * capacity planning, and observability recommendations.
 *
 * Import:
 *   import { analyzeLag } from "@kafka-hub/kafka-planners/lag";
 *
 * Framework-free. No network, no accounts, no cluster connection.
 */

// Core analysis
export { analyzeLag } from "./analyze";

// Validation
export { validateLagInput, validateUnknownInput, DEFAULT_HOT_MULTIPLIER, DEFAULT_HOT_MIN_LAG } from "./validate";

// Export
export { exportLagMarkdown, exportLagJson, redactLabel } from "./export";
export type { LagExportResult } from "./export";

// Types
export type {
  GroupStabilityState,
  PartitionSnapshot,
  OffsetSnapshot,
  ThroughputAssumptions,
  LagTriageInput,
  ValidationIssueKind,
  ValidationIssue,
  PartitionLagResult,
  PartitionSkew,
  CapacityResult,
  DrainEta,
  ThroughputRequirements,
  LagCondition,
  ConfidenceLevel,
  ConfidenceAssessment,
  ConditionFlags,
  LagObservabilityRecommendation,
  LagResourceLink,
  AnalysisAssumptions,
  LagTriageResult,
  LagAnalysisResult,
} from "./types";
