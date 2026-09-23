/** Real global search and capture/review controls on one silent Chromium
 * context. Deep-index latency/failure are network faults, never app-state
 * substitutions. All other bytes must match the supplied immutable artifact.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { readAppRecord, readAppRecordSnapshot, waitForAppRecord } from './record-test-support.mjs';

const argument = (name, fallback) => {
  const at = process.argv.indexOf(name);
  if (at < 0) return fallback;
  assert.ok(process.argv[at + 1] && !process.argv[at + 1].startsWith('--'), `${name} needs a value`);
  return process.argv[at + 1];
};
const siteArg = argument('--site', process.env.KAIRO_SITE_DIR), outArg = argument('--evidence-out', process.env.KAIRO_SEARCH_EVIDENCE);
assert.ok(siteArg && outArg, 'Provide an immutable site and fresh external --evidence-out');
const site = resolve(siteArg), out = resolve(outArg), repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
assert.ok(out !== repo && !out.startsWith(repo + sep), 'Runtime evidence belongs outside the repository');
assert.ok(!existsSync(out), 'Keep earlier evidence intact; choose a fresh directory');
mkdirSync(out, { recursive: true });
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const identity = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
assert.match(process.env.KAIRO_ARTIFACT_SHA256 || '', /^[0-9a-f]{64}$/u);
assert.equal(identity.artifactSha256, process.env.KAIRO_ARTIFACT_SHA256);
const files = new Map(identity.files.map((entry) => [entry.path, entry]));
const selected = argument('--case', 'all'), caseNames = ['pending', 'queries', 'missing', 'homographs', 'lifecycle'];
const selection = selected === 'all' ? caseNames : selected.split(',');
assert.ok(selection.length && new Set(selection).size === selection.length && selection.every((name) => caseNames.includes(name)), 'Unknown or repeated case');
const sourceWords = JSON.parse(readFileSync(resolve(site, 'data/share_alike/words.json'), 'utf8')).words;
const source = sourceWords['原典'];
assert.equal(source.r, 'げんてん'); assert.equal(source.g, 'original, source');
const indexPath = '/data/share_alike/dict-v2/index.json';
const checks = [], results = [], externalRequests = [], errors = [], routeErrors = [], indexRequests = [], served = new Map();
let browser, context, page, origin, timeout, timedOut = false, activeCase = 'startup', indexMode = 'ready', held = null;
const handles = { processId: process.pid, contextsCreated: 0, contextsClosed: 0, browserClosed: false, serverClosed: false };
const write = (name, value) => writeFileSync(resolve(out, name), `${JSON.stringify(value, null, 2)}\n`);
const check = (name, run) => { run(); checks.push({ case: activeCase, name, pass: true }); };
const capture = async (name) => {
  // Observe completed finite transitions. Do not disable animations or count
  // text present during a reveal as evidence of its settled visual state.
  await page.waitForFunction(() => document.getAnimations().every((animation) =>
    !Number.isFinite(animation.effect?.getComputedTiming().endTime) || !['running', 'pending'].includes(animation.playState)), null, { timeout: 5000 });
  await page.screenshot({ path: resolve(out, name) });
};
const poll = async (predicate, name, milliseconds = 10000) => {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) { const value = await predicate(); if (value) return value; await delay(25); }
  throw new Error(`Timed out: ${name}`);
};
const server = createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(site, `.${pathname === '/' ? '/index.html' : pathname}`), path = relative(site, file);
    if (!file.startsWith(site + sep) || !files.has(path)) { response.writeHead(404).end(); return; }
    const bytes = readFileSync(file), expected = files.get(path);
    assert.equal(sha(bytes), expected.sha256, `Changed artifact input ${path}`);
    served.set(path, expected.sha256);
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
    response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); response.end(bytes);
  } catch (error) { routeErrors.push(String(error)); response.writeHead(500).end(); }
});
const boot = async () => {
  await page.goto(`${origin}/index.html?entry=shelf&ui=bi`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1');
};
const search = async (query, { reload = true } = {}) => {
  if (reload) await boot();
  if (!await page.locator('#nav-search-input').count()) await page.locator('#chrome-search').click();
  await page.locator('#nav-search-input').fill(query);
};
const exactRow = (form, reading = null) => {
  let rows = page.locator('.nav-search-row').filter({ has: page.locator('.nsr-glyph', { hasText: new RegExp(`^${form}$`, 'u') }) });
  if (reading) rows = rows.filter({ has: page.locator('.nsr-read', { hasText: new RegExp(`^${reading}$`, 'u') }) });
  return rows;
};
async function sheetIdentity(form, reading, gloss = null) {
  await page.waitForFunction((value) => document.querySelector('#sheet')?.dataset.node === `word:${value}`, form);
  await page.locator('#sheet .reading').first().waitFor();
  assert.equal(await page.locator('#sheet .reading').first().innerText(), reading);
  assert.ok((await page.locator('#sheet .headword').innerText()).startsWith(form));
  if (gloss) assert.equal(await page.locator('#sheet .senses .gloss').first().innerText(), gloss);
  return { node: await page.locator('#sheet').getAttribute('data-node'), reading: await page.locator('#sheet .reading').first().innerText(),
    headword: await page.locator('#sheet .headword').innerText(), gloss };
}
async function caseRun(name, run) {
  if (!selection.includes(name)) return;
  activeCase = name;
  const row = { name, pass: false, startedAt: new Date().toISOString() };
  try { row.detail = await run(); row.pass = true; }
  catch (error) {
    row.error = String(error.stack || error);
    if (page && !page.isClosed()) {
      await page.screenshot({ path: resolve(out, `${name}-failure.png`), timeout: 10000 }).catch(() => {});
      await readAppRecordSnapshot(page).then((state) => write(`${name}-failure-record.json`, state)).catch(() => {});
    }
  } finally {
    if (held) { held.release(); held = null; }
    indexMode = 'ready'; row.completedAt = new Date().toISOString(); results.push(row); write('progress.json', { results, checks });
    console.log(`${row.pass ? 'PASS' : 'FAIL'} ${name}${row.error ? `: ${row.error}` : ''}`);
  }
}

try {
  await new Promise((done) => server.listen(0, '127.0.0.1', done)); origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true });
  handles.browserVersion = browser.version(); handles.executablePath = process.env.CHROMIUM_PATH || chromium.executablePath();
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); handles.contextsCreated++;
  handles.audio = await silenceBrowserAudio(context);
  timeout = setTimeout(() => { timedOut = true; void browser.close(); }, 240000);
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { externalRequests.push({ case: activeCase, origin: url.origin, path: url.pathname }); return route.abort(); }
    if (url.pathname !== indexPath) return route.continue();
    const row = { case: activeCase, mode: indexMode, url: url.href, startedAt: new Date().toISOString() }; indexRequests.push(row);
    try {
      if (indexMode === 'missing') { row.response = 503; return await route.fulfill({ status: 503, contentType: 'application/json', body: '{"syntheticFailure":"optional-index-unavailable"}' }); }
      if (indexMode === 'pending') await new Promise((done) => {
        const timer = setTimeout(() => { row.expired = true; done(); }, 12000);
        held = { row, release: () => { row.releasedAt = new Date().toISOString(); clearTimeout(timer); done(); } };
      });
      await route.continue(); row.response = 'pinned-artifact';
    } catch (error) { routeErrors.push({ case: activeCase, error: String(error) }); await route.abort().catch(() => {}); }
  });
  page = await context.newPage(); page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(30000);
  page.on('pageerror', (error) => errors.push({ case: activeCase, type: 'pageerror', error: String(error) }));
  page.on('console', (message) => { if (message.type() === 'error') errors.push({ case: activeCase, type: 'console', error: message.text(), location: message.location() }); });
  await boot();
  write('executor.json', { handles, origin, site, artifactSha256: identity.artifactSha256, sourceAssetSha256: identity.sourceAssetSha256,
    verifierSha256: sha(readFileSync(fileURLToPath(import.meta.url))), bounds: { totalMs: 240000, actionMs: 10000, navigationMs: 30000, pendingIndexMs: 12000 } });
  console.log(`EXECUTOR ${JSON.stringify({ pid: process.pid, origin, browser: handles.browserVersion, contexts: browser.contexts().length, artifact: identity.artifactSha256 })}`);

  await caseRun('pending', async () => {
    indexMode = 'pending'; await search('原典');
    await poll(() => held, 'held optional dictionary index');
    await exactRow('原典').waitFor({ timeout: 4000 });
    const row = { text: await exactRow('原典').innerText(), held: { ...held.row } };
    await page.locator('#nav-search-input').press('Enter');
    const before = await sheetIdentity('原典', source.r, source.g);
    check('the exact immediate fallback opens through keyboard Enter before the deep index resolves', () => {
      assert.ok(held && !held.row.expired && !held.row.releasedAt); assert.ok(row.text.includes(source.r) && row.text.includes(source.g));
    });
    await capture('pending-immediate-fallback.png');
    held.release(); held = null; indexMode = 'ready';
    await page.waitForFunction(() => !document.querySelector('#sheet .dictionary-opening'));
    const after = await sheetIdentity('原典', source.r, source.g);
    check('a completed deep-index load does not replace the no-counterpart fallback identity', () => assert.deepEqual(after, before));
    return { before, after, row };
  });

  await caseRun('queries', async () => {
    const observations = [];
    for (const query of ['原典', 'げんてん', 'genten', 'original, source']) {
      await search(query); const row = exactRow('原典', source.r); await row.waitFor();
      assert.equal(await row.count(), 1);
      await row.focus(); await page.keyboard.press('Enter');
      const resolved = await sheetIdentity('原典', source.r, source.g);
      observations.push({ query, input: 'ordinary global input; exact result focus + Enter', resolved });
    }
    check('written, kana, romaji and glossary queries each activate the exact fallback form and reading', () => assert.equal(observations.length, 4));
    return observations;
  });

  await caseRun('missing', async () => {
    indexMode = 'missing'; const requestStart = indexRequests.length;
    await search('原典'); await poll(() => indexRequests.slice(requestStart).some((entry) => entry.response === 503), 'actual missing-index fault');
    await exactRow('原典', source.r).click();
    const resolved = await sheetIdentity('原典', source.r, source.g);
    check('a failed optional index still leaves the correct fallback search and full immediate gloss available', () => {
      assert.equal(resolved.node, 'word:原典'); assert.equal(resolved.reading, 'げんてん');
    });
    await capture('missing-index-fallback.png'); return resolved;
  });

  await caseRun('homographs', async () => {
    await search('生物');
    await exactRow('生物', 'なまもの').waitFor(); await exactRow('生物', 'せいぶつ').waitFor();
    const displayed = await exactRow('生物').evaluateAll((rows) => rows.map((row) => ({ reading: row.querySelector('.nsr-read')?.textContent, gloss: row.querySelector('.nsr-gloss')?.textContent })));
    assert.equal(displayed.length, 2);
    await exactRow('生物', 'なまもの').click();
    await sheetIdentity('生物', 'なまもの');
    await page.locator('[data-dictionary-entry="1379440"][aria-pressed="true"]').waitFor();
    const raw = { reading: await page.locator('#sheet .reading').first().innerText(), seq: await page.locator('.dictionary-homograph.active').getAttribute('data-dictionary-entry') };
    assert.ok((await page.locator('#sheet .senses').innerText()).includes('raw food'));
    await page.locator('[data-dictionary-entry="1379430"]').click();
    await sheetIdentity('生物', 'せいぶつ');
    await page.locator('[data-dictionary-entry="1379430"][aria-pressed="true"]').waitFor();
    const living = { reading: await page.locator('#sheet .reading').first().innerText(), seq: await page.locator('.dictionary-homograph.active').getAttribute('data-dictionary-entry') };
    check('existing deep homographs keep exact sequence, reading and sense while switching through normal controls', () => {
      assert.deepEqual(raw, { reading: 'なまもの', seq: '1379440' }); assert.deepEqual(living, { reading: 'せいぶつ', seq: '1379430' });
    });
    await capture('deep-homograph-identity.png'); return { displayed, raw, living };
  });

  await caseRun('lifecycle', async () => {
    indexMode = 'missing'; await search('原典'); await exactRow('原典', source.r).click(); await sheetIdentity('原典', source.r, source.g);
    const before = await readAppRecord(page); assert.equal(before.taken.length, 0, 'Isolated UI steps must start with no captures');
    await page.locator('#sheet-take').click();
    const captured = await waitForAppRecord(page, (record) => record.taken.some((entry) => entry.t === 'word' && entry.id === '原典'));
    assert.equal(captured.taken.length, 1); const item = captured.taken[0];
    check('ordinary capture commits one exact fallback identity without a fabricated sequence or recall grade', () => {
      assert.equal(item.id, '原典'); assert.equal(item.t, 'word'); assert.ok(!item.seq); assert.ok(Number.isFinite(item.ts));
      assert.deepEqual(captured.revlog, before.revlog); assert.deepEqual(captured.srs, before.srs);
    });
    write('captured-record.json', await readAppRecordSnapshot(page));
    await boot(); await page.locator('#tray').click(); await page.locator('.tray-line').filter({ hasText: '原典' }).click();
    await sheetIdentity('原典', source.r, source.g);
    const reopened = await readAppRecord(page);
    check('the exact captured fallback reopens from Lists after a cold reload with the deep index unavailable', () => assert.deepEqual(reopened.taken, captured.taken));
    await page.locator('#sheet-close').click(); await page.locator('#review-start').click();
    let grades = 0;
    while (grades < 12 && !await page.locator('.review-summary').isVisible()) {
      await page.locator('#declare-recalled').waitFor();
      assert.equal(await page.locator('.review-front').innerText(), '原典');
      await page.locator('#declare-recalled').click(); await page.locator('.grade.g-good').waitFor();
      assert.equal(await page.locator('.review-reading').innerText(), source.r);
      assert.equal(await page.locator('.review-sense-primary').innerText(), source.g);
      if (grades === 0) await capture('fallback-review-answer.png');
      await page.locator('.grade.g-good').click(); grades++;
      await page.waitForFunction(() => document.querySelector('#declare-recalled') || document.querySelector('.review-summary'));
    }
    await page.locator('.review-summary').waitFor();
    const reviewed = await waitForAppRecord(page, (record) => record.revlog.length === grades);
    check('real recall controls grade the fallback answer and schedule only its exact word key', () => {
      assert.ok(grades > 0 && grades <= 12); assert.ok(reviewed.revlog.every((row) => row[1] === 'word:原典'));
      assert.deepEqual(Object.keys(reviewed.srs), ['word:原典']); assert.deepEqual(reviewed.taken, captured.taken);
    });
    write('reviewed-record.json', await readAppRecordSnapshot(page)); return { captured: item, grades, revlog: reviewed.revlog, srs: reviewed.srs };
  });
} catch (error) { results.push({ name: activeCase, pass: false, fatal: true, error: String(error.stack || error) }); }
finally {
  if (timeout) clearTimeout(timeout);
  if (held) { held.release(); held = null; }
  if (context) { await context.close(); handles.contextsClosed++; }
  if (browser) { await browser.close(); handles.browserClosed = true; }
  await new Promise((done) => server.close(done)); handles.serverClosed = true;
  const expectedFaultErrors = errors.filter((entry) => entry.type === 'console' && ['missing', 'lifecycle'].includes(entry.case) &&
    entry.location?.url === origin + indexPath && entry.error.includes('503'));
  const unexpectedErrors = errors.filter((entry) => !expectedFaultErrors.includes(entry));
  const pass = !timedOut && results.length === selection.length && results.every((entry) => entry.pass) && !externalRequests.length &&
    !routeErrors.length && !unexpectedErrors.length && handles.contextsCreated === 1 && handles.contextsClosed === 1 && handles.browserClosed;
  write('receipt.json', { package: 'PI-SEARCH-FALLBACK-08', suite: 'actual-ui-search-fallback', selectedCase: selected, pass,
    site, artifactSha256: identity.artifactSha256, sourceAssetSha256: identity.sourceAssetSha256, origin,
    verifierSha256: sha(readFileSync(fileURLToPath(import.meta.url))), handles, timedOut, sourceFixture: source,
    results, checks, indexRequests, errors, expectedFaultErrors, externalRequests, routeErrors,
    servedFiles: [...served].map(([path, sha256]) => ({ path, sha256 })),
    limitations: ['One Chromium mobile viewport and keyboard/pointer controls; no physical-device or full-journey acceptance.',
      'Synthetic latency/503 only at the optional local dictionary index; real pinned source bytes elsewhere.',
      'Fresh isolated native learner record, ordinary capture/reload/review; no active application-state injection.',
      'Silent native audio helper; no audibility, speech quality or learner-comprehension claim.'] });
  console.log(JSON.stringify({ pass, cases: results.filter((entry) => entry.pass).length, total: results.length, checks: checks.length, out, handles }));
  if (!pass) process.exitCode = 1;
}
