#!/usr/bin/env node
/** The ear's coverage walk (B2, 2026-11-11): nothing Japanese is left silent.
 *
 * It walks every screen of the learner walk on a built site and, on each, finds every visible text node that holds
 * Japanese. For each it puts a finger where the text stands (the point a tap there would use) and asks the ear's own
 * unitAt (modules/ear.mjs, as the site serves it) what would speak: there must be a unit, it must hold that text, and
 * it must have something a voice can say. Text another element covers is not under the finger and is counted apart.
 * Only the two places in ear-coverage-exclusions.json are left out, and the walk refuses a list of any other length.
 *
 * Silent by construction: Playwright's Chromium with --mute-audio, media play forced muted and speechSynthesis
 * stubbed before the app loads, and no host but this machine resolvable. Nothing is paired, so nothing is spoken.
 *
 *   node prototypes/corridor/tools/ear-coverage-walk.mjs --base http://127.0.0.1:19481/ [--device wide|phone]
 *        [--ui ja] [--plant] [--only door,search] [--shots DIR] [--out results.json]
 *
 * On the phone it also asks, for every one of those points, what a finger's tap there would do with the ear held on and
 * with it armed (the review's ruling R-a, 2026-11-11): held on, a tap on one of the app's own controls (a button, a link,
 * a field, a tab, a fold, a role, a block with a click action) or on a card's front is the app's and asks nothing, and a
 * tap on text speaks; armed, every tap speaks. The verdict comes from the ear's own earClick, asked dry (nothing is
 * spoken); which points are controls is read here on its own, from the page.
 *
 * --plant puts two Japanese nodes on every screen: one in a field being typed in, which the ear never reads (outside
 * any unit: the walk must then fail, naming it), and one on a layer that lets the finger pass (a tap there must still
 * read it: it must pass). Exit 0 only when every node has a unit. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(join(HERE, '../../../package.json'))('playwright-core');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const BASE = arg('--base', 'http://127.0.0.1:19481/').replace(/\/?$/, '/');
const DEVICE = arg('--device', 'wide');
const UI = arg('--ui', 'en');
const PLANT = process.argv.includes('--plant');
const ONLY = arg('--only', '').split(',').filter(Boolean);
const SHOTS = arg('--shots', '');
const OUT = arg('--out', '');
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const EXCLUSIONS = JSON.parse(readFileSync(resolve(HERE, 'ear-coverage-exclusions.json'), 'utf8')).entries;
if (!Array.isArray(EXCLUSIONS) || EXCLUSIONS.length !== 2) {
  console.error(`FAIL  the exclusion file must hold exactly two entries; it holds ${EXCLUSIONS?.length}`);
  process.exit(2);
}
const SIZES = {
  wide: { viewport: { width: 1728, height: 1117 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
};

/** Before the app: no sound can be made, and a device voice is offered so that "nothing spoke" is the app's own choice. */
function quiet() {
  const push = (kind) => { (window.__sound ||= []).push(kind); };
  const media = HTMLMediaElement.prototype, play = media.play;
  media.play = function () { this.muted = true; this.volume = 0; push('audio-play'); return play.call(this); };
  const synth = window.speechSynthesis;
  if (synth) {
    const proto = Object.getPrototypeOf(synth);
    proto.speak = function () { push('device-voice'); };
    proto.cancel = function () {};
  }
}

/** In the page: every visible Japanese text node, and what the ear would speak for it. */
async function scan({ exclusions, plant, earPath, touch }) {
  const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
  let ear = null, loadError = '';
  try { ear = await import(new URL(earPath, location.href).href); } catch (error) { loadError = String(error?.message || error).slice(0, 160); }
  if (plant) {
    document.getElementById('ear-plant-a')?.remove();
    document.getElementById('ear-plant-b')?.remove();
    const a = document.createElement('div');
    a.id = 'ear-plant-a';
    a.style.cssText = 'position:fixed;left:37%;top:41%;z-index:2147483646;pointer-events:none;font-size:22px;background:#fff;color:#000;padding:4px';
    a.textContent = '植えた文はどこにも属さない。';
    const b = document.createElement('div');
    b.id = 'ear-plant-b';
    b.contentEditable = 'true';
    b.style.cssText = 'position:fixed;left:37%;top:52%;z-index:2147483646;font-size:22px;background:#fff;color:#000;padding:4px';
    b.textContent = '入力中の文は読まない。';
    // on a screen with a modal open, the plants stand inside the modal's own box (everything else is under its layer,
    // and the modal clips what stands outside it)
    const modal = document.querySelector('dialog:modal') || [...document.querySelectorAll('dialog[open]')].pop();
    if (modal) {
      a.style.position = b.style.position = 'absolute';
      a.style.left = b.style.left = '24px';
      a.style.top = '96px';
      b.style.top = '150px';
    }
    (modal || document.body).append(a, b);
  }
  const excluded = exclusions.map((entry) => ({ ...entry, found: document.querySelectorAll(entry.selector).length }));
  const skip = exclusions.map((entry) => entry.selector).join(', ');
  const rows = { checked: 0, covered: 0, failures: [], units: {}, taps: touch ? { controls: 0, text: 0 } : null };
  // the walk's own reading of what is a control of the app (not the ear's): an element a tap acts on
  const CONTROLS = 'button, a[href], summary, label, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"], [role="treeitem"], [onclick]';
  const controlHere = (el) => {
    if (!el?.closest || el.closest('[data-ear-own]')) return null;
    const found = el.closest(CONTROLS);
    if (found) return found;
    const door = el.closest('[data-action]');
    return door && !/^inline/.test(getComputedStyle(door).display) ? door : null;
  };
  /** Held on and armed, what a finger's tap at (x, y) would do: the ear's own verdict, asked dry. */
  const tapVerdicts = (x, y, unit) => {
    const hit = document.elementFromPoint(x, y);
    const press = { at: Date.now(), x, y, pointerType: 'touch' };
    // a real tap's click as WebKit gives it: trusted, detail 1, its pointer type mouse
    const event = { altKey: false, target: hit, clientX: x, clientY: y, detail: 1, isTrusted: true, pointerType: 'mouse' };
    const ask = (mode) => {
      const machine = ear.createEarMachine({ speak: () => ({ stop() {} }), cannot: () => null });
      if (mode === 'held') machine.holdEar(); else machine.tapEar();
      return ear.earClick(event, { machine, unitAt: () => unit, press, now: press.at, dry: true,
        controlAt: (target) => ear.appControlAt(target, { display: (el) => getComputedStyle(el).display }) });
    };
    const control = !!controlHere(hit) || !!unit.front;
    return { control, held: ask('held'), armed: ask('armed'), hit };
  };
  /** A layer above `parent` at the point that takes no pointer and yet hides it: a solid background, or words of its own
   * drawn there. Seen with every element taking the pointer for one look. */
  const paintedOver = (x, y, parent) => {
    const style = document.createElement('style');
    style.textContent = '*, *::before, *::after { pointer-events: auto !important; }';
    document.head.append(style);
    let stack = [];
    try { stack = document.elementsFromPoint(x, y); } finally { style.remove(); }
    for (const el of stack) {
      if (el === parent || el.contains(parent) || parent.contains(el)) return null;
      if (getComputedStyle(el).pointerEvents !== 'none') continue;
      if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      const bg = getComputedStyle(el).backgroundColor.match(/[\d.]+/g)?.map(Number) || [];
      if (bg.length >= 3 && (bg.length < 4 || bg[3] > 0.5)) return `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.split(/\s+/)[0]}` : ''} (passes the finger, painted over)`;
      for (const child of el.childNodes) {
        if (child.nodeType !== 3 || !child.nodeValue.trim()) continue;
        const r = document.createRange(); r.selectNodeContents(child);
        for (const box of r.getClientRects()) if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return `${el.tagName.toLowerCase()} (its own words over this text)`;
      }
    }
    return null;
  };
  // under a layer: the app makes what stands under a sheet or a modal inert (the layer law), so no finger reaches it
  const modal = document.querySelector('dialog:modal');
  const underLayer = (el) => !!el.closest('[inert]') || (modal && !modal.contains(el));
  // the part of a text box that shows: every box that clips its content (overflow, clip-path) and the screen cut it down
  const shownPart = (el, box) => {
    let left = Math.max(box.left, 0), top = Math.max(box.top, 0), right = Math.min(box.right, innerWidth), bottom = Math.min(box.bottom, innerHeight);
    // the text's own element too: a glyph box can stand past its element's box, where no finger reaches that element
    const own = el.getBoundingClientRect();
    left = Math.max(left, own.left); top = Math.max(top, own.top); right = Math.min(right, own.right); bottom = Math.min(bottom, own.bottom);
    for (let at = el; at && at !== document.body; at = at.parentElement) {
      const style = getComputedStyle(at);
      const clips = style.clipPath !== 'none' || /hidden|clip|auto|scroll/.test(style.overflowX + style.overflowY);
      if (!clips) continue;
      const r = at.getBoundingClientRect();
      left = Math.max(left, r.left); top = Math.max(top, r.top); right = Math.min(right, r.right); bottom = Math.min(bottom, r.bottom);
    }
    return right - left >= 2 && bottom - top >= 2 ? { left, top, right, bottom, width: right - left, height: bottom - top } : null;
  };
  const seen = new Set();
  const visit = () => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (seen.has(node) || !JAPANESE.test(node.nodeValue)) continue;
      const parent = node.parentElement;
      if (!parent || parent.closest(skip) || parent.closest('script, style, template, noscript, [data-ear-own]')) continue;
      if (parent.checkVisibility && !parent.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const boxes = [...range.getClientRects()].filter((r) => r.width >= 2 && r.height >= 2).map((r) => shownPart(parent, r)).filter(Boolean);
      if (!boxes.length) continue;
      if (underLayer(parent)) { seen.add(node); rows.coveredByOther = (rows.coveredByOther || 0) + 1; continue; }
      seen.add(node);
      rows.checked += 1;
      const where = (parent.closest('[id]')?.id ? `#${parent.closest('[id]').id} ` : '') + parent.tagName.toLowerCase() + (parent.className && typeof parent.className === 'string' ? `.${parent.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '');
      let verdict = null;
      for (const box of boxes) {
        const x = Math.min(innerWidth - 2, Math.max(1, box.left + box.width / 2));
        const y = Math.min(innerHeight - 2, Math.max(1, box.top + box.height / 2));
        const hit = document.elementFromPoint(x, y);
        const reachable = hit && (hit === parent || parent.contains(hit) || hit.contains(parent));
        // under another layer that takes the finger: not what he sees there
        if (!reachable && document.elementsFromPoint(x, y).includes(parent)) { verdict ||= { covered: true, by: hit?.tagName?.toLowerCase() + (hit?.id ? `#${hit.id}` : '') }; continue; }
        // under a layer that lets the finger pass but is painted over this text (an opaque panel, or its own words)
        const over = paintedOver(x, y, parent);
        if (over) { verdict ||= { covered: true, by: over }; continue; }
        // otherwise (the text itself lets the finger pass, or the finger lands on it) the ear must answer for this text
        if (!ear) { verdict = { problem: `the ear is not in this build (${loadError})` }; break; }
        let unit = null;
        try { unit = ear.unitAt(document, x, y); } catch (error) { verdict = { problem: `unitAt threw ${error.message}` }; break; }
        if (!unit) { verdict = { problem: `the ear finds no unit there (${Math.round(x)},${Math.round(y)} on ${hit?.tagName?.toLowerCase() || 'nothing'}${hit?.className && typeof hit.className === 'string' ? `.${hit.className.split(/\s+/)[0]}` : ''})` }; break; }
        if (!unit.contains(node)) { verdict = { problem: `the unit there (${unit.kind} "${String(unit.text).slice(0, 20)}") does not hold this text` }; break; }
        if (!unit.sentences?.length) { verdict = { problem: 'the unit has nothing to say' }; break; }
        if (touch) {
          const tap = tapVerdicts(x, y, unit);
          const want = tap.control ? 'pass' : 'consume';
          const name = `${tap.hit?.tagName?.toLowerCase() || '?'}${tap.hit?.className && typeof tap.hit.className === 'string' ? `.${tap.hit.className.trim().split(/\s+/)[0]}` : ''}`;
          if (tap.held !== want) { verdict = { problem: tap.control ? `held on, a tap on this control (${name}) would be read aloud, not act` : `held on, a tap on this text (${name}) would not read it` }; break; }
          if (tap.armed !== 'consume') { verdict = { problem: `armed, a tap here (${name}) would not read it` }; break; }
          rows.taps[tap.control ? 'controls' : 'text'] += 1;
        }
        verdict = { ok: true, kind: unit.kind, said: unit.sentences.map((s) => s.text).join('').slice(0, 24), key: unit.voiceKey };
        break;
      }
      if (verdict?.ok) { rows.covered += 1; rows.units[verdict.kind] = (rows.units[verdict.kind] || 0) + 1; }
      else if (verdict?.covered) { rows.checked -= 1; rows.coveredByOther = (rows.coveredByOther || 0) + 1; }
      else rows.failures.push({ text: node.nodeValue.trim().slice(0, 30), where, problem: verdict?.problem || 'unknown' });
    }
  };
  // the screen as it stands, then as far down as it scrolls (the window, and the page's own scrolling box)
  visit();
  const boxes = [document.scrollingElement, ...document.querySelectorAll('#sheet, main, .sheet, [data-scroll-root]')].filter((el, i, all) => el && all.indexOf(el) === i && el.scrollHeight > el.clientHeight + 40);
  for (const box of boxes) {
    const start = box.scrollTop;
    for (let step = 0; step < 6 && box.scrollTop + box.clientHeight < box.scrollHeight - 4; step += 1) {
      box.scrollTop += Math.round(box.clientHeight * 0.8);
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      visit();
    }
    box.scrollTop = start;
  }
  return { ...rows, excluded, ear: !!ear };
}

const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1 , EXCLUDE localhost'] });
const context = await browser.newContext({ ...SIZES[DEVICE], locale: 'en-US', timezoneId: 'Asia/Tokyo', serviceWorkers: 'block' });
await context.addInitScript(quiet);
const page = await context.newPage();
page.setDefaultTimeout(20000);
page.on('dialog', (d) => d.accept());
const touch = !!SIZES[DEVICE].hasTouch;
const press = (target) => (typeof target === 'string' ? page.locator(target).first() : target)[touch ? 'tap' : 'click']();
const sleep = (ms) => page.waitForTimeout(ms);
const url = (extra = '') => `${BASE}${extra ? `?${extra}` : ''}${UI === 'ja' ? `${extra ? '&' : '?'}ui=ja` : ''}`;
async function toSky() {
  await page.goto(url(), { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 45000 });
  await page.locator('#ginga-symbol').waitFor();
  const ok = page.locator('button', { hasText: /^(OK|はい|閉じる)$/ }).first();
  if (await ok.isVisible().catch(() => false)) { await ok.click().catch(() => {}); await sleep(200); }
}
async function toTab(tab) {
  await toSky();
  await press('#home-review');
  await page.locator(`#tab-${tab}`).waitFor();
  await press(`#tab-${tab}`);
  await sleep(1400);
}
async function openShelf() { await toSky(); await press('#ginga-symbol'); await press('.bubble-shelf'); await page.locator('.shelf-open').first().waitFor(); }
async function openArticle() {
  await openShelf();
  await press(page.locator('.shelf-open').first());
  await page.locator('.reader .tok.content').first().waitFor();
  await page.locator('#mini').waitFor({ timeout: 2500 }).catch(() => {});
}
async function openBox() {
  if (await page.locator('#mini').isVisible().catch(() => false)) return;
  const index = await page.evaluate(() => [...document.querySelectorAll('.reader .tok.content')].findIndex((node, i) => {
    const box = node.getBoundingClientRect();
    return i > 0 && /\p{Script=Han}/u.test(node.textContent) && box.top > 80 && box.bottom < innerHeight - 80;
  }));
  const word = page.locator('.reader .tok.content').nth(index);
  for (let taps = 0; taps < 4 && !(await page.locator('#mini').isVisible().catch(() => false)); taps += 1) { await press(word); await sleep(700); }
  await page.locator('#mini').waitFor();
  await sleep(1200);
}

/** The learner walk's screens (preview/learner-check.mjs), and the four the voice lead left silent for the ear. */
const SCREENS = [
  ['door', async () => { await toSky(); await sleep(1800); }],
  ['shelf', async () => { await openShelf(); await sleep(600); }],
  ['article', async () => { await openArticle(); if (await page.locator('#mini').isVisible().catch(() => false)) { await page.keyboard.press('Escape'); await sleep(500); } }],
  ['word-box', async () => { await openArticle(); await openBox(); }],
  ['kanji-from-box', async () => { await openArticle(); await openBox(); await press(page.locator('#mini .mini-kanji-row').first()); await page.locator('#sheet').waitFor(); await sleep(2000); }],
  ['cards', async () => { await toTab('learn'); await press('.learn-go-deck'); await page.locator('#kp-reveal').waitFor(); await sleep(800); }],
  ['cards-answer', async () => { await toTab('learn'); await press('.learn-go-deck'); await press('#kp-reveal'); await page.locator('#kp-grade-good').waitFor(); await sleep(900); }],
  ['words', async () => { await toTab('words'); }],
  ['search-rows', async () => { await toTab('words'); await page.locator('#nav-search-input').fill('門'); await page.locator('.nav-search-row').first().waitFor(); await sleep(800); }],
  ['kanji-compound-rows', async () => {
    await toTab('words'); await page.locator('#nav-search-input').fill('門');
    const hit = page.locator('.nav-search-row', { hasText: 'モン' }).first(); await hit.waitFor(); await press(hit);
    await page.locator('#sheet').waitFor(); await sleep(2000);
  }],
  ['word-page-thesaurus', async () => {
    await toTab('words'); await page.locator('#nav-search-input').fill('専門');
    const hit = page.locator('.nav-search-row', { hasText: 'せんもん' }).first(); await hit.waitFor(); await press(hit);
    await page.locator('#sheet').waitFor(); await sleep(2000);
  }],
  ['rajomon', async () => {
    await toTab('words'); await page.locator('#nav-search-input').fill('門');
    const hit = page.locator('.nav-search-row', { hasText: 'モン' }).first(); await hit.waitFor(); await press(hit);
    const door = page.locator('#kanji-world-door'); await door.waitFor(); await door.scrollIntoViewIfNeeded(); await press(door);
    await page.locator('.kw-encounter').waitFor(); await sleep(1200);
  }],
  ['word-web', async () => {
    await toTab('words');
    const door = page.locator('#words-web');
    if (await door.count()) { await door.scrollIntoViewIfNeeded().catch(() => {}); if (!(await door.isVisible())) await press('summary.words-index-row'); await press(door); }
    await page.locator('.ww-nodes .ww-node').first().waitFor(); await sleep(1500);
  }],
  ['tutor', async () => { await toSky(); await press('#ginga-symbol'); await press('.bubble-sensei'); await page.locator('#chat-input').waitFor(); await sleep(900); }],
  ['report', async () => { await toSky(); await press('#bunki-report-bug'); await page.locator('dialog[open]').first().waitFor(); await sleep(1200); }],
  ['settings', async () => { await toTab('me'); await press('#me-settings'); await page.locator('#settings-voice-server').waitFor({ timeout: 8000 }).catch(() => {}); await sleep(800); }],
  ['today', async () => { await toTab('today'); const row = page.locator('#today-record:not([open]) > summary'); if (await row.count()) { await row.scrollIntoViewIfNeeded(); await press(row); } await sleep(600); }],
  ['review-card', async () => {
    await openArticle();
    const word = page.locator('.reader .tok.content').first();
    for (let i = 0; i < 4 && !(await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await press(word); await sleep(700); }
    // since Save asks first (e74cffd7e, merged in the combine) Save opens its chooser: Review is a pick of its own
    await press('#mini-take'); await page.locator('#mini-review').waitFor(); await press('#mini-review'); await sleep(900);
    await toTab('today'); await press('#review-start'); await page.locator('#reveal').waitFor(); await press('#reveal');
    await page.locator('#card-say').waitFor(); await sleep(1200);
  }],
  ['speak-room', async () => { await toTab('learn'); await sleep(800); await press(page.locator('.study-door', { hasText: /Speak|話す/ }).first()); await page.locator('#speak-enso').waitFor(); await sleep(1200); }],
  ['shared-study', async () => {
    await page.goto(url('sharedStudy=preview&deck=n2'), { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 45000 });
    await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some((f) => { try { return /Study now|Today's study|今日/.test(f.contentDocument.body.innerText); } catch { return false; } }), null, { timeout: 45000 }).catch(() => {});
    await sleep(800);
  }],
];

const results = [];
let failures = 0;
for (const [name, open] of SCREENS) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  let row;
  try {
    await open();
    row = await page.evaluate(scan, { exclusions: EXCLUSIONS, plant: PLANT, earPath: 'modules/ear.mjs', touch });
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}-${DEVICE}-${UI}.png`) });
  } catch (error) {
    row = { checked: 0, covered: 0, failures: [{ text: '', where: name, problem: `the screen did not open: ${String(error.message).split('\n')[0].slice(0, 200)}` }], excluded: [] };
  }
  const pass = row.failures.length === 0;
  if (!pass) failures += 1;
  results.push({ screen: name, device: DEVICE, ui: UI, pass, ...row });
  const kinds = Object.entries(row.units || {}).map(([k, n]) => `${n} ${k}`).join(', ') + (row.taps ? `; held taps: ${row.taps.controls} on controls act, ${row.taps.text} on text read` : '');
  const ex = (row.excluded || []).filter((e) => e.found).map((e) => `${e.found} × ${e.name}`).join('; ');
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} @ ${DEVICE}/${UI}: ${row.covered}/${row.checked} visible Japanese text nodes have a unit${kinds ? ` (${kinds})` : ''}${row.coveredByOther ? `; ${row.coveredByOther} under another layer` : ''}${ex ? `; left out: ${ex}` : ''}`);
  for (const f of row.failures.slice(0, 6)) console.log(`      ✗ "${f.text}" at ${f.where}: ${f.problem}`);
  if (row.failures.length > 6) console.log(`      … and ${row.failures.length - 6} more`);
}
const sound = await page.evaluate(() => window.__sound || []).catch(() => []);
console.log(`sound asked during the walk: ${sound.length ? sound.join(', ') : 'none'}`);
console.log(`${results.length - failures} screens passed, ${failures} failed${PLANT ? ' (with planted nodes)' : ''}`);
if (OUT) writeFileSync(OUT, JSON.stringify({ base: BASE, device: DEVICE, ui: UI, plant: PLANT, exclusions: EXCLUSIONS, results }, null, 2));
await browser.close();
process.exit(failures ? 1 : 0);
