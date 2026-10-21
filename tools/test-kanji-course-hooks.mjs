/**
 * Source-only integration of the authored first-family UI, kanji-course, the
 * installed corridor hook, srs-core and pinned FSRS. The course never receives a
 * fabricated grading result. A pass-through spy counts real adapter calls.
 *
 * Reuses the hooks verifier's record/storage/Web Lock doubles. The DOM below
 * models explicit events and visible text only. These checks do not establish
 * native rendering, focus/IME behavior or IndexedDB/Web Lock durability.
 */
import assert from 'node:assert/strict';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { setImmediate } from 'node:timers';
import { URL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import * as core from '../prototypes/corridor/srs-core.mjs';
import * as fsrsApi from '../prototypes/corridor/vendor/ts-fsrs.mjs';
import {
  corridorSandbox,
  liftCorridor,
} from '../prototypes/corridor/tools/srs-hooks-corridor-layer.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const source = read('../prototypes/corridor/corridor.js');
const courseSource = read('../prototypes/corridor/kanji-course.js');
const pinSource = read('../prototypes/corridor/data/fsrs-pin.json');
const pin = JSON.parse(pinSource);
const ast = ts.createSourceFile(
  'corridor.js',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.JS,
);
const names = [
  'kanjiCourseNodeUnit',
  'kanjiCourseApplyHelp',
  'kanjiCourseRememberHelp',
  'kanjiCourseTeachingHelp',
  'kanjiCourseReferenceHelp',
  'kanjiCourseHookLine',
  'reportKanjiCourseAttempt',
  'kanjiCourseEvidencePatch',
  'kanjiCourseReturnFrame',
  'kanjiCourseEntryNode',
  'renderKanjiCourseMenu',
  'renderKanjiCourse',
];
const courseProgram = names
  .map((name) => {
    const node = ast.statements.find(
      (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name,
    );
    assert.ok(node, `authored function ${name}`);
    return node.getText(ast);
  })
  .join('\n');
const installation = ast.statements.find(
  (statement) =>
    ts.isExpressionStatement(statement) &&
    ts.isBinaryExpression(statement.expression) &&
    statement.expression.left.getText(ast) === 'window.__KAIRO_HOOKS__',
);
assert.ok(installation, 'authored hook installation');
const hookProgram = liftCorridor(source);
const sha = (value) => createHash('sha256').update(value).digest('hex');
console.log(
  JSON.stringify({
    scope:
      'pure authored course-to-real-hook integration; synthetic DOM, record app, storage and Web Locks',
    corridorSha256: sha(source),
    courseSha256: sha(courseSource),
    coreSha256: sha(read('../prototypes/corridor/srs-core.mjs')),
    fsrsSha256: sha(read('../prototypes/corridor/vendor/ts-fsrs.mjs')),
    pinSha256: sha(pinSource),
    liftedCourseSha256: sha(courseProgram),
    liftedHookSha256: sha(hookProgram),
    hookInstallationSha256: sha(installation.getText(ast)),
  }),
);

const copy = (value) => JSON.parse(JSON.stringify(value));
const tick = () => new Promise((resolve) => setImmediate(resolve));
const scheduler = core.createScheduler(fsrsApi, pin);
const base = new Date('2026-10-10T09:00:00+09:00');
let dueCard = fsrsApi.createEmptyCard(base);
for (const offset of [0, 600000])
  dueCard = scheduler.next(dueCard, new Date(+base + offset), 3).card;
const dueAt = +new Date(dueCard.due) + 3600000;
const entries = [
  ['職', '職業', 'しょくぎょう'],
  ['識', '知識', 'ちしき'],
  ['織', '組織', 'そしき'],
];
const dict = Object.fromEntries(
  entries.map(([, word, reading]) => [word, { r: reading, m: ['retained word meaning'] }]),
);
const record = () => ({
  taken: entries.flatMap(([literal, term]) => [
    { t: 'kanji', id: literal, started: 1 },
    { t: 'word', id: term, started: 1 },
  ]),
  srs: Object.fromEntries(
    entries.flatMap(([literal, term]) => [
      [`kanji:${literal}`, copy(dueCard)],
      [`word:${term}`, copy(dueCard)],
    ]),
  ),
  revlog: [],
  obslog: [],
  lessonsDone: {},
  stats: {},
  suspended: {},
  deepWords: {},
});

class Element {
  constructor(tag, className = '', text = '') {
    Object.assign(this, {
      tagName: tag.toUpperCase(),
      className,
      text: String(text),
      children: [],
      dataset: {},
      attributes: {},
      events: new Map(),
      id: '',
      value: '',
      disabled: false,
      isConnected: true,
    });
  }
  append(...children) {
    this.children.push(...children);
  }
  setAttribute(key, value) {
    this.attributes[key] = String(value);
  }
  getAttribute(key) {
    return this.attributes[key] ?? null;
  }
  addEventListener(type, listener) {
    this.events.set(type, [...(this.events.get(type) || []), listener]);
  }
  focus() {
    this.focused = true;
  }
  get textContent() {
    return (
      this.text +
      this.children
        .map((child) => (child instanceof Element ? child.textContent : String(child)))
        .join('')
    );
  }
  fire(type, force = false) {
    if (type === 'click' && this.disabled && !force) return;
    for (const listener of this.events.get(type) || [])
      listener({ target: this, preventDefault() {} });
  }
}
const descendants = (node) => [
  node,
  ...node.children.filter((child) => child instanceof Element).flatMap(descendants),
];

function harness({ learner = record() } = {}) {
  let now = dueAt,
    main = new Element('main'),
    renders = 0;
  const h = corridorSandbox(hookProgram, {
    core,
    fsrsApi,
    pin,
    record: learner,
    dict,
    clock: () => new Date(now),
  });
  const { sandbox: context, S, box } = h;
  // The existing adapter harness exposes host intrinsics. Restore the VM's own
  // Object/JSON/Array so the course's plain-object validation sees the same
  // realm for object literals and JSON clones, as it does in the browser.
  delete context.Object;
  delete context.JSON;
  delete context.Array;
  const calls = [];
  Object.assign(S, {
    view: 'lessons',
    stack: [],
    navigationReturns: [],
    kanjiCourse: null,
    lessonsDone: learner.lessonsDone,
  });
  Object.assign(context, {
    el: (tag, cls, text) => new Element(tag, cls, text),
    biLabel: (tag, cls, _ja, en) => new Element(tag, cls, en),
    tx: (_ja, en) => en,
    document: {
      getElementById: (id) => descendants(main).find((element) => element.id === id) || null,
    },
    render: draw,
    go: (node) => {
      context.kanjiCourseReferenceHelp(S.kanjiCourse, node);
      S.view = node.t;
      draw();
    },
    returnFromNavigation: () => {
      throw new Error('no synthetic return frame was created');
    },
    __hookCalls: calls,
  });
  // Count calls without manufacturing or changing the adapter's decisions. The
  // actual assignment below still installs that adapter through the product seam.
  vm.runInContext(
    `const originalHookReport = reportHookAttempt;
    reportHookAttempt = function (evidence) { __hookCalls.push(evidence); return originalHookReport(evidence); };
    ${installation.getText(ast)}\n${courseSource}\nwindow.BunkiKanjiCourse = BunkiKanjiCourse;\n${courseProgram}`,
    context,
  );
  assert.equal(Object.isFrozen(context.window.__KAIRO_HOOKS__), true);
  assert.equal(context.window.__KAIRO_HOOKS__.report, context.reportHookAttempt);
  function draw() {
    main = new Element('main');
    renders++;
    S.lessonsDone = box.record.lessonsDone;
    if (S.view !== 'lessons') return;
    if (S.kanjiCourse) context.renderKanjiCourse(main);
    else context.renderKanjiCourseMenu(main);
  }
  const byId = (id) => {
    const found = descendants(main).find((element) => element.id === id);
    assert.ok(found, `rendered #${id}: ${main.textContent}`);
    return found;
  };
  draw();
  return Object.assign(h, {
    context,
    calls,
    draw,
    byId,
    getText: () => main.textContent,
    elements: () => descendants(main),
    renders: () => renders,
    now: () => now,
    advance: (ms = 10) => {
      now += ms;
    },
    course: context.window.BunkiKanjiCourse,
    click(id) {
      byId(id).fire('click');
    },
    open(mode = 'preview') {
      const row = descendants(main).find(
        (element) => element.dataset.kanjiCourseUnit === 'shiki-shoku',
      );
      assert.ok(row);
      row.fire('click');
      this.click(`kanji-course-${mode}`);
    },
    submit(value) {
      const input = byId('kanji-course-answer');
      input.value = value;
      input.fire('input');
      const form = descendants(main).find((element) => element.tagName === 'FORM');
      assert.ok(form);
      form.fire('submit');
    },
    answer(wrong = false) {
      const prompt = this.course.currentPrompt(S.kanjiCourse.run);
      this.advance();
      if (prompt.kind === 'meaning')
        this.click(
          `kanji-course-choice-${
            wrong
              ? prompt.choices.find((choice) => choice.id !== prompt.answerId).id
              : prompt.answerId
          }`,
        );
      else this.submit(wrong ? 'ちがう' : prompt.acceptedAnswers[0]);
    },
    async selfCheck(choice = 'knew') {
      this.advance();
      this.click(`kanji-course-self-${choice}`);
      await tick();
      assert.equal(S.kanjiCourse.pending, false, 'real adapter settled');
      return S.kanjiCourse.hookOutcomes[S.kanjiCourse.feedback.result.attemptId];
    },
    async direct(candidate) {
      return context.window.__KAIRO_HOOKS__.report(candidate);
    },
  });
}

function assertGrade(h, key, rating, at, previous = dueCard) {
  const expected = h.scheduler.repeat(previous, new Date(at))[rating].card;
  assert.deepEqual(
    copy(h.box.record.srs[key]),
    copy(expected),
    'stored card equals the actual pinned scheduler result',
  );
  assert.equal(h.box.record.revlog.at(-1)[2], rating);
}

test('six-step family reaches the real scheduler only on explicit checks; practice evidence stays separate', async () => {
  const h = harness(),
    originalTaken = copy(h.box.record.taken);
  h.open();
  const expected = [3, 2, 2, 2, 2, 2];
  const keys = ['kanji:職', 'word:職業', 'kanji:識', 'word:知識', 'kanji:織', 'word:組織'];
  for (let index = 0; index < 6; index++) {
    h.answer();
    assert.equal(h.calls.length, index, 'answer and feedback alone never grade');
    assert.equal(h.box.writes, index);
    const outcome = await h.selfCheck();
    assert.deepEqual(copy(outcome), {
      write: true,
      rating: expected[index],
      from: 3,
      capped: index > 0,
    });
    assertGrade(h, keys[index], expected[index], h.now());
    assert.match(
      h.byId('kanji-course-review-status').textContent,
      new RegExp(`rating ${expected[index]}`),
    );
    assert.equal(h.box.record.obslog.length, 0, 'hook writes no course evidence');
    h.click('kanji-course-next');
  }
  assert.equal(h.S.kanjiCourse.run.complete, true);
  assert.equal(h.course.summary(h.S.kanjiCourse.run).correct, 6);
  assert.match(h.getText(), /Meaning recognition: 3 \/ 3.*Whole-word reading: 3 \/ 3/);
  const scheduled = copy(h.box.record.srs),
    reviewLog = copy(h.box.record.revlog);
  h.click('kanji-course-keep-result');
  await tick();
  assert.equal(h.S.kanjiCourse.saved, true);
  assert.equal(h.box.record.obslog.length, 6);
  assert.deepEqual(copy(h.box.record.srs), scheduled);
  assert.deepEqual(copy(h.box.record.revlog), reviewLog);
  assert.deepEqual(h.box.record.taken, originalTaken);
  assert.equal(h.calls.length, 6);
  assert.equal(h.box.writes, 7, 'six review writes and one separate course result');
});

test('teaching that showed the answer grades Again through the real hook', async () => {
  const h = harness();
  h.open('learn');
  for (let index = 0; index < 3; index++) {
    h.advance();
    h.click('kanji-course-teach-next');
  }
  h.answer();
  assert.match(h.getText(), /Help was used/);
  const result = await h.selfCheck();
  assert.deepEqual(copy(result), { write: true, rating: 1, from: 3, capped: true });
  assertGrade(h, 'kanji:職', 1, h.now());
  assert.ok(
    h.calls[0].help.some((help) => help.what === 'teaching-card' && help.about.literal === '職'),
  );
});

test('opening the exact word entry before recall records answer help and grades Again', async () => {
  const h = harness();
  h.open();
  h.click('kanji-course-skip');
  h.click('kanji-course-next');
  h.advance();
  h.click('kanji-course-entry-word');
  h.S.view = 'lessons';
  h.draw();
  h.answer();
  const result = await h.selfCheck();
  assert.equal(result.rating, 1);
  assertGrade(h, 'word:職業', 1, h.now());
  assert.deepEqual(copy(h.calls[0].help[0].about), {
    kind: 'word',
    term: '職業',
    reading: 'しょくぎょう',
  });
  assert.equal(h.calls[0].help[0].what, 'dictionary-entry');
});

test('feedback about another item is retained as other help and caps the next success at Hard', async () => {
  const h = harness();
  h.open();
  h.answer();
  h.click('kanji-course-next');
  h.answer();
  const result = await h.selfCheck();
  assert.deepEqual(copy(result), { write: true, rating: 2, from: 3, capped: true });
  assertGrade(h, 'word:職業', 2, h.now());
  assert.ok(
    h.calls[0].help.some((help) => help.what === 'answer-feedback' && help.about.literal === '職'),
  );
  assert.equal(h.box.record.revlog.length, 1, 'first answer was never self-checked');
});

test('opening, teaching, revealing, skipping, answering without self-check and leaving write nothing', () => {
  const h = harness(),
    before = copy(h.box.record);
  h.open();
  h.click('kanji-course-reveal');
  h.click('kanji-course-next');
  h.click('kanji-course-skip');
  h.click('kanji-course-next');
  h.answer();
  h.click('kanji-course-next');
  h.click('kanji-course-leave');
  assert.deepEqual(h.box.record, before);
  assert.equal(h.box.writes, 0);
  assert.equal(h.calls.length, 0);
  assert.equal(h.storage.getItem(core.ANSWERED_KEY), null);
  const taught = harness();
  taught.open('learn');
  for (let index = 0; index < 3; index++) taught.click('kanji-course-teach-next');
  taught.click('kanji-course-leave');
  assert.equal(taught.box.writes, 0);
  assert.equal(taught.calls.length, 0);
});

test('known-wrong response rejects knew; explicit missed can only produce Again', async () => {
  const h = harness();
  h.open();
  h.answer(true);
  const visit = h.S.kanjiCourse,
    id = visit.feedback.result.attemptId;
  assert.equal(
    h.elements().some((element) => element.id === 'kanji-course-self-knew'),
    false,
  );
  await assert.rejects(
    h.context.reportKanjiCourseAttempt(visit, id, 'knew'),
    /course-self-check-invalid/,
  );
  assert.equal(h.calls.length, 0);
  assert.equal(h.box.writes, 0);
  assert.equal((await h.selfCheck('missed')).rating, 1);
  assertGrade(h, 'kanji:職', 1, h.now());
});

test('pending and stale clicks do not call twice; the real hook also refuses a duplicate candidate', async () => {
  const h = harness();
  h.open();
  h.answer();
  const staleButton = h.byId('kanji-course-self-knew');
  const release = h.locks.hold();
  h.advance();
  staleButton.fire('click');
  staleButton.fire('click', true);
  assert.equal(h.calls.length, 1);
  assert.equal(h.S.kanjiCourse.pending, true);
  assert.equal(h.byId('kanji-course-next').disabled, true);
  release();
  await tick();
  assert.equal(h.box.writes, 1);
  h.draw();
  staleButton.fire('click', true);
  await tick();
  assert.equal(h.calls.length, 1, 'old event handlers cannot resend');
  const duplicate = await h.direct(h.calls[0]);
  assert.equal(duplicate.write, false);
  assert.equal(duplicate.reason, 'answered-today');
  assert.equal(h.box.writes, 1);
  assert.equal(h.box.record.revlog.length, 1);
});

test('a word answered through the course is refused again across another hook surface', async () => {
  const h = harness();
  h.open();
  h.click('kanji-course-skip');
  h.click('kanji-course-next');
  h.answer();
  assert.equal((await h.selfCheck()).rating, 3);
  const marks = core.answeredToday(h.storage, new Date(h.now()));
  assert.ok(marks[core.wordIdentity('職業', 'しょくぎょう')].length > 0);
  const duplicate = await h.direct({ ...h.calls[0], surface: 'quest:another-surface' });
  assert.equal(duplicate.reason, 'answered-today');
  assert.equal(duplicate.write, false);
  assert.equal(h.box.writes, 1);
  assert.equal(h.box.record.revlog.length, 1);
});

test('no-card refusal is visible and leaves practice available without minting cards', async () => {
  const learner = record();
  learner.taken = [];
  learner.srs = {};
  const h = harness({ learner });
  h.open();
  h.answer();
  const result = await h.selfCheck();
  assert.equal(result.reason, 'no-schedule');
  assert.equal(result.write, false);
  assert.equal(
    h.byId('kanji-course-review-status').textContent,
    h.context.kanjiCourseHookLine(result),
  );
  // HOOKS r8 §4 (C2): srs-core's approved no-schedule line
  assert.ok(
    h.getText().includes(core.refusalWords('no-schedule', 'en')),
    h.getText(),
  );
  assert.equal(h.box.writes, 0);
  assert.deepEqual(h.box.record.srs, {});
  h.click('kanji-course-next');
  assert.equal(h.course.currentPrompt(h.S.kanjiCourse.run).kind, 'reading');
});

test('not-due refusal is visible, preserves the exact card and allows the next check', async () => {
  const learner = record();
  learner.srs['kanji:職'].due = new Date(dueAt + 86400000).toISOString();
  const h = harness({ learner }),
    before = copy(h.box.record);
  h.open();
  h.answer();
  const result = await h.selfCheck();
  assert.equal(result.reason, 'not-due');
  assert.equal(result.write, false);
  assert.equal(
    h.byId('kanji-course-review-status').textContent,
    h.context.kanjiCourseHookLine(result),
  );
  assert.ok(
    h.getText().includes(core.refusalWords('not-due', 'en')),
    h.getText(),
  );
  assert.deepEqual(h.box.record, before);
  assert.equal(h.box.writes, 0);
  h.click('kanji-course-next');
  assert.equal(h.course.currentPrompt(h.S.kanjiCourse.run).kind, 'reading');
});

test('unknown publication leaves a terminal visible receipt and never retries the original attempt', async () => {
  const h = harness();
  h.box.mode = 'recovery-unknown';
  h.open();
  h.answer();
  const staleButton = h.byId('kanji-course-self-knew');
  const result = await h.selfCheck();
  assert.equal(result.reason, 'publish-uncertain');
  assert.equal(result.write, false);
  assert.equal(
    h.byId('kanji-course-review-status').textContent,
    h.context.kanjiCourseHookLine(result),
  );
  assert.match(h.getText(), /could not be confirmed|cannot confirm|couldn.t confirm/i);
  h.draw();
  staleButton.fire('click', true);
  await tick();
  const visit = h.S.kanjiCourse;
  await h.context.reportKanjiCourseAttempt(visit, visit.feedback.result.attemptId, 'knew');
  assert.equal(h.calls.length, 1);
  assert.equal(visit.pending, false);
  assert.equal(h.box.writes, 0);
  h.click('kanji-course-next');
  assert.equal(h.course.currentPrompt(visit.run).kind, 'reading');
});

test('owner replacement while waiting for the shared lock cannot write or repaint the new learner', async () => {
  const h = harness();
  h.open();
  h.answer();
  const release = h.locks.hold(),
    visit = h.S.kanjiCourse;
  h.click('kanji-course-self-knew');
  assert.equal(h.calls.length, 1);
  assert.equal(visit.pending, true);
  h.context.recordEpoch++;
  const nextOwner = record();
  nextOwner.srs = {};
  nextOwner.taken = [];
  h.box.record = copy(nextOwner);
  h.draw();
  const rendered = h.renders();
  assert.match(h.getText(), /learner record changed/);
  release();
  await tick();
  assert.equal(visit.pending, false);
  assert.equal(h.renders(), rendered);
  assert.deepEqual(h.box.record, nextOwner);
  assert.equal(h.box.writes, 0);
  assert.equal(visit.hookOutcomes[visit.feedback.result.attemptId].write, false);
  await h.context.reportKanjiCourseAttempt(visit, visit.feedback.result.attemptId, 'knew');
  assert.equal(h.calls.length, 1);
});
