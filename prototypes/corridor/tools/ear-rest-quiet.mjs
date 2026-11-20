// The ear writes only what differs, and its own writes never wake the voice layer's rescan (the review of the merged
// branch, F2; the lead's ruling: "a repaint with nothing changed touches no node, no attribute and no text; changes inside
// the ear's own mark and line are not a reason to scan the document").
// The rescan is counted where it is scheduled: every timer whose body runs mountMarks(doc) (voice-layer.mjs rescan). A
// rescan can only be woken by a childList change under body, so a rescan with no such change from anything but the ear
// is one the ear caused. The ear's writes are the mutation records on its own nodes ([data-ear-own]: the mark, its line,
// its spot, its bands) and on the root's data-ear and data-ear-voice.
//   at rest, Today and a reading page: 5 s with nothing happening, then 5 s after one unrelated change under body (the
//     page drawn again, which runs one rescan and repaints every mark): no write by the ear, and no rescan the ear caused;
//   struck, Today: unpaired, an armed tap on Japanese strikes the mark with its line for about 4 s: the line's text is
//     written at most twice (shown, taken away) and the ear's writes wake no rescan.
//   node ear-rest-quiet.mjs --engine chromium|webkit [--width 1728|390] [--voice-port 1960x]
import { arg, dismissFirstLine, earMark, open, openArticle, reporter } from './review-ear/lib.mjs';

const ENGINE = arg('--engine', 'chromium');
const WIDTH = Number(arg('--width', '1728'));
const tag = `${ENGINE}-${WIDTH}`;
const { rows, record } = reporter(tag);

function count() {
  const own = (node) => (node?.nodeType === 1 ? node : node?.parentElement)?.closest?.('[data-ear-own]') || null;
  const ownNode = (node) => node?.nodeType === 1 && node.hasAttribute('data-ear-own');
  const c = (window.__quiet = { rescans: 0, earWrites: 0, earChildList: 0, lineWrites: 0, otherChildList: 0, what: [] });
  window.__quietReset = () => Object.assign(window.__quiet, { rescans: 0, earWrites: 0, earChildList: 0, lineWrites: 0, otherChildList: 0, what: [] });
  const set = window.setTimeout;
  window.setTimeout = function (fn, ...rest) {
    if (typeof fn === 'function' && String(fn).includes('mountMarks(doc)')) c.rescans += 1;
    return set.call(this, fn, ...rest);
  };
  new MutationObserver((list) => {
    for (const m of list) {
      const nodes = [...m.addedNodes, ...m.removedNodes];
      const ear = own(m.target) || (m.type === 'childList' && nodes.length && nodes.every(ownNode))
        || (m.target === document.documentElement && /^data-ear(-voice)?$/u.test(m.attributeName || ''));
      if (ear) {
        c.earWrites += 1;
        if (m.type === 'childList') c.earChildList += 1;
        if (m.type !== 'attributes' && own(m.target)?.classList?.contains('ear-why')) c.lineWrites += 1;
        if (c.what.length < 8) c.what.push(`${m.type} ${m.attributeName || ''} on ${m.target.nodeName}.${String(m.target.className || '').slice(0, 20)}`);
      } else if (m.type === 'childList' && document.body?.contains(m.target)) c.otherChildList += 1;
    }
  }).observe(document, { attributes: true, childList: true, characterData: true, subtree: true });
}
const read = (page) => page.evaluate(() => ({ ...window.__quiet, ear: document.documentElement.dataset.ear || '' }));
const reset = (page) => page.evaluate(() => window.__quietReset());
const show = (c) => `ear writes ${c.earWrites} (childList ${c.earChildList}, line ${c.lineWrites}); rescans ${c.rescans}; other childList records under body ${c.otherChildList}${c.what.length ? `; first: ${c.what.join(' | ')}` : ''}`;
const markShown = (page) => page.evaluate(() => [...document.querySelectorAll('.ear-mark')].some((m) => m.getClientRects().length));

async function atRest(where) {
  const s = await open({ engine: ENGINE, width: WIDTH, pair: false, voicePort: Number(arg('--voice-port', '19605')) });
  try {
    await s.context.addInitScript(count);
    if (where === 'today') {
      await s.ready();
      await s.press('#home-review').catch(() => {});
      await s.page.locator('#tab-today').waitFor();
      await s.press('#tab-today');
      await s.sleep(1500);
      await dismissFirstLine(s);
    } else {
      await openArticle(s, { start: false });
    }
    if (!(await markShown(s.page))) throw new Error(`no ear mark shown on ${where}`);
    await s.sleep(1500);
    await reset(s.page);
    await s.sleep(5000);
    const quiet = await read(s.page);
    await reset(s.page);
    // one change under body that is not the ear's: the page drawn again, as when a box opens or a word is looked up
    await s.page.evaluate(() => { const d = document.createElement('div'); d.hidden = true; d.setAttribute('data-quiet-stimulus', ''); document.body.append(d); });
    await s.sleep(5000);
    const stirred = await read(s.page);
    const problems = [];
    if (quiet.earWrites) problems.push(`with nothing happening the ear wrote ${quiet.earWrites} times`);
    if (quiet.rescans > quiet.otherChildList) problems.push(`with nothing happening ${quiet.rescans} rescans ran, ${quiet.otherChildList} woken by the page`);
    if (stirred.earWrites) problems.push(`a repaint with nothing changed for the ear wrote ${stirred.earWrites} times`);
    if (stirred.rescans < 1) problems.push('the page drawn again ran no rescan (the repaint was not exercised)');
    if (stirred.rescans > stirred.otherChildList) problems.push(`after one change ${stirred.rescans} rescans ran, ${stirred.otherChildList} woken by the page`);
    record(`at rest on ${where === 'today' ? 'Today' : 'a reading page'}: the ear writes nothing and wakes no rescan`, problems,
      `ear ${stirred.ear}; quiet 5 s: ${show(quiet)}; after one change, 5 s: ${show(stirred)}`);
  } catch (error) {
    record(`at rest on ${where}: the check ran to its end`, [String(error.message).split('\n')[0].slice(0, 200)]);
  }
  await s.close();
}

async function struck() {
  const s = await open({ engine: ENGINE, width: WIDTH, pair: false, voicePort: Number(arg('--voice-port', '19605')) });
  const { page } = s;
  try {
    await s.context.addInitScript(count);
    await s.ready();
    await s.press('#home-review').catch(() => {});
    await page.locator('#tab-today').waitFor();
    await s.press('#tab-today');
    await s.sleep(1500);
    await dismissFirstLine(s);
    await s.press(await earMark(page));
    await page.waitForFunction(() => document.documentElement.dataset.ear === 'armed', null, { timeout: 3000 });
    const target = await page.evaluate(() => {
      for (const el of document.querySelectorAll('main *')) {
        if (el.children.length || !/[\p{Script=Han}]{2}/u.test(el.textContent)) continue;
        const r = el.getBoundingClientRect();
        if (r.top > 140 && r.bottom < innerHeight - 160 && r.width > 10) return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: el.textContent.trim().slice(0, 12) };
      }
      return null;
    });
    if (!target) throw new Error('no Japanese on Today in plain view');
    await s.sleep(300);
    await reset(page);
    if (s.phone) await page.touchscreen.tap(target.x, target.y); else await page.mouse.click(target.x, target.y);
    const wasStruck = await page.waitForFunction(() => document.documentElement.dataset.ear === 'novoice', null, { timeout: 3000 }).then(() => true, () => false);
    const shown = await page.evaluate(() => { const why = document.querySelector('.ear-why:not([hidden])'); return why ? why.textContent : ''; });
    await s.sleep(5000);
    const c = await read(page);
    const gone = await page.evaluate(() => !document.querySelector('.ear-why:not([hidden])'));
    const problems = [];
    if (!wasStruck) problems.push('the mark was not struck');
    if (!shown) problems.push('the line did not show at once');
    if (!gone) problems.push('the line was still there after 5 s');
    if (c.lineWrites > 2) problems.push(`the line was written ${c.lineWrites} times while it showed`);
    if (c.rescans > c.otherChildList) problems.push(`${c.rescans} rescans ran, ${c.otherChildList} woken by the page: the ear's own writes woke the rest`);
    record('struck on Today: the line is written once to show and once to go, and the ear wakes no rescan', problems,
      `tapped "${target.text}"; line "${shown.slice(0, 40)}"; ${show(c)}; ear now ${c.ear}`);
  } catch (error) {
    record('struck: the check ran to its end', [String(error.message).split('\n')[0].slice(0, 200)]);
  }
  await s.close();
}

await atRest('today');
await atRest('reader');
await struck();
const failed = rows.filter((r) => !r.pass).length;
console.log(`${tag}: ${rows.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
