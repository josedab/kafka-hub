/**
 * Types for the listener topology wizard.
 *
 * Framework-free. All types are pure data — no classes, no side effects.
 * Designed for deterministic static analysis of Kafka listener configurations
 * and client connectivity topology.
 *
 * ─── Topology Model ──────────────────────────────────────────────────────
 *
 * A Kafka broker exposes one or more listeners. Each listener has:
 *   - A bind endpoint (host:port the broker socket binds to)
 *   - An advertised endpoint (host:port returned to clients in metadata)
 *   - A role (internal for inter-broker traffic, external for clients)
 *   - An optional explicit security protocol
 *   - An optional SASL mechanism (only valid with SASL security protocols)
 *
 * The topology context captures where clients connect from, which determines
 * whether advertised endpoints are reachable.
 *
 * ─── Protocol Map Model ─────────────────────────────────────────────────
 *
 * Kafka's listener.security.protocol.map maps listener names to security
 * protocols. For standard listener names that exactly match a protocol name
 * (PLAINTEXT, SSL, SASL_PLAINTEXT, SASL_SSL), Kafka infers the same-name
 * protocol. For custom listener names (INTERNAL, EXTERNAL, BROKER, etc.),
 * an explicit securityProtocol must be provided — the planner returns a
 * typed `protocol-map-missing` validation issue when absent.
 *
 * ─── Assumptions ─────────────────────────────────────────────────────────
 *
 * This module performs STATIC topology reasoning only:
 *   - It does not perform DNS lookups or network probes.
 *   - It does not validate that hostnames actually resolve.
 *   - It flags topological impossibilities (e.g., localhost from a container)
 *     but never claims actual reachability.
 *   - IPv6 addresses are accepted in both bracketed ([::1]) and unbracketed
 *     (::1) form; generated endpoints bracket IPv6 literals per RFC 2732.
 *   - Hostnames are compared case-insensitively per RFC 4343.
 */

// ─── Security Protocol ──────────────────────────────────────────────────────

/** Kafka security protocols. */
export type SecurityProtocol =
  | "PLAINTEXT"
  | "SSL"
  | "SASL_PLAINTEXT"
  | "SASL_SSL";

/** Valid security protocol strings for runtime type-guarding. */
export const SECURITY_PROTOCOLS: readonly SecurityProtocol[] = [
  "PLAINTEXT",
  "SSL",
  "SASL_PLAINTEXT",
  "SASL_SSL",
];

/**
 * Standard listener names that exactly match a security protocol name.
 * When a listener uses one of these names, the protocol can be inferred
 * from the name itself without an explicit securityProtocol field.
 */
export const STANDARD_LISTENER_NAMES: ReadonlySet<string> = new Set([
  "PLAINTEXT",
  "SSL",
  "SASL_PLAINTEXT",
  "SASL_SSL",
]);

// ─── SASL Mechanism ─────────────────────────────────────────────────────────

/** Supported SASL mechanisms. */
export type SaslMechanism =
  | "PLAIN"
  | "SCRAM-SHA-256"
  | "SCRAM-SHA-512"
  | "GSSAPI"
  | "OAUTHBEARER";

/** Valid SASL mechanism strings for runtime type-guarding. */
export const SASL_MECHANISMS: readonly SaslMechanism[] = [
  "PLAIN",
  "SCRAM-SHA-256",
  "SCRAM-SHA-512",
  "GSSAPI",
  "OAUTHBEARER",
];

// ─── Listener Role ──────────────────────────────────────────────────────────

/** Listener role: internal (inter-broker) or external (client-facing). */
export type ListenerRole = "internal" | "external";

/** Valid listener role strings for runtime type-guarding. */
export const LISTENER_ROLES: readonly ListenerRole[] = ["internal", "external"];

// ─── Client Location ───────────────────────────────────────────────────────

/**
 * Where the client is connecting from relative to the broker.
 * Determines which advertised endpoints are reachable.
 */
export type ClientLocation =
  | "same-host"
  | "lan"
  | "docker-host"
  | "docker-container"
  | "kubernetes-in-cluster"
  | "kubernetes-external"
  | "nat"
  | "internet";

/** Valid client location strings for runtime type-guarding. */
export const CLIENT_LOCATIONS: readonly ClientLocation[] = [
  "same-host",
  "lan",
  "docker-host",
  "docker-container",
  "kubernetes-in-cluster",
  "kubernetes-external",
  "nat",
  "internet",
];

// ─── Listener Definition ────────────────────────────────────────────────────

/** A single Kafka listener definition. */
export interface ListenerDefinition {
  /** Unique listener name (e.g., INTERNAL, EXTERNAL, BROKER). Case-insensitive for uniqueness. */
  readonly name: string;

  /** Host/address the broker socket binds to. Use 0.0.0.0 for all interfaces. */
  readonly bindHost: string;
  /** Port the broker socket binds to. Must be 1–65535. */
  readonly bindPort: number;

  /** Host/address returned to clients in metadata response. */
  readonly advertisedHost: string;
  /** Port returned to clients in metadata response. Must be 1–65535. */
  readonly advertisedPort: number;

  /** Listener role. */
  readonly role: ListenerRole;

  /**
   * Explicit security protocol. Required for custom listener names.
   * For standard listener names (PLAINTEXT, SSL, SASL_PLAINTEXT, SASL_SSL),
   * the protocol is inferred from the name when omitted.
   */
  readonly securityProtocol?: SecurityProtocol;

  /**
   * Optional SASL mechanism. Only valid when securityProtocol is
   * SASL_PLAINTEXT or SASL_SSL. When omitted, no mechanism is assumed.
   * This is a mechanism name only — no credentials or JAAS config.
   */
  readonly saslMechanism?: SaslMechanism;
}

// ─── Topology Context ───────────────────────────────────────────────────────

/**
 * Focused topology context needed for truthful validation.
 *
 * These fields capture the minimum deployment context needed to reason about
 * whether advertised endpoints are reachable from the client location.
 * The planner does NOT perform any network probes — these are user-declared
 * facts about the deployment topology.
 */
export interface TopologyContext {
  /**
   * Whether the broker's host port is published (e.g., Docker -p flag or
   * Kubernetes NodePort/LoadBalancer). Required when client is on the Docker
   * host, Kubernetes external, NAT, or internet.
   *
   * Assumption: when not provided, the planner assumes ports are NOT published
   * for Docker/Kubernetes scenarios, and ARE directly accessible for
   * same-host/LAN scenarios.
   */
  readonly hostPortPublished?: boolean;

  /**
   * External DNS name or public IP that resolves to this broker from
   * outside the cluster network. Required for NAT/internet client locations
   * to validate that private/cluster-local hostnames aren't advertised.
   *
   * Assumption: when not provided for NAT/internet, the planner flags a
   * warning that external reachability cannot be validated.
   */
  readonly publicHostname?: string;

  /**
   * Kubernetes service DNS name (e.g., kafka-0.kafka-headless.default.svc.cluster.local).
   * When provided, the planner can validate that internal clients use service
   * DNS and external clients do NOT rely on cluster-local DNS.
   *
   * Assumption: service DNS is only resolvable from within the Kubernetes cluster.
   */
  readonly serviceDns?: string;

  /**
   * NAT mapping: the external port that maps to the broker's bind port.
   * When provided, the planner validates that the advertised port matches
   * the NAT-mapped external port.
   *
   * Assumption: when the NAT mapping differs from the advertised port,
   * clients will connect to the wrong port.
   */
  readonly natMappedPort?: number;
}

// ─── Input ──────────────────────────────────────────────────────────────────

/** Complete input to the listener topology wizard. */
export interface ListenerTopologyInput {
  /** One or more listener definitions. At least one is required. */
  readonly listeners: readonly ListenerDefinition[];

  /** Where the client is connecting from. */
  readonly clientLocation: ClientLocation;

  /**
   * Listener name selected for inter-broker communication.
   * Must match one of the listener names (case-insensitive).
   * Optional — when omitted, the planner assumes the first internal-role listener.
   */
  readonly interBrokerListenerName?: string;

  /**
   * Focused topology context for deployment-specific validation.
   */
  readonly topologyContext?: TopologyContext;
}

// ─── Validation ─────────────────────────────────────────────────────────────

/** Categories of validation issues. */
export type ListenerValidationIssueKind =
  | "invalid-root"
  | "invalid-listeners"
  | "invalid-listener-object"
  | "invalid-field-type"
  | "empty-listener-name"
  | "invalid-listener-name"
  | "duplicate-listener-name"
  | "invalid-port"
  | "duplicate-bind-endpoint"
  | "duplicate-advertised-endpoint"
  | "invalid-client-location"
  | "invalid-role"
  | "invalid-security-protocol"
  | "invalid-sasl-mechanism"
  | "sasl-mechanism-requires-sasl-protocol"
  | "inter-broker-not-found"
  | "protocol-map-missing"
  | "invalid-topology-context"
  | "invalid-host";

/** A single validation issue. */
export interface ListenerValidationIssue {
  readonly kind: ListenerValidationIssueKind;
  readonly field: string;
  readonly message: string;
}

// ─── Diagnostic Severity ────────────────────────────────────────────────────

/** Severity for topology diagnostics. */
export type DiagnosticSeverity = "error" | "warning" | "info";

/** A topology diagnostic finding. */
export interface ListenerDiagnostic {
  /** Unique diagnostic ID for testing/reference. */
  readonly id: string;
  /** Severity level. */
  readonly severity: DiagnosticSeverity;
  /** Human-readable summary. */
  readonly message: string;
  /** Which listener name this relates to, if applicable. */
  readonly listenerName?: string;
}

// ─── Connection Flow ────────────────────────────────────────────────────────

/** A single step in the Kafka client connection flow. */
export interface ConnectionFlowStep {
  /** Step number (1-based). */
  readonly step: number;
  /** Short label for this step. */
  readonly label: string;
  /** Detailed explanation of what happens in this step. */
  readonly description: string;
}

/** The complete Kafka connection flow explanation. */
export interface ConnectionFlowExplanation {
  /** Ordered steps of the connection flow. */
  readonly steps: readonly ConnectionFlowStep[];
  /** Why a reachable bootstrap alone is insufficient. */
  readonly whyBootstrapIsInsufficient: string;
}

// ─── Protocol Map Entry ─────────────────────────────────────────────────────

/** A listener.security.protocol.map entry. */
export interface ProtocolMapEntry {
  readonly listenerName: string;
  readonly protocol: SecurityProtocol;
}

// ─── Generated Snippets ─────────────────────────────────────────────────────

/** Generated broker configuration snippet. */
export interface BrokerSnippet {
  /** The listeners property value. */
  readonly listeners: string;
  /** The advertised.listeners property value. */
  readonly advertisedListeners: string;
  /** The listener.security.protocol.map property value. */
  readonly listenerSecurityProtocolMap: string;
  /** The inter.broker.listener.name property value (when applicable). */
  readonly interBrokerListenerName?: string;
}

/** Generated client configuration snippet. */
export interface ClientSnippet {
  /** The bootstrap.servers property value. */
  readonly bootstrapServers: string;
  /** The security.protocol property value. */
  readonly securityProtocol: SecurityProtocol;
  /**
   * Optional SASL mechanism name (e.g., "SCRAM-SHA-256").
   * Only included when the listener has an explicit saslMechanism.
   * This is a mechanism name only — no credentials or JAAS config.
   */
  readonly saslMechanism?: string;
}

// ─── Observability Recommendations ──────────────────────────────────────────

/** An observability recommendation for listener troubleshooting. */
export interface ListenerObservabilityRecommendation {
  /** Metric or signal name. */
  readonly metric: string;
  /** What it measures, including units. */
  readonly description: string;
  /** Why this metric matters for listener failures. */
  readonly rationale: string;
  /** When this signal is NOT sufficient alone. */
  readonly caveat: string;
}

// ─── Resource Links ─────────────────────────────────────────────────────────

/** A cross-link to a related Kafka Hub resource. */
export interface ListenerResourceLink {
  readonly label: string;
  readonly href: string;
  readonly surface: "learn" | "runbooks" | "errors" | "simulate" | "diagnose" | "workbench";
}

// ─── Analysis Result ────────────────────────────────────────────────────────

/** Complete listener topology analysis result. */
export interface ListenerAnalysisResult {
  /** Topology diagnostics (errors, warnings, info). */
  readonly diagnostics: readonly ListenerDiagnostic[];

  /** Error count. */
  readonly errorCount: number;
  /** Warning count. */
  readonly warningCount: number;
  /** Info count. */
  readonly infoCount: number;

  /** Generated broker configuration snippet. */
  readonly brokerSnippet: BrokerSnippet;
  /** Generated client configuration snippet (for the selected external listener). */
  readonly clientSnippet: ClientSnippet;

  /** Protocol map entries. */
  readonly protocolMap: readonly ProtocolMapEntry[];

  /** Kafka connection flow explanation. */
  readonly connectionFlow: ConnectionFlowExplanation;

  /** Observability recommendations. */
  readonly recommendations: readonly ListenerObservabilityRecommendation[];

  /** Resource links. */
  readonly resourceLinks: readonly ListenerResourceLink[];

  /** Assumptions used for transparency. */
  readonly assumptions: readonly string[];

  /** The selected inter-broker listener name. */
  readonly interBrokerListenerName: string;

  /** The selected client location. */
  readonly clientLocation: ClientLocation;
}

// ─── Analysis Result (discriminated union) ──────────────────────────────────

/** Successful analysis or validation failure. */
export type ListenerPlannerResult =
  | { readonly ok: true; readonly result: ListenerAnalysisResult }
  | { readonly ok: false; readonly issues: readonly ListenerValidationIssue[] };
