# Contributing

Thanks for your interest in the Kafka Engineering Hub. This is an open-source
project built in public.

## Ground rules

- Be kind. Disagree on technical specifics, never on the person.
- Don't open a PR for cosmetic-only changes (whitespace, reformatting) unless
  the existing formatting is broken.
- Performance, correctness, and accessibility regressions block a merge.
- New runtime dependencies need a one-line justification in the PR description.

## What we welcome

In priority order:

1. **Bug reports.** Especially anything in the diagnostic engine that produces
   a false positive or misses an obvious footgun.
2. **New diagnostic rules.** See below.
3. **Learn articles and Field Notes.** See below.
4. **Simulator scenarios.** See below.
5. **Workbench tool improvements.** Each tool has its own engine in
   `packages/kafka-planners/` or `packages/incident-parser/`.
6. **CLI improvements.** The CLI in `packages/kafka-cli/` reuses the
   diagnose engine — keep parity with the web UI.

## What we won't merge

- Real Kafka client code in the browser.
- LLM features without cost controls.
- Authentication, telemetry beyond anonymous page views, or monetization
  without a prior discussion in an issue.

## Local development

Required: **Node.js 22+** and the pnpm version pinned in `package.json`.
You do **not** need Kafka, Docker, Redis, a database, or an Anthropic key.

```bash
corepack enable
pnpm install
pnpm dev
```

Before opening a PR:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
pnpm build
pnpm test:browser      # requires Chromium: corepack pnpm exec playwright install chromium
NEXT_PUBLIC_SITE_URL=https://kafka-hub.dev pnpm check:production-env
corepack pnpm audit --prod
```

PR CI keeps the production audit informational because advisory data can
change independently of a pull request. A scheduled/manual workflow installs
the frozen lockfile and hard-fails on high or critical production advisories.
CI also boots the exact `.next/standalone/server.js` output and verifies the
dynamic health endpoint.

Deployment behavior, build-time/runtime variables, and production smoke checks
are documented in [`docs/production.md`](docs/production.md).

## Security and conduct reports

Report suspected vulnerabilities privately using the process in
[`SECURITY.md`](SECURITY.md), not a public issue. Never attach credentials,
private Kafka configuration, or customer data.

Participation is governed by [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## How to add a Diagnose rule

Canonical rule documentation lives in
`packages/kafka-diagnose/src/rule-metadata.ts`. Rules are composed in
`packages/kafka-diagnose/src/rules/index.ts`.

Rules are organized by category in `packages/kafka-diagnose/src/rules/`:
- `validation.ts`, `broker.ts`, `topic.ts`, `producer.ts`, `consumer.ts`
- `security.ts`, `transactions.ts`, `performance.ts`

Each file exports an array of `RuleWithFix` objects. Rule IDs, categories,
evaluation logic, finding severity/links, and optional `structuredFix` values
live with the rule. Canonical documentation titles, examples, and
“why it matters” copy live in `rule-metadata.ts`.

1. Pick a kebab-case rule ID. Choose its `severity` (`danger`, `warning`,
   `info`) and add it to the correct category file.

2. The evaluator receives parsed `.properties` keys and returns a finding,
   an array, or `null`. Include `learnSlug` when an article exists, and
   `structuredFix` when a lossless patch is possible.

3. Add tests in the relevant concern-focused file (for example
   `engine.test.ts`, `patch.test.ts`, or a category-specific test). Test both
   triggering and non-triggering configs.

4. Run the full check set:
   ```bash
   pnpm test
   pnpm typecheck
   pnpm build
   ```

The rule auto-appears on `/diagnose` and gets a canonical page at
`/diagnose/rules/<id>`.

### Rule categories & file locations

| Category | File |
| --- | --- |
| validation | `packages/kafka-diagnose/src/rules/validation.ts` |
| broker | `packages/kafka-diagnose/src/rules/broker.ts` |
| topic | `packages/kafka-diagnose/src/rules/topic.ts` |
| producer | `packages/kafka-diagnose/src/rules/producer.ts` |
| consumer | `packages/kafka-diagnose/src/rules/consumer.ts` |
| security | `packages/kafka-diagnose/src/rules/security.ts` |
| transactions | `packages/kafka-diagnose/src/rules/transactions.ts` |
| performance | `packages/kafka-diagnose/src/rules/performance.ts` |

### Lossless properties tests

The `patch.test.ts` suite verifies that structured fixes produce lossless
round-trip patches. The `egress.test.ts` suite verifies coverage for recognized
secret patterns (passwords, JAAS credentials, tokens, private keys, cloud
credentials, authentication fields, secret-like keys). Redaction remains
best-effort; tests do not prove arbitrary input is secret-free.

## How to add a Learn article

1. Create `content/learn/<slug>.mdx` with frontmatter:
   ```yaml
   title: Your Title
   description: One-line description.
   date: "2026-07-01"
   scenarios: ["slow-consumer"]
   tags: ["replication", "operations"]
   ```
2. Register the slug in `content/learn/meta.json`. Add it to a metadata-driven
   track only when it has a clear ordered prerequisite path; do not add
   article-specific routing code.
3. Encouraged: add an interactive component in `components/demos/`.
4. Run `pnpm build`. The article auto-appears in sidebar, RSS, sitemap, and
   the homepage.

## How to add a Field Note

Field Notes are dated engineering records, not evergreen documentation. Create
`content/notes/<slug>.mdx`, register it in `content/notes/meta.json`, and use
the typed frontmatter:

```yaml
title: "Concise operating observation"
description: "What changed, what was tested, and the bounded conclusion."
date: "2026-07-26"
kind: "field-note" # or "experiment"
tags: ["kafka-4.3.1", "operations"]
reviewedAgainst: "Reviewed against Apache Kafka 4.3.1" # optional
featured: false # optional
```

- State the observed version/date and cite primary sources for time-sensitive
  claims.
- Separate confirmed behavior, experiment conditions, and open questions.
- Link to the relevant Learn, Runbook, Protocol Lab, Simulate scenario, or
  Workbench route when it exists.
- Do not put secrets, raw customer data, or hidden chain-of-thought in a note.

Notes automatically appear on `/notes`, `/notes/rss.xml`, search, sitemap, and
the homepage's static latest-article list. Run `pnpm test:unit` to validate all
local Learn, Runbook, and Field Note links.

## How to add a Simulate scenario

1. Add a `Scenario` to `packages/kafka-sim/src/scenarios.ts`.
2. Add a test in the relevant simulator file:
   `engine.operations.test.ts`, `engine.invariants.test.ts`, or
   `engine.reconciliation.test.ts`.
3. Run `pnpm build`. The scenario auto-appears at `/simulate` and gets an
   embed route.

### Three-axis consumer group model

The simulator models consumer groups along three independent axes:

1. **`groupProtocol`**: `"classic" | "consumer"` — protocol selection
2. **`classicAssignmentBehavior`**: `"eager" | "cooperative"` — classic only
3. **`assignor`** — explicit partition assignment strategy:
   - Classic eager: `range` (default), `roundrobin`, `sticky`,
     with incompatible cooperative assignors normalized to `range`
   - Classic cooperative: `cooperative-sticky` (required/default);
     eager-only assignors are normalized to `cooperative-sticky`
   - Consumer protocol (KIP-848): `uniform` (always, server-side)

The KIP-848 consumer protocol is NOT "cooperative" in the classic sense. It
uses broker-coordinated incremental reconciliation with group/member epochs.
Partition moves complete within one tick (one-tick pending reconciliation).

Invariants: ownership uniqueness, epoch monotonicity, determinism, committed
offset preservation, protocol-specific pause/risk assertions.

## How to add a Protocol Lab

1. Add a lab slug to `PROTOCOL_LAB_SLUGS` in `lib/protocol-lab/types.ts`.
2. Add a builder module at `lib/protocol-lab/labs/<slug>.ts` exporting a
   `ProtocolLab` built from pure, deterministic data — actors, one or more
   `ProtocolVariant`s, each a fully precomputed array of `ProtocolStep`s.
   Every step needs a narrative and a state snapshot; request/response steps
   should also carry a `WireFrame` (used by Wire mode).
3. Register the lab in `lib/protocol-lab/registry.ts` (`PROTOCOL_LABS`).
4. `app/protocol/[slug]/page.tsx` picks it up automatically via
   `generateStaticParams()` — no new route file needed.
5. Add assertions to `lib/protocol-lab.test.ts` (structural/determinism) and
   extend `lib/referential-integrity.test.ts` if the lab links to Learn,
   Errors, KIPs, Simulate scenarios, or Runbooks.
6. Run `pnpm build` — the lab appears at `/protocol` and gets a static route,
   sitemap entry, and search index entry automatically.

Every lab must display the exact text `Reviewed against Apache Kafka 4.3.1`
(via the `REVIEWED_AGAINST_TEXT` constant) and must not make any live broker
or network calls.

## How to add a Workbench tool

1. Register in `lib/workbench-registry.ts` (slug, title, description).
2. Add the engine in `packages/kafka-planners/src/<name>/` with subpath export.
3. Add a client page at `app/workbench/<slug>/`.
4. Include `node:test` cases and ensure coverage passes.

### Planner subpath conventions

Each planner lives in its own directory under `packages/kafka-planners/src/`:
`lag/`, `capacity/`, `listeners/`, `message-size/`, `kraft/`, `dr/`.
Each has an `index.ts` subpath export, typed input/output, deterministic
analysis, validation, and export functions.

## How to add an incident signature

Add the definition to the matching failure-domain module under
`packages/incident-parser/src/signatures/`, then compose it in
`packages/incident-parser/src/signatures.ts`. Each signature has the shape:

```ts
{
  id: string;
  title: string;
  severity: HypothesisSeverity;
  baseConfidence: number;
  patterns: SignaturePattern[];
  conflicts: ConflictPattern[];
  missingEvidence: string[];
  recommendedNextEvidence: string[];
  resourceLinks: ResourceLink[];
  observability: ObservabilityRecommendation[];
}
```

Test composition and behavior in `detect.test.ts` and `analyze.test.ts`.

## Coverage and testing

- **Unit tests** use `node:test` (no Jest/Vitest). Run with `pnpm test`.
- **Coverage** uses Node 22's `--experimental-test-coverage`. Per-domain
  thresholds are enforced in `scripts/test-coverage.mjs`:
  - Root / diagnose / sim / CLI: ≥85% lines, ≥70% branches, ≥85% functions
  - Incident / planners: ≥90% lines, ≥80% branches, ≥90% functions
- **Browser tests** use Playwright (Chromium only, 57 tests; last verified
  2026-07-26). Run with
  `pnpm test:browser` after installing:
  `corepack pnpm exec playwright install chromium`.

### Integrity tests

The `lib/referential-integrity.test.ts` suite verifies cross-references
between rules, articles, scenarios, errors, KIPs, and workbench tools
(registry, search, referential, and observability integrity). The
`lib/search-index.test.ts` suite validates the search index entries.

## Commit and PR style

- One topic per PR. Split unrelated changes.
- Commit messages: imperative mood (`add foo`, not `added foo`).
- PR description should explain *why*, not just *what*.

## License

By contributing you agree your contribution is licensed under the
[MIT license](LICENSE).
