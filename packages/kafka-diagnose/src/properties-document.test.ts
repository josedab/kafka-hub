import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parsePropertiesDocument,
  serializeDocument,
  findEntriesByKey,
  getEffectiveValue,
  toRecord,
  findDuplicateKeys,
  getKeys,
  escapeKey,
  escapeValue,
} from "./properties-document";
import { redactSecrets } from "./redact";

// ─── Round-trip tests ───────────────────────────────────────────────────────

test("parsePropertiesDocument: round-trip LF preserves content", () => {
  const input = "# comment\nbroker.id=1\nacks=all\n";
  const doc = parsePropertiesDocument(input);
  const output = serializeDocument(doc);
  assert.equal(output, input);
  assert.equal(doc.newlineStyle, "lf");
});

test("parsePropertiesDocument: round-trip CRLF preserves newlines", () => {
  const input = "# header\r\nbroker.id=1\r\nacks=all\r\n";
  const doc = parsePropertiesDocument(input);
  const output = serializeDocument(doc);
  assert.equal(output, input);
  assert.equal(doc.newlineStyle, "crlf");
});

test("parsePropertiesDocument: round-trip mixed newlines preserves each terminator", () => {
  const input = "# comment\r\nbroker.id=1\nacks=all\n";
  const doc = parsePropertiesDocument(input);
  const output = serializeDocument(doc);
  assert.equal(output, input);
  assert.equal(doc.newlineStyle, "mixed");
});

test("parsePropertiesDocument: round-trip lone CR preserves terminators", () => {
  const input = "a=1\rb=2\r";
  const doc = parsePropertiesDocument(input);
  const output = serializeDocument(doc);
  assert.equal(output, input);
  assert.equal(doc.newlineStyle, "cr");
});

test("parsePropertiesDocument: round-trip mixed CRLF/LF/CR", () => {
  const input = "a=1\r\nb=2\nc=3\r";
  const doc = parsePropertiesDocument(input);
  const output = serializeDocument(doc);
  assert.equal(output, input);
  assert.equal(doc.newlineStyle, "mixed");
});

test("parsePropertiesDocument: preserves blank lines", () => {
  const input = "a=1\n\n\nb=2\n";
  const doc = parsePropertiesDocument(input);
  const output = serializeDocument(doc);
  assert.equal(output, input);
  // Blank lines are comment nodes
  assert.equal(doc.nodes.length, 4); // a=1, blank, blank, b=2
});

test("parsePropertiesDocument: preserves comments with # and !", () => {
  const input = "# hash comment\n! bang comment\nkey=value\n";
  const doc = parsePropertiesDocument(input);
  const output = serializeDocument(doc);
  assert.equal(output, input);
  assert.equal(doc.nodes[0].kind, "comment");
  assert.equal(doc.nodes[1].kind, "comment");
  assert.equal(doc.nodes[2].kind, "entry");
});

test("parsePropertiesDocument: preserves different separators", () => {
  const input = "key1=value1\nkey2:value2\nkey3 value3\n";
  const doc = parsePropertiesDocument(input);
  const output = serializeDocument(doc);
  assert.equal(output, input);

  const entries = doc.nodes.filter((n) => n.kind === "entry");
  assert.equal(entries.length, 3);
  if (entries[0].kind === "entry") assert.equal(entries[0].separator, "=");
  if (entries[1].kind === "entry") assert.equal(entries[1].separator, ":");
  if (entries[2].kind === "entry") assert.equal(entries[2].separator, " ");
});

test("parsePropertiesDocument: handles line continuations", () => {
  const input = "long.key=value1\\\n  value2\\\n  value3\nother=ok\n";
  const doc = parsePropertiesDocument(input);
  const output = serializeDocument(doc);
  assert.equal(output, input);

  const entry = findEntriesByKey(doc, "long.key")[0];
  assert.ok(entry);
  assert.equal(entry.hasContinuation, true);
  assert.equal(entry.lineSpan, 3);
  assert.equal(entry.value, "value1value2value3");
});

test("parser and redactor share continuation and key lexing", () => {
  const input = [
    "ssl.keystore.pass\\",
    "\tword : first\\",
    "  second",
    "broker.id=1",
  ].join("\r\n");

  const doc = parsePropertiesDocument(input);
  const entry = doc.nodes.find((node) => node.kind === "entry");
  assert.ok(entry && entry.kind === "entry");
  assert.equal(entry.key, "ssl.keystore.password");
  assert.equal(entry.value, "firstsecond");
  assert.equal(entry.separator, ":");
  assert.equal(entry.lineSpan, 3);
  assert.equal(serializeDocument(doc), input);

  const redaction = redactSecrets(input);
  assert.equal(redaction.entries.length, 1);
  assert.equal(redaction.entries[0].key, entry.key);
  assert.equal(redaction.entries[0].line, entry.line);
  assert.ok(!redaction.redacted.includes("first"));
  assert.ok(!redaction.redacted.includes("second"));
  assert.ok(redaction.redacted.includes("\r\nbroker.id=1"));
});

test("parser and redactor decode escaped keys identically across separators", () => {
  const inputs = [
    String.raw`api\u002ekey=value`,
    String.raw`api\.key : value`,
    String.raw`api\.key value`,
  ];

  for (const input of inputs) {
    const doc = parsePropertiesDocument(input);
    const entry = doc.nodes[0];
    assert.ok(entry && entry.kind === "entry");
    const redaction = redactSecrets(input);
    assert.equal(redaction.entries[0]?.key, entry.key);
    assert.equal(entry.key, "api.key");
    assert.ok(!redaction.redacted.includes("value"));
  }
});

test("parsePropertiesDocument: handles duplicate keys", () => {
  const input = "key=first\nkey=second\nkey=third\n";
  const doc = parsePropertiesDocument(input);
  const output = serializeDocument(doc);
  assert.equal(output, input);

  const entries = findEntriesByKey(doc, "key");
  assert.equal(entries.length, 3);
  assert.equal(entries[0].value, "first");
  assert.equal(entries[2].value, "third");

  // Last-wins semantics
  assert.equal(getEffectiveValue(doc, "key"), "third");
});

test("parsePropertiesDocument: finds duplicate key locations", () => {
  const input = "a=1\nb=2\na=3\n";
  const doc = parsePropertiesDocument(input);
  const dups = findDuplicateKeys(doc);
  assert.equal(dups.size, 1);
  assert.ok(dups.has("a"));
  assert.equal(dups.get("a")!.length, 2);
});

test("parsePropertiesDocument: toRecord gives flat last-wins map", () => {
  const input = "x=1\ny=2\nx=3\n";
  const doc = parsePropertiesDocument(input);
  const rec = toRecord(doc);
  assert.equal(rec["x"], "3");
  assert.equal(rec["y"], "2");
});

test("parsePropertiesDocument: getKeys returns unique keys in order", () => {
  const input = "c=1\na=2\nb=3\na=4\n";
  const doc = parsePropertiesDocument(input);
  const keys = getKeys(doc);
  assert.deepEqual(keys, ["c", "a", "b"]);
});

test("parsePropertiesDocument: empty input produces empty document, serializes to empty string", () => {
  const doc = parsePropertiesDocument("");
  assert.equal(doc.nodes.length, 0);
  assert.equal(doc.hasTrailingNewline, false);
  assert.equal(serializeDocument(doc), "");
});

test("parsePropertiesDocument: no trailing newline preserves absence", () => {
  const input = "a=1\nb=2";
  const doc = parsePropertiesDocument(input);
  assert.equal(doc.hasTrailingNewline, false);
  const output = serializeDocument(doc);
  assert.equal(output, input);
});

test("parsePropertiesDocument: trailing newline is preserved", () => {
  const input = "a=1\nb=2\n";
  const doc = parsePropertiesDocument(input);
  assert.equal(doc.hasTrailingNewline, true);
  const output = serializeDocument(doc);
  assert.equal(output, input);
});

test("parsePropertiesDocument: handles escaped characters", () => {
  const input = "path=/usr/local/kafka\\=data\nkey\\:special=value\n";
  const doc = parsePropertiesDocument(input);
  const entries = doc.nodes.filter((n) => n.kind === "entry");
  if (entries[0].kind === "entry") {
    assert.equal(entries[0].key, "path");
    assert.equal(entries[0].value, "/usr/local/kafka=data");
  }
  if (entries[1].kind === "entry") {
    assert.equal(entries[1].key, "key:special");
    assert.equal(entries[1].value, "value");
  }
});

test("parsePropertiesDocument: source location tracking", () => {
  const input = "# line 1\na=1\n# line 3\nb=2\n";
  const doc = parsePropertiesDocument(input);
  const entry1 = findEntriesByKey(doc, "a")[0];
  const entry2 = findEntriesByKey(doc, "b")[0];
  assert.equal(entry1.line, 2);
  assert.equal(entry2.line, 4);
});

// ─── Even/Odd backslash continuation tests ──────────────────────────────────

test("continuation: single trailing backslash (odd=1) is continuation", () => {
  const input = "key=value\\\n  continued\n";
  const doc = parsePropertiesDocument(input);
  const entry = findEntriesByKey(doc, "key")[0];
  assert.equal(entry.hasContinuation, true);
  assert.equal(entry.value, "valuecontinued");
});

test("continuation: double trailing backslash (even=2) is NOT continuation", () => {
  const input = "key=value\\\\\nnextkey=val\n";
  const doc = parsePropertiesDocument(input);
  const entry = findEntriesByKey(doc, "key")[0];
  assert.equal(entry.hasContinuation, false);
  // Value should have a literal backslash at end (double backslash = one literal)
  assert.equal(entry.value, "value\\");
  // nextkey is separate
  const next = findEntriesByKey(doc, "nextkey")[0];
  assert.ok(next);
  assert.equal(next.value, "val");
});

test("continuation: triple trailing backslash (odd=3) IS continuation", () => {
  const input = "key=value\\\\\\\n  rest\n";
  const doc = parsePropertiesDocument(input);
  const entry = findEntriesByKey(doc, "key")[0];
  assert.equal(entry.hasContinuation, true);
  // triple backslash at end -> 2 literal backslashes + continuation
  assert.equal(entry.value, "value\\rest");
});

test("continuation: quadruple trailing backslash (even=4) NOT continuation", () => {
  const input = "key=value\\\\\\\\\nb=2\n";
  const doc = parsePropertiesDocument(input);
  const entry = findEntriesByKey(doc, "key")[0];
  assert.equal(entry.hasContinuation, false);
  assert.equal(entry.value, "value\\\\");
});

// ─── Whitespace separator tests ─────────────────────────────────────────────

test("whitespace separator: tab between key and value", () => {
  const input = "key\tvalue\n";
  const doc = parsePropertiesDocument(input);
  const entry = findEntriesByKey(doc, "key")[0];
  assert.equal(entry.value, "value");
  assert.equal(entry.separator, " ");
});

test("whitespace separator: multiple spaces", () => {
  const input = "key   value with spaces\n";
  const doc = parsePropertiesDocument(input);
  const entry = findEntriesByKey(doc, "key")[0];
  assert.equal(entry.value, "value with spaces");
  assert.equal(entry.separator, " ");
});

test("whitespace around = separator", () => {
  const input = "key = value\n";
  const doc = parsePropertiesDocument(input);
  const entry = findEntriesByKey(doc, "key")[0];
  assert.equal(entry.value, "value");
  assert.equal(entry.separator, "=");
  // Round-trip preserves
  assert.equal(serializeDocument(doc), input);
});

// ─── Escape round-trip tests ────────────────────────────────────────────────

test("escapeKey: escapes spaces, =, :, and backslash", () => {
  assert.equal(escapeKey("my key"), "my\\ key");
  assert.equal(escapeKey("a=b"), "a\\=b");
  assert.equal(escapeKey("x:y"), "x\\:y");
  assert.equal(escapeKey("a\\b"), "a\\\\b");
});

test("escapeValue: escapes leading space and backslash", () => {
  assert.equal(escapeValue(" leading"), "\\ leading");
  assert.equal(escapeValue("no lead"), "no lead");
  assert.equal(escapeValue("a\\b"), "a\\\\b");
  assert.equal(escapeValue("tab\there"), "tab\\there");
});

test("escapeKey/escapeValue: control characters use \\u escapes", () => {
  const key = escapeKey("a\x01b");
  assert.ok(key.includes("\\u0001"));
  const val = escapeValue("\x02");
  assert.ok(val.includes("\\u0002"));
});
