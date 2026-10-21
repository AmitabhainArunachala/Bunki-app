/** M4 S3b (lead 1835; UX r4.2 7eae4438 §2, §3.3, §5; W2 1928/1934): the quest UI in the course view, as a pure DOM probe. The
 * authored corridor functions are lifted from corridor.js into a vm with the real kanji-course.js and a synthetic DOM (elements,
 * text, ids, click and submit only), over the REAL record host, app and journey lifecycle (built record-core, --modules) and the
 * real m4-quest.mjs. The r8 review ledger, the reader's sentence lookup, navigation and the toast are stubs. No native rendering,
 * focus, IME or browser claim. stdout only; no files are written.
 *   node tools/verify-m4-quests.mjs --modules=<dir> [--case=<id>] [--mutants]
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, statfsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { liftCorridor } from './srs-hooks-corridor-layer.mjs';
import { load } from './verify-journey-record.mjs';
import { activeDay, closeGateDuring, journeyRows, lifecycleOn } from './verify-m4-goal-bridge.mjs';

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
// rule 1725: pure probes run down to 1.2 GiB
const floor = () => { const s = statfsSync(DIR); assert.ok(s.bavail * s.bsize >= 1.2 * 1024 ** 3, 'DISK STOP: below 1.2 GiB'); };
export const SOURCE = readFileSync(resolve(DIR, 'corridor.js'), 'utf8');
export const ADAPTER = readFileSync(resolve(DIR, 'm4-quest.mjs'), 'utf8');
/** S3a's gated head (W2 1934): the corridor before S3b, for the OFF comparison */
const BEFORE = '910d8325';
const beforeSource = () => execFileSync('git', ['show', `${BEFORE}:prototypes/corridor/corridor.js`], { cwd: DIR, maxBuffer: 64 * 1024 ** 2 }).toString();
const COURSE = readFileSync(resolve(DIR, 'kanji-course.js'), 'utf8');
const SWITCH = 'const JOURNEY_WRITES = false;';
const adapterFrom = (text) => import('data:text/javascript;base64,' + Buffer.from(text).toString('base64'));
const BASE = ['ROOM_NAMES', 'roomName', 'M4_COPY', 'kanjiCourseRunKind', 'kanjiRoomEntry', 'kanjiChooseRoom', 'kanjiEnterCourseDoor',
  'openKanjiRooms', 'renderKanjiRoomChooser', 'renderKanjiCourseDoor', 'renderKanjiCourseMenu', 'renderKanjiCourse', 'kanjiCourseNodeUnit',
  'kanjiCourseApplyHelp', 'kanjiCourseReturnFrame', 'kanjiCourseEntryNode', 'kanjiCourseHookLine', 'reportKanjiCourseAttempt',
  'kanjiCourseAct', 'JOURNEY_WRITES', 'kanjiJourney', 'kanjiJourneyModule', 'kanjiJourneyDevice', 'adoptJourney', 'kanjiJourneyRun',
  'kanjiJourneyFor'];
const QUEST = ['kanjiQuestModule', 'KANJI_QUEST_STRUCTURAL', 'KANJI_QUEST_FAILED', 'kanjiQuestAdopt', 'kanjiQuestOwner', 'kanjiQuestFor',
  'kanjiQuestStructural', 'kanjiQuestSeed', 'kanjiQuestSentence', 'kanjiQuestLine', 'kanjiQuestLines', 'kanjiQuestBinding',
  'kanjiQuestBound', 'kanjiQuestWordsDone', 'kanjiQuestRunStarted', 'kanjiQuestSettle', 'kanjiQuestSelfCheck', 'kanjiQuestRedraw',
  'kanjiQuestAct', 'kanjiQuestCreate', 'kanjiQuestEnd', 'kanjiQuestClear', 'kanjiQuestDoor', 'kanjiQuestOpen', 'kanjiQuestLessonRows',
  'kanjiQuestStage', 'kanjiQuestLeave', 'kanjiQuestPool', 'kanjiQuestRender', 'kanjiQuestSummary'];

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
/** the page as a learner meets it: each element's id and own text, in order (the OFF comparison's unit) */
const shape = (node) => all(node).map((e) => `${e.tagName}#${e.id}${e.disabled ? '[disabled]' : ''}:${e.text}`);
const flush = async () => { for (let i = 0; i < 40; i += 1) await new Promise((r) => setImmediate(r)); };

/** a bundled passage with 職業 at token 26 (the fixture occurrence) and at tokens 60–69, each token its own sentence span */
const PASSAGE = { id: 'bunki-essay-n1-city', tokens: Array.from({ length: 90 }, (_, i) => (i === 26 || (i >= 60 && i < 70)
  ? { s: '職業', b: '職業' } : { s: 'の', b: 'の' })) };
const sentenceAt = (index) => ({ p: PASSAGE, index, start: index - 2, end: index + 15,
  quote: PASSAGE.tokens.slice(index - 2, index + 15).map((t) => t.s).join('') });
const WORD = (index = 26) => ({ t: 'word', id: '職業', reading: 'しょくぎょう', from: { passage: PASSAGE.id, index }, ctxScope: 'sent' });
const occurrence = (index = 26) => ({ source: 'passage', passage: PASSAGE.id, token: index, sentence: [index - 2, index + 15], word: '職業' });

let serial = 0;
/** one page: the lifted program, ON or OFF, over a fresh S and a day's lifecycle */
function page(m, day, { source = current?.source ?? SOURCE, names = [...BASE, ...QUEST], on = true, lang = 'en' } = {}) {
  let main = new Element('main');
  const toasts = [], returns = [];
  const S = { view: 'lessons', stack: [], navigationReturns: [], kanjiCourse: null, lessonsDone: {}, lessonRun: null };
  const context = vm.createContext({
    console: { ...console, warn() {} },
    crypto: { randomUUID: () => `session-${++serial}` },
    S, recordEpoch: 1, personalHost: null, placesLayout: () => false, srsCore: { refusalWords: () => null }, recordApp: null,
    el: (tag, cls, text) => new Element(tag, cls, text),
    biLabel: (tag, cls, ja, en) => new Element(tag, cls, lang === 'ja' ? ja : en),
    tx: (ja, en) => (lang === 'ja' ? ja : en),
    document: { getElementById: (id) => all(main).find((e) => e.id === id) || null },
    render: () => {
      main = new Element('main');
      if (S.view !== 'lessons') main.append(new Element('p', '', `view:${S.view}`));
      else if (S.kanjiCourse && S.kanjiCourse.stage !== 'menu') context.renderKanjiCourse(main);
      else context.renderKanjiCourseMenu(main);
    },
    go: () => { throw new Error('no navigation in this probe'); },
    // the unchanged return seam, modelled: pop the frame and restore its caller's course visit and view
    returnFromNavigation: () => {
      const home = S.navigationReturns.pop(); returns.push(home);
      S.kanjiCourse = home.kanjiCourseReturn.priorCourse; S.view = home.view; context.render(); return true;
    },
    showReaderToast: (message) => toasts.push(message),
    scrollTo: () => {},
    teacherSentence: (node) => (node?.from?.passage === PASSAGE.id && Number.isInteger(node.from.index) && node.from.index >= 2 &&
      node.from.index < PASSAGE.tokens.length - 15 ? sentenceAt(node.from.index) : null),
    // the unchanged entry seam: reuse the visit for the same unit, else open a new one (the reader start is help: K-25)
    openKanjiCourseUnit: (node) => {
      const unit = context.kanjiCourseNodeUnit(node);
      if (!unit) return false;
      if (S.kanjiCourse?.unitId !== unit.id) S.kanjiCourse = { unitId: unit.id, stage: 'intro', index: 0, epoch: context.recordEpoch, run: null,
        draft: '', feedback: null, saved: false, pending: false, supportedPractice: true };
      S.view = 'lessons';
      return true;
    },
    // the r8 ledger and the journey's answer seam are proved by their own suites; here they only carry the course's act through
    kanjiCourseLedgerBefore: () => null, kanjiCourseSnapshot: () => {}, kanjiCourseRememberHelp: () => undefined,
    kanjiJourneyAct: (visit, action, value) => Promise.resolve(context.kanjiCourseAct(visit, action, value)),
    maintenanceServedBuild: async () => ({ git_sha: 'g', artifact_sha256: 'a' }),
  });
  context.recordReady = (epoch = context.recordEpoch) => epoch === context.recordEpoch;
  context.window = context; context.globalThis = context;
  vm.runInContext(COURSE, context);
  vm.runInContext(liftCorridor(on ? source.replace(SWITCH, 'const JOURNEY_WRITES = true;') : source, names), context);
  vm.runInContext(`Date.now = () => __now();
function __copy(id) { return M4_COPY[id]; }
function __room(id) { return ROOM_NAMES.rooms[id]; }
function __journey() { return kanjiJourney; }
function __setJourney(journey) { kanjiJourney = journey; }
function __preset(lifecycle, quest) { kanjiJourneyModule = Promise.resolve(lifecycle); if (typeof kanjiQuestModule !== 'undefined') kanjiQuestModule = Promise.resolve(quest); }`, Object.assign(context, { __now: () => day.time.now }));
  const ui = {
    S, context, toasts, returns, day, lang, course: context.BunkiKanjiCourse,
    get main() { return main; },
    find: (id) => all(main).find((e) => e.id === id) || null,
    text: () => main.textContent,
    click(id) { const target = ui.find(id); assert.ok(target, `no #${id} on the page`); assert.equal(target.disabled, false, `#${id} is disabled`); target.click(); },
    copy: (id, n = 0) => context.__copy(id)[lang === 'ja' ? 0 : 1].replace('${n}', n),
    has: (id, n) => main.textContent.includes(ui.copy(id, n)),
    journey: () => context.__journey(),
    state: () => context.__journey().quest.state,
    root: () => day.lc.inspect().root,
    word(index = 26) { const sheet = new Element('section'); context.renderKanjiCourseDoor(sheet, WORD(index)); return sheet; },
    lessons() { const section = new Element('main'); context.renderKanjiCourseMenu(section); return section; },
    /** as at boot (void adoptJourney), over this day's lifecycle */
    async adopt(questModule) {
      const app = { journeyAuthority() {} };
      context.recordApp = app;
      context.__preset({ createLifecycle: () => day.lc, recordPort: () => ({}), LIMITS: m.lifecycle.LIMITS }, questModule);
      await context.adoptJourney(context.recordEpoch, app);
      await flush();
      return ui;
    },
  };
  return ui;
}
async function onPage(m, { day, adapter = current?.adapter ?? ADAPTER, lang } = {}) {
  day ||= await activeDay(m);
  const q = await adapterFrom(adapter);
  const p = await page(m, day, { lang }).adopt(q);
  p.q = q;
  return p;
}
/** the learner's answer through the form or the buttons, then the feedback the course keeps */
async function answer(p, how) {
  if (how === 'reveal' || how === 'skip') { p.click(`kanji-course-${how}`); await flush(); return; }
  const prompt = p.course.currentPrompt(p.S.kanjiCourse.run);
  const input = p.find('kanji-course-answer');
  input.value = how === 'right' ? prompt.acceptedAnswers[0] : 'あああ';
  const form = all(p.main).find((e) => e.tagName === 'FORM');
  for (const listener of form.events.get('submit')) listener({ preventDefault() {}, isComposing: false });
  await flush();
}
/** one prompt: answer, then the self-check when named, then Next */
async function prompt(p, how, check, { next = true } = {}) {
  await answer(p, how);
  if (check) { p.click(`kanji-course-self-${check}`); await flush(); }
  if (next) { p.click('kanji-course-next'); await flush(); }
}
/** from the 職業 word page: Q-01, then Q-05 on the objective card */
async function created(p, index = 26) {
  p.word(index).children.find((e) => e.id === 'kanji-quest-door').click();
  p.click('kanji-quest-start'); await flush();
  const goal = p.q.quests(p.root()).find((g) => p.q.sameSeed(g.seed, p.q.questSeed(occurrence(index))));
  assert.ok(goal, 'the quest is in the confirmed root');
  return goal;
}
const intoReading = (p) => { p.click('kanji-quest-reading'); p.click(p.find('kanji-course-practise') ? 'kanji-course-practise' : 'kanji-course-preview'); };
const goals = (p) => p.q.quests(p.root());

export const CASES = [];
const test = (id, name, fn) => CASES.push({ id, name, fn });

test('U1', 'OFF is S3a exactly: no quest memory even with the adapter at hand, and the word page, Lessons, rooms, feedback and results draw the same elements and text as 910d8325, with and without a review hook', async (m) => {
  const before = beforeSource();
  const script = async (source, names) => {
    const day = await activeDay(m), q = await adapterFrom(current?.adapter ?? ADAPTER);
    const p = await page(m, day, { source, names, on: false }).adopt(q);
    const frames = [shape(p.word()), shape(p.lessons())];
    for (const hook of [false, true]) {
      if (hook) Object.assign(p.context, { __KAIRO_HOOKS__: { report() {} }, kanjiReviewCaller: { observe: async () => ({ write: false, reason: 'not-due' }) },
        kanjiCoursePrepareReview: () => ({ reason: 'not-due' }), KANJI_REVIEW_STATE: {} });
      p.S.kanjiCourse = null;
      p.context.openKanjiRooms(WORD(), null); p.click('kanji-room-reading'); p.click('kanji-course-practise');
      for (const [how, check] of [['right', 'knew'], ['wrong', 'missed'], ['right', null]]) {
        await answer(p, how); frames.push(shape(p.main));
        if (hook && check) { p.click(`kanji-course-self-${check}`); await flush(); frames.push(shape(p.main)); }
        p.click('kanji-course-next'); await flush();
      }
      frames.push(shape(p.main));
    }
    return { frames, journey: p.journey() };
  };
  const was = await script(before, BASE), now = await script(current?.source ?? SOURCE, [...BASE, ...QUEST]);
  assert.ok(now.journey, 'OFF adopted its journey');
  assert.equal(now.journey.quest, undefined, 'OFF adopts no quests');
  assert.deepEqual(now.frames, was.frames);
});

test('U2', 'ON: adoption keeps one quest memory for this owner; the 職業 word page from a passage occurrence offers Q-01 beside R-01 and the course door, and no other page does', async (m) => {
  const p = await onPage(m);
  const journey = p.journey();
  assert.ok(journey.quest && journey.quest.state.sessions instanceof Map, 'a quest memory');
  assert.equal(journey.quest.restarted, false);
  assert.deepEqual(p.word().children.map((e) => e.id), ['kanji-course-unit-door', 'kanji-room-door', 'kanji-quest-door']);
  assert.equal(p.word().children.at(-1).text, p.copy('Q-01'));
  const noOccurrence = new Element('section'); p.context.renderKanjiCourseDoor(noOccurrence, { t: 'word', id: '職業', reading: 'しょくぎょう' });
  assert.equal(noOccurrence.children.some((e) => e.id === 'kanji-quest-door'), false, 'a page opened without an occurrence offers none');
  const other = new Element('section'); p.context.renderKanjiCourseDoor(other, { t: 'word', id: '知識', reading: 'ちしき', from: { passage: PASSAGE.id, index: 30 } });
  assert.equal(other.children.some((e) => e.id === 'kanji-quest-door'), false);
  const both = new Element('section'); p.context.renderKanjiCourseDoor(both, { ...WORD(), sourceContext: { sourceId: 'imported-1', sourceDigest: 'd' } });
  assert.equal(both.children.some((e) => e.id === 'kanji-quest-door'), false, 'conflicting provenance offers none (W5 2000)');
  assert.equal(shape(p.lessons()).some((row) => row.includes('kanji-quest-lessons')), false, 'no Lessons row with no quest');
});

test('U3', 'Q-01 opens the objective card over the course help path: Q-02, Q-03, Q-04 with the sentence, Q-14, Q-06 and Q-05, no reading, K-25; nothing is written before Q-05', async (m) => {
  for (const lang of ['en', 'ja']) {
    const p = await onPage(m, { lang });
    const rows = journeyRows(p.day.c).length;
    p.word().children.find((e) => e.id === 'kanji-quest-door').click();
    for (const id of ['Q-02', 'Q-03', 'Q-04', 'Q-14', 'Q-06']) assert.ok(p.has(id), id);
    assert.ok(p.text().includes(sentenceAt(26).quote), 'the sentence');
    assert.ok(p.find('kanji-quest-start'));
    assert.equal(p.text().includes('しょくぎょう'), false, 'no reading');
    assert.ok(p.text().includes(lang === 'ja' ? '辞書を見たあとの練習です。初見のテストではありません。' : 'Practice after opening the dictionary.'), 'K-25');
    assert.equal(journeyRows(p.day.c).length, rows, 'no write');
    assert.equal(goals(p).length, 0);
  }
});

test('U4', 'Q-05 published: one goal with the exact occurrence seed; the quest page (Q-09 at 0, the Reading door, R-01, Q-10); the word door turns Q-01r and Lessons shows one Q-08 row', async (m) => {
  const p = await onPage(m);
  const goal = await created(p);
  assert.deepEqual(goals(p).map((g) => [g.status, g.seed]), [['unfinished', { kind: 'reading', sourceOccurrence: occurrence() }]]);
  assert.ok(p.find('kanji-quest-reading').textContent.includes(p.copy('Q-09', 0)));
  for (const id of ['kanji-quest-rooms', 'kanji-quest-end', 'kanji-quest-leave']) assert.ok(p.find(id), id);
  assert.equal(p.find('kanji-course-leave'), null, 'never "Back to course list" on a quest stage');
  assert.equal(p.word().children.at(-1).text, p.copy('Q-01r'));
  const rows = all(p.lessons()).filter((e) => e.id.startsWith('kanji-quest-lessons-'));
  assert.deepEqual(rows.map((r) => [r.id, r.textContent]), [[`kanji-quest-lessons-${goal.id}`, p.copy('Q-08') + sentenceAt(26).quote + p.copy('Q-08b')]]);
});

test('U5', 'fresh-run bind (W2 1928): a Reading run started from the quest binds it at creation; a run started before the goal never binds, shows Q-19 + R-11, resumes as it was and completes nothing', async (m) => {
  const p = await onPage(m);
  // a pre-goal Reading run, unanswered
  p.context.openKanjiRooms(WORD(), null); p.click('kanji-room-reading'); p.click('kanji-course-practise');
  const early = p.S.kanjiCourse.run, attemptId = p.course.currentAttempt(early).attemptId;
  const goal = await created(p);
  assert.ok(p.has('Q-19') && p.find('kanji-room-return') && !p.find('kanji-quest-reading'), 'Q-19 + R-11, no Reading door');
  p.click('kanji-room-return');
  assert.equal(p.S.kanjiCourse.run, early); assert.equal(p.course.currentAttempt(p.S.kanjiCourse.run).attemptId, attemptId);
  assert.equal(p.has('Q-16'), false);
  for (const [how, check] of [['right', null], ['wrong', null], ['right', null]]) await prompt(p, how, check);
  assert.equal(p.state().sessions.get(early.sessionId)?.binding ?? null, null, 'the pre-goal run holds no quest');
  assert.equal(goals(p)[0].status, 'unfinished');
  p.click('kanji-quest-leave');
  intoReading(p);
  const run = p.S.kanjiCourse.run;
  assert.notEqual(run, early);
  assert.deepEqual(p.state().sessions.get(run.sessionId)?.binding?.goals.map((g) => g.id), [goal.id], 'bound at creation');
});

test('U6', 'inside a quest Q-16 replaces K-03 and the self-check is offered with no review hook (decision 8a): only "missed" after a wrong answer; the choice is kept on the run and the line says recording is unavailable', async (m) => {
  const p = await onPage(m);
  await created(p); intoReading(p);
  await answer(p, 'wrong');
  assert.ok(p.has('Q-16'));
  assert.ok(p.text().includes('Review recording from this course is unavailable in this version.'), 'K-20 beside Q-16 before the choice (W12 L1)');
  assert.equal(p.text().includes('Check your answer. Choose below only'), false, 'no K-03');
  assert.equal(p.find('kanji-course-self-knew'), null); assert.ok(p.find('kanji-course-self-missed'));
  p.click('kanji-course-self-missed'); await flush();
  assert.equal(p.S.kanjiCourse.run.attempts[0].selfCheck?.choice ?? p.S.kanjiCourse.run.attempts[0].selfCheck, 'missed');
  assert.ok(p.text().includes('Review recording from this course is unavailable in this version.'), 'K-20');
  p.click('kanji-course-next'); await flush();
  await answer(p, 'right');
  assert.ok(p.find('kanji-course-self-knew') && p.find('kanji-course-self-missed'));
});

test('U7', 'last-self-check settlement (W2 1928): run.complete alone writes nothing; the last self-check reserves the quest at once; Q-12 only after the completion is published, then retirement; K-21 stays', async (m) => {
  const p = await onPage(m);
  const goal = await created(p); intoReading(p);
  await prompt(p, 'right', 'knew'); await prompt(p, 'wrong', 'missed');
  await answer(p, 'right');
  assert.equal(p.S.kanjiCourse.run.complete, true);
  const rows = journeyRows(p.day.c).length;
  await flush();
  assert.equal(journeyRows(p.day.c).length, rows, 'run.complete wrote nothing');
  assert.equal(p.state().pending.size, 0);
  p.click('kanji-course-self-knew');
  assert.equal(p.state().pending.get(goal.id), 'completing', 'reserved before the first write');
  p.click('kanji-course-next');
  assert.equal(p.has('Q-12'), false, 'no Done before its write is published');
  await flush();
  assert.ok(p.has('Q-12'));
  assert.ok(p.text().includes('These results describe this practice session.'), 'K-21');
  assert.equal(goals(p).length, 0, 'retired after the confirmed completion');
  assert.ok(journeyRows(p.day.c).length - rows >= 2, 'a completion write, then a retirement');
  p.click('kanji-quest-leave');
  assert.ok(p.has('Q-12'), 'the quest page shows it done');
});

test('U8', 'a set finished without every self-check leaves the quest unfinished: Q-18 + Q-18b, which starts a fresh Reading run that binds again', async (m) => {
  const p = await onPage(m);
  const goal = await created(p); intoReading(p);
  await prompt(p, 'right', 'knew'); await prompt(p, 'wrong', 'missed'); await prompt(p, 'right', null);
  assert.ok(p.has('Q-18') && p.find('kanji-quest-again'));
  assert.equal(p.has('Q-12'), false); assert.equal(goals(p)[0].status, 'unfinished');
  const old = p.S.kanjiCourse.run;
  p.click('kanji-quest-again');
  assert.notEqual(p.S.kanjiCourse.run, old);
  assert.deepEqual(p.state().sessions.get(p.S.kanjiCourse.run.sessionId).binding.goals.map((g) => g.id), [goal.id]);
});

test('U9', 'live owner custody (W2 1928): an owner change after the reservation turns the settlement into K-26, with no Done and no retirement', async (m) => {
  const p = await onPage(m);
  await created(p); intoReading(p);
  await prompt(p, 'right', 'knew'); await prompt(p, 'wrong', 'missed'); await answer(p, 'right');
  const journey = p.journey();
  p.click('kanji-course-self-knew');
  p.context.__setJourney({ ...journey, quest: null });
  await flush();
  p.context.__setJourney(journey);
  p.click('kanji-course-next'); await flush();
  assert.ok(p.text().includes('The learner record changed. This session cannot be saved.'), 'K-26');
  assert.equal(p.has('Q-12'), false);
  assert.equal(goals(p).length, 1, 'no retirement under a changed owner');
});

test('U10', 'a completion that is not published: Q-22 with Q-25 (the page held for the rest of today); the quest stays in progress', async (m) => {
  const p = await onPage(m);
  await created(p); intoReading(p);
  await prompt(p, 'right', 'knew'); await prompt(p, 'wrong', 'missed'); await answer(p, 'right');
  await closeGateDuring(p.day, 'work', async () => { p.click('kanji-course-self-knew'); await flush(); });
  p.click('kanji-course-next'); await flush();
  assert.ok(p.has('Q-22') && p.has('Q-25'));
  assert.equal(p.has('Q-12'), false);
  assert.equal(goals(p)[0].status, 'unfinished');
  assert.equal(p.day.lc.inspect().phase, 'publication-hold');
});

test('U11', 'a create that is not published: Q-20 + Q-25, back on the objective card with no quest; a second failure says Q-20 alone (Q-25 once)', async (m) => {
  const p = await onPage(m);
  p.word().children.find((e) => e.id === 'kanji-quest-door').click();
  await closeGateDuring(p.day, 'work', async () => { p.click('kanji-quest-start'); await flush(); });
  assert.ok(p.has('Q-20') && p.has('Q-25'));
  assert.ok(p.find('kanji-quest-start'), 'back on the objective card');
  assert.equal(goals(p).length, 0);
  await closeGateDuring(p.day, 'work', async () => { p.click('kanji-quest-start'); await flush(); });
  assert.ok(p.has('Q-20')); assert.equal(p.has('Q-25'), false, 'told once');
});

test('U12', 'End: Q-10 opens Q-11 with End it / Keep going; a failed End says Q-23 and keeps the quest; a published one says Q-24, leaves the run as it is and gives the course its own Back again', async (m) => {
  const p = await onPage(m);
  const goal = await created(p); intoReading(p);
  await prompt(p, 'right', 'knew');
  const run = p.S.kanjiCourse.run;
  p.click('kanji-quest-leave');
  p.click('kanji-quest-end');
  assert.ok(p.has('Q-11'));
  assert.deepEqual([p.find('kanji-quest-end-confirm').text, p.find('kanji-quest-end-keep').text], p.copy('Q-11b').split(' · '));
  p.click('kanji-quest-end-keep'); assert.equal(p.has('Q-11'), false);
  p.click('kanji-quest-end');
  await closeGateDuring(p.day, 'retire-work', async () => { p.click('kanji-quest-end-confirm'); await flush(); });
  assert.ok(p.has('Q-23')); assert.equal(p.has('Q-24'), false);
  assert.equal(goals(p)[0]?.id, goal.id);
  p.click('kanji-quest-end'); p.click('kanji-quest-end-confirm'); await flush();
  assert.ok(p.has('Q-24'));
  assert.equal(goals(p).length, 0);
  assert.equal(p.S.kanjiCourse.run, run, 'the run is left as it is');
  assert.equal(p.find('kanji-quest-leave'), null); assert.ok(p.find('kanji-course-leave'));
  assert.equal(p.word().children.at(-1).text, p.copy('Q-01'));
});

test('U13', 'K-22 Back (condition B): in the room it goes up to the quest page; on the quest page it is leave-for-now, keeping the visit and its run through the return frame (or only the view), with Q-07 only for a quest in the root', async (m) => {
  const p = await onPage(m);
  await created(p); intoReading(p);
  await answer(p, 'right');
  const visit = p.S.kanjiCourse, run = visit.run, attemptId = visit.feedback.result.attemptId;
  p.click('kanji-quest-leave');
  assert.ok(p.find('kanji-quest-reading'), 'up to the quest page');
  assert.equal(p.S.kanjiCourse, visit); assert.equal(visit.run, run);
  const prior = { unitId: 'other', stage: 'intro' };
  p.S.navigationReturns.push({ destination: 'lessons', view: 'reader', kanjiCourseReturn: { visit, priorCourse: prior, epoch: 1 } });
  p.context.render();
  p.click('kanji-quest-leave');
  assert.deepEqual(p.toasts, [p.copy('Q-07')]);
  assert.equal(p.returns.length, 1);
  assert.equal(p.S.kanjiCourse, visit, 'the visit is kept, never the prior one'); assert.equal(visit.run, run);
  assert.equal(p.S.view, 'reader');
  p.S.view = 'lessons'; p.context.render();
  p.click('kanji-quest-leave');
  assert.equal(p.S.view, 'reader'); assert.equal(p.S.kanjiCourse, visit);
  p.S.view = 'lessons'; p.context.render();
  p.click('kanji-quest-reading');
  assert.equal(visit.feedback.result.attemptId, attemptId, 'the same attempt, its feedback still shown');
});

test('U14', 'reload: a completed quest left in the pool is retired once on open, an unfinished one shows Q-08 and Q-01r, and its page says Q-15 once with Q-09 at 0', async (m) => {
  const d = await activeDay(m), q = await adapterFrom(current?.adapter ?? ADAPTER);
  const first = await page(m, d).adopt(q); first.q = q;
  const open = await created(first, 60);
  const done = await created(first, 61);
  const ticket = d.lc.completionTicket(done.id, 'session-x', done.seed);
  await d.lc.completeGoal(done.id, ticket);
  // a reload: a new lifecycle over the same record, and a new page
  const again = lifecycleOn(m, d.app, { time: d.time, epoch: d.epoch });
  await again.lc.ready;
  const day = { ...d, lc: again.lc, gate: again.gate, lie: again.lie };
  const p = await page(m, day).adopt(q); p.q = q;
  assert.deepEqual(goals(p).map((g) => [g.id, g.status]), [[open.id, 'unfinished']], 'the finished one retired on open');
  assert.equal(p.journey().quest.restarted, true);
  const rows = all(p.lessons()).filter((e) => e.id.startsWith('kanji-quest-lessons-'));
  assert.deepEqual(rows.map((r) => r.id), [`kanji-quest-lessons-${open.id}`]);
  assert.equal(p.word(60).children.at(-1).text, p.copy('Q-01r'));
  rows[0].click();
  assert.ok(p.has('Q-15') && p.find('kanji-quest-reading').textContent.includes(p.copy('Q-09', 0)));
  p.context.render();
  assert.equal(p.has('Q-15'), false, 'once');
  intoReading(p);
  assert.ok(p.find('kanji-course-answer'), 'the no-teaching route from Lessons starts at the first word');
});

test('U15', 'eight quests present, a finished one included: Q-13r lists each (resume and end, or Q-26); Q-26 clears the finished one and Q-05 returns; Lessons never shows a finished quest', async (m) => {
  const p = await onPage(m);
  const made = [];
  for (let i = 60; i < 68; i += 1) made.push((await p.q.createQuest(p.day.lc, p.state(), p.q.questSeed(occurrence(i)))).goalId);
  const ticket = p.day.lc.completionTicket(made[0], 'session-x', p.q.questSeed(occurrence(60)));
  await p.day.lc.completeGoal(made[0], ticket);
  assert.equal(all(p.lessons()).filter((e) => e.id.startsWith('kanji-quest-lessons-')).length, 7);
  p.word().children.find((e) => e.id === 'kanji-quest-door').click();
  assert.ok(p.has('Q-13r')); assert.equal(p.find('kanji-quest-start'), null);
  assert.equal(all(p.main).filter((e) => e.id.startsWith('kanji-quest-resume-')).length, 7);
  assert.equal(all(p.main).filter((e) => e.id.startsWith('kanji-quest-end-')).length, 7);
  assert.equal((await p.q.clearCompleted(p.day.lc, p.state(), made[1])).kind, 'absent', 'an unfinished quest is never cleared');
  p.click(`kanji-quest-clear-${made[0]}`); await flush();
  assert.equal(goals(p).length, 7);
  assert.ok(p.find('kanji-quest-start'), 'room again');
});

test('U16', 'a structural hold stops quests only: the word page shows Q-17 and no quest door, Lessons no row, a quest page Q-17; the room door still works', async (m) => {
  const p = await onPage(m);
  await created(p);
  const journey = p.journey(), lc = journey.lifecycle;
  journey.lifecycle = { ...lc, inspect: () => ({ ...lc.inspect(), phase: 'authority-unavailable' }) };
  const sheet = p.word();
  assert.equal(sheet.children.some((e) => e.id === 'kanji-quest-door'), false);
  assert.ok(sheet.textContent.includes(p.copy('Q-17'))); assert.ok(sheet.children.some((e) => e.id === 'kanji-room-door'));
  assert.equal(all(p.lessons()).some((e) => e.id.startsWith('kanji-quest-lessons-')), false);
  p.context.render();
  assert.ok(p.has('Q-17')); assert.equal(p.find('kanji-quest-reading'), null);
});

test('U17', 'with a review hook the quest settles beside it: the last self-check still completes the quest, and each answer shows its review line', async (m) => {
  const p = await onPage(m);
  Object.assign(p.context, { __KAIRO_HOOKS__: { report() {} }, kanjiReviewCaller: { observe: async () => ({ write: false, reason: 'not-due' }) },
    kanjiJourneyPrepare: async () => ({ reason: 'not-due' }), KANJI_REVIEW_STATE: {} });
  await created(p); intoReading(p);
  await answer(p, 'right'); assert.ok(p.has('Q-16'));
  p.click('kanji-course-self-knew'); await flush();
  assert.ok(p.text().includes('This could not be recorded for review.'), 'the review line');
  p.click('kanji-course-next'); await flush();
  await prompt(p, 'wrong', 'missed'); await prompt(p, 'right', 'knew');
  assert.ok(p.has('Q-12')); assert.equal(goals(p).length, 0);
});

test('U18', 'a binding made under another activation settles nothing: Q-21, never Q-22 or Q-12, and the quest stays as it was (W12 2000 L3)', async (m) => {
  const p = await onPage(m);
  await created(p); intoReading(p);
  await prompt(p, 'right', 'knew'); await prompt(p, 'wrong', 'missed'); await answer(p, 'right');
  const entry = p.state().sessions.get(p.S.kanjiCourse.run.sessionId);
  entry.binding.boot = Object.freeze({});
  const rows = journeyRows(p.day.c).length;
  p.click('kanji-course-self-knew'); await flush();
  p.click('kanji-course-next'); await flush();
  assert.ok(p.has('Q-21')); assert.equal(p.has('Q-22') || p.has('Q-12'), false);
  assert.equal(journeyRows(p.day.c).length, rows, 'nothing written');
  assert.equal(goals(p)[0].status, 'unfinished');
});

/** each control mutates corridor.js (or m4-quest.mjs) and names the case that must fail */
export const MUTANTS = {
  'no-bind-at-start': ['U5', [["    if (typeof kanjiQuestRunStarted === 'function') kanjiQuestRunStarted(visit);\n", '']]],
  // binding at the first render is the same as at creation here (start() redraws at once), so the wrong place named is a resume
  'bind-at-resume': ['U5', [["    if (typeof kanjiQuestRunStarted === 'function') kanjiQuestRunStarted(visit);\n", ''],
    ["  const toRoom = () => { quest.view = 'room';", "  const toRoom = () => { if (visit.run) kanjiQuestRunStarted(visit); quest.view = 'room';"]]],
  'pre-goal-run-counts': ['U5', [["if (occupying && !(occupying === 'reading' && bound)) {", "if (occupying && occupying !== 'reading') {"]]],
  'k03-in-quest': ['U6', [["inQuest ? tx(...M4_COPY['Q-16']) : tx(", "false ? tx(...M4_COPY['Q-16']) : tx("]]],
  'no-self-check-without-hook': ['U6', [["} else if (!inQuest && hookless) {", "} else if (hookless) {"]]],
  'no-settle-without-hook': ['U7', [["  visit.hookOutcomes[attemptId] = { write: false, reason: 'hook-unavailable' };\n  kanjiQuestSettle(visit);\n", "  visit.hookOutcomes[attemptId] = { write: false, reason: 'hook-unavailable' };\n"]]],
  'done-while-pending': ['U7', [["for (const id of settle.pending ? [] : settle.lines) line(id);", "for (const id of settle.pending ? ['Q-12'] : settle.lines) line(id);"]]],
  'no-settle-with-hook': ['U17', [["  if (typeof kanjiQuestSettle === 'function') kanjiQuestSettle(visit);\n", '']]],
  'q18-missing': ['U8', [["if (!settle) { line('Q-18');", "if (!settle) { return;"]]],
  'dead-owner': ['U9', [['  return () => kanjiJourney === journey && journey.epoch === recordEpoch && recordReady(journey.epoch);',
    '  return () => true;']]],
  'captured-owner': ['U9', [['  return () => kanjiJourney === journey && journey.epoch === recordEpoch && recordReady(journey.epoch);',
    '  const live = kanjiJourney === journey && journey.epoch === recordEpoch && recordReady(journey.epoch);\n  return () => live;']]],
  'hold-line-every-time': ['U11', [['&& !journey.quest.toldHold) {', ') {']]],
  'hold-line-missing': ['U10', [["journey.quest.toldHold = true; lines.push('Q-25');", 'journey.quest.toldHold = true;']]],
  'end-claims-unpublished': ['U12', [["lines: out.kind === 'published' ? ['Q-24'] : [] });\n    else quest.lines = kanjiQuestLines(journey, 'end', out);",
    "lines: ['Q-24'] });\n    else quest.lines = ['Q-24'];"]]],
  'leave-drops-visit': ['U13', [['  if (frame) { frame.kanjiCourseReturn.priorCourse = visit; returnFromNavigation(); return; }', '  if (frame) { returnFromNavigation(); return; }']]],
  'leave-is-course-back': ['U4', [["  if (questStage && questStage !== 'ended') {", "  if (false) {"]]],
  'quests-when-off': ['U1', [["  if (JOURNEY_WRITES && typeof kanjiQuestAdopt === 'function') await kanjiQuestAdopt(journey);", "  if (typeof kanjiQuestAdopt === 'function') await kanjiQuestAdopt(journey);"]]],
  'restart-every-render': ['U14', [["journey.quest.restarted = false; lines(['Q-15']);", "lines(['Q-15']);"]]],
  'lessons-show-finished': ['U15', [["    if (goal.status !== 'unfinished') continue;\n    const row = el('button', 'entry-row');", "    const row = el('button', 'entry-row');"]]],
  'stale-binding-in-progress': ['U18', [["if (!results.length) { settle.lines = owned() ? ['Q-21'] : ['K-26']; return; }", "if (!results.length) { settle.lines = owned() ? ['Q-22'] : ['K-26']; return; }"]]],
  'k20-hidden-in-quest': ['U6', [["        if (hookless) main.append(el('p', 'fine', kanjiCourseHookLine({ reason: 'hook-unavailable' })));\n", '']]],
  'conflicting-provenance': ['U2', [["  if (node?.t !== 'word' || node.id !== '職業' || node.sourceContext != null) return null;", "  if (node?.t !== 'word' || node.id !== '職業') return null;"]]],
  'structural-ignored': ['U16', [["  return !view.root || KANJI_QUEST_STRUCTURAL.includes(view.phase);", '  return !view.root;']]],
  'adapter-clear-unfinished': ['U15', [], [["  if (!goal || goal.status !== 'completed') return { kind: 'absent' };\n  if (!owned()) return { kind: 'owner-changed' };\n  state.recovered.add(goalId);",
    "  if (!goal) return { kind: 'absent' };\n  if (!owned()) return { kind: 'owner-changed' };\n  state.recovered.add(goalId);"]]],
};

const mutate = (text, pairs, name) => pairs.reduce((value, [from, to]) => {
  assert.equal(value.split(from).length, 2, 'mutant anchor not unique: ' + name); return value.replace(from, to);
}, text);

async function main() {
  floor();
  const only = arg('case'), results = [], modules = await load();
  for (const t of CASES) {
    if (only && t.id !== only) continue;
    floor();
    try { await t.fn(modules); results.push({ id: t.id, passed: true }); }
    catch (error) { results.push({ id: t.id, passed: false, error: error.message.split('\n')[0] }); }
  }
  const controls = [];
  if (process.argv.includes('--mutants')) {
    const original = { source: SOURCE, adapter: ADAPTER };
    for (const [name, [target, corridorPairs, adapterPairs = []]] of Object.entries(MUTANTS)) {
      floor();
      const source = mutate(original.source, corridorPairs, name), adapter = mutate(original.adapter, adapterPairs, name);
      const t = CASES.find((entry) => entry.id === target);
      try {
        await withSources(source, adapter, () => t.fn(modules));
        controls.push({ name, target, killed: false });
      } catch (error) { controls.push({ name, target, killed: error instanceof assert.AssertionError, witness: error.message.split('\n')[0] }); }
    }
  }
  const failed = results.filter((r) => !r.passed), survived = controls.filter((c) => !c.killed);
  console.log(JSON.stringify({ cases: `${results.length - failed.length}/${results.length}`, failed,
    controls: controls.length ? `${controls.length - survived.length}/${controls.length}` : 'not run', survived, controlDetails: controls }, null, 1));
  process.exitCode = failed.length || survived.length ? 1 : 0;
}
/** a mutant runs its case over the mutated texts: the page and the adapter read these bindings */
let current = null;
async function withSources(source, adapter, start) {
  current = { source, adapter };
  try { return await start(); } finally { current = null; }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
