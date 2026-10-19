/** Hfix-2c R2 focused review-room check. The shared pixel analyser is copied,
 * unchanged, into retained evidence; its navigation/run is replaced here.
 * No production data or learner scheduling is rewritten: isolated legacy seeds
 * and served display-contract fixtures exercise the public review renderer.
 * Run one engine at a time at starting load <=14. This is not app-wide acceptance.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { loadavg } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';

assert(['webkit', 'chromium'].includes(process.env.KAIRO_BROWSER), 'Name exactly one engine');
assert(!process.env.SWEEP_WORLDS && !process.env.SWEEP_STATES, 'Focused check requires all eleven worlds');
assert(process.env.KAIRO_SITE_DIR && process.env.KAIRO_ARTIFACT_SHA256, 'Pin immutable site and artifact digest');
const output = resolveCorridorEvidence(); mkdirSync(output, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const originalUrl = new URL('./verify-contrast-sweep.mjs', import.meta.url);
const original = readFileSync(originalUrl, 'utf8');
const seam = '/* ------------------------------------------------------------------ run */';
assert.equal(original.split(seam).length, 2, 'Shared analyser run seam remains unique');
let prefix = original.split(seam)[0].replace(/from '([^']+)'/gu, (whole, specifier) => specifier.startsWith('.')
  ? `from ${JSON.stringify(new URL(specifier, originalUrl).href)}`
  : specifier === 'playwright-core' ? `from ${JSON.stringify(import.meta.resolve(specifier))}` : whole);
assert.equal(prefix.split('createRequire(import.meta.url)').length, 2);
prefix = prefix.replace('createRequire(import.meta.url)', `createRequire(${JSON.stringify(originalUrl.href)})`);
const runner = prefix + '\nimport { loadavg as reviewLoad } from "node:os";\n' +
  `import { readAppRecord as reviewRecord } from ${JSON.stringify(new URL('./record-test-support.mjs', import.meta.url).href)};\n` +
  `import { createHash as reviewCreateHash } from 'node:crypto';\n` +
  `await (${reviewRun.toString()})();\n`;
const runnerPath = join(output, 'hfix2c-review-contrast-runner.mjs');
writeFileSync(runnerPath, runner);
writeFileSync(join(output, 'adapter.json'), JSON.stringify({
  original: originalUrl.href, originalSha256: hash(original), adapterSha256: hash(readFileSync(new URL(import.meta.url))),
  runnerSha256: hash(runner), startingLoad: loadavg(),
  scope: 'Review back only: all eleven worlds at 320/390/1440, actual listed and served failed contract; sumi pending/complete smoke; real-pixel negative controls. Shared analyser bytes unchanged before run seam.',
  mutations: 'Only an isolated served kanjiDisplayRecord return and in-browser negative-control style. Production files, source data, scheduler and durable learner record are never changed.'
}, null, 2) + '\n');
assert(loadavg()[0] <= 14, `No browser launch: load ${loadavg()[0]} >14`);
const result = spawnSync(process.execPath, [runnerPath], { stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

async function reviewRun() {
  engine = process.env.KAIRO_BROWSER;
  const stamp = () => ({ at: new Date().toISOString(), load: reviewLoad() });
  const report = {
    identity, engine, started: stamp(), browserVersion: null, rows: [], controls: [], fixtures: [], errors: [],
    browserClosed: false, hostClosed: false,
    boundary: 'Automated isolated browser, not a physical phone. Public review navigation without grading. Listed rows are actual served data; failed/pending/complete rows are explicitly labelled display-contract fixtures. No SRS schedule or learner record is mutated by the test.'
  };
  const receiptPath = join(evidence, `review-contrast-${engine}.json`);
  const persist = () => writeFileSync(receiptPath, JSON.stringify(report, null, 2) + '\n');
  const check = row => { report.rows.push(row); console.log(`${row.pass ? 'PASS' : 'RED'} ${row.world}/${row.state}/${row.width} review contrast + geometry + state`); persist(); };
  const sha = value => reviewCreateHash('sha256').update(value).digest('hex');
  const sourceJS = readFileSync(join(site, 'corridor.js'), 'utf8');
  const seed = { v: 1, taken: [{ t: 'kanji', id: '生', label: '生', ts: 1, started: 1 }], srs: {}, revlog: [], obslog: [], stats: {}, suspended: {}, srsPrefs: { newPerDay: 20 } };
  const protectedKeys = ['srs', 'taken', 'revlog', 'obslog', 'stats', 'suspended'];
  const snapshot = record => Object.fromEntries(protectedKeys.map(key => [key, record[key]]));
  const contract = {
    on: ['セイ', 'ショウ'], kun: ['い.きる', 'い.かす', 'い.ける', 'う.まれる', 'うま.れる', 'う.まれ', 'うまれ', 'う.む', 'お.う', 'は.える', 'は.やす', 'き', 'なま', 'なま-', 'な.る', 'な.す', 'む.す', '-う'],
    lessonOn: ['セイ', 'ショウ'], lessonKun: ['い.きる', 'い.かす', 'い.ける'], officialReadings: [], readingsState: 'complete'
  };
  let browser;
  mkdirSync(join(evidence, 'shots'), { recursive: true });
  function geometry() {
    const box = r => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
    function inspect(selector) {
      const el = document.querySelector(selector);
      if (!el) return { missing: true };
      const r = el.getBoundingClientRect();
      const xs = [r.left + 1, (r.left + r.right) / 2, r.right - 1];
      const ys = [r.top + 1, (r.top + r.bottom) / 2, r.bottom - 1];
      // Rounded button corners belong to the surrounding ground, not the
      // painted hit target. Probe their centre and four edge midpoints; retain
      // all nine centre/edge/corner probes for the rectangular fallback line.
      const points = el.matches('#zen-exit, #zen-more')
        ? [[xs[1], ys[1]], [xs[0], ys[1]], [xs[2], ys[1]], [xs[1], ys[0]], [xs[1], ys[2]]]
        : xs.flatMap(x => ys.map(y => [x, y]));
      const hits = points.map(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return { x, y, hit: hit ? hit.tagName + (hit.id ? '#' + hit.id : '') + (hit.className ? '.' + String(hit.className).replace(/\s+/g, '.') : '') : null,
          own: !!hit && (hit === el || el.contains(hit)) };
      });
      const textBoxes = []; const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent.trim()) continue;
        const range = document.createRange(); range.selectNodeContents(n);
        textBoxes.push(...[...range.getClientRects()].map(box));
      }
      const clips = [];
      for (let parent = el.parentElement; parent; parent = parent.parentElement) {
        const cs = getComputedStyle(parent);
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') clips.push({ ...box(parent.getBoundingClientRect()), x: cs.overflowX !== 'visible', y: cs.overflowY !== 'visible' });
      }
      const fullyVisible = textBoxes.length > 0 && textBoxes.every(t => t.left >= -0.5 && t.right <= innerWidth + 0.5 && t.top >= -0.5 && t.bottom <= innerHeight + 0.5 && clips.every(c => (!c.x || (t.left >= c.left - 0.5 && t.right <= c.right + 0.5)) && (!c.y || (t.top >= c.top - 0.5 && t.bottom <= c.bottom + 0.5))));
      return { rect: box(r), hits, textBoxes, clips, fullyVisible, unobscured: hits.every(h => h.own), text: el.textContent,
        colour: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor };
    }
    return { fallback: inspect('.review-kanji-status'), exit: inspect('#zen-exit'), more: inspect('#zen-more'),
      state: document.querySelector('[data-kanji-readings]')?.dataset.kanjiReadings,
      world: document.documentElement.dataset.theme || 'hokusai', scrollY, overflow: document.documentElement.scrollWidth - innerWidth };
  }
  async function measure(page, world, state) {
    const data = await page.evaluate(([owned, inks]) => window.__sweep.collect(owned, [], inks), [OWNED, INKS]);
    await page.evaluate(() => window.__sweep.hide(true));
    let shot, hiddenPaint;
    try {
      // Negative controls must never outrank the shared glyph-hiding stylesheet.
      // A coloured glyph in this shot would be mistaken for its own background,
      // producing a bogus 1:1 red. Check both paint properties before sampling.
      hiddenPaint = await page.locator('.review-kanji-status, #zen-exit, #zen-more').evaluateAll(nodes =>
        nodes.flatMap(el => [el, ...el.querySelectorAll('*')]).map(el => {
          const cs = getComputedStyle(el);
          return { selector: el.id ? '#' + el.id : el.className, colour: cs.color, textFill: cs.webkitTextFillColor };
        }));
      assert(hiddenPaint.length >= 2, 'Both zen targets reached before background sampling');
      assert(hiddenPaint.every(paint => parseColour(paint.colour)?.a === 0 &&
        (!paint.textFill || parseColour(paint.textFill)?.a === 0)),
        'Background sample still paints target glyphs: ' + JSON.stringify(hiddenPaint));
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      shot = decodePng(await page.screenshot({ type: 'png' }));
    } finally { await page.evaluate(() => window.__sweep.hide(false)); }
    const result = analyse(world, state, data, shot, []);
    const target = p => /review-kanji-status|#zen-(exit|more)/.test(p.sel);
    return { hiddenPaint, pairs: result.pairs.filter(target), unresolved: result.unresolved.filter(target),
      roots: result.roots.filter(p => p.sel?.includes('review-face')) };
  }
  async function runCase(world, state, widths, historical = false) {
    const fixture = state !== 'listed';
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
      deviceScaleFactor: DPR, serviceWorkers: 'block', reducedMotion: 'reduce', colorScheme: 'light' });
    await silenceBrowserAudio(context); await context.addInitScript(IN_PAGE);
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage(); page.setDefaultTimeout(20000);
    page.on('pageerror', error => report.errors.push({ world, state, message: error.message }));
    try {
      if (historical) {
        const prior = process.env.HFIX2C_OLD_SITE_DIR || '/Users/dhyana/.dharma/bunki_review/2026-10-15/juncture/one-hand/HFIX2/C/site-9';
        const priorIdentity = JSON.parse(readFileSync(join(prior, 'build-identity.json'), 'utf8'));
        const sheets = ['corridor.css', 'editorial.css'].map(file => {
          const body = readFileSync(join(prior, file), 'utf8');
          return { file, body, oldSha256: sha(body), currentSha256: sha(readFileSync(join(site, file))) };
        });
        for (const sheet of sheets) await page.route(`**/${sheet.file}*`, route => route.fulfill({ body: sheet.body, contentType: 'text/css' }));
        report.fixtures.push({ world, state, historical: true, prior, priorIdentity,
          sheets: sheets.map(({body, ...receipt}) => receipt), scope: 'Exact pre-R2 stylesheets restore the historical room ground and seat; current public JS rendering is retained.' });
      }
      if (fixture) {
        const data = structuredClone(contract); data.readingsState = state;
        if (state !== 'complete') Object.assign(data, { on: data.lessonOn, kun: data.lessonKun });
        const seam = 'function kanjiDisplayRecord(id, reference = null) {';
        assert.equal(sourceJS.split(seam).length, 2, 'Contract fixture seam unique');
        const served = sourceJS.replace(seam, seam + `\n  if (id === '生') return ${JSON.stringify(data)};`);
        report.fixtures.push({ world, state, data, originalSha256: sha(sourceJS), servedSha256: sha(served) });
        await page.route('**/corridor.js*', route => route.fulfill({ body: served, contentType: 'application/javascript' }));
      }
      await page.route('**/__hfix-seed', route => route.fulfill({ body: '<!doctype html><title>Isolated review fixture</title>', contentType: 'text/html' }));
      await page.goto(origin + '/__hfix-seed');
      await page.evaluate(({ seed, world }) => { localStorage.setItem('kairo-corridor-v1', JSON.stringify(seed)); localStorage.setItem('kairo-theme', world); }, { seed, world });
      await page.goto(origin + '/index.html?entry=shelf&ui=bi'); await ready(page);
      const before = snapshot(await reviewRecord(page));
      assert(before.taken.some(t => t.id === '生' && t.t === 'kanji'), 'Fixture was actually imported');
      await page.locator('#tray').click(); await page.locator('#review-start').click(); await page.locator('#reveal').click();
      await page.locator('[data-kanji-readings]').waitFor(); await settle(page, 400);
      if (historical) await page.addStyleTag({ content: 'body.zen .review-face [data-kanji-readings] > p.review-kanji-status { color: #a02a1e; }' });
      for (const width of widths) {
        await page.setViewportSize({ width, height: width === 320 ? 568 : width === 390 ? 844 : 900 });
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await settle(page, 200);
        const initialGeometry = await page.evaluate(geometry);
        let scrolledToStatus = false;
        if (state !== 'complete' && !initialGeometry.fallback.missing &&
            (!initialGeometry.fallback.fullyVisible || !initialGeometry.fallback.unobscured)) {
          if (!fixture && !historical && ['sumi','hokusai'].includes(world) && [390,1440].includes(width))
            await page.screenshot({ path: join(evidence, 'shots', `${engine}-${world}-${state}-${width}-initial.png`) });
          await page.locator('.review-kanji-status').evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
          await settle(page, 100); scrolledToStatus = true;
        }
        const g = await page.evaluate(geometry), measured = await measure(page, world, state);
        const after = snapshot(await reviewRecord(page));
        const fallbackPairs = measured.pairs.filter(p => p.sel.includes('review-kanji-status'));
        const zenPairs = measured.pairs.filter(p => /#zen-(exit|more)/.test(p.sel));
        const statusCorrect = g.state === state && (state === 'complete' ? g.fallback.missing :
          !g.fallback.missing && g.fallback.text.includes(state === 'pending' ? 'Loading the complete reading set' : 'complete reading set is unavailable'));
        const fallbackOK = state === 'complete' ? !fallbackPairs.length : g.fallback.fullyVisible && g.fallback.unobscured && fallbackPairs.length > 0 && fallbackPairs.every(p => p.ok);
        const zenOK = zenPairs.length === 2 && zenPairs.every(p => p.ratio >= 4.5) && [g.exit, g.more].every(g => !g.missing && g.fullyVisible && g.unobscured);
        const unchanged = JSON.stringify(before) === JSON.stringify(after);
        const pass = statusCorrect && fallbackOK && zenOK && unchanged && g.world === world && g.overflow === 0 && !measured.unresolved.length;
        const name = `${engine}-${world}-${state}-${width}${historical ? '-historical' : ''}`;
        if (historical) {
          const red = fallbackPairs.length > 0 && fallbackPairs.some(p => !p.ok);
          const requiredRed = engine === 'chromium';
          report.controls.push({ kind: 'historical-fallback-presentation', world, width, pairs: fallbackPairs, red, requiredRed,
            pass: statusCorrect && unchanged && fallbackPairs.length > 0 && (!requiredRed || red), geometry: g,
            expectation: requiredRed ? 'Exact pre-R2 ground/seat plus old fallback ink must reproduce the actual Chromium red' : 'Historical WebKit fallback was green; preserve its actual ratio without inventing a defect' });
          await page.screenshot({ path: join(evidence, 'shots', name + '.png') }); persist(); continue;
        }
        if ((!fixture && ['sumi', 'hokusai'].includes(world) && [390,1440].includes(width)) || !pass)
          await page.screenshot({ path: join(evidence, 'shots', name + '.png') });
        check({ world, state, width, fixture, pass, statusCorrect, fallbackOK, zenOK, unchanged,
          initialGeometry, scrolledToStatus, geometry: g, ...measured, beforeSha256: sha(JSON.stringify(before)), afterSha256: sha(JSON.stringify(after)), ...stamp() });
        if (state === 'listed' && width === 390 && ['sumi','hokusai'].includes(world)) {
          const kind = world === 'sumi' ? 'fallback-old-ink' : 'zen-old-ink';
          const css = kind === 'fallback-old-ink' ? 'body.zen .review-face [data-kanji-readings] > p.review-kanji-status { color: #a02a1e; }' : 'body.zen #zen-exit, body.zen #zen-more { color: var(--zen-text); }';
          const style = await page.addStyleTag({ content: css });
          const control = await measure(page, world, state);
          const relevant = control.pairs.filter(p => kind === 'fallback-old-ink' ? p.sel.includes('review-kanji-status') : /#zen-(exit|more)/.test(p.sel));
          const red = relevant.length > 0 && relevant.some(p => p.ratio < (kind === 'zen-old-ink' ? 4.5 : p.required));
          // A changed ground can make the old fallback ink legible. Preserve the
          // ink-only result honestly; the separate exact historical presentation
          // control reproduces that actual Chromium defect on its original ground.
          const requiredRed = kind === 'zen-old-ink';
          report.controls.push({ kind, world, width, css, pairs: relevant, red, requiredRed, pass: relevant.length > 0 && (!requiredRed || red),
            expectation: requiredRed ? 'Restored old ink must genuinely fail the pixel check' : 'Informational exact-old-ink measurement on the repaired ground; see historical presentation control' });
          await page.screenshot({ path: join(evidence, 'shots', name + '-' + kind + '.png') });
          await style.evaluate(n => n.remove());
          const restored = await measure(page, world, state);
          assert.deepEqual(restored.pairs, measured.pairs, 'Control cleanup restores measured pixels exactly');
          assert.equal(JSON.stringify(snapshot(await reviewRecord(page))), JSON.stringify(before), 'Control changes no learner data');
          persist();
        }
      }
    } catch (error) {
      report.errors.push({ world, state, error: error.stack });
      await page.screenshot({ path: join(evidence, 'shots', `${engine}-${world}-${state}-error.png`) }).catch(() => {});
      persist();
    } finally { await context.close(); }
  }
  try {
    assert(reviewLoad()[0] <= 14, `No browser launch: load ${reviewLoad()[0]} >14`);
    browser = await ({ chromium, webkit })[engine].launch({ headless: true });
    report.browserVersion = browser.version();
    for (const world of WORLDS) for (const state of ['listed', 'failed']) await runCase(world, state, [320,390,1440]);
    for (const state of ['pending','complete']) await runCase('sumi', state, [320,390]);
    await runCase('sumi', 'listed', [390], true);
  } catch (error) { report.errors.push({ error: error.stack }); }
  finally {
    if (browser) { await browser.close(); report.browserClosed = true; }
    await host.close(); report.hostClosed = true;
    report.finished = stamp(); report.expectedRows = 70;
    report.pass = report.rows.length === 70 && report.controls.length === 3 && report.rows.every(r => r.pass) && report.controls.every(r => r.pass) && !report.errors.length;
    persist();
  }
  console.log(JSON.stringify({ pass: report.pass, rows: report.rows.length, red: report.rows.filter(r => !r.pass).length,
    controls: report.controls, errors: report.errors.length, browserClosed: report.browserClosed, hostClosed: report.hostClosed }));
  process.exitCode = report.pass ? 0 : 1;
}
