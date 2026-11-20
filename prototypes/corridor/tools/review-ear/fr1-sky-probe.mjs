// Can a headless Chromium on this Mac draw the new first screen (the sky) with the graphics card? Muted, loopback only.
// Version 3 (2026-11-12) puts the sky on a phone too: --engine webkit and --width 390 ask the same of headless WebKit (no
// flags to try there: one run) at a phone's size.   node fr1-sky-probe.mjs [--engine chromium|webkit] [--width 1728|390]
import { chromium, webkit } from '../../../../node_modules/playwright-core/index.mjs';
const BASE = process.env.REVIEW_BASE || 'http://127.0.0.1:19530/';
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const ENGINE = arg('--engine', 'chromium');
const WIDTH = Number(arg('--width', '1728'));
const sets = ENGINE === 'webkit' ? [[]] : [['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'], ['--use-gl=angle', '--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist']];
for (const extra of sets) {
  const browser = ENGINE === 'webkit' ? await webkit.launch({ headless: true })
    : await chromium.launch({ headless: true, args: ['--mute-audio', '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1 , EXCLUDE localhost', ...extra] });
  const phone = WIDTH < 700;
  const context = await browser.newContext({ viewport: { width: WIDTH, height: phone ? 844 : 1117 }, deviceScaleFactor: phone ? 2 : 1, hasTouch: phone, isMobile: phone, serviceWorkers: 'block' });
  // loopback only, in WebKit too (it has no host-resolver flag): anything else is refused
  await context.route('**/*', (route) => { const u = new URL(route.request().url()); return ['http:', 'https:'].includes(u.protocol) && !['127.0.0.1', 'localhost'].includes(u.hostname) ? route.abort() : route.continue(); });
  await context.addInitScript(() => { const m = HTMLMediaElement.prototype, play = m.play; m.play = function () { this.muted = true; this.volume = 0; return play.call(this); }; if (window.speechSynthesis) Object.getPrototypeOf(window.speechSynthesis).speak = () => {}; });
  const page = await context.newPage();
  await page.goto(`${BASE}?sky=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => ['mounted', 'gave-back', 'off', 'stood-down'].includes(window.__bunkiSkyApp?.state), null, { timeout: 40000 }).catch(() => {});
  console.log(ENGINE, WIDTH, extra.join(' ') || '(no flags)', JSON.stringify(await page.evaluate(() => window.__bunkiSkyApp)));
  await browser.close();
}
