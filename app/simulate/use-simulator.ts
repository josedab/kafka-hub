"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addConsumerGroup,
  createCluster,
  killBroker,
  produce,
  reviveBroker,
  runOp,
  SCENARIOS,
  step,
  consumerJoin as engineConsumerJoin,
  consumerLeave as engineConsumerLeave,
  consumerCrash as engineConsumerCrash,
  consumerScaleOut as engineConsumerScaleOut,
  consumerRollingRestartStep,
  type ClusterState,
  type Scenario,
} from "@kafka-hub/kafka-sim";

/**
 * Build the initial deterministic state for a scenario (or freeform default).
 * Pure — used both for SSR and as the synchronous fallback when the Web
 * Worker is unavailable.
 */
export function buildInitial(slug: string | null): ClusterState {
  if (slug && SCENARIOS[slug]) {
    const s = SCENARIOS[slug];
    let cluster = createCluster(s.cluster);
    if (s.consumerGroup) cluster = addConsumerGroup(cluster, s.consumerGroup);
    return cluster;
  }
  return createCluster();
}

interface UseSimulatorReturn {
  state: ClusterState;
  /** True when the engine is running off the main thread. */
  workerActive: boolean;
  /** Reset state to the scenario's initial cluster. */
  reset: (slug: string) => void;
  /** Apply the scenario op at `index`. No-op if out of range. */
  playOp: (scenario: Scenario, index: number) => void;
  /** Advance one tick. */
  step: () => void;
  /** Toggle a broker's alive flag. */
  killBroker: (brokerId: number) => void;
  reviveBroker: (brokerId: number) => void;
  /** Send a record to a partition. */
  produce: (partition: number, value: string) => void;
  /** Consumer group operations. */
  consumerJoin: (groupId: string, memberId: string) => void;
  consumerLeave: (groupId: string, memberId: string) => void;
  consumerCrash: (groupId: string, memberId: string) => void;
  consumerScaleOut: (groupId: string, memberIds: string[]) => void;
  consumerRollingRestart: (groupId: string, memberId: string) => void;
}

/**
 * State container for the simulator. Off-loads work to a Web Worker when the
 * browser supports it; otherwise reduces synchronously on the main thread.
 */
export function useSimulator(initialSlug: string): UseSimulatorReturn {
  const [state, setState] = useState<ClusterState>(() => buildInitial(initialSlug));
  const [workerActive, setWorkerActive] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const slugRef = useRef<string>(initialSlug);

  useEffect(() => {
    if (typeof window === "undefined" || typeof Worker === "undefined") return;

    let worker: Worker;
    try {
      worker = new Worker(
        new URL("../../workers/simulator-worker.ts", import.meta.url),
        { type: "module" },
      );
    } catch {
      return;
    }

    workerRef.current = worker;

    worker.addEventListener("message", (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === "state" && msg.state) {
        setState(msg.state as ClusterState);
      }
    });

    worker.addEventListener("error", () => {
      worker.terminate();
      workerRef.current = null;
      setWorkerActive(false);
    });

    worker.postMessage({ type: "load", scenario: slugRef.current });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkerActive(true);

    return () => {
      worker.terminate();
      workerRef.current = null;
      setWorkerActive(false);
    };
  }, []);

  const send = useCallback(
    (msg: unknown, syncFallback: (s: ClusterState) => ClusterState) => {
      const w = workerRef.current;
      if (w) {
        w.postMessage(msg);
      } else {
        setState((s) => syncFallback(s));
      }
    },
    [],
  );

  const reset = useCallback(
    (slug: string) => {
      slugRef.current = slug;
      const fresh = buildInitial(slug);
      setState(fresh);
      const w = workerRef.current;
      if (w) w.postMessage({ type: "load", scenario: slug });
    },
    [],
  );

  const playOp = useCallback(
    (scenario: Scenario, index: number) => {
      const op = scenario.script[index];
      if (!op) return;
      send({ type: "playOp", index }, (s) => runOp(s, op).state);
    },
    [send],
  );

  const doStep = useCallback(() => {
    send({ type: "step" }, (s) => step(s));
  }, [send]);

  const doKill = useCallback(
    (brokerId: number) => {
      send({ type: "killBroker", brokerId }, (s) => killBroker(s, brokerId));
    },
    [send],
  );

  const doRevive = useCallback(
    (brokerId: number) => {
      send({ type: "reviveBroker", brokerId }, (s) => reviveBroker(s, brokerId));
    },
    [send],
  );

  const doProduce = useCallback(
    (partition: number, value: string) => {
      send({ type: "produce", partition, value }, (s) => produce(s, partition, null, value).state);
    },
    [send],
  );

  const doConsumerJoin = useCallback(
    (groupId: string, memberId: string) => {
      send({ type: "consumerJoin", groupId, memberId }, (s) => engineConsumerJoin(s, groupId, memberId));
    },
    [send],
  );

  const doConsumerLeave = useCallback(
    (groupId: string, memberId: string) => {
      send({ type: "consumerLeave", groupId, memberId }, (s) => engineConsumerLeave(s, groupId, memberId));
    },
    [send],
  );

  const doConsumerCrash = useCallback(
    (groupId: string, memberId: string) => {
      send({ type: "consumerCrash", groupId, memberId }, (s) => engineConsumerCrash(s, groupId, memberId));
    },
    [send],
  );

  const doConsumerScaleOut = useCallback(
    (groupId: string, memberIds: string[]) => {
      send({ type: "consumerScaleOut", groupId, memberIds }, (s) => engineConsumerScaleOut(s, groupId, memberIds));
    },
    [send],
  );

  const doConsumerRollingRestart = useCallback(
    (groupId: string, memberId: string) => {
      send({ type: "consumerRollingRestart", groupId, memberId }, (s) => consumerRollingRestartStep(s, groupId, memberId));
    },
    [send],
  );

  return {
    state,
    workerActive,
    reset,
    playOp,
    step: doStep,
    killBroker: doKill,
    reviveBroker: doRevive,
    produce: doProduce,
    consumerJoin: doConsumerJoin,
    consumerLeave: doConsumerLeave,
    consumerCrash: doConsumerCrash,
    consumerScaleOut: doConsumerScaleOut,
    consumerRollingRestart: doConsumerRollingRestart,
  };
}
