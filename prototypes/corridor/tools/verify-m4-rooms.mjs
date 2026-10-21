/** M4 S3a (lead 1835; UX r4.2 7eae4438 §3): the reading and meaning rooms in the course view, as a pure DOM probe. The authored
 * corridor functions are lifted from corridor.js into a vm with the real kanji-course.js and a synthetic DOM that models
 * elements, text, ids and click events only. No native rendering, focus or IME claim. stdout only; no files are written.
 *   node tools/verify-m4-rooms.mjs [--case=<id>] [--mutants]
 */
import assert from 'node:assert/strict';
import { readFileSync, statfsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { liftCorridor } from './srs-hooks-corridor-layer.mjs';

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const floor = () => { const s = statfsSync(DIR); assert.ok(s.bavail * s.bsize >= 1.2 * 1024 ** 3, 'DISK STOP: below 1.2 GiB'); };
export const SOURCE = readFileSync(resolve(DIR, 'corridor.js'), 'utf8');
const COURSE = readFileSync(resolve(DIR, 'kanji-course.js'), 'utf8');
const NAMES = ['ROOM_NAMES', 'roomName', 'M4_COPY', 'kanjiCourseRunKind', 'kanjiRoomEntry', 'kanjiChooseRoom', 'kanjiEnterCourseDoor',
  'openKanjiRooms', 'renderKanjiRoomChooser', 'renderKanjiCourseDoor', 'renderKanjiCourseMenu', 'renderKanjiCourse',
  'kanjiCourseNodeUnit', 'kanjiCourseApplyHelp', 'kanjiCourseReturnFrame', 'kanjiCourseEntryNode'];

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

/** one page: the lifted program over a fresh S, in English or Japanese */
export function page(source = SOURCE, { lang = 'en' } = {}) {
  let main = new Element('main');
  const S = { view: 'lessons', stack: [], navigationReturns: [], kanjiCourse: null, lessonsDone: {}, lessonRun: null };
  const context = vm.createContext({
    console,
    crypto: { randomUUID: () => `session-${++page.serial}` },
    S, recordEpoch: 1, personalHost: null, recordReady: () => true, placesLayout: () => false,
    el: (tag, cls, text) => new Element(tag, cls, text),
    biLabel: (tag, cls, ja, en) => new Element(tag, cls, lang === 'ja' ? ja : en),
    tx: (ja, en) => (lang === 'ja' ? ja : en),
    document: { getElementById: (id) => all(main).find((e) => e.id === id) || null },
    render: () => { main = new Element('main'); context.renderKanjiCourse(main); },
    go: () => { throw new Error('no navigation in this probe'); },
    returnFromNavigation: () => { throw new Error('no return frame in this probe'); },
    // the unchanged entry seam: reuse the visit for the same unit, else open a new one, and show Lessons
    openKanjiCourseUnit: (node) => {
      const unit = context.kanjiCourseNodeUnit(node);
      if (!unit) return false;
      if (S.kanjiCourse?.unitId !== unit.id) S.kanjiCourse = { unitId: unit.id, stage: 'intro', index: 0, epoch: 1, run: null, draft: '',
        feedback: null, saved: false, pending: false, supportedPractice: true };
      S.view = 'lessons';
      return true;
    },
  });
  context.window = context; context.globalThis = context;
  vm.runInContext(COURSE, context);
  vm.runInContext(liftCorridor(source, NAMES), context);
  // the probe's own helpers run inside the vm, so the course's plain-object checks see objects of its own realm; the lifted
  // constants are reached through them, since a script's const does not become a property of its context
  vm.runInContext(`function __copy(id) { return M4_COPY[id]; }
function __room(id) { return ROOM_NAMES.rooms[id]; }
function __answer(value, at) {
  const course = window.BunkiKanjiCourse, visit = S.kanjiCourse, attempt = course.currentAttempt(visit.run), prompt = course.currentPrompt(visit.run);
  const response = value ?? (prompt.kind === 'reading' ? prompt.acceptedAnswers[0] : prompt.answerId);
  visit.run = course.showFeedback(course.answer(visit.run, response, { attemptId: attempt.attemptId, at }), attempt.attemptId, at + 1);
}`, context);
  context.render();
  const ui = {
    S, context, course: context.BunkiKanjiCourse, lang,
    get main() { return main; },
    find: (id) => all(main).find((e) => e.id === id) || null,
    text: () => main.textContent,
    click(id) { const target = ui.find(id); assert.ok(target, `no #${id} on the page`); target.click(); },
    copy: (id) => context.__copy(id)[lang === 'ja' ? 0 : 1],
    room: (id) => context.__room(id)[lang === 'ja' ? 0 : 1],
  };
  return ui;
}
page.serial = 0;
const WORD = Object.freeze({ t: 'word', id: '職業', reading: 'しょくぎょう' });
const at = () => ++at.now; at.now = Date.parse('2026-10-22T09:00:00+09:00');
/** answer the visit's current prompt directly through the course, as a learner's answer would leave the run */
function answer(p, value) {
  p.context.__answer(value ?? null, at()); at();
  p.context.render();
}
const into = (p, room) => { p.context.openKanjiRooms(WORD, null); p.click(`kanji-room-${room}`); p.click('kanji-course-practise'); };
const checkShown = (p) => !!(p.find('kanji-course-answer') || p.find('kanji-course-reveal') || p.find('kanji-course-skip'));

export const CASES = [];
const test = (id, name, fn) => CASES.push({ id, name, fn });

test('R1', 'R-01 opens the chooser: R-02 and exactly two study doors, Reading (R-04) and Meaning (R-06), none disabled, no check', (src) => {
  for (const lang of ['en', 'ja']) {
    const p = page(src, { lang });
    p.context.openKanjiRooms(WORD, null);
    assert.ok(p.text().includes(p.copy('R-02')));
    const doors = all(p.main).filter((e) => e.className === 'study-door');
    assert.deepEqual(doors.map((d) => d.id), ['kanji-room-reading', 'kanji-room-meaning']);
    assert.deepEqual(doors.map((d) => d.textContent), [p.room('room-reading') + p.copy('R-04'), p.room('room-meaning') + p.copy('R-06')]);
    assert.ok(doors.every((d) => !d.disabled)); assert.equal(checkShown(p), false);
    assert.deepEqual([...p.context.roomName('lessons')], [...p.context.__room('lessons')], 'the chooser is still Lessons');
  }
});
test('R2', 'the Reading room starts a reading-only run with its scope note, takes its name, and carries the word without its reading', (src) => {
  const p = page(src);
  p.context.openKanjiRooms(WORD, null); p.click('kanji-room-reading');
  assert.ok(p.text().includes(p.copy('R-10'))); assert.equal(p.text().includes('Choose 3 character keywords'), false);
  p.click('kanji-course-practise');
  const run = p.S.kanjiCourse.run;
  assert.deepEqual([[...run.targets], run.promptIds.length, run.mode], [['reading'], 3, 'check']);
  assert.deepEqual([...p.context.roomName('lessons')], ['ことば全体の読み', 'Whole-word reading']);
  assert.ok(p.find('kanji-room-chooser'), 'R-09');
  assert.ok(p.text().includes(p.copy('R-07')));
  assert.equal(p.text().includes('しょくぎょう'), false, 'no reading before the check is answered');
});
test('R3', 'an unfinished Reading run blocks the Meaning room: only R-08, R-11 and R-09, no check; R-11 returns to the same prompt, attempt and draft', (src) => {
  const p = page(src);
  into(p, 'reading'); answer(p);
  const visit = p.S.kanjiCourse; visit.draft = 'ち';
  const before = { run: visit.run, cursor: visit.run.cursor, attempt: p.course.currentAttempt(visit.run).attemptId };
  p.click('kanji-room-chooser'); p.click('kanji-room-meaning');
  assert.ok(p.text().includes(p.copy('R-08'))); assert.ok(p.find('kanji-room-return')); assert.ok(p.find('kanji-room-chooser'));
  assert.equal(checkShown(p), false, 'a blocked room shows no check');
  assert.equal(visit.run, before.run, 'the occupying run is untouched');
  p.click('kanji-room-return');
  assert.equal(visit.run, before.run); assert.equal(visit.run.cursor, before.cursor);
  assert.equal(p.course.currentAttempt(visit.run).attemptId, before.attempt);
  assert.equal(p.find('kanji-course-answer')?.value, 'ち', 'the draft is kept');
});
test('R4', 'Meaning blocks Reading with R-08b; the mixed course run blocks both rooms with R-08c; an unfinished Reading run blocks the course door with R-08', (src) => {
  const a = page(src);
  into(a, 'meaning'); answer(a);
  a.click('kanji-room-chooser'); a.click('kanji-room-reading');
  assert.ok(a.text().includes(a.copy('R-08b'))); assert.equal(checkShown(a), false);
  const b = page(src);
  b.context.kanjiEnterCourseDoor(WORD, null); b.click('kanji-course-practise'); answer(b);
  assert.equal(b.S.kanjiCourse.run.targets.length, 2, 'the course door runs both facets');
  for (const room of ['reading', 'meaning']) {
    b.context.openKanjiRooms(WORD, null); b.click(`kanji-room-${room}`);
    assert.ok(b.text().includes(b.copy('R-08c')), `R-08c in ${room}`); b.click('kanji-room-return');
  }
  const c = page(src);
  into(c, 'reading'); answer(c);
  c.context.kanjiEnterCourseDoor(WORD, null);
  assert.ok(c.text().includes(c.copy('R-08'))); assert.equal(checkShown(c), false);
});
test('R5', 'choosing the same room resumes its run: same run, cursor and attempt', (src) => {
  const p = page(src);
  into(p, 'reading'); answer(p);
  const visit = p.S.kanjiCourse, run = visit.run, attempt = p.course.currentAttempt(run).attemptId;
  p.click('kanji-room-chooser'); p.click('kanji-room-reading');
  assert.equal(visit.run, run); assert.equal(p.course.currentAttempt(visit.run).attemptId, attempt); assert.ok(checkShown(p));
});
test('R6', 'a finished run frees the visit: the other room starts its own run', (src) => {
  const p = page(src);
  into(p, 'reading'); answer(p); answer(p); answer(p);
  assert.equal(p.S.kanjiCourse.run.complete, true);
  p.click('kanji-room-chooser'); p.click('kanji-room-meaning');
  assert.ok(p.text().includes(p.copy('R-10m'))); p.click('kanji-course-practise');
  assert.deepEqual([...p.S.kanjiCourse.run.targets], ['meaning']);
});
test('R7', 'without a room the course is unchanged: its own intro, and a run of both facets', (src) => {
  const p = page(src);
  p.context.kanjiEnterCourseDoor(WORD, null);
  assert.ok(p.text().includes('Choose 3 character keywords and recall 3 whole-word readings'));
  assert.equal(p.find('kanji-room-chooser'), null);
  p.click('kanji-course-practise');
  assert.deepEqual([...p.S.kanjiCourse.run.targets], ['meaning', 'reading']);
});
test('R8', 'R-01 sits beside the course door only on the 職業 word page, and in Lessons', (src) => {
  const p = page(src);
  const sheetFor = (node) => { const sheet = new Element('section'); p.context.renderKanjiCourseDoor(sheet, node); return all(sheet).map((e) => e.id); };
  assert.deepEqual(sheetFor(WORD), ['', 'kanji-course-unit-door', 'kanji-room-door']);
  assert.deepEqual(sheetFor({ t: 'word', id: '知識', reading: 'ちしき' }), ['', 'kanji-course-unit-door']);
  assert.deepEqual(sheetFor({ t: 'kanji', id: '職' }), ['', 'kanji-course-unit-door']);
  const menu = new Element('main'); p.S.kanjiCourse = { stage: 'menu' }; p.context.renderKanjiCourseMenu(menu);
  const lessons = all(menu).find((e) => e.id === 'kanji-room-lessons');
  assert.equal(lessons?.textContent, p.copy('R-01'));
  lessons.click();
  assert.equal(p.S.kanjiCourse.chooser, true); assert.ok(p.find('kanji-room-reading'));
});
test('R9', 'Japanese: the room lines show on the Japanese key', (src) => {
  const p = page(src, { lang: 'ja' });
  into(p, 'reading'); answer(p);
  assert.ok(p.text().includes(p.copy('R-07')));
  p.click('kanji-room-chooser'); p.click('kanji-room-meaning');
  for (const id of ['R-08', 'R-11', 'R-09']) assert.ok(p.text().includes(p.copy(id)), id);
});

/** one targeted mutant per room rule; each must turn its own case red */
export const MUTANTS = {
  'blocked-starts-run': ['R3', [["  visit.blocked = entry.startsWith('blocked-') ? entry.slice('blocked-'.length) : null;\n  if (entry === 'start') Object.assign(visit, { room, stage: 'intro', index: 0, feedback: null });",
    "  visit.blocked = null;\n  if (entry !== 'resume') Object.assign(visit, { room, stage: 'intro', index: 0, feedback: null });"]]],
  'blocked-shows-check': ['R3', [["main.append(button('kanji-room-chooser', ...M4_COPY['R-09'], () => { visit.blocked = null; visit.chooser = true; redraw(); }));\n    return;\n  }",
    "main.append(button('kanji-room-chooser', ...M4_COPY['R-09'], () => { visit.blocked = null; visit.chooser = true; redraw(); }));\n  }"]]],
  'return-clears-draft': ['R3', [["main.append(button('kanji-room-return', ...M4_COPY['R-11'], () => { visit.blocked = null; redraw(); }));",
    "main.append(button('kanji-room-return', ...M4_COPY['R-11'], () => { visit.blocked = null; visit.draft = ''; redraw(); }));"]]],
  'room-run-both-facets': ['R2', [['      ...(visit.room ? { targets: [visit.room] } : {}) });', '      });']]],
  'course-door-ignores-rooms': ['R4', [["  const visit = S.kanjiCourse, entry = kanjiRoomEntry(visit, 'mixed');", "  const visit = S.kanjiCourse, entry = 'start';"]]],
  'carried-strip-shows-reading': ['R2', [["main.append(el('p', 'fine', tx(...M4_COPY['R-07'])));", "main.append(el('p', 'fine', `${tx(...M4_COPY['R-07'])} しょくぎょう`));"]]],
  'room-name-ignored': ['R2', [["  if (view === 'lessons' && !S.kanjiCourse?.chooser && ['reading', 'meaning'].includes(S.kanjiCourse?.room)) {", '  if (false) {']]],
  'finished-run-still-occupies': ['R6', [['  if (!run || run.complete || run.schemaVersion !== 2) return null;', '  if (!run || run.schemaVersion !== 2) return null;']]],
  'room-door-on-every-word': ['R8', [["if (unit.id === 'shiki-shoku' && node.t === 'word' && node.id === '職業') {", "if (unit.id === 'shiki-shoku') {"]]],
};

function main() {
  floor();
  const only = arg('case'), results = [];
  for (const t of CASES) {
    if (only && t.id !== only) continue;
    try { t.fn(SOURCE); results.push({ id: t.id, passed: true }); }
    catch (error) { results.push({ id: t.id, passed: false, error: error.message.split('\n')[0] }); }
  }
  const controls = [];
  if (process.argv.includes('--mutants')) {
    for (const [name, [target, pairs]] of Object.entries(MUTANTS)) {
      let text = SOURCE;
      for (const [from, to] of pairs) { assert.equal(text.split(from).length, 2, 'mutant anchor not unique: ' + name); text = text.replace(from, to); }
      try { CASES.find((entry) => entry.id === target).fn(text); controls.push({ name, target, killed: false }); }
      catch (error) { controls.push({ name, target, killed: error instanceof assert.AssertionError, witness: error.message.split('\n')[0] }); }
    }
  }
  const failed = results.filter((r) => !r.passed), survived = controls.filter((c) => !c.killed);
  console.log(JSON.stringify({ cases: `${results.length - failed.length}/${results.length}`, failed,
    controls: controls.length ? `${controls.length - survived.length}/${controls.length}` : 'not run', survived, controlDetails: controls }, null, 1));
  process.exitCode = failed.length || survived.length ? 1 : 0;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
