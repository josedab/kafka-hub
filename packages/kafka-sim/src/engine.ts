/**
 * Deterministic Kafka simulator public API.
 *
 * The implementation is split by domain ownership while this facade preserves
 * the package's original imports and public surface.
 */

export type {
  Assignor,
  Broker,
  BrokerId,
  ClassicAssignmentBehavior,
  ClassicAssignor,
  ClusterEvent,
  ClusterOptions,
  ClusterState,
  ConsumerAssignor,
  ConsumerGroup,
  ConsumerInstance,
  GroupProtocol,
  LogRecord,
  NetworkPartition,
  Partition,
  PartitionId,
  ProduceResult,
  RebalanceEvent,
  Topic,
} from "./engine-types";

export { createCluster } from "./state";
export {
  addConsumerGroup,
  consumerCrash,
  consumerJoin,
  consumerLeave,
  consumerRestart,
  consumerRollingRestartStep,
  consumerScaleOut,
} from "./consumer-groups";
export {
  healPartition,
  inducePartition,
  killBroker,
  produce,
  reviveBroker,
  shrinkIsrLag,
  step,
} from "./operations";
export { totalLag } from "./inspection";
