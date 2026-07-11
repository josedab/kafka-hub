/**
 * Listener topology analysis engine.
 *
 * Deterministic: same input always produces the same result.
 * Framework-free, browser/Node compatible.
 *
 * Performs STATIC topology reasoning — never probes DNS or network.
 * Flags topological impossibilities and configuration pitfalls.
 */

import type {
  ListenerTopologyInput,
  ListenerDefinition,
  ListenerAnalysisResult,
  ListenerPlannerResult,
  ListenerDiagnostic,
  DiagnosticSeverity,
  BrokerSnippet,
  ClientSnippet,
  ProtocolMapEntry,
  SecurityProtocol,
  ClientLocation,
} from "./types";

import {
  STANDARD_LISTENER_NAMES,
} from "./types";

import {
  validateUnknownListenerInput,
  validateListenerInput,
  normalizeHost,
  isWildcard,
  isLoopback,
  formatEndpointHost,
} from "./validate";
import {
  CONNECTION_FLOW,
  OBSERVABILITY_RECOMMENDATIONS,
  RESOURCE_LINKS,
} from "./reference-data";

export { RESOURCE_LINKS, SHIPPED_ROUTES } from "./reference-data";

// ─── Helpers ────────────────────────────────────────────────────────────────

function diag(
  id: string,
  severity: DiagnosticSeverity,
  message: string,
  listenerName?: string,
): ListenerDiagnostic {
  return { id, severity, message, ...(listenerName ? { listenerName } : {}) };
}

/** Check if a host looks like a private/internal hostname or IP. */
function isPrivateOrClusterLocal(host: string): boolean {
  const n = normalizeHost(host);
  // Common private patterns
  if (isLoopback(n)) return true;
  if (isWildcard(n)) return true;
  // RFC1918 ranges (simplified)
  if (/^10\./.test(n)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(n)) return true;
  if (/^192\.168\./.test(n)) return true;
  // Kubernetes cluster-local
  if (n.endsWith(".svc.cluster.local")) return true;
  if (n.endsWith(".cluster.local")) return true;
  // Docker internal
  if (n === "host.docker.internal") return true;
  // Link-local IPv4
  if (/^169\.254\./.test(n)) return true;
  // Link-local IPv6 (fe80::/10)
  if (/^fe80:/i.test(n)) return true;
  // ULA IPv6 (fc00::/7 — includes fc00::/8 and fd00::/8)
  if (/^f[cd][0-9a-f]{2}:/i.test(n)) return true;
  return false;
}

/** Check if a host looks like a Docker service name (single word, no dots). */
function isDockerServiceName(host: string): boolean {
  const n = normalizeHost(host);
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(n) && !n.includes(".");
}

/** Check if a host is a Kubernetes service DNS name. */
function isKubernetesServiceDns(host: string): boolean {
  const n = normalizeHost(host);
  return n.endsWith(".svc.cluster.local") || n.endsWith(".cluster.local");
}

/** Whether a client location is remote (not same-host). */
function isRemoteLocation(loc: ClientLocation): boolean {
  return loc !== "same-host";
}

// ─── Analysis ───────────────────────────────────────────────────────────────

/**
 * Analyze a listener topology and produce diagnostics, snippets, and recommendations.
 *
 * Accepts `unknown` at runtime — structurally invalid input returns typed
 * validation issues, never throws.
 */
export function analyzeListeners(input: unknown): ListenerPlannerResult {
  // Structural validation
  const structural = validateUnknownListenerInput(input);
  if (!structural.ok) {
    return { ok: false, issues: structural.issues };
  }

  // Semantic validation
  const semanticIssues = validateListenerInput(structural.input);
  if (semanticIssues.length > 0) {
    return { ok: false, issues: semanticIssues };
  }

  const validInput = structural.input;
  const diagnostics: ListenerDiagnostic[] = [];
  const assumptions: string[] = [];

  // Determine inter-broker listener
  let interBrokerName: string;
  if (validInput.interBrokerListenerName) {
    interBrokerName = validInput.interBrokerListenerName.trim().toUpperCase();
    assumptions.push(
      `Inter-broker listener explicitly set to "${validInput.interBrokerListenerName}".`,
    );
  } else {
    const internal = validInput.listeners.find((l) => l.role === "internal");
    if (internal) {
      interBrokerName = internal.name.trim().toUpperCase();
      assumptions.push(
        `No inter-broker listener specified. Using first internal-role listener "${internal.name}".`,
      );
    } else {
      interBrokerName = validInput.listeners[0].name.trim().toUpperCase();
      assumptions.push(
        `No inter-broker listener specified and no internal-role listener found. Using first listener "${validInput.listeners[0].name}".`,
      );
    }
  }

  // Build protocol map — standard names infer same protocol; custom require explicit
  const protocolMap: ProtocolMapEntry[] = [];
  for (const listener of validInput.listeners) {
    const upperName = listener.name.trim().toUpperCase();
    let protocol: SecurityProtocol;
    if (listener.securityProtocol) {
      protocol = listener.securityProtocol;
    } else if (STANDARD_LISTENER_NAMES.has(upperName)) {
      protocol = upperName as SecurityProtocol;
    } else {
      // Should not reach here — validation rejects this case
      protocol = "PLAINTEXT";
    }
    protocolMap.push({ listenerName: upperName, protocol });
  }

  // ─── Topology Diagnostics ──────────────────────────────────────────────

  // Determine the selected client listener (first external, or first listener)
  const clientListener = validInput.listeners.find((l) => l.role === "external") ?? validInput.listeners[0];
  const hasExternalListener = validInput.listeners.some((l) => l.role === "external");

  // Track diagnostics we've already emitted to avoid duplicates
  const emittedDiagKeys = new Set<string>();

  function emitDiag(d: ListenerDiagnostic): void {
    const key = `${d.id}:${d.listenerName ?? ""}`;
    if (!emittedDiagKeys.has(key)) {
      emittedDiagKeys.add(key);
      diagnostics.push(d);
    }
  }

  for (const listener of validInput.listeners) {
    const name = listener.name;

    // Advertising 0.0.0.0 or ::
    if (isWildcard(listener.advertisedHost)) {
      emitDiag(diag(
        "advertised-wildcard",
        "error",
        `Listener "${name}" advertises wildcard address "${listener.advertisedHost}". ` +
        `Clients receiving 0.0.0.0 or :: in metadata will attempt to connect to themselves ` +
        `or fail with ambiguous routing. Use a specific hostname or IP.`,
        name,
      ));
    }

    // Bind-only wildcard confusion
    if (isWildcard(listener.bindHost) && !isWildcard(listener.advertisedHost)) {
      emitDiag(diag(
        "bind-wildcard-info",
        "info",
        `Listener "${name}" binds to wildcard "${listener.bindHost}" (all interfaces) ` +
        `but advertises specific host "${listener.advertisedHost}". This is correct — ` +
        `the bind address controls which interfaces accept connections, while the ` +
        `advertised address is what clients see in metadata.`,
        name,
      ));
    }

    // Remote clients receiving localhost/loopback
    if (isLoopback(listener.advertisedHost) && listener.role === "external") {
      emitDiag(diag(
        "advertised-loopback-external",
        "error",
        `Listener "${name}" is external but advertises loopback address ` +
        `"${listener.advertisedHost}". Remote clients receiving this in metadata ` +
        `will connect to their own machine, not the broker. Use the broker's ` +
        `routable hostname or IP.`,
        name,
      ));
    }
  }

  // Analyze reachability for the selected client listener regardless of role
  const loc = validInput.clientLocation;
  const ctx = validInput.topologyContext;

  analyzeClientReachability(clientListener, loc, ctx, emitDiag);

  // If no external listener and remote client, add info diagnostic
  if (!hasExternalListener && isRemoteLocation(loc)) {
    emitDiag(diag(
      "no-external-listener",
      "warning",
      `No external listener is defined, but the client location is "${loc}". ` +
      `The client snippet uses internal listener "${clientListener.name}". ` +
      `Remote clients typically need a dedicated external listener with a ` +
      `routable advertised address.`,
    ));
  }

  // Advertised port mismatch when host publishing / NAT mapping says otherwise
  if (ctx?.natMappedPort !== undefined) {
    for (const listener of validInput.listeners) {
      if (listener.role === "external" && listener.advertisedPort !== ctx.natMappedPort) {
        emitDiag(diag(
          "advertised-port-nat-mismatch",
          "error",
          `Listener "${listener.name}" advertises port ${listener.advertisedPort} but the ` +
          `NAT mapping specifies external port ${ctx.natMappedPort}. Clients will attempt ` +
          `to connect to port ${listener.advertisedPort} which does not match the NAT rule.`,
          listener.name,
        ));
      }
    }
  }

  if (ctx?.hostPortPublished === true) {
    for (const listener of validInput.listeners) {
      if (
        listener.role === "external" &&
        listener.advertisedPort !== listener.bindPort &&
        ctx.natMappedPort === undefined
      ) {
        emitDiag(diag(
          "advertised-port-publish-mismatch",
          "warning",
          `Listener "${listener.name}" advertises port ${listener.advertisedPort} but binds ` +
          `to port ${listener.bindPort} with host port publishing enabled. If the published ` +
          `port maps bind port ${listener.bindPort}, clients connecting to advertised port ` +
          `${listener.advertisedPort} will fail unless a separate port mapping exists.`,
          listener.name,
        ));
      }
    }
  }

  // Add deployment assumption
  assumptions.push(
    `Client location: "${validInput.clientLocation}". Static topology analysis only — no DNS lookups or network probes performed.`,
  );
  if (ctx?.hostPortPublished !== undefined) {
    assumptions.push(`Host port publishing: ${ctx.hostPortPublished ? "enabled" : "disabled"}.`);
  }
  if (ctx?.publicHostname) {
    assumptions.push(`Public hostname: "${ctx.publicHostname}".`);
  }
  if (ctx?.serviceDns) {
    assumptions.push(`Kubernetes service DNS: "${ctx.serviceDns}".`);
  }
  if (ctx?.natMappedPort !== undefined) {
    assumptions.push(`NAT mapped external port: ${ctx.natMappedPort}.`);
  }

  // Generate snippets
  const brokerSnippet = generateBrokerSnippet(validInput.listeners, protocolMap, interBrokerName);
  const clientSnippet = generateClientSnippet(validInput.listeners, protocolMap);

  // Count severities
  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warningCount = diagnostics.filter((d) => d.severity === "warning").length;
  const infoCount = diagnostics.filter((d) => d.severity === "info").length;

  const result: ListenerAnalysisResult = {
    diagnostics,
    errorCount,
    warningCount,
    infoCount,
    brokerSnippet,
    clientSnippet,
    protocolMap,
    connectionFlow: CONNECTION_FLOW,
    recommendations: OBSERVABILITY_RECOMMENDATIONS,
    resourceLinks: RESOURCE_LINKS,
    assumptions,
    interBrokerListenerName: interBrokerName,
    clientLocation: validInput.clientLocation,
  };

  return { ok: true, result };
}

// ─── Client Reachability Analysis ───────────────────────────────────────────

function analyzeClientReachability(
  listener: ListenerDefinition,
  loc: ClientLocation,
  ctx: ListenerTopologyInput["topologyContext"],
  emitDiag: (d: ListenerDiagnostic) => void,
): void {
  const name = listener.name;
  const advHost = listener.advertisedHost;
  const nAdvHost = normalizeHost(advHost);

  switch (loc) {
    case "same-host":
      // localhost or 127.0.0.1 is fine for same-host
      if (!isLoopback(advHost) && !isWildcard(advHost)) {
        emitDiag(diag(
          "same-host-non-loopback",
          "info",
          `Listener "${name}" advertises "${advHost}" for same-host clients. ` +
          `This works if the host can resolve this address to itself. ` +
          `Loopback (localhost/127.0.0.1) is simpler for same-host access.`,
          name,
        ));
      }
      break;

    case "lan":
      if (isLoopback(advHost)) {
        emitDiag(diag(
          "lan-loopback",
          "error",
          `Listener "${name}" advertises loopback "${advHost}" but client location is LAN. ` +
          `LAN clients receiving loopback in metadata will connect to themselves. ` +
          `Use the broker's LAN-routable hostname or IP.`,
          name,
        ));
      }
      break;

    case "docker-host":
      if (isDockerServiceName(advHost)) {
        emitDiag(diag(
          "docker-host-service-name",
          "warning",
          `Listener "${name}" advertises Docker service name "${advHost}". ` +
          `Docker service names are only resolvable inside the Docker network. ` +
          `The Docker host cannot resolve "${advHost}" unless an explicit /etc/hosts ` +
          `entry or DNS mapping exists. Use "localhost" or the host machine's IP/hostname.`,
          name,
        ));
      }
      if (isLoopback(advHost) && ctx?.hostPortPublished !== true) {
        emitDiag(diag(
          "docker-host-no-port-publish",
          "warning",
          `Listener "${name}" advertises loopback "${advHost}" for Docker host access, ` +
          `but host port publishing is not confirmed. Without -p ${listener.bindPort}:${listener.advertisedPort} ` +
          `(or equivalent), the Docker host cannot reach the container's port.`,
          name,
        ));
      }
      if (isLoopback(advHost)) {
        emitDiag(diag(
          "docker-host-loopback",
          "warning",
          `Listener "${name}" advertises loopback "${advHost}" for Docker host clients. ` +
          `This only works with host port publishing (-p). Ensure the container port ` +
          `is published to the host.`,
          name,
        ));
      }
      break;

    case "docker-container":
      if (isLoopback(advHost)) {
        emitDiag(diag(
          "docker-container-loopback",
          "error",
          `Listener "${name}" advertises loopback "${advHost}" but client location is Docker container. ` +
          `Localhost inside a container refers to the container itself, not the broker container. ` +
          `Use the Docker service name or container hostname.`,
          name,
        ));
      }
      if (nAdvHost === "host.docker.internal") {
        emitDiag(diag(
          "docker-container-host-internal",
          "warning",
          `Listener "${name}" advertises "host.docker.internal" for a Docker container client. ` +
          `This address resolves to the Docker host, not other containers. For container-to-container ` +
          `communication, use the Docker network service name.`,
          name,
        ));
      }
      break;

    case "kubernetes-in-cluster":
      if (isLoopback(advHost)) {
        emitDiag(diag(
          "k8s-in-cluster-loopback",
          "error",
          `Listener "${name}" advertises loopback "${advHost}" but client is in-cluster Kubernetes. ` +
          `Pods have isolated network namespaces — loopback resolves to the pod itself. ` +
          `Use the Kubernetes service DNS name or pod FQDN.`,
          name,
        ));
      }
      break;

    case "kubernetes-external":
      if (isKubernetesServiceDns(advHost)) {
        emitDiag(diag(
          "k8s-external-service-dns",
          "error",
          `Listener "${name}" advertises Kubernetes service DNS "${advHost}" for external clients. ` +
          `Kubernetes service DNS (*.svc.cluster.local) is only resolvable from within the cluster. ` +
          `External clients need a NodePort, LoadBalancer IP, or Ingress hostname.`,
          name,
        ));
      }
      if (isLoopback(advHost)) {
        emitDiag(diag(
          "k8s-external-loopback",
          "error",
          `Listener "${name}" advertises loopback "${advHost}" for external Kubernetes clients. ` +
          `External clients cannot reach the broker via loopback. Use the external LoadBalancer ` +
          `IP, NodePort address, or Ingress hostname.`,
          name,
        ));
      }
      if (isPrivateOrClusterLocal(advHost) && !isLoopback(advHost) && !isKubernetesServiceDns(advHost)) {
        if (!ctx?.publicHostname) {
          emitDiag(diag(
            "k8s-external-private",
            "warning",
            `Listener "${name}" advertises private/cluster-local address "${advHost}" for external ` +
            `Kubernetes clients. Without a public hostname or external mapping, external clients ` +
            `cannot reach this address. Provide a publicHostname in topology context.`,
            name,
          ));
        }
      }
      break;

    case "nat":
      if (isLoopback(advHost)) {
        emitDiag(diag(
          "nat-loopback",
          "error",
          `Listener "${name}" advertises loopback "${advHost}" for NAT clients. ` +
          `Clients behind NAT cannot reach the broker via loopback. ` +
          `Use the public/NAT-mapped hostname or IP.`,
          name,
        ));
      }
      if (isPrivateOrClusterLocal(advHost) && !isLoopback(advHost)) {
        if (!ctx?.publicHostname) {
          emitDiag(diag(
            "nat-private-no-public",
            "warning",
            `Listener "${name}" advertises private address "${advHost}" for NAT clients. ` +
            `NAT clients need the public-facing hostname or IP to reach the broker. ` +
            `Provide a publicHostname in topology context or use the public address ` +
            `as the advertised host.`,
            name,
          ));
        }
      }
      break;

    case "internet":
      if (isLoopback(advHost)) {
        emitDiag(diag(
          "internet-loopback",
          "error",
          `Listener "${name}" advertises loopback "${advHost}" for internet clients. ` +
          `Internet clients cannot reach the broker via loopback. ` +
          `Use a publicly resolvable hostname or IP.`,
          name,
        ));
      }
      if (isPrivateOrClusterLocal(advHost) && !isLoopback(advHost)) {
        if (!ctx?.publicHostname) {
          emitDiag(diag(
            "internet-private-no-public",
            "error",
            `Listener "${name}" advertises private address "${advHost}" for internet clients. ` +
            `Private addresses (RFC 1918, link-local, ULA, cluster-local) are not routable on the ` +
            `internet. Use a publicly resolvable hostname or IP, or provide a publicHostname ` +
            `in topology context.`,
            name,
          ));
        }
      }
      break;
  }
}

// ─── Snippet Generation ─────────────────────────────────────────────────────

function generateBrokerSnippet(
  listeners: readonly ListenerDefinition[],
  protocolMap: readonly ProtocolMapEntry[],
  interBrokerName: string,
): BrokerSnippet {
  // Sort listeners deterministically by name for reproducible output
  const sorted = [...listeners].sort((a, b) =>
    a.name.trim().toUpperCase().localeCompare(b.name.trim().toUpperCase()),
  );

  const listenersValue = sorted
    .map((l) => `${l.name.trim().toUpperCase()}://${formatEndpointHost(l.bindHost)}:${l.bindPort}`)
    .join(",");

  const advertisedValue = sorted
    .map((l) => `${l.name.trim().toUpperCase()}://${formatEndpointHost(l.advertisedHost)}:${l.advertisedPort}`)
    .join(",");

  const sortedMap = [...protocolMap].sort((a, b) =>
    a.listenerName.localeCompare(b.listenerName),
  );
  const protocolMapValue = sortedMap
    .map((e) => `${e.listenerName}:${e.protocol}`)
    .join(",");

  const hasMultipleListeners = listeners.length > 1;

  return {
    listeners: listenersValue,
    advertisedListeners: advertisedValue,
    listenerSecurityProtocolMap: protocolMapValue,
    ...(hasMultipleListeners ? { interBrokerListenerName: interBrokerName } : {}),
  };
}

function generateClientSnippet(
  listeners: readonly ListenerDefinition[],
  protocolMap: readonly ProtocolMapEntry[],
): ClientSnippet {
  // Find the first external listener, or fall back to the first listener
  const external = listeners.find((l) => l.role === "external") ?? listeners[0];
  const normalizedName = external.name.trim().toUpperCase();
  const mapEntry = protocolMap.find((e) => e.listenerName === normalizedName);
  const protocol: SecurityProtocol = mapEntry?.protocol ?? "PLAINTEXT";

  const bootstrapServers = `${formatEndpointHost(external.advertisedHost)}:${external.advertisedPort}`;

  return {
    bootstrapServers,
    securityProtocol: protocol,
    // Only emit saslMechanism when explicitly provided — never guess/default
    ...(external.saslMechanism ? { saslMechanism: external.saslMechanism } : {}),
  };
}
