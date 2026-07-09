import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePropertiesDocument, serializeDocument } from "./properties-document";
import { applyPatches, type PatchOperation } from "./patch";

test("applyPatches: set existing key updates in place", () => {
  const doc = parsePropertiesDocument("# comment\nacks=1\nretries=3\n");
  const ops: PatchOperation[] = [
    { kind: "set", op: { key: "acks", value: "all" } },
  ];
  const result = applyPatches(doc, ops);
  assert.ok(result.ok);
  assert.equal(result.appliedCount, 1);
  const output = serializeDocument(result.document);
  assert.ok(output.includes("acks=all"));
  assert.ok(output.includes("# comment"));
  assert.ok(output.includes("retries=3"));
});

test("applyPatches: set new key appends at end", () => {
  const doc = parsePropertiesDocument("a=1\n");
  const ops: PatchOperation[] = [
    { kind: "set", op: { key: "b", value: "2" } },
  ];
  const result = applyPatches(doc, ops);
  assert.ok(result.ok);
  const output = serializeDocument(result.document);
  assert.ok(output.includes("a=1"));
  assert.ok(output.includes("b=2"));
});

test("applyPatches: appending to a file without a final newline keeps entries separated", () => {
  const doc = parsePropertiesDocument("a=1");
  const result = applyPatches(doc, [
    { kind: "set", op: { key: "b", value: "2" } },
  ]);

  assert.ok(result.ok);
  assert.equal(serializeDocument(result.document), "a=1\nb=2");
});

test("applyPatches: remove key removes from document", () => {
  const doc = parsePropertiesDocument("a=1\nb=2\nc=3\n");
  const ops: PatchOperation[] = [
    { kind: "remove", op: { key: "b" } },
  ];
  const result = applyPatches(doc, ops);
  assert.ok(result.ok);
  const output = serializeDocument(result.document);
  assert.ok(output.includes("a=1"));
  assert.ok(!output.includes("b=2"));
  assert.ok(output.includes("c=3"));
});

test("applyPatches: removing the final entry preserves a missing final newline", () => {
  const doc = parsePropertiesDocument("a=1\r\nb=2");
  const result = applyPatches(doc, [
    { kind: "remove", op: { key: "b" } },
  ]);

  assert.ok(result.ok);
  assert.equal(serializeDocument(result.document), "a=1");
});

test("applyPatches: replace key updates value", () => {
  const doc = parsePropertiesDocument("acks=1\n");
  const ops: PatchOperation[] = [
    { kind: "replace", op: { key: "acks", oldValue: "1", newValue: "all" } },
  ];
  const result = applyPatches(doc, ops);
  assert.ok(result.ok);
  const output = serializeDocument(result.document);
  assert.ok(output.includes("acks=all"));
});

test("applyPatches: replacing a continued final entry preserves no final newline", () => {
  const doc = parsePropertiesDocument("acks=\\\n  1");
  const result = applyPatches(doc, [
    { kind: "replace", op: { key: "acks", oldValue: "1", newValue: "all" } },
  ]);

  assert.ok(result.ok);
  assert.equal(serializeDocument(result.document), "acks=all");
});

test("applyPatches: duplicate key causes ambiguity conflict", () => {
  const doc = parsePropertiesDocument("a=1\na=2\n");
  const ops: PatchOperation[] = [
    { kind: "set", op: { key: "a", value: "3" } },
  ];
  const result = applyPatches(doc, ops);
  assert.ok(!result.ok);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].reason, "duplicate-key-ambiguity");
});

test("applyPatches: remove on duplicate key causes ambiguity conflict", () => {
  const doc = parsePropertiesDocument("x=1\nx=2\n");
  const ops: PatchOperation[] = [
    { kind: "remove", op: { key: "x" } },
  ];
  const result = applyPatches(doc, ops);
  assert.ok(!result.ok);
  assert.equal(result.conflicts[0].reason, "duplicate-key-ambiguity");
});

test("applyPatches: contradictory patches on same key conflict", () => {
  const doc = parsePropertiesDocument("a=1\n");
  const ops: PatchOperation[] = [
    { kind: "set", op: { key: "a", value: "2" } },
    { kind: "set", op: { key: "a", value: "3" } },
  ];
  const result = applyPatches(doc, ops);
  assert.ok(!result.ok);
  assert.ok(result.conflicts.some((c) => c.reason === "contradictory-patches"));
});

test("applyPatches: remove non-existent key gives key-not-found conflict", () => {
  const doc = parsePropertiesDocument("a=1\n");
  const ops: PatchOperation[] = [
    { kind: "remove", op: { key: "b" } },
  ];
  const result = applyPatches(doc, ops);
  assert.ok(!result.ok);
  assert.equal(result.conflicts[0].reason, "key-not-found");
});

test("applyPatches: replace with wrong old value gives value-mismatch conflict", () => {
  const doc = parsePropertiesDocument("a=1\n");
  const ops: PatchOperation[] = [
    { kind: "replace", op: { key: "a", oldValue: "2", newValue: "3" } },
  ];
  const result = applyPatches(doc, ops);
  assert.ok(!result.ok);
  assert.equal(result.conflicts[0].reason, "value-mismatch");
});

test("applyPatches: multiple non-conflicting operations succeed", () => {
  const doc = parsePropertiesDocument("# header\nacks=1\nretries=3\n");
  const ops: PatchOperation[] = [
    { kind: "replace", op: { key: "acks", oldValue: "1", newValue: "all" } },
    { kind: "set", op: { key: "linger.ms", value: "5" } },
  ];
  const result = applyPatches(doc, ops);
  assert.ok(result.ok);
  assert.equal(result.appliedCount, 2);
  const output = serializeDocument(result.document);
  assert.ok(output.includes("acks=all"));
  assert.ok(output.includes("linger.ms=5"));
  assert.ok(output.includes("# header"));
});

test("applyPatches: preserves separator style of existing entry", () => {
  const doc = parsePropertiesDocument("key:value\n");
  const ops: PatchOperation[] = [
    { kind: "replace", op: { key: "key", oldValue: "value", newValue: "newvalue" } },
  ];
  const result = applyPatches(doc, ops);
  assert.ok(result.ok);
  const output = serializeDocument(result.document);
  assert.ok(output.includes("key:newvalue"));
});

// ─── Table-driven conflict combination tests ────────────────────────────────

const conflictCases: Array<{
  name: string;
  input: string;
  ops: PatchOperation[];
  expectedReason: string;
}> = [
  {
    name: "set + remove same key is contradictory",
    input: "a=1\n",
    ops: [
      { kind: "set", op: { key: "a", value: "2" } },
      { kind: "remove", op: { key: "a" } },
    ],
    expectedReason: "contradictory-patches",
  },
  {
    name: "replace + remove same key is contradictory",
    input: "a=1\n",
    ops: [
      { kind: "replace", op: { key: "a", oldValue: "1", newValue: "2" } },
      { kind: "remove", op: { key: "a" } },
    ],
    expectedReason: "contradictory-patches",
  },
  {
    name: "incompatible replace old-values on same key",
    input: "a=1\n",
    ops: [
      { kind: "replace", op: { key: "a", oldValue: "1", newValue: "x" } },
      { kind: "replace", op: { key: "a", oldValue: "2", newValue: "x" } },
    ],
    expectedReason: "contradictory-patches",
  },
  {
    name: "replace + set with different targets on same key",
    input: "a=1\n",
    ops: [
      { kind: "replace", op: { key: "a", oldValue: "1", newValue: "2" } },
      { kind: "set", op: { key: "a", value: "3" } },
    ],
    expectedReason: "contradictory-patches",
  },
];

for (const tc of conflictCases) {
  test(`applyPatches conflict: ${tc.name}`, () => {
    const doc = parsePropertiesDocument(tc.input);
    const result = applyPatches(doc, tc.ops);
    assert.ok(!result.ok, `Expected conflict for: ${tc.name}`);
    assert.ok(
      result.conflicts.some((c) => c.reason === tc.expectedReason),
      `Expected reason ${tc.expectedReason}, got: ${result.conflicts.map((c) => c.reason).join(", ")}`,
    );
  });
}

// ─── Deduplication tests ────────────────────────────────────────────────────

test("applyPatches: identical duplicate set operations are deduplicated", () => {
  const doc = parsePropertiesDocument("a=1\n");
  const ops: PatchOperation[] = [
    { kind: "set", op: { key: "a", value: "2" } },
    { kind: "set", op: { key: "a", value: "2" } },
  ];
  const result = applyPatches(doc, ops);
  assert.ok(result.ok);
  assert.equal(result.appliedCount, 1);
  const output = serializeDocument(result.document);
  assert.ok(output.includes("a=2"));
});

test("applyPatches: identical duplicate remove operations are deduplicated", () => {
  const doc = parsePropertiesDocument("a=1\nb=2\n");
  const ops: PatchOperation[] = [
    { kind: "remove", op: { key: "a" } },
    { kind: "remove", op: { key: "a" } },
  ];
  const result = applyPatches(doc, ops);
  assert.ok(result.ok);
  assert.equal(result.appliedCount, 1);
  const output = serializeDocument(result.document);
  assert.ok(!output.includes("a=1"));
  assert.ok(output.includes("b=2"));
});

test("applyPatches: identical duplicate replace operations are deduplicated", () => {
  const doc = parsePropertiesDocument("a=1\n");
  const ops: PatchOperation[] = [
    { kind: "replace", op: { key: "a", oldValue: "1", newValue: "2" } },
    { kind: "replace", op: { key: "a", oldValue: "1", newValue: "2" } },
  ];
  const result = applyPatches(doc, ops);
  assert.ok(result.ok);
  assert.equal(result.appliedCount, 1);
});
