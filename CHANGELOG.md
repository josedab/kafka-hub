# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Workbench** surface (`/workbench`) with 7 interactive triage/analysis tools:
  - Incident Triage — 10 Kafka failure signature matchers, confidence scoring, observability recs.
  - Consumer Lag Triage — lag classification, partition skew, drain ETA, capacity planning.
  - Capacity & N-1 Headroom Planner — storage/network/partition analysis with N-1 failure scenarios.
  - Listener Topology Wizard — validation for Docker, Kubernetes, NAT, and LAN topologies.
  - Message Size Chain Checker — 6-stage pipeline validation with actual-vs-aligned semantics, replication-risk/consumption-risk zones, and effective acceptance envelope alignment.
  - KRaft Transition Planner — 5-phase migration (`preflight-zookeeper`, `initial-metadata-load`, `hybrid-migration`, `dual-write-migration`, `finalized-kraft`), static/dynamic quorum modes, reviewed against Kafka 4.3.1 (2026-06-25). Minimum prerequisite 3.9.1; 3.9.2 advisory for KIP-1252.
  - DR Tabletop Planner — RPO/RTO estimation, duplicate exposure, 7-phase checklists.
- `@kafka-hub/incident-parser` workspace package: offline incident triage engine (10 signatures, 512 KiB / 10k line limits, binary rejection, `validateInput()` / `analyze()` returning `{ ok, analysis } | { ok, error }`, sanitized export).
- `@kafka-hub/kafka-planners` workspace package with 6 subpath exports (`lag`, `capacity`, `listeners`, `message-size`, `kraft`, `dr`). Each provides deterministic typed analysis, validation, and sanitized export.
- Three-axis consumer group model in `@kafka-hub/kafka-sim`: `groupProtocol`, `classicAssignmentBehavior`, and explicit `assignor` (classic: range/roundrobin/sticky/cooperative-sticky compatibility; consumer protocol: uniform). One-tick pending reconciliation. Deterministic consumer operations (join, leave, crash, restart, scale-out, rolling restart), structured `RebalanceEvent` tracking.
- Three rebalance scenarios: `rebalance-eager-classic`, `rebalance-cooperative-classic`, `rebalance-consumer-protocol`.
- `/simulate?scenario=...` deep-link support with URL-parameter synchronization.
- `/learn/glossary`, `/runbooks` (4 playbooks), `/errors` (20 exceptions, static route), `/kips` (25 KIPs, static route).
- 3 additional Learn articles (embedding backpressure, agent traces, glossary).
- Full-content search (`Cmd/Ctrl+K`) indexing article and runbook body text; dark mode toggle; learning track navigation.
- Fix Composer in Diagnose: merge structured fixes, lossless round-trip patches, corrected-properties download.
- Diagnose exports: JSON (redacted) and corrected `.properties` file. Workbench exports: Markdown and JSON.
- Diagnose rule category split into separate files (broker, topic, producer, consumer, security, transactions, performance).
- Workbench shared UI primitives: labeled fields, validation summary, result cards, export actions (Markdown/JSON copy and download).
- Playwright browser smoke tests (25 tests, Chromium): simulate deep links, search, mobile nav at 320/375/414 viewports, accessibility, diagnose, all 7 workbench tools.
- Per-domain native coverage thresholds via `scripts/test-coverage.mjs` (Node 22 `--experimental-test-coverage`).
- CI updated: pnpm 11.17.0, Node 22, frozen install, typecheck, lint, unit tests, coverage, production build, Playwright, audit, CLI smoke.
- Optional Plausible analytics behind `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`.
- `NEXT_PUBLIC_SITE_URL` for canonical origin (defaults to `https://kafka-hub.dev`).
- Canonical origin validation (`lib/canonical-origin.ts`).
- Accessible icon usage with `aria-hidden` on decorative icons; `aria-label` on interactive controls.
- Static Errors and KIPs routes with client-side filtering.

### Changed

- Diagnose rules split from monolithic `rules.ts` into per-category files with canonical metadata in `rule-metadata.ts`.
- Coverage script uses `**/*.test.ts` globs for reliable expansion and reports per-suite pass/fail.
- CI workflow uses pnpm 11.17.0 (matching `packageManager` field), adds coverage and browser gates.
- Mobile layout: broker grid stacks, event log in tab, 44px touch targets, accessible focus management.

## [0.1.1] - Polish pass

### Added

- `app/sitemap.ts`, `app/robots.ts`, `app/opengraph-image.tsx` for SEO.
- Web Worker wired into Simulate with sync fallback.
- GitHub issue and PR templates.

## [0.1.0] - Initial release (PRD phases 0–4)

### Added

- Learn surface with 8 MDX articles, 8 interactive demos, RSS, homepage funnel.
- Diagnose surface with 36 categorized rules, optional LLM augmentation, share URL, JSON download.
- Simulate surface with deterministic in-browser engine, 4 scenarios, embeddable iframe route.
- `@kafka-hub/kafka-sim` package: extractable simulator engine.
- `@kafka-hub/kafka-diagnose` package: rule engine for web and CLI.
- `@kafka-hub/kafka-cli` package: local `.properties` linter, CI-ready.
- CI: typecheck, lint, tests, build, CLI smoke.
