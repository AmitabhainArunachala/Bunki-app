#!/usr/bin/env node
/** The ear's own time limit and a slow voice (the re-check's K3, fix round 2, 2026-11-11). The ear gives up on a
 * sentence that has not begun to sound after 8 s (voice-layer.mjs EAR_FIRST_CLIP_MS). Here the stand-in's answer
 * reaches the page 9 s after the page asked: the request is held 9 s on the page's side, then sent on to the stand-in,
 * which answers at once. The ear must:
 *   1. be struck at about 8 s with one plain line that the voice took too long, never that the server is busy (the
 *      server said nothing of the kind);
 *   2. not give the request up: it is answered, and the clip is kept;
 *   3. armed again, a tap on the same sentence plays at once, without asking the server again.
 * The surface: an article's running text (the first on the shelf), no read playing; at 390 a finger's tap, at 1728 a
 * click.
 *
 * Silent: the review's harness (review-ear/lib.mjs): Chromium with --mute-audio, or headless WebKit; media forced muted,
 * the device voice swallowed, the local stand-in voice server, nothing but this machine reached.
 *
 *   REVIEW_BASE=http://127.0.0.1:19481/ node prototypes/corridor/tools/ear-slow-voice.mjs --engine chromium|webkit
 *        [--width 390|1728] [--ui bi|ja] [--voice-port 19482] [--out DIR]
 */
import { arg, earMark, open, openArticle, reporter } from './review-ear/lib.mjs';
import { voiceLineOf } from '../modules/voice-lines.mjs';

const ENGINE = arg('--engine', 'chromium');
const WIDTH = Number(arg('--width', '390'));
const UI = arg('--ui', 'bi');
const OUT = arg('--out', process.env.REVIEW_OUT || '.');
const tag = `${ENGINE}-${WIDTH}-${UI}`;
const { rows, record } = reporter(tag);
const SLOW_MS = 9000;
// the voice took too long (C5), in the one vocabulary's words: [ja, en]
const LINES = voiceLineOf('ear-too-slow');
const s = await open({ engine: ENGINE, width: WIDTH, ui: UI, clipSeconds: () => 1.2, voicePort: Number(arg('--voice-port', '19532')) });
const { page, fake } = s;
const sent = [];
page.on('request', (request) => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/v1/audio/speak') sent.push({ request, at: Date.now(), end: null }); });
page.on('requestfinished', (request) => { const row = sent.find((one) => one.request === request); if (row) row.end = 'answered'; });
page.on('requestfailed', (request) => { const row = sent.find((one) => one.request === request); if (row) row.end = `failed: ${request.failure()?.errorText || '?'}`; });
const tapAt = async (p) => { if (s.phone) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y); };
const arm = async () => {
  await s.press(await earMark(page));
  await page.waitForFunction(() => document.documentElement.dataset.ear === 'armed', null, { timeout: 3000 });
};

try {
  await openArticle(s, { start: false });
  const target = await page.evaluate(() => {
    for (const tok of document.querySelectorAll('#reader .tok.content')) {
      const r = tok.getBoundingClientRect();
      if (r.width > 8 && r.top > 140 && r.bottom < innerHeight - 200 && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.tok') === tok)
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: tok.textContent.trim() };
    }
    return null;
  });
  if (!target) throw new Error('no word of the article in plain view');

  // 1. the first tap: its answer reaches the page 9 s after it is asked
  s.holdSpeaks(() => true);
  await arm();
  const t0 = Date.now();
  await tapAt(target);
  const release = setTimeout(() => { s.holdSpeaks(null); s.releaseHeld(); }, SLOW_MS);
  const struck = await page.waitForFunction(() => document.documentElement.dataset.ear === 'novoice', null, { timeout: 12000 }).then(() => true, () => false);
  const at = (Date.now() - t0) / 1000;
  const line = await page.evaluate(() => document.querySelector('.ear-why:not([hidden])')?.textContent || '');
  const label = await page.evaluate(() => document.querySelector('.ear-mark')?.getAttribute('aria-label') || '');
  await page.screenshot({ path: `${OUT}/ear-slow-${tag}-struck.png` });
  record('the ear gives up at about 8 s and says the voice took too long, not that the server is busy',
    [...(struck ? [] : ['not struck within 12 s']), ...(struck && (at < 7.5 || at > 9.2) ? [`struck at ${at.toFixed(1)} s`] : []),
      ...(LINES.includes(line) ? [] : [`the line is "${line}"`]), ...(/busy|混/u.test(`${line} ${label}`) ? ['it says busy'] : [])],
    `struck after ${at.toFixed(1)} s: "${line}"; mark "${label}"`);
  await new Promise((done) => setTimeout(done, Math.max(0, t0 + SLOW_MS + 2500 - Date.now())));
  clearTimeout(release);
  const first = sent.slice();
  record('the request is not given up: the stand-in’s late answer reaches the page', first.length === 1 && first[0].end === 'answered' ? [] : [`${first.length} requests: ${first.map((one) => one.end || 'pending').join(', ')}`],
    `${first.length} sent; ${first.map((one) => one.end || 'pending').join(', ')}; the stand-in answered ${fake.speaks().length}`);

  // 2. armed again, the same word: the kept clip plays at once
  await page.waitForFunction(() => document.documentElement.dataset.ear !== 'novoice', null, { timeout: 8000 }).catch(() => {});
  await arm();
  // every speak request is held again: only a clip the page kept can sound now. The clip's own play() (the harness logs
  // every media play, muted) is played from a blob of its bytes
  s.holdSpeaks(() => true);
  const played = await page.evaluate(() => (window.__sound || []).length);
  const t1 = Date.now();
  await tapAt(target);
  const sounding = await page.waitForFunction((n) => (window.__sound || []).slice(n).some((one) => one.kind === 'audio-play' && /^blob:/u.test(one.src)), played, { timeout: 4000 }).then(() => true, () => false);
  const soon = (Date.now() - t1) / 1000;
  await s.sleep(1500);
  s.holdSpeaks(null);
  await s.releaseHeld();
  const again = sent.slice(first.length);
  record('armed again, the same word plays at once from the kept clip, and nothing more is asked', [...(sounding ? [] : ['no voice within 4 s']), ...(sounding && soon > 1.5 ? [`it began after ${soon.toFixed(1)} s`] : []), ...(again.length ? [`${again.length} more requests`] : [])],
    `"${target.label}": sounding after ${soon.toFixed(2)} s; more requests ${again.length}; ear ${await page.evaluate(() => document.documentElement.dataset.ear)}`);
} catch (error) {
  record('the check ran to its end', [String(error.message).split('\n')[0].slice(0, 200)]);
  await page.screenshot({ path: `${OUT}/ear-slow-${tag}-error.png` }).catch(() => {});
}
await s.close();
const failed = rows.filter((r) => !r.pass).length;
console.log(`${tag}: ${rows.length - failed} passed, ${failed} failed; page errors ${s.errors.length}; off this machine ${s.offMachine.length}`);
process.exit(failed ? 1 : 0);
