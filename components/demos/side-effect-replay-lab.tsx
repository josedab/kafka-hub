"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  simulateSideEffectReplay,
  type ReplayBoundary,
  type SideEffectStrategy,
} from "@/lib/ai-demo-helpers";
import { cn } from "@/lib/cn";

const boundaries: Array<{ value: ReplayBoundary; label: string; detail: string }> = [
  {
    value: "before-effect",
    label: "Before call",
    detail: "The process dies before any model or tool call starts.",
  },
  {
    value: "after-effect-before-result",
    label: "After effect, before durable result",
    detail: "The remote system may have accepted work, but local durable state has no outcome.",
  },
  {
    value: "after-result-before-commit",
    label: "After durable result, before Kafka commit",
    detail: "The outcome is recorded, but the input can be delivered again.",
  },
  {
    value: "after-commit",
    label: "After Kafka commit",
    detail: "The consumed input offset is already committed.",
  },
];

const strategies: Array<{ value: SideEffectStrategy; label: string; detail: string }> = [
  {
    value: "naive",
    label: "Naive retry",
    detail: "Re-run the handler when Kafka redelivers the input.",
  },
  {
    value: "idempotency-key",
    label: "Idempotency key",
    detail: "Retry with the same provider-supported effect key.",
  },
  {
    value: "durable-result",
    label: "Durable result",
    detail: "Read an effect result ledger before calling the external system.",
  },
];

export function SideEffectReplayLab() {
  const [boundary, setBoundary] = useState<ReplayBoundary>("after-effect-before-result");
  const [strategy, setStrategy] = useState<SideEffectStrategy>("naive");
  const result = useMemo(
    () => simulateSideEffectReplay(boundary, strategy),
    [boundary, strategy],
  );

  return (
    <figure
      className="not-prose my-8 overflow-hidden rounded-xl border border-fd-border bg-fd-card"
      aria-label="External side-effect replay lab"
      data-testid="side-effect-replay-lab"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-fd-border bg-fd-muted/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge tone="info">Interactive</Badge>
          <span className="text-sm font-medium">Replay boundary — Kafka commit vs external effect</span>
        </div>
        <Badge tone={result.modelExecutions > 1 ? "warning" : "success"}>
          {result.modelExecutions > 1 ? "duplicate exposure" : "one effect execution"}
        </Badge>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-4">
          <fieldset>
            <legend className="font-mono text-[11px] uppercase tracking-wider text-fd-muted-foreground">
              Select a crash boundary
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {boundaries.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "cursor-pointer rounded-lg border p-3 transition-colors",
                    boundary === option.value
                      ? "border-amber-500/60 bg-amber-500/10"
                      : "border-fd-border hover:bg-fd-accent",
                  )}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name="replay-boundary"
                    value={option.value}
                    checked={boundary === option.value}
                    onChange={() => setBoundary(option.value)}
                  />
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-fd-muted-foreground">
                    {option.detail}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <section className="rounded-lg border border-fd-border bg-fd-background p-3">
            <p className="font-mono text-[11px] uppercase tracking-wider text-fd-muted-foreground">
              execution trace
            </p>
            <ol className="mt-3 grid gap-2 sm:grid-cols-4">
              {[
                "Kafka delivers input",
                "model / tool effect",
                "durable result",
                "commit input offset",
              ].map((step, index) => {
                const boundaryIndex = boundaries.findIndex(
                  (option) => option.value === boundary,
                );
                const isCrashAfter = index === boundaryIndex;
                return (
                  <li
                    key={step}
                    className={cn(
                      "relative border p-2.5 text-xs",
                      isCrashAfter
                        ? "border-red-500/50 bg-red-500/10"
                        : "border-fd-border bg-fd-card",
                    )}
                  >
                    <span className="font-mono text-[10px] text-fd-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="mt-1 block font-medium">{step}</span>
                    {isCrashAfter ? (
                      <span className="mt-1 block font-mono text-[10px] text-red-700 dark:text-red-300">
                        crash boundary
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        <aside className="space-y-3 rounded-lg border border-dashed border-fd-border bg-fd-background p-4">
          <fieldset>
            <legend className="font-mono text-[11px] uppercase tracking-wider text-fd-muted-foreground">
              Recovery design
            </legend>
            <div className="mt-2 space-y-2">
              {strategies.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "block cursor-pointer rounded-md border p-2.5 transition-colors",
                    strategy === option.value
                      ? "border-emerald-500/50 bg-emerald-500/10"
                      : "border-fd-border hover:bg-fd-accent",
                  )}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name="recovery-strategy"
                    value={option.value}
                    checked={strategy === option.value}
                    onChange={() => setStrategy(option.value)}
                  />
                  <span className="block text-xs font-medium">{option.label}</span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-fd-muted-foreground">
                    {option.detail}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div role="status" aria-live="polite" className="rounded-md border border-fd-border bg-fd-card p-3">
            <p className="font-mono text-[11px] uppercase tracking-wider text-fd-muted-foreground">
              replay result
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <EffectMetric label="model requests" value={result.modelRequests} />
              <EffectMetric label="model executions" value={result.modelExecutions} />
              <EffectMetric label="tool requests" value={result.toolRequests} />
              <EffectMetric label="tool executions" value={result.toolExecutions} />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-fd-muted-foreground">
              {result.decision}
            </p>
          </div>
          <p className="text-[11px] leading-relaxed text-fd-muted-foreground">
            An idempotency key works only where the provider honors it. A durable
            result alone cannot close the gap after an external acceptance and
            before that result is written.
          </p>
        </aside>
      </div>
    </figure>
  );
}

function EffectMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-fd-border px-2 py-1.5">
      <p className="font-mono text-[10px] uppercase tracking-wider text-fd-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
