# @kafka-hub/incident-parser

Offline incident evidence parser and triage engine for Apache Kafka.
Accepts plain text or JSON evidence, auto-detects failure signatures,
and returns structured hypotheses with confidence scores.

Hypothesis content and ordering are deterministic. By default `analyzedAt`
uses wall time; pass `analyzedAt` or an injected `now` clock when identical
full serialized output is required.

## Features

- **10 failure signature matchers** — ISR/min.ISR, disk storage, stale leader,
  poll timeout/rebalance, auth/SASL, serializer/magic byte, controller movement,
  KRaft quorum loss, oversized record, producer fencing/epoch
- **Input validation** — 512 KiB max, 10,000 line max, binary content rejection
- **Confidence scoring** — per-hypothesis with evidence references
- **Observability recommendations** — evidence-backed, with explicit guidance
- **Best-effort sanitized export** — Markdown and JSON use
  `@kafka-hub/kafka-diagnose` common-pattern redaction; review before sharing

## Usage

```ts
import { validateInput, analyze } from "@kafka-hub/incident-parser";

const error = validateInput(evidenceText);
if (error) {
  console.error(error.message);
} else {
  const result = analyze(evidenceText);
  if (result.ok) {
    // result.analysis: IncidentAnalysis
    console.log(result.analysis.hypotheses);
  } else {
    // result.error: ValidationError
    console.error(result.error.message);
  }
}
```

## Limits

| Limit | Value |
| --- | --- |
| Max input size | 512 KiB |
| Max lines | 10,000 |
| Binary content | Rejected |

## API

### `validateInput(input: string): ValidationError | null`

Returns a validation error or null if input is acceptable.

### `analyze(input: string, options?: AnalysisOptions): AnalysisResult`

Run all 10 signature matchers against the input. Returns a discriminated
union:

- `{ ok: true, analysis: IncidentAnalysis }` — hypotheses sorted by
  confidence, evidence references, and observability recommendations.
- `{ ok: false, error: ValidationError }` — input failed validation.

`options.analyzedAt` or `options.now` can provide a stable timestamp for tests,
replay, or content-addressed exports.

### `exportMarkdown(analysis) / exportJson(analysis)`

Best-effort sanitized export with `@kafka-hub/kafka-diagnose` redaction.
Unconventional secrets may not be recognized, so review generated content.

## Tests

```bash
pnpm test    # 93 node:test cases
```

## License

MIT
