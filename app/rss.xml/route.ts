import { source } from "@/lib/source";
import { CANONICAL_ORIGIN } from "@/lib/canonical-origin";
import { site } from "@/lib/site";

export const dynamic = "force-static";
export const revalidate = false;

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getDate(page: { data: { date?: string } }): Date {
  return page.data.date ? new Date(page.data.date) : new Date(0);
}

export async function GET() {
  const baseUrl = CANONICAL_ORIGIN;
  const pages = source
    .getPages()
    .filter((p) => p.slugs.length > 0)
    .sort((a, b) => getDate(b).getTime() - getDate(a).getTime());

  const items = pages
    .map((page) => {
      const url = `${baseUrl}${page.url}`;
      const title = escapeXml(page.data.title);
      const description = escapeXml(page.data.description ?? "");
      const pubDate = getDate(page).toUTCString();
      return `    <item>
      <title>${title}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${description}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(site.name)} — Learn</title>
    <link>${baseUrl}/learn</link>
    <atom:link href="${baseUrl}/rss.xml" rel="self" type="application/rss+xml" />
    <description>${escapeXml(site.description)}</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
