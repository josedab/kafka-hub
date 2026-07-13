"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { ResultCard, ResultSection } from "@/components/workbench/result-card";
import { AssumptionsNote } from "@/components/workbench/assumptions-note";
import type { ListenerAnalysisResult, ListenerDiagnostic } from "@kafka-hub/kafka-planners/listeners";

// ─── Severity Display ───────────────────────────────────────────────────────

function severityBadgeTone(severity: string): "danger" | "warning" | "info" | "neutral" {
  switch (severity) {
    case "error": return "danger";
    case "warning": return "warning";
    case "info": return "neutral";
    default: return "neutral";
  }
}

// ─── Diagnostic Item ────────────────────────────────────────────────────────

function DiagnosticItem({ diag }: { diag: ListenerDiagnostic }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-fd-border/50 p-3">
      <Badge tone={severityBadgeTone(diag.severity)} className="mt-0.5 shrink-0">
        {diag.severity}
      </Badge>
      <div className="min-w-0 flex-1">
        {diag.listenerName && (
          <span className="mr-1.5 font-mono text-xs text-fd-muted-foreground">
            [{diag.listenerName}]
          </span>
        )}
        <span className="text-sm">{diag.message}</span>
      </div>
    </div>
  );
}

// ─── Snippet Display ────────────────────────────────────────────────────────

function SnippetBlock({ label, content }: { label: string; content: string }) {
  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-fd-muted-foreground">{label}</p>
      <pre className="mt-1 overflow-x-auto rounded-md border border-fd-border bg-fd-muted/30 p-3 font-mono text-xs leading-relaxed">
        {content}
      </pre>
    </div>
  );
}

// ─── Main Results ───────────────────────────────────────────────────────────

interface ListenersResultsProps {
  result: ListenerAnalysisResult;
}

export function ListenersResults({ result }: ListenersResultsProps) {
  const hasErrors = result.errorCount > 0;
  const hasWarnings = result.warningCount > 0;
  const overallTone = hasErrors ? "critical" : hasWarnings ? "high" : "low";

  // Build broker snippet display
  const brokerLines: string[] = [
    `listeners=${result.brokerSnippet.listeners}`,
    `advertised.listeners=${result.brokerSnippet.advertisedListeners}`,
    `listener.security.protocol.map=${result.brokerSnippet.listenerSecurityProtocolMap}`,
  ];
  if (result.brokerSnippet.interBrokerListenerName) {
    brokerLines.push(`inter.broker.listener.name=${result.brokerSnippet.interBrokerListenerName}`);
  }

  // Build client snippet display
  const clientLines: string[] = [
    `bootstrap.servers=${result.clientSnippet.bootstrapServers}`,
    `security.protocol=${result.clientSnippet.securityProtocol}`,
  ];
  if (result.clientSnippet.saslMechanism) {
    clientLines.push(`sasl.mechanism=${result.clientSnippet.saslMechanism}`);
    clientLines.push("# SASL credentials omitted — configure sasl.jaas.config separately");
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <ResultCard
        title="Topology Analysis"
        tone={overallTone}
        badge={`${result.errorCount}E / ${result.warningCount}W / ${result.infoCount}I`}
        subtitle={`Client location: ${result.clientLocation} · Inter-broker: ${result.interBrokerListenerName}`}
      >
        {/* Diagnostics */}
        {result.diagnostics.length > 0 && (
          <ResultSection title="Diagnostics">
            <div className="space-y-2">
              {result.diagnostics.map((diag, i) => (
                <DiagnosticItem key={`${diag.id}-${i}`} diag={diag} />
              ))}
            </div>
          </ResultSection>
        )}

        {result.diagnostics.length === 0 && (
          <ResultSection title="Diagnostics">
            <p className="text-sm text-fd-muted-foreground">
              No issues found. Topology looks correct for {result.clientLocation} clients.
            </p>
          </ResultSection>
        )}
      </ResultCard>

      {/* Broker Snippet */}
      <ResultCard title="Broker Configuration" tone="low" subtitle="Generated broker properties (no credential values generated)">
        <SnippetBlock label="server.properties" content={brokerLines.join("\n")} />
      </ResultCard>

      {/* Client Snippet */}
      <ResultCard title="Client Configuration" tone="low" subtitle="Generated client properties (no credential values generated)">
        <SnippetBlock label="client.properties" content={clientLines.join("\n")} />
      </ResultCard>

      {/* Connection Flow */}
      <ResultCard title="Kafka Client Connection Flow" tone="low" subtitle="How Kafka clients discover and connect to brokers">
        <div className="space-y-4">
          {result.connectionFlow.steps.map((step) => (
            <div key={step.step} className="flex gap-3">
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-full border border-fd-border bg-fd-muted font-mono text-xs font-bold"
                aria-hidden
              >
                {step.step}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{step.label}</p>
                <p className="mt-0.5 text-xs text-fd-muted-foreground leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
          <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
              Why bootstrap alone is insufficient
            </p>
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
              {result.connectionFlow.whyBootstrapIsInsufficient}
            </p>
          </div>
        </div>
      </ResultCard>

      {/* Observability Recommendations */}
      <ResultCard title="Observability Recommendations" tone="low" subtitle="Evidence-backed monitoring signals for listener troubleshooting">
        <div className="space-y-4">
          {result.recommendations.map((rec, i) => (
            <div key={i} className="rounded-md border border-fd-border/50 p-3">
              <p className="font-mono text-xs font-semibold break-all">{rec.metric}</p>
              <p className="mt-1 text-xs text-fd-muted-foreground leading-relaxed">{rec.description}</p>
              <p className="mt-1.5 text-xs">
                <span className="font-medium">Rationale:</span>{" "}
                <span className="text-fd-muted-foreground">{rec.rationale}</span>
              </p>
              <p className="mt-1 text-xs">
                <span className="font-medium text-amber-700 dark:text-amber-300">Caveat:</span>{" "}
                <span className="text-fd-muted-foreground">{rec.caveat}</span>
              </p>
            </div>
          ))}
        </div>
      </ResultCard>

      {/* Related Resources — min-h-[44px] ensures accessible touch target */}
      <ResultCard title="Related Resources" tone="low">
        <div className="flex flex-wrap gap-2">
          {result.resourceLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "inline-flex min-h-[44px] items-center gap-1 rounded-md border border-fd-border px-2.5 py-1.5 font-mono text-xs transition-colors",
                "hover:border-fd-foreground/30 hover:bg-fd-accent",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring",
              )}
            >
              <Badge tone="neutral" className="text-[8px]">{link.surface}</Badge>
              {link.label}
            </Link>
          ))}
        </div>
      </ResultCard>

      {/* Assumptions */}
      <AssumptionsNote items={result.assumptions} />
    </div>
  );
}
