"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { ResultCard, ResultSection } from "@/components/workbench/result-card";
import { AssumptionsNote } from "@/components/workbench/assumptions-note";
import type {
  MessageSizeAnalysisResult,
  MessageSizeZone,
  MessageSizeStageResult,
  MessageSizeStageStatus,
  MessageSizeAlignmentGap,
} from "@kafka-hub/kafka-planners/message-size";

// ─── Zone Display ───────────────────────────────────────────────────────────

const ZONE_CONFIG: Record<
  MessageSizeZone,
  { label: string; tone: "critical" | "high" | "medium" | "low"; description: string }
> = {
  "all-clear": {
    label: "All Clear",
    tone: "low",
    description: "All stages pass for the actual batch. Message size is within all configured limits.",
  },
  "replication-risk": {
    label: "Replication Risk",
    tone: "high",
    description:
      "The broker accepts the batch but follower fetch settings are smaller than the batch. " +
      "Kafka's progress exception may still deliver oversized batches, but this is fragile. Align settings to avoid relying on it.",
  },
  "consumption-risk": {
    label: "Consumption Risk",
    tone: "medium",
    description:
      "The broker accepts and replicates the batch but consumer fetch settings are smaller than the batch. " +
      "Kafka's progress exception may still deliver oversized batches, but this is fragile.",
  },
  rejected: {
    label: "Rejected",
    tone: "critical",
    description: "The producer or broker will reject the message. Fix the failing stage(s) first.",
  },
};

// ─── Formatting ─────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GiB`;
}

// ─── Status Display ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<MessageSizeStageStatus, { label: string; badgeTone: "success" | "warning" | "danger" }> = {
  "pass": { label: "PASS", badgeTone: "success" },
  "pass-without-headroom": { label: "PASS (no headroom)", badgeTone: "warning" },
  "fail": { label: "FAIL", badgeTone: "danger" },
};

// ─── Stage Chain ────────────────────────────────────────────────────────────

function StageRow({ stage, index, isFirstFailure, isFirstAlignmentGap }: {
  stage: MessageSizeStageResult;
  index: number;
  isFirstFailure: boolean;
  isFirstAlignmentGap: boolean;
}) {
  const statusCfg = STATUS_CONFIG[stage.status];

  return (
    <div
      className={cn(
        "rounded-md border p-3",
        stage.status === "pass"
          ? "border-fd-border bg-fd-card"
          : stage.status === "fail"
            ? isFirstFailure
              ? "border-red-500/30 bg-red-500/5"
              : "border-red-500/20 bg-red-500/5"
            : "border-amber-500/20 bg-amber-500/5",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-fd-muted-foreground">#{index + 1}</span>
        <Badge tone={statusCfg.badgeTone}>
          {statusCfg.label}
        </Badge>
        <span className="text-sm font-medium">{stage.label}</span>
        {isFirstFailure && (
          <Badge tone="danger">First Hard Failure</Badge>
        )}
        {isFirstAlignmentGap && (
          <Badge tone="warning">First Alignment Gap</Badge>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-fd-muted-foreground sm:grid-cols-4">
        <div>
          <span className="font-medium">Configured:</span> {fmtBytes(stage.configuredLimitBytes)}
        </div>
        <div>
          <span className="font-medium">Actual:</span> {fmtBytes(stage.actualRequiredBytes)}
        </div>
        <div>
          <span className="font-medium">Aligned:</span> {fmtBytes(stage.alignedRequiredBytes)}
        </div>
        <div>
          <span className="font-medium">Stage ID:</span>{" "}
          <code className="font-mono text-[11px]">{stage.stageId}</code>
        </div>
      </div>
      <p className="mt-2 text-xs text-fd-muted-foreground">{stage.rationale}</p>
    </div>
  );
}

// ─── Alignment Gap Display ──────────────────────────────────────────────────

function AlignmentGapCard({ gap }: { gap: MessageSizeAlignmentGap }) {
  return (
    <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warning">{gap.reason === "headroom-gap" ? "Headroom Gap" : "Envelope Gap"}</Badge>
        <span className="text-sm font-medium">{gap.label}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-fd-muted-foreground">
        <div>
          <span className="font-medium">Configured:</span> {fmtBytes(gap.configuredLimitBytes)}
        </div>
        <div>
          <span className="font-medium">Target:</span> {fmtBytes(gap.targetBytes)}
        </div>
      </div>
      <p className="mt-2 text-xs text-fd-muted-foreground">{gap.explanation}</p>
    </div>
  );
}

// ─── Results Display ────────────────────────────────────────────────────────

export function MessageSizeResults({ result }: { result: MessageSizeAnalysisResult }) {
  const zoneCfg = ZONE_CONFIG[result.zone];
  const failCount = result.stages.filter(s => s.status === "fail").length;
  const headroomGapCount = result.stages.filter(s => s.status === "pass-without-headroom").length;
  const passCount = result.stages.filter(s => s.status === "pass").length;

  const firstFailureStageId = result.firstFailure?.stageId ?? null;
  const firstAlignmentGapStageId = result.firstAlignmentGap?.stageId ?? null;

  return (
    <div className="flex flex-col gap-4">
      {/* Zone status card */}
      <ResultCard
        title={zoneCfg.label}
        tone={zoneCfg.tone}
        badge={`${passCount} pass, ${headroomGapCount} no-headroom, ${failCount} fail`}
        subtitle={zoneCfg.description}
      >
        <ResultSection title="Zone explanation">
          <p className="text-xs text-fd-muted-foreground">{result.zoneExplanation}</p>
        </ResultSection>
      </ResultCard>

      {/* Stage chain */}
      <div className="rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Stage Chain
        </h3>
        <p className="mt-1 text-xs text-fd-muted-foreground">
          Evaluation order: record→batch consistency → producer → topic/broker acceptance → replica fetch → consumer partition fetch → consumer total fetch.
          Status distinguishes hard failure (FAIL) from headroom-only gap (PASS no headroom) and full alignment (PASS).
        </p>
        <div className="mt-3 space-y-2">
          {result.stages.map((stage, i) => (
            <StageRow
              key={stage.stageId}
              stage={stage}
              index={i}
              isFirstFailure={stage.stageId === firstFailureStageId}
              isFirstAlignmentGap={stage.stageId === firstAlignmentGapStageId && stage.stageId !== firstFailureStageId}
            />
          ))}
        </div>
      </div>

      {/* First failure explanation */}
      {result.firstFailure && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 sm:p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-300">
            First Hard Failure: {result.firstFailure.label}
          </h3>
          <p className="mt-2 text-xs text-fd-muted-foreground">{result.firstFailure.rationale}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="font-medium text-fd-muted-foreground">Configured limit:</span>{" "}
              <span className="font-mono">{fmtBytes(result.firstFailure.configuredLimitBytes)}</span>
            </div>
            <div>
              <span className="font-medium text-fd-muted-foreground">Actual batch:</span>{" "}
              <span className="font-mono">{fmtBytes(result.firstFailure.actualRequiredBytes)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Alignment gaps */}
      {result.alignmentGaps.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 sm:p-5">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            <Badge tone="warning">Alignment Gaps</Badge>
            {result.alignmentGaps.length === 1 ? "1 gap" : `${result.alignmentGaps.length} gaps`}
          </h3>
          <p className="mt-2 text-xs text-fd-muted-foreground">
            These stages pass for the current batch but are below the recommended alignment target.
            The actual batch will not be rejected, but the configuration has gaps that could cause
            issues with larger batches that the broker is configured to accept.
          </p>
          <div className="mt-3 space-y-2">
            {result.alignmentGaps.map((gap, i) => (
              <AlignmentGapCard key={`${gap.stageId}-${gap.reason}-${i}`} gap={gap} />
            ))}
          </div>
        </div>
      )}

      {/* Zone-specific warnings */}
      {result.zone === "replication-risk" && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 sm:p-5">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            <Badge tone="warning">Replication Risk</Badge>
            Accepted but follower fetch undersized
          </h3>
          <p className="mt-2 text-xs text-fd-muted-foreground">
            The broker accepts the batch but follower replicas have fetch settings smaller than the batch.
            Kafka&apos;s ReplicaFetcherThread has a progress exception that can return an oversized first batch,
            so replication is not impossible — but relying on this behavior risks under-replication under load
            and causes extra round-trips. Align replica.fetch.max.bytes to avoid depending on progress exceptions.
          </p>
        </div>
      )}

      {result.zone === "consumption-risk" && (
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 sm:p-5">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">
            <Badge tone="info">Consumption Risk</Badge>
            Accepted and replicated but consumer fetch undersized
          </h3>
          <p className="mt-2 text-xs text-fd-muted-foreground">
            The broker accepts the batch and followers can replicate it,
            but consumer fetch settings are smaller than the batch.
            Kafka consumers have a similar progress exception for first-batch fetches,
            so consumption is not impossible — but undersized settings cause extra round-trips,
            increased latency, and fragile behavior.
          </p>
        </div>
      )}

      {/* Aligned patch */}
      <div className="rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Aligned Configuration Patch
        </h3>
        <p className="mt-1 text-xs text-fd-muted-foreground">{result.patch.explanation}</p>

        {/* Patch entries table */}
        <div className="mt-3 overflow-x-auto" role="region" aria-label="Configuration patch entries" tabIndex={0}>
          <table className="w-full min-w-[600px] text-xs">
            <thead>
              <tr className="border-b border-fd-border text-left">
                <th className="pb-2 pr-3 font-medium text-fd-muted-foreground">Property</th>
                <th className="pb-2 pr-3 font-medium text-fd-muted-foreground">Scope</th>
                <th className="pb-2 pr-3 text-right font-medium text-fd-muted-foreground">Current</th>
                <th className="pb-2 pr-3 text-right font-medium text-fd-muted-foreground">Recommended</th>
                <th className="pb-2 pr-3 font-medium text-fd-muted-foreground">Status</th>
                <th className="pb-2 font-medium text-fd-muted-foreground">Reason</th>
              </tr>
            </thead>
            <tbody>
              {result.patch.entries.map((entry) => (
                <tr key={`${entry.scope}-${entry.property}`} className="border-b border-fd-border/30">
                  <td className="py-1.5 pr-3 font-mono text-fd-foreground">{entry.property}</td>
                  <td className="py-1.5 pr-3 text-fd-muted-foreground">{entry.scope}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{fmtBytes(entry.currentBytes)}</td>
                  <td className={cn(
                    "py-1.5 pr-3 text-right font-mono",
                    entry.changed && "font-semibold text-fd-foreground",
                  )}>
                    {fmtBytes(entry.recommendedBytes)}
                  </td>
                  <td className="py-1.5 pr-3">
                    <Badge tone={entry.changed ? "warning" : "success"}>
                      {entry.changed ? "changed" : "ok"}
                    </Badge>
                  </td>
                  <td className="py-1.5 text-fd-muted-foreground">
                    {entry.targetReason !== "none" ? entry.targetReason : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Rendered snippet */}
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-fd-muted-foreground hover:text-fd-foreground">
            View .properties snippet
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-md border border-fd-border bg-fd-muted/30 p-3 font-mono text-[11px] text-fd-muted-foreground">
            {result.patch.snippet}
          </pre>
        </details>
      </div>

      {/* Blob storage recommendation */}
      <div className={cn(
        "rounded-xl border p-4 sm:p-5",
        result.blobRecommendation.recommended
          ? "border-amber-500/20 bg-amber-500/5"
          : "border-fd-border bg-fd-card",
      )}>
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Blob Storage Recommendation
          {result.blobRecommendation.recommended && (
            <Badge tone="warning">recommended</Badge>
          )}
        </h3>
        <p className="mt-2 text-xs text-fd-muted-foreground">{result.blobRecommendation.guidance}</p>
        <p className="mt-1 text-[11px] text-fd-muted-foreground/70">
          Threshold: {fmtBytes(result.blobRecommendation.thresholdBytes)}.
          This is a design recommendation — not a universal Kafka limit.
        </p>
      </div>

      {/* Formulas & assumptions */}
      <div className="rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Formulas and Assumptions
        </h3>
        <div className="mt-3 space-y-2 font-mono text-[11px] text-fd-muted-foreground">
          <p>requiredAlignedLimit = ceil(batchSizeBytes × (1 + safetyHeadroomFraction))</p>
          <p>
            = ceil({result.assumptions.batchSizeBytes} × (1 + {result.assumptions.safetyHeadroomFraction}))
            = {result.assumptions.requiredAlignedLimitBytes} B
          </p>
          <p className="mt-2 text-[10px] not-italic">
            Rounding: Math.ceil — always rounds up to the next whole byte.
            {result.assumptions.safetyHeadroomFraction === 0 && " Headroom is 0% — aligned target equals batch size."}
          </p>
          {result.assumptions.topicOverrideMaxMessageBytes !== null ? (
            <p>
              Effective acceptance = topic max.message.bytes override ({fmtBytes(result.assumptions.topicOverrideMaxMessageBytes)}).
              The broker default ({fmtBytes(result.assumptions.brokerMessageMaxBytes)}) only applies to topics without this override.
            </p>
          ) : (
            <p>
              Effective acceptance = broker message.max.bytes default ({fmtBytes(result.assumptions.brokerMessageMaxBytes)}).
              No topic-level override is modeled.
            </p>
          )}
          <p className="mt-2 text-[10px]">
            Zone classification is based on actual batch size pass/fail, not headroom. Alignment gaps are reported
            separately when the batch fits but the headroom target or acceptance envelope does not.
          </p>
          <p className="mt-2 text-[10px]">
            Compressed vs uncompressed: the planner operates on the produced (potentially compressed) record batch size.
            The broker checks message.max.bytes against the compressed batch when compression is on.
            Supply the actual on-wire batch size for accurate analysis.
          </p>
        </div>
      </div>

      {/* Observability recommendations */}
      <div className="rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
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

      {/* Assumptions note */}
      <AssumptionsNote
        items={[
          `Record size: ${fmtBytes(result.assumptions.recordSizeBytes)}, Batch size: ${fmtBytes(result.assumptions.batchSizeBytes)}.`,
          `Safety headroom: ${(result.assumptions.safetyHeadroomFraction * 100).toFixed(0)}%. Required aligned limit: ${fmtBytes(result.assumptions.requiredAlignedLimitBytes)}.`,
          `Producer max.request.size: ${fmtBytes(result.assumptions.producerMaxRequestSize)}.`,
          result.assumptions.topicOverrideMaxMessageBytes !== null
            ? `Topic max.message.bytes override: ${fmtBytes(result.assumptions.topicOverrideMaxMessageBytes)}. Broker default: ${fmtBytes(result.assumptions.brokerMessageMaxBytes)}.`
            : `Broker message.max.bytes default: ${fmtBytes(result.assumptions.brokerMessageMaxBytes)}. No topic override.`,
          `Follower replica.fetch.max.bytes: ${fmtBytes(result.assumptions.replicaFetchMaxBytes)}.`,
          `Consumer max.partition.fetch.bytes: ${fmtBytes(result.assumptions.consumerMaxPartitionFetchBytes)}, fetch.max.bytes: ${fmtBytes(result.assumptions.consumerFetchMaxBytes)}.`,
          `Blob storage threshold: ${fmtBytes(result.assumptions.blobStorageThresholdBytes)}.`,
          "Zone classification uses actual batch pass/fail. Alignment gaps are advisory.",
          "The planner operates on the produced (potentially compressed) record batch size as supplied.",
          "Static analysis — not a live diagnosis. No data was sent to any external service.",
        ]}
      />
    </div>
  );
}
