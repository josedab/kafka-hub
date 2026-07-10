/**
 * Broker reachability, follower replication, ISR, leader, and HW reconciliation.
 */

import type { BrokerId, ClusterState } from "./engine-types";
import { appendClusterEvent } from "./state";

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

export function reconcileReplication(state: ClusterState): void {
  const aliveSet = new Set(
    state.brokers.filter((b) => b.alive).map((b) => b.id),
  );

  for (const p of state.topic.partitions) {
    const before = p.isr.join(",");
    const candidates = p.replicas.filter((r) => aliveSet.has(r));
    const synced = candidates.filter(
      (r, idx) => idx === 0 || p.followerLagMs[r] <= LAG_THRESHOLD_MS,
    );
    p.isr = synced;

    if (p.isr.length === 0) {
      appendClusterEvent(state, "error", `partition ${p.id}: ISR empty — offline`);
      p.hw = 0;
    } else {
      const minOffset = Math.min(...p.isr.map((r) => p.logs[r].length));
      p.hw = minOffset;
      if (before !== p.isr.join(",")) {
        appendClusterEvent(
          state,
          "warn",
          `partition ${p.id}: ISR=[${p.isr.join(",")}] leader=${p.isr[0]} HW=${p.hw}`,
        );
      }
    }
  }
}


/** Mutate follower logs and lag counters for one simulator tick. */
export function advanceFollowers(state: ClusterState): void {
  for (const partition of state.topic.partitions) {
    if (partition.isr.length === 0) continue;
    const leader = partition.isr[0];

    for (const replica of partition.replicas) {
      if (replica === leader) continue;
      const broker = state.brokers.find((candidate) => candidate.id === replica);
      if (!broker || !broker.alive || !reachable(state, leader, replica)) {
        partition.followerLagMs[replica] += 1000;
        continue;
      }

      partition.logs[replica] = [...partition.logs[leader]];
      partition.followerLagMs[replica] = 0;
    }
  }
}
