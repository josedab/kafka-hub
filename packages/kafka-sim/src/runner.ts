/**
 * Reduce a single scenario operation against a cluster state.
 */

import {
  consumerCrash,
  consumerJoin,
  consumerLeave,
  consumerRestart,
  consumerRollingRestartStep,
  consumerScaleOut,
  healPartition,
  inducePartition,
  killBroker,
  produce,
  reviveBroker,
  shrinkIsrLag,
  step,
  type ClusterState,
} from "./engine";
import type { ScenarioOp } from "./scenarios";

export interface OpRunResult {
  state: ClusterState;
  /** Whether the op spans multiple ticks (e.g. wait). */
  ticksConsumed: number;
}

export function runOp(state: ClusterState, op: ScenarioOp): OpRunResult {
  switch (op.kind) {
    case "wait": {
      let next = state;
      for (let i = 0; i < op.ticks; i++) next = step(next);
      return { state: next, ticksConsumed: op.ticks };
    }
    case "produce": {
      const { state: next } = produce(state, op.partition, op.key ?? null, op.value);
      return { state: next, ticksConsumed: 1 };
    }
    case "killBroker":
      return { state: killBroker(state, op.brokerId), ticksConsumed: 1 };
    case "reviveBroker":
      return { state: reviveBroker(state, op.brokerId), ticksConsumed: 1 };
    case "shrinkIsrLag":
      return {
        state: shrinkIsrLag(state, op.brokerId, op.lagMs),
        ticksConsumed: 1,
      };
    case "inducePartition":
      return {
        state: inducePartition(state, op.groupA, op.groupB),
        ticksConsumed: 1,
      };
    case "healPartition":
      return { state: healPartition(state), ticksConsumed: 1 };
    // ── consumer group operations ──
    case "consumerJoin":
      return { state: consumerJoin(state, op.groupId, op.memberId), ticksConsumed: 1 };
    case "consumerLeave":
      return { state: consumerLeave(state, op.groupId, op.memberId), ticksConsumed: 1 };
    case "consumerCrash":
      return { state: consumerCrash(state, op.groupId, op.memberId), ticksConsumed: 1 };
    case "consumerRestart":
      return { state: consumerRestart(state, op.groupId, op.memberId), ticksConsumed: 1 };
    case "consumerScaleOut":
      return { state: consumerScaleOut(state, op.groupId, op.memberIds), ticksConsumed: 1 };
    case "consumerRollingRestartStep":
      // Rolling restart is an atomic leave+rejoin: consumes 2 ticks internally
      return { state: consumerRollingRestartStep(state, op.groupId, op.memberId), ticksConsumed: 2 };
  }
}
