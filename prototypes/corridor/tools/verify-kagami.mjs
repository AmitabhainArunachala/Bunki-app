/**
 * 鏡's verifier (KAGAMI movement 二). Done = this is green.
 *
 * The mirror is the first surface that reads the WHOLE ledger, so its
 * verifier asks the questions a derived model must answer:
 *
 *   · determinism — the same store yields a byte-identical model, twice in a
 *     row and across a reload. A learner model that drifted between renders
 *     could not be reasoned about, and could not be replayed;
 *   · nothing persisted — walking the room writes no row, no card, no FSRS
 *     state, and adds nothing to the envelope. It is derived, and derived
 *     things do not leave marks;
 *   · no averaging — a band renders as per-level counts, never as one
 *     number, and never as a claim about what level the learner IS;
 *   · provenance — a store carrying only mined rows says so; adding measured
 *     rows moves the same band's provenance and can move its reading;
 *   · traceability — every level cell the page prints matches rows that
 *     actually exist in the seeded ledger, counted independently here;
 *   · an empty ledger reflects honestly instead of guessing.
 *
 * Usage: node verify-kagami.mjs
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

function startServer() {
  const server = createServer((request, response) => {
    const path = decodeURIComponent((request.url ?? '/').split('?')[0]);
    const rel = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
    const file = resolve(CORRIDOR_DIR, rel);
    if (!file.startsWith(CORRIDOR_DIR) || !existsSync(file)) {
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
    server.listen(0, '127.0.0.1', () =>
      ok({ server, base: `http://127.0.0.1:${server.address().port}` }),
    );
  });
}

const results = [];
let failures = 0;
function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass });
  if (!pass) failures += 1;
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`);
}

/* ------------------------------------------------------------ the seeds */
// Words chosen from the graded list so their JLPT levels are known here as
// well as in the app: the probe counts the same rows the page does.
const N5 = ['学校', '電話', '先生', '時間', '天気'];
const N4 = ['空港', '会議', '文化', '経済', '政治'];
const T0 = 1755000000000;

/** A ledger with a clear shape: N5 mostly right, N4 mostly wrong, one
 * confusion pair, one leech-bound card. Everything measured. */
function seedMeasured() {
  const obslog = [];
  N5.forEach((w, i) => {
    for (let n = 0; n < 5; n += 1) {
      obslog.push([T0 + i * 100 + n, 'lesson', `word:${w}`, n === 4 ? 1 : 3, 'N5-1']);
    }
  });
  N4.forEach((w, i) => {
    for (let n = 0; n < 5; n += 1) {
      obslog.push([T0 + 9000 + i * 100 + n, 'mock', `word:${w}`, n === 0 ? 3 : 1, 'n4-01']);
    }
  });
  // readings: five probe rows, four right
  N5.forEach((w, i) => obslog.push([T0 + 20000 + i, 'probe', `word:${w}`, i === 0 ? 1 : 3, 0]));
  obslog.push([T0 + 30000, 'confuse', 'word:学校', 'word:天気']);
  obslog.push([T0 + 30001, 'confuse', 'word:学校', 'word:天気']);
  obslog.push([T0 + 30002, 'tap', 'word:文化', 2, 'wikinews:1403']);
  return {
    v: 1,
    taken: [...N5, ...N4].map((w, i) => ({ t: 'word', id: w, label: w, ts: T0 + i })),
    srs: {},
    obslog,
  };
}

/** The same learner as far as the sensei is concerned — mined rows only. */
function seedObservedOnly() {
  const obslog = [];
  N4.forEach((w, i) => {
    for (let n = 0; n < 5; n += 1) {
      obslog.push([T0 + i * 100 + n, 'sensei', `word:${w}`, n === 0 ? 3 : 1, 'sense-miss', `x${i}${n}`]);
    }
  });
  return {
    v: 1,
    taken: N4.map((w, i) => ({ t: 'word', id: w, label: w, ts: T0 + i })),
    srs: {},
    obslog,
  };
}

/** The one shape that IS a contradiction: N4 cleared while N5 failed. A
 * learner who misses the easy words and lands the hard ones is telling two
 * stories, and the mirror must say so — where the ordinary shape (clear the
 * easy level, miss the hard one) must NOT be flagged, since that is simply
 * what learning looks like. */
function seedContradiction() {
  const obslog = [];
  N5.forEach((w, i) => {
    for (let n = 0; n < 5; n += 1) {
      obslog.push([T0 + i * 100 + n, 'lesson', `word:${w}`, n === 0 ? 3 : 1, 'N5-1']);
    }
  });
  N4.forEach((w, i) => {
    for (let n = 0; n < 5; n += 1) {
      obslog.push([T0 + 9000 + i * 100 + n, 'lesson', `word:${w}`, n === 4 ? 1 : 3, 'N4-1']);
    }
  });
  return {
    v: 1,
    taken: [...N5, ...N4].map((w, i) => ({ t: 'word', id: w, label: w, ts: T0 + i })),
    srs: {},
    obslog,
  };
}

/** Round 10's four shapes, each its own ledger:
 *  · a drill graded then undone — the undo revokes the grade and counts as
 *    nothing itself, so practice withdrawn cannot lower the mirror;
 *  · a grammar card reviewed — sentence form, not vocabulary;
 *  · a rested card — the leech list must notice;
 *  · confusions with no judged answer at all — still a record worth showing. */
function seedUndoneDrill() {
  const obslog = [];
  // 天気: graded wrong four times, then all four undone — nothing may stand
  for (let n = 0; n < 4; n += 1) obslog.push([T0 + n, 'dojo', 'word:天気', 1, 'due']);
  for (let n = 0; n < 4; n += 1) obslog.push([T0 + 100 + n, 'dojo', 'word:天気', 0]);
  // 学校: four right, one undone — three stand
  for (let n = 0; n < 4; n += 1) obslog.push([T0 + 200 + n, 'dojo', 'word:学校', 3, 'due']);
  obslog.push([T0 + 300, 'dojo', 'word:学校', 0]);
  return {
    v: 1,
    taken: ['天気', '学校'].map((w, i) => ({ t: 'word', id: w, label: w, ts: T0 + i })),
    srs: {},
    obslog,
  };
}

function seedGrammarReviews() {
  const revlog = [];
  for (let n = 0; n < 6; n += 1) revlog.push([T0 + n, 'grammar:n5-teiru', n === 0 ? 1 : 3, 2, null, null, null, null, 1, 1, 0, T0]);
  return { v: 1, taken: [], srs: {}, revlog };
}

function seedConfusionsOnly() {
  return {
    v: 1,
    taken: [],
    srs: {},
    obslog: [
      [T0, 'confuse', 'word:学校', 'word:天気'],
      [T0 + 1, 'confuse', 'word:先生', 'word:時間'],
    ],
  };
}

const initScript = (envelope) => `try {
  if (!localStorage.getItem('__kagami_seeded')) {
    localStorage.setItem('kairo-corridor-v1', ${JSON.stringify(JSON.stringify(envelope))});
    localStorage.setItem('__kagami_seeded', '1');
  }
} catch {}`;

async function openMirror(context, base) {
  const page = await context.newPage();
  await page.goto(`${base}/index.html?entry=shelf`, { waitUntil: 'load' });
  await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
  await page.click('#kagami-link');
  await page.waitForSelector('[data-band="lexis"]', { timeout: 15000 });
  return page;
}

/** The model, as the page's own code computes it — read through the DOM the
 * learner sees, never through a private hook. */
const readCells = (page) =>
  page.evaluate(`(() => {
    const out = {};
    for (const cell of document.querySelectorAll('[data-kagami-cell]')) {
      out[cell.dataset.kagamiCell] = cell.querySelector('.kagami-count').textContent;
    }
    return out;
  })()`);

async function main() {
  const { server, base } = await startServer();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const consoleErrors = [];

  console.log('— 鏡: the mirror over a measured ledger');
  const measured = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await measured.addInitScript(initScript(seedMeasured()));
  const page = await openMirror(measured, base);
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  // traceability: the counts on the page are the rows in the store, counted here
  const cells = await readCells(page);
  check(
    'every level cell matches the rows the ledger actually holds',
    cells['lexis:N5'] === '20/25' && cells['lexis:N4'] === '5/25' && cells['readings:N5'] === '4/5',
    JSON.stringify(cells),
  );

  const reading = await page.evaluate(
    `document.querySelector('[data-band="lexis"] .kagami-read').textContent`,
  );
  check(
    'the band reads the edge it cleared, and claims nothing above it',
    /N5/.test(reading) && !/N4/.test(reading),
    reading.trim(),
  );

  const ordinaryFlag = await page.evaluate(`(() => {
    const m = window.__KAIRO_KAGAMI__.model();
    return { disagreement: m.bands.lexis.disagreement, text: document.querySelector('[data-band="lexis"] .kagami-prov').textContent };
  })()`);
  check(
    'clearing N5 and missing N4 is not a contradiction — it is what learning looks like',
    ordinaryFlag.disagreement === false && !/食い違い/u.test(ordinaryFlag.text) && !/disagree/iu.test(ordinaryFlag.text),
    ordinaryFlag.text.trim().replace(/\s+/gu, ' '),
  );

  // no averaging, and no claim about the person
  const pageText = await page.evaluate(`document.querySelector('main').textContent`);
  const FORBIDDEN = [
    /あなたは\s*N[1-5]/u,
    /you are (at )?N[1-5]/iu,
    /level[:：]\s*N[1-5]/iu,
    /(合格|受かる)(でしょう|そう|圏|可能)/u,
    /(likely|able) to pass/iu,
    /\d+\s*%/u,
    /総合(点|評価|スコア)/u,
    /overall (score|level|rating)/iu,
  ];
  check(
    'no averaged score, no percentage, no claim about what level the learner IS',
    !FORBIDDEN.some((re) => re.test(pageText)),
    FORBIDDEN.filter((re) => re.test(pageText)).join(' | ') || 'clean',
  );
  check(
    'the page says outright that a pass is not knowable here',
    /ここでは分からない/u.test(pageText) || /not knowable from here/iu.test(pageText),
  );

  // determinism — twice in a row, and again after a reload
  const twice = await page.evaluate(`(() => {
    const first = JSON.stringify(window.__KAIRO_KAGAMI__.model());
    const second = JSON.stringify(window.__KAIRO_KAGAMI__.model());
    return { same: first === second, len: first.length };
  })()`);
  check('the same store yields a byte-identical model, twice', twice.same === true, `${twice.len} bytes`);
  const before = await page.evaluate(`JSON.stringify(window.__KAIRO_KAGAMI__.model())`);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
  const after = await page.evaluate(`JSON.stringify(window.__KAIRO_KAGAMI__.model())`);
  check('and the same model again after a reload — nothing carried in memory', before === after);

  // derived, never stored: the envelope gains nothing from the mirror
  const envelopeBefore = await page.evaluate(`localStorage.getItem('kairo-corridor-v1')`);
  await page.click('#kagami-link');
  await page.waitForSelector('[data-band="lexis"]', { timeout: 15000 });
  await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
  await page.waitForTimeout(400);
  const envelopeAfter = await page.evaluate(`localStorage.getItem('kairo-corridor-v1')`);
  check('walking the mirror writes nothing — the record is byte-identical after', envelopeBefore === envelopeAfter);
  const stored = JSON.parse(envelopeAfter);
  check(
    'the model is nowhere in the envelope: it is derived, and stays derived',
    !('learnerModel' in stored) && !('kagami' in stored) && !('bands' in stored),
    Object.keys(stored).join(','),
  );
  check(
    'the mirror moves no schedule: no FSRS state, no review row, no new card',
    Object.keys(stored.srs || {}).length === 0 &&
      (stored.revlog || []).length === 0 &&
      (stored.taken || []).length === 10,
  );

  // the edges and the frontier are the ledger's own, not a ranking invented here
  const edgesAndEdge = await page.evaluate(`(() => ({
    edges: [...document.querySelectorAll('[data-kagami-edge]')].map((n) => n.dataset.kagamiEdge),
    frontier: [...document.querySelectorAll('[data-kagami-frontier]')].map((n) => n.dataset.kagamiFrontier),
  }))()`);
  check(
    'the confusion pair the ledger recorded is the pair the mirror shows, normalized so a↔b and b↔a are one edge',
    edgesAndEdge.edges.length === 1 && edgesAndEdge.edges[0] === 'word:天気|word:学校',
    JSON.stringify(edgesAndEdge.edges),
  );
  check(
    'the frontier is the unsettled words, hardest first — the N4 five, not the N5 ones',
    edgesAndEdge.frontier.length >= 5 &&
      N4.every((w) => edgesAndEdge.frontier.includes(`word:${w}`)) &&
      edgesAndEdge.frontier.slice(0, 5).every((k) => N4.includes(k.slice(5))),
    edgesAndEdge.frontier.slice(0, 6).join(' '),
  );
  await measured.close();

  console.log('\n— 鏡: provenance, and the honest empty');
  const observed = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await observed.addInitScript(initScript(seedObservedOnly()));
  const mined = await openMirror(observed, base);
  const minedProv = await mined.evaluate(
    `document.querySelector('[data-band="lexis"] .kagami-prov').textContent`,
  );
  check(
    'a band resting only on mined rows says so, in as many words',
    /観察/u.test(minedProv) || /observed/iu.test(minedProv),
    minedProv.trim().replace(/\s+/gu, ' '),
  );
  const minedModel = await mined.evaluate(`(() => {
    const m = window.__KAIRO_KAGAMI__.model();
    return { measured: m.bands.lexis.measured, observed: m.bands.lexis.observed };
  })()`);
  check(
    'and it is observed evidence only — measured stays at zero',
    minedModel.measured === 0 && minedModel.observed === 25,
    JSON.stringify(minedModel),
  );
  await observed.close();

  const odd = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await odd.addInitScript(initScript(seedContradiction()));
  const contradictory = await openMirror(odd, base);
  const flagged = await contradictory.evaluate(`(() => {
    const m = window.__KAIRO_KAGAMI__.model();
    return { disagreement: m.bands.lexis.disagreement, edge: m.bands.lexis.edge, text: document.querySelector('[data-band="lexis"] .kagami-prov').textContent };
  })()`);
  check(
    'but clearing N4 while N5 fails IS flagged — the sample tells two stories and the page says so',
    flagged.disagreement === true && flagged.edge === 'N4' && (/食い違い/u.test(flagged.text) || /disagree/iu.test(flagged.text)),
    JSON.stringify({ edge: flagged.edge, disagreement: flagged.disagreement }),
  );
  await odd.close();

  // round 10: a withdrawn drill withdraws its grade, and counts as nothing
  const undone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await undone.addInitScript(initScript(seedUndoneDrill()));
  const drills = await openMirror(undone, base);
  const afterUndo = await drills.evaluate(`(() => {
    const m = window.__KAIRO_KAGAMI__.model();
    return { cell: m.bands.lexis.levels.N5, tenki: m.nodes['word:天気'] || null, gakko: m.nodes['word:学校'] };
  })()`);
  check(
    'an undone drill withdraws its grade and counts as nothing itself',
    afterUndo.cell.seen === 3 && afterUndo.cell.right === 3 && afterUndo.gakko.seen === 3,
    JSON.stringify(afterUndo.cell),
  );
  check(
    'a word whose every drill was undone leaves no judged evidence at all',
    !afterUndo.tenki || afterUndo.tenki.seen === 0,
    JSON.stringify(afterUndo.tenki),
  );
  await undone.close();

  // round 10: a grammar review is sentence form, not vocabulary
  const grammar = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await grammar.addInitScript(initScript(seedGrammarReviews()));
  const gpage = await grammar.newPage();
  await gpage.goto(`${base}/index.html?entry=shelf`, { waitUntil: 'load' });
  await gpage.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
  await gpage.click('#kagami-link');
  await gpage.waitForSelector('[data-band="syntax"]', { timeout: 15000 });
  const routed = await gpage.evaluate(`(() => {
    const m = window.__KAIRO_KAGAMI__.model();
    return { syntax: m.bands.syntax.evidence, lexis: m.bands.lexis.evidence };
  })()`);
  check(
    'a reviewed grammar card lands in sentence form and never inflates vocabulary',
    routed.syntax === 6 && routed.lexis === 0,
    JSON.stringify(routed),
  );
  await grammar.close();

  // round 10: confusions with no judged answers are still a record
  const pairsOnly = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await pairsOnly.addInitScript(initScript(seedConfusionsOnly()));
  const ponly = await pairsOnly.newPage();
  await ponly.goto(`${base}/index.html?entry=shelf`, { waitUntil: 'load' });
  await ponly.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
  await ponly.click('#kagami-link');
  await ponly.waitForSelector('[data-kagami-edge]', { timeout: 15000 });
  const shown = await ponly.evaluate(`(() => ({
    edges: document.querySelectorAll('[data-kagami-edge]').length,
    text: document.querySelector('main').textContent,
  }))()`);
  check(
    'a ledger of confusions and no grades still shows them, and says the grades are missing',
    shown.edges === 2 &&
      (/採点のついた記録はまだない/u.test(shown.text) || /No judged answers yet/iu.test(shown.text)) &&
      !/まだ何も映っていない/u.test(shown.text),
    `${shown.edges} pairs shown`,
  );
  await pairsOnly.close();

  const empty = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await empty.addInitScript(initScript({ v: 1, taken: [], srs: {} }));
  const bare = await empty.newPage();
  await bare.goto(`${base}/index.html?entry=shelf`, { waitUntil: 'load' });
  await bare.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
  await bare.click('#kagami-link');
  await bare.waitForTimeout(500);
  const bareState = await bare.evaluate(`(() => ({
    bands: document.querySelectorAll('[data-band]').length,
    text: document.querySelector('main').textContent,
  }))()`);
  check(
    'an empty ledger reflects nothing rather than guessing a level',
    bareState.bands === 0 &&
      (/まだ何も映っていない/u.test(bareState.text) || /Nothing is reflected yet/iu.test(bareState.text)) &&
      !/N[1-5]\s*(です|だ)/u.test(bareState.text),
  );
  await empty.close();

  check('no console or page errors across the 鏡 walk', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | ') || 'clean');

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
