"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { ResultCard, ResultSection } from "@/components/workbench/result-card";
import { AssumptionsNote } from "@/components/workbench/assumptions-note";
import type {
  CapacityAnalysisResult,
  CapacityStatus,
  BrokerLoad,
} from "@kafka-hub/kafka-planners/capacity";

// ─── Status Display ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  CapacityStatus,
  { label: string; tone: "critical" | "high" | "medium" | "low"; description: string }
> = {
  pass: {
    label: "Pass",
    tone: "low",
    description: "All metrics within safety targets for both average and N-1 scenarios.",
  },
  warning: {
    label: "Warning",
    tone: "high",
    description: "Some metrics exceed the safety target but remain within absolute limits.",
  },
  fail: {
    label: "Fail",
    tone: "critical",
    description: "Capacity shortfall detected — storage or network exceeds broker limits.",
  },
};

// ─── Formatting ─────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  if (bytes < 1024 * 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GiB`;
  return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TiB`;
}

function fmtBytesPerSec(bytesPerSec: number): string {
  return `${fmtBytes(bytesPerSec)}/s`;
}

function fmtPct(ratio: number): string {
  if (!Number.isFinite(ratio)) return "N/A";
  return `${(ratio * 100).toFixed(1)}%`;
}

function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "N/A";
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} min`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} hr`;
  return `${(seconds / 86400).toFixed(1)} days`;
}

// ─── MetricTile ─────────────────────────────────────────────────────────────

function MetricTile({
  label,
  value,
  unit,
  alert,
}: {
  label: string;
  value: string;
  unit?: string;
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

// ─── BrokerLoadRow ──────────────────────────────────────────────────────────

function BrokerLoadComparisonTable({
  average,
  n1,
}: {
  average: BrokerLoad;
  n1?: BrokerLoad;
}) {
  const rows: Array<{
    label: string;
    avg: string;
    n1: string;
    avgAlert?: boolean;
    n1Alert?: boolean;
  }> = [
    {
      label: "Active brokers",
      avg: String(average.activeBrokers),
      n1: n1 ? String(n1.activeBrokers) : "N/A",
    },
    {
      label: "Storage/broker",
      avg: fmtBytes(average.storagePerBroker),
      n1: n1 ? fmtBytes(n1.storagePerBroker) : "N/A",
    },
    {
      label: "Network/broker",
      avg: fmtBytesPerSec(average.networkPerBroker),
      n1: n1 ? fmtBytesPerSec(n1.networkPerBroker) : "N/A",
    },
    {
      label: "Storage utilization",
      avg: fmtPct(average.storageUtilization),
      n1: n1 ? fmtPct(n1.storageUtilization) : "N/A",
      avgAlert: average.storageShortfall,
      n1Alert: n1?.storageShortfall,
    },
    {
      label: "Network utilization",
      avg: fmtPct(average.networkUtilization),
      n1: n1 ? fmtPct(n1.networkUtilization) : "N/A",
      avgAlert: average.networkShortfall,
      n1Alert: n1?.networkShortfall,
    },
    {
      label: "Storage headroom",
      avg: fmtPct(average.storageHeadroom),
      n1: n1 ? fmtPct(n1.storageHeadroom) : "N/A",
      avgAlert: average.storageHeadroom < 0,
      n1Alert: n1 ? n1.storageHeadroom < 0 : false,
    },
    {
      label: "Network headroom",
      avg: fmtPct(average.networkHeadroom),
      n1: n1 ? fmtPct(n1.networkHeadroom) : "N/A",
      avgAlert: average.networkHeadroom < 0,
      n1Alert: n1 ? n1.networkHeadroom < 0 : false,
    },
  ];

  return (
    <div className="overflow-x-auto" role="region" aria-label="Broker load comparison" tabIndex={0}>
      <table className="w-full min-w-[400px] text-xs">
        <thead>
          <tr className="border-b border-fd-border text-left">
            <th className="pb-2 pr-3 font-medium text-fd-muted-foreground">Metric</th>
            <th className="pb-2 pr-3 text-right font-medium text-fd-muted-foreground">Average</th>
            <th className="pb-2 text-right font-medium text-fd-muted-foreground">N-1</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-fd-border/30">
              <td className="py-1.5 pr-3 text-fd-muted-foreground">{row.label}</td>
              <td className={cn("py-1.5 pr-3 text-right font-mono", row.avgAlert && "text-red-600 dark:text-red-400")}>
                {row.avg}
              </td>
              <td className={cn("py-1.5 text-right font-mono", row.n1Alert && "text-red-600 dark:text-red-400")}>
                {row.n1}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Results Display ────────────────────────────────────────────────────────

export function CapacityResults({ result }: { result: CapacityAnalysisResult }) {
  const statusCfg = STATUS_CONFIG[result.status];

  return (
    <div className="flex flex-col gap-4">
      {/* Status card */}
      <ResultCard
        title={statusCfg.label}
        tone={statusCfg.tone}
        badge={`${result.warnings.filter((w) => w.severity === "critical").length} critical, ${result.warnings.filter((w) => w.severity === "warning").length} warnings`}
        subtitle={statusCfg.description}
      >
        <ResultSection title="Status summary">
          <div className="flex flex-wrap gap-1.5">
            {result.averageLoad.storageShortfall && <Badge tone="danger">avg storage shortfall</Badge>}
            {result.averageLoad.networkShortfall && <Badge tone="danger">avg network shortfall</Badge>}
            {result.n1Load?.storageShortfall && <Badge tone="danger">N-1 storage shortfall</Badge>}
            {result.n1Load?.networkShortfall && <Badge tone="danger">N-1 network shortfall</Badge>}
            {result.averageLoad.storageExceedsSafetyTarget && !result.averageLoad.storageShortfall && (
              <Badge tone="warning">avg storage above target</Badge>
            )}
            {result.averageLoad.networkExceedsSafetyTarget && !result.averageLoad.networkShortfall && (
              <Badge tone="warning">avg network above target</Badge>
            )}
            {!result.partitions.partitionCountSufficient && (
              <Badge tone="warning">insufficient partitions</Badge>
            )}
            {result.partitions.hottestPartitionExceedsTarget && (
              <Badge tone="warning">hot partition risk</Badge>
            )}
            {result.status === "pass" && (
              <Badge tone="success">all clear</Badge>
            )}
          </div>
        </ResultSection>
      </ResultCard>

      {/* Storage breakdown */}
      <div className="rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Storage
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricTile
            label="Logical uncompressed ingress"
            value={fmtBytesPerSec(result.storage.logicalUncompressedIngressBytesPerSec)}
          />
          <MetricTile
            label="Logical uncompressed retained"
            value={fmtBytes(result.storage.logicalUncompressedRetainedBytes)}
          />
          <MetricTile
            label="Compressed primary retained"
            value={fmtBytes(result.storage.compressedPrimaryRetainedBytes)}
          />
          <MetricTile
            label="Physical retained (with RF)"
            value={fmtBytes(result.storage.physicalRetainedBytes)}
          />
        </div>
      </div>

      {/* Network breakdown */}
      <div className="rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Network
        </h3>
        <p className="mt-1 text-xs text-fd-muted-foreground">
          Cluster traffic = producer ingress + follower replication + full-read consumer egress.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricTile
            label="Compressed ingress"
            value={fmtBytesPerSec(result.network.compressedIngressBytesPerSec)}
          />
          <MetricTile
            label="Follower replication"
            value={fmtBytesPerSec(result.network.followerReplicationBytesPerSec)}
          />
          <MetricTile
            label="Consumer read fan-out"
            value={fmtBytesPerSec(result.network.consumerReadBytesPerSec)}
          />
          <MetricTile
            label="Total cluster network"
            value={fmtBytesPerSec(result.network.totalClusterNetworkBytesPerSec)}
          />
        </div>
      </div>

      {/* Partitions */}
      <div className="rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Partitions
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MetricTile
            label="Minimum required"
            value={String(result.partitions.minimumPartitionsFromTarget)}
            alert={!result.partitions.partitionCountSufficient}
          />
          <MetricTile
            label="Configured"
            value={String(result.assumptions.partitionCount)}
            unit={result.partitions.partitionCountSufficient ? "sufficient" : "insufficient"}
            alert={!result.partitions.partitionCountSufficient}
          />
          <MetricTile
            label="Avg per-partition throughput"
            value={fmtBytesPerSec(result.partitions.avgPerPartitionThroughput)}
          />
          <MetricTile
            label="Skew-adjusted hottest"
            value={fmtBytesPerSec(result.partitions.skewAdjustedHottestPartitionThroughput)}
            alert={result.partitions.hottestPartitionExceedsTarget}
          />
          <MetricTile
            label="Per-partition target"
            value={fmtBytesPerSec(result.assumptions.perPartitionTargetThroughput)}
          />
        </div>
      </div>

      {/* Broker load: average vs N-1 */}
      <div className="rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Broker Load: Average vs N-1
        </h3>
        <p className="mt-1 text-xs text-fd-muted-foreground">
          Average assumes all {result.assumptions.brokerCount} brokers healthy.
          {result.n1Load
            ? ` N-1 models the impact of losing one broker (${result.n1Load.activeBrokers} remaining).`
            : " N-1 unavailable (single-broker cluster)."}
        </p>
        <div className="mt-3">
          <BrokerLoadComparisonTable average={result.averageLoad} n1={result.n1Load} />
        </div>
      </div>

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="rounded-xl border border-fd-border bg-fd-card p-4 sm:p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
            Warnings
          </h3>
          <div className="mt-3 space-y-2">
            {result.warnings.map((w) => (
              <div
                key={w.id}
                className={cn(
                  "rounded-md border p-3",
                  w.severity === "critical" && "border-red-500/20 bg-red-500/5",
                  w.severity === "warning" && "border-amber-500/20 bg-amber-500/5",
                  w.severity === "info" && "border-sky-500/20 bg-sky-500/5",
                )}
              >
                <div className="flex items-center gap-2">
                  <Badge
                    tone={w.severity === "critical" ? "danger" : w.severity === "warning" ? "warning" : "info"}
                  >
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
          `Peak ingress: ${result.assumptions.peakIngressRate.toLocaleString()} records/sec at ${fmtBytes(result.assumptions.avgRecordSizeBytes)}/record.`,
          `Compression ratio: ${result.assumptions.compressionRatio} (${(result.assumptions.compressionRatio * 100).toFixed(0)}% of uncompressed).`,
          `Retention: ${fmtDuration(result.assumptions.retentionSeconds)}.`,
          `Replication factor: ${result.assumptions.replicationFactor}, Brokers: ${result.assumptions.brokerCount}, Partitions: ${result.assumptions.partitionCount}.`,
          `Full-read consumer groups: ${result.assumptions.fullReadConsumerGroupCount}.`,
          `Per-broker storage: ${fmtBytes(result.assumptions.perBrokerStorageBytes)}, network: ${fmtBytesPerSec(result.assumptions.perBrokerNetworkBytesPerSec)}.`,
          `Safety utilization target: ${fmtPct(result.assumptions.safetyHeadroomTarget)}.`,
          `Skew factor: ${result.assumptions.skewFactor}x.`,
          "Network model: ingress + follower replication + full-read consumer egress. Bidirectional NIC approximated as busiest direction.",
          "Static analysis — not a live diagnosis. Vendor pricing is out of scope (user-entered). No vendor-specific limits implied.",
          "No data was sent to any external service. Everything ran locally.",
        ]}
      />
    </div>
  );
}
