import { webkit } from '/Users/dhyana/worktrees/Bunki-app/integrate-candidate_20261110/node_modules/playwright/index.mjs';
import fs from 'node:fs';
// First survey of the whole app for the app-wide work (task APP): each main tab as it stands in a fresh browser
// (its own empty storage: John's record is never touched), a picture of the window and of the whole page, and the
// names of what can be pressed there.   node app-survey.mjs <outdir> [width height]
const out = process.argv[2]; const W = Number(process.argv[3] || 1728), H = Number(process.argv[4] || 1084); fs.mkdirSync(out, { recursive: true });
const b = await webkit.launch(); const c = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; try { HTMLMediaElement.prototype.play = function () { return Promise.resolve(); }; } catch (e) {}
  for (const k of ['AudioContext', 'webkitAudioContext']) { if (window[k]) { const C = window[k]; window[k] = function () { const x = new C(); try { x.suspend(); } catch (e) {} x.resume = () => Promise.resolve(); return x; }; } } });
const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
await p.goto('http://127.0.0.1:18841/?sky=1', { waitUntil: 'load' }); await p.waitForFunction(() => document.body.dataset.ready === '1'); await p.waitForTimeout(4500);
const ok = await p.evaluate(() => { const b2 = document.querySelector('#prototype-note button, .pl-note button'); const all = [...document.querySelectorAll('button')].filter((x) => x.textContent.trim() === 'OK' && x.getClientRects().length); if (all[0]) { all[0].click(); return true; } return false; });
const tabs = await p.evaluate(() => [...document.querySelectorAll('#primary-tabs button, #primary-tabs a, #primary-tabs [role=tab]')].filter((e) => e.getClientRects().length).map((e) => e.textContent.trim().replace(/\s+/g, ' ')).filter(Boolean));
const report = { at: new Date().toISOString(), size: [W, H], dismissedNotice: ok, tabs, screens: [] };
const describe = () => p.evaluate(() => { const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(e).visibility !== 'hidden'; };
  const press = [...document.querySelectorAll('button, a[href], [role=button], [role=tab], summary')].filter((e) => vis(e) && !e.closest('#bunki-sky') && !e.closest('#primary-tabs')).map((e) => (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 44)).filter(Boolean);
  const heads = [...document.querySelectorAll('h1, h2, h3, .eyebrow, .view-title')].filter(vis).map((e) => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 60)).filter(Boolean);
  return { view: document.body.dataset.view || '', title: document.title, heads: [...new Set(heads)].slice(0, 30), press: [...new Set(press)].slice(0, 70), scrollH: document.documentElement.scrollHeight, fonts: [...new Set([...document.querySelectorAll('h1,h2,h3,p,button,li,a,span')].filter(vis).slice(0, 400).map((e) => getComputedStyle(e).fontFamily.split(',')[0].trim().replace(/["']/g, '')))].slice(0, 12) }; });
const shot = async (name) => { await p.screenshot({ path: out + '/' + name + '.jpg', type: 'jpeg', quality: 82 }); await p.screenshot({ path: out + '/' + name + '-whole.jpg', type: 'jpeg', quality: 70, fullPage: true }).catch(() => {}); };
await shot('00-first-screen'); report.screens.push({ name: '00-first-screen', ...(await describe()) });
for (let i = 0; i < tabs.length; i += 1) {
  const clicked = await p.evaluate((n) => { const e = [...document.querySelectorAll('#primary-tabs button, #primary-tabs a, #primary-tabs [role=tab]')].filter((x) => x.getClientRects().length)[n]; if (!e) return false; e.click(); return true; }, i);
  await p.waitForTimeout(1800); const name = String(i + 1).padStart(2, '0') + '-tab-' + tabs[i].toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20);
  await shot(name); report.screens.push({ name, clicked, ...(await describe()) });
}
report.errors = errs.slice(0, 20); fs.writeFileSync(out + '/survey.json', JSON.stringify(report, null, 1));
console.log('tabs:', tabs.join(' | ')); for (const s of report.screens) console.log(s.name, '· view', s.view, '· page height', s.scrollH, '· things to press', s.press.length, '· headings', s.heads.slice(0, 5).join(' / '));
console.log('errors:', errs.length, errs.slice(0, 3).join(' | ')); await b.close();
