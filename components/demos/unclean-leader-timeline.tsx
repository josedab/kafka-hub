"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Step = {
  label: string;
  detail: string;
  /** brokers[i].alive after this step */
  state: boolean[];
  /** which broker is leader after this step, or null if offline */
  leader: number | null;
  /** ISR set after this step */
  isr: number[];
  /** committed offset visible to consumers */
  committedOffset: number;
  /** whether this step is the unclean election point */
  unclean?: boolean;
  /** lost messages produced by this step (e.g., the unclean election dropping data) */
  lost?: number;
};

const SCENARIO: Step[] = [
  {
    label: "t=0 healthy",
    detail: "RF=3, ISR=[0,1,2]. Producer has written offsets 0–9 with acks=all.",
    state: [true, true, true],
    leader: 0,
    isr: [0, 1, 2],
    committedOffset: 9,
  },
  {
    label: "t=1 broker 2 GCs",
    detail: "Follower 2 stops fetching for 12s. Leader removes it from ISR.",
    state: [true, true, true],
    leader: 0,
    isr: [0, 1],
    committedOffset: 9,
  },
  {
    label: "t=2 produce more",
    detail: "Leader writes offsets 10–14. Replicated only to follower 1.",
    state: [true, true, true],
    leader: 0,
    isr: [0, 1],
    committedOffset: 14,
  },
  {
    label: "t=3 broker 1 dies",
    detail: "Disk fails. Only the leader has offsets 10–14. ISR shrinks to {0}.",
    state: [true, false, true],
    leader: 0,
    isr: [0],
    committedOffset: 14,
  },
  {
    label: "t=4 leader dies",
    detail: "Broker 0 power-cycles. No member of the last ISR is alive. Partition is offline.",
    state: [false, false, true],
    leader: null,
    isr: [],
    committedOffset: 14,
  },
];

const SAFE: Step = {
  label: "t=5 wait for ISR",
  detail:
    "unclean.leader.election.enable=false. Partition stays offline until broker 1 or 0 recovers. No data loss.",
  state: [false, false, true],
  leader: null,
  isr: [],
  committedOffset: 14,
};

const UNCLEAN: Step = {
  label: "t=5 unclean election",
  detail:
    "unclean.leader.election.enable=true. Broker 2 (last alive replica) becomes leader at offset 9. Offsets 10–14 are silently dropped.",
  state: [false, false, true],
  leader: 2,
  isr: [2],
  committedOffset: 9,
  unclean: true,
  lost: 5,
};

interface Props {
  startMode?: "safe" | "unclean";
}

export function UncleanLeaderTimeline({ startMode = "safe" }: Props = {}) {
  const [mode, setMode] = useState<"safe" | "unclean">(startMode);
  const [stepIndex, setStepIndex] = useState(0);

  const steps = useMemo(
    () => [...SCENARIO, mode === "safe" ? SAFE : UNCLEAN],
    [mode],
  );
  const step = steps[stepIndex];

  return (
    <figure className="not-prose my-8 overflow-hidden rounded-xl border border-fd-border bg-fd-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-fd-border bg-fd-muted/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge tone="info">Interactive</Badge>
          <span className="text-sm font-medium">
            Quorum loss — pick a recovery mode and step through
          </span>
        </div>
        <div className="flex gap-1">
          {(["safe", "unclean"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setStepIndex(0);
              }}
              className={cn(
                "rounded-md border px-2 py-1 font-mono text-[11px] transition-colors",
                mode === m
                  ? "border-fd-foreground bg-fd-foreground text-fd-background"
                  : "border-fd-border text-fd-muted-foreground hover:bg-fd-accent",
              )}
              aria-pressed={mode === m}
            >
              {m === "safe" ? "wait for ISR" : "unclean election"}
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-6 p-4 sm:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {step.state.map((alive, i) => {
              const isLeader = step.leader === i;
              const inIsr = step.isr.includes(i);
              return (
                <div
                  key={i}
                  className={cn(
                    "flex flex-col gap-1 rounded-lg border p-3",
                    !alive
                      ? "border-red-500/30 bg-red-500/5"
                      : inIsr
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-amber-500/30 bg-amber-500/5",
                  )}
                >
                  <span className="font-mono text-[11px] text-fd-muted-foreground">
                    broker {i}
                  </span>
                  <span className="text-sm font-semibold">
                    {!alive ? "down" : isLeader ? "leader" : inIsr ? "in ISR" : "out of ISR"}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="rounded-md border border-fd-border bg-fd-background p-3 text-sm">
            <div className="font-mono text-xs text-fd-muted-foreground">{step.label}</div>
            <p className="mt-1 leading-relaxed">{step.detail}</p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              disabled={stepIndex === 0}
            >
              ← prev
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() =>
                setStepIndex((i) => Math.min(steps.length - 1, i + 1))
              }
              disabled={stepIndex === steps.length - 1}
            >
              next →
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStepIndex(0)}
            >
              reset
            </Button>
            <span className="ml-auto font-mono text-xs text-fd-muted-foreground">
              step {stepIndex + 1} / {steps.length}
            </span>
          </div>
        </div>

        <aside className="flex flex-col gap-3 rounded-lg border border-dashed border-fd-border bg-fd-background p-4">
          <div>
            <span className="text-xs uppercase tracking-wider text-fd-muted-foreground">
              committed offset (visible to consumers)
            </span>
            <div className="mt-1 font-mono text-2xl font-semibold">
              {step.committedOffset}
            </div>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider text-fd-muted-foreground">
              ISR
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              {step.isr.length === 0 ? (
                <Badge tone="danger">empty · offline</Badge>
              ) : (
                step.isr.map((id) => (
                  <span
                    key={id}
                    className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-xs text-emerald-700 dark:text-emerald-300"
                  >
                    broker {id}
                  </span>
                ))
              )}
            </div>
          </div>
          {step.unclean ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs leading-relaxed text-red-700 dark:text-red-300">
              <div className="font-semibold">⚠ data loss</div>
              <div className="mt-1 font-mono">
                {step.lost} acked messages silently dropped
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs leading-relaxed text-emerald-700 dark:text-emerald-300">
              <div className="font-semibold">✓ no data loss</div>
              <div className="mt-1">
                Partition unavailable until a healthy ISR member recovers.
              </div>
            </div>
          )}
        </aside>
      </div>
    </figure>
  );
}
