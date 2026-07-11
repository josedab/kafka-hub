/**
 * Types for the KRaft Transition and Kafka 4.x Readiness Planner.
 *
 * Framework-free. All types are pure data — no classes, no side effects.
 * Designed for deterministic analysis of ZooKeeper-to-KRaft migration
 * readiness and Kafka 4.x upgrade planning.
 *
 * ─── Core Safety Statement ──────────────────────────────────────────────
 *
 * ZooKeeper-to-KRaft migration must complete on a supported Kafka 3.x
 * release before upgrading to 4.x. Kafka 4.x is KRaft-only.
 * Finalization is irreversible — there is no rollback to ZooKeeper after
 * finalization.
 *
 * This tool is a deterministic planning aid. It does NOT execute commands,
 * change any cluster, or automatically finalize any migration.
 *
 * ─── Migration Phase Model (Official Apache Kafka) ──────────────────────
 *
 * The migration from ZooKeeper to KRaft follows five ordered phases
 * per the official Kafka 3.9 migration documentation:
 *
 *   1. preflight-zookeeper       — Initial ZooKeeper. Cluster runs ZK.
 *   2. initial-metadata-load     — KRaft controllers load metadata from ZK.
 *   3. hybrid-migration          — Some brokers ZK, KRaft controller active.
 *   4. dual-write-migration      — All brokers KRaft, controller still
 *                                  writes ZooKeeper. Last rollback boundary.
 *   5. finalized-kraft           — KRaft finalized. No more ZK writes.
 *
 * Rollback is supported before finalization but is not risk-free.
 * The official 3.9 docs note a controller-epoch caveat when reverting
 * during migration. Finalization (phase 5) has NO ZooKeeper rollback path.
 *
 * ─── Controller Quorum Modes ────────────────────────────────────────────
 *
 * Kafka 3.9+ supports two controller quorum modes (KIP-853):
 *   - Static: controller.quorum.voters with explicit node-ID@host:port
 *   - Dynamic: controller.quorum.bootstrap.servers (host:port only)
 *
 * Dynamic quorum is selected at format time when static voters are absent.
 * Runtime conversion from static to dynamic is not currently supported.
 *
 * ─── Version Baseline ───────────────────────────────────────────────────
 *
 * Reviewed release baseline: Kafka 4.3.1 (released 2026-06-25).
 * Review date: 2026-07-25.
 * This is a time-bounded review, not a timeless latest-version claim.
 *
 * Sources:
 *   - Kafka 3.9 KRaft/migration docs: https://kafka.apache.org/39/operations/kraft/
 *   - Kafka 4.0 upgrade docs: https://kafka.apache.org/40/getting-started/upgrade/
 *   - Kafka 4.3 upgrade docs: https://kafka.apache.org/43/getting-started/upgrade/
 *   - Kafka 4.3.1 release notes: https://downloads.apache.org/kafka/4.3.1/RELEASE_NOTES.html
 *   - Apache downloads: https://kafka.apache.org/community/downloads/
 */

// ─── Migration Phases ───────────────────────────────────────────────────────

/**
 * The five official migration phase IDs.
 * Ordered from ZooKeeper-only to finalized KRaft.
 */
export type KRaftMigrationPhaseId =
  | "preflight-zookeeper"
  | "initial-metadata-load"
  | "hybrid-migration"
  | "dual-write-migration"
  | "finalized-kraft";

/** Description of a migration phase. */
export interface KRaftMigrationPhase {
  /** Stable phase identifier. */
  readonly id: KRaftMigrationPhaseId;
  /** Human-readable phase label. */
  readonly label: string;
  /** Phase number (1-5). */
  readonly order: number;
  /** Short description. */
  readonly description: string;
  /** Whether rollback to ZooKeeper is supported from this phase. */
  readonly rollbackSupported: boolean;
  /** Rollback difficulty note. */
  readonly rollbackNote: string;
}

/** All five migration phases in order. */
export const KRAFT_MIGRATION_PHASES: readonly KRaftMigrationPhase[] = [
  {
    id: "preflight-zookeeper",
    order: 1,
    label: "Initial ZooKeeper",
    description:
      "Cluster runs on ZooKeeper. Perform preflight checks: backup metadata, validate broker configs, confirm controller quorum readiness, verify ACLs, and check log directory health. Upgrade brokers to at least 3.9.1 and set inter.broker.protocol.version to 3.9 before proceeding.",
    rollbackSupported: true,
    rollbackNote: "No migration started. Standard ZooKeeper operations.",
  },
  {
    id: "initial-metadata-load",
    order: 2,
    label: "Initial Metadata Load",
    description:
      "KRaft controllers are provisioned and load metadata from ZooKeeper. Controllers sync the metadata log from ZK and begin serving the KRaft quorum while ZooKeeper remains the source of truth.",
    rollbackSupported: true,
    rollbackNote:
      "Remove KRaft controllers and revert broker configs. The official 3.9 docs note a controller-epoch caveat: reverting during migration requires care to avoid epoch conflicts. Operationally straightforward but not risk-free.",
  },
  {
    id: "hybrid-migration",
    order: 3,
    label: "Hybrid Migration",
    description:
      "Some brokers still talk to ZooKeeper while the KRaft controller is active. Brokers are progressively reconfigured to use the KRaft controller as their metadata source.",
    rollbackSupported: true,
    rollbackNote:
      "Revert broker migration configs and remove KRaft controllers. Increasingly costly: the controller-epoch caveat from the 3.9 docs applies, and in-flight metadata changes may require reconciliation. Rollback is supported but not risk-free.",
  },
  {
    id: "dual-write-migration",
    order: 4,
    label: "Dual-Write Migration",
    description:
      "All brokers are now using KRaft as their metadata source, but the controller continues writing metadata to ZooKeeper for rollback safety. This is the last rollback boundary before finalization.",
    rollbackSupported: true,
    rollbackNote:
      "Technically possible but operationally expensive. The controller-epoch caveat applies. Requires reverting all broker and controller configs. This is the LAST rollback opportunity. Strongly recommended to either finalize or roll back rather than remain in this state indefinitely.",
  },
  {
    id: "finalized-kraft",
    order: 5,
    label: "Finalized KRaft",
    description:
      "KRaft migration finalized. Kafka no longer writes metadata to ZooKeeper. The cluster is fully KRaft-only. This step is IRREVERSIBLE.",
    rollbackSupported: false,
    rollbackNote:
      "NO rollback to ZooKeeper is possible after finalization. This is permanent and irreversible. Ensure all validations pass before finalizing.",
  },
] as const;

// ─── Controller Quorum Mode ────────────────────────────────────────────────

/**
 * Controller quorum mode.
 * - "static": uses controller.quorum.voters (node-ID@host:port entries)
 * - "dynamic": uses controller.quorum.bootstrap.servers (host:port entries,
 *   no voter IDs). Supported in Kafka 3.9+ via KIP-853.
 */
export type KRaftQuorumMode = "static" | "dynamic";

// ─── Input Types ────────────────────────────────────────────────────────────

/** Metadata mode for the cluster. */
export type KRaftMetadataMode = "zookeeper" | "migration" | "kraft";

/** Vendor/distribution identifier. */
export type KRaftVendor = "apache" | "confluent" | "aws-msk" | "other";

/** ACL health status. */
export type KRaftAclHealth = "healthy" | "malformed" | "unknown" | "not-used";

/** Log directory health status. */
export type KRaftLogDirHealth = "healthy" | "failed" | "unknown";

/** A static quorum voter entry: controller node ID, host, and port. */
export interface KRaftQuorumVoter {
  readonly nodeId: number;
  readonly host: string;
  readonly port: number;
}

/** A dynamic quorum bootstrap server entry: host and port only. */
export interface KRaftBootstrapServer {
  readonly host: string;
  readonly port: number;
}

/** Complete input to the KRaft transition planner. */
export interface KRaftPlannerInput {
  /**
   * Current Kafka version string (semver-like, e.g. "3.9.1", "4.0.0").
   * Must be a non-empty string parseable as a version.
   */
  readonly kafkaVersion: string;

  /** Current metadata mode. */
  readonly metadataMode: KRaftMetadataMode;

  /** Vendor/distribution. */
  readonly vendor: KRaftVendor;

  /** Optional display label for vendor. Callers must not put credentials here. */
  readonly vendorLabel?: string;

  /** Number of KRaft controller nodes. Must be a positive integer. */
  readonly controllerCount: number;

  /** Controller node IDs. */
  readonly controllerNodeIds: readonly number[];

  /** Broker node IDs. */
  readonly brokerNodeIds: readonly number[];

  /** Controller listener name(s). */
  readonly controllerListenerNames: readonly string[];

  /**
   * Controller quorum mode.
   * - "static": controller.quorum.voters with node-ID@host:port
   * - "dynamic": controller.quorum.bootstrap.servers (KIP-853, 3.9+)
   */
  readonly quorumMode: KRaftQuorumMode;

  /**
   * Static quorum voter entries (used when quorumMode is "static").
   * Each entry has nodeId, host, and port.
   */
  readonly quorumVoters: readonly KRaftQuorumVoter[];

  /**
   * Dynamic quorum bootstrap server entries (used when quorumMode is "dynamic").
   * Each entry has host and port only — no voter IDs.
   */
  readonly bootstrapServers: readonly KRaftBootstrapServer[];

  /** Whether inter-broker protocol configuration is present. */
  readonly interBrokerConfigPresent: boolean;

  /** Whether controller-specific configuration is present. */
  readonly controllerConfigPresent: boolean;

  /** ACL usage and health. */
  readonly aclHealth: KRaftAclHealth;

  /** Log directory health. */
  readonly logDirHealth: KRaftLogDirHealth;

  /** Number of failed log directories (0 if healthy). */
  readonly failedLogDirCount: number;

  /** Current migration phase. */
  readonly migrationPhase: KRaftMigrationPhaseId;

  /** Whether this is a production cluster (affects controller count warnings). */
  readonly production: boolean;
}

// ─── Validation ─────────────────────────────────────────────────────────────

/** Categories of KRaft validation issues. */
export type KRaftValidationIssueKind =
  | "invalid-root"
  | "invalid-field-type"
  | "invalid-field-value"
  | "non-finite-value"
  | "non-positive-value"
  | "non-integer-value"
  | "non-negative-value"
  | "invalid-version"
  | "version-too-old"
  | "version-4x-zookeeper"
  | "version-4x-migration"
  | "invalid-metadata-mode"
  | "invalid-vendor"
  | "invalid-phase"
  | "invalid-quorum-mode"
  | "phase-mode-mismatch"
  | "invalid-acl-health"
  | "invalid-log-dir-health"
  | "controller-count-mismatch"
  | "controller-count-even"
  | "controller-count-single-prod"
  | "controller-count-insufficient"
  | "duplicate-node-ids"
  | "duplicate-quorum-voters"
  | "quorum-voter-controller-mismatch"
  | "invalid-quorum-voter"
  | "invalid-bootstrap-server"
  | "missing-bootstrap-servers"
  | "invalid-listener-name"
  | "missing-controller-listener"
  | "empty-string"
  | "unsafe-label"
  | "migration-version-insufficient";

/** A single KRaft validation issue. */
export interface KRaftValidationIssue {
  readonly kind: KRaftValidationIssueKind;
  readonly field: string;
  readonly message: string;
  readonly severity: "error" | "warning";
}

// ─── Parsed Version ─────────────────────────────────────────────────────────

/** Parsed Kafka version. */
export interface ParsedKafkaVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly preRelease: string | null;
  readonly raw: string;
}

// ─── Analysis Results ───────────────────────────────────────────────────────

/** Overall readiness status. */
export type KRaftReadinessStatus =
  | "ready"
  | "warnings"
  | "blocked";

/** Severity of a finding. */
export type KRaftFindingSeverity = "blocker" | "warning" | "info";

/** A single analysis finding (blocker, warning, or info). */
export interface KRaftFinding {
  readonly id: string;
  readonly severity: KRaftFindingSeverity;
  readonly message: string;
  readonly detail?: string;
}

/** Phase navigation information. */
export interface KRaftPhaseNavigation {
  readonly currentPhase: KRaftMigrationPhase;
  readonly nextPhase: KRaftMigrationPhase | null;
  readonly rollbackSupported: boolean;
  readonly rollbackNote: string;
}

/** A preflight checklist item. */
export interface KRaftChecklistItem {
  /** Stable item identifier. */
  readonly id: string;
  /** Human-readable checklist text. Must be verification-only, not an executable command. */
  readonly text: string;
  /** Whether this item is satisfied based on current input. */
  readonly satisfied: boolean;
  /** Detail/rationale for the status. */
  readonly detail: string;
  /** Category for grouping. */
  readonly category: KRaftChecklistCategory;
}

/** Checklist item categories. */
export type KRaftChecklistCategory =
  | "backup"
  | "vendor"
  | "controllers"
  | "node-ids"
  | "listeners"
  | "quorum"
  | "acl"
  | "log-dirs"
  | "version"
  | "monitoring"
  | "rollback"
  | "finalization";

/** Observability recommendation. */
export interface KRaftObservabilityRecommendation {
  /** Metric or signal name. */
  readonly metric: string;
  /** What it measures, including units and context. */
  readonly description: string;
  /** Why this metric matters for KRaft migration. */
  readonly rationale: string;
  /** When this signal is NOT sufficient alone — workload-specific guidance. */
  readonly caveat: string;
}

/** A cross-link to a related Kafka Hub resource. */
export interface KRaftResourceLink {
  readonly label: string;
  readonly href: string;
  readonly surface: "learn" | "runbooks" | "errors" | "simulate" | "diagnose" | "workbench" | "external";
}

/** Source citation. */
export interface KRaftSourceCitation {
  /** Short label. */
  readonly label: string;
  /** URL. */
  readonly url: string;
  /** Scope of what the source covers. */
  readonly scope: string;
}

/** Version baseline metadata. */
export interface KRaftVersionBaseline {
  /** The reviewed Kafka release version. */
  readonly reviewedRelease: string;
  /** Release date of the reviewed release. */
  readonly releaseDate: string;
  /** Date the review was conducted. */
  readonly reviewDate: string;
  /** Caveat about the review being time-bounded. */
  readonly caveat: string;
}

/** Assumptions explicitly stated in the result. */
export interface KRaftAnalysisAssumptions {
  readonly kafkaVersion: string;
  readonly parsedVersion: ParsedKafkaVersion;
  readonly metadataMode: KRaftMetadataMode;
  readonly vendor: KRaftVendor;
  readonly vendorLabel: string;
  readonly controllerCount: number;
  readonly controllerNodeIds: readonly number[];
  readonly brokerNodeIds: readonly number[];
  readonly controllerListenerNames: readonly string[];
  readonly quorumMode: KRaftQuorumMode;
  readonly quorumVoters: readonly KRaftQuorumVoter[];
  readonly bootstrapServers: readonly KRaftBootstrapServer[];
  readonly interBrokerConfigPresent: boolean;
  readonly controllerConfigPresent: boolean;
  readonly aclHealth: KRaftAclHealth;
  readonly logDirHealth: KRaftLogDirHealth;
  readonly failedLogDirCount: number;
  readonly migrationPhase: KRaftMigrationPhaseId;
  readonly production: boolean;
}

/** Complete KRaft analysis result. */
export interface KRaftAnalysisResult {
  /** Overall readiness status. */
  readonly status: KRaftReadinessStatus;
  /** All findings: blockers, warnings, and informational notes. */
  readonly findings: readonly KRaftFinding[];
  /** Phase navigation. */
  readonly phaseNavigation: KRaftPhaseNavigation;
  /** Preflight checklist. */
  readonly checklist: readonly KRaftChecklistItem[];
  /** Observability recommendations. */
  readonly observability: readonly KRaftObservabilityRecommendation[];
  /** Related resource links. */
  readonly resourceLinks: readonly KRaftResourceLink[];
  /** Source citations. */
  readonly sources: readonly KRaftSourceCitation[];
  /** Version baseline metadata. */
  readonly versionBaseline: KRaftVersionBaseline;
  /** Explicit assumptions. */
  readonly assumptions: KRaftAnalysisAssumptions;
}

// ─── Discriminated Result Union ─────────────────────────────────────────────

/** Successful analysis or validation failure. */
export type KRaftPlannerResult =
  | { readonly ok: true; readonly result: KRaftAnalysisResult }
  | { readonly ok: false; readonly issues: readonly KRaftValidationIssue[] };
