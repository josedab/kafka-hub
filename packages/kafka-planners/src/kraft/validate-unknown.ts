import type {
  KRaftAclHealth,
  KRaftLogDirHealth,
  KRaftMetadataMode,
  KRaftMigrationPhaseId,
  KRaftPlannerInput,
  KRaftQuorumMode,
  KRaftValidationIssue,
  KRaftVendor,
} from "./types";
import {
  isFiniteInt,
  isFiniteNonNegInt,
  isSafeHost,
  isSafeLabel,
  isSafeListenerName,
  issue,
  sanitizeForDisplay,
} from "./validation-guards";

const VALID_METADATA_MODES: readonly KRaftMetadataMode[] = [
  "zookeeper",
  "migration",
  "kraft",
];
const VALID_VENDORS: readonly KRaftVendor[] = [
  "apache",
  "confluent",
  "aws-msk",
  "other",
];
const VALID_PHASES: readonly KRaftMigrationPhaseId[] = [
  "preflight-zookeeper",
  "initial-metadata-load",
  "hybrid-migration",
  "dual-write-migration",
  "finalized-kraft",
];
const VALID_QUORUM_MODES: readonly KRaftQuorumMode[] = ["static", "dynamic"];
const VALID_ACL_HEALTH: readonly KRaftAclHealth[] = [
  "healthy",
  "malformed",
  "unknown",
  "not-used",
];
const VALID_LOG_DIR_HEALTH: readonly KRaftLogDirHealth[] = [
  "healthy",
  "failed",
  "unknown",
];

export function validateUnknownKRaftInput(
  input: unknown,
): { ok: true; input: KRaftPlannerInput } | { ok: false; issues: KRaftValidationIssue[] } {
  const issues: KRaftValidationIssue[] = [];

  if (
    input === null ||
    input === undefined ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    issues.push(
      issue(
        "invalid-root",
        "root",
        `Expected a plain object as input, got ${input === null ? "null" : Array.isArray(input) ? "array" : typeof input}.`,
      ),
    );
    return { ok: false, issues };
  }

  const obj = input as Record<string, unknown>;

  if (typeof obj.kafkaVersion !== "string" || obj.kafkaVersion.trim().length === 0) {
    issues.push(
      issue("invalid-field-type", "kafkaVersion", `"kafkaVersion" must be a non-empty string.`),
    );
  }

  if (
    typeof obj.metadataMode !== "string" ||
    !VALID_METADATA_MODES.includes(obj.metadataMode as KRaftMetadataMode)
  ) {
    issues.push(
      issue(
        "invalid-metadata-mode",
        "metadataMode",
        `"metadataMode" must be one of: ${VALID_METADATA_MODES.join(", ")} (got ${JSON.stringify(obj.metadataMode)}).`,
      ),
    );
  }

  if (
    typeof obj.vendor !== "string" ||
    !VALID_VENDORS.includes(obj.vendor as KRaftVendor)
  ) {
    issues.push(
      issue(
        "invalid-vendor",
        "vendor",
        `"vendor" must be one of: ${VALID_VENDORS.join(", ")} (got ${JSON.stringify(obj.vendor)}).`,
      ),
    );
  }

  if (obj.vendorLabel !== undefined && obj.vendorLabel !== null) {
    if (typeof obj.vendorLabel !== "string") {
      issues.push(
        issue("invalid-field-type", "vendorLabel", `"vendorLabel" must be a string when provided.`),
      );
    } else if (!isSafeLabel(obj.vendorLabel)) {
      issues.push(
        issue("unsafe-label", "vendorLabel", `"vendorLabel" contains unsafe characters or is empty.`),
      );
    }
  }

  if (!isFiniteInt(obj.controllerCount) || obj.controllerCount < 0) {
    issues.push(
      issue(
        "invalid-field-type",
        "controllerCount",
        `"controllerCount" must be a non-negative integer.`,
      ),
    );
  }

  if (!Array.isArray(obj.controllerNodeIds)) {
    issues.push(
      issue("invalid-field-type", "controllerNodeIds", `"controllerNodeIds" must be an array.`),
    );
  } else {
    for (let i = 0; i < obj.controllerNodeIds.length; i++) {
      if (!isFiniteInt(obj.controllerNodeIds[i])) {
        issues.push(
          issue(
            "invalid-field-type",
            `controllerNodeIds[${i}]`,
            `Controller node ID at index ${i} must be a finite integer.`,
          ),
        );
      }
    }
  }

  if (!Array.isArray(obj.brokerNodeIds)) {
    issues.push(
      issue("invalid-field-type", "brokerNodeIds", `"brokerNodeIds" must be an array.`),
    );
  } else {
    for (let i = 0; i < obj.brokerNodeIds.length; i++) {
      if (!isFiniteInt(obj.brokerNodeIds[i])) {
        issues.push(
          issue(
            "invalid-field-type",
            `brokerNodeIds[${i}]`,
            `Broker node ID at index ${i} must be a finite integer.`,
          ),
        );
      }
    }
  }

  if (!Array.isArray(obj.controllerListenerNames)) {
    issues.push(
      issue(
        "invalid-field-type",
        "controllerListenerNames",
        `"controllerListenerNames" must be an array.`,
      ),
    );
  } else {
    for (let i = 0; i < obj.controllerListenerNames.length; i++) {
      const name = obj.controllerListenerNames[i];
      if (typeof name !== "string" || name.trim().length === 0) {
        issues.push(
          issue(
            "empty-string",
            `controllerListenerNames[${i}]`,
            `Controller listener name at index ${i} must be a non-empty string.`,
          ),
        );
      } else if (!isSafeListenerName(name)) {
        issues.push(
          issue(
            "invalid-listener-name",
            `controllerListenerNames[${i}]`,
            `Controller listener name "${sanitizeForDisplay(name)}" at index ${i} contains invalid characters. Use letters, digits, hyphens, or underscores only.`,
          ),
        );
      }
    }
  }

  if (
    typeof obj.quorumMode !== "string" ||
    !VALID_QUORUM_MODES.includes(obj.quorumMode as KRaftQuorumMode)
  ) {
    issues.push(
      issue(
        "invalid-quorum-mode",
        "quorumMode",
        `"quorumMode" must be one of: ${VALID_QUORUM_MODES.join(", ")} (got ${JSON.stringify(obj.quorumMode)}).`,
      ),
    );
  }

  const quorumMode = obj.quorumMode as KRaftQuorumMode;

  if (!Array.isArray(obj.quorumVoters)) {
    issues.push(
      issue("invalid-field-type", "quorumVoters", `"quorumVoters" must be an array.`),
    );
  } else if (quorumMode === "static") {
    for (let i = 0; i < obj.quorumVoters.length; i++) {
      const voter = obj.quorumVoters[i];
      if (voter === null || voter === undefined || typeof voter !== "object" || Array.isArray(voter)) {
        issues.push(
          issue(
            "invalid-quorum-voter",
            `quorumVoters[${i}]`,
            `Quorum voter at index ${i} must be an object with nodeId, host, and port.`,
          ),
        );
        continue;
      }
      const v = voter as Record<string, unknown>;
      if (!isFiniteInt(v.nodeId)) {
        issues.push(
          issue(
            "invalid-quorum-voter",
            `quorumVoters[${i}].nodeId`,
            `Quorum voter nodeId at index ${i} must be a finite integer.`,
          ),
        );
      }
      if (typeof v.host !== "string" || !isSafeHost(v.host)) {
        issues.push(
          issue(
            "invalid-quorum-voter",
            `quorumVoters[${i}].host`,
            `Quorum voter host at index ${i} must be a non-empty safe string (letters, digits, dots, hyphens, colons, brackets only).`,
          ),
        );
      }
      if (!isFiniteInt(v.port) || v.port < 1 || v.port > 65535) {
        issues.push(
          issue(
            "invalid-quorum-voter",
            `quorumVoters[${i}].port`,
            `Quorum voter port at index ${i} must be an integer between 1 and 65535.`,
          ),
        );
      }
    }
  }

  if (!Array.isArray(obj.bootstrapServers)) {
    issues.push(
      issue("invalid-field-type", "bootstrapServers", `"bootstrapServers" must be an array.`),
    );
  } else if (quorumMode === "dynamic") {
    if (obj.bootstrapServers.length === 0) {
      issues.push(
        issue(
          "missing-bootstrap-servers",
          "bootstrapServers",
          `Dynamic quorum mode requires at least one entry in controller.quorum.bootstrap.servers.`,
        ),
      );
    }
    for (let i = 0; i < obj.bootstrapServers.length; i++) {
      const server = obj.bootstrapServers[i];
      if (server === null || server === undefined || typeof server !== "object" || Array.isArray(server)) {
        issues.push(
          issue(
            "invalid-bootstrap-server",
            `bootstrapServers[${i}]`,
            `Bootstrap server at index ${i} must be an object with host and port.`,
          ),
        );
        continue;
      }
      const s = server as Record<string, unknown>;
      if (typeof s.host !== "string" || !isSafeHost(s.host)) {
        issues.push(
          issue(
            "invalid-bootstrap-server",
            `bootstrapServers[${i}].host`,
            `Bootstrap server host at index ${i} must be a non-empty safe string (letters, digits, dots, hyphens, colons, brackets only).`,
          ),
        );
      }
      if (!isFiniteInt(s.port) || s.port < 1 || s.port > 65535) {
        issues.push(
          issue(
            "invalid-bootstrap-server",
            `bootstrapServers[${i}].port`,
            `Bootstrap server port at index ${i} must be an integer between 1 and 65535.`,
          ),
        );
      }
    }
  }

  for (const field of ["interBrokerConfigPresent", "controllerConfigPresent", "production"] as const) {
    if (typeof obj[field] !== "boolean") {
      issues.push(
        issue("invalid-field-type", field, `"${field}" must be a boolean.`),
      );
    }
  }

  if (
    typeof obj.aclHealth !== "string" ||
    !VALID_ACL_HEALTH.includes(obj.aclHealth as KRaftAclHealth)
  ) {
    issues.push(
      issue(
        "invalid-acl-health",
        "aclHealth",
        `"aclHealth" must be one of: ${VALID_ACL_HEALTH.join(", ")} (got ${JSON.stringify(obj.aclHealth)}).`,
      ),
    );
  }

  if (
    typeof obj.logDirHealth !== "string" ||
    !VALID_LOG_DIR_HEALTH.includes(obj.logDirHealth as KRaftLogDirHealth)
  ) {
    issues.push(
      issue(
        "invalid-log-dir-health",
        "logDirHealth",
        `"logDirHealth" must be one of: ${VALID_LOG_DIR_HEALTH.join(", ")} (got ${JSON.stringify(obj.logDirHealth)}).`,
      ),
    );
  }

  if (!isFiniteNonNegInt(obj.failedLogDirCount)) {
    issues.push(
      issue(
        "invalid-field-type",
        "failedLogDirCount",
        `"failedLogDirCount" must be a non-negative integer.`,
      ),
    );
  }

  if (
    typeof obj.migrationPhase !== "string" ||
    !VALID_PHASES.includes(obj.migrationPhase as KRaftMigrationPhaseId)
  ) {
    issues.push(
      issue(
        "invalid-phase",
        "migrationPhase",
        `"migrationPhase" must be one of: ${VALID_PHASES.join(", ")} (got ${JSON.stringify(obj.migrationPhase)}).`,
      ),
    );
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, input: input as KRaftPlannerInput };
}
