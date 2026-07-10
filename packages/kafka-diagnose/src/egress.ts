/**
 * Egress redaction boundary.
 *
 * Pure helpers for preparing data for each named egress path.
 * All egress paths MUST go through these helpers for best-effort redaction of
 * common secret patterns. Callers must still tell users to review sanitized
 * output because unconventional key names or encodings may not be recognized.
 *
 * No browser-only globals are used — these run in Node and the browser alike.
 */

import { redactSecrets, type RedactionEntry, type SecretCategory } from "./redact";
import { evaluate } from "./engine";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RedactionReport {
  /** Total number of potential secrets matched and redacted. */
  readonly count: number;
  /** Categorized counts. */
  readonly categories: Record<SecretCategory, number>;
  /** De-duplicated key names that were redacted. */
  readonly keys: readonly string[];
  /** Human-readable summary (safe for accessible feedback, no values). */
  readonly summary: string;
}

export interface EgressPayload<T> {
  /** Payload with recognized secret patterns replaced; review before sharing. */
  readonly payload: T;
  /** Report of what was redacted. */
  readonly report: RedactionReport;
}

export interface JsonExportOptions {
  /** Stable timestamp for deterministic callers and tests. */
  readonly generatedAt?: string;
  /** Injectable clock used when generatedAt is omitted. */
  readonly now?: () => Date;
}

// ─── Report Building ────────────────────────────────────────────────────────

function buildReport(entries: readonly RedactionEntry[]): RedactionReport {
  const categories: Record<SecretCategory, number> = {
    "password": 0,
    "jaas": 0,
    "token": 0,
    "private-key": 0,
    "cloud-credential": 0,
    "secret-like-key": 0,
  };
  const keys = new Set<string>();
  for (const e of entries) {
    categories[e.category]++;
    keys.add(e.key);
  }

  const parts: string[] = [];
  for (const [cat, count] of Object.entries(categories)) {
    if (count > 0) parts.push(`${count} ${cat}`);
  }

  const summary = entries.length === 0
    ? "No common secret patterns detected; review before sharing."
    : `Redacted ${entries.length} potential secret${entries.length !== 1 ? "s" : ""}: ${parts.join(", ")}. Review before sharing.`;

  return {
    count: entries.length,
    categories,
    keys: [...keys],
    summary,
  };
}

// ─── Named Egress Paths ─────────────────────────────────────────────────────

/**
 * Prepare config for URL/hash sharing.
 */
export function prepareForUrl(rawConfig: string): EgressPayload<string> {
  const { redacted, entries } = redactSecrets(rawConfig);
  return { payload: redacted, report: buildReport(entries) };
}

/**
 * Prepare config for localStorage/history persistence.
 */
export function prepareForHistory(rawConfig: string): EgressPayload<string> {
  const { redacted, entries } = redactSecrets(rawConfig);
  return { payload: redacted, report: buildReport(entries) };
}

/**
 * Prepare config for clipboard copy (share link text or corrected config).
 */
export function prepareForClipboard(rawConfig: string): EgressPayload<string> {
  const { redacted, entries } = redactSecrets(rawConfig);
  return { payload: redacted, report: buildReport(entries) };
}

/**
 * Prepare config for JSON export/download.
 */
export function prepareForJsonExport(
  rawConfig: string,
  options: JsonExportOptions = {},
): EgressPayload<string> {
  const { redacted, entries } = redactSecrets(rawConfig);
  const redactedReport = evaluate(redacted);
  const generatedAt =
    options.generatedAt ?? (options.now ?? (() => new Date()))().toISOString();
  const payload = JSON.stringify({
    generatedAt,
    ruleEngineVersion: 1,
    parsedKeys: redactedReport.parsedKeys,
    stats: redactedReport.stats,
    findings: redactedReport.findings,
    redacted: entries.length > 0 ? {
      count: entries.length,
      keys: entries.map((e) => e.key),
      categories: entries.map((e) => e.category),
    } : undefined,
  }, null, 2);
  return { payload, report: buildReport(entries) };
}

/**
 * Prepare corrected .properties text for download.
 * Unlike the old implementation that downloaded unprocessed input, this
 * applies common-pattern redaction before export.
 */
export function prepareForPropertiesDownload(correctedConfig: string): EgressPayload<string> {
  const { redacted, entries } = redactSecrets(correctedConfig);
  return { payload: redacted, report: buildReport(entries) };
}

/**
 * Prepare config for LLM network body.
 */
export function prepareForLlm(rawConfig: string): EgressPayload<string> {
  const { redacted, entries } = redactSecrets(rawConfig);
  return { payload: redacted, report: buildReport(entries) };
}

/**
 * Assert that no currently recognized secret pattern remains.
 * This is a regression helper, not proof that arbitrary input is secret-free.
 */
export function assertNoSecrets(text: string, egressName: string): void {
  const { entries } = redactSecrets(text);
  if (entries.length > 0) {
    throw new Error(
      `Egress "${egressName}" contains ${entries.length} unredacted secret(s): ` +
      entries.map((e) => `${e.key} (${e.category})`).join(", "),
    );
  }
}
