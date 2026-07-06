# @kafka-hub/kafka-diagnose

Static, deterministic rule engine for Kafka broker / topic / producer /
consumer `.properties` configuration. 36+ built-in rules covering the
footguns that show up in production incidents.

> No live cluster connection. No network. Parses text in, emits findings out.

> **Status:** workspace-ready, but not published to npm yet.

## Categories

- `broker` — `unclean.leader.election.enable`, `auto.create.topics.enable`, ...
- `topic` — `min.insync.replicas` vs `replication.factor`, segment sizing, ...
- `producer` — `acks=all` durability, idempotence, batch size & linger, ...
- `consumer` — `enable.auto.commit` correctness, session/heartbeat tuning, ...
- `transactions` — transactional.id stability, isolation level, ...
- `security` — `PLAINTEXT` listeners, SASL+SSL ordering, ...
- `performance` — compression, `num.network.threads`, ...

Each finding has a severity (`danger` / `warning` / `info`), a title,
plain-language detail, and an optional URL back to a Learn article.

## Use from this repository

```bash
pnpm install
pnpm --filter @kafka-hub/kafka-diagnose test
```

## Usage

```ts
import { evaluate } from "@kafka-hub/kafka-diagnose";

const report = evaluate(`
  acks=1
  enable.idempotence=false
  retries=0
`);

console.log(report.stats); // { danger: N, warning: M, info: K }
for (const f of report.findings) {
  console.log(`[${f.severity}] ${f.title}`);
}
```

## API

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `parseProperties(text)` | fn | `.properties` → `Record<string, string>` |
| `evaluate(text, ruleset?)` | fn | Run all rules → `DiagnosticReport` |
| `rules` | const | The built-in ruleset |
| `Rule`, `Severity`, `Category`, `DiagnosticFinding`, `DiagnosticReport` | types | TS types |

## License

MIT
