import { notesSource } from "@/lib/source";
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
  const date = page.data.date ? new Date(page.data.date) : new Date(0);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

export async function GET() {
  const baseUrl = CANONICAL_ORIGIN;
  const pages = notesSource
    .getPages()
    .filter((page) => page.slugs.length > 0)
    .sort((a, b) => getDate(b).getTime() - getDate(a).getTime());
  const lastBuildDate = (pages[0] ? getDate(pages[0]) : new Date(0)).toUTCString();

  const items = pages
    .map((page) => {
      const url = `${baseUrl}${page.url}`;
      return `    <item>
      <title>${escapeXml(page.data.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${getDate(page).toUTCString()}</pubDate>
      <description>${escapeXml(page.data.description ?? "")}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(site.name)} — Field Notes</title>
    <link>${baseUrl}/notes</link>
    <atom:link href="${baseUrl}/notes/rss.xml" rel="self" type="application/rss+xml" />
    <description>${escapeXml(notesDescription)}</description>
    <language>en</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
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

const notesDescription =
  "Release-aware field reports, protocol experiments, and engineering decisions from the Kafka edge.";
