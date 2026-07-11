/**
 * Types for the capacity and N-1 headroom planner.
 *
 * Framework-free. All types are pure data — no classes, no side effects.
 * Designed for deterministic analysis of Kafka cluster capacity and N-1
 * broker failure headroom.
 *
 * ─── Canonical Units ─────────────────────────────────────────────────────
 *
 * Internal calculations use:
 *   - records/sec      for ingress rate
 *   - bytes/record     for average record size (after serialization, before compression)
 *   - bytes/sec        for all throughput / network traffic
 *   - bytes            for all storage quantities
 *   - seconds          for all durations (retention, etc.)
 *   - dimensionless    for ratios (compression, replication factor, skew)
 *
 * The UI layer may accept user-friendly units (MiB, GiB, days) and convert
 * to canonical units before calling the planner. All conversions are the
 * caller's responsibility — the planner operates only on canonical units.
 *
 * ─── Network Accounting Model ────────────────────────────────────────────
 *
 * Cluster network traffic is modeled as the sum of:
 *   1. Producer ingress traffic (compressedIngressBytesPerSec)
 *   2. Follower replication traffic: ingress × (replicationFactor - 1)
 *      Each follower fetches the full compressed payload from the leader.
 *   3. Full-read consumer egress: ingress × fullReadConsumerGroupCount
 *      Each full-read consumer group reads the full compressed stream.
 *
 * This model accounts for the dominant traffic sources. It does not model:
 *   - Controller/metadata traffic (negligible for capacity planning)
 *   - Consumer groups reading a subset of partitions
 *   - Tiered storage offload traffic
 *   - Rack-aware replication asymmetry
 *   - Bidirectional NIC accounting (we sum logical traffic; physical NICs
 *     handle ingress and egress separately, so the per-broker figure is an
 *     approximation of the busiest direction — typically egress-dominated)
 *
 * No vendor-specific limits are implied. Per-broker network capability is
 * a user-supplied input reflecting their infrastructure.
 */

// ─── Input Types ────────────────────────────────────────────────────────────

/** Complete input to the capacity planner. All values use canonical units. */
export interface CapacityPlannerInput {
  /**
   * Peak producer ingress rate in records/sec.
   * Must be a finite positive number.
   */
  readonly peakIngressRate: number;

  /**
   * Average serialized record size in bytes/record (before compression).
   * Must be a finite positive number.
   */
  readonly avgRecordSizeBytes: number;

  /**
   * Compression ratio: compressed size / uncompressed size.
   * E.g., 0.5 means 50% compression (compressed is half of uncompressed).
   * Must be in (0, 1]. A value of 1.0 means no compression.
   *
   * This is the ratio of on-disk/on-wire size to the uncompressed payload.
   * The encoding assumption (lz4, snappy, zstd, none) is the caller's
   * responsibility — the planner uses this ratio directly.
   */
  readonly compressionRatio: number;

  /**
   * Retention duration in seconds.
   * Must be a finite positive number.
   * UI may accept days/hours and convert: 7 days = 604800 seconds.
   */
  readonly retentionSeconds: number;

  /**
   * Replication factor (RF). Must be a finite positive integer.
   * Must be <= brokerCount.
   */
  readonly replicationFactor: number;

  /**
   * Total partition count across the topic(s) being planned.
   * Must be a finite positive integer.
   */
  readonly partitionCount: number;

  /**
   * Number of brokers in the cluster.
   * Must be a finite positive integer >= 1.
   * N-1 analysis requires >= 2 brokers.
   */
  readonly brokerCount: number;

  /**
   * Number of consumer groups performing a full read of the data.
   * Must be a finite non-negative integer.
   * 0 means no full-read consumers (only replication traffic).
   */
  readonly fullReadConsumerGroupCount: number;

  /**
   * Target throughput per partition in bytes/sec (compressed).
   * Used to calculate the minimum partition count.
   * Must be a finite positive number.
   */
  readonly perPartitionTargetThroughput: number;

  /**
   * Usable storage capacity per broker in bytes.
   * "Usable" means the amount available for Kafka log data after OS,
   * system partitions, and operational headroom are subtracted.
   * Must be a finite positive number.
   */
  readonly perBrokerStorageBytes: number;

  /**
   * Sustainable network capability per broker in bytes/sec.
   * This is the practical throughput the broker's NIC can sustain
   * for Kafka traffic after subtracting overhead.
   * Must be a finite positive number.
   */
  readonly perBrokerNetworkBytesPerSec: number;

  /**
   * Optional safety/headroom target as a fraction in (0, 1).
   * E.g., 0.8 means the plan targets ≤ 80% utilization.
   * Default: 0.7 (70% utilization target, 30% headroom).
   * When provided, must be in (0, 1).
   */
  readonly safetyHeadroomTarget?: number;

  /**
   * Optional partition skew factor >= 1.0.
   * Represents how much more traffic the hottest partition receives
   * compared to the average. E.g., 2.0 means the hottest partition
   * gets 2× the average load.
   * Default: 1.0 (perfectly balanced).
   * When provided, must be >= 1.0.
   */
  readonly skewFactor?: number;
}

// ─── Validation ─────────────────────────────────────────────────────────────

/** Categories of validation issues. */
export type CapacityValidationIssueKind =
  | "invalid-root"
  | "invalid-field-type"
  | "non-finite-value"
  | "non-positive-value"
  | "non-negative-value"
  | "non-integer-value"
  | "rf-exceeds-brokers"
  | "n1-requires-two-brokers"
  | "compression-ratio-range"
  | "safety-headroom-range"
  | "skew-factor-range"
  | "retention-overflow";

/** A single validation issue. */
export interface CapacityValidationIssue {
  readonly kind: CapacityValidationIssueKind;
  readonly field: string;
  readonly message: string;
}

// ─── Analysis Results ───────────────────────────────────────────────────────

/** Storage calculation breakdown. */
export interface StorageBreakdown {
  /** Logical uncompressed ingress: peakIngressRate × avgRecordSizeBytes (bytes/sec). */
  readonly logicalUncompressedIngressBytesPerSec: number;
  /** Logical uncompressed retained bytes: logicalUncompressedIngress × retentionSeconds. */
  readonly logicalUncompressedRetainedBytes: number;
  /** Compressed primary retained bytes: logicalUncompressedRetainedBytes × compressionRatio. */
  readonly compressedPrimaryRetainedBytes: number;
  /** Physical retained bytes with RF: compressedPrimaryRetainedBytes × replicationFactor. */
  readonly physicalRetainedBytes: number;
}

/** Network traffic breakdown. */
export interface NetworkBreakdown {
  /** Compressed ingress: logicalUncompressedIngressBytesPerSec × compressionRatio (bytes/sec). */
  readonly compressedIngressBytesPerSec: number;
  /** Follower replication traffic: compressedIngress × (RF - 1) (bytes/sec). */
  readonly followerReplicationBytesPerSec: number;
  /** Full-read consumer read fan-out: compressedIngress × fullReadConsumerGroupCount (bytes/sec). */
  readonly consumerReadBytesPerSec: number;
  /** Total cluster network traffic: ingress + replication + consumer read (bytes/sec). */
  readonly totalClusterNetworkBytesPerSec: number;
}

/** Partition analysis. */
export interface PartitionAnalysis {
  /** Minimum partitions from per-partition target: ceil(compressedIngress / perPartitionTargetThroughput). */
  readonly minimumPartitionsFromTarget: number;
  /** Whether the configured partition count meets the minimum. */
  readonly partitionCountSufficient: boolean;
  /** Average per-partition throughput: compressedIngress / partitionCount (bytes/sec). */
  readonly avgPerPartitionThroughput: number;
  /** Skew-adjusted hottest partition throughput: avgPerPartitionThroughput × skewFactor (bytes/sec). */
  readonly skewAdjustedHottestPartitionThroughput: number;
  /** Whether the hottest partition exceeds the per-partition target. */
  readonly hottestPartitionExceedsTarget: boolean;
}

/** Per-broker load (average or N-1). */
export interface BrokerLoad {
  /** Label for this load scenario. */
  readonly scenario: "average" | "n-1";
  /** Number of brokers carrying load in this scenario. */
  readonly activeBrokers: number;
  /** Storage per broker: physicalRetainedBytes / activeBrokers (bytes). */
  readonly storagePerBroker: number;
  /** Network per broker: totalClusterNetworkBytesPerSec / activeBrokers (bytes/sec). */
  readonly networkPerBroker: number;
  /** Storage utilization: storagePerBroker / perBrokerStorageBytes. */
  readonly storageUtilization: number;
  /** Network utilization: networkPerBroker / perBrokerNetworkBytesPerSec. */
  readonly networkUtilization: number;
  /** Storage headroom: 1 - storageUtilization. */
  readonly storageHeadroom: number;
  /** Network headroom: 1 - networkUtilization. */
  readonly networkHeadroom: number;
  /** Whether storage utilization exceeds the safety target. */
  readonly storageExceedsSafetyTarget: boolean;
  /** Whether network utilization exceeds the safety target. */
  readonly networkExceedsSafetyTarget: boolean;
  /** Whether storage utilization exceeds 100% (absolute shortfall). */
  readonly storageShortfall: boolean;
  /** Whether network utilization exceeds 100% (absolute shortfall). */
  readonly networkShortfall: boolean;
}

/** Overall capacity status. */
export type CapacityStatus =
  | "pass"
  | "warning"
  | "fail";

/** A capacity warning. */
export interface CapacityWarning {
  readonly id: string;
  readonly severity: "critical" | "warning" | "info";
  readonly message: string;
}

/** Observability recommendation. */
export interface CapacityObservabilityRecommendation {
  /** Metric or signal name. */
  readonly metric: string;
  /** What it measures, including units. */
  readonly description: string;
  /** Why this metric matters for capacity planning. */
  readonly rationale: string;
  /** When this signal is NOT sufficient alone. */
  readonly caveat: string;
}

/** A cross-link to a related Kafka Hub resource. */
export interface CapacityResourceLink {
  readonly label: string;
  readonly href: string;
  readonly surface: "learn" | "runbooks" | "errors" | "simulate" | "diagnose" | "workbench";
}

/** The explicit assumptions the planner used. */
export interface CapacityAnalysisAssumptions {
  readonly peakIngressRate: number;
  readonly avgRecordSizeBytes: number;
  readonly compressionRatio: number;
  readonly retentionSeconds: number;
  readonly replicationFactor: number;
  readonly partitionCount: number;
  readonly brokerCount: number;
  readonly fullReadConsumerGroupCount: number;
  readonly perPartitionTargetThroughput: number;
  readonly perBrokerStorageBytes: number;
  readonly perBrokerNetworkBytesPerSec: number;
  readonly safetyHeadroomTarget: number;
  readonly skewFactor: number;
}

/** Complete capacity analysis result. */
export interface CapacityAnalysisResult {
  /** Storage calculations. */
  readonly storage: StorageBreakdown;
  /** Network traffic calculations. */
  readonly network: NetworkBreakdown;
  /** Partition analysis. */
  readonly partitions: PartitionAnalysis;
  /** Average broker load (all brokers healthy). */
  readonly averageLoad: BrokerLoad;
  /** N-1 broker load (one broker unavailable). Only present when brokerCount >= 2. */
  readonly n1Load?: BrokerLoad;
  /** Overall capacity status. */
  readonly status: CapacityStatus;
  /** Warnings and recommendations. */
  readonly warnings: readonly CapacityWarning[];
  /** Observability recommendations. */
  readonly recommendations: readonly CapacityObservabilityRecommendation[];
  /** Resource links. */
  readonly resourceLinks: readonly CapacityResourceLink[];
  /** Assumptions used for transparency. */
  readonly assumptions: CapacityAnalysisAssumptions;
}

// ─── Analysis Result (discriminated union) ──────────────────────────────────

/** Successful analysis or validation failure. */
export type CapacityPlannerResult =
  | { readonly ok: true; readonly result: CapacityAnalysisResult }
  | { readonly ok: false; readonly issues: readonly CapacityValidationIssue[] };
