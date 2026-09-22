/** Ordinary source intake in fresh persistent browser profiles. All saved
 * records arise through visible controls. Native records are read as output;
 * the separate storage-failure phase is explicitly synthetic. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:https';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { armRecordWriteFailure, clearRecordWriteFailure, readAppRecordSnapshot, waitForAppRecord } from './record-test-support.mjs';

assert(isAbsolute(process.env.KAIRO_SITE_DIR || ''), 'Supply an immutable staged KAIRO_SITE_DIR');
const SITE = resolveCorridorSite(), OUT = resolveCorridorEvidence();
assert(!existsSync(join(OUT, 'receipt.json')), 'Use a fresh evidence directory');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(readFileSync(join(SITE, 'build-identity.json')));
assert.equal(hash(JSON.stringify(manifest.files)), manifest.artifactSha256);
for (const file of manifest.files) assert.equal(hash(readFileSync(join(SITE, file.path))), file.sha256);
const verifierSha256 = hash(readFileSync(new URL(import.meta.url)));
const engines = process.env.KAIRO_BROWSER ? [process.env.KAIRO_BROWSER] : ['chromium', 'webkit'];
assert(engines.every((engine) => ['chromium', 'webkit'].includes(engine)));
const sizes = process.env.KAIRO_SOURCE_VIEWPORT === 'desktop' ? [1440] : [1440, 390];
const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
let disconnected = false;
const certificate = join(OUT, 'synthetic-localhost-cert.pem'), privateKey = join(OUT, 'synthetic-localhost-key.pem');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', privateKey, '-out', certificate,
  '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
const server = createServer({ key: readFileSync(privateKey), cert: readFileSync(certificate) }, (request, response) => {
  if (disconnected) { request.socket.destroy(); return; }
  const path = new URL(request.url, 'http://localhost').pathname;
  const file = resolve(SITE, path === '/' ? 'index.html' : path.slice(1));
  try {
    assert(file.startsWith(`${SITE}/`) && statSync(file).isFile());
    response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
rmSync(privateKey); rmSync(certificate);
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const ORIGIN = `https://127.0.0.1:${server.address().port}`;
const TEXT = '  今日は宇宙の本を読んだ。🚀\n\n雨がやんだので、歩いて出かけた。町の図書館に着くと、窓の近くに席があった。\nそこで友達と会い、次に読む本を選んだ。 e\u0301  ';
const ENCOUNTER_URL = 'https://example.org/learner-supplied-reading?t=73#paragraph-2';
const QUESTION = '  「着くと」は、この文章ではどんな意味ですか。🚀\n前の文とのつながりを確かめたい。  ';
const results = [], startedAt = new Date().toISOString();
function noReviewChange(before, after) {
  for (const key of ['taken', 'srs', 'revlog', 'stats', 'lists']) assert.deepEqual(after.record[key], before.record[key], `${key} remains unchanged by capture/lookup/context`);
}
async function ready(page) {
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
  assert.equal(await page.locator('#store-alert').isVisible(), false);
}
async function frontDoor(page) {
  await page.goto(`${ORIGIN}/index.html?ui=bi`); await ready(page);
  if (await page.locator('body').getAttribute('data-view') !== 'shelf') {
    await page.locator('#ginga-symbol').click(); await page.locator('.bubble-shelf').click();
  }
  await page.locator('#source-inbox-link').click(); await page.locator('#source-capture-text').waitFor();
}
async function assertSourceReadable(page) {
  // Inspect the generated texture actually painted beneath the text, not just
  // the nominal CSS ground: an obsolete dark paper can obscure a light view.
  await page.evaluate(() => new Promise((done) => {
    if (window.requestIdleCallback) window.requestIdleCallback(() => requestAnimationFrame(done), { timeout: 1000 });
    else setTimeout(() => requestAnimationFrame(done), 100);
  }));
  const rendered = await page.evaluate(async () => {
    const paper = getComputedStyle(document.body, '::before');
    const body = getComputedStyle(document.body), text = getComputedStyle(document.querySelector('#source-reader-body'));
    const rgb = (value) => value.match(/[\d.]+/gu).slice(0, 3).map(Number);
    let pixel = [...rgb(body.backgroundColor), 255];
    if (paper.backgroundImage !== 'none') {
      const source = paper.backgroundImage.slice(4, -1).replace(/^['"]|['"]$/gu, '');
      const image = new Image(); image.src = source; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
      const draw = canvas.getContext('2d'); draw.drawImage(image, 0, 0, 1, 1);
      pixel = [...draw.getImageData(0, 0, 1, 1).data];
    }
    const alpha = Number(paper.opacity) * pixel[3] / 255, ground = rgb(body.backgroundColor);
    const background = ground.map((channel, index) => channel * (1 - alpha) + pixel[index] * alpha);
    const luminance = (color) => color.map((c) => c / 255).map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
      .reduce((sum, c, index) => sum + c * [.2126, .7152, .0722][index], 0);
    const a = luminance(rgb(text.color)), b = luminance(background);
    return { text: text.color, nominalGround: body.backgroundColor, paperPixel: pixel,
      paperOpacity: paper.opacity, texturePresent: paper.backgroundImage !== 'none', background, contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
  });
  assert(rendered.contrast >= 4.5, `Saved-source text contrast is ${rendered.contrast.toFixed(2)}:1 against its actual paper`);
  return rendered;
}
async function openLists(page) {
  if (!await page.locator('#tray').count()) {
    await page.locator('#ginga-symbol').click(); await page.locator('.bubble-shelf').click();
  }
  await page.locator('#tray').click();
}
async function selectWord(page) {
  const body = page.locator('#source-reader-body'); await page.evaluate(() => document.fonts.ready); await body.scrollIntoViewIfNeeded();
  const point = await body.evaluate((node) => {
    const position = node.textContent.indexOf('町'), walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let text, offset = 0;
    while ((text = walker.nextNode())) {
      if (position < offset + text.length) {
        const range = document.createRange(); range.setStart(text, position - offset); range.setEnd(text, position - offset + 1);
        const rect = range.getBoundingClientRect(), box = node.getBoundingClientRect();
        return { x: rect.x - box.x + rect.width / 4, y: rect.y - box.y + rect.height / 2, start: position };
      }
      offset += text.length;
    }
    throw new Error('Word not present');
  });
  await body.dblclick({ position: { x: point.x, y: point.y } });
  await page.waitForFunction(() => window.getSelection()?.toString() === '町');
  await page.waitForFunction(() => document.querySelector('#source-context-save')?.disabled === false);
  return point.start;
}
for (const engine of engines) for (const width of sizes) {
  const name = `${engine}-${width}`, out = join(OUT, name); mkdirSync(out, { recursive: true });
  const result = { name, engine, width, passed: false, observations: [], screenshots: [], videos: [], errors: [], externalRequests: [] };
  results.push(result); let context, page, episode = 0;
  const open = async () => {
    const videos = join(out, `video-${++episode}`); mkdirSync(videos, { recursive: true });
    context = await ({ chromium, webkit }[engine]).launchPersistentContext(join(out, 'profile'), {
      headless: true, viewport: { width, height: width === 390 ? 844 : 1050 }, locale: 'en-US',
      serviceWorkers: 'allow', acceptDownloads: true, ignoreHTTPSErrors: true,
      ...(engine === 'chromium' ? { args: ['--ignore-certificate-errors'] } : {}), recordVideo: { dir: videos, size: { width, height: width === 390 ? 844 : 1050 } },
    });
    result.browserVersion = context.browser()?.version();
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin === ORIGIN) return route.continue();
      result.externalRequests.push({ origin: url.origin, pathname: url.pathname }); return route.abort();
    });
    page = context.pages()[0] || await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => result.errors.push({ episode, message: error.message }));
  };
  const close = async () => {
    if (!context) return;
    const videos = context.pages().map((page) => page.video()); await context.close(); context = null;
    for (const video of videos) if (video) result.videos.push(await video.path());
  };
  const screenshot = async (name) => {
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.race([Promise.all(document.getAnimations().filter((animation) =>
        Number.isFinite(animation.effect?.getComputedTiming().endTime)).map((animation) => animation.finished.catch(() => undefined))),
      new Promise((done) => setTimeout(done, 2000))]);
    });
    const file = join(out, `${name}.png`); await page.screenshot({ path: file, fullPage: false });
    result.screenshots.push({ name, path: file, sha256: hash(readFileSync(file)) });
  };
  try {
    await open(); await frontDoor(page);
    const before = await readAppRecordSnapshot(page);
    await page.locator('#source-capture-title').fill('図書館で見つけた本');
    await page.locator('#source-capture-url').fill(ENCOUNTER_URL);
    await page.locator('#source-capture-text').fill(TEXT);
    await page.locator('#source-capture-save').click();
    await page.locator('#source-reader-body').waitFor();
    const captured = await readAppRecordSnapshot(page);
    noReviewChange(before, captured);
    const source = captured.record.sourceInbox.entries[0];
    await selectWord(page); await page.locator('#source-selection-lookup').click();
    await page.locator('.nav-search-row').first().click();
    await page.locator('#sheet-take').waitFor();
    await page.locator('#sheet-take').click();
    await waitForAppRecord(page, (record) => record.taken.length === 1);
    const learned = await readAppRecordSnapshot(page), item = learned.record.taken[0];
    assert(Number.isFinite(item.started));
    assert.equal(item.id, '町');
    for (const key of ['srs', 'revlog', 'lists']) assert.deepEqual(learned.record[key], before.record[key]);
    if (process.env.KAIRO_EXPECT_SOURCE_LOSS === '1') {
      assert.equal(item.sourceContextRef, undefined);
      assert.equal(item.from, null); assert.equal(item.ctx, undefined);
      assert.equal(learned.record.teacherContexts?.entries.length || 0, 0);
      result.observations.push({ defectReproduced: 'Memorize from saved source loses the encounter association', item, savedSourceId: source.id });
      await screenshot('source-association-lost');
    } else {
      assert.match(item.sourceContextRef || '', /^teacher-context:[0-9a-f]{64}$/u, 'Memorize retains an exact source reference');
      const encounter = learned.record.teacherContexts.entries.find((entry) => entry.id === item.sourceContextRef);
      assert(encounter); assert.equal(encounter.sourceId, source.id);
      assert.equal(encounter.quote, '町の図書館に着くと、窓の近くに席があった。');
      assert.equal(learned.record.teacherContexts.activeRef, null);
      result.observations.push({ sourceRetained: encounter, learnedItem: item });
      await page.locator('#sheet .learning-source summary').click();
      assert.equal(await page.locator('#sheet .learning-source .teacher-source-quote').textContent(), encounter.quote);
      const controls = await page.locator('#sheet .learning-source summary, #learning-source-return').evaluateAll((nodes) => nodes.map((node) => {
        const rect = node.getBoundingClientRect(); return { tag: node.tagName, width: rect.width, height: rect.height };
      }));
      assert(controls.every((control) => control.height >= 44 && control.width >= 44));
      result.observations.push({ sourceControls: controls });
      await screenshot('learned-source');
      await page.locator('#new-list').click();
      await page.locator('.list-maker-field').fill('図書館で出会った言葉');
      await page.locator('.list-maker-make').click();
      await waitForAppRecord(page, (record) => record.lists['図書館で出会った言葉']?.length === 1);
      const listed = await readAppRecordSnapshot(page);
      assert.equal(listed.record.lists['図書館で出会った言葉'][0].sourceContextRef, item.sourceContextRef);
      await page.locator('#sheet-close').click();
      await close(); await open(); await page.goto(`${ORIGIN}/index.html?ui=bi`); await ready(page);
      await openLists(page);
      await page.getByRole('button', { name: 'open the 図書館で出会った言葉 list page', exact: true }).click();
      await page.locator('.tray-line').click();
      await page.locator('#sheet .learning-source summary').click();
      await page.locator('#learning-source-return').click();
      await page.locator('#source-context-return').waitFor();
      assert.equal(await page.locator('#source-context-return').textContent(), encounter.quote);
      assert.equal(await page.locator('#source-reader-body').textContent(), TEXT);
      await page.waitForFunction(() => document.activeElement?.id === 'source-context-return');
      await screenshot('list-source-after-restart');
      await page.locator('#source-reader-back').click();
      await page.waitForFunction(() => document.activeElement?.id === 'learning-source-return');
      assert.equal(await page.locator('body').getAttribute('data-view'), 'list');
      await page.locator('#sheet-close').click();
      await page.locator('.list-review').click();
      await page.locator('#declare-recalled').waitFor();
      assert.equal(await page.locator('#review-source-return').count(), 0, 'The original sentence does not reveal the review answer early');
      const session = await page.evaluate(() => window.__KAIRO_SRS__.session());
      assert.equal(session.queue, 1); assert.equal(session.ix, 0);
      await page.locator('#declare-recalled').click();
      await page.locator('#review-source-return').waitFor();
      const recalled = await readAppRecordSnapshot(page);
      assert.deepEqual(recalled.record.srs, before.record.srs);
      await screenshot('review-after-recall');
      await page.locator('#review-source-return').click();
      await page.locator('#source-context-return').waitFor();
      assert.equal(await page.locator('#source-context-return').textContent(), encounter.quote);
      await page.waitForFunction(() => document.activeElement?.id === 'source-context-return');
      const sourceBox = await page.locator('#source-context-return').evaluate((node) => {
        const r = node.getBoundingClientRect(), header = document.querySelector('.chrome')?.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, header: header?.bottom || 0, height: innerHeight };
      });
      assert(sourceBox.top >= sourceBox.header && sourceBox.bottom <= sourceBox.height);
      assert.match(await page.locator('#source-reader-back').textContent(), /Resume review/u);
      result.observations.push({ renderedSourceContrast: await assertSourceReadable(page) });
      await screenshot('review-exact-source');
      // Recursive lookup may revisit the same source before returning to the
      // original review. Each source door must retain its own caller.
      await selectWord(page); await page.locator('#source-selection-lookup').click();
      await page.locator('.nav-search-row').first().click();
      await page.locator('#sheet .learning-source summary').click();
      await page.locator('#learning-source-return').click();
      await page.locator('#source-context-return').waitFor();
      await page.locator('#source-reader-back').click();
      await page.locator('#sheet-close').click();
      await page.locator('#back').click(); await page.locator('#source-reader-back').waitFor();
      assert.match(await page.locator('#source-reader-back').textContent(), /Resume review/u, 'Nested lookup retains the original review return');
      await page.locator('#source-reader-back').click();
      await page.waitForFunction(() => document.activeElement?.id === 'review-source-return');
      assert.deepEqual(await page.evaluate(() => window.__KAIRO_SRS__.session()), session);
      const returned = await readAppRecordSnapshot(page);
      for (const key of ['taken', 'srs', 'revlog', 'stats', 'obslog', 'lists', 'readDone'])
        assert.deepEqual(returned.record[key], recalled.record[key], `Source visit preserves ${key}`);
      await page.locator('.grade.g-easy').click();
      await page.locator('.review-summary').waitFor();
      assert.match(await page.locator('h1').textContent(), /Session done — 1 review/u);
      const reviewed = await readAppRecordSnapshot(page);
      assert.equal(reviewed.record.revlog.length, before.record.revlog.length + 1);
      assert.equal(reviewed.record.srs['word:町'].reps, 1);
      assert.equal(reviewed.record.taken[0].sourceContextRef, item.sourceContextRef);
      await screenshot('finite-session-complete');
      await page.locator('.close-doors .take').click();
      const downloadWork = page.waitForEvent('download'); await page.locator('#export-store').click();
      const download = await downloadWork, backupFile = join(out, 'ordinary-learning-backup.json');
      await download.saveAs(backupFile);
      const backup = JSON.parse(readFileSync(backupFile));
      for (const key of ['taken', 'srs', 'revlog', 'sourceInbox', 'teacherContexts', 'lists'])
        assert.deepEqual(backup.record[key], reviewed.record[key]);
      const timeOrigin = await page.evaluate(() => performance.timeOrigin);
      await page.locator('#import-file').setInputFiles(backupFile);
      await page.waitForFunction((old) => performance.timeOrigin !== old && document.body.dataset.ready === '1', timeOrigin, { timeout: 30000 });
      await close(); await open(); await page.goto(`${ORIGIN}/index.html?ui=bi`); await ready(page);
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
      if (engine === 'webkit') disconnected = true; else await context.setOffline(true);
      await page.reload(); await ready(page);
      await openLists(page);
      await page.getByRole('button', { name: 'open the 図書館で出会った言葉 list page', exact: true }).click();
      await page.locator('.tray-line').click();
      await page.locator('#sheet .learning-source summary').click();
      await page.locator('#learning-source-return').click(); await page.locator('#source-context-return').waitFor();
      assert.equal(await page.locator('#source-context-return').textContent(), encounter.quote);
      const reused = await readAppRecordSnapshot(page);
      for (const key of ['taken', 'srs', 'revlog', 'sourceInbox', 'teacherContexts', 'lists'])
        assert.deepEqual(reused.record[key], reviewed.record[key]);
      await screenshot('later-offline-reuse');
      await page.locator('#source-reader-back').click();
      await page.locator('#sheet .teacher-discuss').click();
      await page.locator('#chat-input').fill(QUESTION);
      await waitForAppRecord(page, (record) => record.teacherDrafts?.entries.some((draft) => draft.contextRef === encounter.id && draft.text === QUESTION));
      assert.equal(await page.locator('#chat-send').isDisabled(), true);
      await screenshot('later-contextual-question');
      disconnected = false; await context.setOffline(false);
      result.observations.push({ ordinaryFlow: 'capture → lookup → memorize → named list → clean restart → source return → recall → exact source visit and resume → one finite grade → UI backup/restore → clean restart → offline source reuse → retained contextual question',
        inputMethod: 'Visible browser controls; no record seeds, reducers, clock changes or answer injection',
        offlineMode: engine === 'webkit' ? 'server-disconnected simulation' : 'Chromium context offline',
        sourceVisitCreatesGrade: false, finalReviewCount: 1, backupFile, backupSha256: hash(readFileSync(backupFile)) });
      // Separate synthetic failure phase: another real source is saved through
      // the form; only its subsequent enrollment transaction is forced to fail.
      await frontDoor(page);
      const nextText = 'また町で友達に会った。';
      await page.locator('#source-capture-text').fill(nextText);
      await page.locator('#source-capture-save').click(); await page.locator('#source-reader-body').waitFor();
      await selectWord(page); await page.locator('#source-selection-lookup').click();
      await page.locator('.nav-search-row').first().click();
      await page.locator('#sheet-take').click();
      await waitForAppRecord(page, (record) => record.taken.length === 0);
      const stopped = await readAppRecordSnapshot(page);
      assert.equal(stopped.record.lists['図書館で出会った言葉'][0].sourceContextRef, encounter.id);
      assert.deepEqual(stopped.record.srs, reviewed.record.srs);
      await armRecordWriteFailure(page, 'quota', { roots: ['taken', 'teacherContexts'] });
      await page.locator('#sheet-take').click();
      await page.locator('#store-alert').waitFor({ state: 'visible' });
      const failed = await readAppRecordSnapshot(page);
      for (const key of ['taken', 'teacherContexts', 'srs', 'revlog', 'lists'])
        assert.deepEqual(failed.record[key], stopped.record[key]);
      await screenshot('synthetic-enrollment-quota');
      await clearRecordWriteFailure(page);
      const faultTimeOrigin = await page.evaluate(() => performance.timeOrigin);
      await page.locator('#record-reload').click();
      await page.waitForFunction((old) => performance.timeOrigin !== old && document.body.dataset.ready === '1', faultTimeOrigin, { timeout: 30000 });
      await frontDoor(page);
      await page.locator(`[data-source-capture="${stopped.record.sourceInbox.entries.at(-1).id}"]`).click();
      await selectWord(page); await page.locator('#source-selection-lookup').click();
      await page.locator('.nav-search-row').first().click();
      await page.locator('#sheet-take').click();
      await waitForAppRecord(page, (record) => record.taken.length === 1);
      const retried = await readAppRecordSnapshot(page), newRef = retried.record.taken[0].sourceContextRef;
      assert.notEqual(newRef, encounter.id);
      assert.equal(retried.record.teacherContexts.entries.find((entry) => entry.id === newRef).quote, nextText);
      assert(retried.record.teacherContexts.entries.some((entry) => entry.id === encounter.id));
      assert.equal(retried.record.lists['図書館で出会った言葉'][0].sourceContextRef, encounter.id);
      assert.deepEqual(retried.record.srs, reviewed.record.srs);
      assert.equal(retried.record.teacherDrafts.entries.find((draft) => draft.contextRef === encounter.id).text, QUESTION);
      await page.locator('#sheet-close').click(); await openLists(page);
      await page.getByRole('button', { name: 'open the 図書館で出会った言葉 list page', exact: true }).click();
      await page.locator('.tray-line').click(); await page.locator('#sheet .learning-source summary').click();
      await page.locator('#learning-source-return').click(); await page.locator('#source-context-return').waitFor();
      assert.equal(await page.locator('#source-reader-body').textContent(), TEXT, 'The original named list keeps its own encounter after re-enrollment elsewhere');
      await screenshot('original-list-encounter-retained');
      result.observations.push({ syntheticFault: 'Native enrollment transaction quota failure', enrollmentAndContextAtomic: true,
        retryRetainsOldEncounterAndSchedule: true, oldRef: encounter.id, newRef });
    }
    assert.deepEqual(result.errors, []); assert.deepEqual(result.externalRequests, []);
    result.passed = true;
  } catch (error) {
    result.failure = { message: error.message, stack: error.stack };
    try { await screenshot('failure'); result.visibleFailure = await page.locator('body').innerText(); } catch { /* Preserve original error. */ }
  } finally { disconnected = false; await close(); }
  writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 2));
  process.stdout.write(`${name}: ${result.passed ? 'passed' : result.failure.message}\n`);
}
await new Promise((done) => server.close(done));
assert.equal(hash(readFileSync(new URL(import.meta.url))), verifierSha256, 'Verifier changed while running');
const receipt = { schemaVersion: 1, startedAt, finishedAt: new Date().toISOString(), site: SITE,
  artifactSha256: manifest.artifactSha256, verifierSha256, results, passed: results.filter((result) => result.passed).length,
  total: results.length, expectedSourceLoss: process.env.KAIRO_EXPECT_SOURCE_LOSS === '1', scope: 'Saved-source learning subjourneys; no full-product, live-service, OS clipboard, native-device or operator-trial acceptance' };
writeFileSync(join(OUT, 'receipt.json'), JSON.stringify(receipt, null, 2));
if (receipt.passed !== receipt.total) process.exitCode = 1;
