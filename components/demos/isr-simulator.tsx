"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";

type Acks = "0" | "1" | "all";

interface Follower {
  id: number;
  /** Replication lag in milliseconds. */
  lagMs: number;
}

const REPLICATION_TIMEOUT_MS = 10_000; // replica.lag.time.max.ms default

interface Props {
  /** Total replicas including the leader. */
  initialReplicas?: number;
  /** Default min.insync.replicas. */
  initialMinIsr?: number;
}

/**
 * Interactive ISR + acks demo.
 *
 * Lets the reader move each follower's replication lag past the broker's
 * replica.lag.time.max.ms threshold and watch the ISR set shrink. A produce
 * panel evaluates each acks setting against the current ISR.
 */
export function IsrSimulator({
  initialReplicas = 3,
  initialMinIsr = 2,
}: Props = {}) {
  const [followers, setFollowers] = useState<Follower[]>(() =>
    Array.from({ length: Math.max(0, initialReplicas - 1) }, (_, i) => ({
      id: i + 1,
      lagMs: 0,
    })),
  );
  const [minIsr, setMinIsr] = useState(initialMinIsr);
  const [acks, setAcks] = useState<Acks>("all");

  const isr = useMemo(() => {
    // Leader is always in ISR (id=0); followers count if lag ≤ threshold.
    const inSyncFollowers = followers.filter((f) => f.lagMs <= REPLICATION_TIMEOUT_MS);
    return [0, ...inSyncFollowers.map((f) => f.id)];
  }, [followers]);

  const produce = useMemo(() => {
    if (acks === "0")
      return { ok: true, reason: "fire-and-forget — no broker ack required" };
    if (acks === "1")
      return { ok: true, reason: "leader-only ack — followers may lag" };
    if (isr.length >= minIsr)
      return {
        ok: true,
        reason: `ISR=${isr.length} ≥ min.insync.replicas=${minIsr}`,
      };
    return {
      ok: false,
      reason: `NotEnoughReplicasException — ISR=${isr.length} < min.insync.replicas=${minIsr}`,
    };
  }, [acks, isr.length, minIsr]);

  const totalReplicas = followers.length + 1;
  const replicasOptions = [2, 3, 4, 5];

  return (
    <figure
      className="not-prose my-8 overflow-hidden rounded-xl border border-fd-border bg-fd-card"
      aria-label="Interactive ISR and acks simulator"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-fd-border bg-fd-muted/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge tone="info">Interactive</Badge>
          <span className="text-sm font-medium">
            ISR and acks — try producing under different replica health
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-fd-muted-foreground">
          <label className="flex items-center gap-1.5">
            replicas
            <select
              className="rounded-md border border-fd-border bg-fd-background px-2 py-1 text-fd-foreground"
              value={totalReplicas}
              onChange={(e) => {
                const next = Number(e.target.value);
                setFollowers(
                  Array.from({ length: Math.max(0, next - 1) }, (_, i) => ({
                    id: i + 1,
                    lagMs: 0,
                  })),
                );
                setMinIsr((m) => Math.min(m, next));
              }}
            >
              {replicasOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            min.insync.replicas
            <select
              className="rounded-md border border-fd-border bg-fd-background px-2 py-1 text-fd-foreground"
              value={minIsr}
              onChange={(e) => setMinIsr(Number(e.target.value))}
            >
              {Array.from({ length: totalReplicas }, (_, i) => i + 1).map(
                (n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>
      </header>

      <div className="grid gap-6 p-4 sm:grid-cols-[2fr_1fr]">
        <div className="space-y-3">
          <ReplicaRow id={0} label="Leader" inSync lag={0} />
          {followers.map((f) => (
            <FollowerRow
              key={f.id}
              follower={f}
              onChange={(lagMs) =>
                setFollowers((prev) =>
                  prev.map((p) => (p.id === f.id ? { ...p, lagMs } : p)),
                )
              }
            />
          ))}
          <p className="pt-2 font-mono text-[11px] text-fd-muted-foreground">
            ISR = leader + followers with lag ≤ replica.lag.time.max.ms (
            {REPLICATION_TIMEOUT_MS.toLocaleString()} ms)
          </p>
        </div>

        <aside className="flex flex-col gap-3 rounded-lg border border-dashed border-fd-border bg-fd-background p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wider text-fd-muted-foreground">
              ISR
            </span>
            <span className="font-mono text-2xl font-semibold">
              {isr.length}
              <span className="text-fd-muted-foreground">/{totalReplicas}</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {isr.map((id) => (
              <span
                key={id}
                className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-xs text-emerald-700 dark:text-emerald-300"
              >
                {id === 0 ? "leader" : `r${id}`}
              </span>
            ))}
          </div>

          <div className="mt-3">
            <span className="text-xs uppercase tracking-wider text-fd-muted-foreground">
              acks
            </span>
            <div className="mt-1 flex gap-1">
              {(["0", "1", "all"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAcks(a)}
                  className={cn(
                    "flex-1 rounded-md border px-2 py-1 font-mono text-xs transition-colors",
                    acks === a
                      ? "border-fd-foreground bg-fd-foreground text-fd-background"
                      : "border-fd-border text-fd-muted-foreground hover:bg-fd-accent",
                  )}
                  aria-pressed={acks === a}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div
            className={cn(
              "mt-2 rounded-md border p-3 text-xs leading-relaxed",
              produce.ok
                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                : "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
            )}
            role="status"
            aria-live="polite"
          >
            <div className="font-semibold">
              produce() →{" "}
              {produce.ok ? "acknowledged" : "rejected"}
            </div>
            <div className="mt-1 font-mono">{produce.reason}</div>
          </div>
        </aside>
      </div>
    </figure>
  );
}

function ReplicaRow({
  id,
  label,
  inSync,
  lag,
}: {
  id: number;
  label: string;
  inSync: boolean;
  lag: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-fd-border bg-fd-background p-2">
      <span
        aria-hidden
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-md font-mono text-xs font-semibold",
          inSync
            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            : "bg-red-500/15 text-red-700 dark:text-red-300",
        )}
      >
        {id}
      </span>
      <div className="flex flex-1 items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-xs text-fd-muted-foreground">
          lag {lag.toLocaleString()} ms
        </span>
      </div>
    </div>
  );
}

function FollowerRow({
  follower,
  onChange,
}: {
  follower: Follower;
  onChange: (lagMs: number) => void;
}) {
  const inSync = follower.lagMs <= REPLICATION_TIMEOUT_MS;
  return (
    <div className="rounded-md border border-fd-border bg-fd-background p-2">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md font-mono text-xs font-semibold",
            inSync
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : "bg-red-500/15 text-red-700 dark:text-red-300",
          )}
        >
          {follower.id}
        </span>
        <span className="flex-1 text-sm font-medium">Follower {follower.id}</span>
        <span className="font-mono text-xs text-fd-muted-foreground">
          lag {follower.lagMs.toLocaleString()} ms
        </span>
      </div>
      <input
        aria-label={`Follower ${follower.id} lag in ms`}
        type="range"
        min={0}
        max={30_000}
        step={500}
        value={follower.lagMs}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-fd-foreground"
      />
    </div>
  );
}
