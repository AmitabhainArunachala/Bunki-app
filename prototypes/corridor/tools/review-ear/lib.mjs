// The independent review of the ear (2026-11-11): a silent harness for its browser checks.
// Chromium (--mute-audio) or WebKit (headless), loopback only, the stand-in voice server (silent WAVs, no provider, no
// real token), every media element forced muted, the device voice swallowed, Web Audio through gain 0. The site is a
// build of the head served on 127.0.0.1 (REVIEW_BASE); nothing leaves this machine and nothing makes a sound.
import { chromium, webkit } from '../../../../node_modules/playwright-core/index.mjs';
import { startFakeVoiceServer } from '../fake-voice-server.mjs';

export const BASE = process.env.REVIEW_BASE || 'http://127.0.0.1:19530/';
export const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };

function quiet() {
  const push = (kind, detail = {}) => { (window.__sound ||= []).push({ kind, at: Date.now(), ...detail }); };
  try {
    const media = HTMLMediaElement.prototype, play = media.play;
    media.play = function () { this.muted = true; this.volume = 0; push('audio-play', { src: String(this.currentSrc || this.src || '').slice(0, 60) }); return play.call(this); };
    if (window.speechSynthesis) { const proto = Object.getPrototypeOf(window.speechSynthesis); proto.speak = function () { push('device-voice'); }; proto.cancel = function () {}; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { const connect = AudioNode.prototype.connect; AudioNode.prototype.connect = function (dest, ...rest) { if (dest instanceof AudioDestinationNode) { const gain = this.context.createGain(); gain.gain.value = 0; connect.call(this, gain); return connect.call(gain, dest, ...rest); } return connect.call(this, dest, ...rest); }; }
  } catch (error) { push('probe-error', { message: String(error) }); }
}

/** A fresh browser on the head, paired with the stand-in through the app's own Settings. `ui`: 'bi' (English chrome,
 * the default) or 'ja'. `hold`: a function (route) to hold some speak requests back (a clip that never loads). */
export async function open({ engine = 'chromium', width = 390, clipSeconds = () => 6, ui = 'bi', voicePort = 19532, pair = true, args = [] } = {}) {
  const fake = await startFakeVoiceServer({ origins: [new URL(BASE).origin], port: voicePort, clipSeconds });
  const launcher = engine === 'webkit' ? webkit : chromium;
  const browser = await launcher.launch({ headless: true, ...(engine === 'chromium' ? { args: ['--mute-audio', '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1 , EXCLUDE localhost', ...args] } : {}) });
  const phone = width < 700;
  const context = await browser.newContext({ viewport: { width, height: phone ? 844 : 1117 }, deviceScaleFactor: phone ? 2 : 1, hasTouch: phone, isMobile: phone,
    locale: 'en-US', timezoneId: 'Asia/Tokyo', serviceWorkers: 'block' });
  await context.addInitScript(quiet);
  const offMachine = [];
  const held = [];
  let holdSpeaks = null;
  await context.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (['http:', 'https:'].includes(u.protocol) && !['127.0.0.1', 'localhost'].includes(u.hostname)) { offMachine.push(u.hostname); return route.abort(); }
    if (holdSpeaks && u.pathname === '/v1/audio/speak' && route.request().method() === 'POST' && holdSpeaks(route.request())) { held.push(route); return; }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 200)));
  const press = (target) => (typeof target === 'string' ? page.locator(target).first() : target)[phone ? 'tap' : 'click']();
  const query = ui === 'ja' ? '?ui=ja' : '';
  const ready = async (extra = '') => {
    await page.goto(`${BASE}${query}${extra ? (query ? '&' : '?') + extra : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 45000 });
    const ok = page.locator('button', { hasText: /^(OK|はい|閉じる|わかった)$/ }).first();
    if (await ok.isVisible().catch(() => false)) { await ok.click().catch(() => {}); await page.waitForTimeout(300); }
  };
  const s = { fake, browser, context, page, press, ready, engine, width, phone, errors, offMachine, held, ui,
    sleep: (ms) => page.waitForTimeout(ms),
    holdSpeaks: (fn) => { holdSpeaks = fn; },
    releaseHeld: async () => { for (const r of held.splice(0)) await r.continue().catch(() => {}); } };
  s.close = async () => { await browser.close().catch(() => {}); await fake.close().catch(() => {}); };
  if (!pair) return s;
  await ready();
  await press('#home-review').catch(() => {});
  await page.locator('#tab-me').waitFor();
  await press('#tab-me'); await s.sleep(1000);
  await page.locator('#me-settings').scrollIntoViewIfNeeded(); await press('#me-settings'); await s.sleep(800);
  await page.locator('#voice-pair-learner').scrollIntoViewIfNeeded();
  await page.locator('#voice-pair-learner').fill(`Bunki voice code: ${fake.issue({ learner: 'test-learner' })} (10 minutes) · learner: test-learner · server: ${fake.origin}`);
  await press('#voice-pair-submit');
  await page.waitForFunction(() => document.getElementById('settings-voice-server')?.dataset.paired === 'true', null, { timeout: 15000 });
  return s;
}

/** The first article from the shelf, its first-open word box closed; with `start` the read started from the play bar. */
export async function openArticle(s, { start = true, index = 0 } = {}) {
  const { page, press } = s;
  await s.ready();
  await press('#ginga-symbol'); await press('.bubble-shelf');
  await page.locator('.shelf-open').first().waitFor();
  await press(page.locator('.shelf-open').nth(index));
  await page.locator('.reader .tok.content').first().waitFor();
  await s.sleep(1500);
  for (let i = 0; i < 3 && (await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await page.keyboard.press('Escape'); await s.sleep(500); }
  if (!start) return;
  if (!(await page.locator('#listen-toggle').isVisible().catch(() => false))) await press('#listen-open');
  await page.locator('#listen-toggle').waitFor();
  await press('#listen-toggle');
  await page.waitForFunction(() => document.querySelector('#reader [data-speaking]'), null, { timeout: 20000 });
}

/** The read as the page shows it. */
export const readState = (page) => page.evaluate(() => {
  const lit = [...document.querySelectorAll('#reader .tok[data-speaking]')];
  const row = document.querySelector('.listen-row');
  return { first: lit.length ? Number(lit[0].dataset.index) : -1, words: lit.length, state: row?.dataset.voiceState || '',
    session: document.documentElement.dataset.readSession || '', ear: document.documentElement.dataset.ear || '',
    earVoice: document.documentElement.hasAttribute('data-ear-voice'), readBands: document.querySelectorAll('.read-band').length,
    earBands: document.querySelectorAll('.ear-band').length, box: !!document.getElementById('mini')?.getClientRects().length };
});

/** The ear mark a person can see and reach on this screen. */
export async function earMark(page) {
  for (let i = 0; i < 20; i += 1) {
    const n = await page.evaluate(() => {
      let found = 0;
      for (const mark of document.querySelectorAll('.ear-mark')) {
        mark.removeAttribute('data-review-ear');
        const r = mark.getBoundingClientRect();
        if (r.width && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.ear-mark') === mark) { mark.setAttribute('data-review-ear', ''); found += 1; }
      }
      return found;
    });
    if (n) return page.locator('.ear-mark[data-review-ear]').first();
    await page.waitForTimeout(100);
  }
  await page.evaluate(() => {
    for (const mark of document.querySelectorAll('.ear-mark')) {
      mark.removeAttribute('data-review-ear');
      const r = mark.getBoundingClientRect();
      if (r.width && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.ear-mark') === mark) mark.setAttribute('data-review-ear', '');
    }
  });
  if (!(await page.locator('.ear-mark[data-review-ear]').count())) {
    const where = await page.evaluate(() => [...document.querySelectorAll('.ear-mark')].map((m) => { const r = m.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return `${Math.round(r.left)},${Math.round(r.top)} ${r.width}x${r.height} hit=${hit ? hit.tagName + '.' + String(hit.className).slice(0, 40) + '#' + hit.id : 'none'}`; }));
    throw new Error(`no reachable ear mark: ${where.join(' | ')}`);
  }
  return page.locator('.ear-mark[data-review-ear]').first();
}
/** The prototype's first-open line, answered as a person would (it stands over the lower screen until answered). */
export async function dismissFirstLine(s) {
  const ok = s.page.locator('button', { hasText: /^(OK|わかった)$/ }).first();
  for (let i = 0; i < 3; i += 1) {
    if (!(await ok.isVisible().catch(() => false))) return;
    await ok.click({ force: true }).catch(() => {});
    await s.sleep(400);
  }
}
export const earState = (page) => page.evaluate(() => document.documentElement.dataset.ear || '');

/** A long press on the ear, as the builder's proof does it: a finger held on the glass through the browser's own touch
 * input (Chromium), or the mouse held down (a wide window). WebKit has no raw touch input here: its long press is the
 * pointer events the mark listens to, dispatched on the mark. */
export async function holdOn(s) {
  const { page } = s;
  const mark = await earMark(page);
  const box = await mark.boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  if (s.phone && s.engine === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await s.sleep(700);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else if (s.phone) {
    await page.evaluate(() => {
      const mark = document.querySelector('.ear-mark[data-review-ear]');
      mark.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: true, pointerType: 'touch', button: 0 }));
    });
    await s.sleep(700);
    await page.evaluate(() => {
      const mark = document.querySelector('.ear-mark[data-review-ear]');
      mark.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, isPrimary: true, pointerType: 'touch', button: 0 }));
      mark.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    });
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await s.sleep(700);
    await page.mouse.up();
  }
  await page.waitForFunction(() => document.documentElement.dataset.ear === 'held', null, { timeout: 4000 });
}

export function reporter(tag) {
  const rows = [];
  const record = (name, problems, detail = '') => {
    rows.push({ name, pass: !problems.length, problems, detail });
    console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${tag} · ${name}${detail ? `: ${detail}` : ''}${problems.length ? ` | ${problems.join('; ')}` : ''}`);
  };
  return { rows, record };
}
