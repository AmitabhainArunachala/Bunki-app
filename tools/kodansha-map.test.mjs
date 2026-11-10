/* global URL, window */
/** The Kodansha number on a kanji page opens the whole Kodansha map (John, 2026-11-10: "keep it but simplify and make it
 * connect to something logical behind like the entire Kodansha map and Kodansha style navigation"):
 *   - the page's previous and next kanji in Kodansha order (kkldNeighbours), skipping numbers the edition lacks;
 *   - the map (renderKkldMap): every kanji of the edition in the book's order, read in rows, a number at 1 and at every
 *     hundred, his saved and met kanji marked, the asked number lit and in view, and only the rows near the view drawn,
 *     so the first paint stays under 150 ms and a scroll to the end still draws a few hundred cells, not 2,904.
 * The actual functions are lifted from the corridor and drawn in a silent page with every stylesheet the app loads. */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { CORRIDOR, corridorDeclarations } from './corridor-declarations.mjs';
import { openCorridorSourcePage } from './corridor-source-page.mjs';

const kkld = JSON.parse(readFileSync(new URL('data/share_alike/kkld.json', CORRIDOR), 'utf8'));
const index = readFileSync(new URL('index.html', CORRIDOR), 'utf8');
const stylesheets = [...index.matchAll(/<link rel="stylesheet" href="([^"]+)"/gu)].map(
  (match) => match[1],
);
const finder = corridorDeclarations(
  'modules/worlds.mjs',
  ['kkldNumberGlyphs', 'kkldNeighbours'],
  ['kkldNeighbours'],
);
const map = corridorDeclarations(
  'corridor.js',
  ['KKLD_MAP_CELL', 'KKLD_MAP_GAP', 'kkldOrderMemo', 'kkldOrder', 'renderKkldMap'],
  ['KKLD_MAP_CELL', 'KKLD_MAP_GAP', 'kkldOrderMemo', 'kkldOrder', 'renderKkldMap'],
);

describe('the kanji page’s neighbours in Kodansha order', () => {
  const context = vm.createContext({ D: { kkld } });
  vm.runInContext(finder, context);
  const near = (ed, n) =>
    JSON.parse(
      JSON.stringify(
        vm.runInContext(
          `typeof kkldNeighbours === 'function' ? kkldNeighbours(${JSON.stringify(ed)}, ${n}) : null`,
          context,
        ),
      ),
    );

  test('門 (2013 #789) stands between 殴 788 and 非 790', () => {
    expect(near('ed2013', 789)).toEqual({ prev: [788, '殴'], next: [790, '非'] });
  });
  test('a number the edition lacks is stepped over (2013 has no #89)', () => {
    expect(near('ed2013', 90).prev).toEqual([88, '俗']);
    expect(near('ed2013', 88).next).toEqual([90, '倍']);
  });
  test('the first has no previous and the last no next, in each edition', () => {
    expect(near('ed2013', 1)).toEqual({ prev: null, next: [2, '小'] });
    expect(near('ed2013', 3002).next).toBeNull();
    expect(near('ed1999', 2230).next).toBeNull();
    expect(near('ed1999', 597).next[0]).toBe(598);
  });
});

// Draws the map in a box of the room's width, lights a number, and reads what was drawn and how long it took.
const draw = ({ ed = 'ed2013', lit = null, width = 760 } = {}) => `(async () => {
  document.documentElement.dataset.room = 'search';
  document.body.dataset.view = 'search';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const tx = (ja, en) => en, go = () => {}, kdxGlyphName = (c) => c;
  const S = { kdx: {} };
  const D = window.__D;
  ${map}
  document.body.replaceChildren();
  const main = el('main');
  main.style.cssText = 'width: ${width}px; max-width: 100%; margin: 0 auto; padding: 0 16px; box-sizing: border-box';
  document.body.append(main);
  const frame = () => new Promise((done) => requestAnimationFrame(() => done()));
  const t0 = performance.now();
  const marks = { saved: new Set(['門', '語']), met: new Set(['非', '閉']) };
  const m = typeof renderKkldMap === 'function' ? renderKkldMap(main, ${JSON.stringify(ed)}, marks) : null;
  if (!m) return { missing: true };
  m.light(${JSON.stringify(lit)});
  await frame();
  const t1 = performance.now();
  await frame();
  const box = document.querySelector('#kdx-kkld-map').getBoundingClientRect();
  const cells = [...document.querySelectorAll('#kdx-kkld-map .kdx-glyph')];
  const inView = (b) => { const r = b.getBoundingClientRect(); return r.top >= box.top - 1 && r.bottom <= box.bottom + 1 && r.left >= box.left - 1 && r.right <= box.right + 1; };
  const read = () => {
    const shown = [...document.querySelectorAll('#kdx-kkld-map .kdx-glyph')];
    const visible = shown.filter(inView);
    return {
      drawn: shown.length,
      numbers: visible.map((b) => Number(b.dataset.kkld)),
      lit: shown.filter((b) => b.classList.contains('is-lit')).map((b) => ({ c: b.textContent, n: Number(b.dataset.kkld), seen: inView(b) })),
      marks: visible.filter((b) => b.dataset.mark).map((b) => [Number(b.dataset.kkld), b.dataset.mark]),
      mine: shown.filter((b) => b.dataset.mine).map((b) => [b.textContent, b.dataset.mine]),
      ordered: shown.every((b, i) => !i || Number(shown[i - 1].dataset.kkld) < Number(b.dataset.kkld)),
      rows: [...new Set(visible.map((b) => Math.round(b.getBoundingClientRect().top)))].length,
    };
  };
  const first = read();
  const scroller = document.querySelector('#kdx-kkld-map');
  scroller.scrollTop = scroller.scrollHeight;
  await frame(); await frame();
  const end = read();
  return { firstPaint: t1 - t0, first, end, wide: document.documentElement.scrollWidth <= innerWidth, cells: cells.length,
    order: ${ed === 'ed1999' ? 2230 : 2904} };
})()`;

for (const viewport of [
  { width: 1728, height: 1050 },
  { width: 390, height: 844 },
]) {
  describe(`the Kodansha map at ${viewport.width} px`, () => {
    let host;
    beforeAll(async () => {
      host = await openCorridorSourcePage({ stylesheets, viewport });
      await host.page.evaluate((data) => {
        window.__D = { kkld: data };
      }, kkld);
    }, 60000);
    afterAll(async () => {
      await host?.close();
    });

    test('opened at 門 (789): lit, in view, among its neighbours, drawn near the view only, painted under 150 ms', async () => {
      const seen = await host.page.evaluate(
        draw({ lit: 789, width: viewport.width > 800 ? 760 : 390 }),
      );
      expect(seen.missing).toBeUndefined();
      expect(seen.first.lit).toEqual([{ c: '門', n: 789, seen: true }]);
      expect(seen.first.numbers).toContain(788);
      expect(seen.first.numbers).toContain(790);
      expect(seen.first.ordered).toBe(true);
      expect(seen.first.drawn).toBeLessThan(600);
      expect(seen.first.rows).toBeGreaterThan(3);
      expect(seen.firstPaint).toBeLessThan(150);
      expect(seen.wide).toBe(true);
      // his own kanji carry their mark
      expect(seen.first.mine).toContainEqual(['門', 'saved']);
      expect(seen.first.mine).toContainEqual(['非', 'met']);
      // scrolled to the end: the last kanji is drawn and the count stays small
      expect(seen.end.numbers).toContain(3002);
      expect(seen.end.drawn).toBeLessThan(600);
      expect(seen.end.marks).toContainEqual([3000, '3000']);
    }, 60000);

    test('at the top: 1 and every hundred carry their number; the 1999 edition has its own order', async () => {
      const seen = await host.page.evaluate(
        draw({ ed: 'ed1999', width: viewport.width > 800 ? 760 : 390 }),
      );
      expect(seen.first.numbers.slice(0, 3)).toEqual([1, 2, 3]);
      expect(seen.first.marks[0]).toEqual([1, '1']);
      expect(seen.first.lit).toEqual([]);
      expect(seen.end.numbers).toContain(2230);
      expect(seen.end.marks).toContainEqual([2200, '2200']);
    }, 60000);
  });
}
