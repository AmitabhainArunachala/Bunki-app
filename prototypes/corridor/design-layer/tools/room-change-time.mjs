import { webkit } from '/Users/dhyana/worktrees/Bunki-app/integrate-candidate_20261110/node_modules/playwright/index.mjs';
// How long a change of room takes on screen: from the press on a tab until the page no longer says it is in a
// room transition. Compared with Read's Tools panel closed and open (task APP, seen 2026-11-12 00:16).
//   node room-change-time.mjs
const b = await webkit.launch(); const c = await b.newContext({ viewport: { width: 1728, height: 1084 }, deviceScaleFactor: 1 });
if (process.env.DEPTH === '0') await c.addInitScript(() => { try { localStorage.setItem('bunki-live-depth', '0'); } catch (e) {} });
if (process.env.NOSKY === '1') await c.addInitScript(() => { window.__noSkyForTiming = true; });
await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; try { HTMLMediaElement.prototype.play = function () { return Promise.resolve(); }; } catch (e) {} });
const p = await c.newPage(); await p.goto('http://127.0.0.1:18841/' + (process.env.NOSKY === '1' ? '' : '?sky=1'), { waitUntil: 'load' }); await p.waitForFunction(() => document.body.dataset.ready === '1'); await p.waitForTimeout(3500);
await p.evaluate(() => { const all = [...document.querySelectorAll('button')].filter((x) => x.textContent.trim() === 'OK' && x.getClientRects().length); if (all[0]) all[0].click(); });
const tab = (t) => p.evaluate((t2) => { const e = [...document.querySelectorAll('#primary-tabs button, #primary-tabs a, #primary-tabs [role=tab]')].filter((x) => x.getClientRects().length).find((x) => x.textContent.trim().includes(t2)); e.click(); }, t);
const timeChange = async (to) => p.evaluate((t2) => new Promise((res) => { const h = document.documentElement, t0 = performance.now(); let viewAt = null, seen = false; const want = { Today: 'tray', Read: 'shelf', Learn: 'dojo' }[t2];
  const e = [...document.querySelectorAll('#primary-tabs button, #primary-tabs a, #primary-tabs [role=tab]')].filter((x) => x.getClientRects().length).find((x) => x.textContent.trim().includes(t2)); e.click();
  const tick = () => { const now = performance.now() - t0; if (viewAt == null && document.body.dataset.view === want) viewAt = Math.round(now); if (h.dataset.roomTransition) seen = true;
    const anims = document.getAnimations ? document.getAnimations().filter((a) => a.playState === 'running').length : 0;
    if ((viewAt != null && !h.dataset.roomTransition && now > 150) || now > 9000) res({ viewAt, done: Math.round(now), sawTransition: seen, animsLeft: anims }); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); }), to);
const openTools = () => p.evaluate(() => { const e = [...document.querySelectorAll('button')].filter((x) => x.getClientRects().length).find((x) => x.textContent.trim().startsWith('Tools')); if (e) e.click(); return !!e; });
const rows = [];
for (let k = 0; k < 2; k += 1) { await tab('Read'); await p.waitForTimeout(2500); rows.push(['Read to Today, panel closed', await timeChange('Today')]); await p.waitForTimeout(1500); }
for (let k = 0; k < 2; k += 1) { await tab('Read'); await p.waitForTimeout(2500); await openTools(); await p.waitForTimeout(900); rows.push(['Read to Today, panel open', await timeChange('Today')]); await p.waitForTimeout(1500); }
await tab('Learn'); await p.waitForTimeout(2500); rows.push(['Learn to Today', await timeChange('Today')]);
for (const r of rows) console.log(r[0].padEnd(30), JSON.stringify(r[1]));
await b.close();
