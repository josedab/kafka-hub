"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  advanceRagFreshness,
  createRagFreshnessState,
  deleteRagSource,
  isRagIndexStale,
  ragStaleWindow,
  reembedRagSource,
  setRagEmbedLatency,
  updateRagSource,
} from "@/lib/ai-demo-helpers";
import { cn } from "@/lib/cn";

export function RagFreshnessLab() {
  const [state, setState] = useState(createRagFreshnessState);
  const stale = isRagIndexStale(state);
  const staleWindow = ragStaleWindow(state);
  const snapshots = useMemo(
    () => [
      {
        name: "source / CDC",
        version: state.sourceVersion,
        deleted: state.sourceDeleted,
        model: "source of truth",
      },
      {
        name: "primary index",
        version: state.primary.version,
        deleted: state.primary.deleted,
        model: state.primary.modelVersion,
      },
      ...(state.candidate
        ? [
            {
              name: "candidate index",
              version: state.candidate.version,
              deleted: state.candidate.deleted,
              model: state.candidate.modelVersion,
            },
          ]
        : []),
    ],
    [state],
  );

  return (
    <figure
      className="not-prose my-8 overflow-hidden rounded-xl border border-fd-border bg-fd-card"
      aria-label="Streaming RAG freshness lab"
      data-testid="rag-freshness-lab"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-fd-border bg-fd-muted/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge tone="info">Interactive</Badge>
          <span className="text-sm font-medium">RAG freshness — source, index, tombstones, and backfill</span>
        </div>
        <Badge tone={stale ? "warning" : "success"}>
          {stale ? `stale window ${staleWindow} tick${staleWindow === 1 ? "" : "s"}` : "within index SLA"}
        </Badge>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_250px]">
        <div className="space-y-3">
          <section className="grid gap-3 sm:grid-cols-3">
            {snapshots.map((snapshot) => (
              <div
                key={snapshot.name}
                className={cn(
                  "rounded-lg border p-3",
                  snapshot.deleted
                    ? "border-red-500/40 bg-red-500/5"
                    : "border-fd-border bg-fd-background",
                )}
              >
                <p className="font-mono text-[11px] uppercase tracking-wider text-fd-muted-foreground">
                  {snapshot.name}
                </p>
                <p className="mt-3 text-2xl font-semibold tabular-nums">
                  {snapshot.version === null ? "—" : `v${snapshot.version}`}
                </p>
                <p className="mt-1 font-mono text-[11px] text-fd-muted-foreground">
                  {snapshot.deleted ? "tombstoned" : snapshot.model}
                </p>
              </div>
            ))}
          </section>

          <section className="rounded-lg border border-fd-border bg-fd-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-wider text-fd-muted-foreground">
                  CDC and embedding queue
                </p>
                <p className="mt-1 text-xs text-fd-muted-foreground">
                  tick {state.clock}; a source event is query-stale until its queued work is applied.
                </p>
              </div>
              <span className="font-mono text-xs">{state.pending.length} pending</span>
            </div>
            <ul className="mt-3 space-y-2">
              {state.pending.length === 0 ? (
                <li className="border border-dashed border-fd-border px-3 py-2 font-mono text-xs text-fd-muted-foreground">
                  no queued index work
                </li>
              ) : (
                state.pending.map((work, index) => (
                  <li
                    key={`${work.target}-${work.version}-${index}`}
                    className="flex flex-wrap items-center justify-between gap-2 border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs"
                  >
                    <span>
                      {work.kind} v{work.version} → {work.target}
                    </span>
                    <span className="font-mono text-fd-muted-foreground">
                      ready at {work.readyAt}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </section>

          <div role="status" aria-live="polite" className="rounded-md border border-fd-border bg-fd-background p-3 text-xs leading-relaxed text-fd-muted-foreground">
            {state.event}
          </div>
        </div>

        <aside className="space-y-3 rounded-lg border border-dashed border-fd-border bg-fd-background p-4 text-xs">
          <div className="grid gap-2">
            <Button size="sm" onClick={() => setState(updateRagSource)}>
              CDC update
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setState(deleteRagSource)}>
              CDC delete / tombstone
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setState((current) => reembedRagSource(current))}>
              re-embed to v2
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setState((current) => advanceRagFreshness(current))}>
              advance one tick
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setState(createRagFreshnessState)}>
              reset lab
            </Button>
          </div>

          <label className="block space-y-1.5">
            <span className="flex justify-between text-fd-muted-foreground">
              <span>embed latency</span>
              <span className="font-mono text-fd-foreground">{state.embedLatency} ticks</span>
            </span>
            <input
              aria-label="embed latency"
              type="range"
              min={1}
              max={8}
              value={state.embedLatency}
              onChange={(event) =>
                setState((current) => setRagEmbedLatency(current, Number(event.target.value)))
              }
              className="w-full accent-fd-foreground"
            />
          </label>

          <p className="leading-relaxed text-fd-muted-foreground">
            Model-version backfills should write a candidate/dual index, compare
            retrieval and freshness, then cut traffic deliberately. Tombstones
            need the same ordered path as updates.
          </p>
          <p className="leading-relaxed text-fd-muted-foreground">
            Flink 2.2 offers `ML_PREDICT` and `VECTOR_SEARCH` in Flink; Kafka
            remains the durable event/replay layer around the pipeline.
          </p>
        </aside>
      </div>
    </figure>
  );
}
