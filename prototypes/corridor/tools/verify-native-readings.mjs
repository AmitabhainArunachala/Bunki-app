/**
 * Browser acceptance for every one of the 30 added native 本棚 readings.
 *
 * This drives the real served corridor at 390×844 with touch input, on a
 * pinned shelf day. Each article is opened from its one `.shelf-item` card
 * (in the grid or today's six), then exercises its own
 * JSON load, reader/ruby/paragraphs, text settings, quick look, full entry,
 * completion, bookmark, Back, shelf scroll return, and article-position
 * restoration. No representative-only shortcut and no alternate reader.
 *
 * B3 (bilingual titles as schema data): every primary index row must carry a
 * non-empty titleEn with a titleEnSource provenance marker, the code-side
 * TITLES_EN map must be gone from corridor.js, the bilingual (?ui=bi) shelf
 * must render each English title from the record itself, and every
 * human-review-pending story must be counted in the masthead's 未確認 note
 * and wear 未確認 in its reader meta line.
 *
 * R3-A (furigana truth): the reading-override lexicon
 * (docs/content/reading-overrides.json) must be minted into every curated
 * body — the suspect-reading rules are re-run here in JS over all curated
 * tokens (deity-name 神 reads かみ-family ruby, never an unreviewed しん;
 * no lexicon site unapplied; no rubyless kanji token; no unreviewed 都(と)
 * or unknown-word kanji fallback), the committed checker report must agree
 * with that recount with zero open rows, and the flagship article's DOM must
 * render the lexicon readings as its actual ruby.
 *
 * Usage:
 *   CHROMIUM_PATH=/path/to/chromium node tools/verify-native-readings.mjs
 *   node tools/verify-native-readings.mjs --shots DIR --report FILE
 */

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';
import { resolveCorridorSite, resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { readAppRecord, waitForAppRecord } from './record-test-support.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolveCorridorSite();
const REPO = resolve(HERE, '..', '..', '..');
const VIEWPORT = { width: 390, height: 844 };
const SOURCE = resolve(REPO, 'docs/content/bunki-originals-zoka-sanjin.jsonl');
const DEFAULT_EVIDENCE = resolveCorridorEvidence();
const REFERENCE_SHELF = resolve(REPO, 'docs/prototype/screenshots/14-phase1-shelf-v11.png');
const REFERENCE_READER = resolve(REPO, 'docs/prototype/screenshots/16-phase1-v11-article.png');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ttf': 'font/ttf',
};
const VERIFY_FONTS = {
  '/__verify-fonts/serif.ttf': process.env.VERIFY_SERIF_FONT,
  '/__verify-fonts/sans.ttf': process.env.VERIFY_SANS_FONT,
};

const argValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? resolve(process.argv[index + 1]) : fallback;
};
const shotsDir = argValue('--shots', resolve(DEFAULT_EVIDENCE, 'screenshots'));
const reportPath = argValue(
  '--report',
  resolve(DEFAULT_EVIDENCE, 'browser-verification.json'),
);

const authored = readFileSync(SOURCE, 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map(JSON.parse);
const IDS = authored.map((record) => record.id);
const SHOT_IDS = new Set([
  'bunki-graded-n3-zoka-sanjin-morning',
  'bunki-essay-n2-silent-amenominakanushi',
  'bunki-essay-n1-prayer-reality',
]);

const fileSha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

function startServer(rootDir) {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent((request.url ?? '/').split('?')[0]);
    const verifyFont = VERIFY_FONTS[pathname];
    if (verifyFont && existsSync(verifyFont)) {
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': 'font/ttf',
      });
      response.end(readFileSync(verifyFont));
      return;
    }
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = resolve(rootDir, relative);
    if (!file.startsWith(rootDir) || !existsSync(file)) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    });
    response.end(readFileSync(file));
  });
  return new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      accept({ server, base: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

const touchAttempts = [];

async function touchAt(page, locator, holdMs = 0) {
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(35);
  const box = await locator.evaluate((node) => {
    const rect = node.getClientRects()[0] ?? node.getBoundingClientRect();
    const x = rect.x + rect.width / 2;
    const y = rect.y + Math.min(rect.height / 2, 20);
    const hit = document.elementFromPoint(x, y);
    window.__nativeIntendedTouch = node;
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      target: { tag: node.tagName, id: node.id, passage: node.dataset.passage },
      hit: hit ? { tag: hit.tagName, id: hit.id } : null,
      reachesTarget: hit === node || node.contains(hit),
      offsetLeft: window.visualViewport?.offsetLeft ?? 0,
      offsetTop: window.visualViewport?.offsetTop ?? 0,
    };
  });
  const attempt = { box, holdMs };
  touchAttempts.push(attempt);
  if (!box?.width || !box?.height) throw new Error('touch target has no rendered box');
  if (!box.reachesTarget) throw new Error(`touch target is obstructed: ${JSON.stringify(box)}`);
  const before = await page.evaluate(() => window.__nativeTargetClicks ?? 0);
  const point = {
    x: box.x + box.width / 2 - box.offsetLeft,
    y: box.y + Math.min(box.height / 2, 20) - box.offsetTop,
    radiusX: 6,
    radiusY: 6,
    force: 1,
  };
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point],
  });
  if (holdMs) await page.waitForTimeout(holdMs);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
  if (!holdMs) {
    try {
      await page.waitForFunction((count) => (window.__nativeTargetClicks ?? 0) > count, before, { timeout: 5000 });
    } finally {
      attempt.events = await page.evaluate(() => window.__nativeTouchTrace?.slice(-6) ?? []);
    }
  } else attempt.events = await page.evaluate(() => window.__nativeTouchTrace?.slice(-6) ?? []);
  await page.waitForTimeout(90);
}

async function settleReader(page) {
  await page.waitForSelector('#reader .tok', { timeout: 20_000 });
  await page.evaluate(() => {
    window.__nativeReadingTokenCount = -1;
    window.__nativeReadingReader = null;
  });
  await page.waitForFunction(
    () => {
      const reader = document.getElementById('reader');
      const count = reader?.querySelectorAll('.tok').length ?? 0;
      if (count > 0 && reader === window.__nativeReadingReader &&
          count === window.__nativeReadingTokenCount) return true;
      window.__nativeReadingReader = reader;
      window.__nativeReadingTokenCount = count;
      return false;
    },
    null,
    { polling: 180, timeout: 15_000 },
  );
}

async function setReaderDial(page, key, index) {
  const selector = `[data-dial="${key}:${index}"]`;
  const clicked = await page.locator(selector).elementHandle();
  if (!clicked) throw new Error(`Reader dial is missing: ${key}:${index}`);
  try {
    // An already-selected dial still commits asynchronously. Its old
    // aria-pressed value cannot acknowledge this tap. The actual clicked
    // button leaves the DOM only when the successful save renders the reader.
    await touchAt(page, clicked);
    await page.waitForFunction((node) => !node.isConnected, clicked, { timeout: 10_000 });
    const record = await waitForAppRecord(page, (value) => value.dials?.[key] === index,
      { description: `committed reader dial ${key}:${index}` });
    await settleReader(page);
    return {
      key,
      requested: index,
      persisted: record.dials[key],
      acknowledgedReplacement: true,
      selected: await page.locator(selector).getAttribute('aria-pressed') === 'true',
      enabled: await page.locator(selector).isEnabled(),
    };
  } finally {
    await clicked.dispose();
  }
}

async function openQuickLook(page, preferredIndex = 0) {
  const tokens = page.locator('#reader .tok.content');
  const count = await tokens.count();
  const candidates = [preferredIndex, 0, 1, 2].filter(
    (value, index, values) => value < count && values.indexOf(value) === index,
  );
  for (const index of candidates) {
    await touchAt(page, tokens.nth(index), 560);
    if (await page.locator('#sheet').count()) {
      throw new Error(`a quick-lookup hold must not open a full entry on release: ${JSON.stringify(touchAttempts.at(-1))}`);
    }
    const quick = await page.evaluate(() => {
      const mini = document.getElementById('mini');
      if (!mini) return null;
      return {
        word: mini.querySelector('.mini-word')?.textContent ?? '',
        reading: mini.querySelector('.mini-reading')?.textContent ?? '',
        gloss: mini.querySelector('.mini-gloss')?.textContent ?? '',
      };
    });
    if (quick?.word && quick.gloss && !/語釈なし|no gloss/.test(quick.gloss)) {
      return quick;
    }
    await page.evaluate(() => document.getElementById('mini')?.remove());
  }
  return null;
}

function expectedBaseText(record) {
  return record.tokens.map((token) => token.s).join('');
}

async function renderedBaseText(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('#reader .tok')]
      .map((token) => {
        const row = token.querySelector('.tok-word') ?? token;
        const clone = row.cloneNode(true);
        clone.querySelectorAll('rt, .tok-en').forEach((node) => node.remove());
        return clone.textContent ?? '';
      })
      .join(''),
  );
}

const results = [];
const failures = [];
function check(name, pass, detail = '', articleId = null) {
  const row = { name, pass: !!pass, detail: String(detail), articleId };
  results.push(row);
  if (!pass) failures.push(row);
  console.log(`${pass ? ' ok ' : 'FAIL'}  ${articleId ? `${articleId} · ` : ''}${name}${detail ? ` — ${detail}` : ''}`);
}

mkdirSync(shotsDir, { recursive: true });
mkdirSync(dirname(reportPath), { recursive: true });

const index = JSON.parse(readFileSync(resolve(CORRIDOR, 'data/articles/index.json'), 'utf8'));
const rows = new Map(index.articles.map((record) => [record.id, record]));
// B3 — the English title is schema data with provenance, not a code-side map.
// Counts are data (the feed grows the index 検収前-marked); composition is
// pinned by tools/verify-feed.mjs against the review queue, so these checks
// hold for EVERY row without hardcoding a census.
// fresh-shelf readings (feed_fresh.py) carry the authorship their titles file
// names; every other row keeps the two historical markers
const FRESH_TITLES = JSON.parse(
  readFileSync(new URL('../../../docs/content/feed-fresh-titles-en.json', import.meta.url), 'utf8'),
);
const TITLE_EN_SOURCES = new Set(['shelf-map-2026', 'renkan-ai-2026-08', FRESH_TITLES.titleEnSource]);
// rows still WAITING on a human — an 'approved' review value is a decided
// row (TENOHIRA Decision 4: the rubric may lift 検収前 where the committed
// queue says approved), and a decided row no longer wears the mark
const reviewRows = index.articles.filter((record) => /-pending$/.test(record.review ?? ''));
{
  const missingEn = index.articles.filter(
    (record) => typeof record.titleEn !== 'string' || !record.titleEn.trim(),
  );
  check(
    'every primary index row carries a non-empty titleEn',
    index.articles.length >= 70 && missingEn.length === 0,
    missingEn.length
      ? missingEn.map((record) => record.id).join(', ')
      : `${index.articles.length}/${index.articles.length}`,
  );
  const unsourced = index.articles.filter((record) => !TITLE_EN_SOURCES.has(record.titleEnSource));
  check(
    'every titleEn names its provenance in titleEnSource',
    unsourced.length === 0,
    unsourced.map((record) => record.id).join(', '),
  );
  // 検収前 no longer means one thing: the 30 recovered originals and the feed
  // mints wear AI-authored titles, while a row held for UNVERIFIED RIGHTS or
  // an unverified source text keeps whatever title it already had. The rule
  // is about who wrote the title, not about who is waiting.
  const aiTitled = new Set([...IDS, ...index.articles.filter((r) => r.addedAt && r.feed !== 'fresh').map((r) => r.id)]);
  const wrongMarker = index.articles.filter((record) =>
    record.feed === 'fresh'
      ? record.titleEnSource !== FRESH_TITLES.titleEnSource || FRESH_TITLES.titles?.[record.id] !== record.titleEn
      : aiTitled.has(record.id)
        ? record.titleEnSource !== 'renkan-ai-2026-08'
        : record.titleEnSource !== 'shelf-map-2026',
  );
  check(
    'the title marker names its author: AI for the recovered and minted rows, the fresh-shelf titles file for fresh readings, the shelf map for the rest',
    wrongMarker.length === 0,
    wrongMarker.map((r) => `${r.id}:${r.titleEnSource}`).slice(0, 4).join(', '),
  );
  // TENOHIRA Decision 4: the committed queue may lift an authored record out
  // of 検収前. Each of the 30 is paired to its queue row — approved means
  // review lifted and the mark gone, anything else means still pending AND
  // still visibly marked. A lift with no approved queue row still convicts.
  const reviewQueue = JSON.parse(
    readFileSync(new URL('../../../docs/content/feed-review-queue.json', import.meta.url), 'utf8'),
  );
  const legacyDecision = (id) =>
    reviewQueue.find((entry) => entry.id === id && entry.kind === 'legacy')?.decision ?? 'pending';
  check(
    'the 30 authored records answer to the queue: approved rows lifted, pending rows still 検収前',
    IDS.every((id) =>
      legacyDecision(id) === 'approved'
        ? rows.get(id)?.review === 'approved' && !/検収前/.test(rows.get(id)?.sourceLabel ?? '')
        : rows.get(id)?.review === 'human-review-pending' &&
          /検収前/.test(rows.get(id)?.sourceLabel ?? ''),
    ),
  );
  // RENKAN fleet — the archive is bilingual too: every remaining archive row
  // carries a non-empty titleEn, and the wrapper names the provenance.
  const archive = JSON.parse(
    readFileSync(resolve(CORRIDOR, 'data/articles/archive-index.json'), 'utf8'),
  );
  const archiveMissingEn = archive.articles.filter(
    (record) => typeof record.titleEn !== 'string' || !record.titleEn.trim(),
  );
  check(
    'every archive row carries a non-empty titleEn with wrapper provenance',
    archive.articles.length > 0 &&
      archiveMissingEn.length === 0 &&
      TITLE_EN_SOURCES.has(archive.titleEnSource),
    archiveMissingEn.length
      ? archiveMissingEn
          .slice(0, 5)
          .map((record) => record.id)
          .join(', ')
      : `${archive.articles.length} rows · source ${archive.titleEnSource}`,
  );
  check(
    'the code-side TITLES_EN map is gone from corridor.js — titles live in data only',
    !readFileSync(resolve(CORRIDOR, 'corridor.js'), 'utf8').includes('TITLES_EN'),
  );

  // R3-E — provenance dates are real strings or honest absences: a Python
  // None serialized as the word "None" must never reach a card's meta line
  // (the 野ばら regression), in either index or in any curated body.
  const STRINGIFIED_NULLS = new Set(['None', 'null', 'undefined']);
  const badDates = [];
  for (const record of index.articles) {
    if (STRINGIFIED_NULLS.has(String(record.date ?? '').trim())) badDates.push(record.id);
    const body = JSON.parse(
      readFileSync(resolve(CORRIDOR, 'data/articles', record.file), 'utf8'),
    );
    if (STRINGIFIED_NULLS.has(String(body.date ?? '').trim())) badDates.push(`${record.id} (body)`);
  }
  for (const record of archive.articles) {
    if (STRINGIFIED_NULLS.has(String(record.date ?? '').trim())) badDates.push(record.id);
  }
  check(
    'no index row or curated body carries a stringified null date',
    badDates.length === 0,
    badDates.slice(0, 5).join(', ') || `${index.articles.length} curated + ${archive.articles.length} archive rows clean`,
  );
  check(
    '野ばら (aozora:051034) records its unknown first-publication date as absence',
    rows.get('aozora:051034')?.date === '',
    JSON.stringify(rows.get('aozora:051034')?.date),
  );

  // R3-E — the JLPT-lexicon signal is computed with the deck's readings in
  // reach: kana-written base forms (する, ある, いる — the most common verbs
  // of the language) must never count as beyond-JLPT just because the deck
  // writes them 為る/在る/居る. Recompute every curated card's coverage from
  // its committed tokens with the reading-aware matcher and demand exact
  // agreement with the stored signal — a reverted matcher (or reverted data)
  // cannot satisfy both this and the spread probe below.
  const wbig = JSON.parse(
    readFileSync(resolve(REPO, 'prototypes/drift/data/wbig.json'), 'utf8'),
  );
  const KANA_RE = /^[ぁ-ゖァ-ヺー々〆〤ｦ-ﾟ]+$/u;
  const kataToHira = (value) =>
    [...value]
      .map((ch) => (ch >= 'ァ' && ch <= 'ヶ' ? String.fromCharCode(ch.charCodeAt(0) - 0x60) : ch))
      .join('');
  const ortho = new Map();
  const kana = new Map();
  for (const [word, reading, , level] of wbig) {
    if (!Number.isInteger(level)) continue;
    if (level > (ortho.get(word) ?? 0)) ortho.set(word, level);
    if (KANA_RE.test(word)) {
      const key = kataToHira(word);
      if (level > (kana.get(key) ?? 0)) kana.set(key, level);
    }
    if (reading) {
      const key = kataToHira(String(reading));
      if (level > (kana.get(key) ?? 0)) kana.set(key, level);
    }
  }
  const coverageOf = (tokens) => {
    const content = tokens.filter((token) => token.c);
    if (!content.length) return null;
    let oov = 0;
    for (const token of content) {
      let level = ortho.get(token.b);
      if (level == null && KANA_RE.test(token.b)) level = kana.get(kataToHira(token.b));
      if (level == null) oov += 1;
    }
    return 1 - oov / content.length;
  };
  const disagreeing = [];
  const oneInCensus = new Map();
  for (const record of index.articles) {
    const body = JSON.parse(
      readFileSync(resolve(CORRIDOR, 'data/articles', record.file), 'utf8'),
    );
    const stored = record.grading?.signals?.jlpt_lexicon?.coverage ?? null;
    const computed = coverageOf(body.tokens);
    if (
      (stored == null) !== (computed == null) ||
      (stored != null && Math.abs(stored - computed) > 1e-9)
    ) {
      disagreeing.push(`${record.id} stored=${stored} computed=${computed}`);
    }
    if (stored != null) {
      const label = stored >= 1 ? 'full' : String(Math.round(1 / (1 - stored)));
      oneInCensus.set(label, (oneInCensus.get(label) ?? 0) + 1);
    }
  }
  check(
    'every curated jlpt_lexicon coverage equals a reading-aware recompute from its own tokens',
    disagreeing.length === 0,
    disagreeing.slice(0, 3).join(' | ') || `${index.articles.length} cards agree`,
  );
  // the vocab note must discriminate between cards — the round-2 hunt found
  // 68 of 69 cards wearing the same "~1 in 2/3" line. Distinct per-card
  // ratios and no single ratio owning most of the shelf are properties of
  // the honest matcher; the broken one collapses to {2,3} and fails both.
  const censusTotal = [...oneInCensus.values()].reduce((sum, v) => sum + v, 0);
  const censusMax = Math.max(...oneInCensus.values());
  check(
    'the per-card vocab ratio discriminates — ≥6 distinct values, none covering >50% of cards',
    oneInCensus.size >= 6 && censusMax / censusTotal <= 0.5,
    `${oneInCensus.size} distinct 1-in-N values, largest share ${censusMax}/${censusTotal}`,
  );
}
// The shelf must render EXACTLY the curated index — no extras, none missing —
// one card per story: an N3 rewrite whose original stands folds into it, and
// a story in today's six stands in that band inside the grid, not twice.
// The count itself is data: the feed (R2-D) grows it 検収前-marked and
// queue-covered, and tools/verify-feed.mjs pins the composition (the
// inherited 70 plus the review queue's live mints) against the queue file.
const curatedRows = index.articles.filter(
  (record) => !String(record.file || '').startsWith('archive/'),
);
const standingIds = new Set(curatedRows.map((record) => record.id));
const storyRows = curatedRows.filter(
  (record) => !(record.adaptation?.basedOn && standingIds.has(record.adaptation.basedOn)),
);
const STORY_COUNT = storyRows.length;
const STORY_CARDS = '#shelf-reading-results .shelf-item';
const storyCard = (id) => `${STORY_CARDS}[data-passage="${id}"]`;
const storyVariant = (className) => className.match(/\bstory-(lead|second|grid|teaser)\b/u)?.[1] ?? null;
// Today's six change with the date. The shelf's own day seam pins a day whose six hold existing
// teasers beside added ones, so every added card has an existing card of its variant to match.
const SHELF_DAY = '2026-10-01';
const pendingStories = storyRows.filter((record) => reviewRows.includes(record));
const bodies = new Map(
  IDS.map((id) => {
    const row = rows.get(id);
    return [id, JSON.parse(readFileSync(resolve(CORRIDOR, 'data/articles', row.file), 'utf8'))];
  }),
);
const wordLayer = JSON.parse(
  readFileSync(resolve(CORRIDOR, 'data/share_alike/words.json'), 'utf8'),
).words;
const dictionaryLayer = JSON.parse(
  readFileSync(resolve(CORRIDOR, 'data/share_alike/dict.json'), 'utf8'),
).words;
const quickTokenIndex = new Map(
  [...bodies].map(([id, body]) => {
    let contentIndex = -1;
    let preferred = 0;
    for (const token of body.tokens) {
      if (!token.c) continue;
      contentIndex += 1;
      if (dictionaryLayer[token.b]?.m?.length || wordLayer[token.b]?.g) {
        preferred = contentIndex;
        break;
      }
    }
    return [id, preferred];
  }),
);

// ---------------------------------------------------------------- R3-A
// Furigana truth: the reading-override lexicon is DATA with provenance, the
// mint pipeline applies it at tokenization time, and these probes convict a
// reverted build on the committed bytes alone (no browser needed for this
// half). The rules mirror tools/check_suspect_readings.py exactly.
const FLAGSHIP_ID = 'bunki-graded-n3-zoka-sanjin-morning';
const KANJI_RE = /[㐀-䶵一-鿌豈-﫿]/;
const LEXICON_PATH = resolve(REPO, 'docs/content/reading-overrides.json');
const SUSPECT_REPORT_PATH = resolve(
  REPO,
  'docs/build-evidence/renkan/furigana-truth/suspect-readings.json',
);
const lexicon = JSON.parse(readFileSync(LEXICON_PATH, 'utf8'));
const curatedBodies = index.articles
  .filter((row) => !String(row.file || '').startsWith('archive/'))
  .map((row) => [
    row.id,
    JSON.parse(readFileSync(resolve(CORRIDOR, 'data/articles', row.file), 'utf8')),
  ]);
const sequenceSites = (tokens, entries) => {
  const ordered = [...entries].sort((a, b) => b.surfaces.length - a.surfaces.length);
  const sites = [];
  let i = 0;
  while (i < tokens.length) {
    const entry = ordered.find(
      (candidate) =>
        i + candidate.surfaces.length <= tokens.length &&
        candidate.surfaces.every((surface, j) => tokens[i + j].s === surface),
    );
    if (!entry) {
      i += 1;
      continue;
    }
    sites.push([i, entry]);
    i += entry.surfaces.length;
  }
  return sites;
};
{
  check(
    'the reading-override lexicon is committed with provenance and aligned entries',
    lexicon.kind === 'reading-override-lexicon' &&
      !!lexicon.provenance?.policy &&
      Array.isArray(lexicon.entries) &&
      lexicon.entries.length > 0 &&
      lexicon.entries.every(
        (entry) =>
          entry.word &&
          entry.reading &&
          Array.isArray(entry.surfaces) &&
          entry.surfaces.length === entry.readings.length &&
          !!entry.note,
      ),
    `${lexicon.entries?.length ?? 0} entries · ${lexicon.accepts?.length ?? 0} accepts`,
  );

  const recount = { 'lexicon-fixed': 0, accepted: 0, open: 0 };
  const openRows = [];
  let deityKamiSites = 0;
  let flagshipShin = 0;
  for (const [id, body] of curatedBodies) {
    const tokens = body.tokens;
    const acceptCover = new Set();
    for (const [start, entry] of sequenceSites(tokens, lexicon.accepts ?? [])) {
      const ok = entry.readings.every(
        (reading, j) => reading === null || tokens[start + j].r === reading,
      );
      if (ok) for (let j = 0; j < entry.surfaces.length; j += 1) acceptCover.add(start + j);
    }
    const tally = (i, rule, resolved) => {
      recount[resolved] += 1;
      if (resolved === 'open')
        openRows.push(`${id} #${i} ${tokens[i].s}(${tokens[i].r}) [${rule}]`);
    };
    for (const [start, entry] of sequenceSites(tokens, lexicon.entries)) {
      entry.readings.forEach((reading, j) => {
        if (reading === null) return;
        const token = tokens[start + j];
        const minted = token.r === reading && token.rs === 'lexicon';
        tally(start + j, 'override-site', minted ? 'lexicon-fixed' : 'open');
        if (entry.kind === 'deity-name' && /かみ$/.test(reading) && minted) deityKamiSites += 1;
      });
    }
    tokens.forEach((token, i) => {
      const covered = token.rs === 'lexicon';
      const accepted = acceptCover.has(i);
      const hasKanji = KANJI_RE.test(token.s);
      if (token.s === '神' && token.r !== 'かみ' && !covered) {
        tally(i, 'kami-on', accepted ? 'accepted' : 'open');
        if (id === FLAGSHIP_ID && !accepted) flagshipShin += 1;
      }
      if (hasKanji && !token.r && !covered) tally(i, 'empty-ruby', accepted ? 'accepted' : 'open');
      if (token.s === '都' && token.r === 'と' && !covered)
        tally(i, 'miyako', accepted ? 'accepted' : 'open');
      if (token.p === '記号' && hasKanji && !covered)
        tally(i, 'unk-kanji', accepted ? 'accepted' : 'open');
    });
  }
  check(
    'every lexicon override site is minted into the curated bodies — no suspect reading left open',
    recount.open === 0 && recount['lexicon-fixed'] > 0,
    openRows.slice(0, 4).join(' | ') ||
      `${recount['lexicon-fixed']} lexicon-fixed · ${recount.accepted} accepted across ${curatedBodies.length} bodies`,
  );
  check(
    'deity names read かみ-family ruby at every minted site; the flagship carries no unreviewed 神(しん)',
    deityKamiSites >= 90 && flagshipShin === 0,
    `${deityKamiSites} deity かみ sites · ${flagshipShin} unreviewed しん in ${FLAGSHIP_ID}`,
  );
  const suspectReport = JSON.parse(readFileSync(SUSPECT_REPORT_PATH, 'utf8'));
  const reportCounts = suspectReport.statusCounts ?? {};
  check(
    'the committed suspect-readings report is empty of unfixed rows and agrees with this recount',
    suspectReport.kind === 'suspect-readings-report' &&
      suspectReport.openCount === 0 &&
      suspectReport.rows.every((row) => row.status !== 'open') &&
      (reportCounts['lexicon-fixed'] ?? 0) === recount['lexicon-fixed'] &&
      (reportCounts.accepted ?? 0) === recount.accepted &&
      suspectReport.scanned?.articles === curatedBodies.length,
    `report ${reportCounts['lexicon-fixed'] ?? 0}/${reportCounts.accepted ?? 0}/${suspectReport.openCount} vs recount ${recount['lexicon-fixed']}/${recount.accepted}/${recount.open}`,
  );
}

const executablePath = process.env.CHROMIUM_PATH || undefined;
const { server, base } = await startServer(CORRIDOR);
const articleResults = [];
const noise = [];
let browser;
let browserVersion = null;
let activeArticleId = null;
let journeyCompleted = false;
let page;
let failureEvidence = null;
try {
  browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  browserVersion = await browser.version();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    screen: VIEWPORT,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  await context.addInitScript((day) => {
    try { localStorage.setItem('kairo-shelf-day', day); } catch { /* storage refused: the census below still runs */ }
    window.__nativeTouchTrace = [];
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click']) {
      addEventListener(type, (event) => {
        const intended = window.__nativeIntendedTouch;
        const reachesTarget = Boolean(intended && (event.target === intended || intended.contains(event.target)));
        if (type === 'click' && reachesTarget) window.__nativeTargetClicks = (window.__nativeTargetClicks ?? 0) + 1;
        window.__nativeTouchTrace.push({ type, at: performance.now(), reachesTarget,
          tag: event.target.tagName, id: event.target.id, classes: String(event.target.className),
          mini: Boolean(event.target.closest('#mini')), sheet: Boolean(event.target.closest('#sheet')),
          x: event.clientX, y: event.clientY, offsetTop: window.visualViewport?.offsetTop ?? 0 });
        window.__nativeTouchTrace = window.__nativeTouchTrace.slice(-24);
      }, true);
    }
  }, SHELF_DAY);
  page = await context.newPage();
  const responses = new Map();
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      noise.push({ kind: `console.${message.type()}`, text: message.text() });
    }
  });
  page.on('pageerror', (error) => noise.push({ kind: 'pageerror', text: String(error) }));
  page.on('requestfailed', (request) =>
    noise.push({
      kind: 'requestfailed',
      text: `${request.url()} ${request.failure()?.errorText ?? ''}`,
    }),
  );
  page.on('response', (response) => {
    responses.set(new URL(response.url()).pathname, response.status());
    if (response.status() >= 400) {
      noise.push({ kind: 'http', text: `${response.url()} → ${response.status()}` });
    }
  });

  await page.goto(`${base}/index.html?entry=shelf&ui=ja&cachebust=${Date.now()}`, {
    waitUntil: 'load',
  });
  await page.waitForFunction(
    (expected) =>
      document.body.dataset.ready === '1' &&
      document.querySelectorAll(expected.cards).length === expected.count,
    { cards: STORY_CARDS, count: STORY_COUNT },
    { timeout: 30_000 },
  );
  // Minimal CI Chromium images often ship without CJK fonts. These optional
  // test-only files satisfy font names already present in the product's native
  // stack; they neither alter corridor source nor introduce a visual theme.
  if (VERIFY_FONTS['/__verify-fonts/serif.ttf'] && VERIFY_FONTS['/__verify-fonts/sans.ttf']) {
    await page.addStyleTag({
      content: `
        @font-face { font-family: 'Noto Serif JP'; src: url('/__verify-fonts/serif.ttf') format('truetype'); font-weight: 400; }
        @font-face { font-family: 'Noto Sans JP'; src: url('/__verify-fonts/sans.ttf') format('truetype'); font-weight: 400; }
      `,
    });
    await page.evaluate(() => document.fonts.ready);
  }

  check(
    'the one native shelf renders every curated story once, across the grid and today’s six',
    (await page.locator(STORY_CARDS).count()) === STORY_COUNT,
    `${await page.locator(STORY_CARDS).count()}/${STORY_COUNT}`,
  );
  // Added readings wear the same native card as the existing ones: each card is compared with an
  // existing reading's card of the same variant (lead, second, grid, or a teaser in today's six).
  const cardStyles = await page.locator(STORY_CARDS).evaluateAll((nodes) => nodes.map((node) => {
    const style = getComputedStyle(node);
    const title = getComputedStyle(node.querySelector('.shelf-title'));
    return {
      id: node.dataset.passage,
      className: node.className,
      background: style.backgroundColor,
      border: style.border,
      radius: style.borderRadius,
      titleFamily: title.fontFamily,
      titleSize: title.fontSize,
    };
  }));
  const addedIds = new Set(IDS);
  const existingStyles = new Map();
  for (const card of cardStyles.filter((row) => !addedIds.has(row.id))) {
    const variant = storyVariant(card.className);
    if (!existingStyles.has(variant)) existingStyles.set(variant, card);
  }
  const addedVariants = [...new Set(cardStyles.filter((row) => addedIds.has(row.id)).map((row) => storyVariant(row.className)))];
  const unmatchedVariants = addedVariants.filter((variant) => !existingStyles.has(variant));
  check(
    `on ${SHELF_DAY} every added card's variant has an existing reading's card to match, today's six included`,
    unmatchedVariants.length === 0 && existingStyles.has('teaser'),
    `added ${addedVariants.join('/')} · existing ${[...existingStyles.keys()].join('/')}` +
      (unmatchedVariants.length ? ` · no existing ${unmatchedVariants.join('/')}` : ''),
  );

  // A shelf screenshot at the boundary between the preserved 40 and additions.
  await page.locator(storyCard(IDS[0])).scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(shotsDir, 'shelf-first-added.png') });

  for (const id of IDS) {
    activeArticleId = id;
    const row = rows.get(id);
    const body = bodies.get(id);
    const beforeNoise = noise.length;
    const item = page.locator(storyCard(id));
    // The design's card: a topic kicker, the headline and a foot with the JLPT level chip (and 読了
    // once finished; since the 2026-10-01 polish pass a teaser in today's six carries the same foot).
    // Source, licence and 未確認 live in the reader.
    const shelfState = await item.evaluate((node) => {
      const style = getComputedStyle(node);
      const title = node.querySelector('.shelf-title');
      const titleStyle = getComputedStyle(title);
      return {
        className: node.className,
        kicker: node.querySelector('.story-kicker .l-ja')?.textContent ?? '',
        title: title?.textContent ?? '',
        foot: !!node.querySelector('.story-foot'),
        level: node.querySelector('.story-foot .level-chip')?.textContent ?? '',
        background: style.backgroundColor,
        border: style.border,
        radius: style.borderRadius,
        titleFamily: titleStyle.fontFamily,
        titleSize: titleStyle.fontSize,
        forbidden: !!node.querySelector('.draft-tag, [class*="editorial"], [class*="pack"]'),
      };
    });
    const teaser = storyVariant(shelfState.className) === 'teaser';
    const expectedLevel = row.readingFacets?.jlpt ?? null;
    const learnerSource = row.sourceLabel.replace(/\s*·\s*検収前/gu, '').trim();
    const nativeStyle = [
      'className',
      'background',
      'border',
      'radius',
      'titleFamily',
      'titleSize',
    ].every((key) => shelfState[key] === existingStyles.get(storyVariant(shelfState.className))?.[key]);
    await item.scrollIntoViewIfNeeded();
    await page.waitForTimeout(35);
    const shelfY = await page.evaluate(() => window.scrollY);
    const responsePath = `/data/articles/${row.file}`;

    await touchAt(page, item);
    await settleReader(page);
    await page.waitForFunction(({ id, title }) =>
      document.querySelector('.listen-row[data-passage]')?.dataset.passage === id &&
        document.querySelector('.view-title')?.textContent === title,
    { id, title: row.title }, { timeout: 5000 });
    await page.waitForTimeout(80);

    const readerShape = await page.evaluate(() => {
      const reader = document.getElementById('reader');
      const style = getComputedStyle(reader);
      return {
        title: document.querySelector('.view-title')?.textContent ?? '',
        source: document.querySelector('main .reader-meta .reader-source')?.textContent ?? '',
        level: document.querySelector('main .reader-meta .level-chip')?.textContent ?? '',
        unreviewed: document.querySelector('main .reader-meta .status-chip')?.textContent ?? null,
        facts: Object.fromEntries([...document.querySelectorAll('main .article-facts dt')].map((dt) =>
          [dt.firstChild?.textContent ?? '', dt.nextElementSibling?.textContent ?? ''])),
        tokens: reader?.querySelectorAll('.tok').length ?? 0,
        ruby: reader?.querySelectorAll('ruby rt').length ?? 0,
        paragraphs: reader?.querySelectorAll('.para-break').length ?? 0,
        fontFamily: style.fontFamily,
        lineHeight: style.lineHeight,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    const baseText = await renderedBaseText(page);

    // The same folded settings control exists and changes the real reader.
    if ((await page.locator('.dials').count()) === 0) {
      await touchAt(page, page.locator('#dials-toggle'));
    }
    const dialCount = await page.locator('.dials [data-dial]').count();
    const dialCommit = await setReaderDial(page, 'furigana', 2);
    const settingsChanged = dialCommit.selected && dialCommit.enabled;

    // R3-A — the flagship's rendered ruby IS the lexicon reading at every
    // override site: 神 wears かみ in deity-name positions, しん never.
    if (id === FLAGSHIP_ID) {
      const lexiconSites = body.tokens
        .map((token, i) => ({ token, i }))
        .filter(({ token }) => token.rs === 'lexicon')
        .map(({ token, i }) => ({
          i,
          surface: token.s,
          ruby: token.f.filter((pair) => pair.r).map((pair) => pair.r),
        }));
      const domRuby = await page.evaluate(
        (positions) =>
          positions.map((position) => {
            const tok = document.querySelectorAll('#reader .tok')[position];
            return tok ? [...tok.querySelectorAll('rt')].map((rt) => rt.textContent) : null;
          }),
        lexiconSites.map((site) => site.i),
      );
      const mismatched = lexiconSites.filter(
        (site, n) => JSON.stringify(domRuby[n]) !== JSON.stringify(site.ruby),
      );
      // Name positions are the 神 tokens whose lexicon ruby is かみ (the
      // reviewed compound 創造神(そうぞうしん) is a term, not a name).
      const kamiSites = lexiconSites.filter(
        (site) => site.surface === '神' && site.ruby.join('') === 'かみ',
      );
      const kamiWrong = kamiSites.filter((site) => {
        const rendered = domRuby[lexiconSites.indexOf(site)]?.join('');
        return rendered !== 'かみ' || rendered === 'しん';
      });
      check(
        'flagship DOM renders the lexicon ruby at every override site — 神 reads かみ in name positions, しん never',
        lexiconSites.length >= 18 &&
          kamiSites.length >= 6 &&
          mismatched.length === 0 &&
          kamiWrong.length === 0,
        `${lexiconSites.length} sites (${kamiSites.length} bare 神) · mismatched ${mismatched.length}`,
        id,
      );
    }

    const quick = await openQuickLook(page, quickTokenIndex.get(id));
    let fullEntry = null;
    if (quick) {
      await touchAt(page, page.locator('#mini .mini-entry'));
      await page.waitForSelector('#sheet .headword', { timeout: 6_000 });
      fullEntry = await page.evaluate(() => ({
        headword: document.querySelector('#sheet .headword')?.textContent ?? '',
        reading: document.querySelector('#sheet .reading')?.textContent ?? '',
        text: document.getElementById('sheet')?.innerText.slice(0, 120) ?? '',
      }));
      // openFull swallows the release click for 700 ms so a long press cannot
      // teleport into the new sheet. Respect the same real-user guard before
      // touching the sheet's own Back control.
      await page.waitForTimeout(720);
      await touchAt(page, page.locator('#sheet-back'));
      await page.waitForSelector('#sheet', { state: 'detached', timeout: 5000 });
      await page.waitForFunction(() => document.querySelector('#reader .tok') &&
        !document.querySelector('#reader')?.closest('[inert]'), null, { timeout: 5000 });
    }

    // Completion and exact per-article bookmark are both persisted. Back must
    // return to this shelf location, then reopening must restore the reader.
    const beforeCompletion = await readAppRecord(page);
    if (beforeCompletion.readDone?.[id] || await page.locator('#read-fin.finished').count()) {
      throw new Error(`expected an unfinished article before its single completion touch: ${id}`);
    }
    await touchAt(page, page.locator('#read-fin'));
    await waitForAppRecord(page, (record) => !!record.readDone?.[id],
      { description: `one acknowledged completion write for ${id}` });
    await page.waitForSelector('#read-fin.finished');
    await page.evaluate(() =>
      window.scrollTo(0, Math.min(620, document.body.scrollHeight - innerHeight)),
    );
    await page.waitForTimeout(80);
    const intendedPosition = await page.evaluate(() => Math.round(window.scrollY));
    await touchAt(page, page.locator('#back'));
    await page.waitForSelector(storyCard(id));
    const returnedShelfY = await page.evaluate(() => window.scrollY);
    const state = await waitForAppRecord(page,
      (record) => record.readDone?.[id] && record.readerPos?.[id] === intendedPosition,
      { description: `native completion and exact bookmark for ${id}` });
    const persisted = {
      position: state.readerPos?.[id] ?? null,
      done: !!state.readDone?.[id],
    };
    const completionTag = teaser ? '' : await page
      .locator(`${storyCard(id)} .read-tag`)
      .textContent()
      .catch(() => '');

    await touchAt(page, page.locator(storyCard(id)));
    await settleReader(page);
    await page.waitForTimeout(120);
    const restoredPosition = await page.evaluate(() => Math.round(window.scrollY));
    const finishedInReader = (await page.locator('#read-fin.finished').count()) === 1;

    if (SHOT_IDS.has(id)) {
      await page.screenshot({
        path: join(shotsDir, `${id}-reader.png`),
        fullPage: false,
      });
    }

    const ownFileLoaded = responses.get(responsePath) === 200;
    const pass =
      nativeStyle &&
      !shelfState.forbidden &&
      shelfState.kicker.trim().length > 0 &&
      shelfState.title === row.title &&
      !!expectedLevel && shelfState.level === expectedLevel &&
      readerShape.title === row.title &&
      readerShape.source === learnerSource &&
      readerShape.facts['出典'] === learnerSource &&
      readerShape.facts['利用条件']?.includes('Bunki original') &&
      readerShape.level === expectedLevel &&
      readerShape.unreviewed === (/-pending$/.test(row.review ?? '') ? '未確認' : null) &&
      readerShape.tokens === body.tokens.length &&
      readerShape.ruby > 0 &&
      readerShape.paragraphs === body.paras.length &&
      /serif|Mincho|明朝/i.test(readerShape.fontFamily) &&
      parseFloat(readerShape.lineHeight) > 24 &&
      readerShape.overflow <= 0 &&
      baseText === expectedBaseText(body) &&
      dialCount === 9 &&
      settingsChanged &&
      !!quick?.word &&
      !!quick?.gloss &&
      !!fullEntry?.headword &&
      persisted.done &&
      persisted.position === intendedPosition &&
      (teaser || /読了/.test(completionTag)) &&
      finishedInReader &&
      Math.abs(returnedShelfY - shelfY) <= 4 &&
      Math.abs(restoredPosition - intendedPosition) <= 4 &&
      ownFileLoaded &&
      noise.length === beforeNoise;

    const detail = `${readerShape.tokens} tokens · ${readerShape.ruby} ruby · ${body.paras.length + 1} paragraphs · bookmark ${intendedPosition}→${restoredPosition}`;
    check('native shelf/reader/lookup/settings/completion/bookmark contract', pass, detail, id);
    articleResults.push({
      id,
      pass,
      shelfState,
      readerShape,
      dialCommit,
      quick,
      fullEntry,
      ownFileLoaded,
      intendedPosition,
      persistedPosition: persisted.position,
      restoredPosition,
      shelfY,
      returnedShelfY,
      newNoise: noise.slice(beforeNoise),
    });

    await touchAt(page, page.locator('#back'));
    await page.waitForSelector(storyCard(id));
  }
  activeArticleId = null;

  check(
    'all 30 article files were served independently',
    IDS.every((id) => responses.get(`/data/articles/${rows.get(id).file}`) === 200),
  );
  check(
    'no request, console, or page errors across the run',
    noise.length === 0,
    noise.slice(0, 8).map((entry) => `${entry.kind}: ${entry.text}`).join(' | '),
  );
  const savedRecord = await readAppRecord(page);
  check(
    'all completion and bookmark state persists in the native learner record',
    IDS.every((id) => savedRecord.readDone?.[id] && Number.isFinite(savedRecord.readerPos?.[id])),
  );

  // B3 — the shelf's English titles come from the record itself, and 未確認 is said once in the
  // masthead and worn in each unreviewed article's reader meta, in both chrome languages
  check(
    'the 日本語のみ chrome renders no English titles',
    (await page.locator('.shelf-title-en').count()) === 0,
  );
  const readShelfCards = () =>
    page.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll('#shelf-reading-results .shelf-item')].map((item) => [
          item.dataset.passage,
          {
            en: item.querySelector('.shelf-title-en')?.textContent ?? null,
            teaser: item.classList.contains('story-teaser'),
          },
        ]),
      ),
    );
  const reviewNote = async () => {
    const notes = await page.locator('.shelf-review-note').count();
    if (!notes) return { notes, text: '', count: 0, total: null };
    const text = (await page.locator('.shelf-review-note').first().textContent()) ?? '';
    const [, jaCount, biCount, total] = text.match(/このうち ([0-9]+) 本は未確認|未確認 · ([0-9]+) of these ([0-9]+)/u) ?? [];
    return { notes, text, count: Number(jaCount ?? biCount), total: total === undefined ? null : Number(total) };
  };
  const jaNote = await reviewNote();
  check(
    'the 日本語のみ masthead says 未確認 once, counting every human-review-pending story',
    pendingStories.length === 0 ? jaNote.notes === 0 : jaNote.notes === 1 && jaNote.count === pendingStories.length,
    jaNote.text || `no review note for ${pendingStories.length} pending stories`,
  );
  const pendingNoiseBefore = noise.length;
  const unmarkedInReader = [];
  for (const record of pendingStories) {
    activeArticleId = record.id;
    await page.locator(`${storyCard(record.id)} .shelf-open`).click();
    await page.waitForSelector('main .reader-meta .reader-source', { state: 'attached' });
    const chip = await page.locator('main .reader-meta .status-chip').textContent().catch(() => null);
    if (chip !== '未確認') unmarkedInReader.push(record.id);
    await page.locator('#back').click();
    await page.waitForSelector(storyCard(record.id));
  }
  activeArticleId = null;
  check(
    'every human-review-pending story wears 未確認 in its reader meta line',
    unmarkedInReader.length === 0 && noise.length === pendingNoiseBefore,
    unmarkedInReader.slice(0, 4).join(', ') ||
      `${pendingStories.length} pending stories marked` +
        (noise.length === pendingNoiseBefore ? '' : ` · ${noise.length - pendingNoiseBefore} errors`),
  );
  const biNoiseBefore = noise.length;
  await page.goto(`${base}/index.html?entry=shelf&ui=bi&cachebust=${Date.now()}`, {
    waitUntil: 'load',
  });
  await page.waitForFunction(
    (want) =>
      document.body.dataset.ready === '1' &&
      document.querySelectorAll(want.cards).length === want.count,
    { cards: STORY_CARDS, count: STORY_COUNT },
    { timeout: 30_000 },
  );
  const reloadedRecord = await readAppRecord(page);
  check(
    'all 30 native completions and exact bookmarks survive a real page reload',
    IDS.every((id) => reloadedRecord.readDone?.[id] === savedRecord.readDone?.[id] &&
      reloadedRecord.readerPos?.[id] === savedRecord.readerPos?.[id]),
  );
  const biCards = await readShelfCards();
  const wrongEn = storyRows.filter((record) => !biCards[record.id] || biCards[record.id].en !== record.titleEn);
  check(
    'the bilingual shelf renders every English title from the records themselves, today’s six included',
    wrongEn.length === 0,
    wrongEn.map((record) => record.id).slice(0, 4).join(', ') || `${storyRows.length} titles`,
  );
  const biNote = await reviewNote();
  check(
    'the bilingual masthead says 未確認 once, counting every human-review-pending story of the shelf',
    pendingStories.length === 0 ? biNote.notes === 0
      : biNote.notes === 1 && biNote.count === pendingStories.length && biNote.total === STORY_COUNT,
    biNote.text || `no review note for ${pendingStories.length} pending stories`,
  );
  await page.locator(storyCard(IDS[0])).scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(shotsDir, 'shelf-bilingual-titles.png') });
  check(
    'the bilingual shelf pass added no request, console, or page errors',
    noise.length === biNoiseBefore,
    noise
      .slice(biNoiseBefore, biNoiseBefore + 4)
      .map((entry) => `${entry.kind}: ${entry.text}`)
      .join(' | '),
  );

  journeyCompleted = true;
  await context.close();
} catch (error) {
  if (page && !page.isClosed()) {
    failureEvidence = await page.evaluate(() => ({
      view: document.body.dataset.view,
      passage: document.querySelector('.listen-row[data-passage]')?.dataset.passage,
      title: document.querySelector('.view-title')?.textContent,
      sheet: Boolean(document.getElementById('sheet')),
      readerInert: Boolean(document.getElementById('reader')?.closest('[inert]')),
      finish: (() => { const node = document.getElementById('read-fin'); return node ? {
        disabled: node.disabled, finished: node.classList.contains('finished'), text: node.textContent,
        rect: node.getBoundingClientRect().toJSON(),
      } : null; })(),
      storeAlert: document.getElementById('store-alert')?.textContent,
      scrollY: window.scrollY,
      offsetTop: window.visualViewport?.offsetTop ?? 0,
      events: window.__nativeTouchTrace ?? [],
    })).catch((captureError) => ({ captureError: captureError.message }));
    const record = await readAppRecord(page).catch(() => null);
    failureEvidence.persisted = record ? { done: record.readDone?.[activeArticleId] ?? null,
      position: record.readerPos?.[activeArticleId] ?? null } : null;
    await page.screenshot({ path: join(shotsDir, 'failure.png') }).catch(() => {});
  }
  check('browser harness', false, error.stack || String(error), activeArticleId);
  console.error(error);
} finally {
  if (browser) await browser.close();
  server.close();
}

// A failed journey still emits its completed rows and marks absent captures
// with null hashes; the printed report path must identify a real receipt.
function screenshotSha256(path) {
  return existsSync(path) ? fileSha256(path) : null;
}

writeFileSync(
  reportPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      kind: 'native-bunki-readings-browser-verification',
      viewport: VIEWPORT,
      touchEmulation: true,
      browser: browserVersion,
      completed: journeyCompleted,
      failureEvidence,
      touchAttempts,
      pass: journeyCompleted && failures.length === 0,
      completedAt: new Date().toISOString(),
      artifact: {
        path: CORRIDOR,
        artifactSha256: JSON.parse(readFileSync(resolve(CORRIDOR, 'build-identity.json'), 'utf8')).artifactSha256,
      },
      verificationSources: {
        verifier: fileSha256(fileURLToPath(import.meta.url)),
        nativeRecordHelper: fileSha256(resolve(HERE, 'record-test-support.mjs')),
      },
      artifactHashes: {
        source: fileSha256(SOURCE),
        editorial: fileSha256(
          resolve(REPO, 'docs/content/bunki-originals-zoka-sanjin.editorial.json'),
        ),
        index: fileSha256(resolve(CORRIDOR, 'data/articles/index.json')),
        manifest: fileSha256(resolve(CORRIDOR, 'data/manifest.json')),
        corridorJs: fileSha256(resolve(CORRIDOR, 'corridor.js')),
        corridorCss: fileSha256(resolve(CORRIDOR, 'corridor.css')),
        standalone: fileSha256(resolve(HERE, '..', 'corridor-standalone.html')),
        words: fileSha256(resolve(CORRIDOR, 'data/share_alike/words.json')),
        idioms: fileSha256(resolve(CORRIDOR, 'data/share_alike/idioms.json')),
        sem: fileSha256(resolve(CORRIDOR, 'data/proprietary_safe/sem.json')),
        articleFiles: Object.fromEntries(
          IDS.map((id) => [id, fileSha256(resolve(CORRIDOR, 'data/articles', rows.get(id).file))]),
        ),
      },
      visualReferenceEvidence: {
        method: 'native computed-style equality plus retained comparison screenshots; manual visual inspection remains non-pixel-diff',
        references: {
          shelf: { path: 'docs/prototype/screenshots/14-phase1-shelf-v11.png', sha256: fileSha256(REFERENCE_SHELF) },
          reader: { path: 'docs/prototype/screenshots/16-phase1-v11-article.png', sha256: fileSha256(REFERENCE_READER) },
        },
        captures: {
          shelf: { path: 'screenshots/shelf-first-added.png', sha256: screenshotSha256(join(shotsDir, 'shelf-first-added.png')) },
          biShelf: {
            path: 'screenshots/shelf-bilingual-titles.png',
            sha256: screenshotSha256(join(shotsDir, 'shelf-bilingual-titles.png')),
          },
          n3Reader: {
            path: 'screenshots/bunki-graded-n3-zoka-sanjin-morning-reader.png',
            sha256: screenshotSha256(join(shotsDir, 'bunki-graded-n3-zoka-sanjin-morning-reader.png')),
          },
          n2Reader: {
            path: 'screenshots/bunki-essay-n2-silent-amenominakanushi-reader.png',
            sha256: screenshotSha256(join(shotsDir, 'bunki-essay-n2-silent-amenominakanushi-reader.png')),
          },
          n1Reader: {
            path: 'screenshots/bunki-essay-n1-prayer-reality-reader.png',
            sha256: screenshotSha256(join(shotsDir, 'bunki-essay-n1-prayer-reality-reader.png')),
          },
        },
      },
      articles: articleResults,
      noise,
      results,
      failures: failures.map((row) => row.name),
    },
    null,
    2,
  )}\n`,
);

console.log(`\n${results.length - failures.length}/${results.length} browser checks passed`);
console.log(`screenshots → ${shotsDir}`);
console.log(`report → ${reportPath}`);
process.exit(failures.length ? 1 : 0);
