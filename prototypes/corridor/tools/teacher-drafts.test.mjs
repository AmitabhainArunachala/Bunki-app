import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TEACHER_DRAFT_TEXT_LIMIT,
  TeacherDraftError,
  consumeTeacherDraft,
  editTeacherDraft,
  parseTeacherDraftRecovery,
  parseTeacherDrafts,
  reconcileTeacherDraftRecovery,
} from '../teacher-drafts.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));
const revision = (number) => `00000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
const topic = (number) => `teacher-context:${number.toString(16).padStart(64, '0')}`;
const draft = (number, text = `Raw question ${number}`, contextRef = null, consumed = false) => ({
  contextRef,
  revision: revision(number),
  text,
  consumed,
});
const identity = ({ contextRef, revision, text }) => ({ contextRef, revision, text });
const root = (...entries) => ({ version: 1, entries });
const installation = '{"format":"synthetic-binding-text","installation":"device-a"}';
const recovery = (...entries) => ({ version: 1, installation, entries });
const entry = (latest, base = null, committing = null) => ({
  contextRef: latest.contextRef,
  base,
  committing,
  latest,
});
const errorCode = (code) => (error) => error instanceof TeacherDraftError && error.code === code;

test('defaults only omitted/null draft roots and accepts exact detached plain JSON objects', () => {
  assert.deepEqual(parseTeacherDrafts(), root());
  assert.deepEqual(parseTeacherDrafts(null), root());
  const originalText = ' \t猫😀e\u0301\r\n ';
  const value = draft(1, originalText);
  const input = root(value);
  const parsed = parseTeacherDrafts(input);
  assert.deepEqual(parsed, input);
  input.entries[0].text = 'Changed after parsing';
  assert.equal(parsed.entries[0].text, originalText);
  assert.deepEqual(parseTeacherDrafts(Object.assign(Object.create(null), root())), root());
  for (const invalid of [JSON.stringify(root()), false, 1, '', [], new Date()]) {
    assert.throws(() => parseTeacherDrafts(invalid), errorCode('invalid-object'));
  }
});

test('edits retain explicit empty text with a new revision and leave all other topics intact', () => {
  const first = draft(1, 'Older words');
  const unrelated = draft(2, 'Other topic', topic(2));
  const initial = root(first, unrelated);
  const cleared = editTeacherDraft(initial, identity(draft(3, '')));
  assert.deepEqual(cleared, root(draft(3, ''), unrelated));
  assert.deepEqual(initial, root(first, unrelated));
  const next = editTeacherDraft(cleared, identity(draft(4, '\t \r\n', topic(4))));
  assert.deepEqual(next.entries, [draft(3, ''), unrelated, draft(4, '\t \r\n', topic(4))]);
  assert.equal(next.entries[0].consumed, false);
});

test('consumption matches topic, revision and raw text and never clears a newer edit', () => {
  const sent = draft(1, '  Why 猫？  ', topic(1));
  const other = draft(2, 'Other', null);
  const initial = root(sent, other);
  const consumed = consumeTeacherDraft(initial, identity(sent));
  assert.deepEqual(consumed, root({ ...sent, consumed: true }, other));
  assert.equal(consumed.entries[0].text, '  Why 猫？  ');
  for (const mismatch of [
    { ...identity(sent), text: sent.text.trim() },
    { ...identity(sent), revision: revision(9) },
    { ...identity(sent), contextRef: null },
  ])
    assert.deepEqual(consumeTeacherDraft(initial, mismatch), initial);
  const newer = editTeacherDraft(consumed, identity(draft(3, 'New question', topic(1))));
  assert.deepEqual(consumeTeacherDraft(newer, identity(sent)), newer);
  assert.equal(newer.entries[0].consumed, false);
  assert.deepEqual(
    consumeTeacherDraft(root(draft(5, '')), identity(draft(5, ''))),
    root(draft(5, '', null, true)),
  );
});

test('exact repeated editing identities are idempotent and cannot unconsume a sent draft', () => {
  const latest = draft(1, 'Question', null, true);
  assert.deepEqual(editTeacherDraft(root(latest), identity(latest)), root(latest));
  assert.throws(
    () => editTeacherDraft(root(latest), { ...identity(latest), text: 'Different bytes' }),
    errorCode('revision-collision'),
  );
  assert.throws(
    () => editTeacherDraft(root(latest), { ...identity(latest), contextRef: topic(1) }),
    errorCode('revision-collision'),
  );
  assert.deepEqual(
    editTeacherDraft(root(latest), identity(draft(2, latest.text))),
    root(draft(2, latest.text)),
  );
});

test('parses same-topic recovery snapshots and allows consumed-state differences in exact base identity', () => {
  const a = draft(1, 'A', topic(1));
  const value = recovery(entry(draft(2, 'B', topic(1)), { ...a, consumed: true }, a));
  assert.deepEqual(parseTeacherDraftRecovery(value), value);
  assert.deepEqual(parseTeacherDraftRecovery(recovery(entry(a, a, a))), recovery(entry(a, a, a)));
  assert.deepEqual(parseTeacherDraftRecovery(recovery()), recovery());
  for (const invalid of [undefined, null, JSON.stringify(value)]) {
    assert.throws(() => parseTeacherDraftRecovery(invalid), errorCode('invalid-object'));
  }
});

test('recovers an absent topic with no base, including commit A with a newer pending B', () => {
  const a = draft(1, 'A');
  const b = draft(2, 'B');
  for (const committing of [null, a]) {
    assert.deepEqual(
      reconcileTeacherDraftRecovery(undefined, recovery(entry(b, null, committing))),
      {
        drafts: root(b),
        remaining: recovery(),
        applied: [b],
      },
    );
  }
});

test('applies a newer empty edit over the exact base even if the base was consumed meanwhile', () => {
  const base = draft(1, 'Question sent');
  const latest = draft(2, '');
  for (const consumed of [false, true]) {
    const durable = { ...base, consumed };
    const result = reconcileTeacherDraftRecovery(root(durable), recovery(entry(latest, base)));
    assert.deepEqual(result, { drafts: root(latest), remaining: recovery(), applied: [latest] });
  }
});

test('handles commit A/latest B interleavings and never resurrects an identical consumed latest', () => {
  const base = draft(1, 'Base');
  const a = draft(2, 'A');
  const b = draft(3, 'B');
  const pending = recovery(entry(b, base, a));
  for (const current of [base, { ...base, consumed: true }, a, { ...a, consumed: true }]) {
    assert.deepEqual(reconcileTeacherDraftRecovery(root(current), pending), {
      drafts: root(b),
      remaining: recovery(),
      applied: [b],
    });
  }
  for (const current of [b, { ...b, consumed: true }]) {
    assert.deepEqual(reconcileTeacherDraftRecovery(root(current), pending), {
      drafts: root(current),
      remaining: recovery(),
      applied: [],
    });
  }
  const newer = draft(4, 'C typed later');
  assert.deepEqual(reconcileTeacherDraftRecovery(root(newer), pending), {
    drafts: root(newer),
    remaining: pending,
    applied: [],
  });
  assert.deepEqual(reconcileTeacherDraftRecovery(root(), pending), {
    drafts: root(),
    remaining: pending,
    applied: [],
  });
});

test('cleans already durable consumed latest recovery without changing its raw text', () => {
  const latest = draft(1, '  exact unsent-looking text  ', topic(1));
  const durable = { ...latest, consumed: true };
  const result = reconcileTeacherDraftRecovery(root(durable), recovery(entry(latest)));
  assert.deepEqual(result, { drafts: root(durable), remaining: recovery(), applied: [] });
  assert.equal(result.drafts.entries[0].consumed, true);
  assert.equal(result.drafts.entries[0].text, latest.text);
});

test('keeps each conflicting recovery entry complete while independently applying other topics', () => {
  const base = draft(1, 'Base', topic(1));
  const committing = draft(2, 'Committing', topic(1));
  const latest = draft(3, 'Latest', topic(1));
  const independent = draft(4, 'Independent', topic(2));
  const current = draft(5, 'New durable topic-one text', topic(1));
  const conflict = entry(latest, base, committing);
  const result = reconcileTeacherDraftRecovery(
    root(current),
    recovery(conflict, entry(independent)),
  );
  assert.deepEqual(result, {
    drafts: root(current, independent),
    remaining: recovery(conflict),
    applied: [independent],
  });
  assert.deepEqual(result.remaining.entries[0], conflict);
});

test('retains same-revision/different-text collisions between durable and recovery documents', () => {
  const base = draft(1, 'Base');
  const committing = draft(2, 'Committing');
  const latest = draft(3, 'Latest');
  const pending = recovery(entry(latest, base, committing));
  for (const candidate of [base, committing, latest]) {
    const collided = { ...candidate, text: `${candidate.text} different bytes` };
    assert.deepEqual(reconcileTeacherDraftRecovery(root(collided), pending), {
      drafts: root(collided),
      remaining: pending,
      applied: [],
    });
  }
  const otherTopic = { ...latest, contextRef: topic(9) };
  const creation = recovery(entry(latest));
  assert.deepEqual(reconcileTeacherDraftRecovery(root(otherTopic), creation), {
    drafts: root(otherTopic),
    remaining: creation,
    applied: [],
  });
});

test('does not discard valid orphan topic refs or depend on source/context availability', () => {
  const unavailable = topic(999);
  const latest = draft(1, 'Keep this unavailable topic question', unavailable);
  const result = reconcileTeacherDraftRecovery(root(), recovery(entry(latest)));
  assert.deepEqual(result.drafts, root(latest));
  assert.deepEqual(parseTeacherDrafts(result.drafts), root(latest));
  assert.equal(result.drafts.entries[0].contextRef, unavailable);
});

test('retains all topics with no fixed collection retention cap', () => {
  const entries = Array.from({ length: 1201 }, (_, index) =>
    draft(index + 1, `Question ${index}`, topic(index)),
  );
  const parsed = parseTeacherDrafts(root(...entries));
  assert.equal(parsed.entries.length, 1201);
  const result = reconcileTeacherDraftRecovery(
    root(),
    recovery(...entries.map((value) => entry(value))),
  );
  assert.equal(result.drafts.entries.length, 1201);
  assert.equal(result.applied.length, 1201);
  assert.deepEqual(result.remaining, recovery());
  const updated = editTeacherDraft(result.drafts, identity(draft(2000, '', topic(600))));
  assert.equal(updated.entries.length, 1201);
  assert.deepEqual(updated.entries[0], entries[0]);
  assert.deepEqual(updated.entries.at(-1), entries.at(-1));
  assert.deepEqual(updated.entries[600], draft(2000, '', topic(600)));
});

test('rejects unknown fields, duplicate topics and internally colliding revision identities', () => {
  const a = draft(1, 'A');
  const b = draft(2, 'B');
  assert.throws(
    () => parseTeacherDrafts({ ...root(a), sourcePermission: true }),
    errorCode('invalid-fields'),
  );
  assert.throws(() => parseTeacherDrafts(root({ ...a, ts: 1 })), errorCode('invalid-fields'));
  assert.throws(() => parseTeacherDrafts(root(a, b)), errorCode('duplicate-topic'));
  assert.throws(
    () => parseTeacherDrafts(root(a, { ...a, contextRef: topic(1) })),
    errorCode('revision-collision'),
  );
  assert.throws(
    () => parseTeacherDraftRecovery(recovery(entry(a), entry(b))),
    errorCode('duplicate-topic'),
  );
  assert.throws(
    () => parseTeacherDraftRecovery(recovery(entry({ ...a, text: 'Changed bytes' }, a))),
    errorCode('revision-collision'),
  );
  assert.throws(
    () => parseTeacherDraftRecovery(recovery(entry(a), entry({ ...a, contextRef: topic(1) }))),
    errorCode('revision-collision'),
  );
  assert.throws(
    () => parseTeacherDraftRecovery(recovery({ ...entry(a), permission: true })),
    errorCode('invalid-fields'),
  );
  assert.throws(
    () => parseTeacherDraftRecovery({ ...recovery(entry(a)), writer: true }),
    errorCode('invalid-fields'),
  );
  assert.throws(
    () => editTeacherDraft(root(), { ...identity(a), consumed: false }),
    errorCode('invalid-fields'),
  );
  assert.throws(
    () => consumeTeacherDraft(root(a), { ...identity(a), installation }),
    errorCode('invalid-fields'),
  );
});

test('rejects malformed draft scalars, unsafe UTF-16/controls and incompatible recovery states', () => {
  const a = draft(1);
  const b = draft(2);
  for (const contextRef of [
    undefined,
    '',
    'general',
    `teacher-context:${'A'.repeat(64)}`,
    `teacher-context:${'a'.repeat(63)}`,
    {},
  ]) {
    assert.throws(
      () => parseTeacherDrafts(root({ ...a, contextRef })),
      errorCode('invalid-context-ref'),
    );
  }
  for (const revision of [
    '',
    'not-a-uuid',
    '00000000-0000-0000-0000-000000000000',
    a.revision.toUpperCase().replace('8000', 'A000'),
    {},
    1,
  ]) {
    assert.throws(
      () => parseTeacherDrafts(root({ ...a, revision })),
      errorCode('invalid-revision'),
    );
  }
  for (const text of [
    null,
    1,
    '\ud800',
    '\udc00',
    '\u0000',
    '\u000b',
    '\u001b',
    '\u007f',
    '\u0085',
    'x'.repeat(TEACHER_DRAFT_TEXT_LIMIT + 1),
  ]) {
    assert.throws(() => parseTeacherDrafts(root({ ...a, text })), errorCode('invalid-text'));
  }
  assert.equal(
    parseTeacherDrafts(root({ ...a, text: 'x'.repeat(TEACHER_DRAFT_TEXT_LIMIT) })).entries[0].text
      .length,
    TEACHER_DRAFT_TEXT_LIMIT,
  );
  for (const consumed of [undefined, null, 0, 'false']) {
    assert.throws(
      () => parseTeacherDrafts(root({ ...a, consumed })),
      errorCode('invalid-consumed'),
    );
  }
  for (const version of [0, 2, '1', null]) {
    assert.throws(() => parseTeacherDrafts({ ...root(a), version }), errorCode('invalid-version'));
    assert.throws(
      () => parseTeacherDraftRecovery({ ...recovery(), version }),
      errorCode('invalid-version'),
    );
  }
  for (const installation of ['', ' \t\n', null, '\ud800', 'x'.repeat(2049)]) {
    assert.throws(
      () => parseTeacherDraftRecovery({ ...recovery(), installation }),
      errorCode('invalid-text'),
    );
  }
  for (const invalid of [
    entry({ ...a, consumed: true }),
    entry(b, null, { ...a, consumed: true }),
  ]) {
    assert.throws(
      () => parseTeacherDraftRecovery(recovery(invalid)),
      errorCode('invalid-recovery-state'),
    );
  }
  for (const invalid of [
    entry(a, { ...b, contextRef: topic(1) }),
    entry(a, null, { ...b, contextRef: topic(1) }),
    { ...entry(a), contextRef: topic(1) },
  ]) {
    assert.throws(() => parseTeacherDraftRecovery(recovery(invalid)), errorCode('topic-mismatch'));
  }
});

test('rejects non-JSON properties and sparse or accessor-bearing containers without executing getters', () => {
  let reads = 0;
  const getter = { ...draft(1) };
  Object.defineProperty(getter, 'text', {
    enumerable: true,
    get() {
      reads += 1;
      throw new Error('No getter');
    },
  });
  assert.throws(() => parseTeacherDrafts(root(getter)), errorCode('invalid-property'));
  const accessorArray = [draft(1)];
  Object.defineProperty(accessorArray, '0', {
    enumerable: true,
    get() {
      reads += 1;
      throw new Error('No array getter');
    },
  });
  const sparse = Array(1);
  const extra = [draft(1)];
  extra.extra = true;
  const symbol = [draft(1)];
  symbol[Symbol('extra')] = true;
  for (const entries of [accessorArray, sparse, extra, symbol, {}, '[]']) {
    assert.throws(() => parseTeacherDrafts({ version: 1, entries }), errorCode('invalid-array'));
  }
  const hidden = { ...draft(1) };
  Object.defineProperty(hidden, 'text', { enumerable: false, value: 'hidden' });
  assert.throws(() => parseTeacherDrafts(root(hidden)), errorCode('invalid-property'));
  const symbolic = { ...draft(1), [Symbol('hidden')]: true };
  assert.throws(() => parseTeacherDrafts(root(symbolic)), errorCode('invalid-fields'));
  const polluted = JSON.parse(`{"version":1,"entries":[],"__proto__":{"authority":true}}`);
  assert.throws(() => parseTeacherDrafts(polluted), errorCode('invalid-fields'));
  assert.throws(
    () => parseTeacherDrafts(root(Object.assign(Object.create({ authority: true }), draft(1)))),
    errorCode('invalid-object'),
  );
  assert.equal(reads, 0);
});

test('makes every result deeply immutable and leaves all caller data unchanged', () => {
  const base = draft(1, 'Base', topic(1));
  const latest = draft(2, 'Latest', topic(1));
  const conflict = entry(draft(3, 'Conflict latest', topic(2)), draft(4, 'Missing base', topic(2)));
  const durable = root(base);
  const pending = recovery(entry(latest, base), conflict);
  const before = { durable: clone(durable), pending: clone(pending) };
  const result = reconcileTeacherDraftRecovery(durable, pending);
  assert.deepEqual({ durable, pending }, before);
  const values = [result];
  while (values.length) {
    const value = values.pop();
    if (value === null || typeof value !== 'object') continue;
    assert(Object.isFrozen(value));
    values.push(...Object.values(value));
  }
  assert.equal(Reflect.set(result.drafts.entries[0], 'text', 'Changed'), false);
  assert.equal(Reflect.set(result.remaining.entries[0].latest, 'consumed', true), false);
  assert.equal(Reflect.set(result.applied, '0', draft(9)), false);
  latest.text = 'Caller changed its object';
  conflict.base.text = 'Caller changed conflict evidence';
  assert.equal(result.drafts.entries[0].text, 'Latest');
  assert.equal(result.remaining.entries[0].base.text, 'Missing base');
});

test('repeated recovery after serialized restart is idempotent and keeps unresolved conflicts', () => {
  const latest = draft(1, 'Recovered', topic(1));
  const conflict = entry(draft(2, 'Pending', topic(2)), draft(3, 'No longer present', topic(2)));
  const pending = recovery(entry(latest), conflict);
  const first = reconcileTeacherDraftRecovery(root(), pending);
  const again = reconcileTeacherDraftRecovery(clone(first.drafts), clone(pending));
  assert.deepEqual(again, { drafts: first.drafts, remaining: recovery(conflict), applied: [] });
  const sent = consumeTeacherDraft(first.drafts, identity(latest));
  const afterSendRestart = reconcileTeacherDraftRecovery(clone(sent), clone(pending));
  assert.deepEqual(afterSendRestart, { drafts: sent, remaining: recovery(conflict), applied: [] });
});
