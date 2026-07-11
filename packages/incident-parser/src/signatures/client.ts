import type { SignatureDefinition } from "../signature-types";

export const STALE_LEADER_SIGNATURE: SignatureDefinition = {
    id: "stale-leader-metadata",
    title: "Stale leader / metadata inconsistency",
    severity: "high",
    baseConfidence: 15,
    patterns: [
      { pattern: /NOT_LEADER_FOR_PARTITION|NotLeaderForPartition|NotLeaderOrFollower/i, weight: 25, expectedKind: "client-log" },
      { pattern: /LEADER_NOT_AVAILABLE|LeaderNotAvailable/i, weight: 20, expectedKind: "client-log" },
      { pattern: /stale.*(?:metadata|leader)|metadata.*(?:stale|expired|refresh)/i, weight: 15, expectedKind: "client-log" },
      { pattern: /UNKNOWN_TOPIC_OR_PARTITION/i, weight: 15, expectedKind: "client-log" },
      { pattern: /metadata\.max\.age\.ms/i, weight: 10, expectedKind: "config" },
      { pattern: /PreferredReplicaImbalanceCount/i, weight: 10, expectedKind: "metric-snapshot" },
    ],
    conflicts: [
      { pattern: /leader\s*election.*(?:complete|success)/i, reduction: 10, expectedKind: "broker-log" },
    ],
    missingEvidence: [
      "Client metadata.max.age.ms configuration",
      "Broker leadership distribution",
      "Recent controller logs showing leader elections",
    ],
    recommendedNextEvidence: [
      "Run: kafka-metadata --snapshot to check current metadata",
      "Review client-side metadata refresh interval",
      "Check controller log for recent leader elections",
    ],
    resourceLinks: [
      { label: "NotLeaderOrFollowerException", href: "/errors/not-leader-or-follower-exception", surface: "errors" },
      { label: "Controller flapping runbook", href: "/runbooks/controller-flapping", surface: "runbooks" },
    ],
    observability: [
      {
        metric: "kafka.controller:type=KafkaController,name=PreferredReplicaImbalanceCount",
        description: "Partitions whose leader is not the preferred replica (gauge, count).",
        rationale: "High imbalance indicates leader distribution is skewed, causing stale metadata errors on clients that cache old assignments.",
        caveat: "Do not alert on a non-zero value alone. It is expected during rolling restarts; correlate sustained imbalance with client errors and leadership movement.",
      },
      {
        metric: "kafka.network:type=RequestMetrics,name=ErrorsPerSec,request={Produce|Fetch}",
        description: "Broker request errors by API and error code (count/sec), including stale-leader responses.",
        rationale: "Separating NOT_LEADER_OR_FOLLOWER and LEADER_NOT_AVAILABLE errors from aggregate failures confirms metadata-related client impact.",
        caveat: "Do not alert on aggregate errors alone. Break down by API, error code, client, and deployment window, then compare with the workload's normal retry baseline.",
      },
      {
        metric: "kafka.network:type=RequestMetrics,name=TotalTimeMs,request={Produce|Fetch}",
        description: "End-to-end broker request latency (milliseconds; inspect workload-relevant percentiles).",
        rationale: "Leadership churn and metadata retries often increase tail latency before they cause sustained request failures.",
        caveat: "Do not use one universal latency threshold. Select percentiles and limits from the API's SLO, record size, acks mode, and normal traffic shape.",
      },
    ],
  };

export const POLL_TIMEOUT_SIGNATURE: SignatureDefinition = {
    id: "poll-timeout-rebalance",
    title: "Consumer poll timeout / excessive rebalances",
    severity: "high",
    baseConfidence: 15,
    patterns: [
      { pattern: /(?:poll|heartbeat)\s*timeout|max\.poll\.interval\.ms/i, weight: 20, expectedKind: "client-log" },
      { pattern: /Commit cannot be completed since the group has already rebalanced/i, weight: 25, expectedKind: "client-log" },
      { pattern: /Member.*has been removed from the group/i, weight: 20, expectedKind: "client-log" },
      { pattern: /Rebalance|JoinGroup|SyncGroup|rebalancing/i, weight: 10, expectedKind: "client-log" },
      { pattern: /session\.timeout\.ms|heartbeat\.interval\.ms/i, weight: 10, expectedKind: "config" },
      { pattern: /consumer.*(?:lag|behind|falling)/i, weight: 10, expectedKind: "consumer-groups-output" },
      { pattern: /max\.poll\.records/i, weight: 10, expectedKind: "config" },
    ],
    conflicts: [
      { pattern: /rebalance.*(?:complete|stable|settled)/i, reduction: 10, expectedKind: "client-log" },
    ],
    missingEvidence: [
      "max.poll.interval.ms and max.poll.records configuration",
      "Consumer processing time metrics",
      "Consumer group describe output showing member assignments",
    ],
    recommendedNextEvidence: [
      "Run: kafka-consumer-groups --describe --group <group-id>",
      "Check consumer-side processing latency",
      "Review max.poll.interval.ms and max.poll.records settings",
    ],
    resourceLinks: [
      { label: "Consumer rebalance explained", href: "/learn/consumer-rebalance", surface: "learn" },
      { label: "Consumer lag runbook", href: "/runbooks/consumer-lag-climbing", surface: "runbooks" },
    ],
    observability: [
      {
        metric: "kafka.consumer:type=consumer-coordinator-metrics,name=rebalance-rate-per-hour",
        description: "Consumer group rebalances per hour (count/hour).",
        rationale: "Frequent rebalances cause processing pauses and duplicate consumption. Poll timeouts trigger rebalances.",
        caveat: "Do not alert on a single rebalance or use a universal rate. Compare with deployment activity, group size, and the group's normal stable-period baseline.",
      },
      {
        metric: "records-lag-max change over the observation interval",
        description: "Maximum lag trend across assigned partitions (records and records/sec over a stated interval).",
        rationale: "Growing lag during rebalance storms indicates processing is repeatedly interrupted.",
        caveat: "Lag is workload-specific. Do not alert on the absolute value alone; include ingress rate, processing windows, partition skew, and whether backlog is intentionally accumulated.",
      },
    ],
  };

export const SERIALIZER_SIGNATURE: SignatureDefinition = {
    id: "serializer-magic-byte",
    title: "Serialization error / unknown magic byte",
    severity: "medium",
    baseConfidence: 20,
    patterns: [
      { pattern: /SerializationException|DeserializationException/i, weight: 25, expectedKind: "client-log" },
      { pattern: /unknown\s*magic\s*byte/i, weight: 30, expectedKind: "client-log" },
      { pattern: /Unknown magic byte/i, weight: 30, expectedKind: "stack-trace" },
      { pattern: /(?:key|value)\.(?:serializer|deserializer)/i, weight: 10, expectedKind: "config" },
      { pattern: /schema.*(?:not found|incompatible|registry)/i, weight: 15, expectedKind: "client-log" },
      { pattern: /RecordDeserializationException/i, weight: 25, expectedKind: "client-log" },
    ],
    conflicts: [],
    missingEvidence: [
      "Producer serializer and consumer deserializer configuration",
      "Schema Registry compatibility settings (if applicable)",
      "Sample record headers or format",
    ],
    recommendedNextEvidence: [
      "Compare producer key.serializer/value.serializer with consumer deserializer",
      "Check if Schema Registry is accessible from the consumer",
      "Inspect topic records: kafka-console-consumer --from-beginning --max-messages 1",
    ],
    resourceLinks: [
      { label: "Check client configuration", href: "/diagnose", surface: "diagnose" },
    ],
    observability: [
      {
        metric: "kafka.consumer:type=consumer-fetch-manager-metrics,name=records-error-rate",
        description: "Rate of records that fail deserialization (errors/sec).",
        rationale: "Non-zero record error rate with magic byte errors indicates format mismatch between producer and consumer.",
        caveat: "Do not alert on brief spikes alone during schema evolution. Compare sustained errors after rollout with the deployment baseline and affected consumer population.",
      },
    ],
  };
