export interface LiveReadingItem {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly summary: string;
  readonly publishedAt: string | null;
  readonly sourceName: string;
  readonly level: "N3" | "N2" | "N1" | "N1+";
  readonly lane:
    | "news"
    | "magazine"
    | "science"
    | "technology"
    | "culture"
    | "public"
    | "university"
    | "travel";
  readonly domain: string;
}

export interface ReadingFeedSource {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly homepage: string;
  readonly level: LiveReadingItem["level"];
  readonly lane: LiveReadingItem["lane"];
}

export const READING_FEEDS: readonly ReadingFeedSource[] = [
  {
    id: "nippon-latest",
    name: "nippon.com · Latest",
    url: "https://www.nippon.com/ja/feed/",
    homepage: "https://www.nippon.com/ja/",
    level: "N2",
    lane: "magazine",
  },
  {
    id: "nippon-news",
    name: "nippon.com · News",
    url: "https://www.nippon.com/ja/rss-others/news.xml",
    homepage: "https://www.nippon.com/ja/news/",
    level: "N2",
    lane: "news",
  },
  {
    id: "riken-press",
    name: "RIKEN · Research",
    url: "https://www.riken.jp/feed/press_feed/",
    homepage: "https://www.riken.jp/press/",
    level: "N1",
    lane: "science",
  },
  {
    id: "riken-closeup",
    name: "RIKEN · Close-up",
    url: "https://www.riken.jp/feed/closeup_feed/",
    homepage: "https://www.riken.jp/pr/closeup/",
    level: "N2",
    lane: "science",
  },
  {
    id: "nhk-top",
    name: "NHK · 主要ニュース",
    url: "https://www3.nhk.or.jp/rss/news/cat0.xml",
    homepage: "https://www3.nhk.or.jp/news/",
    level: "N2",
    lane: "news",
  },
  {
    id: "bbc-japanese",
    name: "BBC News Japan",
    url: "https://feeds.bbci.co.uk/japanese/rss.xml",
    homepage: "https://www.bbc.com/japanese",
    level: "N2",
    lane: "news",
  },
  {
    id: "asahi-headlines",
    name: "朝日新聞 · 新着",
    url: "https://www.asahi.com/rss/asahi/newsheadlines.rdf",
    homepage: "https://www.asahi.com/",
    level: "N2",
    lane: "news",
  },
  {
    id: "mainichi-flash",
    name: "毎日新聞 · 速報",
    url: "https://mainichi.jp/rss/etc/mainichi-flash.rss",
    homepage: "https://mainichi.jp/",
    level: "N2",
    lane: "news",
  },
  {
    id: "gigazine",
    name: "GIGAZINE",
    url: "https://gigazine.net/news/rss_2.0/",
    homepage: "https://gigazine.net/",
    level: "N2",
    lane: "technology",
  },
  {
    id: "gizmodo",
    name: "Gizmodo Japan",
    url: "https://www.gizmodo.jp/index.xml",
    homepage: "https://www.gizmodo.jp/",
    level: "N2",
    lane: "technology",
  },
  {
    id: "lifehacker",
    name: "Lifehacker Japan",
    url: "https://www.lifehacker.jp/feed/index.xml",
    homepage: "https://www.lifehacker.jp/",
    level: "N2",
    lane: "magazine",
  },
  {
    id: "wired-japan",
    name: "WIRED Japan",
    url: "https://wired.jp/rssfeeder/",
    homepage: "https://wired.jp/",
    level: "N1",
    lane: "technology",
  },
  {
    id: "itmedia-news",
    name: "ITmedia NEWS",
    url: "https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml",
    homepage: "https://www.itmedia.co.jp/news/",
    level: "N2",
    lane: "technology",
  },
  {
    id: "atmarkit",
    name: "＠IT",
    url: "https://rss.itmedia.co.jp/rss/2.0/ait.xml",
    homepage: "https://atmarkit.itmedia.co.jp/",
    level: "N1",
    lane: "technology",
  },
  {
    id: "impress-watch",
    name: "Impress Watch",
    url: "https://www.watch.impress.co.jp/data/rss/1.0/ipw/feed.rdf",
    homepage: "https://www.watch.impress.co.jp/",
    level: "N2",
    lane: "technology",
  },
  {
    id: "pc-watch",
    name: "PC Watch",
    url: "https://pc.watch.impress.co.jp/data/rss/1.0/pcw/feed.rdf",
    homepage: "https://pc.watch.impress.co.jp/",
    level: "N2",
    lane: "technology",
  },
  {
    id: "internet-watch",
    name: "INTERNET Watch",
    url: "https://internet.watch.impress.co.jp/data/rss/1.0/internet/feed.rdf",
    homepage: "https://internet.watch.impress.co.jp/",
    level: "N2",
    lane: "technology",
  },
  {
    id: "av-watch",
    name: "AV Watch",
    url: "https://av.watch.impress.co.jp/data/rss/1.0/avw/feed.rdf",
    homepage: "https://av.watch.impress.co.jp/",
    level: "N2",
    lane: "technology",
  },
  {
    id: "car-watch",
    name: "Car Watch",
    url: "https://car.watch.impress.co.jp/data/rss/1.0/car/feed.rdf",
    homepage: "https://car.watch.impress.co.jp/",
    level: "N2",
    lane: "magazine",
  },
  {
    id: "game-watch",
    name: "GAME Watch",
    url: "https://game.watch.impress.co.jp/data/rss/1.0/gmw/feed.rdf",
    homepage: "https://game.watch.impress.co.jp/",
    level: "N2",
    lane: "culture",
  },
  {
    id: "cnet-japan",
    name: "CNET Japan",
    url: "https://japan.cnet.com/rss/index.rdf",
    homepage: "https://japan.cnet.com/",
    level: "N2",
    lane: "technology",
  },
  {
    id: "zdnet-japan",
    name: "ZDNET Japan",
    url: "https://japan.zdnet.com/rss/index.rdf",
    homepage: "https://japan.zdnet.com/",
    level: "N1",
    lane: "technology",
  },
  {
    id: "ascii",
    name: "ASCII.jp",
    url: "https://ascii.jp/rss.xml",
    homepage: "https://ascii.jp/",
    level: "N2",
    lane: "technology",
  },
  {
    id: "mynavi-news",
    name: "マイナビニュース",
    url: "https://news.mynavi.jp/rss/index",
    homepage: "https://news.mynavi.jp/",
    level: "N2",
    lane: "magazine",
  },
  {
    id: "science-portal",
    name: "Science Portal",
    url: "https://scienceportal.jst.go.jp/feed/",
    homepage: "https://scienceportal.jst.go.jp/",
    level: "N1",
    lane: "science",
  },
  {
    id: "jaxa",
    name: "JAXA",
    url: "https://www.jaxa.jp/rss/jaxa_j.xml",
    homepage: "https://www.jaxa.jp/",
    level: "N1",
    lane: "science",
  },
  {
    id: "kobe-university",
    name: "神戸大学 · 研究ニュース",
    url: "https://www.kobe-u.ac.jp/ja/news/article/rss.xml",
    homepage: "https://www.kobe-u.ac.jp/ja/news/article/",
    level: "N1",
    lane: "university",
  },
  {
    id: "hokkaido-university",
    name: "北海道大学 · 研究",
    url: "https://www.hokudai.ac.jp/news/rss.xml",
    homepage: "https://www.hokudai.ac.jp/news/",
    level: "N1",
    lane: "university",
  },
  {
    id: "tohoku-university",
    name: "東北大学 · ニュース",
    url: "https://www.tohoku.ac.jp/japanese/newimg/rss.php",
    homepage: "https://www.tohoku.ac.jp/japanese/newimg/",
    level: "N1",
    lane: "university",
  },
  {
    id: "tsukuba-journal",
    name: "筑波大学 · TSUKUBA JOURNAL",
    url: "https://www.tsukuba.ac.jp/journal/feed/",
    homepage: "https://www.tsukuba.ac.jp/journal/",
    level: "N1",
    lane: "university",
  },
  {
    id: "waseda",
    name: "早稲田大学",
    url: "https://www.waseda.jp/top/news/feed",
    homepage: "https://www.waseda.jp/top/news",
    level: "N1",
    lane: "university",
  },
  {
    id: "keio",
    name: "慶應義塾",
    url: "https://www.keio.ac.jp/ja/news/rss.xml",
    homepage: "https://www.keio.ac.jp/ja/news/",
    level: "N1",
    lane: "university",
  },
  {
    id: "digital-agency",
    name: "デジタル庁",
    url: "https://www.digital.go.jp/rss/news.xml",
    homepage: "https://www.digital.go.jp/news",
    level: "N1",
    lane: "public",
  },
  {
    id: "environment-ministry",
    name: "環境省 · 報道発表",
    url: "https://www.env.go.jp/rss/press.xml",
    homepage: "https://www.env.go.jp/press/",
    level: "N1+",
    lane: "public",
  },
  {
    id: "npo-portal",
    name: "内閣府 NPOホームページ",
    url: "https://www.npo-homepage.go.jp/npo_news/feed/rdf",
    homepage: "https://www.npo-homepage.go.jp/npo_news/",
    level: "N1",
    lane: "public",
  },
  {
    id: "joc",
    name: "日本オリンピック委員会",
    url: "https://www.joc.or.jp/rss/news.xml",
    homepage: "https://www.joc.or.jp/news/",
    level: "N2",
    lane: "culture",
  },
  {
    id: "matcha",
    name: "MATCHA · 日本語",
    url: "https://matcha-jp.com/jp/feed",
    homepage: "https://matcha-jp.com/jp",
    level: "N3",
    lane: "travel",
  },
  {
    id: "fashionsnap",
    name: "FASHIONSNAP",
    url: "https://www.fashionsnap.com/feed/",
    homepage: "https://www.fashionsnap.com/",
    level: "N2",
    lane: "culture",
  },
  {
    id: "pr-times",
    name: "PR TIMES",
    url: "https://prtimes.jp/index.rdf",
    homepage: "https://prtimes.jp/",
    level: "N2",
    lane: "magazine",
  },
] as const;

const decodeEntities = (value: string): string =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;|&#38;/gi, "&")
    .replace(/&lt;|&#60;/gi, "<")
    .replace(/&gt;|&#62;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/\s+/g, " ")
    .trim();

const tagValue = (block: string, names: readonly string[]): string => {
  for (const name of names) {
    const match = block.match(
      new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"),
    );
    if (match?.[1]) return decodeEntities(match[1]);
  }
  return "";
};

const atomLink = (block: string): string => {
  const alternate =
    block.match(
      /<link\b(?=[^>]*\brel=["']alternate["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*\/?>/i,
    ) ?? block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i);
  return decodeEntities(alternate?.[1] ?? "");
};

const stableId = (source: string, url: string, title: string): string => {
  let hash = 2166136261;
  for (const character of `${source}|${url}|${title}`) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `live-${(hash >>> 0).toString(16)}`;
};

export function parseReadingFeed(
  xml: string,
  source: ReadingFeedSource,
): LiveReadingItem[] {
  const rssBlocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(
    (match) => match[1],
  );
  const atomBlocks = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map(
    (match) => match[1],
  );
  const blocks = rssBlocks.length > 0 ? rssBlocks : atomBlocks;
  return blocks
    .map((block): LiveReadingItem | null => {
      const title = tagValue(block, ["title"]);
      const url =
        tagValue(block, ["link", "guid"]) ||
        atomLink(block);
      if (title === "" || !/^https:\/\//i.test(url)) return null;
      const published =
        tagValue(block, ["pubDate", "published", "updated", "dc:date"]) || null;
      const parsedDate =
        published === null || Number.isNaN(Date.parse(published))
          ? null
          : new Date(published).toISOString();
      return {
        id: stableId(source.name, url, title),
        title,
        url,
        summary: tagValue(block, [
          "description",
          "summary",
          "content:encoded",
          "content",
        ]).slice(0, 1_200),
        publishedAt: parsedDate,
        sourceName: source.name,
        level: source.level,
        lane: source.lane,
        domain: new URL(url).hostname,
      };
    })
    .filter((item): item is LiveReadingItem => item !== null);
}

export const ARTICLE_HOSTS = [
  ...new Set(
    READING_FEEDS.flatMap((source) => [
      new URL(source.homepage).hostname,
      new URL(source.url).hostname,
    ]),
  ),
  "www.aozora.gr.jp",
  "aozora.gr.jp",
] as const;

const ARTICLE_DOMAINS = [
  ...new Set(
    ARTICLE_HOSTS.map((hostname) =>
      hostname.startsWith("www.") ? hostname.slice(4) : hostname,
    ),
  ),
];

export function allowedArticleUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (
      !ARTICLE_DOMAINS.some(
        (domain) =>
          url.hostname === domain || url.hostname.endsWith(`.${domain}`),
      )
    )
      return null;
    if (url.username !== "" || url.password !== "" || url.port !== "") return null;
    return url;
  } catch {
    return null;
  }
}

export function readableTextFromHtml(html: string): {
  readonly title: string;
  readonly text: string;
} {
  const title = decodeEntities(
    html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ??
      html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
      "",
  );
  const structuredBodies = [...html.matchAll(/"articleBody"\s*:\s*("(?:\\.|[^"\\])*")/gi)]
    .map((match) => {
      try {
        return JSON.parse(match[1]) as string;
      } catch {
        return "";
      }
    })
    .filter((value) => value.length >= 40);
  const withoutNoise = html
    .replace(/<(script|style|noscript|svg|nav|footer|form)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const main =
    withoutNoise.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    withoutNoise.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    withoutNoise.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ??
    withoutNoise;
  const paragraphs = `${structuredBodies.join("\n\n")}\n\n${main}`
    .replace(/<(br|hr)\b[^>]*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|h1|h2|h3|li|blockquote)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .split(/\n+/)
    .map((part) => decodeEntities(part))
    .filter(
      (part) =>
        part.length >= 18 &&
        /[\u3040-\u30ff\u3400-\u9fff]/u.test(part) &&
        !/^(メニュー|ホーム|サイトマップ|関連記事|シェア|広告|Copyright)/i.test(
          part,
        ),
    );
  return {
    title,
    text: [...new Set(paragraphs)].join("\n\n").slice(0, 120_000),
  };
}
