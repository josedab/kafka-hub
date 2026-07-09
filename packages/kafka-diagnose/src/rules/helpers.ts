/**
 * Shared typed helpers for diagnostic rules.
 */

import type { Category, DiagnosticFinding } from "../types";
import type { StructuredFix } from "../patch";

/** Parse a numeric string, returning undefined for non-finite values. */
export function num(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Parse an exact Kafka boolean literal after trim/case normalization. */
export function bool(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  const normalized = v.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return undefined;
}

/** Extended finding with optional structured fix. */
export type FindingWithFix = Omit<DiagnosticFinding, "ruleId" | "category"> & {
  structuredFix?: StructuredFix;
};

/** Extended Rule type that supports structured fixes. */
export interface RuleWithFix {
  id: string;
  category: Category;
  evaluate(
    config: Record<string, string>,
  ): FindingWithFix | FindingWithFix[] | null | undefined;
}

/** Create a set-value structured fix. */
export function setFix(
  label: string,
  key: string,
  value: string,
  safe = true,
): StructuredFix {
  return {
    label,
    operations: [{ kind: "set", op: { key, value } }],
    safe,
  };
}

/** Create a replace-value structured fix. */
export function replaceFix(
  label: string,
  key: string,
  oldValue: string,
  newValue: string,
  safe = true,
): StructuredFix {
  return {
    label,
    operations: [{ kind: "replace", op: { key, oldValue, newValue } }],
    safe,
  };
}

/** Create a remove-key structured fix. */
export function removeFix(
  label: string,
  key: string,
  safe = true,
): StructuredFix {
  return {
    label,
    operations: [{ kind: "remove", op: { key } }],
    safe,
  };
}

/** Create a multi-operation structured fix. */
export function multiFix(
  label: string,
  ops: StructuredFix["operations"],
  safe = true,
): StructuredFix {
  return { label, operations: ops, safe };
}
