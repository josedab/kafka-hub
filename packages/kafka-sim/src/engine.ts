/**
 * Deterministic Kafka simulator core.
 *
 * Not a real broker. A pure-function state machine that models brokers,
 * partitions, ISR, leader election, consumer groups with cooperative
 * rebalance, key-based log compaction, and network partitions.
 *
 * Design rules:
 * - Pure functions. Every operation returns a new state.
 * - No React, no DOM. Runs in any JS environment (browser, Worker, Node).
 * - Determinism is the contract. Given the same starting state and the same
 *   sequence of operations, the engine produces the same end state.
 * - No async. No timers. No randomness (or seeded randomness only).
 */

export type BrokerId = number;
export type PartitionId = number;

export interface Broker {
  id: BrokerId;
  alive: boolean;
}

export interface LogRecord {
  /** Offset assigned by the leader. */
  offset: number;
  key: string | null;
  value: string;
}

export interface Partition {
  id: PartitionId;
  replicas: BrokerId[];
  /** Subset of replicas considered in-sync; first element is the leader. */
  isr: BrokerId[];
  /** Replica log by broker; deterministic copy. */
  logs: Record<BrokerId, LogRecord[]>;
  /** High water mark — min log end across the ISR set. */
  hw: number;
  /** Slow-follower lag (ms). Used to drive ISR shrink. */
  followerLagMs: Record<BrokerId, number>;
  /** True when the partition is compacted (cleanup.policy=compact). */
  compacted: boolean;
}

export interface Topic {
  name: string;
  partitions: Partition[];
  replicationFactor: number;
  minInsyncReplicas: number;
}

export interface ConsumerInstance {
  id: string;
  /** Assigned partitions. */
  assigned: PartitionId[];
  /** Per-partition committed offset. */
  committed: Record<PartitionId, number>;
  /** Whether this consumer is currently revoking (cooperative). */
  revoking: boolean;
}

export interface ConsumerGroup {
  id: string;
  /** "eager" stops all consumers on rebalance; "cooperative" only revokes deltas. */
  protocol: "eager" | "cooperative";
  members: ConsumerInstance[];
  /** Approximate processing speed: records per tick per consumer. */
  consumeRatePerTick: number;
}

export interface NetworkPartition {
  /** Two disjoint sets of broker ids; brokers across the split cannot talk. */
  groupA: BrokerId[];
  groupB: BrokerId[];
}

export interface ClusterEvent {
  tick: number;
  level: "info" | "warn" | "error";
  message: string;
}

export interface ClusterState {
  tick: number;
  brokers: Broker[];
  topic: Topic;
  groups: ConsumerGroup[];
  /** Active network partition, if any. */
  netPartition: NetworkPartition | null;
  events: ClusterEvent[];
  /** Producer ack settings used by future produce() calls. */
  producerAcks: "0" | "1" | "all";
}

export interface ClusterOptions {
  brokerCount?: number;
  partitionCount?: number;
  replicationFactor?: number;
  minInsyncReplicas?: number;
  topicName?: string;
  compacted?: boolean;
  producerAcks?: "0" | "1" | "all";
}

// ───────────────────────── construction ─────────────────────────

export function createCluster(opts: ClusterOptions = {}): ClusterState {
  const brokerCount = opts.brokerCount ?? 3;
  const partitionCount = opts.partitionCount ?? 3;
  const replicationFactor = Math.min(
    opts.replicationFactor ?? 3,
    brokerCount,
  );
  const minInsyncReplicas = Math.min(
    opts.minInsyncReplicas ?? 2,
    replicationFactor,
  );

  const brokers: Broker[] = Array.from({ length: brokerCount }, (_, i) => ({
    id: i,
    alive: true,
  }));

  const partitions: Partition[] = Array.from(
    { length: partitionCount },
    (_, p) => {
      const replicas = Array.from(
        { length: replicationFactor },
        (_, r) => (p + r) % brokerCount,
      );
      const logs: Record<BrokerId, LogRecord[]> = {};
      const lag: Record<BrokerId, number> = {};
      for (const r of replicas) {
        logs[r] = [];
        lag[r] = 0;
      }
      return {
        id: p,
        replicas,
        isr: [...replicas],
        logs,
        hw: 0,
        followerLagMs: lag,
        compacted: opts.compacted ?? false,
      };
    },
  );

  return {
    tick: 0,
    brokers,
    topic: {
      name: opts.topicName ?? "events",
      partitions,
      replicationFactor,
      minInsyncReplicas,
    },
    groups: [],
    netPartition: null,
    producerAcks: opts.producerAcks ?? "all",
    events: [
      { tick: 0, level: "info", message: `cluster bootstrapped with ${brokerCount} brokers` },
    ],
  };
}

export function addConsumerGroup(
  state: ClusterState,
  group: {
    id: string;
    protocol?: ConsumerGroup["protocol"];
    consumerIds: string[];
    consumeRatePerTick?: number;
  },
): ClusterState {
  const next = clone(state);
  const members: ConsumerInstance[] = group.consumerIds.map((id) => ({
    id,
    assigned: [],
    committed: {},
    revoking: false,
  }));
  next.groups.push({
    id: group.id,
    protocol: group.protocol ?? "cooperative",
    members,
    consumeRatePerTick: group.consumeRatePerTick ?? 1,
  });
  assign(next, group.id);
  log(next, "info", `group ${group.id} created with ${members.length} consumers`);
  return next;
}

// ───────────────────────── mutation helpers ─────────────────────────

function clone(state: ClusterState): ClusterState {
  return {
    tick: state.tick,
    brokers: state.brokers.map((b) => ({ ...b })),
    topic: {
      ...state.topic,
      partitions: state.topic.partitions.map((p) => ({
        ...p,
        replicas: [...p.replicas],
        isr: [...p.isr],
        logs: Object.fromEntries(
          Object.entries(p.logs).map(([k, v]) => [Number(k), [...v]]),
        ) as Record<BrokerId, LogRecord[]>,
        followerLagMs: { ...p.followerLagMs },
      })),
    },
    groups: state.groups.map((g) => ({
      ...g,
      members: g.members.map((m) => ({
        ...m,
        assigned: [...m.assigned],
        committed: { ...m.committed },
      })),
    })),
    netPartition: state.netPartition
      ? {
          groupA: [...state.netPartition.groupA],
          groupB: [...state.netPartition.groupB],
        }
      : null,
    producerAcks: state.producerAcks,
    events: [...state.events],
  };
}

function log(
  state: ClusterState,
  level: ClusterEvent["level"],
  message: string,
) {
  state.events.push({ tick: state.tick, level, message });
  if (state.events.length > 200) state.events.shift();
}

// ───────────────────────── ISR + leadership ─────────────────────────

const LAG_THRESHOLD_MS = 10_000;

function reachable(
  state: ClusterState,
  from: BrokerId,
  to: BrokerId,
): boolean {
  if (!state.netPartition) return true;
  const { groupA, groupB } = state.netPartition;
  const aHas = (x: BrokerId) => groupA.includes(x);
  const bHas = (x: BrokerId) => groupB.includes(x);
  if (aHas(from) && bHas(to)) return false;
  if (bHas(from) && aHas(to)) return false;
  return true;
}

function reconcile(state: ClusterState): void {
  const aliveSet = new Set(
    state.brokers.filter((b) => b.alive).map((b) => b.id),
  );

  for (const p of state.topic.partitions) {
    const before = p.isr.join(",");
    // Leader must be alive AND reachable from the controller (broker 0).
    // For partition splits, the "majority side" wins.
    const candidates = p.replicas.filter((r) => aliveSet.has(r));
    // Drop followers that are too laggy.
    const synced = candidates.filter(
      (r, idx) => idx === 0 || p.followerLagMs[r] <= LAG_THRESHOLD_MS,
    );
    p.isr = synced;

    if (p.isr.length === 0) {
      log(state, "error", `partition ${p.id}: ISR empty — offline`);
      p.hw = 0;
    } else {
      const minOffset = Math.min(...p.isr.map((r) => p.logs[r].length));
      p.hw = minOffset;
      if (before !== p.isr.join(",")) {
        log(
          state,
          "warn",
          `partition ${p.id}: ISR=[${p.isr.join(",")}] leader=${p.isr[0]} HW=${p.hw}`,
        );
      }
    }
  }
}

// ───────────────────────── consumer group assignment ─────────────────────────

function assign(state: ClusterState, groupId: string): void {
  const g = state.groups.find((x) => x.id === groupId);
  if (!g) return;
  const partitionIds = state.topic.partitions.map((p) => p.id);

  // Sticky-ish: keep partitions where they were, move only what's needed.
  const currentAssignment = new Map<PartitionId, string>();
  for (const m of g.members) {
    for (const p of m.assigned) currentAssignment.set(p, m.id);
  }

  const memberPartitionCount = new Map<string, number>();
  for (const m of g.members) memberPartitionCount.set(m.id, 0);

  // Try to preserve current assignments first.
  const newAssignment = new Map<PartitionId, string>();
  const target = Math.ceil(partitionIds.length / g.members.length);
  for (const [pId, mId] of currentAssignment) {
    if (
      g.members.some((m) => m.id === mId) &&
      (memberPartitionCount.get(mId) ?? 0) < target
    ) {
      newAssignment.set(pId, mId);
      memberPartitionCount.set(mId, (memberPartitionCount.get(mId) ?? 0) + 1);
    }
  }

  // Distribute the remainder round-robin to least-loaded.
  for (const pId of partitionIds) {
    if (newAssignment.has(pId)) continue;
    const sorted = [...g.members].sort(
      (a, b) =>
        (memberPartitionCount.get(a.id) ?? 0) -
        (memberPartitionCount.get(b.id) ?? 0),
    );
    const least = sorted[0];
    newAssignment.set(pId, least.id);
    memberPartitionCount.set(least.id, (memberPartitionCount.get(least.id) ?? 0) + 1);
  }

  // Apply.
  for (const m of g.members) {
    const next = partitionIds.filter((p) => newAssignment.get(p) === m.id);
    if (g.protocol === "eager" && m.assigned.length > 0 && next.join(",") !== m.assigned.join(",")) {
      m.revoking = true;
    }
    m.assigned = next;
  }
}

// ───────────────────────── public ops ─────────────────────────

export function step(state: ClusterState): ClusterState {
  const next = clone(state);
  next.tick += 1;

  // Tick the followers: if a broker is unreachable from the leader (alive but
  // partitioned), lag accumulates. Otherwise it drains.
  for (const p of next.topic.partitions) {
    if (p.isr.length === 0) continue;
    const leader = p.isr[0];
    for (const r of p.replicas) {
      if (r === leader) continue;
      const broker = next.brokers.find((b) => b.id === r);
      if (!broker || !broker.alive) {
        p.followerLagMs[r] += 1000;
      } else if (!reachable(next, leader, r)) {
        p.followerLagMs[r] += 1000;
      } else {
        // Catch up; copy from leader log.
        p.logs[r] = [...p.logs[leader]];
        p.followerLagMs[r] = 0;
      }
    }
  }

  reconcile(next);

  // Tick the consumers: each catches up its consumeRatePerTick offsets.
  for (const g of next.groups) {
    for (const m of g.members) {
      if (m.revoking) {
        // Cooperative resumes next tick.
        m.revoking = false;
        log(next, "info", `consumer ${m.id} resumed after revoke`);
        continue;
      }
      for (const pId of m.assigned) {
        const p = next.topic.partitions.find((x) => x.id === pId);
        if (!p || p.isr.length === 0) continue;
        const committed = m.committed[pId] ?? 0;
        const advance = Math.min(g.consumeRatePerTick, p.hw - committed);
        if (advance > 0) {
          m.committed[pId] = committed + advance;
        }
      }
    }
  }

  return next;
}

export function killBroker(
  state: ClusterState,
  brokerId: BrokerId,
): ClusterState {
  const next = clone(state);
  const b = next.brokers.find((x) => x.id === brokerId);
  if (!b || !b.alive) return state;
  b.alive = false;
  next.tick += 1;
  log(next, "warn", `broker ${brokerId} crashed`);
  reconcile(next);
  return next;
}

export function reviveBroker(
  state: ClusterState,
  brokerId: BrokerId,
): ClusterState {
  const next = clone(state);
  const b = next.brokers.find((x) => x.id === brokerId);
  if (!b || b.alive) return state;
  b.alive = true;
  // Reset lag — broker comes back and starts catching up.
  for (const p of next.topic.partitions) {
    if (p.replicas.includes(brokerId)) {
      p.followerLagMs[brokerId] = 0;
    }
  }
  next.tick += 1;
  log(next, "info", `broker ${brokerId} recovered`);
  reconcile(next);
  return next;
}

export function inducePartition(
  state: ClusterState,
  groupA: BrokerId[],
  groupB: BrokerId[],
): ClusterState {
  const next = clone(state);
  next.netPartition = { groupA: [...groupA], groupB: [...groupB] };
  next.tick += 1;
  log(
    next,
    "warn",
    `network partition: {${groupA.join(",")}} | {${groupB.join(",")}}`,
  );
  return next;
}

export function healPartition(state: ClusterState): ClusterState {
  if (!state.netPartition) return state;
  const next = clone(state);
  next.netPartition = null;
  next.tick += 1;
  log(next, "info", "network healed");
  return next;
}

export type ProduceResult =
  | { ok: true; partition: number; offset: number; isr: number }
  | { ok: false; partition: number; reason: string };

export function produce(
  state: ClusterState,
  partitionId: number,
  key: string | null,
  value: string,
): { state: ClusterState; result: ProduceResult } {
  const next = clone(state);
  next.tick += 1;
  const p = next.topic.partitions.find((x) => x.id === partitionId);
  if (!p) {
    return {
      state: next,
      result: { ok: false, partition: partitionId, reason: "unknown partition" },
    };
  }
  if (p.isr.length === 0) {
    log(next, "error", `produce p${partitionId}: rejected — ISR empty`);
    return {
      state: next,
      result: {
        ok: false,
        partition: partitionId,
        reason: "no leader (ISR empty)",
      },
    };
  }
  if (next.producerAcks === "all" && p.isr.length < next.topic.minInsyncReplicas) {
    log(
      next,
      "error",
      `produce p${partitionId}: NotEnoughReplicasException ISR=${p.isr.length}`,
    );
    return {
      state: next,
      result: {
        ok: false,
        partition: partitionId,
        reason: `ISR=${p.isr.length} < min.insync.replicas=${next.topic.minInsyncReplicas}`,
      },
    };
  }
  const leader = p.isr[0];
  let leaderLog = p.logs[leader];

  if (p.compacted && key !== null) {
    // Compacted-topic-style: latest-wins per key. Removes prior records with
    // the same key from the leader log (not realistic — real Kafka does this
    // asynchronously via the LogCleaner — but useful for the demo).
    leaderLog = leaderLog.filter((r) => r.key !== key);
  }
  const offset = leaderLog.length;
  leaderLog.push({ offset, key, value });
  p.logs[leader] = leaderLog;

  if (next.producerAcks === "all") {
    // Sync followers in ISR — sets their logs to the leader's.
    for (const r of p.isr) {
      if (r !== leader) p.logs[r] = [...leaderLog];
    }
    p.hw = leaderLog.length;
  } else if (next.producerAcks === "1") {
    // Only the leader has the new record; HW advances later.
  }

  return {
    state: next,
    result: { ok: true, partition: partitionId, offset, isr: p.isr.length },
  };
}

// ───────────────────────── inspection helpers ─────────────────────────

export function totalLag(state: ClusterState): number {
  let lag = 0;
  for (const g of state.groups) {
    for (const m of g.members) {
      for (const pId of m.assigned) {
        const p = state.topic.partitions.find((x) => x.id === pId);
        if (!p) continue;
        lag += Math.max(0, p.hw - (m.committed[pId] ?? 0));
      }
    }
  }
  return lag;
}

export function shrinkIsrLag(
  state: ClusterState,
  brokerId: BrokerId,
  lagMs: number,
): ClusterState {
  const next = clone(state);
  for (const p of next.topic.partitions) {
    if (p.replicas.includes(brokerId)) {
      p.followerLagMs[brokerId] = lagMs;
    }
  }
  next.tick += 1;
  log(next, "warn", `broker ${brokerId} lag set to ${lagMs}ms`);
  reconcile(next);
  return next;
}
