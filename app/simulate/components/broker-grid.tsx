"use client";

import { Power } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { ClusterState } from "@kafka-hub/kafka-sim";

export function BrokerGrid({
  state,
  netPartition,
  onToggle,
  onHoverBroker,
}: {
  state: ClusterState;
  netPartition: ClusterState["netPartition"];
  onToggle: (id: number) => void;
  onHoverBroker: (id: number | null) => void;
}) {
  return (
    <div>
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Brokers
        </h2>
        {netPartition ? (
          <Badge tone="warning">
            partitioned: {`{${netPartition.groupA.join(",")}}`} |{" "}
            {`{${netPartition.groupB.join(",")}}`}
          </Badge>
        ) : null}
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        {state.brokers.map((b) => {
          const side = netPartition
            ? netPartition.groupA.includes(b.id)
              ? "A"
              : netPartition.groupB.includes(b.id)
                ? "B"
                : null
            : null;
          return (
            <button
              type="button"
              key={b.id}
              onClick={() => onToggle(b.id)}
              onMouseEnter={() => onHoverBroker(b.id)}
              onMouseLeave={() => onHoverBroker(null)}
              className={cn(
                "group flex min-h-[44px] flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors",
                b.alive
                  ? "border-fd-border bg-fd-card hover:border-fd-foreground/30"
                  : "border-red-500/30 bg-red-500/5",
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span className="font-mono text-xs text-fd-muted-foreground">
                  broker {b.id}
                  {side ? ` · side ${side}` : ""}
                </span>
                <Power
                  className={cn(
                    "size-4 transition-colors",
                    b.alive ? "text-emerald-500" : "text-red-500",
                  )}
                  aria-hidden
                />
              </div>
              <span className="text-sm font-semibold">
                {b.alive ? "online" : "down"}
              </span>
              <span className="text-xs text-fd-muted-foreground">
                click to {b.alive ? "kill" : "revive"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
