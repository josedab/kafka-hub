"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";

type Strategy = "range" | "round-robin" | "sticky" | "cooperative-sticky";

interface ComputeOpts {
  consumers: string[];
  partitions: number[];
  previous?: Record<string, number[]>;
}

function range({ consumers, partitions }: ComputeOpts): Record<string, number[]> {
  const out: Record<string, number[]> = Object.fromEntries(consumers.map((c) => [c, []]));
  if (consumers.length === 0) return out;
  const perConsumer = Math.floor(partitions.length / consumers.length);
  const remainder = partitions.length % consumers.length;
  let cursor = 0;
  consumers.forEach((c, i) => {
    const take = perConsumer + (i < remainder ? 1 : 0);
    out[c] = partitions.slice(cursor, cursor + take);
    cursor += take;
  });
  return out;
}

function roundRobin({ consumers, partitions }: ComputeOpts): Record<string, number[]> {
  const out: Record<string, number[]> = Object.fromEntries(consumers.map((c) => [c, []]));
  if (consumers.length === 0) return out;
  partitions.forEach((p, i) => out[consumers[i % consumers.length]].push(p));
  return out;
}

function sticky({ consumers, partitions, previous }: ComputeOpts): Record<string, number[]> {
  const out: Record<string, number[]> = Object.fromEntries(consumers.map((c) => [c, []]));
  if (consumers.length === 0) return out;
  const assigned = new Set<number>();
  if (previous) {
    for (const c of consumers) {
      const prev = previous[c] ?? [];
      for (const p of prev) {
        if (partitions.includes(p) && !assigned.has(p)) {
          out[c].push(p);
          assigned.add(p);
        }
      }
    }
  }
  // Distribute remaining partitions to least-loaded consumer (deterministic by id).
  const remaining = partitions.filter((p) => !assigned.has(p));
  for (const p of remaining) {
    const next = [...consumers].sort((a, b) => {
      if (out[a].length !== out[b].length) return out[a].length - out[b].length;
      return a.localeCompare(b);
    })[0];
    out[next].push(p);
  }
  // Balance: if any consumer has 2+ more than the min, move tail partitions over.
  let imbalance = true;
  while (imbalance) {
    imbalance = false;
    const counts = consumers.map((c) => out[c].length);
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    if (max - min > 1) {
      const heavy = consumers.find((c) => out[c].length === max);
      const light = consumers.find((c) => out[c].length === min);
      if (heavy && light) {
        const moving = out[heavy].pop();
        if (moving !== undefined) out[light].push(moving);
        imbalance = true;
      }
    }
  }
  for (const c of consumers) out[c].sort((a, b) => a - b);
  return out;
}

function cooperativeSticky(opts: ComputeOpts): Record<string, number[]> {
  return sticky(opts); // identical steady-state assignment; difference is in the rebalance protocol.
}

const STRATEGIES: Record<
  Strategy,
  { label: string; fn: (o: ComputeOpts) => Record<string, number[]>; note: string }
> = {
  range: {
    label: "RangeAssignor",
    fn: range,
    note: "Per-topic, hands consecutive partitions to consumers sorted by id. Imbalanced when partitions don't divide evenly.",
  },
  "round-robin": {
    label: "RoundRobinAssignor",
    fn: roundRobin,
    note: "Across all subscribed topics, distributes one partition at a time. Better balance, no stickiness across rebalances.",
  },
  sticky: {
    label: "StickyAssignor",
    fn: sticky,
    note: "Prefers the previous assignment, then balances. Minimizes partition movement on rebalance — fewer state-store moves.",
  },
  "cooperative-sticky": {
    label: "CooperativeStickyAssignor",
    fn: cooperativeSticky,
    note: "Same final assignment as Sticky, but uses the cooperative rebalance protocol so consumers don't all stop.",
  },
};

export function AssignmentExplorer() {
  const [consumerCount, setConsumerCount] = useState(3);
  const [partitionCount, setPartitionCount] = useState(7);
  const [strategy, setStrategy] = useState<Strategy>("range");

  const previous = useMemo<Record<string, number[]>>(
    () => ({
      "c-1": [0, 1, 2],
      "c-2": [3, 4],
      "c-3": [5, 6],
    }),
    [],
  );

  const consumers = useMemo(
    () => Array.from({ length: consumerCount }, (_, i) => `c-${i + 1}`),
    [consumerCount],
  );
  const partitions = useMemo(
    () => Array.from({ length: partitionCount }, (_, i) => i),
    [partitionCount],
  );

  const assignment = useMemo(
    () => STRATEGIES[strategy].fn({ consumers, partitions, previous }),
    [strategy, consumers, partitions, previous],
  );

  return (
    <figure className="not-prose my-8 overflow-hidden rounded-xl border border-fd-border bg-fd-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-fd-border bg-fd-muted/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge tone="info">Interactive</Badge>
          <span className="text-sm font-medium">Compare partition assignors</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-fd-muted-foreground">
          <label className="flex items-center gap-1.5">
            consumers
            <input
              type="number"
              min={1}
              max={6}
              value={consumerCount}
              onChange={(e) =>
                setConsumerCount(Math.max(1, Math.min(6, Number(e.target.value))))
              }
              className="w-12 rounded-md border border-fd-border bg-fd-background px-2 py-1 text-fd-foreground"
            />
          </label>
          <label className="flex items-center gap-1.5">
            partitions
            <input
              type="number"
              min={1}
              max={16}
              value={partitionCount}
              onChange={(e) =>
                setPartitionCount(Math.max(1, Math.min(16, Number(e.target.value))))
              }
              className="w-14 rounded-md border border-fd-border bg-fd-background px-2 py-1 text-fd-foreground"
            />
          </label>
        </div>
      </header>

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap gap-1">
          {(Object.keys(STRATEGIES) as Strategy[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStrategy(s)}
              className={cn(
                "rounded-md border px-2 py-1 font-mono text-[11px] transition-colors",
                strategy === s
                  ? "border-fd-foreground bg-fd-foreground text-fd-background"
                  : "border-fd-border text-fd-muted-foreground hover:bg-fd-accent",
              )}
              aria-pressed={strategy === s}
            >
              {STRATEGIES[s].label}
            </button>
          ))}
        </div>

        <p className="rounded-md border border-fd-border bg-fd-background p-3 text-sm leading-relaxed text-fd-muted-foreground">
          {STRATEGIES[strategy].note}
        </p>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {consumers.map((c) => (
            <div
              key={c}
              className="rounded-lg border border-fd-border bg-fd-background p-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold">{c}</span>
                <span className="font-mono text-[11px] text-fd-muted-foreground">
                  {assignment[c].length} partition
                  {assignment[c].length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {assignment[c].length === 0 ? (
                  <span className="font-mono text-[11px] text-fd-muted-foreground">
                    idle
                  </span>
                ) : (
                  assignment[c].map((p) => (
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
          ))}
        </div>
      </div>
    </figure>
  );
}
