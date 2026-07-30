import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  READING_CATALOG,
  nextReaderWordDepth,
  readingMinutes,
  suggestedReadingsForLevel,
  textForReadingLength,
} from "../app/lib/reading-catalog.ts";
import {
  ARTICLE_HOSTS,
  READING_FEEDS,
  allowedArticleUrl,
  parseReadingFeed,
  readableTextFromHtml,
} from "../app/lib/reading-feeds.ts";

test("reading catalog separates real texts from clearly marked originals", () => {
  assert.ok(READING_CATALOG.some((item) => item.real && !item.generated));
  assert.ok(READING_CATALOG.some((item) => !item.real && item.generated));
  assert.ok(
    READING_CATALOG.some(
      (item) => item.lane === "primary" || item.lane === "literature",
    ),
  );
  assert.ok(READING_CATALOG.some((item) => item.level === "N5"));
  assert.ok(READING_CATALOG.some((item) => item.level === "N1+"));
});

test("short and medium reading selections preserve sentence boundaries", () => {
  const full = READING_CATALOG.find((item) => item.level === "N1")?.text ?? "";
  const short = textForReadingLength(full, "short");
  const medium = textForReadingLength(full, "medium");
  assert.ok(short.length > 100);
  assert.ok(short.length < medium.length);
  assert.ok(medium.length <= full.length);
  assert.match(short, /[。！？]…$/u);
  assert.equal(textForReadingLength(full, "full"), full);
  assert.ok(readingMinutes(full) >= 1);
});

test("Today recommendations always contain readable Japanese text", () => {
  for (const level of ["zero", "N5", "N4", "N3", "N2", "N1", "N1+"]) {
    const suggestions = suggestedReadingsForLevel(
      level,
      ["News", "Spirituality"],
      3,
    );
    assert.equal(suggestions.length, 3);
    for (const item of suggestions) {
      assert.ok(item.text.trim().length >= 120);
      assert.match(item.text, /[\p{Script=Hiragana}\p{Script=Han}]/u);
    }
  }
});

test("a word advances through reading, meaning, dictionary, then memorize", () => {
  let depth = nextReaderWordDepth(0, false);
  assert.equal(depth, 1);
  depth = nextReaderWordDepth(depth, true);
  assert.equal(depth, 2);
  depth = nextReaderWordDepth(depth, true);
  assert.equal(depth, 3);
  depth = nextReaderWordDepth(depth, true);
  assert.equal(depth, 4);
  assert.equal(nextReaderWordDepth(depth, true), 4);
  assert.equal(nextReaderWordDepth(depth, false), 1);
});

test("RSS and Atom metadata become bounded live reading items", () => {
  const source = {
    name: "Test publisher",
    url: "https://example.test/feed.xml",
    level: "N2",
    lane: "news",
  };
  const rss = `<?xml version="1.0"?><rss><channel><item>
    <title><![CDATA[山のニュース]]></title>
    <link>https://www.nippon.com/ja/test/</link>
    <description><![CDATA[<p>山についての新しい記事です。</p>]]></description>
    <pubDate>Thu, 30 Jul 2026 01:00:00 GMT</pubDate>
  </item></channel></rss>`;
  const [item] = parseReadingFeed(rss, source);
  assert.equal(item.title, "山のニュース");
  assert.equal(item.summary, "山についての新しい記事です。");
  assert.equal(item.level, "N2");
  assert.equal(item.lane, "news");
  assert.match(item.id, /^live-/);
  assert.match(item.publishedAt, /^2026-07-30T01:00:00/);
});

test("the immersion registry spans dozens of independently readable domains", () => {
  const articleDomains = new Set(
    READING_FEEDS.map((source) => new URL(source.homepage).hostname),
  );
  assert.ok(READING_FEEDS.length >= 36);
  assert.ok(articleDomains.size >= 30);
  assert.ok(ARTICLE_HOSTS.length >= articleDomains.size);
  for (const source of READING_FEEDS) {
    assert.match(source.id, /^[a-z0-9-]+$/);
    assert.equal(new URL(source.url).protocol, "https:");
    assert.equal(new URL(source.homepage).protocol, "https:");
  }
});

test("immersion cards and titles share one obvious Bunki Reader action", async () => {
  const component = await readFile(
    new URL("../app/components/bunki-phase2.tsx", import.meta.url),
    "utf8",
  );
  assert.match(component, /Tap anywhere on a card—including its title—to open Bunki Reader/);
  assert.match(component, /aria-label=\{`Read \$\{item\.title\} in Bunki Reader`\}/);
  assert.match(component, /onClick=\{\(\) => void importLiveReading\(item\)\}/);
  assert.match(component, /PUBLISHER SUMMARY ONLY/);
  assert.match(component, /PUBLISHER FEED TEXT/);
  assert.match(component, /AbortSignal\.timeout\(15_000\)/);
  assert.match(component, /Pick up where you left off/);
  assert.match(component, /For you · \{readingLevel\}/);
});

test("article import allowlist rejects credentials, redirects, and arbitrary hosts", () => {
  assert.equal(
    allowedArticleUrl("https://www.riken.jp/press/2026/example/")?.hostname,
    "www.riken.jp",
  );
  assert.equal(
    allowedArticleUrl("https://digital.asahi.com/articles/example/")?.hostname,
    "digital.asahi.com",
  );
  assert.equal(allowedArticleUrl("http://www.riken.jp/press/"), null);
  assert.equal(allowedArticleUrl("https://user@www.riken.jp/press/"), null);
  assert.equal(allowedArticleUrl("https://evil.example/article"), null);
  assert.equal(allowedArticleUrl("https://riken.jp.evil.example/article"), null);
});

test("article extraction keeps Japanese prose and drops navigation noise", () => {
  const result = readableTextFromHtml(`<!doctype html><html><head>
    <title>研究記事 | 出版社</title><style>bad</style></head><body>
    <nav>メニュー ホーム サイトマップ</nav>
    <article><h1>新しい研究成果</h1>
      <p>研究チームは、新しい観測方法を開発しました。これにより、以前は見えなかった変化を詳しく調べることができます。</p>
      <p>今後は、別の条件でも同じ結果が得られるかを確認します。</p>
    </article><footer>Copyright</footer></body></html>`);
  assert.equal(result.title, "新しい研究成果");
  assert.match(result.text, /研究チーム/);
  assert.match(result.text, /今後は/);
  assert.doesNotMatch(result.text, /メニュー|Copyright/);
});

test("article extraction recovers Japanese JSON-LD bodies", () => {
  const result = readableTextFromHtml(`<!doctype html><html><head>
    <title>文化の記事</title>
    <script type="application/ld+json">{"@type":"NewsArticle","articleBody":"祭りの歴史をたどると、地域の暮らしと祈りが深く結びついていたことが分かります。\\n今年は若い世代も準備に参加し、新しい形で伝統を受け継いでいます。"}</script>
  </head><body><div id="app"></div></body></html>`);
  assert.match(result.text, /祭りの歴史/);
  assert.match(result.text, /若い世代/);
});

test("reader and review focus surfaces stay intentionally minimal", async () => {
  const [component, styles] = await Promise.all([
    readFile(
      new URL("../app/components/bunki-phase2.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/phase2.css", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(component, /className="p2-sentence-play"/);
  assert.doesNotMatch(component, /Read current sentence aloud/);
  assert.match(component, /Reading atmosphere/);
  assert.match(component, /\[1, "Soon"\]/);
  assert.match(component, /\[2, "Hard"\]/);
  assert.match(component, /\[3, "Medium"\]/);
  assert.match(component, /\[4, "Easy"\]/);
  assert.match(
    styles,
    /\.p2-reader-token\.ambiguous\s*\{\s*text-decoration:\s*none;/,
  );
  assert.match(
    styles,
    /\.p2-review\.session-active \.p2-card-manager\s*\{\s*display:\s*none;/,
  );
});

test("reader dictionary kanji drill into full pages and preserve the source return", async () => {
  const [component, styles] = await Promise.all([
    readFile(
      new URL("../app/components/bunki-phase2.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/phase2.css", import.meta.url), "utf8"),
  ]);
  assert.match(component, /aria-label=\{`Open \$\{entry\.char\} kanji page`\}/);
  assert.match(component, /data-kanji-character=\{entry\.char\}/);
  assert.match(component, /openReaderKanji\(entry\)/);
  assert.match(component, /setKanjiReturnContext\(\{/);
  assert.match(component, /setZenMode\(false\)/);
  assert.match(component, /setKanjiFocusMode\(true\)/);
  assert.match(component, /setView\("library"\)/);
  assert.match(component, /Back to source sentence/);
  assert.match(component, /setReaderSentence\(kanjiReturnContext\.sentenceIndex\)/);
  assert.match(component, /setImmerseMode\("reader"\)/);
  assert.match(component, /Examples from your immersion/);
  assert.match(component, /Replay stroke order/);
  assert.match(component, /stageKanjiRecognitionCard/);
  assert.match(component, /Recognize the kanji inside the exact sentence/);
  assert.match(component, /Sentence kanji · \$\{selectedKanji\.char\}/);
  assert.match(component, /Mine sentence/);
  assert.match(styles, /\.p2-kanji-reader-return\s*\{/);
  assert.match(styles, /\.p2-sheet-kanji button:hover/);
  assert.match(styles, /touch-action:\s*manipulation/);
  assert.match(styles, /-webkit-touch-callout:\s*default/);
  assert.match(styles, /\.p2-app\.kanji-focus \.p2-sidebar/);
});
