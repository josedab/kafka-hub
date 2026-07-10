# @kafka-hub/kafka-diagnose

Deterministic static rule engine for Apache Kafka `.properties` files.
Parses Java-style `.properties` text and runs 37 rules across 8 categories
(validation, broker, topic, producer, consumer, security, transactions,
performance).

## Features

- **37 rules** with severity levels (danger, warning, info)
- **8 categories** organized in separate files for maintainability
- **20 uniquely fixable rules** with 22 fix paths (structured lossless patches)
- **True lossless Java-properties preservation** — parse, patch, and serialize
  preserving comments, blank lines, ordering, line continuations, escape
  sequences, and per-line newline style
- **Explicit duplicate/conflict behavior** — duplicate keys are detected;
  patch operations targeting ambiguous keys surface explicit conflicts rather
  than silently resolving
- **Redaction** — best-effort, defense-in-depth detection of common secret
  patterns (passwords, JAAS credentials, tokens, private keys, cloud
  credentials, authentication fields, secret-like keys) applied before all
  egress paths: URL/history/clipboard/download/network. Keystore/truststore
  *locations* are not treated as secrets. Review sanitized output: unusual key
  names, encodings, or formats may not be recognized.
- **Egress safety** — `prepareForUrl`, `prepareForHistory`,
  `prepareForJsonExport`, `prepareForLlm`, `prepareForClipboard`,
  `prepareForPropertiesDownload`
- **Optional LLM integration** — `prepareForLlm` sends best-effort sanitized
  config text (not a parsed key/value object) to the server endpoint
- **Framework-free** — runs in Node, browser, or Web Worker

## Usage

```ts
import { evaluate, rules, allRules } from "@kafka-hub/kafka-diagnose";

const report = evaluate("acks=1\nmin.insync.replicas=1");
// report.findings: DiagnosticFinding[]
// report.parsedKeys: number

console.log(`${rules.length} rules, ${report.findings.length} findings`);
```

## API

### `evaluate(input: string): DiagnosticReport`

Parse `.properties` text and run all rules. Returns findings with severity,
title, detail, category, ruleId, and optional fix/learnSlug/simulateSlug.

### `parsePropertiesDocument(input: string): PropertiesDocument`

Lossless parse preserving comments, blank lines, ordering, line
continuations, and escape sequences.

### `applyPatches(doc, operations): PatchResult`

Apply structured fix operations (set, replace, remove) to a document.
Returns `{ ok: true, document, appliedCount }` or
`{ ok: false, conflicts }` for duplicate-key ambiguity, contradictory
operations, missing keys, or value mismatches.

### `prepareForUrl(input) / prepareForHistory(input) / ...`

Apply the same common-pattern redaction pipeline at each egress boundary.
The result must still be reviewed before export or sharing.
`prepareForJsonExport(input, { generatedAt })` also accepts a stable timestamp
(or injectable `now` clock) when identical full JSON output is required;
without it, export content is stable but `generatedAt` uses wall time.

## Tests

```bash
pnpm test    # 122 node:test cases
```

## License

MIT
