/** The re-check of package L1's fix round 1 (head b61fa7ce4, 2026-11-12): cases the round's own checks do not run.
 * John: "when i hit play, the only thing that should stop that is hitting the pause button itself." The round's rulings:
 * a read that ended on a sentence it could not get is taken up there, and the lock screen keeps the article with a play
 * button for as long as the bar offers one; a start from outside while his read is paused is paused again at once (L1-6:
 * an article with a recording of its own behaves by the same rules).
 *
 * Muted and headless, loopback only, against a built site and the repository's silent stand-in voice server. Every
 * media element is muted and its volume 0 before it plays; Chromium also runs with --mute-audio. No real voice server,
 * no token or pairing code. A hidden page is the builder's STAND-IN for a locked screen (document.hidden overridden,
 * visibilitychange sent; with `freeze` its timers and frames held until shown).
 *
 *   node prototypes/corridor/tools/review-pocket/fx1-review.mjs --site <built site> [--engine webkit|chromium]
 *        [--width 390] [--port 19602] [--only lock-retry,...]
 *
 *  lock-retry        hidden (timers running), a clip the server never sends in time: the read ends with its line and the
 *                    lock screen keeps the article, paused. He presses the lock screen's play at once: it takes the read up
 *                    at that sentence, or, if it cannot get it yet, the lock screen still keeps the article, paused, with
 *                    its play (the bar still offers one).
 *  recorded-outside  the recorded article (Chromium; this WebKit does not sound its .m4a): its recording paused from
 *                    outside (the read pauses), then that element started again from outside (an interruption that ends):
 *                    it is paused again at once, as the speech element is; the bar and the lock screen stay paused.
 *  busy-twice        hidden, timers held, the server answers one sentence "busy" twice: that sentence is asked twice and
 *                    no more, the read ends with its line, the lock screen keeps it paused, and its play (hidden) takes it
 *                    up at that sentence and goes on.
 *
 * The recorded case needs an engine that sounds the recording's AAC (.m4a): otherwise it reports itself not run.
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
const ONLY = new Set(String(arg('--only', 'lock-retry,recorded-outside,busy-twice')).split(',').filter(Boolean));
if (!SITE) { console.error('usage: fx1-review.mjs --site <built site>'); process.exit(2); }
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
  async 'lock-retry'() {
    clipSeconds = 0.4;
    const s = await freshPage();
    const problems = [];
    let detail = '';
    try {
      const from = fake.speaks().length;
      holdNth = from + 5; holdFor = 45000;
      await openArticle(s);
      const name = await title(s.page);
      await hide(s, true, false);
      const ended = await until(s, (x) => x.bar === 'idle', 32000);
      if (ended.bar !== 'idle' || ended.media.state !== 'paused' || ended.media.title !== name) problems.push(`the case did not reach its point: after the deadline bar ${ended.bar} (${ended.silent}), lock screen ${JSON.stringify(ended.media)}`);
      const asked = ended.asked;
      // at once, from the lock screen, still hidden
      await callMedia(s, 'play');
      await wait(3000);
      const v = await look(s.page);
      const sounding = (v.bar === 'playing' || v.bar === 'loading') && v.audio && !v.audio.paused;
      const kept = v.media.state === 'paused' && v.media.title === name;
      if (!sounding && !kept) problems.push(`the lock screen's play right after the read ended on a sentence it could not get: the read did not go on (bar ${v.bar}${v.silent ? `, "${v.note}" (${v.silent})` : ''}) and the lock screen let the article go: ${JSON.stringify(v.media)}; the bar still offers play`);
      await hide(s, false);
      await wait(800);
      const shown = await look(s.page);
      detail = `ended at word ${ended.litFirst} with ${ended.silent} ("${ended.note}"), lock screen ${JSON.stringify(ended.media)}; the lock screen's play at once: bar ${v.bar} (${v.silent || 'no reason'}: "${v.note}"), audio ${JSON.stringify(v.audio)}, lock screen ${JSON.stringify(v.media)}, ${v.asked - asked} more asked; shown: bar ${shown.bar}, play offered ${await s.page.locator('#listen-toggle').isVisible().catch(() => false)}`;
    } catch (error) { problems.push(`the case broke: ${String(error.message).split('\n')[0].slice(0, 200)}`); }
    holdNth = 0; holdFor = 0;
    if (s.errors.length) problems.push(`page errors: ${s.errors.join(' | ')}`);
    report('lock-retry', problems, detail);
    await s.close();
  },

  async 'recorded-outside'() {
    const s = await freshPage();
    const problems = [];
    let detail = '';
    try {
      await openArticle(s, { id: RECORDED });
      const name = await title(s.page);
      if (!(await recordingSounds(s))) { notRun('recorded-outside', 'this engine does not sound the first recording'); await s.close(); return; }
      await wait(600);
      // a call comes in: the recording's own element is paused by nobody in this app
      await s.page.evaluate(() => window.__review.recEls.at(-1).pause());
      let v = await until(s, (x) => x.bar === 'paused', 3000);
      if (v.bar !== 'paused') problems.push(`the case did not reach its point: paused from outside, the bar says ${v.bar}`);
      const before = await s.page.evaluate(() => { const a = window.__review.recEls.at(-1); return { t: a.currentTime, paused: a.paused }; });
      // the call ends and the system starts that element again
      await s.page.evaluate(() => window.__review.recEls.at(-1).play());
      await wait(1200);
      const after = await s.page.evaluate(() => { const a = window.__review.recEls.at(-1); return { t: Math.round(a.currentTime * 100) / 100, paused: a.paused, ended: a.ended }; });
      v = await look(s.page);
      const moved = after.t - before.t;
      if (!after.paused || moved > 0.5) problems.push(`started again from outside while his read is paused: the recording plays on (${moved.toFixed(2)} s more, paused ${after.paused}) while the bar says ${v.bar} and the lock screen ${JSON.stringify(v.media)}; a server clip started the same way is paused again at once (852a05549)`);
      if (v.bar !== 'paused' || v.media.state !== 'paused' || v.media.title !== name) problems.push(`after the start from outside: bar ${v.bar}, lock screen ${JSON.stringify(v.media)}`);
      detail = `paused at ${before.t.toFixed(2)} s; 1.2 s after a start from outside: element ${JSON.stringify(after)}, bar ${v.bar}, lock screen ${JSON.stringify(v.media)}`;
    } catch (error) { problems.push(`the case broke: ${String(error.message).split('\n')[0].slice(0, 200)}`); }
    if (s.errors.length) problems.push(`page errors: ${s.errors.join(' | ')}`);
    report('recorded-outside', problems, detail);
    await s.close();
  },

  async 'busy-twice'() {
    clipSeconds = 0.4;
    const s = await freshPage();
    const problems = [];
    let detail = '';
    try {
      await openArticle(s);
      const last = await lastToken(s.page);
      const name = await title(s.page);
      await until(s, (x) => x.lit >= 2, 15000);
      await hide(s, true);
      const n0 = fake.speaks().length;
      fake.failNext({ status: 503, error: 'voice-unavailable' }, { status: 503, error: 'voice-unavailable' });
      const ended = await until(s, (x) => x.bar !== 'playing' && x.bar !== 'loading', 20000);
      const rows = fake.speaks().slice(n0);
      const busyText = rows.find((r) => r.status === 503)?.text;
      const askedBusy = rows.filter((r) => r.text === busyText).length;
      if (ended.bar !== 'idle' || ended.silent !== 'voice-unavailable') problems.push(`two busy answers: bar ${ended.bar} (${ended.silent || 'no reason'}: "${ended.note}")`);
      if (askedBusy > 2) problems.push(`the busy sentence was asked ${askedBusy} times before the read ended (one retry only)`);
      if (ended.media.state !== 'paused' || ended.media.title !== name) problems.push(`after two busy answers the lock screen shows ${JSON.stringify(ended.media)}`);
      await callMedia(s, 'play');
      const end = await until(s, (x) => x.bar === 'idle' && x.first < 0 && !x.silent, 30000);
      const rec = await recOf(s.page);
      const after = fake.speaks().slice(n0).filter((r) => r.text === busyText).length;
      if (!rec.lit.some((l) => l.last >= last)) problems.push(`hidden, the lock screen's play did not take the read on to its end: bar ${end.bar} (${end.silent || 'no reason'})`);
      if (after !== askedBusy + 1) problems.push(`the busy sentence was asked ${after - askedBusy} more time(s) after play (once expected)`);
      await hide(s, false);
      detail = `busy sentence "${String(busyText).slice(0, 14)}" asked ${askedBusy} times, then ${after - askedBusy} more on play; ended bar ${ended.bar} (${ended.silent}: "${ended.note}"), lock screen ${JSON.stringify(ended.media)}; after play: ${rec.lit.length} lit, end bar ${end.bar}`;
    } catch (error) { problems.push(`the case broke: ${String(error.message).split('\n')[0].slice(0, 200)}`); }
    if (s.errors.length) problems.push(`page errors: ${s.errors.join(' | ')}`);
    report('busy-twice', problems, detail);
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
