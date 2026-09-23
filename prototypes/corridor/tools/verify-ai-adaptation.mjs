/** One silent Chromium context, immutable site, synthetic provider only.
 * Successful learner steps use normal controls and JSON imports. Native record
 * reads are observations; the one negative write test uses the existing host
 * transaction fault. This does not establish provider quality or JLPT ability.
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
import { armRecordWriteFailure, clearRecordWriteFailure, readAppRecord,
  readAppRecordSnapshot, waitForAppRecord } from './record-test-support.mjs';

const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  assert.ok(process.argv[index + 1] && !process.argv[index + 1].startsWith('--'), `${name} needs a value`);
  return process.argv[index + 1];
};
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const siteArg = option('--site', process.env.KAIRO_SITE_DIR);
const outArg = option('--evidence-out', process.env.KAIRO_ADAPTATION_EVIDENCE);
assert.ok(siteArg && outArg, 'Provide --site and a fresh external --evidence-out directory');
const site = resolve(siteArg), out = resolve(outArg);
assert.ok(!out.startsWith(sourceRoot + sep) && out !== sourceRoot, 'Runtime evidence belongs outside the repository');
assert.ok(!existsSync(out), 'Evidence directory must be fresh; preserve earlier failures');
mkdirSync(out, { recursive: true });
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (path) => JSON.parse(readFileSync(resolve(site, path), 'utf8'));
const identity = json('build-identity.json');
assert.match(process.env.KAIRO_ARTIFACT_SHA256 || '', /^[0-9a-f]{64}$/u, 'Set the expected artifact pin');
assert.equal(identity.artifactSha256, process.env.KAIRO_ARTIFACT_SHA256);
const files = new Map(identity.files.map((row) => [row.path, row]));
const selected = option('--case', 'all');
const caseNames = ['surfaces', 'privacy', 'freshness', 'undo', 'failed-write', 'provider-change', 'import-epoch', 'source-context'];
const selectedCases = selected === 'all' ? caseNames : selected.split(',');
assert.ok(selectedCases.length && new Set(selectedCases).size === selectedCases.length && selectedCases.every((name) => caseNames.includes(name)), 'Unknown or repeated --case');
const LABEL = '\n\nDerived learning context (guidance only):\n';
const endpoint = 'https://stub.invalid';
const modelName = 'synthetic-teaching-v1';
const clock = 1755000000000;
const dictionary = { ...json('data/share_alike/words.json').words, ...json('data/share_alike/dict.json').words };
const formsAt = (level) => Object.keys(dictionary).filter((form) =>
  String(dictionary[form].jlpt).replace(/^N/iu, '') === String(level) && /^[\p{Script=Han}\p{Script=Hiragana}々ー]{1,5}$/u.test(form));
const words = { n1: formsAt(1).slice(0, 5), n3: formsAt(3)[0], n4: formsAt(4)[0], n5: '学校', unknown: '念仏' };
assert.equal(words.n1.length, 5);
assert.equal(String(dictionary[words.n5].jlpt).replace(/^N/iu, ''), '5');
assert.equal(dictionary[words.unknown].jlpt, undefined);
const dueCard = { due: '2026-01-02T00:00:00.000Z', last_review: '2026-01-01T00:00:00.000Z',
  stability: 5, difficulty: 5, elapsed_days: 1, scheduled_days: 1, reps: 3, lapses: 0, learning_steps: 0, state: 2 };
const fixture = (ids = [], obslog = [], extra = {}) => ({ v: 1,
  taken: ids.map((id, index) => ({ t: 'word', id, label: id, ts: clock + index })),
  srs: Object.fromEntries(ids.map((id) => [`word:${id}`, { ...dueCard }])), obslog, ...extra });
const lessonRows = (form, rights) => rights.map((right, index) => [clock + 100 + index, 'lesson', `word:${form}`, right ? 3 : 1, 'adaptation-synthetic']);
const learning = (record) => Object.fromEntries(['taken', 'srs', 'revlog', 'obslog', 'stats', 'suspended'].map((key) => [key, record[key]]));
const results = [], checks = [], requests = [], externalRequests = [], browserErrors = [], routeErrors = [], servedFiles = new Map();
let browser, context, page, timer, origin, activeCase = 'startup', held = null, holdNextChat = false, timedOut = false;
const handles = { processId: process.pid, browserContextsCreated: 0, browserContextsClosed: 0, browserClosed: false, serverClosed: false };
const write = (name, value) => writeFileSync(resolve(out, name), `${JSON.stringify(value, null, 2)}\n`);
const check = (name, run) => { run(); checks.push({ case: activeCase, name, pass: true }); };
const poll = async (predicate, description, timeout = 10000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) { const value = await predicate(); if (value) return value; await delay(25); }
  throw new Error(`Timed out: ${description}`);
};
function classify(system) {
  if (system.includes('observations about the LEARNER')) return 'mine';
  if (system.startsWith('You write a short quiz')) return 'quiz';
  if (system.includes('natural example sentences for the given word')) return 'examples';
  if (system.startsWith('Write one original Japanese reading passage')) return 'reading';
  if (system.startsWith('You choose vocabulary cards')) return 'cards';
  if (system.includes('speaking just after a review session')) return 'coach';
  if (system.startsWith('You are a Japanese tutor inside a dictionary app')) return 'word-tutor';
  if (system.startsWith('You are the tutor inside a Japanese-learning app')) return 'chat';
  throw new Error('Unrecognized actual provider request');
}
function syntheticReply(surface, serial) {
  if (surface === 'mine') return '[]';
  if (surface === 'quiz') return JSON.stringify([1, 2, 3, 4, 5].map((n) => ({
    q: `問${n}：学校へ行きます。`, opts: ['学校', '電話', '先生', '時間'], right: 0, why: `Synthetic explanation ${n}.` })));
  if (surface === 'examples') return [1, 2, 3, 4, 5, 6].map((n) => `N5 | 学校へ行きます。 | がっこうへいきます。 | Synthetic example ${n}.`).join('\n');
  if (surface === 'reading') return JSON.stringify({ title: '朝の散歩', text: '朝、学校（がっこう）の近（ちか）くを歩（ある）きます。公園（こうえん）で鳥（とり）の声（こえ）を聞（き）きます。今日（きょう）は静（しず）かな朝（あさ）です。', suggestedWords: [], references: [] });
  if (surface === 'cards') return '散歩、音楽';
  return `Synthetic ${surface} reply ${serial}. 学校（がっこう）へ行きます。`;
}
function teaching(request) {
  const chunks = request.body.system.split(LABEL);
  assert.equal(chunks.length, 2, `${request.surface} must contain exactly one system context`);
  const value = JSON.parse(chunks[1]);
  assert.equal(value.kind, 'derived-learning-context');
  assert.equal(value.modelVersion, 'kagami/2');
  assert.equal(value.admissionPolicyVersion, 'kagami-admission/2');
  assert.deepEqual(value.bands.map((band) => band.dimension), ['lexis', 'readings', 'syntax', 'production']);
  assert.ok(chunks[1].length <= 8000 && value.targets.length <= 6 && value.confusions.length <= 4);
  assert.ok(request.body.messages.every((message) => !message.content.includes(LABEL) && !message.content.includes('derived-learning-context')));
  return value;
}
const band = (value, dimension) => value.bands.find((entry) => entry.dimension === dimension);
const cell = (value, dimension, level) => band(value, dimension).cells.find((entry) => entry.level === level);
const server = createServer((request, response) => {
  try {
    const file = resolve(site, `.${decodeURIComponent(new URL(request.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(request.url, 'http://localhost').pathname)}`);
    const path = relative(site, file);
    if (!file.startsWith(site + sep) || !files.has(path)) { response.writeHead(404).end(); return; }
    const bytes = readFileSync(file), expected = files.get(path);
    assert.equal(sha(bytes), expected.sha256, `Served file changed: ${path}`);
    servedFiles.set(path, expected.sha256);
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
    response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(bytes);
  } catch (error) { routeErrors.push(String(error)); response.writeHead(500).end(); }
});
const openShelf = async () => {
  await page.goto(`${origin}/index.html?entry=shelf&ui=bi`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1');
};
async function importFixture(name, record, { navigate = true } = {}) {
  write(`${name}-import.json`, record);
  if (navigate) await openShelf();
  await page.locator('#tray').click();
  await page.evaluate(() => { window.__PI_ADAPT_BEFORE_IMPORT = true; });
  await page.locator('#import-file').setInputFiles({ name: `${name}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(record)) });
  await page.waitForFunction(() => !window.__PI_ADAPT_BEFORE_IMPORT && document.body.dataset.ready === '1', null, { timeout: 30000 });
  const snapshot = await readAppRecordSnapshot(page);
  write(`${name}-imported.json`, snapshot);
  assert.deepEqual(snapshot.record.obslog, record.obslog);
  return snapshot;
}
async function configure(model = modelName) {
  if (!await page.locator('#ai-base-url').count()) await page.locator('#ai-link').click();
  await page.locator('#ai-base-url').fill(endpoint);
  await page.locator('#ai-model-input').fill(model);
  await page.locator('#ai-key-input').fill('SYNTHETIC_TEST_KEY');
  await page.locator('#ai-key-save').click();
  await page.locator('#chat-input').waitFor();
}
async function openWord(form) {
  await openShelf();
  await page.locator('#chrome-search').click();
  await page.locator('#nav-search-input').fill(form);
  await page.locator('#nav-search-input').press('Enter');
  await page.locator('#sheet').waitFor();
  await page.waitForFunction(() => !document.querySelector('#sheet .dictionary-opening'));
}
async function send(surface, trigger) {
  const start = requests.length;
  const oldTurns = (await readAppRecordSnapshot(page)).archive.turns;
  const oldIds = new Set(oldTurns.map((row) => row.xid));
  await trigger();
  const request = await poll(() => requests.slice(start).find((row) => row.surface === surface), `${surface} request`);
  const snapshot = await poll(async () => {
    const latest = await readAppRecordSnapshot(page);
    return latest.archive.turns.some((row) => row.surface === surface && row.role === 'assistant' && !oldIds.has(row.xid)) && latest;
  }, `${surface} exact new assistant archive`);
  request.archive = snapshot.archive.turns.filter((row) => row.surface === surface && !oldIds.has(row.xid));
  assert.equal(request.archive.filter((row) => row.role === 'user').length, 1);
  assert.equal(request.archive.filter((row) => row.role === 'assistant').length, 1);
  return request;
}
const wordRequest = async (form = words.n5) => {
  await openWord(form);
  const request = await send('word-tutor', () => page.locator('#sheet .ai-ask').filter({ hasText: '先生に聞く' }).click());
  assert.ok(request.archive.every((row) => row.contextRef === `word:${form}`));
  return request;
};
async function sendChat(text) {
  await page.locator('#chat-input').fill(text);
  const start = requests.length;
  const request = await send('chat', () => page.locator('#chat-send').click());
  const mine = await poll(() => requests.slice(start).find((row) => row.surface === 'mine'), 'empty mining request');
  await poll(async () => (await readAppRecordSnapshot(page)).archive.turns.some((row) => row.surface === 'mine' && row.role === 'assistant' && row.content === '[]'), 'empty mining acknowledgement');
  assert.equal(request.body.messages.at(-1).content, text);
  assert.ok(!mine.body.system.includes(LABEL));
  return request;
}
async function runCase(name, run) {
  if (!selectedCases.includes(name)) return;
  activeCase = name;
  const row = { name, startedAt: new Date().toISOString(), pass: false };
  try { await run(); row.pass = true; }
  catch (error) {
    row.error = String(error.stack || error);
    if (page && !page.isClosed()) {
      await page.screenshot({ path: resolve(out, `${name}-failure.png`), fullPage: true, timeout: 10000 }).catch(() => {});
      await readAppRecordSnapshot(page).then((value) => write(`${name}-failure-record.json`, value)).catch(() => {});
    }
  } finally {
    if (held) { held.release(); held = null; }
    holdNextChat = false;
    row.completedAt = new Date().toISOString(); results.push(row); write('progress.json', { results, checks });
    console.log(`${row.pass ? 'PASS' : 'FAIL'} ${name}${row.error ? `: ${row.error}` : ''}`);
  }
}

try {
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true });
  handles.browserVersion = browser.version(); handles.executablePath = process.env.CHROMIUM_PATH || chromium.executablePath();
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  handles.browserContextsCreated++;
  handles.audio = await silenceBrowserAudio(context);
  timer = setTimeout(() => { timedOut = true; void browser.close(); }, 420000);
  await context.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    if (request.url() !== `${endpoint}/v1/messages` || request.method() !== 'POST') {
      externalRequests.push({ origin: url.origin, pathname: url.pathname, method: request.method() }); return route.abort();
    }
    try {
      const body = request.postDataJSON(), surface = classify(body.system), serial = requests.length + 1;
      const row = { serial, case: activeCase, surface, url: request.url(), body, receivedAt: new Date().toISOString() };
      requests.push(row);
      if (surface === 'chat' && holdNextChat) {
        holdNextChat = false;
        await new Promise((done) => {
          const timeout = setTimeout(done, 12000);
          held = { serial, release: () => { clearTimeout(timeout); done(); } };
        });
      }
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ model: body.model, stop_reason: 'end_turn', content: [{ type: 'text', text: syntheticReply(surface, serial) }] }) });
      row.fulfilled = true;
    } catch (error) { routeErrors.push({ case: activeCase, error: String(error) }); await route.abort().catch(() => {}); }
  });
  page = await context.newPage();
  page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(30000);
  page.on('pageerror', (error) => browserErrors.push({ case: activeCase, kind: 'pageerror', error: String(error) }));
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push({ case: activeCase, kind: 'console', error: message.text(), location: message.location() }); });
  await openShelf();
  await configure();
  write('executor.json', { handles, origin, site, artifactSha256: identity.artifactSha256, sourceAssetSha256: identity.sourceAssetSha256,
    verifierSha256: sha(readFileSync(fileURLToPath(import.meta.url))), finiteBounds: { totalMs: 420000, actionMs: 10000, navigationMs: 30000, heldProviderMs: 12000 } });
  console.log(`EXECUTOR ${JSON.stringify({ pid: process.pid, origin, browser: handles.browserVersion, contexts: browser.contexts().length, artifact: identity.artifactSha256 })}`);

  await runCase('surfaces', async () => {
    await importFixture('selected-n1-unassessed', fixture(words.n1));
    const tutor = await wordRequest();
    check('selected N1 cards without judged evidence remain four sparse dimensions', () => assert.ok(teaching(tutor).bands.every((entry) => entry.evidence === 'sparse' && entry.workingBand === null && entry.cells.length === 0)));
    await openWord(words.unknown);
    let before = learning(await readAppRecord(page));
    const examples = await send('examples', () => page.locator('#sheet .ai-ask').filter({ hasText: '例文をつくる' }).click());
    await page.locator('#sheet .ai-ex').first().waitFor();
    const learningAfterExamples = learning(await readAppRecord(page));
    check('unknown source word classification stays unknown in actual examples request', () => assert.ok(examples.body.messages.at(-1).content.includes('Source word JLPT classification: not recorded')));
    check('examples guidance cannot grade or capture', () => assert.deepEqual(learningAfterExamples, before));
    await page.screenshot({ path: resolve(out, 'examples-mobile.png'), fullPage: true });
    await openShelf(); await page.locator('#tray').click();
    before = learning(await readAppRecord(page));
    const quiz = await send('quiz', () => page.locator('#aiq-start').click());
    await page.locator('.aiq-q').waitFor();
    const learningAfterQuiz = learning(await readAppRecord(page));
    check('quiz request uses the vector without a scheduled grade', () => { teaching(quiz); assert.deepEqual(learningAfterQuiz, before); });
    await openShelf(); await page.locator('#airead-link').click();
    before = learning(await readAppRecord(page));
    const reading = await send('reading', () => page.locator('#airead-make').click());
    const readState = await waitForAppRecord(page, (record) => !!record.aiReading);
    check('reading keeps its version 1 learner brief and creates no review debt', () => {
      assert.ok(!reading.body.system.includes(LABEL)); assert.equal(JSON.parse(reading.body.messages.at(-1).content).schemaVersion, 1);
      assert.deepEqual(learning(readState), before);
    });
    await openShelf(); await page.locator('#ai-link').click();
    before = learning(await readAppRecord(page));
    const cards = await send('cards', () => page.locator('#ai-cards-make').click());
    const curated = await waitForAppRecord(page, (record) => ['散歩', '音楽'].every((form) => record.taken.some((entry) => entry.id === form)));
    check('explicit card request receives guidance and only performs its bounded capture action', () => {
      teaching(cards); assert.equal(curated.taken.length, before.taken.length + 2);
      assert.deepEqual({ ...learning(curated), taken: before.taken }, before);
    });
    const chatBefore = learning(await readAppRecord(page));
    const chat = await sendChat('「学校」の使い方を教えてください。');
    const afterChat = learning(await readAppRecord(page));
    check('chat gets guidance; empty mining leaves learning evidence unchanged', () => { teaching(chat); assert.deepEqual(afterChat, chatBefore); });
    const sourceProfile = teaching(tutor);
    check('all five non-coach surfaces read the same empty evidence despite chosen cards', () => {
      for (const request of [examples, quiz, cards, chat]) assert.deepEqual(teaching(request), sourceProfile);
    });
  });

  await runCase('privacy', async () => {
    const rows = [...lessonRows(words.n5, [false, false, false, false]), ...lessonRows(words.n1[0], [true, true, true, true])];
    for (let i = 0; i < 4; i++) rows.push([clock + 300 + i, 'probe', `word:${words.n3}`, 3, 0],
      [clock + 310 + i, 'dojo', 'grammar:teiru', 1], [clock + 320 + i, 'sensei', `word:${words.n5}`, 1, 'prod-gap', 'synthetic-source'],
      [clock + 330 + i, 'sensei', `word:${words.n4}`, 1, 'sense-miss', 'synthetic-source']);
    for (const form of ['toString', 'constructor', '秘密未収録語']) for (let i = 0; i < 2; i++) rows.push([clock + 400 + i, 'dojo', `word:${form}`, 1]);
    rows.push([clock + 450, 'note', 'op', 'PRIVATE_NOTE_CANARY'], [clock + 451, 'confuse', 'kanji:歩', 'kanji:足'],
      [clock + 452, 'confuse', 'word:toString', 'word:秘密未収録語']);
    await importFixture('asymmetric-private', fixture([], rows, { deepWords: { 秘密未収録語: { r: 'ひみつみしゅうろくご', m: ['PRIVATE_IMPORTED_GLOSS'] } } }));
    const request = await wordRequest(), value = teaching(request), payload = JSON.stringify(value);
    check('actual request retains conflicting level cells and distinct dimensions', () => {
      assert.equal(band(value, 'lexis').evidence, 'conflicting'); assert.equal(band(value, 'lexis').workingBand, 'N1');
      assert.deepEqual(cell(value, 'lexis', 'N5').measured, { seen: 4, right: 0 });
      assert.deepEqual(cell(value, 'lexis', 'N1').measured, { seen: 4, right: 4 });
      assert.deepEqual(cell(value, 'readings', 'N3').measured, { seen: 4, right: 4 });
      assert.deepEqual(cell(value, 'syntax', 'N5').measured, { seen: 4, right: 0 });
      assert.deepEqual(cell(value, 'production', 'N5').observed, { seen: 4, right: 0 });
      assert.equal(band(value, 'production').workingBand, null);
    });
    check('resolved targets preserve mixed, measured, and observed provenance', () => {
      assert.ok(value.targets.some((target) => target.form === words.n5 && target.provenance === 'mixed'));
      assert.ok(value.targets.some((target) => target.kind === 'grammar' && target.provenance === 'measured'));
      assert.ok(value.targets.some((target) => target.form === words.n4 && target.provenance === 'observed'));
      assert.deepEqual(value.confusions, [{ kind: 'kanji', form: '歩', otherKind: 'kanji', otherForm: '足', provenance: 'observed' }]);
    });
    check('prototype names, unresolved imported words, notes and private glosses stay out of guidance', () => {
      for (const canary of ['toString', 'constructor', '秘密未収録語', 'PRIVATE_NOTE_CANARY', 'PRIVATE_IMPORTED_GLOSS', 'synthetic-source']) assert.ok(!payload.includes(canary), canary);
    });
    write('privacy-actual-model.json', await page.evaluate(() => window.__KAIRO_KAGAMI__.model()));
  });

  await runCase('freshness', async () => {
    await importFixture('before-correction', fixture([], lessonRows(words.n5, [true, true, true, true])));
    const before = teaching(await wordRequest());
    await importFixture('same-length-correction', fixture([], lessonRows(words.n5, [true, false, true, false])));
    const after = teaching(await wordRequest());
    check('same-length imported correction reaches the next actual request', () => {
      assert.deepEqual(cell(before, 'lexis', 'N5').measured, { seen: 4, right: 4 });
      assert.deepEqual(cell(after, 'lexis', 'N5').measured, { seen: 4, right: 2 });
      assert.equal(band(before, 'lexis').workingBand, 'N5'); assert.equal(band(after, 'lexis').workingBand, null);
      assert.equal(band(after, 'lexis').evidence, 'measured'); assert.notDeepEqual(before, after);
    });
  });

  await runCase('undo', async () => {
    const form = words.n1[0];
    const initial = await importFixture('review-undo', fixture([form], lessonRows(form, [true, true, true])));
    await openShelf(); await page.locator('#tray').click(); await page.locator('#review-start').click();
    await page.locator('#declare-recalled').click(); await page.locator('.grade.g-easy').click();
    await page.locator('#ai-coach').waitFor();
    const coach = await send('coach', () => page.locator('#ai-coach').click());
    const graded = await readAppRecord(page), value = teaching(coach);
    check('coach queries the acknowledged real review grade', () => {
      assert.deepEqual(cell(value, 'lexis', 'N1').measured, { seen: 4, right: 4 }); assert.equal(band(value, 'lexis').workingBand, 'N1');
    });
    await page.locator('.review-undo').click();
    const undone = await waitForAppRecord(page, (record) => record.revlog.some((row) => row[2] === 0));
    check('normal undo revokes the exact grade and restores the prior scheduler state', () => {
      assert.equal(graded.revlog.length, 1); assert.equal(undone.revlog.length, 2); assert.equal(undone.revlog[1][3], 0);
      assert.deepEqual(undone.srs, initial.record.srs);
    });
    const after = teaching(await wordRequest());
    check('next teaching request excludes the undone review judgment', () => {
      assert.deepEqual(cell(after, 'lexis', 'N1').measured, { seen: 3, right: 3 });
      assert.equal(band(after, 'lexis').workingBand, null); assert.equal(band(after, 'lexis').evidence, 'sparse');
    });
  });

  await runCase('failed-write', async () => {
    await importFixture('failed-outbound', fixture()); await openShelf(); await page.locator('#ai-link').click();
    const question = '保存失敗でもこの質問を残してください。';
    await page.locator('#chat-input').fill(question);
    await waitForAppRecord(page, (record) => JSON.stringify(record.teacherDrafts).includes(question));
    const before = await readAppRecordSnapshot(page), count = requests.length;
    await armRecordWriteFailure(page, 'quota', { roots: ['aiChat'] });
    try {
      await page.locator('#chat-send').click();
      await page.waitForFunction(() => window.__recordTestFault.fired > 0 && !document.querySelector('.chat-turn.thinking'));
      const after = await readAppRecordSnapshot(page);
      check('failed acknowledged outbound transaction sends no provider or mining request', () => {
        assert.equal(requests.length, count); assert.deepEqual(after.archive, before.archive);
        assert.deepEqual(learning(after.record), learning(before.record)); assert.deepEqual(after.record.aiChat, before.record.aiChat);
        assert.ok(JSON.stringify(after.record.teacherDrafts).includes(question));
      });
    } finally { write('failed-write-fault.json', await clearRecordWriteFailure(page)); }
  });

  await runCase('provider-change', async () => {
    await importFixture('pending-provider', fixture()); await openShelf(); await page.locator('#ai-link').click();
    const question = '接続が変わる間の質問です。', count = requests.length;
    await page.locator('#chat-input').fill(question); holdNextChat = true; await page.locator('#chat-send').click();
    await poll(() => held, 'held chat transport');
    const outgoing = requests[count]; teaching(outgoing);
    await configure('synthetic-teaching-v2');
    held.release(); held = null;
    await page.waitForFunction(() => !document.querySelector('.chat-turn.thinking'));
    const after = await readAppRecordSnapshot(page);
    check('a connection change cannot accept the earlier response or mine it', () => {
      assert.equal(outgoing.body.model, modelName); assert.equal(requests.length, count + 1);
      assert.equal(after.archive.turns.filter((row) => row.role === 'assistant').length, 0);
      assert.ok(JSON.stringify(after.record.teacherDrafts).includes(question)); assert.deepEqual(after.record.obslog, []);
    });
    await configure();
  });

  await runCase('import-epoch', async () => {
    await importFixture('epoch-before', fixture([], lessonRows(words.n5, [true, true, true, true])));
    await openShelf(); await page.locator('#ai-link').click(); await configure();
    const count = requests.length; await page.locator('#chat-input').fill('取り込む前の質問です。');
    holdNextChat = true; await page.locator('#chat-send').click(); await poll(() => held, 'held pre-import request');
    const old = requests[count]; assert.equal(band(teaching(old), 'lexis').workingBand, 'N5');
    await importFixture('epoch-after', fixture([], lessonRows(words.n5, [false, false, false, false])), { navigate: false });
    held.release(); held = null;
    const next = teaching(await wordRequest()), after = await readAppRecordSnapshot(page);
    check('import epoch rejects old response and the next request reads the new record', () => {
      assert.deepEqual(cell(next, 'lexis', 'N5').measured, { seen: 4, right: 0 });
      assert.ok(!after.archive.turns.some((row) => row.content === syntheticReply('chat', old.serial)));
      assert.ok(!requests.slice(count + 1).some((row) => row.surface === 'mine'));
      assert.equal(after.record.obslog.length, 4);
    });
  });

  await runCase('source-context', async () => {
    await importFixture('source-conversation', fixture()); await openShelf();
    await page.locator('[data-passage="wikinews:1403"]').first().click();
    await page.locator('#reader .tok[data-index="18"]').click();
    if (await page.locator('#sheet-close').isVisible()) await page.locator('#sheet-close').click();
    await page.locator('#reader-teacher').click(); await page.locator('#chat-input').waitFor();
    const deniedQuestion = 'この文の「世界」の意味を教えてください。', deniedCount = requests.length;
    await page.locator('#chat-input').fill(deniedQuestion); await page.locator('#chat-send').click();
    await page.waitForFunction(() => document.querySelector('#chat-status')?.textContent.includes('not available for tutor processing'));
    const denied = await readAppRecordSnapshot(page);
    check('an ineligible bundled source still cannot gain processing authority through adaptation', () => {
      assert.equal(requests.length, deniedCount); assert.equal(denied.archive.turns.length, 0);
      assert.ok(JSON.stringify(denied.record.teacherDrafts).includes(deniedQuestion));
    });
    write('source-policy-denied.json', denied);
    await openShelf();
    await page.locator('[data-passage="bunki-graded-n5-morning"]').first().click();
    await page.locator('#reader .tok[data-index="0"]').click();
    if (await page.locator('#sheet-close').isVisible()) await page.locator('#sheet-close').click();
    await page.locator('#reader-teacher').click(); await page.locator('#chat-input').waitFor();
    const before = await readAppRecord(page), source = before.teacherContexts.entries.find((entry) => entry.id === before.teacherContexts.activeRef);
    assert.ok(source?.quote && source.sourceKind === 'bundled-passage');
    const request = await sendChat('この文の「朝」の意味を教えてください。');
    check('normal reader conversation keeps exact source context separate from derived guidance', () => {
      teaching(request); assert.ok(request.body.system.slice(0, request.body.system.indexOf(LABEL)).includes(source.quote));
      assert.ok(request.archive.every((row) => row.contextRef === source.id));
      assert.ok(!JSON.stringify(teaching(request)).includes(source.quote));
    });
    await page.screenshot({ path: resolve(out, 'source-context-mobile.png'), fullPage: true });
  });

  if (selected === 'all') check('all six teaching request surfaces were actually observed', () => {
    assert.deepEqual([...new Set(requests.filter((row) => row.body.system.includes(LABEL)).map((row) => row.surface))].sort(), ['cards', 'chat', 'coach', 'examples', 'quiz', 'word-tutor']);
  });
} catch (error) { results.push({ name: activeCase, pass: false, fatal: true, error: String(error.stack || error) }); }
finally {
  if (timer) clearTimeout(timer);
  if (held) { held.release(); held = null; }
  if (context) { await context.close(); handles.browserContextsClosed++; }
  if (browser) { await browser.close(); handles.browserClosed = true; }
  await new Promise((done) => server.close(done)); handles.serverClosed = true;
  // Intentional aborts from the two pending-response cases can surface as a
  // native resource error. Keep those observations, with exact URL and case.
  const expectedAbortErrors = browserErrors.filter((row) => ['provider-change', 'import-epoch'].includes(row.case) && row.kind === 'console' &&
    row.location?.url === `${endpoint}/v1/messages` && /net::ERR_FAILED|net::ERR_ABORTED/u.test(row.error));
  const unexpectedErrors = browserErrors.filter((row) => !expectedAbortErrors.includes(row));
  const pass = !timedOut && results.length === selectedCases.length && results.every((row) => row.pass) &&
    !externalRequests.length && !routeErrors.length && !unexpectedErrors.length && handles.browserContextsCreated === 1 && handles.browserContextsClosed === 1 && handles.browserClosed;
  write('requests.json', requests);
  write('receipt.json', { package: 'PI-ADAPT-07', requirements: ['ADAPT-01', 'MODEL-01'], suite: 'actual-request-teaching-context', selectedCase: selected, pass,
    site, artifactSha256: identity.artifactSha256, sourceAssetSha256: identity.sourceAssetSha256, origin, handles, timedOut,
    verifierSha256: sha(readFileSync(fileURLToPath(import.meta.url))), inputWords: words, results, checks, externalRequests, routeErrors,
    browserErrors, expectedAbortErrors, servedFiles: [...servedFiles].map(([path, sha256]) => ({ path, sha256 })),
    limitations: ['Synthetic provider replies; no live model quality, audio, proficiency, JLPT prediction, or full-journey acceptance.',
      'One Chromium mobile viewport; successful steps use ordinary controls and imported synthetic learner records.',
      'Existing read-only model instrument and actual IndexedDB observations; one explicit negative host write fault.',
      'Bundled source conversation only; personal-source approval lifecycle and multi-context ownership remain separate gates.'] });
  console.log(JSON.stringify({ pass, cases: results.filter((row) => row.pass).length, total: results.length, checks: checks.length, requests: requests.length, out, handles }));
  if (!pass) process.exitCode = 1;
}
