/**
 * Evidence type detection and source line reference parsing.
 *
 * Auto-detects what kind of evidence the input represents and extracts
 * useful source line references for correlation.
 */

import type { EvidenceKind, ParsedEvidence, SourceLineRef, InputFormat } from "./types";
import { detectFormat, countLines } from "./validate";

// ─── Evidence Kind Detection ────────────────────────────────────────────────

interface KindPattern {
  kind: EvidenceKind;
  patterns: RegExp[];
  /** Minimum matches needed to classify. */
  minMatches: number;
}

const KIND_PATTERNS: readonly KindPattern[] = [
  {
    kind: "consumer-groups-output",
    patterns: [
      /GROUP\s+TOPIC\s+PARTITION\s+CURRENT-OFFSET/i,
      /kafka-consumer-groups/i,
      /CONSUMER-ID\s+HOST\s+CLIENT-ID/i,
      /LAG\s/i,
    ],
    minMatches: 1,
  },
  {
    kind: "stack-trace",
    patterns: [
      /\bat\s+[\w.$]+\([\w.]+:\d+\)/,
      /^\s+at\s+/m,
      /Exception|Error.*:\s/,
      /Caused by:/i,
      /\.java:\d+\)/,
    ],
    minMatches: 2,
  },
  {
    kind: "broker-log",
    patterns: [
      /\[[\d-]+\s[\d:,.]+\]\s+(INFO|WARN|ERROR|DEBUG|TRACE|FATAL)\s/,
      /kafka\.server\./,
      /kafka\.controller\./,
      /kafka\.log\./,
      /kafka\.network\./,
      /ReplicaManager/,
      /KafkaServer/,
      /ControllerEventManager/,
      /KafkaRaftClient/,
      /LogManager/,
    ],
    minMatches: 2,
  },
  {
    kind: "client-log",
    patterns: [
      /kafka\.clients\./,
      /kafka\.consumer\./,
      /kafka\.producer\./,
      /ConsumerCoordinator/,
      /AbstractCoordinator/,
      /Fetcher/,
      /NetworkClient/,
      /org\.apache\.kafka\.clients/,
    ],
    minMatches: 1,
  },
  {
    kind: "config",
    patterns: [
      /^[\w.]+\s*=\s*/m,
      /broker\.id\s*=/i,
      /bootstrap\.servers\s*=/i,
      /listeners\s*=/i,
      /log\.dirs\s*=/i,
      /group\.id\s*=/i,
      /acks\s*=/i,
    ],
    minMatches: 2,
  },
  {
    kind: "metric-snapshot",
    patterns: [
      /kafka\.\w+:type=/,
      /name=\w+,/,
      /MeanRate|OneMinuteRate|FiveMinuteRate/,
      /Count\s*[:=]\s*\d/,
      /Value\s*[:=]\s*[\d.]/,
      /UnderReplicatedPartitions|OfflinePartitions|ActiveControllerCount/i,
    ],
    minMatches: 2,
  },
];

/**
 * Detect all evidence kinds present in the input.
 */
export function detectEvidenceKinds(input: string): EvidenceKind[] {
  const detected: EvidenceKind[] = [];

  for (const { kind, patterns, minMatches } of KIND_PATTERNS) {
    let matches = 0;
    for (const pat of patterns) {
      if (pat.test(input)) {
        matches++;
        if (matches >= minMatches) {
          detected.push(kind);
          break;
        }
      }
    }
  }

  if (detected.length === 0) {
    detected.push("unknown");
  }

  return detected;
}

// ─── Source Line Extraction ─────────────────────────────────────────────────

/**
 * Parse an input string into indexed lines for source reference.
 */
export function indexLines(input: string): readonly SourceLineRef[] {
  const lines = input.split(/\r\n|\n|\r/);
  return lines.map((text, i) => ({
    line: i + 1,
    text: text.trimEnd(),
  }));
}

/**
 * Find lines matching a pattern and return source refs.
 */
export function findMatchingLines(
  lines: readonly SourceLineRef[],
  pattern: RegExp,
): SourceLineRef[] {
  return lines.filter((l) => pattern.test(l.text));
}

// ─── Full Evidence Parse ────────────────────────────────────────────────────

/**
 * Parse and classify input evidence.
 */
export function parseEvidence(input: string): ParsedEvidence {
  const format: InputFormat = detectFormat(input);
  const kinds = detectEvidenceKinds(input);
  const lineCount = countLines(input);
  const byteCount = new TextEncoder().encode(input).byteLength;

  return { format, kinds, lineCount, byteCount };
}
