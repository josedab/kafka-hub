"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const FRAME_MS = 33;
const LAG_LIMIT = 320;
const RESUME_AT = 120;

interface SimState {
  queue: number;
  batch: number;
  gpuLeft: number;
  carry: number;
  produced: number;
  embedded: number;
  held: number;
  windowMs: number;
  requestedWindow: number;
  acceptedWindow: number;
  embeddedWindow: number;
  requestedRate: number;
  acceptedRate: number;
  readyRate: number;
  paused: boolean;
  tick: number;
}

const initialState: SimState = {
  queue: 48,
  batch: 0,
  gpuLeft: 0,
  carry: 0,
  produced: 48,
  embedded: 0,
  held: 0,
  windowMs: 0,
  requestedWindow: 0,
  acceptedWindow: 0,
  embeddedWindow: 0,
  requestedRate: 0,
  acceptedRate: 0,
  readyRate: 0,
  paused: false,
  tick: 0,
};

function perSecond(value: number) {
  return `${Math.round(value).toLocaleString()}/s`;
}

export function EmbeddingBackpressureSim() {
  const [producerRate, setProducerRate] = useState(90);
  const [batchSize, setBatchSize] = useState(16);
  const [gpuTimeMs, setGpuTimeMs] = useState(180);
  const [pauseOnLag, setPauseOnLag] = useState(true);
  const [running, setRunning] = useState(true);
  const [sim, setSim] = useState(initialState);

  const reset = useCallback(() => {
    setSim(initialState);
    setRunning(true);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSim((prev) => {
        if (!running) return prev;

        const lagBefore = prev.queue + prev.batch;
        let paused = pauseOnLag ? prev.paused : false;
        if (pauseOnLag && !paused && lagBefore >= LAG_LIMIT) paused = true;
        if (pauseOnLag && paused && lagBefore <= RESUME_AT) paused = false;

        const requestedFloat = prev.carry + (producerRate * FRAME_MS) / 1000;
        const requested = Math.floor(requestedFloat);
        const accepted = paused ? 0 : requested;
        const carry = requestedFloat - requested;

        let queue = prev.queue + accepted;
        let batch = prev.batch;
        let gpuLeft = Math.max(0, prev.gpuLeft - FRAME_MS);
        let completed = 0;

        if (batch > 0 && gpuLeft <= 0) {
          completed = batch;
          batch = 0;
        }

        if (batch === 0 && queue > 0) {
          batch = Math.min(batchSize, queue);
          queue -= batch;
          gpuLeft = gpuTimeMs;
        }

        const windowMs = prev.windowMs + FRAME_MS;
        let requestedWindow = prev.requestedWindow + requested;
        let acceptedWindow = prev.acceptedWindow + accepted;
        let embeddedWindow = prev.embeddedWindow + completed;
        let requestedRate = prev.requestedRate;
        let acceptedRate = prev.acceptedRate;
        let readyRate = prev.readyRate;

        if (windowMs >= 1000) {
          requestedRate = (requestedWindow * 1000) / windowMs;
          acceptedRate = (acceptedWindow * 1000) / windowMs;
          readyRate = (embeddedWindow * 1000) / windowMs;
          requestedWindow = 0;
          acceptedWindow = 0;
          embeddedWindow = 0;
        }

        return {
          queue,
          batch,
          gpuLeft,
          carry,
          produced: prev.produced + accepted,
          embedded: prev.embedded + completed,
          held: prev.held + requested - accepted,
          windowMs: windowMs >= 1000 ? 0 : windowMs,
          requestedWindow,
          acceptedWindow,
          embeddedWindow,
          requestedRate,
          acceptedRate,
          readyRate,
          paused,
          tick: prev.tick + 1,
        };
      });
    }, FRAME_MS);

    return () => window.clearInterval(id);
  }, [batchSize, gpuTimeMs, pauseOnLag, producerRate, running]);

  const lag = sim.queue + sim.batch;
  const capacity = batchSize / (gpuTimeMs / 1000);
  const gpuProgress = Math.max(0, Math.min(100, ((gpuTimeMs - sim.gpuLeft) / gpuTimeMs) * 100));
  const producerDots = useMemo(() => Array.from({ length: Math.min(24, Math.max(4, Math.round(producerRate / 8))) }), [producerRate]);
  const queueDots = useMemo(() => Array.from({ length: Math.min(36, Math.max(1, Math.ceil(sim.queue / 12))) }), [sim.queue]);
  const batchDots = useMemo(() => Array.from({ length: Math.min(24, sim.batch) }), [sim.batch]);
  const backpressure = lag >= LAG_LIMIT || sim.paused;

  return (
    <figure className="not-prose my-8 overflow-hidden rounded-xl border border-fd-border bg-fd-card" aria-label="Embedding backpressure simulator">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-fd-border bg-fd-muted/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge tone={backpressure ? "warning" : "info"}>Interactive</Badge>
          <span className="text-sm font-medium">Embedding backpressure — producer rate vs GPU batches</span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant={running ? "secondary" : "primary"} onClick={() => setRunning((value) => !value)}>
            {running ? "pause" : "run"}
          </Button>
          <Button size="sm" variant="ghost" onClick={reset}>reset</Button>
        </div>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-3">
          <section className="rounded-lg border border-fd-border bg-fd-background p-3">
            <LaneHeader tone="sky" label="producer lane" topic="embeddings.requests" stat={`requested ${producerRate}/s`} />
            <div className="mt-3 grid min-h-20 grid-cols-[86px_1fr] items-center gap-3">
              <div className="rounded-lg border border-sky-500/25 bg-sky-500/10 p-2 text-center font-mono text-[11px] text-sky-700 dark:text-sky-300">raw text<br />chunks</div>
              <div className="relative overflow-hidden rounded-lg border border-dashed border-fd-border bg-fd-muted/20 p-3">
                <div className="absolute inset-x-3 top-1/2 h-px bg-gradient-to-r from-sky-500/10 via-sky-500/60 to-sky-500/10" />
                <div className="relative flex flex-wrap gap-1.5">
                  {producerDots.map((_, index) => (
                    <span
                      key={index}
                      className={cn("h-3 w-5 rounded-full border border-sky-500/30 bg-sky-500/20 transition-opacity", sim.paused ? "opacity-25" : "opacity-90")}
                      style={{ transform: `translateX(${(sim.tick + index) % 8}px)` }}
                    />
                  ))}
                </div>
                <p className="mt-3 font-mono text-[11px] text-fd-muted-foreground">
                  {sim.paused ? "consumer.pause(): partition intake held while the GPU drains" : `${perSecond(sim.acceptedRate)} accepted into the embedder queue`}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-fd-border bg-fd-background p-3">
            <LaneHeader tone="emerald" label="embedder lane" topic="GPU batch encoder" stat={`capacity ≈ ${perSecond(capacity)}`} />
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_170px_1fr]">
              <Panel color="amber" title="queued lag" stat={`${sim.queue.toLocaleString()} records`} dots={queueDots} square />
              <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 p-3">
                <div className="flex items-center justify-between font-mono text-[11px] text-violet-700 dark:text-violet-300"><span>batch encode</span><span>{sim.batch}/{batchSize}</span></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-fd-muted"><div className="h-full rounded-full bg-violet-500 transition-[width]" style={{ width: `${gpuProgress}%` }} /></div>
                <div className="mt-3 flex min-h-12 flex-wrap content-start gap-1">
                  {batchDots.map((_, index) => <span key={index} className="h-3 w-3 rounded-full border border-violet-500/40 bg-violet-500/30" />)}
                </div>
              </div>
              <div className="rounded-lg border border-dashed border-emerald-500/30 bg-emerald-500/5 p-3">
                <div className="font-mono text-[11px] text-emerald-700 dark:text-emerald-300">ready to upsert</div>
                <div className="mt-3 text-2xl font-semibold tabular-nums">{perSecond(sim.readyRate)}</div>
                <p className="mt-2 text-xs leading-relaxed text-fd-muted-foreground">completed vectors waiting on the vector database sink.</p>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-3 rounded-lg border border-dashed border-fd-border bg-fd-background p-4 text-xs">
          <div className={cn("rounded-lg border p-3", backpressure ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200")} role="status" aria-live="polite">
            <div className="font-mono text-[11px] uppercase tracking-wider">{backpressure ? "backpressure!" : "stable"}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{lag.toLocaleString()}</div>
            <div className="font-mono text-[11px]">records of lag</div>
          </div>
          <Metric label="requested" value={perSecond(sim.requestedRate)} />
          <Metric label="accepted" value={perSecond(sim.acceptedRate)} />
          <Metric label="ready vectors" value={perSecond(sim.readyRate)} />
          <Metric label="held by pause" value={sim.held.toLocaleString()} />
          <Slider label="producer rate" value={`${producerRate} events/sec`} min={1} max={200} current={producerRate} onChange={setProducerRate} />
          <Slider label="embedder batch size" value={`${batchSize} records`} min={1} max={64} current={batchSize} onChange={setBatchSize} />
          <Slider label="per-batch GPU time" value={`${gpuTimeMs}ms`} min={50} max={500} step={10} current={gpuTimeMs} onChange={setGpuTimeMs} />
          <label className="flex items-start gap-2 rounded-md border border-fd-border bg-fd-card p-2">
            <input type="checkbox" checked={pauseOnLag} onChange={(event) => setPauseOnLag(event.target.checked)} className="mt-0.5 accent-fd-foreground" />
            <span><span className="block font-medium">pause partitions on lag threshold</span><span className="block leading-relaxed text-fd-muted-foreground">Resume once lag drains below {RESUME_AT} records.</span></span>
          </label>
        </aside>
      </div>
    </figure>
  );
}

function LaneHeader({ tone, label, topic, stat }: { tone: "sky" | "emerald"; label: string; topic: string; stat: string }) {
  const classes = tone === "sky" ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  return <div className="flex items-center justify-between gap-3 text-xs"><div className="flex items-center gap-2"><span className={cn("rounded-md border px-2 py-0.5 font-mono", classes)}>{label}</span><span className="font-mono text-fd-muted-foreground">{topic}</span></div><span className="font-mono text-fd-muted-foreground">{stat}</span></div>;
}

function Panel({ color, title, stat, dots, square = false }: { color: "amber"; title: string; stat: string; dots: unknown[]; square?: boolean }) {
  return <div className="rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 p-3"><div className="flex items-center justify-between font-mono text-[11px] text-amber-700 dark:text-amber-300"><span>{title}</span><span>{stat}</span></div><div className="mt-3 flex min-h-12 flex-wrap content-start gap-1">{dots.map((_, index) => <span key={`${color}-${index}`} className={cn("h-3 w-3 border border-amber-500/30 bg-amber-500/25", square ? "rounded-sm" : "rounded-full")} />)}</div></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between rounded-md border border-fd-border bg-fd-card px-2 py-1.5"><span className="uppercase tracking-wider text-fd-muted-foreground">{label}</span><span className="font-mono font-semibold">{value}</span></div>;
}

function Slider({ label, value, min, max, step = 1, current, onChange }: { label: string; value: string; min: number; max: number; step?: number; current: number; onChange: (value: number) => void }) {
  return <label className="block space-y-1.5"><span className="flex items-center justify-between text-fd-muted-foreground"><span>{label}</span><span className="font-mono text-fd-foreground">{value}</span></span><input aria-label={label} type="range" min={min} max={max} step={step} value={current} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-fd-foreground" /></label>;
}
