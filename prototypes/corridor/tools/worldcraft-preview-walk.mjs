/** Browser walk for the Worldcraft preview: from the app's first screen to the door on 職, into the builder,
 * Put the parts together, Keep, Leave, and back on the kanji page. Phone (390x844, touch) and desktop (1280x800).
 * It also checks what the preview promises: the page's storage is byte-for-byte the same after a visit (with a
 * control that the comparison sees a real write), a reload empties Kept characters, a host navigation under the
 * dialog ends the visit, and 門 gets no Worldcraft door.
 *
 *   node prototypes/corridor/tools/worldcraft-preview-walk.mjs --base http://127.0.0.1:18862/ [--shots <dir>] [--only phone|desktop] [--browser chromium|webkit]
 *
 * Needs a built site (scripts/build-corridor-site.mjs) served at --base. Playwright's own browsers only.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const BASE = arg('--base', '').replace(/\/?$/, '/');
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/$/.test(BASE)) { console.error('usage: --base http://127.0.0.1:<port>/ (a locally served built site)'); process.exit(2); }
const SHOTS = arg('--shots', '') ? resolve(arg('--shots', '')) : null;
const ONLY = arg('--only', '');
const ENGINE = arg('--browser', 'chromium');
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const playwright = createRequire(join(here, '../../../package.json'))('playwright-core');

const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: ENGINE === 'chromium' },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
};
const ORIGIN = new URL(BASE).origin;
const LEAVE = '.worldcraft-view > [data-worldcraft-action="leave"]';
const results = [];

/** Everything the page keeps: localStorage, sessionStorage and every IndexedDB store, in a stable text form. */
const storage = (page) => page.evaluate(async () => {
  const stable = (value) => {
    if (value instanceof Date) return { $date: value.toISOString() };
    if (value instanceof ArrayBuffer) return { $bytes: Array.from(new Uint8Array(value)).join(',') };
    if (ArrayBuffer.isView(value)) return { $view: value.constructor.name, $bytes: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)).join(',') };
    if (value instanceof Blob) return { $blob: [value.size, value.type] };
    if (value instanceof Map) return { $map: [...value].map(([k, v]) => [stable(k), stable(v)]) };
    if (value instanceof Set) return { $set: [...value].map(stable) };
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
    return value === undefined ? { $undefined: true } : value;
  };
  const done = (request) => new Promise((ok, no) => { request.onsuccess = () => ok(request.result); request.onerror = () => no(request.error); });
  const rows = {};
  for (const [name, area] of [['localStorage', localStorage], ['sessionStorage', sessionStorage]]) {
    for (const key of Object.keys(area)) rows[`${name} · ${key}`] = area.getItem(key);
  }
  for (const info of await indexedDB.databases()) {
    const db = await done(indexedDB.open(info.name));
    for (const store of db.objectStoreNames) {
      const source = db.transaction(store, 'readonly').objectStore(store);
      const [keys, values] = await Promise.all([done(source.getAllKeys()), done(source.getAll())]);
      rows[`indexedDB ${info.name} v${db.version} · ${store} · (count)`] = String(keys.length);
      keys.forEach((key, i) => { rows[`indexedDB ${info.name} v${db.version} · ${store} · ${JSON.stringify(stable(key))}`] = JSON.stringify(stable(values[i])); });
    }
    db.close();
  }
  return rows;
});
const changed = (before, after) => [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => before[key] !== after[key]).sort();

async function fresh(browser, device) {
  const context = await browser.newContext({ ...DEVICES[device], locale: 'en-US', timezoneId: 'Asia/Tokyo' });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console error: ${m.text().slice(0, 300)}${m.location()?.url ? ` @ ${m.location().url.replace(ORIGIN, '')}` : ''}`); });
  page.on('pageerror', (e) => problems.push(`uncaught: ${String(e.message || e).slice(0, 300)}`));
  page.on('requestfailed', (r) => {
    // The report sheet reads only the head of build-identity.json and drops the rest: that abort is the app's design.
    if (r.url().endsWith('/build-identity.json') && r.failure()?.errorText === 'net::ERR_ABORTED') return;
    problems.push(`request failed: ${r.failure()?.errorText} ${r.url().replace(ORIGIN, '')}`);
  });
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()} ${r.url().replace(ORIGIN, '')}`); });
  page.on('request', (r) => { const u = new URL(r.url()); if (u.origin !== ORIGIN && !['data:', 'blob:', 'about:'].includes(u.protocol)) problems.push(`left this address: ${r.url().slice(0, 160)}`); });
  const touch = !!DEVICES[device].hasTouch;
  const press = (target) => (typeof target === 'string' ? page.locator(target).first() : target)[touch ? 'tap' : 'click']();
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}-${device}.png`) }); };
  return { context, page, problems, press, shot, device };
}

/** The first screen, then Words, then the kanji's own page through search: the way a learner gets there. */
async function firstScreen({ page }) {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 45000 });
  await page.locator('#ginga-symbol').waitFor();
}
async function toKanji({ page, press }, kanji, reading, { fromFirstScreen = false } = {}) {
  if (fromFirstScreen) {
    await press('#home-review');
    await page.locator('#tab-words').waitFor();
    await press('#tab-words');
  } else await press('#sheet-back'); // from one kanji page: Close, and the search it came from is there again
  await page.locator('#nav-search-input').waitFor();
  await page.locator('#nav-search-input').fill(kanji);
  const hit = page.locator('.nav-search-row', { hasText: reading }).first();
  await hit.waitFor();
  await press(hit);
  await page.locator('#sheet .hero-glyph', { hasText: kanji }).waitFor();
}
async function openDoor({ page, press }) {
  const door = page.locator('#worldcraft-door');
  await door.waitFor();
  await door.scrollIntoViewIfNeeded();
  const words = (await door.innerText()).trim();
  await press(door);
  await page.locator('#worldcraft-dialog[open] .worldcraft-view').waitFor();
  return words;
}
const dialogGone = (page) => page.waitForFunction(() => !document.getElementById('worldcraft-dialog'));
const lineOf = (page, code) => page.locator(`#worldcraft-dialog [data-worldcraft-copy="${code}"]`);
const count = (page, selector) => page.locator(selector).count();

async function check(session, name, fn) {
  const row = { check: name, viewport: session.device, pass: false, detail: '' };
  const before = session.problems.length;
  try {
    row.detail = await fn();
    const raised = session.problems.slice(before);
    if (raised.length) throw new Error(`${raised.length} problem(s): ${raised.slice(0, 3).join(' ; ')}`);
    row.pass = true;
  } catch (error) { row.detail = `FAILED: ${String(error.message || error).split('\n')[0].slice(0, 400)}`; }
  results.push(row);
  console.log(`${row.pass ? 'PASS' : 'FAIL'}  ${name} @ ${session.device}: ${row.detail}`);
  return row.pass;
}

async function walk(browser, device) {
  const session = await fresh(browser, device);
  const { page, press, shot } = session;
  let before = null;

  const reached = await check(session, 'door', async () => {
    await firstScreen(session);
    await toKanji(session, '職', 'ショク', { fromFirstScreen: true });
    const door = page.locator('#worldcraft-door');
    await door.waitFor();
    const words = (await door.innerText()).trim();
    if (!/preview|試作/.test(words)) throw new Error(`the door does not say preview: "${words}"`);
    await door.scrollIntoViewIfNeeded();
    await shot('1-door');
    // The app times each page's arrival for a second and then notes it in its own device key (kairo-frames, never
    // the learning record). Let that land first, so every stored row can be compared with none left out.
    await page.waitForTimeout(1500);
    before = await storage(page);
    return `first screen → Review → Words → search 職 → its row → the door reads "${words}"`;
  });
  if (!reached) { await session.context.close(); return; }

  await check(session, 'build', async () => {
    const scroll = await page.evaluate(() => [window.scrollX, window.scrollY]);
    const hadReports = await page.evaluate(() => !!document.getElementById('bunki-reports-root'));
    const pressed = Date.now();
    await openDoor(session);
    const opened = Date.now() - pressed;
    const note = (await page.locator('#worldcraft-preview-note').innerText()).replace(/\s+/g, ' ');
    if (!/^(Preview|試作)/.test(note)) throw new Error(`the dialog is not labelled preview: "${note.slice(0, 80)}"`);
    const parts = await page.locator('.worldcraft-parts figcaption').allInnerTexts();
    if (parts.join('+') !== '耳+戠') throw new Error(`parts are ${parts.join('+')}, not 耳+戠`);
    const partStrokes = await count(page, '.worldcraft-parts svg path');
    if (await lineOf(page, 'W-05').count()) throw new Error('the result shows before Put the parts together');
    await shot('2-builder');
    await press('#worldcraft-dialog [data-worldcraft-action="assemble"]');
    await lineOf(page, 'W-05').waitFor();
    const built = (await lineOf(page, 'W-05').innerText()).trim();
    const wholeStrokes = await count(page, '.worldcraft-view > svg.strokes path');
    if (!built.includes('職') || wholeStrokes !== 18 || partStrokes !== 18) throw new Error(`"${built}", ${partStrokes} part strokes, ${wholeStrokes} strokes in the built form (職 has 18)`);
    await shot('3-built');
    await press('#worldcraft-dialog [data-worldcraft-action="keep"]');
    await lineOf(page, 'W-09').waitFor();
    const kept = await page.locator('.worldcraft-view li[data-worldcraft-id] > p').allInnerTexts();
    if (kept.join() !== '職') throw new Error(`Kept characters lists "${kept.join()}"`);
    const overflow = await page.evaluate(() => { const d = document.getElementById('worldcraft-dialog'); return d.scrollWidth - d.clientWidth; });
    if (overflow > 1) throw new Error(`the dialog scrolls sideways by ${overflow}px`);
    await page.locator(LEAVE).scrollIntoViewIfNeeded();
    await shot('4-kept');
    await press(LEAVE);
    await dialogGone(page);
    const back = await page.evaluate(() => ({ focus: document.activeElement?.id, glyph: document.querySelector('#sheet .hero-glyph')?.textContent,
      scroll: [window.scrollX, window.scrollY], locked: document.body.style.overflow,
      // the app's report entry rides inside an open dialog: it must be back on the page, not gone with the dialog
      reports: document.getElementById('bunki-reports-root')?.parentElement === document.body }));
    if (back.focus !== 'worldcraft-door' || back.glyph !== '職' || back.locked === 'hidden') throw new Error(`after Leave: focus ${back.focus}, page ${back.glyph}, body overflow "${back.locked}"`);
    if (hadReports && !back.reports) throw new Error('the report entry did not return to the page');
    if (Math.abs(back.scroll[1] - scroll[1]) > 2) throw new Error(`scroll moved from ${scroll[1]} to ${back.scroll[1]}`);
    await shot('5-returned');
    return `the builder is up ${opened} ms after the press, labelled "${note.slice(0, 44)}…"; 耳 + 戠 → "${built}" (18 strokes) → Keep → "${kept.join()}" in Kept characters → Leave → back on 職's page, focus on the door`;
  });

  await check(session, 'no record written', async () => {
    await page.waitForTimeout(1500); // a deferred save would have landed by now
    const after = await storage(page);
    const diff = changed(before, after);
    if (diff.length) throw new Error(`storage changed during the visit: ${diff.slice(0, 6).join(' | ')}`);
    // control: the same comparison must see a real write of each kind
    await page.evaluate(async () => {
      localStorage.setItem('worldcraft-walk-control', '1');
      const db = await new Promise((ok, no) => { const r = indexedDB.open('worldcraft-walk-control', 1); r.onupgradeneeded = () => r.result.createObjectStore('rows'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
      await new Promise((ok, no) => { const t = db.transaction('rows', 'readwrite'); t.objectStore('rows').put({ at: 1 }, 'row'); t.oncomplete = ok; t.onerror = () => no(t.error); });
      db.close();
    });
    const seen = changed(after, await storage(page));
    await page.evaluate(async () => { localStorage.removeItem('worldcraft-walk-control'); await new Promise((ok) => { const r = indexedDB.deleteDatabase('worldcraft-walk-control'); r.onsuccess = r.onerror = r.onblocked = ok; }); });
    if (!seen.some((key) => key.startsWith('localStorage')) || !seen.some((key) => key.startsWith('indexedDB'))) throw new Error(`the control write was not seen: ${seen.join(' | ')}`);
    return `${Object.keys(after).length} stored rows identical before the door and after Leave; the control write showed as ${seen.length} changed rows`;
  });

  await check(session, 'kept across pages, viewed, removed', async () => {
    await toKanji(session, '識', 'シキ');
    await openDoor(session);
    const parts = await page.locator('.worldcraft-parts figcaption').allInnerTexts();
    const kept = await page.locator('.worldcraft-view li[data-worldcraft-id] > p').allInnerTexts();
    if (parts.join('+') !== '言+戠' || kept.join() !== '職') throw new Error(`on 識: parts ${parts.join('+')}, kept "${kept.join()}"`);
    await press('#worldcraft-dialog [data-worldcraft-action="assemble"]');
    await lineOf(page, 'W-05').waitFor();
    await press('#worldcraft-dialog [data-worldcraft-action="inspect"]');
    await page.locator('#worldcraft-dialog .wc-context:not([hidden])').waitFor();
    const viewing = (await lineOf(page, 'W-05').innerText()).trim();
    if (!viewing.includes('職')) throw new Error(`View this character shows "${viewing}"`);
    const top = await page.evaluate(() => document.getElementById('worldcraft-dialog').scrollTop);
    if (top !== 0) throw new Error(`the kept character opens out of sight: the dialog is scrolled ${top}px down`);
    await shot('6-viewing-kept');
    await press(LEAVE);
    await page.locator('#worldcraft-dialog .wc-context[hidden]').waitFor({ state: 'attached' });
    const returned = (await lineOf(page, 'W-05').innerText()).trim();
    if (!returned.includes('識')) throw new Error(`Leave from the kept character shows "${returned}", not the unkept 識`);
    await press(LEAVE);
    await lineOf(page, 'W-17').waitFor();
    await shot('7-unkept-leave');
    await press('#worldcraft-dialog [data-worldcraft-action="confirm-leave"]');
    await dialogGone(page);
    await openDoor(session);
    if (await lineOf(page, 'W-05').count()) throw new Error('the unkept 識 came back after leaving');
    await press('#worldcraft-dialog [data-worldcraft-action="request-remove"]');
    await lineOf(page, 'W-14').waitFor();
    await press('#worldcraft-dialog [data-worldcraft-action="confirm-remove"]');
    await lineOf(page, 'W-15').waitFor();
    const left = await count(page, '.worldcraft-view li[data-worldcraft-id]');
    if (left !== 0) throw new Error(`${left} kept rows after Remove`);
    await press(LEAVE);
    await dialogGone(page);
    return `識's door lists the 職 kept on the other page; View shows "${viewing}" and Leave returns to the unkept "${returned}"; leaving it asks first (W-17); Remove empties the list (W-15)`;
  });

  await check(session, 'Keep from the leave prompt', async () => {
    await openDoor(session);
    await press('#worldcraft-dialog [data-worldcraft-action="assemble"]');
    await lineOf(page, 'W-05').waitFor();
    await press(LEAVE);
    await lineOf(page, 'W-17').waitFor();
    await press('#worldcraft-dialog [data-worldcraft-action="keep-before-leave"]');
    await lineOf(page, 'W-09').waitFor();
    const prompt = await lineOf(page, 'W-17').count(), kept = await page.locator('.worldcraft-view li[data-worldcraft-id] > p').allInnerTexts();
    if (prompt || kept.join() !== '識') throw new Error(`after Keep in the prompt: ${prompt} prompt line(s), kept "${kept.join()}"`);
    await press(LEAVE); // kept now, so Leave no longer asks
    await dialogGone(page);
    await openDoor(session);
    await press('#worldcraft-dialog [data-worldcraft-action="request-remove"]');
    await press('#worldcraft-dialog [data-worldcraft-action="confirm-remove"]');
    await lineOf(page, 'W-15').waitFor();
    await press(LEAVE);
    await dialogGone(page);
    return 'an unkept 識, Leave, then Keep this build in the prompt: kept (W-09), the prompt is gone, and Leave then closes without asking';
  });

  await check(session, 'Escape and a host navigation end the visit', async () => {
    const rest = () => page.evaluate(() => ({ dialog: document.getElementById('worldcraft-dialog')?.open ?? null, locked: document.body.style.overflow,
      focus: document.activeElement?.id, door: !!document.getElementById('worldcraft-door') }));
    await openDoor(session);
    await page.keyboard.press('Escape');
    await dialogGone(page);
    let state = await rest();
    if (state.locked === 'hidden' || state.focus !== 'worldcraft-door') throw new Error(`after Escape: body overflow "${state.locked}", focus ${state.focus}`);
    await openDoor(session);
    await press('#worldcraft-dialog [data-worldcraft-action="assemble"]');
    await lineOf(page, 'W-05').waitFor();
    await page.keyboard.press('Escape'); // an unkept build: Escape asks first, as Leave does
    await lineOf(page, 'W-17').waitFor();
    await page.keyboard.press('Escape'); // a browser may force a second Escape through: whatever it does, no dead page
    await page.waitForTimeout(400);
    state = await rest();
    if (state.dialog === false || (state.dialog === null && state.locked === 'hidden')) throw new Error(`after a second Escape: dialog ${state.dialog}, body overflow "${state.locked}"`);
    const second = state.dialog === null ? 'closed the builder' : 'kept the builder open';
    if (state.dialog) {
      if (!(await lineOf(page, 'W-17').count())) await press(LEAVE);
      await press('#worldcraft-dialog [data-worldcraft-action="confirm-leave"]');
      await dialogGone(page);
    }
    await openDoor(session);
    await page.evaluate(() => history.back());
    await dialogGone(page);
    state = await rest();
    if (state.locked === 'hidden') throw new Error('the page stayed scroll-locked after Back');
    return `Escape leaves and returns focus to the door; with an unkept build it asks first (W-17), and a second Escape ${second}; Back with the builder open closes it and unlocks the page (door still on screen: ${state.door})`;
  });

  await check(session, 'reload empties Kept characters; 門 has no door', async () => {
    await firstScreen(session);
    await toKanji(session, '織', 'ショク', { fromFirstScreen: true });
    await openDoor(session);
    await press('#worldcraft-dialog [data-worldcraft-action="assemble"]');
    await lineOf(page, 'W-05').waitFor();
    await press('#worldcraft-dialog [data-worldcraft-action="keep"]');
    await lineOf(page, 'W-09').waitFor();
    await press(LEAVE);
    await dialogGone(page);
    await firstScreen(session);
    await toKanji(session, '織', 'ショク', { fromFirstScreen: true });
    await openDoor(session);
    const kept = await count(page, '.worldcraft-view li[data-worldcraft-id]');
    if (kept !== 0) throw new Error(`${kept} kept rows survived a reload`);
    await press(LEAVE);
    await dialogGone(page);
    await toKanji(session, '門', 'モン');
    await page.locator('#kanji-world-door').waitFor();
    if (await count(page, '#worldcraft-door')) throw new Error('門 has a Worldcraft door');
    return '織 kept, page reloaded: Kept characters is empty again. 門 shows the Rajōmon door and no Worldcraft door';
  });

  await check(session, 'without WebCrypto the door says so', async () => {
    // The model hashes its five source files with WebCrypto, which a plain-http address other than localhost
    // does not have. Take it away as such an address would, on a fresh load so nothing is admitted yet.
    await firstScreen(session);
    await toKanji(session, '識', 'シキ', { fromFirstScreen: true });
    const door = page.locator('#worldcraft-door');
    await door.waitFor();
    await page.evaluate(() => Object.defineProperty(Object.getPrototypeOf(crypto), 'subtle', { configurable: true, get: () => undefined }));
    await door.scrollIntoViewIfNeeded();
    await press(door);
    await page.waitForFunction(() => /https/.test(document.querySelector('#worldcraft-dialog[open] .wc-loading')?.textContent || ''));
    const words = (await page.locator('#worldcraft-dialog .wc-loading').innerText()).trim();
    if (await count(page, '#worldcraft-dialog .worldcraft-view')) throw new Error('a builder was shown without admitted sources');
    await shot('8-no-webcrypto');
    await press('#worldcraft-dialog .wc-body > .chip');
    await dialogGone(page);
    const focus = await page.evaluate(() => document.activeElement?.id);
    if (focus !== 'worldcraft-door') throw new Error(`Return left focus on ${focus}`);
    return `the dialog reads "${words}" and Return goes back to the door`;
  });

  await session.context.close();
}

const browser = await playwright[ENGINE].launch({ headless: true, ...(ENGINE === 'chromium' ? { args: ['--mute-audio'] } : {}) });
try {
  const identity = await (await fetch(`${BASE}build-identity.json`)).json();
  console.log(`Worldcraft preview walk · ${BASE} · ${ENGINE} · build ${identity.buildId} · commit ${identity.gitSha}${identity.sourceDirty ? ' (dirty)' : ''}\n`);
  for (const device of Object.keys(DEVICES)) if (!ONLY || ONLY === device) await walk(browser, device);
  const failed = results.filter((row) => !row.pass).length;
  if (SHOTS) writeFileSync(join(SHOTS, `results-${ENGINE}.json`), JSON.stringify({ base: BASE, engine: ENGINE, build: identity.buildId, commit: identity.gitSha, results }, null, 2));
  console.log(`\n${results.length - failed} passed, ${failed} failed${SHOTS ? `. Screenshots: ${SHOTS}` : ''}`);
  process.exitCode = failed || !results.length ? 1 : 0;
} finally { await browser.close(); }
