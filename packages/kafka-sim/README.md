# @kafka-hub/kafka-sim

Deterministic, framework-free in-browser/Node simulator for Apache Kafka
cluster mechanics. Pure TypeScript, no React dependency.

## Features

- **Deterministic engine** — same operations always produce same state
- **Three independent axes for consumer group modeling:**
  - `groupProtocol: "classic" | "consumer"` — protocol selection
  - `classicAssignmentBehavior: "eager" | "cooperative"` — classic only
  - `assignor` — explicit partition assignment strategy:
    - Classic eager: `range` (default), `roundrobin`, `sticky`,
      with incompatible cooperative assignors normalized to `range`
    - Classic cooperative: `cooperative-sticky` (required/default);
      eager-only assignors are normalized to `cooperative-sticky`
    - Consumer protocol (KIP-848): `uniform` (always, server-side)
- **One-tick pending reconciliation** — partition moves complete within a
  single tick; no multi-tick pending state
- **Cluster operations** — `produce`, `killBroker`, `reviveBroker`, `step`,
  `shrinkIsrLag`, `inducePartition`, `healPartition`
- **Consumer operations** — consumerJoin, consumerLeave, consumerCrash,
  consumerRestart, consumerScaleOut, consumerRollingRestartStep
- **7 scenarios** — quorum-loss, slow-consumer, isr-shrink, network-partition,
  rebalance-eager-classic, rebalance-cooperative-classic, rebalance-consumer-protocol
- **Structured events** — `RebalanceEvent` with protocol axes, epochs, partition
  moves, duplicate-risk level, reconciliation state, assignor
- **Embeddable** — runs in browser, Node, or Web Worker

### KIP-848 note

The KIP-848 consumer protocol is NOT "cooperative" in the classic sense.
It uses broker-coordinated incremental reconciliation with group/member
epochs. The incremental partition handoff is a protocol behavior, not
the classic cooperative assignor.

## Usage

```ts
import { createCluster, runOp, SCENARIOS, SCENARIO_LIST } from "@kafka-hub/kafka-sim";

const scenario = SCENARIOS["rebalance-consumer-protocol"];
let state = createCluster(scenario.cluster);

for (const op of scenario.script) {
  const { state: next, ticksConsumed } = runOp(state, op);
  state = next;
  console.log(`consumed ${ticksConsumed} tick(s)`);
}
```

## API

### `createCluster(options: ClusterOptions): ClusterState`

Create initial cluster state with brokers, partitions, and ISR. Add consumer
groups explicitly with `addConsumerGroup()`.

### `runOp(state: ClusterState, op: ScenarioOp): { state, ticksConsumed }`

Apply one operation and return the new state plus the number of ticks
consumed by the operation.

### `SCENARIOS` / `SCENARIO_LIST`

Object map and ordered list of all 7 built-in scenarios.

## Invariants

The engine maintains these invariants across all operations:
- Partition ownership uniqueness (no duplicate assignments)
- Epoch monotonicity (group/member epochs never decrease)
- Determinism (same input → same output)
- Committed offset preservation across consumer lifecycle

## Tests

```bash
pnpm test    # 87 node:test cases
```

## License

MIT
