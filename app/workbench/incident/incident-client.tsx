"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LabeledTextarea } from "@/components/workbench/labeled-field";
import { ValidationSummary } from "@/components/workbench/validation-summary";
import { ResultCard, ResultSection } from "@/components/workbench/result-card";
import { AssumptionsNote } from "@/components/workbench/assumptions-note";
import { ExportActions } from "@/components/workbench/export-actions";
import { EmptyState } from "@/components/workbench/empty-state";
import { LoadingState } from "@/components/workbench/loading-state";
import {
  analyze,
  exportMarkdown,
  exportJson,
  INPUT_LIMITS,
  countLines,
  type IncidentAnalysis,
  type Hypothesis,
  type ValidationError,
} from "@kafka-hub/incident-parser";

// ─── Sample Evidence ────────────────────────────────────────────────────────

const SAMPLE_EVIDENCE = `[2024-01-15 10:30:00,123] ERROR [ReplicaManager broker=1] Error processing append operation on partition test-topic-0 (kafka.server.ReplicaManager)
org.apache.kafka.common.errors.NotEnoughReplicasException: Number of insync replicas for partition test-topic-0 is [1], below required minimum [2]
[2024-01-15 10:30:00,456] WARN [ReplicaManager broker=1] ISR shrink for partition test-topic-0 from 3 to 1 (kafka.server.ReplicaManager)
[2024-01-15 10:30:01,789] ERROR [ReplicaManager broker=1] NotEnoughReplicasAfterAppend for partition test-topic-0 (kafka.server.ReplicaManager)
kafka.server:type=ReplicaManager,name=UnderMinIsrPartitionCount Value=3
kafka.server:type=ReplicaManager,name=UnderReplicatedPartitions Value=5
kafka.server:type=ReplicaManager,name=IsrShrinksPerSec Count=12
min.insync.replicas=2
default.replication.factor=3`;

// ─── Component ──────────────────────────────────────────────────────────────

export function IncidentClient() {
  const [input, setInput] = useState("");
  const [analysis, setAnalysis] = useState<IncidentAnalysis | null>(null);
  const [validationError, setValidationError] = useState<ValidationError | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);

  const inputByteCount = useMemo(
    () => new TextEncoder().encode(input).byteLength,
    [input],
  );
  const inputLineCount = useMemo(
    () => countLines(input),
    [input],
  );

  const handleAnalyze = useCallback(() => {
    setIsAnalyzing(true);
    setValidationError(null);
    setAnalysis(null);

    // Use requestAnimationFrame to let the UI update with loading state
    requestAnimationFrame(() => {
      const result = analyze(input);
      if (result.ok) {
        setAnalysis(result.analysis);
        setValidationError(null);
      } else {
        setValidationError(result.error);
        setAnalysis(null);
      }
      setIsAnalyzing(false);
      setHasAnalyzed(true);
    });
  }, [input]);

  const handleLoadSample = useCallback(() => {
    setInput(SAMPLE_EVIDENCE);
    setAnalysis(null);
    setValidationError(null);
    setHasAnalyzed(false);
  }, []);

  const handleClear = useCallback(() => {
    setInput("");
    setAnalysis(null);
    setValidationError(null);
    setHasAnalyzed(false);
  }, []);

  const handleExportMarkdown = useCallback(
    () => {
      if (!analysis) return { content: "", redactionSummary: "" };
      const result = exportMarkdown(analysis);
      return { content: result.content, redactionSummary: result.redactionSummary };
    },
    [analysis],
  );

  const handleExportJson = useCallback(
    () => {
      if (!analysis) return { content: "", redactionSummary: "" };
      const result = exportJson(analysis);
      return { content: result.content, redactionSummary: result.redactionSummary };
    },
    [analysis],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      {/* Input panel */}
      <div className="flex flex-col gap-3">
        <LabeledTextarea
          label="Evidence"
          description={`Paste logs, configs, stack traces, consumer-groups output, or metric snapshots. Max ${(INPUT_LIMITS.maxBytes / 1024).toFixed(0)} KB / ${INPUT_LIMITS.maxLines.toLocaleString()} lines.`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste Kafka incident evidence here..."
          className="min-h-[200px] sm:min-h-[300px]"
          error={validationError?.message}
        />

        {/* Limits display */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-fd-muted-foreground">
          <span className={cn("font-mono", inputByteCount > INPUT_LIMITS.maxBytes && "text-red-500")}>
            {(inputByteCount / 1024).toFixed(1)} / {(INPUT_LIMITS.maxBytes / 1024).toFixed(0)} KB
          </span>
          <span className={cn("font-mono", inputLineCount > INPUT_LIMITS.maxLines && "text-red-500")}>
            {inputLineCount.toLocaleString()} / {INPUT_LIMITS.maxLines.toLocaleString()} lines
          </span>
        </div>

        {validationError && (
          <ValidationSummary errors={[validationError.message]} />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="md"
            onClick={handleAnalyze}
            disabled={isAnalyzing || input.trim().length === 0}
          >
            {isAnalyzing ? "Analyzing..." : "Analyze evidence"}
          </Button>
          <Button variant="secondary" size="sm" onClick={handleLoadSample}>
            Load sample
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={input.length === 0}
          >
            Clear
          </Button>
        </div>
      </div>

      {/* Results panel */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fd-muted-foreground">
            Hypotheses
          </h2>
          {analysis && (
            <Badge tone="neutral">
              {analysis.hypotheses.length} result{analysis.hypotheses.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        {/* Loading state */}
        {isAnalyzing && <LoadingState message="Analyzing evidence..." />}

        {/* Empty state */}
        {!isAnalyzing && !analysis && !hasAnalyzed && (
          <EmptyState
            title="No evidence analyzed yet"
            description="Paste incident evidence in the input and click Analyze, or load the sample to try it out."
          />
        )}

        {/* No matches state */}
        {!isAnalyzing && analysis && analysis.hypotheses.length === 0 && (
          <EmptyState
            title="No matching signatures"
            description="No known Kafka failure patterns matched. This does not mean the evidence is clean — it may represent a scenario not yet in the pattern library."
          />
        )}

        {/* Error state (validation errors shown inline with input) */}
        {!isAnalyzing && hasAnalyzed && validationError && !analysis && (
          <EmptyState
            title="Input rejected"
            description={validationError.message}
          />
        )}

        {/* Results */}
        {analysis && analysis.hypotheses.length > 0 && (
          <div className="flex flex-col gap-3">
            {analysis.hypotheses.map((h) => (
              <HypothesisCard key={h.id} hypothesis={h} />
            ))}
          </div>
        )}

        {/* Export actions */}
        {analysis && analysis.hypotheses.length > 0 && (
          <ExportActions
            onExportMarkdown={handleExportMarkdown}
            onExportJson={handleExportJson}
            filenamePrefix="kafka-incident-triage"
            disabled={!analysis}
          />
        )}

        {/* Assumptions */}
        {analysis && (
          <AssumptionsNote
            items={[
              "Static pattern matching — not a live diagnosis.",
              "Confidence scores reflect pattern match strength, not certainty of root cause.",
              "No data was sent to any external service. Everything ran locally in the browser.",
              `Evidence: ${analysis.evidence.byteCount} bytes, ${analysis.evidence.lineCount} lines. Detected types: ${analysis.evidence.kinds.join(", ")}.`,
              `Engine version: ${analysis.engineVersion}.`,
            ]}
          />
        )}
      </div>
    </div>
  );
}

// ─── Hypothesis Card ────────────────────────────────────────────────────────

function HypothesisCard({ hypothesis: h }: { hypothesis: Hypothesis }) {
  return (
    <ResultCard
      title={h.title}
      tone={h.severity}
      badge={`${h.confidence}% confidence`}
      subtitle={h.confidenceReason}
    >
      {/* Supporting evidence */}
      {h.supportingEvidence.length > 0 && (
        <ResultSection title="Supporting evidence">
          <ul className="space-y-1">
            {h.supportingEvidence.map((e, i) => (
              <li key={i} className="text-xs">
                <code className="break-all rounded bg-fd-muted px-1 py-0.5 font-mono text-[11px]">
                  {e.text.length > 120 ? e.text.slice(0, 120) + "..." : e.text}
                </code>
                <span className="ml-1 text-fd-muted-foreground">
                  ({e.kind}, {e.sourceLines.map((sl) => `L${sl.line}`).join(", ")})
                </span>
              </li>
            ))}
          </ul>
        </ResultSection>
      )}

      {/* Conflicting evidence */}
      {h.conflictingEvidence.length > 0 && (
        <ResultSection title="Conflicting evidence">
          <ul className="space-y-1">
            {h.conflictingEvidence.map((e, i) => (
              <li key={i} className="text-xs text-fd-muted-foreground">
                <code className="break-all rounded bg-fd-muted px-1 py-0.5 font-mono text-[11px]">
                  {e.text.length > 120 ? e.text.slice(0, 120) + "..." : e.text}
                </code>
              </li>
            ))}
          </ul>
        </ResultSection>
      )}

      {/* Missing evidence */}
      {h.missingEvidence.length > 0 && (
        <ResultSection title="Missing evidence">
          <ul className="space-y-0.5">
            {h.missingEvidence.map((me, i) => (
              <li key={i} className="flex gap-2 text-xs text-fd-muted-foreground">
                <span aria-hidden className="font-mono text-fd-foreground/40">?</span>
                {me}
              </li>
            ))}
          </ul>
        </ResultSection>
      )}

      {/* Recommended next evidence */}
      {h.recommendedNextEvidence.length > 0 && (
        <ResultSection title="Next steps">
          <ul className="space-y-0.5">
            {h.recommendedNextEvidence.map((re, i) => (
              <li key={i} className="flex gap-2 text-xs text-fd-muted-foreground">
                <span aria-hidden className="font-mono text-fd-foreground/40">&rarr;</span>
                {re}
              </li>
            ))}
          </ul>
        </ResultSection>
      )}

      {/* Observability */}
      {h.observability.length > 0 && (
        <ResultSection title="Observability">
          <div className="space-y-2">
            {h.observability.map((obs, i) => (
              <div key={i} className="rounded-md border border-fd-border/50 bg-fd-muted/20 p-2">
                <p className="font-mono text-[11px] font-medium text-fd-foreground">
                  {obs.metric}
                </p>
                <p className="mt-0.5 text-xs text-fd-muted-foreground">{obs.description}</p>
                <p className="mt-1 text-xs text-fd-muted-foreground">
                  <span className="font-medium">Rationale:</span> {obs.rationale}
                </p>
                <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                  <span className="font-medium">Caveat:</span> {obs.caveat}
                </p>
              </div>
            ))}
          </div>
        </ResultSection>
      )}

      {/* Resource links */}
      {h.resourceLinks.length > 0 && (
        <ResultSection title="Resources">
          <div className="flex flex-wrap gap-2">
            {h.resourceLinks.map((rl, i) => (
              <Link
                key={i}
                href={rl.href}
                className="inline-flex items-center gap-1 rounded-md border border-fd-border bg-fd-card px-2 py-1 text-xs font-medium transition-colors hover:bg-fd-accent"
              >
                <span className="font-mono text-[10px] uppercase text-fd-muted-foreground">
                  {rl.surface}
                </span>
                {rl.label}
              </Link>
            ))}
          </div>
        </ResultSection>
      )}
    </ResultCard>
  );
}
