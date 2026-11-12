import { webkit, chromium } from '/Users/dhyana/worktrees/Bunki-app/integrate-candidate_20261110/node_modules/playwright/index.mjs';
import fs from 'node:fs';
// motion as a strip of frames, judged as a sequence.  node strip.mjs <outdir> <skydir> <action> [look]
// actions: open | close | kanji | over | down | sound | read | form | mean | arrive
const [out, dir = 'sky-next', action = 'open', look = ''] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const b = await webkit.launch(); const c = await b.newContext({ viewport: { width: 1728, height: 1084 }, deviceScaleFactor: 1 });
await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; try { HTMLMediaElement.prototype.play = function () { return Promise.resolve(); }; } catch (e) {}
  for (const k of ['AudioContext', 'webkitAudioContext']) { if (window[k]) { const C = window[k]; window[k] = function () { const x = new C(); try { x.suspend(); } catch (e) {} x.resume = () => Promise.resolve(); return x; }; } } });
const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
const T0 = Date.now(); const frames = []; const snap = async (tag) => { const f = out + '/' + action + '-' + String(frames.length).padStart(2, '0') + '.jpg'; await p.screenshot({ path: f, type: 'jpeg', quality: 80 }); frames.push({ f, ms: Date.now() - T0, tag }); };
await p.goto('http://127.0.0.1:18841/?sky=1&skydir=' + dir, { waitUntil: 'load' });
if (action === 'arrive') { await p.waitForFunction(() => window.__SKY__ && window.__SKY__.W && window.__SKY__.W.ready, null, { timeout: 30000 }); const t = Date.now(); for (const ms of [0, 300, 600, 900, 1300, 1800, 2400, 3200, 4200, 5500, 7000, 9000]) { const w = ms - (Date.now() - t); if (w > 0) await p.waitForTimeout(w); await snap(ms); } }
else {
  await p.waitForFunction(() => document.body.dataset.ready === '1'); await p.waitForFunction(() => window.__SKY__ && window.__SKY__.W && window.__SKY__.W.fonts, null, { timeout: 30000 }); await p.waitForTimeout(5200);
  if (look) { await p.evaluate((l) => document.documentElement.setAttribute('data-theme', l), look); await p.waitForTimeout(1500); }
  const pickWord = () => p.evaluate(() => { const W = window.__SKY__.W; let best = null; for (const i of W.hits) { const o = i * 5, x = W.vis[o], y = W.vis[o + 1], s = W.vis[o + 2]; if (x > 450 && x < 1250 && y > 180 && y < 700 && W.D.words[i][4].length === 2 && W.D.words[i][4].every((k) => W.fam[k].length > 3) && (!best || s > best.s)) best = { x, y, s, w: W.D.words[i][0], i }; } return best; });
  const seal = (g) => p.evaluate((g2) => { const b2 = [...document.querySelector('#bunki-sky').shadowRoot.querySelectorAll('.tools button')].find((x) => x.textContent === g2 && !x.hidden); if (b2) b2.click(); return !!b2; }, g);
  let go = null;
  if (action === 'open') { const w = await pickWord(); go = () => p.mouse.click(w.x, w.y); }
  else if (action === 'close' || action === 'kanji') { const w = await pickWord(); await p.mouse.click(w.x, w.y); await p.waitForTimeout(2600);
    if (action === 'close') go = () => p.keyboard.press('Escape'); else { const hub = await p.evaluate(() => { for (const it of window.__SKY__.W.web.items.values()) if (it.role === 'hub' && it.kind === 'k') return { x: it.x.x, y: it.y.x }; return null; }); go = () => p.mouse.click(hub.x, hub.y); } }
  else if (action === 'over') go = () => seal('俯');
  else if (action === 'down') { await seal('俯'); await p.waitForTimeout(3200); go = () => p.mouse.click(600, 720); }
  else if (action === 'sound') go = () => seal('音'); else if (action === 'read') go = () => seal('読'); else if (action === 'mean') go = () => seal('意');
  else if (action === 'form') { await seal('音'); await p.waitForTimeout(3600); go = () => seal('形'); }
  await snap('before'); const t = Date.now(); await go();
  for (const ms of [60, 140, 220, 300, 400, 520, 660, 820, 1050, 1400, 2000]) { const w = ms - (Date.now() - t); if (w > 0) await p.waitForTimeout(w); await snap(Date.now() - t); }
}
const html = '<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(4,640px);gap:4px;padding:4px;font:15px sans-serif;color:#fff">' + frames.map((fr) => '<div style="position:relative"><img src="file://' + fr.f + '" style="width:100%;display:block"><span style="position:absolute;left:6px;top:4px;background:#000b;padding:1px 6px">' + fr.tag + (typeof fr.tag === 'number' ? ' ms' : '') + '</span></div>').join('') + '</body>';
fs.writeFileSync(out + '/' + action + '.html', html); const b2 = await chromium.launch({ args: ['--mute-audio', '--allow-file-access-from-files'] }); const p2 = await b2.newPage({ viewport: { width: 4 * 644 + 4, height: 800 } }); await p2.goto('file://' + out + '/' + action + '.html'); await p2.waitForTimeout(600); await p2.screenshot({ path: out + '/' + action + '-strip.jpg', type: 'jpeg', quality: 84, fullPage: true }); await b2.close();
console.log(action, 'frames', frames.map((f) => f.tag).join(' '), 'errors:', errs.length, errs.slice(0, 3).join(' | ')); await b.close();
