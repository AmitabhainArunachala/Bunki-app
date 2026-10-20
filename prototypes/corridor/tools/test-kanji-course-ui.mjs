/** Source-only UI/state probes over the actual course renderer, menu and patch
 * helper, lifted by TypeScript AST. The real UMD course executes in the same VM.
 *
 * Fake DOM: tree/text, attributes, focus and explicit events only. render replaces
 * the tree; go changes view and retains the visit. commitStorePatch is a controlled
 * promise whose callback sees the latest synthetic record at ACK. These tests do
 * not establish browser layout, native IME ordering, navigation-stack restoration,
 * storage-host/IndexedDB durability, accessibility or actual learner acceptance.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const source = read('../corridor.js');
const courseSource = read('../kanji-course.js');
const ast = ts.createSourceFile('corridor.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const names = ['kanjiCourseNodeUnit', 'kanjiCourseApplyHelp', 'kanjiCourseRememberHelp', 'kanjiCourseTeachingHelp', 'kanjiCourseReferenceHelp', 'kanjiCourseHookLine', 'reportKanjiCourseAttempt', 'kanjiCourseEvidencePatch', 'kanjiCourseReturnFrame', 'kanjiCourseEntryNode',
  'openKanjiCourseUnit', 'renderKanjiCourseDoor', 'renderKanjiCourseMenu', 'renderKanjiCourse'];
const lifted = names.map(name => {
  const node = ast.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert.ok(node, `actual source function ${name}`);
  return node.getText(ast);
}).join('\n');
const sha = text => createHash('sha256').update(text).digest('hex');
console.log(JSON.stringify({
  scope: 'source-only fake DOM and controlled synthetic commit',
  corridorSha256: sha(source), courseSha256: sha(courseSource), liftedFunctionsSha256: sha(lifted), functions: names,
}));
const copy = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));

class Element {
  constructor(tag, className = '', text = '') {
    this.tagName = tag.toUpperCase();
    this.className = className;
    this.text = String(text);
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.events = new Map();
    this.id = '';
    this.value = '';
    this.disabled = false;
    this.isConnected = true;
  }
  append(...children) {
    for (const child of children) {
      if (child instanceof Element) child.parentElement = this;
      this.children.push(child);
    }
  }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  addEventListener(type, listener) {
    this.events.set(type, [...(this.events.get(type) || []), listener]);
  }
  focus() { this.focused = true; }
  get textContent() {
    return this.text + this.children.map(child => child instanceof Element ? child.textContent : String(child)).join('');
  }
  fire(type, values = {}, force = false) {
    if (type === 'click' && this.disabled && !force) return null;
    const event = { target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...values };
    for (const listener of this.events.get(type) || []) listener(event);
    return event;
  }
}
function descend(node) {
  return [node, ...node.children.filter(child => child instanceof Element).flatMap(descend)];
}
function harness({ language = 'en' } = {}) {
  const commits = [], navigations = [], invokers = [];
  let scope = { record: { v: 1, taken: [], srs: {}, revlog: [], obslog: [], lessonsDone: {} } };
  let main = new Element('main'), renderCount = 0, now = 1760000000000, sessionNumber = 0;
  class TestDate extends Date { static now() { return now; } }
  const S = { view: 'lessons', stack: [], navigationReturns: [], kanjiCourse: null, lessonsDone: scope.record.lessonsDone };
  const context = vm.createContext({
    S, recordEpoch: 1, personalHost: null, window: { scrollTo() {} }, Date: TestDate, crypto: { randomUUID: () => `session-${++sessionNumber}` },
    el: (tag, cls, text) => new Element(tag, cls, text),
    biLabel: (tag, cls, ja, en) => new Element(tag, cls, language === 'ja' ? ja : en),
    tx: (ja, en) => language === 'ja' ? ja : en,
    document: { getElementById: id => descend(main).find(element => element.id === id) || null },
    recordReady: epoch => epoch === context.recordEpoch,
    preserveVisibleDrafts: () => true,
    keepNavigationReturn: destination => {
      S.navigationReturns.push({ destination, view: S.view, stack: S.stack });
      S.stack = [];
    },
    returnFromNavigation: () => {
      const home = S.navigationReturns.pop();
      S.kanjiCourse = home.kanjiCourseReturn.priorCourse;
      S.stack = home.stack; S.view = home.view; draw();
    },
    render: () => draw(),
    go: (node, options) => { context.kanjiCourseReferenceHelp(S.kanjiCourse, node); navigations.push(copy(node)); invokers.push(options?.invoker); S.view = node.t; draw(); },
    commitStorePatch: builder => {
      const owner = scope;
      return new Promise(resolve => {
        commits.push({
          owner, builder, resolved: false,
          resolve(saved, { apply = saved } = {}) {
            assert.equal(this.resolved, false);
            this.resolved = true;
            if (apply) {
              this.patch = builder(owner.record);
              owner.record = { ...owner.record, ...this.patch };
              if (owner === scope) S.lessonsDone = owner.record.lessonsDone;
            }
            resolve(saved);
          },
        });
      });
    },
  });
  vm.runInContext(courseSource, context);
  vm.runInContext(`window.BunkiKanjiCourse = BunkiKanjiCourse;\n${lifted}`, context);
  function draw() {
    main = new Element('main'); renderCount++;
    if (S.view !== 'lessons') return;
    if (S.kanjiCourse) context.renderKanjiCourse(main);
    else context.renderKanjiCourseMenu(main);
  }
  const byId = id => {
    const found = descend(main).find(element => element.id === id);
    assert.ok(found, `rendered #${id}; text=${main.textContent}`);
    return found;
  };
  const select = id => {
    const row = descend(main).find(element => element.dataset.kanjiCourseUnit === id);
    assert.ok(row, `unit ${id}`);
    row.fire('click');
  };
  draw();
  return {
    context, S, commits, navigations, invokers, draw, byId, select,
    get text() { return main.textContent; },
    get elements() { return descend(main); },
    get record() { return scope.record; },
    get renderCount() { return renderCount; },
    get course() { return context.BunkiKanjiCourse; },
    click(id) { byId(id).fire('click'); },
    setNow(value) { now = value; },
    changeEpoch() {
      context.recordEpoch++;
      scope = { record: { v: 1, taken: [], srs: {}, revlog: [], obslog: [], lessonsDone: {} } };
      S.lessonsDone = scope.record.lessonsDone;
      draw();
    },
    returnToLessons() { S.view = 'lessons'; draw(); },
    submit(value, event = {}) {
      const input = byId('kanji-course-answer');
      input.value = value; input.fire('input');
      const form = descend(main).find(element => element.tagName === 'FORM');
      assert.ok(form); return form.fire('submit', event);
    },
    finish(actions = []) {
      let step = 0;
      while (!S.kanjiCourse.run.complete) {
        const prompt = context.BunkiKanjiCourse.currentPrompt(S.kanjiCourse.run);
        const action = actions[step++] || 'correct';
        if (action === 'skip' || action === 'reveal') this.click(`kanji-course-${action}`);
        else if (prompt.kind === 'meaning') {
          const choice = action === 'wrong' ? prompt.choices.find(item => item.id !== prompt.answerId).id : prompt.answerId;
          this.click(`kanji-course-choice-${choice}`);
        } else this.submit(action === 'wrong' ? 'ちがう' : prompt.acceptedAnswers[0]);
        this.click('kanji-course-next');
      }
    },
  };
}
const checked = actions => {
  const h = harness();
  h.select('shapes');
  h.click('kanji-course-preview');
  h.finish(actions);
  return h;
};

// These probes use the real route/stack functions. Rendering, transitions and
// focus remain synthetic; no browser layout or durable storage is exercised.
function routeHarness() {
  const h = harness(), c = h.context;
  const noop = () => {};
  Object.assign(c, {
    roomTransition: action => action(),
    learningSourceVisit: null, pendingReferenceCollection: null,
    referenceLibrary: { state: {}, keepScroll: noop, returnScroll: noop,
      entry: (type, id) => ({ type, id }) },
    retireScaleReturn: noop, rememberSheet: noop, restoreDialogInvoker: noop,
    stopReadAloud: noop, rememberScaleEntry: noop, keyboardActivated: () => true,
    finishPageTransition: noop, layerPathFor: () => false, scaleNodeBelongs: () => false,
    ladderOpening: null, ladderPages: new WeakMap(), ladderVisit: null, ladderReturning: null,
    heroSource: new WeakMap(), keptPages: new WeakMap(), pageEpoch: 1,
    sampleWhere: () => '', pageCutAllowed: () => false, removeMini: noop,
    sampleTransition: noop, clearReaderSummons: noop, syncWalkSentinel: noop,
    withEn: element => element, ROOM_NAMES: { rooms: { kanjidex: ['字引', 'Kanji finder'] } },
    saveReaderPosition: () => { throw new Error('unexpected position write'); },
  });
  c.window.scrollY = 75;
  c.window.scrollTo = (_x, y) => { c.window.scrollY = y; };
  const declaration = name => {
    const node = ast.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
    assert.ok(node, `actual route function ${name}`);
    return node;
  };
  const routeNames = ['keepNavigationReturn', 'returnFromNavigation', 'foundationDoor', 'keepScroll',
    'returnScroll', 'invokerKey', 'go', 'enterWord', 'recede'];
  // Lift through the actual mounted course door; unrelated finder lenses are
  // outside this route test. This uses the parsed statement, not a copied callback.
  const finder = declaration('renderKanjidex');
  const mount = finder.body.statements.find(statement => ts.isExpressionStatement(statement) &&
    ts.isCallExpression(statement.expression) && statement.expression.expression.getText(ast) === 'main.append' &&
    statement.expression.arguments.some(argument => argument.getText(ast) === 'courseDoor'));
  assert.ok(mount, 'actual finder course door mount');
  const finderPrefix = source.slice(finder.getStart(ast), mount.end) + '\n}';
  vm.runInContext(routeNames.map(name => declaration(name).getText(ast)).join('\n') + '\n' + finderPrefix, c);
  h.detour = view => c.foundationDoor(`detour-${view}`, view, view, view).fire('click');
  h.genericResume = () => {
    const finderMain = new Element('main');
    c.renderKanjidex(finderMain);
    const door = descend(finderMain).find(element => element.id === 'kanjidex-course');
    assert.ok(door, 'actual finder resume callback');
    door.fire('click');
  };
  h.openContext = node => {
    h.S.stack = [node];
    const sheet = new Element('section');
    c.renderKanjiCourseDoor(sheet, node);
    assert.equal(sheet.children.length, 1);
    sheet.children[0].fire('click');
  };
  return h;
}

function genericResumeJourney(h, { atlas = false, ownerChange = false } = {}) {
  const c = h.context, S = h.S;
  const originA = { t: 'kanji', id: '森', from: { passage: 'source-A', index: 99 },
    sourceContext: { sourceId: 'source-A', index: 99 }, kanjiOccurrenceId: 'occurrence-A' };
  const originB = { t: 'kanji', id: '森', referenceEntry: { type: 'kanji', id: '森' },
    kanjiOccurrenceId: 'occurrence-B', ...(atlas ? {} : {
      from: { passage: 'source-B', index: 3 }, sourceContext: { sourceId: 'source-B', index: 3 },
    }) };
  S.view = 'reader';
  h.openContext(originA);
  const visit = S.kanjiCourse, capsuleA = S.navigationReturns[0];
  h.click('kanji-course-practise');
  h.click('kanji-course-choice-人'); h.click('kanji-course-next');
  visit.draft = 'unfinished kana';
  const answers = copy(visit.run.responses), originalOrigin = copy(visit.originNode);
  const lesson = { id: 'ordinary-lesson', draft: 'keep ordinary lesson' };
  S.lessonRun = lesson;
  h.detour(atlas ? 'levels' : 'reader');
  h.openContext(originB);
  const capsuleB = S.navigationReturns.at(-1), currentRun = visit.run;
  assert.strictEqual(S.kanjiCourse, visit);
  const target = h.course.getUnit('shapes').targets.find(row => row.kanji === '森');
  h.detour('kanjidex'); h.genericResume();
  assert.equal(S.view, 'lessons');
  assert.equal(c.kanjiCourseReturnFrame(), null, 'generic top frame remains an ordinary return');
  assert.equal(S.navigationReturns.length, 5);
  if (ownerChange) {
    h.changeEpoch();
    const outbound = c.kanjiCourseEntryNode(visit, target, 'kanji');
    assert.deepEqual(copy(outbound), { t: 'kanji', id: '森' }, 'old owner cannot lend source provenance');
    assert.equal(c.returnFromNavigation(), true);
    assert.equal(S.navigationReturns.length, 0);
    assert.equal(S.stack.length, 0);
    assert.equal(S.view, 'lessons');
    assert.equal(S.kanjiCourse.stage, 'menu');
    assert.equal(h.commits.length, 0);
    return;
  }
  const outbound = c.kanjiCourseEntryNode(visit, target, 'kanji');
  assert.equal(outbound.kanjiOccurrenceId, 'occurrence-B', 'generic resume must use the active B occurrence');
  assert.strictEqual(outbound.referenceEntry, originB.referenceEntry);
  if (atlas) {
    assert.equal(Object.hasOwn(outbound, 'from'), false, 'Atlas cannot borrow source A');
    assert.equal(Object.hasOwn(outbound, 'sourceContext'), false);
  } else {
    assert.deepEqual(copy(outbound.from), originB.from, 'generic resume must use the active B source');
    assert.deepEqual(copy(outbound.sourceContext), originB.sourceContext);
  }
  c.go(outbound, { invoker: new Element('button'), instant: true });
  assert.strictEqual(S.stack.at(-1), outbound);
  c.recede({ instant: true });
  assert.equal(S.stack.length, 0);
  assert.equal(c.returnFromNavigation(), true); // generic course -> finder
  assert.equal(S.view, 'kanjidex');
  assert.equal(c.returnFromNavigation(), true); // finder -> course B
  assert.strictEqual(c.kanjiCourseReturnFrame(), capsuleB);
  h.click('kanji-course-source-return'); // course B -> exact B caller
  assert.strictEqual(S.stack.at(-1), originB);
  assert.equal(S.view, atlas ? 'levels' : 'reader');
  assert.equal(c.returnFromNavigation(), true); // B caller -> older course A
  assert.strictEqual(c.kanjiCourseReturnFrame(), capsuleA);
  assert.deepEqual(copy(c.kanjiCourseEntryNode(visit, target, 'kanji').from), originA.from);
  assert.deepEqual(copy(visit.originNode), originalOrigin, 'shared visit origin was not overwritten');
  assert.deepEqual(copy(visit.run.responses), answers);
  assert.strictEqual(visit.run, currentRun);
  assert.equal(visit.draft, 'unfinished kana');
  assert.strictEqual(S.lessonRun, lesson);
  h.click('kanji-course-source-return'); // older course A -> exact A caller
  assert.strictEqual(S.stack.at(-1), originA);
  assert.equal(S.view, 'reader');
  assert.equal(S.kanjiCourse, null);
  assert.equal(S.navigationReturns.length, 0);
  assert.equal(h.commits.length, 0);
  assert.deepEqual(h.record, { v: 1, taken: [], srs: {}, revlog: [], obslog: [], lessonsDone: {} });
}

test('generic finder resume keeps current B provenance and unwinds both capsules exactly', () => {
  genericResumeJourney(routeHarness());
});

test('generic finder resume from Atlas keeps no source and preserves reverse unwind', () => {
  genericResumeJourney(routeHarness(), { atlas: true });
});

test('owner change during generic resume discards stale origins and the old return chain', () => {
  genericResumeJourney(routeHarness(), { ownerChange: true });
});

test('control: the prior top-frame-only fallback is killed by the generic resume regression', () => {
  const h = routeHarness();
  // Intentionally restore the exact old resolution bug in this isolated VM.
  vm.runInContext(`function kanjiCourseEntryNode(visit, target, type) {
    const origin = kanjiCourseReturnFrame()?.kanjiCourseReturn.originNode || visit.originNode;
    if (type === 'kanji' && origin?.id === target.kanji) return { ...origin };
    return { t: type, id: type === 'kanji' ? target.kanji : target.wordKey,
      ...(type === 'word' && target.readings?.length === 1 ? { reading: target.readings[0] } : {}) };
  }`, h.context);
  assert.throws(() => genericResumeJourney(h), /generic resume must use the active B occurrence/);
});

test('actual menu starts four teaching cards then independent meaning/reading checks', () => {
  const h = harness();
  assert.equal(h.elements.filter(element => element.dataset.kanjiCourseUnit).length, 13);
  assert.match(h.text, /51 characters in words/);
  assert.match(h.text, /editorial review.*pending/);
  h.select('shapes');
  assert.equal(h.S.kanjiCourse.stage, 'intro');
  assert.doesNotMatch(h.text, /Tree|tree, wood|き/);
  h.click('kanji-course-learn');
  assert.equal(h.S.kanjiCourse.stage, 'teach');
  assert.match(h.text, /Character keyword for this check.*Tree/);
  assert.match(h.text, /Word meaning for this example.*tree, wood/);
  assert.match(h.text, /See it in another word.*木曜日.*もくようび.*Thursday/);
  for (let index = 0; index < 4; index++) h.click('kanji-course-teach-next');
  assert.equal(h.S.kanjiCourse.stage, 'check');
  assert.equal(h.S.kanjiCourse.run.mode, 'check');
  assert.equal(h.S.kanjiCourse.run.cursor, 0);
  assert.match(h.text, /Choose the character keyword/);
  assert.equal(h.commits.length, 0);
  assert.deepEqual(h.record.taken, []);
});

test('every unit intro withholds teaching answers before learner chooses Learn or Preview', () => {
  const h = harness();
  for (const unit of h.course.listUnits()) {
    h.select(unit.id);
    assert.equal(h.S.kanjiCourse.stage, 'intro');
    assert.equal(h.S.kanjiCourse.run, null);
    assert.match(h.text, /Meaning and reading results stay separate/);
    for (const target of unit.targets) {
      // "Read" occurs inside the generic "Reading checks" instruction. Check
      // actual answer content, not a substring of unrelated instructional prose.
      assert.equal(h.elements.some(element => element.text === target.meaning ||
        element.text.includes(`: ${target.meaning}`)), false, `${unit.id}: keyword not taught before preview`);
      assert.equal(h.text.includes(target.wordMeaning), false, `${unit.id}: word gloss not taught before preview`);
      for (const reading of target.readings) assert.equal(h.text.includes(reading), false, `${unit.id}: reading not taught before preview`);
    }
    assert.equal(h.elements.some(element => element.className === 'review-reading'), false);
    h.click('kanji-course-preview');
    assert.equal(h.S.kanjiCourse.run.mode, 'preview');
    assert.equal(h.S.kanjiCourse.run.cursor, 0);
    assert.equal(h.S.kanjiCourse.run.responses.length, 0);
    assert.equal(h.commits.length, 0);
    h.click('kanji-course-leave');
  }
});

test('an exact character door opens supported practice and preserves earlier course and lesson identities', () => {
  const h = harness();
  h.select('outlines'); h.click('kanji-course-preview');
  h.click('kanji-course-skip'); h.click('kanji-course-next');
  h.S.kanjiCourse.draft = 'ひ';
  const prior = h.S.kanjiCourse, responses = copy(prior.run.responses);
  const lesson = { id: 'ordinary-lesson', draft: 'keep' };
  h.S.lessonRun = lesson;
  const node = { t: 'kanji', id: '雨', from: { passage: 'rain', index: 2 }, occurrence: 'keep-occurrence' };
  h.S.view = 'reader'; h.S.stack = [node];
  const sheet = new Element('section');
  h.context.renderKanjiCourseDoor(sheet, node);
  assert.equal(sheet.children.length, 1);
  sheet.children[0].fire('click');
  assert.equal(h.S.kanjiCourse.unitId, 'nature');
  assert.equal(h.S.kanjiCourse.supportedPractice, true);
  assert.strictEqual(h.S.lessonRun, lesson);
  assert.strictEqual(h.S.navigationReturns[0].kanjiCourseReturn.priorCourse, prior);
  assert.equal(prior.run.mode, 'check');
  assert.equal(prior.draft, 'ひ');
  assert.deepEqual(copy(prior.run.responses), responses);
  assert.match(h.text, /not a first-try check/);
  assert.equal(h.elements.some(element => element.id === 'kanji-course-preview'), false);
  assert.equal(h.elements.some(element => element.id === 'kanji-course-leave'), false);
  h.click('kanji-course-practise');
  assert.equal(h.S.kanjiCourse.run.mode, 'check');
  h.click('kanji-course-source-return');
  assert.strictEqual(h.S.kanjiCourse, prior);
  assert.strictEqual(h.S.lessonRun, lesson);
  assert.strictEqual(h.S.stack[0], node);
  assert.equal(h.commits.length, 0);
  assert.deepEqual(h.record, { v: 1, taken: [], srs: {}, revlog: [], obslog: [], lessonsDone: {} });
});

test('unsupported glyph, private host, pending save, stale node or epoch cannot start a contextual visit', () => {
  const h = harness();
  const invoker = new Element('button');
  for (const glyph of ['學', '𠮟', '川']) {
    const node = { t: 'kanji', id: glyph }, sheet = new Element('section');
    h.S.stack = [node];
    h.context.renderKanjiCourseDoor(sheet, node);
    assert.equal(sheet.children.length, 0);
    assert.equal(h.context.openKanjiCourseUnit(node, invoker), false);
  }
  const node = { t: 'kanji', id: '森' };
  h.S.view = 'reader'; h.S.stack = [node];
  h.context.personalHost = {};
  const hostSheet = new Element('section');
  h.context.renderKanjiCourseDoor(hostSheet, node);
  assert.equal(hostSheet.children.length, 0);
  assert.equal(h.context.openKanjiCourseUnit(node, invoker), false);
  h.context.personalHost = null;
  h.S.kanjiCourse = { pending: true };
  assert.equal(h.context.openKanjiCourseUnit(node, invoker), false);
  h.S.kanjiCourse = null;
  assert.equal(h.context.openKanjiCourseUnit({ ...node }, invoker), false, 'exact live node required');
  invoker.isConnected = false;
  assert.equal(h.context.openKanjiCourseUnit(node, invoker), false);
  invoker.isConnected = true;
  const sheet = new Element('section');
  h.context.renderKanjiCourseDoor(sheet, node);
  h.context.recordEpoch++;
  sheet.children[0].fire('click', {}, true);
  assert.equal(h.S.kanjiCourse, null);
  assert.equal(h.S.navigationReturns.length, 0);
  assert.equal(h.commits.length, 0);
});

test('returning from a same-unit dictionary entry resumes the run and draft without another frame', () => {
  const h = harness();
  h.select('shapes'); h.click('kanji-course-preview');
  const visit = h.S.kanjiCourse, run = visit.run;
  visit.draft = 'き';
  const node = { t: 'kanji', id: '森' };
  h.S.stack = [node];
  assert.equal(h.context.openKanjiCourseUnit(node, new Element('button')), true);
  assert.strictEqual(h.S.kanjiCourse, visit);
  assert.equal(visit.draft, 'き');
  assert.deepEqual(copy(visit.run.promptIds), copy(run.promptIds));
  assert.equal(visit.run.mode, 'check');
  assert.equal(h.S.stack.length, 0);
  assert.equal(h.S.navigationReturns.length, 0);
  assert.equal(h.commits.length, 0);
});

test('supported status survives paused intro and menu; unrelated examples never inherit the source token', () => {
  const h = harness();
  h.select('shapes');
  h.S.kanjiCourse.supportedPractice = true;
  h.draw(); h.click('kanji-course-leave'); h.select('nature');
  assert.equal(h.S.kanjiCourse.supportedPractice, true);
  assert.equal(h.elements.some(element => element.id === 'kanji-course-preview'), false);
  const origin = { t: 'kanji', id: '雨', from: { passage: 'rain', index: 2 },
    sourceContext: { sourceId: 'rain', index: 2, quote: '雨です。' } };
  h.S.view = 'reader'; h.S.stack = [origin];
  assert.equal(h.context.openKanjiCourseUnit(origin, new Element('button')), true);
  h.click('kanji-course-learn');
  const targets = h.course.getUnit('nature').targets;
  for (let index = 0; index < targets.length; index++) {
    const target = targets[index];
    const actual = h.context.kanjiCourseEntryNode(h.S.kanjiCourse, target, 'kanji');
    assert.deepEqual(copy(actual), target.kanji === '雨' ? origin : { t: 'kanji', id: target.kanji });
    const word = h.context.kanjiCourseEntryNode(h.S.kanjiCourse, target, 'word');
    assert.equal(Object.hasOwn(word, 'sourceContext'), false);
    assert.equal(Object.hasOwn(word, 'from'), false);
  }
  assert.equal(h.commits.length, 0);
});

test('entry detour retains the actual visit and teaching position without a write', () => {
  const h = harness();
  h.select('shapes'); h.click('kanji-course-learn'); h.click('kanji-course-teach-next');
  const visit = h.S.kanjiCourse;
  const door = h.byId('kanji-course-entry-word');
  h.click('kanji-course-entry-word');
  assert.deepEqual(h.navigations, [{ t: 'word', id: '林', reading: 'はやし' }]);
  assert.strictEqual(h.invokers[0], door);
  assert.strictEqual(h.S.kanjiCourse, visit);
  h.returnToLessons();
  assert.equal(visit.index, 1);
  assert.match(h.text, /Learn — 2 of 4/);
  assert.equal(h.commits.length, 0);
});

test('teaching shows reviewed gloss selections and alternate words without raw annotation artifacts', () => {
  const h = harness();
  h.select('marks'); h.click('kanji-course-learn');
  h.click('kanji-course-teach-next'); h.click('kanji-course-teach-next');
  assert.match(h.text, /Word meaning for this example: future/);
  assert.doesNotMatch(h.text, /life tense/);
  assert.match(h.text, /未定.*みてい.*not yet fixed/);
  assert.equal(h.course.getUnit('marks').targets[2].wordMeaning, 'future (life tense)');
  h.click('kanji-course-leave');
  h.select('word-readings'); h.click('kanji-course-learn');
  h.click('kanji-course-teach-next');
  assert.match(h.text, /Word meaning for this example: school/);
  h.click('kanji-course-teach-next');
  assert.match(h.text, /Word meaning for this example: before; ahead/);
  assert.match(h.text, /先生.*せんせい.*teacher/);
  assert.doesNotMatch(h.text, /recent, previous|teasing form of address/);
  assert.equal(h.commits.length, 0);
});

test('course menu leaves an unrelated lesson intact and resumes it only on explicit selection', () => {
  const h = harness();
  const previous = { lesson: 'other', cursor: 3, draft: 'kept' };
  h.S.lessonRun = previous;
  h.S.kanjiCourse = { stage: 'menu' }; h.draw();
  assert.match(h.text, /Resume the previous lesson/);
  h.select('shapes'); h.click('kanji-course-learn'); h.click('kanji-course-leave');
  assert.equal(h.S.kanjiCourse.stage, 'menu');
  assert.strictEqual(h.S.lessonRun, previous);
  h.click('kanji-course-other-lessons');
  assert.equal(h.S.kanjiCourse, null);
  assert.strictEqual(h.S.lessonRun, previous);
  assert.equal(h.commits.length, 0);
});

test('actual feedback distinguishes wrong, correct reading, revealed and skipped without exposing skipped answer', () => {
  const h = harness();
  h.select('shapes'); h.click('kanji-course-preview');
  assert.equal(h.S.kanjiCourse.run.mode, 'preview');
  const prompt = h.course.currentPrompt(h.S.kanjiCourse.run);
  h.click(`kanji-course-choice-${prompt.choices.find(choice => choice.id !== prompt.answerId).id}`);
  assert.match(h.text, /One to practise again/);
  assert.equal(h.S.kanjiCourse.feedback.result.status, 'wrong');
  h.click('kanji-course-next');
  h.submit('キ');
  assert.match(h.text, /Correct/);
  assert.equal(h.S.kanjiCourse.feedback.result.kind, 'reading');
  h.click('kanji-course-next'); h.click('kanji-course-reveal');
  assert.match(h.text, /Answer revealed/);
  assert.match(h.text, /Grove/);
  h.click('kanji-course-next'); h.click('kanji-course-skip');
  assert.match(h.text, /Skipped for now/);
  assert.doesNotMatch(h.text, /はやし/);
  h.click('kanji-course-next'); h.finish();
  assert.match(h.text, /Meaning recognition: 2 \/ 4/);
  assert.match(h.text, /Whole-word reading: 3 \/ 4/);
  assert.match(h.text, /1 incorrect · 1 revealed · 0 skipped/);
  assert.match(h.text, /0 incorrect · 0 revealed · 1 skipped/);
  assert.equal(h.commits.length, 0);
});

test('actual composition handlers hold submission until composition ends and retain drafts', () => {
  const h = harness();
  h.select('shapes'); h.click('kanji-course-preview'); h.click('kanji-course-choice-木'); h.click('kanji-course-next');
  const input = h.byId('kanji-course-answer');
  input.fire('compositionstart');
  input.value = 'き'; input.fire('input');
  assert.equal(h.S.kanjiCourse.draft, 'き');
  assert.equal(input.fire('keydown', { key: 'Enter', isComposing: true }).defaultPrevented, true);
  h.submit('き');
  assert.equal(h.S.kanjiCourse.run.cursor, 1);
  input.fire('compositionend');
  h.submit('き', { isComposing: true });
  assert.equal(h.S.kanjiCourse.run.cursor, 1);
  h.submit('き');
  assert.equal(h.S.kanjiCourse.run.cursor, 2);
  assert.equal(h.S.kanjiCourse.draft, '');
});

test('actual Keep callback builds one atomic delta against latest state and suppresses pending double-clicks', async () => {
  const h = checked();
  const button = h.byId('kanji-course-keep-result');
  button.fire('click');
  assert.equal(h.S.kanjiCourse.pending, true);
  button.fire('click', {}, true);
  assert.equal(h.commits.length, 1);
  assert.equal(h.byId('kanji-course-retake').disabled, true);
  assert.equal(h.record.obslog.length, 0);
  const priorSrs = h.record.srs, priorTaken = h.record.taken;
  h.record.obslog.push([9, 'note', 'op', 'Concurrent observation']);
  h.record.lessonsDone.other = { score: 1, total: 2, ts: 9 };
  h.commits[0].resolve(true); await tick();
  assert.deepEqual(Object.keys(h.commits[0].patch).sort(), ['lessonsDone', 'obslog']);
  assert.equal(h.record.obslog.length, 9);
  assert.equal(h.record.obslog[0][3], 'Concurrent observation');
  assert.equal(Object.keys(h.record.lessonsDone).length, 3);
  assert.strictEqual(h.record.srs, priorSrs);
  assert.strictEqual(h.record.taken, priorTaken);
  assert.equal(h.S.kanjiCourse.pending, false);
  assert.equal(h.S.kanjiCourse.saved, true);
  assert.match(h.text, /Practice result saved/);
  assert.ok(!h.elements.some(element => element.id === 'kanji-course-keep-result'));
});

test('failed ACK keeps unsaved session; retry reuses evidenceTime and deduplicates already-applied rows', async () => {
  const h = checked();
  h.click('kanji-course-keep-result');
  const time = h.S.kanjiCourse.evidenceTime;
  // Synthetic lost-ACK condition: persistence applied, caller receives false.
  h.commits[0].resolve(false, { apply: true }); await tick();
  assert.equal(h.S.kanjiCourse.saved, false);
  assert.equal(h.S.kanjiCourse.pending, false);
  assert.doesNotMatch(h.text, /Practice result saved/);
  assert.equal(h.record.obslog.length, 8);
  h.setNow(time + 10000); h.click('kanji-course-keep-result');
  assert.equal(h.S.kanjiCourse.evidenceTime, time);
  h.commits[1].resolve(true); await tick();
  assert.equal(h.record.obslog.length, 8);
  assert.equal(h.S.kanjiCourse.saved, true);
});

test('ordinary rejected write leaves record unchanged and allows a later successful Keep', async () => {
  const h = checked(), before = copy(h.record);
  h.click('kanji-course-keep-result'); h.commits[0].resolve(false); await tick();
  assert.deepEqual(h.record, before);
  assert.equal(h.S.kanjiCourse.saved, false);
  assert.ok(h.byId('kanji-course-keep-result'));
  h.click('kanji-course-keep-result'); h.commits[1].resolve(true); await tick();
  assert.equal(h.S.kanjiCourse.saved, true);
  assert.equal(h.record.obslog.length, 8);
});

test('navigation away during write preserves successful ACK on visit; return never offers duplicate Keep', async () => {
  const h = checked(), visit = h.S.kanjiCourse;
  h.click('kanji-course-keep-result');
  h.S.view = 'kanji'; h.draw();
  const rendersAway = h.renderCount;
  h.commits[0].resolve(true); await tick();
  assert.equal(visit.saved, true);
  assert.equal(h.renderCount, rendersAway, 'ACK does not redraw another view');
  h.returnToLessons();
  assert.strictEqual(h.S.kanjiCourse, visit);
  assert.match(h.text, /Practice result saved/);
  assert.ok(!h.elements.some(element => element.id === 'kanji-course-keep-result'));
  assert.equal(h.commits.length, 1);
  assert.equal(h.record.obslog.length, 8);
});

test('learner epoch change during write cannot mark old session saved or write into the new record', async () => {
  const h = checked(), visit = h.S.kanjiCourse;
  h.click('kanji-course-keep-result'); h.changeEpoch();
  const newRecord = copy(h.record);
  assert.match(h.text, /learner record changed/);
  h.commits[0].resolve(true); await tick();
  assert.equal(visit.saved, false);
  assert.deepEqual(h.record, newRecord);
  assert.ok(!h.elements.some(element => element.id === 'kanji-course-keep-result'));
});

test('replacement visit is not modified by old ACK', async () => {
  const h = checked(), old = h.S.kanjiCourse;
  h.click('kanji-course-keep-result');
  h.S.kanjiCourse = null; h.draw(); h.select('outlines');
  const replacement = h.S.kanjiCourse;
  h.commits[0].resolve(true); await tick();
  assert.equal(old.saved, false);
  assert.strictEqual(h.S.kanjiCourse, replacement);
  assert.equal(replacement.saved, false);
  assert.equal(replacement.stage, 'intro');
  assert.equal(replacement.unitId, 'outlines');
});

test('actual patch preserves newer full scores, exact-row dedupe and unrelated record data', () => {
  const h = checked(), evidence = h.course.toLessonEvidence(h.S.kanjiCourse.run, 1000);
  const id = h.course.lessonId('shapes', 'meaning');
  const newer = { score: 1, total: 4, ts: 2000 };
  const latest = { lessonsDone: { [id]: newer, other: { score: 2, total: 3, ts: 2 } },
    obslog: [copy(evidence.obslog[0]), [5, 'note', 'op', 'Retain me']], srs: { untouched: true } };
  const before = copy(latest);
  const patch = h.context.kanjiCourseEvidencePatch(latest, evidence);
  assert.deepEqual(latest, before);
  assert.deepEqual(copy(patch.lessonsDone[id]), newer);
  assert.equal(patch.obslog.length, 9);
  const repeated = h.context.kanjiCourseEvidencePatch({ ...latest, ...patch }, evidence);
  assert.deepEqual(copy(repeated), copy(patch));
  assert.deepEqual(Object.keys(patch).sort(), ['lessonsDone', 'obslog']);
});

test('repair requires original result ACK, contains only missed targets and retains full scores', async () => {
  const h = checked(['wrong']);
  assert.equal(h.byId('kanji-course-repair').disabled, true);
  assert.match(h.text, /Keep the original result to start repair/);
  h.click('kanji-course-repair');
  assert.equal(h.S.kanjiCourse.run.mode, 'preview');
  h.click('kanji-course-keep-result'); h.commits[0].resolve(true); await tick();
  const scores = copy(h.record.lessonsDone);
  h.click('kanji-course-repair');
  assert.equal(h.S.kanjiCourse.run.mode, 'repair');
  assert.deepEqual(copy(h.S.kanjiCourse.run.promptIds), ['shapes/木/meaning']);
  assert.equal(h.S.kanjiCourse.evidenceTime, null);
  h.finish();
  assert.match(h.text, /Repair practice keeps the original unit scores/);
  h.setNow(1760000005000);
  h.click('kanji-course-keep-result'); h.commits[1].resolve(true); await tick();
  assert.deepEqual(copy(h.record.lessonsDone), scores);
  assert.equal(h.record.obslog.length, 9);
  assert.ok(h.record.obslog.at(-1)[4].endsWith(':missed'));
});

test('all skipped/revealed results produce no write; reveals can repair without invented original answers', () => {
  const skipped = checked(Array(8).fill('skip'));
  skipped.click('kanji-course-keep-result');
  assert.equal(skipped.commits.length, 0);
  assert.equal(skipped.S.kanjiCourse.saved, false);
  assert.match(skipped.text, /Unanswered items are not recorded/);
  assert.ok(!skipped.elements.some(element => element.id === 'kanji-course-repair'));
  const revealed = checked(Array(8).fill('reveal'));
  assert.equal(revealed.byId('kanji-course-repair').disabled, false);
  revealed.click('kanji-course-keep-result');
  assert.equal(revealed.commits.length, 0);
  revealed.click('kanji-course-repair');
  assert.equal(revealed.S.kanjiCourse.run.mode, 'repair');
  assert.equal(revealed.S.kanjiCourse.run.promptIds.length, 8);
});

test('family teaches retained examples then presents ordinary-text checks without reading aids', () => {
  const h = harness();
  h.select('shiki-shoku');
  assert.match(h.text, /Choose 3 character keywords.*3 whole-word readings/);
  assert.doesNotMatch(h.text, /しょくぎょう|ちしき|そしき|彼の職業/);
  h.click('kanji-course-learn');
  assert.match(h.text, /職業.*しょくぎょう/);
  assert.match(h.text, /彼の職業は医師だ。/);
  h.click('kanji-course-teach-next');
  assert.match(h.text, /知識は力なり。.*literary set saying/);
  h.click('kanji-course-teach-next'); h.click('kanji-course-teach-next');
  assert.equal(h.S.kanjiCourse.run.schemaVersion, 2);
  assert.equal(h.course.currentPrompt(h.S.kanjiCourse.run).kind, 'meaning');
  assert.equal(h.elements.some(element => ['RUBY', 'SVG'].includes(element.tagName)), false);
  assert.doesNotMatch(h.text, /しょくぎょう|ちしき|そしき/);
  h.click('kanji-course-choice-職');
  assert.match(h.text, /Review recording.*unavailable.*Practice still works/);
  assert.equal(h.elements.some(element => element.id.startsWith('kanji-course-self-')), false);
  h.click('kanji-course-next');
  assert.match(h.text, /Type the whole word’s reading in kana/);
  assert.doesNotMatch(h.text, /しょくぎょう/);
  assert.equal(h.commits.length, 0);
});

test('family teaching, choices and answer feedback share display keywords in both languages', () => {
  const labels = { 職: 'Job; position', 識: 'Knowing; awareness', 織: 'Weave', 木: 'Tree' };
  for (const language of ['ja', 'en']) {
    const h = harness({ language });
    h.select('shiki-shoku');
    assert.doesNotMatch(h.text, /Job; position|Knowing; awareness|Post|Discriminating/);
    h.click('kanji-course-learn');
    for (const target of ['職', '識', '織']) {
      const keyword = h.elements.find(element => element.className === 'review-sense');
      assert.equal(keyword.textContent, `${language === 'ja' ? 'この練習の漢字キーワード' : 'Character keyword for this check'}: ${labels[target]}`);
      if (target === '識') {
        assert.ok(h.elements.some(element => element.textContent ===
          (language === 'ja' ? '文語調の格言です。' : 'A literary set saying.')));
        assert.doesNotMatch(h.text, /文語の慣用表現です。/);
      }
      h.click('kanji-course-teach-next');
    }
    while (!h.S.kanjiCourse.run.complete) {
      const prompt = h.course.currentPrompt(h.S.kanjiCourse.run);
      if (prompt.kind === 'meaning') {
        for (const [id, label] of Object.entries(labels)) assert.equal(h.byId(`kanji-course-choice-${id}`).textContent, label);
        assert.doesNotMatch(h.text, /Post|Discriminating/);
        h.click(`kanji-course-choice-${prompt.targetId}`);
        assert.ok(h.elements.some(element => element.className === 'review-sense' &&
          element.textContent === labels[prompt.targetId]));
      } else h.submit(prompt.acceptedAnswers[0]);
      h.click('kanji-course-next');
    }
    assert.equal(h.course.summary(h.S.kanjiCourse.run).correct, 6);
    assert.equal(h.commits.length, 0);
  }
});

test('family hook is explicit, once per attempt, after response and feedback; no schedule writer is called', async () => {
  const h = harness(), calls = [];
  let finish;
  h.context.window.__KAIRO_HOOKS__ = { report: evidence => {
    calls.push(evidence); return new Promise(resolve => { finish = resolve; });
  } };
  h.select('shiki-shoku'); h.click('kanji-course-preview');
  h.setNow(1000); h.click('kanji-course-choice-職');
  assert.equal(calls.length, 0, 'response and feedback alone do not grade');
  const knew = h.byId('kanji-course-self-knew');
  h.setNow(1010); knew.fire('click'); knew.fire('click', {}, true);
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.deepEqual(copy(call.item), { kind: 'kanji', literal: '職' });
  assert.equal(call.surface, 'course:kanji-shiki-shoku-r1');
  assert.equal(call.tests, 'meaning');
  assert.equal(call.answeredAt, 1000);
  assert.equal(call.at.getTime(), 1010);
  assert.deepEqual(copy(call.help), []);
  assert.deepEqual(copy(call.answer), { selfCheck: 'knew' });
  assert.equal(call.revealed, true);
  assert.equal(h.byId('kanji-course-next').disabled, true);
  finish({ write: true, rating: 3, from: 3, capped: false }); await tick();
  assert.match(h.text, /Recorded for review \(rating 3\)/);
  h.draw(); knew.fire('click', {}, true);
  assert.equal(calls.length, 1, 'repaint/stale event cannot send again');
  assert.equal(h.commits.length, 0, 'W3 does not write a grade through course storage');
  assert.deepEqual(h.record.srs, {}); assert.deepEqual(h.record.revlog, []);
});

test('dictionary assistance is retained on the exact word attempt and precedes its answer cutoff', async () => {
  const h = harness(), calls = [];
  h.context.window.__KAIRO_HOOKS__ = { report: async evidence => {
    calls.push(copy(evidence)); return { write: false, reason: 'not-due' };
  } };
  h.select('shiki-shoku'); h.click('kanji-course-preview');
  h.click('kanji-course-skip'); h.click('kanji-course-next');
  h.setNow(2000); h.click('kanji-course-entry-word');
  assert.deepEqual(h.navigations[0], { t: 'word', id: '職業', reading: 'しょくぎょう' });
  h.returnToLessons();
  assert.match(h.text, /Help recorded for this check: 1/);
  h.setNow(2010); h.submit('しょくぎょう');
  assert.match(h.text, /Help was used/);
  h.setNow(2020); h.click('kanji-course-self-knew'); await tick();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].item, { kind: 'word', term: '職業', reading: 'しょくぎょう' });
  assert.deepEqual(calls[0].help, [{ what: 'dictionary-entry',
    about: { kind: 'word', term: '職業', reading: 'しょくぎょう' },
    reveals: ['reading', 'meaning', 'form'], at: 2000 }]);
  assert.equal(calls[0].answeredAt, 2010);
  assert.match(h.text, /not due.*unchanged/);
  assert.equal(h.commits.length, 0);
});

test('family reveal, skip, known-wrong answer and absent hook cannot manufacture a successful grade', async () => {
  const h = harness(), calls = [];
  h.context.window.__KAIRO_HOOKS__ = { report: async value => {
    calls.push(value); return { write: false, reason: 'no-schedule' };
  } };
  h.select('shiki-shoku'); h.click('kanji-course-preview');
  h.click('kanji-course-reveal');
  assert.equal(h.elements.some(element => element.id.startsWith('kanji-course-self-')), false);
  h.click('kanji-course-next'); h.click('kanji-course-skip');
  assert.equal(h.elements.some(element => element.id.startsWith('kanji-course-self-')), false);
  h.click('kanji-course-next');
  const prompt = h.course.currentPrompt(h.S.kanjiCourse.run);
  h.click(`kanji-course-choice-${prompt.choices.find(row => row.id !== prompt.answerId).id}`);
  assert.equal(h.elements.some(element => element.id === 'kanji-course-self-knew'), false);
  assert.equal(calls.length, 0);
  h.click('kanji-course-self-missed'); await tick();
  assert.deepEqual(copy(calls[0].answer), { selfCheck: 'missed' });
  assert.match(h.text, /no active review card.*practice/);
  assert.equal(h.commits.length, 0);
});

test('uncertain hook result is terminal and stale owner does not receive its confirmation', async () => {
  const h = harness(); let reject; let calls = 0;
  h.context.window.__KAIRO_HOOKS__ = { report: () => {
    calls++; return new Promise((_resolve, failure) => { reject = failure; });
  } };
  h.select('shiki-shoku'); h.click('kanji-course-preview'); h.click('kanji-course-choice-職');
  const visit = h.S.kanjiCourse, attemptId = visit.feedback.result.attemptId;
  h.click('kanji-course-self-knew');
  h.changeEpoch(); const renders = h.renderCount;
  reject(new Error('unknown publication')); await tick();
  assert.equal(h.renderCount, renders, 'old owner outcome cannot repaint current owner');
  assert.equal(visit.hookOutcomes[attemptId].reason, 'publish-uncertain');
  assert.equal(visit.pending, false);
  await h.context.reportKanjiCourseAttempt(visit, attemptId, 'knew');
  assert.equal(calls, 1);
  assert.deepEqual(h.record.srs, {});
});

test('reader, Atlas and review family word doors preserve the exact caller and never invent source admission', () => {
  const family = JSON.parse(read('../data/share_alike/kanji-family.json'));
  for (const view of ['reader', 'levels', 'review']) {
    const h = routeHarness(), example = family.examples[1], S = h.S;
    const review = { ix: 2, queue: [{ t: 'word', id: example.word.id }], revealed: false };
    S.review = review; S.view = view;
    S.lessonRun = { id: 'kept-old-lesson', draft: 'old draft' };
    const lesson = S.lessonRun;
    const origin = { t: 'word', id: example.word.id, reading: example.word.reading,
      ...(view === 'levels' ? { referenceEntry: { type: 'word', id: example.word.id, reading: example.word.reading } }
        : { from: { passage: 'retained-example', index: example.tokenIndex },
          sourceContext: { occurrenceId: example.reference.id, sentence: example.sentence } }) };
    const before = copy(origin);
    h.openContext(origin);
    assert.equal(S.kanjiCourse.unitId, 'shiki-shoku');
    const visit = S.kanjiCourse;
    h.click('kanji-course-practise');
    assert.ok(h.course.currentAttempt(visit.run).help.length > 0, 'entry exposure is explicit help');
    const target = h.course.getUnit('shiki-shoku').targets.find(row => row.kanji === '識');
    const outbound = h.context.kanjiCourseEntryNode(visit, target, 'word');
    assert.deepEqual(copy(outbound), before, 'only the exact word/reading retains caller provenance');
    const other = h.course.getUnit('shiki-shoku').targets.find(row => row.kanji === '織');
    assert.deepEqual(copy(h.context.kanjiCourseEntryNode(visit, other, 'word')),
      { t: 'word', id: '組織', reading: 'そしき' });
    h.click('kanji-course-source-return');
    assert.strictEqual(S.stack.at(-1), origin);
    assert.equal(S.view, view);
    assert.strictEqual(S.review, review); assert.strictEqual(S.lessonRun, lesson);
    assert.deepEqual(copy(origin), before);
    assert.equal(h.commits.length, 0);
    assert.deepEqual(h.record.srs, {});
  }
});

test('wrong or absent word reading cannot expose a family course door', () => {
  const h = harness();
  for (const node of [{ t: 'word', id: '知識' }, { t: 'word', id: '知識', reading: 'ししき' },
    { t: 'part', id: '戠' }, { t: 'word', id: '織物', reading: 'おりもの' }]) {
    const sheet = new Element('section');
    h.context.renderKanjiCourseDoor(sheet, node);
    assert.equal(sheet.children.length, 0);
  }
});

test('teaching and earlier feedback remain help across plain checks and a full retake', () => {
  const h = harness(); h.select('shiki-shoku');
  h.click('kanji-course-learn');
  for (let i = 0; i < 3; i++) h.click('kanji-course-teach-next');
  let attempt = h.course.currentAttempt(h.S.kanjiCourse.run);
  assert.ok(attempt.help.some(row => row.what === 'teaching-card' && row.about.literal === '職' && row.reveals.includes('meaning')));
  assert.ok(attempt.help.some(row => row.about.term === '職業' && row.reveals.includes('reading')));
  h.finish();
  const completed = h.S.kanjiCourse.run;
  const first = h.course.summary(completed).results[0];
  assert.equal(first.assisted, true);
  assert.equal(first.help.some(row => row.what === 'answer-feedback' && row.about.literal === '職'), false,
    'same-millisecond feedback is not pre-answer help on its own response');
  h.click('kanji-course-retake');
  attempt = h.course.currentAttempt(h.S.kanjiCourse.run);
  assert.notEqual(h.S.kanjiCourse.run.sessionId, completed.sessionId);
  assert.ok(attempt.help.some(row => row.what === 'answer-feedback' && row.about.literal === '職'),
    'retake does not erase already shown answer');
  assert.equal(h.commits.length, 0);
});

test('assisted family results save only the separate practice buckets and preserve schedule/card roots', async () => {
  const h = harness(); h.select('shiki-shoku'); h.click('kanji-course-learn');
  for (let i = 0; i < 3; i++) h.click('kanji-course-teach-next');
  h.finish();
  h.click('kanji-course-keep-result');
  assert.equal(h.commits.length, 1);
  h.commits[0].resolve(true); await tick();
  const keys = Object.keys(h.record.lessonsDone);
  assert.deepEqual(keys.sort(), [
    'kanji-foundations-24:r4:shiki-shoku:meaning:assisted',
    'kanji-foundations-24:r4:shiki-shoku:reading:assisted',
  ]);
  assert.equal(h.record.obslog.length, 6);
  assert.ok(h.record.obslog.every(row => row[1] === 'lesson' && row[4].endsWith(':assisted')));
  assert.deepEqual(h.record.srs, {}); assert.deepEqual(h.record.taken, []); assert.deepEqual(h.record.revlog, []);
  h.click('kanji-course-leave');
  assert.match(h.text, /with help 3\/3/);
});
