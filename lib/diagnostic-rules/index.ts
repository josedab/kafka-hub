/**
 * Backwards-compat barrel. The diagnostic engine was extracted to its own
 * workspace package — `@kafka-hub/kafka-diagnose` — so it can be reused by
 * the CLI and published independently.
 */

export * from "@kafka-hub/kafka-diagnose";
