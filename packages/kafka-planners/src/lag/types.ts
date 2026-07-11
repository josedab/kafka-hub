/**
 * Types for the consumer lag triage planner.
 *
 * Framework-free. All types are pure data — no classes, no side effects.
 * Designed for deterministic analysis of two per-partition offset snapshots.
 */

// ─── Input Types ────────────────────────────────────────────────────────────

/** Consumer group stability state (from kafka-consumer-groups output). */
export type GroupStabilityState =
  | "stable"
  | "preparing-rebalance"
  | "completing-rebalance"
  | "dead"
  | "empty"
  | "unknown";

/** Valid group stability state strings for runtime type-guarding. */
export const GROUP_STABILITY_STATES: readonly string[] = [
  "stable",
  "preparing-rebalance",
  "completing-rebalance",
  "dead",
  "empty",
  "unknown",
];

/** A per-partition offset snapshot at a single point in time. */
export interface PartitionSnapshot {
  /** Stable partition identifier (e.g., "my-topic-0" or numeric partition ID). */
  readonly partitionId: string;
  /** Consumer group committed offset. Must be a finite non-negative integer. */
  readonly committedOffset: number;
  /** Current offset (may equal committed or reflect in-flight position). */
  readonly currentOffset: number;
  /** Log-end offset (latest offset in the partition). Must be >= committedOffset and >= currentOffset. */
  readonly logEndOffset: number;
}

/** A timestamped collection of per-partition snapshots. */
export interface OffsetSnapshot {
  /** Per-partition data. */
  readonly partitions: readonly PartitionSnapshot[];
  /** Optional consumer group stability state at snapshot time. */
  readonly groupState?: GroupStabilityState;
}

/** User-supplied throughput and capacity assumptions. */
export interface ThroughputAssumptions {
  /**
   * Estimated per-consumer throughput in records/sec.
   * Used for capacity planning calculations.
   * Must be a finite positive number.
   */
  readonly perConsumerThroughput: number;
  /**
   * Optional drain target deadline in seconds from now.
   * Used to calculate throughput required to drain by the target.
   * Must be a finite positive number when provided.
   */
  readonly drainTargetSeconds?: number;
}

/** Complete input to the lag triage planner. */
export interface LagTriageInput {
  /** Earlier (before) snapshot. */
  readonly snapshotBefore: OffsetSnapshot;
  /** Later (after) snapshot. */
  readonly snapshotAfter: OffsetSnapshot;
  /**
   * Interval between snapshots in seconds.
   * Must be a finite positive number (> 0).
   */
  readonly intervalSeconds: number;
  /** Optional throughput and capacity assumptions. */
  readonly assumptions?: ThroughputAssumptions;
  /**
   * Hot-partition detection multiplier.
   * A partition is "hot" when its lag exceeds the peer baseline * multiplier.
   * Default: 2.0. Must be >= 1.0.
   */
  readonly hotPartitionMultiplier?: number;
  /**
   * Hot-partition minimum lag threshold.
   * Even if a partition exceeds the multiplier, it must also have at
   * least this much absolute lag to be flagged "hot".
   * Default: 1000. Must be >= 0.
   */
  readonly hotPartitionMinLag?: number;
}

// ─── Validation ─────────────────────────────────────────────────────────────

/** Categories of validation issues. */
export type ValidationIssueKind =
  | "invalid-root"
  | "invalid-snapshot"
  | "invalid-partitions"
  | "invalid-partition-object"
  | "invalid-partition-id"
  | "invalid-group-state"
  | "invalid-field-type"
  | "non-finite-offset"
  | "negative-offset"
  | "non-integer-offset"
  | "log-end-below-committed"
  | "log-end-below-current"
  | "log-end-regression"
  | "duplicate-partition"
  | "missing-partition"
  | "interval-invalid"
  | "throughput-invalid"
  | "drain-target-invalid"
  | "hot-multiplier-invalid"
  | "hot-min-lag-invalid"
  | "insufficient-samples";

/** A single validation issue. */
export interface ValidationIssue {
  readonly kind: ValidationIssueKind;
  readonly message: string;
  /** Which snapshot this issue relates to, if applicable. */
  readonly snapshot?: "before" | "after";
  /** Which partition this issue relates to, if applicable. */
  readonly partitionId?: string;
}

// ─── Per-Partition Results ──────────────────────────────────────────────────

/** Per-partition lag analysis. */
export interface PartitionLagResult {
  readonly partitionId: string;

  // Committed-offset lag at each snapshot
  readonly lagBefore: number;
  readonly lagAfter: number;

  /** Change in committed-offset lag: lagAfter - lagBefore. Positive = growing, negative = draining. */
  readonly lagDelta: number;
  /** Committed lag change rate in records/sec: lagDelta / intervalSeconds. */
  readonly lagRatePerSec: number;

  // Log-end offsets for ingress rate
  readonly logEndBefore: number;
  readonly logEndAfter: number;
  /** Producer ingress rate: (logEndAfter - logEndBefore) / intervalSeconds. */
  readonly ingressRatePerSec: number;

  // Committed-offset consumer progress
  readonly committedBefore: number;
  readonly committedAfter: number;
  /** Committed-offset consumer progress rate: (committedAfter - committedBefore) / intervalSeconds. */
  readonly committedRatePerSec: number;

  /** True if committed offset decreased (committed-offset regression). */
  readonly committedRegression: boolean;

  // Current-offset position
  readonly currentBefore: number;
  readonly currentAfter: number;
  /** Current-offset delta: currentAfter - currentBefore. */
  readonly currentDelta: number;
  /** Current-offset progress rate: (currentAfter - currentBefore) / intervalSeconds. */
  readonly currentRatePerSec: number;

  /** True if current offset decreased (current-offset regression). */
  readonly currentRegression: boolean;

  /** True if this partition is flagged as "hot" based on peer-baseline/multiplier/min lag. */
  readonly isHot: boolean;
}

// ─── Aggregate Results ──────────────────────────────────────────────────────

/** Partition skew metrics. */
export interface PartitionSkew {
  /** Maximum lag across all partitions (at "after" snapshot). */
  readonly maxLag: number;
  /** Mean lag across all partitions (at "after" snapshot). */
  readonly meanLag: number;
  /**
   * Coefficient of variation (CV) of per-partition lag at "after" snapshot.
   * CV = stddev / mean. Higher values indicate more skewed consumption.
   * Undefined when mean is 0 (all partitions caught up).
   */
  readonly coefficientOfVariation: number | null;
  /** Partition IDs of partitions with maximum lag. */
  readonly maxLagPartitions: readonly string[];
}

/** Capacity planning result. */
export interface CapacityResult {
  /** Per-consumer throughput assumption used. */
  readonly perConsumerThroughput: number;

  /**
   * Uncapped consumers required to match current total ingress rate (hold steady).
   * Rounded up (ceil). May exceed partition count.
   */
  readonly requiredToHoldSteady: number;
  /**
   * Uncapped consumers required to drain the current backlog by drainTargetSeconds.
   * Only present when drainTargetSeconds is provided and lag > 0.
   * Rounded up (ceil). May exceed partition count.
   */
  readonly requiredToDrain?: number;

  /**
   * Maximum useful active consumers = partition count.
   * Each partition is assigned to at most one consumer within a group, so
   * consumers beyond the partition count would be idle.
   */
  readonly maxActiveConsumers: number;

  /**
   * Deployable (effective) consumer count to hold steady.
   * min(requiredToHoldSteady, maxActiveConsumers).
   */
  readonly effectiveToHoldSteady: number;
  /**
   * Deployable (effective) consumer count to drain by target.
   * min(requiredToDrain, maxActiveConsumers). Only when requiredToDrain is present.
   */
  readonly effectiveToDrain?: number;

  /**
   * Maximum total throughput achievable at the partition cap.
   * maxActiveConsumers * perConsumerThroughput.
   */
  readonly maxThroughputAtCap: number;

  /**
   * Throughput shortfall: how much more throughput is needed beyond
   * what the partition cap allows. 0 when not capped.
   * max(0, requiredThroughput - maxThroughputAtCap).
   */
  readonly throughputShortfall: number;

  /**
   * Whether the required consumer count was capped at the partition count
   * (i.e., even maximum parallelism may be insufficient).
   */
  readonly cappedAtPartitions: boolean;
}

/** Drain ETA information. */
export interface DrainEta {
  /**
   * Estimated seconds to drain the current total backlog at the current
   * net committed consumption rate. null when the backlog is growing,
   * stalled, or conditions make ETA unreliable (e.g., offset regressions).
   */
  readonly etaSeconds: number | null;
  /** Human-readable reason when ETA is unavailable. */
  readonly unavailableReason?: string;
}

/** Throughput requirements. */
export interface ThroughputRequirements {
  /** Total records/sec throughput needed to hold lag constant (match ingress). */
  readonly toHoldSteady: number;
  /**
   * Total records/sec throughput needed to drain the backlog by the user target.
   * Only present when drainTargetSeconds is provided and lag > 0.
   */
  readonly toDrainByTarget?: number;
}

// ─── Classification ─────────────────────────────────────────────────────────

/**
 * Primary lag condition classification.
 *
 * Precedence (highest to lowest):
 * 1. group-unstable — group is not in "stable" or "unknown" state, OR offset regressions detected
 * 2. hot-partition  — at least one partition is flagged hot
 * 3. growing        — total lag is increasing
 * 4. stalled        — consumer progress is zero but lag exists
 * 5. draining       — total lag is decreasing
 * 6. stable-backlog — lag exists but is not changing meaningfully
 * 7. caught-up      — total lag is zero or near-zero
 */
export type LagCondition =
  | "caught-up"
  | "stable-backlog"
  | "growing"
  | "draining"
  | "stalled"
  | "hot-partition"
  | "group-unstable";

/** Confidence level for the analysis. */
export type ConfidenceLevel = "high" | "moderate" | "low";

/** Confidence assessment with explanation. */
export interface ConfidenceAssessment {
  readonly level: ConfidenceLevel;
  readonly reason: string;
}

/** Condition flags that may be true alongside the primary condition. */
export interface ConditionFlags {
  /** Group is not in stable state (explicit group state signal). */
  readonly groupStateUnstable: boolean;
  /** At least one partition has a committed-offset regression. */
  readonly hasCommittedRegressions: boolean;
  /** At least one partition has a current-offset regression. */
  readonly hasCurrentRegressions: boolean;
  /** At least one partition is flagged hot. */
  readonly hasHotPartitions: boolean;
  /** Total lag is growing. */
  readonly lagGrowing: boolean;
  /** Consumers are making no progress despite existing lag. */
  readonly consumersStalled: boolean;
}

// ─── Observability Recommendations ──────────────────────────────────────────

/** An observability recommendation in the result. */
export interface LagObservabilityRecommendation {
  /** Metric or signal name. */
  readonly metric: string;
  /** What it measures, including units. */
  readonly description: string;
  /** Why this metric matters for this specific scenario. */
  readonly rationale: string;
  /** When this signal is NOT sufficient alone — explicit "do not alert on this alone" guidance. */
  readonly caveat: string;
}

// ─── Resource Links ─────────────────────────────────────────────────────────

/** A cross-link to a related Kafka Hub resource. */
export interface LagResourceLink {
  readonly label: string;
  readonly href: string;
  readonly surface: "learn" | "runbooks" | "errors" | "simulate" | "diagnose" | "workbench";
}

// ─── Complete Result ────────────────────────────────────────────────────────

/** The explicit assumptions the planner used. */
export interface AnalysisAssumptions {
  readonly intervalSeconds: number;
  readonly hotPartitionMultiplier: number;
  readonly hotPartitionMinLag: number;
  readonly perConsumerThroughput?: number;
  readonly drainTargetSeconds?: number;
  /** Group stability state from the "after" snapshot. */
  readonly groupStateAfter: GroupStabilityState | "not-provided";
}

/** Complete lag triage result. */
export interface LagTriageResult {
  // Per-partition detail
  readonly partitions: readonly PartitionLagResult[];

  // Committed-offset aggregate metrics
  readonly totalLagBefore: number;
  readonly totalLagAfter: number;
  readonly totalLagDelta: number;
  readonly totalLagRatePerSec: number;
  readonly totalIngressRatePerSec: number;
  readonly totalCommittedRatePerSec: number;

  // Current-offset aggregate metrics
  readonly totalCurrentDelta: number;
  readonly totalCurrentRatePerSec: number;

  // Skew analysis
  readonly partitionSkew: PartitionSkew;

  // Hot partitions (subset of partitions)
  readonly hotPartitions: readonly string[];

  // Committed-offset regressions
  readonly committedRegressions: readonly string[];
  // Current-offset regressions
  readonly currentRegressions: readonly string[];

  // Drain ETA (based on committed offsets)
  readonly drainEta: DrainEta;

  // Throughput requirements
  readonly throughputRequirements: ThroughputRequirements;

  // Capacity planning (only when assumptions provided)
  readonly capacity?: CapacityResult;

  // Classification
  readonly condition: LagCondition;
  readonly conditionFlags: ConditionFlags;

  // Confidence assessment
  readonly confidence: ConfidenceAssessment;

  // Assumptions used (for transparency)
  readonly assumptions: AnalysisAssumptions;

  // Observability recommendations
  readonly recommendations: readonly LagObservabilityRecommendation[];

  // Resource links
  readonly resourceLinks: readonly LagResourceLink[];
}

// ─── Analysis Result (discriminated union) ──────────────────────────────────

/** Successful analysis or validation failure. */
export type LagAnalysisResult =
  | { readonly ok: true; readonly result: LagTriageResult }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };
