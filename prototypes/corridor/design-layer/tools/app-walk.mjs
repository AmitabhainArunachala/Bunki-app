import { webkit } from '/Users/dhyana/worktrees/Bunki-app/integrate-candidate_20261110/node_modules/playwright/index.mjs';
import fs from 'node:fs';
// Walk the app as a learner would and photograph what is there (task APP). A fresh browser with its own empty
// storage each run: John's record is never touched. No sound (speech, media and audio are stubbed).
//   node app-walk.mjs <outdir> <step> <step> ...        env: W H (window, default 1728 1084), LANG2=ja, URL
// steps:  tab:Read · click:<text> (first pressable whose name contains it) · click!:<exact name> · sel:<css>
//         shot:<name> · folds:<name>:<n> (window pictures down the page) · scroll:<px> · top · key:<Key>
//         type:<text> · back · wait:<ms> · lang (switch the interface language) · info
const out = process.argv[2]; const steps = process.argv.slice(3); fs.mkdirSync(out, { recursive: true });
const W = Number(process.env.W || 1728), H = Number(process.env.H || 1084);
const b = await webkit.launch(); const c = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: W < 700 });
await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; try { HTMLMediaElement.prototype.play = function () { return Promise.resolve(); }; } catch (e) {}
  for (const k of ['AudioContext', 'webkitAudioContext']) { if (window[k]) { const C = window[k]; window[k] = function () { const x = new C(); try { x.suspend(); } catch (e) {} x.resume = () => Promise.resolve(); return x; }; } } });
const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
await p.goto(process.env.URL || 'http://127.0.0.1:18841/?sky=1', { waitUntil: 'load' }); await p.waitForFunction(() => document.body.dataset.ready === '1'); await p.waitForTimeout(3500);
await p.evaluate(() => { const all = [...document.querySelectorAll('button')].filter((x) => x.textContent.trim() === 'OK' && x.getClientRects().length); if (all[0]) all[0].click(); });
const find = (text, exact, sel) => p.evaluate(({ text, exact, sel }) => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 3 && r.height > 3 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const name = (e) => ((e.getAttribute('aria-label') || '') + ' ' + (e.textContent || '')).trim().replace(/\s+/g, ' ');
  let list = sel ? [...document.querySelectorAll(sel)] : [...document.querySelectorAll('button, a[href], [role=button], [role=tab], [role=link], summary, [tabindex="0"], label')];
  list = list.filter((e) => vis(e) && !e.closest('#bunki-sky'));
  const hit = sel ? list[0] : (list.find((e) => exact ? name(e) === text || (e.textContent || '').trim() === text : name(e).includes(text)));
  if (!hit) return null; hit.scrollIntoView({ block: 'center' }); const r = hit.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, name: name(hit).slice(0, 60) }; }, { text, exact, sel });
const press = async (text, exact, sel) => { const q = await find(text, exact, sel); if (!q) return false; await p.waitForTimeout(250); const q2 = await find(text, exact, sel) || q;
  if (W < 700) await p.touchscreen.tap(q2.x, q2.y); else await p.mouse.click(q2.x, q2.y); await p.waitForTimeout(1500); return q2.name; };
const info = () => p.evaluate(() => { const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
  const mn = document.querySelector('#app > main'); const cs = mn ? getComputedStyle(mn) : null; const mr = mn ? mn.getBoundingClientRect() : null;
  return { view: document.body.dataset.view || '', wide: document.documentElement.scrollWidth - innerWidth, reg: document.documentElement.getAttribute('data-register') || '', zen: document.body.classList.contains('zen'), room: document.documentElement.getAttribute('data-room') || '', main: mn ? (cs.backgroundColor + (cs.backgroundImage !== 'none' ? ' +image' : '') + ' ' + Math.round(mr.left) + '..' + Math.round(mr.right) + ' top ' + Math.round(mr.top)) : 'none', heads: [...new Set([...document.querySelectorAll('h1, h2, h3, .eyebrow')].filter(vis).map((e) => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 50)))].slice(0, 14), pageH: document.documentElement.scrollHeight, y: Math.round(window.scrollY) }; });
const shot = (name) => p.screenshot({ path: out + '/' + name + '.jpg', type: 'jpeg', quality: 80 });
const log = [];
for (const st of steps) { const i = st.indexOf(':'); const op = i < 0 ? st : st.slice(0, i); const arg = i < 0 ? '' : st.slice(i + 1); let res = 'ok';
  try {
    if (op === 'tab') { res = await p.evaluate((t) => { const e = [...document.querySelectorAll('#primary-tabs button, #primary-tabs a, #primary-tabs [role=tab]')].filter((x) => x.getClientRects().length).find((x) => x.textContent.trim().replace(/\s+/g, ' ').includes(t)); if (!e) return 'NOT FOUND'; e.click(); return 'ok'; }, arg); await p.waitForTimeout(1600); }
    else if (op === 'click') { const n = await press(arg, false); res = n === false ? 'NOT FOUND' : 'ok → ' + n; }
    else if (op === 'click!') { const n = await press(arg, true); res = n === false ? 'NOT FOUND' : 'ok → ' + n; }
    else if (op === 'sel') { const n = await press('', false, arg); res = n === false ? 'NOT FOUND' : 'ok → ' + n; }
    else if (op === 'shot') { await shot(arg); const q = await info(); res = 'view ' + q.view + ' · room ' + q.room + ' · register ' + q.reg + (q.zen ? ' · zen' : '') + ' · wider than window by ' + q.wide + ' · main ' + q.main + ' · page ' + q.pageH + ' · ' + q.heads.slice(0, 4).join(' / '); }
    else if (op === 'folds') { const [name, n] = arg.split(':'); let k = 0; for (; k < Number(n || 3); k += 1) { await shot(name + '-' + (k + 1)); const q = await info(); if (q.y + H >= q.pageH - 4) { k += 1; break; } await p.evaluate((h) => window.scrollBy(0, Math.round(h * 0.88)), H); await p.waitForTimeout(700); } const q = await info(); res = k + ' pictures · view ' + q.view + ' · page ' + q.pageH + ' · ' + q.heads.slice(0, 8).join(' / '); }
    else if (op === 'scroll') { await p.evaluate((d) => window.scrollBy(0, d), Number(arg)); await p.waitForTimeout(600); }
    else if (op === 'top') { await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(500); }
    else if (op === 'key') { await p.keyboard.press(arg); await p.waitForTimeout(1200); }
    else if (op === 'type') { await p.keyboard.type(arg, { delay: 40 }); await p.waitForTimeout(1500); }
    else if (op === 'back') { const n = await press('Back', false) || await press('戻る', false); if (n === false) { await p.goBack().catch(() => {}); res = 'history back'; } await p.waitForTimeout(900); }
    else if (op === 'wait') await p.waitForTimeout(Number(arg));
    else if (op === 'lang') { const n = await press('switch to', false) || await press('に切り替え', false); res = n === false ? 'NOT FOUND' : 'ok → ' + n; }
    else if (op === 'info') { res = JSON.stringify(await info()); }
    else if (op === 'focus') { res = await p.evaluate((text) => { const name = (e) => ((e.getAttribute('aria-label') || '') + ' ' + (e.textContent || '')).trim().replace(/\s+/g, ' ');
      const hit = [...document.querySelectorAll('button, a[href], [role=button], [role=tab], [role=link], summary, [tabindex="0"]')].filter((e) => e.getClientRects().length && !e.closest('#bunki-sky')).find((e) => name(e).includes(text)); if (!hit) return 'NOT FOUND'; hit.focus(); return 'ok → ' + hit.tagName + ' ' + name(hit).slice(0, 40); }, arg); }
    else if (op === 'press') { const q = await find(arg, false); if (!q) res = 'NOT FOUND'; else { await p.waitForTimeout(250); const q2 = await find(arg, false) || q; await p.mouse.move(q2.x, q2.y); await p.mouse.down(); await p.waitForTimeout(130); await p.mouse.up(); await p.waitForTimeout(1500); res = 'ok → ' + q2.name; } }
    else if (op === 'look') { await p.evaluate((l) => document.documentElement.setAttribute('data-theme', l), arg); await p.waitForTimeout(1200); }
    else if (op === 'html') { res = await p.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return 'NOT FOUND'; const strip = (n) => { const c = n.cloneNode(true); c.querySelectorAll('svg, rt').forEach((x) => x.remove()); return c.outerHTML.replace(/\s+/g, ' ').replace(/ (aria-[a-z]+|data-[a-z-]+|lang|type|tabindex|role|id|style)="[^"]*"/g, ''); }; return strip(e).slice(0, 2600); }, arg); }
    else if (op === 'css') { res = await p.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return 'NOT FOUND'; const c = getComputedStyle(e), r = e.getBoundingClientRect(); return ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'color', 'marginTop', 'marginBottom', 'paddingTop', 'paddingBottom', 'paddingLeft', 'display', 'listStyleType', 'gap', 'borderTopWidth', 'borderTopColor'].map((k) => k + ':' + String(c[k]).split(',')[0]).join(' · ') + ' · box ' + Math.round(r.width) + 'x' + Math.round(r.height); }, arg); }
    else if (op === 'move') { const [x, y] = arg.split(',').map(Number); await p.mouse.move(x, y, { steps: 6 }); await p.waitForTimeout(700); }
    else if (op === 'names') { res = (await p.evaluate(() => { const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 3 && r.height > 3 && r.bottom > 0 && r.top < innerHeight; };
      return [...new Set([...document.querySelectorAll('button, a[href], [role=button], [role=tab], summary')].filter((e) => vis(e) && !e.closest('#bunki-sky') && !e.closest('#primary-tabs')).map((e) => ((e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 34))).filter(Boolean))].slice(0, 46).join(' | '); })); }
    else res = 'unknown step';
  } catch (e) { res = 'ERROR ' + String(e).slice(0, 140); }
  log.push(st + '  ⇒  ' + res); console.log(st + '  ⇒  ' + res); }
fs.writeFileSync(out + '/walk-log.txt', log.join('\n') + '\nerrors: ' + errs.length + ' ' + errs.slice(0, 6).join(' | ') + '\n');
console.log('errors:', errs.length, errs.slice(0, 3).join(' | ')); await b.close();
