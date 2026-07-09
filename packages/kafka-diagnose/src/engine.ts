/**
 * Diagnostic rule engine.
 *
 * Parses Java-style .properties text (broker, topic, or client configs) and
 * runs deterministic rules against the key/value map. Each finding can link
 * back to a Learn article for context.
 *
 * Supports both the legacy Rule interface and the new RuleWithFix interface
 * that produces structured fixes alongside findings.
 */

import type { DiagnosticFinding, DiagnosticReport, Rule } from "./types";
import type { StructuredFix } from "./patch";
import type { FindingWithFix } from "./rules/index";
import { allRules } from "./rules/index";

export type { DiagnosticFinding, DiagnosticReport, Severity, Category, Rule } from "./types";
export type { StructuredFix } from "./patch";
export type { RuleWithFix, FindingWithFix } from "./rules/index";

// Re-export allRules as `rules` for backward compatibility
export const rules: Rule[] = allRules;

// ─── Extended finding type ──────────────────────────────────────────────────

export interface DiagnosticFindingWithFix extends DiagnosticFinding {
  structuredFix?: StructuredFix;
}

export interface DiagnosticReportWithFixes extends DiagnosticReport {
  findings: DiagnosticFindingWithFix[];
  fixableCount: number;
}

// ─── Parser (delegates to lossless model) ────────────────────────────────────

import { parsePropertiesDocument, toRecord } from "./properties-document";

/**
 * Parse Java .properties text into a flat Record (last-wins semantics).
 * Delegates to the lossless document model so behavior is consistent:
 * supports =, :, and whitespace separators, line continuations, and escapes.
 */
export function parseProperties(input: string): Record<string, string> {
  const doc = parsePropertiesDocument(input);
  return toRecord(doc);
}

// ─── Evaluation ─────────────────────────────────────────────────────────────

export function evaluate(input: string, ruleset?: Rule[]): DiagnosticReportWithFixes {
  const config = parseProperties(input);
  const findings: DiagnosticFindingWithFix[] = [];
  const effectiveRuleset: Rule[] = ruleset ?? allRules;

  for (const rule of effectiveRuleset) {
    try {
      const result = rule.evaluate(config);
      if (result) {
        for (const finding of asArray(result)) {
          const structuredFix = "structuredFix" in finding
            ? (finding as FindingWithFix).structuredFix
            : undefined;
          const f: DiagnosticFindingWithFix = {
            ruleId: rule.id,
            category: rule.category,
            severity: finding.severity,
            title: finding.title,
            detail: finding.detail,
            learnSlug: finding.learnSlug,
            simulateSlug: finding.simulateSlug,
            fix: finding.fix,
            structuredFix,
          };
          findings.push(f);
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
    fixableCount: findings.filter((f) => f.structuredFix).length,
  };
}

function asArray<T>(v: T | T[]): T[] {
  return Array.isArray(v) ? v : [v];
}
