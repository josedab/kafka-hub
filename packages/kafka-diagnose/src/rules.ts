import type { Rule } from "./types";

const num = (v: string | undefined) => {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const bool = (v: string | undefined) => {
  if (v === undefined) return undefined;
  return v.toLowerCase() === "true";
};

export const rules: Rule[] = [
  // ───────────────────────────── broker ─────────────────────────────
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
          "With min.insync.replicas=1 the leader is the only replica required to ack. You're paying the latency of acks=all without getting the durability. Set min.insync.replicas to at least 2 (typical: replication.factor − 1).",
        learnSlug: "isr-and-acks",
        simulateSlug: "isr-shrink",
        fix: {
          before: "acks=all\nmin.insync.replicas=1",
          after: "acks=all\nmin.insync.replicas=2",
        },
      };
    },
  },
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
      };
    },
  },
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
            "After a broker restart, all partitions that previously led from it land on the surviving brokers. Without auto-rebalance, leaders never migrate back, and one broker carries 2× the produce traffic until you run kafka-leader-election manually.",
          learnSlug: "controller-and-metadata",
        };
      }
      return null;
    },
  },
  {
    id: "num-network-threads-low",
    category: "performance",
    evaluate(c) {
      const n = num(c["num.network.threads"]);
      if (n === undefined) return null;
      if (n < 3)
        return {
          severity: "warning",
          title: `num.network.threads=${n} is below the default`,
          detail:
            "Below the default (3) you may bottleneck on network IO before disk. Tune up first; tune down only if you've measured pegged CPU on the network threads.",
        };
      return null;
    },
  },
  {
    id: "num-io-threads-low",
    category: "performance",
    evaluate(c) {
      const n = num(c["num.io.threads"]);
      if (n === undefined) return null;
      if (n < 8)
        return {
          severity: "info",
          title: `num.io.threads=${n} is below the default`,
          detail:
            "Disk IO threads default to 8. If you've lowered this without measurement, you may bottleneck on disk concurrency.",
        };
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
        };
      return null;
    },
  },

  // ───────────────────────────── topic ─────────────────────────────
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
        };
      }
      if (segMs >= 7 * 24 * 60 * 60 * 1000) {
        return {
          severity: "warning",
          title: "compacted topic with segment.ms ≥ 7 days",
          detail:
            "The active segment is never compacted. On a low-write topic compaction will effectively never run. Drop segment.ms to a few hours for state-store-style topics.",
          learnSlug: "log-compaction",
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
            "Default partition counts apply to every auto-created topic. Per-topic counts in the thousands cost the controller, file handles, and follower fetch fan-out. Set the default conservatively (3–6) and override per topic.",
        };
      return null;
    },
  },

  // ───────────────────────────── producer ─────────────────────────────
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
            "The idempotent producer relies on acks=all and max.in.flight.requests.per.connection ≤ 5. With other acks values the broker will reject the producer config on startup.",
          learnSlug: "exactly-once",
          fix: {
            before: `enable.idempotence=true\nacks=${c["acks"]}`,
            after: "enable.idempotence=true\nacks=all",
          },
        };
      }
      const maxInflight = num(c["max.in.flight.requests.per.connection"]);
      if (maxInflight !== undefined && maxInflight > 5) {
        return {
          severity: "warning",
          title: "enable.idempotence=true with max.in.flight.requests.per.connection > 5",
          detail:
            "Idempotence guarantees in-order delivery only when inflight ≤ 5. Lower the value or remove the override.",
          learnSlug: "exactly-once",
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
          "Text-heavy payloads compress 5–10× with zstd. The producer pays a small CPU cost; every reader (followers + consumers) wins back the same bandwidth. Use 'zstd' for new workloads, 'lz4' if you need broker compatibility.",
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
          "zstd gives better compression at lower CPU than gzip on every benchmark I've seen. Move when you can; gzip is fine for compatibility with very old clients.",
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
            "The producer flushes immediately. Throughput suffers on high-rate workloads. linger.ms=5–20 is the standard 'batch a little' value and adds barely-perceptible latency.",
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
            "Invariant: delivery.timeout.ms ≥ linger.ms + request.timeout.ms. Otherwise the producer will give up before a retry even has a chance to finish. Kafka 2.1+ enforces this; older clients silently misbehave.",
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
        };
      return null;
    },
  },

  // ───────────────────────────── consumer ─────────────────────────────
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
          title: "heartbeat.interval.ms should be ~⅓ of session.timeout.ms",
          detail:
            "A heartbeat too close to the session timeout means a single missed heartbeat (GC, network blip) gets the consumer kicked. Keep the ratio around 1/3.",
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
        };
      return null;
    },
  },

  // ───────────────────────────── security ─────────────────────────────
  {
    id: "plaintext-listener-in-prod",
    category: "security",
    evaluate(c) {
      const listeners = c["listeners"] ?? c["advertised.listeners"];
      if (!listeners) return null;
      if (/PLAINTEXT:\/\//.test(listeners) && !/SSL:\/\/|SASL/.test(listeners))
        return {
          severity: "warning",
          title: "PLAINTEXT listeners with no SSL/SASL alternative",
          detail:
            "Production clusters should require encryption + auth. Add an SSL or SASL_SSL listener and use 'security.inter.broker.protocol' to lock down replication traffic.",
        };
      return null;
    },
  },
  {
    id: "ssl-endpoint-identification-disabled",
    category: "security",
    evaluate(c) {
      const v = c["ssl.endpoint.identification.algorithm"];
      if (v === undefined) return null;
      if (v === "" || v.toLowerCase() === "none" || v.toLowerCase() === "")
        return {
          severity: "danger",
          title: "ssl.endpoint.identification.algorithm disabled — MITM possible",
          detail:
            "An empty value disables hostname verification of the broker's certificate. Anyone with a valid cert signed by the trusted CA could impersonate the broker. Keep this at 'https' (the default).",
          fix: {
            before: `ssl.endpoint.identification.algorithm=${v || "(empty)"}`,
            after: "ssl.endpoint.identification.algorithm=https",
          },
        };
      return null;
    },
  },
  {
    id: "allow-everyone-if-no-acl-true",
    category: "security",
    evaluate(c) {
      if (bool(c["allow.everyone.if.no.acl.found"]) !== true) return null;
      return {
        severity: "warning",
        title: "allow.everyone.if.no.acl.found=true defeats the ACL system",
        detail:
          "Any topic without an explicit ACL is wide open. Useful in a single-tenant development cluster, dangerous everywhere else. Default to false and explicitly grant access.",
        fix: {
          before: "allow.everyone.if.no.acl.found=true",
          after: "allow.everyone.if.no.acl.found=false",
        },
      };
    },
  },
  {
    id: "super-users-empty",
    category: "security",
    evaluate(c) {
      if (c["authorizer.class.name"] === undefined) return null;
      if (c["super.users"] === undefined || c["super.users"].trim() === "")
        return {
          severity: "info",
          title: "authorizer enabled with no super.users configured",
          detail:
            "Without super.users, even your admin tooling needs explicit ACLs for every operation. Usually you want at least one principal in super.users for operations.",
        };
      return null;
    },
  },

  // ───────────────────────────── transactions ─────────────────────────────
  {
    id: "transactional-id-fixed",
    category: "transactions",
    evaluate(c) {
      const tid = c["transactional.id"];
      if (tid === undefined) return null;
      if (tid === "" || /random|uuid|guid/i.test(tid))
        return {
          severity: "warning",
          title: "transactional.id looks generated per-run, defeating fencing",
          detail:
            "transactional.id must be stable per logical producer instance. A random per-restart ID means zombie producers cannot be fenced by epoch. Derive from pod name, hostname, or another stable identifier.",
          learnSlug: "exactly-once",
        };
      return null;
    },
  },
  {
    id: "transaction-state-rf-low",
    category: "transactions",
    evaluate(c) {
      const rf = num(c["transaction.state.log.replication.factor"]);
      if (rf === undefined) return null;
      if (rf < 3)
        return {
          severity: "danger",
          title: "transaction.state.log.replication.factor < 3",
          detail:
            "The __transaction_state topic backs every transactional producer. RF<3 means a single broker loss can stall transactions across the cluster. Set to 3.",
          learnSlug: "exactly-once",
        };
      return null;
    },
  },
  {
    id: "offsets-topic-rf-low",
    category: "transactions",
    evaluate(c) {
      const rf = num(c["offsets.topic.replication.factor"]);
      if (rf === undefined) return null;
      if (rf < 3)
        return {
          severity: "danger",
          title: "offsets.topic.replication.factor < 3",
          detail:
            "__consumer_offsets backs every committed offset. RF<3 means a broker loss can drop committed offsets and your consumers will replay from earlier in the log. Set to 3.",
        };
      return null;
    },
  },
];
