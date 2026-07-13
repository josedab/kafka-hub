"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LabeledField } from "@/components/workbench/labeled-field";
import { ValidationSummary } from "@/components/workbench/validation-summary";
import { ExportActions } from "@/components/workbench/export-actions";
import { EmptyState } from "@/components/workbench/empty-state";
import {
  analyzeCapacity,
  exportCapacityMarkdown,
  exportCapacityJson,
  DEFAULT_SAFETY_HEADROOM_TARGET,
  DEFAULT_SKEW_FACTOR,
} from "@kafka-hub/kafka-planners/capacity";
import type {
  CapacityAnalysisResult,
  CapacityValidationIssue,
} from "@kafka-hub/kafka-planners/capacity";
import { SAMPLE_INPUT } from "./capacity-sample-data";
import { CapacityResults } from "./capacity-results";

// ─── Unit conversion helpers ────────────────────────────────────────────────

const BYTES_UNITS = [
  { label: "B", factor: 1 },
  { label: "KiB", factor: 1024 },
  { label: "MiB", factor: 1024 * 1024 },
  { label: "GiB", factor: 1024 * 1024 * 1024 },
  { label: "TiB", factor: 1024 * 1024 * 1024 * 1024 },
] as const;

const BYTES_PER_SEC_UNITS = [
  { label: "B/s", factor: 1 },
  { label: "KiB/s", factor: 1024 },
  { label: "MiB/s", factor: 1024 * 1024 },
  { label: "GiB/s", factor: 1024 * 1024 * 1024 },
] as const;

const RETENTION_UNITS = [
  { label: "seconds", factor: 1 },
  { label: "minutes", factor: 60 },
  { label: "hours", factor: 3600 },
  { label: "days", factor: 86400 },
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

export function CapacityClient() {
  // Core input fields (display values — may need unit conversion)
  const [peakIngressRateStr, setPeakIngressRateStr] = useState("");
  const [avgRecordSizeStr, setAvgRecordSizeStr] = useState("");
  const [avgRecordSizeUnit, setAvgRecordSizeUnit] = useState("B");
  const [compressionRatioStr, setCompressionRatioStr] = useState("");
  const [retentionStr, setRetentionStr] = useState("");
  const [retentionUnit, setRetentionUnit] = useState("days");
  const [rfStr, setRfStr] = useState("");
  const [partitionCountStr, setPartitionCountStr] = useState("");
  const [brokerCountStr, setBrokerCountStr] = useState("");
  const [consumerGroupsStr, setConsumerGroupsStr] = useState("");
  const [perPartitionTargetStr, setPerPartitionTargetStr] = useState("");
  const [perPartitionTargetUnit, setPerPartitionTargetUnit] = useState("MiB/s");
  const [perBrokerStorageStr, setPerBrokerStorageStr] = useState("");
  const [perBrokerStorageUnit, setPerBrokerStorageUnit] = useState("TiB");
  const [perBrokerNetworkStr, setPerBrokerNetworkStr] = useState("");
  const [perBrokerNetworkUnit, setPerBrokerNetworkUnit] = useState("MiB/s");
  const [safetyStr, setSafetyStr] = useState(String(DEFAULT_SAFETY_HEADROOM_TARGET * 100));
  const [skewStr, setSkewStr] = useState(String(DEFAULT_SKEW_FACTOR));

  const [result, setResult] = useState<CapacityAnalysisResult | null>(null);
  const [validationIssues, setValidationIssues] = useState<readonly CapacityValidationIssue[]>([]);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);

  const resolveUnit = (units: readonly UnitOption[], unitLabel: string): number => {
    return units.find((u) => u.label === unitLabel)?.factor ?? 1;
  };

  const handleAnalyze = useCallback(() => {
    setResult(null);
    setValidationIssues([]);

    const safetyPct = Number(safetyStr);
    const safetyTarget = safetyPct > 0 && safetyPct < 100 ? safetyPct / 100 : undefined;

    const input: Record<string, unknown> = {
      peakIngressRate: Number(peakIngressRateStr),
      avgRecordSizeBytes: Number(avgRecordSizeStr) * resolveUnit(BYTES_UNITS, avgRecordSizeUnit),
      compressionRatio: Number(compressionRatioStr),
      retentionSeconds: Number(retentionStr) * resolveUnit(RETENTION_UNITS, retentionUnit),
      replicationFactor: Number(rfStr),
      partitionCount: Number(partitionCountStr),
      brokerCount: Number(brokerCountStr),
      fullReadConsumerGroupCount: Number(consumerGroupsStr),
      perPartitionTargetThroughput: Number(perPartitionTargetStr) * resolveUnit(BYTES_PER_SEC_UNITS, perPartitionTargetUnit),
      perBrokerStorageBytes: Number(perBrokerStorageStr) * resolveUnit(BYTES_UNITS, perBrokerStorageUnit),
      perBrokerNetworkBytesPerSec: Number(perBrokerNetworkStr) * resolveUnit(BYTES_PER_SEC_UNITS, perBrokerNetworkUnit),
      ...(safetyTarget !== undefined ? { safetyHeadroomTarget: safetyTarget } : {}),
      ...(skewStr.trim() ? { skewFactor: Number(skewStr) } : {}),
    };

    const analysisResult = analyzeCapacity(input);
    if (analysisResult.ok) {
      setResult(analysisResult.result);
      setValidationIssues([]);
    } else {
      setValidationIssues(analysisResult.issues);
      setResult(null);
    }
    setHasAnalyzed(true);
  }, [
    peakIngressRateStr, avgRecordSizeStr, avgRecordSizeUnit,
    compressionRatioStr, retentionStr, retentionUnit,
    rfStr, partitionCountStr, brokerCountStr, consumerGroupsStr,
    perPartitionTargetStr, perPartitionTargetUnit,
    perBrokerStorageStr, perBrokerStorageUnit,
    perBrokerNetworkStr, perBrokerNetworkUnit,
    safetyStr, skewStr,
  ]);

  const handleLoadSample = useCallback(() => {
    setPeakIngressRateStr(String(SAMPLE_INPUT.peakIngressRate));
    setAvgRecordSizeStr(String(SAMPLE_INPUT.avgRecordSizeBytes));
    setAvgRecordSizeUnit("B");
    setCompressionRatioStr(String(SAMPLE_INPUT.compressionRatio));
    setRetentionStr(String(SAMPLE_INPUT.retentionSeconds / 86400));
    setRetentionUnit("days");
    setRfStr(String(SAMPLE_INPUT.replicationFactor));
    setPartitionCountStr(String(SAMPLE_INPUT.partitionCount));
    setBrokerCountStr(String(SAMPLE_INPUT.brokerCount));
    setConsumerGroupsStr(String(SAMPLE_INPUT.fullReadConsumerGroupCount));
    setPerPartitionTargetStr(String(SAMPLE_INPUT.perPartitionTargetThroughput / (1024 * 1024)));
    setPerPartitionTargetUnit("MiB/s");
    setPerBrokerStorageStr(String(SAMPLE_INPUT.perBrokerStorageBytes / (1024 * 1024 * 1024 * 1024)));
    setPerBrokerStorageUnit("TiB");
    setPerBrokerNetworkStr(String(SAMPLE_INPUT.perBrokerNetworkBytesPerSec / (1024 * 1024)));
    setPerBrokerNetworkUnit("MiB/s");
    setSafetyStr(String(DEFAULT_SAFETY_HEADROOM_TARGET * 100));
    setSkewStr(String(DEFAULT_SKEW_FACTOR));
    setResult(null);
    setValidationIssues([]);
    setHasAnalyzed(false);
  }, []);

  const handleClear = useCallback(() => {
    setPeakIngressRateStr("");
    setAvgRecordSizeStr("");
    setAvgRecordSizeUnit("B");
    setCompressionRatioStr("");
    setRetentionStr("");
    setRetentionUnit("days");
    setRfStr("");
    setPartitionCountStr("");
    setBrokerCountStr("");
    setConsumerGroupsStr("");
    setPerPartitionTargetStr("");
    setPerPartitionTargetUnit("MiB/s");
    setPerBrokerStorageStr("");
    setPerBrokerStorageUnit("TiB");
    setPerBrokerNetworkStr("");
    setPerBrokerNetworkUnit("MiB/s");
    setSafetyStr(String(DEFAULT_SAFETY_HEADROOM_TARGET * 100));
    setSkewStr(String(DEFAULT_SKEW_FACTOR));
    setResult(null);
    setValidationIssues([]);
    setHasAnalyzed(false);
  }, []);

  const handleExportMarkdown = useCallback(() => {
    if (!result) return { content: "", redactionSummary: "" };
    const exp = exportCapacityMarkdown(result);
    return { content: exp.content, redactionSummary: exp.redactionSummary };
  }, [result]);

  const handleExportJson = useCallback(() => {
    if (!result) return { content: "", redactionSummary: "" };
    const exp = exportCapacityJson(result);
    return { content: exp.content, redactionSummary: exp.redactionSummary };
  }, [result]);

  const allErrors = validationIssues.map((i) => `[${i.kind}] ${i.message}`);
  const hasRequiredFields = peakIngressRateStr.trim() && avgRecordSizeStr.trim() &&
    compressionRatioStr.trim() && retentionStr.trim() && rfStr.trim() &&
    partitionCountStr.trim() && brokerCountStr.trim() && consumerGroupsStr.trim() &&
    perPartitionTargetStr.trim() && perBrokerStorageStr.trim() && perBrokerNetworkStr.trim();

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      {/* Input panel */}
      <div className="flex flex-col gap-4">
        {/* Ingress section */}
        <fieldset className="rounded-lg border border-fd-border p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
            Ingress
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SimpleNumericField
              label="Peak ingress rate"
              description="Peak producer message rate."
              value={peakIngressRateStr}
              onChange={setPeakIngressRateStr}
              placeholder="e.g. 10000"
              min="1"
              step="1"
              suffix="records/sec"
              required
            />
            <NumericFieldWithUnit
              label="Avg record size"
              description="Average serialized record size (before compression)."
              value={avgRecordSizeStr}
              onChange={setAvgRecordSizeStr}
              unit={avgRecordSizeUnit}
              onUnitChange={setAvgRecordSizeUnit}
              units={BYTES_UNITS}
              placeholder="e.g. 1024"
              min="1"
              required
            />
            <SimpleNumericField
              label="Compression ratio"
              description="Compressed / uncompressed. 0.5 = 50% compression. 1.0 = none."
              value={compressionRatioStr}
              onChange={setCompressionRatioStr}
              placeholder="e.g. 0.5"
              min="0.01"
              step="0.01"
              required
            />
          </div>
        </fieldset>

        {/* Cluster topology section */}
        <fieldset className="rounded-lg border border-fd-border p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
            Cluster Topology
          </legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SimpleNumericField
              label="Brokers"
              description="Number of brokers."
              value={brokerCountStr}
              onChange={setBrokerCountStr}
              placeholder="e.g. 5"
              min="1"
              step="1"
              required
            />
            <SimpleNumericField
              label="Replication factor"
              description="RF for the topic(s)."
              value={rfStr}
              onChange={setRfStr}
              placeholder="e.g. 3"
              min="1"
              step="1"
              required
            />
            <SimpleNumericField
              label="Partitions"
              description="Total partition count."
              value={partitionCountStr}
              onChange={setPartitionCountStr}
              placeholder="e.g. 30"
              min="1"
              step="1"
              required
            />
            <NumericFieldWithUnit
              label="Retention"
              description="Data retention duration."
              value={retentionStr}
              onChange={setRetentionStr}
              unit={retentionUnit}
              onUnitChange={setRetentionUnit}
              units={RETENTION_UNITS}
              placeholder="e.g. 7"
              min="0.001"
              required
            />
            <SimpleNumericField
              label="Consumer groups"
              description="Full-read consumer group count. 0 if none."
              value={consumerGroupsStr}
              onChange={setConsumerGroupsStr}
              placeholder="e.g. 2"
              min="0"
              step="1"
              required
            />
          </div>
        </fieldset>

        {/* Broker capacity section */}
        <fieldset className="rounded-lg border border-fd-border p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
            Per-Broker Capacity
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <NumericFieldWithUnit
              label="Usable storage"
              description="Storage available for Kafka data per broker."
              value={perBrokerStorageStr}
              onChange={setPerBrokerStorageStr}
              unit={perBrokerStorageUnit}
              onUnitChange={setPerBrokerStorageUnit}
              units={BYTES_UNITS}
              placeholder="e.g. 1"
              required
            />
            <NumericFieldWithUnit
              label="Network capability"
              description="Sustainable network throughput per broker."
              value={perBrokerNetworkStr}
              onChange={setPerBrokerNetworkStr}
              unit={perBrokerNetworkUnit}
              onUnitChange={setPerBrokerNetworkUnit}
              units={BYTES_PER_SEC_UNITS}
              placeholder="e.g. 119"
              required
            />
            <NumericFieldWithUnit
              label="Per-partition target"
              description="Target throughput per partition (compressed)."
              value={perPartitionTargetStr}
              onChange={setPerPartitionTargetStr}
              unit={perPartitionTargetUnit}
              onUnitChange={setPerPartitionTargetUnit}
              units={BYTES_PER_SEC_UNITS}
              placeholder="e.g. 1"
              required
            />
          </div>
        </fieldset>

        {/* Optional section */}
        <fieldset className="rounded-lg border border-fd-border p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
            Optional
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <SimpleNumericField
              label="Safety target"
              description="Max utilization % target. Default: 70%."
              value={safetyStr}
              onChange={setSafetyStr}
              placeholder="70"
              min="1"
              step="1"
              suffix="%"
            />
            <SimpleNumericField
              label="Skew factor"
              description="Hottest partition multiplier. 1.0 = balanced."
              value={skewStr}
              onChange={setSkewStr}
              placeholder="1.0"
              min="1"
              step="0.1"
              suffix="x"
            />
          </div>
        </fieldset>

        {/* Validation summary */}
        {allErrors.length > 0 && <ValidationSummary errors={allErrors} />}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="md"
            onClick={handleAnalyze}
            disabled={!hasRequiredFields}
            className="min-h-[44px]"
          >
            Analyze capacity
          </Button>
          <Button variant="secondary" size="sm" onClick={handleLoadSample} className="min-h-[44px]">
            Load sample
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={!peakIngressRateStr && !hasAnalyzed}
            className="min-h-[44px]"
          >
            Clear
          </Button>
        </div>

        {/* Formulas/assumptions */}
        <details className="group rounded-lg border border-fd-border bg-fd-muted/20 p-3">
          <summary className="cursor-pointer text-xs font-medium text-fd-muted-foreground select-none min-h-[44px] flex items-center">
            Formulas and network model
          </summary>
          <div className="mt-2 space-y-2 text-xs text-fd-muted-foreground">
            <p>
              <strong>Storage:</strong>{" "}
              <code>logicalUncompressedIngress = peakIngressRate x avgRecordSize</code>,{" "}
              <code>retainedBytes = logicalIngress x retentionSeconds</code>,{" "}
              <code>compressed = retained x compressionRatio</code>,{" "}
              <code>physical = compressed x RF</code>.
            </p>
            <p>
              <strong>Network:</strong>{" "}
              <code>compressedIngress = logicalIngress x compressionRatio</code>,{" "}
              <code>followerReplication = compressedIngress x (RF - 1)</code>,{" "}
              <code>consumerRead = compressedIngress x consumerGroups</code>,{" "}
              <code>total = ingress + replication + consumerRead</code>.
            </p>
            <p>
              <strong>Network model:</strong> cluster traffic includes producer ingress,
              follower replication copies, and full-read consumer egress.
              Per-broker figures approximate the busiest direction (typically egress-dominated).
              Bidirectional NIC accounting is simplified — real NICs handle ingress and egress
              independently.
            </p>
            <p>
              <strong>Partitions:</strong>{" "}
              <code>minPartitions = ceil(compressedIngress / perPartitionTarget)</code>,{" "}
              <code>avgThroughput = compressedIngress / partitionCount</code>,{" "}
              <code>hottestPartition = avg x skewFactor</code>.
            </p>
            <p>
              <strong>Broker load:</strong>{" "}
              <code>storagePerBroker = physicalRetained / activeBrokers</code>,{" "}
              <code>networkPerBroker = totalNetwork / activeBrokers</code>.
              Average uses all brokers; N-1 uses brokerCount - 1.
            </p>
            <p>
              <strong>Not modeled:</strong> controller/metadata traffic, partial-read consumers,
              tiered storage, rack-aware replication, KRaft-specific overhead. No vendor-specific
              limits or pricing (user-entered, out of scope).
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
            <Badge tone={result.status === "pass" ? "success" : result.status === "warning" ? "warning" : "danger"}>
              {result.status}
            </Badge>
          )}
        </div>

        {!result && !hasAnalyzed && (
          <EmptyState
            title="No capacity analyzed yet"
            description="Fill in cluster parameters and click Analyze, or load the sample to try it out."
          />
        )}

        {!result && hasAnalyzed && allErrors.length > 0 && (
          <EmptyState
            title="Input rejected"
            description={allErrors[0]}
          />
        )}

        {result && <CapacityResults result={result} />}

        {result && (
          <ExportActions
            onExportMarkdown={handleExportMarkdown}
            onExportJson={handleExportJson}
            filenamePrefix="kafka-capacity-plan"
            disabled={!result}
          />
        )}
      </div>
    </div>
  );
}
