import type {
  KRaftPlannerInput,
  KRaftQuorumVoter,
  KRaftValidationIssue,
} from "./types";
import { isFiniteInt, issue, sanitizeForDisplay } from "./validation-guards";
import {
  compareVersions,
  isKRaftOnlyVersion,
  MIN_KRAFT_BRIDGE_VERSION,
  MIN_MIGRATION_VERSION,
  parseKafkaVersion,
  RECOMMENDED_MIGRATION_VERSION,
} from "./version";

export function validateKRaftInput(input: KRaftPlannerInput): KRaftValidationIssue[] {
  const issues: KRaftValidationIssue[] = [];
  const parsed = parseKafkaVersion(input.kafkaVersion);
  if (!parsed) {
    issues.push(
      issue(
        "invalid-version",
        "kafkaVersion",
        `Cannot parse "${sanitizeForDisplay(input.kafkaVersion)}" as a Kafka version (expected format: major.minor.patch, e.g. "3.9.1").`,
      ),
    );
    return issues;
  }

  if (isKRaftOnlyVersion(parsed)) {
    if (input.metadataMode === "zookeeper") {
      issues.push(
        issue(
          "version-4x-zookeeper",
          "metadataMode",
          `Kafka ${parsed.raw} is 4.x (KRaft-only). ZooKeeper metadata mode is not supported. Migration must complete on a 3.x release before upgrading to 4.x.`,
        ),
      );
    }
    if (input.metadataMode === "migration") {
      issues.push(
        issue(
          "version-4x-migration",
          "metadataMode",
          `Kafka ${parsed.raw} is 4.x (KRaft-only). Migration mode is not supported. Migration must be finalized on a 3.x release before upgrading to 4.x.`,
        ),
      );
    }
  }

  if (!isKRaftOnlyVersion(parsed) && compareVersions(parsed, MIN_KRAFT_BRIDGE_VERSION) < 0) {
    issues.push(
      issue(
        "version-too-old",
        "kafkaVersion",
        `Kafka ${parsed.raw} is older than ${MIN_KRAFT_BRIDGE_VERSION.raw}, which is the minimum version with KRaft support. Upgrade to at least ${MIN_MIGRATION_VERSION.raw} before attempting ZooKeeper-to-KRaft migration.`,
        "warning",
      ),
    );
  }

  if (
    !isKRaftOnlyVersion(parsed) &&
    (input.metadataMode === "zookeeper" || input.metadataMode === "migration") &&
    compareVersions(parsed, MIN_MIGRATION_VERSION) < 0
  ) {
    issues.push(
      issue(
        "migration-version-insufficient",
        "kafkaVersion",
        `Kafka ${parsed.raw} does not meet the documented minimum for ZooKeeper-to-KRaft migration. Per the official Kafka 3.9 migration docs, brokers must be upgraded to at least ${MIN_MIGRATION_VERSION.raw} with inter.broker.protocol.version set to 3.9 before starting migration. Upgrade to at least ${MIN_MIGRATION_VERSION.raw} (${RECOMMENDED_MIGRATION_VERSION.raw} recommended for the KIP-1252 compatibility fix).`,
      ),
    );
  }

  if (input.controllerCount < 1) {
    issues.push(
      issue(
        "controller-count-insufficient",
        "controllerCount",
        `Controller count must be at least 1 (got ${input.controllerCount}).`,
      ),
    );
  }

  if (
    input.controllerCount > 0 &&
    Array.isArray(input.controllerNodeIds) &&
    input.controllerNodeIds.length !== input.controllerCount
  ) {
    issues.push(
      issue(
        "controller-count-mismatch",
        "controllerNodeIds",
        `controllerCount is ${input.controllerCount} but controllerNodeIds has ${input.controllerNodeIds.length} entries. These must match.`,
      ),
    );
  }

  if (input.production && input.controllerCount > 0) {
    if (input.controllerCount === 1) {
      issues.push(
        issue(
          "controller-count-single-prod",
          "controllerCount",
          `A single controller provides no fault tolerance. Production clusters should have an odd quorum of at least 3 controllers.`,
          "warning",
        ),
      );
    } else if (input.controllerCount % 2 === 0) {
      issues.push(
        issue(
          "controller-count-even",
          "controllerCount",
          `Even controller count (${input.controllerCount}) wastes a node without improving fault tolerance. Use an odd number (e.g., 3, 5) for an optimal quorum.`,
          "warning",
        ),
      );
    }
  }

  if (!input.production && input.controllerCount === 1) {
    issues.push(
      issue(
        "controller-count-single-prod",
        "controllerCount",
        `Single controller — acceptable for development/testing only. No fault tolerance for metadata operations.`,
        "warning",
      ),
    );
  }

  if (Array.isArray(input.controllerNodeIds) && Array.isArray(input.brokerNodeIds)) {
    const controllerSet = new Set<number>();
    for (const id of input.controllerNodeIds) {
      if (controllerSet.has(id)) {
        issues.push(
          issue(
            "duplicate-node-ids",
            "controllerNodeIds",
            `Duplicate controller node ID: ${id}. Each controller must have a unique node.id.`,
          ),
        );
        break;
      }
      controllerSet.add(id);
    }

    const brokerSet = new Set<number>();
    for (const id of input.brokerNodeIds) {
      if (brokerSet.has(id)) {
        issues.push(
          issue(
            "duplicate-node-ids",
            "brokerNodeIds",
            `Duplicate broker node ID: ${id}. Each broker must have a unique node.id.`,
          ),
        );
        break;
      }
      brokerSet.add(id);
    }

    const overlap = input.controllerNodeIds.filter((id) => brokerSet.has(id));
    if (overlap.length > 0) {
      issues.push(
        issue(
          "duplicate-node-ids",
          "controllerNodeIds",
          `Node ID(s) ${overlap.join(", ")} appear in both controllerNodeIds and brokerNodeIds. In a KRaft cluster with dedicated controllers, node.id must be unique across all nodes.`,
        ),
      );
    }
  }

  if (input.quorumMode === "static" && Array.isArray(input.quorumVoters)) {
    const voterIdSet = new Set<number>();
    for (const voter of input.quorumVoters) {
      if (voter && typeof voter === "object" && isFiniteInt((voter as KRaftQuorumVoter).nodeId)) {
        if (voterIdSet.has((voter as KRaftQuorumVoter).nodeId)) {
          issues.push(
            issue(
              "duplicate-quorum-voters",
              "quorumVoters",
              `Duplicate quorum voter node ID: ${(voter as KRaftQuorumVoter).nodeId}. Each voter must have a unique node ID.`,
            ),
          );
          break;
        }
        voterIdSet.add((voter as KRaftQuorumVoter).nodeId);
      }
    }

    if (
      Array.isArray(input.controllerNodeIds) &&
      input.quorumVoters.length > 0 &&
      input.controllerNodeIds.length > 0
    ) {
      const controllerIdSet = new Set(input.controllerNodeIds);
      const voterIds = input.quorumVoters
        .filter(
          (v): v is KRaftQuorumVoter =>
            v !== null && typeof v === "object" && isFiniteInt((v as KRaftQuorumVoter).nodeId),
        )
        .map((v) => v.nodeId);

      const missingInControllers = voterIds.filter((id) => !controllerIdSet.has(id));
      const voterIdLookup = new Set(voterIds);
      const missingInVoters = input.controllerNodeIds.filter(
        (id) => !voterIdLookup.has(id),
      );

      if (missingInControllers.length > 0 || missingInVoters.length > 0) {
        const parts: string[] = [];
        if (missingInControllers.length > 0) {
          parts.push(
            `voter ID(s) ${missingInControllers.join(", ")} not in controllerNodeIds`,
          );
        }
        if (missingInVoters.length > 0) {
          parts.push(
            `controller ID(s) ${missingInVoters.join(", ")} not in quorum voters`,
          );
        }
        issues.push(
          issue(
            "quorum-voter-controller-mismatch",
            "quorumVoters",
            `Quorum voter IDs do not match controller node IDs: ${parts.join("; ")}. Each controller should be a quorum voter in static mode.`,
            "warning",
          ),
        );
      }
    }
  }

  if (
    Array.isArray(input.controllerListenerNames) &&
    input.controllerListenerNames.length === 0
  ) {
    issues.push(
      issue(
        "missing-controller-listener",
        "controllerListenerNames",
        `No controller listener names provided. KRaft controllers require at least one controller listener (controller.listener.names).`,
      ),
    );
  }

  if (input.metadataMode === "zookeeper" && input.migrationPhase !== "preflight-zookeeper") {
    issues.push(
      issue(
        "phase-mode-mismatch",
        "migrationPhase",
        `Metadata mode is "zookeeper" but migration phase is "${input.migrationPhase}". When running ZooKeeper, phase should be "preflight-zookeeper".`,
        "warning",
      ),
    );
  }

  if (input.metadataMode === "kraft" && input.migrationPhase !== "finalized-kraft" && input.migrationPhase !== "dual-write-migration") {
    issues.push(
      issue(
        "phase-mode-mismatch",
        "migrationPhase",
        `Metadata mode is "kraft" but migration phase is "${input.migrationPhase}". When fully on KRaft, phase should be "dual-write-migration" or "finalized-kraft".`,
        "warning",
      ),
    );
  }

  if (
    input.metadataMode === "migration" &&
    (input.migrationPhase === "preflight-zookeeper" || input.migrationPhase === "finalized-kraft")
  ) {
    issues.push(
      issue(
        "phase-mode-mismatch",
        "migrationPhase",
        `Metadata mode is "migration" but phase "${input.migrationPhase}" is not a migration phase. Expected one of: initial-metadata-load, hybrid-migration, dual-write-migration.`,
        "warning",
      ),
    );
  }

  return issues;
}
