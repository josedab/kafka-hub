/**
 * Producer configuration diagnostic rules.
 */

import type { RuleWithFix } from "./helpers";
import { bool, num, setFix, replaceFix } from "./helpers";

export const producerRules: RuleWithFix[] = [
  {
    id: "acks-all-with-min-isr-1",
    category: "producer",
    evaluate(c) {
      if (c["acks"] !== "all") return null;
      const minIsr = num(c["min.insync.replicas"]);
      if (minIsr === undefined || minIsr > 1) return null;
      return {
        severity: "danger",
        title: "acks=all with min.insync.replicas=1 provides no durability win",
        detail:
          "With min.insync.replicas=1 the leader is the only replica required to ack. You're paying the latency of acks=all without getting the durability. Set min.insync.replicas to at least 2 (typical: replication.factor - 1).",
        learnSlug: "isr-and-acks",
        simulateSlug: "isr-shrink",
        fix: {
          before: "acks=all\nmin.insync.replicas=1",
          after: "acks=all\nmin.insync.replicas=2",
        },
        structuredFix: replaceFix(
          "Set min.insync.replicas to 2",
          "min.insync.replicas",
          "1",
          "2",
        ),
      };
    },
  },
  {
    id: "enable-idempotence-vs-acks",
    category: "producer",
    evaluate(c) {
      if (bool(c["enable.idempotence"]) !== true) return null;
      if (c["acks"] !== undefined && c["acks"] !== "all") {
        return {
          severity: "danger",
          title: `enable.idempotence=true requires acks=all (got acks=${c["acks"]})`,
          detail:
            "The idempotent producer relies on acks=all and max.in.flight.requests.per.connection <= 5. With other acks values the broker will reject the producer config on startup.",
          learnSlug: "exactly-once",
          fix: {
            before: `enable.idempotence=true\nacks=${c["acks"]}`,
            after: "enable.idempotence=true\nacks=all",
          },
          structuredFix: replaceFix(
            "Set acks=all for idempotent producer",
            "acks",
            c["acks"],
            "all",
          ),
        };
      }
      const maxInflight = num(c["max.in.flight.requests.per.connection"]);
      if (maxInflight !== undefined && maxInflight > 5) {
        return {
          severity: "warning",
          title: "enable.idempotence=true with max.in.flight.requests.per.connection > 5",
          detail:
            "Idempotence guarantees in-order delivery only when inflight <= 5. Lower the value or remove the override.",
          learnSlug: "exactly-once",
          structuredFix: replaceFix(
            "Set max.in.flight.requests.per.connection to 5",
            "max.in.flight.requests.per.connection",
            String(maxInflight),
            "5",
          ),
        };
      }
      return null;
    },
  },
  {
    id: "compression-type-none",
    category: "producer",
    evaluate(c) {
      if (c["compression.type"] !== "none") return null;
      return {
        severity: "info",
        title: "compression.type=none leaves significant throughput on the table",
        detail:
          "Text-heavy payloads compress 5-10x with zstd. The producer pays a small CPU cost; every reader (followers + consumers) wins back the same bandwidth. Use 'zstd' for new workloads, 'lz4' if you need broker compatibility.",
        structuredFix: replaceFix(
          "Switch to zstd compression",
          "compression.type",
          "none",
          "zstd",
          false, // not universally safe — depends on broker/client version
        ),
      };
    },
  },
  {
    id: "compression-type-gzip",
    category: "producer",
    evaluate(c) {
      if (c["compression.type"] !== "gzip") return null;
      return {
        severity: "info",
        title: "compression.type=gzip is dominated by zstd for Kafka workloads",
        detail:
          "zstd gives better compression at lower CPU than gzip on every benchmark. Move when you can; gzip is fine for compatibility with very old clients.",
        structuredFix: replaceFix(
          "Switch from gzip to zstd",
          "compression.type",
          "gzip",
          "zstd",
          false, // not universally safe — depends on broker/client version
        ),
      };
    },
  },
  {
    id: "linger-ms-too-low",
    category: "producer",
    evaluate(c) {
      const v = num(c["linger.ms"]);
      if (v === undefined) return null;
      if (v === 0)
        return {
          severity: "info",
          title: "linger.ms=0 disables batching latency optimization",
          detail:
            "The producer flushes immediately. Throughput suffers on high-rate workloads. linger.ms=5-20 is the standard 'batch a little' value and adds barely-perceptible latency.",
          structuredFix: replaceFix(
            "Set linger.ms to 5 (minimal batching)",
            "linger.ms",
            "0",
            "5",
            false, // trade-off: adds latency
          ),
        };
      return null;
    },
  },
  {
    id: "batch-size-tiny",
    category: "producer",
    evaluate(c) {
      const v = num(c["batch.size"]);
      if (v === undefined) return null;
      if (v < 16384)
        return {
          severity: "info",
          title: `batch.size=${v} is below default and may cap throughput`,
          detail:
            "16 KiB is the default. Going smaller is rarely warranted; the rest of the producer pipeline assumes batching for compression and request packing.",
          structuredFix: replaceFix(
            "Reset batch.size to default (16384)",
            "batch.size",
            String(v),
            "16384",
            false, // depends on memory constraints
          ),
        };
      return null;
    },
  },
  {
    id: "request-timeout-vs-delivery-timeout",
    category: "producer",
    evaluate(c) {
      const req = num(c["request.timeout.ms"]);
      const delivery = num(c["delivery.timeout.ms"]);
      if (req === undefined || delivery === undefined) return null;
      if (delivery < req)
        return {
          severity: "danger",
          title: "delivery.timeout.ms < request.timeout.ms",
          detail:
            "Invariant: delivery.timeout.ms >= linger.ms + request.timeout.ms. Otherwise the producer will give up before a retry even has a chance to finish. Kafka 2.1+ enforces this; older clients silently misbehave.",
          structuredFix: setFix(
            "Set delivery.timeout.ms to 120000",
            "delivery.timeout.ms",
            "120000",
          ),
        };
      return null;
    },
  },
  {
    id: "max-block-ms-low",
    category: "producer",
    evaluate(c) {
      const v = num(c["max.block.ms"]);
      if (v === undefined) return null;
      if (v < 5_000)
        return {
          severity: "info",
          title: `max.block.ms=${v} is aggressive and will surface ProducerSendBlockedException`,
          detail:
            "Used during metadata fetches and buffer-full waits. Sub-5s on a healthy network is fine, but on the first metadata fetch after process start you'll often see timeouts.",
          // No safe fix: depends on application tolerance
        };
      return null;
    },
  },
];
