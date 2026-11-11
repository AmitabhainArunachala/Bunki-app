/** The independent review of package L1 (an article plays through with the screen locked), 2026-11-12. Cases the
 * builder's verify-reader-pocket.mjs does not run. John: "when i hit play, the only thing that should stop that is
 * hitting the pause button itself."
 *
 * Muted and headless, loopback only, against a built site and the repository's silent stand-in voice server. Every
 * media element is muted and its volume 0 before it plays; Chromium also runs with --mute-audio. No real voice server,
 * no token or pairing code.
 *
 * A hidden page is the builder's STAND-IN for a locked screen: document.hidden and visibilityState are overridden and
 * visibilitychange is sent. With `freeze` the page's timers and animation frames hold their callbacks until it is shown
 * (the builder's model of a locked phone, and the lead's ruling L1-2: "a hidden page's timers are slowed or stopped").
 *
 *   node prototypes/corridor/tools/review-pocket/pocket-review.mjs --site <built site> [--engine webkit|chromium]
 *        [--width 390] [--port 19602] [--only recorded-refused,...]
 *
 *  recorded-refused  the one article with a recording of its own (jawiki:5294446), hidden, its next recording refused as
 *                    a locked phone may refuse a new start (NotAllowedError): as for a server clip (23dbf0185, L1-6 "an
 *                    article with a recording of its own behaves by the same rules"), the read is paused at that
 *                    sentence, the lock screen keeps it and its play takes it up there.
 *  recorded-hidden   the same article read hidden with timers frozen: it reaches its last recording; the bar says playing.
 *  busy-hidden       hidden with timers frozen, the voice server answers one sentence "busy" (503 voice-unavailable, which
 *                    the seam retries after 2 s on its own timer): the read goes on to its end (L1-2: nothing between two
 *                    sentences may depend on a timer while the page is hidden).
 *  yield-hide        a read yields to the word box's 音; the page is hidden: the word ends, and the read he started goes on.
 *  never-arrives     hidden with timers running, a clip the server never sends in time: the read ends with its line within
 *                    the client's 20 s, the silence stops and the lock screen is cleared (a true state).
 *  outside-play      (a concern, not in the default run) a pause from outside, then the element started again from
 *                    outside: the bar and the sound agree.
 *
 * The recorded cases need an engine that plays the recording's AAC (.m4a): where the first recording does not sound
 * before the page is hidden, the case reports itself not run (pass: null) instead of judging the reader.
 *
 * Exit code 0 when every case passes, 1 otherwise. One JSON line per case on stdout. */
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { startFakeVoiceServer } from '../fake-voice-server.mjs';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const SITE = arg('--site', '');
const ENGINE = arg('--engine', 'webkit');
const WIDTH = Number(arg('--width', '390'));
const PORT = Number(arg('--port', '19602'));
// outside-play is a concern I do not count as blocking (see its note below): run it by name
const ONLY = new Set(String(arg('--only', 'recorded-refused,recorded-hidden,busy-hidden,yield-hide,never-arrives')).split(',').filter(Boolean));
if (!SITE) { console.error('usage: pocket-review.mjs --site <built site>'); process.exit(2); }
const RECORDED = 'jawiki:5294446';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml', '.m4a': 'audio/mp4', '.wasm': 'application/wasm', '.gz': 'application/gzip' };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(SITE, path.endsWith('/') ? `${path}index.html` : path);
  try { if (statSync(file).isDirectory()) file = join(file, 'index.html'); statSync(file); } catch { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
const ORIGIN = `http://127.0.0.1:${PORT}`;
let clipSeconds = 0.4;
let holdNth = 0, holdFor = 0;
const fake = await startFakeVoiceServer({ origins: [ORIGIN], port: PORT + 1, missesPerMinute: 10000, capCents: 1_000_000, dayCents: 1_000_000,
  clipSeconds: () => clipSeconds, holdMs: (_text, n) => (n === holdNth ? holdFor : 0) });

const phone = WIDTH < 700;
const browser = await (ENGINE === 'webkit' ? webkit : chromium).launch({ headless: true, ...(ENGINE === 'chromium' ? { args: ['--mute-audio'] } : {}) });
const results = [];
const report = (name, problems, detail) => {
  results.push({ name, pass: !problems.length });
  console.log(JSON.stringify({ case: name, engine: ENGINE, width: WIDTH, pass: !problems.length, problems, detail }));
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function probe() {
  const P = (window.__review = { plays: [], asked: [], lit: [], frozen: false, held: [], errors: [], refusedNew: 0 });
  try {
    const proto = HTMLMediaElement.prototype, play = proto.play;
    proto.play = function () {
      this.muted = true; this.volume = 0;
      // a new start of an element other than the seam's (the recorded article's own clip) refused, as a locked phone may
      if (P.refuseNew && !this.hasAttribute('data-speak-audio')) {
        const name = P.refuseNew;
        P.refuseNew = null;
        P.refusedNew += 1;
        return Promise.reject(new DOMException('refused by the review', name));
      }
      P.plays.push({ at: performance.now(), speak: this.hasAttribute('data-speak-audio'), loop: !!this.loop, hidden: document.hidden, src: String(this.src).slice(-40) });
      if (!this.hasAttribute('data-speak-audio')) { P.recEls = (P.recEls || []).filter((x) => x !== this).concat(this).slice(-3); }
      return play.call(this);
    };
    if (window.speechSynthesis) { const sp = Object.getPrototypeOf(window.speechSynthesis); sp.speak = function () {}; sp.cancel = function () {}; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { const connect = AudioNode.prototype.connect; AudioNode.prototype.connect = function (dest, ...rest) { if (dest instanceof AudioDestinationNode) { const gain = this.context.createGain(); gain.gain.value = 0; connect.call(this, gain); return connect.call(gain, dest, ...rest); } return connect.call(this, dest, ...rest); }; }
  } catch (error) { P.errors.push(String(error)); }
  const send = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = new URL(String(input?.url || input), location.href);
      if (url.pathname === '/v1/audio/speak' && String(init?.method || input?.method || '').toUpperCase() === 'POST') {
        const body = JSON.parse(String(init?.body || '{}'));
        P.asked.push({ at: performance.now(), text: body.segments?.[0]?.text || '', key: body.voiceKey || '', lit: P.lit.length, hidden: document.hidden });
      }
    } catch { /* not a speak request */ }
    return send.apply(this, arguments);
  };
  const look = () => {
    const toks = document.querySelectorAll('#reader .tok[data-speaking]');
    if (!toks.length) { const last = P.lit[P.lit.length - 1]; if (last && !last.over) last.over = true; return; }
    const first = Number(toks[0].dataset.index), last = Number(toks[toks.length - 1].dataset.index);
    const before = P.lit[P.lit.length - 1];
    if (before && before.first === first && !before.over) return;
    P.lit.push({ first, last, at: performance.now(), bar: document.querySelector('.listen-row')?.dataset.voiceState || '', hidden: document.hidden });
  };
  new MutationObserver(look).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-speaking'] });
  const st = window.setTimeout, si = window.setInterval, raf = window.requestAnimationFrame, ct = window.clearTimeout, caf = window.cancelAnimationFrame;
  const live = new Map();
  window.setTimeout = function (fn, ms, ...args) {
    if (typeof fn !== 'function') return st.call(window, fn, ms, ...args);
    const entry = { fn, args, done: false };
    const id = st.call(window, () => { if (entry.done) return; if (P.frozen) { P.held.push(entry); return; } entry.done = true; live.delete(id); fn.apply(window, args); }, ms);
    live.set(id, entry);
    return id;
  };
  window.clearTimeout = function (id) { const entry = live.get(id); if (entry) { entry.done = true; live.delete(id); } return ct.call(window, id); };
  window.setInterval = function (fn, ms, ...args) { if (typeof fn !== 'function') return si.call(window, fn, ms, ...args); return si.call(window, () => { if (!P.frozen) fn.apply(window, args); }, ms); };
  window.requestAnimationFrame = function (fn) {
    const entry = { fn, raf: true, done: false };
    const id = raf.call(window, (t) => { if (entry.done) return; if (P.frozen) { P.held.push(entry); return; } entry.done = true; live.delete(`f${id}`); fn(t); });
    live.set(`f${id}`, entry);
    return id;
  };
  window.cancelAnimationFrame = function (id) { const entry = live.get(`f${id}`); if (entry) { entry.done = true; live.delete(`f${id}`); } return caf.call(window, id); };
  P.setHidden = (hidden, freeze = true) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
    if (hidden) P.frozen = !!freeze;
    else {
      P.frozen = false;
      for (const entry of P.held.splice(0)) if (!entry.done) { entry.done = true; try { if (entry.raf) entry.fn(performance.now()); else entry.fn.apply(window, entry.args); } catch (error) { P.errors.push(String(error)); } }
    }
    document.dispatchEvent(new Event('visibilitychange'));
  };
  const M = (P.media = { metadata: [], states: [], handlers: {}, current: null, state: 'none' });
  const session = {
    set metadata(m) { M.current = m; M.metadata.push(m ? { title: m.title, artist: m.artist } : null); },
    get metadata() { return M.current; },
    set playbackState(v) { M.state = v; M.states.push(v); },
    get playbackState() { return M.state; },
    setActionHandler(action, fn) { M.handlers[action] = fn; },
    setPositionState() {},
  };
  Object.defineProperty(Navigator.prototype, 'mediaSession', { configurable: true, get: () => session });
  window.MediaMetadata = class { constructor(init = {}) { Object.assign(this, init); } };
}

async function freshPage() {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: phone ? 844 : 1117 }, deviceScaleFactor: phone ? 2 : 1, hasTouch: phone, isMobile: phone,
    locale: 'en-US', timezoneId: 'Asia/Tokyo', serviceWorkers: 'block' });
  await context.addInitScript(probe);
  const offMachine = [];
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (['http:', 'https:'].includes(u.protocol) && !['127.0.0.1', 'localhost'].includes(u.hostname)) { offMachine.push(u.hostname); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 200)));
  const press = (target) => (typeof target === 'string' ? page.locator(target).first() : target)[phone ? 'tap' : 'click']();
  const ready = async () => {
    await page.goto(`${ORIGIN}/?ui=bi`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 45000 });
    const ok = page.locator('button', { hasText: /^(OK|はい|閉じる|わかった)$/ }).first();
    if (await ok.isVisible().catch(() => false)) { await ok.click().catch(() => {}); await wait(300); }
  };
  await ready();
  await press('#home-review').catch(() => {});
  await page.locator('#tab-me').waitFor();
  await press('#tab-me'); await wait(1000);
  await page.locator('#me-settings').scrollIntoViewIfNeeded(); await press('#me-settings'); await wait(800);
  await page.locator('#voice-pair-learner').scrollIntoViewIfNeeded();
  await page.locator('#voice-pair-learner').fill(`Bunki voice code: ${fake.issue({ learner: 'test-learner' })} (10 minutes) · learner: test-learner · server: ${fake.origin}`);
  await press('#voice-pair-submit');
  await page.waitForFunction(() => document.getElementById('settings-voice-server')?.dataset.paired === 'true', null, { timeout: 15000 });
  await page.evaluate(async () => { const m = await import('/corridor.js'); m.setWordPref(m.WORD_VOICE_KEY, 'wordVoice', m.WORD_VOICE, 'off'); });
  return { context, page, press, ready, errors, offMachine, close: () => context.close().catch(() => {}) };
}

/** An article from the shelf (the first, or `id`), its first-open word box put away; with `start` the read started. */
async function openArticle(s, { id = null, start = true } = {}) {
  const { page, press } = s;
  await s.ready();
  await press('#ginga-symbol'); await press('.bubble-shelf');
  await page.locator('.shelf-open').first().waitFor();
  const door = id ? page.locator(`[data-passage="${id}"]:not([data-recommendation]) .shelf-open`).first() : page.locator('.shelf-open').first();
  await door.scrollIntoViewIfNeeded();
  await press(door);
  await page.locator('.reader .tok.content').first().waitFor();
  await wait(1500);
  for (let i = 0; i < 3 && (await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await page.keyboard.press('Escape'); await wait(500); }
  if (!start) return;
  if (!(await page.locator('#listen-toggle').isVisible().catch(() => false))) await press('#listen-open');
  await page.locator('#listen-toggle').waitFor();
  await press('#listen-toggle');
  await until(s, (v) => v.lit >= 1, 20000);
}

const look = (page) => page.evaluate(() => {
  const P = window.__review;
  const toks = [...document.querySelectorAll('#reader .tok[data-speaking]')];
  const a = document.querySelector('audio[data-speak-audio]');
  const row = document.querySelector('.listen-row');
  const others = [...document.querySelectorAll('audio')].filter((x) => !x.hasAttribute('data-speak-audio'));
  return {
    first: toks.length ? Number(toks[0].dataset.index) : -1, bar: row?.dataset.voiceState || '', silent: row?.dataset.voiceSilent || '',
    note: document.getElementById('listen-note')?.textContent?.trim() || '',
    audio: a ? { paused: a.paused, ended: a.ended, loop: a.loop, t: Math.round(a.currentTime * 100) / 100 } : null,
    lit: P.lit.length, litFirst: P.lit.at(-1)?.first ?? -1, asked: P.asked.length, plays: P.plays.length, hidden: document.hidden,
    media: { state: P.media.state, title: P.media.current?.title ?? null },
    mini: !!document.querySelector('#mini-voice.is-speaking'), others: others.length,
  };
});
async function until(s, test, ms = 15000) {
  const start = Date.now();
  let view = await look(s.page);
  while (!test(view) && Date.now() - start < ms) { await wait(100); view = await look(s.page); }
  return view;
}
const hide = (s, hidden, freeze = true) => s.page.evaluate(([hidden, freeze]) => window.__review.setHidden(hidden, freeze), [hidden, freeze]);
const callMedia = (s, action) => s.page.evaluate((action) => window.__review.media.handlers[action]?.(), action);
const recOf = (page) => page.evaluate(() => ({ lit: window.__review.lit, asked: window.__review.asked, plays: window.__review.plays, held: window.__review.held.length, errors: window.__review.errors }));
const lastToken = (page) => page.evaluate(() => {
  const toks = [...document.querySelectorAll('#reader .tok[data-index]')].filter((t) => t.dataset.readerAnnotation !== 'true' && t.textContent.trim());
  return toks.length ? Number(toks[toks.length - 1].dataset.index) : -1;
});
const title = (page) => page.evaluate(() => document.querySelector('h1.view-title')?.textContent?.trim() || '');
/** Whether the recorded article's own element is sounding (its time has moved), within `ms`. */
async function recordingSounds(s, ms = 8000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await s.page.evaluate(() => [...document.querySelectorAll('audio')].concat(window.__review.recEls || []).some((a) => !a.hasAttribute('data-speak-audio') && !a.paused && a.currentTime > 0.1))) return true;
    await wait(150);
  }
  return false;
}
const notRun = (name, why) => { console.log(JSON.stringify({ case: name, engine: ENGINE, width: WIDTH, pass: null, problems: [], detail: `not run: ${why}` })); };

const CASES = {
  async 'recorded-refused'() {
    const s = await freshPage();
    const problems = [];
    let detail = '';
    try {
      await openArticle(s, { id: RECORDED });
      const name = await title(s.page);
      if (!(await recordingSounds(s))) { notRun('recorded-refused', `this engine does not sound the first recording (bar: ${JSON.stringify(await look(s.page))})`); await s.close(); return; }
      let v = await until(s, (x) => x.lit >= 1 && x.bar === 'playing', 15000);
      if (!/Sakura/u.test(await s.page.locator('.listen-row').innerText())) problems.push('the bar does not name the recording (the case is not on the recorded article)');
      await hide(s, true);
      await s.page.evaluate(() => { window.__review.refuseNew = 'NotAllowedError'; });
      v = await until(s, (x) => x.bar === 'paused' || x.bar === 'idle' || x.litFirst !== v.litFirst, 60000);
      // the next recording asked to start and was refused
      v = await until(s, (x) => x.bar === 'paused' || x.bar === 'idle', 60000);
      const refused = await s.page.evaluate(() => window.__review.refusedNew);
      if (!refused) problems.push('no recording was refused (the case did not reach its point)');
      if (v.bar !== 'paused' || v.media.state !== 'paused' || v.media.title !== name) problems.push(`hidden, a recording the browser would not let start: the bar says ${v.bar}${v.silent ? ` (${v.silent}: "${v.note}")` : ''}, the lock screen ${JSON.stringify(v.media)}; a server clip refused the same way is a pause (23dbf0185), and L1-6 says a recorded article behaves by the same rules`);
      const at = v.litFirst;
      await callMedia(s, 'play');
      const after = await until(s, (x) => x.bar === 'playing', 4000);
      if (after.bar !== 'playing') problems.push(`the lock screen's play after the refusal: bar ${after.bar}, lock screen ${JSON.stringify(after.media)}`);
      await hide(s, false);
      detail = `refused ${refused}; after the refusal: bar ${v.bar} (${v.silent || 'no reason'}), note "${v.note}", lock screen ${JSON.stringify(v.media)}, lit word ${at}; the lock screen's play then: bar ${after.bar}`;
    } catch (error) { problems.push(`the case broke: ${String(error.message).split('\n')[0].slice(0, 200)}`); }
    if (s.errors.length) problems.push(`page errors: ${s.errors.join(' | ')}`);
    if (s.offMachine.length) problems.push(`tried to leave this machine: ${s.offMachine.join(', ')}`);
    report('recorded-refused', problems, detail);
    await s.close();
  },

  async 'recorded-hidden'() {
    const s = await freshPage();
    const problems = [];
    let detail = '';
    try {
      await openArticle(s, { id: RECORDED });
      if (!(await recordingSounds(s))) { notRun('recorded-hidden', 'this engine does not sound the first recording'); await s.close(); return; }
      await hide(s, true);
      const end = await until(s, (x) => x.bar === 'idle' && x.first < 0, 240000);
      await hide(s, false);
      const rec = await recOf(s.page);
      const hiddenLit = rec.lit.filter((l) => l.hidden);
      if (end.bar !== 'idle') problems.push(`hidden, the recorded read did not reach its end: bar ${end.bar}, ${rec.lit.length} sentence(s) lit`);
      if (rec.lit.length < 6) problems.push(`only ${rec.lit.length} of the 6 recordings were lit`);
      const wrong = hiddenLit.filter((l) => l.bar !== 'playing');
      if (wrong.length) problems.push(`the bar said ${[...new Set(wrong.map((l) => l.bar))].join('/')} at ${wrong.length} recording(s) lit while hidden`);
      if (end.media.title !== null) problems.push(`at the end the lock screen still shows ${JSON.stringify(end.media)}`);
      if (end.silent) problems.push(`at the end the bar names a reason: ${end.silent} "${end.note}"`);
      detail = `${rec.lit.length} lit (${hiddenLit.length} while hidden), ${rec.asked.length} speak requests, end bar ${end.bar}`;
    } catch (error) { problems.push(`the case broke: ${String(error.message).split('\n')[0].slice(0, 200)}`); }
    if (s.errors.length) problems.push(`page errors: ${s.errors.join(' | ')}`);
    report('recorded-hidden', problems, detail);
    await s.close();
  },

  async 'busy-hidden'() {
    clipSeconds = 0.4;
    const s = await freshPage();
    const problems = [];
    let detail = '';
    try {
      await openArticle(s);
      const last = await lastToken(s.page);
      await until(s, (x) => x.lit >= 2, 15000);
      await hide(s, true);
      const before = (await look(s.page)).lit;
      // the next sentence asked of the server is answered "busy" once; the seam asks again after 2 s
      fake.failNext({ status: 503, error: 'voice-unavailable' });
      const end = await until(s, (x) => (x.bar === 'idle' && x.first < 0) || x.lit >= before + 40, 30000);
      const stuck = await look(s.page);
      const rec = await recOf(s.page);
      if (!(end.bar === 'idle' && end.first < 0) && !rec.lit.some((l) => l.last >= last)) {
        const waitsSince = await s.page.evaluate(() => { const l = window.__review.lit.at(-1); return l ? Math.round((performance.now() - l.at) / 1000) : -1; });
        problems.push(`hidden, one "busy" answer stopped the read for good: after 30 s it is at word ${stuck.litFirst} (${rec.lit.length} lit, the last ${waitsSince} s ago), the bar says ${stuck.bar}, the lock screen ${stuck.media.state}, the element ${JSON.stringify(stuck.audio)}; ${rec.held} timer callback(s) held, among them the seam's 2 s retry`);
      }
      await hide(s, false);
      const shown = await until(s, (x) => x.lit > stuck.lit || x.bar === 'idle', 8000);
      detail = `busy answers sent ${fake.speaks().filter((r) => r.status === 503).length || 'see log'}; hidden 30 s: bar ${stuck.bar}, lit ${stuck.lit}, audio ${JSON.stringify(stuck.audio)}; shown again: lit ${shown.lit}, bar ${shown.bar}`;
    } catch (error) { problems.push(`the case broke: ${String(error.message).split('\n')[0].slice(0, 200)}`); }
    if (s.errors.length) problems.push(`page errors: ${s.errors.join(' | ')}`);
    report('busy-hidden', problems, detail);
    await s.close();
  },

  async 'yield-hide'() {
    clipSeconds = 1.2;
    const s = await freshPage();
    const { page, press } = s;
    const problems = [];
    let detail = '';
    try {
      await openArticle(s);
      const name = await title(page);
      await until(s, (x) => x.lit >= 2, 15000);
      const nth = await page.evaluate(() => [...document.querySelectorAll('.reader .tok.content')].findIndex((t) => /^\p{Script=Han}{2,}$/u.test(t.textContent.trim())));
      const tok = page.locator('.reader .tok.content').nth(Math.max(0, nth));
      await tok.scrollIntoViewIfNeeded();
      for (let i = 0; i < 4 && !(await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await press(tok); await wait(450); }
      await page.locator('#mini-voice').waitFor();
      await press('#mini-voice');
      const yielded = await until(s, (x) => x.mini, 6000);
      if (!yielded.mini) problems.push('the word box\'s 音 never spoke (the case did not reach its point)');
      const litBefore = (await look(page)).lit;
      await hide(s, true);
      const went = await until(s, (x) => x.lit >= litBefore + 3 && !x.mini, 20000);
      if (went.mini) problems.push('hidden, the word box\'s 音 did not end');
      if (went.lit < litBefore + 3) problems.push(`hidden, the read that had given way to the word did not go on: ${went.lit - litBefore} sentence(s) lit after the hide, bar ${went.bar}, lock screen ${JSON.stringify(went.media)}`);
      if (went.bar !== 'playing' && went.bar !== 'loading') problems.push(`hidden, the bar says ${went.bar}`);
      if (went.media.title !== name || went.media.state !== 'playing') problems.push(`hidden, the lock screen shows ${JSON.stringify(went.media)} (the article is "${name}")`);
      await hide(s, false);
      await wait(800);
      const shown = await look(page);
      if (shown.first < 0 || shown.first !== shown.litFirst) problems.push(`shown again, the lit sentence (word ${shown.first}) is not the one being read (word ${shown.litFirst})`);
      detail = `yielded (音 speaking ${yielded.mini}); hidden: ${went.lit - litBefore} more sentence(s) lit, bar ${went.bar}, lock screen ${JSON.stringify(went.media)}; shown: word ${shown.first}, bar ${shown.bar}`;
    } catch (error) { problems.push(`the case broke: ${String(error.message).split('\n')[0].slice(0, 200)}`); }
    if (s.errors.length) problems.push(`page errors: ${s.errors.join(' | ')}`);
    report('yield-hide', problems, detail);
    await s.close();
  },

  async 'never-arrives'() {
    clipSeconds = 0.4;
    const s = await freshPage();
    const problems = [];
    let detail = '';
    try {
      const from = fake.speaks().length;
      holdNth = from + 5; holdFor = 45000;
      await openArticle(s);
      await hide(s, true, false);
      const waitStart = await until(s, (x) => x.bar === 'loading' && x.asked >= 5, 20000);
      const t0 = Date.now();
      const end = await until(s, (x) => x.bar !== 'loading', 32000);
      const secs = Math.round((Date.now() - t0) / 1000);
      await wait(500);
      const after = await look(s.page);
      if (after.bar === 'loading' || after.bar === 'playing') problems.push(`hidden (timers running), a clip that never comes: after ${secs} s the bar still says ${after.bar}`);
      if (after.audio && !after.audio.paused) problems.push(`the read is over and the element still plays (silence loop ${after.audio.loop})`);
      if (after.bar === 'idle' && !after.silent) problems.push('the read ended with no line');
      if (after.bar === 'idle' && after.media.title !== null) problems.push(`the read ended and the lock screen still shows ${JSON.stringify(after.media)}`);
      await hide(s, false);
      detail = `waiting from word ${waitStart.litFirst}: ${secs} s until bar ${end.bar}; then bar ${after.bar} (${after.silent}: "${after.note}"), audio ${JSON.stringify(after.audio)}, lock screen ${JSON.stringify(after.media)}`;
    } catch (error) { problems.push(`the case broke: ${String(error.message).split('\n')[0].slice(0, 200)}`); }
    holdNth = 0; holdFor = 0;
    if (s.errors.length) problems.push(`page errors: ${s.errors.join(' | ')}`);
    report('never-arrives', problems, detail);
    await s.close();
  },

  // (a characterisation, not in the default run) hidden with timers held, the network gone for 20 s and back: what
  // ends the read, whether the silence stops, and what the bar says when the page is shown again
  async 'network-gone'() {
    clipSeconds = 0.4;
    const s = await freshPage();
    const problems = [];
    let detail = '';
    try {
      await openArticle(s);
      await until(s, (x) => x.lit >= 2, 15000);
      await hide(s, true);
      await s.context.setOffline(true);
      const t0 = Date.now();
      const gone = await until(s, (x) => x.bar !== 'playing' && x.bar !== 'loading', 20000);
      const secs = Math.round((Date.now() - t0) / 1000);
      await wait(Math.max(0, 20000 - (Date.now() - t0)));
      const during = await look(s.page);
      await s.context.setOffline(false);
      await wait(1000);
      await hide(s, false);
      await wait(1500);
      const shown = await look(s.page);
      if (during.audio && !during.audio.paused) problems.push(`offline, the read is over (bar ${during.bar}) and the element still plays (loop ${during.audio.loop})`);
      if (shown.bar === 'idle' && !shown.silent) problems.push(`back online and shown, the read has ended and the bar gives no reason ("${shown.note}")`);
      detail = `offline: the bar left playing after ${secs} s: ${gone.bar} (${gone.silent}: "${gone.note}"), lit ${gone.lit}; at 20 s: bar ${during.bar}, audio ${JSON.stringify(during.audio)}, lock screen ${JSON.stringify(during.media)}; online and shown: bar ${shown.bar} (${shown.silent || 'no reason'}: "${shown.note}")`;
    } catch (error) { problems.push(`the case broke: ${String(error.message).split('\n')[0].slice(0, 200)}`); }
    if (s.errors.length) problems.push(`page errors: ${s.errors.join(' | ')}`);
    report('network-gone', problems, detail);
    await s.close();
  },

  async 'outside-play'() {
    clipSeconds = 3;
    const s = await freshPage();
    const problems = [];
    let detail = '';
    try {
      await openArticle(s);
      await until(s, (x) => x.lit >= 2, 15000);
      await wait(600);
      await s.page.evaluate(() => document.querySelector('audio[data-speak-audio]').pause());
      let v = await until(s, (x) => x.bar === 'paused', 2000);
      // the system starts the element again (an interruption that ends)
      await s.page.evaluate(() => document.querySelector('audio[data-speak-audio]').play());
      await wait(800);
      v = await look(s.page);
      const sounding = v.audio && !v.audio.paused;
      const barPlays = v.bar === 'playing';
      if (sounding !== barPlays) problems.push(`started again from outside: the element is ${sounding ? 'playing' : 'paused'} and the bar says ${v.bar}, the lock screen ${v.media.state}`);
      detail = `after the outside play: audio ${JSON.stringify(v.audio)}, bar ${v.bar}, lock screen ${v.media.state}`;
    } catch (error) { problems.push(`the case broke: ${String(error.message).split('\n')[0].slice(0, 200)}`); }
    if (s.errors.length) problems.push(`page errors: ${s.errors.join(' | ')}`);
    report('outside-play', problems, detail);
    await s.close();
  },
};

for (const [name, run] of Object.entries(CASES)) if (ONLY.has(name)) await run();
await browser.close();
await fake.close();
await new Promise((resolve) => server.close(resolve));
const failed = results.filter((r) => !r.pass).length;
console.log(`${results.length - failed} of ${results.length} pass (${ENGINE}-${WIDTH})`);
process.exit(failed ? 1 : 0);
