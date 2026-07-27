#!/usr/bin/env node

import { access, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const server = path.join(standalone, "server.js");
const standaloneNext = path.join(standalone, ".next");

await access(server);
await rm(path.join(standalone, "public"), { recursive: true, force: true });
await rm(path.join(standaloneNext, "static"), {
  recursive: true,
  force: true,
});
await mkdir(standaloneNext, { recursive: true });

// `public/` currently has no tracked files, and git does not track empty
// directories, so it may not exist at all on a fresh checkout (e.g. in CI).
// Only copy it if it's actually present to avoid an ENOENT crash.
const publicDir = path.join(root, "public");
if (await pathExists(publicDir)) {
  await cp(publicDir, path.join(standalone, "public"), { recursive: true });
} else {
  await mkdir(path.join(standalone, "public"), { recursive: true });
}

await cp(path.join(root, ".next", "static"), path.join(standaloneNext, "static"), {
  recursive: true,
});

async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

console.log("Prepared Next.js standalone public and static assets.");
