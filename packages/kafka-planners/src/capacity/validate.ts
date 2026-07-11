/**
 * Input validation for the capacity and N-1 headroom planner.
 *
 * Returns typed validation issues — never NaN, Infinity, or silent fallbacks.
 * All checks are deterministic and framework-free.
 *
 * `validateUnknownCapacityInput` performs structural validation (type guards)
 * on arbitrary runtime values before delegating to `validateCapacityInput`
 * for semantic validation. This means `analyzeCapacity` can safely accept
 * `unknown` and never throw on malformed input.
 */

import type {
  CapacityPlannerInput,
  CapacityValidationIssue,
  CapacityValidationIssueKind,
} from "./types";

/** Default safety/headroom target: 70% utilization (30% headroom). */
export const DEFAULT_SAFETY_HEADROOM_TARGET = 0.7;

/** Default skew factor: perfectly balanced (no skew). */
export const DEFAULT_SKEW_FACTOR = 1.0;

/**
 * Maximum retention bytes before we flag overflow risk.
 * 2^53 - 1 (Number.MAX_SAFE_INTEGER) — beyond this, floating-point
 * precision loss makes the calculation unreliable.
 */
const MAX_SAFE_BYTES = Number.MAX_SAFE_INTEGER;

// ─── Helpers ────────────────────────────────────────────────────────────────

function issue(
  kind: CapacityValidationIssueKind,
  field: string,
  message: string,
): CapacityValidationIssue {
  return { kind, field, message };
}

// ─── Structural Validation ──────────────────────────────────────────────────

/**
 * Structurally validate an unknown value as a CapacityPlannerInput.
 * Returns either a validated input or an array of structural issues.
 * Never throws.
 */
export function validateUnknownCapacityInput(
  input: unknown,
): { ok: true; input: CapacityPlannerInput } | { ok: false; issues: CapacityValidationIssue[] } {
  const issues: CapacityValidationIssue[] = [];

  if (input === null || input === undefined || typeof input !== "object" || Array.isArray(input)) {
    issues.push(issue(
      "invalid-root",
      "root",
      `Expected a plain object as input, got ${input === null ? "null" : Array.isArray(input) ? "array" : typeof input}.`,
    ));
    return { ok: false, issues };
  }

  const obj = input as Record<string, unknown>;

  // Required numeric fields
  const requiredNumericFields = [
    "peakIngressRate",
    "avgRecordSizeBytes",
    "compressionRatio",
    "retentionSeconds",
    "replicationFactor",
    "partitionCount",
    "brokerCount",
    "fullReadConsumerGroupCount",
    "perPartitionTargetThroughput",
    "perBrokerStorageBytes",
    "perBrokerNetworkBytesPerSec",
  ] as const;

  for (const field of requiredNumericFields) {
    if (!(field in obj) || typeof obj[field] !== "number") {
      issues.push(issue(
        "invalid-field-type",
        field,
        `"${field}" must be a number${!(field in obj) ? " (missing)" : ` (got ${typeof obj[field]})`}.`,
      ));
    }
  }

  // Optional numeric fields
  const optionalNumericFields = ["safetyHeadroomTarget", "skewFactor"] as const;
  for (const field of optionalNumericFields) {
    if (field in obj && obj[field] !== undefined && obj[field] !== null) {
      if (typeof obj[field] !== "number") {
        issues.push(issue(
          "invalid-field-type",
          field,
          `"${field}" must be a number when provided (got ${typeof obj[field]}).`,
        ));
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  return { ok: true, input: input as CapacityPlannerInput };
}

// ─── Semantic Validation ────────────────────────────────────────────────────

/**
 * Validate the complete capacity planner input (semantic validation).
 * Assumes structural validation has already passed.
 * Returns an array of validation issues (empty = valid).
 */
export function validateCapacityInput(input: CapacityPlannerInput): CapacityValidationIssue[] {
  const issues: CapacityValidationIssue[] = [];

  // Finite + positive checks
  const finitePositiveFields: Array<[keyof CapacityPlannerInput, string]> = [
    ["peakIngressRate", "peakIngressRate"],
    ["avgRecordSizeBytes", "avgRecordSizeBytes"],
    ["retentionSeconds", "retentionSeconds"],
    ["perPartitionTargetThroughput", "perPartitionTargetThroughput"],
    ["perBrokerStorageBytes", "perBrokerStorageBytes"],
    ["perBrokerNetworkBytesPerSec", "perBrokerNetworkBytesPerSec"],
  ];

  for (const [key, field] of finitePositiveFields) {
    const val = input[key] as number;
    if (!Number.isFinite(val)) {
      issues.push(issue("non-finite-value", field, `${field} must be a finite number (got ${val}).`));
    } else if (val <= 0) {
      issues.push(issue("non-positive-value", field, `${field} must be positive (got ${val}).`));
    }
  }

  // Finite + positive + integer checks
  const integerPositiveFields: Array<[keyof CapacityPlannerInput, string]> = [
    ["replicationFactor", "replicationFactor"],
    ["partitionCount", "partitionCount"],
    ["brokerCount", "brokerCount"],
  ];

  for (const [key, field] of integerPositiveFields) {
    const val = input[key] as number;
    if (!Number.isFinite(val)) {
      issues.push(issue("non-finite-value", field, `${field} must be a finite number (got ${val}).`));
    } else if (val <= 0) {
      issues.push(issue("non-positive-value", field, `${field} must be positive (got ${val}).`));
    } else if (!Number.isInteger(val)) {
      issues.push(issue("non-integer-value", field, `${field} must be an integer (got ${val}).`));
    }
  }

  // fullReadConsumerGroupCount: finite, non-negative, integer
  if (!Number.isFinite(input.fullReadConsumerGroupCount)) {
    issues.push(issue("non-finite-value", "fullReadConsumerGroupCount",
      `fullReadConsumerGroupCount must be a finite number (got ${input.fullReadConsumerGroupCount}).`));
  } else if (input.fullReadConsumerGroupCount < 0) {
    issues.push(issue("non-negative-value", "fullReadConsumerGroupCount",
      `fullReadConsumerGroupCount must be non-negative (got ${input.fullReadConsumerGroupCount}).`));
  } else if (!Number.isInteger(input.fullReadConsumerGroupCount)) {
    issues.push(issue("non-integer-value", "fullReadConsumerGroupCount",
      `fullReadConsumerGroupCount must be an integer (got ${input.fullReadConsumerGroupCount}).`));
  }

  // Compression ratio: (0, 1]
  if (Number.isFinite(input.compressionRatio)) {
    if (input.compressionRatio <= 0 || input.compressionRatio > 1) {
      issues.push(issue("compression-ratio-range", "compressionRatio",
        `compressionRatio must be in (0, 1] where 1.0 = no compression (got ${input.compressionRatio}).`));
    }
  } else {
    issues.push(issue("non-finite-value", "compressionRatio",
      `compressionRatio must be a finite number (got ${input.compressionRatio}).`));
  }

  // RF <= brokers (only when both are valid integers)
  if (
    Number.isFinite(input.replicationFactor) &&
    Number.isFinite(input.brokerCount) &&
    Number.isInteger(input.replicationFactor) &&
    Number.isInteger(input.brokerCount) &&
    input.replicationFactor > 0 &&
    input.brokerCount > 0
  ) {
    if (input.replicationFactor > input.brokerCount) {
      issues.push(issue("rf-exceeds-brokers", "replicationFactor",
        `replicationFactor (${input.replicationFactor}) cannot exceed brokerCount (${input.brokerCount}).`));
    }
  }

  // N-1 requires >= 2 brokers
  if (
    Number.isFinite(input.brokerCount) &&
    Number.isInteger(input.brokerCount) &&
    input.brokerCount > 0 &&
    input.brokerCount < 2
  ) {
    issues.push(issue("n1-requires-two-brokers", "brokerCount",
      `N-1 headroom analysis requires at least 2 brokers (got ${input.brokerCount}). With a single broker, any broker failure means total unavailability.`));
  }

  // Safety headroom target
  if (input.safetyHeadroomTarget !== undefined) {
    if (!Number.isFinite(input.safetyHeadroomTarget)) {
      issues.push(issue("non-finite-value", "safetyHeadroomTarget",
        `safetyHeadroomTarget must be a finite number (got ${input.safetyHeadroomTarget}).`));
    } else if (input.safetyHeadroomTarget <= 0 || input.safetyHeadroomTarget >= 1) {
      issues.push(issue("safety-headroom-range", "safetyHeadroomTarget",
        `safetyHeadroomTarget must be in (0, 1) where 0.7 means 70% utilization target (got ${input.safetyHeadroomTarget}).`));
    }
  }

  // Skew factor
  if (input.skewFactor !== undefined) {
    if (!Number.isFinite(input.skewFactor)) {
      issues.push(issue("non-finite-value", "skewFactor",
        `skewFactor must be a finite number (got ${input.skewFactor}).`));
    } else if (input.skewFactor < 1.0) {
      issues.push(issue("skew-factor-range", "skewFactor",
        `skewFactor must be >= 1.0 where 1.0 means perfectly balanced (got ${input.skewFactor}).`));
    }
  }

  // Retention overflow check
  if (
    Number.isFinite(input.peakIngressRate) && input.peakIngressRate > 0 &&
    Number.isFinite(input.avgRecordSizeBytes) && input.avgRecordSizeBytes > 0 &&
    Number.isFinite(input.retentionSeconds) && input.retentionSeconds > 0 &&
    Number.isFinite(input.replicationFactor) && input.replicationFactor > 0
  ) {
    const retainedEstimate =
      input.peakIngressRate * input.avgRecordSizeBytes * input.retentionSeconds * input.replicationFactor;
    if (!Number.isFinite(retainedEstimate) || retainedEstimate > MAX_SAFE_BYTES) {
      issues.push(issue("retention-overflow", "retentionSeconds",
        `Estimated retained bytes (${retainedEstimate.toExponential(2)}) exceeds safe integer precision (2^53). Reduce retention, ingress rate, record size, or replication factor.`));
    }
  }

  return issues;
}
