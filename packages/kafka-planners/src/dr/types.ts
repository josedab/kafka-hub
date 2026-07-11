/**
 * Types for the DR Tabletop Planner.
 *
 * Framework-free. All types are pure data — no classes, no side effects.
 * Designed for deterministic analysis of Kafka disaster-recovery scenarios.
 *
 * All duration fields are in seconds (canonical unit).
 * The planner does NOT execute commands, automate failover, or claim
 * control-plane behavior of any vendor or replication tool.
 */

// ─── Replication Strategy ───────────────────────────────────────────────────

/**
 * Neutral replication strategy selector.
 * Used ONLY for strategy-specific notes — never for automated behavior.
 * The planner does not claim to know or control any vendor control-plane.
 */
export type DrReplicationStrategy =
  | "generic"
  | "mirror-maker-2"
  | "msk-replicator";

/** Valid strategy strings for runtime validation. */
export const DR_REPLICATION_STRATEGIES: readonly DrReplicationStrategy[] = [
  "generic",
  "mirror-maker-2",
  "msk-replicator",
] as const;

// ─── Input Types ────────────────────────────────────────────────────────────

/**
 * Complete input to the DR tabletop planner.
 * All duration fields are in seconds.
 */
export interface DrTabletopInput {
  /**
   * Observed replication lag between source and target cluster (seconds).
   * Must be finite and non-negative. Zero means replication is caught up.
   */
  readonly replicationLagSeconds: number;

  /**
   * Checkpoint interval — how often the replication tool writes consumer
   * offset checkpoints/translation state (seconds).
   * Must be finite and positive (> 0).
   * For MirrorMaker 2: emit.checkpoints.interval.seconds (default 60).
   * For MSK Replicator: the checkpoint interval configuration.
   */
  readonly checkpointIntervalSeconds: number;

  /**
   * Time from incident occurrence to detection/declaration (seconds).
   * Must be finite and non-negative.
   */
  readonly incidentDetectionSeconds: number;

  /**
   * Time to promote the target cluster to primary (seconds).
   * Includes any manual or automated promotion steps.
   * Must be finite and non-negative.
   */
  readonly promotionSeconds: number;

  /**
   * DNS TTL — time for DNS changes to propagate (seconds).
   * Must be finite and non-negative.
   */
  readonly dnsTtlSeconds: number;

  /**
   * Client reconnect time — how long for clients to discover and
   * connect to the new cluster after DNS/endpoint change (seconds).
   * Must be finite and non-negative.
   */
  readonly clientReconnectSeconds: number;

  /**
   * Validation time — time to verify the target cluster is healthy
   * and serving correctly after promotion (seconds).
   * Must be finite and positive (> 0).
   */
  readonly validationSeconds: number;

  /**
   * Maximum tolerable duplicate/replay exposure in seconds.
   * Used to compare against worst-case checkpoint-based replay window.
   * Must be finite and non-negative.
   */
  readonly duplicateToleranceSeconds: number;

  /**
   * Optional replication strategy selector.
   * Affects ONLY strategy-specific notes — never automated behavior.
   * Default: "generic".
   */
  readonly strategy?: DrReplicationStrategy;
}

// ─── Validation ─────────────────────────────────────────────────────────────

/** Categories of validation issues. */
export type DrValidationIssueKind =
  | "invalid-root"
  | "invalid-field-type"
  | "non-finite-value"
  | "negative-value"
  | "non-positive-value"
  | "invalid-strategy"
  | "unsafe-number";

/** A single validation issue. */
export interface DrValidationIssue {
  readonly kind: DrValidationIssueKind;
  readonly field: string;
  readonly message: string;
}

// ─── Scenario Estimates ─────────────────────────────────────────────────────

/**
 * A single scenario estimate (best, likely, or worst).
 * Includes the computed value, formula, and assumptions.
 */
export interface DrScenarioEstimate {
  /** Computed value in seconds. */
  readonly seconds: number;
  /** Human-readable formula showing how the value was derived. */
  readonly formula: string;
  /** Named components that went into the formula. */
  readonly components: readonly DrFormulaComponent[];
  /** Assumptions that apply to this specific scenario. */
  readonly assumptions: readonly string[];
}

/** A named component in a formula. */
export interface DrFormulaComponent {
  readonly name: string;
  readonly valueSeconds: number;
  readonly description: string;
}

/** RPO estimates across best/likely/worst scenarios. */
export interface DrRpoEstimates {
  readonly best: DrScenarioEstimate;
  readonly likely: DrScenarioEstimate;
  readonly worst: DrScenarioEstimate;
}

/** RTO estimates across best/likely/worst scenarios. */
export interface DrRtoEstimates {
  readonly best: DrScenarioEstimate;
  readonly likely: DrScenarioEstimate;
  readonly worst: DrScenarioEstimate;
}

// ─── Duplicate / Replay Exposure ────────────────────────────────────────────

/**
 * Duplicate/replay exposure analysis.
 * Distinct from data-loss exposure (RPO).
 */
export interface DrDuplicateExposure {
  /** Worst-case replay window in seconds (based on checkpoint interval). */
  readonly worstCaseReplaySeconds: number;
  /** User-provided duplicate tolerance in seconds. */
  readonly toleranceSeconds: number;
  /** Whether worst-case replay exceeds tolerance. */
  readonly exceedsTolerance: boolean;
  /** Explanation of the exposure. */
  readonly explanation: string;
}

// ─── DR Phase Checklists ────────────────────────────────────────────────────

/**
 * The seven ordered DR tabletop phases.
 * Each checklist is verification/coordination actions only — no commands.
 */
export type DrPhaseId =
  | "declare"
  | "freeze"
  | "verify"
  | "promote"
  | "redirect"
  | "validate"
  | "failback";

/** Valid phase IDs for runtime checks. */
export const DR_PHASE_IDS: readonly DrPhaseId[] = [
  "declare",
  "freeze",
  "verify",
  "promote",
  "redirect",
  "validate",
  "failback",
] as const;

/** A single checklist item within a DR phase. */
export interface DrChecklistItem {
  /** Stable item identifier. */
  readonly id: string;
  /** Verification/coordination action text. No commands. */
  readonly text: string;
  /** Who owns this decision/action. */
  readonly owner: string;
  /** Category of this item. */
  readonly category: DrChecklistCategory;
}

/** Checklist item categories. */
export type DrChecklistCategory =
  | "decision"
  | "evidence"
  | "source-freeze"
  | "target-health"
  | "checkpoint-state"
  | "data-validation"
  | "acl-config-parity"
  | "client-redirect"
  | "business-validation"
  | "monitoring"
  | "rollback"
  | "reconciliation";

/** A complete phase with its checklist. */
export interface DrPhaseChecklist {
  /** Phase identifier. */
  readonly phase: DrPhaseId;
  /** Human-readable phase label. */
  readonly label: string;
  /** Phase order (1-7). */
  readonly order: number;
  /** Checklist items for this phase. */
  readonly items: readonly DrChecklistItem[];
}

// ─── Observability Recommendations ──────────────────────────────────────────

/** An observability recommendation for DR readiness. */
export interface DrObservabilityRecommendation {
  /** Metric or signal name. */
  readonly metric: string;
  /** What it measures, including units and context. */
  readonly description: string;
  /** Why this metric matters for DR. */
  readonly rationale: string;
  /** Explicit "do not alert on this alone" guidance. */
  readonly caveat: string;
}

// ─── Warnings ───────────────────────────────────────────────────────────────

/** A warning generated during analysis. */
export interface DrWarning {
  readonly id: string;
  readonly message: string;
  readonly severity: "critical" | "warning" | "info";
}

// ─── Strategy Notes ─────────────────────────────────────────────────────────

/** Strategy-specific notes (MM2, MSK Replicator, or generic). */
export interface DrStrategyNotes {
  readonly strategy: DrReplicationStrategy;
  readonly label: string;
  readonly notes: readonly string[];
}

// ─── Resource Links ─────────────────────────────────────────────────────────

/** A cross-link to a related resource. */
export interface DrResourceLink {
  readonly label: string;
  readonly href: string;
  readonly surface: "learn" | "runbooks" | "errors" | "simulate" | "diagnose" | "workbench" | "external";
}

// ─── Overall Readiness ──────────────────────────────────────────────────────

/**
 * Overall DR readiness status.
 * - "ready": No critical warnings, estimates within tolerance.
 * - "concerns": Warnings present but no critical issues.
 * - "at-risk": Critical warnings or estimates exceed tolerance.
 */
export type DrReadinessStatus = "ready" | "concerns" | "at-risk";

// ─── Complete Result ────────────────────────────────────────────────────────

/** Explicit assumptions the planner used. */
export interface DrAnalysisAssumptions {
  readonly replicationLagSeconds: number;
  readonly checkpointIntervalSeconds: number;
  readonly incidentDetectionSeconds: number;
  readonly promotionSeconds: number;
  readonly dnsTtlSeconds: number;
  readonly clientReconnectSeconds: number;
  readonly validationSeconds: number;
  readonly duplicateToleranceSeconds: number;
  readonly strategy: DrReplicationStrategy;
}

/** Complete DR tabletop analysis result. */
export interface DrTabletopResult {
  /** RPO estimates (data-loss exposure). */
  readonly rpo: DrRpoEstimates;
  /** RTO estimates (downtime). */
  readonly rto: DrRtoEstimates;
  /** Duplicate/replay exposure analysis. */
  readonly duplicateExposure: DrDuplicateExposure;
  /** Warnings generated during analysis. */
  readonly warnings: readonly DrWarning[];
  /** Overall readiness status. */
  readonly status: DrReadinessStatus;
  /** Phase checklists (7 phases in order). */
  readonly checklists: readonly DrPhaseChecklist[];
  /** Observability recommendations. */
  readonly observability: readonly DrObservabilityRecommendation[];
  /** Strategy-specific notes. */
  readonly strategyNotes: DrStrategyNotes;
  /** Related resource links. */
  readonly resourceLinks: readonly DrResourceLink[];
  /** Explicit assumptions for transparency. */
  readonly assumptions: DrAnalysisAssumptions;
}

// ─── Discriminated Result Union ─────────────────────────────────────────────

/** Successful analysis or validation failure. */
export type DrAnalysisResult =
  | { readonly ok: true; readonly result: DrTabletopResult }
  | { readonly ok: false; readonly issues: readonly DrValidationIssue[] };
