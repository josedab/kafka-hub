/**
 * @kafka-hub/kafka-planners/dr
 *
 * DR Tabletop Planner. Accepts replication timing parameters and returns
 * deterministic RPO/RTO estimates, duplicate exposure analysis, phase
 * checklists, observability recommendations, and strategy notes.
 *
 * Import:
 *   import { analyzeDr } from "@kafka-hub/kafka-planners/dr";
 *
 * Framework-free. No network, no accounts, no cluster connection.
 * Does NOT execute commands or automate failover.
 */

// Core analysis
export { analyzeDr } from "./analyze";
export { RESOURCE_LINKS } from "./recommendations";

// Validation
export { validateDrInput, validateUnknownInput } from "./validate";

// Export
export { exportDrMarkdown, exportDrJson, exportDrChecklist } from "./export";
export type { DrExportResult } from "./export";

// Types
export type {
  DrReplicationStrategy,
  DrTabletopInput,
  DrValidationIssueKind,
  DrValidationIssue,
  DrScenarioEstimate,
  DrFormulaComponent,
  DrRpoEstimates,
  DrRtoEstimates,
  DrDuplicateExposure,
  DrPhaseId,
  DrChecklistItem,
  DrChecklistCategory,
  DrPhaseChecklist,
  DrObservabilityRecommendation,
  DrWarning,
  DrStrategyNotes,
  DrResourceLink,
  DrReadinessStatus,
  DrAnalysisAssumptions,
  DrTabletopResult,
  DrAnalysisResult,
} from "./types";

export { DR_REPLICATION_STRATEGIES, DR_PHASE_IDS } from "./types";
