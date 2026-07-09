/**
 * Shared Java-properties lexical primitives.
 *
 * This module owns physical-line splitting, continuation folding, comment
 * detection, and key/separator parsing. The lossless document parser and the
 * redaction boundary both use it so they cannot disagree about logical keys.
 */

export type LineTerminator = "\n" | "\r\n" | "\r";

export interface PropertyPhysicalLine {
  readonly text: string;
  readonly terminator: LineTerminator | undefined;
}

export interface LogicalPropertyLine {
  /** 1-based source line. */
  readonly line: number;
  readonly rawLines: readonly string[];
  readonly terminators: readonly (LineTerminator | undefined)[];
  readonly text: string;
  readonly hasContinuation: boolean;
  /** Exclusive physical-line index for the next lexer step. */
  readonly nextIndex: number;
}

export type PropertySeparator = "=" | ":" | " ";

export interface ParsedPropertyLine {
  readonly rawKeyPrefix: string;
  readonly rawKey: string;
  readonly key: string;
  readonly rawSeparator: string;
  readonly separator: PropertySeparator;
  readonly rawValue: string;
  readonly value: string;
}

const COMMENT_RE = /^\s*[#!]/;
const BLANK_RE = /^\s*$/;
const LEADING_CONTINUATION_WHITESPACE_RE = /^[\s\f]+/;

function isPropertyWhitespace(char: string): boolean {
  return char === " " || char === "\t" || char === "\f";
}

/** Whether a physical line is blank or a Java-properties comment. */
export function isPropertyCommentOrBlank(line: string): boolean {
  return BLANK_RE.test(line) || COMMENT_RE.test(line);
}

/** A continuation exists only when the line ends with an odd backslash count. */
export function hasOddTrailingBackslashes(line: string): boolean {
  let count = 0;
  for (
    let index = line.length - 1;
    index >= 0 && line[index] === "\\";
    index--
  ) {
    count++;
  }
  return count % 2 === 1;
}

/** Split input into physical lines while preserving each original terminator. */
export function splitPropertyLines(input: string): PropertyPhysicalLine[] {
  const lines: PropertyPhysicalLine[] = [];
  let index = 0;
  let start = 0;

  while (index < input.length) {
    if (input[index] === "\r") {
      if (index + 1 < input.length && input[index + 1] === "\n") {
        lines.push({ text: input.slice(start, index), terminator: "\r\n" });
        index += 2;
      } else {
        lines.push({ text: input.slice(start, index), terminator: "\r" });
        index += 1;
      }
      start = index;
      continue;
    }

    if (input[index] === "\n") {
      lines.push({ text: input.slice(start, index), terminator: "\n" });
      index += 1;
      start = index;
      continue;
    }

    index++;
  }

  if (start < input.length) {
    lines.push({ text: input.slice(start), terminator: undefined });
  }

  return lines;
}

/**
 * Fold one entry's physical continuation lines into the logical text used by
 * Java-properties key/value parsing.
 */
export function collectLogicalPropertyLine(
  lines: readonly PropertyPhysicalLine[],
  startIndex: number,
): LogicalPropertyLine {
  const first = lines[startIndex];
  const rawLines = [first.text];
  const terminators: (LineTerminator | undefined)[] = [first.terminator];
  let text = first.text;
  let index = startIndex;

  while (
    hasOddTrailingBackslashes(lines[index].text) &&
    index + 1 < lines.length
  ) {
    index++;
    const next = lines[index];
    rawLines.push(next.text);
    terminators.push(next.terminator);
    text =
      text.slice(0, -1) +
      next.text.replace(LEADING_CONTINUATION_WHITESPACE_RE, "");
  }

  return {
    line: startIndex + 1,
    rawLines,
    terminators,
    text,
    hasContinuation: rawLines.length > 1,
    nextIndex: index + 1,
  };
}

/**
 * Parse a logical Java-properties entry.
 *
 * The first unescaped `=`, `:`, or property whitespace separates the key from
 * the value. Raw components are retained for redacted output formatting.
 */
export function parsePropertyLine(line: string): ParsedPropertyLine | null {
  let index = 0;

  while (index < line.length && isPropertyWhitespace(line[index])) index++;
  const rawKeyPrefix = line.slice(0, index);
  if (index >= line.length) return null;

  const keyStart = index;
  while (index < line.length) {
    const char = line[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (
      char === "=" ||
      char === ":" ||
      isPropertyWhitespace(char)
    ) {
      break;
    }
    index++;
  }
  const rawKey = line.slice(keyStart, index);

  const separatorStart = index;
  while (index < line.length && isPropertyWhitespace(line[index])) index++;

  let separator: PropertySeparator = " ";
  if (index < line.length && (line[index] === "=" || line[index] === ":")) {
    separator = line[index] as "=" | ":";
    index++;
  }

  while (index < line.length && isPropertyWhitespace(line[index])) index++;

  const rawSeparator = line.slice(separatorStart, index);
  const rawValue = line.slice(index);

  return {
    rawKeyPrefix,
    rawKey,
    key: unescapeProperty(rawKey),
    rawSeparator,
    separator,
    rawValue,
    value: unescapeProperty(rawValue),
  };
}

/** Unescape Java-properties special sequences in keys or values. */
export function unescapeProperty(input: string): string {
  let result = "";
  let index = 0;

  while (index < input.length) {
    if (input[index] !== "\\" || index + 1 >= input.length) {
      result += input[index];
      index++;
      continue;
    }

    const next = input[index + 1];
    switch (next) {
      case "n":
        result += "\n";
        index += 2;
        break;
      case "t":
        result += "\t";
        index += 2;
        break;
      case "r":
        result += "\r";
        index += 2;
        break;
      case "\\":
        result += "\\";
        index += 2;
        break;
      case "=":
        result += "=";
        index += 2;
        break;
      case ":":
        result += ":";
        index += 2;
        break;
      case " ":
        result += " ";
        index += 2;
        break;
      case "u": {
        if (index + 5 < input.length) {
          const code = Number.parseInt(input.slice(index + 2, index + 6), 16);
          if (!Number.isNaN(code)) {
            result += String.fromCharCode(code);
            index += 6;
            break;
          }
        }
        result += "\\";
        index++;
        break;
      }
      default:
        // Java Properties.load treats an unknown escape as the escaped char.
        result += next;
        index += 2;
        break;
    }
  }

  return result;
}
