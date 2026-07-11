/**
 * Capacity and N-1 headroom analysis engine.
 *
 * Deterministic: same input always produces the same result.
 * Framework-free, browser/Node compatible.
 *
 * ─── Formulas (all in canonical units) ───────────────────────────────────
 *
 * Storage:
 *   logicalUncompressedIngressBytesPerSec = peakIngressRate × avgRecordSizeBytes
 *   logicalUncompressedRetainedBytes      = logicalUncompressedIngressBytesPerSec × retentionSeconds
 *   compressedPrimaryRetainedBytes        = logicalUncompressedRetainedBytes × compressionRatio
 *   physicalRetainedBytes                 = compressedPrimaryRetainedBytes × replicationFactor
 *
 * Network:
 *   compressedIngressBytesPerSec          = logicalUncompressedIngressBytesPerSec × compressionRatio
 *   followerReplicationBytesPerSec        = compressedIngressBytesPerSec × (replicationFactor - 1)
 *   consumerReadBytesPerSec               = compressedIngressBytesPerSec × fullReadConsumerGroupCount
 *   totalClusterNetworkBytesPerSec        = compressedIngress + followerReplication + consumerRead
 *
 * Partitions:
 *   minimumPartitionsFromTarget           = ceil(compressedIngress / perPartitionTargetThroughput)
 *   avgPerPartitionThroughput             = compressedIngress / partitionCount
 *   skewAdjustedHottestPartition          = avgPerPartitionThroughput × skewFactor
 *
 * Per-broker load (average):
 *   storagePerBroker  = physicalRetainedBytes / brokerCount
 *   networkPerBroker  = totalClusterNetwork / brokerCount
 *   utilization       = perBroker / perBrokerCapacity
 *   headroom          = 1 - utilization
 *
 * Per-broker load (N-1, when brokerCount >= 2):
 *   Same formulas with activeBrokers = brokerCount - 1
 *
 * ─── Network Accounting Model ────────────────────────────────────────────
 *
 * Cluster traffic = producer ingress + follower replication + full-read consumer egress.
 * Bidirectional NIC: the per-broker figure approximates the busiest direction
 * (typically egress-dominated). This is a simplification — real-world NICs
 * handle ingress and egress independently, and the bottleneck depends on the
 * ratio of consumers to replication traffic.
 *
 * Not modeled: controller/metadata traffic, partial-read consumers, tiered
 * storage offload, rack-aware replication asymmetry. No vendor-specific limits.
 */

import type {
  CapacityPlannerInput,
  CapacityAnalysisResult,
  CapacityPlannerResult,
  StorageBreakdown,
  NetworkBreakdown,
  PartitionAnalysis,
  BrokerLoad,
  CapacityStatus,
  CapacityWarning,
  CapacityObservabilityRecommendation,
  CapacityResourceLink,
  CapacityAnalysisAssumptions,
} from "./types";
import {
  validateUnknownCapacityInput,
  validateCapacityInput,
  DEFAULT_SAFETY_HEADROOM_TARGET,
  DEFAULT_SKEW_FACTOR,
} from "./validate";

// ─── Observability Recommendations ──────────────────────────────────────────

const OBSERVABILITY_RECOMMENDATIONS: readonly CapacityObservabilityRecommendation[] = [
  {
    metric: "kafka.log.size / disk.used.bytes",
    description: "Total bytes of Kafka log data on disk per broker, or disk utilization percentage. Track growth rate over time.",
    rationale: "Storage exhaustion causes broker failures and data loss. Monitoring disk growth against retention validates the capacity plan and catches retention misconfigurations or unexpected ingress spikes before they fill disks.",
    caveat: "Do not alert on absolute disk usage alone. A broker with large disks at 90% may have weeks of headroom, while a small-disk broker at 60% may be hours from full. Combine with growth rate and time-to-full estimates calibrated to your workload baseline.",
  },
  {
    metric: "kafka.network.io.bytes.rate / broker.network.utilization",
    description: "Bytes per second of network I/O per broker (ingress + egress combined or per direction). Compare against NIC capacity.",
    rationale: "Network saturation causes increased latency, request timeouts, and under-replicated partitions. Monitoring validates the traffic model (ingress + replication + consumer read) and detects consumer fan-out surges.",
    caveat: "Do not alert on instantaneous spikes alone. Kafka traffic is bursty during catch-up and rebalances; choose the sustained window from your NIC capacity, workload baseline, and latency SLO.",
  },
  {
    metric: "kafka.server:OfflinePartitionsCount / kafka.server:UnderReplicatedPartitions / kafka.server:UnderMinIsrPartitionCount",
    description: "Count of offline, under-replicated, or under-min-ISR partitions across the cluster.",
    rationale: "Non-zero values indicate broker failures, disk issues, or network problems that directly test the N-1 headroom model. Under-replicated partitions mean the cluster is operating in degraded mode.",
    caveat: "Do not alert on transient under-replication alone during rolling restarts or controlled maintenance. Correlate duration, offline partitions, and recovery progress with the cluster's normal maintenance window and RPO/RTO requirements.",
  },
  {
    metric: "kafka.network:RequestMetrics:TotalTimeMs / kafka.network:RequestMetrics:ErrorsPerSec",
    description: "Request latency percentiles (p50, p99) and error rate for Produce and Fetch requests.",
    rationale: "Elevated latency or errors indicate that brokers are approaching resource limits (CPU, network, disk I/O). These are leading indicators of capacity problems before storage or network hard limits are reached.",
    caveat: "Do not use fixed latency thresholds across all workloads. A 100ms p99 may be excellent for batch processing but unacceptable for real-time event streaming. Establish baseline latency for your specific workload and alert on sustained deviations.",
  },
  {
    metric: "kafka.log:LogEndOffset.skew / partition.size.stddev",
    description: "Variance or coefficient of variation in partition sizes or log-end offsets across partitions of the same topic.",
    rationale: "High partition skew means some brokers carry disproportionate load, making average-based capacity plans inaccurate. The skew factor in this planner models this risk, but actual skew should be measured and compared.",
    caveat: "Do not alert on skew alone without workload context. Time-based partitioning naturally creates temporary skew as recent partitions receive all writes. Evaluate skew relative to the partition strategy (hash, round-robin, custom) and whether it causes broker-level resource imbalance.",
  },
];

// ─── Resource Links ─────────────────────────────────────────────────────────

export const RESOURCE_LINKS: readonly CapacityResourceLink[] = [
  { label: "Consumer Lag Triage", href: "/workbench/lag", surface: "workbench" },
  { label: "Incident Triage", href: "/workbench/incident", surface: "workbench" },
  { label: "Broker restart playbook", href: "/runbooks/broker-wont-restart", surface: "runbooks" },
  { label: "ISR and replication", href: "/learn/isr-and-acks", surface: "learn" },
  { label: "Configuration diagnostics", href: "/diagnose", surface: "diagnose" },
  { label: "Kafka simulator", href: "/simulate", surface: "simulate" },
];

// ─── Analysis Engine ────────────────────────────────────────────────────────

/**
 * Analyze cluster capacity and N-1 headroom.
 *
 * Accepts `unknown` at runtime — structurally invalid input returns typed
 * `CapacityValidationIssue[]`, never throws.
 *
 * @param input - Raw input (will be validated)
 * @returns Discriminated union: `{ ok: true, result }` or `{ ok: false, issues }`
 */
export function analyzeCapacity(input: unknown): CapacityPlannerResult {
  // Structural validation
  const structural = validateUnknownCapacityInput(input);
  if (!structural.ok) return { ok: false, issues: structural.issues };

  // Semantic validation
  const semanticIssues = validateCapacityInput(structural.input);
  if (semanticIssues.length > 0) return { ok: false, issues: semanticIssues };

  const inp = structural.input;
  const safetyTarget = inp.safetyHeadroomTarget ?? DEFAULT_SAFETY_HEADROOM_TARGET;
  const skewFactor = inp.skewFactor ?? DEFAULT_SKEW_FACTOR;

  // ── Storage breakdown ─────────────────────────────────────────────────
  const logicalUncompressedIngressBytesPerSec = inp.peakIngressRate * inp.avgRecordSizeBytes;
  const logicalUncompressedRetainedBytes = logicalUncompressedIngressBytesPerSec * inp.retentionSeconds;
  const compressedPrimaryRetainedBytes = logicalUncompressedRetainedBytes * inp.compressionRatio;
  const physicalRetainedBytes = compressedPrimaryRetainedBytes * inp.replicationFactor;

  const storage: StorageBreakdown = {
    logicalUncompressedIngressBytesPerSec,
    logicalUncompressedRetainedBytes,
    compressedPrimaryRetainedBytes,
    physicalRetainedBytes,
  };

  // ── Network breakdown ─────────────────────────────────────────────────
  const compressedIngressBytesPerSec = logicalUncompressedIngressBytesPerSec * inp.compressionRatio;
  const followerReplicationBytesPerSec = compressedIngressBytesPerSec * (inp.replicationFactor - 1);
  const consumerReadBytesPerSec = compressedIngressBytesPerSec * inp.fullReadConsumerGroupCount;
  const totalClusterNetworkBytesPerSec =
    compressedIngressBytesPerSec + followerReplicationBytesPerSec + consumerReadBytesPerSec;

  const network: NetworkBreakdown = {
    compressedIngressBytesPerSec,
    followerReplicationBytesPerSec,
    consumerReadBytesPerSec,
    totalClusterNetworkBytesPerSec,
  };

  // ── Partition analysis ────────────────────────────────────────────────
  const minimumPartitionsFromTarget = Math.ceil(compressedIngressBytesPerSec / inp.perPartitionTargetThroughput);
  const avgPerPartitionThroughput = compressedIngressBytesPerSec / inp.partitionCount;
  const skewAdjustedHottestPartitionThroughput = avgPerPartitionThroughput * skewFactor;

  const partitions: PartitionAnalysis = {
    minimumPartitionsFromTarget,
    partitionCountSufficient: inp.partitionCount >= minimumPartitionsFromTarget,
    avgPerPartitionThroughput,
    skewAdjustedHottestPartitionThroughput,
    hottestPartitionExceedsTarget: skewAdjustedHottestPartitionThroughput > inp.perPartitionTargetThroughput,
  };

  // ── Broker load: average ──────────────────────────────────────────────
  const averageLoad = computeBrokerLoad(
    "average",
    inp.brokerCount,
    physicalRetainedBytes,
    totalClusterNetworkBytesPerSec,
    inp.perBrokerStorageBytes,
    inp.perBrokerNetworkBytesPerSec,
    safetyTarget,
  );

  // ── Broker load: N-1 ─────────────────────────────────────────────────
  // N-1 only when brokerCount >= 2 (validated above as warning, but we
  // still compute if possible)
  let n1Load: BrokerLoad | undefined;
  if (inp.brokerCount >= 2) {
    n1Load = computeBrokerLoad(
      "n-1",
      inp.brokerCount - 1,
      physicalRetainedBytes,
      totalClusterNetworkBytesPerSec,
      inp.perBrokerStorageBytes,
      inp.perBrokerNetworkBytesPerSec,
      safetyTarget,
    );
  }

  // ── Warnings ──────────────────────────────────────────────────────────
  const warnings = computeWarnings(inp, averageLoad, n1Load, partitions, safetyTarget, skewFactor);

  // ── Status ────────────────────────────────────────────────────────────
  const status = computeStatus(warnings);

  // ── Assumptions ───────────────────────────────────────────────────────
  const assumptions: CapacityAnalysisAssumptions = {
    peakIngressRate: inp.peakIngressRate,
    avgRecordSizeBytes: inp.avgRecordSizeBytes,
    compressionRatio: inp.compressionRatio,
    retentionSeconds: inp.retentionSeconds,
    replicationFactor: inp.replicationFactor,
    partitionCount: inp.partitionCount,
    brokerCount: inp.brokerCount,
    fullReadConsumerGroupCount: inp.fullReadConsumerGroupCount,
    perPartitionTargetThroughput: inp.perPartitionTargetThroughput,
    perBrokerStorageBytes: inp.perBrokerStorageBytes,
    perBrokerNetworkBytesPerSec: inp.perBrokerNetworkBytesPerSec,
    safetyHeadroomTarget: safetyTarget,
    skewFactor,
  };

  const result: CapacityAnalysisResult = {
    storage,
    network,
    partitions,
    averageLoad,
    n1Load,
    status,
    warnings,
    recommendations: OBSERVABILITY_RECOMMENDATIONS,
    resourceLinks: RESOURCE_LINKS,
    assumptions,
  };

  return { ok: true, result };
}

// ─── Broker Load Computation ────────────────────────────────────────────────

function computeBrokerLoad(
  scenario: "average" | "n-1",
  activeBrokers: number,
  physicalRetainedBytes: number,
  totalClusterNetworkBytesPerSec: number,
  perBrokerStorageBytes: number,
  perBrokerNetworkBytesPerSec: number,
  safetyTarget: number,
): BrokerLoad {
  const storagePerBroker = physicalRetainedBytes / activeBrokers;
  const networkPerBroker = totalClusterNetworkBytesPerSec / activeBrokers;
  const storageUtilization = storagePerBroker / perBrokerStorageBytes;
  const networkUtilization = networkPerBroker / perBrokerNetworkBytesPerSec;

  return {
    scenario,
    activeBrokers,
    storagePerBroker,
    networkPerBroker,
    storageUtilization,
    networkUtilization,
    storageHeadroom: 1 - storageUtilization,
    networkHeadroom: 1 - networkUtilization,
    storageExceedsSafetyTarget: storageUtilization > safetyTarget,
    networkExceedsSafetyTarget: networkUtilization > safetyTarget,
    storageShortfall: storageUtilization > 1,
    networkShortfall: networkUtilization > 1,
  };
}

// ─── Warning Generation ─────────────────────────────────────────────────────

function computeWarnings(
  input: CapacityPlannerInput,
  average: BrokerLoad,
  n1: BrokerLoad | undefined,
  partitionAnalysis: PartitionAnalysis,
  safetyTarget: number,
  skewFactor: number,
): CapacityWarning[] {
  const warnings: CapacityWarning[] = [];

  // Average-only planning warning
  if (input.brokerCount >= 2 && !average.storageShortfall && !average.networkShortfall) {
    if (n1 && (n1.storageShortfall || n1.networkShortfall)) {
      warnings.push({
        id: "average-only-misleading",
        severity: "critical",
        message: "Average load looks healthy, but N-1 analysis shows shortfalls. Planning only for average load is dangerous — a single broker failure would exceed cluster capacity.",
      });
    } else if (n1 && (n1.storageExceedsSafetyTarget || n1.networkExceedsSafetyTarget)) {
      warnings.push({
        id: "average-only-warning",
        severity: "warning",
        message: `Average load is within the safety target (${(safetyTarget * 100).toFixed(0)}%), but N-1 load exceeds it. Consider adding brokers or reducing retention to maintain headroom during broker failures.`,
      });
    }
  }

  // RF/broker constraints
  if (input.replicationFactor === input.brokerCount) {
    warnings.push({
      id: "rf-equals-brokers",
      severity: "warning",
      message: `Replication factor (${input.replicationFactor}) equals broker count (${input.brokerCount}). Every broker holds a copy, and after one broker fails the cluster cannot restore the configured RF until capacity is added or the broker returns. Adding partitions will not reduce this storage constraint.`,
    });
  }

  if (input.replicationFactor === 1) {
    warnings.push({
      id: "rf-one-no-redundancy",
      severity: "critical",
      message: "Replication factor 1 provides no redundancy. Any broker failure will cause data loss for partitions on that broker. N-1 analysis is not meaningful with RF=1.",
    });
  }

  // Insufficient partitions
  if (!partitionAnalysis.partitionCountSufficient) {
    warnings.push({
      id: "insufficient-partitions",
      severity: "warning",
      message: `Configured partition count (${input.partitionCount}) is below the minimum required (${partitionAnalysis.minimumPartitionsFromTarget}) based on the per-partition target throughput. Increase partition count.`,
    });
  }

  // N-1 shortfall
  if (n1) {
    if (n1.storageShortfall) {
      warnings.push({
        id: "n1-storage-shortfall",
        severity: "critical",
        message: `N-1 storage shortfall: with one broker down, each remaining broker would need ${fmtBytes(n1.storagePerBroker)} but only has ${fmtBytes(input.perBrokerStorageBytes)} available (${(n1.storageUtilization * 100).toFixed(1)}% utilization).`,
      });
    }
    if (n1.networkShortfall) {
      warnings.push({
        id: "n1-network-shortfall",
        severity: "critical",
        message: `N-1 network shortfall: with one broker down, each remaining broker would need ${fmtBytesPerSec(n1.networkPerBroker)} but can sustain ${fmtBytesPerSec(input.perBrokerNetworkBytesPerSec)} (${(n1.networkUtilization * 100).toFixed(1)}% utilization).`,
      });
    }
  }

  // Average shortfall
  if (average.storageShortfall) {
    warnings.push({
      id: "avg-storage-shortfall",
      severity: "critical",
      message: `Storage shortfall even with all brokers healthy: each broker needs ${fmtBytes(average.storagePerBroker)} but only has ${fmtBytes(input.perBrokerStorageBytes)} available (${(average.storageUtilization * 100).toFixed(1)}% utilization).`,
    });
  }
  if (average.networkShortfall) {
    warnings.push({
      id: "avg-network-shortfall",
      severity: "critical",
      message: `Network shortfall even with all brokers healthy: each broker needs ${fmtBytesPerSec(average.networkPerBroker)} but can sustain ${fmtBytesPerSec(input.perBrokerNetworkBytesPerSec)} (${(average.networkUtilization * 100).toFixed(1)}% utilization).`,
    });
  }

  // Storage/network saturation (above safety but below 100%)
  if (average.storageExceedsSafetyTarget && !average.storageShortfall) {
    warnings.push({
      id: "avg-storage-above-safety",
      severity: "warning",
      message: `Average storage utilization (${(average.storageUtilization * 100).toFixed(1)}%) exceeds the ${(safetyTarget * 100).toFixed(0)}% safety target. Storage is usable but has limited headroom for growth or recovery.`,
    });
  }
  if (average.networkExceedsSafetyTarget && !average.networkShortfall) {
    warnings.push({
      id: "avg-network-above-safety",
      severity: "warning",
      message: `Average network utilization (${(average.networkUtilization * 100).toFixed(1)}%) exceeds the ${(safetyTarget * 100).toFixed(0)}% safety target. Network is usable but has limited headroom for bursts.`,
    });
  }

  // Hot-partition/skew risk
  if (skewFactor > 1.0 && partitionAnalysis.hottestPartitionExceedsTarget) {
    warnings.push({
      id: "skew-hot-partition",
      severity: "warning",
      message: `With a skew factor of ${skewFactor.toFixed(1)}×, the hottest partition would handle ${fmtBytesPerSec(partitionAnalysis.skewAdjustedHottestPartitionThroughput)}, exceeding the per-partition target of ${fmtBytesPerSec(input.perPartitionTargetThroughput)}. Consider a more uniform partitioning strategy or increase the target.`,
    });
  } else if (skewFactor === 1.0) {
    warnings.push({
      id: "skew-not-modeled",
      severity: "info",
      message: "Skew factor is 1.0 (perfectly balanced). Real workloads typically have some partition skew. Consider setting a skew factor > 1.0 to model worst-case scenarios for key-based partitioning.",
    });
  }

  return warnings;
}

// ─── Status Computation ─────────────────────────────────────────────────────

function computeStatus(
  warnings: readonly CapacityWarning[],
): CapacityStatus {
  if (warnings.some((warning) => warning.severity === "critical")) {
    return "fail";
  }
  if (warnings.some((warning) => warning.severity === "warning")) {
    return "warning";
  }

  return "pass";
}

// ─── Formatting Helpers ─────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  if (bytes < 1024 * 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GiB`;
  return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TiB`;
}

function fmtBytesPerSec(bytesPerSec: number): string {
  return `${fmtBytes(bytesPerSec)}/s`;
}
