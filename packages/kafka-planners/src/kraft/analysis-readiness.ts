import type {
  KRaftFinding,
  KRaftFindingSeverity,
  KRaftPlannerInput,
  KRaftValidationIssue,
  ParsedKafkaVersion,
} from "./types";
import { VERSION_BASELINE } from "./reference-data";
import {
  compareVersions,
  isFinalZookeeperLine,
  isKRaftBridgeCandidate,
  isKRaftOnlyVersion,
  MIN_MIGRATION_VERSION,
  RECOMMENDED_MIGRATION_VERSION,
  sanitizeForDisplay,
  supportsMigration,
} from "./validate";

function finding(
  id: string,
  severity: KRaftFindingSeverity,
  message: string,
  detail?: string,
): KRaftFinding {
  return { id, severity, message, ...(detail ? { detail } : {}) };
}

export function buildReadinessFindings(
  input: KRaftPlannerInput,
  parsed: ParsedKafkaVersion,
  warningIssues: readonly KRaftValidationIssue[],
): KRaftFinding[] {
  const findings: KRaftFinding[] = warningIssues.map((warning) =>
    finding(`validation-${warning.kind}`, "warning", warning.message),
  );

  if (isFinalZookeeperLine(parsed)) {
    if (supportsMigration(parsed)) {
      findings.push(
        finding(
          "version-3.9-bridge",
          "info",
          `Kafka ${parsed.raw} is in the 3.9.x line — the final ZooKeeper-capable release and the documented migration/upgrade bridge to 4.x.`,
          "Complete KRaft migration and finalization on 3.9.x, then upgrade to 4.x.",
        ),
      );
    } else {
      findings.push(
        finding(
          "version-3.9-bridge",
          "info",
          `Kafka ${parsed.raw} is in the 3.9.x line but below the documented migration minimum of ${MIN_MIGRATION_VERSION.raw}. Upgrade to at least ${MIN_MIGRATION_VERSION.raw} before starting migration.`,
          `The official Kafka 3.9 migration docs require at least ${MIN_MIGRATION_VERSION.raw}. Version ${RECOMMENDED_MIGRATION_VERSION.raw} is recommended as it includes the KIP-1252 compatibility fix.`,
        ),
      );
    }
  }

  if (
    supportsMigration(parsed) &&
    compareVersions(parsed, RECOMMENDED_MIGRATION_VERSION) < 0
  ) {
    findings.push(
      finding(
        "version-3.9.2-advisory",
        "info",
        `Kafka ${RECOMMENDED_MIGRATION_VERSION.raw} includes the KIP-1252 migration compatibility fix noted in the official 3.9 docs. Consider reviewing and using the latest supported 3.9 patch (at review time ${RECOMMENDED_MIGRATION_VERSION.raw}) before migration.`,
        "This is a workload-independent advisory. The KIP-1252 fix addresses a migration compatibility issue; using the latest patch reduces risk.",
      ),
    );
  }

  if (isKRaftBridgeCandidate(parsed) && input.metadataMode === "kraft") {
    findings.push(
      finding(
        "version-kraft-bridge-advisory",
        "warning",
        `Kafka ${parsed.raw} is already running KRaft but is below ${MIN_MIGRATION_VERSION.raw}. Per the official 4.0/4.3 upgrade docs, already-KRaft clusters should bridge via 3.9.x before upgrading to 4.x.`,
        `Upgrade to 3.9.x (at least ${MIN_MIGRATION_VERSION.raw}, recommend ${RECOMMENDED_MIGRATION_VERSION.raw}) as a bridge, then proceed to 4.x. The 4.x upgrade docs require software/metadata at least 3.3.x but recommend the 3.9.x bridge path.`,
      ),
    );
  }

  if (parsed.preRelease) {
    findings.push(
      finding(
        "version-pre-release",
        "warning",
        `Kafka ${parsed.raw} is a pre-release version. Pre-release versions may have incomplete migration support or known issues. Use a GA release for production migration.`,
      ),
    );
  }

  if (isKRaftOnlyVersion(parsed) && input.metadataMode !== "kraft") {
    findings.push(
      finding(
        "version-4x-kraft-only",
        "blocker",
        `Kafka ${parsed.raw} is KRaft-only (4.x+). ZooKeeper and migration modes are not supported. Migration must be completed and finalized on a 3.x release before upgrading to 4.x.`,
      ),
    );
  }

  if (!isKRaftOnlyVersion(parsed) && input.migrationPhase !== "finalized-kraft") {
    findings.push(
      finding(
        "version-no-jump-to-4x",
        "info",
        `Do not upgrade to Kafka 4.x before completing and finalizing the KRaft migration on your current ${parsed.major}.${parsed.minor}.x release. Kafka 4.x does not support ZooKeeper or migration mode.`,
      ),
    );
  }

  findings.push(
    finding(
      "version-baseline",
      "info",
      `This analysis is based on Kafka ${VERSION_BASELINE.reviewedRelease} (released ${VERSION_BASELINE.releaseDate}, reviewed ${VERSION_BASELINE.reviewDate}). ${VERSION_BASELINE.caveat}`,
    ),
  );

  if (input.controllerCount > 0 && input.controllerCount % 2 === 0 && input.production) {
    findings.push(
      finding(
        "controller-even-count",
        "warning",
        `Even controller count (${input.controllerCount}) wastes a node without improving fault tolerance. An odd number (3, 5, 7) provides optimal quorum efficiency.`,
      ),
    );
  }

  if (input.controllerCount === 1 && input.production) {
    findings.push(
      finding(
        "controller-single-prod",
        "blocker",
        `A single KRaft controller provides no fault tolerance for metadata operations. Production clusters must have an odd quorum of at least 3 controllers.`,
      ),
    );
  }

  if (input.controllerCount === 1 && !input.production) {
    findings.push(
      finding(
        "controller-single-dev",
        "warning",
        `Single controller — acceptable for development/testing. No fault tolerance for metadata operations.`,
      ),
    );
  }

  if (input.quorumMode === "dynamic") {
    findings.push(
      finding(
        "quorum-dynamic-mode",
        "info",
        `Dynamic controller quorum mode (KIP-853) is configured via controller.quorum.bootstrap.servers. In Kafka 3.9+, dynamic quorum is selected at format time when static voters are absent. Runtime conversion from static to dynamic is not currently supported.`,
        `${input.bootstrapServers.length} bootstrap server endpoint(s) configured. Supplying as many controllers as possible is recommended for resilience, but not all endpoints need to be listed.`,
      ),
    );
  }

  if (input.quorumMode === "static") {
    findings.push(
      finding(
        "quorum-static-mode",
        "info",
        `Static controller quorum mode is configured via controller.quorum.voters with explicit node-ID@host:port entries. In Kafka 3.9+, consider using dynamic quorum (KIP-853) via controller.quorum.bootstrap.servers for easier quorum membership changes. Dynamic quorum is selected at format time when static voters are absent.`,
      ),
    );
  }

  if (input.aclHealth === "malformed") {
    findings.push(
      finding(
        "acl-malformed",
        "blocker",
        `ACL configuration is reported as malformed. Resolve ACL issues before proceeding with migration. Malformed ACLs may prevent controller access or cause authorization failures after migration.`,
      ),
    );
  }

  if (input.aclHealth === "unknown") {
    findings.push(
      finding(
        "acl-unknown",
        "warning",
        `ACL health is unknown. Verify ACL configuration is correct and compatible with KRaft before proceeding. ACLs stored in ZooKeeper must be migrated to KRaft-compatible format.`,
      ),
    );
  }

  if (input.logDirHealth === "failed" || input.failedLogDirCount > 0) {
    findings.push(
      finding(
        "logdir-failed",
        "blocker",
        `${input.failedLogDirCount} failed log director${input.failedLogDirCount === 1 ? "y" : "ies"} detected. Failed log directories must be resolved before migration. Brokers with failed log directories may lose partition replicas during metadata migration.`,
      ),
    );
  }

  if (input.logDirHealth === "unknown") {
    findings.push(
      finding(
        "logdir-unknown",
        "warning",
        `Log directory health is unknown. Verify all log directories are healthy before proceeding. Failed directories during migration can cause data loss.`,
      ),
    );
  }

  if (input.controllerListenerNames.length === 0) {
    findings.push(
      finding(
        "listener-missing",
        "blocker",
        `No controller listener names configured. KRaft controllers require controller.listener.names to be set. This is required for controller-to-controller and controller-to-broker communication.`,
      ),
    );
  }

  if (!input.controllerConfigPresent) {
    findings.push(
      finding(
        "config-controller-missing",
        "warning",
        `Controller-specific configuration not detected. Ensure controller.quorum.voters (static) or controller.quorum.bootstrap.servers (dynamic), controller.listener.names, and process.roles are configured on controller nodes.`,
      ),
    );
  }

  if (!input.interBrokerConfigPresent) {
    findings.push(
      finding(
        "config-interbroker-missing",
        "warning",
        `Inter-broker protocol configuration not detected. Ensure inter.broker.listener.name or inter.broker.security.protocol is configured.`,
      ),
    );
  }

  if (input.vendor !== "apache") {
    const safeLabel = sanitizeForDisplay(input.vendorLabel || input.vendor);
    findings.push(
      finding(
        "vendor-support-uncertainty",
        "warning",
        `Vendor "${safeLabel}" is not Apache Kafka. Migration phase support may differ. Confirm with your vendor that the current migration phase is supported before proceeding.`,
        "This tool does not claim managed vendors support any specific migration phase unless the user confirms vendor support.",
      ),
    );
  }

  if (input.migrationPhase === "finalized-kraft") {
    findings.push(
      finding(
        "phase-finalized",
        "info",
        `KRaft migration is finalized. Kafka no longer writes metadata to ZooKeeper. This is IRREVERSIBLE — there is no rollback to ZooKeeper. The cluster is fully KRaft-only.`,
      ),
    );
  }

  if (input.migrationPhase === "dual-write-migration") {
    findings.push(
      finding(
        "phase-pre-finalization",
        "warning",
        `All brokers are using KRaft as their metadata source, but the controller continues writing to ZooKeeper. This is the LAST ROLLBACK OPPORTUNITY. Verify all validations pass before finalizing. Finalization is irreversible. The official 3.9 docs note a controller-epoch caveat for reverting during migration — rollback is supported but not risk-free.`,
      ),
    );
  }

  if (input.quorumMode === "static" && input.quorumVoters.length > 0 && input.controllerNodeIds.length > 0) {
    const voterIds = new Set(input.quorumVoters.map((v) => v.nodeId));
    const controllerIds = new Set(input.controllerNodeIds);
    const missingVoters = input.controllerNodeIds.filter((id) => !voterIds.has(id));
    const extraVoters = input.quorumVoters
      .map((v) => v.nodeId)
      .filter((id) => !controllerIds.has(id));

    if (missingVoters.length > 0) {
      findings.push(
        finding(
          "quorum-missing-controllers",
          "blocker",
          `Controller node(s) ${missingVoters.join(", ")} are not listed as quorum voters. In static quorum mode, all controllers must be quorum voters in controller.quorum.voters.`,
        ),
      );
    }
    if (extraVoters.length > 0) {
      findings.push(
        finding(
          "quorum-extra-voters",
          "warning",
          `Quorum voter(s) ${extraVoters.join(", ")} are not in the controller node ID list. Ensure quorum voters match controller nodes in static mode.`,
        ),
      );
    }
  }

  return findings;
}
