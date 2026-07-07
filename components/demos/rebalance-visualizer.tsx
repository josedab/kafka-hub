"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Mode = "eager" | "cooperative";

interface Assignment {
  consumer: string;
  partitions: number[];
}

interface Phase {
  label: string;
  detail: string;
  assignments: Assignment[];
  /** Consumers whose partition processing is paused this phase. */
  paused: string[];
}

const PARTITIONS = [0, 1, 2, 3, 4, 5];

function eager(): Phase[] {
  return [
    {
      label: "1. steady state",
      detail: "Three consumers, six partitions, two each.",
      assignments: [
        { consumer: "c-1", partitions: [0, 1] },
        { consumer: "c-2", partitions: [2, 3] },
        { consumer: "c-3", partitions: [4, 5] },
      ],
      paused: [],
    },
    {
      label: "2. new consumer joins (stop-the-world)",
      detail: "Coordinator triggers rebalance. Every consumer revokes EVERY partition.",
      assignments: [
        { consumer: "c-1", partitions: [] },
        { consumer: "c-2", partitions: [] },
        { consumer: "c-3", partitions: [] },
        { consumer: "c-4", partitions: [] },
      ],
      paused: ["c-1", "c-2", "c-3", "c-4"],
    },
    {
      label: "3. coordinator assigns",
      detail: "Coordinator computes a fresh global assignment.",
      assignments: [
        { consumer: "c-1", partitions: [0, 1] },
        { consumer: "c-2", partitions: [2] },
        { consumer: "c-3", partitions: [3, 4] },
        { consumer: "c-4", partitions: [5] },
      ],
      paused: [],
    },
  ];
}

function cooperative(): Phase[] {
  return [
    {
      label: "1. steady state",
      detail: "Three consumers, six partitions, two each.",
      assignments: [
        { consumer: "c-1", partitions: [0, 1] },
        { consumer: "c-2", partitions: [2, 3] },
        { consumer: "c-3", partitions: [4, 5] },
      ],
      paused: [],
    },
    {
      label: "2. new consumer joins (revoke only what's moving)",
      detail: "Coordinator identifies the partitions that need to move. Existing consumers revoke only those.",
      assignments: [
        { consumer: "c-1", partitions: [0, 1] },
        { consumer: "c-2", partitions: [2] },
        { consumer: "c-3", partitions: [4] },
        { consumer: "c-4", partitions: [] },
      ],
      paused: ["c-2", "c-3"],
    },
    {
      label: "3. reassign delta",
      detail: "Coordinator hands the revoked partitions to c-4 and the previously-stable consumers keep going.",
      assignments: [
        { consumer: "c-1", partitions: [0, 1] },
        { consumer: "c-2", partitions: [2] },
        { consumer: "c-3", partitions: [4] },
        { consumer: "c-4", partitions: [3, 5] },
      ],
      paused: [],
    },
  ];
}

const MODE_LABEL: Record<Mode, string> = {
  eager: "Eager (stop-the-world)",
  cooperative: "Cooperative (incremental)",
};

export function RebalanceVisualizer({ startMode = "eager" }: { startMode?: Mode } = {}) {
  const [mode, setMode] = useState<Mode>(startMode);
  const [phaseIndex, setPhaseIndex] = useState(0);

  const phases = useMemo(() => (mode === "eager" ? eager() : cooperative()), [mode]);
  const phase = phases[phaseIndex];

  const totalPaused = phase.paused.length;
  const total = phase.assignments.length;

  return (
    <figure className="not-prose my-8 overflow-hidden rounded-xl border border-fd-border bg-fd-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-fd-border bg-fd-muted/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge tone="info">Interactive</Badge>
          <span className="text-sm font-medium">
            Rebalance — eager vs cooperative
          </span>
        </div>
        <div className="flex gap-1">
          {(["eager", "cooperative"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setPhaseIndex(0);
              }}
              className={cn(
                "rounded-md border px-2 py-1 font-mono text-[11px] transition-colors",
                mode === m
                  ? "border-fd-foreground bg-fd-foreground text-fd-background"
                  : "border-fd-border text-fd-muted-foreground hover:bg-fd-accent",
              )}
              aria-pressed={mode === m}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-4 p-4">
        <div className="rounded-md border border-fd-border bg-fd-background p-3 text-sm">
          <div className="font-mono text-xs text-fd-muted-foreground">{phase.label}</div>
          <p className="mt-1 leading-relaxed">{phase.detail}</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {phase.assignments.map((a) => {
            const paused = phase.paused.includes(a.consumer);
            return (
              <div
                key={a.consumer}
                className={cn(
                  "rounded-lg border p-3 transition-colors",
                  paused
                    ? "border-amber-500/40 bg-amber-500/5"
                    : a.partitions.length === 0
                      ? "border-fd-border bg-fd-muted/40"
                      : "border-emerald-500/30 bg-emerald-500/5",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold">{a.consumer}</span>
                  {paused ? <Badge tone="warning">paused</Badge> : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {a.partitions.length === 0 ? (
                    <span className="font-mono text-[11px] text-fd-muted-foreground">
                      idle
                    </span>
                  ) : (
                    a.partitions.map((p) => (
                      <span
                        key={p}
                        className="rounded-md border border-fd-border bg-fd-card px-1.5 py-0.5 font-mono text-[10px]"
                      >
                        p{p}
                      </span>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPhaseIndex((i) => Math.max(0, i - 1))}
            disabled={phaseIndex === 0}
          >
            ← prev
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              setPhaseIndex((i) => Math.min(phases.length - 1, i + 1))
            }
            disabled={phaseIndex === phases.length - 1}
          >
            next →
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setPhaseIndex(0)}>
            reset
          </Button>
          <span className="ml-auto font-mono text-xs text-fd-muted-foreground">
            {totalPaused}/{total} consumers paused · partitions covered:{" "}
            {PARTITIONS.filter((p) =>
              phase.assignments.some((a) => a.partitions.includes(p)),
            ).length}
            /{PARTITIONS.length}
          </span>
        </div>
      </div>
    </figure>
  );
}
