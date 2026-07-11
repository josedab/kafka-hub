/**
 * Types for the message-size chain checker planner.
 *
 * Framework-free. All types are pure data — no classes, no side effects.
 * Designed for deterministic analysis of Kafka message size limits across
 * the entire produce → replicate → consume pipeline.
 *
 * ─── Canonical Units ─────────────────────────────────────────────────────
 *
 * All byte values are in **bytes** (finite, positive integers for config
 * fields; finite positive numbers for record/batch sizes).
 * Headroom is a **fraction** in [0, 1) — e.g. 0.10 means 10% safety margin.
 *   0 is valid (no headroom comparison).
 * The blob storage threshold is in **bytes** — the point at which the planner
 * recommends externalising payloads to blob/object storage.
 *
 * ─── Compressed vs Uncompressed Model ────────────────────────────────────
 *
 * Kafka's size checks operate at different levels:
 *
 *   1. **Record size** — the serialised key + value + headers of a single
 *      record. This is the unit the producer serialises.
 *
 *   2. **Record batch size** — the on-wire/on-disk unit Kafka actually
 *      transmits and stores. A record batch includes one or more records
 *      plus batch-level overhead (magic byte, CRC, attributes, timestamps,
 *      producer state, etc.). When compression is enabled, the **records
 *      within the batch are compressed** but the batch header remains
 *      uncompressed. The batch size reported in this planner is the
 *      **produced (potentially compressed) record batch** as sent by
 *      the producer.
 *
 *   3. **Producer request size** (`max.request.size`) — bounds the total
 *      size of the produce request, which can contain multiple batches
 *      across partitions. For conservative analysis we model the case
 *      where a single batch dominates the request (worst-case alignment).
 *
 *   4. **Broker acceptance** (`message.max.bytes` at broker level, or
 *      `max.message.bytes` at topic level) — this is a **per-batch** limit
 *      checked against the *compressed* record batch when compression is
 *      on, or the uncompressed batch when compression is off. The topic
 *      setting **overrides** the broker default for that topic; they are
 *      NOT independent gates. When no topic override is set, the broker
 *      default applies.
 *
 *   5. **Follower fetch** (`replica.fetch.max.bytes`) — max bytes a
 *      follower fetches per partition per fetch request. If this is
 *      smaller than the broker acceptance limit, large batches are
 *      *accepted* but followers may fail to replicate them efficiently.
 *      In practice, Kafka's `ReplicaFetcherThread` can make progress
 *      if at least one complete batch fits, but undersized settings
 *      cause extra round-trips and risk under-replication under load.
 *
 *   6. **Consumer partition fetch** (`max.partition.fetch.bytes`) — max
 *      bytes the consumer fetches per partition. Similar progress
 *      semantics to follower fetch for consumer. Undersized settings
 *      may cause slow consumption or errors depending on the client
 *      implementation.
 *
 *   7. **Consumer total fetch** (`fetch.max.bytes`) — overall cap on
 *      total bytes per fetch response across all partitions. Even if
 *      per-partition settings are adequate, this can limit throughput
 *      when consuming many partitions.
 *
 * This planner uses a **conservative model**: it compares the produced
 * (potentially compressed) record batch size against all limits.
 * Compressed batch size ≤ uncompressed batch size, so if the compressed
 * batch passes, the uncompressed batch might not — this model catches
 * that by requiring the user to supply the actual produced batch size.
 */

// ─── Input Types ────────────────────────────────────────────────────────────

/**
 * Optional topic-level `max.message.bytes` override.
 * When provided, this overrides the broker `message.max.bytes` default
 * for this specific topic. When absent, the broker default applies.
 */
export interface TopicOverride {
  /** Topic-level `max.message.bytes` in bytes. Must be finite positive integer. */
  readonly maxMessageBytes: number;
}

/** Complete input to the message-size chain checker. All values in bytes. */
export interface MessageSizeInput {
  /**
   * Serialised record size in bytes (key + value + headers).
   * Must be a finite positive integer.
   */
  readonly recordSizeBytes: number;

  /**
   * Produced record batch size in bytes (on-wire, potentially compressed).
   * Must be a finite positive integer, ≥ recordSizeBytes.
   * This is the unit Kafka actually transmits and checks against limits.
   */
  readonly batchSizeBytes: number;

  /**
   * Producer `max.request.size` in bytes.
   * Must be a finite positive integer.
   */
  readonly producerMaxRequestSize: number;

  /**
   * Topic-level `max.message.bytes` override. When provided, this is the
   * effective acceptance limit for this topic. When omitted, the broker
   * `message.max.bytes` default is used.
   */
  readonly topicOverride?: TopicOverride;

  /**
   * Broker `message.max.bytes` default in bytes.
   * Must be a finite positive integer.
   * This applies to topics WITHOUT an explicit `max.message.bytes` override.
   */
  readonly brokerMessageMaxBytes: number;

  /**
   * Follower `replica.fetch.max.bytes` in bytes.
   * Must be a finite positive integer.
   */
  readonly replicaFetchMaxBytes: number;

  /**
   * Consumer `max.partition.fetch.bytes` in bytes.
   * Must be a finite positive integer.
   */
  readonly consumerMaxPartitionFetchBytes: number;

  /**
   * Consumer `fetch.max.bytes` in bytes (total across all partitions).
   * Must be a finite positive integer.
   */
  readonly consumerFetchMaxBytes: number;

  /**
   * Safety headroom as a fraction in [0, 1).
   * E.g. 0.10 means the required aligned limit = batchSize × (1 + 0.10).
   * 0 is valid (no headroom — aligned target equals batch size).
   * Must be in [0, 1). Typical: 0.10 (10%).
   */
  readonly safetyHeadroomFraction: number;

  /**
   * Blob/object storage recommendation threshold in bytes.
   * When the record size or batch size reaches/exceeds this, the planner
   * recommends externalising large payloads to blob storage.
   * Must be a finite positive integer.
   * This is a design recommendation, not a universal Kafka limit.
   */
  readonly blobStorageThresholdBytes: number;
}

// ─── Validation ─────────────────────────────────────────────────────────────

/** Categories of validation issues. */
export type MessageSizeValidationIssueKind =
  | "invalid-root"
  | "invalid-field-type"
  | "non-finite-value"
  | "non-positive-value"
  | "non-integer-value"
  | "batch-smaller-than-record"
  | "invalid-headroom"
  | "invalid-blob-threshold"
  | "invalid-topic-override"
  | "unsafe-number-overflow";

/** A single validation issue. */
export interface MessageSizeValidationIssue {
  readonly kind: MessageSizeValidationIssueKind;
  readonly field: string;
  readonly message: string;
}

// ─── Stage Results ──────────────────────────────────────────────────────────

/** Stable stage identifiers for the size chain. Evaluation order is deterministic. */
export type MessageSizeStageId =
  | "record-batch-consistency"
  | "producer-request"
  | "topic-or-broker-acceptance"
  | "replica-fetch"
  | "consumer-partition-fetch"
  | "consumer-total-fetch";

/**
 * Status of a stage: pass, pass-without-headroom, or fail.
 *
 * - `pass`:                   actual batch fits AND aligned (headroom) target fits.
 * - `pass-without-headroom`:  actual batch fits, but the aligned (headroom) target
 *                             does NOT fit. Kafka will NOT reject / will replicate /
 *                             will consume the modeled batch, but the recommended
 *                             safety margin is not met.
 * - `fail`:                   actual batch does NOT fit. Kafka will reject / will
 *                             NOT replicate / will NOT consume (hard failure).
 */
export type MessageSizeStageStatus =
  | "pass"
  | "pass-without-headroom"
  | "fail";

/** Result of a single stage evaluation. */
export interface MessageSizeStageResult {
  /** Stable identifier for this stage. */
  readonly stageId: MessageSizeStageId;
  /** Human-readable stage label. */
  readonly label: string;
  /** Configured limit for this stage in bytes. */
  readonly configuredLimitBytes: number;
  /**
   * Actual required bytes (the batch/request size checked against the limit).
   * For record-batch-consistency: the record size.
   * For other stages: the batch size (without headroom).
   */
  readonly actualRequiredBytes: number;
  /**
   * Aligned required bytes (batch + headroom envelope target).
   * For record-batch-consistency: same as actualRequiredBytes.
   * For other stages: ceil(batchSize * (1 + headroom)).
   */
  readonly alignedRequiredBytes: number;
  /** Whether the ACTUAL batch fits within the configured limit. */
  readonly actualPass: boolean;
  /** Whether the ALIGNED (headroom) target fits within the configured limit. */
  readonly alignedPass: boolean;
  /**
   * Tri-state status combining actualPass and alignedPass.
   */
  readonly status: MessageSizeStageStatus;
  /** Human-readable rationale explaining the check. */
  readonly rationale: string;

  // ─── Backward-compatible fields (derived) ──────────────────────────────
  /** @deprecated Use `alignedRequiredBytes`. Required size (batch + headroom) that must fit within the limit. */
  readonly requiredBytes: number;
  /** @deprecated Use `actualPass` (for hard failure) or `alignedPass` (for headroom). */
  readonly pass: boolean;
}

/** Severity zone for the overall pipeline — based on actual (hard) pass/fail. */
export type MessageSizeZone =
  | "all-clear"
  | "replication-risk"
  | "consumption-risk"
  | "rejected";

// ─── Alignment Gaps ─────────────────────────────────────────────────────────

/**
 * A configuration-envelope alignment gap.
 * Indicates a stage where the current batch fits (actualPass) but:
 * - the aligned (headroom) target does not fit, OR
 * - the downstream limit is below the effective acceptance limit, meaning
 *   the topic/broker can accept batches larger than the downstream
 *   component is configured for.
 */
export interface MessageSizeAlignmentGap {
  /** Stage where the gap exists. */
  readonly stageId: MessageSizeStageId;
  /** Human-readable label. */
  readonly label: string;
  /** Why this gap exists. */
  readonly reason: "headroom-gap" | "acceptance-envelope-gap";
  /** Configured limit at this stage. */
  readonly configuredLimitBytes: number;
  /** What the aligned/envelope target is. */
  readonly targetBytes: number;
  /** Human-readable explanation. */
  readonly explanation: string;
}

// ─── Patch ──────────────────────────────────────────────────────────────────

/** A single .properties patch entry. */
export interface MessageSizePatchEntry {
  /** Kafka property key. */
  readonly property: string;
  /** Scope: producer, topic, broker, follower, consumer. */
  readonly scope: "producer" | "topic" | "broker" | "follower" | "consumer";
  /** Recommended value in bytes. */
  readonly recommendedBytes: number;
  /** Current/configured value in bytes. */
  readonly currentBytes: number;
  /** Whether the recommendation changed the value (recommended > current). */
  readonly changed: boolean;
  /** Why the target was chosen: headroom alignment or acceptance-envelope alignment. */
  readonly targetReason: "headroom" | "acceptance-envelope" | "both" | "none";
  /** Human-readable note. */
  readonly note: string;
}

/** Complete .properties patch. */
export interface MessageSizePatch {
  /** Individual patch entries. */
  readonly entries: readonly MessageSizePatchEntry[];
  /** Rendered .properties snippet. */
  readonly snippet: string;
  /** Explanation of the patch strategy. */
  readonly explanation: string;
}

// ─── Blob Storage Recommendation ────────────────────────────────────────────

/** Blob/object storage recommendation. */
export interface BlobStorageRecommendation {
  /** Whether blob storage is recommended. */
  readonly recommended: boolean;
  /** Threshold that triggered the recommendation (bytes). */
  readonly thresholdBytes: number;
  /** Which size triggered it: record, batch, or both. */
  readonly trigger: "record" | "batch" | "both" | "none";
  /** Human-readable guidance. */
  readonly guidance: string;
}

// ─── Observability ──────────────────────────────────────────────────────────

/** Observability recommendation for message-size related monitoring. */
export interface MessageSizeObservabilityRecommendation {
  /** Metric or signal name. */
  readonly metric: string;
  /** What it measures, including units. */
  readonly description: string;
  /** Why this metric matters for message size alignment. */
  readonly rationale: string;
  /** When this signal is NOT sufficient alone. */
  readonly caveat: string;
}

/** A cross-link to a related Kafka Hub resource. */
export interface MessageSizeResourceLink {
  readonly label: string;
  readonly href: string;
  readonly surface: "errors" | "diagnose" | "workbench" | "simulate";
}

// ─── Analysis Result ────────────────────────────────────────────────────────

/** Assumptions the planner used, for transparency. */
export interface MessageSizeAnalysisAssumptions {
  readonly recordSizeBytes: number;
  readonly batchSizeBytes: number;
  readonly producerMaxRequestSize: number;
  readonly brokerMessageMaxBytes: number;
  readonly topicOverrideMaxMessageBytes: number | null;
  readonly effectiveAcceptanceLimitBytes: number;
  readonly replicaFetchMaxBytes: number;
  readonly consumerMaxPartitionFetchBytes: number;
  readonly consumerFetchMaxBytes: number;
  readonly safetyHeadroomFraction: number;
  readonly requiredAlignedLimitBytes: number;
  readonly blobStorageThresholdBytes: number;
}

/** Complete analysis result. */
export interface MessageSizeAnalysisResult {
  /** Ordered stage results (evaluation order is deterministic). */
  readonly stages: readonly MessageSizeStageResult[];
  /**
   * The first stage with an actual (hard) failure, or null if all pass.
   * Based on actualPass — the real Kafka behavior for the modeled batch.
   */
  readonly firstFailure: MessageSizeStageResult | null;
  /**
   * The first stage with an alignment gap (pass-without-headroom or
   * acceptance-envelope gap), or null if fully aligned.
   */
  readonly firstAlignmentGap: MessageSizeAlignmentGap | null;
  /** All alignment gaps in stage order. */
  readonly alignmentGaps: readonly MessageSizeAlignmentGap[];
  /** Severity zone for the overall pipeline (based on actualPass). */
  readonly zone: MessageSizeZone;
  /** Zone explanation. */
  readonly zoneExplanation: string;
  /** Aligned .properties patch. */
  readonly patch: MessageSizePatch;
  /** Blob storage recommendation. */
  readonly blobRecommendation: BlobStorageRecommendation;
  /** Observability recommendations. */
  readonly observability: readonly MessageSizeObservabilityRecommendation[];
  /** Resource links. */
  readonly resourceLinks: readonly MessageSizeResourceLink[];
  /** Assumptions used for transparency. */
  readonly assumptions: MessageSizeAnalysisAssumptions;
}

// ─── Discriminated union result ─────────────────────────────────────────────

/** Successful analysis or validation failure. */
export type MessageSizePlannerResult =
  | { readonly ok: true; readonly result: MessageSizeAnalysisResult }
  | { readonly ok: false; readonly issues: readonly MessageSizeValidationIssue[] };
