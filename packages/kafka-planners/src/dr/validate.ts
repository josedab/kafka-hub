/**
 * Input validation for the DR tabletop planner.
 *
 * Returns typed validation issues — never throws on malformed input.
 * All checks are deterministic and framework-free.
 *
 * `validateUnknownInput` performs structural validation (type guards)
 * on arbitrary runtime values before delegating to `validateDrInput`
 * for semantic validation. This means `analyzeDr` can safely accept
 * `unknown` and never throw on malformed input.
 */

import type {
  DrTabletopInput,
  DrValidationIssue,
  DrValidationIssueKind,
} from "./types";
import { DR_REPLICATION_STRATEGIES } from "./types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function issue(
  kind: DrValidationIssueKind,
  field: string,
  message: string,
): DrValidationIssue {
  return { kind, field, message };
}

/**
 * Check whether a number is safe for computation:
 * finite, not NaN, not exceeding MAX_SAFE_INTEGER.
 */
function isSafeNumber(n: number): boolean {
  return Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER;
}

// ─── Duration Field Definitions ─────────────────────────────────────────────

interface DurationFieldDef {
  readonly key: string;
  readonly label: string;
  /** If true, must be > 0 (positive). If false, must be >= 0 (non-negative). */
  readonly positive: boolean;
}

const DURATION_FIELDS: readonly DurationFieldDef[] = [
  { key: "replicationLagSeconds", label: "Replication lag", positive: false },
  { key: "checkpointIntervalSeconds", label: "Checkpoint interval", positive: true },
  { key: "incidentDetectionSeconds", label: "Incident detection time", positive: false },
  { key: "promotionSeconds", label: "Promotion time", positive: false },
  { key: "dnsTtlSeconds", label: "DNS TTL", positive: false },
  { key: "clientReconnectSeconds", label: "Client reconnect time", positive: false },
  { key: "validationSeconds", label: "Validation time", positive: true },
  { key: "duplicateToleranceSeconds", label: "Duplicate tolerance", positive: false },
];

// ─── Structural Validation ──────────────────────────────────────────────────

/**
 * Structurally validate an unknown value as a DrTabletopInput.
 * Returns either a validated input or an array of structural issues.
 * Never throws.
 */
export function validateUnknownInput(
  input: unknown,
): { ok: true; input: DrTabletopInput } | { ok: false; issues: DrValidationIssue[] } {
  const issues: DrValidationIssue[] = [];

  // Root must be a non-null, non-array object
  if (
    input === null ||
    input === undefined ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    issues.push(
      issue(
        "invalid-root",
        "root",
        `Expected a plain object as input, got ${input === null ? "null" : Array.isArray(input) ? "array" : typeof input}.`,
      ),
    );
    return { ok: false, issues };
  }

  const obj = input as Record<string, unknown>;

  // Validate all duration fields are present and numeric
  for (const def of DURATION_FIELDS) {
    if (!(def.key in obj)) {
      issues.push(
        issue(
          "invalid-field-type",
          def.key,
          `"${def.key}" is required (missing).`,
        ),
      );
    } else if (typeof obj[def.key] !== "number") {
      issues.push(
        issue(
          "invalid-field-type",
          def.key,
          `"${def.key}" must be a number (got ${typeof obj[def.key]}).`,
        ),
      );
    }
  }

  // strategy (optional) — must be a valid string when provided
  if ("strategy" in obj && obj.strategy !== undefined && obj.strategy !== null) {
    if (
      typeof obj.strategy !== "string" ||
      !(DR_REPLICATION_STRATEGIES as readonly string[]).includes(obj.strategy)
    ) {
      issues.push(
        issue(
          "invalid-strategy",
          "strategy",
          `"strategy" must be one of ${DR_REPLICATION_STRATEGIES.join(", ")} (got ${JSON.stringify(obj.strategy)}).`,
        ),
      );
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  // At this point the structural shape is valid — cast safely
  return { ok: true, input: input as DrTabletopInput };
}

// ─── Semantic Validation ────────────────────────────────────────────────────

/**
 * Validate a structurally-valid DrTabletopInput for semantic correctness.
 * Returns an array of validation issues (empty = valid).
 */
export function validateDrInput(input: DrTabletopInput): DrValidationIssue[] {
  const issues: DrValidationIssue[] = [];

  for (const def of DURATION_FIELDS) {
    const value = (input as unknown as Record<string, number>)[def.key];

    // Finite check (catches NaN, Infinity, -Infinity)
    if (!Number.isFinite(value)) {
      issues.push(
        issue(
          "non-finite-value",
          def.key,
          `${def.label} must be a finite number (got ${value}).`,
        ),
      );
      continue;
    }

    // Safe number check (overflow)
    if (!isSafeNumber(value)) {
      issues.push(
        issue(
          "unsafe-number",
          def.key,
          `${def.label} exceeds safe integer range (got ${value}).`,
        ),
      );
      continue;
    }

    // Positivity / non-negativity check
    if (def.positive) {
      if (value <= 0) {
        issues.push(
          issue(
            "non-positive-value",
            def.key,
            `${def.label} must be a positive number > 0 (got ${value}).`,
          ),
        );
      }
    } else {
      if (value < 0) {
        issues.push(
          issue(
            "negative-value",
            def.key,
            `${def.label} must be non-negative (got ${value}).`,
          ),
        );
      }
    }
  }

  return issues;
}
