/** The prototype's 試 button stood on the study card's count ("1/15" read "試5"), at 390 and at 1728 px (owed-2
 * repair 1, 2026-11-10): where the report bug stands at the top, place() set the button directly left of it. It now
 * steps left past an element of the app that has its own text there, or is a control. The actual placement code is
 * lifted from the prototype layer and run in a silent page with its own stylesheet, over the study card's top bar as it
 * stands in the app at both widths (geometry measured on the screen): the card's front, and its back, where the
 * card's text has scrolled up under the opaque bar. */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { corridorDeclarations } from './corridor-declarations.mjs';
import { openCorridorSourcePage } from './corridor-source-page.mjs';

const source = corridorDeclarations(
  'prototype-layer.mjs',
  ['fixedChrome', 'appUnder', 'place'],
  ['appUnder'],
);
// bug: the report bug's left edge as measured (390: 342; 1728: 1152); the count stands 4 px left of it
const scene = ({ bug, back }) => `(() => {
  document.body.innerHTML = \`
    <header class="bar" style="position: fixed; top: 0; left: 0; right: 0; height: 44px; background: #1b2638; z-index: 5">
      <button id="back" style="position: absolute; left: 8px; top: 0; width: 44px; height: 44px">‹</button>
      <div class="progress" style="position: absolute; left: 64px; top: 21px; height: 2px; width: ${bug - 100}px; background: #aaa"></div>
      <span class="kp-count" style="position: absolute; left: ${bug - 32}px; top: 13px; width: 28px; text-align: right; font: 15px/19px sans-serif; color: #eee">1/15</span>
    </header>
    ${back ? `<p class="card-text" style="position: absolute; top: 16px; left: ${bug - 120}px; margin: 0; font: 22px/30px serif; z-index: 1">何を聞いても答えてくれ</p>` : ''}
    <div id="bunki-reports-root"><button class="br-rail" style="position: fixed; top: 0; left: ${bug}px; width: 44px; height: 44px; z-index: 6">虫</button></div>
    <div id="bunki-prototype-root"><div class="pl-rail"><button class="pl-open" id="prototype-open">試</button></div></div>\`;
  const root = document.getElementById('bunki-prototype-root');
  const rail = root.querySelector('.pl-rail');
  const opener = root.querySelector('.pl-open');
  ${source}
  place();
  const pl = opener.getBoundingClientRect();
  const count = document.querySelector('.kp-count');
  const range = document.createRange();
  range.selectNodeContents(count.firstChild);
  const text = range.getBoundingClientRect();
  const meets = (a, b) => a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
  // what of the app is under the button's face: any control at all
  const controls = [];
  for (const fy of [0.2, 0.5, 0.8]) for (const fx of [0.2, 0.5, 0.8]) {
    for (const n of document.elementsFromPoint(pl.left + pl.width * fx, pl.top + pl.height * fy)) {
      if (root.contains(n)) continue;
      const control = n.closest('button, a[href], [role="button"], input, select, textarea, summary');
      if (control) controls.push(control.id || control.className);
    }
  }
  return { width: innerWidth, pl: { left: pl.left, right: pl.right, top: pl.top }, countText: meets(pl, text), controls: [...new Set(controls)] };
})()`;

for (const { width, height, bug } of [
  { width: 390, height: 844, bug: 342 },
  { width: 1728, height: 1050, bug: 1152 },
]) {
  describe(`the 試 button over the study card's top bar at ${width} px`, () => {
    let host;
    beforeAll(async () => {
      host = await openCorridorSourcePage({
        stylesheets: ['prototype-layer.css'],
        viewport: { width, height },
      });
    }, 60000);
    afterAll(async () => {
      await host?.close();
    });
    for (const back of [false, true]) {
      test(`card ${back ? 'back' : 'front'}: 試 is clear of the count's text and covers no control`, async () => {
        const seen = await host.page.evaluate(scene({ bug, back }));
        expect(seen.width).toBe(width);
        expect(seen.countText).toBe(false);
        expect(seen.controls).toEqual([]);
        // it still stands at the top, beside the bar, on the screen
        expect(seen.pl.top).toBe(0);
        expect(seen.pl.left).toBeGreaterThan(0);
        expect(seen.pl.right).toBeLessThanOrEqual(bug);
      }, 60000);
    }
  });
}
