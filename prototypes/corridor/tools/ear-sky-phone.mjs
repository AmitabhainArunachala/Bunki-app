#!/usr/bin/env node
/** The ear on the sky at phone size, by finger (2026-11-12): version 3 of the sky's engine puts the sky on a window under
 * 720 px as its first screen, so the ear on the sky must work there with a finger. A phone's screen, 390 x 844, touch,
 * ?sky=1 (a driven browser keeps the old first screen otherwise), headless WebKit (the engine of John's iPhone) or
 * Chromium.
 *
 *   mount     the sky mounts and draws on the phone
 *   open      the ear off: a tap on a word opens it as the engine does (that word, at once); its page button opens the
 *             app's page for that word, which offers Save and 音 (the listen mark beside the headword); Back returns to
 *             the sky, where the word stays open
 *   armed     a tap on the ear arms it; a tap on a word says that word once, by its stored reading, and opens nothing;
 *             then the ear is off
 *   held      a long press on the ear holds it on; a tap on a sky word is the sky's own (the review's ruling R-a: a word
 *             the sky draws is one of its controls), so it opens and nothing is asked; a tap on the ear turns it off
 *   bars      the 耳 mark and every tab of the bottom bar stand clear of the sky (the element at each one's centre is that
 *             control), and a tap on each still acts: the mark arms and turns off; each tab brings its view up over the
 *             first screen, and the sky rests behind it
 *
 * Silent: the review's harness (review-ear/lib.mjs): headless WebKit (or Chromium with --mute-audio), media forced muted,
 * the device voice swallowed, the local stand-in voice server, nothing but this machine reached.
 *
 *   REVIEW_BASE=http://127.0.0.1:19600/ node prototypes/corridor/tools/ear-sky-phone.mjs [--engine webkit|chromium]
 *        [--ui bi|ja] [--cases mount,open,armed,held,bars] [--voice-port 19601] [--out DIR]
 */
import { arg, earMark, earState, holdOn, open, reporter } from './review-ear/lib.mjs';

const ENGINE = arg('--engine', 'webkit');
const UI = arg('--ui', 'bi');
const CASES = arg('--cases', 'mount,open,armed,held,bars').split(',');
const OUT = arg('--out', process.env.REVIEW_OUT || '.');
const port = Number(arg('--voice-port', '19601'));
const tag = `${ENGINE}-390-touch-${UI}`;
const { rows, record } = reporter(tag);
const GPU = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
const sayable = (reading) => String(reading || '').split(/[;；]/u)[0].replace(/[(（][^)）]*[)）]/gu, '').replace(/[～〜~]/gu, '').trim();
const said = [];

async function sky() {
  const s = await open({ engine: ENGINE, width: 390, touch: true, ui: UI, clipSeconds: () => 1, voicePort: port, args: GPU });
  await s.ready('sky=1');
  await s.page.waitForFunction(() => ['mounted', 'gave-back', 'off', 'stood-down'].includes(window.__bunkiSkyApp?.state), null, { timeout: 45000 });
  const app = await s.page.evaluate(() => ({ ...window.__bunkiSkyApp }));
  if (app.state !== 'mounted') { await s.close(); throw new Error(`the sky did not mount: ${JSON.stringify(app)}`); }
  await s.page.waitForFunction(() => window.__SKY__?.W?.ready && window.__SKY__.W.fonts && window.__SKY__.W.hits.length > 10, null, { timeout: 45000 });
  await s.sleep(2500);
  return s;
}
/** A word in plain view that the app's door holds, which the engine's own rule and the ear both name at its centre with
 * a finger's reach: where it stands now (CSS px). */
const clearWord = async (page, skip = []) => {
  for (let k = 0; k < 15; k += 1) {
    const w = await page.evaluate((skip) => {
      const sky = window.__SKY__, W = sky.W, r = sky.wrap.getBoundingClientRect(), host = document.getElementById('bunki-sky');
      const canvas = host.shadowRoot.querySelector('canvas'), door = window.__BUNKI_OPEN_ENTRY;
      const tabs = document.querySelector('#primary-tabs')?.getBoundingClientRect();
      return W.hits.map((i) => ({ i, word: W.D.words[i][0], reading: W.rd[i], x: r.left + W.vis[i * 5], y: r.top + W.vis[i * 5 + 1], h: W.vis[i * 5 + 2], a: W.vis[i * 5 + 3] }))
        .filter((w) => !skip.includes(w.word) && w.a > 0.5 && w.h >= 14 && w.y > 140 && w.y < (tabs && tabs.height ? tabs.top : innerHeight) - 90 && w.x > 50 && w.x < innerWidth - 60 && /\p{Script=Han}/u.test(w.word) && door?.has('word', w.word))
        .filter((w) => document.elementFromPoint(w.x, w.y) === host && host.shadowRoot.elementFromPoint(w.x, w.y) === canvas)
        .filter((w) => host.earWordAt(w.x, w.y, { pointer: 'touch' })?.text === w.word)
        .sort((a, b) => b.h - a.h)[0] || null;
    }, skip);
    if (w) return w;
    await s0.sleep(400);
  }
  throw new Error('no clear sky word in plain view');
};
const opened = (page) => page.evaluate(() => {
  const W = window.__SKY__?.W, web = W?.web;
  return web?.isOpen?.() ? (web.cur.kind === 'w' ? W.D.words[web.cur.id][0] : `${web.cur.kind}${web.cur.id}`) : null;
});
const sheetShows = (page, word) => page.evaluate((word) => {
  const sheet = document.getElementById('sheet');
  return !!sheet && sheet.getClientRects().length > 0 && getComputedStyle(sheet).visibility !== 'hidden' && (!word || sheet.textContent.includes(word));
}, word);
let s0 = null;
async function run(name, body) {
  if (!CASES.includes(name)) return;
  let s = null;
  try { s = await sky(); s0 = s; await body(s); } catch (error) {
    record(`${name}: the case ran to its end`, [String(error.message).split('\n')[0].slice(0, 220)]);
    if (s) await s.page.screenshot({ path: `${OUT}/ear-sky-phone-${tag}-${name}-error.png` }).catch(() => {});
  } finally { if (s) await s.close(); }
}

await run('mount', async (s) => {
  const app = await s.page.evaluate(() => ({ state: window.__bunkiSkyApp.state, renderer: window.__bunkiSkyApp.renderer || '', w: innerWidth, hits: window.__SKY__.W.hits.length, small: window.__SKY__.S.small }));
  await s.page.screenshot({ path: `${OUT}/ear-sky-phone-${tag}-mount.png` });
  record('the sky mounts and draws on a phone (390 wide, ?sky=1)', app.state === 'mounted' && app.hits > 10 && app.small ? [] : [JSON.stringify(app)], `${app.hits} words drawn; renderer ${app.renderer}; phone layout ${app.small}`);
});

await run('open', async (s) => {
  const { page } = s;
  const w = await clearWord(page);
  const n = s.fake.speaks().length;
  await page.touchscreen.tap(w.x, w.y);
  await page.waitForFunction((word) => { const W = window.__SKY__.W, web = W.web; return web.isOpen() && web.cur.kind === 'w' && W.D.words[web.cur.id][0] === word; }, w.word, { timeout: 4000 }).catch(() => {});
  const isOpen = await opened(page);
  await s.sleep(1500);
  await page.screenshot({ path: `${OUT}/ear-sky-phone-${tag}-open-word.png` });
  record('ear off: a tap on a sky word opens that word, as the engine does, and asks nothing', [...(isOpen === w.word ? [] : [`opened ${isOpen}, not ${w.word}`]), ...(s.fake.speaks().length > n ? [`${s.fake.speaks().length - n} requests`] : [])], `"${w.word}" → ${isOpen}`);
  // the page button, under the word
  const act = page.locator('#bunki-sky .cap .act').first();
  await act.waitFor({ state: 'visible', timeout: 5000 });
  await act.tap();
  await page.waitForFunction((word) => { const sheet = document.getElementById('sheet'); return !!sheet && sheet.getClientRects().length > 0 && getComputedStyle(sheet).visibility !== 'hidden' && sheet.textContent.includes(word); }, w.word, { timeout: 15000 }).catch(() => {});
  await s.sleep(1200);
  const page1 = await page.evaluate(() => {
    const sheet = document.getElementById('sheet');
    const shown = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const save = document.getElementById('sheet-take'), say = document.querySelector('#sheet > .voice-say[data-voice-say="entry-headword"]');
    return { sheet: shown(sheet), node: sheet?.dataset.node || '', save: shown(save), saveText: (save?.getAttribute('aria-label') || save?.textContent || '').trim().slice(0, 40), say: shown(say), sayText: (say?.textContent || say?.getAttribute('aria-label') || '').trim().slice(0, 30) };
  });
  await page.screenshot({ path: `${OUT}/ear-sky-phone-${tag}-page.png` });
  record("its page button opens the app's page for the word, with Save and 音", [...(page1.sheet && (await sheetShows(page, w.word)) ? [] : ['the page did not open on the word']), ...(page1.save ? [] : ['no Save on the page']), ...(page1.say ? [] : ['no 音 beside the headword'])],
    `page ${page1.node}; Save "${page1.saveText}"; listen "${page1.sayText}"`);
  // Back
  const back = page.locator('#sheet-back').first();
  await back.tap();
  await page.waitForFunction(() => { const sheet = document.getElementById('sheet'); return document.body.dataset.view === 'drift' && (!sheet || sheet.getClientRects().length === 0 || getComputedStyle(sheet).visibility === 'hidden'); }, null, { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(() => window.__SKY__.S.paused === false, null, { timeout: 6000 }).catch(() => {});
  await s.sleep(1200);
  const after = { view: await page.evaluate(() => document.body.dataset.view), sheet: await sheetShows(page), open: await opened(page), paused: await page.evaluate(() => window.__SKY__.S.paused) };
  await page.screenshot({ path: `${OUT}/ear-sky-phone-${tag}-back.png` });
  record('Back returns to the sky, the word still open there', [...(after.view === 'drift' && !after.sheet ? [] : [`view ${after.view}, page shown ${after.sheet}`]), ...(after.paused ? ['the sky is still resting'] : []), ...(after.open === w.word ? [] : [`open ${after.open}`])],
    `view ${after.view}; open ${after.open}`);
});

await run('armed', async (s) => {
  const { page } = s;
  await s.press(await earMark(page));
  await page.waitForFunction(() => document.documentElement.dataset.ear === 'armed', null, { timeout: 3000 });
  const w = await clearWord(page, said);
  said.push(w.word);
  const n = s.fake.speaks().length;
  await page.touchscreen.tap(w.x, w.y);
  await s.sleep(1600);
  const asked = s.fake.speaks().slice(n);
  const isOpen = await opened(page), ear = await earState(page);
  await page.screenshot({ path: `${OUT}/ear-sky-phone-${tag}-armed.png` });
  const want = sayable(w.reading) || w.word;
  const problems = [];
  if (asked.length !== 1) problems.push(`${asked.length} requests, not 1`);
  else if (asked[0].text !== want) problems.push(`asked "${asked[0].text}", not "${want}"`);
  if (isOpen) problems.push(`the sky opened ${isOpen}`);
  if (ear !== 'off' && ear !== 'speaking') problems.push(`the ear is ${ear}, not off`);
  record('armed: a tap on a sky word says it once, by its reading, opens nothing, and the ear goes off', problems, `"${w.word}"; asked ${asked.map((r) => `"${r.text}"`).join(', ') || 'nothing'}; opened ${isOpen}; ear ${ear}`);
});

await run('held', async (s) => {
  const { page } = s;
  await holdOn(s);
  const w = await clearWord(page, said);
  const n = s.fake.speaks().length;
  await page.touchscreen.tap(w.x, w.y);
  await s.sleep(1500);
  const asked = s.fake.speaks().slice(n), isOpen = await opened(page), ear = await earState(page);
  await page.screenshot({ path: `${OUT}/ear-sky-phone-${tag}-held.png` });
  record('held on: a tap on a sky word is the sky’s own (R-a): it opens, nothing asked, the ear stays held', [...(asked.length ? [`${asked.length} requests`] : []), ...(isOpen === w.word ? [] : [`opened ${isOpen}, not ${w.word}`]), ...(ear === 'held' ? [] : [`the ear is ${ear}`])],
    `"${w.word}"; asked ${asked.length}; opened ${isOpen}; ear ${ear}`);
  await s.press(await earMark(page));
  await s.sleep(500);
  const off = await earState(page);
  record('held on: a tap on the ear turns it off', off === 'off' ? [] : [`the ear is ${off}`], `ear ${off}`);
});

await run('bars', async (s) => {
  const { page } = s;
  const clear = await page.evaluate(() => {
    const host = document.getElementById('bunki-sky');
    const at = (el) => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { id: el.id || el.className, text: (el.textContent || '').trim().slice(0, 8), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), mine: !!hit && (hit === el || el.contains(hit)), sky: !!hit && (hit === host || host.contains(hit)) }; };
    const mark = document.querySelector('#ginga-symbol + .ear-spot .ear-mark');
    const bar = document.getElementById('primary-tabs');
    const tabs = bar ? [...bar.querySelectorAll('button, a, [role="tab"]')].filter((el) => el.getClientRects().length && el.getBoundingClientRect().width > 20) : [];
    return { mark: mark ? at(mark) : null, bar: bar ? { top: Math.round(bar.getBoundingClientRect().top), shown: bar.getClientRects().length > 0 } : null, tabs: tabs.map(at), sky: (() => { const r = host.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; })(), foot: getComputedStyle(host.shadowRoot.querySelector('.sky')).getPropertyValue('--sky-foot') };
  });
  await page.screenshot({ path: `${OUT}/ear-sky-phone-${tag}-bars.png` });
  const problems = [];
  if (!clear.mark?.mine) problems.push(`the 耳 mark is covered: ${JSON.stringify(clear.mark)}`);
  if (!clear.bar?.shown || !clear.tabs.length) problems.push('no bottom bar');
  for (const t of clear.tabs) if (!t.mine) problems.push(`the tab ${t.id} "${t.text}" is covered${t.sky ? ' by the sky' : ''}`);
  record('the 耳 mark and every tab of the bottom bar stand clear of the sky', problems, `mark ${JSON.stringify(clear.mark)}; ${clear.tabs.length} tabs at y ${clear.bar?.top}; sky ${clear.sky.top}-${clear.sky.bottom}, its foot ${clear.foot.trim()}`);
  // the mark answers a tap
  await s.press(await earMark(page));
  await s.sleep(400);
  const armed = await earState(page);
  await s.press(await earMark(page));
  await s.sleep(400);
  const back = await earState(page);
  record('a tap on the 耳 mark over the sky arms it, and a second tap turns it off', armed === 'armed' && back === 'off' ? [] : [`armed → ${armed}, then ${back}`]);
  // a finger's tap on a tab still acts: the first screen gives way to that view, and the sky rests behind it
  const tabs = await page.evaluate(() => [...document.querySelectorAll('#primary-tabs .primary-tab')].filter((el) => el.getClientRects().length).map((el) => { const r = el.getBoundingClientRect(); return { id: el.id, text: el.textContent.trim().slice(0, 10), x: r.left + r.width / 2, y: r.top + r.height / 2 }; }));
  const results = [];
  for (const t of tabs) {
    await page.goto(new URL(`?${UI === 'ja' ? 'ui=ja&' : ''}sky=1`, page.url()).href, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__bunkiSkyApp?.state === 'mounted' && window.__SKY__?.W?.ready, null, { timeout: 45000 });
    await s.sleep(1500);
    await page.touchscreen.tap(t.x, t.y);
    await page.waitForFunction(() => document.body.dataset.view !== 'drift', null, { timeout: 8000 }).catch(() => {});
    await page.waitForFunction(() => window.__SKY__?.S?.paused === true, null, { timeout: 6000 }).catch(() => {});
    results.push({ ...t, view: await page.evaluate(() => document.body.dataset.view), rests: await page.evaluate(() => window.__SKY__?.S?.paused === true) });
  }
  await page.screenshot({ path: `${OUT}/ear-sky-phone-${tag}-tab.png` });
  record('a finger on each tab of the bottom bar acts over the sky: its view comes up and the sky rests behind it', [...(tabs.length >= 3 ? [] : [`${tabs.length} tabs`]), ...results.filter((r) => r.view === 'drift' || !r.rests).map((r) => `${r.id}: view ${r.view}, sky resting ${r.rests}`)],
    results.map((r) => `${r.id} → ${r.view}${r.rests ? '' : ' (sky not resting)'}`).join('; '));
});

const failed = rows.filter((r) => !r.pass).length;
console.log(`${tag}: ${rows.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
