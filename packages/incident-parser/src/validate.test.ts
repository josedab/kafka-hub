import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  validateInput,
  detectFormat,
  countLines,
  INPUT_LIMITS,
} from "./validate";

// ─── Empty Input ────────────────────────────────────────────────────────────

describe("validateInput: empty input", () => {
  const cases = [
    { name: "empty string", input: "" },
    { name: "whitespace only", input: "   \n\t  \n  " },
    { name: "single space", input: " " },
  ];

  for (const { name, input } of cases) {
    test(name, () => {
      const err = validateInput(input);
      assert.ok(err, "expected validation error");
      assert.equal(err.kind, "empty");
    });
  }
});

// ─── Binary / Archive Rejection ─────────────────────────────────────────────

describe("validateInput: binary/archive rejection", () => {
  const cases = [
    { name: "ZIP magic bytes", input: "PK\x03\x04rest of zip content" },
    { name: "GZIP magic bytes", input: "\x1F\x8Brest of gzip content" },
    { name: "PDF magic bytes", input: "%PDF-1.4 some content" },
    { name: "PNG magic bytes", input: "\x89PNG\x0D\x0A\x1A\x0Apng data" },
    { name: "JPEG magic bytes", input: "\xFF\xD8\xFFjpeg data" },
    { name: "ELF magic bytes", input: "\x7FELF binary data" },
  ];

  for (const { name, input } of cases) {
    test(name, () => {
      const err = validateInput(input);
      assert.ok(err, `expected rejection for ${name}`);
      assert.equal(err.kind, "unsupported-binary");
    });
  }

  test("high control char ratio", () => {
    // > 10% control chars in first 1KB
    const controlChars = String.fromCharCode(1).repeat(150);
    const normalChars = "a".repeat(850);
    const input = controlChars + normalChars;
    const err = validateInput(input);
    assert.ok(err, "expected binary rejection");
    assert.equal(err.kind, "unsupported-binary");
  });
});

// ─── Byte Limit ─────────────────────────────────────────────────────────────

describe("validateInput: byte limits", () => {
  test("exactly at limit passes", () => {
    const input = "a".repeat(INPUT_LIMITS.maxBytes);
    const err = validateInput(input);
    assert.equal(err, null, "should pass at exact limit");
  });

  test("one byte over limit fails", () => {
    const input = "a".repeat(INPUT_LIMITS.maxBytes + 1);
    const err = validateInput(input);
    assert.ok(err, "expected too-large error");
    assert.equal(err.kind, "too-large");
    assert.equal(err.limit, INPUT_LIMITS.maxBytes);
    assert.ok(err.actual! > INPUT_LIMITS.maxBytes);
  });
});

// ─── Line Limit ─────────────────────────────────────────────────────────────

describe("validateInput: line limits", () => {
  test("exactly at limit passes", () => {
    const input = Array.from({ length: INPUT_LIMITS.maxLines }, (_, i) => `line ${i}`).join("\n");
    const err = validateInput(input);
    assert.equal(err, null, "should pass at exact limit");
  });

  test("one line over limit fails", () => {
    const input = Array.from({ length: INPUT_LIMITS.maxLines + 1 }, (_, i) => `line ${i}`).join("\n");
    const err = validateInput(input);
    assert.ok(err, "expected too-many-lines error");
    assert.equal(err.kind, "too-many-lines");
    assert.equal(err.limit, INPUT_LIMITS.maxLines);
    assert.equal(err.actual, INPUT_LIMITS.maxLines + 1);
  });
});

// ─── JSON Validation ────────────────────────────────────────────────────────

describe("validateInput: JSON validation", () => {
  test("valid JSON object passes", () => {
    const err = validateInput('{"key": "value"}');
    assert.equal(err, null);
  });

  test("valid JSON array passes", () => {
    const err = validateInput('[1, 2, 3]');
    assert.equal(err, null);
  });

  test("malformed JSON fails", () => {
    const err = validateInput('{"key": value}');
    assert.ok(err, "expected malformed-json error");
    assert.equal(err.kind, "malformed-json");
  });

  test("plain text starting with non-JSON passes", () => {
    const err = validateInput("broker.id=1\nlisteners=PLAINTEXT://:9092");
    assert.equal(err, null);
  });
});

// ─── Format Detection ───────────────────────────────────────────────────────

describe("detectFormat", () => {
  test("JSON object", () => assert.equal(detectFormat('{"a":1}'), "json"));
  test("JSON array", () => assert.equal(detectFormat("[1,2]"), "json"));
  test("plain text", () => assert.equal(detectFormat("broker.id=1"), "text"));
  test("whitespace + JSON", () => assert.equal(detectFormat("  {\"a\":1}"), "json"));
});

// ─── countLines ─────────────────────────────────────────────────────────────

describe("countLines", () => {
  test("empty string", () => assert.equal(countLines(""), 0));
  test("single line", () => assert.equal(countLines("hello"), 1));
  test("two lines", () => assert.equal(countLines("a\nb"), 2));
  test("trailing newline", () => assert.equal(countLines("a\n"), 2));
  test("three lines", () => assert.equal(countLines("a\nb\nc"), 3));
  test("CRLF counts as one line break", () =>
    assert.equal(countLines("a\r\nb\r\nc"), 3));
  test("lone CR line endings are counted", () =>
    assert.equal(countLines("a\rb\rc"), 3));
});

// ─── Documented Limits ─────────────────────────────────────────────────────

test("INPUT_LIMITS are documented values", () => {
  assert.equal(INPUT_LIMITS.maxBytes, 512 * 1024, "512 KB limit");
  assert.equal(INPUT_LIMITS.maxLines, 10_000, "10k line limit");
});

// ─── Valid Input Passes ─────────────────────────────────────────────────────

test("normal Kafka log passes validation", () => {
  const input = `[2024-01-15 10:30:00,123] ERROR [ReplicaManager broker=1] ISR shrink for partition test-topic-0 (kafka.server.ReplicaManager)
[2024-01-15 10:30:00,456] WARN NotEnoughReplicasException for partition test-topic-0`;
  const err = validateInput(input);
  assert.equal(err, null);
});
