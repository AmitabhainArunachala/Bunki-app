/**
 * SRS conformance (SRS FULLPROOF, 10-19). John: "several of the cards that i clicked good … pop up mere seconds or
 * minutes later … do we have a proper ANKI like SRS system through and through, no matter the deck?" The question this
 * answers on every surface: does a card come back when it promised?
 *
 * The contract (the lead's brief, with the rulings of 10-19), proved here:
 *   (a) Good on a new card never shows it again before its 10-minute step while other cards remain;
 *   (b) it comes back once due;
 *   (c) early (Anki's learn-ahead) only when nothing else is left, only within 20 minutes, and only by the learner's
 *       choice at the close ("review them now, early, or they will wait for you"); past 20 minutes no early choice;
 *   (d) every pad's label is what that grade scheduled (the stored due against the answer's own time);
 *   (e) one grade history gives the same due on every surface (deck player, context deck, your own texts, the
 *       corridor, srs-core), and the corridor and the decks build the same scheduler for every preset;
 *   (f) Again on a new card is 1 minute; Again on a review card is a 10-minute relearning step;
 *   (g) a card answered into review never returns the same day;
 *   (h) the daily new-card limit holds;
 *   (i) undo restores the exact record and keeps another window's grade;
 *   (j) the close's numbers are the sitting's own answers;
 *   P0  two open copies of a deck never lose a grade: a stale copy's answer is refused, not written over newer ones;
 *   C1  timed Kanji-only practice of a card not due records practice only, never a review;
 *   B   burying across surfaces (lead's ruling 10-19): 検証 answered in 専門 → its cards in 言葉の鉱脈, MCD, the context
 *       deck and its saved word: card rest today and are served tomorrow; kanji:検 and the MCD 字 card are not buried;
 *   one owner: no production file builds a scheduler except srs-core.mjs and the corridor's own construction, which is
 *       proved equal to srs-core's.
 * Negative controls (in-memory edits of the served files, no disk copies): the old pos+4 rule, a label that lies, a
 * surface with its own queue rule (the context deck freezing its queue; the corridor learning ahead silently), a
 * stale whole-ledger write, a second scheduler construction, burying switched off. Each must turn its named check red,
 * or this fails.
 *
 * Claim boundary: synthetic profiles and records on a built copy, page.clock for time, Chromium and WebKit desktop
 * 1280×900. It does not prove John's own record or device, iOS storage eviction, two grades in two windows within the
 * same few milliseconds (localStorage has no transaction), or the personal deck in a browser (its rule is proved on the
 * engine here; its own browser verifiers cover the room). The domain kernel (packages/domain) is not the app John uses.
 *
 * Usage: KAIRO_SITE_DIR=<built site> [KAIRO_BROWSER=chromium|webkit|all] node verify-srs-conformance.mjs [--no-controls]
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { readAppRecord } from './record-test-support.mjs';
import { restoreAppFixture } from './record-fixture-support.mjs';
import { fixture as personalFixture } from './personal-fixture.mjs';
import * as srsCore from '../srs-core.mjs';
import * as fsrsApi from '../vendor/ts-fsrs.mjs';
import * as player from '../decks/player/engine.js';
import * as contextEngine from '../decks/context-dense/engine.js';
import { createEngine as personalEngine } from '../decks/personal/engine.mjs';

const TOOL_DIR = fileURLToPath(new URL('.', import.meta.url));
const SOURCE = resolve(TOOL_DIR, '..');
const SITE = resolveCorridorSite();
const OUT = resolveCorridorEvidence();
mkdirSync(OUT, { recursive: true });
const ENGINES = (process.env.KAIRO_BROWSER || 'all') === 'all' ? ['chromium', 'webkit'] : [process.env.KAIRO_BROWSER];
const CONTROLS = !process.argv.includes('--no-controls');
// --only john,steps,p0,context,corridor,timed,bury: a targeted rerun of those scenarios (and their controls); never a pass
const ONLY = process.argv.includes('--only') ? new Set(process.argv[process.argv.indexOf('--only') + 1].split(',')) : null;
const runs = (key) => !ONLY || ONLY.has(key);
const MIN = 60e3;
const DAY = 864e5;
const pin = JSON.parse(readFileSync(join(SOURCE, 'data/fsrs-pin.json'), 'utf8'));
const uptime = () => execFileSync('uptime', { encoding: 'utf8' }).trim();
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  return !!pass;
};
const receipt = { format: 'bunki-srs-conformance', version: 1, startedAt: new Date().toISOString(), uptimeStart: uptime(), site: SITE, engines: ENGINES, controls: [] };
try {
  const identity = JSON.parse(readFileSync(join(SITE, 'build-identity.json'), 'utf8'));
  Object.assign(receipt, { gitSha: identity.gitSha, sourceDirty: identity.sourceDirty, artifactSha256: identity.artifactSha256 });
} catch {
  receipt.identity = 'unreadable';
}

/* ------------------------------------------------------------------ independent label formats */
/** the deck player's pad words, re-implemented here (never imported): 1 min · 2 hr · 2 days · 2 months · 1.5 years */
function playerWait(ms) {
  if (ms < 60 * MIN) return `${Math.max(1, Math.round(ms / MIN))} min`;
  if (ms < DAY) return `${Math.round(ms / (60 * MIN))} hr`;
  const n = (v, one) => `${v} ${v === 1 ? one : `${one}s`}`;
  if (ms < 30 * DAY) return n(Math.round(ms / DAY), 'day');
  if (ms < 365 * DAY) return n(Math.round(ms / (30 * DAY)), 'month');
  const y = Number((ms / (365 * DAY)).toFixed(1));
  return `${y} ${y === 1 ? 'year' : 'years'}`;
}

/* ------------------------------------------------------------------ node part */
function nodePart() {
  // the sitting rule, as a table (srs-core's unit tests hold the full set)
  const T = new Date('2026-10-19T07:00:00Z');
  const t = (ms) => T.getTime() + ms;
  const rule = [
    srsCore.nextStep({ now: T, queue: ['n'], learning: [{ id: 'a', due: t(9 * MIN) }] }).show === 'n',
    srsCore.nextStep({ now: T, queue: ['n'], learning: [{ id: 'a', due: t(-1) }] }).show === 'a',
    srsCore.nextStep({ now: T, learning: [{ id: 'a', due: t(9 * MIN) }] }).pause === true,
    srsCore.nextStep({ now: T, learning: [{ id: 'a', due: t(9 * MIN) }], ahead: true }).early === true,
    srsCore.nextStep({ now: T, learning: [{ id: 'a', due: t(21 * MIN) }], ahead: true }).canEarly === false,
  ];
  check('rule · learning waits while cards remain, comes first once due, early only by choice and only within 20 min', rule.every(Boolean), rule.join(' '));

  // one owner: who builds an FSRS scheduler
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const rel = relative(SOURCE, path);
      if (/^(vendor|tools|node_modules|evidence|maintenance|design|audio|fonts|data)(\/|$)/u.test(rel) || /\/tests?\//u.test(rel) || /\.test\.(m?js)$/u.test(name)) continue;
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(m?js)$/u.test(name)) files.push(rel);
    }
  };
  walk(SOURCE);
  const builders = (text) => text.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/u.test(line) && /\b(generatorParameters|fsrs)\s*\(/u.test(line)).length;
  const scan = (read) => Object.fromEntries(files.map((rel) => [rel, builders(read(rel))]).filter(([, n]) => n));
  const found = scan((rel) => readFileSync(join(SOURCE, rel), 'utf8'));
  const owners = JSON.stringify(found) === JSON.stringify({ 'corridor.js': 2, 'srs-core.mjs': 1 }) || JSON.stringify(found) === JSON.stringify({ 'srs-core.mjs': 1, 'corridor.js': 2 });
  check('one owner · only srs-core.mjs (and the corridor\'s own construction, proved equal below) builds a scheduler', owners, found);
  const importers = ['decks/player/engine.js', 'decks/context-dense/engine.js', 'decks/personal/engine.mjs', 'decks/personal/mount.mjs', 'corridor.js']
    .filter((rel) => !readFileSync(join(SOURCE, rel), 'utf8').includes('srs-core.mjs'));
  check('one owner · every surface asks srs-core.mjs', importers.length === 0, importers.join(', ') || 'player, context, personal, corridor');
  if (CONTROLS) {
    const mutated = scan((rel) => readFileSync(join(SOURCE, rel), 'utf8') + (rel === 'decks/context-dense/engine.js' ? '\nconst own = fsrsApi.fsrs(fsrsApi.generatorParameters({}));\n' : ''));
    control('a second scheduler construction (context engine)', 'one owner', JSON.stringify(mutated) !== JSON.stringify(found));
  }

  // the corridor's construction, lifted from the authored source, against srs-core's for every preset and fitted weights
  const corridorSource = readFileSync(join(SOURCE, 'corridor.js'), 'utf8');
  const ast = ts.createSourceFile('corridor.js', corridorSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const fittedW = pin.w.map((v, i) => (i < 4 ? Number((v * 1.5).toFixed(4)) : i === 8 ? Number((v + 0.3).toFixed(4)) : v));
  const cases = [
    ['no choice', {}], ['standard', { preset: 'standard' }], ['gentle', { preset: 'gentle', retention: 0.85 }], ['hardcore', { preset: 'hardcore' }],
    ['custom:gentle at 0.88', { preset: 'custom:gentle', retention: 0.88 }], ['fitted weights', { fsrs: { w: fittedW, source: 'optimizer', basedOnReviews: 400 } }],
  ];
  const names = new Set(['pinnedSchedulerInput', 'srsSchedulePolicy', 'srsLearnerPolicy', 'srsParamsProblem', 'srsSchedulerInstant']);
  let corridor = null;
  for (let round = 0; round < 60 && !corridor; round += 1) {
    const program = ast.statements.filter((statement) => {
      const declared = ts.isFunctionDeclaration(statement) ? [statement.name?.text] : ts.isVariableStatement(statement) ? statement.declarationList.declarations.map((d) => d.name.getText(ast)) : [];
      return declared.some((name) => names.has(name));
    }).map((statement) => statement.getText(ast)).join('\n');
    const sandbox = { S: { srsPrefs: {} }, D: { pin }, Math, JSON, Number, Array, Object, String };
    try {
      vm.runInNewContext(`${program}\n;globalThis.out = { pinnedSchedulerInput, srsSchedulePolicy, srsLearnerPolicy, srsParamsProblem, srsSchedulerInstant };`, sandbox);
      // every construction path once, so a definition they lean on is found now, not mid-check
      for (const [, prefs] of cases) { sandbox.S.srsPrefs = prefs; sandbox.out.srsSchedulePolicy(pin, prefs); sandbox.out.srsLearnerPolicy(); if (prefs.fsrs) sandbox.out.srsParamsProblem(prefs.fsrs); }
      sandbox.out.srsSchedulerInstant({ last_review: new Date(1) }, new Date(0));
      corridor = sandbox;
    } catch (error) {
      const missing = /(\w+) is not defined/u.exec(error.message)?.[1];
      if (!missing || names.has(missing)) throw error;
      names.add(missing);
    }
  }
  assert(corridor, `the corridor's construction could not be lifted (${[...names].join(', ')})`);
  const mismatched = [];
  for (const [label, prefs] of cases) {
    corridor.S.srsPrefs = prefs;
    const o = corridor.out;
    const fitted = prefs.fsrs && !o.srsParamsProblem(prefs.fsrs) ? prefs.fsrs.w.slice() : null;
    const own = fsrsApi.generatorParameters(o.pinnedSchedulerInput(pin, fitted, o.srsSchedulePolicy(pin, prefs)));
    const learner = o.srsLearnerPolicy();
    const core = fsrsApi.generatorParameters(srsCore.schedulerInput(pin, learner));
    const deck = player.createScheduler(fsrsApi, pin, learner).parameters;
    const ctx = contextEngine.createScheduler(fsrsApi, pin, learner).parameters;
    const flat = (p) => JSON.stringify({ ...p, w: Array.from(p.w), learning_steps: Array.from(p.learning_steps), relearning_steps: Array.from(p.relearning_steps) });
    if (!(flat(own) === flat(core) && flat(core) === flat(deck) && flat(core) === flat(ctx))) mismatched.push(label);
  }
  check('one policy · the corridor and every deck build the same scheduler for each preset and for fitted weights', mismatched.length === 0, mismatched.join(', ') || cases.map((c) => c[0]).join(' · '));
  // one card, one row: a duplicated saved row (an old import) is asked once, by the corridor's own queue functions
  {
    const qnames = new Set(['todayQueue', 'srsDueItems', 'srsKey', 'srsWordRests']);
    let lifted = null;
    for (let round = 0; round < 60 && !lifted; round += 1) {
      const program = ast.statements.filter((statement) => {
        const declared = ts.isFunctionDeclaration(statement) ? [statement.name?.text] : ts.isVariableStatement(statement) ? statement.declarationList.declarations.map((d) => d.name.getText(ast)) : [];
        return declared.some((name) => qnames.has(name));
      }).map((statement) => statement.getText(ast)).join('\n');
      const T0 = Date.parse('2026-10-19T07:00:00Z');
      const row = { t: 'word', id: '検証', label: '検証', ts: T0 - 9e8, started: T0 - 9e8 };
      const sandbox = { S: { taken: [row, { ...row }, { ...row, id: '実装', label: '実装' }], srs: { 'word:検証': { due: new Date(T0 - 60e3).toISOString(), state: 2 } }, suspended: {}, stats: {}, srsPrefs: {}, revlog: [] },
        D: { pin, dict: {} }, srsCore, Math, JSON, Number, Array, Object, String, Set, Map, Date, globalThis: {} };
      try {
        vm.runInNewContext(`${program}\n;globalThis.out = { todayQueue, srsDueItems };`, sandbox);
        const now = new Date(T0);
        lifted = { today: sandbox.out.todayQueue(now).order.map((i) => i.id), due: sandbox.out.srsDueItems(now).map((i) => i.id) };
      } catch (error) {
        const missing = /(\w+) is not defined/u.exec(error.message)?.[1];
        if (!missing || qnames.has(missing)) throw error;
        qnames.add(missing);
      }
    }
    check('one card, one row · the corridor\'s todayQueue and srsDueItems ask a duplicated saved row once', JSON.stringify(lifted?.today) === JSON.stringify(['検証', '実装']) && JSON.stringify(lifted?.due) === JSON.stringify(['検証', '実装']), lifted);
  }
  const personalPin = { w: [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542], retention: 0.9, max: 36500, fuzz: false, short: true, steps: ['1m', '10m'], relearn: ['10m'] };
  check('one policy · your own texts\' former typed-in numbers are exactly the pin (their history replays the same)',
    JSON.stringify(personalPin) === JSON.stringify({ w: pin.w, retention: pin.requestRetention, max: pin.maximumInterval, fuzz: pin.enableFuzz, short: pin.enableShortTerm, steps: pin.learningSteps, relearn: pin.relearningSteps }));
  return corridor;
}

/** (e) one grade history, the same due on every surface */
async function historyPart(corridor) {
  const T0 = Date.parse('2026-10-19T07:00:00.000Z');
  const ratings = [3, 3, 1, 3, 2, 3, 4];
  for (const [label, learner] of [['the pin', null], ['gentle', corridor ? (corridor.S.srsPrefs = { preset: 'gentle', retention: 0.85 }, corridor.out.srsLearnerPolicy()) : null]]) {
    const ref = srsCore.createScheduler(fsrsApi, pin, learner);
    let refCard = fsrsApi.createEmptyCard(new Date(T0));
    let deckState = player.emptyState('demo');
    let ctxState = contextEngine.emptyState('demo');
    const deckScheduler = player.createScheduler(fsrsApi, pin, learner);
    const ctxScheduler = contextEngine.createScheduler(fsrsApi, pin, learner);
    const corridorScheduler = fsrsApi.fsrs(fsrsApi.generatorParameters(corridor.out.pinnedSchedulerInput(pin, null, learner ? { retention: learner.retention, learningSteps: learner.learningSteps } : corridor.out.srsSchedulePolicy(pin, {}))));
    let corridorCard = fsrsApi.createEmptyCard(new Date(T0));
    let at = T0;
    const rows = [];
    for (const rating of ratings) {
      const now = new Date(at);
      refCard = ref.next(refCard, now, rating).card;
      deckState = player.grade(fsrsApi, deckScheduler, deckState, 'c', rating, now);
      ctxState = contextEngine.grade(fsrsApi, ctxScheduler, ctxState, 'c', rating, now);
      corridorCard = corridorScheduler.repeat(corridorCard, corridor.out.srsSchedulerInstant(corridorCard, now))[rating].card;
      rows.push([refCard.due.toISOString(), deckState.cards.c.due, ctxState.cards.c.due, corridorCard.due.toISOString()]);
      at = refCard.due.getTime();
    }
    const same = rows.every((r) => r.every((d) => d === r[0]));
    check(`(e) one history (Good, Good, Again, Good, Hard, Good, Easy, each at its due), ${label}: srs-core, deck player, context deck and corridor give the same seven dues`, same, rows.map((r) => r[0].slice(5, 16)).join(' → '));
  }
  // your own texts replay their events: the same history through its engine
  const data = await personalFixture();
  const engine = personalEngine(data, fsrsApi, pin);
  let ledger = engine.fresh('verify');
  ledger.settings.newLimit = 60;
  const first = engine.queue(ledger, T0).next;
  const ref = srsCore.createScheduler(fsrsApi, pin);
  let refCard = fsrsApi.createEmptyCard(new Date(T0));
  let at = T0;
  const dues = [];
  for (const rating of ratings) {
    refCard = ref.next(refCard, new Date(at), rating).card;
    ledger = engine.grade(ledger, first.id, rating, `g-${at}`, 0, at);
    dues.push([refCard.due.getTime(), engine.derive(ledger).states.get(first.id).due.getTime()]);
    at = refCard.due.getTime();
  }
  check('(e) …and your own texts, replaying the same seven grades, give the same dues', dues.every(([a, b]) => a === b), dues.map(([a]) => new Date(a).toISOString().slice(5, 16)).join(' → '));

  // your own texts follow the sitting rule: a learning step waits while new cards remain; early only by choice
  let one = engine.fresh('verify-rule');
  one.settings.newLimit = 2;
  const a = engine.queue(one, T0).next;
  one = engine.grade(one, a.id, 3, 'r1', 0, T0);
  const afterA = engine.queue(one, T0 + 2000);
  const b = afterA.next;
  one = engine.grade(one, b.id, 3, 'r2', 0, T0 + 2000);
  const empty = engine.queue(one, T0 + 4000);
  const ahead = engine.queue(one, T0 + 4000, { ahead: true });
  let refusedPlain = false;
  try { engine.grade(one, ahead.next?.id, 3, 'r3', 0, T0 + 4000); } catch { refusedPlain = true; }
  let acceptedAhead = false;
  try { engine.grade(one, ahead.next?.id, 3, 'r4', 0, T0 + 4000, true); acceptedAhead = true; } catch { /* refused */ }
  check('(a)(c) your own texts: a learning step waits while a new card remains; with none left the queue pauses (early offered within 20 min); early only by choice',
    b && b.id !== a.id && !empty.next && empty.pause?.canEarly === true && ahead.early && refusedPlain && acceptedAhead,
    { second: b?.id === a.id ? 'same card' : 'another card', pause: empty.pause, early: ahead.early, refusedPlain, acceptedAhead });
  check('(d) your own texts: the Good wait on a new card is the 10-minute step', engine.intervals(engine.fresh('x'), first.id, T0)[2] === 10 * MIN);
}

/* ------------------------------------------------------------------ serving, with in-memory controls */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.m4a': 'audio/mp4' };
let overrides = {};
const server = createServer((request, response) => {
  const path = decodeURIComponent((request.url ?? '/').split('?')[0]);
  const rel = path === '/' ? 'index.html' : path.replace(/^\/+/u, '');
  const file = resolve(SITE, rel);
  let body;
  try {
    assert(file.startsWith(`${SITE}/`));
    body = overrides[rel] ?? readFileSync(file);
  } catch {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'cache-control': 'no-store', 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  response.end(body);
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const BASE = `http://127.0.0.1:${server.address().port}`;
/** a named in-memory edit of one served file; it must match exactly once */
function mutant(file, from, to) {
  const text = readFileSync(join(SITE, file), 'utf8');
  assert.equal(text.split(from).length, 2, `control edit for ${file} must match exactly once`);
  return { [file]: text.replace(from, to) };
}
const MUTANTS = {
  'pos-plus-4': () => mutant('decks/player/mount.js', `  ui.pos++;\n  // the next card by srs-core's rule: a learning step comes back when it is due, never a few cards later\n  settle();\n`,
    `  ui.pos++;\n  // the next card by srs-core's rule: a learning step comes back when it is due, never a few cards later\n  settle();\n  { const s = ctx.state.cards[id]; if (s && s.state !== 2 && new Date(s.due).getTime() - Date.now() < 15 * MIN) ui.queue.splice(Math.min(ui.queue.length, ui.pos + 4), 0, id); }\n`),
  'lying-label': () => mutant('decks/player/mount.js', `el('small', null, fmtWait(pv[name]))`, `el('small', null, fmtWait(pv[name] === 600000 ? 300000 : pv[name]))`),
  'stale-whole-write': () => mutant('decks/player/mount.js', `  if (text !== ctx.ledgerText && text != null) {`, `  if (false) {`),
  'context-frozen-queue': () => mutant('decks/context-dense/mount.js', `  ui.index += 1;\n  settle(next, now);`, `  ui.index += 1;\n  ui.screen = ui.index >= ui.queue.length ? 'done' : 'card';`),
  'corridor-silent-ahead': () => mutant('corridor.js', `ahead: !!rv.ahead });`, `ahead: true });`),
  'bury-off': () => mutant('srs-core.mjs', `export function buriedHere(answered, term, reading, where) {\n`, `export function buriedHere(answered, term, reading, where) {\n  return false;\n`),
};
function control(name, checkName, caught, detail = '') {
  receipt.controls.push({ name, check: checkName, caught: !!caught, detail });
  console.log(`${caught ? '  ok  ' : ' FAIL '} control · ${name} turns "${checkName}" red${detail ? `  — ${detail}` : ''}`);
}

/* ------------------------------------------------------------------ browser helpers */
const T_LOCAL = new Date('2026-10-19T16:00:00+09:00');
async function newPage(browser, { seedLocal = null } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', timezoneId: 'Asia/Tokyo' });
  await silenceBrowserAudio(context);
  const page = await context.newPage();
  await page.clock.install({ time: T_LOCAL });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)));
  if (seedLocal) {
    await page.goto(`${BASE}/404.html`);
    await page.evaluate((entries) => { for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, seedLocal);
  }
  return { context, page, errors };
}
const ledgerOf = (page, deck = 'n2') => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), `bunki-cloze:${deck}`);
const nowIn = (page) => page.evaluate(() => Date.now());
const isEarly = (chips) => chips.some((c) => /early|少し早め/iu.test(c));
async function openDeck(page, deck = 'n2') {
  await page.goto(`${BASE}/index.html?entry=shelf&ui=bi&deck=${deck}`, { waitUntil: 'load' });
  await page.waitForSelector('#kp-start', { timeout: 30000 });
}
async function onCard(page) {
  await page.waitForSelector('#kp-card, .kp-done', { timeout: 20000 });
  return page.locator('#kp-card').getAttribute('data-card').catch(() => null);
}
/** answer the card on screen with a grade; returns what the pad promised and what was stored */
async function answer(page, grade = 'good', deck = 'n2') {
  const card = await page.locator('#kp-card').getAttribute('data-card');
  const before = (await ledgerOf(page, deck))?.cards?.[card] ?? null;
  if (await page.locator('#kp-reveal').count()) await page.locator('#kp-reveal').click();
  await page.waitForSelector(`#kp-grade-${grade}`);
  const label = (await page.locator(`#kp-grade-${grade} small`).textContent()).trim();
  const chips = await page.locator('#kp-card .kp-st-step').allTextContents();
  const stepNote = await page.locator('.kp-stepnote').textContent().catch(() => null);
  const shownAt = await nowIn(page);
  await page.locator(`#kp-grade-${grade}`).click();
  await page.waitForFunction(([key, card, n]) => (JSON.parse(localStorage.getItem(key) || '{}').log || []).filter((r) => r[0] === card).length > n, [`bunki-cloze:${deck}`, card, (before?.reps ?? 0)], { timeout: 10000 }).catch(() => {});
  const ledger = await ledgerOf(page, deck);
  const after = ledger?.cards?.[card] ?? null;
  const row = [...(ledger?.log || [])].reverse().find((r) => r[0] === card);
  const promised = row && after ? playerWait(Date.parse(after.due) - Date.parse(row[2])) : null;
  return { card, before, after, label, promised, chips, stepNote, shownAt, early: isEarly(chips) };
}

/* ------------------------------------------------------------------ the deck player, John's route */
async function playerJohnRoute(browser, engine, { mutate = null } = {}) {
  const { context, page, errors } = await newPage(browser);
  const out = { showings: [], labelsHonest: true, earlyBeforeChoice: 0, repeatsBeforePause: 0 };
  try {
    await page.goto(`${BASE}/index.html?entry=shelf&ui=bi`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
    await page.locator('#tab-learn').click();
    await page.getByRole('button', { name: /Begin .*cards?/u }).first().click();
    const seen = new Set();
    for (let i = 0; i < 40; i += 1) {
      const card = await onCard(page);
      if (!card) break;
      const a = await answer(page);
      out.showings.push(a);
      if (seen.has(a.card)) out.repeatsBeforePause += 1;
      seen.add(a.card);
      if (a.before && Date.parse(a.before.due) > a.shownAt) out.earlyBeforeChoice += 1;
      if (a.label !== a.promised) out.labelsHonest = false;
    }
    out.newCards = seen.size;
    out.pause = (await page.locator('#kp-pause').textContent().catch(() => '')) || '';
    out.aheadButton = await page.locator('#kp-ahead').count();
    out.closeBefore = (await page.locator('.kp-done-line').allTextContents()).join(' ');
    out.beforeShot = join(OUT, `${engine}-player-close-pause.png`);
    await page.screenshot({ path: out.beforeShot, fullPage: true });
    if (out.aheadButton) {
      await page.locator('#kp-ahead').click();
      await page.waitForSelector('#kp-card', { timeout: 10000 });
      out.ahead = [];
      for (let i = 0; i < 40; i += 1) {
        const card = await onCard(page);
        if (!card) break;
        if (i === 0) {
          // the close fades out over the card: wait until it has gone, then look
          await page.waitForFunction(() => !document.querySelector('.kp-done'), null, { timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(700);
          await page.screenshot({ path: join(OUT, `${engine}-player-early-card.png`) });
        }
        const a = await answer(page);
        out.ahead.push(a);
        if (a.label !== a.promised) out.labelsHonest = false;
      }
      out.closeAfter = (await page.locator('.kp-done-line').allTextContents()).join(' ');
      out.pauseAfter = await page.locator('#kp-pause').count();
      await page.screenshot({ path: join(OUT, `${engine}-player-close-final.png`), fullPage: true });
      // (g) half an hour later the same day, nothing answered into review is due again
      await page.clock.fastForward('30:00');
      const ledger = await ledgerOf(page);
      const now = await nowIn(page);
      out.reviewDueAgain = Object.entries(ledger.cards).filter(([, c]) => c.state === 2 && Date.parse(c.due) <= now).length;
      out.minReviewDays = Math.min(...Object.values(ledger.cards).filter((c) => c.state === 2).map((c) => (Date.parse(c.due) - Date.parse(c.last_review)) / DAY));
    }
    out.errors = errors;
  } finally {
    await context.close();
  }
  if (mutate) return out;
  const n = out.newCards;
  check(`[${engine}] (a) John's route (Learn → Begin): ${n} new cards answered Good, none shown again before its 10-minute step while other cards remained`, n >= 10 && out.repeatsBeforePause === 0 && out.earlyBeforeChoice === 0, { newCards: n, repeats: out.repeatsBeforePause, early: out.earlyBeforeChoice });
  check(`[${engine}] (c)(j) with nothing else left the close counts the sitting and offers the early choice, within 20 min`,
    out.aheadButton === 1 && new RegExp(`^${n} words are in a learning step \\(the next is due in ([1-9]|10) min\\): review them now, early, or they will wait for you\\.$`, 'u').test(out.pause.trim()) &&
      new RegExp(`^${n} new words · ${n} answers in \\d+ minutes?\\.$`, 'u').test(out.closeBefore.trim()), `${out.closeBefore} | ${out.pause}`);
  const ahead = out.ahead || [];
  check(`[${engine}] (c) chosen early: each card says it is early and in its learning step, and Good graduates it`,
    ahead.length === n && ahead.every((a) => a.early && a.chips.some((c) => /Learning|学習中/u.test(c)) && a.after?.state === 2 && /days?$/u.test(a.label)),
    ahead.slice(0, 2).map((a) => `${a.chips.join('+')} → ${a.label}`).join(' · '));
  check(`[${engine}] (d) every pressed pad named exactly what it scheduled (${out.showings.length + ahead.length} answers)`, out.labelsHonest,
    [...out.showings, ...ahead].filter((a) => a.label !== a.promised).slice(0, 3).map((a) => `${a.label}≠${a.promised}`).join(' ') || `e.g. ${out.showings[0]?.label} · ${ahead[0]?.label}`);
  check(`[${engine}] (d) a card whose Good keeps it in its steps says when it comes back`, /Learning: Good brings it back in 10 min\./u.test(out.showings[0]?.stepNote || ''), out.showings[0]?.stepNote || '');
  check(`[${engine}] (j) the final close: ${n} new words, ${2 * n} answers, ${n} learning-step returns, all early by choice`,
    new RegExp(`^${n} new words · ${2 * n} answers in \\d+ minutes?\\. Cards came back ${n} times for a learning step \\(all a few minutes early, with nothing else left\\)\\.$`, 'u').test((out.closeAfter || '').trim()) && out.pauseAfter === 0, out.closeAfter);
  check(`[${engine}] (g) half an hour later no card answered into review is due again (shortest interval ${Number(out.minReviewDays).toFixed(1)} days)`, out.reviewDueAgain === 0 && out.minReviewDays >= 1, { due: out.reviewDueAgain });
  check(`[${engine}] no page errors on John's route`, out.errors.length === 0, out.errors.slice(0, 2).join(' | '));
  return out;
}

/* ------------------------------------------------------------------ the deck player, controlled */
const PREFS = (n) => ({ 'bunki-cloze:prefs:v3:n2': { newPerDay: n, mode: 'cloze' } });
async function playerSteps(browser, engine) {
  // (b) and (i): a step that falls due comes first; undo takes back only its own answer
  {
    const { context, page } = await newPage(browser, { seedLocal: PREFS(4) });
    try {
      await openDeck(page);
      await page.locator('#kp-start').click();
      await onCard(page);
      const a = await answer(page);
      const b0 = await onCard(page);
      // the step falls due while the next card is on screen: that card stays; the step comes right after it
      await page.clock.fastForward('11:00');
      const b = await answer(page);
      const c0 = await onCard(page);
      check(`[${engine}] (b) after its 10 minutes the learning card comes back first, before the waiting new cards`, a.after.state === 1 && b0 !== a.card && c0 === a.card, { first: a.card, second: b0, third: c0 });
      // (i) another window answers a card, then this window undoes its own last answer
      const other = await context.newPage();
      await openDeck(other);
      await other.locator('#kp-start').click();
      const otherCard = await onCard(other);
      const o = await answer(other);
      await page.locator('#kp-undo').click();
      await page.waitForSelector('#kp-grade-good, #kp-reveal');
      const ledger = await ledgerOf(page);
      const restored = JSON.stringify(ledger.cards[b.card] ?? null) === JSON.stringify(b.before) && !ledger.log.some((r) => r[0] === b.card);
      const kept = JSON.stringify(ledger.cards[o.card]) === JSON.stringify(o.after);
      check(`[${engine}] (i) undo restores the exact record (a new card: no record, no log row) and keeps another window's answer`, restored && kept && otherCard === o.card, { restored, kept });
    } finally {
      await context.close();
    }
  }
  // (f) Again: a new card is 1 minute; a review card is a 10-minute relearning step. (h) the new limit holds
  {
    const T = T_LOCAL.getTime();
    const deck = JSON.parse(readFileSync(join(SITE, 'decks/n2/deck.json'), 'utf8'));
    const reviewId = deck.words[40].cards[0].id;
    const seeded = { format: 'bunki-cloze-state', version: 1, deckId: 'n2', cards: { [reviewId]: { due: new Date(T - MIN).toISOString(), stability: 6, difficulty: 5, elapsed_days: 6, scheduled_days: 6, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: new Date(T - 6 * DAY).toISOString(), introducedAt: new Date(T - 20 * DAY).toISOString() } }, groupsOff: [], log: [], suspended: {}, repairs: {}, repairLog: [], lookups: [] };
    const { context, page } = await newPage(browser, { seedLocal: { ...PREFS(1), 'bunki-cloze:n2': seeded } });
    try {
      await openDeck(page);
      await page.locator('#kp-start').click();
      await onCard(page);
      const first = await answer(page, 'again');
      await onCard(page);
      const second = await answer(page, 'again');
      const review = [first, second].find((x) => x.card === reviewId);
      const fresh = [first, second].find((x) => x.card !== reviewId);
      check(`[${engine}] (f) Again on a new card: 1 min, a learning step; Again on a review card: 10 min, relearning`,
        fresh?.label === '1 min' && fresh.after.state === 1 && fresh.promised === '1 min' && review?.label === '10 min' && review.after.state === 3 && review.promised === '10 min',
        { fresh: fresh && [fresh.label, fresh.after.state], review: review && [review.label, review.after.state] });
      await page.waitForSelector('.kp-done');
      await page.locator('#kp-home').click();
      await page.waitForSelector('#kp-start');
      const tiles = await page.locator('.kp-tile.kp-c-new b').textContent();
      check(`[${engine}] (h) with a limit of 1 new card a day, none is offered after the first`, tiles.trim() === '0', `New tile ${tiles}`);
    } finally {
      await context.close();
    }
  }
  // (c) the close stands until the learner chooses: a step that falls due meanwhile reads "due now", and is then not early
  {
    const { context, page } = await newPage(browser, { seedLocal: PREFS(1) });
    try {
      await openDeck(page);
      await page.locator('#kp-start').click();
      await onCard(page);
      await answer(page);
      await page.waitForSelector('#kp-ahead');
      await page.clock.fastForward('11:00');
      await page.waitForFunction(() => /due now/u.test(document.getElementById('kp-pause')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
      const stood = await page.locator('#kp-card').count() === 0;
      const pause = (await page.locator('#kp-pause').textContent().catch(() => '')).trim();
      const label = (await page.locator('#kp-ahead').textContent().catch(() => '')).trim();
      await page.locator('#kp-ahead').click();
      await page.waitForSelector('#kp-card');
      const chips = await page.locator('#kp-card .kp-st-step').allTextContents();
      check(`[${engine}] (c) the close stands when the step falls due ("due now"), and the card then shown is not early`,
        stood && /^1 word is in a learning step \(the next is due now\): review it now, or it will wait for you\.$/u.test(pause) && label === 'Review now' && chips.some((c) => /Learning/u.test(c)) && !isEarly(chips),
        `${pause} | ${label} | ${chips.join('+')}`);
    } finally {
      await context.close();
    }
  }
  // (c) past the learn-ahead limit there is no early choice, only the wait
  {
    const T = T_LOCAL.getTime();
    const deck = JSON.parse(readFileSync(join(SITE, 'decks/n2/deck.json'), 'utf8'));
    const id = deck.words[7].cards[0].id;
    const seeded = { format: 'bunki-cloze-state', version: 1, deckId: 'n2', cards: { [id]: { due: new Date(T + 25 * MIN).toISOString(), stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 0, learning_steps: 1, reps: 1, lapses: 0, state: 1, last_review: new Date(T - MIN).toISOString(), introducedAt: new Date(T - MIN).toISOString() } }, groupsOff: [], log: [], suspended: {}, repairs: {}, repairLog: [], lookups: [] };
    const { context, page } = await newPage(browser, { seedLocal: { ...PREFS(0), 'bunki-cloze:n2': seeded } });
    try {
      await openDeck(page);
      const start = (await page.locator('#kp-start').textContent()).trim();
      await page.locator('#kp-start').click();
      await page.waitForSelector('.kp-done');
      const pause = (await page.locator('#kp-pause').textContent()).trim();
      const button = await page.locator('#kp-ahead').count();
      check(`[${engine}] (c) a learning step 25 min away: no early choice, the close says it will wait`, button === 0 && /^1 word is in a learning step \(the next is due in 25 min\); it will wait for you\.$/u.test(pause) && /in a learning step/u.test(start), `${start} | ${pause}`);
    } finally {
      await context.close();
    }
  }
}

/** P0: two open copies; the stale one never overwrites newer grades */
async function playerTwoWindows(browser, engine, { mutate = null } = {}) {
  const T = T_LOCAL.getTime();
  const deck = JSON.parse(readFileSync(join(SITE, 'decks/n2/deck.json'), 'utf8'));
  const ids = deck.words.slice(0, 5).map((w) => w.cards[0].id);
  const cards = Object.fromEntries(ids.map((id, i) => [id, { due: new Date(T - (5 - i) * MIN).toISOString(), stability: 0.6, difficulty: 5, elapsed_days: 1, scheduled_days: 1, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: new Date(T - DAY).toISOString(), introducedAt: new Date(T - 9 * DAY).toISOString() }]));
  const seeded = { format: 'bunki-cloze-state', version: 1, deckId: 'n2', cards, groupsOff: [], log: [], suspended: {}, repairs: {}, repairLog: [], lookups: [] };
  const { context, page: a } = await newPage(browser, { seedLocal: { ...PREFS(0), 'bunki-cloze:n2': seeded } });
  const out = {};
  try {
    const b = await context.newPage();
    await openDeck(b);
    await b.locator('#kp-start').click();
    out.bCard = await onCard(b);
    await openDeck(a);
    await a.locator('#kp-start').click();
    const graded = [];
    for (let i = 0; i < 5; i += 1) { await onCard(a); graded.push(await answer(a)); }
    out.labels = graded.map((g) => g.label);
    const afterA = await ledgerOf(a);
    // the stale copy answers the card it has been showing since before A's grades
    if (await b.locator('#kp-reveal').count()) await b.locator('#kp-reveal').click();
    await b.locator('#kp-grade-good').click();
    await b.waitForTimeout(400);
    out.toast = (await b.locator('.kp-toast').textContent().catch(() => '')) || '';
    const afterB = await ledgerOf(a);
    out.logA = afterA.log.length;
    out.logB = afterB.log.length;
    out.rolledBack = ids.filter((id) => afterB.cards[id].due !== afterA.cards[id].due);
    // every one keeps the interval its pad promised A (days, never today)
    out.allDays = ids.filter((id, i) => playerWait(Date.parse(afterB.cards[id].due) - Date.parse(afterB.cards[id].last_review)) === out.labels[i] && Date.parse(afterB.cards[id].due) - Date.parse(afterB.cards[id].last_review) >= DAY).length;
    // a reload of A finds nothing due: the six-day cards do not come back
    await openDeck(a);
    out.startAfter = (await a.locator('#kp-start').textContent()).trim();
  } finally {
    await context.close();
  }
  const pass = out.logB === out.logA && out.rolledBack.length === 0 && out.allDays === 5;
  if (mutate) return pass;
  check(`[${engine}] P0 two open copies: A answers five review cards Good (${out.labels?.[0]}); the stale copy's answer is refused, nothing rolls back`, pass && /another window/u.test(out.toast), { logA: out.logA, logB: out.logB, rolledBack: out.rolledBack.length, keptTheirDays: out.allDays, toast: out.toast });
  check(`[${engine}] P0 …and after a reload none of those cards is due again today`, /Done for today|今日はここまで/u.test(out.startAfter), out.startAfter);
  return pass;
}

/* ------------------------------------------------------------------ the context deck */
async function contextDeck(browser, engine, { mutate = null } = {}) {
  const { context, page } = await newPage(browser);
  const key = 'bunki-srs-deck:bunki-context-dense-2026';
  const read = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), key);
  const out = { order: [], labels: [] };
  try {
    await page.goto(`${BASE}/index.html?entry=shelf&ui=bi&deck=context`, { waitUntil: 'load' });
    await page.waitForSelector('#cd-start', { timeout: 30000 });
    await page.locator('#cd-start').click();
    const one = async (seal) => {
      await page.waitForSelector('#cd-got', { timeout: 10000 });
      const id = await page.evaluate(() => document.querySelector('.cd-room')?.innerText.slice(0, 40));
      await page.locator('#cd-got').click();
      await page.waitForSelector(`#cd-${seal}`);
      const label = (await page.locator(`#cd-${seal} .cd-seal-t`).textContent()).trim();
      const before = await read();
      await page.locator(`#cd-${seal}`).click();
      const after = await read();
      const changed = Object.keys(after.cards).find((k) => JSON.stringify(after.cards[k]) !== JSON.stringify(before?.cards?.[k]));
      const rec = after.cards[changed];
      out.order.push(changed);
      out.labels.push([label, playerWait(Date.parse(rec.due) - Date.parse(rec.last_review))]);
      return changed;
    };
    out.first = await one('again');
    await one('good');
    await page.clock.fastForward('01:10');
    await one('good');
    await page.waitForSelector('#cd-got', { timeout: 10000 });
    await page.locator('#cd-got').click();
    await page.waitForSelector('#cd-good');
    const before = await read();
    await page.locator('#cd-good').click();
    const after = await read();
    out.fourth = Object.keys(after.cards).find((k) => JSON.stringify(after.cards[k]) !== JSON.stringify(before.cards[k]));
  } finally {
    await context.close();
  }
  const pass = out.fourth === out.first && !out.order.slice(1).includes(out.first);
  if (mutate) return pass;
  check(`[${engine}] (a)(b) context deck: Again comes back only after its minute, first once due`, pass, { again: out.first, fourth: out.fourth });
  check(`[${engine}] (d) context deck: each seal names the wait it scheduled`, out.labels.every(([shown, stored]) => shown === stored), out.labels.map((l) => l.join('=')).join(' '));
  return pass;
}

/* ------------------------------------------------------------------ the corridor's saved-word review and timed practice */
const DICT = JSON.parse(readFileSync(join(SITE, 'data/share_alike/dict.json'), 'utf8')).words;
const WORDS = Object.keys(DICT).filter((w) => /^[\p{Script=Han}\p{Script=Hiragana}]{2,4}$/u.test(w) && Array.isArray(DICT[w].m) && DICT[w].m.some((m) => typeof m === 'string' && m.trim())).slice(0, 6);
/** a corridor record, committed through the app's own importer (the suites' way), then the app reopened */
async function corridorBoot(browser, seed, { local = null } = {}) {
  const { context, page, errors } = await newPage(browser, { seedLocal: local });
  await page.goto(`${BASE}/index.html?entry=shelf&ui=bi`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
  await restoreAppFixture(page, seed);
  await page.goto(`${BASE}/index.html?entry=shelf&ui=bi`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
  return { context, page, errors };
}
async function corridorReview(browser, engine, { mutate = null } = {}) {
  const T = T_LOCAL.getTime();
  const taken = WORDS.map((id, i) => ({ t: 'word', id, label: id, ts: T - 1e6 + i, started: T - 1e6 + i }));
  const { context, page } = await corridorBoot(browser, { v: 1, taken, srs: {}, revlog: [], obslog: [], stats: {}, suspended: {}, srsPrefs: { newPerDay: 20, reviewLimit: 200 } });
  const out = { shown: [], labels: [], earlyBeforeChoice: 0 };
  try {
    out.todayKeys = await page.evaluate(() => window.__KAIRO_SRS__.today().keys);
    await page.locator('#tray').click();
    await page.locator('#review-start').click();
    const grade = async () => {
      await page.waitForSelector('#reveal, .grade.g-good', { timeout: 15000 });
      const key = await page.evaluate(() => window.__KAIRO_SRS__.current());
      const step = (await page.locator('.review-step').textContent().catch(() => '')) || '';
      if (await page.locator('#reveal').count()) await page.locator('#reveal').click();
      await page.waitForSelector('.grade.g-good:not([disabled])');
      const label = (await page.locator('.grade.g-good .g-when').textContent()).trim();
      const ix = await page.evaluate(() => window.__KAIRO_SRS__.session()?.ix);
      await page.locator('.grade.g-good').click();
      await page.waitForFunction((ix) => (window.__KAIRO_SRS__.session()?.ix ?? -1) > ix, ix, { timeout: 10000 });
      const record = await readAppRecord(page);
      const row = record.revlog[record.revlog.length - 1];
      const promised = row[10] >= 1 ? `${row[10]} d` : `${Math.max(1, Math.round((row[11] - row[0]) / MIN))} min`;
      out.labels.push([label, promised]);
      return { key, step };
    };
    for (let i = 0; i < 12; i += 1) {
      if (await page.locator('#review-pause').count()) break;
      const g = await grade();
      if (out.shown.includes(g.key)) out.earlyBeforeChoice += 1;
      out.shown.push(g.key);
    }
    out.pause = (await page.locator('#review-pause').textContent().catch(() => '')) || '';
    out.said = (await page.locator('.review-said').allTextContents()).join(' ');
    await page.screenshot({ path: join(OUT, `${engine}-corridor-close-pause.png`), fullPage: true });
    if (await page.locator('#review-ahead').count()) {
      await page.locator('#review-ahead').click();
      out.ahead = [];
      for (let i = 0; i < 12; i += 1) {
        if (!(await page.locator('#reveal, .grade.g-good').count())) break;
        out.ahead.push(await grade());
      }
    }
  } finally {
    await context.close();
  }
  const n = WORDS.length;
  const pass = out.shown.length === n && out.earlyBeforeChoice === 0 && /are in a learning step/u.test(out.pause);
  if (mutate) return pass;
  check(`[${engine}] (a)(c) corridor review: ${n} saved words answered Good, none again before its step; then the close offers the early choice`, pass, { shown: out.shown.length, repeats: out.earlyBeforeChoice, pause: out.pause });
  check(`[${engine}] (j) corridor close counts the sitting`, new RegExp(`^${n} new words · ${n} answers in \\d+ minutes?\\.$`, 'u').test(out.said.trim()), out.said);
  check(`[${engine}] (c) corridor, chosen early: each card says it is early, Good graduates it`, (out.ahead || []).length === n && out.ahead.every((g) => /early/u.test(g.step)), (out.ahead || []).slice(0, 1).map((g) => g.step).join(''));
  check(`[${engine}] (d) corridor pads named what they scheduled (${out.labels.length} answers)`, out.labels.every(([a, b]) => a === b), out.labels.filter(([a, b]) => a !== b).slice(0, 3).map((l) => l.join('≠')).join(' ') || out.labels.slice(0, 1).concat(out.labels.slice(-1)).map((l) => l[0]).join(' … '));
  return pass;
}
async function timedKanji(browser, engine) {
  const T = T_LOCAL.getTime();
  const card = { due: new Date(T + 6 * DAY).toISOString(), last_review: new Date(T - DAY).toISOString(), stability: 6, difficulty: 5, elapsed_days: 1, scheduled_days: 7, learning_steps: 0, reps: 4, lapses: 0, state: 2 };
  const seed = { v: 1, taken: [{ t: 'kanji', id: '海', label: '海', ts: T - 9e8, started: T - 9e8 }], srs: { 'kanji:海': card }, revlog: [], obslog: [], stats: {}, suspended: {}, srsPrefs: { newPerDay: 20, reviewLimit: 200 } };
  const { context, page } = await corridorBoot(browser, seed);
  const out = {};
  try {
    await page.locator('#chrome-dojo').click();
    await page.locator('.focus-start').waitFor({ timeout: 15000 });
    await page.locator('.focus-mode').filter({ hasText: /kanji only/iu }).click();
    await page.locator('.focus-start').click();
    await page.locator('#reveal').waitFor({ timeout: 15000 });
    const before = await readAppRecord(page);
    await page.locator('#reveal').click();
    await page.locator('.g-good').waitFor();
    out.practice = await page.locator('.grade-row[data-practice]').count();
    out.label = (await page.locator('.g-good .g-when').textContent()).trim();
    await page.locator('.g-good').click();
    await page.waitForTimeout(500);
    const after = await readAppRecord(page);
    out.same = JSON.stringify(before.srs['kanji:海']) === JSON.stringify(after.srs['kanji:海']) && before.revlog.length === after.revlog.length;
    out.obs = after.obslog.length - before.obslog.length;
  } finally {
    await context.close();
  }
  check(`[${engine}] C1 timed Kanji-only practice of a card due in six days is practice (稽古): its schedule and review log stay byte-identical`, out.practice === 1 && out.same && out.obs === 1 && /practice|稽古/u.test(out.label), out);
}

/* ------------------------------------------------------------------ burying across surfaces */
async function buryAcrossDecks(browser, engine, { mutate = null } = {}) {
  const T = T_LOCAL.getTime();
  const due = (extra = {}) => ({ due: new Date(T - MIN).toISOString(), stability: 6, difficulty: 5, elapsed_days: 6, scheduled_days: 6, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: new Date(T - 6 * DAY).toISOString(), ...extra });
  const ledger = (deckId, ids) => ({ format: 'bunki-cloze-state', version: 1, deckId, cards: Object.fromEntries(ids.map((id) => [id, due({ introducedAt: new Date(T - 30 * DAY).toISOString() })])), groupsOff: [], log: [], suspended: {}, repairs: {}, repairLog: [], lookups: [] });
  const find = (deckId) => JSON.parse(readFileSync(join(SITE, `decks/${deckId}/deck.json`), 'utf8')).words.find((w) => w.term === '検証' && w.reading === 'けんしょう');
  const senmon = find('senmon').cards[0].id;
  const mine = find('kotoba-mine').cards[0].id;
  const mcdWord = find('kotoba-mcd').cards.find((c) => c.type !== 'kanji').id;
  const mcdKanji = find('kotoba-mcd').cards.find((c) => c.type === 'kanji').id;
  const local = {
    'bunki-cloze:senmon': ledger('senmon', [senmon]), 'bunki-cloze:kotoba-mine': ledger('kotoba-mine', [mine]), 'bunki-cloze:kotoba-mcd': ledger('kotoba-mcd', [mcdWord, mcdKanji]),
    'bunki-srs-deck:bunki-context-dense-2026': { format: 'bunki-srs-deck-state', version: 1, deckId: 'bunki-context-dense-2026', cards: { kensho: due({ introducedAt: new Date(T - 30 * DAY).toISOString() }) } },
    ...Object.fromEntries(['senmon', 'kotoba-mine', 'kotoba-mcd'].map((id) => [`bunki-cloze:prefs:v3:${id}`, { newPerDay: 0, mode: 'cloze' }])),
  };
  const started = T - 9e8;
  const seed = { v: 1, taken: [{ t: 'word', id: '検証', label: '検証', ts: started, started }, { t: 'kanji', id: '検', label: '検', ts: started + 1, started: started + 1 }],
    srs: { 'word:検証': due(), 'kanji:検': due() }, revlog: [], obslog: [], stats: {}, suspended: {}, srsPrefs: { newPerDay: 0, reviewLimit: 200 } };
  const { context, page } = await corridorBoot(browser, seed, { local });
  const out = {};
  const corridorKeys = async () => {
    await page.goto(`${BASE}/index.html?entry=shelf&ui=bi`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
    return page.evaluate(() => window.__KAIRO_SRS__.today().keys);
  };
  const contextServes = async () => {
    await page.goto(`${BASE}/index.html?entry=shelf&ui=bi&deck=context`, { waitUntil: 'load' });
    await page.waitForSelector('#cd-start', { timeout: 30000 });
    await page.locator('#cd-start').click();
    await page.waitForSelector('#cd-got, .cd-said, .cd-buried, .cd-title', { timeout: 10000 });
    return { served: await page.locator('#cd-got').count(), buried: (await page.locator('.cd-buried').textContent().catch(() => '')) || '' };
  };
  try {
    out.before = await corridorKeys();
    await openDeck(page, 'senmon');
    await page.locator('#kp-start').click();
    await onCard(page);
    out.answered = await answer(page, 'good', 'senmon');
    await page.waitForSelector('.kp-done');
    await openDeck(page, 'kotoba');
    out.mineStart = (await page.locator('#kp-start').textContent()).trim();
    out.mineLine = (await page.locator('.kp-buried').textContent().catch(() => '')) || '';
    await openDeck(page, 'mcd');
    await page.locator('#kp-start').click();
    out.mcdServed = await onCard(page);
    out.context = await contextServes();
    out.keysToday = await corridorKeys();
    // tomorrow, every one of them is served again
    await page.clock.fastForward('24:00:00');
    await openDeck(page, 'kotoba');
    out.mineTomorrow = (await page.locator('#kp-start').textContent()).trim();
    out.contextTomorrow = await contextServes();
    out.keysTomorrow = await corridorKeys();
  } finally {
    await context.close();
  }
  const restedToday = out.answered?.card === senmon && /Done for today|今日はここまで/u.test(out.mineStart) && out.mcdServed === mcdKanji && out.context.served === 0 &&
    !out.keysToday.includes('word:検証') && out.keysToday.includes('kanji:検') && out.before.includes('word:検証');
  if (mutate) return restedToday;
  check(`[${engine}] B 検証 answered in 専門: its cards in 言葉の鉱脈, MCD and the context deck and its saved word: card rest today; kanji:検 and the MCD 字 card are served`, restedToday,
    { mine: out.mineStart, mcdServed: out.mcdServed === mcdKanji ? '字 card' : out.mcdServed, context: out.context, corridor: out.keysToday });
  check(`[${engine}] B …each surface says it quietly`, /^1 card for a word you already answered today waits until tomorrow\.$/u.test(out.mineLine.trim()) && /^1 card for a word you already answered today waits until tomorrow\.$/u.test(out.context.buried.trim()), `${out.mineLine} | ${out.context.buried}`);
  check(`[${engine}] B …and tomorrow every one of them is served`, /Begin — 1 card/u.test(out.mineTomorrow) && out.contextTomorrow.served === 1 && out.keysTomorrow.includes('word:検証'), { mine: out.mineTomorrow, context: out.contextTomorrow.served, corridor: out.keysTomorrow });
  return restedToday;
}

/** one scenario that throws records a red with its error and the run goes on */
async function scenario(label, fn) {
  try {
    return await fn();
  } catch (error) {
    check(`${label} ran to the end`, false, String(error?.message || error).split('\n')[0].slice(0, 240));
    return null;
  }
}

/* ------------------------------------------------------------------ run */
const corridorLifted = nodePart();
await historyPart(corridorLifted);
for (const engine of ENGINES) {
  const browser = await (engine === 'webkit' ? webkit : chromium).launch();
  try {
    receipt[`${engine}Version`] = browser.version();
    overrides = {};
    if (runs('john')) await scenario(`[${engine}] John's route`, () => playerJohnRoute(browser, engine));
    if (runs('steps')) await scenario(`[${engine}] deck player steps`, () => playerSteps(browser, engine));
    if (runs('p0')) await scenario(`[${engine}] P0 two windows`, () => playerTwoWindows(browser, engine));
    if (runs('context')) await scenario(`[${engine}] context deck`, () => contextDeck(browser, engine));
    if (runs('corridor')) await scenario(`[${engine}] corridor review`, () => corridorReview(browser, engine));
    if (runs('timed')) await scenario(`[${engine}] timed Kanji-only`, () => timedKanji(browser, engine));
    if (runs('bury')) await scenario(`[${engine}] burying across surfaces`, () => buryAcrossDecks(browser, engine));
    if (CONTROLS) {
      if (runs('john')) {
      overrides = MUTANTS['pos-plus-4']();
      const pos4 = (await scenario(`[${engine}] control pos+4`, () => playerJohnRoute(browser, engine, { mutate: true }))) || { repeatsBeforePause: 0, earlyBeforeChoice: 0 };
      control(`[${engine}] the old pos+4 rule`, '(a) John\'s route', pos4.repeatsBeforePause > 0 || pos4.earlyBeforeChoice > 0, `repeats ${pos4.repeatsBeforePause}`);
      overrides = MUTANTS['lying-label']();
      const lie = (await scenario(`[${engine}] control lying label`, () => playerJohnRoute(browser, engine, { mutate: true }))) || { labelsHonest: true };
      control(`[${engine}] a label that lies (Good says 5 min, schedules 10)`, '(d) every pressed pad', !lie.labelsHonest);
      }
      // a control is caught only when its named check returns red; a crash under a control is not proof
      for (const [key, name, label, checkName, run] of [
        ['p0', 'stale-whole-write', 'a stale whole-ledger write (no fresh read)', 'P0 two open copies', () => playerTwoWindows(browser, engine, { mutate: true })],
        ['context', 'context-frozen-queue', 'the context deck with its own frozen queue', '(a)(b) context deck', () => contextDeck(browser, engine, { mutate: true })],
        ['corridor', 'corridor-silent-ahead', 'the corridor learning ahead without the choice', '(a)(c) corridor review', () => corridorReview(browser, engine, { mutate: true })],
        ['bury', 'bury-off', 'burying across surfaces switched off', 'B 検証 answered in 専門', () => buryAcrossDecks(browser, engine, { mutate: true })],
      ]) {
        if (!runs(key)) continue;
        overrides = MUTANTS[name]();
        control(`[${engine}] ${label}`, checkName, (await scenario(`[${engine}] control ${name}`, run)) === false);
      }
      overrides = {};
    }
  } finally {
    await browser.close();
  }
}
server.close();
receipt.uptimeEnd = uptime();
receipt.finishedAt = new Date().toISOString();
receipt.results = results;
const failed = results.filter((r) => !r.pass);
const missed = receipt.controls.filter((c) => !c.caught);
receipt.pass = !ONLY && failed.length === 0 && missed.length === 0;
receipt.only = ONLY ? [...ONLY] : null;
receipt.verifierSha256 = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
writeFileSync(join(OUT, 'srs-conformance.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`\n${results.length - failed.length}/${results.length} checks · ${receipt.controls.length - missed.length}/${receipt.controls.length} controls caught · ${receipt.uptimeStart} → ${receipt.uptimeEnd}`);
console.log(`receipt → ${join(OUT, 'srs-conformance.json')}`);
process.exit(receipt.pass ? 0 : 1);
