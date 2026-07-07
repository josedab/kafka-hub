"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Stage = "ingest" | "embed" | "store";

interface Doc {
  id: number;
  topic: string;
  stage: Stage;
  progress: number; // 0..1 within current stage
  vector?: number[];
}

const TOPICS = ["docs.ingest", "embeddings.requests", "embeddings.results"];

function randVector() {
  return Array.from({ length: 6 }, () => Math.round(Math.random() * 100) / 100);
}

export function RagPipelineSim() {
  const [running, setRunning] = useState(false);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [ingested, setIngested] = useState(0);
  const [stored, setStored] = useState(0);
  const [batchSize, setBatchSize] = useState(4);
  const [embedDelayTicks, setEmbedDelayTicks] = useState(6);
  const tickRef = useRef(0);

  const reset = useCallback(() => {
    setDocs([]);
    setIngested(0);
    setStored(0);
    setRunning(false);
    tickRef.current = 0;
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      tickRef.current += 1;
      const tick = tickRef.current;

      setDocs((prev) => {
        const next = prev.map((d) => ({ ...d }));

        if (tick % 2 === 0) {
          for (let i = 0; i < 2; i++) {
            next.push({
              id: tick * 10 + i,
              topic: TOPICS[0],
              stage: "ingest",
              progress: 0,
            });
            setIngested((n) => n + 1);
          }
        }

        const advancing: Doc[] = [];
        const inBatch: Doc[] = [];
        for (const d of next) {
          if (d.stage === "ingest") {
            d.progress = Math.min(1, d.progress + 0.5);
            if (d.progress >= 1 && inBatch.length < batchSize) {
              d.stage = "embed";
              d.topic = TOPICS[1];
              d.progress = 0;
              inBatch.push(d);
            }
            advancing.push(d);
          } else if (d.stage === "embed") {
            d.progress = Math.min(1, d.progress + 1 / embedDelayTicks);
            if (d.progress >= 1) {
              d.stage = "store";
              d.topic = TOPICS[2];
              d.progress = 0;
              d.vector = randVector();
            }
            advancing.push(d);
          } else if (d.stage === "store") {
            d.progress = Math.min(1, d.progress + 0.5);
            if (d.progress < 1) {
              advancing.push(d);
            } else {
              setStored((n) => n + 1);
            }
          }
        }
        return advancing.slice(-30);
      });
    }, 350);
    return () => window.clearInterval(id);
  }, [running, batchSize, embedDelayTicks]);

  const lag = useMemo(() => Math.max(0, ingested - stored), [ingested, stored]);

  const stageOrder: Stage[] = ["ingest", "embed", "store"];
  const stageColor: Record<Stage, string> = {
    ingest: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    embed:
      "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
    store:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  };
  const stageLabel: Record<Stage, string> = {
    ingest: "ingest worker",
    embed: "embedding worker",
    store: "vector store sink",
  };

  return (
    <figure
      className="not-prose my-8 overflow-hidden rounded-xl border border-fd-border bg-fd-card"
      aria-label="RAG ingestion pipeline simulator"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-fd-border bg-fd-muted/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge tone="info">Interactive</Badge>
          <span className="text-sm font-medium">
            RAG ingestion — producer → embedder → vector sink
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <Button
            size="sm"
            variant={running ? "secondary" : "primary"}
            onClick={() => setRunning((r) => !r)}
          >
            {running ? "pause" : "run"}
          </Button>
          <Button size="sm" variant="ghost" onClick={reset}>
            reset
          </Button>
        </div>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_240px]">
        <div className="space-y-3">
          {stageOrder.map((stage) => {
            const stageDocs = docs.filter((d) => d.stage === stage);
            return (
              <div
                key={stage}
                className="rounded-lg border border-fd-border bg-fd-background p-3"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-md border px-1.5 py-0.5 font-mono",
                        stageColor[stage],
                      )}
                    >
                      {stageLabel[stage]}
                    </span>
                    <span className="font-mono text-fd-muted-foreground">
                      topic: {TOPICS[stageOrder.indexOf(stage)]}
                    </span>
                  </div>
                  <span className="font-mono text-fd-muted-foreground">
                    {stageDocs.length} in flight
                  </span>
                </div>
                <div className="mt-2 flex min-h-[44px] flex-wrap gap-1.5">
                  {stageDocs.length === 0 ? (
                    <span className="font-mono text-[11px] text-fd-muted-foreground">
                      idle
                    </span>
                  ) : (
                    stageDocs.map((d) => (
                      <span
                        key={d.id}
                        className={cn(
                          "h-7 rounded-md border px-2 font-mono text-[10px] leading-7",
                          stageColor[d.stage],
                        )}
                        title={
                          d.vector
                            ? `vec=[${d.vector.join(", ")}]`
                            : `progress ${(d.progress * 100).toFixed(0)}%`
                        }
                      >
                        doc#{d.id}
                      </span>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <aside className="flex flex-col gap-3 rounded-lg border border-dashed border-fd-border bg-fd-background p-4 text-xs">
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="uppercase tracking-wider text-fd-muted-foreground">
                consumer lag
              </span>
              <span className="font-mono text-2xl font-semibold">{lag}</span>
            </div>
            <p className="leading-relaxed text-fd-muted-foreground">
              docs produced upstream that the vector sink hasn&apos;t yet committed.
            </p>
          </div>

          <div className="my-2 border-t border-fd-border" />

          <label className="block space-y-1">
            <span className="text-fd-muted-foreground">
              embedder batch size: <span className="font-mono">{batchSize}</span>
            </span>
            <input
              aria-label="embedder batch size"
              type="range"
              min={1}
              max={10}
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              className="w-full accent-fd-foreground"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-fd-muted-foreground">
              embed latency:{" "}
              <span className="font-mono">{embedDelayTicks * 350}ms</span>
            </span>
            <input
              aria-label="embed latency"
              type="range"
              min={2}
              max={20}
              value={embedDelayTicks}
              onChange={(e) => setEmbedDelayTicks(Number(e.target.value))}
              className="w-full accent-fd-foreground"
            />
          </label>

          <p className="leading-relaxed text-fd-muted-foreground">
            Move embed latency up to feel back-pressure: lag climbs, the embed
            stage saturates, and `docs.ingest` partition lag grows on the
            consumer side.
          </p>
        </aside>
      </div>
    </figure>
  );
}
