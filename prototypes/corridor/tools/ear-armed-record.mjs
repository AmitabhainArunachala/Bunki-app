#!/usr/bin/env node
/** An armed tap speaks and does nothing else, on every surface (the review's B5, 2026-11-11): nothing is written to his
 * record, and the screen stays as it was.
 *
 * On each surface the ear is armed by a tap on its mark, the learner's record is read (every IndexedDB database of the
 * page, every store, every row; and every localStorage key), one Japanese word or row is tapped, and the record is read
 * again. The tap must ask the voice once, leave the screen where it was, and leave the record byte for byte as it was.
 * The one key allowed to change is the voice's own count of today's spend (kairo-voice-day), which the voice server's
 * answer updates; it is not his learning record.
 *
 * Silent: the review's harness (review-ear/lib.mjs): Chromium with --mute-audio or headless WebKit, media forced muted,
 * the device voice swallowed, the local stand-in voice server, nothing but this machine reached.
 *
 *   REVIEW_BASE=http://127.0.0.1:19481/ node prototypes/corridor/tools/ear-armed-record.mjs --engine chromium|webkit
 *        [--width 390|1728] [--voice-port 19482]
 */
import { arg, dismissFirstLine, earMark, open, openArticle, reporter } from './review-ear/lib.mjs';

const ENGINE = arg('--engine', 'chromium');
const WIDTH = Number(arg('--width', '390'));
const tag = `${ENGINE}-${WIDTH}`;
const { rows, record } = reporter(tag);
const ALLOWED = new Set(['ls:kairo-voice-day']);
const s = await open({ engine: ENGINE, width: WIDTH, clipSeconds: () => 0.6, voicePort: Number(arg('--voice-port', '19532')) });
const { page, press, fake } = s;

/** Every row of every IndexedDB database of the page, and every localStorage key. */
const readRecord = () => page.evaluate(async () => {
  const out = {};
  for (let i = 0; i < localStorage.length; i += 1) { const key = localStorage.key(i); out[`ls:${key}`] = localStorage.getItem(key); }
  const names = typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).map((d) => d.name).filter(Boolean) : [];
  const text = (value) => { try { return JSON.stringify(value, (k, v) => (v instanceof Blob ? `blob:${v.size}:${v.type}` : v instanceof ArrayBuffer ? `bytes:${v.byteLength}` : v)); } catch { return String(value); } };
  for (const name of names) {
    await new Promise((done) => {
      const request = indexedDB.open(name);
      request.onerror = () => { out[`idb:${name}`] = 'unreadable'; done(); };
      request.onupgradeneeded = () => { request.transaction.abort(); };
      request.onsuccess = () => {
        const db = request.result;
        const stores = [...db.objectStoreNames];
        if (!stores.length) { db.close(); done(); return; }
        const tx = db.transaction(stores, 'readonly');
        let left = stores.length;
        for (const store of stores) {
          const all = tx.objectStore(store).getAll();
          const keys = tx.objectStore(store).getAllKeys();
          keys.onsuccess = () => { out[`idb:${name}/${store}`] = text({ keys: keys.result, rows: all.result }); if (--left === 0) { db.close(); done(); } };
          keys.onerror = () => { out[`idb:${name}/${store}`] = 'unreadable'; if (--left === 0) { db.close(); done(); } };
        }
      };
    });
  }
  return out;
});
const where = () => page.evaluate(() => ({ view: document.body.dataset.view || '', sheet: document.getElementById('sheet')?.dataset.node || '',
  box: !!document.getElementById('mini')?.getClientRects().length, url: location.href, unfolded: document.querySelectorAll('#sky .unfolded, #sky .glossed').length,
  web: document.querySelector('.ww-plate')?.dataset.wwCentre || '' }));

/** On the screen as it stands: arm, read the record, tap `point()`, read it again. */
async function armedTap(name, point) {
  try {
    await dismissFirstLine(s);
    await press(await earMark(page));
    await page.waitForFunction(() => document.documentElement.dataset.ear === 'armed', null, { timeout: 3000 });
    const before = await readRecord();
    const was = await where();
    const n = fake.speaks().length;
    const at = await point();
    if (!at) throw new Error('nothing Japanese to tap in plain view');
    if (s.phone) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
    await s.sleep(1600);
    const after = await readRecord();
    const now = await where();
    const asked = fake.speaks().slice(n);
    const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => before[key] !== after[key]);
    const written = changed.filter((key) => !ALLOWED.has(key));
    const moved = Object.keys(was).filter((key) => was[key] !== now[key]);
    const problems = [];
    if (asked.length !== 1) problems.push(`${asked.length} requests, not 1`);
    if (written.length) problems.push(`written to the record: ${written.join(', ')}`);
    if (moved.length) problems.push(`the screen moved: ${moved.map((k) => `${k} ${JSON.stringify(was[k])} → ${JSON.stringify(now[k])}`).join(', ')}`);
    record(`armed: a tap on ${name} speaks it, writes nothing and moves nothing`, problems,
      `"${at.label}"; asked ${asked.map((r) => `${r.voiceKey} "${String(r.text).slice(0, 14)}"`).join(', ') || 'nothing'}; record keys ${Object.keys(after).length}, changed ${changed.join(', ') || 'none'}`);
  } catch (error) {
    record(`armed: a tap on ${name}`, [`the check could not run: ${String(error.message).split('\n')[0].slice(0, 160)}`]);
  }
}
/** The centre of the first element matching `selector` in plain view, clear of the bars, with Japanese in it. */
const pick = (selector, inner = null) => () => page.evaluate(({ selector, inner }) => {
  for (const el of document.querySelectorAll(selector)) {
    const target = inner ? el.querySelector(inner) || el : el;
    const r = target.getBoundingClientRect();
    if (r.width > 4 && r.top > 110 && r.bottom < innerHeight - 160 && r.left >= 0 && r.right <= innerWidth && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(target.textContent)
      && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest(selector) === el)
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: target.textContent.trim().slice(0, 16) };
  }
  return null;
}, { selector, inner });
const toTab = async (tab) => { await s.ready(); await press('#home-review'); await page.locator(`#tab-${tab}`).waitFor(); await press(`#tab-${tab}`); await s.sleep(1300); };

try {
  // a saved word first, so that Today and the word lists have his own rows
  await openArticle(s, { start: false });
  const first = page.locator('.reader .tok.content').first();
  for (let i = 0; i < 4 && !(await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await press(first); await s.sleep(700); }
  await press('#mini-take'); await s.sleep(900);

  // 1. the first screen's sky: a word (its first cue still standing on a fresh first screen)
  await s.ready(); await s.sleep(1800);
  await armedTap('a word of the sky', pick('#sky div.word', '.base'));
  // 2. an article: a word of its running text
  await openArticle(s, { start: false });
  await armedTap('a word of an article', pick('#reader .tok.content'));
  // 3. the word box: its headword
  {
    const word = page.locator('#reader .tok.content').nth(4);
    for (let i = 0; i < 4 && !(await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await press(word); await s.sleep(700); }
    await armedTap('the word box’s reading', pick('#mini .mini-reading'));
  }
  // 4. Today: his own word's row
  await toTab('today');
  await armedTap('a word row on Today', pick('#app .dw-word, #app [data-word], #app .today-word'));
  // 5. search: a row
  await toTab('words');
  await page.locator('#nav-search-input').fill('門'); await page.locator('.nav-search-row').first().waitFor(); await s.sleep(800);
  await armedTap('a search row', pick('.nav-search-row'));
  // 6. a kanji's page: a compound row
  await page.locator('.nav-search-row', { hasText: 'モン' }).first().click({ force: true }).catch(() => {});
  await page.locator('#sheet .entry-row.compound').first().waitFor({ timeout: 8000 }).catch(() => {});
  await s.sleep(1500);
  await armedTap('a compound row on a kanji’s page', pick('#sheet .entry-row.compound'));
  // 7. the word web: a node
  await toTab('words');
  {
    const door = page.locator('#words-web');
    if (!(await door.isVisible().catch(() => false))) await press('summary.words-index-row').catch(() => {});
    await press(door).catch(() => {});
    await page.locator('.ww-nodes .ww-node.ww-n-word').first().waitFor({ timeout: 8000 }).catch(() => {});
    await s.sleep(1500);
    await armedTap('a node of the word web', pick('.ww-nodes .ww-node.ww-n-word'));
  }
} catch (error) {
  record('the check ran to its end', [String(error.message).split('\n')[0].slice(0, 200)]);
}
await s.close();
const failed = rows.filter((r) => !r.pass).length;
console.log(`${tag}: ${rows.length - failed} passed, ${failed} failed; page errors ${s.errors.length}; off this machine ${s.offMachine.length}`);
process.exit(failed ? 1 : 0);
