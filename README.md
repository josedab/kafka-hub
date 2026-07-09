# Kafka Engineering Hub

> Interactive learning, configuration diagnostics, and an in-browser simulator
> for engineers working with Apache Kafka.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Open source. MIT licensed. Built with Next.js, Fumadocs, and Tailwind.
Deployed on Vercel.

## What's in the box

Three surfaces under one roof, plus a Node CLI and an extractable simulator
package:

| Surface         | What it does                                                                                                                                                       | Status                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| `/learn`        | Long-form MDX articles with embedded interactive React components. The interactive piece is the wedge — static tutorials already exist.                            | **8 articles**, RSS   |
| `/diagnose`     | Paste broker, topic or client config. A static rule engine flags known footguns and links each finding back to a Learn article. Optional LLM augmentation.         | **36 rules**          |
| `/simulate`     | Deterministic in-browser Kafka teaching simulator: brokers, partitions, ISR, consumer groups, network partitions. Scenarios + embeddable iframe widget.            | **4 scenarios**, embed|
| `@kafka-hub/kafka-cli` | Node CLI that lints `.properties` files with the same rules as `/diagnose`. CI-friendly exit codes + JSON output.                                            | **workspace-ready**   |
| `@kafka-hub/kafka-sim` | Framework-free TypeScript engine powering `/simulate`. Pure functions, runs in browser, Node, or a Web Worker.                                                | **workspace-ready**   |
| `@kafka-hub/kafka-diagnose` | The rule engine, extracted as a workspace package so the CLI and the web app share one source of truth.                                                 | **workspace-ready**   |

The full vision lives in the PRD. This README documents what is actually
built.

## Local quickstart

Local development needs **Node.js 22+ and pnpm only**. It does not need a
Kafka broker, Docker, Redis, a database, an Anthropic key, or a browser test
runner.

```bash
corepack enable # only needed when pnpm is not already available
pnpm install
pnpm dev
# → http://localhost:3000
```

The repository pins pnpm through `packageManager`. Other package managers are
not supported because the workspace uses pnpm's `workspace:` protocol and
lockfile. After package installation, the default dev, test, lint, and build
paths do not depend on deployed services.

## Scripts

```bash
pnpm dev         # local dev server (next dev + fumadocs codegen)
pnpm build       # production build
pnpm start       # serve the production build
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint with a persistent local cache
pnpm test        # hermetic node:test suites for app utilities, API, and packages
pnpm test:unit   # root utility + optional LLM route contract tests
```

CI runs all of the above plus a built-CLI smoke test, with no service
containers or external credentials, on every push and PR via
[`.github/workflows/ci.yml`](.github/workflows/ci.yml).

The `postinstall`, `predev`, and `prebuild` hooks run the Fumadocs MDX
codegen (writes to `.source/`). If TypeScript can't find `@/.source`,
run `pnpm exec fumadocs-mdx` once and restart your TS server.

## Optional integrations

The default application is fully functional with no `.env.local` file.

| Variable | Enables | Required locally |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | LLM suggestions after the deterministic Diagnose pass | No |
| `ANTHROPIC_MODEL` | Anthropic model override | No |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Anonymous Plausible page views | No |

Anonymous page-view telemetry is off by default. To enable Plausible, set
`NEXT_PUBLIC_PLAUSIBLE_DOMAIN=your-domain.example` before building or
deploying. This only loads `https://plausible.io/js/script.js` with that
domain; Plausible does not use cookies, and the app does not send names,
emails, pasted configs, or other PII.

## Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript**
- **Tailwind CSS v4** with the Fumadocs `neutral` preset
- **Fumadocs** (`fumadocs-ui` + `fumadocs-core` + `fumadocs-mdx`) for the MDX
  content layer and docs IA
- **lucide-react** for icons (with an inline GitHub mark since the brand
  icon set was removed upstream)
- **pnpm**

## Repo layout

```
app/                       # Next.js App Router
  layout.tsx               # root layout (RootProvider, optional analytics)
  page.tsx                 # marketing homepage
  learn/
    layout.tsx             # Fumadocs DocsLayout
    [[...slug]]/page.tsx   # MDX renderer
  diagnose/                # paste-only config diagnostics
  simulate/                # deterministic broker simulator
    embed/[scenario]/      # chromeless iframe-embeddable scenario pages
  api/
    search/route.ts        # Fumadocs search endpoint
    diagnose/llm/route.ts  # optional LLM augmentation (Anthropic, env-gated)
  rss.xml/route.ts         # RSS feed for /learn articles
content/learn/             # 8 MDX articles + meta.json
components/
  site-shell.tsx           # global nav + footer
  ui/                      # button, card, badge (minimal shadcn-style set)
  demos/                   # 8 interactive demo components used by MDX
lib/
  site.ts                  # site metadata
  source.ts                # Fumadocs source loader
  rate-limit.ts            # in-process token bucket (LLM endpoint)
  lru-cache.ts             # SHA-256-keyed LRU for LLM responses
  diagnostic-rules/        # re-export of @kafka-hub/kafka-diagnose
  simulator-core/          # re-export of @kafka-hub/kafka-sim
workers/
  simulator-worker.ts      # extractable Web Worker harness (shipped, optional)
packages/
  kafka-sim/               # extracted simulator engine (publish-ready)
  kafka-diagnose/          # extracted rule engine (publish-ready)
  kafka-cli/               # Node CLI companion (`kafka-hub diagnose`)
source.config.ts           # Fumadocs MDX config
next.config.ts             # wraps NextConfig with Fumadocs createMDX
pnpm-workspace.yaml        # workspace root
```

## Workspace packages

This is a pnpm monorepo. The three internal packages are workspace-ready but
are not published to npm yet. The CLI tarball is exercised as an installed
package in CI; registry publication remains a manual step:

| Package | Purpose | Docs |
| ------- | ------- | ---- |
| [`@kafka-hub/kafka-sim`](packages/kafka-sim/README.md) | Deterministic simulator engine. Pure TS, no React. | README |
| [`@kafka-hub/kafka-diagnose`](packages/kafka-diagnose/README.md) | Static `.properties` rule engine. 36+ rules. | README |
| [`@kafka-hub/kafka-cli`](packages/kafka-cli/README.md) | `kafka-hub diagnose <file>` Node CLI. | README |

Run any of them via `pnpm --filter @kafka-hub/<name> <script>`.

## CLI quickstart

```bash
# from the repo root (workspace dev)
pnpm --filter @kafka-hub/kafka-cli diagnose ./server.properties

# direct shell invocation
node packages/kafka-cli/bin/kafka-hub.mjs diagnose ./server.properties --min warning
cat broker.properties | node packages/kafka-cli/bin/kafka-hub.mjs diagnose - --json | jq '.findings[]'
```

Exits **1** when there is at least one `danger`-severity finding, **0**
otherwise — drop it in CI to fail PRs that regress your Kafka config.

## Authoring an article

1. Drop a new file at `content/learn/<slug>.mdx`.
2. Frontmatter must include `title` and `description`.
3. Register the slug in `content/learn/meta.json` to control sidebar order.
4. Import any custom React components and register them in
   `app/learn/[[...slug]]/page.tsx` so MDX can use them.

Demo components belong in `components/demos/` and should be `"use client"`
and self-contained — no external state, no network.

## Adding a diagnostic rule

Rules live in `packages/kafka-diagnose/src/rules.ts` and follow the `Rule`
interface in `types.ts`. A rule receives the parsed key/value map and returns
one or more `DiagnosticFinding` objects, or `null` for "no issue". Pick a
`category` (broker / topic / producer / consumer / transactions / security /
performance) so the UI can group it. If your rule relates to a Learn article,
set `learnSlug` so both the web UI and the CLI deep-link the explainer.

After editing, run `pnpm typecheck && pnpm lint && pnpm build` to verify.

## LLM-augmented diagnostics

The `POST /api/diagnose/llm` endpoint sends the parsed config to Anthropic's
API for free-form recommendations beyond what static rules catch. The
endpoint is fully optional — it returns a graceful fallback when
`ANTHROPIC_API_KEY` is unset, so local dev and CI never depend on a real key.
Its contract tests inject an in-process fake model function and never make a
network request.

In-process token-bucket rate-limiting (10 req/min/IP) and SHA-256-keyed LRU
caching are wired in `lib/rate-limit.ts` + `lib/lru-cache.ts`. These controls
are per process, which keeps local development dependency-free. A
multi-instance production deployment should add a shared quota backend or a
provider-side spend limit; it is not required for local work or the test
suite.

## Hard constraints (v1)

- **No live cluster connections.** Diagnose is paste-only. Simulate runs
  entirely in the browser. The CLI reads from files / stdin only. This is by
  design.
- **No accounts.** Sharing happens via base64-url-encoded URL hashes — the
  server never sees a shared config. PRD §11 documents auth as deferred.
- **No telemetry beyond anonymous page views.** Ephemeral state lives in URL
  params or localStorage.
- **All content version-controlled.** No CMS.

## Roadmap

Phased per the PRD — all four phases shipped in v0.1:

- **Phase 0** — scaffold, one article with embedded demo, deploy. ✅
- **Phase 1** — design system, **8 articles**, RSS, homepage funnel. ✅
- **Phase 2** — Diagnose with **36 rules**, LLM augmentation,
  shareable URLs, in-process rate limiting + caching. ✅
- **Phase 3** — full Simulate: deterministic engine with consumer groups,
  network partitions, 4 packaged scenarios, **embeddable widgets** linked
  from articles via `<iframe>`. ✅
- **Phase 4** — Node CLI companion and extractable workspace packages
  (`@kafka-hub/kafka-sim`, `@kafka-hub/kafka-diagnose`,
  `@kafka-hub/kafka-cli`), URL-based shareable sessions. npm publication is
  pending. ✅

## License

[MIT](LICENSE) © Jose David Baena.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
