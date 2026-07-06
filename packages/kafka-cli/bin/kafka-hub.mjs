#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const distEntry = join(here, "..", "dist", "cli.js");
const sourceEntry = join(here, "..", "src", "cli.ts");

let command = process.execPath;
let args = [distEntry, ...process.argv.slice(2)];

if (!existsSync(distEntry)) {
  const candidates = [
    join(here, "..", "node_modules", ".bin", "tsx"),
    join(here, "..", "..", "..", "node_modules", ".bin", "tsx"),
  ];
  const tsx = candidates.find((candidate) => existsSync(candidate));

  if (!tsx || !existsSync(sourceEntry)) {
    console.error(
      "kafka-hub: built CLI entry is missing. Reinstall the package or run `pnpm --filter @kafka-hub/kafka-cli build`.",
    );
    process.exit(127);
  }

  command = tsx;
  args = [sourceEntry, ...process.argv.slice(2)];
}

const result = spawnSync(command, args, { stdio: "inherit" });
process.exit(result.status ?? 1);
