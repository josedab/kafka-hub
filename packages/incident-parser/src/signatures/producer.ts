import type { SignatureDefinition } from "../signature-types";

export const PRODUCER_FENCING_SIGNATURE: SignatureDefinition = {
    id: "producer-fencing-epoch",
    title: "Producer fencing / epoch conflict",
    severity: "high",
    baseConfidence: 20,
    patterns: [
      { pattern: /ProducerFencedException|PRODUCER_FENCED/i, weight: 30, expectedKind: "client-log" },
      { pattern: /InvalidProducerEpoch|INVALID_PRODUCER_EPOCH/i, weight: 30, expectedKind: "client-log" },
      { pattern: /OutOfOrderSequenceException|OUT_OF_ORDER_SEQUENCE/i, weight: 20, expectedKind: "client-log" },
      { pattern: /transactional\.id/i, weight: 10, expectedKind: "config" },
      { pattern: /transaction.*(?:abort|fence|conflict|timeout)/i, weight: 15, expectedKind: "client-log" },
      { pattern: /UnknownProducerIdException|UNKNOWN_PRODUCER_ID/i, weight: 20, expectedKind: "client-log" },
    ],
    conflicts: [
      { pattern: /transaction.*(?:commit|complete|success)/i, reduction: 10, expectedKind: "client-log" },
    ],
    missingEvidence: [
      "transactional.id configuration",
      "Whether multiple producer instances share the same transactional.id",
      "Transaction coordinator logs",
    ],
    recommendedNextEvidence: [
      "Verify transactional.id uniqueness across producer instances",
      "Check if a producer restart occurred without clean shutdown",
      "Review transaction.timeout.ms settings",
    ],
    resourceLinks: [
      { label: "ProducerFencedException", href: "/errors/producer-fenced-exception", surface: "errors" },
      { label: "Transactional producer stuck runbook", href: "/runbooks/transactional-producer-stuck", surface: "runbooks" },
      { label: "Exactly-once semantics", href: "/learn/exactly-once", surface: "learn" },
    ],
    observability: [
      {
        metric: "kafka.producer:type=producer-metrics,name=record-error-rate",
        description: "Rate of records that failed delivery (errors/sec).",
        rationale: "Producer fencing causes all in-flight records to fail. Spikes in error rate after fencing are expected.",
        caveat: "Do not alert on error rate alone if you have multiple transactional producers with planned failover. Correlate with ProducerFencedException in logs.",
      },
    ],
  };
