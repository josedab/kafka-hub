/**
 * Input validation for incident evidence.
 *
 * Accepts bounded plain text or JSON. Rejects ZIP/archive/binary-looking
 * input. Enforces documented byte and line limits.
 */

import type { InputFormat, InputLimits, ValidationError } from "./types";

// ─── Documented Limits ──────────────────────────────────────────────────────

/** Hard limits enforced on all input. */
export const INPUT_LIMITS: InputLimits = {
  maxBytes: 512 * 1024,  // 512 KB
  maxLines: 10_000,
};

// ─── Binary / Archive Detection ─────────────────────────────────────────────

/** Magic bytes for common archive/binary formats. */
const BINARY_SIGNATURES: ReadonlyArray<{ name: string; bytes: readonly number[] }> = [
  { name: "ZIP/JAR/WAR",  bytes: [0x50, 0x4B, 0x03, 0x04] },
  { name: "GZIP",         bytes: [0x1F, 0x8B] },
  { name: "TAR",          bytes: [0x75, 0x73, 0x74, 0x61, 0x72] },
  { name: "7z",           bytes: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C] },
  { name: "RAR",          bytes: [0x52, 0x61, 0x72, 0x21] },
  { name: "BZ2",          bytes: [0x42, 0x5A, 0x68] },
  { name: "XZ",           bytes: [0xFD, 0x37, 0x7A, 0x58, 0x5A, 0x00] },
  { name: "PDF",          bytes: [0x25, 0x50, 0x44, 0x46] },
  { name: "ELF",          bytes: [0x7F, 0x45, 0x4C, 0x46] },
  { name: "Mach-O",       bytes: [0xCF, 0xFA, 0xED, 0xFE] },
  { name: "PNG",          bytes: [0x89, 0x50, 0x4E, 0x47] },
  { name: "JPEG",         bytes: [0xFF, 0xD8, 0xFF] },
];

function hasBinarySignature(input: string): string | null {
  const checkLen = Math.min(input.length, 512);
  for (const sig of BINARY_SIGNATURES) {
    if (sig.name === "TAR") {
      if (input.length > 262) {
        const match = sig.bytes.every(
          (b, i) => input.charCodeAt(257 + i) === b,
        );
        if (match) return sig.name;
      }
      continue;
    }
    if (checkLen < sig.bytes.length) continue;
    const match = sig.bytes.every((b, i) => input.charCodeAt(i) === b);
    if (match) return sig.name;
  }
  return null;
}

function looksLikeBinary(input: string): boolean {
  const sampleLen = Math.min(input.length, 1024);
  if (sampleLen === 0) return false;
  let controlCount = 0;
  for (let i = 0; i < sampleLen; i++) {
    const c = input.charCodeAt(i);
    if (c < 0x20 && c !== 0x09 && c !== 0x0A && c !== 0x0D) {
      controlCount++;
    }
  }
  return controlCount / sampleLen > 0.1;
}

// ─── Format Detection ───────────────────────────────────────────────────────

/**
 * Detect whether input is JSON or plain text.
 *
 * JSON is detected only when the input actually parses as valid JSON.
 * This prevents false positives on log lines like "[2024-01-15 ...]".
 */
export function detectFormat(input: string): InputFormat {
  const trimmed = input.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      JSON.parse(input);
      return "json";
    } catch {
      return "text";
    }
  }
  return "text";
}

// ─── JSON Intent Heuristic ──────────────────────────────────────────────────

/**
 * Does the input strongly look like the user *intended* JSON?
 * Used for malformed-JSON error reporting. Must avoid log timestamps.
 */
function looksLikeIntendedJson(input: string): boolean {
  const trimmed = input.trimStart();

  // Starts with { → strong JSON signal
  if (trimmed.startsWith("{")) return true;

  // Starts with [ → only if followed by JSON-like content, not timestamps
  if (trimmed.startsWith("[")) {
    const afterBracket = trimmed.slice(1).trimStart();
    // Log timestamp: [2024-..., [yyyy-..., [HH:MM...
    if (/^\d{4}[\s-]/.test(afterBracket)) return false;
    // JSON array content: starts with {, ", [, null, true, false
    if (
      afterBracket.startsWith("{") ||
      afterBracket.startsWith('"') ||
      afterBracket.startsWith("[") ||
      afterBracket.startsWith("null") ||
      afterBracket.startsWith("true") ||
      afterBracket.startsWith("false")
    ) {
      return true;
    }
    // Starts with a digit but not a timestamp year
    if (/^\d/.test(afterBracket) && !/^\d{4}/.test(afterBracket)) {
      return true;
    }
  }

  return false;
}

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Validate raw input. Returns null if valid, or a ValidationError.
 */
export function validateInput(input: string): ValidationError | null {
  // Empty check
  if (input.length === 0 || input.trim().length === 0) {
    return { kind: "empty", message: "Input is empty." };
  }

  // Binary/archive detection
  const binarySig = hasBinarySignature(input);
  if (binarySig) {
    return {
      kind: "unsupported-binary",
      message: `Input looks like a ${binarySig} archive or binary file. Only plain text and JSON are accepted.`,
    };
  }

  if (looksLikeBinary(input)) {
    return {
      kind: "unsupported-binary",
      message: "Input contains too many control characters and appears to be binary. Only plain text and JSON are accepted.",
    };
  }

  // Byte limit
  const byteLength = new TextEncoder().encode(input).byteLength;
  if (byteLength > INPUT_LIMITS.maxBytes) {
    return {
      kind: "too-large",
      message: `Input is ${byteLength} bytes, exceeding the ${INPUT_LIMITS.maxBytes} byte limit (512 KB).`,
      limit: INPUT_LIMITS.maxBytes,
      actual: byteLength,
    };
  }

  // Line limit
  const lineCount = countLines(input);
  if (lineCount > INPUT_LIMITS.maxLines) {
    return {
      kind: "too-many-lines",
      message: `Input has ${lineCount} lines, exceeding the ${INPUT_LIMITS.maxLines} line limit.`,
      limit: INPUT_LIMITS.maxLines,
      actual: lineCount,
    };
  }

  // JSON validation: if it strongly looks like JSON intent but fails to parse
  if (looksLikeIntendedJson(input)) {
    try {
      JSON.parse(input);
    } catch {
      return {
        kind: "malformed-json",
        message: "Input looks like JSON but failed to parse. Check for syntax errors.",
      };
    }
  }

  return null;
}

/** Count lines in input. */
export function countLines(input: string): number {
  if (input.length === 0) return 0;
  let count = 1;
  for (let i = 0; i < input.length; i++) {
    if (input[i] === "\r") {
      count++;
      if (input[i + 1] === "\n") i++;
    } else if (input[i] === "\n") {
      count++;
    }
  }
  return count;
}
