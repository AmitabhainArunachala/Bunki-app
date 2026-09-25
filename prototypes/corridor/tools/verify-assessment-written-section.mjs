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
const entry = catalog.entries.find(
  (row) => row.id === 'kairo-original-jlpt-n2-short-01:written-review',
);
assert(
  entry?.availability.ready && entry.review.status === 'ai-reviewed',
  'The public written pack is admitted.',
);
assert.equal(entry.mode, 'section');
assert.equal(entry.questionCount, 12);
assert.equal(entry.durationMinutes, 15);
assert.deepEqual(entry.skillCounts, { vocabulary: 4, grammar: 4, reading: 4, listening: 0 });
assert.equal(catalog.entries.filter((row) => row.availability.ready).length, 1);
assert.equal(
  catalog.entries.filter(
    (row) => !row.availability.ready && ['short', 'medium', 'full'].includes(row.mode),
  ).length,
  3,
);
const formPath = `data/assessment/${entry.formPath}`;
const deliveryPath = `data/assessment/${entry.deliveryPath}`;
const form = JSON.parse(readFileSync(resolve(site, formPath), 'utf8'));
const delivery = JSON.parse(readFileSync(resolve(site, deliveryPath), 'utf8'));
const core = await import(pathToFileURL(resolve(site, 'modules/assessment-core.mjs')));
const recordCore = await import(pathToFileURL(resolve(site, 'modules/record-core.mjs')));
const { selectAssessmentV2 } = await import(
  pathToFileURL(resolve(site, 'assessment-v2-controller.mjs'))
);
const { assessmentLearningSummary } = await import(
  pathToFileURL(resolve(site, 'assessment-learning.mjs'))
);
assert.equal(core.parseFormVersion(form).sha256, entry.formSha256);
assert.equal(recordCore.encodeLocalJson(delivery).sha256, entry.deliverySha256);
assert.equal(form.scope, 'section-practice');
assert.equal(form.items.length, 12);
assert.equal(form.media.length, 0);
assert.deepEqual(delivery.assets, []);
assert.deepEqual(delivery.units, []);
assert.equal(
  form.timingBlocks.reduce((sum, block) => sum + block.durationMs, 0),
  900000,
);
const items = form.timingBlocks.flatMap((block) =>
  block.sectionIds.flatMap((sectionId) =>
    form.sections
      .find((section) => section.id === sectionId)
      .itemIds.map((itemId) => form.items.find((item) => item.id === itemId)),
  ),
);
assert.equal(new Set(items.map((item) => item.id)).size, 12);
assert(items.every((item) => item.response.kind === 'selected' && item.media.length === 0));
const publicFiles = [catalogPath, formPath, deliveryPath, 'corridor.js', 'assessment-view.mjs'];
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
async function catalogDoor(page, screenshotPrefix = null) {
  await page.locator('#mock-link').click();
  const card = page
    .locator('[data-exam-form]')
    .filter({ has: page.locator(`[data-exam-start=${JSON.stringify(entry.id)}]`) });
  await card.waitFor();
  assert.match(await page.locator('.exam-section-heading').innerText(), /Practice by skill/u);
  assert.equal(await card.locator('h2').textContent(), entry.titleEn);
  assert.match(await card.locator('.exam-form-meta').innerText(), /12 questions · about 15 min/u);
  assert.equal(await card.locator('.exam-skills').textContent(), 'Vocabulary · Grammar · Reading');
  assert.match(await card.locator('.exam-status').innerText(), /without listening/u);
  for (const mode of ['medium', 'full', 'short']) {
    await page.locator(`[data-exam-length="${mode}"]`).click();
    const pending = catalog.entries.find((row) => row.mode === mode);
    assert.equal(await page.locator(`[data-exam-start=${JSON.stringify(pending.id)}]`).count(), 0);
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
async function start(page, mode, screenshotPrefix = null) {
  await catalogDoor(page, screenshotPrefix);
  await page.locator(mode === 'timed' ? '#exam-confirm-start' : '#exam-practice-start').click();
  await page.locator('.exam-prompt').waitFor();
  assert.equal(await page.locator('.exam-heading').textContent(), 'N2 practice');
  assert.equal(await page.locator('.exam-prompt').textContent(), items[0].prompt);
  assert.match(await page.locator('.exam-progress').innerText(), /Question 1 of 12/u);
  assert.equal(await page.locator('audio, #exam-audio-play, #exam-example-audio-play').count(), 0);
  if (mode === 'practice') assert.equal(await page.locator('#exam-timer').textContent(), 'Untimed');
  else assert.match(await page.locator('#exam-timer').textContent(), /^(15:00|14:\d\d)$/u);
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
async function run(engine, name, action) {
  if (filter && !name.includes(filter)) return;
  if (!server.listening) await new Promise((done) => server.listen(port, '127.0.0.1', done));
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
    const observations = await action(page, context);
    assert.deepEqual(errors, [], 'No unhandled app errors');
    assert.deepEqual(external, [], 'No external service was contacted');
    results.push({
      engine,
      name,
      passed: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      observations,
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
    });
    await page
      .screenshot({ path: resolve(evidence, `${engine}-${name}-failure.png`), fullPage: true })
      .catch(() => {});
    console.error(`FAIL ${engine}/${name}: ${String(error)}`);
  } finally {
    await context.close();
  }
}

try {
  for (const engine of engines) {
    await run(engine, 'public-catalog-and-dojo-practice-labels', async (page) => {
      await page.locator('#chrome-dojo').click();
      const door = page.locator('[data-study-door="mock"]');
      await page.waitForFunction(
        () =>
          document.querySelector('[data-study-door="mock"] .study-door-sub')?.textContent ===
          '1 practice set · mock tests in preparation',
      );
      const dojoLabel = await door.locator('.study-door-sub').textContent();
      assert.equal(dojoLabel, '1 practice set · mock tests in preparation');
      assert.match(await door.locator('.study-door-t').innerText(), /JLPT tests & practice/iu);
      await fit(page, 'Dojo practice count');
      await page.screenshot({
        path: resolve(evidence, `${engine}-written-dojo-320.png`),
        fullPage: true,
      });
      await door.click();
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
      const pending = catalog.entries.find((row) => row.mode === 'short');
      assert.match(
        await page
          .locator(`[data-exam-form=${JSON.stringify(pending.id)}] .exam-status`)
          .innerText(),
        /Question and audio review in progress/u,
      );
      await fit(page, 'Catalog practice heading');
      await page.screenshot({
        path: resolve(evidence, `${engine}-written-catalog-320.png`),
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
        path: resolve(evidence, `${engine}-written-question-320.png`),
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
        readyWrittenSections: 1,
        readyMockTests: 0,
        choiceMetrics,
        nextQuestion: advanced.attempt.cursor.itemId,
      };
    });
    await run(engine, 'timed-written-completion-to-learn-review-and-sensei', async (page) => {
      const baseline = await disk(page);
      assert.deepEqual(baseline.taken, []);
      await start(page, 'timed', engine);
      for (let index = 0; index < items.length; index++) {
        await wrongAnswer(page, items[index]);
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
      assert.equal(await page.locator('.exam-score').textContent(), '0 of 12 correct');
      assert.match(
        await page.locator('.exam-score-note').textContent(),
        /not an official JLPT score or pass prediction/u,
      );
      assert.equal(await page.locator('.exam-results-skills p').count(), 3);
      const completed = await pollRecord(page, (row) =>
        row.assessmentLearning?.followups.some((followup) => followup.evidence.length === 12),
      );
      const selected = selectAssessmentV2(completed.assessmentLibraryV2);
      assert.equal(selected.attempt.status, 'submitted');
      assert.equal(selected.score.incorrect, 12);
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
        assert.equal(summary.skills[skill].incorrect, 4);
      assert.equal(summary.skills.listening, undefined);
      await fit(page, 'Written results');
      await page.screenshot({
        path: resolve(evidence, `${engine}-written-results-320.png`),
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
        path: resolve(evidence, `${engine}-written-sensei-320.png`),
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
        result: '0/12',
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
    await run(engine, 'untimed-written-offline-reload-answer-and-stop', async (page) => {
      const baseline = await disk(page);
      await start(page, 'practice');
      const firstChoice = await wrongAnswer(page, items[0]);
      await page.waitForFunction(
        async () =>
          (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated',
        null,
        { timeout: 60000 },
      );
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
        path: resolve(evidence, `${engine}-written-offline-stopped-320.png`),
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
        formSha256: entry.formSha256,
        deliverySha256: entry.deliverySha256,
        publicFiles: fileHashes,
        instrumentation:
          'none; unchanged staged runtime and public content; independent read-only IDB observation',
        verifierSha256: sha(readFileSync(new URL(import.meta.url))),
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
