// Re-check of the fix round (ruling R-a): held on, on the phone, the app's own controls act and are never spoken; "anything
// with a button role or its own click action". The fix finds controls by tag, role, an onclick property or data-action
// (ear.mjs appControlAt). A control the app wires with addEventListener('click') on a plain element is none of these.
// This census (Chromium, which can list an element's listeners) walks a screen, finds visible elements whose own text is
// Japanese, that the ear would speak (unitAt) and that appControlAt does not call a control, and lists those that carry a
// click listener of their own (or one on an ancestor up to three levels, not the page or a reader paragraph).
//   node fr1-control-census.mjs [--ui ja|bi] [--width 390] [--screens today,learn,words,me]
import { arg, dismissFirstLine, open } from './lib.mjs';

const UI = arg('--ui', 'ja');
const WIDTH = Number(arg('--width', '390'));
const SCREENS = arg('--screens', 'today,learn,words,me').split(',');
const s = await open({ engine: 'chromium', width: WIDTH, ui: UI, pair: false, voicePort: Number(arg('--voice-port', '19533')) });
const { page } = s;
const cdp = await page.context().newCDPSession(page);
const out = {};
for (const screen of SCREENS) {
  await s.ready();
  await s.press('#home-review').catch(() => {});
  await page.locator(`#tab-${screen === 'learn' ? 'learn' : screen}`).waitFor({ timeout: 8000 }).catch(() => {});
  await s.press(`#tab-${screen}`).catch(() => {});
  await s.sleep(1500);
  await dismissFirstLine(s);
  // candidates, marked in the page
  const n = await page.evaluate(async () => {
    const { appControlAt, findUnit } = await import('/modules/ear.mjs');
    const display = (el) => getComputedStyle(el).display;
    let k = 0;
    for (const el of document.querySelectorAll('body *')) {
      el.removeAttribute('data-census');
      if (el.closest('[data-ear-own], #drift-layer, script, style')) continue;
      const own = [...el.childNodes].filter((c) => c.nodeType === 3).map((c) => c.nodeValue).join('');
      if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(own)) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight || getComputedStyle(el).visibility === 'hidden') continue;
      if (appControlAt(el, { display })) continue;
      let unit = null;
      try { unit = findUnit(el, { display }); } catch { unit = null; }
      if (!unit) continue;
      el.setAttribute('data-census', String(k++));
    }
    return k;
  });
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const { result } = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('[data-census="${i}"]')` });
    let node = result.objectId, depth = 0, hit = null;
    while (node && depth < 4 && !hit) {
      const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: node });
      const own = listeners.filter((l) => ['click', 'pointerup', 'pointerdown', 'mousedown'].includes(l.type));
      const desc = await cdp.send('Runtime.callFunctionOn', { objectId: node, functionDeclaration: 'function(){ return this.tagName + (this.id ? "#" + this.id : "") + (typeof this.className === "string" && this.className ? "." + this.className.trim().split(/\\s+/).slice(0, 3).join(".") : ""); }', returnByValue: true });
      const name = desc.result.value;
      if (own.length && !/^(BODY|HTML|MAIN)|#app$|#reader|reader-prose/.test(name)) hit = { at: name, depth, types: [...new Set(own.map((l) => l.type))].join('/') };
      const parent = await cdp.send('Runtime.callFunctionOn', { objectId: node, functionDeclaration: 'function(){ return this.parentElement; }' });
      node = parent.result.objectId; depth += 1;
    }
    if (hit) {
      const text = await page.evaluate((i) => document.querySelector(`[data-census="${i}"]`).textContent.trim().replace(/\s+/g, ' ').slice(0, 24), i);
      rows.push({ text, ...hit });
    }
  }
  out[screen] = rows;
  console.log(`${screen}: ${n} speakable non-controls, ${rows.length} with a click or pointer listener of their own or near`);
  for (const r of rows.slice(0, 25)) console.log(`   "${r.text}" ← ${r.at} (+${r.depth}) ${r.types}`);
}
await s.close();
