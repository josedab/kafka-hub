"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ResultCard, ResultSection } from "@/components/workbench/result-card";
import { AssumptionsNote } from "@/components/workbench/assumptions-note";
import type {
  DrTabletopResult,
  DrReadinessStatus,
  DrPhaseChecklist,
  DrScenarioEstimate,
} from "@kafka-hub/kafka-planners/dr";

// ─── Status Display ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  DrReadinessStatus,
  { label: string; tone: "critical" | "high" | "medium" | "low"; description: string }
> = {
  ready: {
    label: "Ready",
    tone: "low",
    description: "No critical warnings. Estimates are within tolerance.",
  },
  concerns: {
    label: "Concerns",
    tone: "high",
    description: "Warnings present but no critical issues. Review before proceeding.",
  },
  "at-risk": {
    label: "At Risk",
    tone: "critical",
    description: "Critical warnings or estimates exceed tolerance. Address before DR exercise.",
  },
};

const SEVERITY_TONE: Record<string, "danger" | "warning" | "info"> = {
  critical: "danger",
  warning: "warning",
  info: "info",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "N/A";
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

// ─── Scenario Estimate Card ────────────────────────────────────────────────

function EstimateRow({ label, estimate }: { label: string; estimate: DrScenarioEstimate }) {
  return (
    <div className="rounded-md border border-fd-border/50 bg-fd-muted/20 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
          {label}
        </span>
        <span className="font-mono text-sm font-medium text-fd-foreground">
          {fmtDuration(estimate.seconds)} ({estimate.seconds}s)
        </span>
      </div>
      <p className="mt-1 font-mono text-[11px] text-fd-muted-foreground">
        {estimate.formula}
      </p>
      <div className="mt-2 space-y-0.5">
        {estimate.components.map((c, i) => (
          <div key={i} className="flex items-baseline gap-2 text-[11px] text-fd-muted-foreground">
            <span className="font-mono font-medium text-fd-foreground/70">{c.name}</span>
            <span>= {fmtDuration(c.valueSeconds)} ({c.valueSeconds}s)</span>
          </div>
        ))}
      </div>
      {estimate.assumptions.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {estimate.assumptions.map((a, i) => (
            <p key={i} className="text-[10px] text-fd-muted-foreground/70">
              {a}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Checklist Section ──────────────────────────────────────────────────────

function PhaseChecklist({ phase }: { phase: DrPhaseChecklist }) {
  return (
    <div className="space-y-1">
      <h4 className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-fd-muted-foreground">
        <span className="flex size-5 items-center justify-center rounded border border-fd-border text-[10px] font-medium">
          {phase.order}
        </span>
        {phase.label}
      </h4>
      <div className="space-y-1 pl-7">
        {phase.items.map((ci) => (
          <div
            key={ci.id}
            className="flex gap-2 rounded-md border border-fd-border/50 bg-fd-card p-2 text-xs"
          >
            <span
              className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border border-fd-border bg-fd-muted text-[10px] text-fd-muted-foreground"
              role="img"
              aria-label="Not checked"
            >
              -
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="font-medium text-fd-foreground">{ci.text}</span>
              <span className="text-fd-muted-foreground">
                Owner: {ci.owner}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Results Display ────────────────────────────────────────────────────────

export function DrResults({ result }: { result: DrTabletopResult }) {
  const statusCfg = STATUS_CONFIG[result.status];
  const criticalWarnings = result.warnings.filter((w) => w.severity === "critical");
  const otherWarnings = result.warnings.filter((w) => w.severity !== "critical");

  return (
    <div className="flex flex-col gap-4">
      {/* Status card */}
      <div className="dr-print-hide">
        <ResultCard
          title={statusCfg.label}
          tone={statusCfg.tone}
          badge={`${criticalWarnings.length} critical, ${otherWarnings.length} other`}
          subtitle={statusCfg.description}
        >
          <ResultSection title="Safety">
            <p className="text-xs text-fd-muted-foreground">
              This tool does NOT execute commands, automate failover, or claim
              vendor control-plane behavior. It is a deterministic planning aid
              for tabletop exercises.
            </p>
          </ResultSection>
        </ResultCard>
      </div>

      {/* RPO Card */}
      <div className="dr-print-hide rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Recovery-Point Exposure (RPO Estimate)
        </h3>
        <p className="mt-1 text-[11px] text-fd-muted-foreground">
          RPO decomposes into replicated data loss (records not yet replicated) and checkpoint/offset uncertainty (staleness that may require replay/reconciliation, even when records exist on the target). All values in seconds.
        </p>
        <div className="mt-3 space-y-2">
          <EstimateRow label="Best case" estimate={result.rpo.best} />
          <EstimateRow label="Likely case" estimate={result.rpo.likely} />
          <EstimateRow label="Worst case" estimate={result.rpo.worst} />
        </div>
      </div>

      {/* RTO Card */}
      <div className="dr-print-hide rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Recovery Time Objective (RTO) &mdash; Downtime
        </h3>
        <p className="mt-1 text-[11px] text-fd-muted-foreground">
          RTO measures total service downtime from incident to full recovery. All values in seconds.
        </p>
        <div className="mt-3 space-y-2">
          <EstimateRow label="Best case" estimate={result.rto.best} />
          <EstimateRow label="Likely case" estimate={result.rto.likely} />
          <EstimateRow label="Worst case" estimate={result.rto.worst} />
        </div>
      </div>

      {/* Duplicate Exposure */}
      <div className="dr-print-hide rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Duplicate / Replay Exposure
        </h3>
        <p className="mt-1 text-[11px] text-fd-muted-foreground">
          Distinct from data loss (RPO). After failover, consumers may replay messages from checkpointed offsets.
        </p>
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-md border border-fd-border/50 bg-fd-muted/20 px-3 py-2">
              <span className="text-[10px] uppercase tracking-wider text-fd-muted-foreground">Worst-case replay</span>
              <p className="font-mono text-sm font-medium">{result.duplicateExposure.worstCaseReplaySeconds}s</p>
            </div>
            <div className="rounded-md border border-fd-border/50 bg-fd-muted/20 px-3 py-2">
              <span className="text-[10px] uppercase tracking-wider text-fd-muted-foreground">Tolerance</span>
              <p className="font-mono text-sm font-medium">{result.duplicateExposure.toleranceSeconds}s</p>
            </div>
            <Badge tone={result.duplicateExposure.exceedsTolerance ? "danger" : "success"}>
              {result.duplicateExposure.exceedsTolerance ? "Exceeds tolerance" : "Within tolerance"}
            </Badge>
          </div>
          <p className="text-xs text-fd-muted-foreground">{result.duplicateExposure.explanation}</p>
        </div>
      </div>

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="dr-print-hide rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
            Warnings
          </h3>
          <div className="mt-3 space-y-2">
            {result.warnings.map((w) => (
              <div
                key={w.id}
                className={`rounded-md border p-3 ${
                  w.severity === "critical"
                    ? "border-red-500/20 bg-red-500/5"
                    : w.severity === "warning"
                      ? "border-amber-500/20 bg-amber-500/5"
                      : "border-sky-500/20 bg-sky-500/5"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Badge tone={SEVERITY_TONE[w.severity] ?? "neutral"}>
                    {w.severity}
                  </Badge>
                  <span className="font-mono text-[10px] text-fd-muted-foreground">{w.id}</span>
                </div>
                <p className="mt-1 text-xs text-fd-muted-foreground">{w.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phase Checklists — focused print artifact */}
      <div
        className="dr-checklist-print rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5"
        id="dr-checklist"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
            DR Phase Checklists
          </h3>
          <button
            type="button"
            onClick={() => window.print()}
            className="dr-print-hide inline-flex min-h-[44px] items-center gap-1 rounded-md border border-fd-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-fd-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
            aria-label="Print DR checklists"
          >
            Print checklist
          </button>
        </div>
        <div className="mt-3 space-y-4">
          {result.checklists.map((phase) => (
            <PhaseChecklist key={phase.phase} phase={phase} />
          ))}
        </div>
      </div>

      {/* Observability recommendations */}
      <div className="dr-print-hide rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Observability Recommendations
        </h3>
        <div className="mt-3 space-y-3">
          {result.observability.map((rec, i) => (
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

      {/* Strategy Notes */}
      <div className="dr-print-hide rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Strategy Notes: {result.strategyNotes.label}
        </h3>
        <div className="mt-3 space-y-1">
          {result.strategyNotes.notes.map((note, i) => (
            <p key={i} className="text-xs text-fd-muted-foreground">
              <span aria-hidden className="mr-1 font-mono text-fd-foreground/40">·</span>
              {note}
            </p>
          ))}
        </div>
      </div>

      {/* Resource links */}
      {result.resourceLinks.length > 0 && (
        <div className="dr-print-hide rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
            Related Resources
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {result.resourceLinks.map((rl, i) => {
              const cls =
                "inline-flex min-h-[44px] items-center gap-1 rounded-md border border-fd-border bg-fd-card px-2 py-1 text-xs font-medium transition-colors hover:bg-fd-accent";
              const inner = (
                <>
                  <span className="font-mono text-[10px] uppercase text-fd-muted-foreground">
                    {rl.surface}
                  </span>
                  {rl.label}
                </>
              );
              return rl.surface === "external" ? (
                <a key={i} href={rl.href} target="_blank" rel="noreferrer noopener" className={cls}>
                  {inner}
                </a>
              ) : (
                <Link key={i} href={rl.href} className={cls}>
                  {inner}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Assumptions */}
      <div className="dr-print-hide">
        <AssumptionsNote
          items={[
            `Replication lag: ${result.assumptions.replicationLagSeconds}s.`,
            `Checkpoint interval: ${result.assumptions.checkpointIntervalSeconds}s.`,
            `Incident detection: ${result.assumptions.incidentDetectionSeconds}s.`,
            `Promotion time: ${result.assumptions.promotionSeconds}s.`,
            `DNS TTL: ${result.assumptions.dnsTtlSeconds}s.`,
            `Client reconnect: ${result.assumptions.clientReconnectSeconds}s.`,
            `Validation time: ${result.assumptions.validationSeconds}s.`,
            `Duplicate tolerance: ${result.assumptions.duplicateToleranceSeconds}s.`,
            `Strategy: ${result.assumptions.strategy}.`,
            "RPO best = replicationLag (replicated data loss only). Likely = replicationLag + checkpointInterval/2 (data loss + average checkpoint uncertainty). Worst = replicationLag + checkpointInterval (data loss + max checkpoint uncertainty). Checkpoint uncertainty = replay/reconciliation exposure, not additional record loss.",
            "RTO best = detection + promotion + max(dns, client) + validation. Likely = all serial. Worst = serial + 1 validation retry.",
            "Deterministic planning aid — not a live diagnosis. Does NOT execute commands.",
            "No data was sent to any external service. Everything ran locally.",
          ]}
        />
      </div>
    </div>
  );
}
