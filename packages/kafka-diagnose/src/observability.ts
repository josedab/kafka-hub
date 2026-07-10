/**
 * Evidence-backed observability recommendations for Kafka diagnostic findings.
 *
 * Each recommendation includes:
 * - Rationale: why this metric/alert matters for the finding
 * - Units/context: what the metric measures and typical ranges
 * - Workload-specific guidance: when NOT to alert on it alone
 *
 * These are integrated into findings that relate to operational observability:
 * offline partitions, under-min-ISR, under-replicated partitions, disk,
 * controller/quorum, request errors/latency, and lag growth.
 */

export interface ObservabilityRecommendation {
  /** Metric or signal name (e.g., "kafka.server:type=ReplicaManager,name=UnderReplicatedPartitions"). */
  readonly metric: string;
  /** What the metric measures. */
  readonly description: string;
  /** Typical baseline for healthy clusters. */
  readonly baseline: string;
  /** Why this metric matters for the specific finding. */
  readonly rationale: string;
  /** When this signal is NOT sufficient alone for alerting. */
  readonly caveat: string;
}

/**
 * Observability recommendations keyed by rule ID.
 * Only rules where monitoring adds actionable value are included.
 */
export const OBSERVABILITY_RECOMMENDATIONS: Record<string, ObservabilityRecommendation[]> = {
  "unclean-leader-election": [
    {
      metric: "kafka.controller:type=ControllerStats,name=UncleanLeaderElectionsPerSec",
      description: "Rate of unclean leader elections (count/sec). Any non-zero value means data loss is possible.",
      baseline: "0 in steady state; any spike means the config fired.",
      rationale:
        "With unclean.leader.election.enable=true, this counter increments when a non-ISR replica becomes leader. Monitoring it reveals how often you are paying the data-loss trade-off in practice.",
      caveat:
        "Do not alert on this alone if the config is intentionally enabled for availability-first topics. Correlate with under-replicated partitions and consumer lag to assess actual impact.",
    },
    {
      metric: "kafka.server:type=ReplicaManager,name=OfflinePartitionsCount",
      description: "Number of partitions with no active leader (gauge).",
      baseline: "0; any non-zero means unavailability for those partitions.",
      rationale:
        "If unclean election is disabled, offline partitions indicate the scenario where the config would have 'helped' (at data-loss cost). Correlate to understand availability trade-offs.",
      caveat:
        "Do not alert on a transient non-zero value alone during rolling restarts or planned elections. Compare duration with your observed recovery baseline and partition-availability SLO.",
    },
  ],
  "replication-factor-too-low": [
    {
      metric: "kafka.server:type=ReplicaManager,name=UnderReplicatedPartitions",
      description: "Partitions where the current ISR is smaller than the configured replica set (gauge).",
      baseline:
        "Healthy steady state is normally 0; establish the expected recovery shape for broker restarts and reassignment work.",
      rationale:
        "Low replication factor amplifies the blast radius of under-replication. With RF=2 and min.insync.replicas=2, a single under-replicated partition can halt writes.",
      caveat:
        "Do not alert on brief maintenance spikes alone. Correlate persistence and growth with replica lag, broker health, and the workload's recovery SLO.",
    },
  ],
  "acks-all-with-min-isr-1": [
    {
      metric: "kafka.server:type=ReplicaManager,name=UnderMinIsrPartitionCount",
      description: "Partitions where the live ISR count is below min.insync.replicas (gauge).",
      baseline: "0; non-zero means writes to those partitions will fail with NotEnoughReplicas.",
      rationale:
        "With min.insync.replicas=1, this counter may never fire because a single replica satisfies the constraint. Raising min.insync.replicas to 2 makes this metric an actionable early-warning for write availability loss.",
      caveat:
        "Do not page on this alone if you also monitor UnderReplicatedPartitions; the two signals often correlate and paging on both creates noise. Pick one as the page, one as dashboard context.",
    },
    {
      metric: "kafka.server:type=ReplicaManager,name=IsrShrinksPerSec",
      description: "Rate at which replicas leave the ISR set (count/sec).",
      baseline: "Low, punctuated by broker restarts. Sustained elevation indicates replica lag.",
      rationale:
        "ISR shrinks reveal how often the cluster approaches the min.insync.replicas boundary. High shrink rates with min.insync.replicas=1 mean you silently lose the durability guarantee without any write failure.",
      caveat:
        "ISR shrinks during rolling restarts are normal. Correlate with broker CPU, disk I/O, and network to distinguish operational shrinks from capacity issues.",
    },
  ],
  "transaction-state-rf-low": [
    {
      metric: "kafka.server:type=ReplicaManager,name=UnderReplicatedPartitions",
      description: "Under-replicated partitions including __transaction_state.",
      baseline: "0; non-zero for __transaction_state means transaction coordinator failover is at risk.",
      rationale:
        "With RF<3 for the transaction state topic, a single under-replicated replica means you are one failure away from stalling all transactional workloads.",
      caveat:
        "This metric aggregates all partitions. Filter by topic (__transaction_state) for targeted alerting. Aggregate under-replicated counts alone do not indicate which internal topic is affected.",
    },
  ],
  "offsets-topic-rf-low": [
    {
      metric: "kafka.server:type=ReplicaManager,name=UnderReplicatedPartitions",
      description: "Under-replicated partitions including __consumer_offsets.",
      baseline: "0 steady state.",
      rationale:
        "With RF<3 for __consumer_offsets, under-replication puts consumer commit history at risk. A subsequent broker loss could erase committed offsets.",
      caveat:
        "Filter by the __consumer_offsets topic. Do not escalate a controlled-shutdown spike alone; compare it with the documented maintenance window and replica recovery progress.",
    },
  ],
  "enable-auto-commit-true": [
    {
      metric: "kafka.consumer:type=consumer-coordinator-metrics,client-id=*,name=commit-rate",
      description: "Consumer offset commit rate (commits/sec per consumer instance).",
      baseline: "Depends on auto.commit.interval.ms (default 5s = 0.2 commits/sec).",
      rationale:
        "With auto-commit enabled, this metric reveals commit cadence. Gaps in commit rate correlate with periods where a crash would cause message replay or loss.",
      caveat:
        "Do not alert on commit rate alone. It is a diagnostic signal, not a health metric. Combine with consumer lag to detect actual processing problems.",
    },
    {
      metric: "kafka.consumer:type=consumer-fetch-manager-metrics,client-id=*,name=records-lag-max",
      description: "Maximum lag (in records) across all assigned partitions for this consumer.",
      baseline: "Workload-specific; steady-state lag should be bounded, not growing.",
      rationale:
        "Consumer lag growth combined with auto-commit means the at-risk window (data that could be lost on crash) grows linearly with lag.",
      caveat:
        "Lag growth is workload-specific. Batch consumers may intentionally accumulate lag before processing. Alert on rate of lag growth rather than absolute value.",
    },
  ],
  "request-timeout-vs-delivery-timeout": [
    {
      metric: "kafka.producer:type=producer-metrics,client-id=*,name=record-error-rate",
      description: "Rate of records that failed to be delivered (errors/sec).",
      baseline:
        "Establish a per-producer baseline; healthy steady state is usually 0, while planned failovers may create brief errors.",
      rationale:
        "When delivery.timeout.ms < request.timeout.ms, the producer gives up before retries can succeed. This shows up as sustained record errors even when the broker is healthy.",
      caveat:
        "Do not alert on a brief election or network spike alone. Correlate sustained errors with the configured timeout budget, retry behavior, and the cluster's normal election duration.",
    },
    {
      metric: "kafka.producer:type=producer-metrics,client-id=*,name=request-latency-avg",
      description: "Average request latency to brokers (ms).",
      baseline:
        "Workload- and topology-specific. Record a baseline by client location, request type, payload size, and acks mode.",
      rationale:
        "If average request latency approaches or exceeds delivery.timeout.ms, every send will fail by design. The fix is ensuring delivery timeout > request timeout + linger.",
      caveat:
        "Latency alone is not actionable without knowing the configured timeouts. Dashboard these together for context rather than alerting on latency in isolation.",
    },
  ],
  "auto-leader-rebalance-disabled": [
    {
      metric: "kafka.controller:type=KafkaController,name=PreferredReplicaImbalanceCount",
      description: "Number of partitions whose leader is not the preferred replica (gauge).",
      baseline: "0 when all preferred leaders are active; rises after broker restarts.",
      rationale:
        "With auto-rebalance disabled, this counter stays elevated indefinitely after incidents. It shows the ongoing produce-traffic imbalance across brokers.",
      caveat:
        "Some teams intentionally disable auto-rebalance for controlled maintenance windows and run kafka-leader-election manually. In that workflow, a non-zero imbalance count is expected between maintenance runs — alert only if the imbalance persists beyond your documented SLA.",
    },
  ],
  "num-network-threads-low": [
    {
      metric: "kafka.network:type=SocketServer,name=NetworkProcessorAvgIdlePercent",
      description: "Average idle time of network threads (0.0 = fully saturated, 1.0 = fully idle).",
      baseline:
        "Workload-specific. Lower values mean busier network processors; compare against request latency, queueing, and peak-traffic baselines.",
      rationale:
        "Low num.network.threads with high utilization means the broker cannot accept requests fast enough. This metric directly shows whether the configured thread count is a bottleneck.",
      caveat:
        "Do not alert on idle percentage alone. A busy processor can be healthy when latency and queues meet SLOs; correlate sustained changes with request queue size and latency.",
    },
  ],
};

/**
 * Get observability recommendations for a rule ID. Returns empty array
 * if no recommendations exist for the rule.
 */
export function getObservabilityRecommendations(ruleId: string): ObservabilityRecommendation[] {
  return OBSERVABILITY_RECOMMENDATIONS[ruleId] ?? [];
}
