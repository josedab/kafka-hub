/**
 * Referential integrity tests.
 *
 * Tests cross-surface data relationships without importing Fumadocs source
 * (which requires top-level await and can't run under tsx test runner).
 * Learn/runbook/note slug validation is tested indirectly: if a referenced slug
 * doesn't exist as a content file, the build will fail with a broken link.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { errors } from "./errors-data";
import { kips } from "./kips-data";
import { cheatsheets } from "./cheatsheet-data";
import { evaluate, rules, RULE_DOCUMENTATION } from "./diagnostic-rules";
import { SCENARIO_LIST } from "@kafka-hub/kafka-sim";
import { WORKBENCH_TOOLS } from "./workbench-registry";
import { PROTOCOL_LABS } from "./protocol-lab";
import { glossaryTerms, learnArticleTitles, type LearnArticleSlug } from "../components/glossary/terms";
import { NAV_LINKS } from "./nav-links";
import { buildSearchIndexes } from "./search-index";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ruleIds = new Set(rules.map((r) => r.id));
const errorIds = new Set(errors.map((e) => e.id));
const scenarioSlugs = new Set(SCENARIO_LIST.map((s) => s.slug));
const workbenchSlugs = new Set(WORKBENCH_TOOLS.map((t) => t.slug));
const protocolLabSlugs = new Set<string>(PROTOCOL_LABS.map((lab) => lab.slug));
const kipIds = new Set(kips.map((kip) => kip.id));
const learnSlugs = new Set(
  readdirSync(join(import.meta.dirname, "..", "content", "learn"))
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => file.slice(0, -4)),
);
const runbookSlugs = new Set(
  readdirSync(join(import.meta.dirname, "..", "content", "runbooks"))
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => file.slice(0, -4)),
);
const noteSlugs = new Set(
  readdirSync(join(import.meta.dirname, "..", "content", "notes"))
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => file.slice(0, -4)),
);

// Validate learn slugs via file existence
const contentDir = join(import.meta.dirname, "..", "content");

function learnFileExists(slug: string): boolean {
  return existsSync(join(contentDir, "learn", `${slug}.mdx`));
}
function runbookFileExists(slug: string): boolean {
  return existsSync(join(contentDir, "runbooks", `${slug}.mdx`));
}
function noteFileExists(slug: string): boolean {
  return existsSync(join(contentDir, "notes", `${slug}.mdx`));
}

type ContentCollection = "learn" | "runbooks" | "notes";

function localContentLinks(): Array<{ source: string; href: string }> {
  const links: Array<{ source: string; href: string }> = [];

  for (const collection of ["learn", "runbooks", "notes"] as const satisfies readonly ContentCollection[]) {
    const directory = join(contentDir, collection);
    for (const file of readdirSync(directory).filter((name) => name.endsWith(".mdx"))) {
      const raw = readFileSync(join(directory, file), "utf8");
      const matches = raw.matchAll(/\[[^\]]+\]\((\/[^)\s]+)\)/g);
      for (const match of matches) {
        links.push({ source: `${collection}/${file}`, href: match[1] });
      }
    }
  }

  return links;
}

function isShippedContentUrl(href: string): boolean {
  const url = new URL(href, "https://kafka-hub.dev");
  const path = url.pathname;
  const staticPaths = new Set([
    "/",
    "/learn",
    "/notes",
    "/runbooks",
    "/diagnose",
    "/diagnose/rules",
    "/simulate",
    "/protocol",
    "/errors",
    "/kips",
    "/workbench",
    "/rss.xml",
    "/notes/rss.xml",
  ]);

  if (staticPaths.has(path)) {
    if (path !== "/kips" || !url.hash.startsWith("#kip-")) return true;
    const kipId = Number(url.hash.slice("#kip-".length));
    return Number.isInteger(kipId) && kipIds.has(kipId);
  }
  if (path.startsWith("/learn/cheatsheet/")) {
    return cheatsheets.some((sheet) => `/learn/cheatsheet/${sheet.slug}` === path);
  }
  if (path.startsWith("/learn/")) {
    return learnSlugs.has(path.slice("/learn/".length));
  }
  if (path.startsWith("/notes/")) {
    return noteSlugs.has(path.slice("/notes/".length));
  }
  if (path.startsWith("/runbooks/")) {
    return runbookSlugs.has(path.slice("/runbooks/".length));
  }
  if (path.startsWith("/simulate")) {
    const scenario = url.searchParams.get("scenario");
    return scenario === null || scenarioSlugs.has(scenario);
  }
  if (path.startsWith("/protocol/")) {
    return protocolLabSlugs.has(path.slice("/protocol/".length));
  }
  if (path.startsWith("/errors/")) {
    return errorIds.has(path.slice("/errors/".length));
  }
  if (path.startsWith("/diagnose/rules/")) {
    return ruleIds.has(path.slice("/diagnose/rules/".length));
  }
  if (path.startsWith("/workbench/")) {
    return workbenchSlugs.has(path.slice("/workbench/".length));
  }
  return false;
}

function articleScenarioSlugs(): Array<{ article: string; scenario: string }> {
  const refs: Array<{ article: string; scenario: string }> = [];
  for (const file of readdirSync(join(contentDir, "learn")).filter((name) =>
    name.endsWith(".mdx"),
  )) {
    const raw = readFileSync(join(contentDir, "learn", file), "utf8");
    const value = raw.match(/^scenarios:\s*\[(.*)\]\s*$/m)?.[1];
    for (const scenario of value?.match(/"([^"]+)"/g) ?? []) {
      refs.push({
        article: file.slice(0, -4),
        scenario: scenario.slice(1, -1),
      });
    }
  }
  return refs;
}

function isShippedSearchUrl(urlValue: string): boolean {
  const url = new URL(urlValue, "https://kafka-hub.dev");
  const path = url.pathname;
  if (
    path === "/learn" ||
    path === "/notes" ||
    path === "/kips" ||
    path === "/simulate"
  ) {
    return true;
  }
  if (path.startsWith("/learn/cheatsheet/")) {
    return cheatsheets.some(
      (sheet) => `/learn/cheatsheet/${sheet.slug}` === path,
    );
  }
  if (path.startsWith("/learn/")) return learnSlugs.has(path.slice("/learn/".length));
  if (path.startsWith("/runbooks/")) {
    return runbookSlugs.has(path.slice("/runbooks/".length));
  }
  if (path.startsWith("/notes/")) {
    return noteSlugs.has(path.slice("/notes/".length));
  }
  if (path.startsWith("/errors/")) return errorIds.has(path.slice("/errors/".length));
  if (path.startsWith("/diagnose/rules/")) {
    return ruleIds.has(path.slice("/diagnose/rules/".length));
  }
  if (path.startsWith("/workbench/")) {
    return workbenchSlugs.has(path.slice("/workbench/".length));
  }
  if (path === "/protocol") return true;
  if (path.startsWith("/protocol/")) {
    return protocolLabSlugs.has(path.slice("/protocol/".length));
  }
  return false;
}

describe("referential integrity", () => {
  it("error learnSlug references existing learn content files", () => {
    for (const entry of errors) {
      if (entry.learnSlug) {
        assert.ok(
          learnFileExists(entry.learnSlug),
          `Error ${entry.id} references nonexistent learn slug: ${entry.learnSlug}`,
        );
      }
    }
  });

  it("error runbookSlug references existing runbook content files", () => {
    for (const entry of errors) {
      if (entry.runbookSlug) {
        assert.ok(
          runbookFileExists(entry.runbookSlug),
          `Error ${entry.id} references nonexistent runbook slug: ${entry.runbookSlug}`,
        );
      }
    }
  });

  it("Field Notes searchable content files exist", () => {
    for (const slug of noteSlugs) {
      assert.ok(noteFileExists(slug), `Missing Field Note content: ${slug}`);
    }
  });

  it("error IDs are unique", () => {
    assert.equal(errorIds.size, errors.length, "Duplicate error IDs");
  });

  it("KIP learnSlug references existing learn content files", () => {
    for (const entry of kips) {
      if (entry.learnSlug) {
        assert.ok(
          learnFileExists(entry.learnSlug),
          `KIP-${entry.id} references nonexistent learn slug: ${entry.learnSlug}`,
        );
      }
    }
  });

  it("KIP scenarioSlug references valid scenarios", () => {
    for (const entry of kips) {
      if (entry.scenarioSlug) {
        assert.ok(
          scenarioSlugs.has(entry.scenarioSlug),
          `KIP-${entry.id} references nonexistent scenario slug: ${entry.scenarioSlug}`,
        );
      }
    }
  });

  it("KIP IDs are unique", () => {
    const ids = kips.map((k) => k.id);
    assert.equal(new Set(ids).size, ids.length, "Duplicate KIP IDs");
  });

  it("cheatsheet relatedRules reference valid rule IDs", () => {
    for (const sheet of cheatsheets) {
      for (const ruleId of sheet.relatedRules) {
        assert.ok(
          ruleIds.has(ruleId),
          `Cheatsheet ${sheet.slug} references nonexistent rule: ${ruleId}`,
        );
      }
    }
  });

  it("cheatsheet relatedScenarios reference valid scenario slugs", () => {
    for (const sheet of cheatsheets) {
      for (const scenarioSlug of sheet.relatedScenarios ?? []) {
        assert.ok(
          scenarioSlugs.has(scenarioSlug),
          `Cheatsheet ${sheet.slug} references nonexistent scenario: ${scenarioSlug}`,
        );
      }
    }
  });

  it("cheatsheet slugs reference existing Learn articles", () => {
    for (const sheet of cheatsheets) {
      assert.ok(
        learnFileExists(sheet.slug),
        `Cheatsheet ${sheet.slug} has no matching Learn article`,
      );
    }
  });

  it("rule documentation exists for all rules", () => {
    for (const rule of rules) {
      assert.ok(
        RULE_DOCUMENTATION[rule.id],
        `Rule ${rule.id} has no documentation entry`,
      );
    }
  });

  it("rule documentation has no orphan entries", () => {
    assert.deepEqual(
      Object.keys(RULE_DOCUMENTATION).sort(),
      [...ruleIds].sort(),
    );
  });

  it("rule example findings only reference shipped Learn/scenario content", () => {
    for (const rule of rules) {
      const report = evaluate(RULE_DOCUMENTATION[rule.id].example, [rule]);
      for (const finding of report.findings) {
        if (finding.learnSlug) {
          assert.ok(
            learnFileExists(finding.learnSlug),
            `${rule.id}: missing Learn slug ${finding.learnSlug}`,
          );
        }
        if (finding.simulateSlug) {
          assert.ok(
            scenarioSlugs.has(finding.simulateSlug),
            `${rule.id}: missing scenario ${finding.simulateSlug}`,
          );
        }
      }
    }
  });

  it("article scenario frontmatter references valid scenarios", () => {
    for (const reference of articleScenarioSlugs()) {
      assert.ok(
        scenarioSlugs.has(reference.scenario),
        `${reference.article}: missing scenario ${reference.scenario}`,
      );
    }
  });

  it("glossary article slugs reference existing learn content files", () => {
    for (const term of glossaryTerms) {
      for (const slug of term.articleSlugs) {
        assert.ok(
          learnFileExists(slug),
          `Glossary term "${term.name}" references nonexistent learn slug: ${slug}`,
        );
      }
    }
  });

  it("glossary learnArticleTitles shows human titles not raw slugs", () => {
    const titleKeys = Object.keys(learnArticleTitles) as LearnArticleSlug[];
    for (const key of titleKeys) {
      assert.ok(
        String(learnArticleTitles[key]) !== String(key),
        `learnArticleTitles[${key}] should be a human title, not the raw slug`,
      );
    }
  });

  it("NAV_LINKS urls start with /", () => {
    for (const link of NAV_LINKS) {
      assert.ok(link.url.startsWith("/"), `Nav link URL must start with /: ${link.url}`);
    }
  });

  it("workbench tool slugs are unique", () => {
    assert.equal(workbenchSlugs.size, WORKBENCH_TOOLS.length, "Duplicate workbench tool slugs");
  });

  it("every Workbench registry entry has a shipped route", () => {
    for (const tool of WORKBENCH_TOOLS) {
      assert.ok(
        existsSync(
          join(import.meta.dirname, "..", "app", "workbench", tool.slug, "page.tsx"),
        ),
        `Workbench tool ${tool.slug} has no route`,
      );
    }
  });

  it("every unified search URL resolves to a shipped local route", () => {
    for (const index of buildSearchIndexes()) {
      assert.ok(isShippedSearchUrl(index.url), `Unshipped search URL: ${index.url}`);
    }
  });

  it("all local Learn, Runbook, and Field Note links resolve", () => {
    for (const link of localContentLinks()) {
      assert.ok(
        isShippedContentUrl(link.href),
        `${link.source}: unshipped local link ${link.href}`,
      );
    }
  });

  it("Protocol Lab slugs are unique", () => {
    assert.equal(protocolLabSlugs.size, PROTOCOL_LABS.length, "Duplicate Protocol Lab slugs");
  });

  it("the Protocol Lab dynamic [slug] route is shipped", () => {
    assert.ok(
      existsSync(join(import.meta.dirname, "..", "app", "protocol", "[slug]", "page.tsx")),
      "Protocol Lab is missing app/protocol/[slug]/page.tsx",
    );
  });

  it("Protocol Lab learnSlugs reference existing learn content files", () => {
    for (const lab of PROTOCOL_LABS) {
      for (const slug of lab.links.learnSlugs ?? []) {
        assert.ok(
          learnFileExists(slug),
          `Protocol Lab ${lab.slug} references nonexistent learn slug: ${slug}`,
        );
      }
    }
  });

  it("Protocol Lab errorIds reference existing error catalog entries", () => {
    for (const lab of PROTOCOL_LABS) {
      for (const id of lab.links.errorIds ?? []) {
        assert.ok(
          errorIds.has(id),
          `Protocol Lab ${lab.slug} references nonexistent error: ${id}`,
        );
      }
    }
  });

  it("Protocol Lab kipIds reference existing KIP catalog entries", () => {
    for (const lab of PROTOCOL_LABS) {
      for (const id of lab.links.kipIds ?? []) {
        assert.ok(
          kipIds.has(id),
          `Protocol Lab ${lab.slug} references nonexistent KIP-${id}`,
        );
      }
    }
  });

  it("Protocol Lab scenarioSlugs reference existing Simulate scenarios", () => {
    for (const lab of PROTOCOL_LABS) {
      for (const slug of lab.links.scenarioSlugs ?? []) {
        assert.ok(
          scenarioSlugs.has(slug),
          `Protocol Lab ${lab.slug} references nonexistent scenario: ${slug}`,
        );
      }
    }
  });

  it("Protocol Lab runbookSlugs reference existing runbook content files", () => {
    for (const lab of PROTOCOL_LABS) {
      for (const slug of lab.links.runbookSlugs ?? []) {
        assert.ok(
          runbookFileExists(slug),
          `Protocol Lab ${lab.slug} references nonexistent runbook slug: ${slug}`,
        );
      }
    }
  });
});