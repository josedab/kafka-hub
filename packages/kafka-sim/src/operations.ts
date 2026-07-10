/**
 * Public simulator operations over immutable cluster state snapshots.
 */

import type { BrokerId, ClusterState, ProduceResult } from "./engine-types";
import { advanceConsumerGroups } from "./consumer-groups";
import {
  advanceFollowers,
  reconcileReplication,
} from "./replication";
import { appendClusterEvent, cloneClusterState } from "./state";

export function step(state: ClusterState): ClusterState {
  const next = cloneClusterState(state);
  next.tick += 1;
  advanceFollowers(next);
  reconcileReplication(next);
  advanceConsumerGroups(next);
  return next;
}

export function killBroker(
  state: ClusterState,
  brokerId: BrokerId,
): ClusterState {
  const next = cloneClusterState(state);
  const b = next.brokers.find((x) => x.id === brokerId);
  if (!b || !b.alive) return state;
  b.alive = false;
  next.tick += 1;
  appendClusterEvent(next, "warn", `broker ${brokerId} crashed`);
  reconcileReplication(next);
  return next;
}

export function reviveBroker(
  state: ClusterState,
  brokerId: BrokerId,
): ClusterState {
  const next = cloneClusterState(state);
  const b = next.brokers.find((x) => x.id === brokerId);
  if (!b || b.alive) return state;
  b.alive = true;
  for (const p of next.topic.partitions) {
    if (p.replicas.includes(brokerId)) {
      p.followerLagMs[brokerId] = 0;
    }
  }
  next.tick += 1;
  appendClusterEvent(next, "info", `broker ${brokerId} recovered`);
  reconcileReplication(next);
  return next;
}

export function inducePartition(
  state: ClusterState,
  groupA: BrokerId[],
  groupB: BrokerId[],
): ClusterState {
  const next = cloneClusterState(state);
  next.netPartition = { groupA: [...groupA], groupB: [...groupB] };
  next.tick += 1;
  appendClusterEvent(
    next,
    "warn",
    `network partition: {${groupA.join(",")}} | {${groupB.join(",")}}`,
  );
  return next;
}

export function healPartition(state: ClusterState): ClusterState {
  if (!state.netPartition) return state;
  const next = cloneClusterState(state);
  next.netPartition = null;
  next.tick += 1;
  appendClusterEvent(next, "info", "network healed");
  return next;
}

export function produce(
  state: ClusterState,
  partitionId: number,
  key: string | null,
  value: string,
): { state: ClusterState; result: ProduceResult } {
  const next = cloneClusterState(state);
  next.tick += 1;
  const p = next.topic.partitions.find((x) => x.id === partitionId);
  if (!p) {
    return {
      state: next,
      result: { ok: false, partition: partitionId, reason: "unknown partition" },
    };
  }
  if (p.isr.length === 0) {
    appendClusterEvent(next, "error", `produce p${partitionId}: rejected — ISR empty`);
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
    appendClusterEvent(
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
    leaderLog = leaderLog.filter((r) => r.key !== key);
  }
  const offset = leaderLog.length;
  leaderLog.push({ offset, key, value });
  p.logs[leader] = leaderLog;

  if (next.producerAcks === "all") {
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

export function shrinkIsrLag(
  state: ClusterState,
  brokerId: BrokerId,
  lagMs: number,
): ClusterState {
  const next = cloneClusterState(state);
  for (const p of next.topic.partitions) {
    if (p.replicas.includes(brokerId)) {
      p.followerLagMs[brokerId] = lagMs;
    }
  }
  next.tick += 1;
  appendClusterEvent(next, "warn", `broker ${brokerId} lag set to ${lagMs}ms`);
  reconcileReplication(next);
  return next;
}
