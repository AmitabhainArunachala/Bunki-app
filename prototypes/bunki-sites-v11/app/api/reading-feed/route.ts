import {
  parseReadingFeed,
  READING_FEEDS,
  type LiveReadingItem,
} from "../../lib/reading-feeds";

export const runtime = "edge";

export async function GET(): Promise<Response> {
  const results = await Promise.all(
    READING_FEEDS.map(async (source): Promise<LiveReadingItem[]> => {
      try {
        const response = await fetch(source.url, {
          headers: {
            Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
            "User-Agent": "Bunki-Living-Japanese/1.0",
          },
          signal: AbortSignal.timeout(7_000),
        });
        if (!response.ok) return [];
        const xml = await response.text();
        if (xml.length > 2_000_000) return [];
        return parseReadingFeed(xml, source).slice(0, 16);
      } catch {
        return [];
      }
    }),
  );
  const items = [...new Map(
    results
      .flat()
      .map((item) => [item.url, item] as const),
  ).values()]
    .sort((left, right) =>
      (right.publishedAt ?? "").localeCompare(left.publishedAt ?? ""),
    )
    .slice(0, 600);
  const sources = READING_FEEDS.map((source, index) => ({
    id: source.id,
    name: source.name,
    homepage: source.homepage,
    domain:
      results[index]?.[0]?.domain ?? new URL(source.homepage).hostname,
    lane: source.lane,
    level: source.level,
    articleCount: results[index].length,
    available: results[index].length > 0,
  }));
  return Response.json(
    {
      items,
      sources,
      articleCount: items.length,
      availableSourceCount: sources.filter((source) => source.available).length,
      configuredSourceCount: sources.length,
      refreshedAt: new Date().toISOString(),
      partial: results.some((itemsForSource) => itemsForSource.length === 0),
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=1800",
      },
    },
  );
}
