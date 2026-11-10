/* global URL */
/** Three repairs (owed-3, 2026-11-10), each run from the corridor's actual code.
 * 1 · After the Kodansha map opened from a kanji page, Words stayed on the Kodansha lens and a typed word found nothing.
 *     A query typed into the search field now leaves a finder lens for Words; a number typed under the Kodansha lens
 *     stays a Kodansha number (typedSearchLens, wired into the search field's input).
 * 2 · The map's top row of glyphs was cut under the map's head: its seek now lands on a whole row (renderKkldMap).
 * 3 · Today's city ran through the lines under the day's word and its "Kanji with 貝 →" link: the hero's foot now holds
 *     the city, under the whole word block (rooms/today.css), drawn here with every stylesheet the app loads. */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { CORRIDOR, corridorDeclarations } from './corridor-declarations.mjs';
import { openCorridorSourcePage } from './corridor-source-page.mjs';

const index = readFileSync(new URL('index.html', CORRIDOR), 'utf8');
const stylesheets = [...index.matchAll(/<link rel="stylesheet" href="([^"]+)"/gu)].map(
  (match) => match[1],
);

describe('1 · a word typed after the Kodansha map is a word search', () => {
  const lens = () =>
    vm.runInNewContext(
      `${corridorDeclarations('corridor.js', ['typedSearchLens'])}; typedSearchLens`,
    );
  test('a word leaves the Kodansha lens (and any finder) for Words; a number under the Kodansha lens stays it', () => {
    const typed = lens();
    expect(typed('kkld', '分野')).toEqual({ lens: 'words' });
    expect(typed('kkld', 'もん')).toEqual({ lens: 'words' });
    expect(typed('strokes', '門')).toEqual({ lens: 'words' });
    expect(typed('kkld', '790')).toEqual({ lens: 'kkld', kkldQ: '790' });
    expect(typed('kkld', '７９０')).toEqual({ lens: 'kkld', kkldQ: '790' });
    expect(typed('kkld', '')).toEqual({ lens: 'kkld' });
    expect(typed('skip', '1-3-8')).toEqual({ lens: 'skip' });
    expect(typed('words', '門')).toEqual({ lens: 'words' });
  });
  test('the search field asks it on every keystroke and shows the lens it gives', () => {
    const page = corridorDeclarations('corridor.js', ['renderSearchPage']);
    const listener = page.slice(page.indexOf("input.addEventListener('input'"));
    expect(listener).toMatch(/typedSearchLens\(S\.searchLens, input\.value\)/u);
    expect(listener).toMatch(/S\.kdx\.kkldQ = typed\.kkldQ/u);
    expect(listener).toMatch(/S\.searchLens = typed\.lens/u);
  });
});

const mapCode = corridorDeclarations('corridor.js', [
  'KKLD_MAP_CELL',
  'KKLD_MAP_GAP',
  'renderKkldMap',
]);
const mapScene = (numbers) => `(async () => {
  document.body.innerHTML = '<div style="height: 380px"></div><div class="sheet"><div id="host"></div></div>';
  const host = document.getElementById('host');
  host.style.cssText = 'width: min(640px, calc(100vw - 32px)); margin: 0 16px';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const tx = (ja, en) => en, go = () => {}, kdxGlyphName = (c) => c, S = { kdx: {} };
  const glyphs = '一二三四五六七八九十百千万円年月日火水木金土山川田人口目耳手足力上下左右中大小本文字学生先名白赤青天気雨花草竹石貝虫犬王玉子女男町村森林空音早正立休見入出夕糸車校';
  const order = Array.from({ length: 2400 }, (_, i) => [i + 1, glyphs[i % glyphs.length]]);
  const kkldOrder = () => order;
  ${mapCode}
  const map = renderKkldMap(host, 'ed2013', null);
  const box = document.getElementById('kdx-kkld-map');
  const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  await frame();
  const out = [];
  for (const n of ${JSON.stringify(numbers)}) {
    map.light(n);
    await frame();
    const top = box.getBoundingClientRect().top;
    const cut = [...box.querySelectorAll('.kdx-kkld-cell')].filter((c) => { const r = c.getBoundingClientRect(); return r.top < top - 0.5 && r.bottom > top + 0.5; }).length;
    const lit = box.querySelector('.kdx-kkld-cell.is-lit');
    const r = lit?.getBoundingClientRect(), b = box.getBoundingClientRect();
    out.push({ n, cut, litInView: !!r && r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5 });
  }
  return out;
})()`;

for (const { width, height } of [
  { width: 1728, height: 1050 },
  { width: 390, height: 844 },
]) {
  describe(`2 · the Kodansha map at ${width} px`, () => {
    let host;
    beforeAll(async () => {
      host = await openCorridorSourcePage({ stylesheets, viewport: { width, height } });
    }, 60000);
    afterAll(async () => {
      await host?.close();
    });
    test('a lit number brings its row into view with the top row whole', async () => {
      const seen = await host.page.evaluate(mapScene([789, 800, 1, 157, 1234, 2001, 2399]));
      for (const row of seen) {
        expect(row.cut, `number ${row.n}`).toBe(0);
        expect(row.litInView, `number ${row.n}`).toBe(true);
      }
    }, 60000);
  });
}

const cityCode = corridorDeclarations('modules/drift.mjs', [
  'todayRng',
  'todayCity',
  'todayLearning',
  'renderTodayWord',
]);
const cityScene = (theme) => `(async () => {
  const root = document.documentElement;
  root.dataset.room = 'tray';
  root.dataset.liveDepth = '1';
  if (${JSON.stringify(theme)}) root.dataset.theme = ${JSON.stringify(theme)}; else delete root.dataset.theme;
  document.body.className = 'ui-bi';
  document.body.innerHTML = '<div id="app"><main></main></div>';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const tx = (ja, en) => en, bi = () => true, go = () => {}, learningItemNode = () => null;
  const todayHook = () => ({ part: '貝', shared: false, host: '購', kanji: ['購'], meaning: 'shellfish', family: 80 });
  const todayRadicalName = () => 'かいへん';
  const todayWordWhy = () => 'From today’s reading.';
  ${cityCode}
  const hero = el('section', 'today-hero');
  hero.append(todayCity());
  const head = el('header', 'today-head');
  head.append(el('p', 'eyebrow today-date', 'Tuesday · 10 Nov 2026'), el('h1', 'view-title', 'Today'));
  hero.append(head, renderTodayWord({ word: '購入', reading: 'こうにゅう', from: 'read' }));
  document.querySelector('main').append(hero);
  await document.fonts.ready;
  const city = hero.querySelector('.today-city').getBoundingClientRect();
  const word = hero.querySelector('.today-dayword');
  const boxes = [];
  const walker = document.createTreeWalker(word, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (!t.data.trim()) continue;
    range.selectNodeContents(t);
    for (const r of range.getClientRects()) boxes.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right, text: t.data.trim().slice(0, 12) });
  }
  for (const n of word.querySelectorAll('button, a')) { const r = n.getBoundingClientRect(); boxes.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right, text: n.className }); }
  const through = boxes.filter((r) => r.bottom > city.top && r.top < city.bottom && r.right > city.left && r.left < city.right).map((r) => r.text);
  return { city: { top: city.top, height: city.height }, lowest: Math.max(...boxes.map((r) => r.bottom)), lines: boxes.length, through };
})()`;

for (const { width, height } of [
  { width: 1728, height: 1050 },
  { width: 390, height: 844 },
]) {
  describe(`3 · Today's city at ${width} px`, () => {
    let host;
    beforeAll(async () => {
      host = await openCorridorSourcePage({ stylesheets, viewport: { width, height } });
    }, 60000);
    afterAll(async () => {
      await host?.close();
    });
    for (const theme of ['yoru', 'nami', null]) {
      test(`the city stands under the whole word block (${theme || 'the default day look'})`, async () => {
        const seen = await host.page.evaluate(cityScene(theme));
        expect(seen.lines).toBeGreaterThan(5);
        expect(seen.city.height).toBeGreaterThan(40);
        expect(seen.through).toEqual([]);
        expect(seen.city.top).toBeGreaterThanOrEqual(seen.lowest);
      }, 60000);
    }
  });
}
