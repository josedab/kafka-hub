"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { ResultCard, ResultSection } from "@/components/workbench/result-card";
import { AssumptionsNote } from "@/components/workbench/assumptions-note";
import type {
  KRaftAnalysisResult,
  KRaftReadinessStatus,
  KRaftChecklistItem,
} from "@kafka-hub/kafka-planners/kraft";
import { KRAFT_MIGRATION_PHASES } from "@kafka-hub/kafka-planners/kraft";

// ─── Status Display ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  KRaftReadinessStatus,
  { label: string; tone: "critical" | "high" | "medium" | "low"; description: string }
> = {
  ready: {
    label: "Ready",
    tone: "low",
    description: "All readiness checks pass. Review findings before proceeding.",
  },
  warnings: {
    label: "Warnings",
    tone: "high",
    description: "No blockers, but there are warnings to review before proceeding.",
  },
  blocked: {
    label: "Blocked",
    tone: "critical",
    description: "One or more blockers must be resolved before proceeding.",
  },
};

const SEVERITY_TONE: Record<string, "danger" | "warning" | "info"> = {
  blocker: "danger",
  warning: "warning",
  info: "info",
};

// ─── Phase Timeline ─────────────────────────────────────────────────────────

function PhaseTimeline({ currentPhaseId }: { currentPhaseId: string }) {
  return (
    <div className="overflow-x-auto" role="region" aria-label="Migration phase timeline" tabIndex={0}>
      <div className="flex min-w-[600px] items-stretch gap-1">
        {KRAFT_MIGRATION_PHASES.map((phase, i) => {
          const isCurrent = phase.id === currentPhaseId;
          const isPast = KRAFT_MIGRATION_PHASES.findIndex((p) => p.id === currentPhaseId) > i;
          return (
            <div
              key={phase.id}
              className={cn(
                "flex flex-1 flex-col gap-1 rounded-lg border p-3 text-xs transition-colors",
                isCurrent && "border-sky-500/50 bg-sky-500/10",
                isPast && "border-fd-border/50 bg-fd-muted/30 opacity-70",
                !isCurrent && !isPast && "border-fd-border bg-fd-card",
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] text-fd-muted-foreground">
                  {phase.order}
                </span>
                {isCurrent && <Badge tone="info">current</Badge>}
              </div>
              <span className="font-medium">{phase.label}</span>
              <span className="text-[10px] text-fd-muted-foreground">
                Rollback: {phase.rollbackSupported ? "supported (not risk-free)" : "NOT supported"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Checklist ──────────────────────────────────────────────────────────────

function ChecklistSection({ items }: { items: readonly KRaftChecklistItem[] }) {
  const categories = new Map<string, KRaftChecklistItem[]>();
  for (const item of items) {
    const existing = categories.get(item.category) ?? [];
    existing.push(item);
    categories.set(item.category, existing);
  }

  return (
    <div className="space-y-3">
      {[...categories.entries()].map(([category, catItems]) => (
        <div key={category}>
          <h4 className="font-mono text-[10px] uppercase tracking-wider text-fd-muted-foreground">
            {category}
          </h4>
          <div className="mt-1 space-y-1">
            {catItems.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "flex gap-2 rounded-md border p-2 text-xs",
                  item.satisfied
                    ? "border-fd-border/50 bg-fd-card"
                    : "border-amber-500/20 bg-amber-500/5",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border text-[10px]",
                    item.satisfied
                      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-fd-border bg-fd-muted text-fd-muted-foreground",
                  )}
                  role="img"
                  aria-label={item.satisfied ? "Satisfied" : "Not satisfied"}
                >
                  {item.satisfied ? "Y" : "-"}
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium text-fd-foreground">{item.text}</span>
                  <span className="text-fd-muted-foreground">{item.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Results Display ────────────────────────────────────────────────────────

export function KRaftResults({ result }: { result: KRaftAnalysisResult }) {
  const statusCfg = STATUS_CONFIG[result.status];
  const blockers = result.findings.filter((f) => f.severity === "blocker");
  const warnings = result.findings.filter((f) => f.severity === "warning");

  return (
    <div className="flex flex-col gap-4">
      {/* Status card */}
      <div className="kraft-print-hide">
        <ResultCard
          title={statusCfg.label}
          tone={statusCfg.tone}
          badge={`${blockers.length} blockers, ${warnings.length} warnings`}
          subtitle={statusCfg.description}
        >
          <ResultSection title="Safety">
            <p className="text-xs text-fd-muted-foreground">
              ZooKeeper-to-KRaft migration must complete on a supported Kafka 3.x release
              before upgrading to 4.x. Kafka 4.x is KRaft-only. Finalization is irreversible.
              This tool does NOT execute commands or change any cluster.
            </p>
          </ResultSection>
        </ResultCard>
      </div>

      {/* Phase timeline */}
      <div className="kraft-print-hide rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Migration Phase Timeline
        </h3>
        <div className="mt-3">
          <PhaseTimeline currentPhaseId={result.assumptions.migrationPhase} />
        </div>
        <div className="mt-3 space-y-1 text-xs text-fd-muted-foreground">
          <p>
            <span className="font-medium">Rollback:</span>{" "}
            {result.phaseNavigation.rollbackSupported ? "Supported (not risk-free — see controller-epoch caveat in 3.9 docs)" : "NOT supported (irreversible)"} —{" "}
            {result.phaseNavigation.rollbackNote}
          </p>
          {result.phaseNavigation.nextPhase && (
            <p>
              <span className="font-medium">Next phase:</span>{" "}
              {result.phaseNavigation.nextPhase.label}
            </p>
          )}
        </div>
      </div>

      {/* Findings */}
      {result.findings.length > 0 && (
        <div className="kraft-print-hide rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
            Findings
          </h3>
          <div className="mt-3 space-y-2">
            {result.findings.map((f) => (
              <div
                key={f.id}
                className={cn(
                  "rounded-md border p-3",
                  f.severity === "blocker" && "border-red-500/20 bg-red-500/5",
                  f.severity === "warning" && "border-amber-500/20 bg-amber-500/5",
                  f.severity === "info" && "border-sky-500/20 bg-sky-500/5",
                )}
              >
                <div className="flex items-center gap-2">
                  <Badge tone={SEVERITY_TONE[f.severity] ?? "neutral"}>
                    {f.severity}
                  </Badge>
                  <span className="font-mono text-[10px] text-fd-muted-foreground">{f.id}</span>
                </div>
                <p className="mt-1 text-xs text-fd-muted-foreground">{f.message}</p>
                {f.detail && (
                  <p className="mt-0.5 text-xs text-fd-muted-foreground/70">{f.detail}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preflight checklist — focused print artifact */}
      <div className="kraft-checklist-print rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5" id="kraft-checklist">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
            Preflight Checklist
          </h3>
          <button
            type="button"
            onClick={() => window.print()}
            className="kraft-print-hide inline-flex min-h-[44px] items-center gap-1 rounded-md border border-fd-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-fd-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
            aria-label="Print preflight checklist"
          >
            Print checklist
          </button>
        </div>
        <div className="mt-3">
          <ChecklistSection items={result.checklist} />
        </div>
      </div>

      {/* Observability recommendations */}
      <div className="kraft-print-hide rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
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

      {/* Version baseline */}
      <div className="kraft-print-hide rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Version Baseline and Sources
        </h3>
        <div className="mt-3 space-y-2 text-xs text-fd-muted-foreground">
          <p>
            Reviewed release: Kafka {result.versionBaseline.reviewedRelease} (released{" "}
            {result.versionBaseline.releaseDate}). Review date:{" "}
            {result.versionBaseline.reviewDate}.
          </p>
          <p className="text-amber-600 dark:text-amber-400">
            {result.versionBaseline.caveat}
          </p>
          <div className="mt-2 space-y-1">
            {result.sources.map((source, i) => (
              <a
                key={i}
                href={source.url}
                target="_blank"
                rel="noreferrer noopener"
                className="block text-xs underline-offset-4 hover:underline"
              >
                {source.label} — {source.scope}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Resource links */}
      {result.resourceLinks.length > 0 && (
        <div className="kraft-print-hide rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
            Related Resources
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {result.resourceLinks.map((rl, i) => {
              const cls = "inline-flex min-h-[44px] items-center gap-1 rounded-md border border-fd-border bg-fd-card px-2 py-1 text-xs font-medium transition-colors hover:bg-fd-accent";
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
      <div className="kraft-print-hide">
        <AssumptionsNote
          items={[
            `Kafka version: ${result.assumptions.kafkaVersion} (parsed: ${result.assumptions.parsedVersion.major}.${result.assumptions.parsedVersion.minor}.${result.assumptions.parsedVersion.patch}${result.assumptions.parsedVersion.preRelease ? `-${result.assumptions.parsedVersion.preRelease}` : ""}).`,
            `Metadata mode: ${result.assumptions.metadataMode}. Phase: ${result.assumptions.migrationPhase}.`,
            `Vendor: ${result.assumptions.vendorLabel}. Production: ${result.assumptions.production ? "yes" : "no"}.`,
            `Controllers: ${result.assumptions.controllerCount} (IDs: ${result.assumptions.controllerNodeIds.join(", ")}). Brokers: ${result.assumptions.brokerNodeIds.length} (IDs: ${result.assumptions.brokerNodeIds.join(", ")}).`,
            `Controller listeners: ${result.assumptions.controllerListenerNames.join(", ") || "none"}.`,
            `Quorum mode: ${result.assumptions.quorumMode}.`,
            result.assumptions.quorumMode === "static"
              ? `Quorum voters: ${result.assumptions.quorumVoters.map((v) => `${v.nodeId}@${v.host}:${v.port}`).join(", ") || "none"}.`
              : `Bootstrap servers: ${result.assumptions.bootstrapServers.map((s) => `${s.host}:${s.port}`).join(", ") || "none"}.`,
            `ACL health: ${result.assumptions.aclHealth}. Log dir health: ${result.assumptions.logDirHealth} (${result.assumptions.failedLogDirCount} failed).`,
            "Deterministic planning aid — not a live diagnosis. Does NOT execute commands.",
            "No data was sent to any external service. Everything ran locally.",
          ]}
        />
      </div>
    </div>
  );
}
