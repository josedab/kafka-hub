/**
 * Input validation for the listener topology wizard.
 *
 * Returns typed validation issues — never throws on malformed input.
 * All checks are deterministic and framework-free.
 *
 * `validateUnknownListenerInput` performs structural validation (type guards)
 * on arbitrary runtime values before delegating to `validateListenerInput`
 * for semantic validation. This means `analyzeListeners` can safely accept
 * `unknown` and never throw on malformed input.
 */

import type {
  ListenerTopologyInput,
  ListenerValidationIssue,
  ListenerValidationIssueKind,
  SecurityProtocol,
  ClientLocation,
  ListenerRole,
  SaslMechanism,
} from "./types";

import {
  SECURITY_PROTOCOLS,
  CLIENT_LOCATIONS,
  LISTENER_ROLES,
  SASL_MECHANISMS,
  STANDARD_LISTENER_NAMES,
} from "./types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function issue(
  kind: ListenerValidationIssueKind,
  field: string,
  message: string,
): ListenerValidationIssue {
  return { kind, field, message };
}

/** Normalize a hostname for comparison: lowercase, strip IPv6 brackets. */
export function normalizeHost(host: string): string {
  let h = host.trim().toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) {
    h = h.slice(1, -1);
  }
  // Strip IPv6 zone ID (%eth0 etc.) for comparison
  const zoneIdx = h.indexOf("%");
  if (zoneIdx !== -1 && h.includes(":")) {
    h = h.slice(0, zoneIdx);
  }
  return h;
}

/** Check if a host is a wildcard address (0.0.0.0 or ::). */
export function isWildcard(host: string): boolean {
  const n = normalizeHost(host);
  return n === "0.0.0.0" || n === "::" || n === "0:0:0:0:0:0:0:0";
}

/** Check if a host is a loopback address. */
export function isLoopback(host: string): boolean {
  const n = normalizeHost(host);
  return (
    n === "localhost" ||
    n === "127.0.0.1" ||
    n === "::1" ||
    n === "0:0:0:0:0:0:0:1"
  );
}

/** Check if a port number is valid (1-65535 integer). */
export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

// ─── Listener Name Validation ───────────────────────────────────────────────

/**
 * Kafka-safe listener name pattern: starts with alphanumeric,
 * contains only alphanumeric, underscore, or hyphen.
 * Rejects commas, colons, slashes, equals, whitespace, control chars,
 * newlines — characters that would corrupt generated properties.
 */
const LISTENER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** Validate a listener name for config-injection safety. */
export function isValidListenerName(name: string): boolean {
  return LISTENER_NAME_RE.test(name);
}

// ─── Host Validation ────────────────────────────────────────────────────────

/**
 * Dangerous characters that could inject into Kafka properties or corrupt
 * generated configuration: whitespace, control chars, comma, equals, slash, colon (for non-IPv6).
 */
const HOST_UNSAFE_RE = /[\s,=\/\\]/;
const HOST_CONTROL_RE = /[\x00-\x1f\x7f]/;

/**
 * Validate a host/address value for config-injection safety.
 * Accepts: hostnames, IPv4, bracketed IPv6 ([::1]), unbracketed IPv6 (::1),
 * IPv6 with zone ID (fe80::1%eth0, [fe80::1%25eth0]).
 * Rejects: empty, whitespace, commas, equals, slashes, control characters.
 */
export function isValidHost(host: string): boolean {
  if (!host || host.trim().length === 0) return false;
  // Check the raw input for control characters before trimming
  // (trim() strips \n, \r, \t which are injection vectors)
  if (HOST_CONTROL_RE.test(host)) return false;
  const trimmed = host.trim();

  // Check for bracketed IPv6
  if (trimmed.startsWith("[")) {
    // Must close with ]. Content between brackets is an IPv6 + optional zone
    const closeBracket = trimmed.lastIndexOf("]");
    if (closeBracket < 0) return false;
    // Nothing else allowed after the bracket
    if (closeBracket !== trimmed.length - 1) return false;
    const inner = trimmed.slice(1, closeBracket);
    // The inner part must be a valid-looking IPv6 (contains colons)
    if (!inner.includes(":")) return false;
    // Check for unsafe chars in inner (except : and % for zone)
    if (/[\s,=\/\\]/.test(inner)) return false;
    return true;
  }

  // Unbracketed: check for unsafe characters.
  // Allow colons (for IPv6) but reject other dangerous chars.
  if (HOST_UNSAFE_RE.test(trimmed)) return false;

  return true;
}

// ─── IPv6 Detection ─────────────────────────────────────────────────────────

/** Check if a normalized host string looks like an IPv6 address. */
export function isIPv6(host: string): boolean {
  const n = normalizeHost(host);
  return n.includes(":");
}

/**
 * Format a host for use in a Kafka endpoint (listeners/advertised.listeners).
 * Brackets IPv6 literals per RFC 2732; avoids double-bracketing.
 */
export function formatEndpointHost(host: string): string {
  const trimmed = host.trim();
  // Already bracketed
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed;
  }
  // Unbracketed IPv6 — must be bracketed
  if (trimmed.includes(":")) {
    return `[${trimmed}]`;
  }
  return trimmed;
}

// ─── Structural Validation ──────────────────────────────────────────────────

/**
 * Structurally validate an unknown value as ListenerTopologyInput.
 * Returns either a validated input or an array of structural issues.
 * Never throws.
 */
export function validateUnknownListenerInput(
  input: unknown,
): { ok: true; input: ListenerTopologyInput } | { ok: false; issues: ListenerValidationIssue[] } {
  const issues: ListenerValidationIssue[] = [];

  if (input === null || input === undefined || typeof input !== "object" || Array.isArray(input)) {
    issues.push(issue(
      "invalid-root",
      "root",
      `Expected a plain object as input, got ${input === null ? "null" : Array.isArray(input) ? "array" : typeof input}.`,
    ));
    return { ok: false, issues };
  }

  const obj = input as Record<string, unknown>;

  // listeners must be a non-empty array
  if (!("listeners" in obj) || !Array.isArray(obj.listeners)) {
    issues.push(issue(
      "invalid-listeners",
      "listeners",
      `"listeners" must be a non-empty array${!("listeners" in obj) ? " (missing)" : ` (got ${typeof obj.listeners})`}.`,
    ));
  } else if (obj.listeners.length === 0) {
    issues.push(issue(
      "invalid-listeners",
      "listeners",
      `"listeners" must contain at least one listener definition.`,
    ));
  } else {
    // Validate each listener object structurally
    for (let i = 0; i < obj.listeners.length; i++) {
      const listener = obj.listeners[i];
      const prefix = `listeners[${i}]`;
      if (listener === null || listener === undefined || typeof listener !== "object" || Array.isArray(listener)) {
        issues.push(issue(
          "invalid-listener-object",
          prefix,
          `${prefix} must be a plain object.`,
        ));
        continue;
      }
      const l = listener as Record<string, unknown>;

      // Required string fields
      for (const field of ["name", "bindHost", "advertisedHost"] as const) {
        if (!(field in l) || typeof l[field] !== "string") {
          issues.push(issue(
            "invalid-field-type",
            `${prefix}.${field}`,
            `${prefix}.${field} must be a string${!(field in l) ? " (missing)" : ` (got ${typeof l[field]})`}.`,
          ));
        }
      }

      // Required number fields
      for (const field of ["bindPort", "advertisedPort"] as const) {
        if (!(field in l) || typeof l[field] !== "number") {
          issues.push(issue(
            "invalid-field-type",
            `${prefix}.${field}`,
            `${prefix}.${field} must be a number${!(field in l) ? " (missing)" : ` (got ${typeof l[field]})`}.`,
          ));
        }
      }

      // Required role field
      if (!("role" in l) || typeof l.role !== "string") {
        issues.push(issue(
          "invalid-field-type",
          `${prefix}.role`,
          `${prefix}.role must be a string${!("role" in l) ? " (missing)" : ` (got ${typeof l.role})`}.`,
        ));
      }

      // Optional securityProtocol
      if ("securityProtocol" in l && l.securityProtocol !== undefined && l.securityProtocol !== null) {
        if (typeof l.securityProtocol !== "string") {
          issues.push(issue(
            "invalid-field-type",
            `${prefix}.securityProtocol`,
            `${prefix}.securityProtocol must be a string when provided (got ${typeof l.securityProtocol}).`,
          ));
        }
      }

      // Optional saslMechanism
      if ("saslMechanism" in l && l.saslMechanism !== undefined && l.saslMechanism !== null) {
        if (typeof l.saslMechanism !== "string") {
          issues.push(issue(
            "invalid-field-type",
            `${prefix}.saslMechanism`,
            `${prefix}.saslMechanism must be a string when provided (got ${typeof l.saslMechanism}).`,
          ));
        }
      }
    }
  }

  // clientLocation must be a string
  if (!("clientLocation" in obj) || typeof obj.clientLocation !== "string") {
    issues.push(issue(
      "invalid-field-type",
      "clientLocation",
      `"clientLocation" must be a string${!("clientLocation" in obj) ? " (missing)" : ` (got ${typeof obj.clientLocation})`}.`,
    ));
  }

  // Optional interBrokerListenerName
  if ("interBrokerListenerName" in obj && obj.interBrokerListenerName !== undefined && obj.interBrokerListenerName !== null) {
    if (typeof obj.interBrokerListenerName !== "string") {
      issues.push(issue(
        "invalid-field-type",
        "interBrokerListenerName",
        `"interBrokerListenerName" must be a string when provided (got ${typeof obj.interBrokerListenerName}).`,
      ));
    }
  }

  // Optional topologyContext
  if ("topologyContext" in obj && obj.topologyContext !== undefined && obj.topologyContext !== null) {
    if (typeof obj.topologyContext !== "object" || Array.isArray(obj.topologyContext)) {
      issues.push(issue(
        "invalid-topology-context",
        "topologyContext",
        `"topologyContext" must be a plain object when provided.`,
      ));
    } else {
      const ctx = obj.topologyContext as Record<string, unknown>;
      if ("hostPortPublished" in ctx && ctx.hostPortPublished !== undefined && typeof ctx.hostPortPublished !== "boolean") {
        issues.push(issue("invalid-field-type", "topologyContext.hostPortPublished",
          `"topologyContext.hostPortPublished" must be a boolean when provided (got ${typeof ctx.hostPortPublished}).`));
      }
      if ("publicHostname" in ctx && ctx.publicHostname !== undefined && typeof ctx.publicHostname !== "string") {
        issues.push(issue("invalid-field-type", "topologyContext.publicHostname",
          `"topologyContext.publicHostname" must be a string when provided (got ${typeof ctx.publicHostname}).`));
      }
      if ("serviceDns" in ctx && ctx.serviceDns !== undefined && typeof ctx.serviceDns !== "string") {
        issues.push(issue("invalid-field-type", "topologyContext.serviceDns",
          `"topologyContext.serviceDns" must be a string when provided (got ${typeof ctx.serviceDns}).`));
      }
      if ("natMappedPort" in ctx && ctx.natMappedPort !== undefined && typeof ctx.natMappedPort !== "number") {
        issues.push(issue("invalid-field-type", "topologyContext.natMappedPort",
          `"topologyContext.natMappedPort" must be a number when provided (got ${typeof ctx.natMappedPort}).`));
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  return { ok: true, input: input as ListenerTopologyInput };
}

// ─── Semantic Validation ────────────────────────────────────────────────────

/**
 * Validate the listener topology input semantically.
 * Assumes structural validation has already passed.
 * Returns an array of validation issues (empty = valid).
 */
export function validateListenerInput(input: ListenerTopologyInput): ListenerValidationIssue[] {
  const issues: ListenerValidationIssue[] = [];

  // Validate clientLocation
  if (!CLIENT_LOCATIONS.includes(input.clientLocation as ClientLocation)) {
    issues.push(issue(
      "invalid-client-location",
      "clientLocation",
      `Invalid client location "${input.clientLocation}". Must be one of: ${CLIENT_LOCATIONS.join(", ")}.`,
    ));
  }

  // Track for duplicate detection
  const seenNames = new Map<string, number>(); // normalized name -> first index
  const seenBindEndpoints = new Map<string, number>(); // host:port -> first index
  const seenAdvertisedEndpoints = new Map<string, number>(); // host:port -> first index

  for (let i = 0; i < input.listeners.length; i++) {
    const listener = input.listeners[i];
    const prefix = `listeners[${i}]`;

    // Empty name
    if (!listener.name || listener.name.trim().length === 0) {
      issues.push(issue(
        "empty-listener-name",
        `${prefix}.name`,
        `${prefix}.name must be a non-empty string.`,
      ));
    } else {
      // Listener name syntax validation
      const trimmedName = listener.name.trim();
      if (!isValidListenerName(trimmedName)) {
        issues.push(issue(
          "invalid-listener-name",
          `${prefix}.name`,
          `${prefix}.name "${trimmedName}" contains invalid characters. ` +
          `Listener names must start with an alphanumeric character and contain only ` +
          `alphanumeric characters, underscores, or hyphens.`,
        ));
      }

      // Duplicate name (case-insensitive)
      const normalizedName = trimmedName.toUpperCase();
      if (seenNames.has(normalizedName)) {
        issues.push(issue(
          "duplicate-listener-name",
          `${prefix}.name`,
          `Duplicate listener name "${listener.name}" (case-insensitive match with listeners[${seenNames.get(normalizedName)}]).`,
        ));
      } else {
        seenNames.set(normalizedName, i);
      }
    }

    // Host validation (bindHost)
    if (!isValidHost(listener.bindHost)) {
      issues.push(issue(
        "invalid-host",
        `${prefix}.bindHost`,
        `${prefix}.bindHost "${listener.bindHost}" is not a valid host. ` +
        `Must be a non-empty hostname, IPv4, or IPv6 address without whitespace, ` +
        `control characters, commas, equals, or slashes.`,
      ));
    }

    // Host validation (advertisedHost)
    if (!isValidHost(listener.advertisedHost)) {
      issues.push(issue(
        "invalid-host",
        `${prefix}.advertisedHost`,
        `${prefix}.advertisedHost "${listener.advertisedHost}" is not a valid host. ` +
        `Must be a non-empty hostname, IPv4, or IPv6 address without whitespace, ` +
        `control characters, commas, equals, or slashes.`,
      ));
    }

    // Valid ports
    if (!isValidPort(listener.bindPort)) {
      issues.push(issue(
        "invalid-port",
        `${prefix}.bindPort`,
        `${prefix}.bindPort must be an integer between 1 and 65535 (got ${listener.bindPort}).`,
      ));
    }
    if (!isValidPort(listener.advertisedPort)) {
      issues.push(issue(
        "invalid-port",
        `${prefix}.advertisedPort`,
        `${prefix}.advertisedPort must be an integer between 1 and 65535 (got ${listener.advertisedPort}).`,
      ));
    }

    // Valid role
    if (!LISTENER_ROLES.includes(listener.role as ListenerRole)) {
      issues.push(issue(
        "invalid-role",
        `${prefix}.role`,
        `${prefix}.role must be one of: ${LISTENER_ROLES.join(", ")} (got "${listener.role}").`,
      ));
    }

    // Valid security protocol (when provided)
    if (listener.securityProtocol !== undefined && listener.securityProtocol !== null) {
      if (!SECURITY_PROTOCOLS.includes(listener.securityProtocol as SecurityProtocol)) {
        issues.push(issue(
          "invalid-security-protocol",
          `${prefix}.securityProtocol`,
          `${prefix}.securityProtocol must be one of: ${SECURITY_PROTOCOLS.join(", ")} (got "${listener.securityProtocol}").`,
        ));
      }
    }

    // Protocol map: custom names require explicit securityProtocol
    if (listener.name && listener.name.trim().length > 0) {
      const upperName = listener.name.trim().toUpperCase();
      if (!STANDARD_LISTENER_NAMES.has(upperName)) {
        // Custom name — must have explicit securityProtocol
        if (listener.securityProtocol === undefined || listener.securityProtocol === null) {
          issues.push(issue(
            "protocol-map-missing",
            `${prefix}.securityProtocol`,
            `Listener "${listener.name}" uses a custom name that does not match a standard ` +
            `Kafka protocol (PLAINTEXT, SSL, SASL_PLAINTEXT, SASL_SSL). An explicit ` +
            `securityProtocol is required for the protocol map.`,
          ));
        }
      }
    }

    // SASL mechanism validation
    if (listener.saslMechanism !== undefined && listener.saslMechanism !== null) {
      if (!SASL_MECHANISMS.includes(listener.saslMechanism as SaslMechanism)) {
        issues.push(issue(
          "invalid-sasl-mechanism",
          `${prefix}.saslMechanism`,
          `${prefix}.saslMechanism must be one of: ${SASL_MECHANISMS.join(", ")} (got "${listener.saslMechanism}").`,
        ));
      }

      // SASL mechanism requires a SASL protocol
      const resolvedProtocol = listener.securityProtocol
        ?? (STANDARD_LISTENER_NAMES.has(listener.name?.trim().toUpperCase() ?? "")
          ? listener.name?.trim().toUpperCase() as SecurityProtocol
          : undefined);
      const isSaslProtocol = resolvedProtocol === "SASL_PLAINTEXT" || resolvedProtocol === "SASL_SSL";
      if (!isSaslProtocol) {
        issues.push(issue(
          "sasl-mechanism-requires-sasl-protocol",
          `${prefix}.saslMechanism`,
          `${prefix}.saslMechanism is set to "${listener.saslMechanism}" but the security protocol ` +
          `${resolvedProtocol ? `"${resolvedProtocol}"` : "(unspecified)"} is not a SASL protocol. ` +
          `saslMechanism requires securityProtocol to be SASL_PLAINTEXT or SASL_SSL.`,
        ));
      }
    }

    // Duplicate bind endpoint
    if (isValidPort(listener.bindPort) && isValidHost(listener.bindHost)) {
      const bindKey = `${normalizeHost(listener.bindHost)}:${listener.bindPort}`;
      if (seenBindEndpoints.has(bindKey)) {
        issues.push(issue(
          "duplicate-bind-endpoint",
          `${prefix}`,
          `Duplicate bind endpoint ${listener.bindHost}:${listener.bindPort} (conflicts with listeners[${seenBindEndpoints.get(bindKey)}]).`,
        ));
      } else {
        seenBindEndpoints.set(bindKey, i);
      }
    }

    // Duplicate advertised endpoint
    if (isValidPort(listener.advertisedPort) && isValidHost(listener.advertisedHost)) {
      const advKey = `${normalizeHost(listener.advertisedHost)}:${listener.advertisedPort}`;
      if (seenAdvertisedEndpoints.has(advKey)) {
        issues.push(issue(
          "duplicate-advertised-endpoint",
          `${prefix}`,
          `Duplicate advertised endpoint ${listener.advertisedHost}:${listener.advertisedPort} (conflicts with listeners[${seenAdvertisedEndpoints.get(advKey)}]).`,
        ));
      } else {
        seenAdvertisedEndpoints.set(advKey, i);
      }
    }
  }

  // interBrokerListenerName validation
  if (input.interBrokerListenerName !== undefined && input.interBrokerListenerName !== null) {
    const ibTrimmed = input.interBrokerListenerName.trim();
    if (ibTrimmed.length > 0 && !isValidListenerName(ibTrimmed)) {
      issues.push(issue(
        "invalid-listener-name",
        "interBrokerListenerName",
        `interBrokerListenerName "${ibTrimmed}" contains invalid characters. ` +
        `Must start with an alphanumeric character and contain only ` +
        `alphanumeric characters, underscores, or hyphens.`,
      ));
    }
    const ibName = ibTrimmed.toUpperCase();
    if (ibTrimmed.length > 0 && !seenNames.has(ibName)) {
      issues.push(issue(
        "inter-broker-not-found",
        "interBrokerListenerName",
        `Inter-broker listener "${input.interBrokerListenerName}" does not match any defined listener name.`,
      ));
    }
  }

  // Validate topology context host fields
  if (input.topologyContext) {
    if (input.topologyContext.natMappedPort !== undefined) {
      if (!isValidPort(input.topologyContext.natMappedPort)) {
        issues.push(issue(
          "invalid-port",
          "topologyContext.natMappedPort",
          `topologyContext.natMappedPort must be an integer between 1 and 65535 (got ${input.topologyContext.natMappedPort}).`,
        ));
      }
    }
    if (input.topologyContext.publicHostname !== undefined && input.topologyContext.publicHostname !== null) {
      if (!isValidHost(input.topologyContext.publicHostname)) {
        issues.push(issue(
          "invalid-host",
          "topologyContext.publicHostname",
          `topologyContext.publicHostname "${input.topologyContext.publicHostname}" is not a valid host.`,
        ));
      }
    }
    if (input.topologyContext.serviceDns !== undefined && input.topologyContext.serviceDns !== null) {
      if (!isValidHost(input.topologyContext.serviceDns)) {
        issues.push(issue(
          "invalid-host",
          "topologyContext.serviceDns",
          `topologyContext.serviceDns "${input.topologyContext.serviceDns}" is not a valid host.`,
        ));
      }
    }
  }

  return issues;
}
