import type { MetadataRoute } from "next";
import { rules } from "@/lib/diagnostic-rules";
import { notesSource, runbookSource, source } from "@/lib/source";
import { cheatsheets } from "@/lib/cheatsheet-data";
import { errors } from "@/lib/errors-data";
import { CANONICAL_ORIGIN } from "@/lib/canonical-origin";
import { WORKBENCH_TOOLS } from "@/lib/workbench-registry";
import { PROTOCOL_LABS } from "@/lib/protocol-lab";

const BASE = CANONICAL_ORIGIN;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/learn`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/notes`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/diagnose`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/diagnose/rules`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/simulate`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/protocol`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/runbooks`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/errors`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/kips`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/workbench`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/rss.xml`, lastModified: now, changeFrequency: "weekly", priority: 0.3 },
    { url: `${BASE}/notes/rss.xml`, lastModified: now, changeFrequency: "weekly", priority: 0.3 },
  ];

  // Workbench tool routes from authoritative registry
  const workbenchRoutes: MetadataRoute.Sitemap = WORKBENCH_TOOLS.map((tool) => ({
    url: `${BASE}/workbench/${tool.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  // Protocol Lab routes from authoritative registry
  const protocolLabRoutes: MetadataRoute.Sitemap = PROTOCOL_LABS.map((lab) => ({
    url: `${BASE}/protocol/${lab.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const articleRoutes: MetadataRoute.Sitemap = source
    .getPages()
    .filter((p) => p.slugs.length > 0)
    .map((p) => {
      const date = (p.data as { date?: string }).date;
      return {
        url: `${BASE}${p.url}`,
        lastModified: date ? new Date(date) : now,
        changeFrequency: "monthly" as const,
        priority: 0.7,
      };
    });

  const cheatsheetRoutes: MetadataRoute.Sitemap = cheatsheets.map((sheet) => ({
    url: `${BASE}/learn/cheatsheet/${sheet.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  const runbookRoutes: MetadataRoute.Sitemap = runbookSource
    .getPages()
    .filter((p) => p.slugs.length > 0)
    .map((p) => {
      const date = (p.data as { date?: string }).date;
      return {
        url: `${BASE}${p.url}`,
        lastModified: date ? new Date(date) : now,
        changeFrequency: "monthly" as const,
        priority: 0.7,
      };
    });

  const noteRoutes: MetadataRoute.Sitemap = notesSource
    .getPages()
    .filter((p) => p.slugs.length > 0)
    .map((p) => {
      const date = (p.data as { date?: string }).date;
      return {
        url: `${BASE}${p.url}`,
        lastModified: date ? new Date(date) : now,
        changeFrequency: "monthly" as const,
        priority: 0.7,
      };
    });

  const ruleRoutes: MetadataRoute.Sitemap = rules.map((rule) => ({
    url: `${BASE}/diagnose/rules/${rule.id}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const errorRoutes: MetadataRoute.Sitemap = errors.map((entry) => ({
    url: `${BASE}/errors/${entry.id}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [
    ...staticRoutes,
    ...workbenchRoutes,
    ...protocolLabRoutes,
    ...articleRoutes,
    ...cheatsheetRoutes,
    ...runbookRoutes,
    ...noteRoutes,
    ...ruleRoutes,
    ...errorRoutes,
  ];
}
