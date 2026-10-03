/**
 * study.html verifier. Done = this is green.
 *
 * Reads the built page's own embedded deck, then drives the page in real
 * Chromium from file:// (the way it is used: one file, no server):
 *
 *   D1  every card's front window is a passage paragraph of ≥100 characters
 *       whose anchor token's base form IS the headword
 *   D2  every extra example sentence is tokenised with its target merged
 *   B1  home → Space starts a review whose front is that paragraph
 *   B2  recognition front: the asked word is lit and its reading hidden
 *   B3  all 323 cloze fronts hide the answer (no headword, no stem in view)
 *   B4  revealing the answer does not move the paragraph
 *   B5  a grade persists under kotoba-mine.v1; U undoes it exactly
 *   B6  progress saved by the previous study.html still schedules
 *   B7  furigana hover/off take no layout room; F cycles to real <ruby>
 *   B8  at 390px no element reaches past the viewport, on every screen
 *   B9  two fronts in a row never show the same paragraph
 *   B10 any word in the reader opens its reading
 *   B11 no page or console error anywhere in the walk
 *
 * Claim boundary: this proves behaviour and layout invariants in Chromium.
 * It does not judge beauty, Safari/iOS rendering, speech output, or whether
 * an authored passage makes a blank unambiguous to a human reader.
 *
 * Usage: node prototypes/corridor/tools/verify-kotoba-study.mjs [path/to/study.html]
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(process.argv[2] || resolve(HERE, '../../../decks/kotoba-mine/release/study.html'));
const URL = 'file://' + FILE;
const KEY = 'kotoba-mine.v1';

const results = [];
const check = (id, ok, detail = '') => {
  results.push({ id, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${detail ? '  — ' + detail : ''}`);
};

// ---------- data ----------
const html = readFileSync(FILE, 'utf8');
const m = html.match(/const DECK = (\{.*?\});\n/s);
let deck = null;
try {
  deck = m ? JSON.parse(m[1]) : null;
} catch {}
if (!deck) check('D0 deck embedded', false, 'no parsable DECK in the page');
else {
  const text = (toks) => toks.map((t) => t[0]).join('');
  let short = [],
    wrongAnchor = [],
    noToks = [];
  for (const mod of deck.modules) {
    if (!mod.paras) {
      short.push(mod.id + ': no paragraphs');
      continue;
    }
    for (const c of mod.cards) {
      if (!c.ctx || !c.at) {
        short.push(c.key + ': no window');
        continue;
      }
      const len = mod.paras.slice(c.ctx[0], c.ctx[1] + 1).reduce((n, p) => n + text(p).length, 0);
      if (len < 100) short.push(`${c.key} ${len}字`);
      const tok = mod.paras[c.at[0]]?.[c.at[1]];
      if (!tok || (tok[2] || tok[0]) !== c.term) wrongAnchor.push(`${c.key} ${c.term}≠${tok?.[0]}`);
      for (const s of c.sentences.slice(1)) {
        const t = s.toks?.[s.at];
        if (!t || (t[2] || t[0]) !== c.term) noToks.push(`${c.key} ${s.form}`);
      }
    }
  }
  const n = deck.modules.reduce((k, x) => k + x.cards.length, 0);
  check(
    'D1 fronts are ≥100-char paragraphs anchored on the headword',
    !short.length && !wrongAnchor.length,
    short.length || wrongAnchor.length
      ? [...short, ...wrongAnchor].slice(0, 5).join('; ')
      : `${n} cards`,
  );
  check(
    'D2 example sentences tokenised, target merged',
    !noToks.length,
    noToks.slice(0, 5).join('; '),
  );
}

// ---------- browser ----------
const browser = await chromium.launch();
const errors = [];
async function open(viewport, seed) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  contexts.push(ctx);
  if (seed)
    await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(seed)]);
  const p = await ctx.newPage();
  p.setDefaultTimeout(5000);
  p.setDefaultNavigationTimeout(20000);
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await settle(p);
  return { ctx, p };
}
/** web fonts are never render-blocking, so they swap in late: give them up to 8 s
 * (offline they never come, and the Hiragino fallback is what gets measured) */
async function settle(p) {
  await p
    .waitForFunction(() => document.querySelector('link[data-webfonts]')?.media === 'all', null, {
      timeout: 8000,
    })
    .catch(() => {});
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(250);
}
const overflow = (p) =>
  p.evaluate(() => {
    const W = document.documentElement.clientWidth;
    // a sideways-scrolling strip (the reader's module chips) may hold children past the edge
    const inScroller = (e) => {
      for (let a = e.parentElement; a && a !== document.body; a = a.parentElement)
        if (/(auto|scroll|hidden)/.test(getComputedStyle(a).overflowX)) return true;
      return false;
    };
    const bad = [...document.querySelectorAll('body *')].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width && r.right > W + 1 && !inScroller(e);
    });
    return bad
      .filter((e) => ![...e.children].some((k) => bad.includes(k)))
      .slice(0, 3)
      .map((e) => `${e.tagName}.${e.className}`);
  });

const contexts = [];
async function guard(id, fn) {
  try {
    await fn();
  } catch (e) {
    check(id, false, 'threw: ' + String(e.message || e).split('\n')[0]);
  } finally {
    while (contexts.length)
      await contexts
        .pop()
        .close()
        .catch(() => {});
  }
}
try {
  await guard('B1–B5 review walk', async () => {
    const { ctx, p } = await open({ width: 1280, height: 860 });
    const startable = await p.locator('#start:not([disabled])').count();
    await p.keyboard.press('Space');
    const ctxLen = await p
      .locator('#card .ctx')
      .evaluate((e) => e.textContent.length)
      .catch(() => 0);
    check(
      'B1 Space starts a review on a paragraph front',
      startable === 1 && ctxLen >= 100,
      `front ${ctxLen}字`,
    );
    const lit = await p.locator('#card .ctx .tgt.hide-rt').count();
    const answerEarly = await p.locator('#card .answer').count();
    check(
      'B2 recognition front lights the word and hides its reading',
      lit === 1 && answerEarly === 0,
      `lit ${lit}, answer shown ${answerEarly}`,
    );
    await p.evaluate(() => document.fonts.ready);
    const before = await p.locator('#card .ctx').boundingBox();
    await p.keyboard.press('Space');
    await p.evaluate(() => document.fonts.ready);
    const after = await p.locator('#card .ctx').boundingBox();
    const shifted =
      before && after ? Math.abs(before.y - after.y) + Math.abs(before.height - after.height) : 99;
    check(
      'B4 revealing keeps the paragraph in place',
      shifted <= 1 && (await p.locator('#card .answer').count()) === 1,
      `moved ${shifted.toFixed(1)}px`,
    );
    const face = await p.evaluate(() => cur.face);
    const n0 = await p.evaluate(() => queue.length);
    await p.keyboard.press('3');
    const saved = await p.evaluate(
      ([k, f]) => JSON.parse(localStorage.getItem(k)).cards[f],
      [KEY, face],
    );
    const n1 = await p.evaluate(() => queue.length);
    await p.keyboard.press('u');
    const undone = await p.evaluate(
      ([k, f]) => ({
        gone: !JSON.parse(localStorage.getItem(k)).cards[f],
        face: cur.face,
        rev: cur.revealed,
      }),
      [KEY, face],
    );
    check(
      'B5 grade persists; U undoes it exactly',
      !!saved &&
        saved.s === 'learn' &&
        n1 === n0 - 1 &&
        undone.gone &&
        undone.face === face &&
        undone.rev,
      `saved ${saved?.s}, queue ${n0}→${n1}, undo ${JSON.stringify(undone)}`,
    );
    await ctx.close();
  });

  await guard('B3 cloze fronts', async () => {
    const { ctx, p } = await open({ width: 1280, height: 860 });
    const leaks = await p.evaluate(() => {
      const out = [];
      for (const c of CARDS) {
        for (const hint of ['def', 'none']) {
          const el = contextEl(c, 'blank', hint);
          const shown = el.textContent;
          const tok = c.mod.paras[c.at[0]][c.at[1]];
          // the answer is the headword, and for a word card also its written stem when that stem
          // is itself a word (≥2 characters: 下敷 of 下敷きになる) — never a lone shared kanji (速)
          const KANJI = /[㐀-鿿々]/;
          const stem = c.pos === 'kanji' ? c.term : stemSplit(tok).stem;
          if (KANJI.test(c.term) && shown.includes(c.term)) out.push(`${c.key} term ${c.term}`);
          else if (
            (stem.length >= 2 || c.pos === 'kanji') &&
            KANJI.test(stem) &&
            shown.includes(stem)
          )
            out.push(`${c.key} stem ${stem}`);
          else if (!KANJI.test(c.term) && c.term.length >= 3 && shown.includes(c.term))
            out.push(`${c.key} kana ${c.term}`);
          else if (!el.querySelector('.blank')) out.push(`${c.key} no blank`);
        }
      }
      return [CARDS.length, out];
    });
    check(
      'B3 every cloze front hides the answer',
      leaks[1].length === 0,
      leaks[1].length
        ? leaks[1].slice(0, 6).join('; ') + ` (+${leaks[1].length})`
        : `${leaks[0]} cards × 2 hint modes`,
    );
    await ctx.close();
  });

  await guard('B6 carry-over', async () => {
    const now = Date.now();
    const old = {
      cards: {
        'km-064:r': {
          s: 'review',
          due: now - 1000,
          ivl: 3,
          S: 3.2,
          D: 5,
          reps: 2,
          last: now - 3 * 864e5,
        },
      },
      on: {},
      newPerDay: 15,
      mode: 'recognition',
      showEn: false,
      newToday: { d: new Date().toDateString(), n: 0 },
      log: [['km-064:r', 3, now - 3 * 864e5]],
    };
    const { ctx, p } = await open({ width: 1280, height: 860 }, old);
    const reviewTally = await p.locator('.tally .r b').textContent();
    await p.keyboard.press('Space');
    const first = await p.evaluate(() => cur.face);
    check(
      'B6 progress from the previous page still schedules',
      reviewTally === '1' && first === 'km-064:r',
      `review tally ${reviewTally}, first ${first}`,
    );
    await ctx.close();
  });

  await guard('B7 furigana', async () => {
    const { ctx, p } = await open({ width: 1280, height: 860 });
    await p.keyboard.press('Space');
    const hover = await p.evaluate(() => ({
      ruby: document.querySelectorAll('#card ruby').length,
      rb: document.querySelectorAll('#card .rb').length,
      hgt: document.querySelector('#card .ctx').getBoundingClientRect().height,
    }));
    await p.keyboard.press('f'); // → on
    const on = await p.evaluate(() => ({
      mode: st.furi,
      ruby: document.querySelectorAll('#card ruby').length,
    }));
    await p.keyboard.press('f'); // → off
    const off = await p.evaluate(() => ({
      mode: st.furi,
      hgt: document.querySelector('#card .ctx').getBoundingClientRect().height,
    }));
    await p.keyboard.press('f'); // → hover again (leave the default)
    check(
      'B7 furigana: hover/off take no room, F reaches real ruby',
      hover.ruby === 0 &&
        hover.rb > 0 &&
        on.mode === 'on' &&
        on.ruby > 0 &&
        off.mode === 'off' &&
        Math.abs(off.hgt - hover.hgt) < 0.5,
      `hover ruby ${hover.ruby}/rb ${hover.rb}, on ruby ${on.ruby}, height hover ${hover.hgt.toFixed(1)} off ${off.hgt.toFixed(1)}`,
    );
    await ctx.close();
  });

  await guard('B8/B10 phone', async () => {
    const { ctx, p } = await open({ width: 390, height: 844 });
    const seen = {};
    seen.home = await overflow(p);
    await p.keyboard.press('Space');
    seen.front = await overflow(p);
    await p.keyboard.press('Space');
    seen.answer = await overflow(p);
    await p.evaluate(() => {
      st.mode = 'production';
      save();
    });
    await p.keyboard.press('Escape');
    await p.keyboard.press('Space');
    await p.keyboard.press('h');
    await p.keyboard.press('h');
    seen.cloze = await overflow(p);
    await p.keyboard.press('Escape');
    for (const tab of ['read', 'list', 'settings']) {
      await p.click(`[data-tab="${tab}"]`);
      seen[tab] = await overflow(p);
    }
    const bad = Object.entries(seen).filter(([, v]) => v.length);
    check(
      'B8 nothing reaches past a 390px screen',
      !bad.length,
      bad.map(([k, v]) => `${k}: ${v.join(',')}`).join(' | ') || Object.keys(seen).join(' · '),
    );
    await p.click('[data-tab="read"]');
    const w = p.locator('.article .body .w').nth(3);
    const word = await w.textContent();
    await w.click();
    const pop = await p
      .locator('.pop')
      .textContent()
      .catch(() => '');
    check(
      'B10 any word in the reader opens its reading',
      pop.length > 0 && pop.includes(word.replace(/\s/g, '').slice(0, 1)),
      `${word} → ${pop.slice(0, 24)}`,
    );
    await ctx.close();
  });

  await guard('B9 order', async () => {
    const { ctx, p } = await open({ width: 1280, height: 860 });
    await p.keyboard.press('Space');
    const seq = [];
    for (let i = 0; i < 12; i++) {
      const c = await p.evaluate(() => (cur ? ctxOf(cur.face) : null));
      if (!c) break;
      seq.push(c);
      await p.keyboard.press('Space');
      await p.keyboard.press('3');
    }
    const repeats = seq.filter(
      (c, i) => i && c[0] === seq[i - 1][0] && c[1] <= seq[i - 1][2] && seq[i - 1][1] <= c[2],
    ).length;
    check(
      'B9 two fronts in a row never share a paragraph',
      seq.length >= 10 && repeats === 0,
      `${seq.length} fronts, ${repeats} repeats`,
    );
    await ctx.close();
  });
} finally {
  await browser.close();
}
check('B11 no page or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} passed${failed.length ? ' — FAILED: ' + failed.map((f) => f.id.split(' ')[0]).join(', ') : ''}`,
);
process.exit(failed.length ? 1 : 0);
