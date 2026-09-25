/**
 * AI surface, archive, and restore journeys on one verified runtime artifact.
 *
 * Drives the six deployed AI surfaces — word-sheet tutor, graded examples,
 * tutor chat, quiz, post-review coach, custom reading room — in real Chromium
 * against a stubbed provider, and asserts the three honesty properties the
 * ledger demanded:
 *
 *   1. transport honesty — a request that never answers is aborted at the
 *      10 s budget (mirroring packages/ai/src/runtime.ts) and every pending
 *      考え中… resolves to the caller's own quiet failure line, never a
 *      dead spinner;
 *   2. "not a word is lost" — every outbound learner message and every reply,
 *      on every surface, lands in the append-only IndexedDB archive, and
 *      an unavailable archive refuses unacknowledged learner writes;
 *   3. accepted chat turns survive in the native learner record and archive,
 *      while the visible history lazily unfolds earlier turns.
 *
 * The provider seam is probed live: a separately seeded device configuration
 * binds the stub credential to its origin. Portable learner data grants no
 * transport authority. The import/provider verifier drives the settings UI.
 *
 * Usage: node verify-corridor-ai.mjs
 */

import { createServer } from 'node:http';
import { isDeepStrictEqual } from 'node:util';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { readAppRecord, readAppRecordSnapshot, waitForAppRecord, armRecordWriteFailure, clearRecordWriteFailure } from './record-test-support.mjs';

const CORRIDOR_DIR = resolveCorridorSite();
const OUT = resolveCorridorEvidence();
const identity = JSON.parse(readFileSync(resolve(CORRIDOR_DIR, 'build-identity.json'), 'utf8'));
const sourceSha256 = createHash('sha256').update(readFileSync(resolve(CORRIDOR_DIR, 'corridor.js'))).digest('hex');
const consoleErrors = [];
const externalRequests = [];
let browserVersion;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function startCorridorServer(rootDir = CORRIDOR_DIR) {
  const server = createServer((request, response) => {
    const path = decodeURIComponent((request.url ?? '/').split('?')[0]);
    const rel = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
    const file = resolve(rootDir, rel);
    if (!file.startsWith(rootDir + sep) || !existsSync(file) || !statSync(file).isFile()) {
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
    server.listen(0, '127.0.0.1', () => {
      ok({ server, base: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

/* --------------------------------------------------------------- harness */
const results = [];
let failures = 0;

function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail: String(detail) });
  if (!pass) failures += 1;
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`);
}

/* ------------------------------------------------- seeds and provider stub */
const OVERRIDE_BASE_URL = 'https://stub.invalid';
const OVERRIDE_MODEL = 'claude-test-probe';
const MARKER = 'MARKER-TURN-ONE 昔の言葉';

// A valid learner envelope: five memorized N5 words, all with due review
// state, so the tray offers both the quiz (≥4 words) and a review session
// whose end screen carries the coach. Provider authority is separate below.
function seedEnvelope() {
  const words = ['学校', '電話', '先生', '時間', '天気'];
  const due = new Date(Date.now() - 86400000).toISOString();
  const last = new Date(Date.now() - 2 * 86400000).toISOString();
  const srs = {};
  for (const w of words) {
    srs[`word:${w}`] = {
      due,
      last_review: last,
      stability: 5,
      difficulty: 5,
      elapsed_days: 1,
      scheduled_days: 1,
      reps: 3,
      lapses: 0,
      learning_steps: 0,
      state: 2,
    };
  }
  return {
    v: 1,
    taken: words.map((w, i) => ({ t: 'word', id: w, label: w, ts: 1755000000000 + i })),
    srs,
  };
}

// Runs before corridor.js on every navigation: seed the key + envelope and
// replace fetch for the provider endpoint only. Mode rides localStorage so a
// reload keeps it: 'ok' answers instantly per surface; 'hang' never settles
// but honours the abort signal exactly the way a real stalled fetch does.
function initScript(envelopeJson) {
  return `(() => {
    try {
      localStorage.setItem('kairo-ai-provider-v1', ${JSON.stringify(JSON.stringify({ v: 1, baseUrl: OVERRIDE_BASE_URL, model: OVERRIDE_MODEL, credential: { origin: OVERRIDE_BASE_URL, key: 'sk-ant-test-key' } }))});
      if (!localStorage.getItem('__ai_seeded')) {
        localStorage.setItem('kairo-corridor-v1', ${JSON.stringify(envelopeJson)});
        localStorage.setItem('__ai_seeded', '1');
      }
    } catch {}
    const realFetch = window.fetch.bind(window);
    window.__AI_STUB = { calls: 0, urls: [], models: [] };
    window.fetch = (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (!url.includes('/v1/messages')) return realFetch(input, init);
      window.__AI_STUB.calls += 1;
      window.__AI_STUB.urls.push(url);
      const mode = localStorage.getItem('__ai_stub_mode') || 'ok';
      if (mode === 'hang') {
        return new Promise((_, reject) => {
          const abort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
          if (init.signal) {
            if (init.signal.aborted) return abort();
            init.signal.addEventListener('abort', abort);
          }
          // otherwise: the socket that never answers
        });
      }
      const body = JSON.parse(init.body);
      window.__AI_STUB.models.push(body.model);
      const system = String(body.system || '');
      let text = 'stub reply ' + window.__AI_STUB.calls;
      if (system.includes('observations about the LEARNER')) {
        // 鏡 the miner: two valid observations, one invalid code, one
        // unconfirmable subject, one untyped and one mistyped subject
        // (both real deck words) — the durability boundary must keep
        // exactly the two the law admits
        text = JSON.stringify([
          { kind: 'sensei', subject: '天気', subjectType: 'word', polarity: 1, code: 'misread' },
          { kind: 'sensei', subject: '天気', subjectType: 'word', polarity: 3, code: 'not-a-code' },
          { kind: 'sensei', subject: 'ゾロメ語', subjectType: 'word', polarity: 1, code: 'sense-miss' },
          { kind: 'sensei', subject: '時間', polarity: 1, code: 'misread' },
          { kind: 'sensei', subject: '先生', subjectType: 'reading', polarity: 1, code: 'misread' },
          { kind: 'confuse', subject: '学校', subjectType: 'word', other: '天気', otherType: 'word' },
        ]);
      } else if (system.includes('Output ONLY a JSON array')) {
        text = JSON.stringify([1, 2, 3, 4, 5].map((n) => ({
          q: '問' + n, opts: ['a', 'b', 'c', 'd'], right: 0, why: 'because ' + n,
        })));
      } else if (system.includes('Nx | Japanese sentence | full reading of the sentence in hiragana | English')) {
        text = [
          'N5 | 学校へ行く。 | がっこうへいく。 | I go to school.',
          'N5 | 学校は近い。 | がっこうはちかい。 | The school is near.',
          'N4 | 学校で友だちと話す。 | がっこうでともだちとはなす。 | I talk with friends at school.',
          'N4 | 学校の帰りに本を買った。 | がっこうのかえりにほんをかった。 | I bought a book on the way home.',
          'N3 | 学校の行事が続く。 | がっこうのぎょうじがつづく。 | School events continue.',
          'N3 | 学校を休むと決めた。 | がっこうをやすむときめた。 | I decided to rest from school.',
        ].join('\\n');
      } else if (system.includes('reading passage')) {
        // the 札 line drives autonomous card creation: two makeable words,
        // one the deck already holds (天気), one no dictionary confirms
        text = '朝、学校（がっこう）へ行く。犬（いぬ）と猫（ねこ）を見た。天気（てんき）がいい。友だちと帰る。\\n札：犬、猫、天気、ゾロメ語';
      } else if (system.includes('choose vocabulary cards')) {
        text = '散歩、音楽、天気、ゾロメ語';
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] }),
      });
    };
  })();`;
}

const logAll = async (page, surface) => {
  const rows = (await readAppRecordSnapshot(page)).archive.turns;
  return surface === undefined ? rows : rows.filter((row) => row.surface === surface);
};
const sameData = (left, right) => isDeepStrictEqual(
  { record: left.record, archive: left.archive },
  { record: right.record, archive: right.archive },
);
const wordCaptures = (record, id) => record.taken.filter((row) => row.t === 'word' && row.id === id);
const hasNote = (record, text) => (record.obslog || []).some((row) => row[1] === 'note' && String(row[3]).includes(text));

async function importThroughUi(page, text, name) {
  if (!await page.locator('#import-file').count()) await page.locator('#tray').click();
  await page.locator('#import-file').waitFor({ state: 'attached' });
  await page.evaluate(() => { window.__PRE_IMPORT_PAGE = 1; });
  await page.locator('#import-file').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') });
  await page.waitForFunction(() => !window.__PRE_IMPORT_PAGE && document.body.dataset.ready === '1', null, { timeout: 30000 });
  return readAppRecordSnapshot(page);
}

async function exportThroughUi(page, name) {
  if (!await page.locator('#export-store').count()) await page.locator('#tray').click();
  const downloadReady = page.waitForEvent('download');
  await page.locator('#export-store').click();
  const download = await downloadReady;
  const destination = resolve(OUT, name);
  await download.saveAs(destination);
  return readFileSync(destination, 'utf8');
}

async function waitRows(page, surface, min, timeout = 8000) {
  const deadline = Date.now() + timeout;
  let rows = [];
  while (Date.now() < deadline) {
    rows = await logAll(page, surface);
    if (rows.length >= min) return rows;
    await page.waitForTimeout(120);
  }
  return rows;
}

function exchangeShape(rows, surface, model) {
  const user = rows.find((r) => r.role === 'user');
  const reply = rows.find((r) => r.role === 'assistant');
  return (
    !!user &&
    !!reply &&
    rows.every(
      (r) =>
        r.surface === surface &&
        typeof r.content === 'string' &&
        r.content.length > 0 &&
        r.model === model &&
        Number.isFinite(r.ts),
    )
  );
}

/* ------------------------------------------------------------------ main */
let suiteBrowser, suiteServer;
async function main() {
  const { server, base } = await startCorridorServer();
  suiteServer = server;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  suiteBrowser = browser;
  browserVersion = browser.version();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await silenceBrowserAudio(context);
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === base) return route.continue();
    externalRequests.push(route.request().url());
    return route.abort();
  });
  const seedJson = JSON.stringify(seedEnvelope());
  await context.addInitScript(initScript(seedJson));
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  const open = async (query = '') => {
    await page.goto(`${base}/index.html${query}`, { waitUntil: 'load' });
    await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
  };

  const settleSheet = async () => {
    await page
      .waitForFunction(() => !document.querySelector('#sheet .dictionary-opening'), null, {
        timeout: 8000,
      })
      .catch(() => {});
    await page.waitForTimeout(400);
  };

  const openWordSheet = async () => {
    await page.fill('#search', '学校');
    await page.waitForSelector('[data-result="word:学校"]', { timeout: 15000 });
    await page.click('[data-result="word:学校"]');
    await page.waitForSelector('#sheet', { timeout: 8000 });
    await settleSheet();
  };

  const sendChat = async (text) => {
    await page.fill('#chat-input', text);
    await page.click('#chat-send');
    await page.waitForFunction(
      () =>
        !document.querySelector('.chat-turn.thinking') &&
        document.querySelector('#chat-send') &&
        !document.querySelector('#chat-send').disabled,
      null,
      { timeout: 15000 },
    );
    // This helper drives the successful provider mode. Wait for this exact
    // exchange's mining receipt before subsequent exports or fixture imports.
    const ownExchange = (await logAll(page, 'chat')).filter((row) => row.role === 'user' && row.content === text).at(-1)?.xid;
    if (!ownExchange) throw new Error('The submitted chat message has no native archive receipt');
    await waitForAppRecord(page, (record) => (record.obslog || []).some((row) => row[1] === 'sensei' && row[5] === ownExchange),
      { description: 'mining acknowledgement for the submitted chat exchange' });
  };

  // ------------------------------------------ the budget and the seam exist
  console.log('\n— the runtime contract');
  await open('?entry=shelf');
  const contract = await page.evaluate(`({
    timeoutMs: window.__KAIRO_AI__.timeoutMs,
    provider: window.__KAIRO_AI__.provider(),
  })`);
  check(
    'the request budget mirrors packages/ai (10 s)',
    contract.timeoutMs === 10000,
    `timeoutMs=${contract.timeoutMs}`,
  );
  check(
    'explicit device settings reach the provider seam',
    contract.provider.baseUrl === OVERRIDE_BASE_URL && contract.provider.model === OVERRIDE_MODEL,
    `${contract.provider.baseUrl} · ${contract.provider.model}`,
  );

  // ----------------------------------- surface 1+2 · word tutor and examples
  console.log('\n— word-sheet tutor and graded examples');
  await openWordSheet();
  await page.locator('#sheet .ai-ask', { hasText: '先生に聞く' }).click();
  await page.waitForFunction(
    () => /stub reply/.test(document.querySelector('#sheet .ai-answer')?.textContent || ''),
    null,
    { timeout: 8000 },
  );
  const tutorRows = await waitRows(page, 'word-tutor', 2);
  check(
    'word tutor · the exchange lands whole in the archive',
    exchangeShape(tutorRows, 'word-tutor', OVERRIDE_MODEL) &&
      tutorRows.every((r) => r.contextRef === 'word:学校'),
    `${tutorRows.length} rows, contextRef=${tutorRows[0]?.contextRef}`,
  );

  await page.locator('#sheet .ai-ask', { hasText: '例文をつくる' }).click();
  await page.waitForFunction(() => document.querySelectorAll('#sheet .ai-ex').length >= 4, null, {
    timeout: 8000,
  });
  const exampleRows = await waitRows(page, 'examples', 2);
  check(
    'graded examples · the exchange lands whole in the archive',
    exchangeShape(exampleRows, 'examples', OVERRIDE_MODEL) &&
      exampleRows.every((r) => r.contextRef === 'word:学校'),
    `${exampleRows.length} rows`,
  );
  const stubSeen = await page.evaluate('window.__AI_STUB');
  check(
    'the request actually used the overridden base URL and model',
    stubSeen.urls.every((u) => u.startsWith(`${OVERRIDE_BASE_URL}/`)) &&
      stubSeen.models.every((m) => m === OVERRIDE_MODEL),
    `${stubSeen.calls} calls → ${stubSeen.urls[0]} · ${stubSeen.models[0]}`,
  );

  // --------------------------------------- surface 3+4 · quiz and the coach
  console.log('\n— the quiz and the post-review coach');
  await page.click('#sheet-close');
  await page.click('#tray');
  await page.waitForSelector('#aiq-start', { timeout: 8000 });
  await page.click('#aiq-start');
  await page.waitForSelector('.aiq-q', { timeout: 8000 });
  const quizRows = await waitRows(page, 'quiz', 2);
  check(
    'quiz · the exchange lands whole in the archive',
    exchangeShape(quizRows, 'quiz', OVERRIDE_MODEL),
    `${quizRows.length} rows`,
  );

  // POL-13 · the run itself is durable: reload mid-quiz and the tray offers
  // the way back in — the SAME tutor-written question stands, and the stub
  // counts zero new provider calls (the init script resets it per navigation)
  const quizQBefore = await page.evaluate(`document.querySelector('.aiq-q')?.textContent ?? ''`);
  await open('?entry=shelf');
  await page.click('#tray');
  await page.waitForSelector('#aiq-resume', { timeout: 8000 });
  await page.click('#aiq-resume');
  await page.waitForSelector('.aiq-q', { timeout: 8000 });
  const quizResume = await page.evaluate(`({
    q: document.querySelector('.aiq-q')?.textContent ?? '',
    calls: window.__AI_STUB.calls,
  })`);
  check(
    'quiz · a mid-quiz reload resumes the same written questions — not a word lost, no new request',
    quizQBefore.length > 0 && quizResume.q === quizQBefore && quizResume.calls === 0,
    `"${quizResume.q}" · calls since reload ${quizResume.calls}`,
  );
  // Discard through the same durable command as the learner's tray control.
  await page.click('#back');
  await page.click('#aiq-drop');
  await waitForAppRecord(page, (record) => record.aiQuiz === null, { description: 'quiz discard' });

  await open('?entry=shelf');
  await page.click('#tray');
  await page.waitForSelector('#review-start', { timeout: 8000 });
  await page.click('#review-start');
  for (let i = 0; i < 8; i += 1) {
    if (await page.locator('#ai-coach').count()) break;
    // the zen room asks for the recall declaration first (T-06)
    await page.waitForSelector('#declare-recalled', { timeout: 10000 });
    await page.click('#declare-recalled');
    await page.waitForSelector('.grade.g-easy', { timeout: 8000 });
    await page.click('.grade.g-easy');
    await page.waitForTimeout(250);
  }
  await page.waitForSelector('#ai-coach', { timeout: 8000 });
  await page.click('#ai-coach');
  await page.waitForFunction(
    () => /stub reply/.test(document.querySelector('.ai-answer')?.textContent || ''),
    null,
    { timeout: 8000 },
  );
  const coachRows = await waitRows(page, 'coach', 2);
  check(
    'coach · the exchange lands whole in the archive',
    exchangeShape(coachRows, 'coach', OVERRIDE_MODEL),
    `${coachRows.length} rows`,
  );

  // ------------------------------------------- surface 5 · the reading room
  console.log('\n— the custom reading room');
  await open('?entry=shelf');
  await page.click('#airead-link');
  await page.waitForSelector('#airead-make', { timeout: 8000 });
  await page.click('#airead-make');
  await page.waitForSelector('.airead-body', { timeout: 8000 });
  const readingRows = await waitRows(page, 'reading', 2);
  check(
    'reading room · the exchange lands whole in the archive',
    exchangeShape(readingRows, 'reading', OVERRIDE_MODEL),
    `${readingRows.length} rows`,
  );

  // Reading generation persists dictionary-checked suggestions only. The
  // existing 天気 capture is preserved and the invented word is rejected.
  const readingRecord = await readAppRecord(page);
  const afterReading = {
    dog: wordCaptures(readingRecord, '犬'), cat: wordCaptures(readingRecord, '猫'),
    weather: wordCaptures(readingRecord, '天気'), ghost: wordCaptures(readingRecord, 'ゾロメ語'),
    made: readingRecord.aiReading?.made || null,
    candidates: readingRecord.aiReading?.candidates?.wordIds || [],
    ...await page.evaluate(() => ({
      bodyHasFuda: document.querySelector('.airead-body')?.textContent.includes('札：') || false,
      chips: [...document.querySelectorAll('[data-airead-candidate]')].map((c) => c.dataset.aireadCandidate),
    })),
  };
  check(
    'reading · generating a passage leaves suggestions without creating review debt',
    afterReading.dog.length === 0 && afterReading.cat.length === 0 && afterReading.made === null,
    `犬×${afterReading.dog.length} 猫×${afterReading.cat.length}`,
  );
  check(
    'reading · a deck word is not duplicated; an unconfirmable word makes no card',
    afterReading.weather.length === 1 && afterReading.ghost.length === 0,
    `天気×${afterReading.weather.length} ゾロメ語×${afterReading.ghost.length}`,
  );
  check(
    'reading · dictionary-checked candidates persist and the 札 line stays out of the ink',
    JSON.stringify(afterReading.candidates) === JSON.stringify(['犬', '猫', '天気']) && !afterReading.bodyHasFuda,
    `candidates=${JSON.stringify(afterReading.candidates)}`,
  );
  check(
    'reading · suggestions stand as word doors under the passage',
    JSON.stringify(afterReading.chips) === JSON.stringify(['犬', '猫', '天気']),
    `chips=${JSON.stringify(afterReading.chips)}`,
  );

  const scheduleBeforeTake = { srs: readingRecord.srs || {}, revlog: readingRecord.revlog || [] };
  await page.click('[data-airead-take="犬"]');
  const takenRecord = await waitForAppRecord(page, (record) => wordCaptures(record, '犬').length === 1,
    { description: 'explicit reading capture' });
  const explicitReadingTake = { dog: wordCaptures(takenRecord, '犬'), cat: wordCaptures(takenRecord, '猫'),
    revlog: takenRecord.revlog || [], srs: takenRecord.srs || {} };
  check('one explicit reading suggestion adds only that word without inventing a recall grade',
    explicitReadingTake.dog.length === 1 && Number.isFinite(explicitReadingTake.dog[0].started) && explicitReadingTake.cat.length === 0 &&
    JSON.stringify(explicitReadingTake.revlog) === JSON.stringify(scheduleBeforeTake.revlog) &&
    JSON.stringify(explicitReadingTake.srs) === JSON.stringify(scheduleBeforeTake.srs), JSON.stringify(explicitReadingTake));

  // ---------------------------- the 札を頼む door: curation on demand
  console.log('\n— the tutor curates cards on demand');
  await open('?entry=shelf');
  await page.click('#ai-link');
  await page.waitForSelector('#ai-cards-make', { timeout: 8000 });
  await page.click('#ai-cards-make');
  await page.waitForFunction(
    () => /先生が\d+枚作った|The tutor made \d+ card/.test(document.body.textContent),
    null,
    { timeout: 8000 },
  );
  const curationRecord = await readAppRecord(page);
  const afterDoor = { walk: wordCaptures(curationRecord, '散歩'), music: wordCaptures(curationRecord, '音楽'),
    weather: wordCaptures(curationRecord, '天気'), ghost: wordCaptures(curationRecord, 'ゾロメ語') };
  check(
    '札 door · new words become provenance-marked cards; known and unconfirmable do not',
    afterDoor.walk.length === 1 &&
      afterDoor.walk[0].by === 'sensei' &&
      afterDoor.music.length === 1 &&
      afterDoor.weather.length === 1 &&
      afterDoor.ghost.length === 0,
    `散歩×${afterDoor.walk.length} 音楽×${afterDoor.music.length} 天気×${afterDoor.weather.length}`,
  );
  const cardsRows = await waitRows(page, 'cards', 2);
  check(
    '札 door · the exchange lands whole in the archive',
    exchangeShape(cardsRows, 'cards', OVERRIDE_MODEL),
    `${cardsRows.length} rows`,
  );
  check('tutor-authored surfaces do not create mining exchanges', (await logAll(page, 'mine')).length === 0);

  // ------------------------- surface 6 · chat, and the end of the 24-turn cap
  console.log('\n— chat: turn 25 destroys nothing');
  await open('?entry=shelf');
  await page.click('#ai-link');
  await page.waitForSelector('#chat-input', { timeout: 8000 });
  await sendChat(MARKER);
  const chatFirst = await waitRows(page, 'chat', 2);
  check(
    'chat · the exchange lands whole in the archive',
    exchangeShape(chatFirst, 'chat', OVERRIDE_MODEL) && chatFirst[0].content === MARKER,
    `${chatFirst.length} rows, first="${chatFirst[0]?.content?.slice(0, 24)}"`,
  );

  for (let n = 2; n <= 21; n += 1) await sendChat(`メッセージ ${n} 番`);
  const chatAll = await waitRows(page, 'chat', 42);
  const storedWindow = (await readAppRecord(page)).aiChat.length;
  check(
    '42 turns later, turn 1 still stands in the archive',
    chatAll.length >= 42 && chatAll[0].role === 'user' && chatAll[0].content === MARKER,
    `${chatAll.length} archived turns; first is still the marker`,
  );
  check(
    'all accepted structured chat turns survive in the learner record',
    storedWindow === 42,
    `stored aiChat length ${storedWindow}`,
  );
  const beforeUnfold = await page.evaluate(`({
    turns: document.querySelectorAll('.chat-turn').length,
    marker: document.body.textContent.includes(${JSON.stringify(MARKER)}),
    earlier: !!document.querySelector('#chat-earlier'),
  })`);
  await page.click('#chat-earlier');
  await page.waitForTimeout(300);
  const afterUnfold = await page.evaluate(`({
    turns: document.querySelectorAll('.chat-turn').length,
    marker: document.body.textContent.includes(${JSON.stringify(MARKER)}),
  })`);
  check(
    'the log lazy-renders: recent window first, 前の会話 unfolds the rest',
    beforeUnfold.earlier &&
      !beforeUnfold.marker &&
      afterUnfold.marker &&
      afterUnfold.turns > beforeUnfold.turns,
    `${beforeUnfold.turns} → ${afterUnfold.turns} turns; marker hidden→shown`,
  );

  // A fresh boot reconstructs visible history from the durable transcript.
  await open('?entry=shelf');
  await page.click('#ai-link');
  await page.waitForFunction(() => document.querySelectorAll('.chat-turn').length > 24, null, {
    timeout: 8000,
  });
  const rebootTurns = await page.evaluate(`document.querySelectorAll('.chat-turn').length`);
  check(
    'after reload the visible history renders from the archive (> the 24 cap)',
    rebootTurns > 24,
    `${rebootTurns} turns rendered from the durable transcript`,
  );

  // ------------------------------------ transport honesty · the 10 s budget
  console.log('\n— timeout: the stalled provider and the quiet line');
  await page.evaluate(`localStorage.setItem('__ai_stub_mode', 'hang')`);
  const chatT0 = Date.now();
  await page.fill('#chat-input', 'タイムアウトの探査');
  await page.click('#chat-send');
  await page.locator('.chat-turn.thinking').waitFor({ state: 'visible', timeout: 4000 });
  const thinkingUp = await page.locator('.chat-turn.thinking').count();
  await page.waitForFunction(
    () => !!document.querySelector('#chat-status')?.textContent?.trim() &&
      !!document.querySelector('.chat-turn.app') &&
      !document.querySelector('.chat-turn.thinking') &&
      document.querySelector('#chat-send')?.disabled === false,
    null,
    { timeout: 15000 },
  );
  const chatElapsed = Date.now() - chatT0;
  const chatAfterTimeout = await page.evaluate(`({
    thinking: document.querySelectorAll('.chat-turn.thinking').length,
    sendDisabled: document.querySelector('#chat-send')?.disabled ?? null,
  })`);
  check(
    'chat · a never-answering provider resolves to the quiet line at ~10 s',
    thinkingUp === 1 && chatElapsed >= 9000 && chatElapsed <= 13500,
    `考え中 shown, failure line after ${(chatElapsed / 1000).toFixed(1)} s`,
  );
  check(
    'chat · no dead 考え中 remains and the door reopens',
    chatAfterTimeout.thinking === 0 && chatAfterTimeout.sendDisabled === false,
    JSON.stringify(chatAfterTimeout),
  );
  // 42 turns stood before the stalled send; its user turn and the app's own
  // line bring the archive to 44 — the reply that never came adds nothing
  const timeoutRows = await waitRows(page, 'chat', 44);
  const lastRows = timeoutRows.slice(-2);
  check(
    "chat · even the failed exchange is archived — the words, then the app's own line",
    lastRows[0]?.role === 'user' &&
      lastRows[0]?.content === 'タイムアウトの探査' &&
      lastRows[1]?.role === 'app',
    lastRows.map((r) => r.role).join(' → '),
  );

  // ---------------- E3-A open finding 1 · pending survives leaving the page
  // The spinner and the sealed 送る must not live in one render's closure:
  // walking away mid-question and coming back re-armed the door, and a second
  // send duplicated the question in the durable transcript.
  const pendingBefore = (await logAll(page, 'chat')).length;
  await page.fill('#chat-input', '待つあいだに歩く');
  await page.click('#chat-send');
  await page.waitForSelector('.chat-turn.thinking', { timeout: 4000 });
  await page.click('#back');
  await page.waitForSelector('#ai-link', { timeout: 8000 });
  await page.click('#ai-link');
  await page.waitForSelector('#chat-input', { timeout: 8000 });
  const backOnPage = await page.evaluate(`({
    thinking: document.querySelectorAll('.chat-turn.thinking').length,
    sendDisabled: document.querySelector('#chat-send')?.disabled ?? null,
  })`);
  check(
    'chat · walking away and back mid-question keeps 考え中 and the sealed 送る',
    backOnPage.thinking === 1 && backOnPage.sendDisabled === true,
    JSON.stringify(backOnPage),
  );
  // the button is sealed; Enter on the field is the vector that bypassed it
  await page.fill('#chat-input', '二重送信の探査');
  await page.press('#chat-input', 'Enter');
  await page.waitForTimeout(600);
  const pendingDuring = (await logAll(page, 'chat')).length;
  check(
    'chat · a send while pending is refused — no duplicate lands in the archive',
    pendingDuring === pendingBefore + 1,
    `${pendingBefore} rows + the one pending question = ${pendingDuring}`,
  );
  await page.waitForFunction(
    () =>
      !document.querySelector('.chat-turn.thinking') &&
      document.querySelector('#chat-send') &&
      !document.querySelector('#chat-send').disabled,
    null,
    { timeout: 15000 },
  );

  const tutorT0 = Date.now();
  await open('?entry=shelf');
  await openWordSheet();
  await page.locator('#sheet .ai-ask', { hasText: '先生に聞く' }).click();
  await page.waitForFunction(
    () => (document.querySelector('#sheet .ai-answer')?.textContent || '').includes('thinking'),
    null,
    { timeout: 4000 },
  );
  await page.waitForFunction(
    () =>
      (document.querySelector('#sheet .ai-answer')?.textContent || '').includes('could not answer'),
    null,
    { timeout: 15000 },
  );
  const tutorElapsed = Date.now() - tutorT0;
  const tutorButtonFree = await page.evaluate(
    `[...document.querySelectorAll('#sheet .ai-ask')].every((b) => !b.disabled)`,
  );
  check(
    'word tutor · the stalled request takes the same failure path, door reopens',
    tutorButtonFree && tutorElapsed <= 25000,
    `failure line after ${(tutorElapsed / 1000).toFixed(1)} s including sheet walk`,
  );

  // -------------- E3-A open finding 2 · the archive reads back to its sheet
  // A reply that arrived after its word sheet closed used to be archived
  // where no surface could read it: the reopened sheet started from an empty
  // out. Now the sheet hydrates from the archive — same words, no new call.
  await page.evaluate(`localStorage.setItem('__ai_stub_mode', 'ok')`);
  await open('?entry=shelf');
  await openWordSheet();
  await page.waitForFunction(
    () =>
      /stub reply/.test(document.querySelector('#sheet .ai-answer')?.textContent || '') &&
      document.querySelectorAll('#sheet .ai-ex').length >= 4,
    null,
    { timeout: 8000 },
  );
  const readBack = await page.evaluate(`({
    answer: (document.querySelector('#sheet .ai-answer')?.textContent || '').slice(0, 24),
    examples: document.querySelectorAll('#sheet .ai-ex').length,
    calls: window.__AI_STUB.calls,
  })`);
  check(
    'word sheet · the archived tutor answer and examples read back on reopen — no new request',
    /stub reply/.test(readBack.answer) && readBack.examples >= 4 && readBack.calls === 0,
    `"${readBack.answer}" · ${readBack.examples} examples · ${readBack.calls} calls`,
  );

  // A missing archive at boot cannot prove a consistent learner generation.
  console.log('\n— missing IndexedDB fails closed with the draft intact');
  const brokenContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await silenceBrowserAudio(brokenContext);
  await brokenContext.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === base) return route.continue();
    externalRequests.push(route.request().url());
    return route.abort();
  });
  await brokenContext.addInitScript(initScript(seedJson));
  await brokenContext.addInitScript(`Object.defineProperty(window, 'indexedDB', { value: undefined });`);
  const broken = await brokenContext.newPage();
  await broken.goto(`${base}/index.html?entry=shelf`, { waitUntil: 'load' });
  await broken.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
  await broken.click('#ai-link');
  await broken.fill('#chat-input', '記録が壊れていても');
  await broken.press('#chat-input', 'Enter');
  check('missing IndexedDB refuses the learner write and keeps the question draft',
    await broken.inputValue('#chat-input') === '記録が壊れていても' &&
      await broken.locator('#chat-send').isDisabled() && await broken.locator('#store-alert').isVisible());
  // No native record exists in this context. These bytes are the untouched
  // legacy migration input, not a substitute for an active learner record.
  const brokenSource = await broken.evaluate(() => ({
    text: localStorage.getItem('kairo-corridor-v1'), calls: window.__AI_STUB.calls,
  }));
  check('an unavailable archive preserves legacy input and sends no provider or mining request',
    brokenSource.text === seedJson && brokenSource.calls === 0);
  const unavailableExport = await broken.evaluate('window.__KAIRO_AI__.exportRecord()');
  check('an unavailable archive refuses a complete-looking backup', unavailableExport.text === null && !!unavailableExport.warning);
  // A historical partial legacy export remains importable with its loss
  // marker. This fixture does not pretend the new refused export succeeded.
  const brokenExport = { text: JSON.stringify({ v: 1, taken: [], aiEvidenceIncomplete: true }) };
  await brokenContext.close();

  // ------------------------- 鏡 KAGAMI PR 一 · the ledger's ear
  console.log('\n— 鏡: the sensei mines its own exchanges into the ledger');
  await open('?entry=shelf');
  await page.click('#ai-link');
  await page.waitForSelector('#chat-input', { timeout: 8000 });
  await sendChat('天気の言葉を教えて');
  const mineRows = await waitRows(page, 'mine', 2);
  check(
    'the mining exchange itself is archived whole under surface mine',
    exchangeShape(mineRows, 'mine', OVERRIDE_MODEL),
    `${mineRows.length} rows`,
  );
  const minedRecord = await waitForAppRecord(page, (record) => (record.obslog || []).some((row) => row[1] === 'sensei'),
    { description: 'mined observations' });
  const minedRows = minedRecord.obslog || [];
  const mined = {
    sensei: minedRows.filter((r) => r[1] === 'sensei'),
    confuse: minedRows.filter((r) => r[1] === 'confuse'),
    ghost: minedRows.filter((r) => String(r[2]).includes('ゾロメ語') || String(r[3]).includes('ゾロメ語')),
    badCode: minedRows.filter((r) => r[1] === 'sensei' && r[4] === 'not-a-code'),
    badType: minedRows.filter((r) => r[1] === 'sensei' && (String(r[2]).includes('時間') || String(r[2]).includes('先生'))),
  };
  check(
    'a mined observation lands typed: [t, sensei, key, polarity, code, ref]',
    mined.sensei.length >= 1 &&
      mined.sensei.every(
        (r) =>
          r.length === 6 &&
          r[2] === 'word:天気' &&
          r[3] === 1 &&
          r[4] === 'misread' &&
          typeof r[5] === 'string' &&
          r[5].length > 0,
      ),
    JSON.stringify(mined.sensei[0]),
  );
  check(
    'a confusion edge lands typed: [t, confuse, key, otherKey]',
    mined.confuse.length >= 1 &&
      mined.confuse.every((r) => r.length === 4 && r[2] === 'word:学校' && r[3] === 'word:天気'),
    JSON.stringify(mined.confuse[0]),
  );
  check(
    'an unconfirmable subject and an unknown code write NOTHING — fail closed',
    mined.ghost.length === 0 && mined.badCode.length === 0,
    `ghost ${mined.ghost.length} · bad-code ${mined.badCode.length}`,
  );
  check(
    'a subject without a clear word/kanji type writes NOTHING — no default type',
    mined.badType.length === 0,
    `untyped/mistyped subjects kept: ${mined.badType.length}`,
  );
  // the validator must accept what the miner wrote: a reload replays the
  // envelope through validStoreEnvelope — quarantine would zero the rows
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
  const reloadedRows = (await readAppRecord(page)).obslog || [];
  const afterReload = {
    sensei: reloadedRows.filter((r) => r[1] === 'sensei').length,
    confuse: reloadedRows.filter((r) => r[1] === 'confuse').length,
    alert: await page.locator('#store-alert').isVisible(),
  };
  check(
    'the envelope validator accepts the mined kinds across a reload — no quarantine',
    afterReload.sensei >= 1 && afterReload.confuse >= 1 && afterReload.alert === false,
    JSON.stringify(afterReload),
  );
  const minerSource = readFileSync(resolve(CORRIDOR_DIR, 'corridor.js'), 'utf8');
  check(
    'the staged mining eligibility declaration admits only learner chat',
    minerSource.includes("AI_MINABLE_SURFACES = new Set(['chat'])"),
    'AI_MINABLE_SURFACES pinned to chat — the one door where the learner types',
  );
  // one exchange, one identity: refs are distinct per exchange and every
  // one resolves to an archived exchange carrying that xid (PR #86 review)
  await open('?entry=shelf');
  await page.click('#ai-link');
  await page.waitForSelector('#chat-input', { timeout: 8000 });
  await sendChat('もう一度、天気の言葉');
  await waitRows(page, 'mine', 4);
  const referenceSnapshot = await readAppRecordSnapshot(page);
  const refs = (referenceSnapshot.record.obslog || []).filter((r) => r[1] === 'sensei').map((r) => r[5]);
  const xids = new Set(referenceSnapshot.archive.turns.map((row) => row.xid).filter(Boolean));
  const refCheck = { total: refs.length, distinct: new Set(refs).size, resolved: refs.filter((ref) => xids.has(ref)).length };
  check(
    'every observation names its exact exchange — distinct refs, each resolving in the archive',
    refCheck.total >= 2 && refCheck.distinct >= 2 && refCheck.resolved === refCheck.total,
    JSON.stringify(refCheck),
  );
  // the whole exchange or nothing: mining is gated on every append of the
  // exchange landing durably, never on the reply alone (PR #86 review)
  check(
    'the staged mining code awaits all exchange append acknowledgements',
    minerSource.includes('Promise.all(appended)'),
    'Promise.all(appended) gate present',
  );
  // Evidence rides the downloaded backup and returns through the actual port.
  const exportedRecord = await exportThroughUi(page, 'synthetic-complete-backup.json');
  const exported = JSON.parse(exportedRecord);
  const exportRefs = (exported.record.obslog || []).filter((r) => r[1] === 'sensei').map((r) => r[5]);
  check(
    'the complete backup carries archived turns for every observation ref',
    exported.format === 'kairo-backup' && exported.completeness === 'complete' && exportRefs.length >= 2 &&
      exportRefs.every((ref) => exported.archive.turns.filter((row) => row.xid === ref).length >= 2),
    `${exportRefs.length} refs, ${exported.archive.turns.length} archived turns`,
  );
  const exportSnapshot = await readAppRecordSnapshot(page);
  check('a downloaded backup excludes device credentials and installation authority',
    !exportedRecord.includes('sk-ant-test-key') && !exportedRecord.includes(exportSnapshot.installation.databaseName) &&
      !Object.hasOwn(exported.record, 'ai'));

  // Build a replacement history within this same installation through actual
  // import and chat controls. This is not an authenticated learner switch.
  // No active localStorage rewriting or hidden archive mutator sets fixtures.
  const emptyImported = await importThroughUi(page, JSON.stringify({ v: 1, taken: [] }), 'synthetic-empty-legacy.json');
  check('a legacy import replaces the archive and declares historical incompleteness',
    emptyImported.archive.turns.length === 0 && emptyImported.record.aiEvidenceIncomplete === true);
  await page.click('#ai-link');
  await sendChat('RECORD-A の秘密');
  await waitForAppRecord(page, (record) => (record.obslog || []).some((row) => row[1] === 'sensei'),
    { description: 'synthetic foreign conversation mining' });
  const foreignRows = await logAll(page);
  check('the replacement fixture contains an actual archived foreign conversation',
    foreignRows.some((row) => row.surface === 'chat' && row.content === 'RECORD-A の秘密'));

  const latestSnapshot = await readAppRecordSnapshot(page);
  const latestDrafts = latestSnapshot.record.teacherDrafts;
  if (latestSnapshot.record.sentenceDrafts != null ||
      exported.record.sentenceDrafts != null)
    throw new Error('Roundtrip fixture requires absent sentence drafts on both records');
  if (latestDrafts?.entries.length !== 1 || latestDrafts.entries[0].contextRef !== null ||
      latestDrafts.entries[0].text !== 'RECORD-A の秘密' || latestDrafts.entries[0].consumed !== true)
    throw new Error('Roundtrip fixture requires the exact current consumed general question');
  const restored = await importThroughUi(page, exportedRecord, 'synthetic-roundtrip.json');
  // The actual importer preserves the current question draft and absent sentence
  // root. Compare every historical value without an empty-root substitution.
  const expectedRestored = { ...exported, record: { ...exported.record, teacherDrafts: latestDrafts } };
  if (!sameData(restored, expectedRestored)) {
    writeFileSync(resolve(OUT, 'restore-comparison.json'), JSON.stringify({ restored, expectedRestored }, null, 2) + '\n');
  }
  const restoredRefs = (restored.record.obslog || []).filter((r) => r[1] === 'sensei').map((r) => r[5]);
  const restoredXids = new Set(restored.archive.turns.map((r) => r.xid).filter(Boolean));
  const roundtrip = {
    refs: restoredRefs.length,
    resolved: restoredRefs.filter((ref) => restoredXids.has(ref)).length,
    envelopeCarriesEvidence: Object.hasOwn(restored.record, 'aiEvidence'),
    foreignSurvived: restored.archive.turns.some((r) => String(r.content).includes('RECORD-A')),
    currentDraftsKept: JSON.stringify(restored.record.teacherDrafts) === JSON.stringify(latestDrafts),
  };
  check(
    'after restore, every ref resolves and all historical roots and archive return while current drafts stay',
    roundtrip.refs >= 2 && roundtrip.resolved === roundtrip.refs && roundtrip.currentDraftsKept &&
      sameData(restored, expectedRestored),
    JSON.stringify(roundtrip),
  );
  check(
    'archive evidence rides the backup without duplication in the learner envelope',
    roundtrip.envelopeCarriesEvidence === false,
    `in envelope: ${roundtrip.envelopeCarriesEvidence}`,
  );
  check(
    'the import replaces the archive in one transaction — no pre-import turn survives',
    roundtrip.foreignSurvived === false,
    `foreign turn survived: ${roundtrip.foreignSurvived}`,
  );

  // A malformed evidence turn stops the real importer before any native write.
  const tampered = JSON.parse(exportedRecord);
  tampered.archive.turns[0] = { surface: 'chat', role: 'oracle', content: 'まがいもの', ts: 'yesterday' };
  const storeBefore = await readAppRecordSnapshot(page);
  await page.click('#tray');
  await page.evaluate(() => { window.__PRE_IMPORT_PAGE = 1; });
  await page.setInputFiles('#import-file', {
    name: 'synthetic-tampered.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(tampered), 'utf8'),
  });
  await page.waitForFunction(() => !!document.querySelector('.port-row:has(#import-file) + .airead-note')?.textContent, null, { timeout: 8000 });
  const tamperedOutcome = {
    samePage: await page.evaluate(() => window.__PRE_IMPORT_PAGE === 1),
    unchanged: sameData(await readAppRecordSnapshot(page), storeBefore),
    note: await page.locator('.port-row:has(#import-file) + .airead-note').textContent(),
  };
  check(
    'malformed imported evidence aborts the import — no reload, record and archive untouched',
    tamperedOutcome.samePage && tamperedOutcome.unchanged && tamperedOutcome.note.length > 0,
    JSON.stringify(tamperedOutcome),
  );
  await page.fill('#note-input', '封は解けたか');
  await page.click('#note-send');
  const unsealed = await waitForAppRecord(page, (record) => hasNote(record, '封は解けたか'));
  check('a validation-rejected import leaves the device writable — the next real write lands', hasNote(unsealed, '封は解けたか'));

  // Abort the actual host restore transaction after native record/archive puts.
  // A fault must fire; complete equality includes the transcript, not row counts.
  const storeBeforeQuota = await readAppRecordSnapshot(page);
  await armRecordWriteFailure(page, 'quota');
  await page.evaluate(() => { window.__PRE_IMPORT_PAGE = 1; });
  await page.setInputFiles('#import-file', {
    name: 'synthetic-quota.json', mimeType: 'application/json', buffer: Buffer.from(exportedRecord, 'utf8'),
  });
  await page.waitForFunction(() => window.__recordTestFault?.fired > 0, null, { timeout: 8000 });
  await page.waitForFunction(() => !!document.querySelector('.port-row:has(#import-file) + .airead-note')?.textContent, null, { timeout: 8000 });
  const quotaAfter = await readAppRecordSnapshot(page);
  const quotaOutcome = {
    samePage: await page.evaluate(() => window.__PRE_IMPORT_PAGE === 1),
    unchanged: sameData(quotaAfter, storeBeforeQuota),
    revisionUnchanged: quotaAfter.revision === storeBeforeQuota.revision,
    fault: await clearRecordWriteFailure(page),
  };
  check(
    'a refused native restore preserves the complete prior record, archive, and revision',
    quotaOutcome.samePage && quotaOutcome.unchanged && quotaOutcome.revisionUnchanged && quotaOutcome.fault.fired > 0,
    JSON.stringify(quotaOutcome),
  );
  // Native operational failure seals the owner until a reload reopens the
  // last durable generation. The reload must not replay the rejected import.
  await open('?entry=shelf');
  check('reload after refused restore reopens the prior record and archive',
    sameData(await readAppRecordSnapshot(page), storeBeforeQuota));
  await page.click('#tray');

  // A second window reads the same disk but cannot write while A owns it.
  const pageB = await context.newPage();
  await pageB.goto(`${base}/index.html?entry=shelf`, { waitUntil: 'load' });
  await pageB.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
  await page.fill('#note-input', 'タブAの筆');
  await page.click('#note-send');
  await waitForAppRecord(page, (record) => hasNote(record, 'タブAの筆'));
  await pageB.locator('#store-alert').waitFor({ state: 'visible' });
  await pageB.click('#tray');
  await pageB.fill('#note-input', 'タブBの筆');
  await pageB.press('#note-input', 'Enter');
  const twoTabRecord = await readAppRecord(pageB);
  const twoTab = {
    aLanded: hasNote(twoTabRecord, 'タブAの筆'), bRefused: !hasNote(twoTabRecord, 'タブBの筆'),
    buttonDisabled: await pageB.locator('#note-send').isDisabled(),
    draft: await pageB.inputValue('#note-input'),
  };
  check(
    'a secondary tab refuses a write and keeps its draft while the owner write stands',
    twoTab.aLanded && twoTab.bRefused && twoTab.buttonDisabled && twoTab.draft === 'タブBの筆',
    JSON.stringify(twoTab),
  );
  const storeBeforeStaleImport = await readAppRecordSnapshot(pageB);
  await pageB.evaluate(() => { window.__PRE_IMPORT_PAGE = 1; });
  await pageB.setInputFiles('#import-file', {
    name: 'synthetic-stale.json', mimeType: 'application/json', buffer: Buffer.from(exportedRecord, 'utf8'),
  });
  await pageB.waitForFunction(() => /reload|再読み込み/.test(document.querySelector('.port-row:has(#import-file) + .airead-note')?.textContent || ''),
    null, { timeout: 8000 });
  const staleImport = {
    samePage: await pageB.evaluate(() => window.__PRE_IMPORT_PAGE === 1),
    unchanged: sameData(await readAppRecordSnapshot(pageB), storeBeforeStaleImport),
  };
  await pageB.close();
  check('a secondary tab may not import — both native documents stay unchanged',
    staleImport.samePage && staleImport.unchanged, JSON.stringify(staleImport));

  // Historical evidence loss remains declared across a real note and download.
  await importThroughUi(page, brokenExport.text, 'synthetic-incomplete.json');
  await page.click('#tray');
  await page.fill('#note-input', '印は残るか');
  await page.click('#note-send');
  const partialRecord = await waitForAppRecord(page, (record) => hasNote(record, '印は残るか'));
  const partialExport = JSON.parse(await exportThroughUi(page, 'synthetic-incomplete-backup.json'));
  const markerRide = {
    inEnvelope: partialRecord.aiEvidenceIncomplete === true,
    inExport: partialExport.record.aiEvidenceIncomplete === true && partialExport.completeness === 'incomplete',
    noteLanded: hasNote(partialRecord, '印は残るか'),
  };
  check('a declared evidence loss stays declared across import, writes, and re-export',
    markerRide.inEnvelope && markerRide.inExport && markerRide.noteLanded, JSON.stringify(markerRide));

  // The real import port also clears a populated archive when the file has none.
  await open('?entry=shelf');
  await page.click('#ai-link');
  await sendChat('RECORD-A の秘密');
  await waitForAppRecord(page, (record) => (record.obslog || []).some((row) => row[1] === 'sensei'));
  const archiveBefore = await logAll(page);
  const cleared = await importThroughUi(page, JSON.stringify({ v: 1, taken: [] }), 'synthetic-clear-history.json');
  check('an actual empty-history import clears all prior learner conversations',
    archiveBefore.some((row) => row.content === 'RECORD-A の秘密') && cleared.archive.turns.length === 0 &&
      (cleared.record.aiChat || []).length === 0,
    `before ${archiveBefore.length} · after ${cleared.archive.turns.length}`);
  check('all requests stay on the isolated origin or the in-memory synthetic provider', externalRequests.length === 0,
    externalRequests.join(' | '));

  check(
    'no console or page errors across the AI walk',
    consoleErrors.length === 0,
    consoleErrors.slice(0, 3).join(' | ') || 'clean',
  );

  await browser.close();
  server.close();

  console.log(`\n${results.length - failures}/${results.length} checks passed`);
  return failures === 0 ? 0 : 1;
}

function writeReceipt(status, error) {
  writeFileSync(resolve(OUT, 'receipt.json'), JSON.stringify({
    format: 'kairo-ai-runtime-verification', version: 2, status,
    browser: 'chromium', browserVersion, artifactSha256: identity.artifactSha256,
    sourceSha256, verifierSha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
    results, consoleErrors, externalRequests, ...(error ? { error: error.message } : {}),
    scope: 'Synthetic provider; actual UI actions, native IndexedDB record/archive reads and host-command failure injection. Legacy localStorage seeds exist only before boot; missing-IDB source preservation is checked explicitly.',
    supplementalSourceChecks: ['staged chat-only mining declaration', 'staged Promise.all append gate'],
    pass: status === 'PASS',
  }, null, 2) + '\n');
}

main().finally(async () => {
  try { await suiteBrowser?.close(); }
  finally { if (suiteServer) await new Promise((done) => suiteServer.close(done)); }
}).then(
  (code) => { writeReceipt(code === 0 ? 'PASS' : 'FAIL'); process.exit(code); },
  (err) => {
    writeReceipt('ERROR', err);
    console.error(err);
    process.exit(2);
  },
);
