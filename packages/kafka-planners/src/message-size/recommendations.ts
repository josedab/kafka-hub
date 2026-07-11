/**
 * Static message-size guidance and the blob-storage recommendation policy.
 */

import type {
  BlobStorageRecommendation,
  MessageSizeInput,
  MessageSizeObservabilityRecommendation,
  MessageSizeResourceLink,
} from "./types";

// ─── Observability Recommendations ──────────────────────────────────────────

export const OBSERVABILITY_RECOMMENDATIONS: readonly MessageSizeObservabilityRecommendation[] = [
  {
    metric: "kafka.producer.record.error.rate / RecordTooLargeException count",
    description:
      "Rate of RecordTooLargeException errors on the producer side, per topic/partition. Units: errors/sec or error count over a window.",
    rationale:
      "Indicates the producer is attempting to send records that exceed `max.request.size` or the broker's acceptance limit. Correlate with record size percentiles to identify which payloads trigger rejections.",
    caveat:
      "Do not alert on this alone. A small number of oversized records may be acceptable if they represent edge cases (e.g., schema evolution). Investigate the record size distribution and whether the errors affect business-critical topics.",
  },
  {
    metric: "kafka.server.BrokerTopicMetrics.MessageSizeTooLarge.rate",
    description:
      "Rate of messages rejected by the broker due to exceeding `message.max.bytes` or topic `max.message.bytes`. Units: rejected messages/sec.",
    rationale:
      "Confirms that oversized batches are reaching the broker and being rejected. Compare with producer error rates to verify end-to-end alignment.",
    caveat:
      "Do not alert on this alone. A burst during a deployment that changes serialization may be transient. Correlate with producer-side errors and check whether the affected topic has a specific `max.message.bytes` override.",
  },
  {
    metric: "kafka.server.ReplicaFetcherManager.MaxLag / under-replicated partitions",
    description:
      "Maximum replica fetch lag in messages or bytes, and count of under-replicated partitions (URP). Units: messages or bytes lag; partition count.",
    rationale:
      "When `replica.fetch.max.bytes` is smaller than produced batches, followers may struggle to replicate efficiently. Sustained high fetch lag or URPs can indicate fetch-size misalignment, not just network issues.",
    caveat:
      "Do not alert on this alone. Under-replication has many causes (disk I/O, network, broker restarts). Only attribute to fetch-size issues when correlated with large batch sizes and no other infrastructure signals.",
  },
  {
    metric: "kafka.consumer.fetch.error.rate / consumer fetch latency P99",
    description:
      "Rate of consumer fetch errors and P99 fetch latency. Units: errors/sec, milliseconds.",
    rationale:
      "When `max.partition.fetch.bytes` or `fetch.max.bytes` is undersized relative to produced batch sizes, consumers may experience slow fetches, incomplete responses, or errors. High fetch latency correlates with consumer lag.",
    caveat:
      "Do not alert on this alone. Fetch latency depends on broker load, network, and consumer processing time. Only attribute to fetch-size misalignment when consumer-side batch sizes are known to approach the configured limits.",
  },
  {
    metric: "kafka.network.RequestMetrics.RequestBytes.mean / produce request size distribution",
    description:
      "Mean and percentile distribution of produce request sizes in bytes. Units: bytes per request.",
    rationale:
      "Monitoring request size distribution helps identify when producers are approaching `max.request.size` limits. Spikes indicate serialization changes, schema evolution, or unexpected payload growth.",
    caveat:
      "Do not alert on this alone. Request sizes vary by workload. A workload-specific baseline is essential — alert on deviations from baseline, not absolute values.",
  },
  {
    metric: "kafka.network.RequestMetrics.TotalTimeMs.mean / produce + fetch request latency",
    description:
      "Mean and P99 latency of produce and fetch requests. Units: milliseconds.",
    rationale:
      "Large messages increase request latency due to network transfer, disk I/O, and compression/decompression. Correlate with message sizes to determine if latency is size-driven.",
    caveat:
      "Do not alert on this alone. Latency is affected by broker load, disk type, replication, and consumer group state. Size-driven latency is one of many factors.",
  },
];

// ─── Resource Links ─────────────────────────────────────────────────────────

export const RESOURCE_LINKS: readonly MessageSizeResourceLink[] = [
  {
    label: "RecordTooLargeException",
    href: "/errors/record-too-large-exception",
    surface: "errors",
  },
  {
    label: "MessageSizeTooLargeException",
    href: "/errors/message-size-too-large-exception",
    surface: "errors",
  },
  {
    label: "Configuration Diagnostics",
    href: "/diagnose",
    surface: "diagnose",
  },
  {
    label: "Capacity Planner",
    href: "/workbench/capacity",
    surface: "workbench",
  },
  {
    label: "Incident Triage",
    href: "/workbench/incident",
    surface: "workbench",
  },
  {
    label: "Cluster Simulator",
    href: "/simulate",
    surface: "simulate",
  },
];

// ─── Blob Storage Recommendation ────────────────────────────────────────────

export function evaluateBlobRecommendation(input: MessageSizeInput): BlobStorageRecommendation {
  const threshold = input.blobStorageThresholdBytes;
  const recordHits = input.recordSizeBytes >= threshold;
  const batchHits = input.batchSizeBytes >= threshold;

  if (recordHits && batchHits) {
    return {
      recommended: true,
      thresholdBytes: threshold,
      trigger: "both",
      guidance:
        `Both the record size (${input.recordSizeBytes} B) and batch size (${input.batchSizeBytes} B) meet or exceed the blob storage threshold (${threshold} B). ` +
        `Consider externalising large payloads to blob/object storage (S3, GCS, Azure Blob) and sending only a reference (URI/key) through Kafka. ` +
        `This is a design recommendation — not a universal Kafka limit. Evaluate based on your throughput, latency, and cost requirements.`,
    };
  }
  if (recordHits) {
    return {
      recommended: true,
      thresholdBytes: threshold,
      trigger: "record",
      guidance:
        `The record size (${input.recordSizeBytes} B) meets or exceeds the blob storage threshold (${threshold} B). ` +
        `Consider externalising large payloads to blob/object storage and sending only a reference through Kafka. ` +
        `This is a design recommendation — not a universal Kafka limit.`,
    };
  }
  if (batchHits) {
    return {
      recommended: true,
      thresholdBytes: threshold,
      trigger: "batch",
      guidance:
        `The batch size (${input.batchSizeBytes} B) meets or exceeds the blob storage threshold (${threshold} B). ` +
        `Consider externalising large payloads to blob/object storage. ` +
        `This is a design recommendation — not a universal Kafka limit.`,
    };
  }
  return {
    recommended: false,
    thresholdBytes: threshold,
    trigger: "none",
    guidance:
      `Neither record size (${input.recordSizeBytes} B) nor batch size (${input.batchSizeBytes} B) reaches the blob storage threshold (${threshold} B). ` +
      `No blob storage recommendation at this time.`,
  };
}
