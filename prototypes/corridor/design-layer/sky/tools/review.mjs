import { webkit } from '/Users/dhyana/worktrees/Bunki-app/integrate-candidate_20261110/node_modules/playwright/index.mjs';
// design review of the sky inside the app: the key moments, as pictures.  node review.mjs <outdir> <skydir> [looks]
const out = process.argv[2], dir = process.argv[3] || 'sky', doLooks = process.argv[4] === 'looks';
const b = await webkit.launch(); const c = await b.newContext({ viewport: { width: 1728, height: 1084 }, deviceScaleFactor: 2 });
await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; try { HTMLMediaElement.prototype.play = function () { return Promise.resolve(); }; } catch (e) {}
  for (const k of ['AudioContext', 'webkitAudioContext']) { if (window[k]) { const C = window[k]; window[k] = function () { const x = new C(); try { x.suspend(); } catch (e) {} x.resume = () => Promise.resolve(); return x; }; } } });
const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
await p.goto('http://127.0.0.1:18841/?sky=1&skydir=' + dir, { waitUntil: 'load' }); await p.waitForFunction(() => document.body.dataset.ready === '1');
await p.waitForFunction(() => window.__SKY__ && window.__SKY__.W && window.__SKY__.W.fonts, null, { timeout: 30000 }); await p.waitForTimeout(5500);
const shot = (name) => p.screenshot({ path: out + '/' + name + '.jpg', type: 'jpeg', quality: 88 });
const fps = () => p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n += 1; if (performance.now() - t0 > 2000) res(Math.round(n / 2)); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
const sealAt = async (glyph) => p.evaluate((g) => { const b = [...document.querySelector('#bunki-sky').shadowRoot.querySelectorAll('.tools button')].find((x) => x.textContent === g && !x.hidden); if (!b) return null; const q = b.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; }, glyph);
const pickWord = () => p.evaluate(() => { const W = window.__SKY__.W; let best = null; for (const i of W.hits) { const o = i * 5, x = W.vis[o], y = W.vis[o + 1], s = W.vis[o + 2]; if (x > 450 && x < 1250 && y > 180 && y < 700 && W.D.words[i][4].length === 2 && W.D.words[i][4].every((k) => W.fam[k].length > 3) && (!best || s > best.s)) best = { x, y, s, w: W.D.words[i][0], i }; } return best; });
if (doLooks) {
  for (const look of ['hokusai', 'sumi', 'shu', 'akafuji', 'iwa', 'keyblock', 'rokusho', 'yoru', 'nami', 'hakuu', 'kaku']) {
    await p.evaluate((l) => { if (l === 'hokusai') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', l); }, look); await p.waitForTimeout(1600); await shot('look-' + look + '-1-rest');
    const w = await pickWord(); if (w) { await p.mouse.click(w.x, w.y); await p.waitForTimeout(2600); await shot('look-' + look + '-2-open'); await p.keyboard.press('Escape'); await p.waitForTimeout(1500); }
    await p.evaluate(() => window.__SKY__.overview(true)); await p.waitForTimeout(3000); await shot('look-' + look + '-3-over'); await p.evaluate(() => window.__SKY__.overview(false)); await p.waitForTimeout(2600);
  }
  console.log('errors:', errs.length, errs.slice(0, 4).join(' | ')); await b.close(); process.exit(0);
}
console.log('rest fps', await fps()); await shot('01-rest');
const word = await pickWord();
await p.mouse.move(word.x - 30, word.y - 20); await p.mouse.move(word.x, word.y, { steps: 5 }); await p.waitForTimeout(900);
const now = await p.evaluate((i) => { const W = window.__SKY__.W; return { x: W.vis[i * 5], y: W.vis[i * 5 + 1] }; }, word.i); await p.mouse.move(now.x, now.y); await p.waitForTimeout(600); await shot('02-hover');
await p.mouse.click(now.x, now.y); await p.waitForTimeout(350); await shot('03-opening-350ms'); await p.waitForTimeout(500); await shot('03-opening-850ms'); await p.waitForTimeout(2000); await shot('04-open'); console.log('open', word.w, 'fps', await fps());
const hub = await p.evaluate(() => { for (const it of window.__SKY__.W.web.items.values()) if (it.role === 'hub' && it.kind === 'k') return { x: it.x.x, y: it.y.x, t: it.text }; return null; });
if (hub) { await p.mouse.click(hub.x, hub.y); await p.waitForTimeout(2800); await shot('05-kanji'); console.log('kanji', hub.t); }
await p.keyboard.press('Escape'); await p.waitForTimeout(400); await shot('06-closing-400ms'); await p.waitForTimeout(1800);
const st = await p.evaluate(() => window.__SKY__.W.web.isOpen()); if (st) { await p.keyboard.press('Escape'); await p.waitForTimeout(1800); }
await p.mouse.move(900, 400); await p.mouse.down(); await p.mouse.move(520, 470, { steps: 30 }); await p.waitForTimeout(150); await p.mouse.up(); await p.waitForTimeout(1600); await shot('07-turned');
await p.evaluate(() => window.__SKY__.resetView()); await p.waitForTimeout(1600);
await p.evaluate(() => window.__SKY__.W.lookUp()); await p.waitForTimeout(2600); await shot('08-up'); await p.evaluate(() => window.__SKY__.W.lookUp()); await p.waitForTimeout(2000);
const ov = await sealAt('俯'); await p.mouse.click(ov.x, ov.y); await p.waitForTimeout(900); await shot('09-rising-900ms'); await p.waitForTimeout(2600); await shot('10-above'); console.log('above fps', await fps());
await p.mouse.click(600, 720); await p.waitForTimeout(3200);
const so = await sealAt('音'); await p.mouse.click(so.x, so.y); await p.waitForTimeout(1200); await shot('11-morph-1200ms'); await p.waitForTimeout(2600); await shot('12-sound');
const re = await sealAt('読'); if (re) { await p.mouse.click(re.x, re.y); await p.waitForTimeout(3800); await shot('13-read'); }
const me = await sealAt('意'); if (me) { await p.mouse.click(me.x, me.y); await p.waitForTimeout(3800); await shot('15-mean'); await p.evaluate(() => window.__SKY__.overview(true)); await p.waitForTimeout(3200); await p.mouse.move(620, 760); await p.waitForTimeout(700); await shot('16-mean-above'); await p.evaluate(() => window.__SKY__.overview(false)); await p.waitForTimeout(3000); }
const fo = await sealAt('形'); await p.mouse.click(fo.x, fo.y); await p.waitForTimeout(3600);
// a word that has stored links by meaning, and a pattern of grammar opened
const semWord = await p.evaluate(() => { const W = window.__SKY__.W; let best = null; for (const [k, arr] of W.sem) { if (W.D.words[k][4].length <= 2 && (!best || arr.length > best.n)) best = { w: W.D.words[k][0], n: arr.length }; } return best; });
if (semWord) { await p.evaluate((w) => window.__SKY__.open(w), semWord.w); await p.waitForTimeout(3000); await shot('17-meaning-links'); console.log('meaning links', semWord.w, semWord.n); await p.keyboard.press('Escape'); await p.waitForTimeout(1600); }
await p.evaluate(() => window.__SKY__.W.lookUp()); await p.waitForTimeout(2400);
const gram = await p.evaluate(() => { const W = window.__SKY__.W; const h = W.gHits.filter((x) => x.i >= 0 && x.y > 150 && x.y < 600 && x.x > 300 && x.x < 1400)[0]; return h ? { x: h.x, y: h.y } : null; });
if (gram) { await p.mouse.move(gram.x, gram.y, { steps: 4 }); await p.waitForTimeout(700); await shot('18-grammar-hover'); await p.mouse.click(gram.x, gram.y); await p.waitForTimeout(3000); await shot('19-grammar-open'); await p.keyboard.press('Escape'); await p.waitForTimeout(1500); }
await p.evaluate(() => window.__SKY__.resetView()); await p.waitForTimeout(1800);
// fly in along the line of sight
await p.mouse.move(864, 450); for (let i = 0; i < 14; i++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(40); } await p.waitForTimeout(1800); await shot('14-flown-in');
console.log('errors:', errs.length, errs.slice(0, 4).join(' | ')); await b.close();
