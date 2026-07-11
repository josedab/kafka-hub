/**
 * Input validation for the consumer lag triage planner.
 *
 * Returns typed validation issues — never NaN, Infinity, or silent fallbacks.
 * All checks are deterministic and framework-free.
 *
 * The public entry point `validateUnknownInput` performs structural validation
 * (type guards) on arbitrary runtime values before delegating to
 * `validateLagInput` for semantic validation. This means `analyzeLag` can
 * safely accept `unknown` and never throw on malformed input.
 */

import type {
  LagTriageInput,
  OffsetSnapshot,
  PartitionSnapshot,
  ValidationIssue,
  ValidationIssueKind,
} from "./types";
import { GROUP_STABILITY_STATES } from "./types";

/** Default hot-partition multiplier when not specified. */
export const DEFAULT_HOT_MULTIPLIER = 2.0;
/** Default hot-partition minimum lag when not specified. */
export const DEFAULT_HOT_MIN_LAG = 1000;

// ─── Structural Type Guards ─────────────────────────────────────────────────

function issue(kind: ValidationIssueKind, message: string, snapshot?: "before" | "after", partitionId?: string): ValidationIssue {
  const base: ValidationIssue = { kind, message };
  if (snapshot !== undefined) return { ...base, snapshot };
  if (partitionId !== undefined) return { ...base, partitionId };
  return base;
}

function issueP(kind: ValidationIssueKind, message: string, snapshot: "before" | "after", partitionId?: string): ValidationIssue {
  return partitionId !== undefined
    ? { kind, message, snapshot, partitionId }
    : { kind, message, snapshot };
}

/**
 * Structurally validate an unknown value as a LagTriageInput.
 * Returns either a validated input or an array of structural issues.
 * Never throws.
 */
export function validateUnknownInput(
  input: unknown,
): { ok: true; input: LagTriageInput } | { ok: false; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];

  // Root must be a non-null, non-array object
  if (input === null || input === undefined || typeof input !== "object" || Array.isArray(input)) {
    issues.push(issue("invalid-root", `Expected a plain object as input, got ${input === null ? "null" : Array.isArray(input) ? "array" : typeof input}.`));
    return { ok: false, issues };
  }

  const obj = input as Record<string, unknown>;

  // intervalSeconds
  if (!("intervalSeconds" in obj) || typeof obj.intervalSeconds !== "number") {
    issues.push(issue("invalid-field-type", `"intervalSeconds" must be a number${!("intervalSeconds" in obj) ? " (missing)" : ` (got ${typeof obj.intervalSeconds})`}.`));
  }

  // snapshotBefore / snapshotAfter
  const beforeIssues = validateUnknownSnapshot(obj.snapshotBefore, "before");
  const afterIssues = validateUnknownSnapshot(obj.snapshotAfter, "after");
  issues.push(...beforeIssues, ...afterIssues);

  // assumptions (optional)
  if ("assumptions" in obj && obj.assumptions !== undefined && obj.assumptions !== null) {
    if (typeof obj.assumptions !== "object" || Array.isArray(obj.assumptions)) {
      issues.push(issue("invalid-field-type", `"assumptions" must be a plain object when provided (got ${Array.isArray(obj.assumptions) ? "array" : typeof obj.assumptions}).`));
    } else {
      const a = obj.assumptions as Record<string, unknown>;
      if (!("perConsumerThroughput" in a) || typeof a.perConsumerThroughput !== "number") {
        issues.push(issue("invalid-field-type", `"assumptions.perConsumerThroughput" must be a number${!("perConsumerThroughput" in a) ? " (missing)" : ` (got ${typeof a.perConsumerThroughput})`}.`));
      }
      if ("drainTargetSeconds" in a && a.drainTargetSeconds !== undefined) {
        if (typeof a.drainTargetSeconds !== "number") {
          issues.push(issue("invalid-field-type", `"assumptions.drainTargetSeconds" must be a number when provided (got ${typeof a.drainTargetSeconds}).`));
        }
      }
    }
  }

  // hotPartitionMultiplier (optional)
  if ("hotPartitionMultiplier" in obj && obj.hotPartitionMultiplier !== undefined) {
    if (typeof obj.hotPartitionMultiplier !== "number") {
      issues.push(issue("invalid-field-type", `"hotPartitionMultiplier" must be a number when provided (got ${typeof obj.hotPartitionMultiplier}).`));
    }
  }

  // hotPartitionMinLag (optional)
  if ("hotPartitionMinLag" in obj && obj.hotPartitionMinLag !== undefined) {
    if (typeof obj.hotPartitionMinLag !== "number") {
      issues.push(issue("invalid-field-type", `"hotPartitionMinLag" must be a number when provided (got ${typeof obj.hotPartitionMinLag}).`));
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  // At this point the structural shape is valid — cast safely
  return { ok: true, input: input as LagTriageInput };
}

function validateUnknownSnapshot(snap: unknown, which: "before" | "after"): ValidationIssue[] {
  const label = which === "before" ? "snapshotBefore" : "snapshotAfter";
  const issues: ValidationIssue[] = [];

  if (snap === null || snap === undefined || typeof snap !== "object" || Array.isArray(snap)) {
    issues.push(issueP("invalid-snapshot", `"${label}" must be a plain object (got ${snap === null ? "null" : Array.isArray(snap) ? "array" : typeof snap}).`, which));
    return issues;
  }

  const obj = snap as Record<string, unknown>;

  // partitions must be an array
  if (!("partitions" in obj) || !Array.isArray(obj.partitions)) {
    issues.push(issueP("invalid-partitions", `"${label}.partitions" must be an array${!("partitions" in obj) ? " (missing)" : ` (got ${typeof obj.partitions})`}.`, which));
    return issues;
  }

  // groupState (optional) — must be a valid string
  if ("groupState" in obj && obj.groupState !== undefined) {
    if (typeof obj.groupState !== "string" || !GROUP_STABILITY_STATES.includes(obj.groupState)) {
      issues.push(issueP("invalid-group-state",
        `"${label}.groupState" must be one of ${GROUP_STABILITY_STATES.join(", ")} (got ${JSON.stringify(obj.groupState)}).`, which));
    }
  }

  // Validate each partition entry
  for (let i = 0; i < obj.partitions.length; i++) {
    const entry = obj.partitions[i];
    if (entry === null || entry === undefined || typeof entry !== "object" || Array.isArray(entry)) {
      issues.push(issueP("invalid-partition-object",
        `${label}.partitions[${i}] must be a plain object (got ${entry === null ? "null" : Array.isArray(entry) ? "array" : typeof entry}).`, which));
      continue;
    }

    const p = entry as Record<string, unknown>;

    // partitionId
    if (!("partitionId" in p) || typeof p.partitionId !== "string" || p.partitionId.length === 0) {
      issues.push(issueP("invalid-partition-id",
        `${label}.partitions[${i}].partitionId must be a non-empty string (got ${JSON.stringify(p.partitionId)}).`, which));
    }

    // Numeric offset fields
    for (const field of ["committedOffset", "currentOffset", "logEndOffset"] as const) {
      if (!(field in p) || typeof p[field] !== "number") {
        issues.push(issueP("invalid-field-type",
          `${label}.partitions[${i}].${field} must be a number${!(field in p) ? " (missing)" : ` (got ${typeof p[field]})`}.`, which,
          typeof p.partitionId === "string" ? p.partitionId : undefined));
      }
    }
  }

  return issues;
}

// ─── Semantic Offset Validation ─────────────────────────────────────────────

/**
 * Validate a single offset value (committed, current, or logEnd).
 * Must be a finite non-negative integer.
 */
function validateOffset(
  value: number,
  fieldName: string,
  partitionId: string,
  snapshot: "before" | "after",
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!Number.isFinite(value)) {
    issues.push({
      kind: "non-finite-offset",
      message: `${fieldName} for partition "${partitionId}" in ${snapshot} snapshot is not finite (got ${value}).`,
      snapshot,
      partitionId,
    });
    return issues; // other checks meaningless for non-finite
  }

  if (value < 0) {
    issues.push({
      kind: "negative-offset",
      message: `${fieldName} for partition "${partitionId}" in ${snapshot} snapshot is negative (got ${value}).`,
      snapshot,
      partitionId,
    });
  }

  if (!Number.isInteger(value)) {
    issues.push({
      kind: "non-integer-offset",
      message: `${fieldName} for partition "${partitionId}" in ${snapshot} snapshot is not an integer (got ${value}).`,
      snapshot,
      partitionId,
    });
  }

  return issues;
}

/**
 * Validate a single partition snapshot.
 */
function validatePartition(
  p: PartitionSnapshot,
  snapshot: "before" | "after",
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  issues.push(...validateOffset(p.committedOffset, "committedOffset", p.partitionId, snapshot));
  issues.push(...validateOffset(p.currentOffset, "currentOffset", p.partitionId, snapshot));
  issues.push(...validateOffset(p.logEndOffset, "logEndOffset", p.partitionId, snapshot));

  // logEndOffset must be >= committedOffset (only check if both are valid)
  if (
    Number.isFinite(p.logEndOffset) &&
    Number.isFinite(p.committedOffset) &&
    p.logEndOffset >= 0 &&
    p.committedOffset >= 0 &&
    p.logEndOffset < p.committedOffset
  ) {
    issues.push({
      kind: "log-end-below-committed",
      message: `logEndOffset (${p.logEndOffset}) < committedOffset (${p.committedOffset}) for partition "${p.partitionId}" in ${snapshot} snapshot. Log-end should never be below the committed offset.`,
      snapshot,
      partitionId: p.partitionId,
    });
  }

  // logEndOffset must be >= currentOffset (only check if both are valid)
  if (
    Number.isFinite(p.logEndOffset) &&
    Number.isFinite(p.currentOffset) &&
    p.logEndOffset >= 0 &&
    p.currentOffset >= 0 &&
    p.logEndOffset < p.currentOffset
  ) {
    issues.push({
      kind: "log-end-below-current",
      message: `logEndOffset (${p.logEndOffset}) < currentOffset (${p.currentOffset}) for partition "${p.partitionId}" in ${snapshot} snapshot. Log-end should never be below the current offset.`,
      snapshot,
      partitionId: p.partitionId,
    });
  }

  return issues;
}

/**
 * Check for duplicate partition IDs within a snapshot.
 */
function checkDuplicates(
  snap: OffsetSnapshot,
  snapshot: "before" | "after",
): ValidationIssue[] {
  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];

  for (const p of snap.partitions) {
    if (seen.has(p.partitionId)) {
      issues.push({
        kind: "duplicate-partition",
        message: `Duplicate partition "${p.partitionId}" in ${snapshot} snapshot.`,
        snapshot,
        partitionId: p.partitionId,
      });
    }
    seen.add(p.partitionId);
  }

  return issues;
}

/**
 * Check for partitions present in one snapshot but missing in the other.
 */
function checkMissingPartitions(
  before: OffsetSnapshot,
  after: OffsetSnapshot,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const beforeIds = new Set(before.partitions.map((p) => p.partitionId));
  const afterIds = new Set(after.partitions.map((p) => p.partitionId));

  for (const id of beforeIds) {
    if (!afterIds.has(id)) {
      issues.push({
        kind: "missing-partition",
        message: `Partition "${id}" is in the before snapshot but missing from the after snapshot.`,
        snapshot: "after",
        partitionId: id,
      });
    }
  }

  for (const id of afterIds) {
    if (!beforeIds.has(id)) {
      issues.push({
        kind: "missing-partition",
        message: `Partition "${id}" is in the after snapshot but missing from the before snapshot.`,
        snapshot: "before",
        partitionId: id,
      });
    }
  }

  return issues;
}

/**
 * Check for cross-snapshot log-end regressions (partition truncation/epoch movement).
 * If logEndAfter < logEndBefore for any partition, ingress rate/ETA calculations
 * across these snapshots are not meaningful.
 */
function checkLogEndRegressions(
  before: OffsetSnapshot,
  after: OffsetSnapshot,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const beforeMap = new Map(before.partitions.map((p) => [p.partitionId, p]));

  for (const afterP of after.partitions) {
    const beforeP = beforeMap.get(afterP.partitionId);
    if (!beforeP) continue;
    if (
      Number.isFinite(afterP.logEndOffset) &&
      Number.isFinite(beforeP.logEndOffset) &&
      afterP.logEndOffset < beforeP.logEndOffset
    ) {
      issues.push({
        kind: "log-end-regression",
        message: `logEndOffset for partition "${afterP.partitionId}" decreased from ${beforeP.logEndOffset} to ${afterP.logEndOffset} between snapshots. This indicates topic truncation or epoch movement — ingress/ETA calculations across these snapshots are not comparable.`,
        snapshot: "after",
        partitionId: afterP.partitionId,
      });
    }
  }

  return issues;
}

/**
 * Validate the complete lag triage input (semantic validation).
 * Assumes structural validation has already passed.
 * Returns an array of validation issues (empty = valid).
 */
export function validateLagInput(input: LagTriageInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Interval validation
  if (!Number.isFinite(input.intervalSeconds) || input.intervalSeconds <= 0) {
    issues.push({
      kind: "interval-invalid",
      message: `intervalSeconds must be a finite positive number (got ${input.intervalSeconds}).`,
    });
  }

  // Throughput assumptions validation
  if (input.assumptions) {
    if (
      !Number.isFinite(input.assumptions.perConsumerThroughput) ||
      input.assumptions.perConsumerThroughput <= 0
    ) {
      issues.push({
        kind: "throughput-invalid",
        message: `perConsumerThroughput must be a finite positive number (got ${input.assumptions.perConsumerThroughput}).`,
      });
    }

    if (input.assumptions.drainTargetSeconds !== undefined) {
      if (
        !Number.isFinite(input.assumptions.drainTargetSeconds) ||
        input.assumptions.drainTargetSeconds <= 0
      ) {
        issues.push({
          kind: "drain-target-invalid",
          message: `drainTargetSeconds must be a finite positive number (got ${input.assumptions.drainTargetSeconds}).`,
        });
      }
    }
  }

  // Hot partition config validation
  if (input.hotPartitionMultiplier !== undefined) {
    if (
      !Number.isFinite(input.hotPartitionMultiplier) ||
      input.hotPartitionMultiplier < 1.0
    ) {
      issues.push({
        kind: "hot-multiplier-invalid",
        message: `hotPartitionMultiplier must be a finite number >= 1.0 (got ${input.hotPartitionMultiplier}).`,
      });
    }
  }

  if (input.hotPartitionMinLag !== undefined) {
    if (
      !Number.isFinite(input.hotPartitionMinLag) ||
      input.hotPartitionMinLag < 0
    ) {
      issues.push({
        kind: "hot-min-lag-invalid",
        message: `hotPartitionMinLag must be a finite non-negative number (got ${input.hotPartitionMinLag}).`,
      });
    }
  }

  // Insufficient samples check
  if (
    input.snapshotBefore.partitions.length === 0 &&
    input.snapshotAfter.partitions.length === 0
  ) {
    issues.push({
      kind: "insufficient-samples",
      message: "Both snapshots contain zero partitions. At least one partition is required.",
    });
  }

  // Per-partition validation
  for (const p of input.snapshotBefore.partitions) {
    issues.push(...validatePartition(p, "before"));
  }
  for (const p of input.snapshotAfter.partitions) {
    issues.push(...validatePartition(p, "after"));
  }

  // Duplicate checks
  issues.push(...checkDuplicates(input.snapshotBefore, "before"));
  issues.push(...checkDuplicates(input.snapshotAfter, "after"));

  // Missing partition checks
  issues.push(...checkMissingPartitions(input.snapshotBefore, input.snapshotAfter));

  // Log-end regression checks
  issues.push(...checkLogEndRegressions(input.snapshotBefore, input.snapshotAfter));

  return issues;
}
