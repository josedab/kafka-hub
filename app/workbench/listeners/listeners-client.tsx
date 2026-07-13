"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { LabeledTextarea, LabeledField } from "@/components/workbench/labeled-field";
import { ValidationSummary } from "@/components/workbench/validation-summary";
import { ExportActions } from "@/components/workbench/export-actions";
import { EmptyState } from "@/components/workbench/empty-state";
import {
  analyzeListeners,
  exportListenerMarkdown,
  exportListenerJson,
  CLIENT_LOCATIONS,
} from "@kafka-hub/kafka-planners/listeners";
import type {
  ListenerAnalysisResult,
  ListenerValidationIssue,
  ClientLocation,
} from "@kafka-hub/kafka-planners/listeners";
import { SAMPLE_TOPOLOGIES } from "./listeners-sample-data";
import { ListenersResults } from "./listeners-results";

// ─── Client Location Labels ─────────────────────────────────────────────────

const CLIENT_LOCATION_LABELS: Record<ClientLocation, string> = {
  "same-host": "Same Host",
  "lan": "LAN",
  "docker-host": "Docker Host",
  "docker-container": "Docker Container",
  "kubernetes-in-cluster": "Kubernetes In-Cluster",
  "kubernetes-external": "Kubernetes External",
  "nat": "NAT",
  "internet": "Internet",
};

// ─── Component ──────────────────────────────────────────────────────────────

export function ListenersClient() {
  const [topologyJson, setTopologyJson] = useState("");
  const [clientLocation, setClientLocation] = useState<ClientLocation>("lan");
  const [hostPortPublished, setHostPortPublished] = useState<"" | "true" | "false">("");
  const [publicHostname, setPublicHostname] = useState("");
  const [serviceDns, setServiceDns] = useState("");
  const [natMappedPort, setNatMappedPort] = useState("");

  const [result, setResult] = useState<ListenerAnalysisResult | null>(null);
  const [validationIssues, setValidationIssues] = useState<readonly ListenerValidationIssue[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);

  const handleLoadSample = useCallback((index: number) => {
    const sample = SAMPLE_TOPOLOGIES[index];
    if (!sample) return;

    // Set the listeners as JSON
    setTopologyJson(JSON.stringify(sample.input.listeners, null, 2));
    setClientLocation(sample.input.clientLocation);

    // Set topology context
    const ctx = sample.input.topologyContext;
    setHostPortPublished(ctx?.hostPortPublished !== undefined ? String(ctx.hostPortPublished) as "true" | "false" : "");
    setPublicHostname(ctx?.publicHostname ?? "");
    setServiceDns(ctx?.serviceDns ?? "");
    setNatMappedPort(ctx?.natMappedPort !== undefined ? String(ctx.natMappedPort) : "");

    // Clear previous results
    setResult(null);
    setValidationIssues([]);
    setParseError(null);
    setHasAnalyzed(false);
  }, []);

  const handleAnalyze = useCallback(() => {
    setResult(null);
    setValidationIssues([]);
    setParseError(null);

    const trimmed = topologyJson.trim();
    if (!trimmed) {
      setParseError("Listener definitions JSON is empty. Paste a JSON array of listener objects or load a sample topology.");
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

    // Build topology context
    const topologyContext: Record<string, unknown> = {};
    if (hostPortPublished === "true" || hostPortPublished === "false") {
      topologyContext.hostPortPublished = hostPortPublished === "true";
    }
    if (publicHostname.trim()) {
      topologyContext.publicHostname = publicHostname.trim();
    }
    if (serviceDns.trim()) {
      topologyContext.serviceDns = serviceDns.trim();
    }
    if (natMappedPort.trim()) {
      topologyContext.natMappedPort = Number(natMappedPort.trim());
    }

    const input: Record<string, unknown> = {
      listeners: parsed,
      clientLocation,
      ...(Object.keys(topologyContext).length > 0 ? { topologyContext } : {}),
    };

    const analysisResult = analyzeListeners(input);

    setHasAnalyzed(true);
    if (analysisResult.ok) {
      setResult(analysisResult.result);
      setValidationIssues([]);
    } else {
      setResult(null);
      setValidationIssues(analysisResult.issues);
    }
  }, [topologyJson, clientLocation, hostPortPublished, publicHostname, serviceDns, natMappedPort]);

  const handleExportMarkdown = useCallback(() => {
    if (!result) return { content: "", redactionSummary: "" };
    return exportListenerMarkdown(result);
  }, [result]);

  const handleExportJson = useCallback(() => {
    if (!result) return { content: "", redactionSummary: "" };
    return exportListenerJson(result);
  }, [result]);

  return (
    <div className="space-y-6">
      {/* Sample topologies */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">
          Load sample topology
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SAMPLE_TOPOLOGIES.map((sample, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleLoadSample(i)}
              className={cn(
                "min-h-[44px] rounded-lg border border-fd-border bg-fd-card px-3 py-2 text-left text-xs transition-colors",
                "hover:border-fd-foreground/30 hover:bg-fd-accent",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring",
              )}
            >
              <span className="font-medium">{sample.label}</span>
              <span className="ml-1 text-fd-muted-foreground/70">{sample.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Input fields */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <LabeledTextarea
            label="Listener Definitions (JSON)"
            description="Array of listener objects: { name, bindHost, bindPort, advertisedHost, advertisedPort, role, securityProtocol? }"
            value={topologyJson}
            onChange={(e) => setTopologyJson(e.target.value)}
            placeholder={`[\n  {\n    "name": "INTERNAL",\n    "bindHost": "0.0.0.0",\n    "bindPort": 9092,\n    "advertisedHost": "broker1.local",\n    "advertisedPort": 9092,\n    "role": "internal"\n  }\n]`}
            rows={10}
            required
          />
        </div>

        <LabeledField
          label="Client Location"
          description="Where the Kafka client is running relative to the broker."
          required
        >
          {(fieldProps) => (
            <select
              {...fieldProps}
              value={clientLocation}
              onChange={(e) => setClientLocation(e.target.value as ClientLocation)}
              className={cn(
                "min-h-[44px] w-full rounded-lg border border-fd-border bg-fd-card px-3 text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring",
              )}
            >
              {CLIENT_LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>
                  {CLIENT_LOCATION_LABELS[loc]}
                </option>
              ))}
            </select>
          )}
        </LabeledField>

        <LabeledField
          label="Host Port Published"
          description="Whether the broker's port is published/mapped externally (Docker -p, K8s NodePort/LB)."
        >
          {(fieldProps) => (
            <select
              {...fieldProps}
              value={hostPortPublished}
              onChange={(e) => setHostPortPublished(e.target.value as "" | "true" | "false")}
              className={cn(
                "min-h-[44px] w-full rounded-lg border border-fd-border bg-fd-card px-3 text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring",
              )}
            >
              <option value="">Not specified</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          )}
        </LabeledField>

        <LabeledField
          label="Public Hostname"
          description="External DNS name or public IP for NAT/internet access."
        >
          {(fieldProps) => (
            <input
              {...fieldProps}
              type="text"
              value={publicHostname}
              onChange={(e) => setPublicHostname(e.target.value)}
              placeholder="kafka.example.com"
              className={cn(
                "min-h-[44px] w-full rounded-lg border border-fd-border bg-fd-card px-3 font-mono text-sm transition-colors",
                "placeholder:text-fd-muted-foreground/60",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring",
              )}
            />
          )}
        </LabeledField>

        <LabeledField
          label="Kubernetes Service DNS"
          description="K8s service FQDN (e.g., kafka-0.kafka-headless.default.svc.cluster.local)."
        >
          {(fieldProps) => (
            <input
              {...fieldProps}
              type="text"
              value={serviceDns}
              onChange={(e) => setServiceDns(e.target.value)}
              placeholder="kafka-0.kafka-headless.default.svc.cluster.local"
              className={cn(
                "min-h-[44px] w-full rounded-lg border border-fd-border bg-fd-card px-3 font-mono text-sm transition-colors",
                "placeholder:text-fd-muted-foreground/60",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring",
              )}
            />
          )}
        </LabeledField>

        <LabeledField
          label="NAT Mapped Port"
          description="External port that maps to the broker's bind port via NAT."
        >
          {(fieldProps) => (
            <input
              {...fieldProps}
              type="number"
              min="1"
              max="65535"
              value={natMappedPort}
              onChange={(e) => setNatMappedPort(e.target.value)}
              placeholder="29092"
              className={cn(
                "min-h-[44px] w-full rounded-lg border border-fd-border bg-fd-card px-3 font-mono text-sm transition-colors",
                "placeholder:text-fd-muted-foreground/60",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring",
              )}
            />
          )}
        </LabeledField>
      </div>

      {/* Analyze button */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleAnalyze} size="lg" aria-label="Analyze listener topology">
          Analyze Topology
        </Button>
        {result && (
          <ExportActions
            onExportMarkdown={handleExportMarkdown}
            onExportJson={handleExportJson}
            filenamePrefix="kafka-listener-topology"
            className="flex-1"
          />
        )}
      </div>

      {/* Validation errors */}
      {parseError && (
        <ValidationSummary errors={[parseError]} />
      )}
      {validationIssues.length > 0 && (
        <ValidationSummary
          errors={validationIssues.map((i) => `[${i.kind}] ${i.message}`)}
        />
      )}

      {/* Results */}
      {result && <ListenersResults result={result} />}

      {/* Empty state */}
      {hasAnalyzed && !result && validationIssues.length === 0 && !parseError && (
        <EmptyState
          title="No results"
          description="Load a sample topology or paste listener definitions to get started."
        />
      )}
      {!hasAnalyzed && (
        <EmptyState
          title="Listener Topology Wizard"
          description="Load a sample topology or paste listener definitions as JSON, select a client location, then click Analyze Topology."
        />
      )}
    </div>
  );
}
