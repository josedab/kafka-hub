"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { ClusterState } from "@kafka-hub/kafka-sim";

export function TopicTable({ state }: { state: ClusterState }) {
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
