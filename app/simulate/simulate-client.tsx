"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  totalLag,
  type ClusterState,
  SCENARIO_LIST,
  SCENARIOS,
} from "@kafka-hub/kafka-sim";
import { cn } from "@/lib/cn";
import { KeyboardShortcutsDialog } from "./keyboard-shortcuts-dialog";
import { ScenarioScriptDrawer } from "./scenario-script-drawer";
import { useSimulator } from "./use-simulator";

import { BrokerGrid } from "./components/broker-grid";
import { TopicTable } from "./components/topic-table";
import { ConsumerGroups } from "./components/consumer-groups";
import { EventLog, MobileEventLog } from "./components/event-log";
import { ScenarioPicker } from "./components/scenario-picker";
import { ScenarioControls } from "./components/scenario-controls";

interface Props {
  /** If set, scenario picker is hidden and the embed mode is used (no chrome). */
  fixedScenario?: string;
  /** When true, hide outer headers + heavy chrome (used in embed route). */
  embed?: boolean;
  /** Initial scenario slug from deep-link. */
  initialScenario?: string;
}

function isShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return ["INPUT", "TEXTAREA", "BUTTON", "SELECT"].includes(target.tagName);
}

export function SimulateClient({ fixedScenario, embed = false, initialScenario }: Props) {
  const resolvedInitial = fixedScenario ?? initialScenario ?? SCENARIO_LIST[0].slug;
  // Validate: fall back to first scenario if slug is invalid
  const initialSlug = SCENARIOS[resolvedInitial] ? resolvedInitial : SCENARIO_LIST[0].slug;

  const [scenarioSlug, setScenarioSlug] = useState<string>(initialSlug);
  const [playing, setPlaying] = useState(false);
  const [opIndex, setOpIndex] = useState(0);
  const [hoveredBrokerId, setHoveredBrokerId] = useState<number | null>(null);
  const shortcutDialogRef = useRef<HTMLDialogElement | null>(null);

  const sim = useSimulator(initialSlug);
  const scenario = SCENARIOS[scenarioSlug];
  const done = opIndex >= scenario.script.length;

  const openKeyboardShortcuts = useCallback(() => {
    const dialog = shortcutDialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
  }, []);

  const togglePlaying = useCallback(() => {
    setPlaying((current) => (done ? false : !current));
  }, [done]);

  const resetAll = useCallback(() => {
    sim.reset(scenarioSlug);
    setOpIndex(0);
    setPlaying(false);
  }, [scenarioSlug, sim]);

  const playNextOp = useCallback(() => {
    if (opIndex >= scenario.script.length) {
      setPlaying(false);
      return;
    }

    sim.playOp(scenario, opIndex);
    setOpIndex((i) => {
      const next = Math.min(i + 1, scenario.script.length);
      if (next >= scenario.script.length) {
        setPlaying(false);
      }
      return next;
    });
  }, [opIndex, scenario, sim]);

  const advanceOne = useCallback(() => {
    if (opIndex >= scenario.script.length) {
      sim.step();
      setPlaying(false);
      return;
    }

    playNextOp();
  }, [opIndex, playNextOp, scenario.script.length, sim]);

  const jumpToOp = useCallback(
    (targetIndex: number) => {
      if (scenario.script.length === 0) {
        resetAll();
        return;
      }

      const boundedIndex = Math.max(
        0,
        Math.min(targetIndex, scenario.script.length - 1),
      );
      sim.reset(scenarioSlug);
      for (let i = 0; i <= boundedIndex; i += 1) {
        sim.playOp(scenario, i);
      }
      setOpIndex(Math.min(boundedIndex + 1, scenario.script.length));
      setPlaying(false);
    },
    [resetAll, scenario, scenarioSlug, sim],
  );

  const killHoveredBroker = useCallback(() => {
    if (hoveredBrokerId === null) return;
    sim.killBroker(hoveredBrokerId);
  }, [hoveredBrokerId, sim]);

  // Auto-play loop.
  const tickRef = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) return;
    tickRef.current = window.setInterval(() => {
      playNextOp();
    }, 750);
    return () => {
      if (tickRef.current !== null) window.clearInterval(tickRef.current);
    };
  }, [playing, playNextOp]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (shortcutDialogRef.current?.open) return;
      if (isShortcutTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        togglePlaying();
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        advanceOne();
        return;
      }

      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        resetAll();
        return;
      }

      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        killHoveredBroker();
        return;
      }

      if (event.key === "?" || (event.shiftKey && event.key === "/")) {
        event.preventDefault();
        openKeyboardShortcuts();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [advanceOne, killHoveredBroker, openKeyboardShortcuts, resetAll, togglePlaying]);

  const handleScenarioChange = useCallback(
    (slug: string) => {
      setScenarioSlug(slug);
      sim.reset(slug);
      setOpIndex(0);
      setPlaying(false);
      setHoveredBrokerId(null);
      // Update URL without making the route dynamic
      if (typeof window !== "undefined" && !fixedScenario) {
        const url = new URL(window.location.href);
        url.searchParams.set("scenario", slug);
        window.history.replaceState({}, "", url.toString());
      }
    },
    [sim, fixedScenario],
  );

  const toggleBroker = (id: number) => {
    const b = sim.state.brokers.find((x) => x.id === id);
    if (!b) return;
    if (b.alive) sim.killBroker(id);
    else sim.reviveBroker(id);
  };

  const handleProduce = () => {
    sim.produce(0, `manual evt-${sim.state.tick}`);
  };

  const tick = () => sim.step();

  // Consumer group controls
  const handleConsumerJoin = useCallback(
    (groupId: string, memberId: string) => {
      sim.consumerJoin(groupId, memberId);
    },
    [sim],
  );

  const handleConsumerLeave = useCallback(
    (groupId: string, memberId: string) => {
      sim.consumerLeave(groupId, memberId);
    },
    [sim],
  );

  const handleConsumerCrash = useCallback(
    (groupId: string, memberId: string) => {
      sim.consumerCrash(groupId, memberId);
    },
    [sim],
  );

  const handleConsumerScaleOut = useCallback(
    (groupId: string) => {
      const g = sim.state.groups.find((x) => x.id === groupId);
      if (!g) return;
      const nextId = `c-${g.members.length + 1}`;
      sim.consumerScaleOut(groupId, [nextId]);
    },
    [sim],
  );

  const handleConsumerRollingRestart = useCallback(
    (groupId: string, memberId: string) => {
      sim.consumerRollingRestart(groupId, memberId);
    },
    [sim],
  );

  const lag = useMemo(() => totalLag(sim.state), [sim.state]);
  const state: ClusterState = sim.state;

  return (
    <div className={cn("flex min-w-0 flex-col gap-6", embed && "p-4")}>
      <KeyboardShortcutsDialog dialogRef={shortcutDialogRef} />

      {!fixedScenario ? (
        <ScenarioPicker
          active={scenarioSlug}
          onChange={handleScenarioChange}
        />
      ) : null}

      <ScenarioControls
        scenario={scenario}
        opIndex={opIndex}
        playing={playing}
        workerActive={sim.workerActive}
        onPlayToggle={togglePlaying}
        onStep={playNextOp}
        onReset={resetAll}
        onTick={tick}
        onProduce={handleProduce}
        onOpenShortcuts={openKeyboardShortcuts}
      />

      <div className="hidden sm:block">
        <ScenarioScriptDrawer
          scenario={scenario}
          opIndex={opIndex}
          defaultOpen
          onJumpTo={jumpToOp}
        />
      </div>
      <div className="sm:hidden">
        <ScenarioScriptDrawer
          scenario={scenario}
          opIndex={opIndex}
          defaultOpen={false}
          onJumpTo={jumpToOp}
        />
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <BrokerGrid
            state={state}
            netPartition={state.netPartition}
            onToggle={toggleBroker}
            onHoverBroker={setHoveredBrokerId}
          />
          <TopicTable state={state} />
          {state.groups.length > 0 ? (
            <ConsumerGroups
              state={state}
              lag={lag}
              onJoin={handleConsumerJoin}
              onLeave={handleConsumerLeave}
              onCrash={handleConsumerCrash}
              onScaleOut={handleConsumerScaleOut}
              onRollingRestart={handleConsumerRollingRestart}
            />
          ) : null}
        </div>

        <aside className="hidden flex-col gap-3 sm:flex">
          <EventLog state={state} />
        </aside>
      </div>

      <MobileEventLog state={state} />
    </div>
  );
}
