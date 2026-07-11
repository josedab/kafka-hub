/**
 * @kafka-hub/kafka-planners/kraft
 *
 * KRaft Transition and Kafka 4.x Readiness Planner. Accepts cluster
 * parameters and returns a deterministic analysis with migration phase
 * navigation, readiness findings, preflight checklist, observability
 * recommendations, and source citations.
 *
 * Import:
 *   import { analyzeKRaft } from "@kafka-hub/kafka-planners/kraft";
 *
 * Core safety: ZooKeeper-to-KRaft migration must complete on a supported
 * Kafka 3.x release before upgrading to 4.x. Kafka 4.x is KRaft-only.
 * Finalization is irreversible. This tool does NOT execute commands,
 * change any cluster, or automatically finalize any migration.
 *
 * Framework-free. No network, no accounts, no cluster connection.
 */

// Core analysis
export { analyzeKRaft } from "./analyze";
export { VERSION_BASELINE, SOURCES, RESOURCE_LINKS } from "./reference-data";

// Validation
export {
  validateUnknownKRaftInput,
  validateKRaftInput,
  parseKafkaVersion,
  compareVersions,
  isKRaftOnlyVersion,
  isFinalZookeeperLine,
  supportsMigration,
  isKRaftBridgeCandidate,
  isSafeLabel,
  isSafeHost,
  isSafeListenerName,
  sanitizeForDisplay,
  MIN_MIGRATION_VERSION,
  MIN_KRAFT_BRIDGE_VERSION,
  RECOMMENDED_MIGRATION_VERSION,
  KRAFT_ONLY_MAJOR,
} from "./validate";

// Export
export {
  exportKRaftMarkdown,
  exportKRaftJson,
  exportKRaftChecklist,
  redactKRaftLabel,
} from "./export";
export type { KRaftExportResult } from "./export";

// Types
export type {
  KRaftMigrationPhaseId,
  KRaftMigrationPhase,
  KRaftMetadataMode,
  KRaftVendor,
  KRaftAclHealth,
  KRaftLogDirHealth,
  KRaftQuorumVoter,
  KRaftQuorumMode,
  KRaftBootstrapServer,
  KRaftPlannerInput,
  KRaftValidationIssueKind,
  KRaftValidationIssue,
  ParsedKafkaVersion,
  KRaftReadinessStatus,
  KRaftFindingSeverity,
  KRaftFinding,
  KRaftPhaseNavigation,
  KRaftChecklistItem,
  KRaftChecklistCategory,
  KRaftObservabilityRecommendation,
  KRaftResourceLink,
  KRaftSourceCitation,
  KRaftVersionBaseline,
  KRaftAnalysisAssumptions,
  KRaftAnalysisResult,
  KRaftPlannerResult,
} from "./types";

// Re-export phase model
export { KRAFT_MIGRATION_PHASES } from "./types";
