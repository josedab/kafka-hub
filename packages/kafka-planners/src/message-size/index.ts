/**
 * @kafka-hub/kafka-planners/message-size
 *
 * Message-size chain checker. Accepts pipeline size parameters and returns
 * a deterministic analysis with ordered stage chain, first-failure
 * identification, zone classification, aligned .properties patch,
 * blob storage recommendation, and observability recommendations.
 *
 * Import:
 *   import { analyzeMessageSize } from "@kafka-hub/kafka-planners/message-size";
 *
 * Framework-free. No network, no accounts, no cluster connection.
 */

// Core analysis
export { analyzeMessageSize } from "./analyze";
export { RESOURCE_LINKS } from "./recommendations";

// Validation
export {
  validateUnknownMessageSizeInput,
  validateMessageSizeInput,
  DEFAULT_SAFETY_HEADROOM_FRACTION,
  DEFAULT_BLOB_STORAGE_THRESHOLD_BYTES,
} from "./validate";

// Export
export { exportMessageSizeMarkdown, exportMessageSizeJson, redactMessageSizeLabel } from "./export";
export type { MessageSizeExportResult } from "./export";

// Types
export type {
  TopicOverride,
  MessageSizeInput,
  MessageSizeValidationIssueKind,
  MessageSizeValidationIssue,
  MessageSizeStageId,
  MessageSizeStageStatus,
  MessageSizeStageResult,
  MessageSizeZone,
  MessageSizeAlignmentGap,
  MessageSizePatchEntry,
  MessageSizePatch,
  BlobStorageRecommendation,
  MessageSizeObservabilityRecommendation,
  MessageSizeResourceLink,
  MessageSizeAnalysisAssumptions,
  MessageSizeAnalysisResult,
  MessageSizePlannerResult,
} from "./types";
