/** Package L1 of the speech lane (2026-11-12): an article read he started goes on when the page is hidden, the lock screen
 * shows it with play, pause, next and previous, a pause from outside is a pause, and the play bar tells the truth after.
 * John: "when i hit play, the only thing that should stop that is hitting the pause button itself."
 *
 * Muted and headless, loopback only, against a built site and the repository's silent stand-in voice server
 * (fake-voice-server.mjs). No sound, no real voice server, no token or pairing code.
 *
 * A hidden page here is a STAND-IN for a locked screen: document.hidden and visibilityState are overridden and
 * visibilitychange is sent. While it is hidden the page's timers are frozen (setTimeout, setInterval and animation
 * frames hold their callbacks until the page is shown), so a case fails if anything between two sentences still leans on
 * a timer. A headless browser cannot lock a screen or put a page to sleep: what a real iPhone does is not proved here.
 *
 *   node prototypes/corridor/tools/verify-reader-pocket.mjs --site <built site> [--engine webkit|chromium]
 *        [--width 390] [--lang en|ja] [--port 19592] [--only hidden-read,late-clip,...] [--shots <dir>]
 *   (--site a:b serves the first folder that holds a path: a negative control lays a changed file over a build)
 *
 *  hidden-read    a read started, the page hidden after its first sentence: it reaches the article's last sentence; each
 *                 sentence is asked once and never more than two ahead; the bar says playing at every sentence; shown
 *                 again mid-read, the lit sentence is the one being read, the page is at it and its bands are drawn; at
 *                 the end the bar says idle and nothing is lit.
 *  late-clip      the same with the fifth clip held 5 s by the stand-in: while the read waits for it the bar says
 *                 loading and the app's audio element is playing (silence in a loop); the read goes on to its end.
 *  media          the lock screen (navigator.mediaSession wrapped, so the case sees what the app sets and calls the
 *                 handlers it registered, hidden, as the lock screen would): metadata while a read exists; pause, play,
 *                 next and previous; the state follows the read; nothing resumes by itself; cleared at the end and when
 *                 he leaves the article.
 *  no-media       the interface absent: a read plays, pauses and resumes from the bar with no page error.
 *  outside-pause  the app's audio element paused by the case, shown and hidden: the reader pauses at that sentence and
 *                 the bar and the lock screen say so; nothing resumes in 3 s or on being shown, and nothing more is asked;
 *                 the bar's play takes it up at the same sentence and place.
 *  refused-play   hidden: the next clip refused as a locked phone may refuse a new start: the read is paused at it and the
 *                 lock screen's play takes it up there; a clip that cannot play for any other reason ends the read, and
 *                 the bar says "could not play", not that the voice server failed.
 *  hidden-others  hidden still ends a deck card's control, the word box's 音 and the ear's voice, as before; a card's
 *                 answer shown while hidden says nothing until the page is shown.
 *
 * Exit code 0 when every case passes, 1 otherwise. One JSON line per case on stdout. */
import { createReadStream, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { startFakeVoiceServer } from './fake-voice-server.mjs';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const SITE = arg('--site', process.env.KAIRO_SITE_DIR || '');
const ENGINE = arg('--engine', 'webkit');
const WIDTH = Number(arg('--width', '390'));
const LANG = arg('--lang', 'en');
const PORT = Number(arg('--port', '19592'));
const SHOTS = arg('--shots', '');
const ONLY = new Set(String(arg('--only', 'hidden-read,late-clip,media,no-media,outside-pause,refused-play,hidden-others')).split(',').filter(Boolean));
if (!SITE) { console.error('usage: verify-reader-pocket.mjs --site <built site>'); process.exit(2); }
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml', '.m4a': 'audio/mp4', '.wasm': 'application/wasm', '.gz': 'application/gzip' };
// `--site a:b`: the first folder that holds a path answers it (a negative control lays a changed file over a build)
const ROOTS = SITE.split(':').filter(Boolean);
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  for (const root of ROOTS) {
    let file = join(root, path.endsWith('/') ? `${path}index.html` : path);
    try { if (statSync(file).isDirectory()) file = join(file, 'index.html'); statSync(file); } catch { continue; }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    createReadStream(file).pipe(res);
    return;
  }
  res.writeHead(404); res.end('not found');
});
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
const ORIGIN = `http://127.0.0.1:${PORT}`;
// per case: how long each clip lasts, and which request's good answer the stand-in holds back
let clipSeconds = 0.4;
let holdNth = 0;
const fake = await startFakeVoiceServer({ origins: [ORIGIN], port: PORT + 1, missesPerMinute: 10000, capCents: 1_000_000, dayCents: 1_000_000,
  clipSeconds: () => clipSeconds, holdMs: (_text, n) => (n === holdNth ? 5000 : 0) });

const phone = WIDTH < 700;
const browser = await (ENGINE === 'webkit' ? webkit : chromium).launch({ headless: true, ...(ENGINE === 'chromium' ? { args: ['--mute-audio'] } : {}) });
const results = [];
const tag = `${ENGINE}-${WIDTH}-${LANG}`;
const report = (name, problems, detail) => {
  results.push({ name, pass: !problems.length });
  console.log(JSON.stringify({ case: name, engine: ENGINE, width: WIDTH, lang: LANG, pass: !problems.length, problems, detail }));
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)); // the case's own clock, never the page's

/** Runs in the page before any of its scripts: silence, the speak requests and the lit sentences as the page makes them,
 * the stand-in for a locked screen (hidden, its timers frozen), and the lock screen's interface wrapped or taken away. */
function probe({ media }) {
  const P = (window.__pocket = { plays: [], asked: [], lit: [], cleared: 0, frozen: false, held: [], heldCount: 0, errors: [] });
  try {
    const proto = HTMLMediaElement.prototype, play = proto.play;
    proto.play = function () {
      this.muted = true; this.volume = 0;
      // the case can make the browser refuse the next clip of the app's element (P.refuse names the error)
      if (P.refuse && this.hasAttribute('data-speak-audio') && !this.loop) {
        const name = P.refuse;
        P.refuse = null;
        P.refused = (P.refused || 0) + 1;
        return Promise.reject(new DOMException('refused by the case', name));
      }
      P.plays.push({ at: performance.now(), speak: this.hasAttribute('data-speak-audio'), loop: !!this.loop, hidden: document.hidden });
      return play.call(this);
    };
    if (window.speechSynthesis) { const sp = Object.getPrototypeOf(window.speechSynthesis); sp.speak = function () { P.device = (P.device || 0) + 1; }; sp.cancel = function () {}; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { const connect = AudioNode.prototype.connect; AudioNode.prototype.connect = function (dest, ...rest) { if (dest instanceof AudioDestinationNode) { const gain = this.context.createGain(); gain.gain.value = 0; connect.call(this, gain); return connect.call(gain, dest, ...rest); } return connect.call(this, dest, ...rest); }; }
  } catch (error) { P.errors.push(String(error)); }
  // every speak request as the page sends it, with how many sentences had been lit by then
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
  // each sentence the reader lights, once, in order, with the bar's state at that moment
  const look = () => {
    const toks = document.querySelectorAll('#reader .tok[data-speaking]');
    if (!toks.length) { if (P.lit.length && !P.lit[P.lit.length - 1].over) { P.lit[P.lit.length - 1].over = true; P.cleared += 1; } return; }
    const first = Number(toks[0].dataset.index), last = Number(toks[toks.length - 1].dataset.index);
    const before = P.lit[P.lit.length - 1];
    if (before && before.first === first && !before.over) return;
    P.lit.push({ first, last, at: performance.now(), bar: document.querySelector('.listen-row')?.dataset.voiceState || '', hidden: document.hidden, asked: P.asked.length });
  };
  new MutationObserver(look).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-speaking'] });
  // the stand-in for a locked screen: while hidden, the page's timers hold their callbacks until it is shown
  const st = window.setTimeout, ct = window.clearTimeout, si = window.setInterval, raf = window.requestAnimationFrame, caf = window.cancelAnimationFrame;
  const live = new Map();
  const hold = (entry) => { P.held.push(entry); P.heldCount += 1; };
  window.setTimeout = function (fn, ms, ...args) {
    if (typeof fn !== 'function') return st.call(window, fn, ms, ...args);
    const entry = { fn, args, done: false };
    const id = st.call(window, () => { if (entry.done) return; if (P.frozen) { hold(entry); return; } entry.done = true; live.delete(id); fn.apply(window, args); }, ms);
    live.set(id, entry);
    return id;
  };
  window.clearTimeout = function (id) { const entry = live.get(id); if (entry) { entry.done = true; live.delete(id); } return ct.call(window, id); };
  window.setInterval = function (fn, ms, ...args) {
    if (typeof fn !== 'function') return si.call(window, fn, ms, ...args);
    return si.call(window, () => { if (!P.frozen) fn.apply(window, args); }, ms);
  };
  window.requestAnimationFrame = function (fn) {
    const entry = { fn, raf: true, done: false };
    const id = raf.call(window, (t) => { if (entry.done) return; if (P.frozen) { hold(entry); return; } entry.done = true; live.delete(`f${id}`); fn(t); });
    live.set(`f${id}`, entry);
    return id;
  };
  window.cancelAnimationFrame = function (id) { const entry = live.get(`f${id}`); if (entry) { entry.done = true; live.delete(`f${id}`); } return caf.call(window, id); };
  P.setHidden = (hidden) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
    if (hidden) P.frozen = true;
    else {
      P.frozen = false;
      for (const entry of P.held.splice(0)) if (!entry.done) { entry.done = true; try { if (entry.raf) entry.fn(performance.now()); else entry.fn.apply(window, entry.args); } catch (error) { P.errors.push(String(error)); } }
    }
    document.dispatchEvent(new Event('visibilitychange'));
  };
  // the lock screen's interface: wrapped (everything the app sets is kept, the handlers it registers can be called) or absent
  if (media === 'wrap') {
    const M = (P.media = { metadata: [], states: [], handlers: {}, current: null, state: 'none' });
    const session = {
      set metadata(m) { M.current = m; M.metadata.push(m ? { title: m.title, artist: m.artist, artwork: (m.artwork || []).map((a) => ({ src: String(a.src), sizes: a.sizes, type: a.type })) } : null); },
      get metadata() { return M.current; },
      set playbackState(v) { M.state = v; M.states.push(v); },
      get playbackState() { return M.state; },
      setActionHandler(action, fn) { M.handlers[action] = fn; },
      setPositionState() {},
    };
    Object.defineProperty(Navigator.prototype, 'mediaSession', { configurable: true, get: () => session });
    window.MediaMetadata = class { constructor(init = {}) { Object.assign(this, init); } };
  } else if (media === 'absent') {
    Object.defineProperty(Navigator.prototype, 'mediaSession', { configurable: true, get: () => undefined });
    try { delete window.MediaMetadata; } catch { /* a non-configurable global */ }
    window.MediaMetadata = undefined;
  }
}

/** A fresh, silent page, paired with the stand-in through the app's own Settings; 声 (said by itself) off. */
async function freshPage({ media = 'wrap' } = {}) {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: phone ? 844 : 1117 }, deviceScaleFactor: phone ? 2 : 1, hasTouch: phone, isMobile: phone,
    locale: LANG === 'ja' ? 'ja-JP' : 'en-US', timezoneId: 'Asia/Tokyo', serviceWorkers: 'block' });
  await context.addInitScript(probe, { media });
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
    await page.goto(`${ORIGIN}/?ui=${LANG === 'ja' ? 'ja' : 'bi'}`, { waitUntil: 'load' });
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
  const s = { context, page, press, ready, errors, offMachine };
  s.bySelf = (value) => page.evaluate(async (value) => { const m = await import('/corridor.js'); m.setWordPref(m.WORD_VOICE_KEY, 'wordVoice', m.WORD_VOICE, value); }, value);
  await s.bySelf('off');
  s.close = () => context.close().catch(() => {});
  return s;
}

/** The first article from the shelf, its first-open word box put away; with `start` the read started from the play bar. */
async function openArticle(s, { start = true } = {}) {
  const { page, press } = s;
  await s.ready();
  await press('#ginga-symbol'); await press('.bubble-shelf');
  await page.locator('.shelf-open').first().waitFor();
  await press(page.locator('.shelf-open').first());
  await page.locator('.reader .tok.content').first().waitFor();
  await wait(1500);
  for (let i = 0; i < 3 && (await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await page.keyboard.press('Escape'); await wait(500); }
  if (!start) return;
  if (!(await page.locator('#listen-toggle').isVisible().catch(() => false))) await press('#listen-open');
  await page.locator('#listen-toggle').waitFor();
  await press('#listen-toggle');
  await until(s, (v) => v.lit >= 1, 20000);
}

/** What the page shows and holds now. */
const look = (page) => page.evaluate(() => {
  const P = window.__pocket;
  const toks = [...document.querySelectorAll('#reader .tok[data-speaking]')];
  const a = document.querySelector('audio[data-speak-audio]');
  const r = toks[0]?.getBoundingClientRect();
  const row = document.querySelector('.listen-row');
  return {
    first: toks.length ? Number(toks[0].dataset.index) : -1, bar: row?.dataset.voiceState || '', silent: row?.dataset.voiceSilent || '',
    pressed: document.getElementById('listen-toggle')?.getAttribute('aria-pressed') || '', bands: document.querySelectorAll('.read-band').length,
    inView: r ? r.top >= 0 && r.bottom <= innerHeight : null, box: !!document.getElementById('mini')?.getClientRects().length,
    audio: a ? { paused: a.paused, ended: a.ended, loop: a.loop, t: Math.round(a.currentTime * 100) / 100 } : null,
    lit: P.lit.length, litFirst: P.lit.at(-1)?.first ?? -1, asked: P.asked.length, plays: P.plays.length, hidden: document.hidden,
    media: P.media ? { state: P.media.state, title: P.media.current?.title ?? null, handlers: Object.keys(P.media.handlers).filter((k) => typeof P.media.handlers[k] === 'function').sort() } : null,
  };
});
/** Wait, by the case's own clock, until `test(view)` holds; the last view either way. */
async function until(s, test, ms = 15000) {
  const start = Date.now();
  let view = await look(s.page);
  while (!test(view) && Date.now() - start < ms) { await wait(100); view = await look(s.page); }
  return view;
}
const hide = (s, hidden) => s.page.evaluate((hidden) => window.__pocket.setHidden(hidden), hidden);
const recordOf = (page) => page.evaluate(() => ({ lit: window.__pocket.lit, asked: window.__pocket.asked, plays: window.__pocket.plays, heldCount: window.__pocket.heldCount, errors: window.__pocket.errors, media: window.__pocket.media ? { metadata: window.__pocket.media.metadata, states: window.__pocket.media.states } : null }));
const lastToken = (page) => page.evaluate(() => {
  const toks = [...document.querySelectorAll('#reader .tok[data-index]')].filter((t) => t.dataset.readerAnnotation !== 'true' && t.textContent.trim());
  return toks.length ? Number(toks[toks.length - 1].dataset.index) : -1;
});
const articleTitle = (page) => page.evaluate(() => document.querySelector('h1.view-title')?.textContent?.trim() || '');
async function shot(page, name) {
  if (!SHOTS) return;
  await page.screenshot({ path: join(SHOTS, `${tag}-${name}.png`) }).catch(() => {});
}

/** The read's record judged: it reached the last sentence, each sentence asked once and never more than two ahead, the
 * bar said playing at every sentence lit while hidden. */
function judgeRead(rec, last, key) {
  const problems = [];
  const lit = rec.lit;
  if (!lit.some((l) => l.last >= last)) problems.push(`the read never reached the last sentence (word ${last}); the last lit was word ${lit.at(-1)?.first} after ${lit.length} sentence(s)`);
  for (let i = 1; i < lit.length; i += 1) if (lit[i].first <= lit[i - 1].first) { problems.push(`the sentences went back: word ${lit[i - 1].first} then ${lit[i].first}`); break; }
  const asked = rec.asked.filter((a) => a.key === key);
  const texts = asked.map((a) => a.text);
  const twice = texts.filter((t, i) => texts.indexOf(t) !== i);
  if (twice.length) problems.push(`asked more than once: ${twice.map((t) => `"${t.slice(0, 12)}"`).join(', ')}`);
  asked.forEach((a, i) => { if (a.lit < i + 1 - 3) problems.push(`request ${i + 1} ("${a.text.slice(0, 12)}") went out when only ${a.lit} sentence(s) had been lit: more than two ahead`); });
  const wrongBar = lit.filter((l) => l.hidden && l.bar !== 'playing');
  if (wrongBar.length) problems.push(`the bar said ${[...new Set(wrongBar.map((l) => l.bar || 'nothing'))].join('/')} at ${wrongBar.length} sentence(s) lit while hidden`);
  return { problems, asked: asked.length, lit: lit.length, hiddenLit: lit.filter((l) => l.hidden).length };
}

const CASES = {
  async 'hidden-read'() {
    clipSeconds = 0.4; holdNth = 0;
    const s = await freshPage();
    const problems = [];
    let detail = '';
    try {
      await openArticle(s);
      const last = await lastToken(s.page);
      const key = (await recordOf(s.page)).asked[0]?.key || '';
      await hide(s, true);
      // mid-read: shown again after a few sentences read while hidden
      const mid = await until(s, (v) => v.lit >= 6 || v.bar === 'idle', 30000);
      if (mid.lit < 6) problems.push(`hidden, the read did not go on: ${mid.lit} sentence(s) lit, the bar says ${mid.bar}, the audio ${JSON.stringify(mid.audio)}`);
      await hide(s, false);
      await wait(1200);
      const shown = await look(s.page);
      await shot(s.page, 'hidden-read-shown-again');
      if (shown.bar !== 'playing' && shown.bar !== 'loading') problems.push(`shown again mid-read, the bar says ${shown.bar || 'nothing'}`);
      if (shown.first < 0 || shown.first !== shown.litFirst) problems.push(`shown again, the lit sentence (word ${shown.first}) is not the one being read (word ${shown.litFirst})`);
      if (shown.first >= 0 && !shown.inView) problems.push('shown again, the page is not at the sentence being read');
      if (shown.first >= 0 && !shown.bands) problems.push('shown again, no band is drawn on the sentence being read');
      if (!shown.audio || shown.audio.paused) problems.push(`shown again, the audio is ${JSON.stringify(shown.audio)}`);
      // hidden again to the end
      await hide(s, true);
      const end = await until(s, (v) => v.bar === 'idle' && v.first < 0, 60000);
      await hide(s, false);
      await wait(600);
      const after = await look(s.page);
      const rec = await recordOf(s.page);
      const judged = judgeRead(rec, last, key);
      problems.push(...judged.problems);
      if (end.bar !== 'idle') problems.push(`the read did not end: the bar says ${end.bar}`);
      if (after.bar !== 'idle' || after.first >= 0 || after.silent) problems.push(`after the end the bar says ${after.bar}${after.silent ? ` (${after.silent})` : ''}, word ${after.first} lit`);
      if (after.media?.title !== null) problems.push(`after the end the lock screen still shows ${JSON.stringify(after.media)}`);
      detail = `${judged.lit} sentences lit (${judged.hiddenLit} while hidden), ${judged.asked} asked, last word ${last}; shown mid-read at word ${shown.first} (${shown.bar}); timer callbacks held while hidden: ${rec.heldCount}`;
    } catch (error) { problems.push(`the case broke: ${String(error.message).split('\n')[0].slice(0, 200)}`); }
    if (s.errors.length) problems.push(`page errors: ${s.errors.join(' | ')}`);
    if (s.offMachine.length) problems.push(`tried to leave this machine: ${s.offMachine.join(', ')}`);
    report('hidden-read', problems, detail);
    await s.close();
  },

  async 'late-clip'() {
    clipSeconds = 0.4; holdNth = 5;
    const s = await freshPage();
    const problems = [];
    let detail = '';
    try {
      const from = fake.speaks().length;
      holdNth = from + 5;
      await openArticle(s);
      const last = await lastToken(s.page);
      const key = (await recordOf(s.page)).asked[0]?.key || '';
      await hide(s, true);
      // while it waits for the held clip: what the bar says and what the element does
      const waits = [];
      const start = Date.now();
      let view = await look(s.page);
      while (!(view.bar === 'idle' && view.first < 0) && Date.now() - start < 60000) {
        if (view.bar === 'loading') waits.push(view);
        await wait(150);
        view = await look(s.page);
      }
      await hide(s, false);
      await wait(600);
      const after = await look(s.page);
      const rec = await recordOf(s.page);
      const judged = judgeRead(rec, last, key);
      problems.push(...judged.problems);
      const held = fake.speaks().find((r) => r.heldMs);
      if (!held) problems.push('the stand-in held no clip back (the case did not test a late clip)');
      if (waits.length < 5) problems.push(`the read was seen waiting only ${waits.length} time(s): the held clip did not make it wait while hidden`);
      const silentWaits = waits.filter((w) => !w.audio || w.audio.paused);
      if (waits.length && silentWaits.length > 2) problems.push(`while it waited the element was not playing at ${silentWaits.length} of ${waits.length} looks (nothing keeps the page sounding)`);
      if (after.bar !== 'idle' || after.first >= 0 || after.silent) problems.push(`after the end the bar says ${after.bar}${after.silent ? ` (${after.silent})` : ''}`);
      detail = `${judged.lit} sentences lit, ${judged.asked} asked; request ${held?.nth} ("${String(held?.text || '').slice(0, 12)}") held ${held?.heldMs} ms; waiting looks ${waits.length}, the element playing at ${waits.length - silentWaits.length} (loop ${waits.filter((w) => w.audio?.loop).length})`;
    } catch (error) { problems.push(`the case broke: ${String(error.message).split('\n')[0].slice(0, 200)}`); }
    holdNth = 0;
    if (s.errors.length) problems.push(`page errors: ${s.errors.join(' | ')}`);
    report('late-clip', problems, detail);
    await s.close();
  },

  async media() {
    clipSeconds = 1.2; holdNth = 0;
    const s = await freshPage({ media: 'wrap' });
    const problems = [];
    const steps = [];
    const call = (action) => s.page.evaluate((action) => window.__pocket.media.handlers[action]?.(), action);
    try {
      await openArticle(s);
      const title = await articleTitle(s.page);
      let v = await look(s.page);
      const meta = (await recordOf(s.page)).media.metadata.at(-1);
      if (!meta || meta.title !== title || meta.artist !== 'Bunki') problems.push(`metadata ${JSON.stringify(meta)}; the article's title is "${title}"`);
      if (!meta?.artwork?.some((a) => /\/icon-512\.png$/.test(a.src) && a.type === 'image/png')) problems.push(`no app icon as artwork: ${JSON.stringify(meta?.artwork)}`);
      if (v.media.state !== 'playing') problems.push(`while it plays the lock screen's state is ${v.media.state}`);
      if (v.media.handlers.join() !== 'nexttrack,pause,play,previoustrack') problems.push(`handlers ${v.media.handlers.join(',')}`);
      steps.push(`started at word ${v.first}`);
      await hide(s, true);
      // pause, as the lock screen's button
      const at = v.first;
      await call('pause');
      v = await until(s, (x) => x.bar === 'paused', 3000);
      if (v.bar !== 'paused' || v.media.state !== 'paused' || !v.audio?.paused || v.first !== at) problems.push(`pause: bar ${v.bar}, lock screen ${v.media.state}, audio ${JSON.stringify(v.audio)}, word ${v.first} (was ${at})`);
      const asked = v.asked;
      await wait(1500);
      v = await look(s.page);
      if (v.bar !== 'paused' || !v.audio?.paused) problems.push(`paused, it took itself up again: bar ${v.bar}, audio ${JSON.stringify(v.audio)}`);
      if (v.asked !== asked) problems.push(`paused, ${v.asked - asked} more sentence(s) were asked`);
      steps.push(`paused at word ${v.first}`);
      // play
      await call('play');
      v = await until(s, (x) => x.bar === 'playing' && !x.audio?.paused, 3000);
      if (v.bar !== 'playing' || v.media.state !== 'playing' || v.audio?.paused || v.first !== at) problems.push(`play: bar ${v.bar}, lock screen ${v.media.state}, audio ${JSON.stringify(v.audio)}, word ${v.first} (was ${at})`);
      steps.push(`played on at word ${v.first}`);
      // next and previous
      await call('nexttrack');
      v = await until(s, (x) => x.first > at && x.bar === 'playing', 4000);
      const next = v.first;
      if (!(next > at)) problems.push(`next: still at word ${v.first} (was ${at})`);
      await call('previoustrack');
      v = await until(s, (x) => x.first === at, 4000);
      if (v.first !== at || v.bar !== 'playing') problems.push(`previous: at word ${v.first}, bar ${v.bar} (expected word ${at})`);
      steps.push(`next to word ${next}, previous to word ${v.first}`);
      // next while paused: it moves, and stays paused
      await call('pause');
      await until(s, (x) => x.bar === 'paused', 3000);
      await call('nexttrack');
      await wait(800);
      v = await look(s.page);
      if (v.first !== next || v.bar !== 'paused' || !v.audio?.paused || v.media.state !== 'paused') problems.push(`next while paused: word ${v.first} (expected ${next}), bar ${v.bar}, audio ${JSON.stringify(v.audio)}, lock screen ${v.media.state}`);
      await call('play');
      v = await until(s, (x) => x.bar === 'playing' && !x.audio?.paused, 3000);
      if (v.first !== next || v.bar !== 'playing') problems.push(`play after next while paused: word ${v.first} (expected ${next}), bar ${v.bar}`);
      steps.push(`next while paused to word ${v.first}, played`);
      // the end clears it
      const end = await until(s, (x) => x.bar === 'idle' && x.first < 0, 90000);
      if (end.bar !== 'idle') problems.push(`the read did not reach its end: bar ${end.bar}`);
      if (end.media.title !== null || end.media.state !== 'none' || end.media.handlers.length) problems.push(`at the end the lock screen still has ${JSON.stringify(end.media)}`);
      steps.push('ended: cleared');
      await hide(s, false);
      await wait(500);
      // a new read, then he leaves the article: cleared
      await s.press('#listen-toggle');
      v = await until(s, (x) => x.media?.title === title && x.bar === 'playing', 8000);
      if (v.media?.title !== title) problems.push(`a second read did not show itself: ${JSON.stringify(v.media)}`);
      await s.press(s.page.locator('#app > .chrome [data-bar-back], #app > .chrome button.back').first());
      v = await until(s, (x) => x.media?.title === null, 4000);
      if (v.media.title !== null || v.media.state !== 'none' || v.media.handlers.length) problems.push(`after leaving the article the lock screen still has ${JSON.stringify(v.media)}`);
      steps.push('left the article: cleared');
    } catch (error) { problems.push(`the case broke: ${String(error.message).split('\n')[0].slice(0, 200)}`); }
    if (s.errors.length) problems.push(`page errors: ${s.errors.join(' | ')}`);
    report('media', problems, steps.join('; '));
    await s.close();
  },

  async 'no-media'() {
    clipSeconds = 1.2; holdNth = 0;
    const s = await freshPage({ media: 'absent' });
    const problems = [];
    let detail = '';
    try {
      const absent = await s.page.evaluate(() => ({ session: navigator.mediaSession === undefined, meta: typeof window.MediaMetadata }));
      if (!absent.session) problems.push('the case could not take the interface away');
      await openArticle(s);
      const at = (await look(s.page)).first;
      await s.press('#listen-toggle');
      let v = await until(s, (x) => x.bar === 'paused', 3000);
      if (v.bar !== 'paused') problems.push(`the bar's pause: ${v.bar}`);
      await s.press('#listen-toggle');
      v = await until(s, (x) => x.bar === 'playing' && !x.audio?.paused, 3000);
      if (v.bar !== 'playing' || v.first !== at) problems.push(`the bar's play: ${v.bar} at word ${v.first} (was ${at})`);
      await hide(s, true);
      v = await until(s, (x) => x.first > at, 8000);
      if (!(v.first > at)) problems.push(`hidden with no lock screen interface, the read stopped at word ${v.first}`);
      await hide(s, false);
      detail = `interface ${JSON.stringify(absent)}; read from word ${at} to ${v.first}`;
    } catch (error) { problems.push(`the case broke: ${String(error.message).split('\n')[0].slice(0, 200)}`); }
    if (s.errors.length) problems.push(`page errors: ${s.errors.join(' | ')}`);
    report('no-media', problems, detail);
    await s.close();
  },

  async 'outside-pause'() {
    clipSeconds = 2.4; holdNth = 0;
    const s = await freshPage({ media: 'wrap' });
    const problems = [];
    const steps = [];
    const pauseFromOutside = () => s.page.evaluate(() => document.querySelector('audio[data-speak-audio]').pause());
    try {
      await openArticle(s);
      // shown: into the second sentence, then a pause nobody in the app asked for
      let v = await until(s, (x) => x.lit >= 2, 15000);
      await wait(700);
      const before = await look(s.page);
      await pauseFromOutside();
      v = await until(s, (x) => x.bar === 'paused', 2000);
      await shot(s.page, 'outside-pause-paused');
      if (v.bar !== 'paused' || v.pressed !== 'false' || v.media.state !== 'paused' || v.first !== before.first) problems.push(`shown: after the pause the bar says ${v.bar} (pressed ${v.pressed}), the lock screen ${v.media.state}, word ${v.first} (was ${before.first})`);
      await wait(300);
      const asked = (await look(s.page)).asked;
      await wait(3000);
      v = await look(s.page);
      if (v.bar !== 'paused' || !v.audio?.paused || v.first !== before.first) problems.push(`shown: it did not stay paused: bar ${v.bar}, audio ${JSON.stringify(v.audio)}, word ${v.first}`);
      if (v.asked !== asked) problems.push(`shown: ${v.asked - asked} sentence(s) asked while paused`);
      const pausedAt = v.audio?.t ?? 0;
      await s.press('#listen-toggle');
      v = await until(s, (x) => x.bar === 'playing' && !x.audio?.paused, 3000);
      if (v.bar !== 'playing' || v.first !== before.first || v.audio?.paused) problems.push(`shown: play did not take it up at the same sentence: bar ${v.bar}, word ${v.first} (was ${before.first}), audio ${JSON.stringify(v.audio)}`);
      if (v.audio && v.audio.t + 0.05 < pausedAt) problems.push(`shown: play started the sentence again (at ${v.audio.t}s, paused at ${pausedAt}s)`);
      steps.push(`shown: paused at word ${before.first} (${pausedAt}s), played on at word ${v.first} (${v.audio?.t}s)`);
      // hidden: the same, and being shown again does not resume it
      await hide(s, true);
      await wait(500);
      const hiddenBefore = await look(s.page);
      await pauseFromOutside();
      v = await until(s, (x) => x.bar === 'paused', 2000);
      if (v.bar !== 'paused' || v.media.state !== 'paused') problems.push(`hidden: after the pause the bar says ${v.bar}, the lock screen ${v.media.state}`);
      await wait(2000);
      await hide(s, false);
      await wait(1500);
      v = await look(s.page);
      if (v.bar !== 'paused' || !v.audio?.paused || v.first !== hiddenBefore.first) problems.push(`hidden then shown: bar ${v.bar}, audio ${JSON.stringify(v.audio)}, word ${v.first} (paused at ${hiddenBefore.first})`);
      await s.press('#listen-toggle');
      v = await until(s, (x) => x.bar === 'playing' && !x.audio?.paused, 3000);
      if (v.bar !== 'playing' || v.first !== hiddenBefore.first) problems.push(`hidden then shown: play gave bar ${v.bar} at word ${v.first} (paused at ${hiddenBefore.first})`);
      steps.push(`hidden: paused at word ${hiddenBefore.first}, still paused when shown, played on at word ${v.first}`);
    } catch (error) { problems.push(`the case broke: ${String(error.message).split('\n')[0].slice(0, 200)}`); }
    if (s.errors.length) problems.push(`page errors: ${s.errors.join(' | ')}`);
    report('outside-pause', problems, steps.join('; '));
    await s.close();
  },

  async 'refused-play'() {
    clipSeconds = 1.2; holdNth = 0;
    const s = await freshPage({ media: 'wrap' });
    const problems = [];
    const steps = [];
    const call = (action) => s.page.evaluate((action) => window.__pocket.media.handlers[action]?.(), action);
    try {
      await openArticle(s);
      await until(s, (x) => x.lit >= 2, 15000);
      await hide(s, true);
      // the next clip, refused as a locked phone may refuse a new start: the read is paused at it, not ended
      await s.page.evaluate(() => { window.__pocket.refuse = 'NotAllowedError'; });
      let v = await until(s, (x) => x.bar === 'paused' || x.bar === 'idle', 8000);
      const at = v.first;
      const refused = await s.page.evaluate(() => window.__pocket.refused || 0);
      if (!refused) problems.push('no clip was refused (the case did not reach its point)');
      if (v.bar !== 'paused' || v.media?.state !== 'paused' || v.media?.title === null) problems.push(`a refused clip: the bar says ${v.bar}${v.silent ? ` (${v.silent})` : ''}, the lock screen ${JSON.stringify(v.media)}`);
      await wait(1500);
      v = await look(s.page);
      if (v.bar !== 'paused' || !v.audio?.paused) problems.push(`after a refused clip it did not stay paused: bar ${v.bar}, audio ${JSON.stringify(v.audio)}`);
      await call('play');
      v = await until(s, (x) => x.bar === 'playing' && !x.audio?.paused, 4000);
      if (v.bar !== 'playing' || v.first !== at) problems.push(`the lock screen's play after a refused clip: bar ${v.bar} at word ${v.first} (refused at ${at})`);
      steps.push(`refused at word ${at}: paused; the lock screen's play took it up at word ${v.first}`);
      // a clip that cannot play for any other reason ends the read, and the bar says so in true words
      await s.page.evaluate(() => { window.__pocket.refuse = 'NotSupportedError'; });
      v = await until(s, (x) => x.bar === 'idle', 8000);
      const note = await s.page.evaluate(() => document.getElementById('listen-note')?.textContent || '');
      if (v.bar !== 'idle' || v.silent !== 'decode' || !/could not play|再生エラー/u.test(note)) problems.push(`a clip that cannot play: the bar says ${v.bar} (${v.silent || 'no reason'}), "${note}"`);
      if (v.media?.title !== null) problems.push(`the read ended, and the lock screen still shows ${JSON.stringify(v.media)}`);
      steps.push(`a clip that cannot play ended the read: "${note}"`);
      await hide(s, false);
    } catch (error) { problems.push(`the case broke: ${String(error.message).split('\n')[0].slice(0, 200)}`); }
    if (s.errors.length) problems.push(`page errors: ${s.errors.join(' | ')}`);
    report('refused-play', problems, steps.join('; '));
    await s.close();
  },

  async 'hidden-others'() {
    clipSeconds = 6; holdNth = 0;
    const s = await freshPage({ media: 'wrap' });
    const { page, press } = s;
    const problems = [];
    const steps = [];
    let where = 'start';
    const speaking = () => page.evaluate(() => { const a = document.querySelector('audio[data-speak-audio]'); return !!a && !a.paused && !a.ended; });
    const speakPlays = () => page.evaluate(() => window.__pocket.plays.filter((p) => p.speak).length);
    async function toDeck() {
      if (!(await page.locator('#tab-learn').isVisible().catch(() => false))) { await s.ready(); await press('#home-review'); }
      await page.locator('#tab-learn').waitFor();
      await press('#tab-learn'); await wait(1200);
      await press('.learn-go-deck'); await page.locator('#kp-card').waitFor(); await wait(1500);
    }
    async function endsWhenHidden(name, isLit) {
      const sounding = await (async () => { const t = Date.now(); while (Date.now() - t < 8000) { if (await speaking()) return true; await wait(100); } return false; })();
      if (!sounding) { problems.push(`${name}: it never started to sound`); return; }
      await hide(s, true);
      await wait(600);
      const after = { sounding: await speaking(), lit: await isLit() };
      await hide(s, false);
      await wait(1200);
      const later = { sounding: await speaking(), lit: await isLit() };
      if (after.sounding || after.lit) problems.push(`${name}: hidden, it did not end (${JSON.stringify(after)})`);
      if (later.sounding || later.lit) problems.push(`${name}: shown again, it sounds again (${JSON.stringify(later)})`);
      steps.push(`${name} ended when hidden`);
    }
    try {
      // a deck card's control (its answer side)
      where = 'deck control';
      await toDeck();
      await press('#kp-reveal'); await wait(900);
      await press('#kp-listen-word');
      await endsWhenHidden('the deck card\'s control', () => page.evaluate(() => !!document.querySelector('#kp-listen-word.is-speaking')));
      // a card's answer shown while hidden, with 声 on: nothing until shown
      where = 'answer while hidden';
      await s.bySelf('on');
      await toDeck();
      await hide(s, true);
      const asked0 = (await look(page)).asked, plays0 = await speakPlays();
      await page.evaluate(() => document.querySelector('#kp-reveal')?.click());
      await wait(1500);
      const whileHidden = { asked: (await look(page)).asked - asked0, plays: (await speakPlays()) - plays0, answer: await page.evaluate(() => !!document.querySelector('#kp-card .kp-answer')) };
      await hide(s, false);
      const t = Date.now();
      while (Date.now() - t < 6000 && (await speakPlays()) === plays0) await wait(100);
      const shownPlays = (await speakPlays()) - plays0;
      if (!whileHidden.answer) problems.push('the answer was not shown (the case did not reach its point)');
      if (whileHidden.asked || whileHidden.plays) problems.push(`a card's answer said itself while hidden: ${JSON.stringify(whileHidden)}`);
      if (!shownPlays) problems.push('shown again, the answer did not say itself');
      steps.push(`answer shown while hidden: ${whileHidden.asked} asked, ${whileHidden.plays} played; said once shown (${shownPlays} start(s))`);
      await wait(6500);
      await s.bySelf('off');
      // the word box's 音
      where = 'word box';
      await openArticle(s, { start: false });
      // a word the quick dictionary has (two or more kanji), so its box has its 音
      const nth = await page.evaluate(() => [...document.querySelectorAll('.reader .tok.content')].findIndex((t) => /^\p{Script=Han}{2,}$/u.test(t.textContent.trim())));
      const tok = page.locator('.reader .tok.content').nth(Math.max(0, nth));
      await tok.scrollIntoViewIfNeeded();
      for (let i = 0; i < 4 && !(await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await press(tok); await wait(450); }
      await page.locator('#mini-voice').waitFor();
      await press('#mini-voice');
      await endsWhenHidden('the word box\'s 音', () => page.evaluate(() => !!document.querySelector('#mini-voice.is-speaking')));
      for (let i = 0; i < 3 && (await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await page.keyboard.press('Escape'); await wait(400); }
      // the ear
      where = 'ear';
      const mark = page.locator('.ear-mark').first();
      await press(mark);
      await page.waitForFunction(() => document.documentElement.dataset.ear === 'armed', null, { timeout: 3000 });
      const target = await page.evaluate(() => {
        const t = [...document.querySelectorAll('#reader .tok.content')].find((x) => { const r = x.getBoundingClientRect(); return r.top > 160 && r.bottom < innerHeight - 220 && /\p{Script=Han}/u.test(x.textContent); });
        const r = t?.getBoundingClientRect();
        return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
      });
      if (!target) throw new Error('no word in view for the ear');
      if (phone) await page.touchscreen.tap(target.x, target.y); else await page.mouse.click(target.x, target.y);
      await endsWhenHidden('the ear\'s voice', () => page.evaluate(() => document.documentElement.dataset.ear === 'speaking' || document.documentElement.hasAttribute('data-ear-voice')));
    } catch (error) {
      problems.push(`the case broke at "${where}": ${String(error.message).split('\n')[0].slice(0, 200)}`);
      await shot(page, `hidden-others-broke`);
    }
    if (s.errors.length) problems.push(`page errors: ${s.errors.join(' | ')}`);
    report('hidden-others', problems, steps.join('; '));
    await s.close();
  },
};

for (const [name, run] of Object.entries(CASES)) if (ONLY.has(name)) await run();
await browser.close();
await fake.close();
await new Promise((resolve) => server.close(resolve));
const failed = results.filter((r) => !r.pass).length;
console.log(`${results.length - failed} of ${results.length} pass (${tag})`);
process.exit(failed ? 1 : 0);
