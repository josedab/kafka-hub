import {
  KRAFT_MIGRATION_PHASES as PHASES,
  type KRaftChecklistCategory,
  type KRaftChecklistItem,
  type KRaftMigrationPhaseId,
  type KRaftPhaseNavigation,
  type KRaftPlannerInput,
  type ParsedKafkaVersion,
} from "./types";
import {
  isKRaftOnlyVersion,
  MIN_MIGRATION_VERSION,
  sanitizeForDisplay,
  supportsMigration,
} from "./validate";

function checklistItem(
  id: string,
  text: string,
  satisfied: boolean,
  detail: string,
  category: KRaftChecklistCategory,
): KRaftChecklistItem {
  return { id, text, satisfied, detail, category };
}

function getPhase(id: KRaftMigrationPhaseId) {
  return PHASES.find((phase) => phase.id === id)!;
}

export function buildPhaseNavigation(
  phaseId: KRaftMigrationPhaseId,
): KRaftPhaseNavigation {
  const currentPhase = getPhase(phaseId);
  const index = PHASES.findIndex((phase) => phase.id === phaseId);
  const nextPhase = index < 0 || index >= PHASES.length - 1
    ? null
    : PHASES[index + 1];

  return {
    currentPhase,
    nextPhase,
    rollbackSupported: currentPhase.rollbackSupported,
    rollbackNote: currentPhase.rollbackNote,
  };
}

export function buildChecklist(
  input: KRaftPlannerInput,
  version: ParsedKafkaVersion,
): KRaftChecklistItem[] {
  const items: KRaftChecklistItem[] = [];
  const safeVendorLabel = sanitizeForDisplay(input.vendorLabel ?? input.vendor);

  items.push(
    checklistItem(
      "backup-metadata",
      "Verify that ZooKeeper metadata and broker metadata snapshots/backups exist and are recent.",
      false,
      "Backups are essential for rollback if migration encounters issues. This tool cannot verify backup existence.",
      "backup",
    ),
  );

  items.push(
    checklistItem(
      "vendor-support",
      `Confirm that ${safeVendorLabel} supports the current migration phase (${input.migrationPhase}).`,
      input.vendor === "apache",
      input.vendor === "apache"
        ? "Apache Kafka is the reference implementation. Migration procedures are documented."
        : `Vendor "${safeVendorLabel}" — confirm migration phase support with your vendor.`,
      "vendor",
    ),
  );

  const oddQuorum = input.controllerCount >= 3 && input.controllerCount % 2 === 1;
  items.push(
    checklistItem(
      "controller-quorum",
      "Verify controller quorum uses an odd number of nodes (3 or 5 recommended for production).",
      oddQuorum || !input.production,
      oddQuorum
        ? `${input.controllerCount} controllers (odd quorum).`
        : input.production
          ? `${input.controllerCount} controller(s) — production should use an odd quorum of 3+.`
          : `${input.controllerCount} controller(s) — non-production, single controller is acceptable for testing.`,
      "controllers",
    ),
  );

  const allIds = [...input.controllerNodeIds, ...input.brokerNodeIds];
  const uniqueIds = new Set(allIds);
  items.push(
    checklistItem(
      "unique-node-ids",
      "Verify all node.id values are unique across controllers and brokers.",
      uniqueIds.size === allIds.length,
      uniqueIds.size === allIds.length
        ? `${allIds.length} node IDs, all unique.`
        : `Duplicate node IDs detected. ${allIds.length} total IDs, ${uniqueIds.size} unique.`,
      "node-ids",
    ),
  );

  items.push(
    checklistItem(
      "controller-listeners",
      "Verify controller.listener.names is configured on all controller nodes.",
      input.controllerListenerNames.length > 0,
      input.controllerListenerNames.length > 0
        ? `Controller listener(s): ${input.controllerListenerNames.map(sanitizeForDisplay).join(", ")}.`
        : "No controller listener names configured.",
      "listeners",
    ),
  );

  if (input.quorumMode === "static") {
    const voterIds = new Set(input.quorumVoters.map((voter) => voter.nodeId));
    const controllerSet = new Set(input.controllerNodeIds);
    const quorumMatch =
      voterIds.size === controllerSet.size &&
      [...voterIds].every((id) => controllerSet.has(id));
    items.push(
      checklistItem(
        "quorum-voters-match",
        "Verify controller.quorum.voters entries match controller node IDs (static quorum mode).",
        quorumMatch && input.quorumVoters.length > 0,
        quorumMatch && input.quorumVoters.length > 0
          ? `${input.quorumVoters.length} voter(s) match ${input.controllerNodeIds.length} controller(s). Quorum mode: static.`
          : "Quorum voter IDs do not match controller node IDs, or no voters configured. Quorum mode: static.",
        "quorum",
      ),
    );
  } else {
    items.push(
      checklistItem(
        "quorum-bootstrap-configured",
        "Verify controller.quorum.bootstrap.servers has at least one safe endpoint (dynamic quorum mode).",
        input.bootstrapServers.length > 0,
        input.bootstrapServers.length > 0
          ? `${input.bootstrapServers.length} bootstrap server endpoint(s) configured. Quorum mode: dynamic (KIP-853). Supplying as many controllers as possible is recommended but not all need to be listed.`
          : "No bootstrap server endpoints configured. Dynamic quorum requires at least one endpoint.",
        "quorum",
      ),
    );
  }

  items.push(
    checklistItem(
      "acl-validated",
      "Verify ACL configuration is healthy and compatible with KRaft.",
      input.aclHealth === "healthy" || input.aclHealth === "not-used",
      input.aclHealth === "healthy"
        ? "ACLs reported healthy."
        : input.aclHealth === "not-used"
          ? "ACLs not in use."
          : input.aclHealth === "malformed"
            ? "ACLs reported as malformed — resolve before migration."
            : "ACL health unknown — verify before migration.",
      "acl",
    ),
  );

  items.push(
    checklistItem(
      "log-dirs-healthy",
      "Verify no log directories have failed on any broker.",
      input.logDirHealth === "healthy" && input.failedLogDirCount === 0,
      input.logDirHealth === "healthy" && input.failedLogDirCount === 0
        ? "All log directories healthy."
        : `Log directory health: ${input.logDirHealth}, ${input.failedLogDirCount} failed director${input.failedLogDirCount === 1 ? "y" : "ies"}.`,
      "log-dirs",
    ),
  );

  const versionOk = supportsMigration(version) || isKRaftOnlyVersion(version);
  items.push(
    checklistItem(
      "version-compatible",
      "Verify Kafka version meets documented minimum for migration (3.9.1+) or is already KRaft-only (4.x).",
      versionOk,
      isKRaftOnlyVersion(version)
        ? `Kafka ${version.raw} is KRaft-only (4.x+). Migration should already be complete.`
        : supportsMigration(version)
          ? `Kafka ${version.raw} meets the documented migration minimum (${MIN_MIGRATION_VERSION.raw}+).`
          : `Kafka ${version.raw} does not meet the documented migration minimum of ${MIN_MIGRATION_VERSION.raw}. Upgrade required.`,
      "version",
    ),
  );

  items.push(
    checklistItem(
      "monitoring-configured",
      "Verify observability is configured: KRaft quorum leader (raft-metrics current-leader), follower lag, under-replicated partitions, offline partitions, request latency, and log directory health.",
      false,
      "Monitoring is essential for detecting issues during each migration phase. See observability recommendations below.",
      "monitoring",
    ),
  );

  const currentPhase = getPhase(input.migrationPhase);
  items.push(
    checklistItem(
      "rollback-decision",
      `Understand rollback boundary: rollback is ${currentPhase.rollbackSupported ? "supported (but not risk-free — see controller-epoch caveat)" : "NOT supported"} from current phase (${currentPhase.label}).`,
      true,
      currentPhase.rollbackNote,
      "rollback",
    ),
  );

  items.push(
    checklistItem(
      "finalization-approval",
      "Confirm that finalization is IRREVERSIBLE. There is NO rollback to ZooKeeper after finalization. All validations must pass before approving finalization.",
      input.migrationPhase !== "dual-write-migration",
      input.migrationPhase === "dual-write-migration"
        ? "You are at the dual-write migration phase — the last rollback boundary. Finalization is the next step and is IRREVERSIBLE. Ensure all checks pass."
        : input.migrationPhase === "finalized-kraft"
          ? "Migration is already finalized. ZooKeeper rollback is no longer possible."
          : "Finalization is not the immediate next step. Continue migration phases first.",
      "finalization",
    ),
  );

  return items;
}
