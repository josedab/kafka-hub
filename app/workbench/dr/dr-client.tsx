"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { LabeledField } from "@/components/workbench/labeled-field";
import { ValidationSummary } from "@/components/workbench/validation-summary";
import { ExportActions } from "@/components/workbench/export-actions";
import { EmptyState } from "@/components/workbench/empty-state";
import {
  analyzeDr,
  exportDrMarkdown,
  exportDrJson,
} from "@kafka-hub/kafka-planners/dr";
import type {
  DrReplicationStrategy,
  DrTabletopResult,
} from "@kafka-hub/kafka-planners/dr";
import { SAMPLE_INPUT_MM2, SAMPLE_INPUT_MSK, SAMPLE_INPUT_GENERIC } from "./dr-sample-data";
import { DrResults } from "./dr-results";

// ─── Strategy Options ───────────────────────────────────────────────────────

const STRATEGIES: { value: DrReplicationStrategy; label: string }[] = [
  { value: "generic", label: "Generic" },
  { value: "mirror-maker-2", label: "MirrorMaker 2 (MM2)" },
  { value: "msk-replicator", label: "Amazon MSK Replicator" },
];

// ─── Unit Conversion ────────────────────────────────────────────────────────

type TimeUnit = "seconds" | "minutes";

function toSeconds(value: number, unit: TimeUnit): number {
  return unit === "minutes" ? value * 60 : value;
}


// ─── Input field CSS ────────────────────────────────────────────────────────

const inputCls =
  "min-h-[44px] w-full rounded-lg border border-fd-border bg-fd-card px-3 py-2 text-sm transition-colors placeholder:text-fd-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring";

const selectCls =
  "min-h-[44px] w-full rounded-lg border border-fd-border bg-fd-card px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring";

const unitSelectCls =
  "min-h-[44px] w-20 shrink-0 rounded-lg border border-fd-border bg-fd-card px-2 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring";

// ─── Duration Field ─────────────────────────────────────────────────────────

interface DurationFieldProps {
  label: string;
  description?: string;
  required?: boolean;
  value: string;
  unit: TimeUnit;
  onValueChange: (v: string) => void;
  onUnitChange: (u: TimeUnit) => void;
}

function DurationField({
  label,
  description,
  required,
  value,
  unit,
  onValueChange,
  onUnitChange,
}: DurationFieldProps) {
  return (
    <LabeledField label={label} description={description} required={required}>
      {(props) => (
        <div className="flex gap-1.5">
          <input
            {...props}
            type="number"
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            min="0"
            step="any"
            className={inputCls}
          />
          <select
            value={unit}
            onChange={(e) => onUnitChange(e.target.value as TimeUnit)}
            className={unitSelectCls}
            aria-label={`${label} unit`}
          >
            <option value="seconds">sec</option>
            <option value="minutes">min</option>
          </select>
        </div>
      )}
    </LabeledField>
  );
}

// ─── State shape ────────────────────────────────────────────────────────────

interface FieldState {
  value: string;
  unit: TimeUnit;
}

function fieldToSeconds(f: FieldState): number {
  return toSeconds(Number(f.value), f.unit);
}

function secondsToField(seconds: number, preferMinutes: boolean): FieldState {
  if (preferMinutes && seconds >= 60 && seconds % 60 === 0) {
    return { value: String(seconds / 60), unit: "minutes" };
  }
  return { value: String(seconds), unit: "seconds" };
}

// ─── Client Component ───────────────────────────────────────────────────────

export function DrClient() {
  // Form state — each duration field has value + unit
  const [replicationLag, setReplicationLag] = useState<FieldState>({ value: "", unit: "seconds" });
  const [checkpointInterval, setCheckpointInterval] = useState<FieldState>({ value: "", unit: "seconds" });
  const [incidentDetection, setIncidentDetection] = useState<FieldState>({ value: "", unit: "seconds" });
  const [promotion, setPromotion] = useState<FieldState>({ value: "", unit: "seconds" });
  const [dnsTtl, setDnsTtl] = useState<FieldState>({ value: "", unit: "seconds" });
  const [clientReconnect, setClientReconnect] = useState<FieldState>({ value: "", unit: "seconds" });
  const [validation, setValidation] = useState<FieldState>({ value: "", unit: "seconds" });
  const [duplicateTolerance, setDuplicateTolerance] = useState<FieldState>({ value: "", unit: "seconds" });
  const [strategy, setStrategy] = useState<DrReplicationStrategy>("generic");

  // Result state
  const [result, setResult] = useState<DrTabletopResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const loadSample = useCallback(
    (sample: typeof SAMPLE_INPUT_MM2) => {
      setReplicationLag(secondsToField(sample.replicationLagSeconds, false));
      setCheckpointInterval(secondsToField(sample.checkpointIntervalSeconds, true));
      setIncidentDetection(secondsToField(sample.incidentDetectionSeconds, true));
      setPromotion(secondsToField(sample.promotionSeconds, false));
      setDnsTtl(secondsToField(sample.dnsTtlSeconds, true));
      setClientReconnect(secondsToField(sample.clientReconnectSeconds, false));
      setValidation(secondsToField(sample.validationSeconds, true));
      setDuplicateTolerance(secondsToField(sample.duplicateToleranceSeconds, true));
      setStrategy(sample.strategy ?? "generic");
      setResult(null);
      setErrors([]);
    },
    [],
  );

  const handleAnalyze = useCallback(() => {
    const input = {
      replicationLagSeconds: fieldToSeconds(replicationLag),
      checkpointIntervalSeconds: fieldToSeconds(checkpointInterval),
      incidentDetectionSeconds: fieldToSeconds(incidentDetection),
      promotionSeconds: fieldToSeconds(promotion),
      dnsTtlSeconds: fieldToSeconds(dnsTtl),
      clientReconnectSeconds: fieldToSeconds(clientReconnect),
      validationSeconds: fieldToSeconds(validation),
      duplicateToleranceSeconds: fieldToSeconds(duplicateTolerance),
      strategy,
    };

    const r = analyzeDr(input);

    if (r.ok) {
      setResult(r.result);
      setErrors([]);
    } else {
      setErrors(r.issues.map((i) => `[${i.field}] ${i.message}`));
      setResult(null);
    }
  }, [
    replicationLag, checkpointInterval, incidentDetection, promotion,
    dnsTtl, clientReconnect, validation, duplicateTolerance, strategy,
  ]);

  return (
    <div className="flex flex-col gap-8">
      {/* Input form */}
      <div className="dr-print-hide rounded-xl border border-fd-border bg-fd-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Replication Parameters</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => loadSample(SAMPLE_INPUT_MM2)}>
              Load MM2 sample
            </Button>
            <Button variant="ghost" size="sm" onClick={() => loadSample(SAMPLE_INPUT_MSK)}>
              Load MSK sample
            </Button>
            <Button variant="ghost" size="sm" onClick={() => loadSample(SAMPLE_INPUT_GENERIC)}>
              Load generic sample
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DurationField
            label="Replication Lag"
            description="Observed lag between source and target"
            required
            value={replicationLag.value}
            unit={replicationLag.unit}
            onValueChange={(v) => setReplicationLag((s) => ({ ...s, value: v }))}
            onUnitChange={(u) => setReplicationLag((s) => ({ ...s, unit: u }))}
          />

          <DurationField
            label="Checkpoint Interval"
            description="How often offset checkpoints are written"
            required
            value={checkpointInterval.value}
            unit={checkpointInterval.unit}
            onValueChange={(v) => setCheckpointInterval((s) => ({ ...s, value: v }))}
            onUnitChange={(u) => setCheckpointInterval((s) => ({ ...s, unit: u }))}
          />

          <DurationField
            label="Incident Detection Time"
            description="Time from incident to detection"
            required
            value={incidentDetection.value}
            unit={incidentDetection.unit}
            onValueChange={(v) => setIncidentDetection((s) => ({ ...s, value: v }))}
            onUnitChange={(u) => setIncidentDetection((s) => ({ ...s, unit: u }))}
          />

          <DurationField
            label="Promotion Time"
            description="Time to promote target to primary"
            required
            value={promotion.value}
            unit={promotion.unit}
            onValueChange={(v) => setPromotion((s) => ({ ...s, value: v }))}
            onUnitChange={(u) => setPromotion((s) => ({ ...s, unit: u }))}
          />

          <DurationField
            label="DNS TTL"
            description="DNS propagation delay"
            required
            value={dnsTtl.value}
            unit={dnsTtl.unit}
            onValueChange={(v) => setDnsTtl((s) => ({ ...s, value: v }))}
            onUnitChange={(u) => setDnsTtl((s) => ({ ...s, unit: u }))}
          />

          <DurationField
            label="Client Reconnect Time"
            description="Time for clients to reconnect"
            required
            value={clientReconnect.value}
            unit={clientReconnect.unit}
            onValueChange={(v) => setClientReconnect((s) => ({ ...s, value: v }))}
            onUnitChange={(u) => setClientReconnect((s) => ({ ...s, unit: u }))}
          />

          <DurationField
            label="Validation Time"
            description="Post-promotion health check"
            required
            value={validation.value}
            unit={validation.unit}
            onValueChange={(v) => setValidation((s) => ({ ...s, value: v }))}
            onUnitChange={(u) => setValidation((s) => ({ ...s, unit: u }))}
          />

          <DurationField
            label="Duplicate Tolerance"
            description="Max acceptable replay/duplicate window"
            required
            value={duplicateTolerance.value}
            unit={duplicateTolerance.unit}
            onValueChange={(v) => setDuplicateTolerance((s) => ({ ...s, value: v }))}
            onUnitChange={(u) => setDuplicateTolerance((s) => ({ ...s, unit: u }))}
          />

          <LabeledField label="Replication Strategy" description="Affects notes only, not estimates">
            {(props) => (
              <select
                {...props}
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as DrReplicationStrategy)}
                className={selectCls}
              >
                {STRATEGIES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            )}
          </LabeledField>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button onClick={handleAnalyze} className="min-h-[44px]">
            Analyze DR Scenario
          </Button>
        </div>
      </div>

      {/* Validation errors */}
      <ValidationSummary errors={errors} />

      {/* Results */}
      {result ? (
        <>
          <div className="dr-print-hide">
            <ExportActions
              onExportMarkdown={() => exportDrMarkdown(result)}
              onExportJson={() => exportDrJson(result)}
              filenamePrefix="dr-tabletop"
            />
          </div>
          <DrResults result={result} />
        </>
      ) : (
        errors.length === 0 && (
          <EmptyState
            title="No analysis yet"
            description="Enter your replication parameters and click 'Analyze DR Scenario', or load sample data to see how it works."
          />
        )
      )}
    </div>
  );
}
