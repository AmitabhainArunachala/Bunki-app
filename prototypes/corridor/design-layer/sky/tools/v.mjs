import { chromium, webkit } from '/Users/dhyana/worktrees/Bunki-app/integrate-candidate_20261110/node_modules/playwright/index.mjs';
// usage: node v.mjs <out prefix> <name=js;name=js;...>   each js runs in the page (S = window.__SKY__), then 2.2 s, then a picture
const [out, plan = 'rest='] = process.argv.slice(2); const wk = process.env.ENGINE !== 'chromium';
const b = wk ? await webkit.launch() : await chromium.launch({ args: ['--mute-audio', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const c = await b.newContext({ viewport: { width: Number(process.env.W || 1728), height: Number(process.env.H || 1084) }, deviceScaleFactor: Number(process.env.DPR || 2) });
const p = await c.newPage(); p.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 400))); p.on('console', (m) => { if (m.type() === 'error') console.log('console.error', m.text().slice(0, 400)); });
await p.goto((process.env.URL || 'http://127.0.0.1:18841/design/sky-next/') + '?' + (process.env.Q || 'lang=ja'), { waitUntil: 'load' });
await p.waitForFunction(() => window.__SKY__ && window.__SKY__.W && window.__SKY__.W.fonts, null, { timeout: 30000 }).catch(() => console.log('fonts flag not set')); await p.waitForTimeout(Number(process.env.WAIT || 5000));
for (const step of plan.split('|')) { const k = step.indexOf('='); const name = step.slice(0, k), js = step.slice(k + 1);
  if (js) { const r = await p.evaluate('(() => { const S = window.__SKY__, W = S.W; ' + js + ' })()').catch((e) => 'ERR ' + String(e).slice(0, 300)); if (r !== undefined && r !== null) console.log(name, JSON.stringify(r).slice(0, 600)); }
  await p.waitForTimeout(Number(process.env.SETTLE || 2200)); await p.screenshot({ path: out + '-' + name + '.png' }); }
console.log('fps', await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n += 1; if (performance.now() - t0 > 2000) res(Math.round(n / 2)); else requestAnimationFrame(f); }; requestAnimationFrame(f); })), JSON.stringify(await p.evaluate(() => window.__SKY__.W.stats)));
await b.close();
