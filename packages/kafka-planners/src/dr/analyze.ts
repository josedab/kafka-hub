/**
 * DR Tabletop Planner — analysis engine.
 *
 * Deterministic, framework-free, runtime-safe.
 * Accepts unknown input, validates, and returns structured DR estimates.
 *
 * ─── RPO Model (Recovery-Point Exposure) ─────────────────────────────────
 *
 * RPO estimates decompose into two distinct components:
 *
 *   1. Replicated data loss (replicationLag):
 *      Records produced on the source but not yet replicated to the
 *      target. These records are genuinely lost if the source is
 *      unrecoverable.
 *
 *   2. Checkpoint/offset uncertainty (checkpointInterval):
 *      The replication tool periodically writes consumer offset
 *      checkpoints. Between checkpoints, the recoverable consumer
 *      processing point is stale. The replicated Kafka records may
 *      exist on the target, but consumers restarting from the last
 *      checkpoint will replay from an older position, requiring
 *      replay/reconciliation — not additional data loss.
 *
 *   RPO best  = replicationLag
 *     Only the replicated-data-loss component. Checkpoint is fresh.
 *
 *   RPO likely = replicationLag + checkpointInterval / 2
 *     Replicated data loss plus average checkpoint staleness.
 *     The checkpoint portion represents replay/reconciliation
 *     uncertainty, not additional record loss.
 *
 *   RPO worst = replicationLag + checkpointInterval
 *     Replicated data loss plus maximum checkpoint staleness.
 *     The checkpoint portion means consumers may need to replay
 *     or reconcile up to one full interval of already-replicated
 *     records.
 *
 * ─── RTO Model ──────────────────────────────────────────────────────────
 *
 * RTO (Recovery Time Objective) = total service downtime.
 * How long until clients can produce/consume normally.
 *
 * The RTO model assumes a serial failover path. Each step must complete
 * before the next begins. There is no implicit parallelism.
 *
 * Serial path: detect → promote → DNS propagation → client reconnect → validate
 *
 *   RTO best  = detection + promotion + max(dnsTtl, clientReconnect) + validation
 *     Assumption: DNS propagation and client reconnect overlap (parallel).
 *     This is the best case — in practice they may not fully overlap.
 *
 *   RTO likely = detection + promotion + dnsTtl + clientReconnect + validation
 *     Assumption: All steps are serial (no overlap). This is the most
 *     common operational reality.
 *
 *   RTO worst = detection + promotion + dnsTtl + clientReconnect + 2 × validation
 *     Assumption: One validation retry cycle. The first validation pass
 *     reveals an issue (e.g., consumer lag on target, stale data) and
 *     the validation step is repeated once. The factor is exactly 2×
 *     (one initial + one retry). No other steps are repeated.
 *
 * ─── Duplicate / Replay Exposure ────────────────────────────────────────
 *
 * Distinct from RPO (data loss). After failover, consumers restarting
 * from checkpointed offsets may replay messages already processed.
 * Worst case = checkpointInterval (a full interval of duplicates).
 *
 * ─── Safety ─────────────────────────────────────────────────────────────
 *
 * This tool does NOT execute commands, automate failover, or claim
 * vendor control-plane behavior.
 */

import type {
  DrTabletopInput,
  DrTabletopResult,
  DrAnalysisResult,
  DrRpoEstimates,
  DrRtoEstimates,
  DrScenarioEstimate,
  DrFormulaComponent,
  DrDuplicateExposure,
  DrWarning,
  DrReadinessStatus,
  DrReplicationStrategy,
  DrAnalysisAssumptions,
} from "./types";
import { validateUnknownInput, validateDrInput } from "./validate";
import {
  buildChecklists,
  buildObservability,
  buildStrategyNotes,
  RESOURCE_LINKS,
} from "./recommendations";

export { RESOURCE_LINKS } from "./recommendations";

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Analyze DR tabletop scenario from unknown input.
 * Never throws. Returns a discriminated union.
 */
export function analyzeDr(input: unknown): DrAnalysisResult {
  // Structural validation
  const structural = validateUnknownInput(input);
  if (!structural.ok) {
    return { ok: false, issues: structural.issues };
  }

  // Semantic validation
  const semanticIssues = validateDrInput(structural.input);
  if (semanticIssues.length > 0) {
    return { ok: false, issues: semanticIssues };
  }

  // Analysis
  const result = computeResult(structural.input);
  return { ok: true, result };
}

// ─── Core Computation ───────────────────────────────────────────────────────

function computeResult(input: DrTabletopInput): DrTabletopResult {
  const strategy: DrReplicationStrategy = input.strategy ?? "generic";
  const warnings = computeWarnings(input, strategy);
  const rpo = computeRpo(input);
  const rto = computeRto(input);
  const duplicateExposure = computeDuplicateExposure(input);
  const checklists = buildChecklists(strategy);
  const observability = buildObservability();
  const strategyNotes = buildStrategyNotes(strategy);
  const status = computeStatus(warnings, duplicateExposure);

  const assumptions: DrAnalysisAssumptions = {
    replicationLagSeconds: input.replicationLagSeconds,
    checkpointIntervalSeconds: input.checkpointIntervalSeconds,
    incidentDetectionSeconds: input.incidentDetectionSeconds,
    promotionSeconds: input.promotionSeconds,
    dnsTtlSeconds: input.dnsTtlSeconds,
    clientReconnectSeconds: input.clientReconnectSeconds,
    validationSeconds: input.validationSeconds,
    duplicateToleranceSeconds: input.duplicateToleranceSeconds,
    strategy,
  };

  return {
    rpo,
    rto,
    duplicateExposure,
    warnings,
    status,
    checklists,
    observability,
    strategyNotes,
    resourceLinks: RESOURCE_LINKS,
    assumptions,
  };
}

// ─── RPO ────────────────────────────────────────────────────────────────────

function computeRpo(input: DrTabletopInput): DrRpoEstimates {
  const lag = input.replicationLagSeconds;
  const cp = input.checkpointIntervalSeconds;

  const best: DrScenarioEstimate = {
    seconds: lag,
    formula: "replicationLag",
    components: [
      comp("replicationLag", lag, "Replicated data loss: records produced but not yet replicated to the target"),
    ],
    assumptions: [
      "Source fails at the exact moment of last successful replication.",
      "Checkpoint is fresh — no additional replay/reconciliation uncertainty.",
      "Only the replicated-data-loss component applies.",
    ],
  };

  const likely: DrScenarioEstimate = {
    seconds: lag + cp / 2,
    formula: "replicationLag + checkpointInterval / 2",
    components: [
      comp("replicationLag", lag, "Replicated data loss: records produced but not yet replicated to the target"),
      comp("checkpointInterval / 2", cp / 2, "Checkpoint/offset uncertainty: average staleness of consumer offset translation — records may exist on target but consumers replay from an older checkpoint position"),
    ],
    assumptions: [
      "The last checkpoint was written, on average, half a checkpoint interval ago.",
      "The checkpoint portion is replay/reconciliation uncertainty, not additional record loss. Records may already exist on the target.",
    ],
  };

  const worst: DrScenarioEstimate = {
    seconds: lag + cp,
    formula: "replicationLag + checkpointInterval",
    components: [
      comp("replicationLag", lag, "Replicated data loss: records produced but not yet replicated to the target"),
      comp("checkpointInterval", cp, "Checkpoint/offset uncertainty: maximum staleness of consumer offset translation — consumers may need to replay or reconcile up to one full interval of already-replicated records"),
    ],
    assumptions: [
      "The last checkpoint was written just before the previous interval boundary.",
      "The checkpoint portion represents replay/reconciliation uncertainty: records may exist on the target cluster, but consumers restarting from the stale checkpoint will process from an older position. This may require replay or reconciliation, even when the underlying records are not lost.",
    ],
  };

  return { best, likely, worst };
}

// ─── RTO ────────────────────────────────────────────────────────────────────

function computeRto(input: DrTabletopInput): DrRtoEstimates {
  const det = input.incidentDetectionSeconds;
  const pro = input.promotionSeconds;
  const dns = input.dnsTtlSeconds;
  const cli = input.clientReconnectSeconds;
  const val = input.validationSeconds;

  // Best: DNS and client reconnect overlap (parallel)
  const bestParallel = Math.max(dns, cli);
  const bestSeconds = det + pro + bestParallel + val;

  const best: DrScenarioEstimate = {
    seconds: bestSeconds,
    formula: "detection + promotion + max(dnsTtl, clientReconnect) + validation",
    components: [
      comp("detection", det, "Time from incident to detection/declaration"),
      comp("promotion", pro, "Time to promote target cluster to primary"),
      comp("max(dnsTtl, clientReconnect)", bestParallel, "DNS propagation and client reconnect overlap (parallel)"),
      comp("validation", val, "Post-promotion health and correctness validation"),
    ],
    assumptions: [
      "DNS propagation and client reconnect happen in parallel (overlap).",
      "No validation retries needed.",
      "Each step begins immediately after the previous completes.",
    ],
  };

  // Likely: all serial, no overlap
  const likelySeconds = det + pro + dns + cli + val;

  const likely: DrScenarioEstimate = {
    seconds: likelySeconds,
    formula: "detection + promotion + dnsTtl + clientReconnect + validation",
    components: [
      comp("detection", det, "Time from incident to detection/declaration"),
      comp("promotion", pro, "Time to promote target cluster to primary"),
      comp("dnsTtl", dns, "DNS TTL propagation delay"),
      comp("clientReconnect", cli, "Client discovery and reconnection time"),
      comp("validation", val, "Post-promotion health and correctness validation"),
    ],
    assumptions: [
      "All steps are serial — no overlap between DNS and client reconnect.",
      "No validation retries needed.",
    ],
  };

  // Worst: serial + one validation retry (2× validation)
  const worstSeconds = det + pro + dns + cli + 2 * val;

  const worst: DrScenarioEstimate = {
    seconds: worstSeconds,
    formula: "detection + promotion + dnsTtl + clientReconnect + 2 × validation",
    components: [
      comp("detection", det, "Time from incident to detection/declaration"),
      comp("promotion", pro, "Time to promote target cluster to primary"),
      comp("dnsTtl", dns, "DNS TTL propagation delay"),
      comp("clientReconnect", cli, "Client discovery and reconnection time"),
      comp("2 × validation", 2 * val, "Validation with one retry cycle: initial pass reveals an issue, validation is repeated once"),
    ],
    assumptions: [
      "All steps are serial — no overlap.",
      "One validation retry cycle: the first validation pass reveals an issue (e.g., consumer lag on target, stale data) and the validation step is repeated once.",
      "The retry factor is exactly 2× (one initial + one retry). No other steps are repeated.",
    ],
  };

  return { best, likely, worst };
}

// ─── Duplicate Exposure ─────────────────────────────────────────────────────

function computeDuplicateExposure(input: DrTabletopInput): DrDuplicateExposure {
  const worstCaseReplaySeconds = input.checkpointIntervalSeconds;
  const toleranceSeconds = input.duplicateToleranceSeconds;
  const exceedsTolerance = worstCaseReplaySeconds > toleranceSeconds;

  let explanation: string;
  if (exceedsTolerance) {
    explanation =
      `Worst-case duplicate/replay exposure (${worstCaseReplaySeconds}s) exceeds the configured tolerance (${toleranceSeconds}s). ` +
      `After failover, consumers restarting from checkpointed offsets may replay up to ${worstCaseReplaySeconds}s of messages. ` +
      `This is distinct from data loss (RPO). Consider reducing the checkpoint interval or increasing duplicate tolerance.`;
  } else {
    explanation =
      `Worst-case duplicate/replay exposure (${worstCaseReplaySeconds}s) is within the configured tolerance (${toleranceSeconds}s). ` +
      `After failover, consumers restarting from checkpointed offsets may replay up to ${worstCaseReplaySeconds}s of messages, ` +
      `which is within acceptable bounds. This is distinct from data loss (RPO).`;
  }

  return { worstCaseReplaySeconds, toleranceSeconds, exceedsTolerance, explanation };
}

// ─── Warnings ───────────────────────────────────────────────────────────────

function computeWarnings(
  input: DrTabletopInput,
  strategy: DrReplicationStrategy,
): DrWarning[] {
  const warnings: DrWarning[] = [];

  // ── User-supplied tolerance comparison (the only "critical" warning) ──
  if (input.checkpointIntervalSeconds > input.duplicateToleranceSeconds) {
    warnings.push({
      id: "duplicate-exceeds-tolerance",
      message:
        `Worst-case checkpoint/replay exposure (${input.checkpointIntervalSeconds}s) exceeds your configured duplicate tolerance (${input.duplicateToleranceSeconds}s). ` +
        `Consumers may replay more duplicates than acceptable after failover.`,
      severity: "critical",
    });
  }

  // ── Relational observations (info only — never change readiness status) ──
  // These compare input components against each other using transparent
  // formulas. No universal fixed thresholds.

  // Checkpoint uncertainty vs replication lag
  if (input.checkpointIntervalSeconds > input.replicationLagSeconds && input.replicationLagSeconds > 0) {
    const ratio = input.checkpointIntervalSeconds / input.replicationLagSeconds;
    warnings.push({
      id: "checkpoint-dominates-lag",
      message:
        `Checkpoint uncertainty (${input.checkpointIntervalSeconds}s) is ${ratio.toFixed(1)}× the replication lag (${input.replicationLagSeconds}s). ` +
        `In the worst-case RPO estimate, checkpoint/offset staleness (replay uncertainty) dominates the replicated data-loss component.`,
      severity: "info",
    });
  }

  // Detection is the largest RTO component
  const rtoComponents = [
    { name: "detection", value: input.incidentDetectionSeconds },
    { name: "promotion", value: input.promotionSeconds },
    { name: "dnsTtl", value: input.dnsTtlSeconds },
    { name: "clientReconnect", value: input.clientReconnectSeconds },
    { name: "validation", value: input.validationSeconds },
  ];
  const rtoTotal = rtoComponents.reduce((sum, c) => sum + c.value, 0);
  const largestRto = rtoComponents.reduce((a, b) => (b.value > a.value ? b : a));
  if (rtoTotal > 0 && largestRto.value > 0) {
    const pct = ((largestRto.value / rtoTotal) * 100).toFixed(0);
    warnings.push({
      id: "largest-rto-component",
      message:
        `${largestRto.name} (${largestRto.value}s) is the largest RTO component, representing ${pct}% of the likely-case serial path (${rtoTotal}s total before validation adjustments).`,
      severity: "info",
    });
  }

  // DNS TTL dominates the redirect window
  if (input.dnsTtlSeconds > 0 && input.dnsTtlSeconds > input.clientReconnectSeconds) {
    warnings.push({
      id: "dns-dominates-redirect",
      message:
        `DNS TTL (${input.dnsTtlSeconds}s) exceeds client reconnect time (${input.clientReconnectSeconds}s). ` +
        `In the likely-case RTO, DNS propagation is the bottleneck of the redirect window.`,
      severity: "info",
    });
  } else if (input.clientReconnectSeconds > 0 && input.clientReconnectSeconds > input.dnsTtlSeconds) {
    warnings.push({
      id: "client-dominates-redirect",
      message:
        `Client reconnect time (${input.clientReconnectSeconds}s) exceeds DNS TTL (${input.dnsTtlSeconds}s). ` +
        `In the likely-case RTO, client reconnection is the bottleneck of the redirect window.`,
      severity: "info",
    });
  }

  // ── Strategy-specific notes (info only) ──
  if (strategy === "msk-replicator") {
    warnings.push({
      id: "msk-replicator-managed",
      message:
        "MSK Replicator is a managed service. Promotion and failback steps may differ from self-managed replication. Consult AWS documentation for your specific configuration.",
      severity: "info",
    });
  }

  return warnings;
}

// ─── Status ─────────────────────────────────────────────────────────────────

function computeStatus(
  warnings: readonly DrWarning[],
  duplicateExposure: DrDuplicateExposure,
): DrReadinessStatus {
  // Status is determined only by user-supplied tolerance comparisons.
  // Info-level relational observations never change readiness status.
  if (
    duplicateExposure.exceedsTolerance ||
    warnings.some((w) => w.severity === "critical")
  ) {
    return "at-risk";
  }
  // "warning" severity is reserved for user-supplied comparisons only.
  // Relational observations use "info" and do not trigger "concerns".
  if (warnings.some((w) => w.severity === "warning")) {
    return "concerns";
  }
  return "ready";
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function comp(
  name: string,
  valueSeconds: number,
  description: string,
): DrFormulaComponent {
  return { name, valueSeconds, description };
}
