/** Browser proof of the private real-paper importer, on the assembled site with real storage.
 *
 * By default it imports a synthetic pack (tools/assessment/private-pack-fixture.mjs): a
 * tampered pack is refused, the pack is stored in IndexedDB with no network request naming it,
 * the 本物 paper starts in exam mode only, printed underlines render, the listening recordings play
 * once and continue on their own with no replay, results show raw counts per official score
 * section beside the published pass marks, Sensei is not offered, and a backup export carries no
 * question text (the live record does, as the control). On John's Mac, KAIRO_PRIVATE_PACK names a
 * real pack; then screenshots go to KAIRO_PRIVATE_SHOTS and the listening block ends by its own
 * clock (fast-forwarded) because the real recordings run for an hour. Real content is never
 * printed: the report holds counts and verdicts only. */
/* global recordWritable, currentAssessmentV2, buildExportRecord, assessmentV2Pending, recordApp, buildImportPlan, recordInstallation */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { readAppRecordSnapshot } from './record-test-support.mjs';
import { SYNTHETIC_FORM_ID, buildSyntheticContainer } from './assessment/private-pack-fixture.mjs';

const evidence = resolveCorridorEvidence();
const site = resolveCorridorSite();
const realPack = process.env.KAIRO_PRIVATE_PACK || null;
const shots = resolve(process.env.KAIRO_PRIVATE_SHOTS || join(evidence, 'shots'));
mkdirSync(shots, { recursive: true });
function readContainer(bytes) {
  const text = bytes.subarray(0, 96).toString('latin1');
  const [schema, length] = text.split('\n');
  assert.equal(schema, 'kairo-private-assessment-pack/1');
  const start = schema.length + length.length + 2;
  const manifest = JSON.parse(bytes.subarray(start, start + Number(length)).toString('utf8'));
  let offset = start + Number(length);
  const files = new Map();
  for (const file of manifest.files) {
    files.set(file.path, bytes.subarray(offset, offset + file.bytes));
    offset += file.bytes;
  }
  return { manifest, files };
}
let packPath, tamperedPath, formId, form;
if (realPack) {
  packPath = resolve(realPack);
  const { manifest, files } = readContainer(readFileSync(packPath));
  formId = manifest.formId;
  form = JSON.parse(files.get('form.json').toString('utf8'));
  const tampered = Buffer.from(readFileSync(packPath));
  tampered[tampered.length - 5000] ^= 0xff;
  tamperedPath = join(evidence, 'tampered.kairo-private-pack');
  writeFileSync(tamperedPath, tampered);
} else {
  const good = await buildSyntheticContainer(join(evidence, 'fixture'));
  const bad = await buildSyntheticContainer(join(evidence, 'fixture'), { tamper: 'media' });
  packPath = join(evidence, 'synthetic.kairo-private-pack');
  tamperedPath = join(evidence, 'synthetic-tampered.kairo-private-pack');
  writeFileSync(packPath, good.container);
  writeFileSync(tamperedPath, bad.container);
  formId = SYNTHETIC_FORM_ID;
  form = good.form;
}
// Probes: exact question text the export must not carry (and the live record must, as control).
// Each is a run of stored text with no printed-feature marks inside it, so it appears verbatim.
const segment = (text, length) =>
  text.split(/[\uE000-\uE006\n]/u).map((part) => part.trim()).filter((part) => part.length >= length)
    .sort((a, b) => b.length - a.length)[0]?.slice(0, length);
const probes = [
  form.passages.map((row) => segment(row.text, 20)).find(Boolean),
  form.items.filter((row) => row.skill !== 'listening').map((row) => segment(row.prompt, 10)).find(Boolean),
  form.media.map((row) => segment(row.transcript || '', 12)).find(Boolean),
  form.items.flatMap((row) => row.response.options.map((option) => segment(option.text, 8))).find(Boolean),
].filter(Boolean);
assert(probes.length >= 3, 'three independent probes');
const exposed = ['recordWritable', 'currentAssessmentV2', 'buildExportRecord', 'assessmentV2Pending', 'recordApp', 'buildImportPlan', 'recordInstallation'];
const corridorFixture = Buffer.concat([
  readFileSync(resolve(site, 'corridor.js')),
  Buffer.from('\n' + exposed.map((name) => `Object.defineProperty(window,${JSON.stringify(name)},{get:()=>${name}});`).join('\n')),
]);
const served = [];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = createServer((request, response) => {
  const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(1) || 'index.html';
  served.push(name);
  const path = resolve(site, name);
  if (!path.startsWith(`${site}${sep}`)) { response.writeHead(403).end(); return; }
  const bytes = name === 'corridor.js' ? corridorFixture : existsSync(path) ? readFileSync(path) : null;
  if (!bytes) { response.writeHead(404).end(); return; }
  response.setHeader('content-type', mime[extname(name)] || 'application/octet-stream');
  response.setHeader('cache-control', 'no-store');
  response.end(bytes);
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const engines = process.env.KAIRO_BROWSER === 'all' ? ['chromium', 'webkit'] : [process.env.KAIRO_BROWSER || 'chromium'];
const report = { mode: realPack ? 'real-pack' : 'synthetic-pack', formId, engines: [], probes: probes.length, failures: [] };

async function shot(page, label, engine) {
  if (engine !== 'chromium') return;
  for (const [width, height] of [[1280, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(shots, `${label}-${width}.png`), fullPage: true });
    // A text-free copy for layout review by anyone who must not read the paper.
    await page.addStyleTag({ content: 'body.redact-paper .exam-passage, body.redact-paper .exam-prompt, body.redact-paper .mock-opt, body.redact-paper .exam-official-instruction, body.redact-paper .exam-answer, body.redact-paper .exam-official-page { filter: blur(7px) !important; }' });
    await page.evaluate(() => document.body.classList.add('redact-paper'));
    await page.screenshot({ path: join(shots, `${label}-${width}-redacted.png`), fullPage: true });
    await page.evaluate(() => document.body.classList.remove('redact-paper'));
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

async function runEngine(engine) {
  const browser = await (engine === 'webkit' ? webkit : chromium).launch();
  const row = { engine, steps: [] };
  const step = (name, detail = true) => row.steps.push({ name, detail });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    if (realPack) await context.clock.install();
    const page = await context.newPage();
    const requests = [], errors = [];
    page.on('request', (request) => requests.push(request.url()));
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const plays = (window.__plays = []);
      const original = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        plays.push({ at: Date.now(), srcKind: String(this.src).slice(0, 5) });
        window.__lastMedia = this;
        return original.call(this);
      };
    });
    await page.goto(`${origin}/?entry=shelf&ui=bi`);
    await page.waitForFunction(() => typeof recordWritable === 'function' && recordWritable(), null, { timeout: 60_000 });
    if (realPack) await page.clock.resume();
    await page.locator('#mock-link').click();
    await page.locator('[data-exam-level="N1"]').click();
    await page.locator('[data-exam-official="N1"]').waitFor();
    // A changed pack is refused before anything is stored.
    await page.setInputFiles('#exam-official-file', tamperedPath);
    await page.locator('.exam-official-notice').waitFor({ timeout: 120_000 });
    assert.equal(await page.locator('[data-official-form]').count(), 0, 'tampered pack stored nothing');
    const refusal = await page.locator('.exam-official-notice').getAttribute('data-import-code');
    assert.match(refusal, /^private-pack-changed:/u, `refused as changed bytes (${refusal})`);
    step('tampered-pack-refused', refusal);
    await page.setInputFiles('#exam-official-file', packPath);
    await page.waitForFunction(() => document.querySelector('.exam-official-notice')?.dataset.importCode !== undefined &&
      !/^private-pack-changed/u.test(document.querySelector('.exam-official-notice').dataset.importCode), null, { timeout: 180_000 });
    const imported = await page.locator('.exam-official-notice').getAttribute('data-import-code');
    assert.equal(imported, 'imported', `import outcome ${imported}`);
    await page.locator(`[data-official-form="${formId}"]`).waitFor({ timeout: 30_000 });
    const card = page.locator(`[data-official-form="${formId}"]`);
    assert.match(await card.locator('.exam-official-mark').innerText(), /^本物/u);
    assert.match(await card.locator('.exam-form-meta').innerText(), new RegExp(`^${form.items.length}(問| questions)`, 'u'));
    step('imported', { questions: form.items.length });
    const stored = await page.evaluate(async () => {
      const db = await new Promise((done, fail) => { const r = indexedDB.open('kairo-private-assessment'); r.onsuccess = () => done(r.result); r.onerror = () => fail(r.error); });
      const count = (store) => new Promise((done) => { const r = db.transaction(store).objectStore(store).count(); r.onsuccess = () => done(r.result); });
      const result = { packs: await count('packs'), files: await count('files') }; db.close(); return result;
    });
    assert.equal(stored.packs, 1);
    step('stored-in-indexeddb', stored);
    await shot(page, 'catalog', engine);
    await card.locator(`[data-exam-start="${formId}"]`).click();
    await page.locator('#exam-confirm-start').waitFor();
    assert.equal(await page.locator('#exam-practice-start').count(), 0, 'a real paper runs in exam mode only');
    await shot(page, 'confirm', engine);
    await page.locator('#exam-confirm-start').click();
    await page.locator('.exam-prompt').waitFor({ timeout: 120_000 });
    assert.equal(await page.locator('.exam-official-badge').count(), 1);
    assert((await page.locator('.exam-prompt .paper-underline').count()) >= 1, 'printed underline rendered');
    assert.equal(await page.locator('.exam-official-instruction').count(), 1);
    assert.match(await page.locator('.exam-task-heading').textContent(), /^問題 1\u3000/u);
    step('question-1-rendered', { underline: true, instruction: true });
    await shot(page, 'question-1', engine);
    await page.locator('.exam-official-pages > summary').click();
    await page.waitForFunction(() => [...document.querySelectorAll('.exam-official-page')].some((image) => image.complete && image.naturalWidth > 0), null, { timeout: 30_000 });
    step('printed-page-shown');
    for (let index = 0; index < 3; index++) {
      await page.locator('[data-exam-option]').nth(index % 2).click();
      await page.waitForFunction(() => !assessmentV2Pending);
      await page.locator('#exam-next').click();
      await page.waitForFunction(() => !assessmentV2Pending);
    }
    const written = await page.evaluate(() => currentAssessmentV2().attempt.answers.filter((row) => row.response.kind === 'selected').length);
    assert.equal(written, 3);
    step('answered-written', written);
    // A reading item with its passage, then finish the written paper.
    const readingIndex = form.items.findIndex((item) => item.skill === 'reading');
    await page.locator('.exam-question-map > summary').click();
    await page.locator('.exam-question-grid [data-exam-visit]').nth(readingIndex).click();
    await page.locator('.exam-passage').first().waitFor();
    await shot(page, 'reading', engine);
    const writtenCount = form.items.filter((item) => item.skill !== 'listening').length;
    await page.locator('.exam-question-map > summary').click().catch(() => {});
    if (!(await page.locator('.exam-question-grid').isVisible())) await page.locator('.exam-question-map > summary').click();
    await page.locator('.exam-question-grid [data-exam-visit]').nth(writtenCount - 1).click();
    await page.locator('#exam-finish-block').click();
    await page.locator('#exam-confirm-finish').click();
    await page.locator('#exam-next-block').click();
    await page.locator('#exam-audio-play').waitFor({ timeout: 60_000 });
    // The listening paper numbers its own 問題 again from 1, under its printed section title.
    assert.equal(await page.locator('.exam-task-heading').textContent(), '問題 1\u3000聴解');
    assert.equal(await page.locator('.exam-official-instruction').count(), 1);
    await page.locator('#exam-audio-play').click();
    await page.waitForFunction(() => window.__lastMedia && !window.__lastMedia.paused && window.__lastMedia.currentTime > 1, null, { timeout: 60_000 });
    assert(await page.locator('#exam-audio-play').isDisabled(), 'no replay or restart while playing');
    const media = await page.evaluate(() => ({ duration: window.__lastMedia.duration, time: window.__lastMedia.currentTime, controls: window.__lastMedia.controls, inDocument: document.contains(window.__lastMedia) }));
    assert.equal(media.controls, false);
    assert.equal(media.inDocument, false, 'no seekable player on the page');
    const expectedMs = form.media[0].durationMs;
    // Browsers estimate an MP3's length from its frames; WebKit reads the 13 min file ~2 s long.
    assert(Math.abs(media.duration * 1000 - expectedMs) < 1000 + expectedMs * 0.005, `decoded length ${media.duration} s matches the pack's ${expectedMs} ms`);
    step('listening-playing', { decodedSeconds: Math.round(media.duration * 10) / 10, packMs: expectedMs });
    await shot(page, 'listening', engine);
    const listeningItems = form.items.filter((item) => item.skill === 'listening');
    const firstUnitItems = listeningItems.filter((item) => item.media[0].sha256 === form.media[0].sha256);
    for (let index = 0; index < Math.min(2, firstUnitItems.length); index++) {
      await page.locator('[data-exam-option]').first().click();
      await page.waitForFunction(() => !assessmentV2Pending);
      if (index + 1 < Math.min(2, firstUnitItems.length)) {
        await page.locator('#exam-next').click();
        await page.waitForFunction(() => !assessmentV2Pending);
      }
    }
    if (realPack) {
      // The real recordings run about an hour: let the listening block's own clock run out.
      await page.clock.fastForward('02:00:00');
      await page.locator('.exam-official-sections').waitFor({ timeout: 120_000 });
      step('listening-ended-by-clock');
    } else {
      // Continuous: the second recording starts by itself when the first ends; neither replays.
      await page.waitForFunction(() => window.__plays.length >= 2, null, { timeout: 60_000 });
      await page.waitForFunction(() => currentAssessmentV2().attempt.audio.every((row) => row.status === 'ended'), null, { timeout: 60_000 });
      const audio = await page.evaluate(() => currentAssessmentV2().attempt.audio.map((row) => ({ status: row.status, starts: row.starts })));
      assert(audio.every((row) => row.status === 'ended' && row.starts === 1), 'each recording played once');
      assert.equal(await page.evaluate(() => window.__plays.length), 2, 'one user start, one automatic continuation');
      step('listening-continuous-once', audio);
      await page.locator('.exam-question-map > summary').click();
      await page.locator('.exam-question-grid [data-exam-visit]').last().click();
      await page.locator('#exam-finish-block').click();
      await page.locator('#exam-confirm-finish').click();
      await page.locator('.exam-official-sections').waitFor({ timeout: 60_000 });
    }
    const sections = await page.locator('[data-official-section]').evaluateAll((rows) => rows.map((row) => ({ id: row.dataset.officialSection, raw: row.querySelector('.exam-official-raw').textContent, mark: row.querySelector('.exam-official-mark').textContent })));
    assert.deepEqual(sections.map((row) => row.id), ['language-knowledge', 'reading', 'listening']);
    for (const row of sections) assert.match(row.mark, /19/u);
    assert.match(await page.locator('.exam-official-pass').innerText(), /100/u);
    assert.match(await page.locator('.exam-official-scale').innerText(), /換算できません/u);
    assert.equal(await page.locator('#exam-sensei').count(), 0, 'no Sensei for a real paper');
    assert.equal(await page.getByText('先生にこの問題を聞く').count(), 0);
    step('results-by-official-section', sections.map((row) => ({ id: row.id, raw: row.raw })));
    await shot(page, 'results', engine);
    // Backup export: no question text; the live record (control) does carry it.
    await page.waitForFunction(() => !assessmentV2Pending && !recordApp.pending);
    const exported = await page.evaluate(async () => (await buildExportRecord()).text);
    assert(exported, 'export produced');
    const live = JSON.stringify((await readAppRecordSnapshot(page)).record);
    const counts = probes.map((probe) => ({ backup: exported.split(probe).length - 1, liveRecord: live.split(probe).length - 1 }));
    assert(counts.every((row) => row.backup === 0), 'backup carries no question text');
    assert(counts.every((row) => row.liveRecord >= 1), 'control: the on-device record does');
    const backup = JSON.parse(exported);
    assert(!backup.record.assessmentLibraryV2?.forms.some((row) => row.id === formId), 'form omitted');
    assert(backup.record.assessmentPrivateOmitted?.some((row) => row.formId === formId && /^[a-f0-9]{64}$/u.test(row.formSha256)), 'omission names formId and formSha256');
    // The shortened backup is still a whole, importable record.
    const importable = await page.evaluate(async (text) => {
      try { await buildImportPlan(JSON.parse(text), recordInstallation.policy); return 'ok'; } catch (error) { return String(error?.message || error); }
    }, exported);
    assert.equal(importable, 'ok', `backup import plan: ${importable}`);
    step('backup-export', { probes: counts, omitted: backup.record.assessmentPrivateOmitted.length, bytes: exported.length, importable });
    // No request ever named a private asset; nothing left this machine.
    const offOrigin = requests.filter((url) => !url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:'));
    assert.deepEqual(offOrigin, []);
    assert(!requests.some((url) => /private/iu.test(url) || url.includes('kairo-private.invalid')));
    assert(!served.some((name) => /private|\.mp3$|\.kairo/iu.test(name)));
    step('no-network-for-private-assets', { requests: requests.length });
    assert.deepEqual(errors, []);
    // Removal leaves results in place and the pack store empty.
    await page.locator('#exam-done').click();
    await page.locator(`[data-official-remove="${formId}"]`).click();
    await page.locator('#exam-confirm-remove').click();
    await page.waitForFunction((id) => !document.querySelector(`[data-official-form="${id}"]`), formId);
    step('removed');
    await context.close();
    row.verdict = 'pass';
  } catch (error) {
    row.verdict = 'fail';
    row.error = String(error?.stack || error);
    report.failures.push({ engine, error: String(error?.message || error) });
  } finally {
    await browser.close();
    report.engines.push(row);
  }
}

for (const engine of engines) await runEngine(engine);
server.close();
writeFileSync(join(evidence, 'private-import.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ mode: report.mode, engines: report.engines.map((row) => ({ engine: row.engine, verdict: row.verdict, steps: row.steps.map((entry) => entry.name), error: row.error?.split('\n')[0] })), evidence }, null, 2));
if (report.failures.length) process.exitCode = 1;
