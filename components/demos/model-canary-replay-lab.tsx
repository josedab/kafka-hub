"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DETERMINISTIC_CANARY_SAMPLES,
  evaluateModelCanary,
  type ModelCanaryInput,
} from "@/lib/ai-demo-helpers";
import { cn } from "@/lib/cn";

const initialInput: ModelCanaryInput = {
  baselineQuality: 0.82,
  candidateQuality: 0.86,
  baselineCost: 1,
  candidateCost: 1.05,
  baselineLatency: 800,
  candidateLatency: 850,
  minimumQuality: 0.84,
  maximumCostIncrease: 10,
  maximumLatencyIncrease: 10,
};

export function ModelCanaryReplayLab() {
  const [input, setInput] = useState(initialInput);
  const [sampleCount, setSampleCount] = useState(8);
  const result = useMemo(() => evaluateModelCanary(input), [input]);
  const samples = DETERMINISTIC_CANARY_SAMPLES.slice(0, sampleCount);

  function setValue<Key extends keyof ModelCanaryInput>(
    key: Key,
    value: ModelCanaryInput[Key],
  ) {
    setInput((current) => ({ ...current, [key]: value }));
  }

  return (
    <figure
      className="not-prose my-8 overflow-hidden rounded-xl border border-fd-border bg-fd-card"
      aria-label="Model canary replay lab"
      data-testid="model-canary-replay-lab"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-fd-border bg-fd-muted/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge tone="info">Interactive</Badge>
          <span className="text-sm font-medium">Canary replay — quality, cost, and latency gates</span>
        </div>
        <Badge tone={result.decision === "rollout" ? "success" : "warning"}>
          {result.decision === "rollout" ? "eligible for staged rollout" : "hold candidate"}
        </Badge>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <section className="rounded-lg border border-fd-border bg-fd-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-wider text-fd-muted-foreground">
                  fixed replay set
                </p>
                <p className="mt-1 text-xs text-fd-muted-foreground">
                  Deterministic samples make a candidate comparison reproducible; they do not replace live safety checks.
                </p>
              </div>
              <label className="font-mono text-xs">
                samples{" "}
                <select
                  aria-label="canary sample count"
                  value={sampleCount}
                  onChange={(event) => setSampleCount(Number(event.target.value))}
                  className="rounded border border-fd-border bg-fd-card px-2 py-1"
                >
                  <option value={4}>4</option>
                  <option value={8}>8</option>
                  <option value={12}>12</option>
                </select>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {samples.map((sample, index) => (
                <span key={sample} className="rounded border border-fd-border px-2 py-1 font-mono text-[11px]">
                  {String(index + 1).padStart(2, "0")} {sample}
                </span>
              ))}
            </div>
          </section>

          <section className="overflow-x-auto rounded-lg border border-fd-border bg-fd-background">
            <div className="grid min-w-[500px] grid-cols-[1fr_100px_100px_110px] border-b border-fd-border px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-fd-muted-foreground">
              <span>gate</span>
              <span>baseline</span>
              <span>candidate</span>
              <span>result</span>
            </div>
            <CanaryRow
              label="quality score"
              baseline={input.baselineQuality.toFixed(2)}
              candidate={input.candidateQuality.toFixed(2)}
              outcome={`${result.qualityDelta >= 0 ? "+" : ""}${result.qualityDelta.toFixed(2)} · floor ${input.minimumQuality.toFixed(2)}`}
              passes={result.qualityPasses}
            />
            <CanaryRow
              label="normalized cost"
              baseline={input.baselineCost.toFixed(2)}
              candidate={input.candidateCost.toFixed(2)}
              outcome={`${result.costIncrease >= 0 ? "+" : ""}${result.costIncrease.toFixed(1)}% · cap +${input.maximumCostIncrease}%`}
              passes={result.costPasses}
            />
            <CanaryRow
              label="p95 latency"
              baseline={`${input.baselineLatency}ms`}
              candidate={`${input.candidateLatency}ms`}
              outcome={`${result.latencyIncrease >= 0 ? "+" : ""}${result.latencyIncrease.toFixed(1)}% · cap +${input.maximumLatencyIncrease}%`}
              passes={result.latencyPasses}
            />
          </section>

          <div role="status" aria-live="polite" className={cn(
            "border-l-2 p-3 text-sm leading-relaxed",
            result.decision === "rollout"
              ? "border-emerald-500 bg-emerald-500/5"
              : "border-amber-500 bg-amber-500/5",
          )}>
            <strong>{result.decision === "rollout" ? "Stage, observe, then expand." : "Hold and inspect the failed gate."}</strong>{" "}
            Replay protects the evaluation comparison; production rollout still needs request-level observability, guardrail outcomes, retrieval references, and a reversible traffic step.
          </div>
        </div>

        <aside className="space-y-3 rounded-lg border border-dashed border-fd-border bg-fd-background p-4 text-xs">
          <p className="font-mono text-[11px] uppercase tracking-wider text-fd-muted-foreground">
            Baseline and candidate knobs
          </p>
          <Range
            label="baseline quality"
            value={input.baselineQuality}
            min={0.5}
            max={1}
            step={0.01}
            onChange={(value) => setValue("baselineQuality", value)}
          />
          <Range
            label="candidate quality"
            value={input.candidateQuality}
            min={0.5}
            max={1}
            step={0.01}
            onChange={(value) => setValue("candidateQuality", value)}
          />
          <Range
            label="baseline cost"
            value={input.baselineCost}
            min={0.5}
            max={2}
            step={0.05}
            onChange={(value) => setValue("baselineCost", value)}
          />
          <Range
            label="candidate cost"
            value={input.candidateCost}
            min={0.5}
            max={2}
            step={0.05}
            onChange={(value) => setValue("candidateCost", value)}
          />
          <Range
            label="baseline p95 latency"
            value={input.baselineLatency}
            min={200}
            max={1_500}
            step={50}
            suffix="ms"
            onChange={(value) => setValue("baselineLatency", value)}
          />
          <Range
            label="candidate p95 latency"
            value={input.candidateLatency}
            min={200}
            max={1_500}
            step={50}
            suffix="ms"
            onChange={(value) => setValue("candidateLatency", value)}
          />

          <p className="border-t border-fd-border pt-3 font-mono text-[11px] uppercase tracking-wider text-fd-muted-foreground">
            Rollout thresholds
          </p>
          <Range
            label="minimum quality"
            value={input.minimumQuality}
            min={0.5}
            max={1}
            step={0.01}
            onChange={(value) => setValue("minimumQuality", value)}
          />
          <Range
            label="maximum cost increase"
            value={input.maximumCostIncrease}
            min={0}
            max={50}
            step={1}
            suffix="%"
            onChange={(value) => setValue("maximumCostIncrease", value)}
          />
          <Range
            label="maximum latency increase"
            value={input.maximumLatencyIncrease}
            min={0}
            max={50}
            step={1}
            suffix="%"
            onChange={(value) => setValue("maximumLatencyIncrease", value)}
          />
          <Button className="w-full" size="sm" variant="ghost" onClick={() => setInput(initialInput)}>
            reset canary
          </Button>
        </aside>
      </div>
    </figure>
  );
}

function CanaryRow({
  label,
  baseline,
  candidate,
  outcome,
  passes,
}: {
  label: string;
  baseline: string;
  candidate: string;
  outcome: string;
  passes: boolean;
}) {
  return (
    <div className="grid min-w-[500px] grid-cols-[1fr_100px_100px_110px] items-center border-b border-fd-border px-3 py-2.5 text-xs last:border-b-0">
      <span>{label}</span>
      <span className="font-mono text-fd-muted-foreground">{baseline}</span>
      <span className="font-mono">{candidate}</span>
      <span className={cn("font-mono text-[10px]", passes ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")}>
        {passes ? "PASS " : "HOLD "}
        {outcome}
      </span>
    </div>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex justify-between gap-2 text-fd-muted-foreground">
        <span>{label}</span>
        <span className="font-mono text-fd-foreground">
          {step < 1 ? value.toFixed(2) : value}{suffix}
        </span>
      </span>
      <input
        aria-label={label}
        className="w-full accent-fd-foreground"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
