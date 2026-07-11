import type {
  KRaftAnalysisAssumptions,
  KRaftAnalysisResult,
  KRaftChecklistItem,
  KRaftFinding,
  KRaftPhaseNavigation,
  KRaftPlannerInput,
  KRaftReadinessStatus,
  ParsedKafkaVersion,
} from "./types";
import {
  OBSERVABILITY,
  RESOURCE_LINKS,
  SOURCES,
  VERSION_BASELINE,
} from "./reference-data";
import { sanitizeForDisplay } from "./validate";

function readinessStatus(findings: readonly KRaftFinding[]): KRaftReadinessStatus {
  if (findings.some((finding) => finding.severity === "blocker")) return "blocked";
  if (findings.some((finding) => finding.severity === "warning")) return "warnings";
  return "ready";
}

function buildAssumptions(
  input: KRaftPlannerInput,
  parsedVersion: ParsedKafkaVersion,
): KRaftAnalysisAssumptions {
  return {
    kafkaVersion: input.kafkaVersion,
    parsedVersion,
    metadataMode: input.metadataMode,
    vendor: input.vendor,
    vendorLabel: sanitizeForDisplay(input.vendorLabel ?? input.vendor),
    controllerCount: input.controllerCount,
    controllerNodeIds: [...input.controllerNodeIds],
    brokerNodeIds: [...input.brokerNodeIds],
    controllerListenerNames: [...input.controllerListenerNames],
    quorumMode: input.quorumMode,
    quorumVoters: input.quorumVoters.map((voter) => ({ ...voter })),
    bootstrapServers: input.bootstrapServers.map((server) => ({ ...server })),
    interBrokerConfigPresent: input.interBrokerConfigPresent,
    controllerConfigPresent: input.controllerConfigPresent,
    aclHealth: input.aclHealth,
    logDirHealth: input.logDirHealth,
    failedLogDirCount: input.failedLogDirCount,
    migrationPhase: input.migrationPhase,
    production: input.production,
  };
}

export function buildAnalysisResult(
  input: KRaftPlannerInput,
  parsedVersion: ParsedKafkaVersion,
  findings: readonly KRaftFinding[],
  checklist: readonly KRaftChecklistItem[],
  phaseNavigation: KRaftPhaseNavigation,
): KRaftAnalysisResult {
  return {
    status: readinessStatus(findings),
    findings: [...findings],
    phaseNavigation,
    checklist: [...checklist],
    observability: [...OBSERVABILITY],
    resourceLinks: [...RESOURCE_LINKS],
    sources: [...SOURCES],
    versionBaseline: { ...VERSION_BASELINE },
    assumptions: buildAssumptions(input, parsedVersion),
  };
}
