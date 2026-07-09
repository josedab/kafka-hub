/**
 * Typed patch operations for the lossless properties document model.
 *
 * Supports set, remove, and replace operations. Explicit conflict/ambiguity
 * detection for duplicate-key targets and contradictory patch sets.
 */

import type {
  PropertiesDocument,
  DocumentNode,
  EntryNode,
  Separator,
  LineTerminator,
} from "./properties-document";
import { findEntriesByKey, findDuplicateKeys, escapeKey, escapeValue } from "./properties-document";

// ─── Patch Operation Types ──────────────────────────────────────────────────

export interface PatchSet {
  readonly key: string;
  readonly value: string;
  /** Separator to use if inserting a new entry. Default: "=" */
  readonly separator?: Separator;
}

export interface PatchRemove {
  readonly key: string;
}

export interface PatchReplace {
  readonly key: string;
  readonly oldValue: string;
  readonly newValue: string;
}

export type PatchOperation =
  | { readonly kind: "set"; readonly op: PatchSet }
  | { readonly kind: "remove"; readonly op: PatchRemove }
  | { readonly kind: "replace"; readonly op: PatchReplace };

// ─── Conflict Types ─────────────────────────────────────────────────────────

export type ConflictReason =
  | "duplicate-key-ambiguity"
  | "contradictory-patches"
  | "key-not-found"
  | "value-mismatch";

export interface PatchConflict {
  readonly operation: PatchOperation;
  readonly reason: ConflictReason;
  readonly detail: string;
}

// ─── Result Types ───────────────────────────────────────────────────────────

export interface PatchSuccess {
  readonly ok: true;
  readonly document: PropertiesDocument;
  readonly appliedCount: number;
}

export interface PatchFailure {
  readonly ok: false;
  readonly conflicts: readonly PatchConflict[];
}

export type PatchResult = PatchSuccess | PatchFailure;

// ─── Application Logic ──────────────────────────────────────────────────────

/**
 * Apply a set of patch operations to a properties document.
 * Returns either a new document or explicit conflicts.
 *
 * Invariants:
 * - Never silently resolves duplicate-key targets.
 * - Never applies contradictory patches (e.g. set+remove same key, incompatible replaces).
 * - Identical duplicate operations are deduplicated deterministically.
 * - Preserves ordering and formatting of untouched nodes.
 */
export function applyPatches(
  doc: PropertiesDocument,
  operations: readonly PatchOperation[],
): PatchResult {
  // First: deduplicate strictly identical operations
  const deduped = deduplicateOps(operations);

  const conflicts: PatchConflict[] = [];
  const duplicates = findDuplicateKeys(doc);

  // Group operations by key for contradiction detection
  const opsByKey = new Map<string, PatchOperation[]>();
  for (const op of deduped) {
    const key = op.op.key;
    const existing = opsByKey.get(key) ?? [];
    existing.push(op);
    opsByKey.set(key, existing);
  }

  for (const [key, ops] of opsByKey) {
    if (ops.length <= 1) continue;

    // Mixed set+remove or replace+remove on same key is contradictory
    const hasRemove = ops.some((o) => o.kind === "remove");
    const hasSetOrReplace = ops.some((o) => o.kind === "set" || o.kind === "replace");
    if (hasRemove && hasSetOrReplace) {
      for (const op of ops) {
        conflicts.push({
          operation: op,
          reason: "contradictory-patches",
          detail: `Key '${key}' is both set/replaced and removed in the same patch set.`,
        });
      }
      continue;
    }

    // Multiple sets/replaces on same key with different target values
    const setValues = ops
      .filter((o): o is { kind: "set"; op: PatchSet } => o.kind === "set")
      .map((o) => o.op.value);
    const replaceValues = ops
      .filter((o): o is { kind: "replace"; op: PatchReplace } => o.kind === "replace")
      .map((o) => o.op.newValue);
    const allTargets = [...setValues, ...replaceValues];
    const unique = new Set(allTargets);
    if (unique.size > 1) {
      for (const op of ops) {
        conflicts.push({
          operation: op,
          reason: "contradictory-patches",
          detail: `Multiple patches target key '${key}' with different values: ${[...unique].join(", ")}`,
        });
      }
      continue;
    }

    // Incompatible replace old-values on same key
    const replaces = ops.filter(
      (o): o is { kind: "replace"; op: PatchReplace } => o.kind === "replace",
    );
    if (replaces.length > 1) {
      const oldValues = new Set(replaces.map((r) => r.op.oldValue));
      if (oldValues.size > 1) {
        for (const op of replaces) {
          conflicts.push({
            operation: op,
            reason: "contradictory-patches",
            detail: `Multiple replaces for key '${key}' expect different old values: ${[...oldValues].join(", ")}`,
          });
        }
        continue;
      }
    }
  }

  // Check for duplicate-key ambiguity
  for (const op of deduped) {
    if (op.kind === "remove" || op.kind === "replace") {
      if (duplicates.has(op.op.key)) {
        const locs = duplicates.get(op.op.key)!;
        conflicts.push({
          operation: op,
          reason: "duplicate-key-ambiguity",
          detail: `Key '${op.op.key}' appears ${locs.length} times (lines ${locs.map((l) => l.line).join(", ")}). Cannot safely determine which occurrence to target.`,
        });
      }
    }
    if (op.kind === "set" && duplicates.has(op.op.key)) {
      const locs = duplicates.get(op.op.key)!;
      conflicts.push({
        operation: op,
        reason: "duplicate-key-ambiguity",
        detail: `Key '${op.op.key}' appears ${locs.length} times (lines ${locs.map((l) => l.line).join(", ")}). Cannot safely determine which occurrence to update.`,
      });
    }
  }

  // Check for key-not-found on remove/replace
  for (const op of deduped) {
    if (op.kind === "remove" || op.kind === "replace") {
      const entries = findEntriesByKey(doc, op.op.key);
      if (entries.length === 0) {
        conflicts.push({
          operation: op,
          reason: "key-not-found",
          detail: `Key '${op.op.key}' not found in document.`,
        });
      }
    }
    // Check value-mismatch for replace
    if (op.kind === "replace") {
      const entries = findEntriesByKey(doc, op.op.key);
      if (entries.length === 1 && entries[0].value !== op.op.oldValue) {
        conflicts.push({
          operation: op,
          reason: "value-mismatch",
          detail: `Key '${op.op.key}' has value '${entries[0].value}', expected '${op.op.oldValue}'.`,
        });
      }
    }
  }

  if (conflicts.length > 0) {
    return { ok: false, conflicts };
  }

  // Apply operations (already deduplicated)
  let nodes = [...doc.nodes] as DocumentNode[];
  let appliedCount = 0;

  // Track which keys have already been applied to avoid double-application
  const applied = new Set<string>();

  for (const op of deduped) {
    const key = op.op.key;
    if (applied.has(key)) continue; // deduped identical ops -> apply once

    switch (op.kind) {
      case "set": {
        const entries = findEntries(nodes, key);
        if (entries.length === 1) {
          // Update in-place
          nodes = replaceNode(
            nodes,
            entries[0],
            createEntry(
              key,
              op.op.value,
              entries[0].separator,
              entries[0].terminators.at(-1),
            ),
          );
        } else if (entries.length === 0) {
          // Append at end
          const term = doc.hasTrailingNewline ? getDocTerminator(doc) : undefined;
          nodes = [
            ...nodes,
            createEntry(key, op.op.value, op.op.separator ?? "=", term),
          ];
        }
        applied.add(key);
        appliedCount++;
        break;
      }
      case "remove": {
        const entries = findEntries(nodes, key);
        if (entries.length === 1) {
          nodes = nodes.filter((n) => n !== entries[0]);
          applied.add(key);
          appliedCount++;
        }
        break;
      }
      case "replace": {
        const entries = findEntries(nodes, key);
        if (entries.length === 1) {
          nodes = replaceNode(
            nodes,
            entries[0],
            createEntry(
              key,
              op.op.newValue,
              entries[0].separator,
              entries[0].terminators.at(-1),
            ),
          );
          applied.add(key);
          appliedCount++;
        }
        break;
      }
    }
  }

  return {
    ok: true,
    document: {
      nodes: normalizeTerminators(
        nodes,
        doc.hasTrailingNewline,
        getDocTerminator(doc),
      ),
      newlineStyle: doc.newlineStyle,
      hasTrailingNewline: doc.hasTrailingNewline,
    },
    appliedCount,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function findEntries(nodes: readonly DocumentNode[], key: string): EntryNode[] {
  return nodes.filter(
    (n): n is EntryNode => n.kind === "entry" && n.key === key,
  );
}

function replaceNode(
  nodes: DocumentNode[],
  target: DocumentNode,
  replacement: DocumentNode,
): DocumentNode[] {
  return nodes.map((n) => (n === target ? replacement : n));
}

function getDocTerminator(doc: PropertiesDocument): LineTerminator {
  switch (doc.newlineStyle) {
    case "crlf": return "\r\n";
    case "cr": return "\r";
    default: return "\n";
  }
}

function createEntry(
  key: string,
  value: string,
  separator: Separator,
  terminator?: LineTerminator,
): EntryNode {
  const escapedKey = escapeKey(key);
  const escapedValue = escapeValue(value);
  const sep = separator === " " ? " " : separator;
  const raw = `${escapedKey}${sep}${escapedValue}`;
  return {
    kind: "entry",
    line: 0, // synthetic
    lineSpan: 1,
    key,
    value,
    separator,
    rawLines: [raw],
    terminators: [terminator],
    hasContinuation: false,
  };
}

/**
 * Ensure adjacent physical lines stay separated and the final terminator
 * matches the source document's trailing-newline contract after inserts,
 * removals, or collapsed continuation entries.
 */
function normalizeTerminators(
  nodes: readonly DocumentNode[],
  hasTrailingNewline: boolean,
  fallback: LineTerminator,
): DocumentNode[] {
  const physicalLineCount = nodes.reduce(
    (count, node) =>
      count + (node.kind === "entry" ? node.rawLines.length : 1),
    0,
  );
  let physicalLineIndex = 0;

  return nodes.map((node) => {
    if (node.kind === "comment") {
      const isLast = physicalLineIndex === physicalLineCount - 1;
      physicalLineIndex++;
      const terminator = isLast
        ? hasTrailingNewline
          ? node.terminator ?? fallback
          : undefined
        : node.terminator ?? fallback;

      return terminator === node.terminator
        ? node
        : { ...node, terminator };
    }

    const terminators = node.rawLines.map((_, index) => {
      const isLast = physicalLineIndex === physicalLineCount - 1;
      physicalLineIndex++;
      const current = node.terminators[index];

      if (isLast) {
        return hasTrailingNewline ? current ?? fallback : undefined;
      }
      return current ?? fallback;
    });

    const unchanged =
      terminators.length === node.terminators.length &&
      terminators.every(
        (terminator, index) => terminator === node.terminators[index],
      );

    return unchanged ? node : { ...node, terminators };
  });
}

/**
 * Deduplicate strictly identical operations.
 * Two ops are identical if they have the same kind and identical op fields.
 */
function deduplicateOps(operations: readonly PatchOperation[]): PatchOperation[] {
  const seen = new Set<string>();
  const result: PatchOperation[] = [];
  for (const op of operations) {
    const key = canonicalizeOp(op);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(op);
    }
  }
  return result;
}

function canonicalizeOp(op: PatchOperation): string {
  switch (op.kind) {
    case "set":
      return `set:${op.op.key}:${op.op.value}:${op.op.separator ?? "="}`;
    case "remove":
      return `remove:${op.op.key}`;
    case "replace":
      return `replace:${op.op.key}:${op.op.oldValue}:${op.op.newValue}`;
  }
}

// ─── Structured Fix Type ────────────────────────────────────────────────────

/**
 * A structured fix attached to a diagnostic finding.
 * Contains the patch operations needed to resolve the finding.
 */
export interface StructuredFix {
  /** Human-readable label for the fix. */
  readonly label: string;
  /** The patch operations to apply. */
  readonly operations: readonly PatchOperation[];
  /** Whether this fix is safe to auto-apply (some requires human review). */
  readonly safe: boolean;
}
