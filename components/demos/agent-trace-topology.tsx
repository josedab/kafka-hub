"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type TopicKey = "agent-events" | "agent-state" | "eval-pipeline" | "debug-replay";
type EventKind = "tool_call" | "observation" | "thought" | "final";
type PathKey = "runtime-events" | "events-state" | "events-eval" | "events-debug";

interface TopicConfig {
  title: string;
  subtitle: string;
  rf: number;
  retention: string;
  cleanup: string;
  note: string;
}

interface Pulse {
  id: string;
  kind: EventKind;
  path: PathKey;
  delay: number;
  runId: string;
}

const TOPICS: Record<TopicKey, TopicConfig> = {
  "agent-events": {
    title: "agent-events",
    subtitle: "key = agent_run_id",
    rf: 3,
    retention: "7d ops / 90d eval",
    cleanup: "delete",
    note: "Append-only trace log. One run stays ordered because every event shares the same key.",
  },
  "agent-state": {
    title: "agent-state",
    subtitle: "latest state per run",
    rf: 3,
    retention: "forever",
    cleanup: "compact",
    note: "Materialized view for dashboards asking what each agent is doing right now.",
  },
  "eval-pipeline": {
    title: "eval-pipeline",
    subtitle: "score final outcomes",
    rf: 3,
    retention: "30d",
    cleanup: "delete",
    note: "Fan-out consumer that grades final answers, tool errors, and human review signals.",
  },
  "debug-replay": {
    title: "debug-replay",
    subtitle: "incident replay",
    rf: 3,
    retention: "180d",
    cleanup: "delete",
    note: "Long-retention copy for reconstructing runs during postmortems.",
  },
};

const KIND_FILL: Record<EventKind, string> = { tool_call: "#38bdf8", observation: "#34d399", thought: "#a78bfa", final: "#f59e0b" };
const EVENT_SEQUENCE: EventKind[] = ["tool_call", "observation", "thought", "final"];

export function AgentTraceTopology() {
  const [selectedTopic, setSelectedTopic] = useState<TopicKey>("agent-events");
  const [compactionOn, setCompactionOn] = useState(true);
  const [runNumber, setRunNumber] = useState(0);
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const selected = TOPICS[selectedTopic];

  function runAgent() {
    const nextRun = runNumber + 1;
    const runId = `run-${String(nextRun).padStart(3, "0")}`;
    const nextPulses = EVENT_SEQUENCE.flatMap((kind, index) => {
      const delay = index * 0.18;
      return [
        { id: `${runId}-${kind}-ingress`, kind, path: "runtime-events", delay, runId },
        { id: `${runId}-${kind}-state`, kind, path: "events-state", delay: delay + 0.75, runId },
        { id: `${runId}-${kind}-eval`, kind, path: "events-eval", delay: delay + 0.88, runId },
        { id: `${runId}-${kind}-debug`, kind, path: "events-debug", delay: delay + 1.01, runId },
      ] satisfies Pulse[];
    });
    setRunNumber(nextRun);
    setSelectedTopic("agent-events");
    setPulses((previous) => [...previous.slice(-32), ...nextPulses]);
  }

  return (
    <figure className="not-prose my-8 overflow-hidden rounded-xl border border-fd-border bg-fd-card" aria-label="Agent trace Kafka topology">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-fd-border bg-fd-muted/40 px-4 py-3">
        <div className="flex items-center gap-2"><Badge tone="info">Interactive</Badge><span className="text-sm font-medium">Agent traces — ordered events, compacted state, replay fan-out</span></div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-md border border-fd-border bg-fd-background px-2 py-1 text-xs text-fd-muted-foreground"><input type="checkbox" checked={compactionOn} onChange={(event) => setCompactionOn(event.target.checked)} className="accent-fd-foreground" />compaction {compactionOn ? "on" : "off"}</label>
          <Button size="sm" onClick={runAgent}>Run an agent</Button>
        </div>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_270px]">
        <div className="overflow-hidden rounded-lg border border-fd-border bg-fd-background">
          <svg viewBox="0 0 720 310" role="img" className="h-full min-h-[330px] w-full">
            <title>Agent runtime publishing trace events to Kafka topics</title>
            <defs>
              <path id="runtime-events" d="M150 138 C185 138 194 138 230 138" />
              <path id="events-state" d="M390 138 C440 138 438 70 500 70" />
              <path id="events-eval" d="M390 138 C430 138 455 154 500 154" />
              <path id="events-debug" d="M390 138 C440 138 438 238 500 238" />
              <filter id="dotGlow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>
            <rect x="12" y="16" width="696" height="278" rx="18" className="fill-fd-muted/30" />
            {(["runtime-events", "events-state", "events-eval", "events-debug"] as PathKey[]).map((id) => <use key={id} href={`#${id}`} fill="none" stroke="currentColor" strokeDasharray="6 8" strokeWidth="2" className="text-fd-muted-foreground/60" />)}
            <RuntimeNode />
            <TopicNode id="agent-events" x={230} y={106} width={160} height={64} selected={selectedTopic === "agent-events"} onSelect={setSelectedTopic} />
            <TopicNode id="agent-state" x={500} y={42} width={166} height={56} selected={selectedTopic === "agent-state"} onSelect={setSelectedTopic} />
            <TopicNode id="eval-pipeline" x={500} y={126} width={166} height={56} selected={selectedTopic === "eval-pipeline"} onSelect={setSelectedTopic} />
            <TopicNode id="debug-replay" x={500} y={210} width={166} height={56} selected={selectedTopic === "debug-replay"} onSelect={setSelectedTopic} />
            {compactionOn ? <CompactionLens runNumber={runNumber} /> : <UncompactedTrail />}
            {pulses.map((pulse) => (
              <circle key={pulse.id} r="5" fill={KIND_FILL[pulse.kind]} filter="url(#dotGlow)" opacity="0">
                <title>{`${pulse.runId} ${pulse.kind}`}</title>
                <animate attributeName="opacity" values="0;1;1;0" dur="1.35s" begin={`${pulse.delay}s`} fill="freeze" />
                <animateMotion dur="1.35s" begin={`${pulse.delay}s`} fill="freeze"><mpath href={`#${pulse.path}`} /></animateMotion>
              </circle>
            ))}
          </svg>
        </div>

        <aside className="space-y-3 rounded-lg border border-dashed border-fd-border bg-fd-background p-4 text-xs">
          <div><div className="font-mono text-[11px] uppercase tracking-wider text-fd-muted-foreground">selected topic</div><h3 className="mt-1 font-mono text-lg font-semibold">{selected.title}</h3><p className="leading-relaxed text-fd-muted-foreground">{selected.note}</p></div>
          <dl className="grid grid-cols-2 gap-2"><Config label="RF" value={String(selected.rf)} /><Config label="retention" value={selected.retention} /><Config label="cleanup.policy" value={selected.cleanup} wide /></dl>
          <div className="rounded-md border border-fd-border bg-fd-card p-3"><div className="font-mono text-[11px] uppercase tracking-wider text-fd-muted-foreground">event schema</div><pre className="mt-2 overflow-x-auto text-[11px] leading-relaxed"><code>{`{\n  "agent_run_id": "run-${String(Math.max(runNumber, 1)).padStart(3, "0")}",\n  "kind": "${runNumber % 2 === 0 ? "tool_call" : "final"}",\n  "seq": ${Math.max(runNumber * 4, 1)},\n  "payload": { "...": "..." }\n}`}</code></pre></div>
          <div className="rounded-md border border-fd-border bg-fd-card p-3">
            <div className="flex items-center justify-between"><span className="font-mono text-[11px] uppercase tracking-wider text-fd-muted-foreground">current run</span><span className="font-mono font-semibold">{runNumber === 0 ? "idle" : `run-${String(runNumber).padStart(3, "0")}`}</span></div>
            <div className="mt-2 flex flex-wrap gap-1">{EVENT_SEQUENCE.map((kind) => <span key={kind} className="rounded-full border border-fd-border bg-fd-background px-2 py-0.5 font-mono text-[10px]" style={{ color: KIND_FILL[kind] }}>{kind}</span>)}</div>
          </div>
        </aside>
      </div>
    </figure>
  );
}

function RuntimeNode() {
  return (
    <g>
      <rect
        x="28"
        y="104"
        width="122"
        height="68"
        rx="14"
        className="fill-fd-card stroke-fd-border"
      />
      <text
        x="89"
        y="132"
        textAnchor="middle"
        className="fill-fd-foreground text-[13px] font-semibold"
      >
        Agent runtime
      </text>
      <text
        x="89"
        y="153"
        textAnchor="middle"
        className="fill-fd-muted-foreground text-[11px]"
      >
        loop + tools
      </text>
      <circle cx="42" cy="118" r="4" fill="#38bdf8" />
      <circle cx="54" cy="118" r="4" fill="#34d399" />
      <circle cx="66" cy="118" r="4" fill="#a78bfa" />
    </g>
  );
}

function TopicNode({ id, x, y, width, height, selected, onSelect }: { id: TopicKey; x: number; y: number; width: number; height: number; selected: boolean; onSelect: (id: TopicKey) => void }) {
  const topic = TOPICS[id];
  return (
    <g role="button" tabIndex={0} aria-label={`Show ${topic.title} topic config`} onClick={() => onSelect(id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(id); } }} className="cursor-pointer outline-none">
      <rect x={x} y={y} width={width} height={height} rx="14" className={cn("fill-fd-card transition-colors", selected ? "stroke-sky-500" : "stroke-fd-border")} strokeWidth={selected ? 2.5 : 1.5} />
      <text x={x + width / 2} y={y + 24} textAnchor="middle" className="fill-fd-foreground text-[13px] font-semibold">{topic.title}</text>
      <text x={x + width / 2} y={y + 43} textAnchor="middle" className="fill-fd-muted-foreground text-[10px]">{topic.subtitle}</text>
      {id === "agent-events" ? <g className="fill-sky-500/60"><rect x={x + 16} y={y + 50} width="28" height="4" rx="2" /><rect x={x + 50} y={y + 50} width="28" height="4" rx="2" /><rect x={x + 84} y={y + 50} width="28" height="4" rx="2" /></g> : null}
    </g>
  );
}

function CompactionLens({ runNumber }: { runNumber: number }) {
  const label = runNumber === 0 ? "latest state" : `run-${String(runNumber).padStart(3, "0")} final`;
  return <g><rect x="510" y="102" width="145" height="18" rx="9" className="fill-emerald-500/10 stroke-emerald-500/30" /><text x="582" y="115" textAnchor="middle" className="fill-emerald-700 text-[10px] dark:fill-emerald-300">compacted → {label}</text><path d="M515 91 L648 91" stroke="#34d399" strokeWidth="3" strokeLinecap="round" opacity="0.35" /><path d="M530 91 L575 91" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" opacity="0.45" /><text x="552" y="86" textAnchor="middle" className="fill-fd-muted-foreground text-[9px]">tombstones collapse old keys</text></g>;
}

function UncompactedTrail() {
  return <g>{[0, 1, 2, 3].map((index) => <rect key={index} x={518 + index * 30} y="102" width="20" height="16" rx="4" className="fill-amber-500/15 stroke-amber-500/30" />)}<text x="582" y="133" textAnchor="middle" className="fill-amber-700 text-[10px] dark:fill-amber-300">compaction off: every state revision remains</text></g>;
}

function Config({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={cn("rounded-md border border-fd-border bg-fd-card p-2", wide && "col-span-2")}>
      <dt className="font-mono text-[10px] uppercase tracking-wider text-fd-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-mono font-semibold">{value}</dd>
    </div>
  );
}
