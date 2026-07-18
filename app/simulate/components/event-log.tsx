"use client";

import { cn } from "@/lib/cn";
import type { ClusterState } from "@kafka-hub/kafka-sim";

export function EventLog({ state }: { state: ClusterState }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Event log
        </h2>
        <span className="font-mono text-xs text-fd-muted-foreground">
          tick {state.tick}
        </span>
      </header>
      <EventLogContent state={state} />
    </div>
  );
}

export function MobileEventLog({ state }: { state: ClusterState }) {
  return (
    <details className="overflow-hidden rounded-xl border border-fd-border bg-fd-card sm:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Event log
        </span>
        <span className="font-mono text-xs text-fd-muted-foreground">
          tick {state.tick}
        </span>
      </summary>
      <div className="border-t border-fd-border p-3">
        <EventLogContent
          state={state}
          className="max-h-[320px] rounded-lg border-0 bg-fd-background p-3"
        />
      </div>
    </details>
  );
}

function EventLogContent({
  state,
  className,
}: {
  state: ClusterState;
  className?: string;
}) {
  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Simulator event log"
      className={cn(
        "max-h-[520px] min-w-0 overflow-y-auto rounded-xl border border-fd-border bg-fd-card p-4 font-mono text-xs",
        className,
      )}
    >
      {state.events.length === 0 ? (
        <p className="text-fd-muted-foreground">no events yet</p>
      ) : (
        <ul className="space-y-1">
          {state.events
            .slice()
            .reverse()
            .map((e, i) => (
              <li
                key={i}
                className={cn(
                  "flex min-w-0 gap-3",
                  e.level === "warn" && "text-amber-700 dark:text-amber-300",
                  e.level === "error" && "text-red-700 dark:text-red-300",
                )}
              >
                <span className="w-10 shrink-0 text-fd-muted-foreground" aria-label={`tick ${e.tick}`}>
                  t{e.tick}
                </span>
                <span className="min-w-0 break-words">
                  {e.level !== "info" ? (
                    <span className="sr-only">{e.level}: </span>
                  ) : null}
                  {e.message}
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
