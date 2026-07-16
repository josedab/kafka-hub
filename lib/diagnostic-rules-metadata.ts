/**
 * Re-export from the canonical source in @kafka-hub/kafka-diagnose.
 * This file exists for backward compatibility with existing imports.
 */

import { RULE_DOCUMENTATION, type RuleDocumentation } from "@kafka-hub/kafka-diagnose";

export type DiagnosticRuleMetadata = RuleDocumentation;
export const RULE_METADATA: Record<string, DiagnosticRuleMetadata> = RULE_DOCUMENTATION;
