/**
 * Backwards-compat barrel. The simulator engine was extracted to its own
 * workspace package — `@kafka-hub/kafka-sim` — so it can be published
 * independently. App code may import from either path; the package path
 * is the canonical one going forward.
 */

export * from "@kafka-hub/kafka-sim";
