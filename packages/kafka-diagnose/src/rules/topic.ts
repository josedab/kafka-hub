/**
 * Topic configuration diagnostic rules.
 */

import type { RuleWithFix } from "./helpers";
import { num, setFix } from "./helpers";

export const topicRules: RuleWithFix[] = [
  {
    id: "retention-vs-segment",
    category: "topic",
    evaluate(c) {
      const retentionMs = num(c["log.retention.ms"]) ?? num(c["retention.ms"]);
      const segmentMs = num(c["log.segment.ms"]) ?? num(c["segment.ms"]);
      if (retentionMs === undefined || segmentMs === undefined) return null;
      if (segmentMs <= retentionMs) return null;
      return {
        severity: "warning",
        title: "segment.ms larger than retention.ms",
        detail:
          "Segments roll less often than retention is enforced. Data is only deletable on segment roll, so effective retention will be roughly segment.ms rather than retention.ms. Consider lowering segment.ms or raising retention.ms.",
        // No safe fix: depends on workload intent
      };
    },
  },
  {
    id: "compacted-topic-segment-ms-default",
    category: "topic",
    evaluate(c) {
      if (!(c["cleanup.policy"]?.includes("compact"))) return null;
      const segMs = num(c["segment.ms"]) ?? num(c["log.segment.ms"]);
      if (segMs === undefined) {
        return {
          severity: "warning",
          title: "compacted topic with no explicit segment.ms",
          detail:
            "Compacted topics inherit the broker default segment.ms (7 days). On a low-volume topic that means compaction never runs because the active segment never rolls. Set segment.ms to a few hours.",
          learnSlug: "log-compaction",
          structuredFix: setFix(
            "Set segment.ms to 3 hours",
            "segment.ms",
            "10800000",
          ),
        };
      }
      if (segMs >= 7 * 24 * 60 * 60 * 1000) {
        return {
          severity: "warning",
          title: "compacted topic with segment.ms >= 7 days",
          detail:
            "The active segment is never compacted. On a low-write topic compaction will effectively never run. Drop segment.ms to a few hours for state-store-style topics.",
          learnSlug: "log-compaction",
          structuredFix: setFix(
            "Set segment.ms to 3 hours",
            "segment.ms",
            "10800000",
          ),
        };
      }
      return null;
    },
  },
  {
    id: "compact-and-delete-mixed",
    category: "topic",
    evaluate(c) {
      const cp = c["cleanup.policy"];
      if (cp !== "compact,delete" && cp !== "delete,compact") return null;
      return {
        severity: "info",
        title: "cleanup.policy=compact,delete combines compaction with time-based deletion",
        detail:
          "This is intentional in some use cases (keep latest per key but also drop anything older than N days). Make sure that's what you want — most teams want either pure compact (state) or pure delete (events).",
        learnSlug: "log-compaction",
        // No fix: intentional in many use cases
      };
    },
  },
  {
    id: "min-cleanable-dirty-ratio-too-high",
    category: "topic",
    evaluate(c) {
      const r = num(c["min.cleanable.dirty.ratio"]);
      if (r === undefined) return null;
      if (r > 0.9)
        return {
          severity: "warning",
          title: `min.cleanable.dirty.ratio=${r} delays compaction excessively`,
          detail:
            "Compaction won't run until 90%+ of the log is stale. That bloats the topic and slows down consumers restoring state. Default (0.5) is fine unless you've measured a reason.",
          learnSlug: "log-compaction",
          structuredFix: setFix(
            "Reset to default (0.5)",
            "min.cleanable.dirty.ratio",
            "0.5",
          ),
        };
      return null;
    },
  },
  {
    id: "delete-retention-ms-too-low",
    category: "topic",
    evaluate(c) {
      if (!(c["cleanup.policy"]?.includes("compact"))) return null;
      const v = num(c["delete.retention.ms"]);
      if (v === undefined) return null;
      if (v < 60 * 60 * 1000)
        return {
          severity: "warning",
          title: `delete.retention.ms=${v} (< 1h) may drop tombstones before slow consumers see them`,
          detail:
            "Tombstones are how compacted-topic consumers learn about deletes. A short retention risks consumers rebuilding state without ever seeing the tombstone for a removed key.",
          learnSlug: "log-compaction",
          structuredFix: setFix(
            "Set to 24 hours (86400000ms)",
            "delete.retention.ms",
            "86400000",
          ),
        };
      return null;
    },
  },
  {
    id: "num-partitions-too-many",
    category: "topic",
    evaluate(c) {
      const v = num(c["num.partitions"]);
      if (v === undefined) return null;
      if (v > 1000)
        return {
          severity: "warning",
          title: `num.partitions=${v} as a broker default is excessive`,
          detail:
            "Default partition counts apply to every auto-created topic. Per-topic counts in the thousands cost the controller, file handles, and follower fetch fan-out. Set the default conservatively (3-6) and override per topic.",
          // No safe fix: partition count is workload-specific
        };
      return null;
    },
  },
];
