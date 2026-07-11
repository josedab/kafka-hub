# @kafka-hub/kafka-planners

Focused planning and triage engines for Apache Kafka operational scenarios.
Each subpath export covers one domain. Framework-free, deterministic,
browser/Node compatible.

## Subpath exports

| Subpath | Tool | Key outputs |
| --- | --- | --- |
| `@kafka-hub/kafka-planners/lag` | Consumer Lag Triage | Lag classification (7 conditions), partition skew (CV), drain ETA, throughput, capacity planning |
| `@kafka-hub/kafka-planners/capacity` | Capacity & N-1 Headroom | Storage/network breakdown, partition analysis, average/N-1 broker load, headroom status |
| `@kafka-hub/kafka-planners/listeners` | Listener Topology Wizard | Topology diagnostics, broker/client config snippets, 4-step connection flow |
| `@kafka-hub/kafka-planners/message-size` | Message Size Chain Checker | 6-stage pipeline evaluation, actual vs. aligned semantics, risk zones, `.properties` patch |
| `@kafka-hub/kafka-planners/kraft` | KRaft Transition Planner | 5-phase migration, rollback boundaries, preflight checklist, version analysis |
| `@kafka-hub/kafka-planners/dr` | DR Tabletop Planner | RPO/RTO estimation (best/likely/worst), duplicate exposure, 7-phase checklists |

## Usage

```ts
import { analyzeLag } from "@kafka-hub/kafka-planners/lag";
import { analyzeCapacity } from "@kafka-hub/kafka-planners/capacity";
import { analyzeListeners } from "@kafka-hub/kafka-planners/listeners";
import { analyzeMessageSize } from "@kafka-hub/kafka-planners/message-size";
import { analyzeKRaft } from "@kafka-hub/kafka-planners/kraft";
import { analyzeDr } from "@kafka-hub/kafka-planners/dr";
```

## Common design

All planners share these properties:

- **Deterministic** — same input always produces same output
- **Typed validation** — no NaN/Infinity fallbacks, clear error messages
- **Best-effort sanitized export** — Markdown/JSON/checklist use
  `@kafka-hub/kafka-diagnose` common-pattern redaction and require review
- **Observability recommendations** — units, rationale, "do not alert on this alone" guidance
- **No universal thresholds** — recommendations explain what to monitor, not magic numbers

## KRaft Planner

Reviewed against **Apache Kafka 4.3.1** (released 2026-06-25, reviewed
2026-07-25). Models five ordered migration phases:

1. `preflight-zookeeper` — cluster on ZooKeeper; preflight checks, upgrade to ≥ 3.9.1
2. `initial-metadata-load` — KRaft controllers provisioned, load metadata from ZK
3. `hybrid-migration` — brokers progressively reconfigured to KRaft controller
4. `dual-write-migration` — all brokers KRaft, controller still writes ZooKeeper
5. `finalized-kraft` — irreversible; ZooKeeper metadata writes stop

Rollback supported before finalization only.

### Version baseline

- **Minimum prerequisite:** Kafka 3.9.1 for ZooKeeper-to-KRaft migration
- **Recommended:** Kafka 3.9.2 (advisory, includes KIP-1252 compatibility fix)
- **KRaft-only:** Kafka 4.x (ZooKeeper removed)

### Controller quorum modes

- **Static:** `controller.quorum.voters` with explicit `node-ID@host:port`
- **Dynamic:** `controller.quorum.bootstrap.servers` (host:port only, KIP-853, 3.9+)

Dynamic quorum is selected at format time when static voters are absent.
Runtime conversion from static to dynamic is not currently supported.

## Message Size Planner

6-stage pipeline evaluation separating the modeled batch exceeding a configured
limit from **headroom/alignment gaps** (configuration envelopes are misaligned
but the current batch fits). Kafka fetch progress exceptions may still return
an oversized first batch; the planner labels downstream states as risks rather
than claiming replication or consumption is impossible.

### Risk zones

| Zone | Meaning |
| --- | --- |
| `all-clear` | All stages pass, aligned targets fit |
| `replication-risk` | Batch exceeds the configured follower fetch envelope; progress exceptions may still permit fragile progress |
| `consumption-risk` | Batch exceeds a consumer fetch envelope; progress exceptions may still permit fragile progress |
| `rejected` | Batch exceeds a producer or effective broker/topic acceptance gate |

Alignment gaps identify stages where the downstream effective acceptance
envelope is narrower than expected, even when the current batch passes.

## DR Planner

Accepts replication timing parameters and optional strategy selector
(generic, mirror-maker-2, msk-replicator). Computes:

- **RPO** — best (replicationLag), likely (+checkpointInterval/2), worst (+checkpointInterval)
- **RTO** — serial path with parallel DNS/client optimization
- **Duplicate exposure** — distinct from RPO, with tolerance comparison
- **7 DR phases** — declare, freeze, verify, promote, redirect, validate, failback

## Tests

```bash
pnpm test    # 790 node:test cases
```

## License

MIT
