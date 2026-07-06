# @kafka-hub/kafka-sim

A **deterministic, framework-free** in-browser / Node simulator for Apache
Kafka cluster mechanics. Built for teaching, demos, and tests — not for
running real workloads.

> Pure functions. No timers. No DOM. No network. Safe to run in a Web Worker,
> in Node, in a test runner, or in the browser main thread.

> **Status:** workspace-ready, but not published to npm yet.

## What it models

- Brokers (alive / dead), controller election
- Topics, partitions, replicas, ISR, high water mark
- Per-partition append-only logs with offsets
- Consumer groups (cooperative-sticky-ish assignment), per-member lag
- Network partitions (per-broker reachability)
- Log compaction (key-based, latest-wins)
- Acks semantics (`acks=all` honours ISR + `min.insync.replicas`)

## What it deliberately does NOT model

- The Kafka wire protocol — this is a teaching abstraction, not a server
- KRaft Raft consensus internals — controller is a single role
- Tiered storage, schema registry, connect, streams
- Exact timing — ticks are discrete

If you need a real broker, run Redpanda in a container. This is for building
intuition without one.

## Use from this repository

```bash
pnpm install
pnpm --filter @kafka-hub/kafka-sim test
```

## Usage

```ts
import {
  createCluster,
  addConsumerGroup,
  produce,
  step,
  totalLag,
  SCENARIOS,
  runOp,
} from "@kafka-hub/kafka-sim";

// 1) Build a cluster
let state = createCluster({
  brokerCount: 3,
  partitionCount: 3,
  topicName: "orders",
  replicationFactor: 3,
  minInsyncReplicas: 2,
  producerAcks: "all",
});

// 2) Attach a consumer group
state = addConsumerGroup(state, {
  id: "orders-svc",
  consumerIds: ["m1", "m2"],
  consumeRatePerTick: 5,
});

// 3) Produce some records
state = produce(state, 0, "abc", "v1").state;

// 4) Step the world forward
state = step(state);
console.log(totalLag(state));

// 5) Or run a packaged scenario
let s = createCluster(SCENARIOS["quorum-loss"].cluster);
for (const op of SCENARIOS["quorum-loss"].script) {
  s = runOp(s, op).state;
}
```

## API

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `createCluster(opts)` | fn | Build initial deterministic state |
| `addConsumerGroup(state, opts)` | fn | Attach a group + members |
| `produce(state, partition, key, value)` | fn | Append a record and return state + result |
| `step(state)` | fn | Advance one tick (followers fetch, consumers consume) |
| `killBroker(state, id)` / `reviveBroker(state, id)` | fn | Lifecycle |
| `inducePartition(state, groupA, groupB)` | fn | Split-brain the network |
| `healPartition(state)` | fn | Restore reachability |
| `shrinkIsrLag(state, brokerId, ms)` | fn | Push a follower out of ISR |
| `totalLag(state)` | fn | Sum lag across all consumer groups |
| `SCENARIOS` | const | `quorum-loss`, `slow-consumer`, `isr-shrink`, `network-partition` |
| `runOp(state, op)` | fn | Apply one `ScenarioOp` |

All functions are **pure** — they return new state, never mutate.

## License

MIT
