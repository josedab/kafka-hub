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
await cp(path.join(root, "public"), path.join(standalone, "public"), {
  recursive: true,
});
await cp(path.join(root, ".next", "static"), path.join(standaloneNext, "static"), {
  recursive: true,
});

console.log("Prepared Next.js standalone public and static assets.");
