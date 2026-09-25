/** Walk the public written pack through the unmodified staged app. All learner
 * actions use DOM controls; storage is observed independently through real IDB.
 * No catalog replacement, export shim, source mutation, or model call is used. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:https';
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import {
  resolveCorridorEvidence,
  resolveCorridorSite,
} from '../../../scripts/resolve-corridor-site.mjs';
import { admittedWrittenSections } from './assessment/bank.mjs';
import {
  armRecordWriteFailure,
  clearRecordWriteFailure,
  readAppRecordSnapshot,
} from './record-test-support.mjs';

assert(
  process.env.KAIRO_SITE_DIR && process.env.KAIRO_ARTIFACT_SHA256,
  'Choose an existing immutable artifact and its exact digest.',
);
const evidence = resolveCorridorEvidence();
const site = resolveCorridorSite();
const sha = (value) => createHash('sha256').update(value).digest('hex');
const identity = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
const catalogPath = 'data/assessment/catalog.json';
const catalog = JSON.parse(readFileSync(resolve(site, catalogPath), 'utf8'));
// One ready written entry per level with a filled REVIEWED_WRITTEN pin, and no other ready entry.
const sections = admittedWrittenSections(catalog).map(({ pin, entry }) => {
  assert(
    entry.availability.ready && entry.review.status === 'ai-reviewed',
    `The public ${pin.level} written pack is admitted.`,
  );
  assert.equal(entry.mode, 'section');
  assert.equal(entry.questionCount, pin.questionCount);
  assert.equal(entry.durationMinutes, pin.durationMinutes);
  assert.deepEqual(entry.skillCounts, { ...pin.skillCounts });
  const formPath = `data/assessment/${entry.formPath}`;
  const deliveryPath = `data/assessment/${entry.deliveryPath}`;
  return {
    pin,
    entry,
    formPath,
    deliveryPath,
    form: JSON.parse(readFileSync(resolve(site, formPath), 'utf8')),
    delivery: JSON.parse(readFileSync(resolve(site, deliveryPath), 'utf8')),
    // A single admitted level keeps the original case and screenshot names.
    suffix: '',
  };
});
assert(sections.length > 0, 'At least one written section is admitted.');
if (sections.length > 1)
  for (const section of sections) section.suffix = `-${section.pin.level.toLowerCase()}`;
assert.equal(
  catalog.entries.filter(
    (row) => !row.availability.ready && ['short', 'medium', 'full'].includes(row.mode),
  ).length,
  3,
);
const core = await import(pathToFileURL(resolve(site, 'modules/assessment-core.mjs')));
const recordCore = await import(pathToFileURL(resolve(site, 'modules/record-core.mjs')));
const { selectAssessmentV2 } = await import(
  pathToFileURL(resolve(site, 'assessment-v2-controller.mjs'))
);
const { assessmentLearningSummary } = await import(
  pathToFileURL(resolve(site, 'assessment-learning.mjs'))
);
for (const section of sections) {
  const { pin, entry, form, delivery } = section;
  assert.equal(core.parseFormVersion(form).sha256, entry.formSha256);
  assert.equal(recordCore.encodeLocalJson(delivery).sha256, entry.deliverySha256);
  assert.equal(form.scope, 'section-practice');
  assert.equal(form.exam.track, pin.level);
  assert.equal(form.items.length, pin.questionCount);
  assert.equal(form.media.length, 0);
  assert.deepEqual(delivery.assets, []);
  assert.deepEqual(delivery.units, []);
  assert.equal(
    form.timingBlocks.reduce((sum, block) => sum + block.durationMs, 0),
    pin.durationMinutes * 60_000,
  );
  section.items = form.timingBlocks.flatMap((block) =>
    block.sectionIds.flatMap((sectionId) =>
      form.sections
        .find((candidate) => candidate.id === sectionId)
        .itemIds.map((itemId) => form.items.find((item) => item.id === itemId)),
    ),
  );
  assert.equal(new Set(section.items.map((item) => item.id)).size, pin.questionCount);
  assert(
    section.items.every((item) => item.response.kind === 'selected' && item.media.length === 0),
  );
}
const publicFiles = [
  catalogPath,
  ...sections.flatMap((section) => [section.formPath, section.deliveryPath]),
  'corridor.js',
  'assessment-view.mjs',
];
const fileHashes = Object.fromEntries(
  publicFiles.map((path) => {
    const digest = sha(readFileSync(resolve(site, path)));
    assert.equal(identity.files.find((row) => row.path === path)?.sha256, digest);
    return [path, digest];
  }),
);
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
let served = 0;
const keyPath = resolve(evidence, 'synthetic-localhost-key.pem');
const certPath = resolve(evidence, 'synthetic-localhost-cert.pem');
execFileSync(
  'openssl',
  [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    keyPath,
    '-out',
    certPath,
    '-days',
    '1',
    '-subj',
    '/CN=localhost',
  ],
  { stdio: 'ignore' },
);
const server = createServer(
  { key: readFileSync(keyPath), cert: readFileSync(certPath) },
  (request, response) => {
    const name =
      decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(1) ||
      'index.html';
    const path = resolve(site, name);
    if (!path.startsWith(`${site}${sep}`) || !existsSync(path) || !statSync(path).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader('content-type', mime[extname(path)] || 'application/octet-stream');
    response.setHeader('cache-control', 'no-store');
    served++;
    response.end(readFileSync(path));
  },
);
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const port = server.address().port;
const origin = `https://127.0.0.1:${port}`;
const engines =
  process.env.KAIRO_BROWSER === 'all'
    ? ['chromium', 'webkit']
    : [process.env.KAIRO_BROWSER || 'chromium'];
assert(engines.every((engine) => ['chromium', 'webkit'].includes(engine)));
const filter = process.argv.find((arg) => arg.startsWith('--case='))?.slice(7);
const results = [];

async function disk(page) {
  return page.evaluate(async () => {
    const installation = JSON.parse(localStorage.getItem('kairo-local-record-binding-v1'));
    if (!installation?.databaseName) return null;
    const db = await new Promise((done, fail) => {
      const request = indexedDB.open(installation.databaseName);
      request.onsuccess = () => done(request.result);
      request.onerror = () => fail(request.error);
    });
    try {
      return await new Promise((done, fail) => {
        const tx = db.transaction('kairo_replication_rows', 'readonly');
        const request = tx.objectStore('kairo_replication_rows').getAll();
        tx.oncomplete = () =>
          done(
            request.result
              .filter((row) => row.kind === 'document')
              .map((row) => JSON.parse(row.text))
              .find((row) => row.collection === 'learner-record' && row.id === 'current')?.value ||
              null,
          );
        tx.onabort = () => fail(tx.error);
      });
    } finally {
      db.close();
    }
  });
}
// BEGIN resolved-value polling helper: exact reviewed F repair implementation.
async function pollNativeState(check, { timeoutMs, description, intervalMs = 50 }) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(intervalMs) || intervalMs <= 0)
    throw new TypeError('Native-state polling requires positive finite bounds');
  const deadline = performance.now() + timeoutMs;
  const timeoutError = new Error(`Timed out after ${timeoutMs}ms waiting for ${description}`);
  timeoutError.name = 'TimeoutError';
  let deadlineTimer, intervalTimer;
  const expired = new Promise((resolve, reject) => { deadlineTimer = setTimeout(() => reject(timeoutError), timeoutMs); });
  try {
    while (true) {
      if (performance.now() >= deadline) throw timeoutError;
      // evaluate has no Playwright timeout; bound even an evaluation that never settles.
      const observed = await Promise.race([Promise.resolve().then(check), expired]);
      if (performance.now() >= deadline) throw timeoutError;
      if (observed === true) return;
      if (observed !== false) throw new TypeError('Native-state predicate must resolve to a boolean');
      await Promise.race([new Promise(resolve => {
        intervalTimer = setTimeout(resolve, Math.min(intervalMs, Math.max(0, deadline - performance.now())));
      }), expired]);
    }
  } finally { clearTimeout(deadlineTimer); clearTimeout(intervalTimer); }
}
// END resolved-value polling helper.
async function pollRecord(page, predicate) {
  for (let count = 0; count < 120; count++) {
    const record = await disk(page);
    if (record && predicate(record)) return record;
    await new Promise((done) => setTimeout(done, 50));
  }
  assert.fail('Expected durable learner record did not arrive.');
}
async function boot(page) {
  await page.goto(`${origin}/?entry=shelf&ui=bi`);
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 60000 });
  assert.equal(await page.locator('#store-alert').isVisible(), false);
  await pollRecord(page, (record) => Array.isArray(record.taken));
}
async function fit(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert(
    dimensions.document <= dimensions.viewport + 1,
    `${label} must fit 320px: ${JSON.stringify(dimensions)}`,
  );
}
/** The room lists one level at a time; press this section's level only if it is not current. */
async function selectLevel(page, level) {
  const control = page.locator(`[data-exam-level="${level}"]`);
  if ((await control.getAttribute('aria-pressed')) !== 'true') await control.click();
}
async function catalogDoor(page, section, screenshotPrefix = null) {
  const { entry, pin } = section;
  await page.locator('#mock-link').click();
  await selectLevel(page, pin.level);
  const card = page
    .locator('[data-exam-form]')
    .filter({ has: page.locator(`[data-exam-start=${JSON.stringify(entry.id)}]`) });
  await card.waitFor();
  assert.match(await page.locator('.exam-section-heading').innerText(), /Practice by skill/u);
  assert.equal(await card.locator('h2').textContent(), entry.titleEn);
  assert.match(
    await card.locator('.exam-form-meta').innerText(),
    new RegExp(`${pin.questionCount} questions · about ${pin.durationMinutes} min`, 'u'),
  );
  assert.equal(await card.locator('.exam-skills').textContent(), 'Vocabulary · Grammar · Reading');
  assert.match(await card.locator('.exam-status').innerText(), /without listening/u);
  for (const mode of ['medium', 'full', 'short']) {
    await page.locator(`[data-exam-length="${mode}"]`).click();
    const pending = catalog.entries.find((row) => row.level === pin.level && row.mode === mode);
    if (pending)
      assert.equal(
        await page.locator(`[data-exam-start=${JSON.stringify(pending.id)}]`).count(),
        0,
      );
  }
  await fit(page, 'Public catalog');
  if (screenshotPrefix)
    await page.screenshot({
      path: resolve(evidence, `${screenshotPrefix}-written-catalog-320.png`),
      fullPage: true,
    });
  await card.locator('[data-exam-start]').click();
  assert.equal(await page.locator('#exam-confirm-title').textContent(), entry.titleEn);
  assert.match(
    await page.locator('.exam-download-note').textContent(),
    /^Questions download before the timer starts\./u,
  );
  assert(!/audio/iu.test(await page.locator('.exam-download-note').textContent()));
}
async function start(page, section, mode, screenshotPrefix = null) {
  const { entry, pin, items } = section;
  await catalogDoor(page, section, screenshotPrefix);
  await page.locator(mode === 'timed' ? '#exam-confirm-start' : '#exam-practice-start').click();
  await page.locator('.exam-prompt').waitFor();
  assert.equal(await page.locator('.exam-heading').textContent(), `${pin.level} practice`);
  assert.equal(await page.locator('.exam-prompt').textContent(), items[0].prompt);
  assert.match(
    await page.locator('.exam-progress').innerText(),
    new RegExp(`Question 1 of ${items.length}`, 'u'),
  );
  assert.equal(await page.locator('audio, #exam-audio-play, #exam-example-audio-play').count(), 0);
  if (mode === 'practice') assert.equal(await page.locator('#exam-timer').textContent(), 'Untimed');
  else
    assert.match(
      await page.locator('#exam-timer').textContent(),
      new RegExp(`^(${pin.durationMinutes}:00|${pin.durationMinutes - 1}:\\d\\d)$`, 'u'),
    );
  const record = await pollRecord(page, (row) => row.assessmentLibraryV2?.attempts.length === 1);
  const selected = selectAssessmentV2(record.assessmentLibraryV2);
  assert.equal(selected.attempt.mode, mode);
  assert.equal(selected.form.sha256, entry.formSha256);
  assert.deepEqual(selected.attempt.editorialAtStart, entry.editorialAtStart);
  await fit(page, `${mode} first question`);
  if (screenshotPrefix)
    await page.screenshot({
      path: resolve(evidence, `${screenshotPrefix}-written-question-320.png`),
      fullPage: true,
    });
  return record;
}
async function wrongAnswer(page, item) {
  assert.equal(await page.locator('.exam-prompt').textContent(), item.prompt);
  const wrong = item.response.options.find((option) => option.id !== item.response.answerOptionId);
  const choice = page.locator(`[data-exam-option=${JSON.stringify(wrong.id)}]`);
  await choice.click();
  await page.waitForFunction(
    (id) =>
      document.querySelector(`[data-exam-option="${id}"]`)?.getAttribute('aria-pressed') === 'true',
    wrong.id,
  );
  return wrong.id;
}
// Every case this invocation could run, and whether the filter selected it: the receipt
// compares this plan with the observed results.
const planned = [];
async function run(engine, name, action) {
  planned.push({ engine, name, selected: !filter || name.includes(filter) });
  if (filter && !name.includes(filter)) return;
  if (!server.listening) await new Promise((done) => server.listen(port, '127.0.0.1', done));
  // Staged cases record per-stage evidence here; it is kept whether the case passes or fails.
  const log = { stages: [], acceptedTerminal: false };
  const profile = mkdtempSync(resolve(evidence, `${engine}-${name}-`));
  const context = await { chromium, webkit }[engine].launchPersistentContext(profile, {
    headless: true,
    ignoreHTTPSErrors: true,
    ...(engine === 'chromium'
      ? {
          executablePath: process.env.CHROMIUM_PATH || undefined,
          args: ['--ignore-certificate-errors'],
        }
      : {}),
    viewport: { width: 320, height: 844 },
  });
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(20000);
  const errors = [],
    external = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  const startedAt = new Date().toISOString();
  try {
    await boot(page);
    const observations = await action(page, context, log);
    assert.deepEqual(errors, [], 'No unhandled app errors');
    assert.deepEqual(external, [], 'No external service was contacted');
    results.push({
      engine,
      name,
      passed: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      observations,
      stages: log.stages,
      acceptedTerminal: log.acceptedTerminal,
    });
    console.log(`PASS ${engine}/${name}`);
  } catch (error) {
    const text = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    const record = await disk(page).catch(() => null);
    const recordSummary = record && {
      taken: record.taken,
      revlog: record.revlog,
      attempts: record.assessmentLibraryV2?.attempts.map((row) => ({
        id: row.attemptId,
        status: row.status,
        form: row.form,
      })),
      followups: record.assessmentLearning?.followups.map((row) => ({
        id: row.id,
        status: row.status,
        evidence: row.evidence.map((item) => ({
          id: item.id,
          item: item.item,
          outcome: item.outcome,
          subjects: item.subjects,
        })),
        actions: row.actions.map((action) => ({
          evidenceId: action.evidenceId,
          target: { t: action.target.t, id: action.target.id },
          status: action.status,
        })),
      })),
    };
    results.push({
      engine,
      name,
      passed: false,
      startedAt,
      error: String(error.stack || error),
      errors,
      external,
      text: text.slice(0, 6000),
      recordSummary,
      // A failure outside a stage, or in a setup stage, is inconclusive for a control.
      stages: log.stages,
      failedStage: log.stages.find((entry) => entry.status === 'failed') ?? null,
      acceptedTerminal: log.acceptedTerminal,
    });
    await page
      .screenshot({ path: resolve(evidence, `${engine}-${name}-failure.png`), fullPage: true })
      .catch(() => {});
    console.error(`FAIL ${engine}/${name}: ${String(error)}`);
  } finally {
    await context.close();
  }
}

// ---- G1 assisted why. Expectations are literal and source-bound (independent acceptance
// ledger 5653be4e…, LITERALS.json b9c96d47…); none is read back from planner output or
// from candidate action ids. Logical targets are asserted; physical ids are not.
// Instrumentation used by this case (also declared in the receipt): the record-test-support
// quota fault, forwarding IDBObjectStore.prototype.put wrappers, and read-only DOM observers.
const G1_CASE = 'untimed-mixed-written-assisted-why-enrolls-exactly';
const G1 = {
  form: {
    id: 'kairo-original-jlpt-n2-short-01:written-review',
    sha256: '56d6ea3b6024cd04447a72c36640ee99c672808d93bcd22f7ccdb4c1e2c198a2',
  },
  schedule: [
    { q: 'q01', choice: 'choice-2' },
    { q: 'q02', choice: 'choice-2' },
    { q: 'q03', choice: 'choice-2', flag: true },
    { q: 'q04', choice: 'choice-3' },
    { q: 'q05', choice: 'choice-1', why: true },
    { q: 'q06', choice: 'choice-1', why: true },
    { q: 'q07' },
    { q: 'q08', choice: 'choice-2' },
    { q: 'q09', unreached: true },
    { q: 'q10', choice: 'choice-1', why: true },
    { q: 'q11', choice: 'choice-2' },
    { q: 'q12', choice: 'choice-3' },
  ],
  targets: [
    ['q01', 'word', '点検'],
    ['q03', 'word', '支障'],
    ['q03', 'sentence', '大雪の影響で、列車の運行に支障が出ている。'],
    ['q05', 'sentence', '実際に住んでみないことには、この町のよさは分からないと思う。'],
    ['q06', 'sentence', '説明書を読んだものの、まだ使い方がよく分からない。'],
    ['q10', 'question', '受付を早めに済ませるよう求めている理由は何ですか。'],
  ],
  assisted: ['q05', 'q06', 'q10'],
  // Physical ids of the derived targets. g1PhysicalIds reproduces them from the pinned form; both
  // formulas were first checked against ids observed in earlier sealed runs of other fixtures.
  physical: {
    q03: 'source-practice:teacher-context:2e82ab0f3686ffffedeb5214ea79b4528fa7efc149002066a1cd44b701cff10a:13:15:v1',
    q05: 'source-practice:teacher-context:3e50223ac8f53315c6d11b2a0e5542213dac160fb2b40c9c669ed53edd28aeec:9:13:v1',
    q06: 'source-practice:teacher-context:3e66ec5137c81dbff2d0c50d0f8efb3ae9a61d6cf9be3f0f7e97d07f0b89cf02:7:10:v1',
    q10: 'assessment-question:682faad2ffb4cf7db6769adc379156e7859efe6bfc372d3116f4638cc2e229e5',
  },
};
// The published identity formulas, restated here and computed with node:crypto from the pinned form,
// never from planner output or candidate action ids. A sentence card is the item's one reviewed blank
// filled with its key: source-practice:<teacher-context id>:<blank start>:<blank end>:v1, where the
// context id hashes its sorted content. A question card is assessment-question:<sha256 of the compact
// sorted JSON of [policy, form ref, item ref, presentation digest]>.
function g1PhysicalIds(form) {
  const canonical = (value) => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
  const digest = (value) => sha(JSON.stringify(canonical(value)));
  const ref = (value, kind) => ({ kind, id: value.id, revisionId: value.revisionId, sha256: value.sha256 });
  const itemOf = (q) => form.items.find((item) => item.id.split(':').at(-1) === q);
  assert.equal(form.provenance.kind, 'original-ai');
  const sentence = (q) => {
    const item = itemOf(q);
    const answer = item.response.options.find((option) => option.id === item.response.answerOptionId).text;
    const line = item.prompt.split('\n').at(-1);
    const blanks = [...line.matchAll(item.task === 'orthography' ? /【[^【】]+】/gu : /（[\s\u3000]*）/gu)];
    assert.equal(blanks.length, 1);
    const start = blanks[0].index, text = line.slice(0, start) + answer + line.slice(start + blanks[0][0].length);
    const content = { attribution: 'KAIRO original practice · AI authored', end: text.length, index: start, quote: text,
      sourceDigest: sha(text), sourceId: JSON.stringify({ formId: form.id, formSha256: form.sha256, itemId: item.id,
        itemRevisionId: item.revisionId, derivation: 'cloze-v2' }), sourceKind: 'assessment-item', start: 0, target: null,
      title: form.title, unit: 'utf16-code-unit', url: null, version: 2 };
    return `source-practice:teacher-context:${digest(content)}:${start}:${start + answer.length}:v1`;
  };
  const question = (q) => {
    const item = itemOf(q);
    assert.deepEqual(item.media, []);
    const passages = item.passages.map((row) =>
      ref(form.passages.find((passage) => passage.id === row.id && passage.sha256 === row.sha256), 'passage'));
    const presentation = digest({ item: ref(item, 'item'), passages, media: [], presentation: null });
    return `assessment-question:${digest(['assessment-question/1', ref(form, 'form'), ref(item, 'item'), presentation])}`;
  };
  return { q03: sentence('q03'), q05: sentence('q05'), q06: sentence('q06'), q10: question('q10') };
}
const g1Skipped = [];
async function g1Reload(page) {
  const origin = await page.evaluate(() => performance.timeOrigin);
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 60000 });
  assert.notEqual(await page.evaluate(() => performance.timeOrigin), origin, 'A real reload is a new document');
  await page.locator('#mock-link').click();
}
// A refused host write either leaves a notice in the room or protects the window
// (recordFailure → read-only → .room-state). Returns whether the window was protected.
async function g1Settle(page) {
  await page.locator('.exam-notice[role="alert"], .room-state').first().waitFor();
  return (await page.locator('.room-state').count()) > 0;
}
// The host's own recovery for a protected window: its visible reload control.
async function g1RecoverProtected(page) {
  const origin = await page.evaluate(() => performance.timeOrigin);
  await Promise.all([
    page.waitForEvent('load', { timeout: 60000 }),
    page.locator('#room-state-reload').click(),
  ]);
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 60000 });
  assert.notEqual(await page.evaluate(() => performance.timeOrigin), origin, 'Recovery reload is a new document');
  await page.locator('#mock-link').click();
}
// Scoped read-only native observation: store revision, raw rows, this attempt's
// operations and finalize receipts. No app code is called.
async function g1Store(page, attemptId) {
  const snapshot = await readAppRecordSnapshot(page);
  const operations = snapshot.rows
    .filter((row) => row.kind === 'operation')
    .map((row) => JSON.parse(row.text))
    .map((value) => (value?.payload ? value : value?.operation))
    .filter((operation) => operation?.payload?.attemptId === attemptId);
  const receipts = snapshot.documents.filter(
    (row) =>
      row.collection === 'kairo:record-host-commands' &&
      row.value?.type === 'host.assessment-finalize/2' &&
      row.value?.assessment?.attemptId === attemptId,
  );
  return { snapshot, operations, receipts };
}
// Ordered trace for write-before-reveal: when the transaction that first stores this item's
// mark completes, and when the sheet first enters the document. The wrapper forwards every
// put unchanged, so the app's promise semantics are untouched.
async function g1ArmRevealTrace(page, itemId) {
  await page.evaluate((itemId) => {
    if (window.__g1Trace) throw new Error('A reveal trace is already installed');
    const trace = { writes: [], sheetAt: null };
    const nativePut = window.IDBObjectStore.prototype.put;
    window.IDBObjectStore.prototype.put = function (...args) {
      const request = nativePut.apply(this, args);
      if (this.name === 'kairo_replication_rows' && args[0]?.kind === 'document') {
        const row = JSON.parse(args[0].text);
        const marked =
          row.collection === 'learner-record' &&
          row.value?.assessmentLibraryV2?.attempts?.some((attempt) =>
            attempt.answers?.some((answer) => answer.item?.id === itemId && answer.assistance));
        if (marked) {
          const entry = { putAt: performance.now(), completeAt: null };
          trace.writes.push(entry);
          this.transaction.addEventListener('complete', () => { entry.completeAt = performance.now(); });
        }
      }
      return request;
    };
    const observer = new MutationObserver(() => {
      if (trace.sheetAt === null && document.getElementById('exam-why-sheet')) trace.sheetAt = performance.now();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    trace.disarm = () => { window.IDBObjectStore.prototype.put = nativePut; observer.disconnect(); };
    window.__g1Trace = trace;
  }, itemId);
}
async function g1ReadRevealTrace(page) {
  return page.evaluate(() => {
    const trace = window.__g1Trace;
    trace.disarm();
    delete window.__g1Trace;
    return { writes: trace.writes.map(({ putAt, completeAt }) => ({ putAt, completeAt })), sheetAt: trace.sheetAt };
  });
}
// Whole-interval exposure watch for a refused write. Every node added anywhere in the
// document during the interval is inspected from its mutation record (so a subtree
// inserted and removed before any later query is still seen), and so is every text
// change. The observer only reads; pending records are drained before it stops.
async function g1ArmExposureWatch(page, rationale) {
  await page.evaluate((rationale) => {
    if (window.__g1Exposure) throw new Error('An exposure watch is already installed');
    const exposures = [];
    let records = 0;
    const exposing = (node) =>
      node?.nodeType === Node.TEXT_NODE
        ? (node.data || '').includes(rationale)
        : node?.nodeType === Node.ELEMENT_NODE &&
          (node.id === 'exam-why-sheet' || !!node.querySelector('#exam-why-sheet') ||
            (node.textContent || '').includes(rationale));
    const inspect = (list) => {
      for (const record of list) {
        records += 1;
        for (const node of record.addedNodes)
          if (exposing(node)) exposures.push({ how: 'added', node: node.id || node.nodeName, at: performance.now() });
        if (record.type === 'characterData' && exposing(record.target))
          exposures.push({ how: 'text', at: performance.now() });
      }
    };
    const observer = new MutationObserver(inspect);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    const initial = !!document.getElementById('exam-why-sheet') || document.body.innerText.includes(rationale);
    window.__g1Exposure = {
      stop() {
        inspect(observer.takeRecords());
        observer.disconnect();
        return { initial, records, exposures };
      },
    };
  }, rationale);
}
async function g1ReadExposureWatch(page) {
  return page.evaluate(() => {
    const result = window.__g1Exposure.stop();
    delete window.__g1Exposure;
    return result;
  });
}
// Each stage keeps its observations on success and on failure. Kinds let a judge separate
// an incomplete setup (inconclusive), an expected refusal (its own witness once its setup
// is satisfied) and behaviour before or after an accepted terminal.
function g1Stages(log) {
  return async (name, kind, body) => {
    const entry = { name, kind, status: 'running', observations: {} };
    log.stages.push(entry);
    try {
      await body(entry.observations);
      entry.status = 'passed';
      return entry.observations;
    } catch (error) {
      entry.status = 'failed';
      entry.error = String(error?.stack || error).slice(0, 2000);
      throw error;
    }
  };
}
async function assistedWhyCase(page, section, log) {
  const stage = g1Stages(log);
  const { items } = section;
  const byQ = Object.fromEntries(items.map((item) => [item.id.split(':').at(-1), item]));
  const attemptOf = (record) => selectAssessmentV2(record.assessmentLibraryV2).attempt;
  const answerOf = (record, q) => attemptOf(record).answers.find((row) => row.item.id === byQ[q].id);
  const lockOf = (record, q) => {
    const answer = answerOf(record, q);
    return { item: answer.item, response: answer.response, assistance: answer.assistance };
  };
  const atPrompt = (q) =>
    page.waitForFunction((prompt) => document.querySelector('.exam-prompt')?.textContent === prompt, byQ[q].prompt);
  const choicesLocked = () =>
    page.locator('[data-exam-option]').evaluateAll((nodes) => nodes.length > 0 && nodes.every((node) => node.disabled));
  const bodyText = () => page.locator('body').innerText();
  let baseline, attemptId;
  const kept = {};
  await stage('fixture-start', 'setup', async (o) => {
    baseline = await disk(page);
    assert.deepEqual(baseline.taken, []);
    await start(page, section, 'practice');
    attemptId = attemptOf(await disk(page)).attemptId;
    Object.assign(o, { attemptId, form: G1.form });
  });
  // Opens the why on the current item and checks the durable mark before anything else.
  const openWhyDurably = async (q, o) => {
    const before = answerOf(await disk(page), q);
    assert.equal(before.assistance, undefined);
    await page.locator('#exam-why').click();
    await page.locator('#exam-why-sheet').waitFor();
    await page.waitForFunction(() => document.activeElement?.id === 'exam-why-title');
    const marked = await pollRecord(page, (record) => !!answerOf(record, q).assistance);
    kept[q] = lockOf(marked, q);
    o.lock = kept[q];
    assert.deepEqual(kept[q].response, before.response);
    assert.deepEqual(kept[q].assistance.response, before.response);
    assert.equal(kept[q].assistance.kind, 'explanation');
    assert.deepEqual(kept[q].item, before.item);
    assert(attemptOf(marked).conditions.includes('assisted'));
    assert((await page.locator('#exam-why-sheet').innerText()).includes(byQ[q].rationale));
    assert(await choicesLocked());
  };
  for (const [index, row] of G1.schedule.entries()) {
    if (row.unreached) continue;
    await stage(`answer-${row.q}`, 'setup', async (o) => {
      if (index > 0) {
        if (G1.schedule[index - 1].unreached) {
          // q09 stays unreached: jump over it with the real question map
          await page.locator('.exam-question-map summary').click();
          await page.locator(`.exam-question-grid [data-exam-visit=${JSON.stringify(byQ[row.q].id)}]`).click();
        } else await page.locator('#exam-next').click();
        await atPrompt(row.q);
      }
      if (row.choice) {
        await page.locator(`[data-exam-option=${JSON.stringify(row.choice)}]`).click();
        await pollRecord(page, (record) => answerOf(record, row.q).response.optionId === row.choice);
      }
      if (row.flag) {
        await page.locator('#exam-flag').click();
        await pollRecord(page, (record) => answerOf(record, row.q).flagged === true);
      }
      o.response = row.choice ? { kind: 'selected', optionId: row.choice } : { kind: 'unanswered' };
      if (!row.why && row.choice) assert.equal(await page.locator('#exam-why').innerText(), 'Why? — See the explanation');
    });
    if (!row.why) continue;
    await stage(`door-${row.q}`, 'setup', async (o) => {
      // before the tap: the door states its cost; no rule, no sheet, no durable mark
      o.cost = await page.locator('#exam-why-cost').innerText();
      assert.match(o.cost, /locks this answer and marks it assisted/u);
      assert.equal(await page.locator('#exam-why-sheet').count(), 0);
      assert(!(await bodyText()).includes(byQ[row.q].rationale), `${row.q}: rule hidden before the durable mark`);
    });
    if (row.q === 'q05') {
      // A5 runs first on q05, before its paired A1: a refused assistance write discloses
      // nothing over the whole interval, then the host's own protected recovery.
      let protectedWindow = false;
      await stage('A5-refused-write', 'expected-refusal', async (o) => {
        const pre = await readAppRecordSnapshot(page);
        o.preRevision = pre.revision;
        o.preLock = lockOf(pre.record, 'q05');
        assert.equal(o.preLock.assistance, undefined);
        await armRecordWriteFailure(page, 'quota', { roots: ['assessmentLibraryV2'] });
        await g1ArmExposureWatch(page, byQ.q05.rationale);
        await page.locator('#exam-why').click();
        protectedWindow = o.protected = await g1Settle(page);
        o.watch = await g1ReadExposureWatch(page);
        o.fault = await clearRecordWriteFailure(page);
        const post = await readAppRecordSnapshot(page);
        o.postRevision = post.revision;
        o.postLock = lockOf(post.record, 'q05');
        assert(o.fault.fired > 0, 'setup: the assistance write fault fired (otherwise inconclusive)');
        assert.equal(o.watch.initial, false, 'setup: nothing was exposed before the tap');
        o.setupSatisfied = true;
        assert.deepEqual(o.watch.exposures, [], 'No sheet or rule appeared at any point while the write was refused');
        assert.equal(o.postRevision, o.preRevision);
        assert.deepEqual(o.postLock, o.preLock);
      });
      await stage('A5-recovery', 'setup', async (o) => {
        o.path = protectedWindow ? 'protected-reload' : 'same-document';
        if (protectedWindow) {
          await g1RecoverProtected(page);
          await atPrompt('q05');
        }
        const now = await disk(page);
        o.attemptId = attemptOf(now).attemptId;
        o.cursor = attemptOf(now).cursor.itemId;
        o.lock = lockOf(now, 'q05');
        assert.equal(o.attemptId, attemptId);
        assert.equal(o.cursor, byQ.q05.id);
        assert.deepEqual(o.lock.response, { kind: 'selected', optionId: 'choice-1' });
        assert.equal(o.lock.assistance, undefined);
        assert.equal(await page.locator('#exam-why-sheet').count(), 0);
        assert(!(await bodyText()).includes(byQ.q05.rationale));
      });
      await stage('A1-durable-before-reveal', 'behavior', async (o) => {
        await g1ArmRevealTrace(page, byQ.q05.id);
        const opening = openWhyDurably('q05', o);
        await opening.finally(async () => { o.trace = await g1ReadRevealTrace(page); });
        assert(o.trace.writes.length > 0 && o.trace.writes[0].completeAt !== null && o.trace.sheetAt !== null);
        assert(o.trace.writes[0].completeAt <= o.trace.sheetAt, 'The mark was durable before the sheet appeared');
      });
      await stage('A2-reopen-no-write', 'behavior', async (o) => {
        // no replication put at all (a forwarding counter), the same store revision and raw rows
        const s1 = await readAppRecordSnapshot(page);
        await page.evaluate(() => {
          const nativePut = window.IDBObjectStore.prototype.put;
          const counter = { puts: 0 };
          window.IDBObjectStore.prototype.put = function (...args) {
            if (this.name === 'kairo_replication_rows') counter.puts++;
            return nativePut.apply(this, args);
          };
          counter.disarm = () => { window.IDBObjectStore.prototype.put = nativePut; };
          window.__g1Puts = counter;
        });
        try {
          await page.locator('#exam-why-close').click();
          await page.waitForFunction(() => document.activeElement?.id === 'exam-why');
          o.doorAfterClose = await page.locator('#exam-why').innerText();
          await page.locator('#exam-why').click();
          await page.locator('#exam-why-sheet').waitFor();
        } finally {
          o.puts = await page.evaluate(() => {
            const counter = window.__g1Puts;
            counter.disarm();
            delete window.__g1Puts;
            return counter.puts;
          });
        }
        const s2 = await readAppRecordSnapshot(page);
        o.revisions = [s1.revision, s2.revision];
        o.rowsEqual = JSON.stringify(s2.rows) === JSON.stringify(s1.rows);
        assert.equal(o.doorAfterClose, 'See the explanation again');
        assert.equal(o.puts, 0, 'Reopening the why issued no durable write');
        assert.equal(s2.revision, s1.revision, 'Reopening the why must not write');
        assert(o.rowsEqual);
      });
      await stage('A3-ui-lock', 'behavior', async (o) => {
        // a forced tap on another choice changes nothing; flag and unflag stay legal
        await page.locator('[data-exam-option="choice-2"]').click({ force: true });
        await page.locator('#exam-flag').click();
        await pollRecord(page, (record) => answerOf(record, 'q05').flagged === true);
        await page.locator('#exam-flag').click();
        const unflagged = await pollRecord(page, (record) => answerOf(record, 'q05').flagged === false);
        o.lock = lockOf(unflagged, 'q05');
        assert.deepEqual(o.lock, kept.q05);
        assert(await choicesLocked());
      });
      continue;
    }
    await stage(`why-${row.q}`, 'behavior', (o) => openWhyDurably(row.q, o));
    if (row.q === 'q06')
      await stage('A3-reload-lock', 'behavior', async (o) => {
        // across a real reload: a new document, the same attempt, the lock and mark kept
        await g1Reload(page);
        await atPrompt('q06');
        await page.locator('#exam-why-locked').waitFor();
        assert.equal(await page.locator('#exam-why').innerText(), 'See the explanation again');
        assert(await choicesLocked());
        await page.locator('#exam-prev').click();
        await atPrompt('q05');
        await page.locator('#exam-why-locked').waitFor();
        assert(await choicesLocked());
        await page.locator('#exam-next').click();
        await atPrompt('q06');
        const reloaded = await disk(page);
        o.attemptId = attemptOf(reloaded).attemptId;
        o.locks = { q05: lockOf(reloaded, 'q05'), q06: lockOf(reloaded, 'q06') };
        assert.equal(o.attemptId, attemptId);
        for (const q of ['q05', 'q06']) assert.deepEqual(o.locks[q], kept[q]);
      });
  }
  await stage('pre-finish-state', 'setup', async (o) => {
    // q07 visited and unanswered; q09 really unreached; three marks exactly
    const pre = await disk(page);
    o.q07 = [answerOf(pre, 'q07').reached, answerOf(pre, 'q07').response.kind];
    o.q09 = [answerOf(pre, 'q09').reached, answerOf(pre, 'q09').response.kind];
    o.marked = attemptOf(pre).answers.filter((row) => row.assistance).map((row) => row.item.id);
    assert.equal(attemptOf(pre).mode, 'practice');
    assert.equal(attemptOf(pre).form.sha256, G1.form.sha256);
    assert.deepEqual(o.q07, [true, 'unanswered']);
    assert.deepEqual(o.q09, [false, 'unanswered']);
    assert.deepEqual(o.marked, G1.assisted.map((q) => byQ[q].id));
  });
  // F3 boundary: the first Finish is refused at the host (armed fault); the retry commits once.
  // This is abort-before-commit retry, not lost-acknowledgement duplicate confirmation.
  let finishProtected = false;
  await stage('F3-refused-finish', 'expected-refusal', async (o) => {
    const before = await g1Store(page, attemptId);
    o.operationsBefore = before.operations.length;
    await armRecordWriteFailure(page, 'quota', { roots: ['assessmentLibraryV2'] });
    await page.locator('#exam-finish-block').click();
    await page.locator('#exam-confirm-finish').click();
    finishProtected = o.protected = await g1Settle(page);
    o.fault = await clearRecordWriteFailure(page);
    const after = await g1Store(page, attemptId);
    o.status = attemptOf(after.snapshot.record).status;
    o.operationsAfter = after.operations.length;
    o.receipts = after.receipts.length;
    o.taken = after.snapshot.record.taken.length;
    assert(o.fault.fired > 0, 'setup: the finalization fault fired (otherwise inconclusive)');
    o.setupSatisfied = true;
    assert.equal(o.status, 'in-progress');
    assert.equal(o.taken, 0);
    assert.equal(o.operationsAfter, o.operationsBefore);
    assert.equal(o.receipts, 0);
  });
  await stage('F3-recovery', 'setup', async (o) => {
    o.path = finishProtected ? 'protected-reload' : 'same-document';
    if (finishProtected) {
      await g1RecoverProtected(page);
      await atPrompt('q12');
    }
  });
  let done, selected, followup;
  await stage('finish-accepted-terminal', 'accepted-terminal', async (o) => {
    await page.locator('#exam-finish-block').click();
    await page.locator('#exam-confirm-finish').click();
    await page.locator('.exam-score').waitFor();
    done = await pollRecord(page, (record) => record.assessmentLearning?.followups.some(
      (row) => row.attemptId === attemptId && row.evidence.length === items.length));
    selected = selectAssessmentV2(done.assessmentLibraryV2, attemptId);
    followup = done.assessmentLearning.followups.find((row) => row.attemptId === attemptId);
    o.status = selected.attempt.status;
    o.attemptRevisionId = selected.attempt.revisionId;
    o.score = [selected.score.correct, selected.score.incorrect, selected.score.unanswered, selected.score.notReached];
    o.followupStatus = followup.status;
    assert.equal(o.status, 'submitted');
    log.acceptedTerminal = true;
  });
  const logical = (row) => [
    followup.evidence.find((evidence) => evidence.id === row.assessmentRef?.evidenceId)?.item.id,
    row.t,
    row.t === 'word' ? row.id : row.label,
  ];
  await stage('F1-exact-enrollment', 'behavior', async (o) => {
    o.targets = done.taken.map(logical);
    assert.deepEqual([selected.score.correct, selected.score.incorrect, selected.score.unanswered, selected.score.notReached], [8, 2, 1, 1]);
    assert.equal(followup.status, 'complete');
    assert.equal(followup.attemptRevisionId, selected.attempt.revisionId);
    for (const evidence of followup.evidence) {
      const answer = selected.attempt.answers.find((row) => row.item.id === evidence.item.id);
      assert.deepEqual(evidence.response, answer.response);
      assert.deepEqual(evidence.assistance ?? null,
        answer.assistance ? { kind: answer.assistance.kind, at: answer.assistance.at } : null);
    }
    // exactly the six logical targets, each bound to its ledger item; nothing else, no duplicate
    assert.deepEqual([...o.targets].sort(), G1.targets.map(([q, t, key]) => [byQ[q].id, t, key]).sort());
    assert.equal(new Set(done.taken.map((row) => `${row.t}:${row.id}`)).size, G1.targets.length);
  });
  await stage('F2-no-invented-grade', 'behavior', async (o) => {
    // enrollment is not recall: started = completion; no grade, schedule or review log
    o.started = done.taken.map((row) => row.started === selected.attempt.endedAt);
    assert(done.taken.every((row) => row.by === 'assessment' && row.started === selected.attempt.endedAt));
    assert.deepEqual(done.srs, baseline.srs);
    assert.deepEqual(done.revlog, baseline.revlog);
    assert.equal(done.assessmentQuestionPractice?.responses?.length ?? 0, 0);
    assert.equal(done.assessmentQuestionPractice?.grades?.length ?? 0, 0);
  });
  let finalized;
  await stage('operations-and-receipt', 'behavior', async (o) => {
    // one result and one followup operation, one receipt; the wire flag on exactly q05/q06/q10
    finalized = await g1Store(page, attemptId);
    const resultOps = finalized.operations.filter((operation) => operation.payload.kind === 'assessment.result/2');
    const followupOps = finalized.operations.filter((operation) => operation.payload.kind === 'learning.followup/2');
    o.operations = finalized.operations.map((operation) => operation.opId);
    o.counts = [resultOps.length, followupOps.length, finalized.receipts.length];
    o.assistedWire = resultOps[0]?.payload.items.filter((row) => row.assisted === true).map((row) => row.item.id);
    assert.deepEqual(o.counts, [1, 1, 1]);
    assert.equal(resultOps[0].payload.attemptRevisionId, selected.attempt.revisionId);
    assert.deepEqual(o.assistedWire, G1.assisted.map((q) => byQ[q].id));
    assert(resultOps[0].payload.items.every((row) => row.assisted === undefined || row.assisted === true));
  });
  await stage('results-screen', 'behavior', async (o) => {
    // the counts reconcile and exactly three rows carry the mark
    o.score = await page.locator('.exam-score').textContent();
    o.partition = await page.locator('.exam-independence').textContent();
    o.markedRows = await page.locator('[data-exam-assisted="true"]').evaluateAll((nodes) => nodes.map((node) => node.dataset.examItem));
    assert.equal(o.score, `8 of ${items.length} correct, including 2 assisted`);
    assert.equal(o.partition, 'Independent 7 · Assisted 3 · Unanswered 2');
    assert.deepEqual(o.markedRows, G1.assisted.map((q) => byQ[q].id));
  });
  await stage('F3-post-terminal-reload', 'behavior', async (o) => {
    // a post-terminal reload is bookkeeping only: nothing added, nothing duplicated
    await g1Reload(page);
    await page.locator('.exam-score').waitFor();
    const again = await g1Store(page, attemptId);
    o.operations = again.operations.map((operation) => operation.opId);
    o.receipts = again.receipts.length;
    assert.deepEqual([...o.operations].sort(), finalized.operations.map((operation) => operation.opId).sort());
    assert.equal(o.receipts, 1);
    assert.deepEqual(again.snapshot.record.taken, done.taken);
    assert.deepEqual(again.snapshot.record.assessmentLearning.followups, done.assessmentLearning.followups);
  });
  await stage('F1-physical-ids', 'behavior', async (o) => {
    // placed last with the card back, so neither can hide an earlier accepted row. The derived
    // sentence and question cards carry the physical ids the published formulas give.
    o.derived = g1PhysicalIds(section.form);
    o.observed = Object.fromEntries(done.taken.filter((row) => ['sentence', 'question'].includes(row.t)).map((row) =>
      [followup.evidence.find((evidence) => evidence.id === row.assessmentRef?.evidenceId)?.item.id.split(':').at(-1), row.id]));
    assert.deepEqual(o.derived, G1.physical, 'setup: the restated formulas reproduce the frozen ids');
    assert.deepEqual(o.observed, G1.physical);
  });
  await stage('card-back-assisted-mark', 'behavior', async (o) => {
    // q10's question card came from an assisted answer: its back says so once the answer is checked.
    // The timed case's unassisted question card is the negative companion.
    const card = done.taken.find((row) => row.t === 'question');
    const plan = done.assessmentQuestionPractice.plans.find((row) => row.id === card.id);
    o.item = followup.evidence.find((row) => row.id === card.assessmentRef?.evidenceId)?.item.id;
    assert.equal(o.item, byQ.q10.id);
    await page.locator('#tray').click();
    await page.locator('.tray-line').first().waitFor();
    await page.getByRole('button', { name: `${card.label} — full entry`, exact: true }).click();
    await page.locator('#assessment-question-check').waitFor();
    o.before = await page.locator('.review-face .assessment-review-assisted').count();
    await page
      .locator(`input[name="assessment-question-answer"][value=${JSON.stringify(plan.item.response.answerOptionId)}]`)
      .check();
    await page.locator('#assessment-question-check').click();
    await page.locator('#assessment-question-feedback').waitFor();
    o.marks = await page.locator('.review-face .assessment-review-assisted').allInnerTexts();
    assert.equal(o.before, 0, 'No mark before the answer is checked');
    assert.deepEqual(o.marks, ['Assisted · you opened the explanation after answering']);
  });
  return { attemptId, kept, counts: { correct: 8, incorrect: 2, independent: 7, assisted: 3, unanswered: 2 } };
}

// ---- G1 F2, native pre-existing-target variant. A first practice sitting enrolls q01's word
// (点検, LITERALS.json) through an ordinary wrong answer. A second sitting answers q01 correctly
// and opens its why, so q01 is eligible only through its mark. That card already exists: its
// action is 'existing', and the card row keeps its first start and provenance, with no grade.
const G1_EXISTING_CASE = 'untimed-assisted-why-keeps-an-existing-card';
async function existingCardCase(page, section, log) {
  const stage = g1Stages(log);
  const byQ = Object.fromEntries(section.items.map((item) => [item.id.split(':').at(-1), item]));
  const answerOf = (record, attemptId, q) =>
    selectAssessmentV2(record.assessmentLibraryV2, attemptId).attempt.answers.find((row) => row.item.id === byQ[q].id);
  const cards = (record) => record.taken.filter((row) => row.t === 'word' && row.id === '点検');
  const atPrompt = (q) =>
    page.waitForFunction((prompt) => document.querySelector('.exam-prompt')?.textContent === prompt, byQ[q].prompt);
  // finish one sitting: jump to the last question with the real map, then Finish and confirm
  const finishFromMap = async () => {
    await page.locator('.exam-question-map summary').click();
    await page.locator(`.exam-question-grid [data-exam-visit=${JSON.stringify(byQ.q12.id)}]`).click();
    await atPrompt('q12');
    await page.locator('#exam-finish-block').click();
    await page.locator('#exam-confirm-finish').click();
    await page.locator('.exam-score').waitFor();
  };
  let baseline, first, firstCards, second;
  await stage('first-sitting-enrolls-the-word', 'setup', async (o) => {
    baseline = await disk(page);
    assert.deepEqual(baseline.taken, []);
    await start(page, section, 'practice');
    const attemptId = selectAssessmentV2((await disk(page)).assessmentLibraryV2).attempt.attemptId;
    await page.locator('[data-exam-option="choice-2"]').click();
    await pollRecord(page, (record) => answerOf(record, attemptId, 'q01').response.optionId === 'choice-2');
    await finishFromMap();
    const done = await pollRecord(page, (record) =>
      record.assessmentLearning?.followups.some((row) => row.attemptId === attemptId));
    const followup = done.assessmentLearning.followups.find((row) => row.attemptId === attemptId);
    first = { attemptId, endedAt: selectAssessmentV2(done.assessmentLibraryV2, attemptId).attempt.endedAt };
    firstCards = cards(done);
    o.first = { attemptId, actions: followup.actions.map((row) => [row.target.t, row.target.id, row.status]), cards: firstCards };
    assert.deepEqual(o.first.actions, [['word', '点検', 'added']]);
    assert.equal(firstCards.length, 1);
    assert.equal(firstCards[0].started, first.endedAt);
  });
  await stage('second-sitting-marks-the-same-item', 'setup', async (o) => {
    await page.locator('#exam-done').click();
    await selectLevel(page, section.pin.level);
    await page.locator(`[data-exam-start=${JSON.stringify(section.entry.id)}]`).click();
    await page.locator('#exam-practice-start').click();
    await atPrompt('q01');
    const started = await pollRecord(page, (record) => record.assessmentLibraryV2.attempts.length === 2 &&
      selectAssessmentV2(record.assessmentLibraryV2)?.attempt.status === 'in-progress');
    const attemptId = selectAssessmentV2(started.assessmentLibraryV2).attempt.attemptId;
    const key = byQ.q01.response.answerOptionId;
    await page.locator(`[data-exam-option=${JSON.stringify(key)}]`).click();
    await pollRecord(page, (record) => answerOf(record, attemptId, 'q01').response.optionId === key);
    await page.locator('#exam-why').click();
    await page.locator('#exam-why-sheet').waitFor();
    const marked = await pollRecord(page, (record) => !!answerOf(record, attemptId, 'q01').assistance);
    const mark = answerOf(marked, attemptId, 'q01').assistance;
    second = { attemptId, mark: { kind: mark.kind, at: mark.at } };
    o.second = second;
    assert.notEqual(attemptId, first.attemptId);
    assert.equal(mark.kind, 'explanation');
    await page.locator('#exam-why-close').click();
  });
  let done, selected, followup;
  await stage('second-finish-accepted-terminal', 'accepted-terminal', async (o) => {
    await finishFromMap();
    done = await pollRecord(page, (record) =>
      record.assessmentLearning?.followups.some((row) => row.attemptId === second.attemptId));
    selected = selectAssessmentV2(done.assessmentLibraryV2, second.attemptId);
    followup = done.assessmentLearning.followups.find((row) => row.attemptId === second.attemptId);
    o.status = selected.attempt.status;
    o.followupStatus = followup.status;
    assert.equal(o.status, 'submitted');
    log.acceptedTerminal = true;
  });
  await stage('F2-existing-card-kept', 'behavior', async (o) => {
    const evidence = followup.evidence.find((row) => row.item.id === byQ.q01.id);
    o.evidence = { outcome: evidence.outcome, assistance: evidence.assistance ?? null };
    o.actions = followup.actions.map((row) => [row.target.t, row.target.id, row.status]);
    o.cards = cards(done);
    assert.deepEqual(o.evidence, { outcome: 'correct', assistance: second.mark });
    assert.deepEqual(o.actions, [['word', '点検', 'existing']]);
    // the card keeps its first start and provenance: nothing re-added, re-dated or graded
    assert.deepEqual(o.cards, firstCards);
    assert.notEqual(o.cards[0].started, selected.attempt.endedAt);
    assert.equal(done.taken.length, 1);
    assert.deepEqual(done.srs, baseline.srs);
    assert.deepEqual(done.revlog, baseline.revlog);
  });
  await stage('operations-carry-the-mark', 'behavior', async (o) => {
    const store = await g1Store(page, second.attemptId);
    const results = store.operations.filter((operation) => operation.payload.kind === 'assessment.result/2');
    o.assistedWire = results[0]?.payload.items.filter((row) => row.assisted === true).map((row) => row.item.id);
    assert.equal(results.length, 1);
    assert.deepEqual(o.assistedWire, [byQ.q01.id]);
  });
  return { first: first.attemptId, second: second.attemptId, mark: second.mark };
}

const dojoPracticeLabel = `${sections.length} practice set${sections.length === 1 ? '' : 's'} · mock tests in preparation`;
try {
  for (const engine of engines) {
    for (const section of sections) {
    const { entry, pin, form, formPath, deliveryPath, items, suffix } = section;
    await run(engine, `public-catalog-and-dojo-practice-labels${suffix}`, async (page) => {
      await page.locator('#chrome-dojo').click();
      const door = page.locator('[data-study-door="mock"]');
      await page.waitForFunction(
        (label) =>
          document.querySelector('[data-study-door="mock"] .study-door-sub')?.textContent ===
          label,
        dojoPracticeLabel,
      );
      const dojoLabel = await door.locator('.study-door-sub').textContent();
      assert.equal(dojoLabel, dojoPracticeLabel);
      assert.match(await door.locator('.study-door-t').innerText(), /JLPT tests & practice/iu);
      await fit(page, 'Dojo practice count');
      await page.screenshot({
        path: resolve(evidence, `${engine}${suffix}-written-dojo-320.png`),
        fullPage: true,
      });
      await door.click();
      await selectLevel(page, pin.level);
      await page.locator(`[data-exam-start=${JSON.stringify(entry.id)}]`).waitFor();
      assert.equal(
        await page.locator('.assessment-room > h1').textContent(),
        'JLPT tests & practice',
      );
      assert.match(await page.locator('.exam-section-heading').innerText(), /Practice by skill/u);
      const written = page.locator(`[data-exam-form=${JSON.stringify(entry.id)}]`);
      assert.equal(await written.locator('h2').textContent(), entry.titleEn);
      assert.equal(
        await written.locator('.exam-skills').textContent(),
        'Vocabulary · Grammar · Reading',
      );
      assert.match(await written.locator('.exam-status').innerText(), /without listening/u);
      assert.equal(await page.locator('[data-exam-start]').count(), 1);
      const pending = catalog.entries.find((row) => row.level === pin.level && row.mode === 'short');
      if (pending)
        assert.match(
          await page
            .locator(`[data-exam-form=${JSON.stringify(pending.id)}] .exam-status`)
            .innerText(),
          /Question and audio review in progress/u,
        );
      await fit(page, 'Catalog practice heading');
      await page.screenshot({
        path: resolve(evidence, `${engine}${suffix}-written-catalog-320.png`),
        fullPage: true,
      });
      const record = await disk(page);
      assert.equal(record.assessmentLibraryV2?.attempts.length || 0, 0);
      assert.deepEqual(record.taken, []);
      assert.deepEqual(record.srs, {});
      assert.deepEqual(record.revlog, []);
      await written.locator('[data-exam-start]').click();
      await page.locator('#exam-confirm-start').click();
      await page.locator('.exam-prompt').waitFor();
      const choiceMetrics = await page.locator('[data-exam-option]').evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect(),
            style = getComputedStyle(node);
          return { fontSize: parseFloat(style.fontSize), width: box.width, height: box.height };
        }),
      );
      assert.equal(choiceMetrics.length, 4);
      assert(
        choiceMetrics.every((row) => row.fontSize >= 16 && row.height >= 44),
        `Readable, touch-sized choices: ${JSON.stringify(choiceMetrics)}`,
      );
      await fit(page, 'Readable written choices');
      await page.screenshot({
        path: resolve(evidence, `${engine}${suffix}-written-question-320.png`),
        fullPage: true,
      });
      await wrongAnswer(page, items[0]);
      await page.locator('#exam-next').click();
      await page.waitForFunction(
        (prompt) => document.querySelector('.exam-prompt')?.textContent === prompt,
        items[1].prompt,
      );
      await fit(page, 'Next written question');
      const advanced = selectAssessmentV2((await disk(page)).assessmentLibraryV2);
      assert.equal(advanced.attempt.cursor.itemId, items[1].id);
      assert.equal(
        advanced.attempt.answers.find((row) => row.item.id === items[0].id).response.kind,
        'selected',
      );
      return {
        dojoLabel,
        catalogTitle: 'JLPT tests & practice',
        readyWrittenSections: sections.length,
        readyMockTests: 0,
        choiceMetrics,
        nextQuestion: advanced.attempt.cursor.itemId,
      };
    });
    await run(engine, `timed-written-completion-to-learn-review-and-sensei${suffix}`, async (page) => {
      const baseline = await disk(page);
      assert.deepEqual(baseline.taken, []);
      await start(page, section, 'timed', `${engine}${suffix}`);
      for (let index = 0; index < items.length; index++) {
        await wrongAnswer(page, items[index]);
        // non-vacuous: the answer is committed, which is exactly when practice shows the door
        assert.equal(await page.locator('#exam-why').count(), 0, 'A committed timed answer has no why-door');
        await fit(page, `Question ${index + 1}`);
        if (index < items.length - 1) {
          await page.locator('#exam-next').click();
          await page.waitForFunction(
            (prompt) => document.querySelector('.exam-prompt')?.textContent === prompt,
            items[index + 1].prompt,
          );
        }
      }
      await page.locator('#exam-finish-block').click();
      await page.locator('#exam-confirm-finish').click();
      await page.locator('.exam-score').waitFor();
      assert.equal(
        await page.locator('.exam-score').textContent(),
        `0 of ${items.length} correct`,
      );
      assert.match(
        await page.locator('.exam-score-note').textContent(),
        /not an official JLPT score or pass prediction/u,
      );
      assert.equal(await page.locator('.exam-results-skills p').count(), 3);
      const completed = await pollRecord(page, (row) =>
        row.assessmentLearning?.followups.some((followup) => followup.evidence.length === items.length),
      );
      const selected = selectAssessmentV2(completed.assessmentLibraryV2);
      assert.equal(selected.attempt.status, 'submitted');
      assert.equal(selected.score.incorrect, items.length);
      assert.equal(selected.score.correct, 0);
      const followup = completed.assessmentLearning.followups.find(
        (row) => row.attemptId === selected.attempt.attemptId,
      );
      assert.equal(
        followup.status,
        'complete',
        'Every incorrect item has an admitted review target.',
      );
      assert(followup.evidence.every((row) => row.outcome === 'incorrect'));
      for (const row of followup.evidence)
        assert(
          followup.actions.some((action) => action.evidenceId === row.id),
          `Review target for ${row.item.id}`,
        );
      for (const action of followup.actions) {
        assert(['added', 'existing'].includes(action.status));
        assert(
          completed.taken.some(
            (row) =>
              row.t === action.target.t &&
              row.id === action.target.id &&
              Number.isFinite(row.started),
          ),
        );
      }
      assert.deepEqual(
        completed.srs,
        baseline.srs,
        'Enrollment must not manufacture an FSRS grade.',
      );
      assert.deepEqual(completed.revlog, baseline.revlog);
      assert.equal(completed.assessmentQuestionPractice.responses.length, 0);
      assert.equal(completed.assessmentQuestionPractice.grades.length, 0);
      const summary = assessmentLearningSummary(completed.assessmentLearning);
      assert.equal(summary.completed, 1);
      assert.equal(summary.pending, 0);
      for (const skill of ['vocabulary', 'grammar', 'reading'])
        assert.equal(summary.skills[skill].incorrect, pin.skillCounts[skill]);
      assert.equal(summary.skills.listening, undefined);
      await fit(page, 'Written results');
      await page.screenshot({
        path: resolve(evidence, `${engine}${suffix}-written-results-320.png`),
        fullPage: true,
      });
      await page.locator('#exam-sensei').click();
      await page.locator('.teacher-source-quote').waitFor();
      const teacher = await pollRecord(page, (row) => !!row.teacherContexts?.activeRef);
      const context = teacher.teacherContexts.entries.find(
        (row) => row.id === teacher.teacherContexts.activeRef,
      );
      assert.equal(context.sourceKind, 'assessment-item');
      assert.equal(JSON.parse(context.sourceId).attemptId, selected.attempt.attemptId);
      assert(context.quote.includes(items[0].prompt));
      assert.equal(await page.locator('.teacher-source-quote').textContent(), context.quote);
      const senseiVisibleCredit = await page.locator('.teacher-source-credit').innerText();
      const senseiSelectedOption = await page
        .locator('#teacher-context-select option:checked')
        .textContent();
      assert.equal(context.title, form.title, 'The exact source-bound title remains in storage.');
      assert(!/editorial review/iu.test(senseiVisibleCredit));
      assert(!/editorial review/iu.test(senseiSelectedOption));
      assert.match(senseiVisibleCredit, /JLPT practice question/u);
      await fit(page, 'Sensei question context');
      await page.screenshot({
        path: resolve(evidence, `${engine}${suffix}-written-sensei-320.png`),
        fullPage: true,
      });
      await page.locator('#tray').click();
      await page.locator('.tray-line').first().waitFor();
      assert.equal(await page.locator('#review-start').isEnabled(), true);
      const question = completed.taken.find((row) => row.t === 'question');
      assert(question, 'Reading errors produce question review cards.');
      const plan = completed.assessmentQuestionPractice.plans.find((row) => row.id === question.id);
      assert(plan);
      await page
        .getByRole('button', { name: `${question.label} — full entry`, exact: true })
        .click();
      await page.locator('#assessment-question-check').waitFor();
      assert.equal(
        await page.locator('.assessment-question-prompt').textContent(),
        plan.item.prompt,
      );
      assert.equal(await page.locator('.assessment-question-rationale').count(), 0);
      await page
        .locator(
          `input[name="assessment-question-answer"][value=${JSON.stringify(plan.item.response.answerOptionId)}]`,
        )
        .check();
      await page.locator('#assessment-question-check').click();
      await page.locator('#assessment-question-feedback').waitFor();
      // negative companion of the G1 card-back stage: an unassisted question card carries no mark
      assert.equal(await page.locator('.review-face .assessment-review-assisted').count(), 0,
        'An unassisted card has no assisted mark');
      const answered = await disk(page);
      assert.equal(answered.assessmentQuestionPractice.responses.length, 1);
      assert.deepEqual(answered.revlog, baseline.revlog);
      await page.locator('.grade.g-good').click();
      const reviewed = await pollRecord(
        page,
        (row) => row.revlog.length === baseline.revlog.length + 1,
      );
      assert.equal(reviewed.assessmentQuestionPractice.grades.length, 1);
      assert.equal(reviewed.revlog.at(-1)[1], `question:${question.id}`);
      assert.equal(Object.keys(reviewed.srs).length, 1);
      const retained = JSON.stringify(reviewed.assessmentLibraryV2);
      await page.reload();
      await page.waitForFunction(() => document.body.dataset.ready === '1');
      const reloaded = await disk(page);
      assert.equal(JSON.stringify(reloaded.assessmentLibraryV2), retained);
      assert.deepEqual(reloaded.revlog, reviewed.revlog);
      assert.deepEqual(reloaded.taken, reviewed.taken);
      assert.equal(assessmentLearningSummary(reloaded.assessmentLearning).completed, 1);
      return {
        attemptId: selected.attempt.attemptId,
        result: `0/${items.length}`,
        cards: completed.taken.length,
        targetTypes: [...new Set(completed.taken.map((row) => row.t))],
        evidence: summary,
        senseiContextTitle: context.title,
        senseiVisibleCredit,
        senseiSelectedOption,
        enrollmentReviews: completed.revlog.length,
        laterQuestionReviews: reviewed.revlog.length,
      };
    });
    await run(engine, `untimed-written-offline-reload-answer-and-stop${suffix}`, async (page) => {
      const baseline = await disk(page);
      await start(page, section, 'practice');
      const firstChoice = await wrongAnswer(page, items[0]);
      await pollNativeState(
        () => page.evaluate(async () =>
          (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated'),
        { timeoutMs: 60000, description: 'service-worker activation' },
      ).catch(error => {
        const failure = new Error(`Failed setup: service-worker activation (${String(error?.message ?? error)})`, { cause: error });
        failure.name = 'FixtureSetupError';
        throw failure;
      });
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {
        timeout: 60000,
      });
      const cached = await page.evaluate(
        async (paths) => {
          const result = {};
          for (const path of paths) {
            const response = await caches.match(new URL(path, location.href));
            if (!response) throw new Error(`Missing offline bytes: ${path}`);
            const bytes = await response.arrayBuffer();
            result[path] = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
              .map((value) => value.toString(16).padStart(2, '0'))
              .join('');
          }
          return result;
        },
        [formPath, deliveryPath, 'corridor.js'],
      );
      for (const [path, digest] of Object.entries(cached)) assert.equal(digest, fileHashes[path]);
      // WebKit's network emulation can reject navigation before the service
      // worker runs. Closing this owned server tests real origin loss in both
      // browsers, with zero successful responses asserted below.
      await new Promise((done) => server.close(done));
      const servedAtDisconnect = served;
      await page.reload();
      await page.waitForFunction(() => document.body.dataset.ready === '1', null, {
        timeout: 60000,
      });
      await page.locator('#mock-link').click();
      await page.locator('.exam-prompt').waitFor();
      assert.equal(await page.locator('#exam-timer').textContent(), 'Untimed');
      assert.equal(
        await page
          .locator(`[data-exam-option=${JSON.stringify(firstChoice)}]`)
          .getAttribute('aria-pressed'),
        'true',
      );
      await page.locator('#exam-next').click();
      await page.waitForFunction(
        (prompt) => document.querySelector('.exam-prompt')?.textContent === prompt,
        items[1].prompt,
      );
      await wrongAnswer(page, items[1]);
      await page.locator('#exam-stop').click();
      await page.locator('#exam-confirm-stop').click();
      await page.getByRole('heading', { name: 'Attempt stopped', exact: true }).waitFor();
      const stopped = await pollRecord(page, (row) =>
        row.assessmentLibraryV2?.attempts.some((attempt) => attempt.status === 'abandoned'),
      );
      assert.deepEqual(stopped.taken, baseline.taken);
      assert.deepEqual(stopped.srs, baseline.srs);
      assert.deepEqual(stopped.revlog, baseline.revlog);
      const followup = stopped.assessmentLearning.followups[0];
      assert.equal(followup.status, 'stopped');
      assert.deepEqual(followup.evidence, []);
      assert.deepEqual(followup.actions, []);
      const summary = assessmentLearningSummary(stopped.assessmentLearning);
      assert.equal(summary.completed, 0);
      assert.equal(summary.stopped, 1);
      assert.deepEqual(summary.skills, {});
      assert.equal(
        served,
        servedAtDisconnect,
        'Offline navigation and answer used no server responses.',
      );
      await fit(page, 'Offline stopped result');
      await page.screenshot({
        path: resolve(evidence, `${engine}${suffix}-written-offline-stopped-320.png`),
        fullPage: true,
      });
      return {
        cached,
        serverDisconnected: true,
        responsesAfterDisconnect: served - servedAtDisconnect,
        retainedAnswers: selectAssessmentV2(stopped.assessmentLibraryV2).attempt.answers.filter(
          (row) => row.response.kind !== 'unanswered',
        ).length,
        evidence: summary,
      };
    });
    // G1: the literal ledger belongs to one pinned form; any other section is skipped visibly.
    if (form.id === G1.form.id && form.sha256 === G1.form.sha256) {
      await run(engine, `${G1_CASE}${suffix}`, (page, _context, log) => assistedWhyCase(page, section, log));
      await run(engine, `${G1_EXISTING_CASE}${suffix}`, (page, _context, log) => existingCardCase(page, section, log));
    } else {
      g1Skipped.push({ engine, formId: form.id, formSha256: form.sha256 });
      console.log(`SKIP ${engine}/assisted-why${suffix}: ${form.id} is not the pinned G1 ledger form`);
    }
    }
  }
} finally {
  if (server.listening) await new Promise((done) => server.close(done));
  for (const [path, digest] of Object.entries(fileHashes))
    assert.equal(sha(readFileSync(resolve(site, path))), digest);
  writeFileSync(
    resolve(evidence, 'written-section-results.json'),
    JSON.stringify(
      {
        format: 'kairo-public-written-section-walk',
        version: 1,
        artifactSha256: identity.artifactSha256,
        sourceAssetSha256: identity.sourceAssetSha256,
        formSha256: sections[0].entry.formSha256,
        deliverySha256: sections[0].entry.deliverySha256,
        sections: sections.map(({ pin, entry }) => ({
          level: pin.level,
          formSha256: entry.formSha256,
          deliverySha256: entry.deliverySha256,
        })),
        publicFiles: fileHashes,
        // Declared, not implied: what this verifier adds to the unchanged staged runtime.
        instrumentation: {
          app: 'unchanged staged runtime and public content',
          observation: 'read-only IndexedDB reads (disk(), record-test-support readAppRecordSnapshot)',
          network: 'the untimed offline case closes the owned server to remove the origin',
          assistedWhy: [
            'record-test-support armRecordWriteFailure: a synthetic QuotaExceededError on host command-receipt puts (A5 and F3), cleared afterwards; its fired count is recorded',
            'forwarding IDBObjectStore.prototype.put wrappers: the A1 reveal trace and the A2 put counter (the native put is called unchanged)',
            'MutationObserver on the document: the A1 sheet-insertion time and the A5 whole-interval exposure watch (read-only)',
          ],
        },
        verifierSha256: sha(readFileSync(new URL(import.meta.url))),
        testSupportSha256: sha(readFileSync(new URL('./record-test-support.mjs', import.meta.url))),
        caseInventory: {
          planned,
          observed: results.map(({ engine, name, passed }) => ({ engine, name, passed })),
        },
        // A G1 claim needs the pinned assisted case to have run and passed on every engine.
        assistedWhy: {
          requiredCase: G1_CASE,
          runs: results.filter((row) => row.name.startsWith(G1_CASE)).map(({ engine, name, passed, acceptedTerminal, failedStage }) =>
            ({ engine, name, passed, acceptedTerminal, failedStage: failedStage?.name ?? null, failedKind: failedStage?.kind ?? null })),
          skipped: g1Skipped,
          claimable: engines.every((engine) =>
            results.some((row) => row.engine === engine && row.name.startsWith(G1_CASE) && row.passed)),
        },
        // The native pre-existing-target variant (F2), claimed separately on the same terms.
        assistedWhyExistingCard: {
          requiredCase: G1_EXISTING_CASE,
          runs: results.filter((row) => row.name.startsWith(G1_EXISTING_CASE)).map(({ engine, name, passed, acceptedTerminal, failedStage }) =>
            ({ engine, name, passed, acceptedTerminal, failedStage: failedStage?.name ?? null, failedKind: failedStage?.kind ?? null })),
          claimable: engines.every((engine) =>
            results.some((row) => row.engine === engine && row.name.startsWith(G1_EXISTING_CASE) && row.passed)),
        },
        results,
        passed: results.length > 0 && results.every((row) => row.passed),
      },
      null,
      2,
    ) + '\n',
  );
}
assert(
  results.length > 0 && results.every((row) => row.passed),
  'Public written-section journey failed.',
);
