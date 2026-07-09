import type { RuleWithFix } from "./helpers";
import { bool } from "./helpers";

/** Kafka settings whose documented value domain is exactly true/false. */
export const KNOWN_BOOLEAN_SETTINGS = [
  "allow.everyone.if.no.acl.found",
  "auto.create.topics.enable",
  "auto.leader.rebalance.enable",
  "check.crcs",
  "controlled.shutdown.enable",
  "delete.topic.enable",
  "enable.auto.commit",
  "enable.idempotence",
  "log.cleaner.enable",
  "unclean.leader.election.enable",
] as const;

function displayLiteral(value: string): string {
  const compact = value.replace(/\s+/g, " ").slice(0, 80);
  return JSON.stringify(compact);
}

export const validationRules: RuleWithFix[] = [
  {
    id: "malformed-boolean-literal",
    category: "validation",
    evaluate(config) {
      const findings = KNOWN_BOOLEAN_SETTINGS.flatMap((key) => {
        const value = config[key];
        if (value === undefined || bool(value) !== undefined) return [];

        return [{
          severity: "warning" as const,
          title: `Malformed boolean literal for ${key}`,
          detail:
            `${key}=${displayLiteral(value)} is not a valid Kafka boolean. ` +
            'Use exactly "true" or "false" (case and surrounding whitespace are normalized); typos are not interpreted as false.',
        }];
      });

      return findings.length > 0 ? findings : null;
    },
  },
];
