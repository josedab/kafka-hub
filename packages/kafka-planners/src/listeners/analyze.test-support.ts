import assert from "node:assert/strict";
import {
  analyzeListeners,
  validateUnknownListenerInput,
  exportListenerMarkdown,
  exportListenerJson,
  redactListenerLabel,
  normalizeHost,
  isWildcard,
  isLoopback,
  isValidPort,
  isValidListenerName,
  isValidHost,
  isIPv6,
  formatEndpointHost,
  RESOURCE_LINKS,
  SHIPPED_ROUTES,
  STANDARD_LISTENER_NAMES,
  SASL_MECHANISMS,
} from "./index";
import type {
  ListenerTopologyInput,
  ListenerDefinition,
  ListenerAnalysisResult,
  ClientLocation,
} from "./types";
export { analyzeListeners, validateUnknownListenerInput, exportListenerMarkdown, exportListenerJson, redactListenerLabel, normalizeHost, isWildcard, isLoopback, isValidPort, isValidListenerName, isValidHost, isIPv6, formatEndpointHost, RESOURCE_LINKS, SHIPPED_ROUTES, STANDARD_LISTENER_NAMES, SASL_MECHANISMS };
export type { ListenerTopologyInput, ListenerDefinition, ListenerAnalysisResult, ClientLocation };


// ─── Helpers ────────────────────────────────────────────────────────────────

export function makeListener(overrides?: Partial<ListenerDefinition>): ListenerDefinition {
  return {
    name: "PLAINTEXT",
    bindHost: "0.0.0.0",
    bindPort: 9092,
    advertisedHost: "broker1.local",
    advertisedPort: 9092,
    role: "internal",
    ...overrides,
  };
}

export function makeInput(overrides?: Partial<ListenerTopologyInput>): ListenerTopologyInput {
  return {
    listeners: [
      makeListener({ name: "INTERNAL", securityProtocol: "PLAINTEXT" }),
      makeListener({
        name: "EXTERNAL",
        bindPort: 9093,
        advertisedHost: "broker1.example.com",
        advertisedPort: 9093,
        role: "external",
        securityProtocol: "PLAINTEXT",
      }),
    ],
    clientLocation: "lan",
    ...overrides,
  };
}

export function getResult(input: ListenerTopologyInput): ListenerAnalysisResult {
  const r = analyzeListeners(input);
  assert.ok(r.ok, `Expected ok result, got issues: ${JSON.stringify(r.ok ? null : r.issues)}`);
  return r.result;
}

export function getDiagIds(result: ListenerAnalysisResult): string[] {
  return result.diagnostics.map((d) => d.id);
}

