/**
 * Reader doors that answer: every door on the shelf and in an article does something.
 *
 *   D0 identity: the served build is the commit under test.
 *   D1 today's picks: at 1728×996 and 390×844, each #shelf-today door's own centre is the
 *      door (no sibling painted over it), and a real click there opens that article.
 *      Control: the 09-24 study overlay's 6-column grid (register.css before the C1
 *      spanning rule) put the strip in one ~106 px column; its centre hit the next
 *      heading and the tap did nothing ("The Man in the Next Room", Codex 04:07Z).
 *   D2 a reading door (a non-content kanji token: name or numeral), exact token in
 *      aozora:046605, furigana 1 and 0: tap/Enter/Space show-hide-show exactly its reading;
 *      no English; focus kept; the neighbour and the passage unchanged. Control: 9ee2976d
 *      renders a button with no handler, so the tap changes nothing.
 *   D3 readings always on (0,2,0) or already kana (2,1,0): names are plain text without a
 *      pointer cursor. Control: 10125f16 renders a button at 2,1,0 that reveals nothing.
 *   D4 reveal/gloss state never crosses passages by index (Codex counterexample A→B token 1).
 *      Control: 10125f16 shows B's name with A's reveal and, once toggled, "mountain stream".
 *
 * Clicks go to coordinates (page.mouse), not locator.click: Playwright retries a locator
 * click when another element would receive it, which hides exactly this defect.
 *
 * Usage: node verify-reader-doors.mjs   (KAIRO_SITE_DIR may pin a staged artifact)
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { chromium } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';

const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');

const SITE = resolveCorridorSite();
const EVIDENCE = resolveCorridorEvidence();
const results = [];
const pageErrors = [];
let currentCase = 'setup';
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass, detail });
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? `  — ${detail}` : ''}`);
};
const ready = (page) => page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30_000 });
let host = null, origin = null, browser = null;

async function openPage(viewport, query) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.width > 1000 ? 2 : 3 });
  context.on('page', (page) => page.on('pageerror', (error) => {
    if (pageErrors.length < 20) pageErrors.push({ case: currentCase, message: error.message });
  }));
  const page = await context.newPage();
  await page.goto(`${origin}/index.html${query}`);
  await ready(page);
  return { context, page };
}

try {
  host = await startStaticHost({ site: SITE, port: 0 });
  origin = host.origin;
  browser = await chromium.launch();

  currentCase = 'D0';
  {
    const { context, page } = await openPage({ width: 1024, height: 800 }, '?entry=shelf');
    const identity = await (await page.request.get(`${origin}/build-identity.json`)).json();
    let head = null; try { head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* outside a checkout */ }
    const expected = process.env.KAIRO_EXPECT_GITSHA || head;
    const served = createHash('sha256').update(Buffer.from(await (await page.request.get(`${origin}/corridor.js`)).body())).digest('hex');
    check('D0 served build is the expected clean commit', identity.gitSha === expected && identity.sourceDirty === false
      && served === new Map(identity.files.map((row) => [row.path, row.sha256])).get('corridor.js'), `served=${identity.gitSha} expected=${expected}`);
    await context.close();
    if (results.some((r) => !r.pass)) throw new Error('identity failed');
  }

  currentCase = 'D1';
  for (const viewport of [{ width: 1728, height: 996 }, { width: 390, height: 844 }]) {
    const label = `${viewport.width}`;
    const { context, page } = await openPage(viewport, '?entry=shelf');
    const count = await page.locator('#shelf-today .shelf-open').count();
    check(`D1 ${label}: today's picks are on the shelf`, count > 0, `${count} doors`);
    for (let i = 0; i < count; i++) {
      await page.goto(`${origin}/index.html?entry=shelf`); await ready(page);
      const door = page.locator('#shelf-today .shelf-open').nth(i);
      await door.scrollIntoViewIfNeeded();
      const probe = await door.evaluate((node) => {
        const box = node.getBoundingClientRect();
        const x = box.left + box.width / 2, y = box.top + box.height / 2;
        const hit = document.elementFromPoint(x, y);
        const card = node.closest('[data-passage]');
        return { x, y, own: !!hit && hit.closest('.shelf-open') === node, hit: hit ? `${hit.tagName.toLowerCase()}.${[...hit.classList].join('.')}` : null,
          passage: card?.dataset.passage || null, strip: Math.round(document.querySelector('#shelf-today')?.getBoundingClientRect().width || 0) };
      });
      check(`D1 ${label} pick ${i + 1}: its centre is the door itself`, probe.own, JSON.stringify({ hit: probe.hit, strip: probe.strip }));
      await page.mouse.click(probe.x, probe.y);
      const opened = await page.waitForFunction((id) => document.body.dataset.view === 'reader'
        && document.querySelector('.listen-row')?.dataset.passage === id, probe.passage, { timeout: 5_000 }).then(() => true, () => false);
      check(`D1 ${label} pick ${i + 1}: a click at that point opens that same article`, opened && !!probe.passage, probe.passage || '');
    }
    await context.close();
  }

  // D2/D3/D4 use named passages from the committed data, so every row names its exact token
  const PASSAGE_A = 'aozora:000628', PASSAGE_B = 'aozora:046605';
  const openArticle = async (page, query, id) => {
    await page.goto(`${origin}/index.html?entry=shelf&${query}`); await ready(page);
    await page.locator(`[data-passage="${id}"]:not([data-recommendation]) .shelf-open`).first().click();
    await page.waitForFunction((pid) => document.querySelector('.listen-row')?.dataset.passage === pid && document.querySelector('#reader .tok'), id, { timeout: 10_000 });
  };
  // the observable state of one token by index: its text, visible ruby, gloss and focus
  const tokenState = (page, index) => page.evaluate((i) => {
    const node = document.querySelector(`#reader .tok[data-index="${i}"]`);
    if (!node) return null;
    return { tag: node.tagName.toLowerCase(), cls: node.className,
      visibleRuby: [...node.querySelectorAll('rt')].filter((rt) => !rt.classList.contains('hidden-rt')).map((rt) => rt.textContent).join(''),
      gloss: node.querySelector('.tok-en')?.textContent || null, focused: document.activeElement === node,
      label: node.getAttribute('aria-label') || '', cursor: getComputedStyle(node).cursor };
  }, index);

  currentCase = 'D2';
  {
    const { context, page } = await openPage({ width: 1280, height: 860 }, '?entry=shelf');
    for (const furigana of [1, 0]) {
      await openArticle(page, `dials=0,${furigana},0`, PASSAGE_B);
      const index = await page.evaluate(() => document.querySelector('#reader button.tok.named')?.dataset.index ?? null);
      check(`D2 f=${furigana}: a named door exists in ${PASSAGE_B}`, index !== null);
      if (index === null) continue;
      const neighbour = String(Number(index) + 1);
      const before = await tokenState(page, index), neighbourBefore = await tokenState(page, neighbour);
      const views = [];
      for (const how of ['tap', 'Enter', 'Space']) {
        if (how === 'tap') {
          const box = await page.locator(`#reader .tok[data-index="${index}"]`).boundingBox();
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        } else {
          await page.locator(`#reader .tok[data-index="${index}"]`).focus();
          await page.keyboard.press(how);
        }
        views.push(await tokenState(page, index));
      }
      const shownAfterTap = views[0].visibleRuby, hiddenAfterEnter = views[1].visibleRuby, shownAfterSpace = views[2].visibleRuby;
      check(`D2 f=${furigana}: tap shows the reading, Enter hides it, Space shows it again`,
        !before.visibleRuby && !!shownAfterTap && !hiddenAfterEnter && shownAfterSpace === shownAfterTap, JSON.stringify(views.map((v) => v.visibleRuby)));
      check(`D2 f=${furigana}: a name never gains an English gloss`, views.every((v) => v.gloss === null), JSON.stringify(views.map((v) => v.gloss)));
      check(`D2 f=${furigana}: focus stays on the same button after keyboard activation`, views[1].focused && views[2].focused);
      check(`D2 f=${furigana}: the neighbour token is unchanged`, JSON.stringify(await tokenState(page, neighbour)) === JSON.stringify({ ...neighbourBefore, focused: false }));
      check(`D2 f=${furigana}: no navigation, still ${PASSAGE_B}`, await page.evaluate((pid) => document.body.dataset.view === 'reader'
        && document.querySelector('.listen-row')?.dataset.passage === pid, PASSAGE_B));
      check(`D2 f=${furigana}: the label names a reading, not a word class`, /reading|読み/u.test(views[0].label) && !/\bname\b|名前/u.test(views[0].label), views[0].label);
    }
    await context.close();
  }

  currentCase = 'D3';
  {
    const { context, page } = await openPage({ width: 1280, height: 860 }, '?entry=shelf');
    for (const dials of ['0,2,0', '2,1,0']) {
      await openArticle(page, `dials=${dials}`, PASSAGE_B);
      const state = await page.evaluate(() => ({ named: document.querySelectorAll('#reader .tok.named').length,
        buttons: document.querySelectorAll('#reader button.tok.named').length,
        cursor: [...document.querySelectorAll('#reader span.tok.named')].slice(0, 1).map((n) => getComputedStyle(n).cursor)[0] || null }));
      check(`D3 dials ${dials}: names are plain text, not buttons that reveal nothing`, state.named > 0 && state.buttons === 0, JSON.stringify(state));
      check(`D3 dials ${dials}: plain names do not advertise a click`, state.cursor !== 'pointer', String(state.cursor));
    }
    await context.close();
  }

  currentCase = 'D4';
  {
    // Codex's counterexample: reveal and gloss token 1 in A, then open B, whose token 1 is a name
    const { context, page } = await openPage({ width: 1280, height: 860 }, '?entry=shelf');
    await openArticle(page, 'dials=0,1,0', PASSAGE_A);
    for (let i = 0; i < 2; i++) await page.locator('#reader .tok[data-index="1"]').click();
    const glossedInA = (await tokenState(page, '1'))?.gloss;
    await openArticle(page, 'dials=0,1,0', PASSAGE_B);
    const inB = await tokenState(page, '1');
    check('D4 control: token 1 in A was glossed by two taps', !!glossedInA, String(glossedInA));
    check('D4 a new passage inherits no reveal or gloss by index', inB && !inB.visibleRuby && inB.gloss === null, JSON.stringify(inB));
    if (inB?.tag === 'button') {
      const box = await page.locator('#reader .tok[data-index="1"]').boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      check('D4 toggling that name adds no English', (await tokenState(page, '1')).gloss === null);
    }
    await context.close();
  }
} catch (error) {
  results.push({ name: `terminal (${currentCase})`, pass: false, detail: error.stack || String(error) });
  console.log(`  FAIL terminal in ${currentCase} — ${error.message}`);
} finally {
  await browser?.close().catch((error) => results.push({ name: 'browser · cleanup', pass: false, detail: error.message }));
  await host?.close().catch((error) => results.push({ name: 'host · cleanup', pass: false, detail: error.message }));
  if (pageErrors.length) results.push({ name: 'no uncaught page errors', pass: false, detail: JSON.stringify(pageErrors) });
  writeFileSync(resolve(EVIDENCE, 'reader-doors.json'), JSON.stringify({ origin, results, pageErrors, lastCase: currentCase }, null, 2) + '\n');
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed · evidence ${EVIDENCE}`);
process.exit(failed.length ? 1 : 0);
