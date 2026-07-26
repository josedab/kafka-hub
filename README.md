# Kafka Engineering Hub

> Interactive learning, field notes, configuration diagnostics, an in-browser
> simulator, and operational workbench tools for engineers working with Apache Kafka.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Open source. MIT licensed. Built with Next.js, Fumadocs, and Tailwind.
Local-first — no live cluster connections, no accounts, no external services
required.

## Product surfaces

| Surface | What it does | Count |
| --- | --- | --- |
| **Learn** (`/learn`) | Long-form MDX articles with embedded interactive React components. | 16 articles, RSS |
| **Field Notes** (`/notes`) | Dated, release-aware engineering logs and protocol experiments with primary-source caveats. | 4 notes, separate RSS |
| **Diagnose** (`/diagnose`) | Paste broker, topic, or client config. Static rule engine flags footguns; optional LLM augmentation. Fix Composer merges patches; exports JSON and corrected `.properties`. | 37 rules (8 categories) |
| **Simulate** (`/simulate`) | Deterministic in-browser Kafka: brokers, partitions, ISR, consumer groups with eager/cooperative/KIP-848 rebalance across three independent axes (protocol, behavior, assignor). | 10 scenarios, embed |
| **Protocol Lab** (`/protocol`) | Curated, deterministic Kafka wire-protocol walkthroughs — Produce, consumer group rebalancing (classic vs. KIP-848), Share Groups (KIP-932), transactions, and replication/failover. Sequence (actor lanes) and Wire (decoded frames) modes. | 5 labs |
| **Runbooks** (`/runbooks`) | Incident playbooks for common operational emergencies. | 10 runbooks |
| **Errors** (`/errors`) | Searchable catalog of Kafka exception classes with root causes and fixes. | 20 exceptions |
| **KIPs** (`/kips`) | Index of the most-relevant Kafka Improvement Proposals. | 28 KIPs |
| **Workbench** (`/workbench`) | Interactive triage and analysis tools. Paste evidence or model parameters; get structured results. Exports Markdown and JSON. | 7 tools |

### Protocol Lab labs

| Lab | Path | Focus |
| --- | --- | --- |
| Produce Record | `/protocol/produce-record` | ApiVersions → Metadata → Produce; acks 0/1/all, idempotence, injected leader move, NOT_LEADER_OR_FOLLOWER recovery |
| Consumer Group | `/protocol/consumer-group` | Classic FindCoordinator → JoinGroup → SyncGroup → Heartbeat (eager + cooperative-sticky) vs. KIP-848 ConsumerGroupHeartbeat |
| Share Groups | `/protocol/share-groups` | KIP-932 ShareGroupHeartbeat → ShareFetch → ShareAcknowledge; accept/release/reject, lock expiry, redelivery, poison records |
| Transactions | `/protocol/transactions` | InitProducerId, transactional produce, offset participation, EndTxn, producer fencing, external side-effect caveat |
| Replication & Failover | `/protocol/replication-failover` | Follower Fetch, LEO/HW, ISR, leader epoch, clean vs. unclean leader election, stale-replica truncation |

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
| `pnpm start` | Prepare public/static assets and serve `.next/standalone/server.js` |
| `pnpm check:production-env` | Validate production canonical URL, optional LLM pairing, and proxy-trust configuration |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint with persistent cache |
| `pnpm test` | Full unit test suite (root + all workspace packages) |
| `pnpm test:coverage` | Per-domain coverage thresholds via Node 22 `--experimental-test-coverage` |
| `pnpm test:browser` | Playwright browser smoke tests (Chromium, 57 tests). Uses production build + start locally via Playwright config. Install with `corepack pnpm exec playwright install chromium`. |

Last verified on 2026-07-26: 114 root unit-test cases, 90 simulator
node:test cases, 20 content-wave browser cases (Field Notes, five new Learn
labs, three scenarios, and six runbooks), and 57 Chromium browser cases total.

CI runs all of the above plus a CLI tarball smoke test on every push/PR via
[`.github/workflows/ci.yml`](.github/workflows/ci.yml).

### Dependency audit policy

PR/main CI reports **high and critical production advisories** visibly but
does not block on the changing external advisory database. The separate
[scheduled/manual security audit](.github/workflows/security-audit.yml)
installs the frozen lockfile and hard-fails on high or critical production
advisories. Run `corepack pnpm audit --prod` locally for the full production
report.

## Production deployment

Production targets are Vercel and the included non-root Node 22
[`Dockerfile`](Dockerfile). Validate the build environment first:

```bash
NEXT_PUBLIC_SITE_URL=https://example.com pnpm check:production-env
```

The dynamic, non-cacheable health endpoint is `GET`/`HEAD`
[`/api/health`](app/api/health/route.ts). Security headers deny framing on
normal routes while preserving the intentional `/simulate/embed/*` contract.
The optional Anthropic action requires both an API key and an explicit model;
the rest of the site has no paid-service dependency.

See [`docs/production.md`](docs/production.md) for Vercel, Docker, standalone,
environment, health, rollback, incident, CSP/embed, privacy, rate-limit, and
operational guidance. Vulnerabilities should be reported privately under
[`SECURITY.md`](SECURITY.md).

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
  notes/                   # Fumadocs Field Notes surface
  diagnose/                # paste-only config diagnostics + Fix Composer
  simulate/                # deterministic broker simulator
    embed/[scenario]/      # chromeless iframe-embeddable scenario pages
  protocol/                # curated Kafka wire-protocol walkthroughs
    [slug]/                # 5 static labs (produce-record, consumer-group, ...)
  workbench/               # 7 interactive triage tools
  errors/                  # searchable Kafka exception catalog
  kips/                    # KIP index
  runbooks/                # incident playbooks (Fumadocs MDX)
  api/
    search/route.ts        # Fumadocs search endpoint
    diagnose/llm/route.ts  # optional LLM augmentation (Anthropic, env-gated)
    health/route.ts        # dynamic no-store process/config health
  rss.xml/route.ts         # RSS feed for /learn articles
  notes/rss.xml/route.ts   # RSS feed for Field Notes
content/
  learn/                   # 16 MDX articles + index/meta.json
  notes/                   # 4 Field Notes + meta.json
  runbooks/                # 10 MDX runbooks + meta.json
components/
  site-shell.tsx           # global nav, mobile menu, footer, skip link
  ui/                      # button, card, badge (minimal shadcn-style set)
  demos/                   # interactive demo components used by MDX
  workbench/               # shared Workbench UI primitives
  protocol/                # shared Protocol Lab player (Sequence + Wire modes)
lib/
  site.ts                  # site metadata
  source.ts                # Learn, Field Notes, and Runbook source loaders
  workbench-registry.ts    # authoritative Workbench tool registry
  protocol-lab/            # authoritative Protocol Lab registry + deterministic lab data
  errors-data.ts           # 20 Kafka exception entries
  kips-data.ts             # 28 KIP entries
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

- Returns a graceful fallback when `ANTHROPIC_API_KEY` is unset. When a key is
  present, an explicit `ANTHROPIC_MODEL` is required; partial configuration
  returns a sanitized unavailable response.
- The client applies `prepareForLlm()` before sending and the server applies
  the same common-pattern redaction again. The resulting config text is sent,
  not a parsed key/value object. This reduces accidental disclosure but cannot
  guarantee detection of unconventional secrets; review input before using
  the LLM action.
- No other endpoint makes external network calls.
- Bounded in-process rate limiting (10 req/min per trusted IP, or a conservative
  global fallback) and a model/schema-aware SHA-256 LRU cache. Both are
  per-instance; use optional platform WAF rules and provider spend caps for
  multi-instance public deployments.
- Every LLM response is non-cacheable and carries an `X-Request-Id`; provider
  logs contain only safe event categories.

## Environment variables

See [`.env.example`](.env.example). No variables are required for local
development; production requires an explicit canonical origin.

| Variable | Enables | Required |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Build-time canonical origin for metadata/sitemap/RSS | Production |
| `ANTHROPIC_API_KEY` | LLM suggestions in Diagnose | No; requires model when set |
| `ANTHROPIC_MODEL` | Explicit Anthropic model | When API key is set |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Anonymous Plausible page views | No |
| `TRUST_PROXY_HEADERS` | Trust proxy-supplied client addresses for per-IP limiting | No; Vercel auto-detected |
| `GIT_SHA` | Optional commit identifier in health output | No |

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

The KRaft Transition Planner, every Protocol Lab walkthrough, and the
time-sensitive Field Notes/runbook content are reviewed against **Apache Kafka
4.3.1** (released 2026-06-25; content wave reviewed 2026-07-26). This is
time-bounded — future Kafka releases may introduce changes not yet modeled.

## License

[MIT](LICENSE) © Jose David Baena.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
