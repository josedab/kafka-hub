/**
 * Compatibility facade for KRaft planner validation.
 *
 * Public callers can continue importing from this module while the
 * implementation remains separated by responsibility.
 */

export { validateKRaftInput } from "./validate-domain";
export { validateUnknownKRaftInput } from "./validate-unknown";
export {
  isSafeHost,
  isSafeLabel,
  isSafeListenerName,
  sanitizeForDisplay,
} from "./validation-guards";
export {
  compareVersions,
  isFinalZookeeperLine,
  isKRaftBridgeCandidate,
  isKRaftOnlyVersion,
  KRAFT_ONLY_MAJOR,
  MIN_KRAFT_BRIDGE_VERSION,
  MIN_MIGRATION_VERSION,
  parseKafkaVersion,
  RECOMMENDED_MIGRATION_VERSION,
  supportsMigration,
} from "./version";
