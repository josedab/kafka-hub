# Kafka Engineering Hub

> Interactive learning, configuration diagnostics, an in-browser simulator,
> and operational workbench tools for engineers working with Apache Kafka.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Open source. MIT licensed. Built with Next.js, Fumadocs, and Tailwind.
Local-first — no live cluster connections, no accounts, no external services
required.

## Product surfaces

| Surface | What it does | Count |
| --- | --- | --- |
| **Learn** (`/learn`) | Long-form MDX articles with embedded interactive React components. | 11 articles, RSS |
| **Diagnose** (`/diagnose`) | Paste broker, topic, or client config. Static rule engine flags footguns; optional LLM augmentation. Fix Composer merges patches; exports JSON and corrected `.properties`. | 37 rules (8 categories) |
| **Simulate** (`/simulate`) | Deterministic in-browser Kafka: brokers, partitions, ISR, consumer groups with eager/cooperative/KIP-848 rebalance across three independent axes (protocol, behavior, assignor). | 7 scenarios, embed |
| **Runbooks** (`/runbooks`) | Incident playbooks for common operational emergencies. | 4 runbooks |
| **Errors** (`/errors`) | Searchable catalog of Kafka exception classes with root causes and fixes. | 20 exceptions |
| **KIPs** (`/kips`) | Index of the most-relevant Kafka Improvement Proposals. | 25 KIPs |
| **Workbench** (`/workbench`) | Interactive triage and analysis tools. Paste evidence or model parameters; get structured results. Exports Markdown and JSON. | 7 tools |

### Workbench tools

| Tool | Path | Engine |
| --- | --- | --- |
| Incident Triage | `/workbench/incident` | `@kafka-hub/incident-parser` — 10 failure signatures |
| Consumer Lag Triage | `/workbench/lag` | `@kafka-hub/kafka-planners/lag` |
| Capacity & N-1 Headroom | `/workbench/capacity` | `@kafka-hub/kafka-planners/capacity` |
| Listener Topology Wizard | `/workbench/listeners` | `@kafka-hub/kafka-planners/listeners` |
| Message Size Chain Checker | `/workbench/message-size` | `@kafka-hub/kafka-planners/message-size` |
| KRaft Transition Planner | `/workbench/kraft` | `@kafka-hub/kafka-planners/kraft` |
| DR Tabletop Planner | `/workbench/dr` | `@kafka-hub/kafka-planners/dr` |

## Local quickstart

Requires **Node.js 22+** and **pnpm** only. No Kafka broker, Docker, Redis,
database, Anthropic key, or external service.

```bash
corepack enable
pnpm install
pnpm dev        # → http://localhost:3000
```

## Scripts

| Script | Purpose |
| --- | --- |
| `pnpm dev` | Local dev server (Next.js + Fumadocs codegen) |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint with persistent cache |
| `pnpm test` | Full unit test suite (root + all workspace packages) |
| `pnpm test:coverage` | Per-domain coverage thresholds via Node 22 `--experimental-test-coverage` |
| `pnpm test:browser` | Playwright browser smoke tests (Chromium, 25 tests). Uses production build + start locally via Playwright config. Install with `corepack pnpm exec playwright install chromium`. |

CI runs all of the above plus a CLI tarball smoke test on every push/PR via
[`.github/workflows/ci.yml`](.github/workflows/ci.yml).

### Dependency audit policy

PR/main CI reports **high and critical production advisories** visibly but
does not block on the changing external advisory database. The separate
[scheduled/manual security audit](.github/workflows/security-audit.yml)
installs the frozen lockfile and hard-fails on high or critical production
advisories. Run `corepack pnpm audit --prod` locally for the full production
report.

## Workspace packages

| Package | Purpose | Docs |
| --- | --- | --- |
| [`@kafka-hub/kafka-sim`](packages/kafka-sim/README.md) | Deterministic simulator engine. Pure TS, no React. | README |
| [`@kafka-hub/kafka-diagnose`](packages/kafka-diagnose/README.md) | Static `.properties` rule engine. 37 rules, 8 categories. | README |
| [`@kafka-hub/kafka-cli`](packages/kafka-cli/README.md) | `kafka-hub diagnose <file>` Node CLI companion. | README |
| [`@kafka-hub/incident-parser`](packages/incident-parser/README.md) | Offline incident evidence parser and triage engine. | README |
| [`@kafka-hub/kafka-planners`](packages/kafka-planners/README.md) | Six focused planning/triage engines (lag, capacity, listeners, message-size, kraft, dr). | README |

## Architecture / repo layout

```
app/                       # Next.js App Router
  layout.tsx               # root layout (RootProvider, search, optional analytics)
  page.tsx                 # marketing homepage
  learn/                   # Fumadocs MDX article surface
  diagnose/                # paste-only config diagnostics + Fix Composer
  simulate/                # deterministic broker simulator
    embed/[scenario]/      # chromeless iframe-embeddable scenario pages
  workbench/               # 7 interactive triage tools
  errors/                  # searchable Kafka exception catalog
  kips/                    # KIP index
  runbooks/                # incident playbooks (Fumadocs MDX)
  api/
    search/route.ts        # Fumadocs search endpoint
    diagnose/llm/route.ts  # optional LLM augmentation (Anthropic, env-gated)
  rss.xml/route.ts         # RSS feed for /learn articles
content/
  learn/                   # 11 MDX articles + meta.json
  runbooks/                # 4 MDX runbooks + meta.json
components/
  site-shell.tsx           # global nav, mobile menu, footer, skip link
  ui/                      # button, card, badge (minimal shadcn-style set)
  demos/                   # interactive demo components used by MDX
  workbench/               # shared Workbench UI primitives
lib/
  site.ts                  # site metadata
  source.ts                # Fumadocs source loader
  workbench-registry.ts    # authoritative Workbench tool registry
  errors-data.ts           # 20 Kafka exception entries
  kips-data.ts             # 25 KIP entries
  nav-links.ts             # navigation link definitions
  rate-limit.ts            # in-process token bucket (LLM endpoint)
  lru-cache.ts             # SHA-256-keyed LRU for LLM responses
  canonical-origin.ts      # NEXT_PUBLIC_SITE_URL validation
workers/
  simulator-worker.ts      # Web Worker harness for simulator
packages/
  kafka-sim/               # extracted simulator engine
  kafka-diagnose/          # extracted rule engine
  kafka-cli/               # Node CLI companion
  incident-parser/         # incident evidence parser
  kafka-planners/          # 6 planning/triage engines
scripts/
  test-coverage.mjs        # per-domain coverage thresholds
tests/
  browser/                 # Playwright browser smoke tests
```

## Privacy and trust boundaries

- **No live cluster connections.** Diagnose is paste-only. Simulate is
  in-browser. The CLI reads files/stdin. No network calls to Kafka.
- **No accounts, no tracking cookies.** Sharing uses base64-url-encoded URL
  hashes — the server never sees shared configs.
- **No telemetry beyond anonymous page views.** Optional Plausible analytics
  (no cookies, no PII). Off by default.
- **All content is version-controlled.** No CMS, no database.
- **Redaction:** The Diagnose export pipeline (JSON, corrected `.properties`,
  clipboard, URL) applies best-effort, defense-in-depth redaction for common
  secret patterns (passwords, JAAS credentials, tokens, private keys, cloud
  credentials, authentication fields, secret-like keys). Keystore/truststore
  locations are not treated as secrets. Workbench export uses the same
  `@kafka-hub/kafka-diagnose` redaction. Users must review sanitized output
  before sharing because unconventional key names, encodings, or formats may
  not be recognized.

### Optional LLM egress

The `POST /api/diagnose/llm` endpoint sends best-effort sanitized config text to
Anthropic's API for suggestions beyond static rules. This is **fully
optional**:

- Returns a graceful fallback when `ANTHROPIC_API_KEY` is unset.
- The client applies `prepareForLlm()` before sending and the server applies
  the same common-pattern redaction again. The resulting config text is sent,
  not a parsed key/value object. This reduces accidental disclosure but cannot
  guarantee detection of unconventional secrets; review input before using
  the LLM action.
- No other endpoint makes external network calls.
- In-process rate limiting (10 req/min/IP) and SHA-256 LRU caching.

## Environment variables

See [`.env.example`](.env.example). No variables are required.

| Variable | Enables | Required |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin for metadata/sitemap/RSS. Defaults to `https://kafka-hub.dev`. | No |
| `ANTHROPIC_API_KEY` | LLM suggestions in Diagnose | No |
| `ANTHROPIC_MODEL` | Anthropic model override | No |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Anonymous Plausible page views | No |

## Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript**
- **Tailwind CSS v4** with the Fumadocs `neutral` preset
- **Fumadocs** (`fumadocs-ui` + `fumadocs-core` + `fumadocs-mdx`) for MDX
- **Playwright** for browser smoke tests
- **Node 22** `node:test` for unit tests and coverage
- **pnpm 11.17** workspace monorepo

## CLI quickstart

```bash
# workspace dev
pnpm --filter @kafka-hub/kafka-cli diagnose ./server.properties

# direct invocation
node packages/kafka-cli/bin/kafka-hub.mjs diagnose ./server.properties --min warning

# pipe from stdin + JSON output
cat broker.properties | node packages/kafka-cli/bin/kafka-hub.mjs diagnose - --json
```

Exits **1** on `danger`-severity findings, **0** otherwise.

## Hard constraints

- No live cluster connections. This is by design.
- No accounts. Sharing via URL hashes.
- No telemetry beyond optional anonymous page views.
- All content version-controlled. No CMS.

## Kafka baseline

The KRaft Transition Planner's version-awareness is reviewed against **Apache
Kafka 4.3.1** (released 2026-06-25, reviewed 2026-07-25). This is
time-bounded — future Kafka releases may introduce changes not yet modeled.

## License

[MIT](LICENSE) © Jose David Baena.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
