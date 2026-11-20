/* global URL */
/** Two word-page repairs (owed-2 repairs 3 and 4, 2026-11-10).
 * 3 · "Study progress" was a boxed line with a ▶ in another typeface; it is now the fold row Today's "Your record and
 *     backup" is (a sentence-case name on hairlines, the fold caret), as "More examples" above it now is too.
 * 4 · the level stood alone under the dictionary box ("JLPT N3"); the word page now has one quiet facts line directly
 *     under its reading, the kanji page's own p.entry-facts: level (still its door), part of speech, number of kanji.
 * The actual renderStudyFold and renderTodayRecord are drawn in a silent page with every stylesheet the app loads, in
 * its order, with the depth design on as the app ships it; the word page's head is read from renderWordNode. */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { CORRIDOR, corridorDeclarations } from './corridor-declarations.mjs';
import { openCorridorSourcePage } from './corridor-source-page.mjs';

const index = readFileSync(new URL('index.html', CORRIDOR), 'utf8');
const stylesheets = [...index.matchAll(/<link rel="stylesheet" href="([^"]+)"/gu)].map(
  (match) => match[1],
);
const word = corridorDeclarations('corridor.js', ['renderWordNode']);
const folds = corridorDeclarations('corridor.js', ['renderStudyFold', 'renderTodayRecord']);

const rows = (language) => `(() => {
  document.documentElement.dataset.room = 'tray';
  document.documentElement.dataset.liveDepth = '1';
  document.body.className = ${JSON.stringify(language === 'ja' ? '' : 'ui-bi')};
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const tx = (ja, en) => ${language === 'ja' ? 'ja' : 'en'};
  const S = { studyOpen: null, srs: {}, taken: [], todayRecordOpen: false, todayDetailHeld: false };
  const personalHost = false, srsKey = (t, id) => t + ':' + id, render = () => {};
  ${folds}
  document.body.innerHTML = '<div id="app"><main></main></div><div id="sheet" class="sheet"></div>';
  document.querySelector('main').append(renderTodayRecord());
  const sheet = document.getElementById('sheet');
  renderStudyFold(sheet, { t: 'word', id: '分野' });
  const look = (n) => { const cs = getComputedStyle(n); return { family: cs.fontFamily, weight: cs.fontWeight, size: cs.fontSize, transform: cs.textTransform }; };
  const today = document.querySelector('.today-record > summary');
  const study = sheet.querySelector('.study-fold > .fold-head');
  const name = study.querySelector('.fold-title');
  const caret = (row) => { const c = row.querySelector('.today-detail-caret'); if (!c) return null; const r = c.getBoundingClientRect(); return { width: Math.round(r.width), transform: getComputedStyle(c).transform }; };
  return { text: study.textContent, today: look(document.querySelector('.today-record-name')), study: look(name),
    rowFont: look(study), studyCaret: caret(study), todayCaret: caret(today),
    border: { top: getComputedStyle(study).borderTopStyle, left: getComputedStyle(study).borderLeftStyle } };
})()`;

describe('“Study progress” is the fold row of Today and of More examples', () => {
  let host;
  beforeAll(async () => {
    host = await openCorridorSourcePage({ stylesheets, viewport: { width: 1728, height: 1050 } });
  }, 60000);
  afterAll(async () => {
    await host?.close();
  });
  for (const language of ['en', 'ja']) {
    test(`same face, same caret, no ▶ (${language})`, async () => {
      const seen = await host.page.evaluate(rows(language));
      expect(seen.text).toBe(language === 'ja' ? '学習の記録' : 'Study progress');
      expect(seen.text).not.toMatch(/[▶▼]/u);
      expect(seen.study).toEqual(seen.today);
      expect(seen.study.transform).toBe('none');
      expect(seen.studyCaret).toEqual(seen.todayCaret);
      expect(seen.studyCaret.width).toBeGreaterThan(0);
      // a row on hairlines, not a box
      expect(seen.border).toEqual({ top: 'solid', left: 'none' });
    }, 60000);
  }
  test('More examples carries the same caret in its summary', () => {
    expect(word).toMatch(/fold-name[^\n]*More examples[^\n]*\n?[^\n]*today-detail-caret/u);
  });
});

describe('a word page has one facts line under its reading', () => {
  test('p.entry-facts follows the reading: the level keeps its door, then part of speech and kanji', () => {
    const head = word.slice(word.indexOf("el('p', 'reading'"), word.indexOf('renderDepthBasis('));
    expect(head).toMatch(/el\('p', 'entry-facts'\)/u);
    expect(head).toMatch(/referenceCollectionChip\(`JLPT \$\{level\}`, `jlpt:\$\{level\}`\)/u);
    expect(head).toMatch(/WORD_FACT_POS/u);
    expect(head).toMatch(/rowChars\.length/u);
    // the standalone level line under the dictionary box is gone
    expect(word).not.toMatch(/shelf-meta entry-facts/u);
  });
  test('the part of speech is named in sentence case in both languages, never as a dictionary code', () => {
    const source = corridorDeclarations('corridor.js', ['WORD_FACT_POS']);
    const names = vm.runInNewContext(`${source}; WORD_FACT_POS`);
    for (const [code, [ja, en]] of Object.entries(names)) {
      expect(en.charAt(0), code).toBe(en.charAt(0).toUpperCase());
      expect(en.slice(1), code).toBe(en.slice(1).toLowerCase());
      expect(ja, code).not.toMatch(/[A-Za-z]/u);
    }
    expect(names.noun).toEqual(['名詞', 'Noun']);
    expect(Object.keys(names)).not.toContain('n-suf');
  });
});
