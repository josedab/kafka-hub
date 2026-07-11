import type { SignatureDefinition } from "../signature-types";

export const CONTROLLER_MOVEMENT_SIGNATURE: SignatureDefinition = {
    id: "controller-movement",
    title: "Controller movement / election churn",
    severity: "high",
    baseConfidence: 15,
    patterns: [
      { pattern: /ActiveControllerCount.*(?:changed|0)|controller.*(?:elect|failover|move)/i, weight: 20, expectedKind: "broker-log" },
      { pattern: /ControllerEventManager|controller.*shut.*down|new.*controller/i, weight: 15, expectedKind: "broker-log" },
      { pattern: /controller\.quorum/i, weight: 10, expectedKind: "config" },
      { pattern: /KafkaController.*resign|broker.*(?:became|lost).*controller/i, weight: 20, expectedKind: "broker-log" },
      { pattern: /ActiveControllerCount\s*[:=]\s*0/i, weight: 25, expectedKind: "metric-snapshot" },
      { pattern: /controller.*(?:flap|churn|instab)/i, weight: 15, expectedKind: "broker-log" },
    ],
    conflicts: [
      { pattern: /ActiveControllerCount\s*[:=]\s*1/i, reduction: 15, expectedKind: "metric-snapshot" },
    ],
    missingEvidence: [
      "Controller logs from the active and previous controller",
      "ZooKeeper or KRaft quorum health",
      "Network partition indicators",
    ],
    recommendedNextEvidence: [
      "Check ZooKeeper/KRaft quorum: are all voters healthy?",
      "Review controller log for election triggers",
      "Check network connectivity between brokers",
    ],
    resourceLinks: [
      { label: "Controller flapping runbook", href: "/runbooks/controller-flapping", surface: "runbooks" },
      { label: "Simulate a network partition", href: "/simulate?scenario=network-partition", surface: "simulate" },
    ],
    observability: [
      {
        metric: "kafka.controller:type=KafkaController,name=ActiveControllerCount",
        description: "Whether this broker is the active controller (0 or 1, gauge).",
        rationale: "Sum across cluster should be exactly 1. Sum=0 means no controller; sum>1 means split-brain (ZK mode).",
        caveat: "Brief sum=0 during planned failover is expected. Set the tolerated duration from observed election behavior and the control-plane SLO; investigate any sustained cluster-wide sum above 1.",
      },
    ],
  };

export const KRAFT_QUORUM_SIGNATURE: SignatureDefinition = {
    id: "kraft-quorum-loss",
    title: "KRaft quorum loss / voter disconnection",
    severity: "critical",
    baseConfidence: 20,
    patterns: [
      { pattern: /KRaft|kraft|raft\s*quorum/i, weight: 10, expectedKind: "broker-log" },
      { pattern: /RaftClient.*(?:timeout|disconnect|unreachable)|quorum.*(?:lost|unavailable)/i, weight: 25, expectedKind: "broker-log" },
      { pattern: /voter.*(?:disconnect|offline|unreachable)|quorum.*not.*met/i, weight: 25, expectedKind: "broker-log" },
      { pattern: /KafkaRaftClient|RaftManager/i, weight: 10, expectedKind: "broker-log" },
      { pattern: /controller\.quorum\.voters/i, weight: 10, expectedKind: "config" },
      { pattern: /Failed to reach quorum/i, weight: 30, expectedKind: "broker-log" },
    ],
    conflicts: [
      { pattern: /quorum.*(?:stable|healthy|established)/i, reduction: 15, expectedKind: "broker-log" },
    ],
    missingEvidence: [
      "KRaft controller logs from all voters",
      "controller.quorum.voters configuration",
      "Network connectivity between KRaft nodes",
    ],
    recommendedNextEvidence: [
      "Check all KRaft voter nodes are running",
      "Review controller.quorum.voters for correct addresses",
      "Test network connectivity between voter nodes",
    ],
    resourceLinks: [
      { label: "Controller and metadata explained", href: "/learn/controller-and-metadata", surface: "learn" },
      { label: "Controller flapping runbook", href: "/runbooks/controller-flapping", surface: "runbooks" },
    ],
    observability: [
      {
        metric: "kafka.server:type=raft-metrics,name=current-leader",
        description: "Current KRaft leader ID (-1 if no leader, gauge).",
        rationale: "Leader ID of -1 means quorum lost. No metadata updates are possible.",
        caveat: "Brief -1 values can occur during election. Do not use one universal duration; compare with the quorum's normal election time, controller SLO, and repeated leader changes.",
      },
    ],
  };
