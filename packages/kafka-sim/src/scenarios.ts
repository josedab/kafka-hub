/**
 * Named scenario library.
 *
 * Each scenario describes:
 * - Cluster bootstrap parameters
 * - A scripted sequence of operations (one per "step") so a play loop
 *   produces a deterministic, repeatable narrative.
 * - Optional consumer groups produced at bootstrap.
 *
 * Scenarios are pure data. The worker / UI replays them via the simulator
 * core. This makes them embed- and link-friendly.
 */

import type { ClusterOptions } from "./engine";

export type ScenarioOp =
  | { kind: "wait"; ticks: number; note?: string }
  | { kind: "produce"; partition: number; key?: string; value: string; note?: string }
  | { kind: "killBroker"; brokerId: number; note?: string }
  | { kind: "reviveBroker"; brokerId: number; note?: string }
  | { kind: "shrinkIsrLag"; brokerId: number; lagMs: number; note?: string }
  | {
      kind: "inducePartition";
      groupA: number[];
      groupB: number[];
      note?: string;
    }
  | { kind: "healPartition"; note?: string };

export interface Scenario {
  slug: string;
  title: string;
  blurb: string;
  cluster: ClusterOptions;
  consumerGroup?: {
    id: string;
    consumerIds: string[];
    protocol: "eager" | "cooperative";
    consumeRatePerTick: number;
  };
  script: ScenarioOp[];
}

export const SCENARIOS: Record<string, Scenario> = {
  "quorum-loss": {
    slug: "quorum-loss",
    title: "Quorum loss — kill two brokers in an RF=3 cluster",
    blurb:
      "Three brokers, three partitions, RF=3, min.insync.replicas=2. The script kills two brokers in sequence and shows how ISR collapses and produce stops succeeding.",
    cluster: {
      brokerCount: 3,
      partitionCount: 3,
      replicationFactor: 3,
      minInsyncReplicas: 2,
      producerAcks: "all",
    },
    script: [
      { kind: "produce", partition: 0, value: "warm-up" },
      { kind: "wait", ticks: 2, note: "healthy steady state" },
      { kind: "killBroker", brokerId: 2, note: "broker 2 down" },
      { kind: "produce", partition: 0, value: "still ok (ISR=2)" },
      { kind: "killBroker", brokerId: 1, note: "broker 1 down — quorum lost" },
      {
        kind: "produce",
        partition: 0,
        value: "rejected — ISR=1 < min.isr=2",
      },
      { kind: "wait", ticks: 2 },
      { kind: "reviveBroker", brokerId: 1, note: "broker 1 back" },
      { kind: "wait", ticks: 2 },
      { kind: "produce", partition: 0, value: "back in business" },
    ],
  },

  "slow-consumer": {
    slug: "slow-consumer",
    title: "Slow consumer — producer outpaces consumer, lag explodes",
    blurb:
      "One consumer in the group, three partitions, producer pushes 3 records/tick, consumer drains 1/tick. Watch consumer lag climb monotonically.",
    cluster: {
      brokerCount: 3,
      partitionCount: 3,
      replicationFactor: 3,
      minInsyncReplicas: 2,
      producerAcks: "all",
    },
    consumerGroup: {
      id: "downstream",
      consumerIds: ["c-1"],
      protocol: "cooperative",
      consumeRatePerTick: 1,
    },
    script: [
      { kind: "produce", partition: 0, value: "evt-1" },
      { kind: "produce", partition: 1, value: "evt-2" },
      { kind: "produce", partition: 2, value: "evt-3" },
      { kind: "wait", ticks: 1 },
      { kind: "produce", partition: 0, value: "evt-4" },
      { kind: "produce", partition: 1, value: "evt-5" },
      { kind: "produce", partition: 2, value: "evt-6" },
      { kind: "wait", ticks: 1 },
      { kind: "produce", partition: 0, value: "evt-7" },
      { kind: "produce", partition: 1, value: "evt-8" },
      { kind: "produce", partition: 2, value: "evt-9" },
      { kind: "wait", ticks: 4, note: "consumer plays catch-up" },
    ],
  },

  "isr-shrink": {
    slug: "isr-shrink",
    title: "ISR shrink — slow follower drops out, acks=all stops succeeding",
    blurb:
      "Push one broker's replication lag past replica.lag.time.max.ms. ISR shrinks from 3 to 2; second shrink takes you below min.isr=2 and produces fail.",
    cluster: {
      brokerCount: 3,
      partitionCount: 2,
      replicationFactor: 3,
      minInsyncReplicas: 2,
      producerAcks: "all",
    },
    script: [
      { kind: "produce", partition: 0, value: "ok (ISR=3)" },
      { kind: "shrinkIsrLag", brokerId: 2, lagMs: 20_000, note: "broker 2 lags badly" },
      { kind: "wait", ticks: 1 },
      { kind: "produce", partition: 0, value: "ok (ISR=2)" },
      { kind: "shrinkIsrLag", brokerId: 1, lagMs: 20_000, note: "broker 1 lags too" },
      { kind: "wait", ticks: 1 },
      { kind: "produce", partition: 0, value: "rejected (ISR=1 < min=2)" },
      { kind: "shrinkIsrLag", brokerId: 1, lagMs: 0, note: "broker 1 recovers" },
      { kind: "wait", ticks: 1 },
      { kind: "produce", partition: 0, value: "ok (ISR=2 again)" },
    ],
  },

  "network-partition": {
    slug: "network-partition",
    title: "Network partition — split brain, controller fences minority side",
    blurb:
      "Split the cluster into {0} and {1,2}. The minority side loses leadership for its partitions; the majority side continues. Heal and watch convergence.",
    cluster: {
      brokerCount: 3,
      partitionCount: 3,
      replicationFactor: 3,
      minInsyncReplicas: 2,
      producerAcks: "all",
    },
    script: [
      { kind: "produce", partition: 0, value: "pre-split" },
      { kind: "wait", ticks: 1 },
      {
        kind: "inducePartition",
        groupA: [0],
        groupB: [1, 2],
        note: "broker 0 isolated",
      },
      { kind: "wait", ticks: 2, note: "follower lag accumulates on isolated side" },
      { kind: "produce", partition: 0, value: "majority side write" },
      { kind: "wait", ticks: 2 },
      { kind: "healPartition", note: "heal" },
      { kind: "wait", ticks: 2, note: "ISR reconciles" },
      { kind: "produce", partition: 0, value: "post-heal" },
    ],
  },
};

export const SCENARIO_LIST: Scenario[] = Object.values(SCENARIOS);
