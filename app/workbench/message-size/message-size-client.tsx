"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { LabeledField } from "@/components/workbench/labeled-field";
import { ValidationSummary } from "@/components/workbench/validation-summary";
import { ExportActions } from "@/components/workbench/export-actions";
import { EmptyState } from "@/components/workbench/empty-state";
import {
  analyzeMessageSize,
  exportMessageSizeMarkdown,
  exportMessageSizeJson,
  DEFAULT_SAFETY_HEADROOM_FRACTION,
  DEFAULT_BLOB_STORAGE_THRESHOLD_BYTES,
} from "@kafka-hub/kafka-planners/message-size";
import type {
  MessageSizeAnalysisResult,
  MessageSizeValidationIssue,
} from "@kafka-hub/kafka-planners/message-size";
import { SAMPLE_INPUT } from "./message-size-sample-data";
import { MessageSizeResults } from "./message-size-results";

// ─── Unit conversion helpers ────────────────────────────────────────────────

const BYTES_UNITS = [
  { label: "B", factor: 1 },
  { label: "KiB", factor: 1024 },
  { label: "MiB", factor: 1024 * 1024 },
] as const;

type UnitOption = { label: string; factor: number };

function NumericFieldWithUnit({
  label,
  description,
  value,
  onChange,
  unit,
  onUnitChange,
  units,
  required,
  placeholder,
  min,
  step,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
  unit: string;
  onUnitChange: (u: string) => void;
  units: readonly UnitOption[];
  required?: boolean;
  placeholder?: string;
  min?: string;
  step?: string;
}) {
  return (
    <LabeledField label={label} description={description} required={required}>
      {(fieldProps) => (
        <div className="flex gap-1">
          <input
            {...fieldProps}
            type="number"
            min={min ?? "0"}
            step={step ?? "any"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={cn(
              "min-h-[44px] w-full rounded-lg border border-fd-border bg-fd-card px-3 font-mono text-sm transition-colors",
              "placeholder:text-fd-muted-foreground/60",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring",
            )}
          />
          {units.length > 1 && (
            <select
              value={unit}
              onChange={(e) => onUnitChange(e.target.value)}
              aria-label={`Unit for ${label}`}
              className={cn(
                "min-h-[44px] shrink-0 rounded-lg border border-fd-border bg-fd-card px-2 font-mono text-xs transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring",
              )}
            >
              {units.map((u) => (
                <option key={u.label} value={u.label}>
                  {u.label}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </LabeledField>
  );
}

function SimpleNumericField({
  label,
  description,
  value,
  onChange,
  required,
  placeholder,
  min,
  step,
  suffix,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  min?: string;
  step?: string;
  suffix?: string;
}) {
  return (
    <LabeledField label={label} description={description} required={required}>
      {(fieldProps) => (
        <div className="flex items-center gap-1.5">
          <input
            {...fieldProps}
            type="number"
            min={min ?? "0"}
            step={step ?? "any"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={cn(
              "min-h-[44px] w-full rounded-lg border border-fd-border bg-fd-card px-3 font-mono text-sm transition-colors",
              "placeholder:text-fd-muted-foreground/60",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring",
            )}
          />
          {suffix && (
            <span className="shrink-0 text-xs text-fd-muted-foreground">{suffix}</span>
          )}
        </div>
      )}
    </LabeledField>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function MessageSizeClient() {
  // Input state
  const [recordSizeStr, setRecordSizeStr] = useState("");
  const [recordSizeUnit, setRecordSizeUnit] = useState("B");
  const [batchSizeStr, setBatchSizeStr] = useState("");
  const [batchSizeUnit, setBatchSizeUnit] = useState("B");
  const [producerMaxStr, setProducerMaxStr] = useState("");
  const [producerMaxUnit, setProducerMaxUnit] = useState("MiB");
  const [brokerMaxStr, setBrokerMaxStr] = useState("");
  const [brokerMaxUnit, setBrokerMaxUnit] = useState("MiB");
  const [hasTopicOverride, setHasTopicOverride] = useState(false);
  const [topicMaxStr, setTopicMaxStr] = useState("");
  const [topicMaxUnit, setTopicMaxUnit] = useState("MiB");
  const [replicaFetchStr, setReplicaFetchStr] = useState("");
  const [replicaFetchUnit, setReplicaFetchUnit] = useState("MiB");
  const [consumerPartStr, setConsumerPartStr] = useState("");
  const [consumerPartUnit, setConsumerPartUnit] = useState("MiB");
  const [consumerTotalStr, setConsumerTotalStr] = useState("");
  const [consumerTotalUnit, setConsumerTotalUnit] = useState("MiB");
  const [headroomStr, setHeadroomStr] = useState(String(DEFAULT_SAFETY_HEADROOM_FRACTION * 100));
  const [blobThresholdStr, setBlobThresholdStr] = useState(
    String(DEFAULT_BLOB_STORAGE_THRESHOLD_BYTES / (1024 * 1024)),
  );
  const [blobThresholdUnit, setBlobThresholdUnit] = useState("MiB");

  const [result, setResult] = useState<MessageSizeAnalysisResult | null>(null);
  const [validationIssues, setValidationIssues] = useState<readonly MessageSizeValidationIssue[]>([]);
  const [clientErrors, setClientErrors] = useState<readonly string[]>([]);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);

  const resolveUnit = (units: readonly UnitOption[], unitLabel: string): number => {
    return units.find((u) => u.label === unitLabel)?.factor ?? 1;
  };

  const handleAnalyze = useCallback(() => {
    setResult(null);
    setValidationIssues([]);
    setClientErrors([]);

    // Client-side validation: topic override checkbox checked but field blank
    if (hasTopicOverride && !topicMaxStr.trim()) {
      setClientErrors(["Topic override is enabled but no value is provided. Enter a value or uncheck the override."]);
      setHasAnalyzed(true);
      return;
    }

    const headroomPct = Number(headroomStr);
    // Allow 0 for no-headroom comparison
    const headroomFraction = headroomPct >= 0 && headroomPct < 100 ? headroomPct / 100 : Number(headroomStr);

    const input: Record<string, unknown> = {
      recordSizeBytes: Number(recordSizeStr) * resolveUnit(BYTES_UNITS, recordSizeUnit),
      batchSizeBytes: Number(batchSizeStr) * resolveUnit(BYTES_UNITS, batchSizeUnit),
      producerMaxRequestSize: Number(producerMaxStr) * resolveUnit(BYTES_UNITS, producerMaxUnit),
      brokerMessageMaxBytes: Number(brokerMaxStr) * resolveUnit(BYTES_UNITS, brokerMaxUnit),
      replicaFetchMaxBytes: Number(replicaFetchStr) * resolveUnit(BYTES_UNITS, replicaFetchUnit),
      consumerMaxPartitionFetchBytes: Number(consumerPartStr) * resolveUnit(BYTES_UNITS, consumerPartUnit),
      consumerFetchMaxBytes: Number(consumerTotalStr) * resolveUnit(BYTES_UNITS, consumerTotalUnit),
      safetyHeadroomFraction: headroomFraction,
      blobStorageThresholdBytes: Number(blobThresholdStr) * resolveUnit(BYTES_UNITS, blobThresholdUnit),
    };

    if (hasTopicOverride && topicMaxStr.trim()) {
      input.topicOverride = {
        maxMessageBytes: Number(topicMaxStr) * resolveUnit(BYTES_UNITS, topicMaxUnit),
      };
    }

    const analysisResult = analyzeMessageSize(input);
    if (analysisResult.ok) {
      setResult(analysisResult.result);
      setValidationIssues([]);
    } else {
      setValidationIssues(analysisResult.issues);
      setResult(null);
    }
    setHasAnalyzed(true);
  }, [
    recordSizeStr, recordSizeUnit, batchSizeStr, batchSizeUnit,
    producerMaxStr, producerMaxUnit, brokerMaxStr, brokerMaxUnit,
    hasTopicOverride, topicMaxStr, topicMaxUnit,
    replicaFetchStr, replicaFetchUnit,
    consumerPartStr, consumerPartUnit, consumerTotalStr, consumerTotalUnit,
    headroomStr, blobThresholdStr, blobThresholdUnit,
  ]);

  const handleLoadSample = useCallback(() => {
    setRecordSizeStr(String(SAMPLE_INPUT.recordSizeBytes));
    setRecordSizeUnit("B");
    setBatchSizeStr(String(SAMPLE_INPUT.batchSizeBytes));
    setBatchSizeUnit("B");
    setProducerMaxStr(String(SAMPLE_INPUT.producerMaxRequestSize / (1024 * 1024)));
    setProducerMaxUnit("MiB");
    setBrokerMaxStr(String(SAMPLE_INPUT.brokerMessageMaxBytes));
    setBrokerMaxUnit("B");
    setHasTopicOverride(false);
    setTopicMaxStr("");
    setTopicMaxUnit("MiB");
    setReplicaFetchStr(String(SAMPLE_INPUT.replicaFetchMaxBytes / (1024 * 1024)));
    setReplicaFetchUnit("MiB");
    setConsumerPartStr(String(SAMPLE_INPUT.consumerMaxPartitionFetchBytes / (1024 * 1024)));
    setConsumerPartUnit("MiB");
    setConsumerTotalStr(String(SAMPLE_INPUT.consumerFetchMaxBytes / (1024 * 1024)));
    setConsumerTotalUnit("MiB");
    setHeadroomStr(String(SAMPLE_INPUT.safetyHeadroomFraction * 100));
    setBlobThresholdStr(String(SAMPLE_INPUT.blobStorageThresholdBytes / (1024 * 1024)));
    setBlobThresholdUnit("MiB");
    setResult(null);
    setValidationIssues([]);
    setClientErrors([]);
    setHasAnalyzed(false);
  }, []);

  const handleClear = useCallback(() => {
    setRecordSizeStr("");
    setRecordSizeUnit("B");
    setBatchSizeStr("");
    setBatchSizeUnit("B");
    setProducerMaxStr("");
    setProducerMaxUnit("MiB");
    setBrokerMaxStr("");
    setBrokerMaxUnit("MiB");
    setHasTopicOverride(false);
    setTopicMaxStr("");
    setTopicMaxUnit("MiB");
    setReplicaFetchStr("");
    setReplicaFetchUnit("MiB");
    setConsumerPartStr("");
    setConsumerPartUnit("MiB");
    setConsumerTotalStr("");
    setConsumerTotalUnit("MiB");
    setHeadroomStr(String(DEFAULT_SAFETY_HEADROOM_FRACTION * 100));
    setBlobThresholdStr(String(DEFAULT_BLOB_STORAGE_THRESHOLD_BYTES / (1024 * 1024)));
    setBlobThresholdUnit("MiB");
    setResult(null);
    setValidationIssues([]);
    setClientErrors([]);
    setHasAnalyzed(false);
  }, []);

  const handleExportMarkdown = useCallback(() => {
    if (!result) return { content: "", redactionSummary: "" };
    const exp = exportMessageSizeMarkdown(result);
    return { content: exp.content, redactionSummary: exp.redactionSummary };
  }, [result]);

  const handleExportJson = useCallback(() => {
    if (!result) return { content: "", redactionSummary: "" };
    const exp = exportMessageSizeJson(result);
    return { content: exp.content, redactionSummary: exp.redactionSummary };
  }, [result]);

  const allErrors = [
    ...clientErrors,
    ...validationIssues.map((i) => `[${i.kind}] ${i.message}`),
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      {/* Input panel */}
      <div className="flex flex-col gap-4">
        {/* Message sizes */}
        <fieldset className="rounded-lg border border-fd-border p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
            Message Sizes
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <NumericFieldWithUnit
              label="Record size"
              description="Serialised key + value + headers of a single record. Must be a positive integer."
              value={recordSizeStr}
              onChange={setRecordSizeStr}
              unit={recordSizeUnit}
              onUnitChange={setRecordSizeUnit}
              units={BYTES_UNITS}
              placeholder="e.g. 51200"
              min="1"
              required
            />
            <NumericFieldWithUnit
              label="Batch size (produced)"
              description="Produced record batch size (on-wire, potentially compressed). Must be a positive integer ≥ record size."
              value={batchSizeStr}
              onChange={setBatchSizeStr}
              unit={batchSizeUnit}
              onUnitChange={setBatchSizeUnit}
              units={BYTES_UNITS}
              placeholder="e.g. 55000"
              min="1"
              required
            />
          </div>
        </fieldset>

        {/* Producer */}
        <fieldset className="rounded-lg border border-fd-border p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
            Producer
          </legend>
          <NumericFieldWithUnit
            label="max.request.size"
            description="Maximum size of a produce request in bytes."
            value={producerMaxStr}
            onChange={setProducerMaxStr}
            unit={producerMaxUnit}
            onUnitChange={setProducerMaxUnit}
            units={BYTES_UNITS}
            placeholder="e.g. 1"
            min="1"
            required
          />
        </fieldset>

        {/* Broker / Topic */}
        <fieldset className="rounded-lg border border-fd-border p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
            Broker / Topic Acceptance
          </legend>
          <div className="grid grid-cols-1 gap-3">
            <NumericFieldWithUnit
              label="Broker message.max.bytes"
              description="Broker default. Only affects topics without an explicit max.message.bytes override."
              value={brokerMaxStr}
              onChange={setBrokerMaxStr}
              unit={brokerMaxUnit}
              onUnitChange={setBrokerMaxUnit}
              units={BYTES_UNITS}
              placeholder="e.g. 1048588"
              min="1"
              required
            />
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="topic-override-toggle"
                checked={hasTopicOverride}
                onChange={(e) => setHasTopicOverride(e.target.checked)}
                className="size-4 rounded border-fd-border"
              />
              <label htmlFor="topic-override-toggle" className="text-sm text-fd-muted-foreground">
                Model a topic-level max.message.bytes override
              </label>
            </div>
            {hasTopicOverride && (
              <NumericFieldWithUnit
                label="Topic max.message.bytes (override)"
                description="Overrides the broker default for this specific topic. Required when checkbox is enabled."
                value={topicMaxStr}
                onChange={setTopicMaxStr}
                unit={topicMaxUnit}
                onUnitChange={setTopicMaxUnit}
                units={BYTES_UNITS}
                placeholder="e.g. 2"
                min="1"
                required
              />
            )}
          </div>
        </fieldset>

        {/* Follower */}
        <fieldset className="rounded-lg border border-fd-border p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
            Follower Replication
          </legend>
          <NumericFieldWithUnit
            label="replica.fetch.max.bytes"
            description="Max bytes a follower fetches per partition per fetch request."
            value={replicaFetchStr}
            onChange={setReplicaFetchStr}
            unit={replicaFetchUnit}
            onUnitChange={setReplicaFetchUnit}
            units={BYTES_UNITS}
            placeholder="e.g. 1"
            min="1"
            required
          />
        </fieldset>

        {/* Consumer */}
        <fieldset className="rounded-lg border border-fd-border p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
            Consumer
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <NumericFieldWithUnit
              label="max.partition.fetch.bytes"
              description="Max bytes per partition in a consumer fetch response."
              value={consumerPartStr}
              onChange={setConsumerPartStr}
              unit={consumerPartUnit}
              onUnitChange={setConsumerPartUnit}
              units={BYTES_UNITS}
              placeholder="e.g. 1"
              min="1"
              required
            />
            <NumericFieldWithUnit
              label="fetch.max.bytes"
              description="Overall cap on total bytes per fetch response across all partitions."
              value={consumerTotalStr}
              onChange={setConsumerTotalStr}
              unit={consumerTotalUnit}
              onUnitChange={setConsumerTotalUnit}
              units={BYTES_UNITS}
              placeholder="e.g. 50"
              min="1"
              required
            />
          </div>
        </fieldset>

        {/* Safety / Blob */}
        <fieldset className="rounded-lg border border-fd-border p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
            Safety and Thresholds
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SimpleNumericField
              label="Safety headroom"
              description="Percentage added to batch size for the aligned limit. 0 is valid (no headroom). Must be < 100."
              value={headroomStr}
              onChange={setHeadroomStr}
              placeholder="e.g. 10"
              min="0"
              step="1"
              suffix="%"
              required
            />
            <NumericFieldWithUnit
              label="Blob storage threshold"
              description="Record/batch size that triggers external storage recommendation. User-configurable."
              value={blobThresholdStr}
              onChange={setBlobThresholdStr}
              unit={blobThresholdUnit}
              onUnitChange={setBlobThresholdUnit}
              units={BYTES_UNITS}
              placeholder="e.g. 1"
              min="1"
            />
          </div>
        </fieldset>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleAnalyze} aria-label="Analyze message size chain">
            Analyze
          </Button>
          <Button variant="secondary" onClick={handleLoadSample} aria-label="Load sample data">
            Load sample
          </Button>
          <Button variant="secondary" onClick={handleClear} aria-label="Clear all fields">
            Clear
          </Button>
        </div>

        <ValidationSummary errors={allErrors} />
      </div>

      {/* Results panel */}
      <div className="flex flex-col gap-4">
        {result && (
          <>
            <ExportActions
              onExportMarkdown={handleExportMarkdown}
              onExportJson={handleExportJson}
              filenamePrefix="kafka-message-size"
              disabled={!result}
            />
            <MessageSizeResults result={result} />
          </>
        )}

        {!result && hasAnalyzed && (validationIssues.length > 0 || clientErrors.length > 0) && (
          <EmptyState
            title="Validation failed"
            description="Fix the validation errors on the left and try again."
          />
        )}

        {!result && !hasAnalyzed && (
          <EmptyState
            title="No analysis yet"
            description="Enter message size parameters on the left and click Analyze, or load sample data."
          />
        )}
      </div>
    </div>
  );
}
