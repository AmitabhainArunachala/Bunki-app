import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../corridor.js', import.meta.url), 'utf8');
const control = source.slice(source.indexOf('function strokeSpeedControl('), source.indexOf('/** The honest room:', source.indexOf('function strokeSpeedControl(')));
const speed = source.slice(source.indexOf("const STROKE_SPEED_KEY ="), source.indexOf('function stopInkRoom(', source.indexOf("const STROKE_SPEED_KEY =")));
function fixture(stored) {
  const memory = new Map(stored == null ? [] : [['kairo-stroke-speed-v1', stored]]), rewrites = [], fallback = [];
  const context = {
    S: {}, tx: (_ja, en) => en,
    localStorage: { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) },
    inkRoom: { handle: { rewrite: options => rewrites.push(options) } },
    startStrokeAnimation: page => fallback.push(page),
    el(tagName, className, textContent = '') {
      return { tagName, className, textContent, children: [], attributes: {}, handlers: {},
        append(...children) { this.children.push(...children); },
        setAttribute(key, value) { this.attributes[key] = value; },
        addEventListener(type, handler) { this.handlers[type] = handler; } };
    },
  };
  vm.createContext(context);
  vm.runInContext(`${speed}\n${control}\nthis.control = strokeSpeedControl; this.speed = strokeSpeed;`, context);
  return { context, memory, rewrites, fallback };
}

test('A fresh writing room has one three-position slider at Normal; both renderers obey changed speed', () => {
  const f = fixture();
  const page = { dataset: { living: 'on' } };
  const control = f.context.control(page), range = control.children.find(child => child.tagName === 'input');
  assert.equal(control.children.filter(child => child.tagName === 'input').length, 1);
  assert.equal(control.children.filter(child => child.tagName === 'button').length, 0);
  assert.equal(range.min, '0'); assert.equal(range.max, '2'); assert.equal(range.step, '1');
  assert.equal(range.value, '1'); assert.equal(range.attributes['aria-valuetext'], 'Normal');
  range.value = '0'; range.handlers.input(); range.handlers.change();
  assert.equal(f.memory.get('kairo-stroke-speed-v1'), '0.7'); assert.equal(f.rewrites[0].speed, 0.7);
  page.dataset.living = 'fallback';
  range.value = '2'; range.handlers.input(); range.handlers.change();
  assert.equal(f.memory.get('kairo-stroke-speed-v1'), '1.6'); assert.equal(range.attributes['aria-valuetext'], 'Fast');
  assert.equal(f.fallback.length, 1); assert.equal(f.fallback[0], page);
});

test('Existing continuous preferences recover to the nearest speed; invalid storage recovers to Normal', () => {
  for (const [stored, expected, position] of [['0.4', 0.7, '0'], ['1.0', 1.1, '1'], ['1.5', 1.6, '2'], ['invalid', 1.1, '1']]) {
    const f = fixture(stored), control = f.context.control({ dataset: {} });
    assert.equal(f.context.speed(), expected);
    assert.equal(control.children.find(child => child.tagName === 'input').value, position);
  }
});

/* G4 · the stage's ink reads the same one slider (one-hand/G4/BRIEF.md). The ACTUAL corridor.js definitions are lifted by
 * name — the tempo, the ceremony by depth and the card depth — beside the speed code above; the pinned FSRS engine
 * (vendor/ts-fsrs.mjs) answers present recall. */
const between = (from, to) => {
  const start = source.indexOf(from), end = source.indexOf(to, start);
  assert(start >= 0 && end > start, `corridor.js still carries ${from}`);
  return source.slice(start, end);
};
const tempo = between('const INK_TEMPO =', '/** How well he knows');
const depth = between('const INK_DEPTH =', '/** The writing on the stage now');
async function inkContext({ stored = null, srs = {}, taken = [], reduced = false, brush = 'first' } = {}) {
  const fsrsApi = await import(new URL('../vendor/ts-fsrs.mjs', import.meta.url));
  const memory = new Map(stored == null ? [] : [['kairo-stroke-speed-v1', stored]]);
  const context = {
    S: { srs, taken }, localStorage: { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) },
    scheduler: fsrsApi.fsrs(fsrsApi.generatorParameters({ enable_fuzz: false })),
    srsKey: (t, id) => `${t}:${id}`, plainRecord: value => !!value && typeof value === 'object' && !Array.isArray(value),
    owns: (value, key) => Object.prototype.hasOwnProperty.call(value, key), nonEmptyString: value => typeof value === 'string' && value.length > 0,
    kataToHira: text => String(text).replace(/[ァ-ヶ]/gu, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60)),
    srsSchedulerInstant: (card, now) => (card.last_review && card.last_review.getTime() > now.getTime() ? new Date(card.last_review.getTime()) : now),
    strokeReduced: () => reduced, wordBrush: () => brush,
  };
  vm.createContext(context);
  vm.runInContext(`${speed}\n${tempo}\n${depth}\nthis.inkStrokeMs = inkStrokeMs; this.inkCeremony = inkCeremony; this.cardDepth = cardDepth; this.strokeSpeed = strokeSpeed;`, context);
  return context;
}

test('G4 tempo: min(110, 1400 ÷ strokes) a stroke, never under 45 ms, at the middle step; slow and fast scale it, in order', async () => {
  const middle = await inkContext();
  assert.equal(middle.strokeSpeed(), 1.1);
  const at = (n) => middle.inkStrokeMs(n);
  assert.equal(at(0), 0);
  assert.equal(at(1), 110); assert.equal(at(12), 110); assert.equal(at(13), 1400 / 13);
  assert.equal(at(25), 56); assert.equal(at(25) * 25, 1400, '総理 (25 strokes) writes in 1.4 s at the middle step');
  for (let n = 13; n <= 31; n++) assert(at(n) * n <= 1400 + 1e-9, `${n} strokes write within 1.4 s at the middle step`);
  assert.equal(at(32), 45); assert.equal(at(32) * 32, 1440, '32 strokes truthfully take 1.44 s under the 45 ms floor');
  assert.equal(at(40), 45, 'never under 45 ms a stroke at the middle step');
  const slow = await inkContext({ stored: '0.7' }), fast = await inkContext({ stored: '1.6' });
  for (const n of [1, 7, 25, 31, 32, 40]) {
    assert(slow.inkStrokeMs(n) > at(n) && at(n) > fast.inkStrokeMs(n), `${n} strokes: slow > middle > fast`);
    assert.equal(slow.inkStrokeMs(n), at(n) * (1.1 / 0.7));
    assert.equal(fast.inkStrokeMs(n), at(n) * (1.1 / 1.6));
  }
});

test('G4 ceremony by depth: new and met write at a deliberate arrival, per 筆; seen again arrives written; recalled and owned arrive bare', async () => {
  const table = [];
  for (const brush of ['first', 'always', 'never']) for (const reduced of [false, true]) {
    const context = await inkContext({ brush, reduced });
    for (const depthName of ['unmet', 'met', 'again', 'recalled', 'owned']) for (const deliberate of [true, false]) {
      const plan = context.inkCeremony(depthName, deliberate);
      const writes = deliberate && !reduced && (brush === 'always' || (brush === 'first' && (depthName === 'unmet' || depthName === 'met')));
      assert.equal(plan.write, writes, `${brush}/${reduced ? 'reduced' : 'full'}/${depthName}/${deliberate ? 'his tap' : 'no tap'} writes: ${writes}`);
      assert.equal(plan.bare, depthName === 'recalled' || depthName === 'owned', `${depthName} stands bare only when recalled or owned`);
      assert.equal(plan.depth, depthName);
      table.push(plan.write);
    }
  }
  assert(table.some(Boolean) && table.some((value) => !value), 'the table holds both outcomes');
});

test('G4 card depth: no card unmet, kept met, never reviewed met, learning again, review recalled at 7 days and owned at 30 with recall ≥ 0.9, another reading met', async () => {
  const T = Date.now(), iso = (ms) => new Date(ms).toISOString(), day = 86400000;
  const card = (fields) => ({ difficulty: 5, elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0, learning_steps: 0, ...fields });
  const srs = {
    'word:新': card({ due: iso(T), stability: 0, state: 0 }),
    'word:学': card({ due: iso(T + 600000), last_review: iso(T - 600000), stability: 0.4, reps: 1, state: 1, learning_steps: 1 }),
    'word:再': card({ due: iso(T), last_review: iso(T - 600000), stability: 2, reps: 3, lapses: 1, state: 3 }),
    'word:想': card({ due: iso(T + 9 * day), last_review: iso(T - day), stability: 10, reps: 4, state: 2 }),
    'word:弱': card({ due: iso(T + 4 * day), last_review: iso(T - day), stability: 6.9, reps: 4, state: 2 }),
    'word:主': card({ due: iso(T + 58 * day), last_review: iso(T - 2 * day), stability: 60, reps: 7, state: 2 }),
    'word:忘': card({ due: iso(T - 200 * day), last_review: iso(T - 300 * day), stability: 30, reps: 7, state: 2 }),
    'word:年': card({ due: iso(T + 58 * day), last_review: iso(T - 2 * day), stability: 60, reps: 7, state: 2 }),
    'kanji:海': card({ due: iso(T + 58 * day), last_review: iso(T - 2 * day), stability: 40, reps: 7, state: 2 }),
  };
  const taken = [{ t: 'word', id: '持' }, { t: 'word', id: '新' }, { t: 'word', id: '年', cueReading: 'とし' }];
  const context = await inkContext({ srs, taken });
  const of = (id, extra = {}) => context.cardDepth({ t: 'word', id, ...extra }, T);
  assert.equal(of('無'), 'unmet');
  assert.equal(of('持'), 'met', 'kept without a card is met');
  assert.equal(of('新'), 'met', 'a card never reviewed is met');
  assert.equal(of('学'), 'again'); assert.equal(of('再'), 'again', 'learning and relearning are seen again');
  assert.equal(of('想'), 'recalled', 'in review, recall ≥ 0.9 and stability ≥ 7 days');
  assert.equal(of('弱'), 'again', 'stability just under 7 days is seen again');
  assert.equal(of('主'), 'owned', 'stability ≥ 30 days with present recall');
  assert.equal(of('忘'), 'again', 'a strong card he has not seen in 300 days is not recalled now: recall < 0.9');
  assert.equal(of('年', { reading: 'とし' }), 'owned');
  assert.equal(of('年', { reading: 'ねん' }), 'met', 'a reading unlike the one he keeps is at most met — help, never owned');
  assert.equal(context.cardDepth({ t: 'kanji', id: '海' }, T), 'owned', 'a kanji reads its own card');
  assert.equal(context.cardDepth({ t: 'particle', id: 'wa' }, T), 'unmet');
});
