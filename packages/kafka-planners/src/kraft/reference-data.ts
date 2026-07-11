/**
 * Reviewed Kafka baselines, source citations, links, and observability guidance.
 */

import type {
  KRaftObservabilityRecommendation,
  KRaftResourceLink,
  KRaftSourceCitation,
  KRaftVersionBaseline,
} from "./types";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Reviewed release baseline. */
export const VERSION_BASELINE: KRaftVersionBaseline = {
  reviewedRelease: "4.3.1",
  releaseDate: "2026-06-25",
  reviewDate: "2026-07-25",
  caveat:
    "This is a time-bounded review based on Kafka 4.3.1 (released 2026-06-25, reviewed 2026-07-25). It is not a timeless latest-version claim. Check the Apache Kafka downloads page for newer releases.",
};

/** Source citations. */
export const SOURCES: readonly KRaftSourceCitation[] = [
  {
    label: "Kafka 3.9 KRaft Migration Docs",
    url: "https://kafka.apache.org/39/operations/kraft/",
    scope: "ZooKeeper-to-KRaft migration procedures for Kafka 3.9.x",
  },
  {
    label: "Kafka 4.0 Upgrade Docs",
    url: "https://kafka.apache.org/40/getting-started/upgrade/",
    scope: "Upgrading to Kafka 4.0 (first KRaft-only release)",
  },
  {
    label: "Kafka 4.3 Upgrade Docs",
    url: "https://kafka.apache.org/43/getting-started/upgrade/",
    scope: "Upgrading to Kafka 4.3",
  },
  {
    label: "Kafka 4.3.1 Release Notes",
    url: "https://downloads.apache.org/kafka/4.3.1/RELEASE_NOTES.html",
    scope: "Kafka 4.3.1 release notes",
  },
  {
    label: "Apache Kafka Downloads",
    url: "https://kafka.apache.org/community/downloads/",
    scope: "Official Apache Kafka release downloads",
  },
];

/** Resource links to related Kafka Hub surfaces. */
export const RESOURCE_LINKS: readonly KRaftResourceLink[] = [
  {
    label: "Listener Topology Wizard",
    href: "/workbench/listeners",
    surface: "workbench",
  },
  {
    label: "Capacity Planner",
    href: "/workbench/capacity",
    surface: "workbench",
  },
  {
    label: "Consumer Lag Triage",
    href: "/workbench/lag",
    surface: "workbench",
  },
  {
    label: "Kafka 3.9 KRaft Migration Docs",
    href: "https://kafka.apache.org/39/operations/kraft/",
    surface: "external",
  },
  {
    label: "Kafka 4.0 Upgrade Guide",
    href: "https://kafka.apache.org/40/getting-started/upgrade/",
    surface: "external",
  },
];

// ─── Observability Recommendations ──────────────────────────────────────────

export const OBSERVABILITY: readonly KRaftObservabilityRecommendation[] = [
  {
    metric: "kafka.server:type=raft-metrics,name=current-leader",
    description:
      "The current KRaft quorum leader node ID. Value -1 indicates no leader. Unit: node ID (dimensionless integer).",
    rationale:
      "In KRaft mode, this is the primary signal for quorum health. If current-leader is -1, no controller can serve metadata requests and the cluster is effectively stalled.",
    caveat:
      "Brief periods with -1 during leader elections are normal. Do not alert on transient values alone — correlate with election rate and quorum follower connectivity. Baseline your election frequency before setting alerts.",
  },
  {
    metric: "kafka.server:type=raft-metrics,name=high-watermark-update-rate",
    description:
      "Rate at which the KRaft log high watermark advances. Unit: updates/second.",
    rationale:
      "A stalled high watermark means the quorum is not making progress. During migration, this indicates metadata replication has stopped — a critical issue.",
    caveat:
      "The normal rate depends entirely on your cluster's metadata change frequency. A low rate during idle periods is expected. Establish a workload-specific baseline rather than alerting on a universal threshold.",
  },
  {
    metric: "kafka.server:type=raft-metrics,name=commit-latency-avg",
    description:
      "Average time to commit a record to the KRaft quorum log. Unit: milliseconds.",
    rationale:
      "Increasing commit latency during migration may indicate quorum contention, network issues between controllers, or disk I/O bottlenecks on controller nodes.",
    caveat:
      "Commit latency varies by controller hardware, network topology, and metadata change volume. Establish your own baseline; universal numeric thresholds are not meaningful.",
  },
  {
    metric: "kafka.controller:type=KafkaController,name=ActiveControllerCount",
    description:
      "Number of active controllers in the cluster. Expected: exactly 1 in a healthy KRaft quorum. Unit: count (dimensionless).",
    rationale:
      "Confirms a controller leader is elected and serving. During migration, complements the raft-metrics current-leader signal. Note: in KRaft mode, prefer current-leader as the primary quorum health indicator.",
    caveat:
      "A brief period with 0 active controllers during leader election is normal. Do not alert on transient drops alone — correlate with quorum leader change rate and broker connectivity.",
  },
  {
    metric: "kafka.controller:type=ControllerChannelManager,name=QueueSize",
    description:
      "Number of pending controller-to-broker requests. Unit: count.",
    rationale:
      "A growing queue during migration may indicate brokers are slow to process metadata updates from the new KRaft controller, potentially signaling resource contention or misconfiguration.",
    caveat:
      "Queue size varies by cluster size and workload. Spikes during rolling restarts or partition reassignment are expected. Baseline your cluster before setting thresholds.",
  },
  {
    metric: "kafka.server:type=ReplicaManager,name=UnderReplicatedPartitions",
    description:
      "Number of partitions where the ISR is smaller than the configured replication factor. Unit: count of partitions.",
    rationale:
      "Under-replicated partitions during migration may indicate broker disruption or metadata sync issues between ZooKeeper and KRaft controllers.",
    caveat:
      "Under-replicated partitions are common during rolling restarts. Do not alert on this metric alone — correlate with broker availability and recent operational changes.",
  },
  {
    metric: "kafka.server:type=ReplicaManager,name=OfflinePartitionsCount",
    description:
      "Number of partitions with no active leader. Unit: count of partitions. Should be 0 in steady state.",
    rationale:
      "Offline partitions indicate data unavailability. During migration, any offline partitions signal a critical issue requiring immediate investigation.",
    caveat:
      "Offline partitions can occur during planned maintenance. Correlate with controller state and broker health before escalating. Workload-specific acceptable windows exist.",
  },
  {
    metric: "kafka.server:type=ReplicaManager,name=UnderMinIsrPartitionCount",
    description:
      "Number of partitions where the ISR size is below min.insync.replicas. Unit: count of partitions.",
    rationale:
      "Below-min-ISR partitions risk data loss under acks=all producers. During migration, this may indicate metadata propagation delays or broker issues.",
    caveat:
      "Do not alert on this signal alone. Its impact depends on min.insync.replicas, producer acks, durability requirements, and the current migration or maintenance state.",
  },
  {
    metric: "kafka.log:type=LogManager,name=OfflineLogDirectoryCount",
    description:
      "Number of log directories that have gone offline. Unit: count. Should be 0.",
    rationale:
      "Failed log directories reduce storage capacity and can cause partition unavailability. Must be resolved before migration finalization.",
    caveat:
      "A single failed directory on a multi-directory broker may not cause immediate outage but must be addressed. Do not ignore this metric even if partitions appear healthy.",
  },
  {
    metric: "kafka.network:type=RequestMetrics,name=TotalTimeMs,request=Produce",
    description:
      "End-to-end latency for produce requests. Unit: milliseconds. Monitor p50, p99, and p999.",
    rationale:
      "Increased produce latency during migration may indicate controller or metadata contention. Monitoring latency through each migration phase helps identify regressions.",
    caveat:
      "Latency varies significantly by workload, hardware, and configuration. Establish your own baseline before migration and compare against it. Universal thresholds are not meaningful.",
  },
  {
    metric: "kafka.network:type=RequestMetrics,name=ErrorsPerSec",
    description:
      "Rate of request errors across all request types. Unit: errors/second.",
    rationale:
      "An increase in request errors during migration may indicate client incompatibilities, authentication issues with KRaft controllers, or metadata routing problems.",
    caveat:
      "Some transient errors during rolling restarts are expected. Focus on sustained increases and correlate with specific error codes rather than alerting on the aggregate rate alone.",
  },
];

