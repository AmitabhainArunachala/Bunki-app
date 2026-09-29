/** Design pass 2026-09-30, steps 1–2: the reader and the bookshelf, measured in a real browser.
 *
 *   R1 flush tokens     — adjacent reader tokens on one line leave no gap between their glyphs
 *                         (base text only, readings excluded), before and after a reading shows;
 *                         and no whitespace text node stands between token elements.
 *   R2 readability      — Japanese body 21–22 px at 1368 / 18–19 px at 390; a shown reading is
 *                         ≥ 0.55 × the body; an English gloss is ≥ 15 px at ≥ 4.5:1; the body text
 *                         itself is ≥ 4.5:1 (no light-grey reading text).
 *   R3 first sentence   — every token of the first sentence is inside the first viewport, and
 *                         nothing fixed (tip, bar, bug) covers it, at 390×844 and 1368×900.
 *   S1 learner wording  — no visible "signals disagree", 不一致 or "awaiting John" on the shelf or
 *                         in a reading.
 *   S2 first story      — the first shelf card's headline is inside 390×844 and not covered.
 *   S3 one count        — every number the unfiltered shelf states about its size is the same
 *                         number, and it equals the stories on the shelf (grid + today's band).
 *   J1 JLPT room        — the room and a question show no "awaiting John" / "machine-checked"
 *                         text; unreviewed tests wear the 未確認 chip; each level card carries its
 *                         level colour hook and a count of its tests (steps 3–4).
 *   K1 keyboard (R4)    — from the end of the title block to the article's close (読み終えた), a 3-paragraph
 *                         article costs at most paragraphs + 3 Tab presses: one stop per paragraph;
 *                         ←/→ move between words and Home/End reach a paragraph's ends; a word is
 *                         named by itself (control: bfb7ed50, where every word is a Tab stop).
 *   A1 no F1            — with a stored F1 preference and the listen control pressed where one
 *                         exists, no F1 clip is requested and no narration manifest naming F1 loads.
 *
 * Negative controls: every check runs unchanged against the pre-pass artifact (72b8b3ab) and
 * must fail there, except R2's furigana ratio, which that build already met; its control is a
 * scoped style injection (the reading at 0.46em, the corridor.css default) that the check must reject.
 * Usage: KAIRO_SITE_DIR=<artifact> KAIRO_ARTIFACT_SHA256=<digest> node verify-design-reader-shelf.mjs
 *        KAIRO_BROWSER=chromium|webkit limits the engines; --control adds the injected control.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';

const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');
assert(process.env.KAIRO_SITE_DIR && process.env.KAIRO_ARTIFACT_SHA256, 'Choose an existing artifact and its exact digest');
const site = resolveCorridorSite(), evidence = resolveCorridorEvidence();
const manifest = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
const engines = process.env.KAIRO_BROWSER && process.env.KAIRO_BROWSER !== 'all' ? [process.env.KAIRO_BROWSER] : ['chromium', 'webkit'];
assert(engines.every((engine) => ['chromium', 'webkit'].includes(engine)));
const withControl = process.argv.includes('--control');

const ARTICLE = 'global-voices:2026-09-28-65726'; // 「ダマスカス 郊外 ジャラマナ」, 「正 反対」, 「「 連帯 の 畑 」」
const NARRATED = 'aozora:000628';
const THREE_PARAS = 'real-hojoki'; // 方丈記 · 冒頭: three paragraphs // ごん狐: the pre-pass build carried F1 narration for it
const DESK = { width: 1368, height: 900 }, PHONE = { width: 390, height: 844 };
const GAP_MAX = 1.5; // px between one token's last glyph and the next token's first
const DIAGNOSTIC = /signals disagree|不一致|awaiting John/iu;

const host = await startStaticHost({ site, port: 0 });
const results = [];

async function open(page, search = '') {
  await page.goto(`${host.origin}/?entry=shelf&ui=bi${search}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.waitForTimeout(400);
}
async function openArticle(page, id, search = '') {
  await open(page, search);
  await page.evaluate((pid) => document.querySelector(`#shelf-body [data-passage="${pid}"] .shelf-open`).click(), id);
  await page.waitForFunction(() => document.body.dataset.view === 'reader' && document.querySelector('#reader .tok'));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
}

/** Glyph gaps between adjacent tokens, measured on base text (never inside <rt>). */
const measureGaps = (count) => {
  const reader = document.querySelector('#reader');
  const stray = [...reader.querySelectorAll('*')].concat(reader)
    .flatMap((node) => [...node.childNodes])
    .filter((node) => node.nodeType === 3 && !node.textContent.trim() && !node.parentElement.closest('rt'))
    .filter((node) => node.parentElement === reader || node.parentElement.classList.contains('token-door') || node.parentElement.classList.contains('bunsetsu'));
  // Two measures, because engines disagree about ruby: WebKit reports the base glyphs where they
  // sit, Chromium reports a base text box already widened to its reading. So besides the glyph
  // gap between tokens, each word's box is compared with the same base text set plain in the
  // reader's own font: any excess is air the reading pried into the line.
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;left:0;top:0;padding:0;margin:0;border:0';
  reader.append(probe);
  const boxes = [];
  for (const tok of [...reader.querySelectorAll('.tok')].slice(0, count)) {
    const word = tok.querySelector('.tok-word') || tok;
    const walker = document.createTreeWalker(word, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest('rt, .tok-en') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const rects = [];
    let base = '';
    while (walker.nextNode()) {
      base += walker.currentNode.textContent;
      const range = document.createRange();
      range.selectNodeContents(walker.currentNode);
      rects.push(...[...range.getClientRects()].filter((r) => r.width > 0));
    }
    if (!rects.length) continue;
    probe.textContent = base;
    const excess = word.getBoundingClientRect().width - probe.getBoundingClientRect().width;
    boxes.push({ text: base, index: Number(tok.dataset.index), first: rects[0], last: rects.at(-1), excess });
  }
  probe.remove();
  let worst = { gap: 0 };
  for (let i = 1; i < boxes.length; i += 1) {
    const a = boxes[i - 1], b = boxes[i];
    if (a.excess > worst.gap) worst = { gap: Math.round(a.excess * 100) / 100, pair: `${a.text} (box wider than its text)`, at: a.index };
    if (Math.abs(a.last.top - b.first.top) > 3 || b.first.left < a.last.left) continue; // a line break
    const gap = b.first.left - a.last.right;
    if (gap > worst.gap) worst = { gap: Math.round(gap * 100) / 100, pair: `${a.text}|${b.text}`, at: a.index };
  }
  return { tokens: boxes.length, worst, strayWhitespace: stray.length };
};

/** WCAG contrast of a node's text against the first opaque background behind it. */
const contrastOf = (selector) => {
  const node = document.querySelector(selector);
  if (!node) return null;
  const parse = (value) => {
    const srgb = value.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/u);
    if (srgb) return { rgb: [srgb[1], srgb[2], srgb[3]].map((v) => Number(v) * 255), a: srgb[4] === undefined ? 1 : Number(srgb[4]) };
    const rgb = value.match(/rgba?\(([^)]+)\)/u);
    if (!rgb) return null;
    const parts = rgb[1].split(/[\s,/]+/u).filter(Boolean).map(Number);
    return { rgb: parts.slice(0, 3), a: parts.length > 3 ? parts[3] : 1 };
  };
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  let bg = null;
  for (let el = node; el && !bg; el = el.parentElement) {
    const c = parse(getComputedStyle(el).backgroundColor);
    if (c && c.a > 0.95) bg = c;
  }
  bg ||= { rgb: [255, 255, 255], a: 1 };
  const fg = parse(getComputedStyle(node).color);
  const mixed = fg.rgb.map((v, i) => v * fg.a + bg.rgb[i] * (1 - fg.a));
  const [l1, l2] = [lum(mixed), lum(bg.rgb)];
  return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
};

async function tapToken(page, index) {
  const tok = page.locator(`#reader .tok[data-index="${index}"]`);
  await tok.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  const box = await tok.evaluate((node) => { const r = node.getClientRects()[0]; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(250);
}

try {
  for (const engine of engines) {
    const browser = await { chromium, webkit }[engine].launch({ headless: true });
    const context = async (viewport, init) => {
      const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce', serviceWorkers: 'block' });
      await silenceBrowserAudio(ctx);
      if (init) await ctx.addInitScript(init);
      await ctx.route('**/*', (route) => (new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort()));
      const page = await ctx.newPage();
      page.setDefaultTimeout(15000);
      return { ctx, page };
    };
    const run = async (name, viewport, body, init) => {
      const { ctx, page } = await context(viewport, init);
      try {
        const observations = await body(page);
        results.push({ engine, name, passed: true, observations });
        console.log(`PASS ${engine}/${name} ${JSON.stringify(observations)}`);
      } catch (error) {
        const screenshot = resolve(evidence, `${engine}-${name}.png`);
        await page.screenshot({ path: screenshot, animations: 'disabled' }).catch(() => {});
        results.push({ engine, name, passed: false, error: String(error.message || error), screenshot });
        console.log(`FAIL ${engine}/${name}: ${String(error.message || error).split('\n')[0]}`);
      } finally { await ctx.close(); }
    };

    for (const [label, viewport] of [['1368', DESK], ['390', PHONE]]) {
      await run(`R1-flush-tokens-${label}`, viewport, async (page) => {
        await openArticle(page, ARTICLE);
        const resting = await page.evaluate(measureGaps, 220);
        assert(resting.tokens > 100, `measured only ${resting.tokens} tokens`);
        assert.equal(resting.strayWhitespace, 0, 'whitespace text nodes stand between reader tokens');
        assert(resting.worst.gap <= GAP_MAX, `gap ${resting.worst.gap}px at ${resting.worst.pair} (token ${resting.worst.at})`);
        await tapToken(page, 1); // 郊外: its reading shows
        const shown = await page.evaluate(measureGaps, 220);
        assert(shown.worst.gap <= GAP_MAX, `with a reading shown: gap ${shown.worst.gap}px at ${shown.worst.pair}`);
        return { resting: resting.worst, shown: shown.worst, tokens: resting.tokens };
      });

      await run(`R2-readability-${label}`, viewport, async (page) => {
        await openArticle(page, ARTICLE);
        if (withControl) await page.addStyleTag({ content: '#reader rt, #reader ruby::before { font-size: 0.46em !important; }' });
        const body = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#reader')).fontSize));
        const [lo, hi] = label === '1368' ? [21, 22] : [18, 19];
        assert(body >= lo && body <= hi, `Japanese body ${body}px, wanted ${lo}–${hi}px`);
        const bodyContrast = await page.evaluate(contrastOf, '#reader .tok.content');
        assert(bodyContrast >= 4.5, `reading text contrast ${bodyContrast}:1`);
        await tapToken(page, 1);
        // measure what is painted: the <rt> itself, or the ruby's ::before when the reader draws
        // the reading there (the <rt> then stays in the DOM, undisplayed, as the reading's record)
        const rt = await page.evaluate(() => {
          const node = [...document.querySelectorAll('#reader .tok[data-index="1"] rt')].find((n) => !n.classList.contains('hidden-rt'));
          if (!node) return null;
          const drawn = getComputedStyle(node).display === 'none' ? getComputedStyle(node.parentElement, '::before') : getComputedStyle(node);
          const text = drawn === getComputedStyle(node) ? node.textContent : drawn.content.replace(/^"|"$/gu, '');
          return { size: parseFloat(drawn.fontSize), opacity: Number(drawn.opacity), text, expected: node.textContent,
            carrier: getComputedStyle(node).display === 'none' ? 'ruby::before' : 'rt' };
        });
        assert(rt && rt.opacity > 0.9 && rt.text === rt.expected, `the first tap shows no reading: ${JSON.stringify(rt)}`);
        assert(rt.size / body >= 0.55, `furigana ${rt.size}px is ${(rt.size / body).toFixed(2)}× the body`);
        await tapToken(page, 1);
        const gloss = await page.evaluate(() => {
          const node = document.querySelector('#reader .tok[data-index="1"] .tok-en');
          return node ? { size: parseFloat(getComputedStyle(node).fontSize), text: node.textContent } : null;
        });
        assert(gloss, 'the second tap shows no English');
        const glossContrast = await page.evaluate(contrastOf, '#reader .tok[data-index="1"] .tok-en');
        assert(gloss.size >= 15, `English gloss ${gloss.size}px`);
        assert(glossContrast >= 4.5, `English gloss contrast ${glossContrast}:1`);
        return { body, bodyContrast, furigana: rt.size, carrier: rt.carrier, ratio: Math.round((rt.size / body) * 100) / 100, gloss: gloss.size, glossContrast };
      });

      await run(`R3-first-sentence-${label}`, viewport, async (page) => {
        await openArticle(page, ARTICLE);
        const probe = await page.evaluate(() => {
          const toks = [...document.querySelectorAll('#reader .tok')];
          const end = toks.findIndex((t) => /[。！？]/u.test(t.textContent));
          const sentence = toks.slice(0, end + 1);
          const misses = [];
          for (const t of sentence) {
            const r = t.getClientRects()[0];
            const x = r.left + r.width / 2, y = r.top + r.height / 2;
            const hit = document.elementFromPoint(x, y);
            if (r.bottom > innerHeight || r.top < 0) misses.push({ t: t.textContent, bottom: Math.round(r.bottom), why: 'outside' });
            else if (!hit || !t.contains(hit)) misses.push({ t: t.textContent, why: `covered by ${hit?.tagName.toLowerCase()}.${[...(hit?.classList || [])].join('.')}` });
          }
          const last = sentence.at(-1).getClientRects()[0];
          return { tokens: sentence.length, lastBottom: Math.round(last.bottom), viewport: innerHeight, misses: misses.slice(0, 4), missCount: misses.length };
        });
        assert.equal(probe.missCount, 0, `first sentence not wholly on the first screen: ${JSON.stringify(probe.misses)}`);
        return probe;
      });
    }

    await run('S1-learner-wording', DESK, async (page) => {
      const seen = [];
      for (const ui of ['bi', 'ja']) {
        await page.goto(`${host.origin}/?entry=shelf&ui=${ui}`);
        await page.waitForFunction(() => document.body.dataset.ready === '1');
        await page.waitForTimeout(400);
        const shelf = await page.evaluate(() => document.body.innerText);
        if (DIAGNOSTIC.test(shelf)) seen.push(`shelf/${ui}: ${shelf.match(/.{0,30}(signals disagree|不一致|awaiting John).{0,30}/iu)?.[0]}`);
        await page.evaluate((pid) => document.querySelector(`#shelf-body [data-passage="${pid}"] .shelf-open`).click(), ARTICLE);
        await page.waitForFunction(() => document.querySelector('#reader .tok'));
        const reader = await page.evaluate(() => document.body.innerText);
        if (DIAGNOSTIC.test(reader)) seen.push(`reader/${ui}: ${reader.match(/.{0,30}(signals disagree|不一致|awaiting John).{0,30}/iu)?.[0]}`);
      }
      assert.equal(seen.length, 0, seen.join(' | '));
      return { screens: 4 };
    });

    await run('S2-first-story-above-fold-390', PHONE, async (page) => {
      await open(page);
      const probe = await page.evaluate(() => {
        const card = document.querySelector('#shelf-reading-results > [data-passage]');
        const title = card.querySelector('.shelf-title');
        const r = title.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + Math.min(r.width, 40) / 2, r.top + Math.min(r.height, 30) / 2);
        return { passage: card.dataset.passage, top: Math.round(r.top), bottom: Math.round(r.bottom), viewport: innerHeight, own: !!hit && card.contains(hit) };
      });
      assert(probe.bottom <= probe.viewport, `first story headline ends at ${probe.bottom}px of ${probe.viewport}`);
      assert(probe.own, 'something covers the first story headline');
      return probe;
    });

    await run('S3-counts-agree', DESK, async (page) => {
      await open(page);
      const probe = await page.evaluate(() => {
        const cards = new Set([...document.querySelectorAll('#shelf-body [data-passage] .shelf-open')]
          .map((n) => n.closest('[data-passage]').dataset.passage)).size;
        const lines = [...document.querySelectorAll('.shelf-masthead p, .shelf-results-count')]
          .filter((n) => n.offsetParent !== null || n.classList.contains('shelf-results-count')).map((n) => n.innerText);
        // a size is "N readings" / "N本" / "of these N"; "N of these" is a subset (the unreviewed count)
        const numbers = lines.flatMap((t) => [
          ...[...t.matchAll(/(\d+)\s*(?:readings|本)/gu)].map((m) => Number(m[1])),
          ...[...t.matchAll(/of these (\d+)/gu)].map((m) => Number(m[1])),
        ]);
        return { cards, lines, numbers };
      });
      assert(probe.numbers.length, `no size stated: ${JSON.stringify(probe.lines)}`);
      assert(probe.numbers.every((n) => n === probe.cards), `stated ${JSON.stringify(probe.numbers)} for ${probe.cards} stories: ${JSON.stringify(probe.lines)}`);
      return probe;
    });

    await run('J1-jlpt-room-wording', DESK, async (page) => {
      await open(page);
      await page.evaluate(() => { const door = document.getElementById('mock-link'); door.closest('details')?.setAttribute('open', ''); door.click(); });
      await page.waitForSelector('[data-exam-start]');
      const room = await page.evaluate(() => ({
        text: document.querySelector('#app main').innerText,
        chips: document.querySelectorAll('#app main .status-chip').length,
        levels: [...document.querySelectorAll('[data-exam-level]')].map((n) => ({ level: n.dataset.level || null, tests: n.querySelector('.exam-level-tests')?.textContent || '' })),
      }));
      await page.evaluate(() => document.querySelector('[data-exam-start]').click());
      await page.waitForSelector('.exam-confirm');
      await page.locator('.exam-confirm button', { hasText: /study/i }).first().click();
      await page.waitForSelector('.exam-paper');
      const question = await page.evaluate(() => document.querySelector('#app main').innerText);
      const leaks = [room.text, question].flatMap((t) => t.match(/.{0,20}(awaiting John|machine-checked).{0,20}/giu) || []);
      assert.equal(leaks.length, 0, `diagnostic wording: ${leaks.join(' | ')}`);
      assert(room.chips > 0, 'no 未確認 chip on unreviewed tests');
      assert(room.levels.length === 5 && room.levels.every((l) => l.level && /\d/u.test(l.tests)), `level cards: ${JSON.stringify(room.levels)}`);
      return { chips: room.chips, levels: room.levels };
    });

    await run('K1-keyboard-roving', DESK, async (page) => {
      await openArticle(page, THREE_PARAS);
      const paragraphs = await page.evaluate(() => document.querySelectorAll('#reader .para-break').length + 1);
      assert.equal(paragraphs, 3, `fixture has ${paragraphs} paragraphs`);
      // start at the end of the title block: the title's own lookup words are prose lookup (Codex's
      // prose R4, one stop per block when it lands); this counts the reader from there to its close
      await page.evaluate(() => {
        const t = document.querySelector('h1.view-title');
        const last = [...t.querySelectorAll('button, a[href], [tabindex]')].at(-1);
        if (last) last.focus(); else { t.tabIndex = -1; t.focus(); }
      });
      let presses = 0;
      for (; presses < 400; presses += 1) {
        if (await page.evaluate(() => document.activeElement?.id === 'read-fin')) break;
        await page.keyboard.press('Tab');
      }
      assert(presses <= paragraphs + 3, `${presses} Tab presses from the title to 読み終えた for ${paragraphs} paragraphs`);
      const first = page.locator('#reader button.tok[tabindex="0"]').first();
      await first.focus();
      const walk = await page.evaluate(() => {
        const a = document.activeElement;
        return { index: a.dataset.index, name: a.getAttribute('aria-label'), word: a.querySelector('.tok-word')?.textContent.replace(/\s/gu, '') ?? '' };
      });
      await page.keyboard.press('ArrowRight');
      const right = await page.evaluate(() => document.activeElement?.dataset.index);
      await page.keyboard.press('End');
      const end = await page.evaluate(() => ({ index: document.activeElement?.dataset.index, para: document.activeElement?.dataset.para }));
      await page.keyboard.press('Home');
      const home = await page.evaluate(() => document.activeElement?.dataset.index);
      assert(Number(right) > Number(walk.index), `→ did not move forward (${walk.index} → ${right})`);
      assert(Number(end.index) > Number(right) && home === walk.index, `Home/End: ${JSON.stringify({ end, home, start: walk.index })}`);
      assert(walk.name && !/activation|word ·|読みと意味/u.test(walk.name), `a word is named by more than itself: "${walk.name}"`);
      return { paragraphs, presses, name: walk.name };
    });

    await run('A1-no-f1-audio', DESK, async (page) => {
      const requests = [];
      page.on('request', (r) => requests.push(r.url()));
      const manifests = [];
      page.on('response', async (response) => {
        if (/article-narration\.json/u.test(response.url())) manifests.push(await response.json().then((j) => j.voice ?? null).catch(() => 'unreadable'));
      });
      for (const id of [NARRATED, ARTICLE]) {
        await openArticle(page, id);
        const listen = page.locator('#listen-toggle');
        if (await listen.count() && await listen.isEnabled()) { await listen.click(); await page.waitForTimeout(1500); }
      }
      const listenText = await page.evaluate(() => document.querySelector('.listen-row')?.innerText ?? '');
      const f1 = requests.filter((u) => /\/audio\/(narration|w)\/f1\//u.test(u));
      assert.equal(f1.length, 0, `F1 clips requested: ${f1.slice(0, 3).join(', ')}`);
      assert(!manifests.includes('f1'), 'a narration manifest naming F1 was loaded');
      assert(!/\bF1\b/u.test(listenText), `the listen row names F1: ${listenText}`);
      return { f1Requests: 0, narrationManifests: manifests, listenText };
    }, () => { try { localStorage.setItem('kairo-rec-voice-v1', 'f1'); } catch { /* storage refused */ } });

    await browser.close();
  }
} finally {
  await host.close();
  const receipt = {
    artifactSha256: manifest.artifactSha256, gitSha: manifest.gitSha, sourceDirty: manifest.sourceDirty,
    verifierSha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
    control: withControl ? 'rt and ruby::before forced to 0.46em' : null,
    scope: 'Design pass steps 1–2: reader token flushness, readability, first screen; shelf wording and first story; no F1 audio',
    results,
    passed: results.length === engines.length * 12 && results.every((row) => row.passed),
  };
  writeFileSync(resolve(evidence, 'design-reader-shelf.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(`${results.filter((r) => r.passed).length}/${results.length} passed · evidence ${evidence}`);
  if (!receipt.passed) process.exitCode = 1;
}
