/**
 * Compatibility facade for consumer-group behavior.
 *
 * Keep engine and package imports stable while internal modules own protocol
 * resolution, lifecycle operations, assignment, and per-tick processing.
 */

export {
  addConsumerGroup,
  consumerCrash,
  consumerJoin,
  consumerLeave,
  consumerRestart,
  consumerRollingRestartStep,
  consumerScaleOut,
} from "./consumer-group-lifecycle";
export { advanceConsumerGroups } from "./consumer-group-tick";
