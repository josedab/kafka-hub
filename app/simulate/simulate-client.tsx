"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleQuestionMark,
  Pause,
  Play,
  Power,
  RotateCcw,
  SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import {
  totalLag,
  type ClusterState,
  SCENARIO_LIST,
  SCENARIOS,
} from "@kafka-hub/kafka-sim";
import { KeyboardShortcutsDialog } from "./keyboard-shortcuts-dialog";
import { ScenarioScriptDrawer } from "./scenario-script-drawer";
import { useSimulator } from "./use-simulator";

interface Props {
  /** If set, scenario picker is hidden and the embed mode is used (no chrome). */
  fixedScenario?: string;
  /** When true, hide outer headers + heavy chrome (used in embed route). */
  embed?: boolean;
}

function isShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return ["INPUT", "TEXTAREA", "BUTTON", "SELECT"].includes(target.tagName);
}

export function SimulateClient({ fixedScenario, embed = false }: Props) {
  const initialSlug = fixedScenario ?? SCENARIO_LIST[0].slug;
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
    },
    [sim],
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
            <ConsumerGroups state={state} lag={lag} />
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

function ScenarioPicker({
  active,
  onChange,
}: {
  active: string;
  onChange: (slug: string) => void;
}) {
  return (
    <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {SCENARIO_LIST.map((s) => (
        <button
          key={s.slug}
          type="button"
          onClick={() => onChange(s.slug)}
          aria-pressed={active === s.slug}
          className={cn(
            "min-w-0 rounded-xl border p-3 text-left transition-colors",
            active === s.slug
              ? "border-fd-foreground bg-fd-foreground/5"
              : "border-fd-border bg-fd-card hover:border-fd-foreground/30",
          )}
        >
          <div className="font-mono text-[10px] uppercase tracking-wider text-fd-muted-foreground">
            {s.slug}
          </div>
          <div className="mt-1 text-sm font-semibold leading-snug">
            {s.title}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-fd-muted-foreground">
            {s.blurb}
          </p>
        </button>
      ))}
    </div>
  );
}

function ScenarioControls({
  scenario,
  opIndex,
  playing,
  workerActive,
  onPlayToggle,
  onStep,
  onReset,
  onTick,
  onProduce,
  onOpenShortcuts,
}: {
  scenario: { script: { kind: string; note?: string }[] };
  opIndex: number;
  playing: boolean;
  workerActive: boolean;
  onPlayToggle: () => void;
  onStep: () => void;
  onReset: () => void;
  onTick: () => void;
  onProduce: () => void;
  onOpenShortcuts: () => void;
}) {
  const op = scenario.script[opIndex];
  const done = opIndex >= scenario.script.length;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-fd-border bg-fd-card p-3">
      <Button variant="primary" size="sm" onClick={onPlayToggle} disabled={done}>
        {playing ? (
          <Pause className="size-3.5" aria-hidden />
        ) : (
          <Play className="size-3.5" aria-hidden />
        )}
        {playing ? "pause" : done ? "done" : "play"}
      </Button>
      <Button variant="secondary" size="sm" onClick={onStep} disabled={done}>
        <SkipForward className="size-3.5" aria-hidden /> next op
      </Button>
      <Button variant="ghost" size="sm" onClick={onTick}>
        +1 tick
      </Button>
      <Button variant="ghost" size="sm" onClick={onProduce}>
        produce
      </Button>
      <Button variant="ghost" size="sm" onClick={onReset}>
        <RotateCcw className="size-3.5" aria-hidden /> reset
      </Button>
      <Button
        aria-label="Open keyboard shortcuts"
        className="px-2"
        variant="ghost"
        size="sm"
        onClick={onOpenShortcuts}
      >
        <CircleQuestionMark className="size-3.5" aria-hidden />
        <span className="sr-only">Keyboard shortcuts</span>
      </Button>

      <div className="flex min-w-0 basis-full items-center gap-3 font-mono text-[11px] text-fd-muted-foreground sm:ml-auto sm:basis-auto">
        <Badge
          className="shrink-0 max-[420px]:hidden"
          tone={workerActive ? "success" : "neutral"}
          title={
            workerActive
              ? "Engine running in a Web Worker — main thread stays free."
              : "Engine running synchronously on the main thread."
          }
        >
          {workerActive ? "worker" : "sync"}
        </Badge>
        <span className="shrink-0">
          op {Math.min(opIndex + 1, scenario.script.length)}/{scenario.script.length}
        </span>
        {op?.note ? <span className="min-w-0 truncate">· {op.note}</span> : null}
      </div>
    </div>
  );
}

function BrokerGrid({
  state,
  netPartition,
  onToggle,
  onHoverBroker,
}: {
  state: ClusterState;
  netPartition: ClusterState["netPartition"];
  onToggle: (id: number) => void;
  onHoverBroker: (id: number | null) => void;
}) {
  return (
    <div>
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Brokers
        </h2>
        {netPartition ? (
          <Badge tone="warning">
            partitioned: {`{${netPartition.groupA.join(",")}}`} ⫽{" "}
            {`{${netPartition.groupB.join(",")}}`}
          </Badge>
        ) : null}
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        {state.brokers.map((b) => {
          const side = netPartition
            ? netPartition.groupA.includes(b.id)
              ? "A"
              : netPartition.groupB.includes(b.id)
                ? "B"
                : null
            : null;
          return (
            <button
              type="button"
              key={b.id}
              onClick={() => onToggle(b.id)}
              onMouseEnter={() => onHoverBroker(b.id)}
              onMouseLeave={() => onHoverBroker(null)}
              className={cn(
                "group flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors",
                b.alive
                  ? "border-fd-border bg-fd-card hover:border-fd-foreground/30"
                  : "border-red-500/30 bg-red-500/5",
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span className="font-mono text-xs text-fd-muted-foreground">
                  broker {b.id}
                  {side ? ` · side ${side}` : ""}
                </span>
                <Power
                  className={cn(
                    "size-4 transition-colors",
                    b.alive ? "text-emerald-500" : "text-red-500",
                  )}
                  aria-hidden
                />
              </div>
              <span className="text-sm font-semibold">
                {b.alive ? "online" : "down"}
              </span>
              <span className="text-xs text-fd-muted-foreground">
                click to {b.alive ? "kill" : "revive"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TopicTable({ state }: { state: ClusterState }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-fd-border bg-fd-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-fd-border px-4 py-2 text-xs text-fd-muted-foreground">
        <span className="font-mono">topic = {state.topic.name}</span>
        <span className="font-mono">
          RF={state.topic.replicationFactor} · min.isr=
          {state.topic.minInsyncReplicas} · acks={state.producerAcks}
        </span>
      </header>
      <ul className="divide-y divide-fd-border">
        {state.topic.partitions.map((p) => {
          const leader = p.isr[0];
          const offline = p.isr.length === 0;
          const leaderLog = leader !== undefined ? p.logs[leader] : [];
          return (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
            >
              <span className="font-mono text-xs text-fd-muted-foreground">
                partition {p.id}
              </span>
              {offline ? (
                <Badge tone="danger">offline · no ISR</Badge>
              ) : (
                <Badge tone="success">leader · broker {leader}</Badge>
              )}
              <span className="font-mono text-[11px] text-fd-muted-foreground">
                end={leaderLog.length} · HW={p.hw}
              </span>
              <div className="ml-auto flex flex-wrap justify-end gap-1.5">
                {p.replicas.map((r) => (
                  <span
                    key={r}
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 font-mono text-[10px]",
                      p.isr.includes(r)
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
                    )}
                  >
                    r{r}
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ConsumerGroups({
  state,
  lag,
}: {
  state: ClusterState;
  lag: number;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-fd-border bg-fd-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-fd-border px-4 py-2 text-xs text-fd-muted-foreground">
        <span className="font-mono">consumer groups</span>
        <span className="font-mono">total lag = {lag}</span>
      </header>
      <ul className="divide-y divide-fd-border">
        {state.groups.map((g) => (
          <li key={g.id} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-mono text-sm font-semibold">{g.id}</span>
              <span className="font-mono text-xs text-fd-muted-foreground">
                {g.protocol} · {g.consumeRatePerTick}rec/tick
              </span>
            </div>
            <ul className="mt-2 space-y-1.5">
              {g.members.map((m) => {
                const memberLag = m.assigned.reduce((acc, pId) => {
                  const p = state.topic.partitions.find((x) => x.id === pId);
                  if (!p) return acc;
                  return acc + Math.max(0, p.hw - (m.committed[pId] ?? 0));
                }, 0);
                return (
                  <li
                    key={m.id}
                    className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-fd-border bg-fd-background px-3 py-1.5 text-xs"
                  >
                    <span className="min-w-0 break-words font-mono">
                      {m.id} → [{m.assigned.join(",")}]
                    </span>
                    <span className="font-mono text-fd-muted-foreground">
                      lag {memberLag}
                    </span>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EventLog({ state }: { state: ClusterState }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Event log
        </h2>
        <span className="font-mono text-xs text-fd-muted-foreground">
          tick {state.tick}
        </span>
      </header>
      <EventLogContent state={state} />
    </div>
  );
}

function MobileEventLog({ state }: { state: ClusterState }) {
  return (
    <details className="overflow-hidden rounded-xl border border-fd-border bg-fd-card sm:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Event log
        </span>
        <span className="font-mono text-xs text-fd-muted-foreground">
          tick {state.tick}
        </span>
      </summary>
      <div className="border-t border-fd-border p-3">
        <EventLogContent
          state={state}
          className="max-h-[320px] rounded-lg border-0 bg-fd-background p-3"
        />
      </div>
    </details>
  );
}

function EventLogContent({
  state,
  className,
}: {
  state: ClusterState;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "max-h-[520px] min-w-0 overflow-y-auto rounded-xl border border-fd-border bg-fd-card p-4 font-mono text-xs",
        className,
      )}
    >
      {state.events.length === 0 ? (
        <p className="text-fd-muted-foreground">no events yet</p>
      ) : (
        <ul className="space-y-1">
          {state.events
            .slice()
            .reverse()
            .map((e, i) => (
              <li
                key={i}
                className={cn(
                  "flex min-w-0 gap-3",
                  e.level === "warn" && "text-amber-700 dark:text-amber-300",
                  e.level === "error" && "text-red-700 dark:text-red-300",
                )}
              >
                <span className="w-10 shrink-0 text-fd-muted-foreground">
                  t{e.tick}
                </span>
                <span className="min-w-0 break-words">{e.message}</span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
