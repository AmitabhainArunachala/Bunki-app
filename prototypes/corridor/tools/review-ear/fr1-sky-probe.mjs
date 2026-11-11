// Can a headless Chromium on this Mac draw the new first screen (the sky) with the graphics card? Muted, loopback only.
import { chromium } from '../../../../node_modules/playwright-core/index.mjs';
const BASE = process.env.REVIEW_BASE || 'http://127.0.0.1:19530/';
const sets = [['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'], ['--use-gl=angle', '--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist']];
for (const extra of sets) {
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1 , EXCLUDE localhost', ...extra] });
  const page = await (await browser.newContext({ viewport: { width: 1728, height: 1117 }, serviceWorkers: 'block' })).newPage();
  await page.goto(`${BASE}?sky=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => ['mounted', 'gave-back', 'off', 'stood-down'].includes(window.__bunkiSkyApp?.state), null, { timeout: 40000 }).catch(() => {});
  console.log(extra.join(' '), JSON.stringify(await page.evaluate(() => window.__bunkiSkyApp)));
  await browser.close();
}
