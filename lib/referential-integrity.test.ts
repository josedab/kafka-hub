/**
 * Referential integrity tests.
 *
 * Tests cross-surface data relationships without importing Fumadocs source
 * (which requires top-level await and can't run under tsx test runner).
 * Learn/runbook slug validation is tested indirectly: if a referenced slug
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
import { glossaryTerms, learnArticleTitles, type LearnArticleSlug } from "../components/glossary/terms";
import { NAV_LINKS } from "./nav-links";
import { buildSearchIndexes } from "./search-index";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ruleIds = new Set(rules.map((r) => r.id));
const errorIds = new Set(errors.map((e) => e.id));
const scenarioSlugs = new Set(SCENARIO_LIST.map((s) => s.slug));
const workbenchSlugs = new Set(WORKBENCH_TOOLS.map((t) => t.slug));
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

// Validate learn slugs via file existence
const contentDir = join(import.meta.dirname, "..", "content");

function learnFileExists(slug: string): boolean {
  return existsSync(join(contentDir, "learn", `${slug}.mdx`));
}
function runbookFileExists(slug: string): boolean {
  return existsSync(join(contentDir, "runbooks", `${slug}.mdx`));
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
  if (path === "/learn" || path === "/kips" || path === "/simulate") return true;
  if (path.startsWith("/learn/cheatsheet/")) {
    return cheatsheets.some(
      (sheet) => `/learn/cheatsheet/${sheet.slug}` === path,
    );
  }
  if (path.startsWith("/learn/")) return learnSlugs.has(path.slice("/learn/".length));
  if (path.startsWith("/runbooks/")) {
    return runbookSlugs.has(path.slice("/runbooks/".length));
  }
  if (path.startsWith("/errors/")) return errorIds.has(path.slice("/errors/".length));
  if (path.startsWith("/diagnose/rules/")) {
    return ruleIds.has(path.slice("/diagnose/rules/".length));
  }
  if (path.startsWith("/workbench/")) {
    return workbenchSlugs.has(path.slice("/workbench/".length));
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
});
