/** Card audio, fix round 1 (voice/card-audio-20261111 after its review of 4f1cd736b): what a tap, a key and a slow load
 * may and may not do to a study card. Muted and headless, loopback only, against a built site and the repository's
 * silent stand-in voice server (fake-voice-server.mjs). No sound, no real voice server, no token or pairing code.
 *
 *   node prototypes/corridor/tools/verify-card-audio-taps.mjs --site <built site> [--engine webkit|chromium]
 *        [--width 390|1728] [--lang en|ja] [--port 19574] [--only practice,keys,...] [--shots <dir>]
 *
 * Every page is paired with the stand-in through the app's own Settings, and 声 (a card's answer said by itself) is off
 * unless a case says otherwise, so that every request the stand-in logs comes from a tap. Nothing is staged: the cards are
 * the ones the app draws (a kanji saved from its own page, words saved from an article, the first deck).
 *
 *  practice   F1 · a practice block (Learn → Kanji only → Start) draws a saved one-reading kanji face-down with its
 *             control; a tap on that control keeps the card face-down and asks for the stored reading, once.
 *  keys-review F5 · a key on a focused audio control of the review card (front, in a practice block, and back) does
 *             the control's action and nothing else; after a pointer or touch activation focus is not left on the
 *             control, so Space does what it did before the tap (turns the card, grades it).
 *  keys-deck  F6 · the same on the deck card (front and back), whose player takes Space and Enter on the document.
 *  deck-row   F2 · the deck answer's word type stays on the word's line; the control keeps a 44 px tap target.
 *  sweep      F7 · "a tap only speaks": #card-say-front, #card-say, a card-example mark, #kp-listen-front and
 *             #kp-listen-word, each by pointer, by touch and by keyboard (focused, Enter): it speaks, and revealed,
 *             graded, folded and focused state are the same before and after (focus aside for the keyboard).
 *  reveal-tap F3 · 声 on: a tap while the answer's word says itself ends that and starts the control's own turn (the
 *             reading, then the sentence); a tap during the control's own turn stops it. Review card and deck card.
 *  unsettled  F4 · words saved with their sentence, a fresh load with the article held 6 s: no question-side control
 *             while the face is not settled, a tap where it would stand sends nothing, and the settled face is blanked.
 *  deck-wait  F7 · 穴埋め (blanked) and 4択 (choices): no question-side control, counted after the reading's wait.
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
const PORT = Number(arg('--port', '19574'));
const SHOTS = arg('--shots', '');
const ONLY = new Set(String(arg('--only', 'practice,keys-review,keys-deck,deck-row,sweep,reveal-tap,unsettled,deck-wait')).split(',').filter(Boolean));
// the combine (I8): `--ear held` holds the ear (耳) on just before each card screen opens (Today or Learn has its mark; the
// card screens have none, so the ear rests off there); every state compared before and after a tap then includes the ear's
const EAR = arg('--ear', 'off');
if (!SITE) { console.error('usage: verify-card-audio-taps.mjs --site <built site>'); process.exit(2); }
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
  console.log(JSON.stringify({ case: name, engine: ENGINE, width: WIDTH, lang: LANG, ...(EAR !== 'off' ? { ear: EAR } : {}), pass: !problems.length, problems, detail }));
};
const tag = `${ENGINE}-${WIDTH}-${LANG}`;
const opened = [];

/** A fresh, silent page that can be pressed by pointer and by touch: every media element muted, the device voice
 * swallowed, Web Audio at gain 0, nothing off this machine; paired with the stand-in; 声 as asked. */
async function freshPage({ bySelf = 'off', holdArticles = null } = {}) {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: phone ? 844 : 1117 }, deviceScaleFactor: phone ? 2 : 1, hasTouch: true, isMobile: phone,
    locale: LANG === 'ja' ? 'ja-JP' : 'en-US', timezoneId: 'Asia/Tokyo', serviceWorkers: 'block' });
  await context.addInitScript(() => {
    const media = HTMLMediaElement.prototype, play = media.play;
    media.play = function () { this.muted = true; this.volume = 0; (window.__plays ||= []).push(Date.now()); return play.call(this); };
    if (window.speechSynthesis) { const proto = Object.getPrototypeOf(window.speechSynthesis); proto.speak = function () {}; proto.cancel = function () {}; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { const connect = AudioNode.prototype.connect; AudioNode.prototype.connect = function (dest, ...rest) { if (dest instanceof AudioDestinationNode) { const gain = this.context.createGain(); gain.gain.value = 0; connect.call(this, gain); return connect.call(gain, dest, ...rest); } return connect.call(this, dest, ...rest); }; }
  });
  await context.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (['http:', 'https:'].includes(u.protocol) && !['127.0.0.1', 'localhost'].includes(u.hostname)) return route.abort();
    if (holdArticles?.on && /\/data\/articles\//.test(u.pathname)) { holdArticles.held += 1; await new Promise((r) => setTimeout(r, holdArticles.ms)); }
    return route.continue();
  });
  opened.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 200)));
  const sleep = (ms) => page.waitForTimeout(ms);
  const loc = (target) => (typeof target === 'string' ? page.locator(target).first() : target);
  /** pointer: a mouse click; touch: a tap (touch events); default: the width's own (touch on a phone). */
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
  await page.evaluate(async (value) => { const m = await import('/corridor.js'); m.setWordPref(m.WORD_VOICE_KEY, 'wordVoice', m.WORD_VOICE, value); }, bySelf);
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

/* ------------------------------------------------------------------ what the page holds */
const focusOf = () => { const a = document.activeElement; return a && a !== document.body && a !== document.documentElement ? `${a.tagName.toLowerCase()}#${a.id}.${String(a.className).split(' ')[0]}` : 'body'; };
const reviewState = (page) => page.evaluate(async (focusSrc) => {
  const m = await import('/corridor.js'); const rv = m.S.review;
  return { view: m.S.view, card: rv?.queue?.[rv?.ix]?.label ?? null, ix: rv?.ix ?? null, revealed: !!rv?.revealed, graded: rv?.history?.length ?? null,
    folded: !rv?.moreOpen, focus: new Function(`return (${focusSrc})()`)(), ear: document.documentElement.dataset.ear || '' };
}, focusOf.toString());
const deckState = (page) => page.evaluate((focusSrc) => {
  const c = document.querySelector('#kp-card');
  return { card: c?.dataset.card ?? null, revealed: !!c?.querySelector('.kp-answer'),
    pressed: [...document.querySelectorAll('.kp [aria-pressed="true"]:not(.card-voice):not(.voice-say)')].map((b) => b.textContent.trim()).join('|'),
    folded: [...document.querySelectorAll('.kp [aria-expanded]')].map((b) => b.getAttribute('aria-expanded')).join('|'),
    focus: new Function(`return (${focusSrc})()`)(), ear: document.documentElement.dataset.ear || '' };
}, focusOf.toString());
const lit = (page, sel) => page.evaluate((sel) => { const b = document.querySelector(sel); return !!b && (b.classList.contains('is-speaking') || b.getAttribute('aria-busy') === 'true'); }, sel);
const anyLit = (page) => page.evaluate(() => !!document.querySelector('.is-speaking'));
const plays = (page) => page.evaluate(() => (window.__plays || []).length);
/** it spoke: a request went to the stand-in, or the control lit, within 2.5 s */
async function spoke(page, sel, n0) {
  for (let t = Date.now(); Date.now() - t < 2500;) {
    if (speaks().length > n0 || (await lit(page, sel))) return true;
    await page.waitForTimeout(100);
  }
  return false;
}
/** wait until nothing is speaking (clips are short here) */
async function quiet(page) {
  for (let t = Date.now(); Date.now() - t < 9000;) { if (!(await anyLit(page))) return true; await page.waitForTimeout(150); }
  return false;
}
const same = (a, b, keys) => keys.filter((k) => a[k] !== b[k]).map((k) => `${k} ${JSON.stringify(a[k])} → ${JSON.stringify(b[k])}`);

/* ------------------------------------------------------------------ the app's own ways to the cards */
/** a kanji saved from its own page (Save → Review), as a learner does */
async function saveKanji(p, ch) {
  await p.page.goto(`${ORIGIN}/?ui=${LANG === 'ja' ? 'ja' : 'bi'}&kanji=${encodeURIComponent(ch)}`, { waitUntil: 'load' });
  await p.page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 45000 });
  await p.page.locator('#sheet-take').waitFor(); await p.sleep(600);
  await p.press('#sheet-take'); await p.page.locator('#mini-review').waitFor(); await p.press('#mini-review'); await p.sleep(900);
}
/** Learn → Kanji only → Start: the practice block draws its pool, the saved kanji first */
async function startKanjiBlock(p) {
  await p.ready(); await p.toTab('learn'); await holdHere(p);
  const mode = p.page.locator('.focus-mode', { hasText: /Kanji only|漢字だけ/ }).first();
  await mode.scrollIntoViewIfNeeded(); await p.press(mode); await p.sleep(400);
  const start = p.page.locator('.focus-start').first(); await start.scrollIntoViewIfNeeded(); await p.press(start);
  await p.page.locator('.review-face').first().waitFor(); await p.sleep(1200);
}
/** words saved with their sentence from the first article (the reader's box: Save → Review) */
async function saveWords(p, indexes) {
  const { page, press, sleep } = p;
  await p.ready();
  await press('#ginga-symbol'); await press('.bubble-shelf'); await page.locator('.shelf-open').first().waitFor();
  await press(page.locator('.shelf-open').first()); await page.locator('.reader .tok.content').first().waitFor(); await sleep(1500);
  for (let i = 0; i < 4 && (await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await page.keyboard.press('Escape'); await sleep(400); }
  for (const index of indexes) {
    const word = page.locator('.reader .tok.content').nth(index);
    await word.scrollIntoViewIfNeeded();
    for (let i = 0; i < 4 && !(await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await press(word); await sleep(700); }
    await press('#mini-take'); await page.locator('#mini-review').waitFor(); await press('#mini-review'); await sleep(900);
    for (let i = 0; i < 3 && (await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await page.keyboard.press('Escape'); await sleep(400); }
  }
}
/** `--ear held`: a long press on the ear's mark of this screen, as a learner holds it on (the mouse held down on a wide
 * window; on a phone the pointer events the mark listens to, as the ear review's harness does it in WebKit). */
async function holdHere(p) {
  if (EAR !== 'held') return;
  const { page } = p;
  const box = await page.evaluate(() => {
    for (const mark of document.querySelectorAll('.ear-mark')) { const r = mark.getBoundingClientRect(); if (r.width && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.ear-mark') === mark) return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
    return null;
  });
  if (!box) throw new Error('no ear mark to hold on this screen');
  if (phone) {
    await page.evaluate(({ x, y }) => { const mark = document.elementFromPoint(x, y).closest('.ear-mark'); mark.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: true, pointerType: 'touch', button: 0 })); }, box);
    await p.sleep(700);
    await page.evaluate(({ x, y }) => { const mark = document.elementFromPoint(x, y).closest('.ear-mark'); mark.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, isPrimary: true, pointerType: 'touch', button: 0 })); mark.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); }, box);
  } else { await page.mouse.move(box.x, box.y); await page.mouse.down(); await p.sleep(700); await page.mouse.up(); await page.mouse.move(4, 400); }
  await page.waitForFunction(() => document.documentElement.dataset.ear === 'held', null, { timeout: 4000 });
}
async function startReview(p) { await p.toTab('today'); await holdHere(p); await p.press('#review-start'); await p.page.locator('.review-face').first().waitFor(); await p.sleep(1000); }
async function startDeck(p) { await p.ready(); await p.toTab('learn'); await p.sleep(600); await holdHere(p); await p.press('.learn-go-deck'); await p.page.locator('#kp-card').waitFor(); await p.sleep(2500); }

let failed = false;
const run = async (name, body) => {
  if (!ONLY.has(name)) return;
  try { await body(); } catch (error) { report(name, [`the run: ${String(error?.message || error).split('\n')[0].slice(0, 240)}`], null); }
  finally { for (const context of opened.splice(0)) await context.close().catch(() => {}); }
};

try {
  // ============================================================ F1 · the practice block as the app draws it
  await run('practice', async () => {
    const p = await freshPage();
    await saveKanji(p, '週');
    await startKanjiBlock(p);
    const before = await reviewState(p.page);
    const control = await p.page.evaluate(() => document.getElementById('card-say-front')?.dataset.voiceText || null);
    await p.shot('practice-1-face-down');
    const n = speaks().length;
    const problems = [];
    if (before.view !== 'review' || before.revealed) problems.push(`not a face-down card: ${JSON.stringify(before)}`);
    if (!control) problems.push(`no question-side control on ${before.card}`);
    else {
      await p.press('#card-say-front'); await p.sleep(1500);
      await p.shot('practice-2-after-tap');
      const after = await reviewState(p.page);
      const sent = speaks().slice(n);
      if (after.revealed) problems.push('the tap turned the card over');
      if (after.graded !== before.graded || after.ix !== before.ix) problems.push('the tap moved the block on');
      if (!(await p.page.locator('#reveal').count())) problems.push('Show answer is gone');
      if (sent.length !== 1 || sent[0] !== control) problems.push(`sent ${JSON.stringify(sent)}, want [${control}] once`);
    }
    report('F1 practice block: a tap on the question-side control keeps the card face-down and asks for its reading once', problems, { card: before.card, control, sent: speaks().slice(n) });
    return p;
  });

  // ============================================================ F5, F6 · keys on the controls, and after a tap
  await run('keys-review', async () => {
    const p = await freshPage();
    const { page } = p;
    await saveKanji(p, '週'); await saveKanji(p, '駅');
    await startKanjiBlock(p);
    // a keyboard user on the question side: the control's action and nothing else
    {
      const problems = [];
      const s0 = await reviewState(page);
      const n = speaks().length;
      await page.locator('#card-say-front').focus();
      await page.keyboard.press('Enter'); await p.sleep(1200);
      const s1 = await reviewState(page);
      if (!(speaks().length > n || (await lit(page, '#card-say-front')))) problems.push('Enter on the focused control said nothing');
      problems.push(...same(s0, s1, ['revealed', 'ix', 'graded']).map((d) => `Enter: ${d}`));
      await page.keyboard.press(' '); await p.sleep(700);
      const s2 = await reviewState(page);
      problems.push(...same(s0, s2, ['revealed', 'ix', 'graded']).map((d) => `Space: ${d}`));
      if (await lit(page, '#card-say-front')) problems.push('Space on the speaking control did not stop it');
      report('F5 review front: Enter and Space on the focused control do its action and nothing else', problems, { card: s0.card, sent: speaks().slice(n) });
    }
    await quiet(page);
    // a tap on the question side, then Space: the card turns, as Space did before the tap
    {
      const problems = [];
      await page.evaluate(() => document.activeElement?.blur?.());
      if (!(await page.locator('#card-say-front').count())) throw new Error('#card-say-front is gone before the tap (the keys above turned the card)');
      await p.press('#card-say-front'); await p.sleep(900);
      const s1 = await reviewState(page);
      if (s1.focus !== 'body') problems.push(`focus stayed on ${s1.focus}`);
      await page.keyboard.press(' '); await p.sleep(1200);
      const s2 = await reviewState(page);
      if (!s2.revealed) problems.push('Space after the tap did not turn the card');
      report(`F5 review front: after a ${natural} tap Space turns the card`, problems, { focusAfterTap: s1.focus, revealedAfterSpace: s2.revealed });
    }
    await quiet(page);
    // the answer side: Enter on the focused control speaks and does not grade; after a tap Space grades
    {
      const problems = [];
      const s0 = await reviewState(page);
      if (!s0.revealed || !(await page.locator('#card-say').count())) problems.push(`no answer side with #card-say: ${JSON.stringify(s0)}`);
      else {
        const n = speaks().length;
        await page.locator('#card-say').focus();
        await page.keyboard.press('Enter'); await p.sleep(1200);
        const s1 = await reviewState(page);
        if (!(speaks().length > n || (await lit(page, '#card-say')))) problems.push('Enter on the focused control said nothing');
        problems.push(...same(s0, s1, ['revealed', 'ix', 'graded']).map((d) => `Enter: ${d}`));
        await page.keyboard.press(' '); await p.sleep(700);
        const s2 = await reviewState(page);
        problems.push(...same(s0, s2, ['revealed', 'ix', 'graded']).map((d) => `Space: ${d}`));
        await quiet(page);
        await page.evaluate(() => document.activeElement?.blur?.());
        await p.press('#card-say'); await p.sleep(900);
        const s3 = await reviewState(page);
        if (s3.focus !== 'body') problems.push(`focus stayed on ${s3.focus} after the tap`);
        await page.keyboard.press(' '); await p.sleep(1500);
        const s4 = await reviewState(page);
        if (s4.graded === s0.graded && s4.ix === s0.ix) problems.push('Space after the tap did not grade');
      }
      report('F5 review back: Enter and Space on the focused control speak and never grade; after a tap Space grades', problems, null);
    }
    return p;
  });
  await run('keys-deck', async () => {
    const p = await freshPage();
    const { page } = p;
    await startDeck(p);
    {
      const problems = [];
      const d0 = await deckState(page);
      if (!(await page.locator('#kp-listen-front').count())) problems.push(`no #kp-listen-front on ${d0.card}`);
      else {
        const n = speaks().length;
        await page.locator('#kp-listen-front').focus();
        await page.keyboard.press('Enter'); await p.sleep(1200);
        const d1 = await deckState(page);
        if (!(speaks().length > n || (await lit(page, '#kp-listen-front')))) problems.push('Enter on the focused control said nothing');
        problems.push(...same(d0, d1, ['card', 'revealed']).map((d) => `Enter: ${d}`));
        await page.keyboard.press(' '); await p.sleep(700);
        const d2 = await deckState(page);
        problems.push(...same(d0, d2, ['card', 'revealed']).map((d) => `Space: ${d}`));
        await quiet(page);
        await page.evaluate(() => document.activeElement?.blur?.());
        if (await page.locator('#kp-listen-front').count()) {
        await p.press('#kp-listen-front'); await p.sleep(900);
        const d3 = await deckState(page);
        if (d3.focus !== 'body') problems.push(`focus stayed on ${d3.focus} after the tap`);
        await page.keyboard.press(' '); await p.sleep(1200);
        const d4 = await deckState(page);
        if (!d4.revealed) problems.push('Space after the tap did not show the answer');
        } else problems.push('the control is gone: the keys showed the answer');
      }
      report('F6 deck front: Enter and Space on the focused control speak and never show the answer; after a tap Space shows it', problems, { card: d0.card });
    }
    await quiet(page);
    {
      const problems = [];
      const d0 = await deckState(page);
      if (!d0.revealed || !(await page.locator('#kp-listen-word').count())) problems.push(`no answer side with #kp-listen-word: ${JSON.stringify(d0)}`);
      else {
        const n = speaks().length;
        await page.locator('#kp-listen-word').focus();
        await page.keyboard.press('Enter'); await p.sleep(1200);
        const d1 = await deckState(page);
        if (!(speaks().length > n || (await lit(page, '#kp-listen-word')))) problems.push('Enter on the focused control said nothing');
        problems.push(...same(d0, d1, ['card', 'revealed']).map((d) => `Enter: ${d}`));
        await page.keyboard.press(' '); await p.sleep(700);
        const d2 = await deckState(page);
        problems.push(...same(d0, d2, ['card', 'revealed']).map((d) => `Space: ${d}`));
        await quiet(page);
        await page.evaluate(() => document.activeElement?.blur?.());
        await p.press('#kp-listen-word'); await p.sleep(900);
        const d3 = await deckState(page);
        if (d3.focus !== 'body') problems.push(`focus stayed on ${d3.focus} after the tap`);
      }
      report('F6 deck back: Enter and Space on the focused control speak and never move the card; a tap leaves no focus on it', problems, { card: d0.card });
    }
    return p;
  });

  // ============================================================ F2 · the deck answer's row
  await run('deck-row', async () => {
    const p = await freshPage();
    await startDeck(p);
    await p.press('#kp-reveal'); await p.sleep(1800);
    await p.shot('deck-answer');
    const row = await p.page.evaluate(() => {
      const box = (n) => { if (!n) return null; const r = n.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) }; };
      const word = document.querySelector('#kp-card .kp-word');
      const control = document.getElementById('kp-listen-word');
      const c = box(control);
      const hit = c ? document.elementFromPoint((c.left + c.right) / 2, (c.top + c.bottom) / 2) : null;
      return { term: box(word?.querySelector('.kp-term')), badge: box(word?.querySelector('.kp-posbadge')), badgeText: word?.querySelector('.kp-posbadge')?.textContent || null,
        control: c, hitsControl: !!hit && (hit === control || control?.contains(hit)), card: box(document.querySelector('#kp-card')) };
    });
    const problems = [];
    if (!row.term || !row.badge) problems.push('no word or no word type on the answer');
    else if (!(row.badge.top < row.term.bottom)) problems.push(`the word type (${row.badgeText}) is on a line of its own: top ${row.badge.top}, the word's bottom ${row.term.bottom}`);
    if (!row.control) problems.push('no #kp-listen-word');
    else {
      if (row.control.w < 44 || row.control.h < 44) problems.push(`tap target ${row.control.w}x${row.control.h}`);
      if (!row.hitsControl) problems.push('the middle of the control is covered by something else');
      const mid = (row.control.top + row.control.bottom) / 2;
      if (row.term && !(mid > row.term.top && mid < row.term.bottom)) problems.push(`the control is not on the word's line (middle ${mid}, word ${row.term.top}–${row.term.bottom})`);
      if (row.card && row.control.right > row.card.right) problems.push(`the control runs out of the card (${row.control.right} > ${row.card.right})`);
    }
    report('F2 deck answer: the word type stays on the word line; the control keeps a 44 px tap target on that line', problems, row);
    return p;
  });

  // ============================================================ F7 · "a tap only speaks", five controls, pointer and touch
  await run('sweep', async () => {
    const p = await freshPage();
    const { page } = p;
    clipSeconds = 0.8;
    const rows = [];
    const tapOnly = async (label, sel, stateOf, ways = ['pointer', 'touch', 'keyboard']) => {
      for (const how of ways) {
        await quiet(page);
        await page.evaluate(() => document.activeElement?.blur?.());
        if (!(await page.locator(sel).count())) { rows.push({ label, how, problems: [`${sel} is not there`] }); continue; }
        await page.locator(sel).first().scrollIntoViewIfNeeded();
        const s0 = await stateOf(page);
        const n = speaks().length, k = await plays(page);
        if (how === 'keyboard') { await page.locator(sel).first().focus(); await page.keyboard.press('Enter'); }
        else await p.press(sel, how);
        const said = await spoke(page, sel, n);
        await p.sleep(500);
        const s1 = await stateOf(page);
        // a keyboard user's focus stays on the control he tabbed to; everything else is as it was
        const problems = same(s0, s1, Object.keys(s0).filter((k) => how !== 'keyboard' || k !== 'focus'));
        // held on before the card screen opened: the screen has no ear mark, so the ear rests off there
        if (EAR === 'held' && s0.ear !== 'off') problems.push(`the ear is ${s0.ear} on the card screen`);
        if (!said && (await plays(page)) === k) problems.push('it did not speak');
        rows.push({ label, how, problems });
      }
    };
    // the practice block (its face turns over on any click): the question side
    await saveKanji(p, '週');
    await startKanjiBlock(p);
    await tapOnly('#card-say-front (practice block)', '#card-say-front', reviewState);
    // the review: words saved with their sentence, the answer side and the sentences under its fold
    await saveWords(p, [2, 6, 10, 14]);
    await startReview(p);
    let example = false;
    for (let i = 0; i < 4 && !example; i += 1) {
      if (!(await reviewState(page)).revealed) { await p.press('#reveal'); await p.sleep(1500); }
      if (i === 0) await tapOnly('#card-say (review)', '#card-say', reviewState);
      if (await page.locator('#review-fold').count()) {
        if ((await page.locator('#review-fold').getAttribute('aria-expanded')) !== 'true') { await p.press('#review-fold'); await p.sleep(900); }
        if (await page.locator('.review-more [data-voice-say="card-example"]').count()) {
          example = true;
          await tapOnly('card-example mark (review, fold open)', '.review-more [data-voice-say="card-example"]', reviewState);
          break;
        }
      }
      await quiet(page);
      await p.press('.grade-row .grade.g-good'); await p.sleep(1500);
    }
    if (!example) rows.push({ label: 'card-example mark', how: '-', problems: ['no card with a sentence under its fold among the first four'] });
    // the deck card
    await startDeck(p);
    await tapOnly('#kp-listen-front (deck)', '#kp-listen-front', deckState);
    await quiet(page);
    if (await page.locator('#kp-reveal').count()) { await p.press('#kp-reveal'); await p.sleep(1500); }
    else rows.push({ label: '#kp-listen-front (deck)', how: 'all', problems: ['Show answer was gone after its presses (the card was shown)'] });
    await tapOnly('#kp-listen-word (deck)', '#kp-listen-word', deckState);
    const problems = rows.flatMap((r) => r.problems.map((x) => `${r.label} by ${r.how}: ${x}`));
    report('F7 a tap only speaks: five controls by pointer, touch and keyboard leave revealed, graded, folded and focused state as they were', problems, rows.map((r) => `${r.label}/${r.how}: ${r.problems.length ? 'FAIL' : 'ok'}`));
    clipSeconds = 1.2;
    return p;
  });

  // ============================================================ F3 · a tap while the answer's word says itself
  await run('reveal-tap', async () => {
    const p = await freshPage({ bySelf: 'on' });
    const { page } = p;
    clipSeconds = 3;
    await saveWords(p, [2, 6]);
    await startReview(p);
    {
      const problems = [];
      const n0 = speaks().length;
      await p.press('#reveal');
      // the word says itself: wait for it to sound, then tap
      for (let t = Date.now(); Date.now() - t < 4000 && !(await lit(page, '#card-say')); ) await p.sleep(100);
      const auto = speaks().slice(n0);
      if (!(await lit(page, '#card-say'))) problems.push('the answer did not say its word by itself (声 on)');
      await p.sleep(400);
      const n1 = speaks().length, k1 = await plays(page);
      const sentence = await page.evaluate(() => { const n = document.querySelector('.review-face p.review-cloze'); if (!n) return ''; const c = n.cloneNode(true); for (const x of c.querySelectorAll('button, rt, rp, .say-note, .voice-note')) x.remove(); return c.textContent.replace(/\s+/g, ''); });
      await p.press('#card-say'); await p.sleep(1400);
      const sent = speaks().slice(n1);
      const litAfter = await lit(page, '#card-say');
      if (!litAfter) problems.push('the tap during the word said by itself left the control silent');
      if (sentence && !sent.some((t) => sentence.includes(t.replace(/\s+/g, '')) || t.replace(/\s+/g, '').includes(sentence.slice(0, 6)))) problems.push(`the sentence was not asked for after the tap (sent ${JSON.stringify(sent)})`);
      for (let t = Date.now(); Date.now() - t < 3500 && (await plays(page)) < k1 + 1; ) await p.sleep(100);
      if ((await plays(page)) < k1 + 1) problems.push('nothing played after the tap');
      await p.press('#card-say'); await p.sleep(600);
      if (await lit(page, '#card-say')) problems.push('a tap during its own turn did not stop it');
      report('F3 review: a tap while the word says itself starts the control’s own turn; a tap during that turn stops it', problems, { auto, afterTap: sent, sentence: sentence.slice(0, 20) });
    }
    await quiet(page);
    await startDeck(p);
    {
      const problems = [];
      await p.press('#kp-reveal');
      for (let t = Date.now(); Date.now() - t < 4000 && !(await lit(page, '#kp-listen-word')); ) await p.sleep(100);
      if (!(await lit(page, '#kp-listen-word'))) problems.push('the deck answer did not say its word by itself (声 on)');
      await p.sleep(400);
      const n1 = speaks().length, k1 = await plays(page);
      await p.press('#kp-listen-word'); await p.sleep(1400);
      const sent = speaks().slice(n1);
      if (!(await lit(page, '#kp-listen-word'))) problems.push('the tap during the word said by itself left the control silent');
      if (!sent.length) problems.push('nothing after the word was asked for (the sentence, the definition)');
      for (let t = Date.now(); Date.now() - t < 3500 && (await plays(page)) < k1 + 1; ) await p.sleep(100);
      if ((await plays(page)) < k1 + 1) problems.push('nothing played after the tap');
      await p.press('#kp-listen-word'); await p.sleep(600);
      if (await lit(page, '#kp-listen-word')) problems.push('a tap during its own turn did not stop it');
      report('F3 deck: a tap while the word says itself starts the control’s own turn; a tap during that turn stops it', problems, { afterTap: sent.map((t) => t.slice(0, 12)) });
    }
    clipSeconds = 1.2;
    return p;
  });

  // ============================================================ F4 · a face that is not settled carries no control
  await run('unsettled', async () => {
    const hold = { on: false, ms: 6000, held: 0 };
    const p = await freshPage({ holdArticles: hold });
    const { page } = p;
    await saveWords(p, [2, 6]);
    await p.sleep(1500);
    hold.on = true;
    await p.ready();
    await p.toTab('today');
    await p.press('#review-start'); await page.locator('.review-face').first().waitFor();
    const t0 = Date.now();
    const n = speaks().length;
    const seen = [];
    let tapped = false;
    const face = () => page.evaluate(() => ({ blank: /＿＿/.test(document.querySelector('.review-face')?.textContent || ''), printed: (document.querySelector('.review-face .review-front')?.textContent || '').trim(),
      control: !!document.getElementById('card-say-front') }));
    while (Date.now() - t0 < 4500) {
      const f = await face();
      seen.push(f);
      if (!tapped && f.printed && !f.blank) {
        tapped = true;
        await p.shot('unsettled-held');
        if (f.control) await p.press('#card-say-front').catch(() => {});
        else {
          // where the control would stand: under the printed word
          const box = await page.locator('.review-face .review-front').first().boundingBox();
          if (box) await (natural === 'touch' ? page.touchscreen.tap(box.x + box.width / 2, box.y + box.height + 24) : page.mouse.click(box.x + box.width / 2, box.y + box.height + 24));
        }
      }
      await p.sleep(250);
    }
    const duringHold = speaks().slice(n);
    let settled = null;
    for (let t = Date.now(); Date.now() - t < 12000; ) { const f = await face(); if (f.blank) { settled = f; break; } await p.sleep(200); }
    await p.sleep(800);
    const end = await face();
    const problems = [];
    if (!hold.held) problems.push('no article request was held');
    if (!seen.some((f) => f.printed && !f.blank)) problems.push('the face was never drawn printed while the article was held (nothing to check)');
    if (seen.some((f) => f.control)) problems.push(`a question-side control stood on the unsettled face (${seen.filter((f) => f.control).length} of ${seen.length} looks)`);
    if (duringHold.length) problems.push(`a tap there sent ${JSON.stringify(duringHold)}`);
    if (!settled) problems.push('the face never settled on the blanked one');
    if (end.control) problems.push('a control stands on the blanked face');
    if (speaks().length !== n) problems.push(`sent ${JSON.stringify(speaks().slice(n))}`);
    report('F4 a word saved with its sentence, its article held 6 s: no control until the face is settled, and nothing sent', problems,
      { held: hold.held, looks: seen.length, printedLooks: seen.filter((f) => f.printed && !f.blank).length, withControl: seen.filter((f) => f.control).length, sent: speaks().slice(n) });
    hold.on = false;
    return p;
  });

  // ============================================================ F7 · 穴埋め and 4択: counted after the wait
  await run('deck-wait', async () => {
    const p = await freshPage();
    const { page } = p;
    const problems = [];
    for (const mode of ['self', 'choice']) {
      await page.evaluate((mode) => { for (const id of ['n2', 'n1', 'kotoba-master', 'kotoba-mcd', 'kotoba-mine', 'context-dense', 'senmon', 'personal']) localStorage.setItem(`bunki-cloze:prefs:v3:${id}`, JSON.stringify({ mode })); }, mode);
      const n = speaks().length;
      await startDeck(p);
      await p.sleep(3000); // the stored reading's fetch has long answered
      const g = await page.evaluate(() => { const c = document.querySelector('#kp-card'); return { blank: !!c?.querySelector('.kp-blank'), choices: !!c?.querySelector('.kp-choices'),
        controls: [...document.querySelectorAll('#kp-card .card-voice, #kp-card .voice-say, #kp-card #kp-listen-front, #kp-card #kp-listen-word')].filter((b) => b.getBoundingClientRect().width > 0).length,
        lines: document.querySelectorAll('#kp-card .say-note').length }; });
      if (mode === 'self' && !g.blank) problems.push('穴埋め: the face has no blank');
      if (mode === 'choice' && !g.choices) problems.push('4択: the face has no choices');
      if (g.controls) problems.push(`${mode}: ${g.controls} control(s) after the wait`);
      if (g.lines) problems.push(`${mode}: ${g.lines} line(s)`);
      if (speaks().length !== n) problems.push(`${mode}: a request without a tap`);
    }
    report('F7 deck 穴埋め and 4択: no question-side control after the reading’s wait, no line, nothing requested', problems, null);
    return p;
  });
} catch (error) {
  console.log(JSON.stringify({ case: 'run', pass: false, detail: String(error?.message || error).split('\n')[0].slice(0, 300) }));
  failed = true;
} finally {
  await browser.close(); server.close(); await fake.close?.();
}
failed ||= results.some((r) => !r.pass);
console.log(`${results.filter((r) => r.pass).length} of ${results.length} pass (${ENGINE}, ${WIDTH}, ${LANG})`);
process.exit(failed ? 1 : 0);
