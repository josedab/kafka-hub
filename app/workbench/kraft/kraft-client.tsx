"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { LabeledField } from "@/components/workbench/labeled-field";
import { ValidationSummary } from "@/components/workbench/validation-summary";
import { ExportActions } from "@/components/workbench/export-actions";
import { EmptyState } from "@/components/workbench/empty-state";
import {
  analyzeKRaft,
  exportKRaftMarkdown,
  exportKRaftJson,
} from "@kafka-hub/kafka-planners/kraft";
import type {
  KRaftAnalysisResult,
  KRaftMigrationPhaseId,
  KRaftMetadataMode,
  KRaftVendor,
  KRaftAclHealth,
  KRaftLogDirHealth,
  KRaftQuorumMode,
} from "@kafka-hub/kafka-planners/kraft";
import { SAMPLE_INPUT, SAMPLE_INPUT_DYNAMIC } from "./kraft-sample-data";
import { KRaftResults } from "./kraft-results";

// ─── Select Options ─────────────────────────────────────────────────────────

const METADATA_MODES: { value: KRaftMetadataMode; label: string }[] = [
  { value: "zookeeper", label: "ZooKeeper" },
  { value: "migration", label: "Migration (dual-write)" },
  { value: "kraft", label: "KRaft" },
];

const VENDORS: { value: KRaftVendor; label: string }[] = [
  { value: "apache", label: "Apache Kafka" },
  { value: "confluent", label: "Confluent Platform" },
  { value: "aws-msk", label: "Amazon MSK" },
  { value: "other", label: "Other" },
];

const PHASES: { value: KRaftMigrationPhaseId; label: string }[] = [
  { value: "preflight-zookeeper", label: "1. Initial ZooKeeper" },
  { value: "initial-metadata-load", label: "2. Initial Metadata Load" },
  { value: "hybrid-migration", label: "3. Hybrid Migration" },
  { value: "dual-write-migration", label: "4. Dual-Write Migration (last rollback)" },
  { value: "finalized-kraft", label: "5. Finalized KRaft" },
];

const ACL_OPTIONS: { value: KRaftAclHealth; label: string }[] = [
  { value: "healthy", label: "Healthy" },
  { value: "malformed", label: "Malformed" },
  { value: "unknown", label: "Unknown" },
  { value: "not-used", label: "Not used" },
];

const LOG_DIR_OPTIONS: { value: KRaftLogDirHealth; label: string }[] = [
  { value: "healthy", label: "Healthy" },
  { value: "failed", label: "Failed" },
  { value: "unknown", label: "Unknown" },
];

const QUORUM_MODES: { value: KRaftQuorumMode; label: string }[] = [
  { value: "static", label: "Static (controller.quorum.voters)" },
  { value: "dynamic", label: "Dynamic (controller.quorum.bootstrap.servers — KIP-853)" },
];

// ─── Input field CSS ────────────────────────────────────────────────────────

const inputCls =
  "min-h-[44px] w-full rounded-lg border border-fd-border bg-fd-card px-3 py-2 text-sm transition-colors placeholder:text-fd-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring";

const selectCls =
  "min-h-[44px] w-full rounded-lg border border-fd-border bg-fd-card px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring";

const textareaCls =
  "min-h-[80px] w-full resize-y rounded-lg border border-fd-border bg-fd-card px-3 py-2 font-mono text-sm transition-colors placeholder:text-fd-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring";

// ─── Client Component ───────────────────────────────────────────────────────

export function KRaftClient() {
  // Form state
  const [kafkaVersion, setKafkaVersion] = useState("");
  const [metadataMode, setMetadataMode] = useState<KRaftMetadataMode>("zookeeper");
  const [vendor, setVendor] = useState<KRaftVendor>("apache");
  const [vendorLabel, setVendorLabel] = useState("");
  const [controllerCount, setControllerCount] = useState("3");
  const [controllerNodeIdsJson, setControllerNodeIdsJson] = useState("[1, 2, 3]");
  const [brokerNodeIdsJson, setBrokerNodeIdsJson] = useState("[4, 5, 6]");
  const [controllerListenerNamesJson, setControllerListenerNamesJson] = useState('["CONTROLLER"]');
  const [quorumMode, setQuorumMode] = useState<KRaftQuorumMode>("static");
  const [quorumVotersJson, setQuorumVotersJson] = useState(
    JSON.stringify(SAMPLE_INPUT.quorumVoters, null, 2),
  );
  const [bootstrapServersJson, setBootstrapServersJson] = useState("[]");
  const [interBrokerConfigPresent, setInterBrokerConfigPresent] = useState(true);
  const [controllerConfigPresent, setControllerConfigPresent] = useState(true);
  const [aclHealth, setAclHealth] = useState<KRaftAclHealth>("healthy");
  const [logDirHealth, setLogDirHealth] = useState<KRaftLogDirHealth>("healthy");
  const [failedLogDirCount, setFailedLogDirCount] = useState("0");
  const [migrationPhase, setMigrationPhase] = useState<KRaftMigrationPhaseId>("preflight-zookeeper");
  const [production, setProduction] = useState(true);

  // Result state
  const [result, setResult] = useState<KRaftAnalysisResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const loadSample = useCallback((sample: typeof SAMPLE_INPUT) => {
    setKafkaVersion(sample.kafkaVersion);
    setMetadataMode(sample.metadataMode);
    setVendor(sample.vendor);
    setVendorLabel("");
    setControllerCount(String(sample.controllerCount));
    setControllerNodeIdsJson(JSON.stringify(sample.controllerNodeIds));
    setBrokerNodeIdsJson(JSON.stringify(sample.brokerNodeIds));
    setControllerListenerNamesJson(JSON.stringify(sample.controllerListenerNames));
    setQuorumMode(sample.quorumMode);
    setQuorumVotersJson(JSON.stringify(sample.quorumVoters, null, 2));
    setBootstrapServersJson(JSON.stringify(sample.bootstrapServers, null, 2));
    setInterBrokerConfigPresent(sample.interBrokerConfigPresent);
    setControllerConfigPresent(sample.controllerConfigPresent);
    setAclHealth(sample.aclHealth);
    setLogDirHealth(sample.logDirHealth);
    setFailedLogDirCount(String(sample.failedLogDirCount));
    setMigrationPhase(sample.migrationPhase);
    setProduction(sample.production);
    setResult(null);
    setErrors([]);
  }, []);

  const handleAnalyze = useCallback(() => {
    let controllerNodeIds: unknown;
    let brokerNodeIds: unknown;
    let controllerListenerNames: unknown;
    let quorumVoters: unknown;
    let bootstrapServers: unknown;

    try {
      controllerNodeIds = JSON.parse(controllerNodeIdsJson);
    } catch {
      setErrors(["Controller node IDs: invalid JSON"]);
      setResult(null);
      return;
    }
    try {
      brokerNodeIds = JSON.parse(brokerNodeIdsJson);
    } catch {
      setErrors(["Broker node IDs: invalid JSON"]);
      setResult(null);
      return;
    }
    try {
      controllerListenerNames = JSON.parse(controllerListenerNamesJson);
    } catch {
      setErrors(["Controller listener names: invalid JSON"]);
      setResult(null);
      return;
    }
    try {
      quorumVoters = JSON.parse(quorumVotersJson);
    } catch {
      setErrors(["Quorum voters: invalid JSON"]);
      setResult(null);
      return;
    }
    try {
      bootstrapServers = JSON.parse(bootstrapServersJson);
    } catch {
      setErrors(["Bootstrap servers: invalid JSON"]);
      setResult(null);
      return;
    }

    const input = {
      kafkaVersion: kafkaVersion.trim(),
      metadataMode,
      vendor,
      ...(vendorLabel.trim() ? { vendorLabel: vendorLabel.trim() } : {}),
      controllerCount: Number(controllerCount),
      controllerNodeIds,
      brokerNodeIds,
      controllerListenerNames,
      quorumMode,
      quorumVoters,
      bootstrapServers,
      interBrokerConfigPresent,
      controllerConfigPresent,
      aclHealth,
      logDirHealth,
      failedLogDirCount: Number(failedLogDirCount),
      migrationPhase,
      production,
    };

    const r = analyzeKRaft(input);

    if (r.ok) {
      setResult(r.result);
      setErrors([]);
    } else {
      setErrors(r.issues.map((i) => `[${i.field}] ${i.message}`));
      setResult(null);
    }
  }, [
    kafkaVersion, metadataMode, vendor, vendorLabel, controllerCount,
    controllerNodeIdsJson, brokerNodeIdsJson, controllerListenerNamesJson,
    quorumMode, quorumVotersJson, bootstrapServersJson,
    interBrokerConfigPresent, controllerConfigPresent,
    aclHealth, logDirHealth, failedLogDirCount, migrationPhase, production,
  ]);

  return (
    <div className="flex flex-col gap-8">
      {/* Input form */}
      <div className="kraft-print-hide rounded-xl border border-fd-border bg-fd-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Cluster Configuration</h2>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => loadSample(SAMPLE_INPUT)}>
              Load sample (static)
            </Button>
            <Button variant="ghost" size="sm" onClick={() => loadSample(SAMPLE_INPUT_DYNAMIC)}>
              Load sample (dynamic)
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Kafka Version */}
          <LabeledField label="Kafka Version" description="e.g. 3.9.1 or 4.3.1" required>
            {(props) => (
              <input
                {...props}
                type="text"
                value={kafkaVersion}
                onChange={(e) => setKafkaVersion(e.target.value)}
                placeholder="3.9.1"
                className={inputCls}
              />
            )}
          </LabeledField>

          {/* Metadata Mode */}
          <LabeledField label="Metadata Mode" required>
            {(props) => (
              <select
                {...props}
                value={metadataMode}
                onChange={(e) => setMetadataMode(e.target.value as KRaftMetadataMode)}
                className={selectCls}
              >
                {METADATA_MODES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            )}
          </LabeledField>

          {/* Migration Phase */}
          <LabeledField label="Migration Phase" required>
            {(props) => (
              <select
                {...props}
                value={migrationPhase}
                onChange={(e) => setMigrationPhase(e.target.value as KRaftMigrationPhaseId)}
                className={selectCls}
              >
                {PHASES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            )}
          </LabeledField>

          {/* Vendor */}
          <LabeledField label="Vendor" required>
            {(props) => (
              <select
                {...props}
                value={vendor}
                onChange={(e) => setVendor(e.target.value as KRaftVendor)}
                className={selectCls}
              >
                {VENDORS.map((v) => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
            )}
          </LabeledField>

          {/* Vendor Label */}
          {vendor === "other" && (
            <LabeledField label="Vendor Label" description="Display name only; do not enter credentials">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  value={vendorLabel}
                  onChange={(e) => setVendorLabel(e.target.value)}
                  placeholder="Custom Distribution"
                  className={inputCls}
                />
              )}
            </LabeledField>
          )}

          {/* Controller Count */}
          <LabeledField label="Controller Count" description="Odd number (3, 5) for production" required>
            {(props) => (
              <input
                {...props}
                type="number"
                value={controllerCount}
                onChange={(e) => setControllerCount(e.target.value)}
                min="1"
                step="1"
                className={inputCls}
              />
            )}
          </LabeledField>

          {/* Production */}
          <LabeledField label="Production Cluster">
            {(props) => (
              <select
                {...props}
                value={production ? "true" : "false"}
                onChange={(e) => setProduction(e.target.value === "true")}
                className={selectCls}
              >
                <option value="true">Yes (production)</option>
                <option value="false">No (development/testing)</option>
              </select>
            )}
          </LabeledField>

          {/* Quorum Mode */}
          <LabeledField label="Quorum Mode" description="KIP-853 dynamic mode requires 3.9+" required>
            {(props) => (
              <select
                {...props}
                value={quorumMode}
                onChange={(e) => setQuorumMode(e.target.value as KRaftQuorumMode)}
                className={selectCls}
              >
                {QUORUM_MODES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            )}
          </LabeledField>

          {/* ACL Health */}
          <LabeledField label="ACL Health" required>
            {(props) => (
              <select
                {...props}
                value={aclHealth}
                onChange={(e) => setAclHealth(e.target.value as KRaftAclHealth)}
                className={selectCls}
              >
                {ACL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            )}
          </LabeledField>

          {/* Log Dir Health */}
          <LabeledField label="Log Directory Health" required>
            {(props) => (
              <select
                {...props}
                value={logDirHealth}
                onChange={(e) => setLogDirHealth(e.target.value as KRaftLogDirHealth)}
                className={selectCls}
              >
                {LOG_DIR_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            )}
          </LabeledField>

          {/* Failed Log Dir Count */}
          <LabeledField label="Failed Log Dir Count" description="0 if all healthy">
            {(props) => (
              <input
                {...props}
                type="number"
                value={failedLogDirCount}
                onChange={(e) => setFailedLogDirCount(e.target.value)}
                min="0"
                step="1"
                className={inputCls}
              />
            )}
          </LabeledField>

          {/* Inter-broker config */}
          <LabeledField label="Inter-Broker Config Present">
            {(props) => (
              <select
                {...props}
                value={interBrokerConfigPresent ? "true" : "false"}
                onChange={(e) => setInterBrokerConfigPresent(e.target.value === "true")}
                className={selectCls}
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            )}
          </LabeledField>

          {/* Controller config */}
          <LabeledField label="Controller Config Present">
            {(props) => (
              <select
                {...props}
                value={controllerConfigPresent ? "true" : "false"}
                onChange={(e) => setControllerConfigPresent(e.target.value === "true")}
                className={selectCls}
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            )}
          </LabeledField>
        </div>

        {/* JSON array fields */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <LabeledField label="Controller Node IDs" description="JSON array of integers" required>
            {(props) => (
              <textarea
                {...props}
                value={controllerNodeIdsJson}
                onChange={(e) => setControllerNodeIdsJson(e.target.value)}
                placeholder="[1, 2, 3]"
                className={textareaCls}
                rows={2}
              />
            )}
          </LabeledField>

          <LabeledField label="Broker Node IDs" description="JSON array of integers" required>
            {(props) => (
              <textarea
                {...props}
                value={brokerNodeIdsJson}
                onChange={(e) => setBrokerNodeIdsJson(e.target.value)}
                placeholder="[4, 5, 6]"
                className={textareaCls}
                rows={2}
              />
            )}
          </LabeledField>

          <LabeledField label="Controller Listener Names" description='JSON array, e.g. ["CONTROLLER"]' required>
            {(props) => (
              <textarea
                {...props}
                value={controllerListenerNamesJson}
                onChange={(e) => setControllerListenerNamesJson(e.target.value)}
                placeholder='["CONTROLLER"]'
                className={textareaCls}
                rows={2}
              />
            )}
          </LabeledField>

          {/* Conditional: Static quorum voters */}
          {quorumMode === "static" && (
            <LabeledField
              label="Quorum Voters (Static)"
              description="JSON array of {nodeId, host, port}"
              required
            >
              {(props) => (
                <textarea
                  {...props}
                  value={quorumVotersJson}
                  onChange={(e) => setQuorumVotersJson(e.target.value)}
                  placeholder={'[\n  { "nodeId": 1, "host": "ctrl1", "port": 9093 }\n]'}
                  className={cn(textareaCls, "min-h-[100px]")}
                  rows={4}
                />
              )}
            </LabeledField>
          )}

          {/* Conditional: Dynamic bootstrap servers */}
          {quorumMode === "dynamic" && (
            <LabeledField
              label="Bootstrap Servers (Dynamic)"
              description="JSON array of {host, port} — no voter IDs needed"
              required
            >
              {(props) => (
                <textarea
                  {...props}
                  value={bootstrapServersJson}
                  onChange={(e) => setBootstrapServersJson(e.target.value)}
                  placeholder={'[\n  { "host": "ctrl1.example.com", "port": 9093 }\n]'}
                  className={cn(textareaCls, "min-h-[100px]")}
                  rows={4}
                />
              )}
            </LabeledField>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button onClick={handleAnalyze} className="min-h-[44px]">
            Analyze Readiness
          </Button>
        </div>
      </div>

      {/* Validation errors */}
      <ValidationSummary errors={errors} />

      {/* Results */}
      {result ? (
        <>
          <div className="kraft-print-hide">
            <ExportActions
              onExportMarkdown={() => exportKRaftMarkdown(result)}
              onExportJson={() => exportKRaftJson(result)}
              filenamePrefix="kraft-readiness"
            />
          </div>
          <KRaftResults result={result} />
        </>
      ) : (
        errors.length === 0 && (
          <EmptyState
            title="No analysis yet"
            description="Enter your cluster configuration and click 'Analyze Readiness', or load sample data to see how it works."
          />
        )
      )}
    </div>
  );
}
