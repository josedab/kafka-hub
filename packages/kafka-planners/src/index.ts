/**
 * @kafka-hub/kafka-planners
 *
 * Focused planning/triage engines for Apache Kafka operational scenarios.
 * Each subpath export covers one scenario. Import the specific planner:
 *
 *   import { analyzeLag } from "@kafka-hub/kafka-planners/lag";
 *
 * This root entry exposes only shared version metadata.
 * Framework-free. No network, no accounts, no cluster connection.
 */

/** Package version for reproducibility tracking. */
export const PLANNERS_VERSION = "0.1.0" as const;
