/* global URL, console */
/** An article's headline is set from phrase units (.ja-unit, appendJaPieces); a quoted phrase was split across two
 * units, so 「成熟ノード」と could break inside (owed repair 7, 2026-11-10). A phrase in 「」 or 『』 now stays one unit
 * with the particle after its closing mark when the whole is at most 12 characters (jaQuotedRuns). The actual word rule
 * is lifted from the corridor and set in a silent page with every stylesheet the app loads, as the reader's title card
 * sets it: 26 px in a 347 px box. */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { CORRIDOR, corridorDeclarations } from './corridor-declarations.mjs';
import { openCorridorSourcePage } from './corridor-source-page.mjs';

const read = (path) => readFileSync(new URL(path, CORRIDOR), 'utf8');
const stylesheets = [...read('index.html').matchAll(/<link rel="stylesheet" href="([^"]+)"/gu)].map(
  (match) => match[1],
);
const rule = corridorDeclarations(
  'corridor.js',
  [
    'JA_KANJI',
    'JA_KANA_RUN',
    'JA_COUNTER',
    'JA_OPENS_WORD',
    'JA_CLOSES',
    'jaSegmenter',
    'jaWords',
    'jaWordGroups',
    'JA_KANA_WORDS',
    'jaMendSegments',
    'jaGroupSegments',
    'jaEms',
    'jaQuotedRuns',
    'appendJaPieces',
  ],
  ['jaQuotedRuns'],
);
const articles = JSON.parse(read('data/articles/index.json')).articles;
const known = new Set(articles.map((row) => row.id));
const titles = [
  ...articles,
  ...JSON.parse(read('data/articles/library-candidates/index.json')).candidateRows.filter(
    (row) => row.libraryCandidate?.installable === false && !known.has(row.id),
  ),
].map((row) => row.title);

// Sets each title in the reader card's h1 and reads its lines (by the glyphs' own boxes) and its units' widths.
const setTitles = (list, size = 26, width = 347) => `(async () => {
  document.documentElement.dataset.room = 'reader';
  document.body.dataset.view = 'reader';
  document.body.innerHTML = '<div id="app"><main><div class="reader-card"><h1 class="view-title"></h1></div></main></div>';
  const h1 = document.querySelector('h1');
  h1.style.fontSize = '${size}px';
  h1.style.width = '${width}px';
  h1.style.boxSizing = 'content-box';
  h1.style.padding = '0';
  ${rule}
  const out = [];
  for (const title of ${JSON.stringify(list)}) {
    h1.replaceChildren();
    appendJaPieces(h1, jaWords(title));
    h1.classList.add('ja-flow');
    await document.fonts.ready;
    const rows = [];
    const walker = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      for (const [i, ch] of [...t.data].entries()) {
        const at = t.data.indexOf(ch, [...t.data].slice(0, i).join('').length);
        range.setStart(t, at);
        range.setEnd(t, at + ch.length);
        const box = range.getClientRects()[0];
        if (!box) continue;
        let row = rows.find((r) => Math.abs(r.top - box.top) < 8);
        if (!row) rows.push((row = { top: box.top, text: '' }));
        row.text += ch;
      }
    }
    rows.sort((a, b) => a.top - b.top);
    const units = [...h1.querySelectorAll('.ja-unit')].map((u) => ({ text: u.textContent, width: u.getBoundingClientRect().width,
      pieces: [...u.childNodes].map((n) => n.textContent) }));
    out.push({ title, lines: rows.map((r) => r.text), units, overflow: h1.scrollWidth > ${width} + 0.5 });
  }
  return out;
})()`;

let host;
beforeAll(async () => {
  host = await openCorridorSourcePage({ stylesheets, viewport: { width: 390, height: 844 } });
}, 60000);
afterAll(async () => {
  await host?.close();
});

test('the first Read article breaks 13 / 7 / 13 and 「成熟ノード」と is one unit of two lookup words', async () => {
  const [seen] = await host.page.evaluate(
    setTitles(['日本のお金でニューヨークに半導体工場――「成熟ノード」と「2ナノ」']),
  );
  expect(seen.lines).toEqual([
    '日本のお金でニューヨークに',
    '半導体工場――',
    '「成熟ノード」と「2ナノ」',
  ]);
  expect(seen.lines.map((line) => [...line].length)).toEqual([13, 7, 13]);
  const quote = seen.units.find((unit) => unit.text === '「成熟ノード」と');
  expect(quote).toBeTruthy();
  // its words stay their own text, so each keeps its own lookup door as before
  expect(quote.pieces).toEqual(['「成熟', 'ノード」と']);
});

test('no unit of any shelf title is wider than the 347 px box at 26 px, and no title overflows', async () => {
  expect(titles.length).toBeGreaterThan(250);
  const seen = await host.page.evaluate(setTitles(titles));
  const wide = seen.flatMap((row) =>
    row.units.filter((unit) => unit.width > 347).map((unit) => `${row.title}: ${unit.text}`),
  );
  expect(wide).toEqual([]);
  expect(seen.filter((row) => row.overflow).map((row) => row.title)).toEqual([]);
  // a quote longer than 12 characters keeps the word rule: it is never one unit
  for (const row of seen)
    for (const unit of row.units)
      if (/^[「『]/u.test(unit.text) && unit.pieces.length > 1)
        expect([...unit.text].length).toBeLessThanOrEqual(12);
}, 120000);

// John's Mac, a wide window (about 1728 px) with the 深 design on: the reader's headline is set at 36 px in about 640 px
test('at 36 px in 640 px the first title keeps both quotes whole and does not overflow', async () => {
  const [seen] = await host.page.evaluate(
    setTitles(['日本のお金でニューヨークに半導体工場――「成熟ノード」と「2ナノ」'], 36, 640),
  );
  console.log(`36 px in 640 px: ${seen.lines.join(' / ')}`);
  expect(seen.overflow).toBe(false);
  expect(seen.lines.some((line) => line.includes('「成熟ノード」と'))).toBe(true);
  expect(seen.lines.some((line) => line.includes('「2ナノ」'))).toBe(true);
});
