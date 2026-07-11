import type { SignatureDefinition } from "../signature-types";

export const ISR_MIN_ISR_SIGNATURE: SignatureDefinition = {
    id: "isr-min-isr-failure",
    title: "ISR shrink / min.insync.replicas violation",
    severity: "critical",
    baseConfidence: 20,
    patterns: [
      { pattern: /NotEnoughReplicas(?:Exception)?/i, weight: 30, expectedKind: "broker-log" },
      { pattern: /NotEnoughReplicasAfterAppend/i, weight: 25, expectedKind: "broker-log" },
      { pattern: /UnderMinIsrPartitionCount|under-min-isr/i, weight: 20, expectedKind: "metric-snapshot" },
      { pattern: /ISR\s+shrink|isrShrink|IsrShrinksPerSec/i, weight: 15, expectedKind: "broker-log" },
      { pattern: /min\.insync\.replicas/i, weight: 10, expectedKind: "config" },
      { pattern: /UnderReplicatedPartitions/i, weight: 10, expectedKind: "metric-snapshot" },
    ],
    conflicts: [
      { pattern: /OfflinePartitionsCount\s*[:=]\s*0\b/, reduction: 10, expectedKind: "metric-snapshot" },
    ],
    missingEvidence: [
      "Broker logs showing which replicas left the ISR",
      "Topic describe output showing current ISR list",
      "min.insync.replicas and replication.factor config values",
    ],
    recommendedNextEvidence: [
      "Run: kafka-topics --describe --topic <affected-topic>",
      "Check broker disk I/O and network metrics",
      "Collect kafka-log-dirs output for affected brokers",
    ],
    resourceLinks: [
      { label: "ISR and acks explained", href: "/learn/isr-and-acks", surface: "learn" },
      { label: "Broker recovery runbook", href: "/runbooks/broker-wont-restart", surface: "runbooks" },
      { label: "NotEnoughReplicasException", href: "/errors/not-enough-replicas-exception", surface: "errors" },
      { label: "Simulate ISR shrink", href: "/simulate?scenario=isr-shrink", surface: "simulate" },
    ],
    observability: [
      {
        metric: "kafka.server:type=ReplicaManager,name=UnderMinIsrPartitionCount",
        description: "Partitions where ISR count < min.insync.replicas (gauge, count).",
        rationale: "Non-zero means writes will fail for affected partitions. Direct indicator of this failure mode.",
        caveat: "Do not alert on this alone during rolling restarts when brokers are intentionally offline. Correlate with planned maintenance windows.",
      },
      {
        metric: "kafka.server:type=ReplicaManager,name=IsrShrinksPerSec",
        description: "Rate of ISR shrinks (count/sec).",
        rationale: "Rising shrink rate indicates replicas cannot keep up, often preceding min-ISR violations.",
        caveat: "Brief spikes during broker restarts are expected. Do not use a universal duration threshold; compare with the cluster's restart-free baseline and recovery SLO.",
      },
      {
        metric: "kafka.server:type=ReplicaManager,name=UnderReplicatedPartitions",
        description: "Partitions whose ISR is smaller than replication factor (gauge, partition count).",
        rationale: "Shows replication health degradation before every affected partition necessarily falls below min.insync.replicas.",
        caveat: "Do not alert on a non-zero value alone during planned broker movement. Correlate duration and growth with maintenance state, replica lag, disk, and network evidence.",
      },
    ],
  };

export const DISK_STORAGE_SIGNATURE: SignatureDefinition = {
    id: "disk-storage-failure",
    title: "Disk failure / KafkaStorageException",
    severity: "critical",
    baseConfidence: 25,
    patterns: [
      { pattern: /KafkaStorageException/i, weight: 35, expectedKind: "broker-log" },
      { pattern: /IOException.*(?:log\.dir|disk|No space left)/i, weight: 25, expectedKind: "broker-log" },
      { pattern: /No space left on device/i, weight: 30, expectedKind: "broker-log" },
      { pattern: /Failed to (?:write|flush|create|rename).*log/i, weight: 20, expectedKind: "broker-log" },
      { pattern: /LogDirFailureChannel|log dir.*(?:offline|failure)/i, weight: 20, expectedKind: "broker-log" },
      { pattern: /disk\s*(?:full|error|failure|usage)/i, weight: 10, expectedKind: "metric-snapshot" },
    ],
    conflicts: [
      { pattern: /disk\s*usage\s*[:=]\s*\d{1,2}%/i, reduction: 15, expectedKind: "metric-snapshot" },
    ],
    missingEvidence: [
      "df -h output from affected broker host",
      "Broker log.dirs configuration",
      "RAID or disk health status",
    ],
    recommendedNextEvidence: [
      "Check disk usage: df -h on broker hosts",
      "Review log.dirs in server.properties",
      "Check dmesg for hardware disk errors",
    ],
    resourceLinks: [
      { label: "KafkaStorageException", href: "/errors/kafka-storage-exception", surface: "errors" },
      { label: "Broker disk recovery runbook", href: "/runbooks/broker-wont-restart", surface: "runbooks" },
    ],
    observability: [
      {
        metric: "host.disk.usage (bytes, per log.dirs mount)",
        description: "Disk space used on each Kafka data directory mount (bytes).",
        rationale: "KafkaStorageException typically follows disk exhaustion. Early warning prevents unclean shutdown.",
        caveat: "Do not alert on usage percent alone without knowing workload growth rate. A 90% full 10TB disk may have days of headroom; a 70% full 100GB disk may fill in minutes under burst.",
      },
      {
        metric: "kafka.server:type=ReplicaManager,name=OfflinePartitionsCount",
        description: "Number of partitions with no active leader (gauge, count).",
        rationale: "Disk failure on the only ISR member forces partitions offline.",
        caveat: "Transient values can occur during rolling restarts. Do not alert on this alone without comparing duration to the cluster's normal election and restart window.",
      },
    ],
  };

export const OVERSIZED_RECORD_SIGNATURE: SignatureDefinition = {
    id: "oversized-record",
    title: "Oversized record / message size limit exceeded",
    severity: "medium",
    baseConfidence: 20,
    patterns: [
      { pattern: /RecordTooLargeException|MESSAGE_TOO_LARGE/i, weight: 30, expectedKind: "client-log" },
      { pattern: /message\.max\.bytes|max\.message\.bytes/i, weight: 10, expectedKind: "config" },
      { pattern: /max\.request\.size|fetch\.max\.bytes/i, weight: 10, expectedKind: "config" },
      { pattern: /record.*(?:too large|exceeds|size limit)/i, weight: 20, expectedKind: "client-log" },
      { pattern: /InvalidRecordException/i, weight: 15, expectedKind: "client-log" },
    ],
    conflicts: [],
    missingEvidence: [
      "message.max.bytes (broker) and max.message.bytes (topic) settings",
      "Producer max.request.size setting",
      "Actual record sizes being produced",
    ],
    recommendedNextEvidence: [
      "Check broker message.max.bytes and topic max.message.bytes",
      "Review producer max.request.size",
      "Measure average and P99 record sizes in the producer",
    ],
    resourceLinks: [
      { label: "RecordTooLargeException", href: "/errors/record-too-large-exception", surface: "errors" },
    ],
    observability: [
      {
        metric: "kafka.server:type=BrokerTopicMetrics,name=BytesInPerSec",
        description: "Bytes received per second at the broker (bytes/sec).",
        rationale: "Sudden spikes may indicate unexpectedly large records being produced.",
        caveat: "Do not alert on throughput alone without context. High throughput may be normal for the workload. Correlate with RecordTooLargeException error counts.",
      },
    ],
  };
