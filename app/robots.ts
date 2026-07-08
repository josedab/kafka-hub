import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

const BASE = site.url.replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // The embed routes are deliberately noindex via meta robots (set in
        // app/simulate/embed/[scenario]/page.tsx); we still allow crawl so
        // the SimulateClient assets can be discovered for documentation tools.
        disallow: ["/api/"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
