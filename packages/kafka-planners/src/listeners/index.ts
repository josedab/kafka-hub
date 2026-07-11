/**
 * @kafka-hub/kafka-planners/listeners
 *
 * Listener topology wizard. Accepts listener definitions, client location,
 * and topology context. Returns deterministic diagnostics, broker/client
 * configuration snippets, connection flow explanation, and observability
 * recommendations.
 *
 * Import:
 *   import { analyzeListeners } from "@kafka-hub/kafka-planners/listeners";
 *
 * Framework-free. No network, no accounts, no cluster connection.
 */

// Core analysis
export { analyzeListeners } from "./analyze";
export { RESOURCE_LINKS, SHIPPED_ROUTES } from "./reference-data";

// Validation
export {
  validateUnknownListenerInput,
  validateListenerInput,
  normalizeHost,
  isWildcard,
  isLoopback,
  isValidPort,
  isValidListenerName,
  isValidHost,
  isIPv6,
  formatEndpointHost,
} from "./validate";

// Export
export { exportListenerMarkdown, exportListenerJson, redactListenerLabel } from "./export";
export type { ListenerExportResult } from "./export";

// Types
export type {
  SecurityProtocol,
  SaslMechanism,
  ListenerRole,
  ClientLocation,
  ListenerDefinition,
  TopologyContext,
  ListenerTopologyInput,
  ListenerValidationIssueKind,
  ListenerValidationIssue,
  DiagnosticSeverity,
  ListenerDiagnostic,
  ConnectionFlowStep,
  ConnectionFlowExplanation,
  ProtocolMapEntry,
  BrokerSnippet,
  ClientSnippet,
  ListenerObservabilityRecommendation,
  ListenerResourceLink,
  ListenerAnalysisResult,
  ListenerPlannerResult,
} from "./types";

export {
  SECURITY_PROTOCOLS,
  SASL_MECHANISMS,
  STANDARD_LISTENER_NAMES,
  LISTENER_ROLES,
  CLIENT_LOCATIONS,
} from "./types";
