"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { ResultCard, ResultSection } from "@/components/workbench/result-card";
import { AssumptionsNote } from "@/components/workbench/assumptions-note";
import type { LagTriageResult, LagCondition } from "@kafka-hub/kafka-planners/lag";

// ─── Condition Display ──────────────────────────────────────────────────────

const CONDITION_CONFIG: Record<
  LagCondition,
  { label: string; tone: "critical" | "high" | "medium" | "low"; description: string }
> = {
  "caught-up": {
    label: "Caught Up",
    tone: "low",
    description: "All partitions are fully consumed. No lag.",
  },
  "stable-backlog": {
    label: "Stable Backlog",
    tone: "medium",
    description: "Lag exists but is not changing. Consumers keep pace with ingress.",
  },
  growing: {
    label: "Growing",
    tone: "critical",
    description: "Lag is increasing. Consumers are not keeping up with producer ingress.",
  },
  draining: {
    label: "Draining",
    tone: "low",
    description: "Lag is decreasing. Consumers are catching up.",
  },
  stalled: {
    label: "Stalled",
    tone: "high",
    description: "Consumers are making zero progress despite existing lag.",
  },
  "hot-partition": {
    label: "Hot Partition",
    tone: "high",
    description: "One or more partitions have disproportionately high lag relative to peers.",
  },
  "group-unstable": {
    label: "Group Unstable",
    tone: "critical",
    description: "Consumer group is rebalancing, in a non-stable state, or has offset regressions.",
  },
};

function fmtRate(rate: number): string {
  return rate.toFixed(2);
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} min`;
  return `${(seconds / 3600).toFixed(1)} hr`;
}

// ─── Results Display ────────────────────────────────────────────────────────

export function LagResults({ result }: { result: LagTriageResult }) {
  const condCfg = CONDITION_CONFIG[result.condition];

  return (
    <div className="flex flex-col gap-4">
      {/* Classification card */}
      <ResultCard
        title={condCfg.label}
        tone={condCfg.tone}
        badge={`${result.confidence.level} confidence`}
        subtitle={condCfg.description}
      >
        <ResultSection title="Confidence">
          <p className="text-xs text-fd-muted-foreground">{result.confidence.reason}</p>
        </ResultSection>

        <ResultSection title="Condition flags">
          <div className="flex flex-wrap gap-1.5">
            {result.conditionFlags.groupStateUnstable && <Badge tone="danger">group state unstable</Badge>}
            {result.conditionFlags.hasCommittedRegressions && <Badge tone="danger">committed regressions</Badge>}
            {result.conditionFlags.hasCurrentRegressions && <Badge tone="warning">current regressions</Badge>}
            {result.conditionFlags.hasHotPartitions && <Badge tone="warning">hot partitions</Badge>}
            {result.conditionFlags.lagGrowing && <Badge tone="danger">lag growing</Badge>}
            {result.conditionFlags.consumersStalled && <Badge tone="danger">consumers stalled</Badge>}
            {!result.conditionFlags.groupStateUnstable &&
              !result.conditionFlags.hasCommittedRegressions &&
              !result.conditionFlags.hasCurrentRegressions &&
              !result.conditionFlags.hasHotPartitions &&
              !result.conditionFlags.lagGrowing &&
              !result.conditionFlags.consumersStalled && (
                <Badge tone="success">no issues</Badge>
              )}
          </div>
        </ResultSection>
      </ResultCard>

      {/* Summary metrics */}
      <div className="rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Summary
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <MetricTile label="Total lag (before)" value={result.totalLagBefore.toLocaleString()} unit="records" />
          <MetricTile label="Total lag (after)" value={result.totalLagAfter.toLocaleString()} unit="records" />
          <MetricTile
            label="Lag delta"
            value={`${result.totalLagDelta >= 0 ? "+" : ""}${result.totalLagDelta.toLocaleString()}`}
            unit="records"
            alert={result.totalLagDelta > 0}
          />
          <MetricTile label="Lag rate" value={fmtRate(result.totalLagRatePerSec)} unit="records/sec" />
          <MetricTile label="Ingress rate" value={fmtRate(result.totalIngressRatePerSec)} unit="records/sec" />
          <MetricTile label="Committed rate" value={fmtRate(result.totalCommittedRatePerSec)} unit="records/sec" />
          <MetricTile
            label="Current-position delta"
            value={`${result.totalCurrentDelta >= 0 ? "+" : ""}${result.totalCurrentDelta.toLocaleString()}`}
            unit="records"
          />
          <MetricTile label="Current-position rate" value={fmtRate(result.totalCurrentRatePerSec)} unit="records/sec" />
          <MetricTile
            label="Drain ETA (committed)"
            value={result.drainEta.etaSeconds !== null ? fmtDuration(result.drainEta.etaSeconds) : "N/A"}
            unit={result.drainEta.unavailableReason ?? ""}
          />
          <MetricTile label="Partitions" value={String(result.partitions.length)} unit="" />
        </div>
      </div>

      {/* Partition skew */}
      <div className="rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Partition Skew
        </h3>
        <p className="mt-1 text-xs text-fd-muted-foreground">
          CV (coefficient of variation) = stddev / mean. Higher values indicate more uneven consumption.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MetricTile label="Max lag" value={result.partitionSkew.maxLag.toLocaleString()} unit={`(${result.partitionSkew.maxLagPartitions.join(", ")})`} />
          <MetricTile label="Mean lag" value={result.partitionSkew.meanLag.toFixed(1)} unit="records" />
          <MetricTile
            label="CV"
            value={result.partitionSkew.coefficientOfVariation !== null ? result.partitionSkew.coefficientOfVariation.toFixed(3) : "N/A"}
            unit={result.partitionSkew.coefficientOfVariation === null ? "(mean is 0)" : ""}
          />
        </div>
      </div>

      {/* Throughput requirements */}
      <div className="rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Throughput Requirements
        </h3>
        <p className="mt-1 text-xs text-fd-muted-foreground">
          toHoldSteady = total ingress rate. toDrainByTarget = ingress + (lag / target seconds).
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <MetricTile label="To hold steady" value={fmtRate(result.throughputRequirements.toHoldSteady)} unit="records/sec" />
          {result.throughputRequirements.toDrainByTarget !== undefined && (
            <MetricTile label="To drain by target" value={fmtRate(result.throughputRequirements.toDrainByTarget)} unit="records/sec" />
          )}
        </div>
      </div>

      {/* Capacity planning */}
      {result.capacity && (
        <div className="rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
            Capacity Planning
          </h3>
          <p className="mt-1 text-xs text-fd-muted-foreground">
            Required consumers are uncapped. Effective consumers are capped at the partition count
            because each partition is assigned to at most one consumer; extra consumers would be idle.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MetricTile label="Per-consumer throughput" value={fmtRate(result.capacity.perConsumerThroughput)} unit="records/sec" />
            <MetricTile label="Required (hold steady)" value={String(result.capacity.requiredToHoldSteady)} unit="uncapped" />
            <MetricTile label="Effective (hold steady)" value={String(result.capacity.effectiveToHoldSteady)} unit="capped" />
            {result.capacity.requiredToDrain !== undefined && (
              <MetricTile label="Required (drain target)" value={String(result.capacity.requiredToDrain)} unit="uncapped" />
            )}
            {result.capacity.effectiveToDrain !== undefined && (
              <MetricTile label="Effective (drain target)" value={String(result.capacity.effectiveToDrain)} unit="capped" />
            )}
            <MetricTile label="Max active consumers" value={String(result.capacity.maxActiveConsumers)} unit="= partitions" />
            <MetricTile label="Max throughput at cap" value={fmtRate(result.capacity.maxThroughputAtCap)} unit="records/sec" />
            {result.capacity.throughputShortfall > 0 && (
              <MetricTile label="Throughput shortfall" value={fmtRate(result.capacity.throughputShortfall)} unit="records/sec" alert />
            )}
          </div>
          {result.capacity.cappedAtPartitions && (
            <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">
              Consumer count capped at partition count. Even maximum parallelism may be insufficient.
              {result.capacity.throughputShortfall > 0 && (
                <> Shortfall: {fmtRate(result.capacity.throughputShortfall)} records/sec.</>
              )}
            </p>
          )}
        </div>
      )}

      {/* Per-partition table */}
      <div className="rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Per-Partition Detail
        </h3>
        <div className="mt-3 overflow-x-auto" role="region" aria-label="Per-partition lag data" tabIndex={0}>
          <table className="w-full min-w-[900px] text-xs">
            <thead>
              <tr className="border-b border-fd-border text-left">
                <th className="pb-2 pr-3 font-medium text-fd-muted-foreground">Partition</th>
                <th className="pb-2 pr-3 text-right font-medium text-fd-muted-foreground">Lag Before</th>
                <th className="pb-2 pr-3 text-right font-medium text-fd-muted-foreground">Lag After</th>
                <th className="pb-2 pr-3 text-right font-medium text-fd-muted-foreground">Delta</th>
                <th className="pb-2 pr-3 text-right font-medium text-fd-muted-foreground">Rate (r/s)</th>
                <th className="pb-2 pr-3 text-right font-medium text-fd-muted-foreground">Ingress (r/s)</th>
                <th className="pb-2 pr-3 text-right font-medium text-fd-muted-foreground">Committed (r/s)</th>
                <th className="pb-2 pr-3 text-right font-medium text-fd-muted-foreground">Cur Δ</th>
                <th className="pb-2 pr-3 text-right font-medium text-fd-muted-foreground">Cur Rate</th>
                <th className="pb-2 pr-3 text-center font-medium text-fd-muted-foreground">Hot</th>
                <th className="pb-2 pr-3 text-center font-medium text-fd-muted-foreground">Commit Regr</th>
                <th className="pb-2 text-center font-medium text-fd-muted-foreground">Cur Regr</th>
              </tr>
            </thead>
            <tbody>
              {result.partitions.map((p) => (
                <tr
                  key={p.partitionId}
                  className={cn(
                    "border-b border-fd-border/30",
                    p.isHot && "bg-amber-500/5",
                    (p.committedRegression || p.currentRegression) && "bg-red-500/5",
                  )}
                >
                  <td className="py-1.5 pr-3 font-mono">{p.partitionId}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{p.lagBefore.toLocaleString()}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{p.lagAfter.toLocaleString()}</td>
                  <td className={cn("py-1.5 pr-3 text-right font-mono", p.lagDelta > 0 && "text-red-600 dark:text-red-400", p.lagDelta < 0 && "text-emerald-600 dark:text-emerald-400")}>
                    {p.lagDelta >= 0 ? "+" : ""}{p.lagDelta.toLocaleString()}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono">{fmtRate(p.lagRatePerSec)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{fmtRate(p.ingressRatePerSec)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{fmtRate(p.committedRatePerSec)}</td>
                  <td className={cn("py-1.5 pr-3 text-right font-mono", p.currentDelta < 0 && "text-red-600 dark:text-red-400")}>
                    {p.currentDelta >= 0 ? "+" : ""}{p.currentDelta.toLocaleString()}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono">{fmtRate(p.currentRatePerSec)}</td>
                  <td className="py-1.5 pr-3 text-center">
                    {p.isHot ? <Badge tone="warning">hot</Badge> : <span className="text-fd-muted-foreground">—</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-center">
                    {p.committedRegression ? <Badge tone="danger">yes</Badge> : <span className="text-fd-muted-foreground">—</span>}
                  </td>
                  <td className="py-1.5 text-center">
                    {p.currentRegression ? <Badge tone="danger">yes</Badge> : <span className="text-fd-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Observability recommendations */}
      <div className="rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Observability Recommendations
        </h3>
        <div className="mt-3 space-y-3">
          {result.recommendations.map((rec, i) => (
            <div key={i} className="rounded-md border border-fd-border/50 bg-fd-muted/20 p-3">
              <p className="font-mono text-[11px] font-medium text-fd-foreground">
                {rec.metric}
              </p>
              <p className="mt-0.5 text-xs text-fd-muted-foreground">{rec.description}</p>
              <p className="mt-1 text-xs text-fd-muted-foreground">
                <span className="font-medium">Rationale:</span> {rec.rationale}
              </p>
              <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                <span className="font-medium">Caveat:</span> {rec.caveat}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Resource links */}
      {result.resourceLinks.length > 0 && (
        <div className="rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
            Related Resources
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {result.resourceLinks.map((rl, i) => (
              <Link
                key={i}
                href={rl.href}
                className="inline-flex items-center gap-1 rounded-md border border-fd-border bg-fd-card px-2 py-1 text-xs font-medium transition-colors hover:bg-fd-accent min-h-[44px]"
              >
                <span className="font-mono text-[10px] uppercase text-fd-muted-foreground">
                  {rl.surface}
                </span>
                {rl.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Assumptions */}
      <AssumptionsNote
        items={[
          `Interval: ${result.assumptions.intervalSeconds}s between snapshots.`,
          `Hot partition: peer-baseline method — each partition's lag is compared to the mean of all other partitions × ${result.assumptions.hotPartitionMultiplier}, with a minimum lag of ${result.assumptions.hotPartitionMinLag}. Single-partition groups cannot have hot partitions.`,
          ...(result.assumptions.perConsumerThroughput !== undefined
            ? [`Per-consumer throughput: ${result.assumptions.perConsumerThroughput} records/sec (user-supplied assumption).`]
            : []),
          ...(result.assumptions.drainTargetSeconds !== undefined
            ? [`Drain target: ${result.assumptions.drainTargetSeconds}s.`]
            : []),
          `Group state (after snapshot): ${result.assumptions.groupStateAfter}.`,
          "Committed lag is based on committed offsets. Current-position progress is tracked separately.",
          "Static analysis — not a live diagnosis. Calibrate alert thresholds to your workload baseline and SLO.",
          "No data was sent to any external service. Everything ran locally.",
        ]}
      />
    </div>
  );
}

// ─── Metric Tile ────────────────────────────────────────────────────────────

function MetricTile({
  label,
  value,
  unit,
  alert,
}: {
  label: string;
  value: string;
  unit: string;
  alert?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-fd-muted-foreground">{label}</span>
      <span className={cn("font-mono text-sm font-medium", alert && "text-red-600 dark:text-red-400")}>
        {value}
      </span>
      {unit && <span className="text-[10px] text-fd-muted-foreground">{unit}</span>}
    </div>
  );
}
