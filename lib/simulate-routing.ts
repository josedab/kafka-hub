/**
 * Routing helpers for /simulate deep-links.
 *
 * Pure functions — safe to use in tests, SSR, or client.
 */

import { SCENARIOS } from "@kafka-hub/kafka-sim";

/**
 * Resolve a scenario slug from a URL search parameter.
 * Returns a valid slug or null if the input is invalid/missing.
 */
export function resolveScenarioSlug(param: string | null | undefined): string | null {
  if (!param) return null;
  if (SCENARIOS[param]) return param;
  return null;
}

/**
 * Build a /simulate URL with an optional scenario query parameter.
 */
export function buildSimulateUrl(scenario?: string): string {
  const base = "/simulate";
  if (!scenario) return base;
  if (!SCENARIOS[scenario]) return base;
  return `${base}?scenario=${encodeURIComponent(scenario)}`;
}

/**
 * All valid scenario deep-link slugs.
 */
export function validScenarioSlugs(): string[] {
  return Object.keys(SCENARIOS);
}
