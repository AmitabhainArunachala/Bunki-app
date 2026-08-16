/**
 * The AI runtime's verifier (RENKAN A2, terminal T6). Done = this is green.
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
 *      on every surface, lands in the append-only IndexedDB archive, and a
 *      broken archive never breaks the call;
 *   3. the 24-turn cap destroys nothing — the localStorage window stays
 *      bounded, but the archive keeps turn 1 past turn 25 and the visible
 *      chat history renders from the archive, not the capped store.
 *
 * The provider seam is probed live: the seeded envelope carries S.ai
 * overrides ({ baseUrl, model }) and the stub asserts the request actually
 * used them.
 *
 * Usage: node verify-corridor-ai.mjs
 */

import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const CORRIDOR_DIR = resolve(TOOL_DIR, '..');

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
// whose end screen carries the coach. The S.ai overrides prove the seam.
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
    ai: { baseUrl: OVERRIDE_BASE_URL, model: OVERRIDE_MODEL },
  };
}

// Runs before corridor.js on every navigation: seed the key + envelope and
// replace fetch for the provider endpoint only. Mode rides localStorage so a
// reload keeps it: 'ok' answers instantly per surface; 'hang' never settles
// but honours the abort signal exactly the way a real stalled fetch does.
function initScript(envelopeJson) {
  return `(() => {
    try {
      localStorage.setItem('kairo-ai-key', 'sk-ant-test-key');
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
      if (system.includes('Output ONLY a JSON array')) {
        text = JSON.stringify([1, 2, 3, 4, 5].map((n) => ({
          q: '問' + n, opts: ['a', 'b', 'c', 'd'], right: 0, why: 'because ' + n,
        })));
      } else if (system.includes('Write natural example sentences')) {
        text = [
          'N5 | 学校へ行く。 | がっこうへいく。 | I go to school.',
          'N5 | 学校は近い。 | がっこうはちかい。 | The school is near.',
          'N4 | 学校で友だちと話す。 | がっこうでともだちとはなす。 | I talk with friends at school.',
          'N4 | 学校の帰りに本を買った。 | がっこうのかえりにほんをかった。 | I bought a book on the way home.',
          'N3 | 学校の行事が続く。 | がっこうのぎょうじがつづく。 | School events continue.',
          'N3 | 学校を休むと決めた。 | がっこうをやすむときめた。 | I decided to rest from school.',
        ].join('\\n');
      } else if (system.includes('reading passage')) {
        text = '朝、学校（がっこう）へ行く。天気（てんき）がいい。先生（せんせい）と話す。友だちと帰る。';
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] }),
      });
    };
  })();`;
}

const logAll = (page, surface) =>
  page.evaluate((s) => window.__KAIRO_AI__.logAll(s), surface);

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
async function main() {
  const { server, base } = await startCorridorServer();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const seedJson = JSON.stringify(seedEnvelope());
  await context.addInitScript(initScript(seedJson));
  const page = await context.newPage();
  const consoleErrors = [];
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
      .waitForFunction(() => !document.querySelector('#sheet .dictionary-opening'), null, { timeout: 8000 })
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
  };

  // ------------------------------------------ the budget and the seam exist
  console.log('\n— the runtime contract');
  await open('?entry=shelf');
  const contract = await page.evaluate(`({
    timeoutMs: window.__KAIRO_AI__.timeoutMs,
    provider: window.__KAIRO_AI__.provider(),
  })`);
  check('the request budget mirrors packages/ai (10 s)', contract.timeoutMs === 10000,
    `timeoutMs=${contract.timeoutMs}`);
  check('S.ai overrides reach the provider seam — store-durable, no UI needed',
    contract.provider.baseUrl === OVERRIDE_BASE_URL && contract.provider.model === OVERRIDE_MODEL,
    `${contract.provider.baseUrl} · ${contract.provider.model}`);

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
  check('word tutor · the exchange lands whole in the archive',
    exchangeShape(tutorRows, 'word-tutor', OVERRIDE_MODEL) &&
      tutorRows.every((r) => r.contextRef === 'word:学校'),
    `${tutorRows.length} rows, contextRef=${tutorRows[0]?.contextRef}`);

  await page.locator('#sheet .ai-ask', { hasText: '例文をつくる' }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('#sheet .ai-ex').length >= 4,
    null,
    { timeout: 8000 },
  );
  const exampleRows = await waitRows(page, 'examples', 2);
  check('graded examples · the exchange lands whole in the archive',
    exchangeShape(exampleRows, 'examples', OVERRIDE_MODEL) &&
      exampleRows.every((r) => r.contextRef === 'word:学校'),
    `${exampleRows.length} rows`);
  const stubSeen = await page.evaluate('window.__AI_STUB');
  check('the request actually used the overridden base URL and model',
    stubSeen.urls.every((u) => u.startsWith(`${OVERRIDE_BASE_URL}/`)) &&
      stubSeen.models.every((m) => m === OVERRIDE_MODEL),
    `${stubSeen.calls} calls → ${stubSeen.urls[0]} · ${stubSeen.models[0]}`);

  // --------------------------------------- surface 3+4 · quiz and the coach
  console.log('\n— the quiz and the post-review coach');
  await page.click('#sheet-close');
  await page.click('#tray');
  await page.waitForSelector('#aiq-start', { timeout: 8000 });
  await page.click('#aiq-start');
  await page.waitForSelector('.aiq-q', { timeout: 8000 });
  const quizRows = await waitRows(page, 'quiz', 2);
  check('quiz · the exchange lands whole in the archive',
    exchangeShape(quizRows, 'quiz', OVERRIDE_MODEL), `${quizRows.length} rows`);

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
  check('quiz · a mid-quiz reload resumes the same written questions — not a word lost, no new request',
    quizQBefore.length > 0 && quizResume.q === quizQBefore && quizResume.calls === 0,
    `"${quizResume.q}" · calls since reload ${quizResume.calls}`);
  // let the run go so the rest of the walk meets the tray it always met
  await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
    e.aiQuiz = null;
    localStorage.setItem('kairo-corridor-v1', JSON.stringify(e));
  })()`);

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
  check('coach · the exchange lands whole in the archive',
    exchangeShape(coachRows, 'coach', OVERRIDE_MODEL), `${coachRows.length} rows`);

  // ------------------------------------------- surface 5 · the reading room
  console.log('\n— the custom reading room');
  await open('?entry=shelf');
  await page.click('#airead-link');
  await page.waitForSelector('#airead-make', { timeout: 8000 });
  await page.click('#airead-make');
  await page.waitForSelector('.airead-body', { timeout: 8000 });
  const readingRows = await waitRows(page, 'reading', 2);
  check('reading room · the exchange lands whole in the archive',
    exchangeShape(readingRows, 'reading', OVERRIDE_MODEL), `${readingRows.length} rows`);

  // ------------------------- surface 6 · chat, and the end of the 24-turn cap
  console.log('\n— chat: turn 25 destroys nothing');
  await open('?entry=shelf');
  await page.click('#ai-link');
  await page.waitForSelector('#chat-input', { timeout: 8000 });
  await sendChat(MARKER);
  const chatFirst = await waitRows(page, 'chat', 2);
  check('chat · the exchange lands whole in the archive',
    exchangeShape(chatFirst, 'chat', OVERRIDE_MODEL) && chatFirst[0].content === MARKER,
    `${chatFirst.length} rows, first="${chatFirst[0]?.content?.slice(0, 24)}"`);

  for (let n = 2; n <= 21; n += 1) await sendChat(`メッセージ ${n} 番`);
  const chatAll = await waitRows(page, 'chat', 42);
  const storedWindow = await page.evaluate(
    `JSON.parse(localStorage.getItem('kairo-corridor-v1')).aiChat.length`,
  );
  check('42 turns later, turn 1 still stands in the archive',
    chatAll.length >= 42 && chatAll[0].role === 'user' && chatAll[0].content === MARKER,
    `${chatAll.length} archived turns; first is still the marker`);
  check('the localStorage request window stays bounded (24) — cap kept, loss gone',
    storedWindow === 24, `stored aiChat length ${storedWindow}`);
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
  check('the log lazy-renders: recent window first, 前の会話 unfolds the rest',
    beforeUnfold.earlier && !beforeUnfold.marker && afterUnfold.marker && afterUnfold.turns > beforeUnfold.turns,
    `${beforeUnfold.turns} → ${afterUnfold.turns} turns; marker hidden→shown`);

  // a fresh boot renders the history from the archive, not the capped store
  await open('?entry=shelf');
  await page.click('#ai-link');
  await page.waitForFunction(
    () => document.querySelectorAll('.chat-turn').length > 24,
    null,
    { timeout: 8000 },
  );
  const rebootTurns = await page.evaluate(`document.querySelectorAll('.chat-turn').length`);
  check('after reload the visible history renders from the archive (> the 24 cap)',
    rebootTurns > 24, `${rebootTurns} turns rendered from the durable transcript`);

  // ------------------------------------ transport honesty · the 10 s budget
  console.log('\n— timeout: the stalled provider and the quiet line');
  await page.evaluate(`localStorage.setItem('__ai_stub_mode', 'hang')`);
  const chatT0 = Date.now();
  await page.fill('#chat-input', 'タイムアウトの探査');
  await page.click('#chat-send');
  const thinkingUp = await page.locator('.chat-turn.thinking').count();
  await page.waitForFunction(
    () => document.body.textContent.includes('could not answer just now'),
    null,
    { timeout: 15000 },
  );
  const chatElapsed = Date.now() - chatT0;
  const chatAfterTimeout = await page.evaluate(`({
    thinking: document.querySelectorAll('.chat-turn.thinking').length,
    sendDisabled: document.querySelector('#chat-send')?.disabled ?? null,
  })`);
  check('chat · a never-answering provider resolves to the quiet line at ~10 s',
    thinkingUp === 1 && chatElapsed >= 9000 && chatElapsed <= 13500,
    `考え中 shown, failure line after ${(chatElapsed / 1000).toFixed(1)} s`);
  check('chat · no dead 考え中 remains and the door reopens',
    chatAfterTimeout.thinking === 0 && chatAfterTimeout.sendDisabled === false,
    JSON.stringify(chatAfterTimeout));
  // 42 turns stood before the stalled send; its user turn and the app's own
  // line bring the archive to 44 — the reply that never came adds nothing
  const timeoutRows = await waitRows(page, 'chat', 44);
  const lastRows = timeoutRows.slice(-2);
  check('chat · even the failed exchange is archived — the words, then the app\'s own line',
    lastRows[0]?.role === 'user' && lastRows[0]?.content === 'タイムアウトの探査' && lastRows[1]?.role === 'app',
    lastRows.map((r) => r.role).join(' → '));

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
    () => (document.querySelector('#sheet .ai-answer')?.textContent || '').includes('could not answer'),
    null,
    { timeout: 15000 },
  );
  const tutorElapsed = Date.now() - tutorT0;
  const tutorButtonFree = await page.evaluate(
    `[...document.querySelectorAll('#sheet .ai-ask')].every((b) => !b.disabled)`,
  );
  check('word tutor · the stalled request takes the same failure path, door reopens',
    tutorButtonFree && tutorElapsed <= 25000,
    `failure line after ${((tutorElapsed) / 1000).toFixed(1)} s including sheet walk`);

  // ------------------------- a broken archive must never break the AI call
  console.log('\n— quarantine posture: archive failure never breaks the call');
  const brokenContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await brokenContext.addInitScript(initScript(seedJson));
  await brokenContext.addInitScript(
    `Object.defineProperty(window, 'indexedDB', { value: undefined });`,
  );
  const broken = await brokenContext.newPage();
  await broken.goto(`${base}/index.html?entry=shelf`, { waitUntil: 'load' });
  await broken.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
  await broken.click('#ai-link');
  await broken.waitForSelector('#chat-input', { timeout: 8000 });
  await broken.fill('#chat-input', '記録が壊れていても');
  await broken.click('#chat-send');
  await broken.waitForFunction(
    () => /stub reply/.test([...document.querySelectorAll('.chat-turn.tutor')].map((n) => n.textContent).join(' ')),
    null,
    { timeout: 15000 },
  );
  const dropped = await broken.evaluate('window.__KAIRO_AI__.dropped()');
  check('with IndexedDB gone the reply still arrives; the loss is counted, not thrown',
    dropped >= 1, `${dropped} turns honestly counted as dropped`);
  await brokenContext.close();

  check('no console or page errors across the AI walk', consoleErrors.length === 0,
    consoleErrors.slice(0, 3).join(' | ') || 'clean');

  await browser.close();
  server.close();

  console.log(`\n${results.length - failures}/${results.length} checks passed`);
  return failures === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(2);
  },
);
