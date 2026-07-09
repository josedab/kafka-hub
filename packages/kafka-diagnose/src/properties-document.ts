/**
 * Lossless Java .properties document model.
 *
 * Preserves comments, blank lines, ordering, separators (=, :, space),
 * duplicate keys, line continuations, newline style (per-line LF/CRLF/CR),
 * and source locations (line numbers) so that round-trip serialization is
 * byte-for-byte identical for untouched lines.
 */

import {
  collectLogicalPropertyLine,
  isPropertyCommentOrBlank,
  parsePropertyLine,
  splitPropertyLines,
  type LineTerminator,
} from "./properties-lex";

export { unescapeProperty } from "./properties-lex";
export type { LineTerminator } from "./properties-lex";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Separator character between key and value in the source. */
export type Separator = "=" | ":" | " ";

/** Detected newline convention of the original document. */
export type NewlineStyle = "lf" | "crlf" | "mixed" | "cr";

/** A comment or blank line in the properties file. */
export interface CommentNode {
  readonly kind: "comment";
  /** 1-based line number in source. */
  readonly line: number;
  /** Raw text of the line (without trailing newline). */
  readonly raw: string;
  /** The original line terminator (undefined for last line without terminator). */
  readonly terminator: LineTerminator | undefined;
}

/** A key/value entry (may span multiple physical lines via continuations). */
export interface EntryNode {
  readonly kind: "entry";
  /** 1-based line number of the first physical line. */
  readonly line: number;
  /** Number of physical lines this entry spans (≥1). */
  readonly lineSpan: number;
  /** Parsed key (unescaped). */
  readonly key: string;
  /** Parsed value (unescaped, continuations joined). */
  readonly value: string;
  /** Original separator character. */
  readonly separator: Separator;
  /** Raw text of all physical lines (without trailing newlines). */
  readonly rawLines: readonly string[];
  /** The original line terminators for each physical line. */
  readonly terminators: readonly (LineTerminator | undefined)[];
  /** Whether this entry was created by a continuation across multiple lines. */
  readonly hasContinuation: boolean;
}

export type DocumentNode = CommentNode | EntryNode;

/** Full parsed document. */
export interface PropertiesDocument {
  readonly nodes: readonly DocumentNode[];
  readonly newlineStyle: NewlineStyle;
  /** Whether the original input had a trailing line terminator on the last line. */
  readonly hasTrailingNewline: boolean;
}

/** Source location information for error reporting. */
export interface SourceLocation {
  readonly line: number;
  readonly key: string;
}

// ─── Parsing ────────────────────────────────────────────────────────────────

/**
 * Detect overall newline style from the line terminators.
 */
function detectNewlineStyle(lines: Array<{ terminator: LineTerminator | undefined }>): NewlineStyle {
  let lf = 0;
  let crlf = 0;
  let cr = 0;
  for (const { terminator } of lines) {
    if (terminator === "\n") lf++;
    else if (terminator === "\r\n") crlf++;
    else if (terminator === "\r") cr++;
  }
  const total = lf + crlf + cr;
  if (total === 0) return "lf"; // default for empty/single-line no-newline
  if (crlf > 0 && lf === 0 && cr === 0) return "crlf";
  if (cr > 0 && lf === 0 && crlf === 0) return "cr";
  if (lf > 0 && crlf === 0 && cr === 0) return "lf";
  return "mixed";
}

/**
 * Parse a Java .properties text into a lossless document model.
 */
export function parsePropertiesDocument(input: string): PropertiesDocument {
  if (input === "") {
    return { nodes: [], newlineStyle: "lf", hasTrailingNewline: false };
  }

  const physicalLines = splitPropertyLines(input);

  // Determine if input ends with a newline by checking whether the last
  // character of input is a line terminator.
  const lastChar = input[input.length - 1];
  const hasTrailingNewline = lastChar === "\n" || lastChar === "\r";

  const newlineStyle = detectNewlineStyle(physicalLines);

  const nodes: DocumentNode[] = [];
  let lineNum = 0;

  while (lineNum < physicalLines.length) {
    const { text: line, terminator } = physicalLines[lineNum];

    // Blank or comment line
    if (isPropertyCommentOrBlank(line)) {
      nodes.push({ kind: "comment", line: lineNum + 1, raw: line, terminator });
      lineNum++;
      continue;
    }

    const logicalLine = collectLogicalPropertyLine(physicalLines, lineNum);
    const parsed = parsePropertyLine(logicalLine.text);
    if (!parsed) {
      nodes.push({ kind: "comment", line: lineNum + 1, raw: line, terminator });
      lineNum++;
      continue;
    }

    nodes.push({
      kind: "entry",
      line: logicalLine.line,
      lineSpan: logicalLine.rawLines.length,
      key: parsed.key,
      value: parsed.value,
      separator: parsed.separator,
      rawLines: logicalLine.rawLines,
      terminators: logicalLine.terminators,
      hasContinuation: logicalLine.hasContinuation,
    });
    lineNum = logicalLine.nextIndex;
  }

  return { nodes, newlineStyle, hasTrailingNewline };
}

// ─── Serialization ──────────────────────────────────────────────────────────

/**
 * Get the default line terminator for a document based on its overall style.
 */
function defaultTerminator(style: NewlineStyle): LineTerminator {
  switch (style) {
    case "crlf": return "\r\n";
    case "cr": return "\r";
    default: return "\n";
  }
}

/**
 * Serialize a properties document back to text.
 * Untouched nodes use their raw representation and original terminators
 * for byte-for-byte lossless round-trip.
 */
export function serializeDocument(doc: PropertiesDocument): string {
  if (doc.nodes.length === 0) {
    // Empty document: reproduce trailing newline if original had one
    return doc.hasTrailingNewline ? defaultTerminator(doc.newlineStyle) : "";
  }

  const parts: string[] = [];
  const defTerm = defaultTerminator(doc.newlineStyle);

  for (const node of doc.nodes) {
    if (node.kind === "comment") {
      parts.push(node.raw);
      parts.push(node.terminator ?? "");
    } else {
      for (let i = 0; i < node.rawLines.length; i++) {
        parts.push(node.rawLines[i]);
        const term = node.terminators[i];
        if (term !== undefined) {
          parts.push(term);
        } else if (i < node.rawLines.length - 1) {
          // Between continuation lines that lack a stored terminator, use default
          parts.push(defTerm);
        } else {
          // Last line of last node — only add terminator if doc had trailing newline
          // (handled below)
        }
      }
    }
  }

  // Check if we need to add a trailing newline
  // The last physical line's terminator would be `undefined` if there was no trailing newline.
  // If the document originally had a trailing newline and the last node doesn't end with one,
  // append the default terminator.
  const lastNode = doc.nodes[doc.nodes.length - 1];
  let lastTerminator: LineTerminator | undefined;
  if (lastNode.kind === "comment") {
    lastTerminator = lastNode.terminator;
  } else {
    lastTerminator = lastNode.terminators[lastNode.terminators.length - 1];
  }

  if (doc.hasTrailingNewline && lastTerminator === undefined) {
    parts.push(defTerm);
  }

  return parts.join("");
}

// ─── Escaping (for synthetic entries) ───────────────────────────────────────

/**
 * Escape a key for writing into a .properties line.
 * Escapes spaces, =, :, \, and control characters.
 */
export function escapeKey(key: string): string {
  let result = "";
  for (let i = 0; i < key.length; i++) {
    const ch = key[i];
    switch (ch) {
      case " ": result += (i === 0) ? "\\ " : "\\ "; break; // escape all spaces in keys
      case "=": result += "\\="; break;
      case ":": result += "\\:"; break;
      case "\\": result += "\\\\"; break;
      case "\t": result += "\\t"; break;
      case "\n": result += "\\n"; break;
      case "\r": result += "\\r"; break;
      case "\f": result += "\\f"; break;
      default:
        if (ch.charCodeAt(0) < 0x20) {
          result += "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0");
        } else {
          result += ch;
        }
    }
  }
  return result;
}

/**
 * Escape a value for writing into a .properties line.
 * Escapes leading spaces, backslashes, and control characters.
 */
export function escapeValue(value: string): string {
  let result = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    switch (ch) {
      case "\\": result += "\\\\"; break;
      case "\t": result += "\\t"; break;
      case "\n": result += "\\n"; break;
      case "\r": result += "\\r"; break;
      case "\f": result += "\\f"; break;
      case " ":
        // Escape leading spaces only
        result += (i === 0) ? "\\ " : " ";
        break;
      default:
        if (ch.charCodeAt(0) < 0x20) {
          result += "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0");
        } else {
          result += ch;
        }
    }
  }
  return result;
}

// ─── Query helpers ──────────────────────────────────────────────────────────

/** Find all entry nodes for a given key (handles duplicates). */
export function findEntriesByKey(doc: PropertiesDocument, key: string): EntryNode[] {
  return doc.nodes.filter(
    (n): n is EntryNode => n.kind === "entry" && n.key === key,
  );
}

/** Get the last-wins value for a key (Java semantics). */
export function getEffectiveValue(doc: PropertiesDocument, key: string): string | undefined {
  const entries = findEntriesByKey(doc, key);
  return entries.length > 0 ? entries[entries.length - 1].value : undefined;
}

/** Build a flat Record (last-wins) from the document — for rule evaluation. */
export function toRecord(doc: PropertiesDocument): Record<string, string> {
  const out: Record<string, string> = {};
  for (const node of doc.nodes) {
    if (node.kind === "entry") {
      out[node.key] = node.value;
    }
  }
  return out;
}

/** Get all unique keys in document order. */
export function getKeys(doc: PropertiesDocument): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const node of doc.nodes) {
    if (node.kind === "entry" && !seen.has(node.key)) {
      seen.add(node.key);
      keys.push(node.key);
    }
  }
  return keys;
}

/** Detect duplicate keys and return their locations. */
export function findDuplicateKeys(doc: PropertiesDocument): Map<string, SourceLocation[]> {
  const map = new Map<string, SourceLocation[]>();
  for (const node of doc.nodes) {
    if (node.kind !== "entry") continue;
    const existing = map.get(node.key);
    if (existing) {
      existing.push({ line: node.line, key: node.key });
    } else {
      map.set(node.key, [{ line: node.line, key: node.key }]);
    }
  }
  // Return only actual duplicates
  const result = new Map<string, SourceLocation[]>();
  for (const [key, locs] of map) {
    if (locs.length > 1) result.set(key, locs);
  }
  return result;
}

export type { PropertiesDocument as PropsDoc };
