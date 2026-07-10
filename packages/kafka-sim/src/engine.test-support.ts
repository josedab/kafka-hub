import assert from "node:assert/strict";
import {
  createCluster,
  addConsumerGroup,
  produce,
  step,
  killBroker,
  reviveBroker,
  inducePartition,
  healPartition,
  totalLag,
  consumerJoin,
  consumerLeave,
  consumerCrash,
  consumerRestart,
  consumerScaleOut,
  consumerRollingRestartStep,
  type ClusterState,
  type Assignor,

} from "./index";
import { SCENARIOS, SCENARIO_LIST } from "./scenarios";
import { runOp } from "./runner";
export { createCluster, addConsumerGroup, produce, step, killBroker, reviveBroker, inducePartition, healPartition, totalLag, consumerJoin, consumerLeave, consumerCrash, consumerRestart, consumerScaleOut, consumerRollingRestartStep, SCENARIOS, SCENARIO_LIST, runOp };
export type { ClusterState, Assignor };


// ───────────────────────── invariant helpers ─────────────────────────

/** Assert each partition has at most one owner across all alive members. */
export function assertOwnershipUniqueness(state: ClusterState, label: string) {
  for (const g of state.groups) {
    const seen = new Map<number, string>();
    for (const m of g.members) {
      if (!m.alive) continue;
      for (const pId of m.assigned) {
        assert.ok(
          !seen.has(pId),
          `[${label}] partition ${pId} owned by both ${seen.get(pId)} and ${m.id} in group ${g.id}`,
        );
        seen.set(pId, m.id);
      }
    }
  }
}

/** Assert ownership uniqueness including pending partitions. */
export function assertOwnershipUniquenessWithPending(state: ClusterState, label: string) {
  for (const g of state.groups) {
    // Active ownership uniqueness
    const activeOwners = new Map<number, string>();
    for (const m of g.members) {
      if (!m.alive) continue;
      for (const pId of m.assigned) {
        assert.ok(
          !activeOwners.has(pId),
          `[${label}] partition ${pId} actively owned by both ${activeOwners.get(pId)} and ${m.id}`,
        );
        activeOwners.set(pId, m.id);
      }
    }
    // Pending must not conflict with active from a different member
    for (const m of g.members) {
      if (!m.alive) continue;
      for (const pId of m.pendingAssigned) {
        const owner = activeOwners.get(pId);
        assert.ok(
          !owner || owner === m.id,
          `[${label}] partition ${pId} pending on ${m.id} but actively owned by ${owner}`,
        );
      }
    }
  }
}

/** Assert all assigned partition IDs actually exist. */
export function assertAssignedExist(state: ClusterState, label: string) {
  const pIds = new Set(state.topic.partitions.map((p) => p.id));
  for (const g of state.groups) {
    for (const m of g.members) {
      for (const pId of m.assigned) {
        assert.ok(pIds.has(pId), `[${label}] member ${m.id} assigned nonexistent partition ${pId}`);
      }
      for (const pId of m.pendingAssigned) {
        assert.ok(pIds.has(pId), `[${label}] member ${m.id} pending nonexistent partition ${pId}`);
      }
    }
  }
}

/** Assert group epoch is monotonically increasing (never decreases). */
export function assertEpochMonotonic(prev: ClusterState, next: ClusterState, label: string) {
  for (const gNext of next.groups) {
    const gPrev = prev.groups.find((g) => g.id === gNext.id);
    if (gPrev) {
      assert.ok(
        gNext.groupEpoch >= gPrev.groupEpoch,
        `[${label}] group ${gNext.id} epoch decreased: ${gPrev.groupEpoch} → ${gNext.groupEpoch}`,
      );
    }
  }
}

/** Assert pending assignments don't duplicate active ownership. */
export function assertNoPendingDuplicate(state: ClusterState, label: string) {
  for (const g of state.groups) {
    const activeOwners = new Map<number, string>();
    for (const m of g.members) {
      if (!m.alive) continue;
      for (const pId of m.assigned) activeOwners.set(pId, m.id);
    }
    for (const m of g.members) {
      if (!m.alive) continue;
      for (const pId of m.pendingAssigned) {
        const owner = activeOwners.get(pId);
        assert.ok(
          !owner || owner === m.id,
          `[${label}] partition ${pId} pending on ${m.id} but actively owned by ${owner}`,
        );
      }
    }
  }
}

/** Assert no group-level committed offsets were lost on handoff. */
export function assertGroupCommittedPreserved(
  prev: ClusterState,
  next: ClusterState,
  label: string,
) {
  for (const gNext of next.groups) {
    const gPrev = prev.groups.find((g) => g.id === gNext.id);
    if (!gPrev) continue;
    for (const [pIdStr, offset] of Object.entries(gPrev.groupCommitted)) {
      const pId = Number(pIdStr);
      const nextOffset = gNext.groupCommitted[pId];
      assert.ok(
        nextOffset === undefined || nextOffset >= offset,
        `[${label}] group ${gNext.id} lost committed offset for p${pId}: was ${offset}, now ${nextOffset}`,
      );
    }
  }
}

/** Run all invariants on a state. */
export function assertAllInvariants(state: ClusterState, label: string) {
  assertOwnershipUniqueness(state, label);
  assertOwnershipUniquenessWithPending(state, label);
  assertAssignedExist(state, label);
  assertNoPendingDuplicate(state, label);
}

/** Run all invariants including cross-state checks. */
export function assertTransitionInvariants(
  prev: ClusterState,
  next: ClusterState,
  label: string,
) {
  assertAllInvariants(next, label);
  assertEpochMonotonic(prev, next, label);
  assertGroupCommittedPreserved(prev, next, label);
}

