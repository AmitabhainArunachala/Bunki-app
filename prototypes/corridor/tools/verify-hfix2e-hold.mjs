/** Hfix-2e item 7 · the Words room's hold seals its word like the reader's (John, 10-19 17:19, on the Mac: "HOLDING A
 * WORD does nothing at all"; checklist S1). Immutable build, one engine per run: WebKit 390×844 with touch holds with a
 * finger (pointer events of type touch, as verify-word-grammar's G5 does in WebKit), Chromium 1440×900 holds with the
 * mouse (real button presses).
 *   W7-hold   a hold on a word in the Words room's word web: the ring fills (read 300 ms in), the 印 presses on, the
 *             strip opens, the kept count rises by one, and the walk does not climb; a second hold opens the same strip
 *             and keeps nothing twice; neither strip lies over another control (S2: "the menu never covers another button"). Red on the base (the mouse is ignored; a finger opens the slip), green on the branch.
 *   W7-centre the same hold on the web's headword (its big glyph), which had no hold at all: red on the base.
 *   W7-drag   guard: a mouse that moves past 9 px before the seal is a drag, never a seal (Chromium).
 *   W7-right  a right-click on a web word seals it and opens the strip, as a hold does (S3; the lead's ruling, 10-20),
 *             never its slip (Chromium). Red on the base (its right-click opened the slip).
 *   W7-key    Shift+F10 on a focused web word does the same, its strip taking the keyboard (Chromium). Red on the base.
 *   W7-tap    guard: a quick press still walks the node's ladder, never seals.
 * Controls (HFIX2E_MODE=control) serve corridor.js mutated: the web's hold ignores the mouse again (Chromium), or its
 * commit opens the slip instead of sealing (WebKit); W7-hold must go red. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { startCorridorDev } from '../../../scripts/serve-corridor-dev.mjs';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';

const engine = process.env.KAIRO_BROWSER;
assert(['webkit', 'chromium'].includes(engine), 'Choose exactly one engine');
const mode = process.env.HFIX2E_MODE || 'branch';
assert(['base', 'branch', 'control'].includes(mode));
const only = process.env.HFIX2E_CASE;
const CENTRE = process.env.HFIX2E_CENTRE || '元気';
const out = resolveCorridorEvidence(); mkdirSync(out, { recursive: true });
const host = await startCorridorDev(0);
const browser = await ({ webkit, chromium }[engine]).launch();
const version = browser.version();
const phone = engine === 'webkit';
const viewport = phone ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const identity = JSON.parse(readFileSync(join(process.env.KAIRO_SITE_DIR, 'build-identity.json'), 'utf8'));
const results = []; const mutations = [];
const sha = (value) => createHash('sha256').update(value).digest('hex');
const load = () => execFileSync('uptime', { encoding: 'utf8' }).trim();
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const MUTANTS = {
  // the web's hold ignores the mouse again
  mouse: ['    if (mouse && (event.button !== 0 || event.ctrlKey)) return;\n    const start = { x: event.clientX, y: event.clientY, id: event.pointerId };\n    const h = { start, ring: null, committed: 0, mouse };\n    h.other = (other) => { if (other.pointerId !== start.id && hold === h && !h.committed) clear(); };\n    window.addEventListener(\'pointerdown\', h.other, true);\n    if (mouse) {\n      const lost',
    '    if (mouse) return;\n    const start = { x: event.clientX, y: event.clientY, id: event.pointerId };\n    const h = { start, ring: null, committed: 0, mouse };\n    h.other = (other) => { if (other.pointerId !== start.id && hold === h && !h.committed) clear(); };\n    window.addEventListener(\'pointerdown\', h.other, true);\n    if (mouse) {\n      const lost'],
  // the web's hold opens the slip, as on the base
  finger: ['    if (!nodeOf()) { open(); return; }\n    void sealWord(button, door, { ring: h.ring });', '    open(); return;'],
  // the web's right-click opens the slip again, as on the base
  right: ['    void sealWord(button, door, { keyboard: !event.clientX && !event.clientY });', '    open();'],
  // the web's Shift+F10 opens the slip again, as on the base
  key: ['      if (nodeOf()) void sealWord(button, door, { keyboard: true });\n      else open();', '      open();'],
};

async function ready(page) {
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !document.documentElement.dataset.roomTransition, null, { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
}
async function context(name) {
  const ctx = await browser.newContext({ viewport, hasTouch: phone, isMobile: phone, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.route('**/*', (route) => new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort());
  const page = await ctx.newPage(); page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', (error) => errors.push(String(error)));
  const mutant = { 'W7-hold': phone ? 'finger' : 'mouse', 'W7-centre': phone ? 'finger' : 'mouse', 'W7-right': 'right', 'W7-key': 'key' }[name];
  if (mode === 'control' && mutant) await page.route('**/corridor.js', async (route) => {
    const response = await route.fetch(); const original = await response.text();
    const [from, to] = MUTANTS[mutant];
    assert.equal(original.split(from).length, 2, `control ${name}: its mutation names one place`);
    const changed = original.replace(from, to);
    mutations.push({ row: name, mutant, original: sha(original), served: sha(changed) });
    await route.fulfill({ response, body: changed });
  });
  return { ctx, page, errors };
}
async function openWeb(page) {
  await page.goto(`${host.origin}/index.html?entry=shelf&ui=bi`);
  await ready(page);
  assert.equal(await page.evaluate((word) => window.openWordWeb(word, { type: 'word' }), CENTRE), true, 'the word web opens');
  await page.locator('.ww-plate .ww-node').first().waitFor();
  await ready(page);
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((run) => run.finished.catch(() => {})));
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
}
/** The node held: the first word in the plate whose centre is on the glass, else the first kanji. */
async function pickNode(page) {
  for (const type of ['word', 'kanji']) {
    const nodes = page.locator(`.ww-plate .ww-node[data-ww-type="${type}"]`);
    const n = await nodes.count();
    for (let i = 0; i < n; i++) {
      const node = nodes.nth(i);
      await node.scrollIntoViewIfNeeded();
      const box = await node.boundingBox();
      if (!box || box.width < 8 || box.height < 8) continue;
      const hit = await node.evaluate((b) => { const r = b.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!at && b.contains(at); });
      if (hit) return { node, type, key: await node.getAttribute('data-ww-key') };
    }
  }
  throw new Error('no word or kanji node on the glass');
}
/** Watch for the 印 stamp and the ring for the rest of the page's life. */
const watch = (page) => page.evaluate(() => {
  window.__h2e = { stamp: 0, ring: 0 };
  new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.matches?.('.seal-flight') || node.querySelector?.('.seal-stamp')) window.__h2e.stamp += 1;
      if (node.matches?.('.hold-ring')) window.__h2e.ring += 1;
    }
  }).observe(document.body, { childList: true, subtree: true });
});
const facts = (page, key) => page.evaluate((key) => {
  const node = key === '#centre' ? document.querySelector('.ww-plate .ww-c-glyph') : document.querySelector(`.ww-plate .ww-node[data-ww-key="${CSS.escape(key)}"]`);
  const strip = document.getElementById('seal-strip');
  // the controls the strip lies over (its own and the held word's excepted), by the app's own list of controls
  const CONTROLS = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="radio"], [role="switch"], [role="slider"]';
  const covered = [];
  if (strip) {
    const r = strip.getBoundingClientRect();
    for (const c of document.querySelectorAll(CONTROLS)) {
      if (strip.contains(c) || (node && (c === node || c.contains(node) || node.contains(c)))) continue;
      if (c.closest('[inert], [hidden], [aria-hidden="true"]')) continue;
      const b = c.getBoundingClientRect(); const st = getComputedStyle(c);
      if (!b.width || !b.height || st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0) continue;
      if (b.right <= r.left + 0.5 || b.left >= r.right - 0.5 || b.bottom <= r.top + 0.5 || b.top >= r.bottom - 0.5) continue;
      covered.push({ name: (c.dataset.wwKey || c.id || c.className || c.tagName).toString().slice(0, 40), box: [b.left, b.top, b.right, b.bottom].map(Math.round), strip: [r.left, r.top, r.right, r.bottom].map(Math.round) });
    }
  }
  return { covered,
    count: Number(document.getElementById('tray')?.dataset.count ?? NaN),
    strip: !!strip, stripSays: strip?.querySelector('#seal-strip-status')?.textContent.trim() || '',
    stripLabel: strip?.getAttribute('aria-label') || '',
    mini: !!document.getElementById('mini'), rung: node?.dataset.ladderRung || null,
    ring: document.querySelectorAll('.hold-ring').length, seen: { ...window.__h2e },
  };
}, key);
/** A hold of `ms` on the node's centre; the facts are read `at` ms in, while the ring fills. */
async function holdOn(page, locator, key, { ms = 760, at = 300, drag = 0 } = {}) {
  const box = await locator.boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  let mid;
  if (!phone) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    if (drag) { await delay(200); await page.mouse.move(x + drag, y, { steps: 4 }); await delay(at - 200); }
    else await delay(at);
    mid = await facts(page, key);
    await delay(ms - at);
    await page.mouse.up();
  } else {
    const fire = (type) => page.evaluate(({ type, x, y }) => {
      const target = type === 'pointerdown' ? document.elementFromPoint(x, y) : window.__h2eTarget;
      window.__h2eTarget = target;
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 41, pointerType: 'touch',
        isPrimary: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerdown' ? 1 : 0, pressure: type === 'pointerdown' ? 0.5 : 0 }));
    }, { type, x, y });
    await fire('pointerdown'); await delay(at); mid = await facts(page, key); await delay(ms - at); await fire('pointerup');
  }
  await delay(900);
  // the strip is read where it rests: its arrival (and any seat it takes again) has finished
  await page.evaluate(async () => {
    const strip = document.getElementById('seal-strip');
    if (strip) await Promise.all(strip.getAnimations({ subtree: true }).map((run) => run.finished.catch(() => {})));
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
  return { mid, after: await facts(page, key) };
}
async function shot(page, name) { await page.screenshot({ path: join(out, `${engine}-${mode}-${name}.png`) }).catch(() => {}); }
async function row(name, body) {
  if (only && only !== name) return;
  const session = await context(name); const before = load(); let passed = false; let error = null; let detail;
  try {
    await openWeb(session.page); await watch(session.page);
    detail = await body(session);
    assert.deepEqual(session.errors, [], 'no page errors');
    passed = true;
  } catch (problem) { error = String(problem.stack || problem); detail = detail || problem.detail; }
  finally { await shot(session.page, name); await session.ctx.close(); }
  results.push({ name, pass: passed, detail, error, before, after: load() });
  console.log(`${engine}/${mode}/${name}: ${passed ? 'PASS' : 'FAIL'}${error ? ` ${error.split('\n')[0]}` : ''}`);
}
const fail = (message, detail) => Object.assign(new Error(message), { detail });

async function sealRow(page, { node, type, key }) {
  const c0 = (await facts(page, key)).count;
  const first = await holdOn(page, node, key);
  const detail = { held: { type, key }, by: phone ? 'finger' : 'mouse', c0, first };
  if (!(first.mid.ring >= 1)) throw fail(`the ring did not fill under the ${detail.by} (300 ms in)`, detail);
  if (!first.after.strip) throw fail('the hold opened no strip', detail);
  if (!(first.after.count === c0 + 1)) throw fail(`the kept count went ${c0} → ${first.after.count}, not +1`, detail);
  if (!(first.after.seen.stamp >= 1)) throw fail('no 印 pressed on', detail);
  if (first.after.mini || first.after.rung) throw fail('the release climbed the walk', detail);
  if (!/Saved ✓|保存済み/u.test(first.after.stripSays)) throw fail('the strip does not say the word is saved', detail);
  if (first.after.covered.length) throw fail(`the strip covers other controls: ${JSON.stringify(first.after.covered)}`, detail);
  // the plate's late passages (wwWatchPassages draws the plate again 1.8 s after it opens) never take the strip's room
  // or its word away while it stands
  await delay(2500);
  detail.later = await facts(page, key);
  detail.later.anchorOnPage = await page.evaluate((key) => !!(key === '#centre' ? document.querySelector('.ww-plate .ww-c-glyph') : document.querySelector(`.ww-plate .ww-node[data-ww-key="${CSS.escape(key)}"]`)), key);
  if (!detail.later.strip) throw fail('the strip went away by itself', detail);
  if (detail.later.covered.length) throw fail(`2.5 s on, the strip covers other controls: ${JSON.stringify(detail.later.covered)}`, detail);
  // a second hold opens the same strip and keeps nothing twice
  await page.keyboard.press('Escape');
  await page.locator('#seal-strip').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
  if (await page.locator('#seal-strip').count()) {
    await page.mouse.click(viewport.width - 4, viewport.height / 2);
    await page.locator('#seal-strip').waitFor({ state: 'detached', timeout: 3000 });
  }
  await delay(300);
  const second = await holdOn(page, node, key);
  detail.second = second;
  if (!second.after.strip) throw fail('the second hold opened no strip', detail);
  if (second.after.count !== c0 + 1) throw fail(`the second hold changed the count to ${second.after.count}`, detail);
  if (second.after.mini || second.after.rung) throw fail('the second release climbed the walk', detail);
  if (second.after.covered.length) throw fail(`the second strip covers other controls: ${JSON.stringify(second.after.covered)}`, detail);
  return detail;
}
await row('W7-hold', async ({ page }) => sealRow(page, await pickNode(page)));
await row('W7-centre', async ({ page }) => {
  const node = page.locator('.ww-plate .ww-c-glyph');
  await node.scrollIntoViewIfNeeded();
  return sealRow(page, { node, type: 'centre', key: '#centre' });
});
if (!phone) await row('W7-drag', async ({ page }) => {
  const { node, key } = await pickNode(page);
  const c0 = (await facts(page, key)).count;
  const dragged = await holdOn(page, node, key, { drag: 30 });
  const detail = { key, c0, dragged };
  if (dragged.after.strip || dragged.after.count !== c0 || dragged.after.seen.stamp) throw fail('a drag sealed', detail);
  return detail;
});
/** One seal by another door than the hold (right-click or Shift+F10): the strip, +1 kept, the 印, no slip, nothing covered. */
async function sealedBy(page, key, c0, how) {
  await delay(900);
  await page.evaluate(async () => {
    const strip = document.getElementById('seal-strip');
    if (strip) await Promise.all(strip.getAnimations({ subtree: true }).map((run) => run.finished.catch(() => {})));
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
  const after = await facts(page, key);
  const detail = { key, c0, how, after, focusInStrip: await page.evaluate(() => !!document.getElementById('seal-strip')?.contains(document.activeElement)) };
  if (!after.strip) throw fail(`${how} opened no strip`, detail);
  if (after.mini) throw fail(`${how} opened the slip`, detail);
  if (after.count !== c0 + 1) throw fail(`${how}: the kept count went ${c0} → ${after.count}, not +1`, detail);
  if (!(after.seen.stamp >= 1)) throw fail(`${how}: no 印 pressed on`, detail);
  if (after.covered.length) throw fail(`${how}: the strip covers other controls: ${JSON.stringify(after.covered)}`, detail);
  return detail;
}
if (!phone) await row('W7-right', async ({ page }) => {
  const { node, key } = await pickNode(page);
  const c0 = (await facts(page, key)).count;
  await node.click({ button: 'right' });
  return sealedBy(page, key, c0, 'right-click');
});
if (!phone) await row('W7-key', async ({ page }) => {
  const { node, key } = await pickNode(page);
  const c0 = (await facts(page, key)).count;
  await node.focus();
  await page.keyboard.press('Shift+F10');
  const detail = await sealedBy(page, key, c0, 'Shift+F10');
  if (!detail.focusInStrip) throw fail('Shift+F10: the strip did not take the keyboard', detail);
  return detail;
});
await row('W7-tap', async ({ page }) => {
  const { node, key } = await pickNode(page);
  const c0 = (await facts(page, key)).count;
  if (phone) await node.tap(); else await node.click();
  await delay(900);
  const after = await facts(page, key);
  const detail = { key, c0, after };
  if (!(after.rung || after.mini) || after.strip || after.count !== c0 || after.seen.stamp) throw fail('a quick press did not walk, or sealed', detail);
  return detail;
});

const summary = { verifier: 'verify-hfix2e-hold', engine, version, viewport, mode, centre: CENTRE, gitSha: identity.gitSha,
  artifactSha256: identity.artifactSha256, site: process.env.KAIRO_SITE_DIR, mutations, results };
writeFileSync(join(out, `result-${engine}-${mode}.json`), JSON.stringify(summary, null, 2) + '\n');
console.log(`engine ${engine} ${version} · ${mode} · ${results.filter((r) => r.pass).length}/${results.length} rows pass · artifact ${identity.artifactSha256}`);
await browser.close(); await host.close?.();
process.exit(0);
