import type { MetadataRoute } from "next";
import { rules } from "@/lib/diagnostic-rules";
import { runbookSource, source } from "@/lib/source";
import { cheatsheets } from "@/lib/cheatsheet-data";
import { errors } from "@/lib/errors-data";
import { site } from "@/lib/site";
import { SCENARIO_LIST } from "@kafka-hub/kafka-sim";

const BASE = site.url.replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/learn`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/diagnose`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/diagnose/rules`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/simulate`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/runbooks`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/errors`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/kips`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/rss.xml`, lastModified: now, changeFrequency: "weekly", priority: 0.3 },
  ];

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

  const embedRoutes: MetadataRoute.Sitemap = SCENARIO_LIST.map((s) => ({
    url: `${BASE}/simulate/embed/${s.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.4,
  }));

  return [
    ...staticRoutes,
    ...articleRoutes,
    ...cheatsheetRoutes,
    ...runbookRoutes,
    ...ruleRoutes,
    ...errorRoutes,
    ...embedRoutes,
  ];
}
