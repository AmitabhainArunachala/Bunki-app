/**
 * Hfix-2e · items 3 and 5, on one pinned build (KAIRO_SITE_DIR + KAIRO_ARTIFACT_SHA256), in the one engine KAIRO_BROWSER
 * names: Chromium at 1440×900 with a mouse (the Mac), WebKit at 390×844 with touch (the phone).
 *   X10  the top bar's Save (FINDINGS X-10, sweep B R4: on the Mac the bar's first click only closed the card, nothing
 *        saved, and two Saves stood on screen): .card · with the card open exactly one Save is live (shown, and the
 *        topmost thing at its own centre), the card's, and any Save the bar shows then keeps the word in ONE press;
 *        .fold · the card folded by Escape, .reading · one tap raising the word's reading: the bar's Save is the one live
 *        Save, names the word, and ONE press keeps it (S.taken grows by one).
 *   KT3  a kanji-grid glyph's accessible name is the kanji itself plus its meaning (「稿 — draft」), with the reading the
 *        grid found it by where the grid has one (the reading lens: 「食 たべる — eat」), a kanji the lessons lack keeps its
 *        reference meaning (剝), in the English and the 日本語 interface (the meaning is English data in both).
 * HFIX2E_MODE: branch (every row green), base (the untouched base: the rows its defects fail are red), control (the defect
 * put back by a route-mutated corridor.js: X10 · the bar's keep never steps aside, as before Hfix-1A; KT3 · the gloss-only
 * name), legacy (an older build, e.g. the one sweep B found X-10 on). HFIX2E_CASE=X10|KT3 runs one item.
 */
/* global window, document, getComputedStyle, innerHeight */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { startCorridorDev } from '../../../scripts/serve-corridor-dev.mjs';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';

const engine = process.env.KAIRO_BROWSER;
assert(['webkit', 'chromium'].includes(engine), 'Choose exactly one engine (KAIRO_BROWSER=webkit|chromium)');
const mode = process.env.HFIX2E_MODE || 'branch';
assert(['base', 'branch', 'control', 'legacy'].includes(mode));
const only = process.env.HFIX2E_CASE || '';
const out = resolveCorridorEvidence();
mkdirSync(out, { recursive: true });
const host = await startCorridorDev(0);
const browser = await ({ webkit, chromium }[engine]).launch();
const version = browser.version();
const mac = engine === 'chromium';
const viewport = mac ? { width: 1440, height: 900 } : { width: 390, height: 844 };
const identity = JSON.parse(readFileSync(join(process.env.KAIRO_SITE_DIR, 'build-identity.json'), 'utf8'));
const load = () => execFileSync('uptime', { encoding: 'utf8' }).trim();
const sha = (text) => createHash('sha256').update(text).digest('hex');
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const results = [];
const mutations = [];
console.log(`engine ${engine} ${version} · ${viewport.width}×${viewport.height} ${mac ? 'mouse' : 'touch'} · mode ${mode} · build ${identity.gitSha} · artifact ${identity.artifactSha256}`);
console.log(`load at start: ${load()}`);

const STORY = 'kantei:jp-105-actions-202609-25startup';
const WORD = '総理';
const WORD_SEL = `#reader .tok[data-prose-label="${WORD}"], #reader .tok[aria-label="${WORD}"]`;
// the doors this check walks through, appended to the module's own source (it changes nothing it does not name)
const BRIDGE = `
window.__H2E__ = {
  open: async (id) => { try { removeMini(); } catch {} S.stack = []; const p = D.passages.find((x) => x.id === id); if (!p) return false; await ensureArticle(p); openPassage(p.id); window.scrollTo(0, 0); return true; },
  taken: () => S.taken.length,
};`;
// the defect put back: [the shipped text, what the control serves in its place]
const CONTROL = {
  X10: ['const aside = !!standingSlip() || S.stack.length > 0;', 'const aside = false;'],
  KT3: ["b.setAttribute('aria-label', kdxGlyphName(c, readingOf?.(c) || ''));", "if (D.kanji[c]) b.setAttribute('aria-label', D.kanji[c].m);"],
};

async function session(row, { ui = 'bi' } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: !mac, hasTouch: !mac,
    serviceWorkers: 'block', timezoneId: 'Asia/Tokyo', colorScheme: 'light' });
  await silenceBrowserAudio(context);
  await context.addInitScript(() => {
    try { localStorage.setItem('kairo-word-ladder-demo-v1', '1'); localStorage.setItem('kairo-tip-reader-v1', '1'); } catch { /* private */ }
  });
  await context.route('**/*', (route) => (new URL(route.request().url()).origin === host.origin ? route.fallback() : route.abort()));
  await context.route(/\/corridor\.js(\?.*)?$/u, async (route) => {
    const response = await route.fetch();
    const original = await response.text();
    let body = original;
    if (mode === 'control') {
      const [from, to] = CONTROL[row];
      assert.equal(body.split(from).length, 2, `control ${row}: its line must be in corridor.js exactly once`);
      body = body.replace(from, to);
      mutations.push({ row, original: sha(original), served: sha(body) });
    }
    await route.fulfill({ response, body: body + BRIDGE });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message || error).slice(0, 240)));
  await page.goto(`${host.origin}/index.html?entry=shelf&ui=${ui}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.__H2E__, null, { timeout: 60_000 });
  return { context, page, errors };
}
const settle = async (page, ms = 450) => {
  await page.waitForTimeout(ms);
  await page.waitForFunction(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming?.().iterations !== Infinity).length === 0, null, { timeout: 4000 }).catch(() => {});
};
// a press as each device makes it: the Mac's mouse clicks, the phone's finger taps
const press = async (locator) => (mac ? locator.click() : locator.tap());
async function shot(page, name) {
  await page.screenshot({ path: join(out, `${engine}-${mode}-${name}.png`) }).catch(() => {});
}
async function row(name, item, body, options) {
  if (only && only !== item) return;
  const before = load();
  const session1 = await session(item, options);
  let pass = false; let detail = null; let error = null;
  try {
    detail = await body(session1);
    assert.deepEqual(session1.errors, [], 'no page error');
    pass = true;
  } catch (problem) {
    error = String(problem.stack || problem).split('\n').slice(0, 3).join(' | ');
    await shot(session1.page, `${name.replace(/[^a-z0-9.-]+/giu, '_')}-failure`);
  } finally { await session1.context.close(); }
  results.push({ name, item, pass, detail, error, errors: session1.errors, before, after: load() });
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${error ? `  — ${error.slice(0, 400)}` : ''}`);
}

/** Every Save a press could reach now: shown (visible, on the glass) and the topmost thing at its own centre (Hfix-1A's
 * liveSaves, item 4). */
const liveSaves = (page) => page.evaluate(() => [...new Set([...document.querySelectorAll('button.save-one, [data-save-one], #mini-take, #sheet-take, #chrome-keep')])]
  .filter((n) => {
    const r = n.getBoundingClientRect(), cs = getComputedStyle(n);
    if (!r.width || !r.height || cs.visibility !== 'visible' || Number(cs.opacity) === 0 || r.bottom <= 0 || r.top >= innerHeight) return false;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === n || n.contains(hit));
  }).map((n) => n.id || n.className.split(' ')[0]));
async function openStory(page) {
  assert(await page.evaluate((id) => window.__H2E__.open(id), STORY), `the story ${STORY} opens`);
  await page.locator('#reader .tok[data-index]').first().waitFor({ timeout: 20_000 });
  await settle(page, 700);
}
// the ladder to the card: the reading first where the dial raises it, then the card
async function openCard(page) {
  const tok = page.locator(WORD_SEL).first();
  await tok.scrollIntoViewIfNeeded();
  await delay(200);
  await press(tok);
  const rung = await page.waitForFunction((el) => (document.getElementById('mini') ? 'stage' : el.dataset.ladderRung === 'reading' ? 'reading' : null),
    await tok.elementHandle(), { timeout: 8000 }).then((h) => h.jsonValue()).catch(() => null);
  if (rung === 'reading') await press(tok);
  await page.locator('#mini .mini-word').waitFor({ timeout: 10_000 });
  await page.waitForFunction(() => document.getElementById('mini')?.getAttribute('aria-busy') !== 'true', null, { timeout: 12_000 }).catch(() => {});
  await settle(page, 500);
}

const barFacts = (page) => page.evaluate(() => {
  const b = document.getElementById('chrome-keep');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { visibility: getComputedStyle(b).visibility, inert: !!b.inert, aside: b.hasAttribute('data-aside'), label: b.getAttribute('aria-label'),
    pressed: b.getAttribute('aria-pressed'), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] };
});
const taken = (page) => page.evaluate(() => window.__H2E__.taken());
/** One press on the bar's Save, as the device makes it: does it keep the word (S.taken grows by one)? */
async function pressBar(page, facts, key) {
  const before = await taken(page);
  await press(page.locator('#chrome-keep'));
  await settle(page, 700);
  facts[key] = { before, after: await taken(page), card: !!(await page.locator('#mini').count()), bar: await barFacts(page) };
  await shot(page, `X10-${key}`);
  return facts[key].after === before + 1;
}

await row(`X10.card · ${engine} ${viewport.width} · a word's card open: one live Save, the card's; a Save the bar shows then keeps the word in one press`, 'X10', async ({ page }) => {
  await openStory(page);
  await openCard(page);
  const facts = { live: await liveSaves(page), bar: await barFacts(page) };
  await shot(page, 'X10-card-open');
  // a Save the bar shows while the card stands must keep the word in one press (the defect: its first press only closed the card)
  let barKept = true;
  if (facts.live.includes('chrome-keep')) barKept = await pressBar(page, facts, 'barPressWithCard');
  assert.deepEqual(facts.live, ['mini-take'], `X10: with the card open exactly one live Save, the card's: ${JSON.stringify(facts)}`);
  assert(barKept, `X10: one press on the bar's Save keeps the word: ${JSON.stringify(facts)}`);
  return facts;
});
await row(`X10.fold · ${engine} ${viewport.width} · the card folded (Escape), the word's reading still up: the bar's Save is live, names 総理, and one press keeps it`, 'X10', async ({ page }) => {
  await openStory(page);
  await openCard(page);
  await page.keyboard.press('Escape');
  await settle(page, 500);
  const facts = { card: !!(await page.locator('#mini').count()), rung: await page.locator(WORD_SEL).first().getAttribute('data-ladder-rung'),
    live: await liveSaves(page), bar: await barFacts(page) };
  assert(!facts.card, `X10: Escape folds the card: ${JSON.stringify(facts)}`);
  assert.deepEqual(facts.live, ['chrome-keep'], `X10: folded, the bar's Save is the one live Save: ${JSON.stringify(facts)}`);
  assert.match(facts.bar?.label || '', /総理/u, `X10: the bar's Save names the word: ${JSON.stringify(facts)}`);
  assert(await pressBar(page, facts, 'barPressFolded'), `X10: one press on the bar's Save keeps 総理: ${JSON.stringify(facts)}`);
  return facts;
});
await row(`X10.reading · ${engine} ${viewport.width} · one tap raises 総理's reading: the bar's Save is live, names 総理, and one press keeps it`, 'X10', async ({ page }) => {
  await openStory(page);
  const tok = page.locator(WORD_SEL).first();
  await tok.scrollIntoViewIfNeeded();
  await delay(200);
  await press(tok);
  await settle(page, 600);
  const facts = { card: !!(await page.locator('#mini').count()), rung: await tok.getAttribute('data-ladder-rung'), live: await liveSaves(page), bar: await barFacts(page) };
  // the dial in the build decides whether tap 1 raises the reading or opens the card; this row is about the reading rung
  assert.equal(facts.rung, 'reading', `X10: tap 1 raises the reading: ${JSON.stringify(facts)}`);
  assert.deepEqual(facts.live, ['chrome-keep'], `X10: the bar's Save is the one live Save: ${JSON.stringify(facts)}`);
  assert.match(facts.bar?.label || '', /総理/u, `X10: the bar's Save names the word: ${JSON.stringify(facts)}`);
  assert(await pressBar(page, facts, 'barPressReading'), `X10: one press on the bar's Save keeps 総理: ${JSON.stringify(facts)}`);
  return facts;
});

async function finder(page) {
  await page.locator('#shelf-tools-toggle').click();
  await page.locator('#kanjidex-link').click();
  await page.locator('.kdx-lens').first().waitFor();
  await settle(page, 300);
}
// the lenses in their own order (renderKanjidex's LENSES): 3 reading, 4 meaning; their labels follow the interface
async function lensSearch(page, index, query) {
  await page.locator('.kdx-lens').nth(index).click();
  await page.locator('#kdx-textfield').waitFor();
  if (index === 3) await page.waitForFunction(() => !document.querySelector('[data-kanji-readings="pending"], [data-kdx-readings="pending"]'), null, { timeout: 15_000 });
  await page.locator('#kdx-textfield').fill(query);
  await settle(page, 600);
}
async function glyphName(page, glyph) {
  const button = page.locator(`#kdx-results .kdx-glyph[data-kdx-hit="${glyph}"]`).first();
  await button.waitFor({ timeout: 10_000 });
  return { label: await button.getAttribute('aria-label'), text: (await button.textContent()).trim() };
}
for (const ui of ['bi', 'ja']) {
  await row(`KT3 · ${engine} ${viewport.width} ${ui} · a grid glyph is named by the kanji and its meaning, with the reading the reading lens found it by`, 'KT3', async ({ page }) => {
    await finder(page);
    const want = { '稿': '稿 — draft', '食': '食 たべる — eat', '剝': '剝 はがす — come off; peel; fade; discolor' };
    const got = {};
    await lensSearch(page, 4, 'draft');
    got['稿'] = await glyphName(page, '稿');
    // the accessibility tree's own name, as VoiceOver hears it: the exact name finds exactly this button
    got['稿'].byRole = await page.getByRole('button', { name: want['稿'], exact: true }).count();
    await lensSearch(page, 3, 'たべる');
    got['食'] = await glyphName(page, '食');
    got['食'].byRole = await page.getByRole('button', { name: want['食'], exact: true }).count();
    await lensSearch(page, 3, 'はがす');
    got['剝'] = await glyphName(page, '剝');
    got['剝'].byRole = await page.getByRole('button', { name: want['剝'], exact: true }).count();
    await shot(page, `KT3-${ui}`);
    for (const [glyph, name] of Object.entries(want)) {
      assert.equal(got[glyph].text, glyph, `KT3: the glyph itself still shows: ${JSON.stringify(got)}`);
      assert.equal(got[glyph].label, name, `KT3: ${glyph} is named 「${name}」: ${JSON.stringify(got)}`);
      assert.equal(got[glyph].byRole, 1, `KT3: the accessibility tree names ${glyph} 「${name}」: ${JSON.stringify(got)}`);
    }
    return got;
  }, { ui });
}

await browser.close();
await host.close?.();
const green = results.filter((r) => r.pass).length;
const report = { engine, version, viewport, input: mac ? 'mouse' : 'touch', mode, only: only || null, build: identity.gitSha,
  artifact: identity.artifactSha256, rows: results, mutations, green, total: results.length };
writeFileSync(join(out, `result-${engine}-${mode}.json`), `${JSON.stringify(report, null, 2)}\n`);
console.log(`${green}/${results.length} rows green · ${engine} ${version} · mode ${mode} · load at end: ${load()}`);
process.exitCode = green === results.length ? 0 : 1;
