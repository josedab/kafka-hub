/**
 * Consumer lag triage analysis engine.
 *
 * Deterministic: same input always produces the same result.
 * Framework-free, browser/Node compatible.
 *
 * ─── Formulas ────────────────────────────────────────────────────────────
 *
 * Per partition (committed-offset based):
 *   lag(snapshot) = logEndOffset - committedOffset
 *   lagDelta     = lagAfter - lagBefore
 *   lagRate      = lagDelta / intervalSeconds  (records/sec)
 *   ingressRate  = (logEndAfter - logEndBefore) / intervalSeconds
 *   committedRate= (committedAfter - committedBefore) / intervalSeconds
 *   committedRegression = committedAfter < committedBefore
 *
 * Per partition (current-offset based):
 *   currentDelta = currentAfter - currentBefore
 *   currentRate  = currentDelta / intervalSeconds
 *   currentRegression = currentAfter < currentBefore
 *
 * Aggregate:
 *   totalLag*           = sum of per-partition lag*
 *   totalLagDelta       = totalLagAfter - totalLagBefore
 *   totalLagRate        = totalLagDelta / intervalSeconds
 *   totalIngressRate    = sum of per-partition ingressRate
 *   totalCommittedRate  = sum of per-partition committedRate
 *   totalCurrentDelta   = sum of per-partition currentDelta
 *   totalCurrentRate    = totalCurrentDelta / intervalSeconds
 *
 * Skew (on lagAfter values):
 *   meanLag = totalLagAfter / partitionCount
 *   stddev  = sqrt( sum((lag_i - meanLag)^2) / partitionCount )
 *   CV      = stddev / meanLag  (null when meanLag == 0)
 *
 * Hot partition detection (peer-baseline method):
 *   For each partition i with N >= 2 total partitions:
 *     peerMean_i = (totalLagAfter - lag_i) / (N - 1)
 *     isHot = lag_i > (peerMean_i * hotPartitionMultiplier)
 *             AND lag_i >= hotPartitionMinLag
 *   Single-partition groups cannot have hot partitions (no peers).
 *
 * Drain ETA (committed-offset based):
 *   netDrainRate = totalCommittedRate - totalIngressRate
 *   etaSeconds = totalLagAfter / netDrainRate  (when netDrainRate > 0 and no regressions)
 *
 * Throughput requirements:
 *   toHoldSteady   = totalIngressRate
 *   toDrainByTarget = totalIngressRate + (totalLagAfter / drainTargetSeconds)
 *
 * Capacity:
 *   requiredToHoldSteady = ceil(toHoldSteady / perConsumerThroughput)
 *   requiredToDrain      = ceil(toDrainByTarget / perConsumerThroughput)
 *   maxActiveConsumers   = partitionCount
 *   effectiveTo*         = min(required*, maxActiveConsumers)
 *   maxThroughputAtCap   = maxActiveConsumers * perConsumerThroughput
 *   throughputShortfall  = max(0, requiredThroughput - maxThroughputAtCap)
 *
 * ─── Classification Precedence ───────────────────────────────────────────
 *
 * 1. group-unstable  — groupState is not "stable", "unknown", or absent
 *                       OR committed/current offset regressions detected
 * 2. hot-partition   — any partition flagged hot
 * 3. growing         — totalLagDelta > 0
 * 4. stalled         — totalCommittedRate == 0 AND totalLagAfter > 0
 * 5. draining        — totalLagDelta < 0
 * 6. stable-backlog  — totalLagAfter > 0 AND totalLagDelta == 0
 * 7. caught-up       — totalLagAfter == 0
 */

import type {
  LagTriageInput,
  LagAnalysisResult,
  PartitionLagResult,
  PartitionSkew,
  DrainEta,
  ThroughputRequirements,
  CapacityResult,
  LagCondition,
  ConditionFlags,
  ConfidenceAssessment,
  AnalysisAssumptions,
  LagObservabilityRecommendation,
  LagResourceLink,
  PartitionSnapshot,
} from "./types";
import { validateLagInput, validateUnknownInput, DEFAULT_HOT_MULTIPLIER, DEFAULT_HOT_MIN_LAG } from "./validate";

// ─── Observability Recommendations ──────────────────────────────────────────

const RECOMMENDATIONS: readonly LagObservabilityRecommendation[] = [
  {
    metric: "kafka.consumer_group.lag (per partition)",
    description: "Current consumer lag in records per partition. Sum for total group lag.",
    rationale:
      "Lag is the primary indicator of consumer health. Sustained growth indicates consumers cannot keep up with producers.",
    caveat:
      "Do not alert on absolute lag alone — a stable backlog during a batch window may be expected. Alert on sustained lag growth rate relative to your workload baseline and SLO, not on a fixed threshold.",
  },
  {
    metric: "kafka.consumer_group.lag_delta (records/sec)",
    description: "Rate of lag change. Positive = growing, negative = draining.",
    rationale:
      "Lag delta distinguishes a stable backlog from a growing one. A brief spike during deployment is different from a sustained increase.",
    caveat:
      "Do not alert on brief positive deltas alone — deploys, rebalances, and batch jobs cause transient spikes. Use a sustained-duration condition calibrated to your deployment cadence and SLO.",
  },
  {
    metric: "kafka.consumer_group.committed_rate (records/sec)",
    description: "Consumer committed offset progress rate per partition or total.",
    rationale:
      "A consumer rate dropping to zero while lag exists indicates a stalled consumer — likely a processing failure, deadlock, or unacknowledged rebalance.",
    caveat:
      "Do not alert on brief zero-rate windows alone — consumers may legitimately pause during rebalances or idle periods. Calibrate duration thresholds to your workload baseline.",
  },
  {
    metric: "kafka.log.end_offset_rate (records/sec)",
    description: "Producer ingress rate inferred from log-end offset changes.",
    rationale:
      "Ingress rate establishes the throughput consumers must sustain. A sudden ingress spike can cause lag even with healthy consumers.",
    caveat:
      "Do not alert on ingress rate alone — high ingress is normal during batch loads. Correlate with consumer lag delta and your baseline ingress profile.",
  },
  {
    metric: "kafka.consumer_group.state",
    description: "Consumer group protocol state: Stable, PreparingRebalance, CompletingRebalance, Dead, Empty.",
    rationale:
      "Non-stable states indicate rebalancing is in progress. During rebalancing, lag naturally grows because partitions are unassigned.",
    caveat:
      "Do not alert on non-stable state alone — brief rebalances after deploys are normal. Calibrate duration thresholds to your deployment cadence, expected rebalance time, and SLO.",
  },
  {
    metric: "kafka.consumer_group.partition_skew (coefficient of variation)",
    description: "CV of per-partition lag. Higher values indicate uneven consumption across partitions.",
    rationale:
      "High skew suggests a hot partition (skewed key distribution), a slow consumer instance, or partition reassignment issues.",
    caveat:
      "Do not alert on skew alone — some workloads have inherently uneven key distributions. Investigate when skew is high AND total lag is growing, relative to your workload baseline.",
  },
];

// ─── Resource Links ─────────────────────────────────────────────────────────

export const RESOURCE_LINKS: readonly LagResourceLink[] = [
  {
    label: "Consumer Lag Runbook",
    href: "/runbooks/consumer-lag-climbing",
    surface: "runbooks",
  },
  {
    label: "Consumer Group Rebalances",
    href: "/learn/consumer-rebalance",
    surface: "learn",
  },
  {
    label: "Simulate Slow Consumer",
    href: "/simulate/embed/slow-consumer",
    surface: "simulate",
  },
  {
    label: "Incident Triage",
    href: "/workbench/incident",
    surface: "workbench",
  },
];

// ─── Core Analysis ──────────────────────────────────────────────────────────

/**
 * Analyze consumer lag from two offset snapshots.
 *
 * Accepts `unknown` for runtime safety — structurally invalid input returns
 * typed validation issues, never throws. Callers with compile-time-checked
 * `LagTriageInput` skip the structural guard at runtime cost of one type check.
 *
 * @param input - The lag triage input (or unknown runtime value)
 * @returns Discriminated union: ok=true with result, or ok=false with issues
 */
export function analyzeLag(input: unknown): LagAnalysisResult {
  // 0. Structural validation for untrusted input
  const structural = validateUnknownInput(input);
  if (!structural.ok) {
    return { ok: false, issues: structural.issues };
  }
  const validInput = structural.input;

  // 1. Semantic validation
  const issues = validateLagInput(validInput);
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return analyzeValidInput(validInput);
}

/**
 * Internal analysis on structurally + semantically validated input.
 */
function analyzeValidInput(input: LagTriageInput): LagAnalysisResult {
  const interval = input.intervalSeconds;
  const hotMultiplier = input.hotPartitionMultiplier ?? DEFAULT_HOT_MULTIPLIER;
  const hotMinLag = input.hotPartitionMinLag ?? DEFAULT_HOT_MIN_LAG;

  // 2. Build partition lookup from "before" snapshot
  const beforeMap = new Map<string, PartitionSnapshot>();
  for (const p of input.snapshotBefore.partitions) {
    beforeMap.set(p.partitionId, p);
  }

  // 3. Compute per-partition results (ordered by partition ID for determinism)
  const afterPartitions = [...input.snapshotAfter.partitions].sort(
    (a, b) => a.partitionId.localeCompare(b.partitionId),
  );

  const partitionResults: PartitionLagResult[] = [];

  for (const after of afterPartitions) {
    const before = beforeMap.get(after.partitionId);
    if (!before) continue; // validated away by missing-partition check

    const lagBefore = before.logEndOffset - before.committedOffset;
    const lagAfter = after.logEndOffset - after.committedOffset;
    const lagDelta = lagAfter - lagBefore;
    const lagRatePerSec = lagDelta / interval;

    const ingressRatePerSec =
      (after.logEndOffset - before.logEndOffset) / interval;
    const committedRatePerSec =
      (after.committedOffset - before.committedOffset) / interval;

    const committedRegression = after.committedOffset < before.committedOffset;

    // Current-offset metrics
    const currentDelta = after.currentOffset - before.currentOffset;
    const currentRatePerSec = currentDelta / interval;
    const currentRegression = after.currentOffset < before.currentOffset;

    partitionResults.push({
      partitionId: after.partitionId,
      lagBefore,
      lagAfter,
      lagDelta,
      lagRatePerSec,
      logEndBefore: before.logEndOffset,
      logEndAfter: after.logEndOffset,
      ingressRatePerSec,
      committedBefore: before.committedOffset,
      committedAfter: after.committedOffset,
      committedRatePerSec,
      committedRegression,
      currentBefore: before.currentOffset,
      currentAfter: after.currentOffset,
      currentDelta,
      currentRatePerSec,
      currentRegression,
      isHot: false, // set below after computing peer baseline
    });
  }

  // 4. Aggregates
  const totalLagBefore = partitionResults.reduce((s, p) => s + p.lagBefore, 0);
  const totalLagAfter = partitionResults.reduce((s, p) => s + p.lagAfter, 0);
  const totalLagDelta = totalLagAfter - totalLagBefore;
  const totalLagRatePerSec = totalLagDelta / interval;
  const totalIngressRatePerSec = partitionResults.reduce(
    (s, p) => s + p.ingressRatePerSec,
    0,
  );
  const totalCommittedRatePerSec = partitionResults.reduce(
    (s, p) => s + p.committedRatePerSec,
    0,
  );
  const totalCurrentDelta = partitionResults.reduce(
    (s, p) => s + p.currentDelta,
    0,
  );
  const totalCurrentRatePerSec = totalCurrentDelta / interval;

  // 5. Partition skew (on lagAfter values)
  const partitionCount = partitionResults.length;
  const meanLag = partitionCount > 0 ? totalLagAfter / partitionCount : 0;

  let maxLag = 0;
  const maxLagPartitions: string[] = [];

  for (const p of partitionResults) {
    if (p.lagAfter > maxLag) {
      maxLag = p.lagAfter;
      maxLagPartitions.length = 0;
      maxLagPartitions.push(p.partitionId);
    } else if (p.lagAfter === maxLag && maxLag > 0) {
      maxLagPartitions.push(p.partitionId);
    }
  }

  let stddev = 0;
  if (partitionCount > 0) {
    const sumSqDiff = partitionResults.reduce(
      (s, p) => s + (p.lagAfter - meanLag) ** 2,
      0,
    );
    stddev = Math.sqrt(sumSqDiff / partitionCount);
  }

  const coefficientOfVariation = meanLag > 0 ? stddev / meanLag : null;

  const partitionSkew: PartitionSkew = {
    maxLag,
    meanLag,
    coefficientOfVariation,
    maxLagPartitions,
  };

  // 6. Hot partition detection (peer-baseline method)
  // For each partition, the baseline is the mean lag of all OTHER partitions.
  // Requires >= 2 partitions — single-partition groups cannot have hot partitions.
  const hotPartitionIds: string[] = [];

  if (partitionCount >= 2) {
    for (let i = 0; i < partitionResults.length; i++) {
      const p = partitionResults[i];
      const peerTotal = totalLagAfter - p.lagAfter;
      const peerMean = peerTotal / (partitionCount - 1);
      const hotThreshold = peerMean * hotMultiplier;
      const isHot = p.lagAfter > hotThreshold && p.lagAfter >= hotMinLag;
      if (isHot) {
        hotPartitionIds.push(p.partitionId);
        partitionResults[i] = { ...p, isHot: true };
      }
    }
  }

  // 7. Offset regressions
  const committedRegressions = partitionResults
    .filter((p) => p.committedRegression)
    .map((p) => p.partitionId);

  const currentRegressions = partitionResults
    .filter((p) => p.currentRegression)
    .map((p) => p.partitionId);

  // 8. Drain ETA (committed-offset based)
  const hasAnyRegression = committedRegressions.length > 0 || currentRegressions.length > 0;
  const netDrainRate = totalCommittedRatePerSec - totalIngressRatePerSec;
  let drainEta: DrainEta;

  if (totalLagAfter <= 0) {
    drainEta = { etaSeconds: 0 };
  } else if (hasAnyRegression) {
    drainEta = {
      etaSeconds: null,
      unavailableReason:
        "Offset regressions detected — consumer group is unstable. Drain ETA is unreliable until offsets stabilize.",
    };
  } else if (netDrainRate <= 0) {
    const reason =
      netDrainRate === 0
        ? "Consumer committed rate equals ingress rate — lag is stable but not draining."
        : "Lag is growing (consumer committed rate < ingress rate). ETA unavailable until consumers catch up.";
    drainEta = { etaSeconds: null, unavailableReason: reason };
  } else {
    drainEta = { etaSeconds: totalLagAfter / netDrainRate };
  }

  // 9. Throughput requirements
  const throughputRequirements: ThroughputRequirements = {
    toHoldSteady: totalIngressRatePerSec,
    ...(input.assumptions?.drainTargetSeconds !== undefined &&
    totalLagAfter > 0
      ? {
          toDrainByTarget:
            totalIngressRatePerSec +
            totalLagAfter / input.assumptions.drainTargetSeconds,
        }
      : {}),
  };

  // 10. Capacity planning
  let capacity: CapacityResult | undefined;
  if (input.assumptions) {
    const pct = input.assumptions.perConsumerThroughput;

    const requiredToHoldSteady = Math.max(Math.ceil(throughputRequirements.toHoldSteady / pct), 0);
    const effectiveToHoldSteady = Math.min(requiredToHoldSteady, partitionCount);

    const maxActiveConsumers = partitionCount;
    const maxThroughputAtCap = maxActiveConsumers * pct;

    let requiredToDrain: number | undefined;
    let effectiveToDrain: number | undefined;
    if (throughputRequirements.toDrainByTarget !== undefined) {
      requiredToDrain = Math.max(Math.ceil(throughputRequirements.toDrainByTarget / pct), 0);
      effectiveToDrain = Math.min(requiredToDrain, partitionCount);
    }

    // Shortfall is based on the higher of the two required throughputs
    const requiredThroughput = throughputRequirements.toDrainByTarget ?? throughputRequirements.toHoldSteady;
    const throughputShortfall = Math.max(0, requiredThroughput - maxThroughputAtCap);

    const cappedHold = requiredToHoldSteady > partitionCount;
    const cappedDrain = requiredToDrain !== undefined && requiredToDrain > partitionCount;

    capacity = {
      perConsumerThroughput: pct,
      requiredToHoldSteady,
      ...(requiredToDrain !== undefined ? { requiredToDrain } : {}),
      maxActiveConsumers,
      effectiveToHoldSteady,
      ...(effectiveToDrain !== undefined ? { effectiveToDrain } : {}),
      maxThroughputAtCap,
      throughputShortfall,
      cappedAtPartitions: cappedHold || cappedDrain,
    };
  }

  // 11. Classification
  const groupStateAfter = input.snapshotAfter.groupState;
  const groupStateUnstable =
    groupStateAfter !== undefined &&
    groupStateAfter !== "stable" &&
    groupStateAfter !== "unknown";

  const hasCommittedRegressions = committedRegressions.length > 0;
  const hasCurrentRegressions = currentRegressions.length > 0;
  const hasHotPartitions = hotPartitionIds.length > 0;
  const lagGrowing = totalLagDelta > 0;
  const consumersStalled =
    totalCommittedRatePerSec === 0 && totalLagAfter > 0;

  const conditionFlags: ConditionFlags = {
    groupStateUnstable,
    hasCommittedRegressions,
    hasCurrentRegressions,
    hasHotPartitions,
    lagGrowing,
    consumersStalled,
  };

  // group-unstable covers: explicit non-stable group state OR any offset regressions
  const isGroupUnstable = groupStateUnstable || hasCommittedRegressions || hasCurrentRegressions;

  let condition: LagCondition;
  if (isGroupUnstable) {
    condition = "group-unstable";
  } else if (hasHotPartitions) {
    condition = "hot-partition";
  } else if (lagGrowing) {
    condition = "growing";
  } else if (consumersStalled) {
    condition = "stalled";
  } else if (totalLagDelta < 0) {
    condition = "draining";
  } else if (totalLagAfter > 0) {
    condition = "stable-backlog";
  } else {
    condition = "caught-up";
  }

  // 12. Confidence assessment
  const confidence = assessConfidence(input, partitionCount, conditionFlags);

  // 13. Assumptions record
  const assumptions: AnalysisAssumptions = {
    intervalSeconds: interval,
    hotPartitionMultiplier: hotMultiplier,
    hotPartitionMinLag: hotMinLag,
    ...(input.assumptions
      ? {
          perConsumerThroughput: input.assumptions.perConsumerThroughput,
          ...(input.assumptions.drainTargetSeconds !== undefined
            ? { drainTargetSeconds: input.assumptions.drainTargetSeconds }
            : {}),
        }
      : {}),
    groupStateAfter: groupStateAfter ?? "not-provided",
  };

  return {
    ok: true,
    result: {
      partitions: partitionResults,
      totalLagBefore,
      totalLagAfter,
      totalLagDelta,
      totalLagRatePerSec,
      totalIngressRatePerSec,
      totalCommittedRatePerSec,
      totalCurrentDelta,
      totalCurrentRatePerSec,
      partitionSkew,
      hotPartitions: hotPartitionIds,
      committedRegressions,
      currentRegressions,
      drainEta,
      throughputRequirements,
      capacity,
      condition,
      conditionFlags,
      confidence,
      assumptions,
      recommendations: RECOMMENDATIONS,
      resourceLinks: RESOURCE_LINKS,
    },
  };
}

// ─── Confidence Assessment ──────────────────────────────────────────────────

function assessConfidence(
  input: LagTriageInput,
  partitionCount: number,
  flags: ConditionFlags,
): ConfidenceAssessment {
  const reasons: string[] = [];
  let score = 100; // start high, deduct for uncertainty

  // Short intervals add noise
  if (input.intervalSeconds < 10) {
    score -= 30;
    reasons.push(
      `Very short interval (${input.intervalSeconds}s) — rates may be noisy.`,
    );
  } else if (input.intervalSeconds < 30) {
    score -= 15;
    reasons.push(
      `Short interval (${input.intervalSeconds}s) — moderate measurement noise.`,
    );
  } else if (input.intervalSeconds >= 300) {
    reasons.push(
      `Interval ${input.intervalSeconds}s provides good statistical basis.`,
    );
  }

  // Few partitions → less data
  if (partitionCount <= 1) {
    score -= 10;
    reasons.push("Single partition — skew analysis not meaningful.");
  }

  // Group state signals
  if (flags.groupStateUnstable) {
    score -= 15;
    reasons.push(
      "Group is not stable — metrics during rebalancing may not reflect steady state.",
    );
  }

  // Offset regressions
  if (flags.hasCommittedRegressions) {
    score -= 20;
    reasons.push(
      "Committed offset regressions detected — consumer may have reset offsets, adding uncertainty.",
    );
  }

  if (flags.hasCurrentRegressions) {
    score -= 10;
    reasons.push(
      "Current offset regressions detected — in-flight position moved backward.",
    );
  }

  // No group state provided
  if (
    input.snapshotAfter.groupState === undefined &&
    input.snapshotBefore.groupState === undefined
  ) {
    score -= 5;
    reasons.push(
      "Group stability state not provided — cannot assess rebalance impact.",
    );
  }

  // Clamp
  score = Math.max(0, Math.min(100, score));

  let level: ConfidenceAssessment["level"];
  if (score >= 70) {
    level = "high";
  } else if (score >= 40) {
    level = "moderate";
  } else {
    level = "low";
  }

  return {
    level,
    reason: reasons.length > 0 ? reasons.join(" ") : "Adequate data and stable conditions.",
  };
}
