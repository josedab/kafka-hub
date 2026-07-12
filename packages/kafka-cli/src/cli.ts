/**
 * kafka-hub CLI
 *
 * Usage:
 *   kafka-hub diagnose <file>        Pretty-printed report
 *   kafka-hub diagnose <file> --json Machine-readable JSON
 *   kafka-hub diagnose -            Read from stdin
 *   kafka-hub --help
 *   kafka-hub --version
 *
 * Reuses @kafka-hub/kafka-diagnose for parsing + rule evaluation.
 */

import { readFile } from "node:fs/promises";
import { evaluate, rules, type DiagnosticFinding, type Severity } from "@kafka-hub/kafka-diagnose";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };
const VERSION = pkg.version;
const RULE_COUNT = rules.length;

const HELP = `kafka-hub ${VERSION}

USAGE
  kafka-hub diagnose <file> [--json] [--min <severity>]
  kafka-hub diagnose - [--json] [--min <severity>]

COMMANDS
  diagnose   Lint a Kafka .properties file against ${RULE_COUNT} built-in rules.

OPTIONS
  --json              Print the full JSON report (suitable for CI / jq).
  --min <severity>    Only show findings at or above this severity:
                      info | warning | danger    (default: info)
  -                   Read input from stdin instead of a file path.
  --help, -h          Show this help message.
  --version, -v       Print the CLI version.

EXAMPLES
  kafka-hub diagnose ./server.properties
  cat broker.props | kafka-hub diagnose - --json
  kafka-hub diagnose ./client.properties --min warning
`;

export async function run(argv: string[]): Promise<void> {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(HELP);
    return;
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  const [cmd, ...rest] = argv;
  if (cmd !== "diagnose") {
    process.stderr.write(`Unknown command: ${cmd}\n\n${HELP}`);
    process.exit(2);
  }

  await runDiagnose(rest);
}

async function runDiagnose(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  if (!flags.input) {
    process.stderr.write("kafka-hub diagnose: missing input file (or '-' for stdin)\n");
    process.exit(2);
  }

  const text = flags.input === "-" ? await readStdin() : await readFile(flags.input, "utf8");
  const report = evaluate(text);

  const filtered = filterBySeverity(report.findings, flags.min);

  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify({ ...report, findings: filtered }, null, 2)}\n`,
    );
  } else {
    printReport(filtered, report);
  }

  process.exit(report.stats.danger > 0 ? 1 : 0);
}

interface Flags {
  input: string | null;
  json: boolean;
  min: Severity;
}

function parseFlags(args: string[]): Flags {
  let input: string | null = null;
  let json = false;
  let min: Severity = "info";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json") {
      json = true;
    } else if (arg === "--min") {
      const next = args[++i];
      if (next !== "info" && next !== "warning" && next !== "danger") {
        process.stderr.write(`Invalid --min value: ${next}\n`);
        process.exit(2);
      }
      min = next;
    } else if (!arg.startsWith("--") && !input) {
      input = arg;
    } else {
      process.stderr.write(`Unknown argument: ${arg}\n`);
      process.exit(2);
    }
  }

  return { input, json, min };
}

const SEV_ORDER: Record<Severity, number> = { info: 0, warning: 1, danger: 2 };

function filterBySeverity(findings: DiagnosticFinding[], min: Severity): DiagnosticFinding[] {
  return findings.filter((f) => SEV_ORDER[f.severity] >= SEV_ORDER[min]);
}

function printReport(
  findings: DiagnosticFinding[],
  full: { parsedKeys: number; stats: { danger: number; warning: number; info: number } },
): void {
  const C = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
  };
  const useColor = process.stdout.isTTY;
  const c = (code: string, s: string) => (useColor ? code + s + C.reset : s);

  process.stdout.write(
    `${c(C.bold, "kafka-hub diagnose")}  ${c(C.dim, `${full.parsedKeys} keys parsed`)}\n\n`,
  );

  if (findings.length === 0) {
    process.stdout.write(`${c(C.green, "✓ no findings at this severity threshold")}\n`);
    return;
  }

  for (const f of findings) {
    const sevColor =
      f.severity === "danger" ? C.red : f.severity === "warning" ? C.yellow : C.cyan;
    const tag = c(sevColor + C.bold, `[${f.severity.toUpperCase()}]`);
    const cat = c(C.dim, `(${f.category})`);
    process.stdout.write(`${tag} ${c(C.bold, f.title)} ${cat}\n`);
    process.stdout.write(`  ${f.detail}\n`);
    if (f.learnSlug) {
      process.stdout.write(
        `  ${c(C.dim, "→ /learn/" + f.learnSlug)}\n`,
      );
    }
    process.stdout.write("\n");
  }

  process.stdout.write(
    c(
      C.dim,
      `Summary: ${full.stats.danger} danger · ${full.stats.warning} warning · ${full.stats.info} info\n`,
    ),
  );
  if (full.stats.danger > 0) {
    process.stdout.write(c(C.red, "Exit code 1: danger findings present.\n"));
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// Auto-invoke when executed as a script (e.g. via `tsx src/cli.ts` from the
// shipped bin shim). Exported `run` remains importable from tests.
const invokedAsScript =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("cli.ts") || process.argv[1].endsWith("cli.js"));

if (invokedAsScript) {
  run(process.argv.slice(2)).catch((err: unknown) => {
    const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
    process.stderr.write(`${msg}\n`);
    process.exit(1);
  });
}
