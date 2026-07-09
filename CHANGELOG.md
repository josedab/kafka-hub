# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased] - 0.2.0 UX & content expansion

### Added

- `/learn/glossary` with hover-card term references inline.
- `/runbooks` surface with 4 incident playbooks: consumer lag, broker restart, controller flapping, and transactional producer stuck.
- `/errors` searchable catalog of 20 Kafka exception classes.
- `/kips` index of the 25 most-relevant KIPs.
- 2 more Kafka-for-AI articles covering embedding backpressure and agent traces.
- Per-rule canonical pages at `/diagnose/rules/<id>` for all 36 rules.
- Per-article printable cheat sheets at `/learn/<slug>/cheatsheet`.
- `Cmd/Ctrl+K` site-wide search palette.
- In-article sticky table of contents and reading progress bar.
- Learning track footer with next/previous navigation and progress.
- Dark-mode toggle in the header.
- Drag-and-drop `.properties` files onto the Diagnose textarea.
- Keyboard shortcuts on Diagnose (`Cmd/Ctrl+Enter`) and Simulate (`Space`, `→`, `R`, `K`, `?`).
- Scenario script preview drawer in Simulate.
- Recent-runs history in Diagnose.
- "Reproduce in simulator" and "Copy fix" buttons on diagnostic findings.
- Inline `<DiagnoseSnippet />` MDX component.
- Optional Plausible analytics behind the `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` environment variable.
- Optional `simulateSlug` and `fix: { before, after }` fields on `DiagnosticFinding`.
- Optional `scenarios: string[]` article frontmatter.
- Hermetic unit and contract tests for local rate limiting, LLM caching/fallbacks,
  and the CLI.

### Changed

- Mobile layout for Simulate: broker grid stacks and the event log moves to a tab.
- Local development and CI now require no deployed services or build-time font
  download.
- The CLI package ships a self-contained JavaScript bundle with zero runtime
  dependencies; `tsx` is development-only.

## [0.1.1] - Polish pass

### Added

- `app/sitemap.ts`, `app/robots.ts`, and `app/opengraph-image.tsx` for SEO and social previews.
- Web Worker wired into the Simulate surface with sync fallback.
- `worker`/`sync` badge in the simulator controls.
- GitHub issue and PR templates.
- "Use in GitHub Actions" section in `packages/kafka-cli/README.md`.

## [0.1.0] - Initial release (PRD phases 0–4)

### Added

- Learn surface with 8 MDX articles, 8 custom interactive demos, RSS, and a homepage funnel.
- Diagnose surface with 36 categorized rules, optional LLM augmentation, share URL, and JSON download.
- Simulate surface with a deterministic in-browser engine, 4 scenarios, and an embeddable iframe route.
- `@kafka-hub/kafka-sim` package: extractable, no-framework simulator engine.
- `@kafka-hub/kafka-diagnose` package: rule engine reusable by web and CLI.
- `@kafka-hub/kafka-cli` package: local linter for `.properties` files, GitHub Actions ready.
- CI for typecheck, lint, tests, build, and CLI smoke coverage.
