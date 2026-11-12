import { webkit } from '/Users/dhyana/worktrees/Bunki-app/integrate-candidate_20261110/node_modules/playwright/index.mjs';
// quick look inside the app: node quick.mjs <outprefix> <skydir> <plan: name=js|name=js>   (S = window.__SKY__, W = S.W)
const [out, dir = 'sky-next', plan = 'rest='] = process.argv.slice(2);
const b = await webkit.launch(); const c = await b.newContext({ viewport: { width: Number(process.env.W || 1728), height: Number(process.env.H || 1084) }, deviceScaleFactor: Number(process.env.DPR || 2), ...(process.env.RM ? { reducedMotion: 'reduce' } : {}) });
await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; try { HTMLMediaElement.prototype.play = function () { return Promise.resolve(); }; } catch (e) {}
  for (const k of ['AudioContext', 'webkitAudioContext']) { if (window[k]) { const C = window[k]; window[k] = function () { const x = new C(); try { x.suspend(); } catch (e) {} x.resume = () => Promise.resolve(); return x; }; } } });
const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 300))); p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
await p.goto('http://127.0.0.1:18841/?sky=1&skydir=' + dir + (process.env.Q ? '&' + process.env.Q : ''), { waitUntil: 'load' }); await p.waitForFunction(() => document.body.dataset.ready === '1');
await p.waitForFunction(() => window.__SKY__ && window.__SKY__.W && window.__SKY__.W.fonts, null, { timeout: 30000 }); await p.waitForTimeout(Number(process.env.WAIT || 5200));
if (process.env.LOOK) { await p.evaluate((l) => document.documentElement.setAttribute('data-theme', l), process.env.LOOK); await p.waitForTimeout(1500); }
for (const step of plan.split('|')) { const k = step.indexOf('='); const name = step.slice(0, k), js = step.slice(k + 1);
  if (js.startsWith('move:')) { const [x, y] = js.slice(5).split(',').map(Number); await p.mouse.move(x, y, { steps: 4 }); }
  else if (js.startsWith('click:')) { const [x, y] = js.slice(6).split(',').map(Number); await p.mouse.click(x, y); }
  else if (js.startsWith('key:')) { await p.keyboard.press(js.slice(4)); }
  else if (js) { const r = await p.evaluate('(() => { const S = window.__SKY__, W = S.W; ' + js + ' })()').catch((e) => 'ERR ' + String(e).slice(0, 300)); if (r !== undefined && r !== null) console.log(name, JSON.stringify(r).slice(0, 700)); }
  await p.waitForTimeout(Number(process.env.SETTLE || 2600)); await p.screenshot({ path: out + '-' + name + '.jpg', type: 'jpeg', quality: 88 }); }
console.log('fps', await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n += 1; if (performance.now() - t0 > 2000) res(Math.round(n / 2)); else requestAnimationFrame(f); }; requestAnimationFrame(f); })), 'errors:', errs.length, errs.slice(0, 3).join(' | '));
await b.close();
