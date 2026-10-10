/** Executed UI proof for same-card reading state, contextual surname, and report names. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolveCorridorSite, resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SITE = resolveCorridorSite(), OUT = resolveCorridorEvidence();
mkdirSync(OUT, { recursive: true });
const require = createRequire(ROOT + '/package.json');
const { chromium } = require('playwright');
const { startStaticHost } = require(ROOT + '/prototypes/bunki-desktop/lib/static-host.cjs');
const identity = JSON.parse(readFileSync(SITE + '/build-identity.json'));
const card = JSON.parse(readFileSync(SITE + '/decks/n1/deck.json')).words[0].cards[0];
assert.equal(card.id, 'nn-67f6fe4a2f-ca1c2c4f');
const host = await startStaticHost({ site: SITE, port: 0 }), browser = await chromium.launch();
const proof = { identity, scope: 'Native public controls on unchanged N1 first card, disposable learner records. Display-only negative fixtures call the public sentenceNodes renderer on deeply frozen clones; they do not alter production data.', cases: [], failures: [] };
const check = (name, passed, observations) => { proof.cases.push({ name, passed, observations }); if (!passed) proof.failures.push(name); };
async function resting(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.allSettled(document.querySelector('.kp').getAnimations({ subtree: true }).filter(a => a.effect?.getComputedTiming().endTime !== Infinity).map(a => a.finished));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}
const census = () => {
  const rect = n => { const r = n?.getBoundingClientRect(); return r && { top: r.top, bottom: r.bottom, height: r.height }; };
  const face = document.querySelector('#kp-card'), p = face?.querySelector('.kp-sentence');
  const header = document.querySelector('.chrome');
  return { card: face?.dataset.card, zoom: face?.dataset.zoom, windowed: p?.classList.contains('kp-window'), inner: p?.scrollTop, height: p?.clientHeight, page: scrollY, anchor: rect(p), toggle: rect(face?.querySelector('.kp-zoom')), target: rect(face?.querySelector('.kp-target')), def: rect(face?.querySelector('.kp-answer>.kp-def')), bar: rect(document.querySelector('.kp-grades')), header: rect(header), folds: [...face.querySelectorAll('.kp-fold')].map(n => [n.className, n.open]), context: [...p.querySelectorAll('.kp-ctx')].map(n => [n.dataset.side, n.dataset.open || '']), overflow: document.documentElement.scrollWidth - innerWidth, ledger: localStorage.getItem('bunki-cloze:n1'), ruby: [...p.querySelectorAll('ruby')].filter(n => n.firstChild.textContent === '小村').map(n => n.querySelector('rt')?.textContent) };
};
const seated = (s, context) => s.windowed === true && s.inner > 0 && (!context || s.context.some(([, open]) => open === '1'));
const fits = s => s.toggle.top >= s.header.bottom && s.target.top >= Math.max(s.header.bottom, s.windowed ? s.anchor.top : s.header.bottom) && s.target.bottom <= Math.min(s.bar.top, s.windowed ? s.anchor.bottom : s.bar.top) && s.def.bottom <= s.bar.top && s.toggle.bottom <= s.bar.top && s.overflow === 0;
const kept = (before, after) => fits(after) || (!fits(before) && Math.abs(after.inner - before.inner) < 1 && Math.abs(after.page - before.page) < 1 && Math.abs(after.anchor.top - before.anchor.top) < 1 && after.height === before.height);
async function labels(page, cdp, lang) {
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  const get = async selector => {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
    return nodes.filter(n => !n.ignored).map(n => ({ role: n.role?.value, name: n.name?.value }));
  };
  const actual = { button: await get('#bunki-report-bug'), container: await get('.br-rail'), title: await page.locator('#bunki-report-bug').getAttribute('title') };
  const expected = lang === 'ja' ? ['この画面の問題を報告', '問題の報告'] : ['Report a problem on this screen', 'Report support'];
  check('actual accessibility tree report entry ' + lang, actual.button.some(n => n.role === 'button' && n.name === expected[0]) && actual.container.some(n => n.name === expected[1]) && actual.title === expected[0], actual);
}
try {
  for (const width of [320, 390]) for (const zoom of ['full', 'focus']) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    try {
      await context.addInitScript(zoom => localStorage.setItem('bunki-cloze:prefs:v3:n1', JSON.stringify({ look: 'world', zoom, sittings: 3, ruleSeen: true })), zoom);
      const page = await context.newPage(), cdp = await context.newCDPSession(page);
      await cdp.send('DOM.enable'); await cdp.send('Accessibility.enable');
      await page.goto(host.origin + '/index.html?deck=n1&ui=bi');
      await page.locator('#kp-start').click();
      check(`${width}/${zoom} bare original front`, await page.locator('#kp-card rt, #kp-card .kp-tok, #kp-card .kp-zoom').count() === 0 && await page.locator('#kp-card').getAttribute('data-card') === card.id, await page.locator('#kp-card').textContent());
      await page.locator('#kp-reveal').click(); await resting(page);
      for (const choice of [zoom === 'full' ? 'focus' : 'full', zoom]) {
        await page.locator(`#kp-zoom-${choice}`).click(); await resting(page);
        const switched = await page.evaluate(census);
        check(`${width}/${zoom} native ${choice} passage toggle keeps marked word actually inside window`, switched.zoom === choice && fits(switched), switched);
      }
      await page.locator('#kp-card .kp-target').click(); await page.locator('#kp-sheet-close').click();
      const initial = await page.evaluate(census);
      await page.locator('.kp-f-gloss>summary').click();
      await resting(page);
      await page.mouse.move(width - 4, 200); await page.mouse.wheel(0, initial.page - await page.evaluate(() => scrollY)); await page.waitForTimeout(100);
      if (zoom === 'focus') {
        const more = page.locator('.kp-ctx[data-side=before] .kp-more');
        const offered = await more.isVisible();
        check(`${width}/${zoom} folded context before the passage offers its opener before the compared actions`, offered, { offered, context: (await page.evaluate(census)).context });
        if (offered) { await more.click(); await resting(page); await page.mouse.move(width - 4, 200); await page.mouse.wheel(0, initial.page - await page.evaluate(() => scrollY)); await page.waitForTimeout(100); }
      }
      await page.locator('.kp-sentence').hover(); await page.mouse.wheel(0, 20); await page.waitForTimeout(100);
      let before = await page.evaluate(census);
      const ledger = before.ledger;
      check(`${width}/${zoom} compared state is non-default before language switches: windowed, inner seat moved by the wheel${zoom === 'focus' ? ', a context group opened' : ''}`, seated(before, zoom === 'focus'), { windowed: before.windowed, inner: before.inner, context: before.context });
      check(`${width}/${zoom} actual reveal surname`, JSON.stringify(before.ruby) === JSON.stringify(['こむら', 'こむら']), before.ruby);
      for (const lang of ['ja', 'bi']) {
        await page.locator(`#lang [data-lang=${lang}]`).click(); await resting(page);
        const after = await page.evaluate(census);
        const same = after.card === before.card && after.zoom === before.zoom && after.windowed === before.windowed && JSON.stringify(after.folds) === JSON.stringify(before.folds) && JSON.stringify(after.context) === JSON.stringify(before.context) && after.ledger === ledger;
        check(`${width}/${zoom} native language ${lang} preserves face/window/folds/context/ledger and reading controls`, same && kept(before, after), { before, after });
        await labels(page, cdp, lang); before = after;
      }
      check(`${width}/${zoom} compared state is non-default before world switches: windowed, inner seat moved${zoom === 'focus' ? ', a context group opened' : ''}`, seated(before, zoom === 'focus'), { windowed: before.windowed, inner: before.inner, context: before.context });
      for (const seal of ['金', '墨']) {
        await page.locator('#theme-seal').click(); await page.locator('.world-stone', { hasText: seal }).click(); await resting(page);
        const after = await page.evaluate(census);
        check(`${width}/${zoom} native world ${seal} retains presentation and fits`, after.card === before.card && after.zoom === zoom && after.ledger === ledger && JSON.stringify(after.folds) === JSON.stringify(before.folds) && JSON.stringify(after.context) === JSON.stringify(before.context) && Math.abs(after.inner - before.inner) < 1 && after.height === before.height && Math.abs(after.anchor.top - before.anchor.top) < 1 && kept(before, after), { before, after }); before = after;
      }
      // The existing word sheet's real kanji door goes through corridor go()/Back().
      await page.locator('#kp-card .kp-target').click();
      const lookupLedger = await page.evaluate(() => localStorage.getItem('bunki-cloze:n1'));
      const seat = await page.evaluate(census);
      check(`${width}/${zoom} compared state is non-default before 交 depth: windowed, inner seat moved${zoom === 'focus' ? ', a context group opened' : ''}`, seated(seat, zoom === 'focus'), { windowed: seat.windowed, inner: seat.inner, context: seat.context });
      await page.locator('.kp-sheet-kanji-door[data-kanji="交"]').click();
      await page.locator('#sheet').waitFor();
      const underSheet = await page.evaluate(() => ({ page: scrollY, inert: !!document.querySelector('.kp').closest('[inert]') }));
      await resting(page);
      underSheet.afterAsyncPaint = await page.evaluate(() => scrollY);
      await page.locator('#sheet-back').click(); await page.locator('#sheet').waitFor({ state: 'detached' }); await resting(page);
      const returned = await page.evaluate(census);
      check(`${width}/${zoom} actual 交 depth Back restores card presentation without ledger write`, returned.card === seat.card && returned.zoom === seat.zoom && returned.windowed === seat.windowed && returned.height === seat.height && JSON.stringify(returned.folds) === JSON.stringify(seat.folds) && JSON.stringify(returned.context) === JSON.stringify(seat.context) && returned.ledger === lookupLedger && Math.abs(returned.inner - seat.inner) < 1 && Math.abs(returned.anchor.top - seat.anchor.top) < 1 && kept(seat, returned) && underSheet.inert && underSheet.afterAsyncPaint === underSheet.page, { seat, underSheet, returned });
      await page.screenshot({ path: OUT + `/${width}-${zoom}-returned.png` });
      for (const [kind, glyph] of [['kanji', '交'], ['component', '亠']]) {
        if (!await page.locator('.kp-f-kanji').evaluate(n => n.open)) await page.locator('.kp-f-kanji>summary').click();
        const button = page.locator(`.kp-anatomy-${kind}[data-${kind}="${glyph}"]`);
        await button.scrollIntoViewIfNeeded();
        const anatomySeat = await page.evaluate(census);
        const available = await button.evaluate(n => { const r = n.getBoundingClientRect(); return { tag: n.tagName, width: r.width, height: r.height, name: n.getAttribute('aria-label'), points: [[0, 0], [-21, -21], [21, -21], [-21, 21], [21, 21]].map(([dx, dy]) => n.contains(document.elementFromPoint(r.x + r.width / 2 + dx, r.y + r.height / 2 + dy))) }; });
        await button.evaluate(n => n.addEventListener('click', e => { window.__anatomyTrusted = e.isTrusted; }, { once: true, capture: true }));
        await button.click(); await page.locator('#sheet').waitFor();
        const opened = await page.locator('#sheet').evaluate(n => ({ text: n.textContent, hero: n.querySelector('.hero-glyph')?.textContent, trusted: window.__anatomyTrusted }));
        await page.locator('#sheet-back').click(); await page.locator('#sheet').waitFor({ state: 'detached' }); await resting(page);
        const after = await page.evaluate(census);
        check(`${width}/${zoom} actual ${kind} anatomy door opens existing ${glyph} entry and restores reading face`, available.tag === 'BUTTON' && available.width >= 44 && available.height >= 44 && available.points.every(Boolean) && opened.hero === glyph && opened.trusted === true && after.card === anatomySeat.card && after.zoom === anatomySeat.zoom && after.ledger === anatomySeat.ledger && after.folds.find(([name]) => name.includes('kp-f-kanji'))[1] && JSON.stringify(after.context) === JSON.stringify(anatomySeat.context) && Math.abs(after.inner - anatomySeat.inner) < 1 && kept(anatomySeat, after), { available, opened, anatomySeat, after });
      }
    } finally { await context.close(); }
  }
  // Late tokens replace the revealed prose in place; that consumer must get the same projection.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  try {
    const page = await context.newPage(); let release;
    const gate = new Promise(r => { release = r; });
    await page.route('**/decks/n1/tokens.json', async route => { await gate; await route.continue(); });
    await page.goto(host.origin + '/index.html?deck=n1&ui=bi'); await page.locator('#kp-start').click(); await page.locator('#kp-reveal').click(); await resting(page);
    await page.locator('.kp-f-gloss>summary').click(); await resting(page);
    await page.mouse.move(386, 200); await page.mouse.wheel(0, 79 - await page.evaluate(() => scrollY)); await page.waitForTimeout(100);
    await page.locator('.kp-sentence').hover(); await page.mouse.wheel(0, 20); await page.waitForTimeout(100);
    const pre = await page.evaluate(census);
    check('late-token compared state is non-default before tokens arrive: windowed, inner seat moved by the wheel', seated(pre, false), { windowed: pre.windowed, inner: pre.inner });
    release(); await page.locator('.kp-sentence .kp-tok').first().waitFor(); await resting(page);
    const late = await page.evaluate(census);
    check('late-token actual consumer surname and manually chosen window/fold/inner/page seat', JSON.stringify(pre.ruby) === JSON.stringify(['こむら', 'こむら']) && JSON.stringify(late.ruby) === JSON.stringify(pre.ruby) && late.windowed === pre.windowed && late.height === pre.height && Math.abs(late.inner - pre.inner) < 1 && Math.abs(late.anchor.top - pre.anchor.top) < 1 && JSON.stringify(late.folds) === JSON.stringify(pre.folds) && JSON.stringify(late.context) === JSON.stringify(pre.context) && fits(late), { pre, late });
    const repeat = page.locator('.kp-sentence .kp-tok').filter({ has: page.locator('rt', { hasText: 'こむら' }) }).last();
    await repeat.click();
    const frame = await page.locator('#kp-sheet').evaluate(n => ({ text: n.textContent, reading: n.querySelector('.kp-sheet-reading')?.textContent, key: n.dataset.key, saves: n.querySelectorAll('#kp-take,#kp-take-list,#kp-sheet-full,.kp-sheet-en,.kp-sheet-def').length }));
    check('actual repeated person lookup is missing-entry with correct reading and no generic sense/save identity', frame.reading === 'こむら' && frame.key === '' && frame.saves === 0 && /This word is not in the dictionary/.test(frame.text) && !/small village|小さい村|しょうそん/.test(frame.text), frame);
    await page.locator('#kp-sheet-close').click(); await page.locator('#lang [data-lang=ja]').click(); await resting(page);
    const rebuilt = await page.evaluate(census);
    check('actual language rebuild keeps both contextual surname ruby', JSON.stringify(rebuilt.ruby) === JSON.stringify(['こむら', 'こむら']), rebuilt.ruby);
    const projections = await page.evaluate(async card => {
      const { sentenceNodes } = await import('./decks/player/mount.js');
      const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
      const cases = [{ name: 'exact', card }, { name: 'changed-id', card: { ...card, id: 'unrelated' } }, { name: 'changed-context', card: { ...card, ja: card.ja.replace('寿太郎', '太郎某') } }, { name: 'unrelated village', card: { id: 'village', ja: '小村', ruby: [['小村', 'しょうそん']] } }];
      return cases.map(({ name, card }) => {
        const frozen = freeze(structuredClone(card)), before = JSON.stringify(frozen);
        const token = freeze({ s: '小村', b: '小村', r: 'しょうそん', k: '語', at: name === 'unrelated village' ? 0 : 149 });
        const units = freeze([{ at: token.at, len: 2, tok: token }]);
        const n = sentenceNodes(frozen, { taps: { units, onTap() {} } }); document.body.append(n);
        const repeat = [...n.querySelectorAll('.kp-tok')].find(n => n.kpUnit?.tok?.s === '小村');
        const result = { name, ruby: [...n.querySelectorAll('ruby')].filter(n => n.firstChild.textContent === '小村').map(n => n.querySelector('rt')?.textContent), token: repeat?.kpUnit?.tok, unchanged: JSON.stringify(frozen) === before && token.r === 'しょうそん' };
        n.remove(); return result;
      });
    }, card);
    check('public sentenceNodes exact projection with immutable input and three executed negatives', projections.every(p => p.unchanged) && JSON.stringify(projections[0].ruby) === JSON.stringify(['こむら', 'こむら']) && projections[0].token?.r === 'こむら' && projections.slice(1).every(p => p.ruby.at(-1) === 'しょうそん' && p.token?.r === 'しょうそん' && !p.token.personContext), projections);
  } finally { await context.close(); }
} catch (error) { proof.failures.push(error.stack); }
finally { await browser.close(); await host.close(); proof.status = proof.failures.length ? 'failed' : 'passed'; writeFileSync(OUT + '/proof.json', JSON.stringify(proof, null, 2) + '\n'); console.log(JSON.stringify({ status: proof.status, cases: proof.cases.length, failures: proof.failures })); }
if (proof.failures.length) process.exitCode = 1;
