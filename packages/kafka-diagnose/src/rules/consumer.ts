/**
 * Consumer configuration diagnostic rules.
 */

import type { RuleWithFix } from "./helpers";
import { bool, num, replaceFix } from "./helpers";

export const consumerRules: RuleWithFix[] = [
  {
    id: "auto-offset-reset-latest",
    category: "consumer",
    evaluate(c) {
      if (c["auto.offset.reset"] !== "latest") return null;
      return {
        severity: "info",
        title: "auto.offset.reset=latest will silently drop backlog on new groups",
        detail:
          "A brand-new consumer group will start at the high water mark and miss every message produced before it joined. Use 'earliest' for replay-style consumers; keep 'latest' only if you genuinely want only future messages.",
        learnSlug: "consumer-rebalance",
        // No safe fix: choice depends on consumer intent
      };
    },
  },
  {
    id: "auto-offset-reset-none",
    category: "consumer",
    evaluate(c) {
      if (c["auto.offset.reset"] !== "none") return null;
      return {
        severity: "warning",
        title: "auto.offset.reset=none throws on a new group with no commits",
        detail:
          "The consumer will raise NoOffsetForPartitionException on first start with a fresh group. Only use this if you want to fail loudly when commit state is missing.",
        // No safe fix: intentional defense behavior
      };
    },
  },
  {
    id: "enable-auto-commit-true",
    category: "consumer",
    evaluate(c) {
      if (bool(c["enable.auto.commit"]) !== true) return null;
      return {
        severity: "warning",
        title: "enable.auto.commit=true risks data loss on processing failures",
        detail:
          "The consumer commits offsets every auto.commit.interval.ms regardless of whether your processing succeeded. A crash between commit and processing loses messages. Disable and commit explicitly after success.",
        fix: {
          before: "enable.auto.commit=true",
          after: "enable.auto.commit=false",
        },
        structuredFix: replaceFix(
          "Disable auto commit",
          "enable.auto.commit",
          "true",
          "false",
        ),
      };
    },
  },
  {
    id: "max-poll-interval-low",
    category: "consumer",
    evaluate(c) {
      const v = num(c["max.poll.interval.ms"]);
      if (v === undefined) return null;
      if (v < 60_000)
        return {
          severity: "warning",
          title: `max.poll.interval.ms=${v} is short for any non-trivial processing`,
          detail:
            "If a single poll iteration takes longer than this, the consumer is kicked from the group and a rebalance kicks off. Set this generously above your slowest expected per-batch processing time.",
          learnSlug: "consumer-rebalance",
          // No safe fix: timeout depends on processing workload
        };
      return null;
    },
  },
  {
    id: "session-timeout-vs-heartbeat",
    category: "consumer",
    evaluate(c) {
      const session = num(c["session.timeout.ms"]);
      const heartbeat = num(c["heartbeat.interval.ms"]);
      if (session === undefined || heartbeat === undefined) return null;
      if (heartbeat * 3 > session)
        return {
          severity: "warning",
          title: "heartbeat.interval.ms should be ~1/3 of session.timeout.ms",
          detail:
            "A heartbeat too close to the session timeout means a single missed heartbeat (GC, network blip) gets the consumer kicked. Keep the ratio around 1/3.",
          // No safe fix: depends on cluster and consumer specifics
        };
      return null;
    },
  },
  {
    id: "partition-assignment-strategy-range",
    category: "consumer",
    evaluate(c) {
      const v = c["partition.assignment.strategy"];
      if (!v) return null;
      if (
        v.includes("RangeAssignor") &&
        !v.includes("CooperativeStickyAssignor")
      ) {
        return {
          severity: "info",
          title: "RangeAssignor without sticky/cooperative companion",
          detail:
            "On modern Kafka (3.x+) prefer CooperativeStickyAssignor. It produces the same balance as round-robin and uses the cooperative rebalance protocol — no stop-the-world revoke on each member change.",
          learnSlug: "partition-assignment",
          // No safe fix: requires coordinated consumer group upgrade
        };
      }
      return null;
    },
  },
  {
    id: "fetch-min-bytes-too-low",
    category: "consumer",
    evaluate(c) {
      const v = num(c["fetch.min.bytes"]);
      if (v === undefined) return null;
      if (v === 1)
        return {
          severity: "info",
          title: "fetch.min.bytes=1 (default) burns broker CPU on low-rate topics",
          detail:
            "Each fetch returns whatever the broker has. For low-throughput streams you'll do many tiny fetches. Set fetch.min.bytes higher (e.g. 50KB) and fetch.max.wait.ms moderately (e.g. 500ms) for batching.",
          // No safe fix: default behavior, depends on latency needs
        };
      return null;
    },
  },
];
