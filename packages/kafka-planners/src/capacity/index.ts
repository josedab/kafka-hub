/**
 * @kafka-hub/kafka-planners/capacity
 *
 * Capacity and N-1 headroom planner. Accepts cluster parameters and returns
 * a deterministic analysis with storage/network breakdown, per-broker load,
 * N-1 failure headroom, warnings, and observability recommendations.
 *
 * Import:
 *   import { analyzeCapacity } from "@kafka-hub/kafka-planners/capacity";
 *
 * Framework-free. No network, no accounts, no cluster connection.
 */

// Core analysis
export { analyzeCapacity } from "./analyze";

// Validation
export {
  validateUnknownCapacityInput,
  validateCapacityInput,
  DEFAULT_SAFETY_HEADROOM_TARGET,
  DEFAULT_SKEW_FACTOR,
} from "./validate";

// Export
export { exportCapacityMarkdown, exportCapacityJson, redactCapacityLabel } from "./export";
export type { CapacityExportResult } from "./export";

// Types
export type {
  CapacityPlannerInput,
  CapacityValidationIssueKind,
  CapacityValidationIssue,
  StorageBreakdown,
  NetworkBreakdown,
  PartitionAnalysis,
  BrokerLoad,
  CapacityStatus,
  CapacityWarning,
  CapacityObservabilityRecommendation,
  CapacityResourceLink,
  CapacityAnalysisAssumptions,
  CapacityAnalysisResult,
  CapacityPlannerResult,
} from "./types";
