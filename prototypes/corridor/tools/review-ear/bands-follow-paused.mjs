// Review check (hunt 7, "the bands"): the read-along bands must stay on the lit sentence's words when the text moves
// without a scroll or a resize. The read is PAUSED first, so no new sentence repaints the bands meanwhile (the lead's
// bands-follow-layout.mjs measured during a playing read, where the next sentence repaints them within its wait).
// Cases: the page's text size grows 12%; a 64 px block appears above the text (the control: the voice layer's observer
// refreshes on that one).
//   node bands-follow-paused.mjs --engine webkit|chromium [--width 390]
import { arg, open, openArticle, reporter } from './lib.mjs';

const ENGINE = arg('--engine', 'webkit');
const WIDTH = Number(arg('--width', '390'));
const tag = `${ENGINE}-${WIDTH}`;
const { rows, record } = reporter(tag);
const s = await open({ engine: ENGINE, width: WIDTH, clipSeconds: () => 6, voicePort: Number(arg('--voice-port', '19532')) });
const { page, press } = s;
const measure = () => page.evaluate(() => {
  const lit = [...document.querySelectorAll('#reader [data-speaking]')];
  const bands = [...document.querySelectorAll('.read-band')].map((b) => b.getBoundingClientRect()).filter((r) => r.width > 1);
  let inside = 0;
  for (const el of lit) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.bottom - Math.min(r.height, 30) / 2;
    if (bands.some((b) => cx >= b.left - 1 && cx <= b.right + 1 && cy >= b.top - 2 && cy <= b.bottom + 2)) inside += 1;
  }
  return { lit: lit.length, bands: bands.length, inside, wordTop: lit[0] ? Math.round(lit[0].getBoundingClientRect().top) : null, bandTop: bands.length ? Math.round(Math.min(...bands.map((b) => b.top))) : null,
    state: document.querySelector('.listen-row')?.dataset.voiceState || '' };
});
try {
  await openArticle(s);
  await s.sleep(1500);
  await press('#listen-toggle');
  await page.waitForFunction(() => document.querySelector('.listen-row')?.dataset.voiceState === 'paused', null, { timeout: 6000 });
  await s.sleep(400);
  const rest = await measure();
  record('paused: the bands lie on the lit words', rest.lit && rest.inside === rest.lit ? [] : [`${rest.inside} of ${rest.lit} lit words under a band`], JSON.stringify(rest));
  // the control: a block appears above the text (a childList change the layer's observer sees)
  await page.evaluate(() => { const first = document.querySelector('#reader p.reader-prose') || document.querySelector('#reader'); const spacer = document.createElement('div'); spacer.id = 'review-spacer'; spacer.style.cssText = 'height:64px'; first.parentNode.insertBefore(spacer, first); });
  await s.sleep(600);
  const block = await measure();
  record('paused: a 64 px block appears above the text, the bands follow', block.lit && block.inside === block.lit ? [] : [`${block.inside} of ${block.lit} lit words under a band (word top ${block.wordTop}, band top ${block.bandTop})`], JSON.stringify(block));
  await page.evaluate(() => document.getElementById('review-spacer')?.remove());
  await s.sleep(600);
  // the text size grows (no node added or removed)
  await page.evaluate(() => { document.documentElement.style.fontSize = '112%'; });
  await s.sleep(600);
  const size = await measure();
  record('paused: the text size grows 12%, the bands follow', size.lit && size.inside === size.lit ? [] : [`${size.inside} of ${size.lit} lit words under a band (word top ${size.wordTop}, band top ${size.bandTop})`], JSON.stringify(size));
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await s.sleep(400);
  // the reader's own text grows (a style change only: no node added or removed)
  await page.evaluate(() => { document.getElementById('reader').style.fontSize = '115%'; });
  await s.sleep(600);
  const own = await measure();
  record('paused: the reader’s text grows 15% (style only), the bands follow', own.lit && own.inside === own.lit ? [] : [`${own.inside} of ${own.lit} lit words under a band (word top ${own.wordTop}, band top ${own.bandTop})`], JSON.stringify(own));
  await page.screenshot({ path: `${process.env.REVIEW_OUT || '.'}/bands-paused-${tag}-text-size.png` }).catch(() => {});
  await page.evaluate(() => { document.getElementById('reader').style.fontSize = ''; });
  await s.sleep(600);
  // a word above the lit sentence tapped while paused (the ladder's first step shows its reading)
  const above = await page.evaluate(() => {
    const toks = [...document.querySelectorAll('#reader .tok.content[data-index]')];
    const first = toks.findIndex((t) => t.hasAttribute('data-speaking'));
    for (let i = first - 1; i >= 0; i -= 1) { const r = toks[i].getBoundingClientRect(); if (r.top > 120 && /\p{Script=Han}/u.test(toks[i].textContent)) return Number(toks[i].dataset.index); }
    return -1;
  });
  if (above >= 0) {
    const before = await measure();
    await press(page.locator(`#reader .tok[data-index="${above}"]`).first());
    await s.sleep(800);
    const tapped = await measure();
    record('paused: a word above the lit sentence is tapped (its reading shows), the bands follow', tapped.lit && tapped.inside === tapped.lit ? [] : [`${tapped.inside} of ${tapped.lit} lit words under a band (word top ${before.wordTop} → ${tapped.wordTop}, band top ${tapped.bandTop})`], JSON.stringify(tapped));
  }
} catch (error) {
  record('the check ran to its end', [String(error.message).split('\n')[0].slice(0, 200)]);
}
await s.close();
const failed = rows.filter((r) => !r.pass).length;
console.log(`${tag}: ${rows.length - failed} passed, ${failed} failed; page errors ${s.errors.length}; off this machine ${s.offMachine.length}`);
process.exit(failed ? 1 : 0);
