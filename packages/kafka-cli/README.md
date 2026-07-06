# @kafka-hub/kafka-cli

Command-line companion for [kafka-hub](https://kafka-hub.dev). Lint Kafka
`.properties` files locally with the same 36+ rules used at
`kafka-hub.dev/diagnose`. No network calls. No live cluster connection.

> **Status:** workspace-ready, but not published to npm yet.

## Run from this repository

```bash
pnpm install
pnpm --filter @kafka-hub/kafka-cli build
node packages/kafka-cli/bin/kafka-hub.mjs --help
```

The built package is a self-contained JavaScript bundle with zero runtime
dependencies. It does not install `tsx` or require the Diagnose workspace
package at runtime. Inside this workspace, the bin shim falls back to the
TypeScript source when `dist/` has not been built yet.

## Usage

```bash
kafka-hub diagnose ./server.properties
kafka-hub diagnose ./client.properties --min warning
cat broker.props | kafka-hub diagnose - --json | jq '.findings[] | select(.severity == "danger")'
```

### Flags

| Flag | Purpose |
| ---- | ------- |
| `--json`              | Print the full JSON report (CI-friendly). |
| `--min <severity>`    | Filter: `info` / `warning` / `danger`. Default `info`. |
| `-` (positional)      | Read input from stdin. |
| `--help`, `-h`        | Show help. |
| `--version`, `-v`     | Show CLI version. |

### Exit codes

| Code | Meaning |
| ---- | ------- |
| 0    | No `danger` findings (CI green). |
| 1    | At least one `danger` finding (CI red). |
| 2    | Bad usage (missing file, invalid flag). |
| 127  | Incomplete install: neither the built entry nor workspace source tooling is available. |

## What it checks

Every rule available in the kafka-hub Diagnose surface:

- **broker** — unclean leader election, auto-create topics, default replication factor, ...
- **topic** — min.insync.replicas vs replication.factor, retention vs segment.bytes, ...
- **producer** — `acks=all` durability, idempotence, batch/linger trade-offs, ...
- **consumer** — `enable.auto.commit` semantics, session/heartbeat ratio, ...
- **transactions** — `transactional.id` stability, `isolation.level=read_committed`, ...
- **security** — `PLAINTEXT` listeners in prod, SASL+SSL ordering, ...
- **performance** — compression codec, thread pool sizing, ...

For the full list and rationale per rule, see the
[Diagnose docs](https://kafka-hub.dev/diagnose).

## Use in GitHub Actions from this repository

Fail a CI build when any `danger` finding is reported against your committed
Kafka configs. The CLI exits with code 1 when the report contains a
`danger`-class issue, so no extra parsing is needed.

```yaml
# .github/workflows/kafka-config-lint.yml
name: kafka-config-lint

on:
  pull_request:
    paths:
      - 'kafka/**/*.properties'
      - '.github/workflows/kafka-config-lint.yml'
  push:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: pnpm/action-setup@v4
        with:
          version: 11.13.0
      - name: Install and build the CLI
        run: |
          pnpm install --frozen-lockfile
          pnpm --filter @kafka-hub/kafka-cli build
      - name: Lint every Kafka config
        run: |
          set -e
          for f in kafka/**/*.properties; do
            echo "::group::$f"
            node packages/kafka-cli/bin/kafka-hub.mjs diagnose "$f" --min warning
            echo "::endgroup::"
          done
```

Want the full machine-readable report stored as a build artifact?

```yaml
      - name: Diagnose (JSON report)
        run: node packages/kafka-cli/bin/kafka-hub.mjs diagnose kafka/prod/server.properties --json > report.json
      - uses: actions/upload-artifact@v4
        with:
          name: kafka-diagnose-report
          path: report.json
```

The same pattern works for any CI provider that respects POSIX exit codes
(GitLab CI, CircleCI, Buildkite, Jenkins, ...).

## License

MIT
