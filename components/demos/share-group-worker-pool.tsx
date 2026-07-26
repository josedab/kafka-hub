"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  acknowledgeShareRecord,
  acquireShareRecord,
  advanceShareTime,
  createSharePoolState,
  processShareRecord,
  rejectShareRecord,
  releaseShareRecord,
  type ShareRecordState,
} from "@/lib/ai-demo-helpers";
import { cn } from "@/lib/cn";

const stateTone: Record<ShareRecordState, "neutral" | "warning" | "success" | "danger"> = {
  available: "neutral",
  locked: "warning",
  acked: "success",
  rejected: "danger",
};

export function ShareGroupWorkerPool() {
  const [pool, setPool] = useState(createSharePoolState);
  const [workerCount, setWorkerCount] = useState(5);
  const [selectedWorker, setSelectedWorker] = useState("worker-1");
  const workers = useMemo(
    () => Array.from({ length: workerCount }, (_, index) => `worker-${index + 1}`),
    [workerCount],
  );
  const held = pool.records.find(
    (record) => record.state === "locked" && record.lockedBy === selectedWorker,
  );
  const counts = {
    available: pool.records.filter((record) => record.state === "available").length,
    locked: pool.records.filter((record) => record.state === "locked").length,
    acked: pool.records.filter((record) => record.state === "acked").length,
    rejected: pool.records.filter((record) => record.state === "rejected").length,
  };

  function setWorkers(value: number) {
    const next = Math.max(1, Math.min(8, value));
    setWorkerCount(next);
    if (Number(selectedWorker.slice("worker-".length)) > next) {
      setSelectedWorker("worker-1");
    }
  }

  return (
    <figure
      className="not-prose my-8 overflow-hidden rounded-xl border border-fd-border bg-fd-card"
      aria-label="Share group worker pool simulator"
      data-testid="share-group-worker-pool"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-fd-border bg-fd-muted/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge tone="info">Interactive</Badge>
          <span className="text-sm font-medium">Share group worker pool — per-record leases</span>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setPool(createSharePoolState())}>
          reset lab
        </Button>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_250px]">
        <div className="space-y-3">
          <section className="rounded-lg border border-fd-border bg-fd-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-wider text-fd-muted-foreground">
                  worker pool / 3 partitions
                </p>
                <p className="mt-1 text-sm">
                  {workerCount > 3
                    ? `${workerCount} workers can be useful even though there are only 3 partitions.`
                    : "Raise worker count above the partition count to test cooperative record sharing."}
                </p>
              </div>
              <span className="font-mono text-xs text-fd-muted-foreground">clock {pool.now}s</span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {workers.map((worker) => {
                const workerRecord = pool.records.find(
                  (record) => record.state === "locked" && record.lockedBy === worker,
                );
                return (
                  <button
                    key={worker}
                    type="button"
                    onClick={() => setSelectedWorker(worker)}
                    className={cn(
                      "flex min-h-11 items-center justify-between rounded-md border px-3 py-2 text-left font-mono text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring",
                      selectedWorker === worker
                        ? "border-amber-500/60 bg-amber-500/10"
                        : "border-fd-border hover:bg-fd-accent",
                    )}
                    aria-pressed={selectedWorker === worker}
                  >
                    <span>{worker}</span>
                    <span className="text-fd-muted-foreground">
                      {workerRecord ? workerRecord.id : "idle"}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-fd-border bg-fd-background">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-fd-border px-3 py-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-fd-muted-foreground">
                share records
              </span>
              <span className="font-mono text-[11px] text-fd-muted-foreground">
                lock duration {pool.lockDuration}s
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead className="border-b border-fd-border font-mono text-[11px] uppercase tracking-wider text-fd-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">record</th>
                    <th className="px-3 py-2 font-medium">partition</th>
                    <th className="px-3 py-2 font-medium">delivery</th>
                    <th className="px-3 py-2 font-medium">lease</th>
                    <th className="px-3 py-2 font-medium">state</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-fd-border">
                  {pool.records.map((record) => (
                    <tr key={record.id}>
                      <td className="px-3 py-2 font-mono">
                        {record.id}
                        {record.poison ? (
                          <span className="ml-2 text-amber-700 dark:text-amber-300">poison candidate</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 font-mono">p{record.partition}</td>
                      <td className="px-3 py-2 font-mono">{record.deliveryCount}</td>
                      <td className="px-3 py-2 font-mono text-fd-muted-foreground">
                        {record.lockedBy
                          ? `${record.lockedBy} → ${record.lockExpiresAt}s`
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={stateTone[record.state]}>{record.state}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="space-y-3 rounded-lg border border-dashed border-fd-border bg-fd-background p-4 text-xs">
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="font-mono text-[11px] uppercase tracking-wider text-amber-800 dark:text-amber-200">
              selected worker
            </p>
            <p className="mt-1 text-lg font-semibold">{selectedWorker}</p>
            <p className="mt-1 leading-relaxed text-fd-muted-foreground">
              {held
                ? `Holds ${held.id}; delivery attempt ${held.deliveryCount}.`
                : "No active acquisition lock."}
            </p>
          </div>

          <label className="block space-y-1.5">
            <span className="flex justify-between text-fd-muted-foreground">
              <span>worker count</span>
              <span className="font-mono text-fd-foreground">{workerCount}</span>
            </span>
            <input
              aria-label="worker count"
              className="w-full accent-fd-foreground"
              type="range"
              min={1}
              max={8}
              value={workerCount}
              onChange={(event) => setWorkers(Number(event.target.value))}
            />
          </label>

          <Button
            className="w-full"
            size="sm"
            onClick={() =>
              setPool((current) =>
                acquireShareRecord(current, selectedWorker),
              )
            }
          >
            acquire next
          </Button>
          <Button
            className="w-full"
            size="sm"
            variant="secondary"
            onClick={() =>
              setPool((current) =>
                processShareRecord(current, selectedWorker),
              )
            }
          >
            process record
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="secondary" onClick={() => setPool((current) => acknowledgeShareRecord(current, selectedWorker))}>
              ack lock
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setPool((current) => releaseShareRecord(current, selectedWorker))}>
              release lock
            </Button>
            <Button
              className="col-span-2"
              size="sm"
              variant="secondary"
              onClick={() =>
                setPool((current) =>
                  rejectShareRecord(current, selectedWorker),
                )
              }
            >
              reject work
            </Button>
          </div>
          <Button
            className="w-full"
            size="sm"
            variant="ghost"
            onClick={() => setPool((current) => advanceShareTime(current))}
          >
            expire all leases
          </Button>

          <div role="status" aria-live="polite" className="rounded-md border border-fd-border bg-fd-card p-2.5 leading-relaxed text-fd-muted-foreground">
            {pool.event}
          </div>

          <dl className="grid grid-cols-2 gap-x-2 gap-y-1.5 font-mono text-[11px]">
            {Object.entries(counts).map(([state, count]) => (
              <div key={state} className="flex justify-between gap-2">
                <dt className="text-fd-muted-foreground">{state}</dt>
                <dd>{count}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
    </figure>
  );
}
