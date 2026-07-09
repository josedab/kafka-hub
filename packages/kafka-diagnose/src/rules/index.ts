/**
 * Single composition point for all diagnostic rules.
 *
 * Rules are organized by category for maintainability but composed here
 * into a single ordered array for the engine.
 */

import type { RuleWithFix } from "./helpers";
import { brokerRules } from "./broker";
import { topicRules } from "./topic";
import { producerRules } from "./producer";
import { consumerRules } from "./consumer";
import { securityRules } from "./security";
import { transactionRules } from "./transactions";
import { performanceRules } from "./performance";
import { validationRules } from "./validation";

export type { RuleWithFix, FindingWithFix } from "./helpers";
export { setFix, replaceFix, removeFix, multiFix, num, bool } from "./helpers";

/**
 * All rules in evaluation order.
 * Category grouping is preserved for readability but has no semantic effect.
 */
export const allRules: RuleWithFix[] = [
  ...validationRules,
  ...brokerRules,
  ...topicRules,
  ...producerRules,
  ...consumerRules,
  ...securityRules,
  ...transactionRules,
  ...performanceRules,
];
