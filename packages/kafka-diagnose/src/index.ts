/**
 * @kafka-hub/kafka-diagnose
 *
 * Static rule engine for Kafka broker / topic / producer / consumer
 * configuration. Parses Java-style `.properties` text and runs deterministic
 * rules against the resulting key/value map.
 *
 * Pure functions, framework-free, runs in Node, the browser, or any V8.
 */

export * from "./engine";
export type { Rule, Severity, Category, DiagnosticFinding, DiagnosticReport } from "./types";
