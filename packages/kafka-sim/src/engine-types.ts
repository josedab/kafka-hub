/**
 * Public domain types for the deterministic Kafka simulator.
 */

export type BrokerId = number;
export type PartitionId = number;

export interface Broker {
  id: BrokerId;
  alive: boolean;
}

export interface LogRecord {
  /** Offset assigned by the leader. */
  offset: number;
  key: string | null;
  value: string;
}

export interface Partition {
  id: PartitionId;
  replicas: BrokerId[];
  /** Subset of replicas considered in-sync; first element is the leader. */
  isr: BrokerId[];
  /** Replica log by broker; deterministic copy. */
  logs: Record<BrokerId, LogRecord[]>;
  /** High water mark — min log end across the ISR set. */
  hw: number;
  /** Slow-follower lag (ms). Used to drive ISR shrink. */
  followerLagMs: Record<BrokerId, number>;
  /** True when the partition is compacted (cleanup.policy=compact). */
  compacted: boolean;
}

export interface Topic {
  name: string;
  partitions: Partition[];
  replicationFactor: number;
  minInsyncReplicas: number;
}

// ───────────────────────── Assignor types ─────────────────────────

/**
 * Classic protocol assignor strategies.
 * - range: Assigns partitions contiguously per topic to consumers in order.
 * - roundrobin: Round-robin assignment across all consumers.
 * - sticky: Sticky assignment minimizing partition movement.
 * - cooperative-sticky: Cooperative rebalance with sticky assignment
 *   (classic cooperative model only — NOT the KIP-848 consumer protocol).
 */
export type ClassicAssignor = "range" | "roundrobin" | "sticky" | "cooperative-sticky";

/**
 * Consumer protocol (KIP-848) assignor — always server-side uniform.
 */
export type ConsumerAssignor = "uniform";

/**
 * Combined assignor type for all protocols.
 */
export type Assignor = ClassicAssignor | ConsumerAssignor;

// ───────────────────────── Rebalance event ─────────────────────────

/**
 * Structured rebalance event emitted during consumer group changes.
 *
 * Captures all axes needed for teaching: which protocol, what moved,
 * who paused, what risk, what reconciliation state, epochs, assignor.
 */
export interface RebalanceEvent {
  /** The operation that triggered this rebalance. */
  operation: "join" | "leave" | "crash" | "restart" | "scale-out" | "rolling-restart-step";
  /** Which protocol axis is in use. */
  groupProtocol: "classic" | "consumer";
  /** For classic only — never set for consumer protocol. */
  classicAssignmentBehavior?: "eager" | "cooperative";
  /** Which assignor strategy was used for this rebalance. */
  assignor: Assignor;
  /** Group epoch (monotonic across membership changes). */
  groupEpoch: number;
  /** Per-member epoch snapshots after the operation. */
  memberEpochs: Record<string, number>;
  /** Partitions that moved between consumers: [partitionId, fromMemberId | null, toMemberId | null]. */
  movedPartitions: Array<[PartitionId, string | null, string | null]>;
  /** Partitions revoked from members this operation (includes departed members). */
  revokedPartitions: Record<string, PartitionId[]>;
  /** Partitions newly assigned to members. */
  assignedPartitions: Record<string, PartitionId[]>;
  /** Members that are paused (not processing) during this tick. */
  pausedMembers: string[];
  /** Number of ticks members are paused. */
  pauseTicks: number;
  /** Duplicate-risk level and reason. */
  duplicateRisk: {
    level: "low" | "elevated" | "high";
    reason: string;
  };
  /** Reconciliation state for KIP-848 consumer protocol. */
  reconciliationState?: "stable" | "reconciling";
  /** Partitions temporarily unassigned during transition. */
  unassignedPartitions: PartitionId[];
}

// ───────────────────────── Consumer model ─────────────────────────

export interface ConsumerInstance {
  id: string;
  /** Assigned partitions (active ownership). */
  assigned: PartitionId[];
  /** Pending partitions awaiting reconciliation (KIP-848 consumer protocol). */
  pendingAssigned: PartitionId[];
  /** Per-partition committed offset. */
  committed: Record<PartitionId, number>;
  /** Whether this consumer is currently paused (eager revoke or cooperative delta revoke). */
  paused: boolean;
  /** Member epoch (increments on assignment changes). */
  memberEpoch: number;
  /** Whether this consumer is alive (for crash/restart modeling). */
  alive: boolean;
}

/** Group protocol axis: classic (JoinGroup/SyncGroup) or consumer (KIP-848). */
export type GroupProtocol = "classic" | "consumer";

/**
 * Classic assignment behavior axis — only meaningful when groupProtocol is "classic".
 * - eager: Stop-the-world; all members revoke all partitions before reassignment.
 * - cooperative: Incremental; only moved partitions are revoked, unaffected continue.
 */
export type ClassicAssignmentBehavior = "eager" | "cooperative";

export interface ConsumerGroup {
  id: string;
  /** Protocol axis: "classic" or "consumer" (KIP-848). */
  groupProtocol: GroupProtocol;
  /** Only for classic protocol — "eager" or "cooperative". Never set for consumer protocol. */
  classicAssignmentBehavior?: ClassicAssignmentBehavior;
  /**
   * Partition assignment strategy.
   * - Classic eager defaults to "range".
   * - Classic cooperative defaults to "cooperative-sticky".
   * - Consumer protocol (KIP-848) always uses "uniform" (server-side).
   */
  assignor: Assignor;
  members: ConsumerInstance[];
  /** Approximate processing speed: records per tick per consumer. */
  consumeRatePerTick: number;
  /** Group epoch — monotonic counter incremented on every membership change. */
  groupEpoch: number;
  /** Group-level committed offsets for ownership handoff. */
  groupCommitted: Record<PartitionId, number>;
  /** History of structured rebalance events. */
  rebalanceEvents: RebalanceEvent[];
  /**
   * Group-level reconciliation state (KIP-848 consumer protocol).
   * - "stable": all pending assignments are activated; normal processing.
   * - "reconciling": membership change computed; pending assignments waiting
   *   for next step() to activate.
   * Only meaningful for consumer protocol; classic groups are always "stable".
   */
  reconciliationState: "stable" | "reconciling";

  // ── legacy compat ──
  /** @deprecated Use groupProtocol + classicAssignmentBehavior. Kept for migration. */
  protocol?: "eager" | "cooperative";
}

export interface NetworkPartition {
  /** Two disjoint sets of broker ids; brokers across the split cannot talk. */
  groupA: BrokerId[];
  groupB: BrokerId[];
}

export interface ClusterEvent {
  tick: number;
  level: "info" | "warn" | "error";
  message: string;
}

export interface ClusterState {
  tick: number;
  brokers: Broker[];
  topic: Topic;
  groups: ConsumerGroup[];
  /** Active network partition, if any. */
  netPartition: NetworkPartition | null;
  events: ClusterEvent[];
  /** Producer ack settings used by future produce() calls. */
  producerAcks: "0" | "1" | "all";
}

export interface ClusterOptions {
  brokerCount?: number;
  partitionCount?: number;
  replicationFactor?: number;
  minInsyncReplicas?: number;
  topicName?: string;
  compacted?: boolean;
  producerAcks?: "0" | "1" | "all";
}

export type ProduceResult =
  | { ok: true; partition: number; offset: number; isr: number }
  | { ok: false; partition: number; reason: string };

