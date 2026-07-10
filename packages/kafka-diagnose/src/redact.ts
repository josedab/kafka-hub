/**
 * Secret detection and redaction for Kafka configuration text.
 *
 * Best-effort detection covers common passwords, JAAS strings, tokens,
 * private-key blocks, cloud credentials, authentication fields, and
 * secret-like keys. Unconventional names or encodings may not be recognized.
 *
 * Must be applied before ANY egress path: URL/hash, localStorage/history,
 * clipboard, export/download, or network (LLM).
 *
 * Preserves unrecognized values, comments, blank lines, and original line
 * terminator style. Reports exactly what matched (deduplicated).
 */

import {
  collectLogicalPropertyLine,
  isPropertyCommentOrBlank,
  parsePropertyLine,
  splitPropertyLines,
} from "./properties-lex";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RedactionEntry {
  /** The key whose value was redacted. */
  readonly key: string;
  /** 1-based line number (0 if not determinable). */
  readonly line: number;
  /** Category of detected secret. */
  readonly category: SecretCategory;
}

export type SecretCategory =
  | "password"
  | "jaas"
  | "token"
  | "private-key"
  | "cloud-credential"
  | "secret-like-key";

export interface RedactionResult {
  /** Text with recognized secret patterns replaced. Review before egress. */
  readonly redacted: string;
  /** What was redacted (deduplicated by key+category). */
  readonly entries: readonly RedactionEntry[];
}

// ─── Detection Patterns ─────────────────────────────────────────────────────

/** Keys that commonly hold passwords. */
const PASSWORD_KEY_PATTERNS: RegExp[] = [
  /password/i,
  /passwd/i,
  /storepass/i,
  /keypass/i,
  /trustpass/i,
  /(?:^|[._-])basic\.auth\.user\.info$/i,
  /(?:^|[._-])auth(?:entication)?[._-]?(?:credentials?|user[._-]?info)$/i,
];

/** Keys that hold JAAS config. */
const JAAS_KEY_PATTERNS: RegExp[] = [
  /sasl\.jaas\.config/i,
  /jaas/i,
];

/** Keys that hold tokens or API keys. */
const TOKEN_KEY_PATTERNS: RegExp[] = [
  /token/i,
  /api[._-]?key/i,
  /access[._-]?key/i,
  /secret[._-]?key/i,
  /auth[._-]?key/i,
];

/** Keys that hold cloud credentials. */
const CLOUD_CREDENTIAL_KEY_PATTERNS: RegExp[] = [
  /aws[._-]?secret/i,
  /aws[._-]?access[._-]?key/i,
  /azure[._-]?.*secret/i,
  /azure[._-]?.*key/i,
  /gcp[._-]?.*key/i,
  /google[._-]?.*credentials/i,
  /connection[._-]?string/i,
];

/** Secret-like key patterns (conservative catch-all for unknown secrets). */
const SECRET_LIKE_KEY_PATTERNS: RegExp[] = [
  /[._-]secret[._-]?/i,
  /[._-]credential/i,
  /private[._-]?key/i,
  /signing[._-]?key/i,
  /encryption[._-]?key/i,
  /client[._-]?secret/i,
];

/** Known non-secret endpoint/lifecycle keys that contain the word "token". */
const SAFE_KEY_PATTERNS: RegExp[] = [
  /(?:^|[._-])token[._-](?:endpoint|url|uri|refresh|lifetime|expiry)(?:[._-]|$)/i,
  /^sasl\.oauthbearer\.jwks\.endpoint\.url$/i,
  /(?:^|[._-])credentials?[._-](?:source|provider|class)(?:[._-]|$)/i,
];

/** Value patterns that indicate specific secret types. */
const PRIVATE_KEY_START_RE =
  /-----BEGIN\s+(RSA\s+|EC\s+|DSA\s+|ENCRYPTED\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/;
const PRIVATE_KEY_END_RE =
  /-----END\s+(RSA\s+|EC\s+|DSA\s+|ENCRYPTED\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/;
const STANDALONE_PRIVATE_KEY_START_RE =
  /^\s*-----BEGIN\s+(RSA\s+|EC\s+|DSA\s+|ENCRYPTED\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/;

/** Value-based detection patterns. */
const JAAS_VALUE_RE = /org\.apache\.kafka\.common\.security|LoginModule/i;
const AWS_KEY_VALUE_RE = /AKIA[0-9A-Z]{16}/;
const GCP_CREDENTIAL_VALUE_RE =
  /"type"\s*:\s*"service_account"|"private_key"\s*:/i;
const AZURE_CREDENTIAL_VALUE_RE =
  /(?:AccountKey|SharedAccessSignature|SharedAccessKey)\s*=/i;
const BEARER_TOKEN_RE =
  /^(Bearer\s+|ghp_|gho_|ghs_|ghr_|github_pat_|glpat-|npm_|xox[bpas]-|sk-(?:live_)?[a-zA-Z0-9]|rk_live_)/;
const JWT_RE = /^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\./;
const GOOGLE_API_KEY_RE = /^AIza[0-9A-Za-z_-]{35}$/;
const URL_CREDENTIAL_RE =
  /^[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^@\s/]+@/i;

const REDACTED_PLACEHOLDER = "***REDACTED***";

// ─── Core Classification ────────────────────────────────────────────────────

function isSafeKey(key: string): boolean {
  return SAFE_KEY_PATTERNS.some((pat) => pat.test(key));
}

export function classifyKey(key: string): SecretCategory | null {
  // Safe keys are never redacted
  if (isSafeKey(key)) return null;

  // Order: JAAS (very specific) > cloud credentials > password > token > secret-like-key
  for (const pat of JAAS_KEY_PATTERNS) {
    if (pat.test(key)) return "jaas";
  }
  for (const pat of CLOUD_CREDENTIAL_KEY_PATTERNS) {
    if (pat.test(key)) return "cloud-credential";
  }
  for (const pat of PASSWORD_KEY_PATTERNS) {
    if (pat.test(key)) return "password";
  }
  for (const pat of TOKEN_KEY_PATTERNS) {
    if (pat.test(key)) return "token";
  }
  for (const pat of SECRET_LIKE_KEY_PATTERNS) {
    if (pat.test(key)) return "secret-like-key";
  }
  return null;
}

export function classifyValue(value: string): SecretCategory | null {
  if (PRIVATE_KEY_START_RE.test(value)) return "private-key";
  if (JAAS_VALUE_RE.test(value)) return "jaas";
  if (
    AWS_KEY_VALUE_RE.test(value) ||
    GCP_CREDENTIAL_VALUE_RE.test(value) ||
    AZURE_CREDENTIAL_VALUE_RE.test(value)
  ) {
    return "cloud-credential";
  }
  if (
    BEARER_TOKEN_RE.test(value) ||
    JWT_RE.test(value) ||
    GOOGLE_API_KEY_RE.test(value)
  ) {
    return "token";
  }
  if (URL_CREDENTIAL_RE.test(value)) return "password";
  return null;
}

// ─── Core Redaction Logic ───────────────────────────────────────────────────

/**
 * Redact recognized secret patterns from raw .properties text.
 * Handles key=value, key:value, key<space>value, multi-line continuations,
 * and inline/standalone private key blocks.
 * Preserves original line terminators and formatting for non-secret lines.
 */
export function redactSecrets(input: string): RedactionResult {
  const entriesMap = new Map<string, RedactionEntry>(); // dedup by key+category
  const lines = splitPropertyLines(input);
  const outputParts: string[] = [];
  let lineIdx = 0;

  while (lineIdx < lines.length) {
    const { text: line, terminator } = lines[lineIdx];

    // Detect standalone private key block start
    if (STANDALONE_PRIVATE_KEY_START_RE.test(line)) {
      const startIdx = lineIdx;
      addEntry(entriesMap, "(private-key-block)", startIdx + 1, "private-key");
      const sameLineEnd = PRIVATE_KEY_END_RE.test(
        line.replace(PRIVATE_KEY_START_RE, ""),
      );

      if (sameLineEnd) {
        outputParts.push(
          `-----BEGIN PRIVATE KEY-----${REDACTED_PLACEHOLDER}-----END PRIVATE KEY-----`,
          terminator ?? "",
        );
        lineIdx++;
        continue;
      }

      outputParts.push(line, terminator ?? "");
      lineIdx++;

      while (
        lineIdx < lines.length &&
        !PRIVATE_KEY_END_RE.test(lines[lineIdx].text)
      ) {
        lineIdx++;
      }

      const markerTerminator =
        terminator ?? lines[lineIdx]?.terminator ?? "\n";
      outputParts.push(REDACTED_PLACEHOLDER);

      if (lineIdx < lines.length) {
        outputParts.push(
          markerTerminator,
          lines[lineIdx].text,
          lines[lineIdx].terminator ?? "",
        );
        lineIdx++;
      }
      continue;
    }

    // Comment or blank lines pass through
    if (isPropertyCommentOrBlank(line)) {
      outputParts.push(line);
      outputParts.push(terminator ?? "");
      lineIdx++;
      continue;
    }

    const logicalLine = collectLogicalPropertyLine(lines, lineIdx);
    const kvParsed = parsePropertyLine(logicalLine.text);
    if (!kvParsed) {
      outputParts.push(line);
      outputParts.push(terminator ?? "");
      lineIdx++;
      continue;
    }

    const keyCategory = classifyKey(kvParsed.key);
    const valueCategory = classifyValue(kvParsed.value);
    const category = keyCategory ?? valueCategory;

    if (category) {
      addEntry(entriesMap, kvParsed.key, logicalLine.line, category);
      lineIdx = logicalLine.nextIndex - 1;

      // An inline private-key header may be followed by raw PEM body lines
      // rather than Java continuation lines. Consume through the matching end
      // marker so no base64 key material is left behind.
      if (
        category === "private-key" &&
        PRIVATE_KEY_START_RE.test(kvParsed.value) &&
        !PRIVATE_KEY_END_RE.test(
          kvParsed.value.replace(PRIVATE_KEY_START_RE, ""),
        )
      ) {
        while (
          lineIdx + 1 < lines.length &&
          !PRIVATE_KEY_END_RE.test(lines[lineIdx + 1].text)
        ) {
          lineIdx++;
        }
        if (
          lineIdx + 1 < lines.length &&
          PRIVATE_KEY_END_RE.test(lines[lineIdx + 1].text)
        ) {
          lineIdx++;
        }
      }

      // Emit redacted line preserving key and separator
      outputParts.push(
        `${kvParsed.rawKeyPrefix}${kvParsed.rawKey}${kvParsed.rawSeparator || "="}${REDACTED_PLACEHOLDER}`,
      );
      outputParts.push(terminator ?? "");
    } else {
      for (let index = 0; index < logicalLine.rawLines.length; index++) {
        outputParts.push(logicalLine.rawLines[index]);
        outputParts.push(logicalLine.terminators[index] ?? "");
      }
      lineIdx = logicalLine.nextIndex - 1;
    }
    lineIdx++;
  }

  return {
    redacted: outputParts.join(""),
    entries: [...entriesMap.values()],
  };
}

/**
 * Check if a text contains any detected secrets.
 * Useful for gate checks before egress.
 */
export function containsSecrets(input: string): boolean {
  const { entries } = redactSecrets(input);
  return entries.length > 0;
}

/**
 * Redact recognized secret patterns from a Record (for serialized output).
 * Returns a new record with matched values replaced.
 */
export function redactRecord(record: Record<string, string>): {
  redacted: Record<string, string>;
  entries: RedactionEntry[];
} {
  const entriesMap = new Map<string, RedactionEntry>();
  const redacted: Record<string, string> = {};

  for (const [key, value] of Object.entries(record)) {
    const keyCategory = classifyKey(key);
    const valueCategory = classifyValue(value);
    const category = keyCategory ?? valueCategory;

    if (category) {
      addEntry(entriesMap, key, 0, category);
      redacted[key] = REDACTED_PLACEHOLDER;
    } else {
      redacted[key] = value;
    }
  }

  return { redacted, entries: [...entriesMap.values()] };
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

function addEntry(
  map: Map<string, RedactionEntry>,
  key: string,
  line: number,
  category: SecretCategory,
): void {
  const dedup = `${key}:${category}`;
  if (!map.has(dedup)) {
    map.set(dedup, { key, line, category });
  }
}
