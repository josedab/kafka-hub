/**
 * Export / sanitization module for listener topology analysis results.
 *
 * Produces broker/client configuration snippets with secret redaction.
 * Reuses @kafka-hub/kafka-diagnose redaction primitives.
 *
 * SECURITY: Generated output omits credential values by design:
 *   - No passwords, JAAS configs, tokens, or keystore paths
 *   - No credential placeholders that look real
 *   - SASL mechanism is a name only (e.g., "SCRAM-SHA-256")
 *   - All user-supplied text routed through redaction as defense in depth
 *   - Diagnostic messages, protocol-map listener names, inter-broker name,
 *     and assumptions are all sanitized before export
 */

import type { ListenerAnalysisResult, BrokerSnippet, ClientSnippet } from "./types";
import { redactSecrets } from "@kafka-hub/kafka-diagnose";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ListenerExportResult {
  /** The exported content (Markdown or JSON string). */
  readonly content: string;
  /** Summary of what was redacted. */
  readonly redactionSummary: string;
  /** Number of strings that were redacted. */
  readonly redactedCount: number;
}

// ─── Redaction ──────────────────────────────────────────────────────────────

/**
 * Redact user-supplied text through kafka-diagnose redaction.
 * Strips control characters and property-injection patterns as defense in depth.
 */
export function redactListenerLabel(text: string): string {
  // Strip control characters and newlines first
  const sanitized = text.replace(/[\x00-\x1f\x7f]/g, "");
  return redactSecrets(sanitized).redacted;
}

/**
 * Tracked-redact: redact text and count unique redaction entries.
 * Uses a Set of dedup keys to avoid double-counting the same field occurrence.
 */
function createRedactionTracker() {
  const seen = new Set<string>();
  let count = 0;

  function redact(text: string, dedupKey?: string): string {
    const sanitized = text.replace(/[\x00-\x1f\x7f]/g, "");
    const { redacted, entries } = redactSecrets(sanitized);
    for (const entry of entries) {
      const key = dedupKey ? `${dedupKey}:${entry.key}:${entry.category}` : `${entry.key}:${entry.category}:${entry.line}`;
      if (!seen.has(key)) {
        seen.add(key);
        count++;
      }
    }
    return redacted;
  }

  return { redact, getCount: () => count };
}

/**
 * Redact all user-supplied strings in a broker snippet.
 */
function redactBrokerSnippet(
  snippet: BrokerSnippet,
  tracker: ReturnType<typeof createRedactionTracker>,
): BrokerSnippet {
  return {
    listeners: tracker.redact(snippet.listeners, "broker.listeners"),
    advertisedListeners: tracker.redact(snippet.advertisedListeners, "broker.advertisedListeners"),
    listenerSecurityProtocolMap: tracker.redact(snippet.listenerSecurityProtocolMap, "broker.protocolMap"),
    ...(snippet.interBrokerListenerName
      ? { interBrokerListenerName: tracker.redact(snippet.interBrokerListenerName, "broker.interBrokerListenerName") }
      : {}),
  };
}

/**
 * Redact all user-supplied strings in a client snippet.
 */
function redactClientSnippet(
  snippet: ClientSnippet,
  tracker: ReturnType<typeof createRedactionTracker>,
): ClientSnippet {
  return {
    bootstrapServers: tracker.redact(snippet.bootstrapServers, "client.bootstrapServers"),
    securityProtocol: snippet.securityProtocol,
    ...(snippet.saslMechanism ? { saslMechanism: snippet.saslMechanism } : {}),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const SEVERITY_LABELS: Record<string, string> = {
  error: "Error",
  warning: "Warning",
  info: "Info",
};

// ─── Markdown Export ────────────────────────────────────────────────────────

/**
 * Export listener analysis result as sanitized Markdown.
 */
export function exportListenerMarkdown(result: ListenerAnalysisResult): ListenerExportResult {
  const now = new Date().toISOString();
  const tracker = createRedactionTracker();
  const rBroker = redactBrokerSnippet(result.brokerSnippet, tracker);
  const rClient = redactClientSnippet(result.clientSnippet, tracker);

  const lines: string[] = [];

  lines.push("# Listener Topology Report");
  lines.push("");
  lines.push(`**Generated:** ${now}`);
  lines.push(`**Client Location:** ${result.clientLocation}`);
  lines.push(`**Inter-Broker Listener:** ${tracker.redact(result.interBrokerListenerName, "interBrokerListenerName")}`);
  lines.push(`**Diagnostics:** ${result.errorCount} error(s), ${result.warningCount} warning(s), ${result.infoCount} info`);
  lines.push("");

  // Diagnostics — redact all messages and listener names
  if (result.diagnostics.length > 0) {
    lines.push("## Diagnostics");
    lines.push("");
    for (const d of result.diagnostics) {
      const label = SEVERITY_LABELS[d.severity] ?? d.severity;
      const listenerLabel = d.listenerName ? ` [${tracker.redact(d.listenerName, `diag.${d.id}.listenerName`)}]` : "";
      const message = tracker.redact(d.message, `diag.${d.id}.message`);
      lines.push(`- **[${label}]**${listenerLabel} ${message}`);
    }
    lines.push("");
  }

  // Broker snippet
  lines.push("## Broker Configuration");
  lines.push("");
  lines.push("```properties");
  lines.push(`listeners=${rBroker.listeners}`);
  lines.push(`advertised.listeners=${rBroker.advertisedListeners}`);
  lines.push(`listener.security.protocol.map=${rBroker.listenerSecurityProtocolMap}`);
  if (rBroker.interBrokerListenerName) {
    lines.push(`inter.broker.listener.name=${rBroker.interBrokerListenerName}`);
  }
  lines.push("```");
  lines.push("");

  // Client snippet
  lines.push("## Client Configuration");
  lines.push("");
  lines.push("```properties");
  lines.push(`bootstrap.servers=${rClient.bootstrapServers}`);
  lines.push(`security.protocol=${rClient.securityProtocol}`);
  if (rClient.saslMechanism) {
    lines.push(`sasl.mechanism=${rClient.saslMechanism}`);
    lines.push("# SASL credentials omitted — configure sasl.jaas.config separately");
  }
  lines.push("```");
  lines.push("");

  // Connection flow
  lines.push("## Kafka Client Connection Flow");
  lines.push("");
  for (const step of result.connectionFlow.steps) {
    lines.push(`### Step ${step.step}: ${step.label}`);
    lines.push("");
    lines.push(step.description);
    lines.push("");
  }
  lines.push("### Why Bootstrap Alone Is Insufficient");
  lines.push("");
  lines.push(result.connectionFlow.whyBootstrapIsInsufficient);
  lines.push("");

  // Protocol map
  if (result.protocolMap.length > 0) {
    lines.push("## Protocol Map");
    lines.push("");
    for (const entry of result.protocolMap) {
      lines.push(`- ${tracker.redact(entry.listenerName, `protocolMap.${entry.listenerName}`)}: ${entry.protocol}`);
    }
    lines.push("");
  }

  // Assumptions — redact each assumption
  if (result.assumptions.length > 0) {
    lines.push("## Assumptions");
    lines.push("");
    for (let i = 0; i < result.assumptions.length; i++) {
      lines.push(`- ${tracker.redact(result.assumptions[i], `assumption.${i}`)}`);
    }
    lines.push("");
  }

  // Observability
  lines.push("## Observability Recommendations");
  lines.push("");
  for (const rec of result.recommendations) {
    lines.push(`### ${rec.metric}`);
    lines.push("");
    lines.push(rec.description);
    lines.push("");
    lines.push(`**Rationale:** ${rec.rationale}`);
    lines.push("");
    lines.push(`**Caveat:** ${rec.caveat}`);
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("Generated by @kafka-hub/kafka-planners/listeners. Static topology analysis — not a live diagnosis.");
  lines.push(
    "No credential values are intentionally generated. Common-pattern redaction is applied; review before sharing.",
  );
  lines.push("");

  const totalRedacted = tracker.getCount();
  const content = lines.join("\n");
  const redactionSummary =
    totalRedacted > 0
      ? `Redacted ${totalRedacted} potential secret(s) from listener configuration. Review before sharing.`
      : "No common secret patterns detected in listener configuration; review before sharing.";

  return { content, redactionSummary, redactedCount: totalRedacted };
}

// ─── JSON Export ────────────────────────────────────────────────────────────

/**
 * Export listener analysis result as sanitized JSON.
 */
export function exportListenerJson(result: ListenerAnalysisResult): ListenerExportResult {
  const now = new Date().toISOString();
  const tracker = createRedactionTracker();
  const rBroker = redactBrokerSnippet(result.brokerSnippet, tracker);
  const rClient = redactClientSnippet(result.clientSnippet, tracker);

  // Redact assumptions
  const redactedAssumptions = result.assumptions.map((a, i) =>
    tracker.redact(a, `assumption.${i}`),
  );

  // Redact diagnostic messages and listener names
  const redactedDiagnostics = result.diagnostics.map((d) => ({
    ...d,
    message: tracker.redact(d.message, `diag.${d.id}.message`),
    ...(d.listenerName ? { listenerName: tracker.redact(d.listenerName, `diag.${d.id}.listenerName`) } : {}),
  }));

  // Redact protocol map listener names
  const redactedProtocolMap = result.protocolMap.map((entry) => ({
    listenerName: tracker.redact(entry.listenerName, `protocolMap.${entry.listenerName}`),
    protocol: entry.protocol,
  }));

  const payload = {
    generatedAt: now,
    clientLocation: result.clientLocation,
    interBrokerListenerName: tracker.redact(result.interBrokerListenerName, "interBrokerListenerName"),
    diagnostics: {
      errorCount: result.errorCount,
      warningCount: result.warningCount,
      infoCount: result.infoCount,
      items: redactedDiagnostics,
    },
    brokerSnippet: rBroker,
    clientSnippet: rClient,
    protocolMap: redactedProtocolMap,
    connectionFlow: result.connectionFlow,
    assumptions: redactedAssumptions,
    recommendations: result.recommendations,
    resourceLinks: result.resourceLinks,
    disclaimer:
      "Static topology analysis — not a live diagnosis. No credential values are intentionally generated; review the best-effort sanitized output before sharing.",
  };

  const totalRedacted = tracker.getCount();
  const content = JSON.stringify(payload, null, 2);
  const redactionSummary =
    totalRedacted > 0
      ? `Redacted ${totalRedacted} potential secret(s) from listener configuration. Review before sharing.`
      : "No common secret patterns detected in listener configuration; review before sharing.";

  return { content, redactionSummary, redactedCount: totalRedacted };
}
