# @kafka-hub/kafka-cli

Command-line companion for [Kafka Engineering Hub](https://kafka-hub.dev).
Lint Kafka `.properties` files locally with the same 37 rules used at
`/diagnose`. No network calls. No live cluster connection.

> **Status:** workspace-ready. npm publication is pending.

## Run from this repository

```bash
pnpm install
pnpm --filter @kafka-hub/kafka-cli build
node packages/kafka-cli/bin/kafka-hub.mjs --help
```

The built package is a self-contained JavaScript bundle with zero runtime
dependencies. `tsx` is development-only.

## Usage

```bash
kafka-hub diagnose ./server.properties
kafka-hub diagnose ./client.properties --min warning
cat broker.props | kafka-hub diagnose - --json | jq '.findings[]'
```

### Flags

| Flag | Purpose |
| ---- | ------- |
| `--json` | Print the full JSON report (CI-friendly). |
| `--min <severity>` | Filter: `info` / `warning` / `danger`. Default `info`. |
| `-` (positional) | Read input from stdin. |
| `--help`, `-h` | Show help. |
| `--version`, `-v` | Show CLI version (from package.json manifest). |

### Exit codes

| Code | Meaning |
| ---- | ------- |
| 0 | No `danger` findings (CI green). |
| 1 | At least one `danger` finding (CI red). |
| 2 | Bad usage (missing file, invalid flag). |

## What it checks

All 37 rules from the `@kafka-hub/kafka-diagnose` engine across 8 categories:
validation, broker, topic, producer, consumer, security, transactions,
performance.

The version displayed by `--version` is derived from the package manifest;
the rule count is derived from the engine's rule array at runtime.

Findings include Learn article links (relative paths, e.g. `/learn/<slug>`)
and summary counts.

## Use in GitHub Actions

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - uses: pnpm/action-setup@v4
        with: { version: 11.17.0 }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @kafka-hub/kafka-cli build
      - name: Lint Kafka configs
        run: |
          for f in kafka/**/*.properties; do
            node packages/kafka-cli/bin/kafka-hub.mjs diagnose "$f" --min warning
          done
```

## Tests

```bash
pnpm test    # 10 node:test cases
```

## License

MIT
