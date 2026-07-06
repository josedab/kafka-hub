/**
 * Reduce a single scenario operation against a cluster state.
 */

import {
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
  }
}
