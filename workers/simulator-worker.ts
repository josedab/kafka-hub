/// <reference lib="webworker" />

/**
 * Simulator Web Worker.
 *
 * Holds the cluster state in worker memory and reduces commands sent from
 * the main thread. Replies with the new state after every op. Keeps the
 * deterministic engine off the UI thread so a long auto-play loop never
 * blocks render.
 *
 * Protocol (postMessage):
 *  → { type: "load", scenario }      load a scenario (or "freeform")
 *  → { type: "step" }                 advance one tick
 *  → { type: "playOp", index }        run scenario op N
 *  → { type: "killBroker", brokerId } / "reviveBroker"
 *  → { type: "produce", partition, value }
 *  ← { type: "state", state }
 */

import {
  addConsumerGroup,
  createCluster,
  killBroker,
  produce,
  reviveBroker,
  step,
  type ClusterState,
  runOp,
  SCENARIOS,
  type Scenario,
} from "@kafka-hub/kafka-sim";

let state: ClusterState = createCluster();
let scenario: Scenario | null = null;

function loadScenario(slug: string | null) {
  if (slug && SCENARIOS[slug]) {
    scenario = SCENARIOS[slug];
    state = createCluster(scenario.cluster);
    if (scenario.consumerGroup) {
      state = addConsumerGroup(state, scenario.consumerGroup);
    }
  } else {
    scenario = null;
    state = createCluster();
  }
}

type InMessage =
  | { type: "load"; scenario: string | null }
  | { type: "reset" }
  | { type: "step" }
  | { type: "playOp"; index: number }
  | { type: "killBroker"; brokerId: number }
  | { type: "reviveBroker"; brokerId: number }
  | { type: "produce"; partition: number; value: string };

self.addEventListener("message", (e: MessageEvent<InMessage>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case "load":
        loadScenario(msg.scenario);
        break;
      case "reset":
        if (scenario) {
          loadScenario(scenario.slug);
        } else {
          state = createCluster();
        }
        break;
      case "step":
        state = step(state);
        break;
      case "playOp": {
        if (!scenario) break;
        const op = scenario.script[msg.index];
        if (!op) break;
        state = runOp(state, op).state;
        break;
      }
      case "killBroker":
        state = killBroker(state, msg.brokerId);
        break;
      case "reviveBroker":
        state = reviveBroker(state, msg.brokerId);
        break;
      case "produce": {
        const { state: next } = produce(state, msg.partition, null, msg.value);
        state = next;
        break;
      }
    }
  } catch (err) {
    self.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  self.postMessage({ type: "state", state });
});

export {};
