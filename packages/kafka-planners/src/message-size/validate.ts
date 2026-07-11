/**
 * Input validation for the message-size chain checker.
 *
 * Returns typed validation issues — never NaN, Infinity, or silent fallbacks.
 * All checks are deterministic and framework-free.
 *
 * `validateUnknownMessageSizeInput` performs structural validation on
 * arbitrary runtime values before delegating to `validateMessageSizeInput`
 * for semantic validation. This means `analyzeMessageSize` can safely
 * accept `unknown` and never throw on malformed input.
 */

import type {
  MessageSizeInput,
  MessageSizeValidationIssue,
  MessageSizeValidationIssueKind,
} from "./types";

// ─── Defaults ───────────────────────────────────────────────────────────────

/** Default safety headroom fraction: 10%. */
export const DEFAULT_SAFETY_HEADROOM_FRACTION = 0.10;

/** Default blob storage threshold: 1 MiB (1_048_576 bytes). */
export const DEFAULT_BLOB_STORAGE_THRESHOLD_BYTES = 1_048_576;

// ─── Helpers ────────────────────────────────────────────────────────────────

function issue(
  kind: MessageSizeValidationIssueKind,
  field: string,
  message: string,
): MessageSizeValidationIssue {
  return { kind, field, message };
}

// ─── Structural Validation ──────────────────────────────────────────────────

/**
 * Structurally validate an unknown value as a MessageSizeInput.
 * Returns either a validated input or an array of structural issues.
 * Never throws.
 */
export function validateUnknownMessageSizeInput(
  input: unknown,
): { ok: true; input: MessageSizeInput } | { ok: false; issues: MessageSizeValidationIssue[] } {
  const issues: MessageSizeValidationIssue[] = [];

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
    "recordSizeBytes",
    "batchSizeBytes",
    "producerMaxRequestSize",
    "brokerMessageMaxBytes",
    "replicaFetchMaxBytes",
    "consumerMaxPartitionFetchBytes",
    "consumerFetchMaxBytes",
    "safetyHeadroomFraction",
    "blobStorageThresholdBytes",
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

  // Optional topicOverride — must be an object with a numeric maxMessageBytes if present
  if ("topicOverride" in obj && obj.topicOverride !== undefined && obj.topicOverride !== null) {
    if (typeof obj.topicOverride !== "object" || Array.isArray(obj.topicOverride)) {
      issues.push(issue(
        "invalid-topic-override",
        "topicOverride",
        `"topicOverride" must be an object when provided (got ${Array.isArray(obj.topicOverride) ? "array" : typeof obj.topicOverride}).`,
      ));
    } else {
      const override = obj.topicOverride as Record<string, unknown>;
      if (!("maxMessageBytes" in override) || typeof override.maxMessageBytes !== "number") {
        issues.push(issue(
          "invalid-topic-override",
          "topicOverride.maxMessageBytes",
          `"topicOverride.maxMessageBytes" must be a number${!("maxMessageBytes" in override) ? " (missing)" : ` (got ${typeof override.maxMessageBytes})`}.`,
        ));
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  return { ok: true, input: input as MessageSizeInput };
}

// ─── Semantic Validation ────────────────────────────────────────────────────

/**
 * Validate the complete message-size input (semantic validation).
 * Assumes structural validation has already passed.
 * Returns an array of validation issues (empty = valid).
 */
export function validateMessageSizeInput(input: MessageSizeInput): MessageSizeValidationIssue[] {
  const issues: MessageSizeValidationIssue[] = [];

  // Finite + positive + integer checks for record/batch byte fields
  const integerPositiveMessageFields: Array<[keyof MessageSizeInput, string]> = [
    ["recordSizeBytes", "recordSizeBytes"],
    ["batchSizeBytes", "batchSizeBytes"],
  ];

  for (const [key, field] of integerPositiveMessageFields) {
    const val = input[key] as number;
    if (!Number.isFinite(val)) {
      issues.push(issue("non-finite-value", field, `${field} must be a finite number (got ${val}).`));
    } else if (val <= 0) {
      issues.push(issue("non-positive-value", field, `${field} must be positive (got ${val}).`));
    } else if (!Number.isInteger(val)) {
      issues.push(issue("non-integer-value", field, `${field} must be an integer (got ${val}).`));
    }
  }

  // Finite + positive + integer checks for config byte fields
  const integerPositiveFields: Array<[keyof MessageSizeInput, string]> = [
    ["producerMaxRequestSize", "producerMaxRequestSize"],
    ["brokerMessageMaxBytes", "brokerMessageMaxBytes"],
    ["replicaFetchMaxBytes", "replicaFetchMaxBytes"],
    ["consumerMaxPartitionFetchBytes", "consumerMaxPartitionFetchBytes"],
    ["consumerFetchMaxBytes", "consumerFetchMaxBytes"],
    ["blobStorageThresholdBytes", "blobStorageThresholdBytes"],
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

  // Batch must be >= record
  if (
    Number.isFinite(input.recordSizeBytes) && input.recordSizeBytes > 0 &&
    Number.isFinite(input.batchSizeBytes) && input.batchSizeBytes > 0 &&
    input.batchSizeBytes < input.recordSizeBytes
  ) {
    issues.push(issue(
      "batch-smaller-than-record",
      "batchSizeBytes",
      `batchSizeBytes (${input.batchSizeBytes}) must be >= recordSizeBytes (${input.recordSizeBytes}). A record batch always contains at least one record plus batch-level overhead.`,
    ));
  }

  // Safety headroom fraction: [0, 1) — 0 is valid (no headroom), must be < 1
  if (!Number.isFinite(input.safetyHeadroomFraction)) {
    issues.push(issue("non-finite-value", "safetyHeadroomFraction",
      `safetyHeadroomFraction must be a finite number (got ${input.safetyHeadroomFraction}).`));
  } else if (input.safetyHeadroomFraction < 0 || input.safetyHeadroomFraction >= 1) {
    issues.push(issue("invalid-headroom", "safetyHeadroomFraction",
      `safetyHeadroomFraction must be in [0, 1) where 0.10 means 10% safety margin. 0 is valid (no headroom). Must be < 1 (got ${input.safetyHeadroomFraction}).`));
  }

  // Blob threshold: finite positive integer
  if (
    Number.isFinite(input.blobStorageThresholdBytes) &&
    input.blobStorageThresholdBytes > 0 &&
    Number.isInteger(input.blobStorageThresholdBytes)
  ) {
    // Valid — additional range check not needed, user chooses their threshold
  } else if (Number.isFinite(input.blobStorageThresholdBytes) && input.blobStorageThresholdBytes <= 0) {
    issues.push(issue("invalid-blob-threshold", "blobStorageThresholdBytes",
      `blobStorageThresholdBytes must be positive (got ${input.blobStorageThresholdBytes}).`));
  }

  // Topic override semantic validation
  if (input.topicOverride !== undefined && input.topicOverride !== null) {
    const topicVal = input.topicOverride.maxMessageBytes;
    if (!Number.isFinite(topicVal)) {
      issues.push(issue("non-finite-value", "topicOverride.maxMessageBytes",
        `topicOverride.maxMessageBytes must be a finite number (got ${topicVal}).`));
    } else if (topicVal <= 0) {
      issues.push(issue("non-positive-value", "topicOverride.maxMessageBytes",
        `topicOverride.maxMessageBytes must be positive (got ${topicVal}).`));
    } else if (!Number.isInteger(topicVal)) {
      issues.push(issue("non-integer-value", "topicOverride.maxMessageBytes",
        `topicOverride.maxMessageBytes must be an integer (got ${topicVal}).`));
    }
  }

  // Unsafe number overflow check
  const allByteValues = [
    input.recordSizeBytes,
    input.batchSizeBytes,
    input.producerMaxRequestSize,
    input.brokerMessageMaxBytes,
    input.replicaFetchMaxBytes,
    input.consumerMaxPartitionFetchBytes,
    input.consumerFetchMaxBytes,
    input.blobStorageThresholdBytes,
  ];
  if (input.topicOverride) {
    allByteValues.push(input.topicOverride.maxMessageBytes);
  }

  for (const val of allByteValues) {
    if (Number.isFinite(val) && val > Number.MAX_SAFE_INTEGER) {
      issues.push(issue("unsafe-number-overflow", "overflow",
        `Value ${val} exceeds Number.MAX_SAFE_INTEGER (2^53 - 1). Precision loss makes the calculation unreliable.`));
      break; // One overflow issue is sufficient
    }
  }

  return issues;
}
