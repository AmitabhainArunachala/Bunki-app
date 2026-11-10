/* global URL */
/** Today's word line "談 and 話 share the radical 言 (ごんべん, “say”)." broke so that the larger 言 opened the second
 * line alone, at 390 and at 1440 px (owed repair 4, 2026-11-10). The actual renderTodayWord is lifted from the drift
 * seam and drawn in a silent Chromium page with every stylesheet the app loads, in the app's own order; the words
 * naming the radical and the radical must share a line, at both widths, and the line stays two lines at most. */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { CORRIDOR, corridorDeclarations } from './corridor-declarations.mjs';
import { openCorridorSourcePage } from './corridor-source-page.mjs';

const index = readFileSync(new URL('index.html', CORRIDOR), 'utf8');
const stylesheets = [...index.matchAll(/<link rel="stylesheet" href="([^"]+)"/gu)].map(
  (match) => match[1],
);
const source = corridorDeclarations('modules/drift.mjs', ['todayLearning', 'renderTodayWord']);

// Draws the day's word with a hook, and reads where the radical sits against the words that name it.
const draw = (hook, word, lead) => `(() => {
  document.documentElement.dataset.room = 'tray';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const tx = (ja, en) => en, bi = () => true, go = () => {}, learningItemNode = () => null;
  const todayHook = () => (${JSON.stringify(hook)});
  const todayRadicalName = () => ${JSON.stringify(hook.name)};
  ${source}
  document.body.replaceChildren();
  const stage = el('main', 'today-stage');
  stage.style.cssText = 'display: flex; flex-direction: column; align-items: center; text-align: center; padding: 0 16px';
  stage.append(renderTodayWord({ word: ${JSON.stringify(word)}, reading: '', from: 'fresh' }));
  document.body.append(stage);
  const line = document.querySelector('.dw-hook');
  const radical = line.querySelector('.dw-pk').getBoundingClientRect();
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
  let lead = null;
  for (let t = walker.nextNode(); t && !lead; t = walker.nextNode()) {
    const at = t.data.lastIndexOf(${JSON.stringify(lead)});
    if (at < 0) continue;
    const range = document.createRange();
    range.setStart(t, at);
    range.setEnd(t, at + ${lead.length});
    lead = range.getBoundingClientRect();
  }
  const lineHeight = parseFloat(getComputedStyle(line).lineHeight);
  return { text: line.textContent, radical: { top: radical.top, bottom: radical.bottom, left: radical.left },
    lead: { top: lead.top, bottom: lead.bottom, right: lead.right }, height: line.getBoundingClientRect().height, lineHeight };
})()`;

const shared = {
  part: '言',
  shared: true,
  kanji: ['談', '話'],
  meaning: 'say',
  family: 70,
  name: 'ごんべん',
};
const single = {
  part: '氵',
  shared: false,
  host: '海',
  kanji: ['海'],
  meaning: 'water',
  family: 120,
  name: 'さんずい',
};

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  describe(`Today's word line at ${viewport.width} px`, () => {
    let host;
    beforeAll(async () => {
      host = await openCorridorSourcePage({ stylesheets, viewport });
    }, 60000);
    afterAll(async () => {
      await host?.close();
    });

    test('“the radical 言” stays on one line and the line is two lines at most', async () => {
      const seen = await host.page.evaluate(draw(shared, '談話', 'radical'));
      expect(seen.text).toBe('談 and 話 share the radical 言 (ごんべん, “say”).');
      // the radical sits on the line of the word "radical", after it: it never opens a line
      const middle = (box) => (box.top + box.bottom) / 2;
      expect(Math.abs(middle(seen.radical) - middle(seen.lead))).toBeLessThan(seen.lineHeight / 2);
      expect(seen.radical.left).toBeGreaterThan(seen.lead.right);
      expect(seen.height).toBeLessThan(seen.lineHeight * 2.8);
    }, 60000);

    test('one kanji: “is 氵” stays together too', async () => {
      const seen = await host.page.evaluate(draw(single, '海', 'is'));
      expect(seen.text).toBe('The radical of 海 is 氵 (さんずい, “water”).');
      const middle = (box) => (box.top + box.bottom) / 2;
      expect(Math.abs(middle(seen.radical) - middle(seen.lead))).toBeLessThan(seen.lineHeight / 2);
    }, 60000);
  });
}
