/**
 * Repeatable SKIP browser regression. No learner-store fixtures or runtime
 * state injection: controls are driven through clicks, keys and mouse wheel.
 * Usage: node prototypes/corridor/tools/verify-skip-ui.mjs [--shots DIR]
 * Requires playwright-core + its Chromium (or CHROMIUM_PATH).
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { readAppRecord, waitForAppRecord } from './record-test-support.mjs';
import { resolveCorridorSite, resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';

const root = resolveCorridorSite();
const args = process.argv.slice(2);
const out = resolve(args.includes('--shots') ? args[args.indexOf('--shots') + 1] : resolveCorridorEvidence());
mkdirSync(out, { recursive: true });
const data = JSON.parse(readFileSync(resolve(root, 'data/share_alike/skip.json'), 'utf8'));
const core = createRequire(import.meta.url)(resolve(root, 'skip-core.js'));
const checks = [], errors = [], consoleErrors = [], consoleErrorDetails = [], failedRequests = [], deliberateAborts = [];
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.html': 'text/html', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const rel = decodeURIComponent((req.url || '/').split('?')[0]);
  const path = resolve(root, rel === '/' ? 'index.html' : rel.slice(1));
  if (!path.startsWith(`${root}/`) || !existsSync(path)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(readFileSync(path));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const browserInfo = { engine: 'Chromium', version: browser.version(), executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), headless: true, maximumContexts: 1 };
let page;
function check(name, value, detail = '') {
  checks.push({ name, pass: !!value, detail });
  console.log(`${value ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!value) throw new Error(name);
}
async function open(context) {
  await silenceBrowserAudio(context);
  const p = await context.newPage();
  p.setDefaultTimeout(7000);
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (e) => {
    if (e.type() === 'error') {
      consoleErrors.push(e.text());
      consoleErrorDetails.push({ text: e.text(), location: e.location(), afterCheck: checks.at(-1)?.name || 'boot' });
    }
  });
  p.on('requestfailed', request => failedRequests.push({ url: request.url(), method: request.method(), failure: request.failure(), afterCheck: checks.at(-1)?.name || 'boot' }));
  await p.goto(`${base}/?entry=shelf`);
  await p.getByRole('button', { name: '字引 find a kanji by shape' }).waitFor();
  return p;
}
async function query(raw) {
  await page.locator('#nav-search-input').fill(raw);
  await page.waitForTimeout(120);
}
async function count() {
  return Number((await page.locator('.skip-result-count').innerText()).split(' kanji')[0].replaceAll(',', ''));
}
async function aligned() {
  return page.locator('.skip-wheel').evaluateAll((wheels) => wheels.every((wheel) => {
    const selected = wheel.querySelector('[aria-selected=true]');
    const a = selected.getBoundingClientRect(), b = wheel.getBoundingClientRect();
    return Math.abs(a.top + a.height / 2 - b.top - b.height / 2) < 2;
  }));
}
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  page = await open(context);
  check('JSON sidecar absent at boot', await page.evaluate(() => !performance.getEntriesByType('resource').some((e) => e.name.endsWith('/skip.json'))));
  await page.getByRole('button', { name: '字引 find a kanji by shape' }).click();
  await page.locator('.kdx-lens').filter({ hasText: 'SKIP' }).click();
  await page.locator('.skip-hit').first().waitFor();
  check('lens preserves heading and all dictionary lenses', await page.locator('h1').innerText() === '字引' &&
    JSON.stringify(await page.locator('.kdx-lens .l-ja').allTextContents()) ===
      JSON.stringify(['部品', 'SKIP', '手書き', '音訓', '意味', '画数', '部首', '頻度', '漢検', 'Kodansha']));
  await page.locator('.skip-hit').first().click();
  await page.locator('#sheet-search').click();
  await query('１－３－８');
  check('typed fullwidth normalization', await page.locator('.skip-code').innerText() === '1-3-8');
  check('exact canonical query', await count() === core.search(data, '1-3-8').length);
  await query('SKIP 1-3-8');
  check('explicit whitespace prefix', await count() === core.search(data, '1-3-8').length);
  for (const raw of ['1-3', '1-*-8', '*-3-8', 'skip:*']) {
    await query(raw);
    check(`partial/wildcard ${raw}`, await count() === core.search(data, raw).length);
  }
  for (const raw of ['4-5-5', '5-2-3', '1-3-x', '1-2-3-4']) {
    await query(raw);
    check(`invalid ${raw}`, await page.locator('.skip-error').count() === 1 && await page.locator('.nav-search-row').count() === 0);
  }
  await query('cat');
  await page.locator('.nav-search-row').first().waitFor();
  check('ordinary English search remains word search', await page.locator('.skip-ui').count() === 0);
  for (const ordinary of ['skip', 'skip meaning', 'skip 5 pages']) {
    await query(ordinary);
    check(`ordinary ${JSON.stringify(ordinary)} stays outside SKIP`, await page.locator('.skip-ui, .skip-error').count() === 0);
  }
  await query('skip 1-3-8');
  await page.locator('.skip-result-count').waitFor();
  check('numeric shorthand still opens SKIP', await count() === core.search(data, '1-3-8').length);
  await query('1-3-8');
  await page.locator('#skip-wheel-search-0').press('End');
  await page.waitForTimeout(120);
  check('solid switch clears third field', await page.locator('.skip-code').innerText() === '4-3-*');
  check('solid subtype list and labels', await page.locator('#skip-wheel-search-2 [role=option]').count() === 5 &&
    (await page.locator('.skip-wheel-label').allTextContents()).includes('Subtype · not strokes'));
  await page.locator('#skip-wheel-search-2').press('End');
  check('keyboard End chooses subtype 4', await page.locator('.skip-code').innerText() === '4-3-4');
  await page.locator('#skip-wheel-search-2').press('Home');
  await page.locator('#skip-wheel-search-2').press('ArrowDown');
  check('Home and arrow selection', await page.locator('.skip-code').innerText() === '4-3-1');
  await query('1-3-8');
  await page.locator('#skip-wheel-search-1-option-4').click();
  check('click row updates code', await page.locator('.skip-code').innerText() === '1-4-8');
  await page.locator('#skip-wheel-search-1').hover();
  await page.mouse.wheel(0, 88);
  await page.waitForTimeout(800);
  check('mouse wheel updates code', await page.locator('.skip-code').innerText() !== '1-4-8');
  check('all wheel selections align to center band', await aligned());
  await query('1-3-8');
  await page.locator('#skip-wheel-search-3-option-64').click();
  await page.waitForTimeout(250);
  check('radical 64 independent filter', await count() === core.search(data, '1-3-8', { radical: 64 }).length &&
    await page.locator('.skip-code').innerText() === '1-3-8');
  check('hand variant is visible', (await page.locator('#skip-wheel-search-3 [aria-selected=true]').innerText()).includes('扌'));
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
    await page.locator('.skip-wheels').scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
    check(`no clipping at ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth) && await aligned());
    await page.locator('.skip-ui').evaluate((el) => {
      window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 70);
    });
    await page.screenshot({ path: resolve(out, `skip-1-3-8-hand-${width}.png`) });
    await page.locator('.skip-ui').screenshot({ path: resolve(out, `skip-1-3-8-hand-${width}-component.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#skip-wheel-search-3').press('Home');
  await query('skip:*');
  check('explicit first page size', await page.locator('.skip-hit').count() === 72);
  await page.locator('.skip-more').click();
  check('show more without hidden result cap', await page.locator('.skip-hit').count() === 144 && await count() === core.search(data, 'skip:*').length);
  await query('1-1-10');
  check('alternate excluded initially', await page.locator('[data-skip-hit="情"]').count() === 0);
  await page.locator('.skip-alternates input').check();
  check('alternate explicitly labeled', await page.locator('[data-skip-hit="情"]').getAttribute('data-match-type') === 'alternate');
  check('canonical before alternate', await page.locator('.skip-hit').evaluateAll((hits) => {
    const i = hits.findIndex((h) => h.dataset.matchType === 'alternate');
    return i < 0 || hits.slice(i).every((h) => h.dataset.matchType === 'alternate');
  }));
  await query('1-3-8');
  const hit = page.locator('.skip-hit').first(), hitId = await hit.getAttribute('id');
  await hit.click();
  await page.locator('#sheet-back').click();
  await page.waitForTimeout(100);
  check('Back preserves query and focus', await page.locator('#nav-search-input').inputValue() === '1-3-8' &&
    await page.evaluate((id) => document.activeElement.id === id, hitId));
  await query('4-6-4');
  await page.locator('[data-skip-hit="㐆"]').click();
  check('fallback opens ordinary kanji sheet', await page.locator('.skip-fallback-note').count() === 1);
  check('ordinary kanji sheet has no visible SKIP code', await page.locator('.sheet .skip-code-door-wrap').count() === 0);
  await page.locator('#kanji-shape-lookup').click();
  check('code-free shape door opens nested lookup', await page.locator('.sheet .skip-ui').count() === 1);
  await page.locator('#sheet-back').click();
  check('nested Back returns to same fallback entry', await page.locator('.sheet .hero-glyph').innerText() === '㐆');
  await page.locator('#sheet-close').click();
  await page.locator('.theme-seal').first().click();
  await page.locator('.world-stone[aria-label="紺紙金泥"]').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await query('1-3-8');
  await page.locator('#skip-wheel-search-3-option-64').click();
  check('dark world and reduced motion', await page.locator('html').getAttribute('data-theme') === 'yoru' &&
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches));
  await page.screenshot({ path: resolve(out, 'skip-dark-reduced.png') });
  await page.locator('#skip-wheel-search-3').press('Home');
  await query('4-6-4');
  await page.locator('[data-skip-hit="㐆"]').click();
  await page.locator('#sheet-take').click();
  const captured = await waitForAppRecord(page, record => !!record.taken.find(item => item.t === 'kanji' && item.id === '㐆')?.kanjiRecord);
  const kept = captured.taken.find(item => item.t === 'kanji' && item.id === '㐆').kanjiRecord;
  const source = data.entries.find(entry => entry.literal === '㐆');
  check('capture confirms a complete exact-source kanji answer on durable storage', kept.version === 1 && kept.c === '㐆' &&
    JSON.stringify(kept.meanings) === JSON.stringify(source.meanings) &&
    JSON.stringify(kept.on) === JSON.stringify(source.readings.on) &&
    JSON.stringify(kept.kun) === JSON.stringify(source.readings.kun) &&
    kept.sourceVersion.archiveSha256 === data.sources.find(item => item.sha256)?.sha256);
  await page.route('**/data/share_alike/skip.json', route => {
    deliberateAborts.push({ url: route.request().url(), afterCheck: checks.at(-1)?.name });
    return route.abort();
  });
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.locator('#tray').click();
  await page.locator('.tray-line').filter({ hasText: '㐆' }).click();
  await page.locator('.skip-fallback-note').waitFor();
  check('saved fallback reopens from its exact snapshot when the sidecar is unavailable', await page.locator('.sheet .hero-glyph').innerText() === '㐆' &&
    (await page.locator('.sheet').innerText()).includes(source.meanings[0]));
  check('cold ordinary sheet does not expose SKIP codes or fetch the sidecar', await page.locator('.sheet .skip-code-door-wrap').count() === 0 &&
    await page.evaluate(() => !performance.getEntriesByType('resource').some(entry => entry.name.endsWith('/skip.json'))));
  await page.screenshot({ path: resolve(out, 'skip-cold-captured-sheet.png') });
  await page.locator('#sheet-close').click();
  await page.locator('#review-start').click();
  let grades = 0;
  for (; grades < 12 && !(await page.locator('.review-summary').isVisible()); grades++) {
    await page.locator('#declare-recalled').waitFor();
    await page.locator('#declare-recalled').click();
    await page.locator('.grade.g-good').waitFor();
    const answer = await page.locator('.review-sense-primary').innerText();
    check(`review answer ${grades + 1} comes from retained KANJIDIC2 meanings`, answer.includes(source.meanings[0]) && !answer.includes('No record in this layer'));
    check(`review ${grades + 1} does not invent a spoken reading`, await page.locator('#card-say').count() === 0);
    if (grades === 0) await page.screenshot({ path: resolve(out, 'skip-captured-review-answer.png') });
    await page.locator('.grade.g-good').click();
    await page.waitForFunction(() => document.querySelector('#declare-recalled') || document.querySelector('.review-summary'));
  }
  await page.locator('.review-summary').waitFor();
  const reviewed = await waitForAppRecord(page, record => record.revlog.length === grades);
  check('explicit grades preserve exact identity and one scheduled kanji', grades > 0 &&
    reviewed.revlog.every(row => row[1] === 'kanji:㐆') && Object.keys(reviewed.srs).join() === 'kanji:㐆');
  await page.getByRole('button', { name: /back to lists|リストへ/ }).click();
  const exportStarted = Date.now();
  const download = page.waitForEvent('download');
  await page.locator('#export-store').click();
  const backupPath = resolve(out, 'skip-captured-backup.json');
  await (await download).saveAs(backupPath);
  const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
  await waitForAppRecord(page, record => record.stats.lastExportTs >= exportStarted);
  check('complete backup preserves captured answer and review history', backup.format === 'kairo-backup' &&
    JSON.stringify(backup.record.taken.find(item => item.id === '㐆').kanjiRecord) === JSON.stringify(kept) &&
    JSON.stringify(backup.record.revlog) === JSON.stringify(reviewed.revlog));
  const malformedPath = resolve(out, 'skip-malformed-snapshot.json');
  const malformed = JSON.parse(JSON.stringify(backup.record));
  malformed.taken.find(item => item.id === '㐆').kanjiRecord.c = '木';
  writeFileSync(malformedPath, JSON.stringify(malformed));
  const beforeInvalid = await readAppRecord(page);
  await page.setInputFiles('#import-file', malformedPath);
  await page.waitForFunction(() => /Import could not finish|読み込みを完了できなかった/.test(document.querySelector('#record-portability-status')?.textContent || ''));
  const afterInvalid = await readAppRecord(page);
  check('wrong-literal imported snapshot leaves the accepted record unchanged', JSON.stringify(afterInvalid) === JSON.stringify(beforeInvalid));
  await page.locator('.tray-line').filter({ hasText: '㐆' }).click();
  await page.locator('#sheet-take').click();
  await waitForAppRecord(page, record => !record.taken.some(item => item.id === '㐆'));
  await page.locator('#sheet-close').click();
  await Promise.all([page.waitForEvent('load'), page.setInputFiles('#import-file', backupPath)]);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  const restored = await readAppRecord(page);
  check('ordinary backup import restores the exact captured answer and schedule',
    JSON.stringify(restored.taken.find(item => item.id === '㐆')?.kanjiRecord) === JSON.stringify(kept) &&
    JSON.stringify(restored.srs) === JSON.stringify(backup.record.srs) &&
    JSON.stringify(restored.revlog) === JSON.stringify(backup.record.revlog));
  await page.locator('#tray').click();
  await page.locator('.tray-line').filter({ hasText: '㐆' }).waitFor();
  await page.screenshot({ path: resolve(out, 'skip-backup-restored-lists.png') });
  const intentionalAbort = url => deliberateAborts.some(item => item.url === url);
  const unexpectedConsoleErrors = consoleErrorDetails.filter(item =>
    item.text !== 'Failed to load resource: net::ERR_FAILED' || !intentionalAbort(item.location.url));
  const unexpectedFailedRequests = failedRequests.filter(item =>
    item.failure?.errorText !== 'net::ERR_FAILED' || !intentionalAbort(item.url));
  check('no unexpected console or request errors through capture and backup', !errors.length && !unexpectedConsoleErrors.length && !unexpectedFailedRequests.length,
    JSON.stringify({ errors, consoleErrorDetails, failedRequests, deliberateAborts }));
  await context.close();
  const failureContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let failures = 0;
  await failureContext.route('**/data/share_alike/skip.json', (route) => {
    if (!failures++) return route.fulfill({ status: 503, body: 'Deliberate QA failure' });
    return route.continue();
  });
  page = await open(failureContext);
  await page.getByRole('button', { name: '字引 find a kanji by shape' }).click();
  await page.locator('.kdx-lens').filter({ hasText: 'SKIP' }).click();
  await page.locator('.skip-retry').waitFor();
  check('fresh-context load failure is recoverable', await page.locator('.skip-error').count() === 1);
  await page.locator('.skip-retry').click();
  await page.locator('.skip-hit').first().waitFor();
  check('retry loads real index', failures === 2);
  check('no runtime exceptions including recovery', errors.length === 0, JSON.stringify(errors));
} catch (error) {
  checks.push({ name: 'uncaught test failure', pass: false, detail: error.stack });
  console.error(error);
  if (page) await page.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {});
} finally {
  writeFileSync(resolve(out, 'results.json'), JSON.stringify({
    checks, errors, consoleErrors, consoleErrorDetails, failedRequests, deliberateAborts, browserInfo,
    exclusions: ['Physical iOS Safari momentum/VoiceOver; full ten-theme matrix; SKIP-specific standalone execution and non-Chromium engines.', 'Deliberate sidecar abort and 503 recovery retain their expected network errors in this report.'],
  }, null, 2));
  await browser.close();
  server.close();
}
process.exitCode = checks.some((c) => !c.pass) ? 1 : 0;
