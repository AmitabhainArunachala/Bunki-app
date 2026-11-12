import { webkit } from '/Users/dhyana/worktrees/Bunki-app/integrate-candidate_20261110/node_modules/playwright/index.mjs';
// the hand from above: tilt by a vertical drag, turn by a sideways drag, come down by a touch on the ring; then Tab reach from the page
const dir = process.argv[2] || 'sky-next'; const b = await webkit.launch(); const c = await b.newContext({ viewport: { width: 1728, height: 1084 }, deviceScaleFactor: 2 });
await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; try { HTMLMediaElement.prototype.play = function () { return Promise.resolve(); }; } catch (e) {} });
const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
await p.goto('http://127.0.0.1:18841/?sky=1&skydir=' + dir, { waitUntil: 'load' }); await p.waitForFunction(() => document.body.dataset.ready === '1'); await p.waitForFunction(() => window.__SKY__ && window.__SKY__.W && window.__SKY__.W.fonts, null, { timeout: 30000 }); await p.waitForTimeout(5000);
const st = () => p.evaluate(() => { const W = window.__SKY__.W; return { ov: +window.__SKY__.S.view.over.toFixed(2), phi: +W.tgt.phi.toFixed(2), a: +W.cam.a.toFixed(3), aTo: W.cam.aTo == null ? null : +W.cam.aTo.toFixed(2), hot: W.overHot, open: W.web.isOpen() }; });
await p.evaluate(() => window.__SKY__.overview(true)); await p.waitForTimeout(3000); console.log('above        ', JSON.stringify(await st()));
await p.mouse.move(700, 420); await p.mouse.down(); await p.mouse.move(705, 640, { steps: 20 }); await p.mouse.up(); await p.waitForTimeout(900); console.log('dragged down ', JSON.stringify(await st()));
await p.mouse.move(700, 600); await p.mouse.down(); await p.mouse.move(700, 100, { steps: 30 }); await p.mouse.up(); await p.waitForTimeout(900); console.log('dragged up   ', JSON.stringify(await st()));
await p.mouse.move(600, 500); await p.mouse.down(); await p.mouse.move(900, 505, { steps: 20 }); await p.mouse.up(); await p.waitForTimeout(900); console.log('turned       ', JSON.stringify(await st()));
await p.mouse.move(1300, 620); await p.waitForTimeout(500); console.log('pointer on ring', JSON.stringify(await st()));
await p.mouse.click(1300, 620); await p.waitForTimeout(3200); console.log('came down    ', JSON.stringify(await st()));
// keyboard from the page: Tab until the focus is inside the sky's hidden list, then Enter
let inside = false; for (let i = 0; i < 40 && !inside; i += 1) { await p.keyboard.press('Tab'); inside = await p.evaluate(() => { const h = document.querySelector('#bunki-sky'); return document.activeElement === h && !!h.shadowRoot.activeElement && !!h.shadowRoot.activeElement.closest('.reach'); }); }
console.log('Tab reached a word:', inside, inside ? await p.evaluate(() => document.querySelector('#bunki-sky').shadowRoot.activeElement.textContent) : '');
if (inside) { await p.keyboard.press('Enter'); await p.waitForTimeout(1800); console.log('Enter        ', JSON.stringify(await st())); await p.keyboard.press('Escape'); await p.waitForTimeout(1500); console.log('Escape       ', JSON.stringify(await st())); }
console.log('errors:', errs.length, errs.slice(0, 3).join(' | ')); await b.close();
