/**
 * Bounded verification of the shipped short-practice data and browser room.
 *
 * Two halves. The first reads every shipped paper as DATA and proves the
 * schema, attribution fields and dictionary subjects. This is not editorial
 * review of Japanese correctness, a licence grant, or full-exam acceptance.
 * The second drives the room in real Chromium and checks
 * the four laws of the room itself:
 *
 *   · full answers are saved against the exact question version without
 *     measured legacy grades, FSRS state, deck rows or review rows;
 *   · completed history remains accessible after Done and reload;
 *   · 取り上げる mints only on the learner's explicit press, and only words
 *     the dictionary confirms;
 *   · no string the room can render ever claims a JLPT pass.
 *
 * Usage: node verify-mock.mjs
 */

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium } from 'playwright-core';
import { resolveCorridorSite, resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { readAppRecord, waitForAppRecord } from './record-test-support.mjs';

const CORRIDOR_DIR = resolveCorridorSite();
const DATA_DIR = resolve(CORRIDOR_DIR, 'data');
const MOCK_DIR = resolve(DATA_DIR, 'mock');
const EVIDENCE = resolveCorridorEvidence();
const { selectPractice } = await import(pathToFileURL(resolve(CORRIDOR_DIR, 'assessment-controller.mjs')).href);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function startServer(rootDir = CORRIDOR_DIR) {
  const server = createServer((request, response) => {
    const path = decodeURIComponent((request.url ?? '/').split('?')[0]);
    const rel = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
    const file = resolve(rootDir, rel);
    if (!file.startsWith(rootDir) || !existsSync(file)) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    });
    response.end(readFileSync(file));
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => ok({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

const results = [];
let failures = 0;
function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail });
  if (!pass) failures += 1;
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`);
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/* ------------------------------------------------- half one: the papers */
const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
const SECTION_TYPES = new Set(['moji-goi', 'bunpou', 'dokkai']);
/** The shapes that can prove exactly one answer. 'context' and 'particle'
 * were built, shipped, convicted and removed (rounds 7-8): both chose
 * distractors that fit the slot without failing the sentence, and both
 * shipped items with several correct answers. Naming them here as FORBIDDEN
 * rather than merely absent means a future regeneration cannot quietly
 * bring the class back. */
const ITEM_TYPES = new Set(['kanji-reading', 'orthography', 'form', 'gist', 'passage-cloze']);
const RETIRED_TYPES = new Set(['context', 'particle']);
/** Every phrasing the room must never produce: a pass PREDICTION. The
 * disclaimer names the same act in order to refuse it — 「受かるかどうかは
 * ここでは分からない」 / "whether you would pass … is not knowable from
 * here" — so the negated forms are excused by lookbehind. A test that
 * flagged the refusal would be a test that forbade honesty. */
const PASS_CLAIMS = [
  /受かる(でしょう|はず|と思われ|レベル|力)/u,
  /合格(でしょう|圏|確実|できる|する)/u,
  /(likely to|should|will) pass\b/iu,
  /(?<!whether )you would pass/iu,
];
const DISCLAIMS = [/ここでは分からない/u, /not knowable from here/iu, /cannot predict a N[1-5] result/iu, /合否や習熟度の判定には使わない/u, /use this as practice rather than a N[1-5] readiness score/iu];

function verifyPapers() {
  const index = readJson(resolve(MOCK_DIR, 'index.json'));
  check('the catalog is schema 1 and names its law', index.schemaVersion === 1 && /never a pass prediction/u.test(index.law));
  const files = readdirSync(resolve(MOCK_DIR, 'sets')).filter((f) => f.endsWith('.json'));
  check('five papers per JLPT level ship, 25 in all', files.length === 25 && LEVELS.every((lv) => index.sets.filter((s) => s.level === lv).length === 5), `${files.length} files`);

  const words = readJson(resolve(DATA_DIR, 'share_alike/words.json')).words;
  const kanji = readJson(resolve(DATA_DIR, 'share_alike/kanji.json')).kanji;
  // N5 is jlpt 5 and N1 is jlpt 1, so "harder" is a SMALLER number: rank
  // makes the comparison read the way the sentence does
  const RANK = { 5: 1, 4: 2, 3: 3, 2: 4, 1: 5 };
  const LEVEL_JLPT = { N5: 5, N4: 4, N3: 3, N2: 2, N1: 1 };
  const overLevel = [];
  let items = 0;
  let withSubject = 0;
  const problems = [];
  const claims = [];
  const catalog = new Map(index.sets.map((s) => [s.setId, s]));
  for (const file of files.sort()) {
    const set = readJson(resolve(MOCK_DIR, 'sets', file));
    const where = set.setId || file;
    if (set.schemaVersion !== 1) problems.push(`${where}: schemaVersion`);
    if (!LEVELS.includes(set.level)) problems.push(`${where}: level`);
    if (set.approved !== false) problems.push(`${where}: ships approved — 検収前 is the law until the operator says otherwise`);
    if (!set.rights || !Array.isArray(set.rights.sources) || !set.rights.sources.length) problems.push(`${where}: rights.sources`);
    if (!/実際の日本語能力試験の問題は含まない/u.test(set.rights?.note || '')) problems.push(`${where}: rights note must disclaim real JLPT items`);
    for (const source of set.rights?.sources || []) {
      if (!source.attribution || !source.licence) problems.push(`${where}: a source without attribution/licence`);
    }
    const cat = catalog.get(set.setId);
    if (!cat || cat.file !== file) problems.push(`${where}: not in the catalog under its own file`);
    let count = 0;
    for (const section of set.sections || []) {
      if (!SECTION_TYPES.has(section.type)) problems.push(`${where}: section type ${section.type}`);
      if (!section.title?.ja || !section.title?.en) problems.push(`${where}: section title`);
      if (section.type === 'dokkai') {
        const p = section.passage;
        if (!p?.text || !p.attribution || !p.licence) problems.push(`${where}: a passage without its rights`);
      }
      for (const item of section.items || []) {
        count += 1;
        items += 1;
        if (RETIRED_TYPES.has(item.type)) {
          problems.push(`${where}: ${item.type} items were retired for admitting several right answers`);
        } else if (!ITEM_TYPES.has(item.type)) problems.push(`${where}: item type ${item.type}`);
        if (typeof item.q !== 'string' || item.q.length < 4) problems.push(`${where}: question text`);
        if (!Array.isArray(item.opts) || item.opts.length !== 4) problems.push(`${where}: not four options`);
        else {
          if (new Set(item.opts).size !== 4) problems.push(`${where}: repeated option in ${item.opts.join('/')}`);
          if (item.opts.some((o) => typeof o !== 'string' || !o.length)) problems.push(`${where}: empty option`);
        }
        if (!Number.isInteger(item.right) || item.right < 0 || item.right > 3) problems.push(`${where}: right index`);
        // the answer may not be sitting in the question text
        const answer = item.opts?.[item.right];
        if (answer && item.type !== 'gist' && String(item.q).includes(answer)) {
          problems.push(`${where}: the question gives away ${answer}`);
        }
        if (item.subject) {
          withSubject += 1;
          const cut = item.subject.indexOf(':');
          const t = item.subject.slice(0, cut);
          const id = item.subject.slice(cut + 1);
          const known = t === 'kanji' ? !!kanji[id] : !!words[id];
          if (!known) problems.push(`${where}: subject ${item.subject} resolves in no dictionary`);
          const graded = t === 'word' ? words[id]?.jlpt : null;
          if (graded && RANK[graded] > RANK[LEVEL_JLPT[set.level]] + 1) {
            overLevel.push(`${where}/${item.type}: ${id} is N${graded} on a ${set.level} paper`);
          }
        }
        for (const text of [item.q, item.why || '', ...(item.opts || [])]) {
          if (PASS_CLAIMS.some((re) => re.test(text))) claims.push(`${where}: ${text.slice(0, 40)}`);
        }
      }
    }
    if (count !== cat?.items) problems.push(`${where}: catalog item count ${cat?.items} ≠ ${count}`);
    if (count < 12) problems.push(`${where}: only ${count} items`);
  }
  check('each short set has its expected schema, four distinct options, an indexed answer and attribution fields', problems.length === 0, problems.slice(0, 4).join(' | ') || `${items} items; editorial and rights review remains separate`);
  check('no paper tests vocabulary above its own level (review round 7: the graded list numbers N5 as 5, so a raw comparison reads backwards)', overLevel.length === 0, overLevel.slice(0, 4).join(' | ') || 'every subject within one rank of its paper');
  check('every item subject resolves in the pinned dictionary — the fail-closed law holds in the data', problems.every((p) => !p.includes('resolves in no dictionary')));
  check('most items carry a subject, so a sitting leaves real evidence', withSubject / items > 0.8, `${withSubject}/${items}`);
  check('no shipped string predicts a pass', claims.length === 0, claims.slice(0, 3).join(' | ') || 'clean');
  return items;
}

/* --------------------------------------------------- half two: the room */
function seedEnvelope() {
  return JSON.stringify({ v: 1, taken: [], srs: {} });
}

async function main() {
  console.log('— 模試: the papers as data');
  const itemCount = verifyPapers();

  console.log('\n— 模試の間: the room, in a real browser');
  const { server, base } = await startServer();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // seed ONCE: this script runs before every navigation, and a reload that
  // re-seeded would wipe the very run the resume probe is here to prove
  await context.addInitScript(`try {
    if (!localStorage.getItem('__mock_seeded')) {
      localStorage.setItem('kairo-corridor-v1', ${JSON.stringify(seedEnvelope())});
      localStorage.setItem('__mock_seeded', '1');
    }
  } catch {}`);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  await page.goto(`${base}/index.html?entry=shelf`, { waitUntil: 'load' });
  await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });

  // the door stands on the shelf, beside the lessons
  await page.waitForSelector('#mock-link', { timeout: 8000 });
  await page.click('#mock-link');
  await page.waitForSelector('.assessment-room #exam-legacy');
  await page.click('#exam-legacy');
  await page.waitForSelector('[data-mock-set="n5-01"]', { timeout: 15000 });
  const listing = await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll('[data-mock-set]')];
    return { rows: rows.length, pending: document.querySelectorAll('.mock-pending').length };
  })()`);
  check('earlier exercises retain all 25 papers, each marked 検収前', listing.rows === 25 && listing.pending === 25, JSON.stringify(listing));

  // sit the shortest N5 paper end to end, answering option 1 every time
  await page.click('[data-mock-set="n5-01"]');
  await page.waitForSelector('#mock-next', { timeout: 15000 });
  const midRecord = await readAppRecord(page);
  const selected = selectPractice(midRecord.assessmentLibrary);
  const midRun = { hasRun: !!selected, ix: selected?.run.ix, questions: selected?.flat.length,
    formRevisionId: selected?.formRevisionId, savedRevisionId: midRecord.assessmentLibrary?.forms[0]?.form.revisionId };
  check('the run persists the learner’s place with its complete pinned question version', midRun.hasRun === true && midRun.ix === 0 && midRun.questions === 18 && midRun.formRevisionId === midRun.savedRevisionId, JSON.stringify(midRun));

  // the paper does not judge mid-sitting
  await page.click('[data-mock-opt="0"]');
  const midMark = await page.evaluate(
    `document.querySelectorAll('.lesson-option.right, .lesson-option.wrong').length`,
  );
  check('mid-paper, no answer is marked right or wrong — the traditional posture', midMark === 0);

  // a reload mid-paper costs nothing: the view is session state and returns
  // home, but the paper waits, and its own door leads straight back in
  await page.click('#mock-next');
  await waitForAppRecord(page, (record) => selectPractice(record.assessmentLibrary)?.run.ix === 1,
    { description: 'first saved practice question transition' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
  await page.click('#mock-link');
  await page.waitForSelector('#mock-next', { timeout: 15000 });
  // The running paper also carries data-mock-set for identity; only buttons are catalog doors.
  const reentry = await page.evaluate(() => {
    const inspect = (node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        tag: node.tagName, id: node.id, className: node.className,
        setId: node.getAttribute('data-mock-set'),
        visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.visibility !== 'collapse',
      };
    };
    return {
      matches: [...document.querySelectorAll('[data-mock-set]')].map(inspect),
      catalogButtons: [...document.querySelectorAll('#app > main button[data-mock-set]')].map(inspect),
      activeMains: [...document.querySelectorAll('#app > main[data-mock-set]')].map(inspect),
    };
  });
  reentry.expectedSetId = selected?.run.setId;
  reentry.nextVisible = await page.locator('#app > main #mock-next').isVisible();
  check('the door re-enters the open paper, not the list',
    reentry.expectedSetId === 'n5-01' && reentry.catalogButtons.length === 0 &&
      reentry.activeMains.length === 1 && reentry.activeMains[0].setId === reentry.expectedSetId &&
      reentry.activeMains[0].visible && reentry.nextVisible,
    JSON.stringify(reentry));
  const resumedSelection = selectPractice((await readAppRecord(page)).assessmentLibrary);
  const quarantined = () => page.evaluate(() => {
    const alert = document.getElementById('store-alert');
    return !!(alert && !alert.hidden && alert.textContent);
  });
  const resumed = {
    ix: resumedSelection?.run.ix, setId: resumedSelection?.run.setId,
    attemptId: resumedSelection?.attemptId, formRevisionId: resumedSelection?.formRevisionId,
    itemId: resumedSelection?.flat[resumedSelection.run.ix]?.itemId,
    itemVersionId: resumedSelection?.flat[resumedSelection.run.ix]?.itemVersionId,
    firstAnswer: resumedSelection?.run.answers[0],
    clockStatus: resumedSelection?.clockStatus, quarantined: await quarantined(),
  };
  check('a reload resumes at the same pinned question with unknown process downtime',
    resumed.ix === 1 && resumed.setId === 'n5-01' && resumed.attemptId === selected?.attemptId &&
      resumed.formRevisionId === selected?.formRevisionId && resumed.itemId === selected?.flat[1]?.itemId &&
      resumed.itemVersionId === selected?.flat[1]?.itemVersionId && resumed.firstAnswer === 0 &&
      resumed.clockStatus === 'unverified' && resumed.quarantined === false,
    JSON.stringify(resumed));

  const beforeRecord = await readAppRecord(page);
  const before = { taken: (beforeRecord.taken || []).length, srs: Object.keys(beforeRecord.srs || {}).length, revlog: (beforeRecord.revlog || []).length };

  for (let guard = 0; guard < 60; guard += 1) {
    const done = await page.evaluate(`!!document.getElementById('mock-done')`);
    if (done) break;
    const current = selectPractice((await readAppRecord(page)).assessmentLibrary);
    await page.click('[data-mock-opt="0"]');
    await waitForAppRecord(page, (record) => selectPractice(record.assessmentLibrary)?.run.answers[current.run.ix] === 0,
      { description: 'saved practice answer' });
    await page.click('#mock-next');
    await waitForAppRecord(page, (record) => selectPractice(record.assessmentLibrary)?.run.ix === current.run.ix + 1,
      { description: 'saved next practice question' });
  }
  await page.waitForSelector('#mock-done', { timeout: 15000 });

  const graded = await page.evaluate((text) => {
    const s = JSON.parse(text);
    const rows = (s.obslog || []).filter((r) => r[1] === 'mock');
    const attempt = s.assessmentLibrary?.attempts[0];
    return {
      rows: rows.length,
      responses: attempt?.facts.filter((fact) => fact.kind === 'response').length,
      answered: attempt?.answers.filter((answer) => answer.response.kind === 'selected').length,
      status: attempt?.status,
      taken: (s.taken || []).length,
      srs: Object.keys(s.srs || {}).length,
      revlog: (s.revlog || []).length,
      text: document.querySelector('main')?.textContent || '',
    };
  }, JSON.stringify(await readAppRecord(page)));
  check('unreviewed practice keeps full response facts without inventing measured obslog grades', graded.rows === 0 && graded.responses === 18, `${graded.responses} response facts; ${graded.rows} legacy grades`);
  check('submission retains every selected answer for this exact question version', graded.status === 'submitted' && graded.answered === 18, JSON.stringify({ status: graded.status, answered: graded.answered }));
  check('sitting a paper moves NO schedule: no deck row, no FSRS card, no review row', graded.taken === before.taken && graded.srs === before.srs && graded.revlog === before.revlog, `${JSON.stringify(before)} → taken ${graded.taken} srs ${graded.srs} revlog ${graded.revlog}`);
  check(
    'the result screen refuses to predict a pass — and says so in as many words',
    DISCLAIMS.some((re) => re.test(graded.text)) && !PASS_CLAIMS.some((re) => re.test(graded.text)),
    DISCLAIMS.some((re) => re.test(graded.text)) ? 'disclaimer present, no claim' : 'no disclaimer found',
  );

  // 取り上げる — the explicit choice, and only that
  const adopt = await page.evaluate(`(() => {
    const b = document.getElementById('mock-enroll-all');
    return { offered: !!b, label: b ? b.textContent : '' };
  })()`);
  check('the missed words are offered, never taken', adopt.offered === true, adopt.label);
  if (adopt.offered) {
    await page.click('#mock-enroll-all');
    await waitForAppRecord(page, (record) => record.taken?.length > before.taken,
      { description: 'explicitly adopted missed words' });
  }
  const adoptedRecord = await readAppRecord(page);
  const adopted = { taken: (adoptedRecord.taken || []).length, started: (adoptedRecord.taken || []).every((t) => !!t.started), srs: Object.keys(adoptedRecord.srs || {}).length };
  check('one press mints the missed words as ordinary started cards — and only then', adopted.taken > before.taken && adopted.started === true, `${before.taken} → ${adopted.taken}`);
  check('even adoption schedules nothing itself — FSRS stays the only scheduler', adopted.srs === before.srs);

  // the envelope validator accepts everything the room wrote
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
  const survivedRecord = await readAppRecord(page);
  const survived = {
    rows: (survivedRecord.obslog || []).filter((r) => r[1] === 'mock').length,
    done: survivedRecord.assessmentLibrary?.attempts[0]?.status === 'submitted',
    responses: survivedRecord.assessmentLibrary?.attempts[0]?.facts.filter((fact) => fact.kind === 'response').length,
    quarantined: await quarantined(),
  };
  check('full submitted answers cross a reload whole without measured legacy grades', survived.rows === 0 && survived.responses === 18 && survived.done === true && survived.quarantined === false, JSON.stringify(survived));
  await page.click('#mock-link');
  await page.click('#mock-done');
  await page.click('#exam-legacy');
  await page.waitForSelector('[data-mock-history]');
  const historyRecord = await waitForAppRecord(page, (record) => record.assessmentLibrary?.activeAttemptId === null,
    { description: 'cleared practice pointer with retained history' });
  const library = historyRecord.assessmentLibrary;
  const history = { active: library.activeAttemptId, attempts: library.attempts.length,
    answers: library.attempts[0].answers.length,
    visible: await page.locator('[data-mock-history]').count() };
  check('Done clears the active pointer and keeps complete history accessible', history.active === null && history.attempts === 1 && history.answers === 18 && history.visible === 1, JSON.stringify(history));
  await page.locator('[data-mock-history]').click();
  await page.waitForSelector('.mock-review-row');
  check('opening completed history renders every pinned question for review', await page.locator('.mock-review-row').count() === 18 && await page.locator('#mock-done').isVisible());

  // review round 7: a failure that re-fires on sight is a loop, not a retry.
  // With the catalog unreachable the room must ask ONCE, settle, and wait for
  // the learner's own もう一度 — offline, an unsettled failure would spin the
  // network for as long as the page is open.
  const offline = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let attempts = 0;
  await offline.route('**/data/mock/index.json', (route) => {
    attempts += 1;
    route.abort();
  });
  const lonely = await offline.newPage();
  await lonely.goto(`${base}/index.html?entry=shelf`, { waitUntil: 'load' });
  await lonely.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
  await lonely.click('#mock-link');
  await lonely.click('#exam-legacy');
  await lonely.waitForSelector('#mock-retry', { timeout: 10000 });
  const settledAt = attempts;
  await lonely.waitForTimeout(1500);
  check('an unreachable catalog settles after one attempt instead of spinning', settledAt === 1 && attempts === settledAt, `${attempts} requests in the first seconds`);
  await lonely.click('#mock-retry');
  await lonely.waitForTimeout(600);
  check('もう一度 is a deliberate second attempt — and only one', attempts === settledAt + 1, `${attempts} after one press`);
  await offline.close();

  check('no console or page errors across the 模試 walk', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | ') || 'clean');

  await browser.close();
  server.close();
  console.log(`\n${results.length - failures}/${results.length} checks passed · ${itemCount} items across 25 papers`);
  return failures === 0 ? 0 : 1;
}

function receipt(error = null) {
  const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
  writeFileSync(resolve(EVIDENCE, 'mock-report.json'), JSON.stringify({
    schemaVersion: 1,
    artifact: { path: CORRIDOR_DIR, sha256: readJson(resolve(CORRIDOR_DIR, 'build-identity.json')).artifactSha256 },
    sources: { verifier: hash(fileURLToPath(import.meta.url)), nativeRecordHelper: hash(fileURLToPath(new URL('./record-test-support.mjs', import.meta.url))) },
    results, failed: failures, error, pass: failures === 0 && !error,
  }, null, 2) + '\n');
}
main().then(
  (code) => { receipt(); process.exit(code); },
  (err) => {
    console.error(err);
    receipt(err.stack || String(err));
    process.exit(2);
  },
);
