/** M4 S4 (lead 1835; UX r4.3 c427e515 §7 steps 7–11; window 4 1746/1754 conditions A and B): the day-2 walk as a pure probe.
 * The authored corridor (r8 course adapter, journey seams, quest UI) is lifted into the r8 vm sandbox with the actual
 * kanji-course.js, over the REAL record app, record host and journey lifecycle (built record-core, --modules), the real review
 * caller, help-relevance rule and catalog, srs-core and m4-quest.mjs. The DOM is synthetic (ids, text, click, submit); the reader's
 * sentence lookup and navigation are stubs. Every graded step binds its raw day-2 help rows and origins as the hook received them,
 * and its expected rating is derived from those rows by window 4's rule (S31:22–25) here, independently of the installed rule,
 * never from the route. No browser, device or walk claim (MD:62). stdout only; no files are written.
 *   node tools/verify-m4-day2.mjs --modules=<dir> [--case=<id>] [--mutants] [--receipt]
 */
import assert from 'node:assert/strict';
import { readFileSync, statfsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import * as layer from './srs-hooks-corridor-layer.mjs';
import { load, openApp } from './verify-journey-record.mjs';
import { DUE, DAY, store } from './verify-journey-corridor.mjs';

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
// rule 1725: pure probes run down to 1.2 GiB
const floor = () => { const s = statfsSync(DIR); assert.ok(s.bavail * s.bsize >= 1.2 * 1024 ** 3, 'DISK STOP: below 1.2 GiB'); };
const read = (path) => readFileSync(join(DIR, path), 'utf8');
const url = (text) => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
const deepFreeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };
process.env.TZ = 'Asia/Tokyo';

export const TEXTS = Object.freeze({ corridor: read('corridor.js'), course: read('kanji-course.js'), core: read('srs-core.mjs'),
  relevance: read('help-relevance.mjs'), catalog: read('data/help-relevance-catalog.json'), quest: read('m4-quest.mjs') });
const fsrsApi = await import(pathToFileURL(join(DIR, 'vendor/ts-fsrs.mjs')));
const pin = JSON.parse(read('data/fsrs-pin.json'));
const caller = await import(pathToFileURL(join(DIR, 'review-caller.mjs')));
const SWITCH = 'const JOURNEY_WRITES = false;';
const NAMES = [...layer.CORRIDOR_NAMES, ...layer.JOURNEY_NAMES, 'kanjiCourseReferenceHelp',
  'ROOM_NAMES', 'roomName', 'M4_COPY', 'kanjiCourseRunKind', 'kanjiRoomEntry', 'kanjiChooseRoom', 'kanjiEnterCourseDoor', 'openKanjiRooms',
  'renderKanjiRoomChooser', 'renderKanjiCourseDoor', 'renderKanjiCourseMenu', 'renderKanjiCourse', 'kanjiCourseNodeUnit',
  'kanjiCourseReturnFrame', 'kanjiCourseEntryNode',
  'kanjiQuestModule', 'KANJI_QUEST_STRUCTURAL', 'KANJI_QUEST_FAILED', 'kanjiQuestAdopt', 'kanjiQuestOwner', 'kanjiQuestFor',
  'kanjiQuestStructural', 'kanjiQuestSeed', 'kanjiQuestSentences', 'kanjiQuestQuote', 'kanjiQuestLoading', 'kanjiQuestStale', 'kanjiQuestLine', 'kanjiQuestLines',
  'kanjiQuestBinding', 'kanjiQuestBound', 'kanjiQuestWordsDone', 'kanjiQuestRunStarted', 'kanjiQuestSettle', 'kanjiQuestSelfCheck',
  'kanjiQuestRedraw', 'kanjiQuestAct', 'kanjiQuestCreate', 'kanjiQuestEnd', 'kanjiQuestClear', 'kanjiQuestDoor', 'kanjiQuestOpen',
  'kanjiQuestLessonRows', 'kanjiQuestStage', 'kanjiQuestLeave', 'kanjiQuestPool', 'kanjiQuestRender', 'kanjiQuestSummary'];

class Element {
  constructor(tag, className = '', text = '') {
    Object.assign(this, { tagName: tag.toUpperCase(), className, text: String(text ?? ''), children: [], dataset: {}, attributes: {},
      events: new Map(), id: '', value: '', disabled: false, isConnected: true, type: '' });
  }
  append(...children) { this.children.push(...children); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener(type, listener) { this.events.set(type, [...(this.events.get(type) || []), listener]); }
  focus() {}
  get textContent() { return this.text + this.children.map((c) => (c instanceof Element ? c.textContent : String(c))).join(''); }
  click() { if (this.disabled) return; for (const listener of this.events.get('click') || []) listener({ target: this, currentTarget: this, preventDefault() {} }); }
}
const all = (node) => [node, ...node.children.filter((c) => c instanceof Element).flatMap(all)];

/** the fixture occurrence (§7): 職業 at token 26 of bunki-essay-n1-city, in a passage of 。-ended sentences (this one [24,42)) */
const PASSAGE = { id: 'bunki-essay-n1-city', tokens: [[...Array(23).fill('の'), '。'], ['の', 'の', '職業', ...Array(14).fill('の'), '。'],
  [...Array(17).fill('の'), '。']].flat().map((s) => ({ s, b: s })) };
/** the reader's sentence for a token, as takenContext gives it in this model: from after the previous 。 through its own 。 */
const sentenceAt = (index) => {
  let start = index; while (start > 0 && PASSAGE.tokens[start - 1].s !== '。') start -= 1;
  let end = index; while (end < PASSAGE.tokens.length - 1 && PASSAGE.tokens[end].s !== '。') end += 1;
  return { p: PASSAGE, index, start, end: end + 1, quote: PASSAGE.tokens.slice(start, end + 1).map((t) => t.s).join('') };
};
const WORD = Object.freeze({ t: 'word', id: '職業', reading: 'しょくぎょう', from: { passage: PASSAGE.id, index: 26 }, ctxScope: 'sent' });
const dict = { 職業: { r: 'しょくぎょう', m: ['occupation'] }, 知識: { r: 'ちしき', m: ['knowledge'] }, 組織: { r: 'そしき', m: ['organization'] },
  水道: { r: 'すいどう', m: ['water supply'] } };

const HELPERS = `
var __calls = [];
function tx(ja, en) { return en; }
const __report = reportHookAttempt;
window.__KAIRO_HOOKS__ = Object.freeze({ report: (evidence, binding) => {
  __calls.push(JSON.parse(JSON.stringify({ evidence })));
  return __report(evidence, binding);
} });
function __journey() { return kanjiJourney; }
function __copy(id) { return M4_COPY[id]; }
`;

/** one load of the app over a learner's store: the r8 sandbox, the lifted corridor ON, the real record app, adoption as at boot with
 * the quest adapter at hand */
async function page(env, modules, { controller, storage, time }) {
  const core = await import(url(env.core));
  const relevance = await import(url(env.relevance));
  const program = layer.liftCorridor(env.corridor.replace(SWITCH, 'const JOURNEY_WRITES = true;'), NAMES);
  const h = layer.corridorSandbox(program, { core, fsrsApi, pin, record: {}, dict, clock: () => new Date(time.now), storage });
  const ctx = h.sandbox;
  ctx.setTimeout = setTimeout; ctx.clearTimeout = clearTimeout;
  delete ctx.Object; delete ctx.JSON; delete ctx.Array;
  vm.runInContext(`${env.course}\nwindow.BunkiKanjiCourse = BunkiKanjiCourse;\n${HELPERS}`, ctx);
  const app = await openApp(modules, controller);
  ctx.recordApp = { write: (producer) => app.write((record, snapshot) => structuredClone(producer(record, snapshot))),
    journeyAuthority: () => app.journeyAuthority(), commitJourney: (input, gate) => app.commitJourney(input, gate),
    current: () => app.current(), snapshot: () => app.snapshot() };
  ctx.maintenanceServedBuild = async () => ({ git_sha: 'a'.repeat(40), artifact_sha256: 'b'.repeat(64) });
  ctx.adoptHelpRelevance({ createRelevance: relevance.createRelevance, createCaller: caller.createCaller, catalog: JSON.parse(env.catalog) });
  // the page around the course: a synthetic DOM, the reader's sentence lookup, the dictionary's capture as the visit's help
  let main = new Element('main');
  const toasts = [];
  Object.assign(ctx.S, { view: 'lessons', stack: [], navigationReturns: [], kanjiCourse: null, lessonsDone: {}, lessonRun: null });
  Object.assign(ctx, {
    el: (tag, cls, text) => new Element(tag, cls, text),
    biLabel: (tag, cls, ja, en) => new Element(tag, cls, en),
    document: { getElementById: (id) => all(main).find((e) => e.id === id) || null },
    render: () => {
      main = new Element('main');
      if (ctx.S.view !== 'lessons') main.append(new Element('p', '', `view:${ctx.S.view}`));
      else if (ctx.S.kanjiCourse && ctx.S.kanjiCourse.stage !== 'menu') ctx.renderKanjiCourse(main);
      else ctx.renderKanjiCourseMenu(main);
    },
    // a full entry opened from the course: enterWord's capture of the live visit's help (C:41343)
    go: (node) => ctx.kanjiCourseReferenceHelp(ctx.S.kanjiCourse, node),
    returnFromNavigation: () => false,
    showReaderToast: (message) => toasts.push(message),
    teacherSentence: (node) => (node?.from?.passage === PASSAGE.id && Number.isInteger(node.from.index) && node.from.index >= 0 &&
      node.from.index < PASSAGE.tokens.length ? sentenceAt(node.from.index) : null),
    ensureArticle: async () => {},
    // the reader's course door on the word page (C:20590–20612): a new visit, and the reader start is dictionary help (K-25)
    openKanjiCourseUnit: (node) => {
      const unit = ctx.kanjiCourseNodeUnit(node);
      if (!unit) return false;
      const prior = ctx.S.kanjiCourse;
      const visit = prior?.unitId === unit.id ? prior : { unitId: unit.id, stage: 'intro', index: 0, epoch: ctx.recordEpoch, run: null,
        draft: '', feedback: null, saved: false, pending: false, supportedPractice: true };
      if (visit !== prior) ctx.kanjiCourseReferenceHelp(visit, node);
      ctx.S.kanjiCourse = visit; ctx.S.view = 'lessons';
      return true;
    },
  });
  ctx.D.passages = [PASSAGE];
  ctx.window.scrollTo = () => {};
  const quest = await import(url(env.quest));
  ctx.__journeyModule = { ...modules.lifecycle, createLifecycle: (options) => modules.lifecycle.createLifecycle({ ...options,
    device: { ...options.device, read: (key) => structuredClone(options.device.read(key)) },
    validateCapture: (entries) => deepFreeze(structuredClone(options.validateCapture(entries))) }) };
  ctx.__questModule = quest;
  vm.runInContext('kanjiJourneyModule = Promise.resolve(__journeyModule); kanjiQuestModule = Promise.resolve(__questModule);', ctx);
  await ctx.adoptJourney(ctx.recordEpoch, ctx.recordApp).catch(() => {});
  ctx.render();
  const settle = async () => {
    for (let i = 0; i < 2000 && ctx.S.kanjiCourse?.pending; i += 1) await new Promise((r) => setImmediate(r));
    for (let i = 0; i < 60; i += 1) await new Promise((r) => setImmediate(r));
  };
  const p = {
    ctx, app, controller, time, toasts, quest, S: ctx.S, course: ctx.window.BunkiKanjiCourse, settle,
    get main() { return main; },
    find: (id) => all(main).find((e) => e.id === id) || null,
    has: (text) => main.textContent.includes(text),
    copy: (id) => ctx.__copy(id)[1],
    click(id) { const target = p.find(id); assert.ok(target, `no #${id} on the page`); assert.equal(target.disabled, false, `#${id} is disabled`); target.click(); },
    record: () => controller.document('learner-record'),
    root: () => p.record().m4Journey,
    phase: () => ctx.__journey()?.lifecycle?.inspect().phase,
    calls: () => JSON.parse(JSON.stringify(vm.runInContext('__calls', ctx))),
    goals: () => quest.quests(p.record().m4Journey),
    word() { const sheet = new Element('section'); ctx.renderKanjiCourseDoor(sheet, WORD); return sheet; },
    lessons() { const section = new Element('main'); ctx.renderKanjiCourseMenu(section); return section; },
    prompt: () => p.course.currentPrompt(ctx.S.kanjiCourse.run),
    attemptId: () => p.course.currentAttempt(ctx.S.kanjiCourse.run).attemptId,
  };
  return p;
}
/** the learner's answer through the form (reading) or the choices (meaning), then the feedback the journey keeps */
async function answer(p, right) {
  const prompt = p.prompt();
  if (prompt.kind === 'meaning') {
    const id = right ? prompt.answerId : prompt.choices.find((c) => c.id !== prompt.answerId).id;
    p.click(`kanji-course-choice-${id}`);
  } else {
    p.find('kanji-course-answer').value = right ? prompt.acceptedAnswers[0] : 'まちがい';
    const form = all(p.main).find((e) => e.tagName === 'FORM');
    for (const listener of form.events.get('submit')) listener({ preventDefault() {}, isComposing: false });
  }
  await p.settle();
  assert.ok(p.S.kanjiCourse.feedback, 'the feedback shows');
  return p.S.kanjiCourse.feedback.result.attemptId;
}
async function selfCheck(p, attemptId, check) {
  p.click(`kanji-course-self-${check}`);
  await p.settle();
  return JSON.parse(JSON.stringify(p.S.kanjiCourse.hookOutcomes[attemptId]));
}
const next = async (p) => { p.click('kanji-course-next'); await p.settle(); };
const start = (p) => { p.click(p.find('kanji-course-practise') ? 'kanji-course-practise' : 'kanji-course-preview'); };

/** window 4's rule (S31:22–25), applied here to the raw rows the hook received: a row about the tested item (or about nothing) that
 * reveals the tested facet gives Again; any other row caps at Hard unless it is unrelated (no shared character and no direct
 * component–host catalog pair, a word row of another term); with no row the self-check's own rating stands */
export function derive(evidence, catalog) {
  const pairs = new Set(catalog.pairs.map((row) => [...row.items].sort().join('|')));
  const han = (item) => [...(item.kind === 'kanji' ? item.literal : item.term)].filter((ch) => /\p{Script=Han}/u.test(ch));
  const identity = (item) => (item.kind === 'kanji' ? `kanji:${item.literal}` : `word:${item.term}|${item.reading}`);
  const origins = evidence.helpRelevance?.origins ?? [];
  const label = (row, origin) => {
    if (row.about == null) return origin == null ? undefined : origin.sessionId === evidence.helpRelevance.sessionId ? 'target' : row.reveals.length ? undefined : 'unrelated';
    if (identity(row.about) === identity(evidence.item)) return 'target';
    if (row.about.kind === 'word' && evidence.item.kind === 'word' && row.about.term === evidence.item.term) return 'related';
    return han(row.about).some((a) => han(evidence.item).some((b) => a === b || pairs.has([a, b].sort().join('|')))) ? 'related' : 'unrelated';
  };
  const rows = (evidence.help || []).map((row, index) => ({ row, origin: origins[index] ?? null, mine: label(row, origins[index] ?? null) }))
    .filter(({ row }) => evidence.answeredAt == null || row.at == null || row.at <= evidence.answeredAt);
  const natural = evidence.answer?.selfCheck === 'knew' ? 3 : 1;
  const shows = rows.some(({ row }) => (row.about == null || identity(row.about) === identity(evidence.item)) && row.reveals.includes(evidence.tests));
  const rating = shows ? 1 : rows.some(({ mine }) => mine !== 'unrelated') ? Math.min(natural, 2) : natural;
  return { rating, rows: rows.map(({ row, origin, mine }) => ({ what: row.what, about: row.about ?? null, reveals: row.reveals, at: row.at,
    rule: row.relevance ?? null, mine: mine ?? null, origin })) };
}
/** one graded step: the hook's evidence for this attempt, the derived rating, and the agreement of every row's label */
function step(p, env, attemptId, outcome, name) {
  const evidence = p.calls().map((c) => c.evidence).filter((e) => e.attemptId === attemptId || e.helpRelevance?.attemptId?.endsWith(attemptId)).at(-1);
  assert.ok(evidence, `${name}: the hook received this attempt`);
  const derived = derive(evidence, JSON.parse(env.catalog));
  for (const row of derived.rows) assert.equal(row.rule, row.mine, `${name}: the installed rule and window 4's rule agree on ${JSON.stringify(row.about)}`);
  return { step: name, attemptId, item: evidence.item, tests: evidence.tests, answer: evidence.answer, rows: derived.rows, derived: derived.rating,
    outcome };
}

/** the whole §7 walk: day 1 (first ON day, held) makes the quest from the word page; day 2 (clean cold ON) runs steps 7–11 */
export async function walk(env, modules) {
  const s = store(), time = { now: DUE - DAY };
  const one = await page(env, modules, { ...s, time });
  assert.equal(one.phase(), 'cold-activation', 'day 1 is the first ON day');
  one.word().children.find((e) => e.id === 'kanji-quest-door').click();
  one.click('kanji-quest-start'); await one.settle();
  assert.equal(one.goals().length, 1, 'day 1: the quest exists');
  one.click('kanji-quest-reading'); start(one);
  const d1 = await answer(one, true);
  const held = await selfCheck(one, d1, 'knew');
  assert.equal(held.write, false, 'day 1 is held: K-11');
  time.now = DUE;
  const p = await page(env, modules, { ...s, time });
  const receipt = { day1: { held }, steps: [] };
  // 7. the unfinished quest survives reopen; resume from Lessons adds no slip help; Q-15r; the no-teaching route restarts at 職業
  assert.equal(p.phase(), 'active');
  assert.equal(p.root().daily.events.length, 0, 'day 1 help retired at the review-day boundary');
  assert.equal(p.word().children.at(-1).text, p.copy('Q-01r'));
  const row = all(p.lessons()).find((e) => e.id.startsWith('kanji-quest-lessons-'));
  assert.ok(row, 'the Lessons row Q-08');
  row.click();
  assert.ok(p.has(p.copy('Q-15r')));
  assert.ok(p.find('kanji-quest-reading').textContent.includes(p.copy('Q-09').replace('${n}', 0)));
  p.click('kanji-quest-reading');
  assert.ok(p.find('kanji-course-preview'), 'the no-teaching route (no slip help from Lessons)');
  p.click('kanji-course-preview');
  const visit = p.S.kanjiCourse, reading = visit.run;
  assert.deepEqual([...reading.promptIds], ['職', '識', '織'].map((k) => `shiki-shoku/${k}/reading`), 'the Reading set: 職業 → 知識 → 組織');
  assert.equal(p.prompt().wordKey, '職業', 'the set starts at 職業');
  assert.equal(p.root().daily.events.length, 0, 'no day-2 help before 職業');
  // 8. Good
  const a8 = await answer(p, true);
  receipt.steps.push(step(p, env, a8, await selfCheck(p, a8, 'knew'), '8 職業 right + knew'));
  await next(p);
  // 9. Again on a wrong answer: only "I missed it"
  assert.equal(p.prompt().wordKey, '知識');
  const a9 = await answer(p, false);
  assert.equal(p.find('kanji-course-self-knew'), null, 'only K-05 after a wrong answer');
  receipt.steps.push(step(p, env, a9, await selfCheck(p, a9, 'missed'), '9 知識 wrong + missed'));
  await next(p);
  // 10. condition B: leave for now (never "Back to course list"), grade 組織 once in Review, return to the same prompt and attempt
  assert.equal(p.prompt().wordKey, '組織');
  const held10 = p.attemptId();
  p.click('kanji-quest-leave'); p.click('kanji-quest-leave');
  assert.deepEqual(p.toasts, [p.copy('Q-07')]);
  assert.equal(p.S.kanjiCourse, visit, 'the visit is kept');
  const eventsBefore = p.root().daily.events.length, item = { t: 'word', id: '組織' };
  const rv = { queue: [item], ix: 0, revealed: true, history: [], done: { again: 0, hard: 0, good: 0, easy: 0 }, pending: null, declared: null };
  p.S.view = 'review'; p.S.review = rv;
  assert.equal(await p.ctx.admitStandardGrade({ rv, item, key: 'good', skey: 'word:組織', rating: 3 }), true, 'graded once in Review');
  const graded = JSON.parse(JSON.stringify(p.record().srs['word:組織']));
  assert.ok(p.record().revlog.some((r) => r.key === 'word:組織' || r.skey === 'word:組織' || r.id === '組織' || JSON.stringify(r).includes('組織')), 'a review-log row');
  assert.equal(p.root().daily.events.length, eventsBefore, 'Review adds no help row');
  p.S.review = null; p.S.view = 'lessons'; p.ctx.render();
  p.click('kanji-quest-reading');
  assert.equal(p.S.kanjiCourse, visit); assert.equal(p.attemptId(), held10, 'the same 組織 prompt and attempt ID');
  const a10 = await answer(p, true);
  const k14 = await selfCheck(p, a10, 'knew');
  receipt.steps.push({ ...step(p, env, a10, k14, '10 組織 right + knew after Review'), duplicate: true });
  assert.deepEqual(p.record().srs['word:組織'], graded, 'the schedule is unchanged');
  await next(p);
  assert.ok(p.has(p.copy('Q-12')), 'Q-12 once the completion is published');
  assert.ok(p.has('These results describe this practice session.'), 'K-21');
  assert.equal(p.goals().length, 0, 'retired after Done');
  // 11. help caps in Meaning: 職 → 識 → 織
  p.click('kanji-room-chooser'); p.click('kanji-room-meaning'); start(p);
  const meaning = p.S.kanjiCourse.run;
  assert.deepEqual([...meaning.promptIds], ['職', '識', '織'].map((k) => `shiki-shoku/${k}/meaning`), 'the Meaning set in the unit\'s target order');
  const order = [];
  const a11a = await (async () => { order.push(p.prompt().kanji); return answer(p, true); })();
  receipt.steps.push(step(p, env, a11a, await selfCheck(p, a11a, 'knew'), '11a 職 right + knew'));
  await next(p);
  order.push(p.prompt().kanji);
  p.click('kanji-course-entry-kanji'); await p.settle();
  const a11b = await answer(p, true);
  receipt.steps.push(step(p, env, a11b, await selfCheck(p, a11b, 'knew'), '11b 識 after its own entry'));
  await next(p);
  order.push(p.prompt().kanji);
  await p.ctx.kanjiCourseReferenceHelp(p.S.kanjiCourse, { t: 'kanji', id: '戠' }); await p.settle();
  const a11c = await answer(p, true);
  receipt.steps.push(step(p, env, a11c, await selfCheck(p, a11c, 'knew'), '11c 織 after 戠'));
  receipt.order = order;
  return receipt;
}
/** the isolating negative of condition A (window 4 1746): a fresh day 2, a Meaning run with 職 and 識 skipped (no exposure), and one
 * entry opened before 織's prompt */
export async function isolate(env, modules, literal) {
  const s = store(), time = { now: DUE - DAY };
  await page(env, modules, { ...s, time });
  time.now = DUE;
  const p = await page(env, modules, { ...s, time });
  p.click('kanji-room-lessons'); p.click('kanji-room-meaning'); start(p);
  for (let i = 0; i < 2; i += 1) { p.click('kanji-course-skip'); await p.settle(); await next(p); }
  assert.equal(p.prompt().kanji, '織');
  await p.ctx.kanjiCourseReferenceHelp(p.S.kanjiCourse, { t: 'kanji', id: literal }); await p.settle();
  const id = await answer(p, true);
  return step(p, env, id, await selfCheck(p, id, 'knew'), `織 after ${literal}'s entry only`);
}

const graded = (s, rating) => { assert.equal(s.outcome.write, true, `${s.step}: ${JSON.stringify(s.outcome)}`); assert.equal(s.outcome.rating, rating, s.step);
  assert.equal(s.derived, rating, `${s.step}: derived from its rows`); };
const related = (s) => s.rows.filter((r) => r.mine === 'related' || r.mine === 'target').map((r) => `${r.what}:${r.about?.term ?? r.about?.literal}`);

export const CASES = [];
const test = (id, name, fn) => CASES.push({ id, name, fn });
const walks = new Map();
const walked = async (env, modules) => { if (!walks.has(env)) walks.set(env, walk(env, modules)); return walks.get(env); };

test('D1', 'steps 7–9: reopen from Lessons (Q-08, Q-01r, Q-15r, no slip help), 職業 Good with no pre-answer row, 知識 Again with only K-05', async (env, modules) => {
  const r = await walked(env, modules);
  const [s8, s9] = r.steps;
  graded(s8, 3); assert.deepEqual(s8.rows, [], 'the empty pre-answer history');
  graded(s9, 1);
});
test('D2', 'step 10 (condition B): leave for now keeps the visit; Review grades 組織 once; the same attempt then refuses as answered today (K-14) with the schedule unchanged; Done (Q-12 + K-21) and retirement follow', async (env, modules) => {
  const r = await walked(env, modules);
  const s10 = r.steps[2];
  assert.deepEqual([s10.outcome.write, s10.outcome.reason], [false, 'answered-today']);
});
test('D3', 'step 11: Meaning runs 職 → 識 → 織; 職 is Hard (職業 related); 識 after its own entry is Again; 織 after 戠 is Hard with both related rows named (condition A)', async (env, modules) => {
  const r = await walked(env, modules);
  assert.deepEqual(r.order, ['職', '識', '織']);
  const [s11a, s11b, s11c] = r.steps.slice(3);
  graded(s11a, 2); assert.deepEqual(related(s11a), ['answer-feedback:職業']);
  graded(s11b, 1);
  graded(s11c, 2); assert.deepEqual(related(s11c).sort(), ['answer-feedback:組織', 'dictionary-entry:戠'].sort());
  const unrelated = s11c.rows.filter((row) => row.mine === 'unrelated').map((row) => row.about?.term ?? row.about?.literal);
  for (const literal of ['識', '職']) assert.ok(unrelated.includes(literal), `${literal} is bound and unrelated to 織`);
});
test('D4', 'condition A\'s isolating negative: before 織 with only one entry, 職\'s entry is unrelated (Good), 戠\'s is related (Hard), 織\'s own shows the answer (Again)', async (env, modules) => {
  graded(await isolate(env, modules, '職'), 3);
  graded(await isolate(env, modules, '戠'), 2);
  graded(await isolate(env, modules, '織'), 1);
});

test('D5', 'condition A, why the walk cannot isolate: with the 戠–織 pair taken out of the catalog, the walk\'s 織 is still Hard, now through the 組織 row alone; the isolating negative lives in D4', async (env, modules) => {
  const without = { ...env, catalog: env.catalog.replace(/"items": \[\s*"戠",\s*"織"\s*\]/, '"items": ["戠", "糸"]') };
  assert.notEqual(without.catalog, env.catalog);
  const s11c = (await walk(without, modules)).steps[5];
  graded(s11c, 2); assert.deepEqual(related(s11c), ['answer-feedback:組織']);
});

/** each control mutates one text and names the case that must fail */
export const MUTANTS = {
  'no-shared-character': ['D3', 'relevance', [['a === b || pairs.has(pair(a, b))', 'pairs.has(pair(a, b))']]],
  'feedback-not-kept': ['D3', 'corridor', [['  if (attempt) await kanjiCourseRememberHelp(visit, result.exposure, attempt.attemptId);\n', '']]],
  'catalog-without-zhi-shiki': ['D4', 'catalog', [[/"items": \[\s*"戠",\s*"織"\s*\]/, '"items": ["戠", "糸"]']]],
  'answer-help-ignored': ['D4', 'core', [['  if (help.some((h) => showsAnswer(h, evidence))) rating = 1;\n  // r8 rule 2', '  if (false) rating = 1;\n  // r8 rule 2']]],
  'answered-today-ignored': ['D2', 'core', [["  if (gradedToday(record, now)) return refused('answered-today');\n", ''],
    ["  if (evidence.item.kind === 'word' && (answered[itemIdentity(evidence.item)] || []).length) return refused('answered-today');\n", '']]],
  'lessons-adds-slip-help': ['D1', 'corridor', [["      Object.assign(S.kanjiCourse, { chooser: false, blocked: null,\n        quest: { seed: goal.seed, goalId: goal.id, view: 'page', lines: [], confirmEnd: false, done: false } });",
    "      Object.assign(S.kanjiCourse, { chooser: false, blocked: null,\n        quest: { seed: goal.seed, goalId: goal.id, view: 'page', lines: [], confirmEnd: false, done: false } });\n      kanjiCourseReferenceHelp(S.kanjiCourse, { t: 'word', id: '職業', reading: 'しょくぎょう' });"]]],
  'leave-is-course-list': ['D2', 'corridor', [['  if (frame) { frame.kanjiCourseReturn.priorCourse = visit; returnFromNavigation(); return; }\n  S.view = \'reader\';',
    '  S.kanjiCourse = { stage: \'menu\' };\n  S.view = \'reader\';']]],
};
const mutate = (text, pairs, name) => pairs.reduce((value, [from, to]) => {
  if (from instanceof RegExp) { assert.ok(from.test(value), 'mutant anchor missing: ' + name); return value.replace(from, to); }
  assert.equal(value.split(from).length, 2, 'mutant anchor not unique: ' + name); return value.replace(from, to);
}, text);

async function main() {
  floor();
  const only = arg('case'), results = [], modules = await load();
  for (const t of CASES) {
    if (only && t.id !== only) continue;
    floor();
    try { await t.fn(TEXTS, modules); results.push({ id: t.id, passed: true }); }
    catch (error) { results.push({ id: t.id, passed: false, error: error.message.split('\n')[0] }); }
  }
  const controls = [];
  if (process.argv.includes('--mutants')) {
    for (const [name, [target, key, pairs]] of Object.entries(MUTANTS)) {
      floor();
      const env = { ...TEXTS, [key]: mutate(TEXTS[key], pairs, name) };
      try { await CASES.find((entry) => entry.id === target).fn(env, modules); controls.push({ name, target, killed: false }); }
      catch (error) { controls.push({ name, target, killed: error instanceof assert.AssertionError, witness: error.message.split('\n')[0] }); }
    }
  }
  const receipt = process.argv.includes('--receipt') && walks.has(TEXTS) ? await walks.get(TEXTS).catch(() => null) : undefined;
  const failed = results.filter((r) => !r.passed), survived = controls.filter((c) => !c.killed);
  console.log(JSON.stringify({ cases: `${results.length - failed.length}/${results.length}`, failed,
    controls: controls.length ? `${controls.length - survived.length}/${controls.length}` : 'not run', survived, controlDetails: controls,
    ...(receipt !== undefined ? { receipt } : {}) }, null, 1));
  process.exitCode = failed.length || survived.length ? 1 : 0;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
