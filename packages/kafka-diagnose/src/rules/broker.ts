/**
 * Broker configuration diagnostic rules.
 */

import type { RuleWithFix } from "./helpers";
import { bool, num, replaceFix, removeFix } from "./helpers";

export const brokerRules: RuleWithFix[] = [
  {
    id: "unclean-leader-election",
    category: "broker",
    evaluate(c) {
      if (bool(c["unclean.leader.election.enable"]) !== true) return null;
      return {
        severity: "danger",
        title: "unclean.leader.election.enable=true risks committed-data loss",
        detail:
          "Allows an out-of-sync replica to become leader if no ISR is alive. Restores availability at the cost of silently dropping already-acked messages. Leave false unless you explicitly accept the trade-off.",
        learnSlug: "unclean-leader-election",
        simulateSlug: "quorum-loss",
        fix: {
          before: "unclean.leader.election.enable=true",
          after: "unclean.leader.election.enable=false",
        },
        structuredFix: replaceFix(
          "Disable unclean leader election",
          "unclean.leader.election.enable",
          "true",
          "false",
        ),
      };
    },
  },
  {
    id: "replication-factor-too-low",
    category: "broker",
    evaluate(c) {
      const rf =
        num(c["default.replication.factor"]) ?? num(c["replication.factor"]);
      if (rf === undefined || rf >= 3) return null;
      const key = c["default.replication.factor"] !== undefined
        ? "default.replication.factor"
        : "replication.factor";
      return {
        severity: "warning",
        title: `replication.factor=${rf} is below the recommended minimum`,
        detail:
          "Production clusters should default to replication.factor=3. RF=1 means any broker loss takes the partition offline; RF=2 cannot survive a single broker loss while keeping min.insync.replicas≥2.",
        learnSlug: "isr-and-acks",
        simulateSlug: "isr-shrink",
        fix: {
          before: `default.replication.factor=${rf}`,
          after: "default.replication.factor=3",
        },
        structuredFix: replaceFix(
          "Set replication factor to 3",
          key,
          String(rf),
          "3",
        ),
      };
    },
  },
  {
    id: "auto-create-topics",
    category: "broker",
    evaluate(c) {
      if (bool(c["auto.create.topics.enable"]) !== true) return null;
      return {
        severity: "warning",
        title: "auto.create.topics.enable=true leaks topics into the cluster",
        detail:
          "Any consumer/producer mentioning a topic creates it with broker defaults. Strongly recommend disabling and provisioning topics explicitly with the right replication and retention.",
        fix: {
          before: "auto.create.topics.enable=true",
          after: "auto.create.topics.enable=false",
        },
        structuredFix: replaceFix(
          "Disable auto topic creation",
          "auto.create.topics.enable",
          "true",
          "false",
        ),
      };
    },
  },
  {
    id: "auto-leader-rebalance-disabled",
    category: "broker",
    evaluate(c) {
      if (c["auto.leader.rebalance.enable"] === undefined) return null;
      if (bool(c["auto.leader.rebalance.enable"]) === false) {
        return {
          severity: "warning",
          title: "auto.leader.rebalance.enable=false leaves leaders unbalanced after recovery",
          detail:
            "After a broker restart, all partitions that previously led from it land on the surviving brokers. Without auto-rebalance, leaders never migrate back, and one broker carries 2x the produce traffic until you run kafka-leader-election manually.",
          learnSlug: "controller-and-metadata",
          structuredFix: replaceFix(
            "Enable auto leader rebalance",
            "auto.leader.rebalance.enable",
            "false",
            "true",
          ),
        };
      }
      return null;
    },
  },
  {
    id: "log-flush-interval-messages-set",
    category: "broker",
    evaluate(c) {
      const v = num(c["log.flush.interval.messages"]);
      if (v === undefined) return null;
      if (v < Number.MAX_SAFE_INTEGER)
        return {
          severity: "warning",
          title: "log.flush.interval.messages overrides Kafka's default fsync strategy",
          detail:
            "Kafka relies on replication for durability, not fsync. Forcing fsync on every N messages tanks throughput without adding safety (the OS fsyncs on roll anyway). Remove unless you really need synchronous flush.",
          structuredFix: removeFix(
            "Remove log.flush.interval.messages override",
            "log.flush.interval.messages",
          ),
        };
      return null;
    },
  },
  {
    id: "broker-id-vs-cluster-id",
    category: "broker",
    evaluate(c) {
      if (c["broker.id"] === undefined && c["node.id"] === undefined) return null;
      const id = c["broker.id"] ?? c["node.id"];
      if (id === "0" || id === "-1")
        return {
          severity: "warning",
          title: `broker.id=${id} is a reserved-looking value`,
          detail:
            "Using 0 or -1 as broker.id makes log lines and metrics ambiguous. Use positive integers starting at 1; reserve negative for auto-assign (broker.id.generation.enable).",
          // No structured fix: requires human choice of ID
        };
      return null;
    },
  },
];
