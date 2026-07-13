"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LabeledTextarea, LabeledField } from "@/components/workbench/labeled-field";
import { ValidationSummary } from "@/components/workbench/validation-summary";
import { ExportActions } from "@/components/workbench/export-actions";
import { EmptyState } from "@/components/workbench/empty-state";
import {
  analyzeLag,
  exportLagMarkdown,
  exportLagJson,
  DEFAULT_HOT_MULTIPLIER,
  DEFAULT_HOT_MIN_LAG,
} from "@kafka-hub/kafka-planners/lag";
import type {
  LagTriageResult,
  ValidationIssue,
} from "@kafka-hub/kafka-planners/lag";
import { SAMPLE_INPUT, sampleInputToJson } from "./lag-sample-data";
import { LagResults } from "./lag-results";

// ─── Component ──────────────────────────────────────────────────────────────

export function LagClient() {
  const [snapshotsJson, setSnapshotsJson] = useState("");
  const [intervalStr, setIntervalStr] = useState("60");
  const [throughputStr, setThroughputStr] = useState("");
  const [drainTargetStr, setDrainTargetStr] = useState("");
  const [hotMultiplierStr, setHotMultiplierStr] = useState(String(DEFAULT_HOT_MULTIPLIER));
  const [hotMinLagStr, setHotMinLagStr] = useState(String(DEFAULT_HOT_MIN_LAG));

  const [result, setResult] = useState<LagTriageResult | null>(null);
  const [validationIssues, setValidationIssues] = useState<readonly ValidationIssue[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);

  const handleAnalyze = useCallback(() => {
    setResult(null);
    setValidationIssues([]);
    setParseError(null);

    // Parse JSON to get the raw snapshots
    const trimmed = snapshotsJson.trim();
    if (!trimmed) {
      setParseError("Snapshot JSON is empty.");
      setHasAnalyzed(true);
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      setParseError("Invalid JSON. Check for syntax errors.");
      setHasAnalyzed(true);
      return;
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      setParseError("Expected a JSON object with snapshotBefore and snapshotAfter.");
      setHasAnalyzed(true);
      return;
    }

    const obj = parsed as Record<string, unknown>;

    // Build the full input object — analyzeLag accepts unknown and
    // will structurally validate everything, including malformed snapshots.
    const interval = Number(intervalStr);
    const throughput = throughputStr.trim() ? Number(throughputStr) : undefined;
    const drainTarget = drainTargetStr.trim() ? Number(drainTargetStr) : undefined;
    const hotMultiplier = hotMultiplierStr.trim()
      ? Number(hotMultiplierStr)
      : undefined;
    const hotMinLag = hotMinLagStr.trim() ? Number(hotMinLagStr) : undefined;

    const input: Record<string, unknown> = {
      snapshotBefore: obj.snapshotBefore,
      snapshotAfter: obj.snapshotAfter,
      intervalSeconds: interval,
      ...(throughput !== undefined || drainTarget !== undefined
        ? {
            assumptions: {
              ...(throughput !== undefined
                ? { perConsumerThroughput: throughput }
                : {}),
              ...(drainTarget !== undefined ? { drainTargetSeconds: drainTarget } : {}),
            },
          }
        : {}),
      ...(hotMultiplier !== undefined ? { hotPartitionMultiplier: hotMultiplier } : {}),
      ...(hotMinLag !== undefined ? { hotPartitionMinLag: hotMinLag } : {}),
    };

    // analyzeLag accepts unknown — never throws on malformed input
    const analysisResult = analyzeLag(input);
    if (analysisResult.ok) {
      setResult(analysisResult.result);
      setValidationIssues([]);
    } else {
      setValidationIssues(analysisResult.issues);
      setResult(null);
    }
    setHasAnalyzed(true);
  }, [snapshotsJson, intervalStr, throughputStr, drainTargetStr, hotMultiplierStr, hotMinLagStr]);

  const handleLoadSample = useCallback(() => {
    setSnapshotsJson(sampleInputToJson());
    setIntervalStr(String(SAMPLE_INPUT.intervalSeconds));
    setThroughputStr(
      SAMPLE_INPUT.assumptions?.perConsumerThroughput
        ? String(SAMPLE_INPUT.assumptions.perConsumerThroughput)
        : "",
    );
    setDrainTargetStr(
      SAMPLE_INPUT.assumptions?.drainTargetSeconds
        ? String(SAMPLE_INPUT.assumptions.drainTargetSeconds)
        : "",
    );
    setHotMultiplierStr(String(DEFAULT_HOT_MULTIPLIER));
    setHotMinLagStr(String(DEFAULT_HOT_MIN_LAG));
    setResult(null);
    setValidationIssues([]);
    setParseError(null);
    setHasAnalyzed(false);
  }, []);

  const handleClear = useCallback(() => {
    setSnapshotsJson("");
    setIntervalStr("60");
    setThroughputStr("");
    setDrainTargetStr("");
    setHotMultiplierStr(String(DEFAULT_HOT_MULTIPLIER));
    setHotMinLagStr(String(DEFAULT_HOT_MIN_LAG));
    setResult(null);
    setValidationIssues([]);
    setParseError(null);
    setHasAnalyzed(false);
  }, []);

  const handleExportMarkdown = useCallback(() => {
    if (!result) return { content: "", redactionSummary: "" };
    const exp = exportLagMarkdown(result);
    return { content: exp.content, redactionSummary: exp.redactionSummary };
  }, [result]);

  const handleExportJson = useCallback(() => {
    if (!result) return { content: "", redactionSummary: "" };
    const exp = exportLagJson(result);
    return { content: exp.content, redactionSummary: exp.redactionSummary };
  }, [result]);

  const allErrors = [
    ...(parseError ? [parseError] : []),
    ...validationIssues.map((i) => `[${i.kind}] ${i.message}`),
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      {/* Input panel */}
      <div className="flex flex-col gap-4">
        <LabeledTextarea
          label="Offset Snapshots (JSON)"
          description={
            'Paste JSON with "snapshotBefore" and "snapshotAfter" objects. ' +
            "Each must have a partitions array with partitionId, committedOffset, currentOffset, logEndOffset. " +
            'Optional: groupState on each snapshot ("stable", "preparing-rebalance", etc.).'
          }
          value={snapshotsJson}
          onChange={(e) => setSnapshotsJson(e.target.value)}
          placeholder={`{\n  "snapshotBefore": {\n    "partitions": [\n      { "partitionId": "topic-0", "committedOffset": 100, "currentOffset": 100, "logEndOffset": 200 }\n    ],\n    "groupState": "stable"\n  },\n  "snapshotAfter": { ... }\n}`}
          required
          className="min-h-[160px] sm:min-h-[220px]"
          error={parseError ?? undefined}
        />

        {/* Numeric fields */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <LabeledField
            label="Interval (seconds)"
            description="Time between the two snapshots."
            required
            error={
              intervalStr.trim() && (isNaN(Number(intervalStr)) || Number(intervalStr) <= 0)
                ? "Must be a positive number."
                : undefined
            }
          >
            {(fieldProps) => (
              <input
                {...fieldProps}
                type="number"
                min="1"
                step="1"
                value={intervalStr}
                onChange={(e) => setIntervalStr(e.target.value)}
                className={cn(
                  "h-9 w-full rounded-lg border bg-fd-card px-3 font-mono text-sm transition-colors min-h-[44px]",
                  "placeholder:text-fd-muted-foreground/60",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring",
                  fieldProps["aria-invalid"]
                    ? "border-red-500/50 focus-visible:ring-red-500/30"
                    : "border-fd-border",
                )}
              />
            )}
          </LabeledField>

          <LabeledField
            label="Per-consumer throughput"
            description="Records/sec per consumer (for capacity planning)."
          >
            {(fieldProps) => (
              <input
                {...fieldProps}
                type="number"
                min="1"
                step="1"
                value={throughputStr}
                onChange={(e) => setThroughputStr(e.target.value)}
                placeholder="e.g. 500"
                className={cn(
                  "h-9 w-full rounded-lg border border-fd-border bg-fd-card px-3 font-mono text-sm transition-colors min-h-[44px]",
                  "placeholder:text-fd-muted-foreground/60",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring",
                )}
              />
            )}
          </LabeledField>

          <LabeledField
            label="Drain target (seconds)"
            description="Desired time to drain the backlog."
          >
            {(fieldProps) => (
              <input
                {...fieldProps}
                type="number"
                min="1"
                step="1"
                value={drainTargetStr}
                onChange={(e) => setDrainTargetStr(e.target.value)}
                placeholder="e.g. 600"
                className={cn(
                  "h-9 w-full rounded-lg border border-fd-border bg-fd-card px-3 font-mono text-sm transition-colors min-h-[44px]",
                  "placeholder:text-fd-muted-foreground/60",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring",
                )}
              />
            )}
          </LabeledField>

          <LabeledField
            label="Hot partition multiplier"
            description={`Lag > peer mean × multiplier flags hot. Default: ${DEFAULT_HOT_MULTIPLIER}.`}
          >
            {(fieldProps) => (
              <input
                {...fieldProps}
                type="number"
                min="1"
                step="0.1"
                value={hotMultiplierStr}
                onChange={(e) => setHotMultiplierStr(e.target.value)}
                className={cn(
                  "h-9 w-full rounded-lg border border-fd-border bg-fd-card px-3 font-mono text-sm transition-colors min-h-[44px]",
                  "placeholder:text-fd-muted-foreground/60",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring",
                )}
              />
            )}
          </LabeledField>

          <LabeledField
            label="Hot partition min lag"
            description={`Minimum absolute lag to flag hot. Default: ${DEFAULT_HOT_MIN_LAG}.`}
          >
            {(fieldProps) => (
              <input
                {...fieldProps}
                type="number"
                min="0"
                step="1"
                value={hotMinLagStr}
                onChange={(e) => setHotMinLagStr(e.target.value)}
                className={cn(
                  "h-9 w-full rounded-lg border border-fd-border bg-fd-card px-3 font-mono text-sm transition-colors min-h-[44px]",
                  "placeholder:text-fd-muted-foreground/60",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring",
                )}
              />
            )}
          </LabeledField>
        </div>

        {/* Validation summary — shows typed issue kinds */}
        {allErrors.length > 0 && <ValidationSummary errors={allErrors} />}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="md"
            onClick={handleAnalyze}
            disabled={!snapshotsJson.trim()}
            className="min-h-[44px]"
          >
            Analyze lag
          </Button>
          <Button variant="secondary" size="sm" onClick={handleLoadSample} className="min-h-[44px]">
            Load sample
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={!snapshotsJson && !hasAnalyzed}
            className="min-h-[44px]"
          >
            Clear
          </Button>
        </div>

        {/* Formulas/explanations */}
        <details className="group rounded-lg border border-fd-border bg-fd-muted/20 p-3">
          <summary className="cursor-pointer text-xs font-medium text-fd-muted-foreground select-none min-h-[44px] flex items-center">
            Formulas and classification precedence
          </summary>
          <div className="mt-2 space-y-2 text-xs text-fd-muted-foreground">
            <p>
              <strong>Per partition (committed):</strong>{" "}
              <code>lag = logEndOffset - committedOffset</code>,{" "}
              <code>lagDelta = lagAfter - lagBefore</code>,{" "}
              <code>lagRate = lagDelta / interval</code>,{" "}
              <code>ingressRate = (logEndAfter - logEndBefore) / interval</code>,{" "}
              <code>committedRate = (committedAfter - committedBefore) / interval</code>.
            </p>
            <p>
              <strong>Per partition (current):</strong>{" "}
              <code>currentDelta = currentAfter - currentBefore</code>,{" "}
              <code>currentRate = currentDelta / interval</code>.
              Current-position progress is tracked separately from committed-offset progress.
            </p>
            <p>
              <strong>Skew:</strong>{" "}
              <code>CV = stddev(lag) / mean(lag)</code>. Null when mean is 0.
            </p>
            <p>
              <strong>Hot partition (peer-baseline):</strong>{" "}
              for each partition, <code>peerMean = (totalLag - partitionLag) / (N - 1)</code>.{" "}
              <code>isHot = lag &gt; peerMean × multiplier AND lag &ge; minLag</code>.{" "}
              Requires ≥ 2 partitions. Single-partition groups cannot have hot partitions.
            </p>
            <p>
              <strong>Drain ETA (committed):</strong>{" "}
              <code>totalLag / (committedRate - ingressRate)</code> when draining.
              Unavailable during offset regressions.
            </p>
            <p>
              <strong>Classification precedence</strong> (highest first):{" "}
              group-unstable (group state OR offset regressions) → hot-partition → growing → stalled → draining → stable-backlog → caught-up.
            </p>
          </div>
        </details>
      </div>

      {/* Results panel */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fd-muted-foreground">
            Results
          </h2>
          {result && (
            <Badge tone="neutral">
              {result.partitions.length} partition{result.partitions.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        {/* Empty state */}
        {!result && !hasAnalyzed && (
          <EmptyState
            title="No snapshots analyzed yet"
            description="Paste offset snapshot JSON and click Analyze, or load the sample to try it out."
          />
        )}

        {/* Error state — shows all validation issues explicitly */}
        {!result && hasAnalyzed && allErrors.length > 0 && (
          <EmptyState
            title="Input rejected"
            description={allErrors[0]}
          />
        )}

        {/* Results */}
        {result && <LagResults result={result} />}

        {/* Export actions */}
        {result && (
          <ExportActions
            onExportMarkdown={handleExportMarkdown}
            onExportJson={handleExportJson}
            filenamePrefix="kafka-lag-analysis"
            disabled={!result}
          />
        )}
      </div>
    </div>
  );
}
