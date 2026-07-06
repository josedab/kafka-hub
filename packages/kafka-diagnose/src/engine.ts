/**
 * Diagnostic rule engine.
 *
 * Parses Java-style .properties text (broker, topic, or client configs) and
 * runs deterministic rules against the key/value map. Each finding can link
 * back to a Learn article for context.
 *
 * Phase 0 ships a small set of seed rules. The engine is structured so adding
 * a rule is a single object in `rules.ts`.
 */

import type { DiagnosticFinding, DiagnosticReport, Rule } from "./types";
import { rules } from "./rules";

export type { DiagnosticFinding, DiagnosticReport, Severity, Category, Rule } from "./types";
export { rules } from "./rules";

const COMMENT = /^\s*[#!]/;
const KV = /^\s*([^=:\s]+)\s*[=:]\s*(.*?)\s*$/;

export function parseProperties(input: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || COMMENT.test(line)) continue;
    const match = line.match(KV);
    if (!match) continue;
    const [, key, value] = match;
    out[key.trim()] = value.trim();
  }
  return out;
}

export function evaluate(input: string, ruleset: Rule[] = rules): DiagnosticReport {
  const config = parseProperties(input);
  const findings: DiagnosticFinding[] = [];

  for (const rule of ruleset) {
    try {
      const result = rule.evaluate(config);
      if (result) {
        for (const finding of asArray(result)) {
          findings.push({ ruleId: rule.id, category: rule.category, ...finding });
        }
      }
    } catch (err) {
      findings.push({
        ruleId: rule.id,
        category: rule.category,
        severity: "info",
        title: `Rule ${rule.id} errored`,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const stats = {
    danger: findings.filter((f) => f.severity === "danger").length,
    warning: findings.filter((f) => f.severity === "warning").length,
    info: findings.filter((f) => f.severity === "info").length,
  };

  return {
    parsedKeys: Object.keys(config).length,
    findings,
    stats,
  };
}

function asArray<T>(v: T | T[]): T[] {
  return Array.isArray(v) ? v : [v];
}
