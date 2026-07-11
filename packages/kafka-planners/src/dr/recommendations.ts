/**
 * DR phase checklists, observability guidance, strategy notes, and links.
 */

import type {
  DrChecklistItem,
  DrObservabilityRecommendation,
  DrPhaseChecklist,
  DrReplicationStrategy,
  DrResourceLink,
  DrStrategyNotes,
} from "./types";

// ─── Checklists ─────────────────────────────────────────────────────────────

export function buildChecklists(strategy: DrReplicationStrategy): DrPhaseChecklist[] {
  return [
    buildDeclarePhase(),
    buildFreezePhase(),
    buildVerifyPhase(strategy),
    buildPromotePhase(strategy),
    buildRedirectPhase(),
    buildValidatePhase(),
    buildFailbackPhase(strategy),
  ];
}

function buildDeclarePhase(): DrPhaseChecklist {
  return {
    phase: "declare",
    label: "Declare Incident",
    order: 1,
    items: [
      item("declare-1", "Confirm incident scope and affected clusters/topics", "Incident Commander", "decision"),
      item("declare-2", "Record incident start time, evidence, and initial assessment", "Incident Commander", "evidence"),
      item("declare-3", "Confirm the designated operator has notified stakeholders and opened an incident channel", "Incident Commander", "decision"),
      item("declare-4", "Identify decision owner for failover authorization", "Incident Commander", "decision"),
    ],
  };
}

function buildFreezePhase(): DrPhaseChecklist {
  return {
    phase: "freeze",
    label: "Freeze Source Writes",
    order: 2,
    items: [
      item("freeze-1", "Verify source cluster health status and confirm unavailability", "Platform Engineer", "evidence"),
      item("freeze-2", "Document last known good state of source cluster", "Platform Engineer", "evidence"),
      item("freeze-3", "Coordinate source write freeze with application teams", "Incident Commander", "source-freeze"),
      item("freeze-4", "Confirm no new writes are reaching the source cluster", "Platform Engineer", "source-freeze"),
    ],
  };
}

function buildVerifyPhase(strategy: DrReplicationStrategy): DrPhaseChecklist {
  const items: DrChecklistItem[] = [
    item("verify-1", "Verify target cluster health: broker status, ISR counts, under-replicated partitions", "Platform Engineer", "target-health"),
    item("verify-2", "Verify target cluster has sufficient capacity for production traffic", "Platform Engineer", "target-health"),
    item("verify-3", "Verify checkpoint/offset translation state and freshness", "Platform Engineer", "checkpoint-state"),
    item("verify-4", "Record current replication lag and last checkpoint timestamp", "Platform Engineer", "evidence"),
    item("verify-5", "Verify topic/partition configuration parity between source and target", "Platform Engineer", "data-validation"),
    item("verify-6", "Verify ACL/authorization configuration parity", "Platform Engineer", "acl-config-parity"),
  ];

  if (strategy === "mirror-maker-2") {
    items.push(
      item("verify-7-mm2", "Verify MM2 checkpoint topic has recent entries (emit.checkpoints.interval.seconds)", "Platform Engineer", "checkpoint-state"),
    );
  }
  if (strategy === "msk-replicator") {
    items.push(
      item("verify-7-msk", "Verify MSK Replicator checkpoint state (consult AWS documentation for your specific configuration)", "Platform Engineer", "checkpoint-state"),
    );
  }

  return { phase: "verify", label: "Verify Target State", order: 3, items };
}

function buildPromotePhase(strategy: DrReplicationStrategy): DrPhaseChecklist {
  const items: DrChecklistItem[] = [
    item("promote-1", "Obtain explicit authorization from decision owner to promote", "Incident Commander", "decision"),
    item("promote-2", "Confirm the designated operator has stopped the replication tool (do not leave replication running during promotion)", "Platform Engineer", "decision"),
    item("promote-3", "Confirm the designated operator has verified the target cluster accepts writes (e.g., produce a test message)", "Platform Engineer", "target-health"),
    item("promote-4", "Record completion of promotion: timestamp, evidence, and operator confirmation", "Platform Engineer", "evidence"),
  ];

  if (strategy === "mirror-maker-2") {
    items.push(
      item("promote-5-mm2", "Confirm the designated operator has stopped all MirrorMaker 2 connectors before redirecting clients", "Platform Engineer", "decision"),
    );
  }
  if (strategy === "msk-replicator") {
    items.push(
      item("promote-5-msk", "Confirm the designated operator has stopped the MSK Replicator task (via AWS console or API, per vendor documentation) before redirecting clients", "Platform Engineer", "decision"),
    );
  }

  return { phase: "promote", label: "Promote Target", order: 4, items };
}

function buildRedirectPhase(): DrPhaseChecklist {
  return {
    phase: "redirect",
    label: "Redirect Clients",
    order: 5,
    items: [
      item("redirect-1", "Confirm the designated operator has updated DNS/endpoint to point to the target cluster", "Platform Engineer", "client-redirect"),
      item("redirect-2", "Verify DNS propagation to expected targets", "Platform Engineer", "client-redirect"),
      item("redirect-3", "Coordinate client restart/reconnect with application teams", "Platform Engineer", "client-redirect"),
      item("redirect-4", "Monitor client connection metrics on target cluster", "Platform Engineer", "monitoring"),
    ],
  };
}

function buildValidatePhase(): DrPhaseChecklist {
  return {
    phase: "validate",
    label: "Validate Recovery",
    order: 6,
    items: [
      item("validate-1", "Verify producer throughput on target matches expected levels", "Platform Engineer", "business-validation"),
      item("validate-2", "Verify consumer lag on target is stable or draining", "Platform Engineer", "monitoring"),
      item("validate-3", "Verify end-to-end business transaction flow", "Application Owner", "business-validation"),
      item("validate-4", "Confirm no unexpected errors in client and broker logs", "Platform Engineer", "monitoring"),
      item("validate-5", "Record validation results and confirm recovery with stakeholders", "Incident Commander", "evidence"),
    ],
  };
}

function buildFailbackPhase(strategy: DrReplicationStrategy): DrPhaseChecklist {
  const items: DrChecklistItem[] = [
    item("failback-1", "Document failback prerequisites and timeline", "Incident Commander", "decision"),
    item("failback-2", "Verify source cluster is healthy and ready to accept writes", "Platform Engineer", "target-health"),
    item("failback-3", "Confirm the designated operator has established reverse replication from target back to source", "Platform Engineer", "decision"),
    item("failback-4", "Verify reverse replication lag is acceptable", "Platform Engineer", "monitoring"),
    item("failback-5", "Plan and coordinate client redirect back to source (repeat redirect/validate phases)", "Platform Engineer", "client-redirect"),
    item("failback-6", "Conduct post-incident reconciliation: identify and resolve any duplicate/lost records", "Platform Engineer", "reconciliation"),
    item("failback-7", "Document lessons learned and update DR runbook", "Incident Commander", "reconciliation"),
  ];

  if (strategy === "mirror-maker-2") {
    items.push(
      item("failback-8-mm2", "Confirm the designated operator has reconfigured MM2 for reverse replication; verify checkpoint topics for both directions", "Platform Engineer", "checkpoint-state"),
      item("failback-9-mm2", "Review MM2 offset translation for duplicate handling during failback", "Platform Engineer", "reconciliation"),
    );
  }
  if (strategy === "msk-replicator") {
    items.push(
      item("failback-8-msk", "Confirm the designated operator has created a new MSK Replicator task for the reverse direction (per vendor documentation); verify checkpoint configuration", "Platform Engineer", "checkpoint-state"),
      item("failback-9-msk", "Review MSK Replicator offset translation for duplicate handling during failback", "Platform Engineer", "reconciliation"),
    );
  }

  return { phase: "failback", label: "Failback and Reconciliation", order: 7, items };
}

function item(
  id: string,
  text: string,
  owner: string,
  category: DrChecklistItem["category"],
): DrChecklistItem {
  return { id, text, owner, category };
}

// ─── Observability ──────────────────────────────────────────────────────────

export function buildObservability(): DrObservabilityRecommendation[] {
  return [
    {
      metric: "kafka.replication.lag.seconds",
      description: "Replication lag between source and target clusters in seconds. May be measured via consumer group lag on the replication tool's internal consumer or via timestamp-based comparison.",
      rationale: "Directly determines RPO. Increasing lag signals replication throughput issues or target cluster problems.",
      caveat: "Do not alert on this alone. Transient lag spikes during partition reassignment, broker restarts, or batch catchup are normal. Correlate with replication error rates and target cluster health.",
    },
    {
      metric: "kafka.replication.lag.growth.rate",
      description: "Rate of change of replication lag (seconds per second). Computed from consecutive lag measurements.",
      rationale: "A positive growth rate indicates replication is falling behind. Sustained positive growth is more concerning than a one-time spike.",
      caveat: "Do not alert on this alone. A brief positive rate during a burst of production traffic is expected. Look for sustained trends over multiple measurement windows.",
    },
    {
      metric: "kafka.checkpoint.freshness.seconds",
      description: "Time since the last checkpoint/offset translation was written (seconds). Stale checkpoints increase RPO and duplicate exposure.",
      rationale: "Stale checkpoints mean consumer offset translation is outdated. After failover, consumers will replay from an older position.",
      caveat: "Do not alert on this alone. Checkpoint freshness depends on the configured interval. Compare against the expected checkpoint interval, not an absolute threshold.",
    },
    {
      metric: "kafka.consumer.lag.records",
      description: "Consumer group lag on the target cluster in records. Measures how far behind consumers are from the log end offset.",
      rationale: "High consumer lag on the target after failover indicates consumers are catching up from checkpointed positions. Expected immediately after failover but should drain.",
      caveat: "Do not alert on this alone. Post-failover lag is expected. Focus on whether lag is draining (consumer progress rate > 0) rather than absolute lag values.",
    },
    {
      metric: "kafka.replication.error.rate",
      description: "Rate of replication errors (failures per second). Includes connector errors, network failures, authentication issues, and serialization errors.",
      rationale: "Replication errors directly increase lag and may halt replication entirely. Sustained errors indicate a replication tool or target cluster problem.",
      caveat: "Do not alert on this alone. Transient errors during broker restarts or network blips are expected. Correlate with replication lag and connector status.",
    },
    {
      metric: "kafka.request.latency.p99.ms",
      description: "99th percentile request latency on the target cluster in milliseconds. Covers produce, fetch, and metadata requests.",
      rationale: "High request latency on the target indicates the cluster may struggle under production load after failover. Baseline this during normal replication.",
      caveat: "Do not alert on this alone. Latency varies by workload, record size, and cluster configuration. Compare against your baseline, not a universal threshold.",
    },
    {
      metric: "dns.ttl.remaining.seconds",
      description: "Remaining DNS TTL for the Kafka bootstrap endpoint in seconds. Lower values enable faster client redirect.",
      rationale: "High TTL delays client redirect after failover. Proactively lowering TTL before a planned DR exercise reduces RTO.",
      caveat: "Do not alert on this alone. TTL is a configuration, not a failure signal. Use it for DR readiness checks, not active incident alerting.",
    },
    {
      metric: "kafka.client.connection.count",
      description: "Number of active client connections on the target cluster. Should rise during and after failover as clients reconnect.",
      rationale: "Tracks client redirect progress. If connections plateau below expected levels, some clients may not have reconnected.",
      caveat: "Do not alert on this alone. Connection counts vary by application architecture (connection pooling, sidecar proxies). Compare against expected client count.",
    },
    {
      metric: "kafka.target.health.status",
      description: "Composite health status of the target cluster: under-replicated partitions, offline partitions, broker count, ISR shrink rate.",
      rationale: "Target cluster must be healthy before promotion. An unhealthy target should block failover or trigger warnings.",
      caveat: "Do not alert on this alone. Some metrics (e.g., ISR shrink) may briefly trigger during normal operations. Use composite health with multiple indicators.",
    },
    {
      metric: "kafka.duplicate.detection.rate",
      description: "Rate of duplicate messages detected by downstream consumers (per workload-specific deduplication). May be measured via idempotent producer IDs, application-level dedup keys, or consumer offset comparison.",
      rationale: "After failover, some message replay is expected. Tracking duplicates confirms whether replay is within tolerance.",
      caveat: "Do not alert on this alone. Duplicate detection depends on application-level deduplication. Not all workloads implement dedup. This is a post-failover reconciliation metric, not a prevention signal.",
    },
  ];
}

// ─── Strategy Notes ─────────────────────────────────────────────────────────

export function buildStrategyNotes(strategy: DrReplicationStrategy): DrStrategyNotes {
  switch (strategy) {
    case "mirror-maker-2":
      return {
        strategy,
        label: "MirrorMaker 2 (MM2)",
        notes: [
          "MM2 uses Kafka Connect. Checkpoint offsets are stored in internal checkpoint topics. Verify checkpoint topic replication and retention.",
          "Consumer offset translation relies on checkpoints. The emit.checkpoints.interval.seconds setting directly affects RPO and duplicate exposure.",
          "MM2 replicates topics, consumer groups, ACLs (if configured), and topic configuration. Verify parity on all dimensions before promotion.",
          "Replication lag depends on MM2 task count, source/target cluster throughput, and network. Monitor MirrorSourceConnector and MirrorCheckpointConnector metrics.",
          "Failback requires reconfiguring MM2 for the reverse direction. This is a new configuration, not an automatic reversal.",
          "Duplicate handling: consumers restarting from translated offsets may replay up to one checkpoint interval of messages. Application-level idempotency is recommended.",
        ],
      };
    case "msk-replicator":
      return {
        strategy,
        label: "Amazon MSK Replicator",
        notes: [
          "MSK Replicator is a managed service. Checkpoint intervals and replication behavior are configured through the AWS console or API.",
          "Promotion and failback steps may involve AWS-specific operations (stopping/creating replicator tasks). Consult AWS documentation.",
          "MSK Replicator handles topic replication and consumer offset translation. Verify ACL and topic configuration parity separately.",
          "Replication lag monitoring is available through CloudWatch metrics. Use these for RPO assessment.",
          "Failback requires creating a new replicator task in the reverse direction. The original task cannot be reversed in place.",
          "Duplicate handling: similar to MM2, consumers may replay messages based on checkpoint interval granularity.",
        ],
      };
    default:
      return {
        strategy: "generic",
        label: "Generic Replication",
        notes: [
          "This analysis uses generic replication assumptions. Adjust timing parameters based on your specific replication tool.",
          "Verify that your replication tool supports consumer offset translation/checkpoints. Without checkpoints, consumers must reset offsets manually after failover.",
          "Replication lag, checkpoint interval, and duplicate exposure vary by tool. Measure these in your environment.",
          "Failback requires establishing reverse replication. The procedure depends on your specific replication tool.",
        ],
      };
  }
}

// ─── Resource Links ─────────────────────────────────────────────────────────

export const RESOURCE_LINKS: readonly DrResourceLink[] = [
  { label: "Consumer Lag Triage", href: "/workbench/lag", surface: "workbench" },
  { label: "Capacity and N-1 Headroom", href: "/workbench/capacity", surface: "workbench" },
  { label: "KRaft Transition Planner", href: "/workbench/kraft", surface: "workbench" },
  { label: "Incident Triage", href: "/workbench/incident", surface: "workbench" },
  { label: "Kafka MirrorMaker 2 Docs", href: "https://kafka.apache.org/documentation/#georeplication", surface: "external" },
];

