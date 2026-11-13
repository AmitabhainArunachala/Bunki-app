/** One vocabulary for the voice (speech lane, 2026-11-13): every cause the stand-in can play, on each surface that can show
 * it, in the interface's language, read off the page and held to modules/voice-lines.mjs (which tools/voice-lines.test.mjs
 * holds to the lead's ruling, string for string). Muted and headless, loopback only, against a served site (built, or the
 * source folder) and the repository's silent stand-in voice server. No sound, no real voice server, no token or code.
 *
 *   node prototypes/corridor/tools/verify-voice-lines.mjs --site <dir> [--engine chromium|webkit] [--width 1728|390]
 *        [--lang en|ja] [--port 19602] [--only mark,bar,ear,settings,clears,controls] [--causes 503,401,...] [--shots <dir>]
 *
 *  mark      the line beside a control (a word page's headword mark) and the control's title: exactly the cause's line;
 *            it goes after about four seconds; the next press does what the line says (it speaks once the cause has
 *            passed, or says the same again where nothing passes by itself, without asking the server)
 *  bar       the reader's play bar: its note is the short form, its title the line
 *  ear       the ear armed, a tap on the headword: the line under the ear, the label "Ear: no voice (short)"; it goes
 *            after about four seconds
 *  settings  the lasting causes, as Settings shows them while it is open (the dollar figure beside the limits)
 *  clears    a line goes at the next press, at once, and a success leaves none
 *  controls  every voice control pressed while the voice is busy: what appears, and where (a silent press is a fault)
 *  several   a kanji with several readings in review: its answer's row says it is not read aloud, with no control
 *  For each surface the nearest text and the nearest control are measured before the line, while it shows and after it
 *  goes (does anything he reads or is about to tap move?).
 *
 * One JSON line per row on stdout; exit 0 when every row passes. */
import { createReadStream, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { startFakeVoiceServer } from './fake-voice-server.mjs';
import * as L from '../modules/voice-lines.mjs';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const SITE = arg('--site', '');
const ENGINE = arg('--engine', 'chromium');
const WIDTH = Number(arg('--width', '1728'));
const LANG = arg('--lang', 'en');
const PORT = Number(arg('--port', '19602'));
const SHOTS = arg('--shots', '');
const ONLY = new Set(arg('--only', 'mark,bar,ear,settings,clears').split(',').filter(Boolean));
if (!SITE) { console.error('usage: verify-voice-lines.mjs --site <dir>'); process.exit(2); }
if (!(PORT >= 19600 && PORT <= 19608)) { console.error(`port ${PORT} is not one of 19600-19608`); process.exit(2); }
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const phone = WIDTH < 700;
const UI = LANG === 'ja' ? 'ja' : 'bi';
const T = (pair) => (LANG === 'ja' ? pair[0] : pair[1]);
const tag = `${ENGINE}-${WIDTH}-${LANG}`;

/* ------------------------------------------------------------------ the site and the stand-in */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml', '.m4a': 'audio/mp4', '.wasm': 'application/wasm', '.gz': 'application/gzip' };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/u, '');
  let file = join(SITE, path.endsWith('/') ? `${path}index.html` : path);
  try { if (statSync(file).isDirectory()) file = join(file, 'index.html'); statSync(file); } catch { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
const ORIGIN = `http://127.0.0.1:${PORT}`;
const fake = await startFakeVoiceServer({ origins: [ORIGIN], port: PORT + 1, missesPerMinute: 100000, capCents: 100000, dayCents: 100000 });
const browser = await (ENGINE === 'webkit' ? webkit : chromium).launch({ headless: true, ...(ENGINE === 'chromium' ? { args: ['--mute-audio'] } : {}) });
const contexts = [];

/** A fresh, silent page: media muted, the device voice swallowed, Web Audio at gain 0, nothing off this machine, said-by-
 * itself off (every request the stand-in logs is a press), the first-open line dismissed. `paired`: through Settings. */
async function freshPage({ paired = true } = {}) {
  // each case begins with nothing scripted (an earlier case's answers that nobody asked for are dropped)
  fake.clearNext();
  const context = await browser.newContext({ viewport: { width: WIDTH, height: phone ? 844 : 1117 }, deviceScaleFactor: phone ? 2 : 1, hasTouch: phone, isMobile: phone,
    locale: LANG === 'ja' ? 'ja-JP' : 'en-US', timezoneId: 'Asia/Tokyo', serviceWorkers: 'block' });
  contexts.push(context);
  await silenceBrowserAudio(context);
  await context.addInitScript(() => {
    // the page's clock can be moved on (a wait the seam keeps after a refusal, without waiting it out)
    const RealDate = Date;
    window.__dateShift = 0;
    window.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + window.__dateShift); } static now() { return RealDate.now() + window.__dateShift; } };
    window.__plays = 0;
    document.addEventListener('playing', (event) => { if (event.target?.matches?.('audio[data-speak-audio]') && event.target.duration > 0.2) window.__plays += 1; }, true);
    if (window.speechSynthesis) { const proto = Object.getPrototypeOf(window.speechSynthesis); proto.speak = function () {}; proto.cancel = function () {}; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { const connect = AudioNode.prototype.connect; AudioNode.prototype.connect = function (dest, ...rest) { if (dest instanceof AudioDestinationNode) { const gain = this.context.createGain(); gain.gain.value = 0; connect.call(this, gain); return connect.call(gain, dest, ...rest); } return connect.call(this, dest, ...rest); }; }
    try { localStorage.setItem('kairo-voice-by-itself-v1', 'off'); localStorage.setItem('bunki-prototype:intro-dismissed:v1', '1'); } catch { /* storage blocked */ }
  });
  await context.route('**/*', (route) => { const u = new URL(route.request().url()); return ['127.0.0.1', 'localhost'].includes(u.hostname) || !/^https?:$/u.test(u.protocol) ? route.continue() : route.abort(); });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 200)));
  const p = { context, page, errors };
  p.press = async (target) => { const l = typeof target === 'string' ? page.locator(target).first() : target; if (phone) await l.tap(); else await l.click(); };
  p.open = async (query, wait = null) => {
    await page.goto(`${ORIGIN}/?ui=${UI}${query ? `&${query}` : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.dataset.ready === '1' && 'ear' in document.documentElement.dataset, null, { timeout: 90000 });
    if (wait) await page.locator(wait).first().waitFor({ timeout: 60000 });
    await settled(page);
  };
  p.pair = async () => {
    await p.open('room=me', '#me-settings');
    await p.press('#me-settings');
    await page.locator('#voice-pair-learner').waitFor();
    await page.locator('#voice-pair-learner').fill(`Bunki voice code: ${fake.issue({ learner: 'test-learner' })} (10 minutes) · learner: test-learner · server: ${fake.origin}`);
    await p.press('#voice-pair-submit');
    await page.waitForFunction(() => document.getElementById('settings-voice-server')?.dataset.paired === 'true', null, { timeout: 20000 });
  };
  if (paired) await p.pair();
  return p;
}
/** The page has stopped changing: nothing added or removed for 700 ms (the ear's own nodes apart). */
async function settled(page) {
  await page.evaluate(() => new Promise((done) => {
    let last = performance.now();
    const seen = new MutationObserver((records) => { if (records.some((r) => !(r.target.nodeType === 1 && r.target.closest?.('[data-ear-own]')))) last = performance.now(); });
    seen.observe(document.body, { childList: true, subtree: true });
    const tick = () => { if (performance.now() - last > 700) { seen.disconnect(); done(); } else setTimeout(tick, 100); };
    setTimeout(tick, 100);
    setTimeout(() => { seen.disconnect(); done(); }, 15000);
  }));
}
const shot = (p, name) => (SHOTS ? p.page.screenshot({ path: join(SHOTS, `${tag}-${name}.png`) }).catch(() => {}) : null);

/* ------------------------------------------------------------------ the causes */
// `script`: the stand-in's next answers; `setup`: what the page needs before the press; `then`: what the next press does
const CAUSES = [
  { key: 'not-paired', code: 'not-paired', setup: 'unpaired', then: 'pair' },
  { key: '401', code: 'authentication-required', script: [{ status: 401, error: 'authentication-required' }], then: 'pair' },
  { key: 'lost-connection', code: 'network-failed', cut: true, then: 'wait-16s' },
  { key: 'offline', code: 'offline', setup: 'offline', then: 'same' },
  { key: 'timeout', code: 'voice-timeout', script: [{ holdMs: 23000 }], then: 'wait-16s', slow: true },
  { key: '503', code: 'voice-unavailable', script: [{ status: 503, error: 'voice-unavailable' }, { status: 503, error: 'voice-unavailable' }], then: 'speaks' },
  { key: 'minute', code: 'request-rate-limit', script: [{ status: 429, error: 'request-rate-limit' }], then: 'wait-61s' },
  { key: 'day', code: 'day-budget', script: [{ status: 429, error: 'day-budget' }], then: 'same' },
  { key: 'whole', code: 'budget-exhausted', script: [{ status: 402, error: 'budget-exhausted' }], then: 'heard-plays' },
  { key: 'bad-bytes', code: 'decode', script: [{ status: 200, bytes: 'these bytes are not audio at all' }], then: 'speaks' },
  { key: '426', code: 'upgrade-required', script: [{ status: 426, error: 'upgrade-required' }], then: 'none' },
  { key: 'no-new', code: 'not-in-release', script: [{ status: 404, error: 'not-in-release' }], then: 'same' },
  { key: 'else-500', code: 'server-failed', script: [{ status: 500, error: 'server-failed' }], then: 'speaks' },
  { key: 'else-400', code: 'japanese-only', script: [{ status: 400, error: 'japanese-only' }, { status: 400, error: 'japanese-only' }], then: 'same' },
  { key: 'nothing', code: 'nothing-to-say', setup: 'latin', then: 'same' },
];
const ONLY_CAUSES = new Set(arg('--causes', CAUSES.map((c) => c.key).join(',')).split(','));
const lineOf = (code) => T(L.voiceLineOf(code, { time: '{time}' }));
/** The line as the page should show it; C8's time is read off the page (the device's own clock and format). */
const matches = (seen, code) => {
  const want = lineOf(code);
  if (!want.includes('{time}')) return seen === want;
  const [head, tail] = want.split('{time}');
  return typeof seen === 'string' && seen.startsWith(head) && seen.endsWith(tail) && /^\d{1,2}:\d{2}/u.test(seen.slice(head.length));
};
const shortOf = (code) => T(L.voiceShortOf(code));

const rows = [];
let failed = false;
const row = (surface, cause, checks, detail = {}) => {
  const problems = Object.entries(checks).filter(([, ok]) => ok !== true).map(([name, ok]) => (ok === false ? name : `${name}: ${ok}`));
  if (problems.length) failed = true;
  const out = { surface, cause, engine: ENGINE, width: WIDTH, lang: LANG, pass: !problems.length, problems, ...detail };
  rows.push(out);
  console.log(JSON.stringify(out));
};

/** Positions of what he reads or taps near a surface, rounded to the pixel. */
const where = (page, selectors) => page.evaluate((sels) => Object.fromEntries(Object.entries(sels).map(([name, sel]) => {
  const n = document.querySelector(sel);
  const r = n && n.getClientRects().length ? n.getBoundingClientRect() : null;
  return [name, r ? { x: Math.round(r.left), y: Math.round(r.top) } : null];
})), selectors);
const moved = (a, b) => Object.fromEntries(Object.keys(a).map((k) => [k, a[k] && b[k] ? Math.max(Math.abs(a[k].x - b[k].x), Math.abs(a[k].y - b[k].y)) : null]));

/** Wait for `read()` in the page to give a truthy value; returns it, or null after `ms`. */
const until = (page, read, arg_, ms = 30000) => page.waitForFunction(read, arg_, { timeout: ms, polling: 50 }).then((h) => h.jsonValue()).catch(() => null);
/** How long (ms) until `read()` is falsy, up to `ms`; null when it stays. */
const goneAfter = (page, read, arg_, ms = 9000) => page.evaluate(async ({ src, a, limit }) => {
  const f = new Function(`return (${src})`)();
  const t0 = performance.now();
  while (performance.now() - t0 < limit) { if (!f(a)) return Math.round(performance.now() - t0); await new Promise((r) => setTimeout(r, 50)); }
  return null;
}, { src: read.toString(), a: arg_, limit: ms });
const plays = (page) => page.evaluate(() => window.__plays);
const speaksNow = () => fake.speaks().length;

/* ------------------------------------------------------------------ surfaces */
const WORD = 'read=wikinews:1403&word=開催';
const HEAD_MARK = '#sheet .voice-say[data-voice-say="entry-headword"]';
const EXAMPLE_MARK = '#sheet .voice-say[data-voice-say="example"]';

/** A lost connection: every speak request of this page fails at the network until the line has been seen (`p.cutOn` is
 * cleared then). The stand-in's own dropped socket is not used for it: the browser asks again on a reset connection. */
async function cut(p, cause) {
  if (!cause.cut) return;
  p.cutOn = true;
  await p.page.route('**/v1/audio/speak', (route) => (p.cutOn ? route.abort('internetdisconnected') : route.fallback()));
}
async function prepare(p, cause, query, wait) {
  await p.open(query, wait);
  if (cause.setup === 'offline') await p.context.setOffline(true);
  if (cause.setup === 'latin') {
    await p.page.evaluate(() => {
      const h = document.querySelector('#sheet > h2.headword'); const r = document.querySelector('#sheet > p.reading');
      if (h) h.textContent = 'event'; if (r) r.textContent = 'event';
    });
  }
}
/** The next press, as the line says: once the cause has passed it speaks; where nothing passes by itself it says the
 * same again without asking the server. Returns what happened. */
async function nextPress(p, cause, mark, readLine) {
  const { page } = p;
  const before = { plays: await plays(page), asked: speaksNow() };
  if (cause.then === 'pair') {
    await p.pair();
    await p.open(WORD, HEAD_MARK);
  } else if (cause.then === 'wait-16s') await page.evaluate(() => { window.__dateShift += 16000; });
  else if (cause.then === 'wait-61s') await page.evaluate(() => { window.__dateShift += 61000; });
  if (cause.then === 'heard-plays') {
    // a voice he has heard here still plays: the example he heard before the limit
    await p.press(EXAMPLE_MARK);
    const played = await until(page, (n) => window.__plays > n, before.plays, 12000);
    return played ? 'heard plays' : `heard did not play (asked ${speaksNow() - before.asked})`;
  }
  const asked = speaksNow();
  await p.press(mark);
  if (['same', 'none'].includes(cause.then) || cause.then === undefined) {
    if (cause.then === 'none') { await page.waitForTimeout(1500); return 'pressed'; }
    const again = await until(page, readLine.fn, readLine.arg, 25000);
    return again && matches(again, cause.code) ? `same line${speaksNow() > asked ? `, asked ${speaksNow() - asked}` : ', not asked'}` : `no line (${again})`;
  }
  const played = await until(page, (n) => window.__plays > n, before.plays, 15000);
  return played ? 'speaks' : `silent (${await readLine.now()})`;
}

async function markCase(cause) {
  const p = await freshPage({ paired: cause.setup !== 'unpaired' });
  const { page } = p;
  if (cause.then === 'heard-plays') {
    await p.open(WORD, EXAMPLE_MARK);
    await p.press(EXAMPLE_MARK);
    await until(page, () => window.__plays > 0, null, 12000);
    await page.waitForTimeout(1500);
    await p.press(EXAMPLE_MARK).catch(() => {});
  }
  await prepare(p, cause, WORD, HEAD_MARK);
  const near = { headword: '#sheet > h2.headword', reading: '#sheet > p.reading', mark: HEAD_MARK, next: '#sheet > h2.headword + *' };
  const before = await where(page, near);
  fake.failNext(cause.script || []);
  await cut(p, cause);
  const t0 = Date.now();
  await p.press(HEAD_MARK);
  const note = (sel) => { const m = document.querySelector(sel); const n = m?.nextElementSibling; return n?.classList.contains('voice-note') && n.textContent ? n.textContent : null; };
  const seen = await until(page, note, HEAD_MARK, cause.slow ? 40000 : 20000);
  p.cutOn = false;
  const shownAt = Date.now() - t0;
  const title = await page.locator(HEAD_MARK).getAttribute('title');
  const during = await where(page, near);
  await shot(p, `mark-${cause.key}`);
  const gone = seen ? await goneAfter(page, note, HEAD_MARK, 9000) : null;
  const after = await where(page, near);
  const then = seen ? await nextPress(p, cause, HEAD_MARK, { fn: note, arg: HEAD_MARK, now: () => page.evaluate(note, HEAD_MARK) }) : 'no line';
  const thenOk = { pair: 'speaks', 'wait-16s': 'speaks', 'wait-61s': 'speaks', speaks: 'speaks', 'heard-plays': 'heard plays', none: 'pressed' }[cause.then];
  row('control line', cause.key, {
    line: matches(seen, cause.code) || `${JSON.stringify(seen)} ≠ ${JSON.stringify(lineOf(cause.code))}`,
    title: matches(title, cause.code) || JSON.stringify(title),
    'goes after about 4 s': (gone !== null && gone >= 3000 && gone <= 6500) || `gone after ${gone} ms`,
    'next press': (thenOk ? then === thenOk : then.startsWith('same line') && then.endsWith('not asked')) || then,
  }, { seen, shownAtMs: shownAt, goneAfterMs: gone, then, moved: { during: moved(before, during), after: moved(before, after) }, errors: p.errors.slice(0, 3) });
  await p.context.close();
}

async function barCase(cause) {
  if (cause.setup === 'latin') return;
  const p = await freshPage({ paired: cause.setup !== 'unpaired' });
  const { page } = p;
  await prepare(p, cause, 'read=wikinews:1403', '#listen-open');
  if ((await page.locator('#listen-toggle').count()) === 0 || !(await page.locator('#listen-toggle').isVisible())) await p.press('#listen-open');
  await page.locator('#listen-toggle').waitFor();
  const near = { toggle: '#listen-toggle', rate: '#listen-rate', note: '#listen-note', text: '#reader p.reader-prose' };
  const before = await where(page, near);
  // the read asks two sentences ahead: each of the first few asks meets the cause
  fake.failNext(...Array.from({ length: 4 }, () => cause.script || []));
  await cut(p, cause);
  await p.press('#listen-toggle');
  const read = () => { const n = document.getElementById('listen-note'); return n?.title ? [n.textContent, n.title] : null; };
  const seen = await until(page, read, null, cause.slow ? 40000 : 20000);
  p.cutOn = false;
  const during = await where(page, near);
  await shot(p, `bar-${cause.key}`);
  row('play bar', cause.key, {
    short: (seen && seen[0] === shortOf(cause.code)) || `${JSON.stringify(seen?.[0])} ≠ ${JSON.stringify(shortOf(cause.code))}`,
    title: (seen && matches(seen[1], cause.code)) || `${JSON.stringify(seen?.[1])} ≠ ${JSON.stringify(lineOf(cause.code))}`,
  }, { seen, moved: { during: moved(before, during) }, errors: p.errors.slice(0, 3) });
  await p.context.close();
}

async function earCase(cause) {
  const p = await freshPage({ paired: cause.setup !== 'unpaired' });
  const { page } = p;
  await prepare(p, cause, WORD, HEAD_MARK);
  const spot = '#sheet > .sheet-bar > .bar-gate + .ear-spot';
  const near = { headword: '#sheet > h2.headword', mark: HEAD_MARK, ear: `${spot} .ear-mark`, next: '#sheet > h2.headword + *' };
  const before = await where(page, near);
  await p.press(`${spot} .ear-mark`);
  await until(page, () => document.documentElement.dataset.ear === 'armed', null, 5000);
  fake.failNext(cause.script || []);
  await cut(p, cause);
  await p.press('#sheet > h2.headword');
  const read = (sel) => { const why = document.querySelector(`${sel} .ear-why`); return why && !why.hidden && why.textContent ? [why.textContent, document.querySelector(`${sel} .ear-mark`).getAttribute('aria-label')] : null; };
  const seen = await until(page, read, spot, cause.slow ? 40000 : 20000);
  p.cutOn = false;
  const during = await where(page, near);
  await shot(p, `ear-${cause.key}`);
  const gone = seen ? await goneAfter(page, read, spot, 9000) : null;
  const after = await where(page, near);
  const quiet = cause.code === 'nothing-to-say';
  row('ear', cause.key, quiet ? { 'a quiet end (nothing struck)': seen === null || JSON.stringify(seen) } : {
    line: (seen && matches(seen[0], cause.code)) || `${JSON.stringify(seen?.[0])} ≠ ${JSON.stringify(lineOf(cause.code))}`,
    label: (seen && seen[1] === T(L.voiceEarLabel('novoice', cause.code))) || `${JSON.stringify(seen?.[1])} ≠ ${JSON.stringify(T(L.voiceEarLabel('novoice', cause.code)))}`,
    'goes after about 4 s': (gone !== null && gone >= 3000 && gone <= 6500) || `gone after ${gone} ms`,
  }, { seen, goneAfterMs: gone, moved: { during: moved(before, during), after: moved(before, after) }, errors: p.errors.slice(0, 3) });
  await p.context.close();
}

/** The lasting causes, as Settings shows them: caused by a press on Today (the ear on its Japanese), then Settings. */
const LASTING = { 'not-paired': 'state', '401': 'state', minute: 'blocked', day: 'blocked', whole: 'blocked', 'no-new': 'blocked' };
async function settingsCase(cause) {
  if (!LASTING[cause.key]) return;
  const p = await freshPage({ paired: cause.setup !== 'unpaired' });
  const { page } = p;
  await prepare(p, cause, WORD, HEAD_MARK);
  fake.failNext(cause.script || []);
  await cut(p, cause);
  if (cause.key !== 'not-paired') {
    await p.press(HEAD_MARK);
    await until(page, (sel) => !!document.querySelector(sel)?.nextElementSibling?.textContent, HEAD_MARK, 20000);
  }
  // Settings, in the same page: the app's own block, drawn now (corridor.js voiceSettingsBlock), as Settings draws it
  const near = { status: '#vl-settings #voice-status', last: '#vl-settings #voice-last', budget: '#vl-settings #voice-budget' };
  await page.evaluate(async () => {
    const m = await import('/corridor.js');
    const host = document.createElement('div'); host.id = 'vl-settings';
    host.append(m.voiceSettingsBlock());
    document.querySelector('#sheet')?.prepend(host);
  });
  const seen = await until(page, () => { const s = document.querySelector('#vl-settings #voice-status')?.textContent; const l = document.querySelector('#vl-settings #voice-last')?.textContent; const b = document.querySelector('#vl-settings #voice-budget')?.textContent; return s && !/…$/u.test(b || '') ? [s, l, b] : null; }, null, 15000);
  const before = await where(page, near);
  await page.waitForTimeout(1500);
  const after = await where(page, near);
  await shot(p, `settings-${cause.key}`);
  // the whole limit with the figure the stand-in's budget answer gave beside it; today's limit with the time it resets
  // (the stand-in sends no day figure, so none stands beside it)
  const want = cause.key === 'whole' ? T(L.voiceSettingsLine(cause.code, { capCents: 100000 })) : T(L.voiceLineOf(cause.code));
  const status = seen?.[0] || '';
  const checks = { 'the lasting cause in its ruled words': (cause.key === 'day'
    ? matches(status.slice(status.indexOf(want)), cause.code) : status.includes(want)) || `${JSON.stringify(status)} lacks ${JSON.stringify(want)}` };
  if (cause.key !== 'not-paired') {
    const last = seen?.[1] || '';
    checks['last tap, short form'] = last.includes(`(${shortOf(cause.code)}`) || last.includes(`（${shortOf(cause.code)}`) || JSON.stringify(last);
  }
  row('Settings', cause.key, checks, { seen, moved: moved(before, after), errors: p.errors.slice(0, 3) });
  await p.context.close();
}

/** A line goes at the next press, at once; a success leaves none. */
async function clearsCase() {
  const p = await freshPage();
  const { page } = p;
  await p.open(WORD, HEAD_MARK);
  fake.failNext({ status: 503, error: 'voice-unavailable' }, { status: 503, error: 'voice-unavailable' });
  await p.press(HEAD_MARK);
  const note = (sel) => document.querySelector(sel)?.nextElementSibling?.classList.contains('voice-note') ? document.querySelector(sel).nextElementSibling.textContent : null;
  const first = await until(page, note, HEAD_MARK, 20000);
  const n = await plays(page);
  await page.waitForTimeout(600);
  await p.press(HEAD_MARK);
  const at = await page.evaluate(note, HEAD_MARK);
  const played = await until(page, (k) => window.__plays > k, n, 12000);
  await page.waitForTimeout(800);
  const later = await page.evaluate(note, HEAD_MARK);
  const title = await page.locator(HEAD_MARK).getAttribute('title');
  row('control line', 'next press', {
    'a line was shown': matches(first, 'voice-unavailable') || JSON.stringify(first),
    'gone at the next press': !at || JSON.stringify(at),
    'the press spoke': !!played,
    'none after the success': !later || JSON.stringify(later),
    'the title is the rest word again': title === T(L.VOICE_WORDS.listen) || JSON.stringify(title),
  });
  await p.context.close();
}

/** Every control that asks for speech on a press, pressed while the voice is busy (503): what appears, and where. A
 * press that stays silent with no line is a fault. */
async function controlsCase() {
  const busy = () => { fake.clearNext(); fake.failNext(...Array.from({ length: 4 }, () => [{ status: 503, error: 'voice-unavailable' }, { status: 503, error: 'voice-unavailable' }])); };
  const want = lineOf('voice-unavailable');
  /** What stands near `sel` after its press: the first line found (a note beside it, the ear's line, a status). */
  const lineNear = (sel) => {
    const control = document.querySelector(sel);
    if (!control) return null;
    const shown = (n) => n && n.textContent && n.getClientRects().length && !n.hidden;
    const candidates = [
      ['beside', control.nextElementSibling?.classList.contains('voice-note') ? control.nextElementSibling : null],
      ['in its row', control.parentElement?.querySelector(':scope > .say-note')],
      ['under the word', control.closest('.kp-word')?.nextElementSibling?.classList.contains('voice-note') ? control.closest('.kp-word').nextElementSibling : null],
      ['under the ear', [...document.querySelectorAll('.ear-why')].find(shown)],
    ];
    for (const [where, node] of candidates) {
      if (shown(node)) {
        const a = control.getBoundingClientRect(), b = node.getBoundingClientRect();
        return { where, text: node.textContent, dx: Math.round(b.left - a.left), dy: Math.round(b.top - a.bottom), title: control.getAttribute('title') };
      }
    }
    return null;
  };
  const press = async (p, name, sel, prepare = null) => {
    try {
      if (prepare) await prepare(p);
      const control = p.page.locator(sel).first();
      if (!(await control.count())) { row('controls', name, { 'the control stands here': 'not reached' }); return; }
      await control.scrollIntoViewIfNeeded().catch(() => {});
      busy();
      await p.press(control);
      const seen = await until(p.page, lineNear, sel, 20000);
      await shot(p, `control-${name}`);
      row('controls', name, { 'a line, exactly as ruled': (seen && seen.text === want) || JSON.stringify(seen) }, { seen });
    } catch (e) { row('controls', name, { ran: String(e.message || e).slice(0, 200) }); }
  };
  const p = await freshPage();
  // a word page: the headword's mark and an example's
  await p.open(WORD, HEAD_MARK);
  await press(p, 'word page headword', HEAD_MARK);
  await p.open(WORD, EXAMPLE_MARK);
  await press(p, 'word page example', EXAMPLE_MARK);
  // a kanji page: the readings' marks
  await p.open('room=shelf&kanji=産', '#sheet');
  await press(p, 'kanji page reading', '#sheet dl.kv[data-kanji-readings] > dd .voice-say');
  // the reader: a word's box (its 音), and 読む on a selection
  await p.open('read=wikinews:1403', '.reader .tok.content');
  await press(p, 'word box 音', '#mini-voice', async ({ page }) => {
    const word = page.locator('.reader .tok.content').nth(3);
    await word.scrollIntoViewIfNeeded();
    for (let i = 0; i < 4 && !(await page.locator('#mini-voice').isVisible().catch(() => false)); i += 1) { await p.press(word); await page.waitForTimeout(600); }
  });
  const select = async ({ page }, within) => {
    for (let i = 0; i < 4 && (await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
    await page.evaluate((sel) => {
      const block = document.querySelector(sel);
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (/[぀-ヿ一-鿿]{4}/u.test(n.nodeValue) ? 1 : 3) });
      const text = walker.nextNode();
      const range = document.createRange();
      range.setStart(text, 0); range.setEnd(text, Math.min(text.nodeValue.length, 8));
      const s = getSelection(); s.removeAllRanges(); s.addRange(range);
    }, within);
    await page.locator('.ear-chip').waitFor({ state: 'visible', timeout: 5000 });
  };
  await press(p, '読む on a selection (reader)', '.ear-chip', (q) => select(q, '#reader p.reader-prose'));
  // the play bar
  await p.open('read=wikinews:1403', '#listen-open');
  if (!(await p.page.locator('#listen-toggle').isVisible().catch(() => false))) await p.press('#listen-open');
  busy();
  await p.press('#listen-toggle');
  const bar = await until(p.page, () => { const n = document.getElementById('listen-note'); return n?.title ? [n.textContent, n.title] : null; }, null, 20000);
  row('controls', 'play bar', { 'its short form, the line as its title': (bar && bar[0] === shortOf('voice-unavailable') && bar[1] === want) || JSON.stringify(bar) }, { seen: bar });
  // a deck card: its question side's control, its answer's, and 読む on the answer (no ear mark stands on a card)
  await p.open('room=dojo', '.learn-go-deck');
  await p.press('.learn-go-deck');
  await p.page.locator('#kp-reveal').waitFor({ timeout: 30000 });
  await settled(p.page);
  await press(p, 'deck card, question side', '#kp-listen-front');
  await p.press('#kp-reveal').catch(() => {});
  await p.page.locator('#kp-listen-word').waitFor({ timeout: 20000 }).catch(() => {});
  await press(p, 'deck card, answer side', '#kp-listen-word');
  await press(p, '読む on a selection (deck card answer)', '.ear-chip', (q) => select(q, '.kp-answer'));
  await p.context.close();
}

/** A kanji with several readings (C14b), saved from its own page and met in review: the answer's row says it is not read
 * aloud, in the ruled words, and holds no control. */
async function severalCase() {
  const p = await freshPage();
  const { page } = p;
  await page.goto(`${ORIGIN}/?ui=${UI}&kanji=${encodeURIComponent('生')}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 90000 });
  await page.locator('#sheet-take').waitFor();
  await settled(page);
  await p.press('#sheet-take'); await page.locator('#mini-review').waitFor(); await p.press('#mini-review');
  await settled(page);
  await p.open('room=tray', '#review-start');
  await p.press('#review-start');
  await page.locator('.review-face').first().waitFor();
  await settled(page);
  await p.press('#reveal');
  const seen = await until(page, () => { const n = document.getElementById('card-say-note'); return n?.textContent ? [n.textContent, !!document.getElementById('card-say')] : null; }, null, 20000);
  await shot(p, 'review-several-readings');
  row('review card answer', 'several readings', { line: (seen && seen[0] === lineOf('several-readings')) || JSON.stringify(seen), 'no control': (seen && !seen[1]) || JSON.stringify(seen) }, { seen });
  await p.context.close();
}

try {
  if (ONLY.has('several')) await severalCase().catch((e) => row('review card answer', 'several readings', { ran: String(e.message || e).slice(0, 200) }));
  if (ONLY.has('controls')) await controlsCase().catch((e) => row('controls', 'all', { ran: String(e.message || e).slice(0, 200) }));
  for (const cause of CAUSES.filter((c) => ONLY_CAUSES.has(c.key))) {
    if (ONLY.has('mark')) await markCase(cause).catch((e) => row('control line', cause.key, { ran: String(e.message || e).slice(0, 200) }));
    if (ONLY.has('bar')) await barCase(cause).catch((e) => row('play bar', cause.key, { ran: String(e.message || e).slice(0, 200) }));
    if (ONLY.has('ear')) await earCase(cause).catch((e) => row('ear', cause.key, { ran: String(e.message || e).slice(0, 200) }));
    if (ONLY.has('settings')) await settingsCase(cause).catch((e) => row('Settings', cause.key, { ran: String(e.message || e).slice(0, 200) }));
  }
  if (ONLY.has('clears')) await clearsCase().catch((e) => row('control line', 'next press', { ran: String(e.message || e).slice(0, 200) }));
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser.close();
  await fake.close();
  server.close();
}
console.log(`${tag}: ${rows.filter((r) => r.pass).length} of ${rows.length} rows pass`);
process.exit(failed ? 1 : 0);
