import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bin = resolve(packageRoot, "bin", "kafka-hub.mjs");

function invoke(args: string[], input?: string) {
  return spawnSync(process.execPath, [bin, ...args], {
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
