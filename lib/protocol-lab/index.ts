/**
 * @kafka-hub Protocol Lab
 *
 * Curated, deterministic walkthroughs of Kafka wire-protocol exchanges.
 * Pure data + pure builder functions — no React, no randomness, no timers.
 */
export * from "./types";
export * from "./registry";
export { produceRecordLab } from "./labs/produce-record";
export { consumerGroupLab } from "./labs/consumer-group";
export { shareGroupsLab } from "./labs/share-groups";
export { transactionsLab } from "./labs/transactions";
export { replicationFailoverLab } from "./labs/replication-failover";
