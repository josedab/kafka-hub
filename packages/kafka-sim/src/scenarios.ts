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
 *
 * Consumer group scenarios use the two-axis model:
 * - groupProtocol: "classic" | "consumer"
 * - classicAssignmentBehavior: "eager" | "cooperative" (classic only)
 *
 * The assignor axis is explicit:
 * - Classic eager defaults to "range".
 * - Classic cooperative defaults to "cooperative-sticky".
 * - Consumer protocol (KIP-848) always uses "uniform" (server-side).
 *
 * Legacy `protocol: "eager" | "cooperative"` is accepted for backward
 * compatibility and auto-migrated to the new model by the engine.
 */

import type { ClusterOptions, GroupProtocol, ClassicAssignmentBehavior, Assignor } from "./engine";

export type ScenarioOp =
  | { kind: "wait"; ticks: number; note?: string }
  | { kind: "produce"; partition: number; key?: string; value: string; note?: string }
  | { kind: "killBroker"; brokerId: number; note?: string }
  | { kind: "reviveBroker"; brokerId: number; note?: string }
  | { kind: "shrinkIsrLag"; brokerId: number; lagMs: number; note?: string }
  | { kind: "inducePartition"; groupA: number[]; groupB: number[]; note?: string }
  | { kind: "healPartition"; note?: string }
  // ── consumer group operations ──
  | { kind: "consumerJoin"; groupId: string; memberId: string; note?: string }
  | { kind: "consumerLeave"; groupId: string; memberId: string; note?: string }
  | { kind: "consumerCrash"; groupId: string; memberId: string; note?: string }
  | { kind: "consumerRestart"; groupId: string; memberId: string; note?: string }
  | { kind: "consumerScaleOut"; groupId: string; memberIds: string[]; note?: string }
  | { kind: "consumerRollingRestartStep"; groupId: string; memberId: string; note?: string };

export interface Scenario {
  slug: string;
  title: string;
  blurb: string;
  cluster: ClusterOptions;
  consumerGroup?: {
    id: string;
    consumerIds: string[];
    /** @deprecated Use groupProtocol + classicAssignmentBehavior. */
    protocol?: "eager" | "cooperative";
    groupProtocol?: GroupProtocol;
    classicAssignmentBehavior?: ClassicAssignmentBehavior;
    /** Explicit assignor. Defaults: eager→"range", cooperative→"cooperative-sticky", consumer→"uniform". */
    assignor?: Assignor;
    consumeRatePerTick: number;
  };
  script: ScenarioOp[];
}

export const SCENARIOS: Record<string, Scenario> = {
  // ── existing scenarios (preserved) ──

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
      groupProtocol: "classic",
      classicAssignmentBehavior: "cooperative",
      assignor: "cooperative-sticky",
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

  // ── KIP-848 rebalance lab scenarios ──

  "rebalance-eager-classic": {
    slug: "rebalance-eager-classic",
    title: "Eager classic rebalance — stop-the-world on every membership change",
    blurb:
      "Classic group protocol with eager assignment (range assignor): every rebalance pauses ALL consumers, revokes all partitions, then reassigns. Watch processing stop across the board on every join, leave, or crash.",
    cluster: {
      brokerCount: 3,
      partitionCount: 6,
      replicationFactor: 3,
      minInsyncReplicas: 2,
      producerAcks: "all",
    },
    consumerGroup: {
      id: "eager-group",
      consumerIds: ["c-1", "c-2"],
      groupProtocol: "classic",
      classicAssignmentBehavior: "eager",
      assignor: "range",
      consumeRatePerTick: 2,
    },
    script: [
      // Produce some records to show lag behavior
      { kind: "produce", partition: 0, value: "evt-1", note: "produce records across partitions" },
      { kind: "produce", partition: 1, value: "evt-2" },
      { kind: "produce", partition: 2, value: "evt-3" },
      { kind: "produce", partition: 3, value: "evt-4" },
      { kind: "produce", partition: 4, value: "evt-5" },
      { kind: "produce", partition: 5, value: "evt-6" },
      { kind: "wait", ticks: 2, note: "consumers process at 2 rec/tick" },

      // Scale out — stop-the-world
      { kind: "consumerScaleOut", groupId: "eager-group", memberIds: ["c-3"], note: "scale out c-3 — ALL members pause (eager)" },
      { kind: "wait", ticks: 2, note: "observe pause tick then resume" },

      // More records
      { kind: "produce", partition: 0, value: "evt-7" },
      { kind: "produce", partition: 2, value: "evt-8" },
      { kind: "wait", ticks: 1 },

      // Graceful leave
      { kind: "consumerLeave", groupId: "eager-group", memberId: "c-3", note: "graceful leave c-3 — ALL members pause again" },
      { kind: "wait", ticks: 2, note: "pause tick then resume" },

      // Crash
      { kind: "produce", partition: 0, value: "evt-9", note: "produce before crash" },
      { kind: "wait", ticks: 1 },
      { kind: "consumerCrash", groupId: "eager-group", memberId: "c-2", note: "crash c-2 — elevated duplicate risk, no commit" },
      { kind: "wait", ticks: 2, note: "pause tick, then new owner replays from last committed" },

      // Restart
      { kind: "consumerRestart", groupId: "eager-group", memberId: "c-2", note: "restart c-2 — another stop-the-world" },
      { kind: "wait", ticks: 2 },

      // Rolling restart
      { kind: "consumerRollingRestartStep", groupId: "eager-group", memberId: "c-1", note: "rolling restart c-1 — two stop-the-worlds (2 ticks)" },
      { kind: "wait", ticks: 2, note: "final state" },
    ],
  },

  "rebalance-cooperative-classic": {
    slug: "rebalance-cooperative-classic",
    title: "Cooperative classic rebalance — only moved partitions revoked",
    blurb:
      "Classic group protocol with cooperative-sticky assignor: only partitions that move are revoked. Unaffected consumers keep processing without pause. Compare to eager to see the difference.",
    cluster: {
      brokerCount: 3,
      partitionCount: 6,
      replicationFactor: 3,
      minInsyncReplicas: 2,
      producerAcks: "all",
    },
    consumerGroup: {
      id: "coop-group",
      consumerIds: ["c-1", "c-2"],
      groupProtocol: "classic",
      classicAssignmentBehavior: "cooperative",
      assignor: "cooperative-sticky",
      consumeRatePerTick: 2,
    },
    script: [
      // Produce records
      { kind: "produce", partition: 0, value: "evt-1", note: "produce records across partitions" },
      { kind: "produce", partition: 1, value: "evt-2" },
      { kind: "produce", partition: 2, value: "evt-3" },
      { kind: "produce", partition: 3, value: "evt-4" },
      { kind: "produce", partition: 4, value: "evt-5" },
      { kind: "produce", partition: 5, value: "evt-6" },
      { kind: "wait", ticks: 2, note: "consumers process at 2 rec/tick" },

      // Scale out — cooperative: only moved partitions revoked
      { kind: "consumerScaleOut", groupId: "coop-group", memberIds: ["c-3"], note: "scale out c-3 — only moved partitions revoked (cooperative-sticky)" },
      { kind: "wait", ticks: 2, note: "unaffected consumers keep processing" },

      // More records
      { kind: "produce", partition: 0, value: "evt-7" },
      { kind: "produce", partition: 2, value: "evt-8" },
      { kind: "wait", ticks: 1 },

      // Graceful leave
      { kind: "consumerLeave", groupId: "coop-group", memberId: "c-3", note: "graceful leave c-3 — only its partitions redistributed" },
      { kind: "wait", ticks: 2, note: "other consumers unaffected" },

      // Crash
      { kind: "produce", partition: 0, value: "evt-9", note: "produce before crash" },
      { kind: "wait", ticks: 1 },
      { kind: "consumerCrash", groupId: "coop-group", memberId: "c-2", note: "crash c-2 — elevated duplicate risk" },
      { kind: "wait", ticks: 2 },

      // Restart
      { kind: "consumerRestart", groupId: "coop-group", memberId: "c-2", note: "restart c-2 — cooperative revoke of moved partitions only" },
      { kind: "wait", ticks: 2 },

      // Rolling restart
      { kind: "consumerRollingRestartStep", groupId: "coop-group", memberId: "c-1", note: "rolling restart c-1 — cooperative, minimal disruption (2 ticks)" },
      { kind: "wait", ticks: 2, note: "final state" },
    ],
  },

  "rebalance-consumer-protocol": {
    slug: "rebalance-consumer-protocol",
    title: "KIP-848 consumer protocol — broker-coordinated incremental reconciliation",
    blurb:
      "The new KIP-848 consumer protocol: the broker assigns partitions using group/member epochs and the server-side uniform assignor. No stop-the-world pause, no classic cooperative assignor — this is a fundamentally different protocol. Watch reconciliation state transition from reconciling to stable.",
    cluster: {
      brokerCount: 3,
      partitionCount: 6,
      replicationFactor: 3,
      minInsyncReplicas: 2,
      producerAcks: "all",
    },
    consumerGroup: {
      id: "kip848-group",
      consumerIds: ["c-1", "c-2"],
      groupProtocol: "consumer",
      assignor: "uniform",
      consumeRatePerTick: 2,
    },
    script: [
      // Produce records
      { kind: "produce", partition: 0, value: "evt-1", note: "produce records" },
      { kind: "produce", partition: 1, value: "evt-2" },
      { kind: "produce", partition: 2, value: "evt-3" },
      { kind: "produce", partition: 3, value: "evt-4" },
      { kind: "produce", partition: 4, value: "evt-5" },
      { kind: "produce", partition: 5, value: "evt-6" },
      { kind: "wait", ticks: 2, note: "consumers process via broker-coordinated assignment" },

      // Scale out — broker coordinates via epochs
      { kind: "consumerScaleOut", groupId: "kip848-group", memberIds: ["c-3"], note: "scale out c-3 — broker bumps group epoch, partitions pending reconciliation" },
      { kind: "wait", ticks: 2, note: "step() activates pending → assigned, state → stable" },

      // More records
      { kind: "produce", partition: 0, value: "evt-7" },
      { kind: "produce", partition: 2, value: "evt-8" },
      { kind: "wait", ticks: 1 },

      // Graceful leave
      { kind: "consumerLeave", groupId: "kip848-group", memberId: "c-3", note: "graceful leave c-3 — broker reassigns via new epoch" },
      { kind: "wait", ticks: 2, note: "incremental reconciliation, no global pause" },

      // Crash
      { kind: "produce", partition: 0, value: "evt-9" },
      { kind: "wait", ticks: 1 },
      { kind: "consumerCrash", groupId: "kip848-group", memberId: "c-2", note: "crash c-2 — elevated duplicate risk (no graceful commit)" },
      { kind: "wait", ticks: 2, note: "broker detects, bumps epoch, reassigns" },

      // Restart
      { kind: "consumerRestart", groupId: "kip848-group", memberId: "c-2", note: "restart c-2 — broker reconciles via epoch" },
      { kind: "wait", ticks: 2 },

      // Rolling restart
      { kind: "consumerRollingRestartStep", groupId: "kip848-group", memberId: "c-1", note: "rolling restart c-1 — incremental reconciliation per epoch (2 ticks)" },
      { kind: "wait", ticks: 2, note: "final state" },
    ],
  },

  "hot-partition": {
    slug: "hot-partition",
    title: "Hot partition — spare consumers cannot split one key",
    blurb:
      "Two partitions and three classic-group members. Partition 0 receives the heavy key while partition 1 stays light; the third member remains idle and cannot help the partition-0 owner.",
    cluster: {
      brokerCount: 3,
      partitionCount: 2,
      replicationFactor: 3,
      minInsyncReplicas: 2,
      producerAcks: "all",
    },
    consumerGroup: {
      id: "skew-group",
      consumerIds: ["c-1", "c-2", "c-3"],
      groupProtocol: "classic",
      classicAssignmentBehavior: "cooperative",
      assignor: "cooperative-sticky",
      consumeRatePerTick: 1,
    },
    script: [
      { kind: "produce", partition: 0, key: "tenant-hot", value: "hot-1", note: "hot tenant fills partition 0" },
      { kind: "produce", partition: 0, key: "tenant-hot", value: "hot-2" },
      { kind: "produce", partition: 0, key: "tenant-hot", value: "hot-3" },
      { kind: "produce", partition: 0, key: "tenant-hot", value: "hot-4" },
      { kind: "produce", partition: 0, key: "tenant-hot", value: "hot-5" },
      { kind: "produce", partition: 0, key: "tenant-hot", value: "hot-6" },
      { kind: "produce", partition: 1, key: "tenant-light", value: "light-1", note: "partition 1 gets light work" },
      { kind: "wait", ticks: 1, note: "each assigned owner can drain only one record per partition per tick" },
      { kind: "produce", partition: 0, key: "tenant-hot", value: "hot-7", note: "spare member remains idle; partition ownership is exclusive" },
      { kind: "produce", partition: 0, key: "tenant-hot", value: "hot-8" },
      { kind: "produce", partition: 0, key: "tenant-hot", value: "hot-9" },
      { kind: "produce", partition: 1, key: "tenant-light", value: "light-2" },
      { kind: "wait", ticks: 1, note: "per-partition skew persists despite spare group capacity" },
    ],
  },

  "rebalance-storm": {
    slug: "rebalance-storm",
    title: "Rebalance storm — eager classic churn accumulates pauses and lag",
    blurb:
      "Classic eager members repeatedly scale, crash, restart, and roll. Every membership change pauses all active members; a crash marks elevated duplicate risk while backlog accumulates.",
    cluster: {
      brokerCount: 3,
      partitionCount: 4,
      replicationFactor: 3,
      minInsyncReplicas: 2,
      producerAcks: "all",
    },
    consumerGroup: {
      id: "storm-group",
      consumerIds: ["c-1", "c-2"],
      groupProtocol: "classic",
      classicAssignmentBehavior: "eager",
      assignor: "range",
      consumeRatePerTick: 1,
    },
    script: [
      { kind: "produce", partition: 0, value: "p0-1", note: "backlog begins across the group" },
      { kind: "produce", partition: 0, value: "p0-2" },
      { kind: "produce", partition: 0, value: "p0-3" },
      { kind: "produce", partition: 1, value: "p1-1" },
      { kind: "produce", partition: 1, value: "p1-2" },
      { kind: "produce", partition: 1, value: "p1-3" },
      { kind: "produce", partition: 2, value: "p2-1" },
      { kind: "produce", partition: 2, value: "p2-2" },
      { kind: "produce", partition: 2, value: "p2-3" },
      { kind: "produce", partition: 3, value: "p3-1" },
      { kind: "produce", partition: 3, value: "p3-2" },
      { kind: "produce", partition: 3, value: "p3-3" },
      { kind: "wait", ticks: 1, note: "members make some progress" },
      { kind: "consumerScaleOut", groupId: "storm-group", memberIds: ["c-3"], note: "scale out — eager protocol pauses every member" },
      { kind: "wait", ticks: 1, note: "paused members resume; backlog did not drain during the pause" },
      { kind: "produce", partition: 0, value: "p0-4", note: "more work arrives while churn continues" },
      { kind: "produce", partition: 0, value: "p0-5" },
      { kind: "produce", partition: 2, value: "p2-4" },
      { kind: "consumerCrash", groupId: "storm-group", memberId: "c-2", note: "crash c-2 — eager rebalance and elevated duplicate risk" },
      { kind: "wait", ticks: 1, note: "remaining members resume after another global pause" },
      { kind: "consumerRestart", groupId: "storm-group", memberId: "c-2", note: "restart c-2 — another eager stop-the-world" },
      { kind: "wait", ticks: 1 },
      { kind: "consumerScaleOut", groupId: "storm-group", memberIds: ["c-4"], note: "autoscaler adds c-4 — all members pause again" },
      { kind: "wait", ticks: 1 },
      { kind: "consumerRollingRestartStep", groupId: "storm-group", memberId: "c-1", note: "rolling restart c-1 — leave and rejoin each cause eager churn" },
      { kind: "produce", partition: 0, value: "p0-6", note: "script ends with visible backlog after repeated pauses" },
      { kind: "produce", partition: 1, value: "p1-4" },
    ],
  },

  "offline-partition": {
    slug: "offline-partition",
    title: "Offline partition — RF=2 loses every live replica, then recovers",
    blurb:
      "Three brokers, three partitions, RF=2. Two broker failures leave partition 0 with no live replica; revive in sequence to watch leadership and ISR return.",
    cluster: {
      brokerCount: 3,
      partitionCount: 3,
      replicationFactor: 2,
      minInsyncReplicas: 1,
      producerAcks: "all",
    },
    script: [
      { kind: "produce", partition: 0, value: "warm-p0", note: "all RF=2 replicas are healthy" },
      { kind: "produce", partition: 1, value: "warm-p1" },
      { kind: "produce", partition: 2, value: "warm-p2" },
      { kind: "killBroker", brokerId: 0, note: "broker 0 down; partition 0 remains led by broker 1" },
      { kind: "killBroker", brokerId: 1, note: "broker 1 down; partition 0 has no live replica and becomes offline" },
      { kind: "produce", partition: 0, value: "rejected-no-leader", note: "produce fails because partition 0 ISR is empty" },
      { kind: "reviveBroker", brokerId: 1, note: "broker 1 returns and can lead partition 0 from its local replica" },
      { kind: "wait", ticks: 1, note: "leadership is restored while broker 0 remains down" },
      { kind: "reviveBroker", brokerId: 0, note: "broker 0 returns; ISR can restore to RF=2" },
      { kind: "wait", ticks: 2, note: "followers catch up and full ISR is restored" },
      { kind: "produce", partition: 0, value: "post-recovery", note: "partition 0 accepts writes again" },
    ],
  },
};

export const SCENARIO_LIST: Scenario[] = Object.values(SCENARIOS);
