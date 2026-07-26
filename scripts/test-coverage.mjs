/**
 * Per-domain coverage thresholds using Node 22 --experimental-test-coverage.
 *
 * WHY PER-DOMAIN THRESHOLDS:
 * Each workspace package is an independent domain with its own test suite.
 * UI components, data-only files, and Next.js page shells are not measured
 * here because they would dilute domain logic coverage with untestable
 * framework glue (SSR, client hydration, CSS). This script measures only
 * deterministic TypeScript logic where coverage is meaningful and actionable.
 *
 * THRESHOLD RATIONALE:
 * - Root utilities / diagnose / sim / CLI: 85% lines, 70% branches, 85% functions
 *   These are mature modules with some hard-to-reach defensive branches.
 * - Incident-parser / kafka-planners: 90% lines, 80% branches, 90% functions
 *   Newer, more focused modules with comprehensive test coverage.
 *
 * The --test-coverage-exclude=**\/*.test*.ts flag ensures tests and imported
 * test-support modules are not counted as measured source.
 *
 * Run: corepack pnpm test:coverage
 */

import { spawnSync } from "node:child_process";
import { globSync } from "node:fs";

const ROOT_SOURCE_PATTERNS = ["lib/**/*.ts", "app/api/**/*.ts"];
const ROOT_EXCLUDED_FILES = new Set([
  "app/api/search/route.ts",
  "lib/cn.ts",
  "lib/diagnostic-rules-metadata.ts",
  "lib/nav-links.ts",
  "lib/project-stats.ts",
  "lib/site.ts",
  "lib/source.ts",
  "lib/workbench-registry.ts",
]);
const ROOT_EXCLUDED_PREFIXES = [
  "lib/diagnostic-rules/",
  "lib/simulator-core/",
];
const EXPECTED_ROOT_LOGIC = [
  "app/api/diagnose/llm/route.ts",
  "app/api/health/route.ts",
  "lib/canonical-origin.ts",
  "lib/json-ld.ts",
  "lib/lru-cache.ts",
  "lib/rate-limit.ts",
  "lib/search-index.ts",
  "lib/simulate-routing.ts",
];

function discoverRootCoverageFiles() {
  const candidates = new Set(
    ROOT_SOURCE_PATTERNS.flatMap((pattern) =>
      globSync(pattern, { cwd: process.cwd() }),
    ),
  );

  return [...candidates]
    .filter((file) => !file.includes(".test."))
    .filter((file) => !file.endsWith("-data.ts"))
    .filter((file) => !ROOT_EXCLUDED_FILES.has(file))
    .filter(
      (file) =>
        !ROOT_EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix)),
    )
    .sort();
}

const rootCoverageFiles = discoverRootCoverageFiles();
const missingExpectedRootFiles = EXPECTED_ROOT_LOGIC.filter(
  (file) => !rootCoverageFiles.includes(file),
);
if (missingExpectedRootFiles.length > 0) {
  throw new Error(
    `Root coverage discovery omitted expected logic: ${missingExpectedRootFiles.join(", ")}`,
  );
}
if (rootCoverageFiles.some((file) => file.includes(".test."))) {
  throw new Error("Root coverage discovery must never measure test files.");
}

const suites = [
  {
    name: "root utilities",
    lines: 85,
    branches: 70,
    functions: 85,
    include: rootCoverageFiles,
    tests: [
      "lib/*.test.ts",
      "app/api/diagnose/llm/route.test.ts",
      "app/api/health/route.test.ts",
    ],
  },
  {
    name: "kafka-diagnose",
    lines: 85,
    branches: 70,
    functions: 85,
    include: ["packages/kafka-diagnose/src/**/*.ts"],
    tests: ["packages/kafka-diagnose/src/**/*.test.ts"],
  },
  {
    name: "incident-parser",
    lines: 90,
    branches: 80,
    functions: 90,
    include: ["packages/incident-parser/src/**/*.ts"],
    tests: ["packages/incident-parser/src/**/*.test.ts"],
  },
  {
    name: "kafka-planners",
    lines: 90,
    branches: 80,
    functions: 90,
    include: ["packages/kafka-planners/src/**/*.ts"],
    tests: [
      "packages/kafka-planners/src/**/*.test.ts",
    ],
  },
  {
    name: "kafka-sim",
    lines: 85,
    branches: 70,
    functions: 85,
    include: ["packages/kafka-sim/src/**/*.ts"],
    tests: ["packages/kafka-sim/src/**/*.test.ts"],
  },
  {
    name: "kafka-cli",
    lines: 85,
    branches: 70,
    functions: 85,
    include: ["packages/kafka-cli/src/**/*.ts"],
    tests: ["packages/kafka-cli/src/**/*.test.ts"],
  },
];

let failed = false;

for (const suite of suites) {
  console.log(`\n=== Coverage: ${suite.name} ===`);
  const testFiles = suite.tests.flatMap((pattern) =>
    globSync(pattern, { cwd: process.cwd() }).sort(),
  );
  if (testFiles.length === 0) {
    console.error(`ERROR: No test files matched for "${suite.name}"`);
    console.error(`  Patterns: ${suite.tests.join(", ")}`);
    process.exit(1);
  }
  console.log(`  ${testFiles.length} test file(s) matched`);
  if (suite.name === "root utilities") {
    console.log(`  ${suite.include.length} deterministic source file(s) discovered`);
  }

  const args = [
    "--import",
    "tsx",
    "--test",
    "--experimental-test-coverage",
    `--test-coverage-lines=${suite.lines}`,
    `--test-coverage-branches=${suite.branches}`,
    `--test-coverage-functions=${suite.functions}`,
    "--test-coverage-exclude=**/*.test*.ts",
    ...suite.include.map((pattern) => `--test-coverage-include=${pattern}`),
    ...testFiles,
  ];
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`\n✗ Coverage threshold FAILED for "${suite.name}"`);
    console.error(`  Required: lines≥${suite.lines}% branches≥${suite.branches}% functions≥${suite.functions}%`);
    failed = true;
  } else {
    console.log(`✓ "${suite.name}" passed (lines≥${suite.lines}% branches≥${suite.branches}% functions≥${suite.functions}%)`);
  }
}

if (failed) {
  console.error("\n✗ One or more coverage suites failed their thresholds.");
  process.exit(1);
}

console.log("\n✓ All coverage thresholds passed.");
