/**
 * 模試の間's verifier. Done = this is green.
 *
 * Two halves. The first reads every shipped paper as DATA and proves the
 * schema, the rights strings, and the fail-closed subject law hold on all of
 * them — 25 papers is too many to eyeball, and a bad item that ships teaches
 * something false. The second drives the room in real Chromium and proves
 * the four laws of the room itself:
 *
 *   · a sat paper writes typed [t,'mock',key,g,setId] rows and NOTHING else
 *     — no FSRS state, no deck row, no revlog row, no moved due date;
 *   · the rows survive the envelope validator across a reload (no quarantine);
 *   · 取り上げる mints only on the learner's explicit press, and only words
 *     the dictionary confirms;
 *   · no string the room can render ever claims a JLPT pass.
 *
 * Usage: node verify-mock.mjs
 */

import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const CORRIDOR_DIR = resolve(TOOL_DIR, '..');
const DATA_DIR = resolve(CORRIDOR_DIR, 'data');
const MOCK_DIR = resolve(DATA_DIR, 'mock');

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
  results.push({ name, pass: !!pass });
  if (!pass) failures += 1;
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`);
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/* ------------------------------------------------- half one: the papers */
const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
const SECTION_TYPES = new Set(['moji-goi', 'bunpou', 'dokkai']);
const ITEM_TYPES = new Set([
  'kanji-reading',
  'orthography',
  'context',
  'form',
  'gist',
  'passage-cloze',
]);
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
const DISCLAIMS = [/ここでは分からない/u, /not knowable from here/iu];

function verifyPapers() {
  const index = readJson(resolve(MOCK_DIR, 'index.json'));
  check('the catalog is schema 1 and names its law', index.schemaVersion === 1 && /never a pass prediction/u.test(index.law));
  const files = readdirSync(resolve(MOCK_DIR, 'sets')).filter((f) => f.endsWith('.json'));
  check('five papers per JLPT level ship, 25 in all', files.length === 25 && LEVELS.every((lv) => index.sets.filter((s) => s.level === lv).length === 5), `${files.length} files`);

  const words = readJson(resolve(DATA_DIR, 'share_alike/words.json')).words;
  const kanji = readJson(resolve(DATA_DIR, 'share_alike/kanji.json')).kanji;
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
        if (!ITEM_TYPES.has(item.type)) problems.push(`${where}: item type ${item.type}`);
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
        }
        for (const text of [item.q, item.why || '', ...(item.opts || [])]) {
          if (PASS_CLAIMS.some((re) => re.test(text))) claims.push(`${where}: ${text.slice(0, 40)}`);
        }
      }
    }
    if (count !== cat?.items) problems.push(`${where}: catalog item count ${cat?.items} ≠ ${count}`);
    if (count < 12) problems.push(`${where}: only ${count} items`);
  }
  check('every paper validates: schema, four distinct options, one right answer, rights carried', problems.length === 0, problems.slice(0, 4).join(' | ') || `${items} items`);
  check('every item subject resolves in the pinned dictionary — the fail-closed law holds in the data', problems.every((p) => !p.includes('resolves in no dictionary')));
  check('most items carry a subject, so a sitting leaves real evidence', withSubject / items > 0.8, `${withSubject}/${items}`);
  check('no shipped string predicts a pass', claims.length === 0, claims.slice(0, 3).join(' | ') || 'clean');
  const source = readFileSync(resolve(CORRIDOR_DIR, 'corridor.js'), 'utf8');
  check('the room writes mock rows and nothing else at grading time', source.includes("rows.push([now, 'mock', subject,") && source.includes('if (rows.length) patch.obslog'), 'the one commit is score + typed rows');
  check('the room speaks the honesty constraint aloud', /受かるかどうかは、ここでは分からない/u.test(source) && /not knowable from here/u.test(source));
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
  await page.waitForSelector('[data-mock-set="n5-01"]', { timeout: 15000 });
  const listing = await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll('[data-mock-set]')];
    return { rows: rows.length, pending: document.querySelectorAll('.mock-pending').length };
  })()`);
  check('the room lists all 25 papers, each marked 検収前', listing.rows === 25 && listing.pending === 25, JSON.stringify(listing));

  // sit the shortest N5 paper end to end, answering option 1 every time
  await page.click('[data-mock-set="n5-01"]');
  await page.waitForSelector('#mock-next', { timeout: 15000 });
  const midRun = await page.evaluate(`(() => {
    const s = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
    return { hasRun: !!s.mockRun, ix: s.mockRun?.ix, hasQuestions: JSON.stringify(s.mockRun || {}).length };
  })()`);
  check('the run persists the learner’s place, not the questions', midRun.hasRun === true && midRun.ix === 0 && midRun.hasQuestions < 400, JSON.stringify(midRun));

  // the paper does not judge mid-sitting
  await page.click('[data-mock-opt="0"]');
  const midMark = await page.evaluate(
    `document.querySelectorAll('.lesson-option.right, .lesson-option.wrong').length`,
  );
  check('mid-paper, no answer is marked right or wrong — the traditional posture', midMark === 0);

  // a reload mid-paper costs nothing: the view is session state and returns
  // home, but the paper waits, and its own door leads straight back in
  await page.click('#mock-next');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
  await page.click('#mock-link');
  await page.waitForSelector('#mock-next', { timeout: 15000 });
  const noList = await page.evaluate(`document.querySelectorAll('[data-mock-set]').length`);
  check('the door re-enters the open paper, not the list', noList === 0);
  const resumed = await page.evaluate(`(() => {
    const s = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
    const alert = document.getElementById('store-alert');
    return { ix: s.mockRun?.ix, quarantined: !!(alert && !alert.hidden && alert.textContent) };
  })()`);
  check('a reload mid-paper resumes at the same question, unquarantined', resumed.ix === 1 && resumed.quarantined === false, JSON.stringify(resumed));

  const before = await page.evaluate(`(() => {
    const s = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
    return { taken: (s.taken || []).length, srs: Object.keys(s.srs || {}).length, revlog: (s.revlog || []).length };
  })()`);

  for (let guard = 0; guard < 60; guard += 1) {
    const done = await page.evaluate(`!!document.getElementById('mock-done')`);
    if (done) break;
    await page.click('[data-mock-opt="0"]');
    await page.click('#mock-next');
    await page.waitForTimeout(60);
  }
  await page.waitForSelector('#mock-done', { timeout: 15000 });

  const graded = await page.evaluate(`(() => {
    const s = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
    const rows = (s.obslog || []).filter((r) => r[1] === 'mock');
    return {
      rows: rows.length,
      shaped: rows.every((r) => r.length === 5 && typeof r[2] === 'string' && r[2].includes(':') && [1, 3].includes(r[3]) && r[4] === 'n5-01'),
      done: s.mockDone?.['n5-01'] || null,
      taken: (s.taken || []).length,
      srs: Object.keys(s.srs || {}).length,
      revlog: (s.revlog || []).length,
      text: document.querySelector('main')?.textContent || '',
    };
  })()`);
  check('a sat paper writes typed mock rows for every dictionary-confirmed item', graded.rows >= 10 && graded.shaped === true, `${graded.rows} rows`);
  check('the score is kept, and it is the score of THIS paper', !!graded.done && graded.done.total >= 12, JSON.stringify(graded.done));
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
    await page.waitForTimeout(200);
  }
  const adopted = await page.evaluate(`(() => {
    const s = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
    return { taken: (s.taken || []).length, started: (s.taken || []).every((t) => !!t.started), srs: Object.keys(s.srs || {}).length };
  })()`);
  check('one press mints the missed words as ordinary started cards — and only then', adopted.taken > before.taken && adopted.started === true, `${before.taken} → ${adopted.taken}`);
  check('even adoption schedules nothing itself — FSRS stays the only scheduler', adopted.srs === before.srs);

  // the envelope validator accepts everything the room wrote
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
  const survived = await page.evaluate(`(() => {
    const s = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
    const alert = document.getElementById('store-alert');
    return {
      rows: (s.obslog || []).filter((r) => r[1] === 'mock').length,
      done: !!s.mockDone?.['n5-01'],
      quarantined: !!(alert && !alert.hidden && alert.textContent),
    };
  })()`);
  check('mock rows and scores cross a reload whole — the validator admits them', survived.rows >= 10 && survived.done === true && survived.quarantined === false, JSON.stringify(survived));

  check('no console or page errors across the 模試 walk', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | ') || 'clean');

  await browser.close();
  server.close();
  console.log(`\n${results.length - failures}/${results.length} checks passed · ${itemCount} items across 25 papers`);
  return failures === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(2);
  },
);
