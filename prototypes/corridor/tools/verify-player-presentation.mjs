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
const { chromium, webkit } = require('playwright');
const engine = process.env.KAIRO_BROWSER || 'chromium';
assert(['chromium', 'webkit'].includes(engine));
const { startStaticHost } = require(ROOT + '/prototypes/bunki-desktop/lib/static-host.cjs');
const identity = JSON.parse(readFileSync(SITE + '/build-identity.json'));
const card = JSON.parse(readFileSync(SITE + '/decks/n1/deck.json')).words[0].cards[0];
assert.equal(card.id, 'nn-67f6fe4a2f-ca1c2c4f');
const host = await startStaticHost({ site: SITE, port: 0 }), browser = await ({ chromium, webkit })[engine].launch();
const proof = { identity, engine, browserVersion: browser.version(), scope: 'Native public controls on unchanged N1 first card, disposable learner records. Display-only negative fixtures call the public sentenceNodes renderer on deeply frozen clones; they do not alter production data.', cases: [], failures: [] };
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
async function labels(page, cdp, lang) {
  const expected = lang === 'ja' ? ['この画面の不具合を知らせる', '不具合を知らせる'] : ['Report a problem on this screen', 'Report a problem'];
  if (!cdp) {
    const button = page.getByRole('button', { name: expected[0], exact: true });
    const container = page.locator('.br-rail');
    const observations = { button: await button.ariaSnapshot(), container: await container.ariaSnapshot(), title: await button.getAttribute('title') };
    check('WebKit accessible report entry ' + lang, await button.count() === 1 && observations.container.includes(expected[1]) && observations.title === expected[0], observations);
    return;
  }
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  const get = async selector => {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
    return nodes.filter(n => !n.ignored).map(n => ({ role: n.role?.value, name: n.name?.value }));
  };
  const actual = { button: await get('#bunki-report-bug'), container: await get('.br-rail'), title: await page.locator('#bunki-report-bug').getAttribute('title') };
  // the house voice (one hand, slice E): 不具合を知らせる · Report a problem
  check('actual accessibility tree report entry ' + lang, actual.button.some(n => n.role === 'button' && n.name === expected[0]) && actual.container.some(n => n.name === expected[1]) && actual.title === expected[0], actual);
}
try {
  for (const width of [320, 390]) for (const zoom of ['full', 'focus']) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    try {
      await context.addInitScript(zoom => localStorage.setItem('bunki-cloze:prefs:v3:n1', JSON.stringify({ look: 'world', zoom, sittings: 3, ruleSeen: true, againCoachSeen: true })), zoom);
      const page = await context.newPage(), cdp = engine === 'chromium' ? await context.newCDPSession(page) : null;
      if (cdp) { await cdp.send('DOM.enable'); await cdp.send('Accessibility.enable'); }
      await page.goto(host.origin + '/index.html?deck=n1&ui=bi');
      // The language controls appear before catalog/record hydration finishes.
      // Establish the loaded deck home before testing either accessible name.
      await page.waitForFunction(() => document.body.dataset.ready === '1');
      await page.locator('#kp-start').waitFor();
      await page.locator('#bunki-report-bug').waitFor();
      // the report entry's accessible names, in both languages, on the deck home (the card screen has none)
      for (const lang of ['ja', 'bi']) { await page.locator(`#lang [data-lang=${lang}]`).click(); await labels(page, cdp, lang); }
      await page.locator('#kp-start').click();
      check(`${width}/${zoom} bare original front`, await page.locator('#kp-card rt, #kp-card .kp-tok, #kp-card .kp-zoom').count() === 0 && await page.locator('#kp-card').getAttribute('data-card') === card.id, await page.locator('#kp-card').textContent());
      await page.locator('#kp-reveal').click(); await resting(page);
      for (const choice of [zoom === 'full' ? 'focus' : 'full', zoom]) {
        await page.locator(`#kp-zoom-${choice}`).click(); await resting(page);
        const switched = await page.evaluate(census);
        check(`${width}/${zoom} native ${choice} passage toggle keeps marked word actually inside window`, switched.zoom === choice && fits(switched), switched);
      }
      for (const choice of [zoom === 'full' ? 'focus' : 'full', zoom]) {
        const button = page.locator(`#kp-zoom-${choice}`), held = await page.evaluate(census);
        await button.evaluate(n => { window.__zoomTrusted = undefined; n.addEventListener('click', e => { window.__zoomTrusted = e.isTrusted; }, { once: true, capture: true }); });
        await button.focus(); await page.keyboard.press('Enter'); await resting(page);
        const keyed = await page.evaluate(census), focus = await page.evaluate(() => ({ active: document.activeElement?.id || document.activeElement?.tagName, trusted: window.__zoomTrusted }));
        check(`${width}/${zoom} keyboard Enter on ${choice} keeps focus on that button, the marked word inside the window and the ledger unwritten`, keyed.zoom === choice && focus.active === `kp-zoom-${choice}` && focus.trusted === true && keyed.card === held.card && keyed.ledger === held.ledger && fits(keyed), { held, keyed, focus });
      }
      await page.locator('#kp-card .kp-target').click(); await page.locator('#mini[data-from="deck"]').waitFor(); await page.keyboard.press('Escape'); await page.locator('#mini').waitFor({ state: 'detached' });
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
      // The app opens its decks in the focus room (John, 2026-10-13: "SRS section very clear and smooth with
      // NO CLUTTER at all"): while a card is up there is no top bar, so the language and world switches
      // are not on the card screen; the card's own Readings switch is. It is the comparison here: switching
      // readings must keep the exact reading pose (nothing moves), off-window and fitted. Hfix-1B (§7 line 28,
      // HG-1): the one quiet report door is on the card screen too, in the study bar's end slot, never over
      // the card; its names are checked on the deck home above, and the same element serves both.
      const chrome = await page.evaluate(() => {
        const box = (sel) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width ? r : null; };
        const glyph = box('#bunki-report-bug svg'), bar = box('.kp-top-study');
        return { lang: !!document.querySelector('#lang')?.getClientRects().length, world: !!document.querySelector('#theme-seal')?.getClientRects().length,
          report: !!glyph && !!bar && glyph.left >= bar.left && glyph.right <= bar.right && glyph.top >= bar.top && glyph.bottom <= bar.bottom,
          readings: document.getElementById('kp-readings')?.getAttribute('aria-pressed') };
      });
      check(`${width}/${zoom} the card screen has no top bar (no language or world switch), keeps the one report door in its study bar's end slot, and offers its Readings switch, on`, !chrome.lang && !chrome.world && chrome.report && chrome.readings === 'true', chrome);
      const same = (a, b) => a.card === b.card && a.zoom === b.zoom && a.windowed === b.windowed && a.inner === b.inner && a.anchor.top === b.anchor.top && a.height === b.height && a.page === b.page && a.ledger === b.ledger && JSON.stringify(a.context) === JSON.stringify(b.context) && JSON.stringify(a.folds) === JSON.stringify(b.folds) && JSON.stringify(a.target) === JSON.stringify(b.target);
      // Deliberately off-window: trusted inner wheel chooses an earlier paragraph; where the window is tall
      // enough to keep the marked word inside, a trusted outer scroll then carries it above the screen.
      const beforeOff = await page.evaluate(census);
      await page.locator('.kp-sentence').hover(); await page.mouse.wheel(0, -beforeOff.inner); await page.waitForTimeout(100);
      await page.mouse.wheel(0, 20); await page.waitForTimeout(100);
      let offSeat = await page.evaluate(census);
      if (fits(offSeat)) { await page.mouse.move(width - 4, 200); await page.mouse.wheel(0, offSeat.target.bottom - offSeat.header.bottom + 20); await page.waitForTimeout(100); offSeat = await page.evaluate(census); }
      check(`${width}/${zoom} deliberate off-window comparison has open/nonzero/windowed pose and target outside`, seated(offSeat, zoom === 'focus') && !fits(offSeat), offSeat);
      // off-window the switch may sit under the session bar, where a pointer would first scroll the page:
      // it is pressed from the keyboard (a trusted Enter on the focused switch, the page left where it is)
      for (const state of ['false', 'true']) {
        await page.locator('#kp-readings').evaluate(n => n.focus({ preventScroll: true })); await page.keyboard.press('Enter'); await resting(page);
        const afterOff = await page.evaluate(census), pressed = await page.locator('#kp-readings').getAttribute('aria-pressed');
        check(`${width}/${zoom} deliberately off-window Readings ${state === 'true' ? 'on' : 'off'} retains exact reading pose`, pressed === state && same(afterOff, offSeat), { before: offSeat, after: afterOff, pressed }); offSeat = afterOff;
      }
      await page.mouse.move(width - 4, 200); await page.mouse.wheel(0, offSeat.anchor.top - initial.anchor.top); await page.waitForTimeout(100);
      // Use trusted inner scrolling to fit the target before the preserved +20px reading adjustment.
      const beforeAim = await page.evaluate(census);
      await page.locator('.kp-sentence').hover();
      await page.mouse.wheel(0, (beforeAim.target.top + beforeAim.target.bottom - beforeAim.anchor.top - beforeAim.anchor.bottom) / 2);
      await page.waitForTimeout(100);
      await page.locator('.kp-sentence').hover(); await page.mouse.wheel(0, 20); await page.waitForTimeout(100);
      let before = await page.evaluate(census);
      const ledger = before.ledger;
      check(`${width}/${zoom} compared state is non-default before the Readings switch: windowed, inner seat moved by the wheel${zoom === 'focus' ? ', a context group opened' : ''}`, seated(before, zoom === 'focus'), { windowed: before.windowed, inner: before.inner, context: before.context });
      check(`${width}/${zoom} compared pose actually fits before the Readings switch`, fits(before), before);
      check(`${width}/${zoom} actual reveal surname`, JSON.stringify(before.ruby) === JSON.stringify(['こむら', 'こむら']), before.ruby);
      for (const state of ['false', 'true']) {
        await page.locator('#kp-readings').click(); await resting(page);
        const after = await page.evaluate(census), pressed = await page.locator('#kp-readings').getAttribute('aria-pressed');
        check(`${width}/${zoom} native Readings ${state === 'true' ? 'on' : 'off'} preserves face/window/folds/context/ledger and fits`, pressed === state && same(after, before) && after.ledger === ledger && JSON.stringify(after.ruby) === JSON.stringify(before.ruby) && fits(after), { before, after, pressed }); before = after;
      }
      // The word slip's real kanji door (its kanji band) goes through corridor go()/Back().
      await page.locator('#kp-card .kp-target').click();
      const lookupLedger = await page.evaluate(() => localStorage.getItem('bunki-cloze:n1'));
      const seat = await page.evaluate(census);
      check(`${width}/${zoom} compared state is non-default before 交 depth: windowed, inner seat moved${zoom === 'focus' ? ', a context group opened' : ''}`, seated(seat, zoom === 'focus'), { windowed: seat.windowed, inner: seat.inner, context: seat.context });
      check(`${width}/${zoom} depth Back comparison starts with fitted reading controls`, fits(seat), seat);
      await page.locator('#mini[data-from="deck"] .mini-kanji-row[data-kanji="交"]').click();
      await page.locator('#sheet').waitFor();
      const underSheet = await page.evaluate(() => ({ page: scrollY, inert: !!document.querySelector('.kp').closest('[inert]') }));
      await resting(page);
      underSheet.afterAsyncPaint = await page.evaluate(() => scrollY);
      await page.locator('#sheet-back').click(); await page.locator('#sheet').waitFor({ state: 'detached' }); await resting(page);
      const returned = await page.evaluate(census);
      check(`${width}/${zoom} actual 交 depth Back restores card presentation without ledger write`, returned.card === seat.card && returned.zoom === seat.zoom && returned.windowed === seat.windowed && returned.height === seat.height && JSON.stringify(returned.folds) === JSON.stringify(seat.folds) && JSON.stringify(returned.context) === JSON.stringify(seat.context) && returned.ledger === lookupLedger && Math.abs(returned.inner - seat.inner) < 1 && Math.abs(returned.anchor.top - seat.anchor.top) < 1 && fits(returned) && underSheet.inert && underSheet.afterAsyncPaint === underSheet.page, { seat, underSheet, returned });
      await page.screenshot({ path: OUT + `/${width}-${zoom}-returned.png` });
      for (const [kind, glyph] of [['kanji', '交'], ['component', '亠']]) {
        if (!await page.locator('.kp-f-kanji').evaluate(n => n.open)) await page.locator('.kp-f-kanji>summary').click();
        const button = page.locator(`.kp-anatomy-${kind}[data-${kind}="${glyph}"]`);
        // Added distinct off-window Back case, preserving exact purposeful outer/inner scrolling before establishing the fitted pose for the unchanged original assertion.
        await button.scrollIntoViewIfNeeded();
        const candidateOff = await page.evaluate(census);
        await page.mouse.move(width - 4, 200); await page.mouse.wheel(0, Math.max(80, candidateOff.target.bottom - candidateOff.header.bottom + 20)); await page.waitForTimeout(100);
        const anatomyOff = await page.evaluate(census);
        check(`${width}/${zoom} deliberately off-window ${kind} before opening`, !fits(anatomyOff), anatomyOff);
        await button.click(); await page.locator('#sheet').waitFor(); await page.locator('#sheet-back').click(); await page.locator('#sheet').waitFor({ state: 'detached' }); await resting(page);
        const returnedOff = await page.evaluate(census);
        check(`${width}/${zoom} deliberately off-window ${kind} Back retains exact reading pose`, returnedOff.card === anatomyOff.card && returnedOff.zoom === anatomyOff.zoom && returnedOff.windowed === anatomyOff.windowed && returnedOff.inner === anatomyOff.inner && returnedOff.anchor.top === anatomyOff.anchor.top && returnedOff.height === anatomyOff.height && returnedOff.page === anatomyOff.page && returnedOff.ledger === anatomyOff.ledger && JSON.stringify(returnedOff.context) === JSON.stringify(anatomyOff.context) && JSON.stringify(returnedOff.folds) === JSON.stringify(anatomyOff.folds), { before: anatomyOff, after: returnedOff });
        await page.mouse.move(width - 4, 200); await page.mouse.wheel(0, (await page.evaluate(census)).anchor.top - initial.anchor.top); await page.waitForTimeout(100);
        // Keep the target near the window bottom, then reveal the anatomy button with the least trusted outer scroll.
        const beforeAnatomy = await page.evaluate(census);
        await page.locator('.kp-sentence').hover();
        await page.mouse.wheel(0, beforeAnatomy.target.bottom - (beforeAnatomy.anchor.bottom - 8));
        await page.waitForTimeout(100);
        const anatomyDelta = await button.evaluate(n => n.getBoundingClientRect().bottom - (document.querySelector('.kp-grades').getBoundingClientRect().top - 12));
        await page.mouse.move(width - 4, 200); await page.mouse.wheel(0, Math.max(0, anatomyDelta)); await page.waitForTimeout(100);
        await button.scrollIntoViewIfNeeded();
        const anatomySeat = await page.evaluate(census);
        check(`${width}/${zoom} compared ${kind} anatomy pose fitted before opening`, fits(anatomySeat), anatomySeat);

        const available = await button.evaluate(n => { const r = n.getBoundingClientRect(); return { tag: n.tagName, width: r.width, height: r.height, name: n.getAttribute('aria-label'), points: [[0, 0], [-21, -21], [21, -21], [-21, 21], [21, 21]].map(([dx, dy]) => n.contains(document.elementFromPoint(r.x + r.width / 2 + dx, r.y + r.height / 2 + dy))) }; });
        await button.evaluate(n => n.addEventListener('click', e => { window.__anatomyTrusted = e.isTrusted; }, { once: true, capture: true }));
        await button.click(); await page.locator('#sheet').waitFor();
        const opened = await page.locator('#sheet').evaluate(n => ({ text: n.textContent, hero: n.querySelector('.hero-glyph')?.textContent, trusted: window.__anatomyTrusted }));
        await page.locator('#sheet-back').click(); await page.locator('#sheet').waitFor({ state: 'detached' }); await resting(page);
        const after = await page.evaluate(census);
        check(`${width}/${zoom} actual ${kind} anatomy door opens existing ${glyph} entry and restores reading face`, available.tag === 'BUTTON' && available.width >= 44 && available.height >= 44 && available.points.every(Boolean) && opened.hero === glyph && opened.trusted === true && after.card === anatomySeat.card && after.zoom === anatomySeat.zoom && after.ledger === anatomySeat.ledger && after.folds.find(([name]) => name.includes('kp-f-kanji'))[1] && JSON.stringify(after.context) === JSON.stringify(anatomySeat.context) && Math.abs(after.inner - anatomySeat.inner) < 1 && fits(after), { available, opened, anatomySeat, after });
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
    // the slip (one slip everywhere): the missing entry keeps the passage reading, no key, no Save, no door, no
    // generic sense — the slip's own miss line in its place
    const frame = await page.locator('#mini[data-from="deck"]').evaluate(n => ({ text: n.textContent, reading: n.querySelector('.mini-reading')?.textContent, key: n.dataset.key, saves: n.querySelectorAll('#mini-take,.mini-word[data-action="entry.open"],.mini-note,.mini-gloss[lang="ja"]').length, miss: n.querySelector('.mini-gloss')?.textContent }));
    check('actual repeated person lookup is missing-entry with correct reading and no generic sense/save identity', frame.reading === 'こむら' && frame.key === '' && frame.saves === 0 && /No dictionary entry for this spelling\./.test(frame.miss) && !/small village|小さい村|しょうそん/.test(frame.text), frame);
    // the card screen has no language switch in the focus room; the card is rebuilt on the way back from
    // the corridor's kanji page instead (corridor go()/Back())
    await page.keyboard.press('Escape'); await page.locator('#mini').waitFor({ state: 'detached' });
    await page.locator('#kp-card .kp-target').click(); await page.locator('#mini[data-from="deck"] .mini-kanji-row[data-kanji="交"]').click(); await page.locator('#sheet').waitFor();
    await page.locator('#sheet-back').click(); await page.locator('#sheet').waitFor({ state: 'detached' }); await resting(page);
    const rebuilt = await page.evaluate(census);
    check('actual rebuild (back from the kanji page) keeps both contextual surname ruby', JSON.stringify(rebuilt.ruby) === JSON.stringify(['こむら', 'こむら']), rebuilt.ruby);
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
