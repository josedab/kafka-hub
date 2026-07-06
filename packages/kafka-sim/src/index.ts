/**
 * @kafka-hub/kafka-sim
 *
 * A deterministic, framework-free in-browser/Node simulator for Apache Kafka
 * cluster mechanics: brokers, partitions, ISR, consumer groups, network
 * partitions, and a small scenario script DSL.
 *
 * Pure functions, no async, no timers, no DOM. Safe to run in a Web Worker,
 * in Node, in tests, or in the main browser thread.
 */

export * from "./engine";
export * from "./runner";
export * from "./scenarios";
