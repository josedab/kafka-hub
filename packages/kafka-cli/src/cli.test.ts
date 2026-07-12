import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import packageJson from "../package.json";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(packageRoot, "src", "cli.ts");

function invoke(args: string[], input?: string) {
  return spawnSync(process.execPath, ["--import", "tsx", source, ...args], {
    cwd: packageRoot,
    encoding: "utf8",
    input,
  });
}

test("CLI prints help without loading external services", () => {
  const result = invoke(["--help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /kafka-hub diagnose <file>/);
  assert.equal(result.stderr, "");
});

test("CLI reads stdin, filters JSON findings, and preserves danger exit codes", () => {
  const result = invoke(["diagnose", "-", "--json", "--min", "warning"], [
    "unclean.leader.election.enable=true",
    "acks=1",
  ].join("\n"));

  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout) as {
    findings: Array<{ severity: string }>;
  };
  assert.ok(report.findings.length > 0);
  assert.equal(
    report.findings.every((finding) =>
      finding.severity === "warning" || finding.severity === "danger"
    ),
    true,
  );
  assert.equal(result.stderr, "");
});

test("CLI rejects invalid severity flags with a usage exit code", () => {
  const result = invoke(["diagnose", "-", "--min", "critical"], "acks=all");

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Invalid --min value: critical/);
});

test("CLI version comes from the package manifest", () => {
  const result = invoke(["--version"]);

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), packageJson.version);
});

test("CLI rejects unknown commands", () => {
  const result = invoke(["inspect"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown command: inspect/);
  assert.match(result.stderr, /USAGE/);
});

test("CLI reports missing diagnose input", () => {
  const result = invoke(["diagnose"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /missing input file/);
});

test("CLI rejects unknown arguments", () => {
  const result = invoke(["diagnose", "-", "--wat"], "acks=all");

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown argument: --wat/);
});

test("CLI prints a clean text report with exit code zero", () => {
  const result = invoke(
    ["diagnose", "-", "--min", "danger"],
    [
      "acks=all",
      "enable.idempotence=true",
      "max.in.flight.requests.per.connection=5",
      "retries=2147483647",
      "delivery.timeout.ms=120000",
    ].join("\n"),
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /no findings at this severity threshold/);
});

test("CLI text report includes relative Learn links and summary", () => {
  const result = invoke(
    ["diagnose", "-"],
    "unclean.leader.election.enable=true",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /\/learn\/unclean-leader-election/);
  assert.match(result.stdout, /Summary:/);
  assert.match(result.stdout, /Exit code 1/);
});

test("CLI reads a properties file", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "kafka-hub-cli-"));
  const file = resolve(directory, "server.properties");
  writeFileSync(file, "auto.create.topics.enable=true\n", "utf8");

  try {
    const result = invoke(["diagnose", file, "--json"]);
    assert.equal(result.status, 0);
    const report = JSON.parse(result.stdout) as {
      parsedKeys: number;
      findings: Array<{ ruleId: string }>;
    };
    assert.equal(report.parsedKeys, 1);
    assert.ok(
      report.findings.some((finding) => finding.ruleId === "auto-create-topics"),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
