/**
 * Authoritative project stats registry.
 *
 * Data-derived counts used by the homepage and UI components.
 * Prevents hardcoded surface, rule, and catalog counts.
 */

import { site } from "./site";
import { errors } from "./errors-data";
import { kips } from "./kips-data";
import { cheatsheets } from "./cheatsheet-data";
import { WORKBENCH_TOOLS } from "./workbench-registry";
import { rules } from "./diagnostic-rules";
import { SCENARIO_LIST } from "@kafka-hub/kafka-sim";
import packageJson from "../package.json";

export const PROJECT_STATS = {
  surfaceCount: site.surfaces.length,
  ruleCount: rules.length,
  errorCount: errors.length,
  kipCount: kips.length,
  cheatsheetCount: cheatsheets.length,
  workbenchToolCount: WORKBENCH_TOOLS.length,
  scenarioCount: SCENARIO_LIST.length,
} as const;

/**
 * Human-readable surface count label (e.g. "Seven surfaces").
 */
const CARDINAL_WORDS = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six",
  "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
];

export function surfaceCountLabel(): string {
  const count: number = PROJECT_STATS.surfaceCount;
  const word = CARDINAL_WORDS[count] ?? String(count);
  return `${word} surface${count !== 1 ? "s" : ""}`;
}

export function getProjectVersion(): string {
  return packageJson.version;
}
