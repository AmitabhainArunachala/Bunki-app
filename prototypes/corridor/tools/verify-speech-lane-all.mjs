/** The speech lane's combine (voice/speech-lane-all-20261111): checks where its pieces meet (card audio, the offline clips
 * and the tutor, the ear). Muted and headless, loopback only, against a built site and the repository's silent stand-in
 * voice server (fake-voice-server.mjs). No sound, no real voice server, no token or pairing code.
 *
 *   node prototypes/corridor/tools/verify-speech-lane-all.mjs --site <built site> [--engine webkit|chromium]
 *        [--width 390|1728] [--lang en|ja] [--port 19567] [--only minivoice,settle-saved,...] [--shots <dir>]
 *
 * Every page is paired with the stand-in through the app's own Settings, and 声 (said by itself) is off, so every request
 * the stand-in logs comes from a tap.
 *
 *  minivoice     I9 · the word box's 音 as it was before the card audio (R7): a second tap while its word sounds says the
 *                word again from the top; it does not stop it.
 *  settle-saved  I10 · a word saved with its sentence whose article answers 404 on a fresh load: the face is printed and,
 *                once that load has failed, settled, so its question-side control is put on it; Show answer does not
 *                move; nothing is sent until a tap; the tap sends the stored reading and keeps the card face-down.
 *  settle-second I10 · a second repetition of a word that has no example sentence (printed): with the bank answering
 *                before the shelf, with one shelf article answering 404, and with the bank answering after the shelf,
 *                the control is put on the face once its search has settled; none before; Show answer does not move.
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
const PORT = Number(arg('--port', '19567'));
const SHOTS = arg('--shots', '');
const ONLY = new Set(String(arg('--only', 'minivoice,settle-saved,settle-second')).split(',').filter(Boolean));
if (!SITE) { console.error('usage: verify-speech-lane-all.mjs --site <built site>'); process.exit(2); }
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml', '.m4a': 'audio/mp4', '.wasm': 'application/wasm', '.gz': 'application/gzip' };
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
let clipSeconds = 1.2;
const fake = await startFakeVoiceServer({ origins: [ORIGIN], port: PORT + 1, missesPerMinute: 10000, clipSeconds: () => clipSeconds });
const speaks = () => fake.speaks().map((row) => row.text).filter((text) => typeof text === 'string');

const phone = WIDTH < 700;
const natural = phone ? 'touch' : 'pointer';
const browser = await (ENGINE === 'webkit' ? webkit : chromium).launch({ headless: true, ...(ENGINE === 'chromium' ? { args: ['--mute-audio'] } : {}) });
const results = [];
const report = (name, problems, detail) => {
  results.push({ name, pass: !problems.length });
  console.log(JSON.stringify({ case: name, engine: ENGINE, width: WIDTH, lang: LANG, pass: !problems.length, problems, detail }));
};
const tag = `${ENGINE}-${WIDTH}-${LANG}`;
const opened = [];

/** A fresh, silent page: every media element muted (each `playing` of a clip counted), the device voice swallowed, Web
 * Audio at gain 0, nothing off this machine; paired with the stand-in; 声 off. `net` is read at every request: `fail`
 * (article file names answering 404), `bankMs` (the example bank's files held that long), `articleMs` (shelf articles held
 * that long). The page's clock runs `probe-clock-offset-ms` (localStorage) ahead, so a card can come back. */
async function freshPage({ net = {} } = {}) {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: phone ? 844 : 1117 }, deviceScaleFactor: phone ? 2 : 1, hasTouch: true, isMobile: phone,
    locale: LANG === 'ja' ? 'ja-JP' : 'en-US', timezoneId: 'Asia/Tokyo', serviceWorkers: 'block' });
  await context.addInitScript(() => {
    try {
      const off = Number(localStorage.getItem('probe-clock-offset-ms') || 0);
      if (off) {
        const RealDate = Date; const now = () => RealDate.now() + off;
        window.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(now()); } static now() { return now(); } };
      }
    } catch { /* no clock shift */ }
    const media = HTMLMediaElement.prototype, play = media.play;
    media.play = function () { this.muted = true; this.volume = 0; return play.call(this); };
    window.__plays = 0;
    document.addEventListener('playing', (event) => { if (event.target?.matches?.('audio[data-speak-audio]') && event.target.duration > 0.2) window.__plays += 1; }, true);
    if (window.speechSynthesis) { const proto = Object.getPrototypeOf(window.speechSynthesis); proto.speak = function () {}; proto.cancel = function () {}; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { const connect = AudioNode.prototype.connect; AudioNode.prototype.connect = function (dest, ...rest) { if (dest instanceof AudioDestinationNode) { const gain = this.context.createGain(); gain.gain.value = 0; connect.call(this, gain); return connect.call(gain, dest, ...rest); } return connect.call(this, dest, ...rest); }; }
  });
  net.seen = { failed: 0, bank: 0, articles: 0 };
  await context.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (['http:', 'https:'].includes(u.protocol) && !['127.0.0.1', 'localhost'].includes(u.hostname)) return route.abort();
    const file = u.pathname.split('/').pop();
    if (/\/data\/articles\//.test(u.pathname)) {
      if ((net.fail || []).includes(file)) {
        net.seen.failed += 1;
        if (net.failMs) await new Promise((r) => setTimeout(r, net.failMs));
        return route.fulfill({ status: 404, body: 'gone' }).catch(() => {});
      }
      if (net.articleMs) { net.seen.articles += 1; await new Promise((r) => setTimeout(r, net.articleMs)); }
    }
    if (net.bankMs && /\/data\/proprietary_safe\/examples\//.test(u.pathname)) { net.seen.bank += 1; await new Promise((r) => setTimeout(r, net.bankMs)); }
    return route.continue().catch(() => {});
  });
  opened.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 200)));
  const sleep = (ms) => page.waitForTimeout(ms);
  const loc = (target) => (typeof target === 'string' ? page.locator(target).first() : target);
  const press = async (target, how = natural) => { const l = loc(target); if (how === 'touch') await l.tap(); else await l.click(); };
  const ready = async () => {
    await page.goto(`${ORIGIN}/?ui=${LANG === 'ja' ? 'ja' : 'bi'}`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 45000 });
    const ok = page.locator('button', { hasText: /^(OK|わかった)$/ }).first();
    if (await ok.isVisible().catch(() => false)) { await ok.click().catch(() => {}); await sleep(300); }
  };
  await ready();
  await press('#home-review'); await page.locator('#tab-me').waitFor(); await press('#tab-me'); await sleep(900);
  await page.locator('#me-settings').scrollIntoViewIfNeeded(); await press('#me-settings'); await sleep(700);
  await page.locator('#voice-pair-learner').scrollIntoViewIfNeeded();
  await page.locator('#voice-pair-learner').fill(`Bunki voice code: ${fake.issue({ learner: 'test-learner' })} (10 minutes) · learner: test-learner · server: ${fake.origin}`);
  await press('#voice-pair-submit');
  await page.waitForFunction(() => document.getElementById('settings-voice-server')?.dataset.paired === 'true', null, { timeout: 15000 });
  await page.evaluate(async () => { const m = await import('/corridor.js'); m.setWordPref(m.WORD_VOICE_KEY, 'wordVoice', m.WORD_VOICE, 'off'); });
  const toTab = async (tab) => {
    if (!(await page.locator(`#tab-${tab}`).isVisible().catch(() => false))) {
      if (!(await page.locator('#home-review').isVisible().catch(() => false))) await ready();
      await press('#home-review');
    }
    await page.locator(`#tab-${tab}`).waitFor(); await press(`#tab-${tab}`); await sleep(1200);
  };
  const shot = (name) => (SHOTS ? page.screenshot({ path: join(SHOTS, `${tag}-${name}.png`) }) : null);
  return { context, page, press, sleep, ready, toTab, shot, errors };
}

const audio = (page) => page.evaluate(() => {
  const a = document.querySelector('audio[data-speak-audio]');
  return { plays: window.__plays, playing: !!a && !a.paused && !a.ended && a.currentTime > 0, t: a ? Math.round(a.currentTime * 10) / 10 : null };
});
/** The review card as it stands: the face printed or blanked, its question-side control, and Show answer's box. */
const reviewFace = (page) => page.evaluate(async () => {
  const m = await import('/corridor.js'); const rv = m.S.review; const item = rv?.queue?.[rv?.ix];
  const face = document.querySelector('.review-face');
  const reveal = document.getElementById('reveal')?.getBoundingClientRect();
  const front = face?.querySelector('.review-front')?.getBoundingClientRect();
  return { card: item?.label ?? null, id: item?.id ?? null, reps: item ? (m.S.srs[m.srsKey(item.t, item.id)]?.reps ?? 0) : null, revealed: !!rv?.revealed,
    blank: !!face?.querySelector('.review-cloze'), printed: (face?.querySelector('.review-front')?.textContent || '').trim(),
    control: !!document.getElementById('card-say-front'), reveal: reveal ? { top: Math.round(reveal.top), left: Math.round(reveal.left) } : null,
    front: front ? { top: Math.round(front.top) } : null, scrollY: Math.round(scrollY) };
});

/** words saved with their sentence from the first article (the reader's box: Save → Review); returns the article's file */
async function saveWords(p, indexes) {
  const { page, press, sleep } = p;
  await p.ready();
  await press('#ginga-symbol'); await press('.bubble-shelf'); await page.locator('.shelf-open').first().waitFor();
  await press(page.locator('.shelf-open').first()); await page.locator('.reader .tok.content').first().waitFor(); await sleep(1500);
  for (let i = 0; i < 4 && (await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await page.keyboard.press('Escape'); await sleep(400); }
  const file = await page.evaluate(async () => { const m = await import('/corridor.js'); return m.D.passages.find((x) => x.id === m.S.passageId)?.file || null; });
  for (const index of indexes) {
    const word = page.locator('.reader .tok.content').nth(index);
    await word.scrollIntoViewIfNeeded();
    for (let i = 0; i < 4 && !(await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await press(word); await sleep(700); }
    await press('#mini-take'); await page.locator('#mini-review').waitFor(); await press('#mini-review'); await sleep(900);
    for (let i = 0; i < 3 && (await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await page.keyboard.press('Escape'); await sleep(400); }
  }
  return file;
}
async function startReview(p) { await p.toTab('today'); await p.press('#review-start'); await p.page.locator('.review-face').first().waitFor(); }

/** Watch a face-down review card for `ms`: every look, the first look's Show answer, whether the control came. */
async function watchFace(p, ms) {
  const looks = [];
  for (let t = Date.now(); Date.now() - t < ms;) {
    const f = await reviewFace(p.page); f.at = Date.now() - t; looks.push(f);
    if (f.control && looks.length > 1 && looks.at(-2).control) break;
    await p.sleep(250);
  }
  return looks;
}
/** What a settled printed face must show: no control before it settled, the control after, Show answer where it was. */
function settledProblems(looks, settledAt) {
  const problems = [];
  const first = looks[0];
  const last = looks.at(-1);
  if (!first) return ['no look at the face'];
  if (first.revealed || last.revealed) problems.push('the card was turned over');
  if (looks.some((f) => f.blank)) problems.push('the face was blanked (a sentence was found: the case needs a word with none)');
  if (!last.control) problems.push(`no question-side control after the face settled (${looks.length} looks over ${last.at} ms)`);
  if (settledAt != null && looks.some((f) => f.control && f.at < settledAt)) problems.push('a control stood before the face had settled');
  const moved = looks.filter((f) => f.reveal && first.reveal && (f.reveal.top !== first.reveal.top || f.reveal.left !== first.reveal.left || f.scrollY !== first.scrollY));
  if (moved.length) problems.push(`Show answer moved: ${JSON.stringify(first.reveal)} → ${JSON.stringify(moved[0].reveal)} (scroll ${first.scrollY} → ${moved[0].scrollY})`);
  return problems;
}

let failed = false;
const run = async (name, body) => {
  if (!ONLY.has(name)) return;
  try { await body(); } catch (error) { report(name, [`the run: ${String(error?.message || error).split('\n')[0].slice(0, 240)}`], null); }
  finally { for (const context of opened.splice(0)) await context.close().catch(() => {}); }
};

try {
  // ============================================================ I9 · the word box's 音, as it was
  await run('minivoice', async () => {
    clipSeconds = 3;
    const p = await freshPage();
    const { page } = p;
    await p.ready();
    await p.press('#ginga-symbol'); await p.press('.bubble-shelf'); await page.locator('.shelf-open').first().waitFor();
    await p.press(page.locator('.shelf-open').first()); await page.locator('.reader .tok.content').first().waitFor(); await p.sleep(1500);
    for (let i = 0; i < 4 && (await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await page.keyboard.press('Escape'); await p.sleep(400); }
    const word = page.locator('.reader .tok.content').nth(6);
    await word.scrollIntoViewIfNeeded();
    for (let i = 0; i < 4 && !(await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await p.press(word); await p.sleep(700); }
    await page.locator('#mini-voice').waitFor();
    const n = speaks().length;
    await p.press('#mini-voice');
    for (let t = Date.now(); Date.now() - t < 5000 && !(await audio(page)).playing;) await p.sleep(80);
    await p.sleep(700);
    const first = await audio(page);
    await p.press('#mini-voice');
    await p.sleep(900);
    const second = await audio(page);
    const problems = [];
    if (!first.playing) problems.push(`the first tap did not play (${JSON.stringify(first)})`);
    if (!second.playing) problems.push(`a second tap while it sounds stopped the word (${JSON.stringify(second)})`);
    if (second.plays < first.plays + 1) problems.push(`the second tap did not say the word again (plays ${first.plays} → ${second.plays})`);
    if (second.t != null && first.t != null && second.t >= first.t + 0.5) problems.push(`the word went on instead of starting again (t ${first.t} → ${second.t})`);
    report('I9 the word box’s 音: a second tap while its word sounds says it again from the top', problems, { first, second, sent: speaks().slice(n) });
    clipSeconds = 1.2;
  });

  // ============================================================ I10 · a saved sentence whose article fails
  await run('settle-saved', async () => {
    const net = {};
    const p = await freshPage({ net });
    const { page } = p;
    const file = await saveWords(p, [2]);
    if (!file) throw new Error('the open article has no file');
    // the article answers 404 after 6 s, so the face is up face-down while its load is still on its way
    net.fail = [file]; net.failMs = 6000;
    await p.ready();
    const n = speaks().length;
    await startReview(p);
    const looks = await watchFace(p, 12000);
    if (looks[0]?.control) looks[0].early = true;
    const settledAt = null;
    const problems = [];
    if (!net.seen.failed) problems.push('the saved sentence’s article was never asked for (nothing to check)');
    if (!looks[0]?.printed) problems.push('the face was not drawn printed');
    if (looks[0]?.early) problems.push('a control stood at once, while the saved sentence\u2019s article was still on its way');
    problems.push(...settledProblems(looks, settledAt));
    if (speaks().length !== n) problems.push(`sent without a tap: ${JSON.stringify(speaks().slice(n))}`);
    await p.shot('settle-saved');
    let tapped = null;
    if (looks.at(-1)?.control) {
      const m = speaks().length;
      await p.press('#card-say-front');
      for (let t = Date.now(); Date.now() - t < 4000 && speaks().length === m;) await p.sleep(100);
      const after = await reviewFace(page);
      tapped = { sent: speaks().slice(m), revealed: after.revealed };
      if (after.revealed) problems.push('the tap turned the card over');
      if (speaks().length !== m + 1) problems.push(`the tap sent ${JSON.stringify(speaks().slice(m))}, not one reading`);
    }
    report('I10 a word saved with its sentence whose article answers 404: the printed face gets its control once that load has failed', problems,
      { file, failedLoads: net.seen.failed, looks: looks.length, firstControlAt: looks.find((f) => f.control)?.at ?? null, card: looks[0]?.card, tapped });
  });

  // ============================================================ I10 · a second repetition with no example sentence
  await run('settle-second', async () => {
    const net = {};
    const p = await freshPage({ net });
    const { page } = p;
    // a word of the kanji world's lists that no shelf article holds and the example bank does not know: its second
    // repetition stays printed. Found once the shelf has arrived.
    await page.waitForFunction(async () => {
      const m = await import('/corridor.js');
      return !m.D.passages.some((x) => !x.tokens && !x.libraryCandidate && !String(x.file || '').startsWith('archive/') && m.D.libraryDiscoverable?.(x) !== false);
    }, null, { timeout: 60000, polling: 500 });
    const word = await page.evaluate(async () => {
      const m = await import('/corridor.js');
      const dict = await import('/modules/dictionary.mjs');
      // a plain compound of two or three kanji (a suffix such as ～会 has no stored reading of its own, so no control)
      const words = [...new Set(Object.values(m.D.kanjiWords || {}).flat())].filter((w) => typeof w === 'string' && /^\p{Script=Han}{2,3}$/u.test(w));
      for (const w of words) {
        if (dict.findExamples(w, 1).length) continue;
        let ix = null;
        try { ix = await dict.fetchExampleJson(`ex-${String(dict.exampleFnv(w)).padStart(2, '0')}.json`); } catch { continue; }
        if ((ix[w] || []).length) continue;
        return w;
      }
      return null;
    });
    if (!word) throw new Error('no word without an example sentence was found');
    // saved from its own page, as a learner does (Save → Review), then seen once and graded Good
    await page.evaluate(async (id) => { const m = await import('/corridor.js'); m.go({ t: 'word', id }); }, word);
    await page.locator('#sheet-take').waitFor(); await p.sleep(600);
    await p.press('#sheet-take'); await page.locator('#mini-review').waitFor(); await p.press('#mini-review'); await p.sleep(900);
    await startReview(p); await p.sleep(800);
    const once = await reviewFace(page);
    if (once.id !== word) throw new Error(`the first card is ${once.card}, not ${word}`);
    await p.press('#reveal'); await page.locator('.grade-row .grade.g-good').first().waitFor();
    await p.press('.grade-row .grade.g-good'); await p.sleep(1500);
    // forty days later it comes back, as its second repetition
    await page.evaluate(() => localStorage.setItem('probe-clock-offset-ms', String(40 * 86400000)));
    const rows = [];
    for (const [label, setting] of [['bank before the shelf', {}], ['one shelf article 404', { failOne: true }], ['bank after the shelf', { bankMs: 5500 }]]) {
      net.fail = []; net.bankMs = setting.bankMs || 0; net.seen = { failed: 0, bank: 0, articles: 0 };
      if (setting.failOne) {
        net.fail = [await page.evaluate(async (avoid) => {
          const m = await import('/corridor.js');
          return m.D.passages.filter((x) => x.file && !x.libraryCandidate && !String(x.file).startsWith('archive/') && m.D.libraryDiscoverable?.(x) !== false).map((x) => x.file).filter((f) => f !== avoid)[40];
        }, null)];
      }
      await p.ready();
      const n = speaks().length;
      await startReview(p);
      const looks = await watchFace(p, setting.bankMs ? 20000 : 16000);
      const problems = [];
      if (looks[0]?.id !== word) problems.push(`the card is ${looks[0]?.card}, not ${word}`);
      if (looks[0]?.reps % 2 !== 1) problems.push(`not a second repetition (reps ${looks[0]?.reps})`);
      if (!looks[0]?.printed) problems.push('the face was not drawn printed');
      problems.push(...settledProblems(looks, null));
      if (setting.failOne && !net.seen.failed) problems.push('the failing article was never asked for');
      if (setting.bankMs && !net.seen.bank) problems.push('no bank request was held');
      if (speaks().length !== n) problems.push(`sent without a tap: ${JSON.stringify(speaks().slice(n))}`);
      rows.push({ label, problems, firstControlAt: looks.find((f) => f.control)?.at ?? null, looks: looks.length, fail: net.fail, seen: { ...net.seen } });
      if (label === 'one shelf article 404') await p.shot('settle-second-404');
    }
    report('I10 a second repetition with no example sentence: the control comes once the search has settled, whatever settles last',
      rows.flatMap((r) => r.problems.map((x) => `${r.label}: ${x}`)), { word, rows });
  });
} finally {
  await browser.close().catch(() => {});
  await fake.close?.().catch?.(() => {});
  server.close();
  failed = results.some((r) => !r.pass);
  console.log(`${results.filter((r) => r.pass).length} of ${results.length} cases pass (${tag})`);
  process.exit(failed ? 1 : 0);
}
