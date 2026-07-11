/**
 * KRaft transition and Kafka 4.x readiness coordinator.
 *
 * Deterministic and framework-free. This planner validates and explains;
 * it never connects to a cluster or executes migration commands.
 */

import type { KRaftPlannerResult } from "./types";
import { buildReadinessFindings } from "./analysis-readiness";
import { buildChecklist, buildPhaseNavigation } from "./analysis-phases";
import { buildAnalysisResult } from "./analysis-result";
import {
  parseKafkaVersion,
  validateKRaftInput,
  validateUnknownKRaftInput,
} from "./validate";

export { RESOURCE_LINKS, SOURCES, VERSION_BASELINE } from "./reference-data";

export function analyzeKRaft(input: unknown): KRaftPlannerResult {
  const structural = validateUnknownKRaftInput(input);
  if (!structural.ok) {
    return { ok: false, issues: structural.issues };
  }

  const semanticIssues = validateKRaftInput(structural.input);
  if (semanticIssues.some((issue) => issue.severity === "error")) {
    return { ok: false, issues: semanticIssues };
  }

  const parsedVersion = parseKafkaVersion(structural.input.kafkaVersion)!;
  const warningIssues = semanticIssues.filter(
    (issue) => issue.severity === "warning",
  );
  const findings = buildReadinessFindings(
    structural.input,
    parsedVersion,
    warningIssues,
  );
  const checklist = buildChecklist(structural.input, parsedVersion);
  const phaseNavigation = buildPhaseNavigation(structural.input.migrationPhase);

  return {
    ok: true,
    result: buildAnalysisResult(
      structural.input,
      parsedVersion,
      findings,
      checklist,
      phaseNavigation,
    ),
  };
}
