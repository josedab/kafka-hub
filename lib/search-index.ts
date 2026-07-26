/**
 * Unified local search index for Fumadocs `createSearchAPI("simple")`.
 *
 * Content is read from version-controlled MDX at index-build time so Learn
 * and Field Notes body text remains searchable alongside structured data surfaces.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Index } from "fumadocs-core/search/server";
import { errors } from "./errors-data";
import { kips } from "./kips-data";
import { cheatsheets } from "./cheatsheet-data";
import { rules, RULE_DOCUMENTATION } from "./diagnostic-rules";
import { SCENARIO_LIST } from "@kafka-hub/kafka-sim";
import { WORKBENCH_TOOLS } from "./workbench-registry";
import { PROTOCOL_LABS } from "./protocol-lab";

interface MdxFrontmatter {
  title: string;
  description: string;
  tags: string[];
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatter(raw: string, fallbackTitle: string): {
  frontmatter: MdxFrontmatter;
  body: string;
} {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const block = match?.[1] ?? "";
  const readField = (name: string) =>
    unquote(block.match(new RegExp(`^${name}:\\s*(.+)$`, "m"))?.[1] ?? "");
  const tagsValue = block.match(/^tags:\s*\[(.*)\]\s*$/m)?.[1] ?? "";

  return {
    frontmatter: {
      title: readField("title") || fallbackTitle,
      description: readField("description"),
      tags: tagsValue
        .split(",")
        .map(unquote)
        .filter(Boolean),
    },
    body: match ? raw.slice(match[0].length) : raw,
  };
}

function toSearchableText(mdx: string): string {
  return mdx
    .replace(/^(?:import|export)\s.+$/gm, " ")
    .replace(/```[\w-]*\r?\n?/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_>#{}|~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mdxIndexes(
  directory: "learn" | "runbooks" | "notes",
  label: "Learn" | "Runbooks" | "Field Notes",
): Index[] {
  const contentDir = join(process.cwd(), "content", directory);

  return readdirSync(contentDir)
    .filter((file) => file.endsWith(".mdx"))
    .sort()
    .map((file) => {
      const slug = file.slice(0, -4);
      const fallbackTitle = slug.replaceAll("-", " ");
      const raw = readFileSync(join(contentDir, file), "utf8");
      const { frontmatter, body } = parseFrontmatter(raw, fallbackTitle);
      const url =
        directory === "learn" && slug === "index"
          ? "/learn"
          : `/${directory}/${slug}`;

      return {
        title: frontmatter.title,
        description: frontmatter.description,
        url,
        breadcrumbs: [label, frontmatter.title],
        content: toSearchableText(body),
        keywords: [slug, ...frontmatter.tags].join(" "),
      };
    });
}

function errorIndexes(): Index[] {
  return errors.map((entry) => ({
    title: entry.name,
    description: entry.summary,
    url: `/errors/${entry.id}`,
    breadcrumbs: ["Errors", entry.name],
    content: [entry.summary, entry.cause, entry.fix, entry.fqcn ?? ""].join(" "),
    keywords: [
      entry.where,
      entry.retriable ? "retriable" : "not-retriable",
      entry.name,
      entry.id,
    ].join(" "),
  }));
}

function kipIndexes(): Index[] {
  return kips.map((entry) => ({
    title: `KIP-${entry.id}: ${entry.title}`,
    description: entry.plainSummary,
    url: `/kips#kip-${entry.id}`,
    breadcrumbs: ["KIPs", `KIP-${entry.id}`],
    content: [entry.plainSummary, entry.why, entry.title].join(" "),
    keywords: [
      `KIP-${entry.id}`,
      entry.status,
      entry.versionShipped ?? "",
      entry.title,
    ].join(" "),
  }));
}

function cheatsheetIndexes(): Index[] {
  return cheatsheets.map((sheet) => ({
    title: sheet.title,
    description: sheet.oneliner,
    url: `/learn/cheatsheet/${sheet.slug}`,
    breadcrumbs: ["Learn", "Cheatsheets", sheet.title],
    content: [
      sheet.oneliner,
      ...sheet.heuristics,
      ...sheet.dangerList,
      ...sheet.keySettings.map((setting) =>
        [setting.key, setting.typicalValue, setting.note, setting.dangerIfWrong ?? ""].join(" "),
      ),
    ].join(" "),
    keywords: [
      sheet.slug,
      ...sheet.keySettings.map((setting) => setting.key),
      ...sheet.relatedRules,
      ...(sheet.relatedScenarios ?? []),
    ].join(" "),
  }));
}

function ruleIndexes(): Index[] {
  return rules.map((rule) => {
    const doc = RULE_DOCUMENTATION[rule.id];
    return {
      title: doc?.title ?? rule.id,
      description: doc?.whyItMatters ?? "",
      url: `/diagnose/rules/${rule.id}`,
      breadcrumbs: ["Diagnose", "Rules", doc?.title ?? rule.id],
      content: [
        doc?.title ?? rule.id,
        doc?.whyItMatters ?? "",
        doc?.example ?? "",
        rule.id,
        rule.category,
      ].join(" "),
      keywords: [rule.id, rule.category].join(" "),
    };
  });
}

function scenarioIndexes(): Index[] {
  return SCENARIO_LIST.map((scenario) => ({
    title: scenario.title,
    description: scenario.blurb,
    url: `/simulate?scenario=${scenario.slug}`,
    breadcrumbs: ["Simulate", scenario.title],
    content: [
      scenario.title,
      scenario.blurb,
      ...scenario.script.map((operation) => operation.note ?? operation.kind),
    ].join(" "),
    keywords: [
      scenario.slug,
      scenario.consumerGroup?.groupProtocol ?? "",
      scenario.consumerGroup?.classicAssignmentBehavior ?? "",
      scenario.consumerGroup?.assignor ?? "",
      "simulator",
      "scenario",
    ].join(" "),
  }));
}

function workbenchToolIndexes(): Index[] {
  return WORKBENCH_TOOLS.map((tool) => ({
    title: tool.title,
    description: tool.description,
    url: `/workbench/${tool.slug}`,
    breadcrumbs: ["Workbench", tool.title],
    content: [tool.title, tool.description].join(" "),
    keywords: [tool.slug, "workbench", "tool", "triage"].join(" "),
  }));
}

function protocolLabIndexes(): Index[] {
  return PROTOCOL_LABS.map((lab) => ({
    title: lab.title,
    description: lab.tagline,
    url: `/protocol/${lab.slug}`,
    breadcrumbs: ["Protocol", lab.title],
    content: [lab.tagline, lab.blurb, ...lab.focusAreas, ...lab.variants.map((v) => v.label)].join(" "),
    keywords: [lab.slug, "protocol lab", ...lab.focusAreas].join(" "),
  }));
}

export function buildSearchIndexes(): Index[] {
  return [
    ...mdxIndexes("learn", "Learn"),
    ...mdxIndexes("runbooks", "Runbooks"),
    ...mdxIndexes("notes", "Field Notes"),
    ...errorIndexes(),
    ...kipIndexes(),
    ...cheatsheetIndexes(),
    ...ruleIndexes(),
    ...scenarioIndexes(),
    ...workbenchToolIndexes(),
    ...protocolLabIndexes(),
  ].sort((a, b) => a.url.localeCompare(b.url));
}
