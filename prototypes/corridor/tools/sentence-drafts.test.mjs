import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SENTENCE_DRAFT_ENTRY_ID_LIMIT,
  SENTENCE_DRAFT_ENTRY_LIMIT,
  SENTENCE_DRAFT_TEXT_LIMIT,
  SentenceDraftError,
  consumeSentenceDraft,
  editSentenceDraft,
  parseSentenceDraftIdentity,
  parseSentenceDraftKey,
  parseSentenceDraftRecovery,
  parseSentenceDrafts,
  reconcileSentenceDraftRecovery,
  sameSentenceDraftIdentity,
  sentenceDraftKey,
} from '../sentence-drafts.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));
const revision = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const key = (n = 0, mode = 'production') => ({ entryId: `saved-plan:${n}`, mode });
const draft = (
  n,
  text = `Raw response ${n}`,
  selectedKey = key(),
  consumed = false,
  transcriptOpened = false,
) => ({
  ...selectedKey,
  revision: revision(n),
  text,
  ...(selectedKey.mode === 'listening' ? { transcriptOpened } : {}),
  consumed,
});
const identity = ({ entryId, mode, revision, text, transcriptOpened }) => ({
  entryId,
  mode,
  revision,
  text,
  ...(mode === 'listening' ? { transcriptOpened } : {}),
});
const root = (...entries) => ({ version: 1, entries });
const installation = '{"format":"synthetic-binding-text","installation":"device-a"}';
const recovery = (...entries) => ({ version: 1, installation, entries });
const entry = (latest, base = null, committing = null) => ({
  key: { entryId: latest.entryId, mode: latest.mode },
  base,
  committing,
  latest,
});
const errorCode = (code) => (error) => error instanceof SentenceDraftError && error.code === code;

test('only missing legacy roots default empty; parsed raw Unicode stays detached and exact', () => {
  assert.deepEqual(parseSentenceDrafts(), root());
  assert.deepEqual(parseSentenceDrafts(null), root());
  const text = ' \t猫😀e\u0301\r\n trailing  ';
  const input = root(draft(1, text), draft(2, '', key(0, 'listening'), false, true));
  const parsed = parseSentenceDrafts(input);
  assert.deepEqual(parsed, input);
  input.entries[0].text = 'Caller replaced its text';
  assert.equal(parsed.entries[0].text, text);
  assert.deepEqual(parseSentenceDrafts(Object.assign(Object.create(null), root())), root());
  for (const invalid of [JSON.stringify(root()), false, 1, '', [], new Date()]) {
    assert.throws(() => parseSentenceDrafts(invalid), errorCode('invalid-object'));
  }
});

test('opaque keys are exact JSON tuples and two modes of one unavailable plan remain independent', () => {
  const production = {
    entryId: '  unavailable-plan:["listening",":"]e\u0301  ',
    mode: 'production',
  };
  const listening = { ...production, mode: 'listening' };
  assert.deepEqual(parseSentenceDraftKey(production), production);
  assert.equal(sentenceDraftKey(production), JSON.stringify([production.entryId, production.mode]));
  assert.notEqual(sentenceDraftKey(production), sentenceDraftKey(listening));
  assert.notEqual(
    sentenceDraftKey(production),
    sentenceDraftKey({ ...production, entryId: production.entryId.normalize('NFC') }),
  );
  const first = draft(1, 'Production', production);
  const second = draft(2, 'Listening', listening, false, true);
  const parsed = parseSentenceDrafts(root(first, second));
  const cleared = editSentenceDraft(parsed, identity(draft(3, '', production)));
  assert.deepEqual(cleared, root(draft(3, '', production), second));
  assert.deepEqual(
    reconcileSentenceDraftRecovery(root(), recovery(entry(second))).drafts,
    root(second),
  );
});

test('empty and whitespace edits retain rows while new same-text revisions remain unconsumed', () => {
  const first = draft(1, 'A');
  const other = draft(2, 'Other plan', key(2));
  const initial = root(first, other);
  const cleared = editSentenceDraft(initial, identity(draft(3, '')));
  assert.deepEqual(cleared, root(draft(3, ''), other));
  assert.deepEqual(initial, root(first, other));
  const blank = editSentenceDraft(cleared, identity(draft(4, '\t \r\n')));
  const sameText = editSentenceDraft(blank, identity(draft(5, '\t \r\n')));
  assert.equal(sameText.entries[0].revision, revision(5));
  assert.equal(sameText.entries[0].consumed, false);
  assert.deepEqual(sameText.entries[1], other);
});

test('consume matches every identity field and leaves other modes and newer A-B-A revisions intact', () => {
  const submitted = draft(1, '  窓から海が見えます。  ');
  const listening = draft(2, '  窓から海が見えます。  ', key(0, 'listening'), false, true);
  const initial = root(submitted, listening);
  assert.deepEqual(
    consumeSentenceDraft(initial, identity(submitted)),
    root({ ...submitted, consumed: true }, listening),
  );
  for (const mismatch of [
    { ...identity(submitted), text: submitted.text.trim() },
    { ...identity(submitted), revision: revision(99) },
    { ...identity(submitted), entryId: 'other-plan' },
    { ...identity(submitted), mode: 'listening', transcriptOpened: false },
  ])
    assert.deepEqual(consumeSentenceDraft(initial, mismatch), initial);
  assert.deepEqual(
    consumeSentenceDraft(initial, { ...identity(listening), transcriptOpened: false }),
    initial,
  );
  const b = editSentenceDraft(initial, identity(draft(3, 'B')));
  const aAgain = editSentenceDraft(b, identity(draft(4, submitted.text)));
  assert.deepEqual(consumeSentenceDraft(aAgain, identity(submitted)), aAgain);
  const empty = editSentenceDraft(aAgain, identity(draft(5, '')));
  assert.deepEqual(consumeSentenceDraft(empty, identity(submitted)), empty);
  assert.deepEqual(
    consumeSentenceDraft(root(draft(6, '')), identity(draft(6, ''))),
    root(draft(6, '', key(), true)),
  );
});

test('UUID reuse cannot change text, key or listening exposure and exact repeats keep the tombstone', () => {
  const latest = draft(1, 'Already sent', key(0, 'listening'), true, true);
  assert.deepEqual(parseSentenceDraftIdentity(identity(latest)), identity(latest));
  assert(sameSentenceDraftIdentity(latest, { ...latest, consumed: false }));
  assert(!sameSentenceDraftIdentity(latest, { ...latest, transcriptOpened: false }));
  assert(!sameSentenceDraftIdentity(latest, null));
  assert.deepEqual(editSentenceDraft(root(latest), identity(latest)), root(latest));
  for (const changed of [
    { ...identity(latest), text: 'Changed' },
    { ...identity(latest), entryId: 'Other plan' },
    { ...identity(latest), transcriptOpened: false },
    { ...identity(draft(1, latest.text)), mode: 'production' },
  ])
    assert.throws(() => editSentenceDraft(root(latest), changed), errorCode('revision-collision'));
  assert.deepEqual(
    editSentenceDraft(
      root(latest),
      identity(draft(2, latest.text, key(0, 'listening'), false, true)),
    ),
    root(draft(2, latest.text, key(0, 'listening'), false, true)),
  );
});

test('base/committing/latest recovery follows exact identity and cannot resurrect a consumed latest', () => {
  const base = draft(1, 'Base', key(1, 'listening'));
  const committing = draft(2, 'A', key(1, 'listening'), false, true);
  const latest = draft(3, '', key(1, 'listening'), false, true);
  const pending = recovery(entry(latest, base, committing));
  assert.deepEqual(parseSentenceDraftRecovery(pending), pending);
  for (const current of [
    base,
    { ...base, consumed: true },
    committing,
    { ...committing, consumed: true },
  ]) {
    assert.deepEqual(reconcileSentenceDraftRecovery(root(current), pending), {
      drafts: root(latest),
      remaining: recovery(),
      applied: [latest],
    });
  }
  for (const current of [latest, { ...latest, consumed: true }]) {
    assert.deepEqual(reconcileSentenceDraftRecovery(root(current), pending), {
      drafts: root(current),
      remaining: recovery(),
      applied: [],
    });
  }
  assert.deepEqual(reconcileSentenceDraftRecovery(root(), pending), {
    drafts: root(),
    remaining: pending,
    applied: [],
  });
  const divergent = draft(4, 'Divergent', key(1, 'listening'));
  assert.deepEqual(reconcileSentenceDraftRecovery(root(divergent), pending), {
    drafts: root(divergent),
    remaining: pending,
    applied: [],
  });
  for (const committing of [null, base]) {
    assert.deepEqual(
      reconcileSentenceDraftRecovery(undefined, recovery(entry(latest, null, committing))),
      {
        drafts: root(latest),
        remaining: recovery(),
        applied: [latest],
      },
    );
  }
});

test('conflicts retain their whole entry while an independent mode or plan recovers', () => {
  const base = draft(1, 'Base');
  const committing = draft(2, 'Committing');
  const latest = draft(3, 'Latest');
  const current = draft(4, 'Divergent');
  const otherMode = draft(5, 'Other mode', key(0, 'listening'), false, true);
  const conflict = entry(latest, base, committing);
  assert.deepEqual(
    reconcileSentenceDraftRecovery(root(current), recovery(conflict, entry(otherMode))),
    {
      drafts: root(current, otherMode),
      remaining: recovery(conflict),
      applied: [otherMode],
    },
  );
  for (const candidate of [base, committing, latest]) {
    const collided = { ...candidate, text: `${candidate.text} collision` };
    assert.deepEqual(reconcileSentenceDraftRecovery(root(collided), recovery(conflict)), {
      drafts: root(collided),
      remaining: recovery(conflict),
      applied: [],
    });
  }
  const exposed = draft(9, 'Same text', key(1, 'listening'), false, true);
  const notExposed = { ...exposed, transcriptOpened: false };
  assert.deepEqual(reconcileSentenceDraftRecovery(root(exposed), recovery(entry(notExposed))), {
    drafts: root(exposed),
    remaining: recovery(entry(notExposed)),
    applied: [],
  });
  const otherKey = { ...latest, entryId: 'different-plan' };
  assert.deepEqual(
    reconcileSentenceDraftRecovery(root(otherKey), recovery(entry(latest))).remaining,
    recovery(entry(latest)),
  );
});

test('capacity rejects overfull inputs and edits without eviction and retains unreplayable recovery whole', () => {
  const entries = Array.from({ length: SENTENCE_DRAFT_ENTRY_LIMIT }, (_, i) =>
    draft(i + 1, `${i}`, key(i)),
  );
  const full = root(...entries);
  const before = JSON.stringify(full);
  assert.equal(parseSentenceDrafts(full).entries.length, SENTENCE_DRAFT_ENTRY_LIMIT);
  const fresh = draft(10_000, '', key(10_000));
  assert.throws(() => parseSentenceDrafts(root(...entries, fresh)), errorCode('draft-capacity'));
  assert.throws(
    () =>
      parseSentenceDraftRecovery(recovery(...entries.map((value) => entry(value)), entry(fresh))),
    errorCode('draft-capacity'),
  );
  assert.throws(() => editSentenceDraft(full, identity(fresh)), errorCode('draft-capacity'));
  const pending = recovery(entry(fresh));
  assert.deepEqual(reconcileSentenceDraftRecovery(full, pending), {
    drafts: full,
    remaining: pending,
    applied: [],
  });
  const updated = editSentenceDraft(full, identity(draft(10_001, '', key(500))));
  assert.equal(updated.entries.length, SENTENCE_DRAFT_ENTRY_LIMIT);
  assert.deepEqual(updated.entries[500], draft(10_001, '', key(500)));
  assert.deepEqual(updated.entries.at(-1), full.entries.at(-1));
  assert.equal(JSON.stringify(full), before);
});

test('strict roots reject duplicate keys, revision collisions and non-neutral metadata', () => {
  const a = draft(1, 'A');
  const b = draft(2, 'B');
  assert.throws(() => parseSentenceDrafts(root(a, b)), errorCode('duplicate-key'));
  assert.throws(
    () => parseSentenceDrafts(root(a, { ...a, entryId: 'other' })),
    errorCode('revision-collision'),
  );
  assert.throws(
    () => parseSentenceDraftRecovery(recovery(entry(a), entry(b))),
    errorCode('duplicate-key'),
  );
  assert.throws(
    () => parseSentenceDraftRecovery(recovery(entry({ ...a, text: 'Changed' }, a))),
    errorCode('revision-collision'),
  );
  assert.throws(
    () => parseSentenceDraftRecovery(recovery(entry(a), entry({ ...a, entryId: 'other' }))),
    errorCode('revision-collision'),
  );
  for (const extra of [
    'at',
    'grade',
    'event',
    'mastery',
    'completedPlays',
    'startedAt',
    'latencyMs',
    'schedule',
    'sourcePermission',
  ]) {
    assert.throws(
      () => parseSentenceDrafts(root({ ...a, [extra]: 1 })),
      errorCode('invalid-fields'),
    );
    assert.throws(
      () => parseSentenceDrafts({ ...root(a), [extra]: 1 }),
      errorCode('invalid-fields'),
    );
  }
  assert.throws(() => parseSentenceDraftIdentity(a), errorCode('invalid-fields'));
  assert.throws(() => editSentenceDraft(root(), a), errorCode('invalid-fields'));
  assert.throws(
    () => consumeSentenceDraft(root(a), { ...identity(a), installation }),
    errorCode('invalid-fields'),
  );
  assert.throws(() => parseSentenceDraftKey({ ...key(), text: '' }), errorCode('invalid-fields'));
  assert.throws(
    () => parseSentenceDraftRecovery({ ...recovery(), writer: true }),
    errorCode('invalid-fields'),
  );
  assert.throws(
    () => parseSentenceDraftRecovery(recovery({ ...entry(a), permission: true })),
    errorCode('invalid-fields'),
  );
});

test('keys and texts use bounded well-formed UTF-16 with the teacher control-character boundary', () => {
  const a = draft(1);
  for (const entryId of [
    undefined,
    null,
    '',
    ' \t\r\n ',
    1,
    {},
    '\ud800',
    '\u0000',
    'x'.repeat(SENTENCE_DRAFT_ENTRY_ID_LIMIT + 1),
  ]) {
    assert.throws(() => parseSentenceDraftKey({ ...key(), entryId }), errorCode('invalid-text'));
  }
  assert.equal(
    parseSentenceDraftKey({ ...key(), entryId: '😀'.repeat(250) }).entryId.length,
    SENTENCE_DRAFT_ENTRY_ID_LIMIT,
  );
  for (const mode of [undefined, null, '', 'cloze', 'Production', 'listening ', {}, 1]) {
    assert.throws(() => parseSentenceDraftKey({ ...key(), mode }), errorCode('invalid-mode'));
  }
  for (const revision of [
    '',
    'not-a-uuid',
    '00000000-0000-0000-0000-000000000000',
    a.revision.replace('8000', 'A000'),
    {},
    1,
  ]) {
    assert.throws(
      () => parseSentenceDrafts(root({ ...a, revision })),
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
    'x'.repeat(SENTENCE_DRAFT_TEXT_LIMIT + 1),
    '😀'.repeat(2000) + 'x',
  ]) {
    assert.throws(() => parseSentenceDrafts(root({ ...a, text })), errorCode('invalid-text'));
  }
  assert.equal(
    parseSentenceDrafts(root({ ...a, text: '😀'.repeat(2000) })).entries[0].text.length,
    SENTENCE_DRAFT_TEXT_LIMIT,
  );
  for (const consumed of [undefined, null, 0, 'false']) {
    assert.throws(
      () => parseSentenceDrafts(root({ ...a, consumed })),
      errorCode('invalid-consumed'),
    );
  }
});

test('listening exposure is mandatory only for listening and recovery snapshots stay in one exact key', () => {
  const a = draft(1);
  const listening = draft(2, 'Listening', key(0, 'listening'));
  assert.throws(
    () => parseSentenceDrafts(root({ ...a, transcriptOpened: false })),
    errorCode('invalid-fields'),
  );
  const missingExposure = { ...listening };
  delete missingExposure.transcriptOpened;
  assert.throws(() => parseSentenceDrafts(root(missingExposure)), errorCode('invalid-fields'));
  for (const transcriptOpened of [undefined, null, 0, 'false']) {
    assert.throws(
      () => parseSentenceDrafts(root({ ...listening, transcriptOpened })),
      errorCode('invalid-transcript-opened'),
    );
  }
  for (const version of [0, 2, '1', null]) {
    assert.throws(() => parseSentenceDrafts({ ...root(), version }), errorCode('invalid-version'));
    assert.throws(
      () => parseSentenceDraftRecovery({ ...recovery(), version }),
      errorCode('invalid-version'),
    );
  }
  for (const installation of ['', ' \t\n', null, '\ud800', 'x'.repeat(2049)]) {
    assert.throws(
      () => parseSentenceDraftRecovery({ ...recovery(), installation }),
      errorCode('invalid-text'),
    );
  }
  for (const invalid of [undefined, null, JSON.stringify(recovery())]) {
    assert.throws(() => parseSentenceDraftRecovery(invalid), errorCode('invalid-object'));
  }
  for (const invalid of [
    entry({ ...a, consumed: true }),
    entry(draft(3), null, { ...a, consumed: true }),
  ]) {
    assert.throws(
      () => parseSentenceDraftRecovery(recovery(invalid)),
      errorCode('invalid-recovery-state'),
    );
  }
  for (const invalid of [
    entry(a, listening),
    entry(a, null, listening),
    { ...entry(a), key: key(1) },
  ]) {
    assert.throws(() => parseSentenceDraftRecovery(recovery(invalid)), errorCode('key-mismatch'));
  }
  assert.deepEqual(
    parseSentenceDraftRecovery(recovery(entry(a, { ...a, consumed: true }, a))),
    recovery(entry(a, { ...a, consumed: true }, a)),
  );
});

test('accessors, hidden/symbol properties, inherited data and sparse containers fail without executing getters', () => {
  let reads = 0;
  const accessor = (value, name) =>
    Object.defineProperty(value, name, {
      enumerable: true,
      get() {
        reads += 1;
        throw new Error('Must not read getter');
      },
    });
  for (const name of ['text', 'entryId', 'mode']) {
    assert.throws(
      () => parseSentenceDrafts(root(accessor({ ...draft(1) }, name))),
      errorCode('invalid-property'),
    );
  }
  assert.throws(
    () => parseSentenceDraftKey(accessor({ ...key() }, 'mode')),
    errorCode('invalid-property'),
  );
  const extra = [draft(1)];
  extra.extra = true;
  const symbolic = [draft(1)];
  symbolic[Symbol('hidden')] = true;
  for (const entries of [accessor([draft(1)], '0'), Array(1), extra, symbolic, {}, '[]']) {
    assert.throws(() => parseSentenceDrafts({ version: 1, entries }), errorCode('invalid-array'));
  }
  const hidden = Object.defineProperty({ ...draft(1) }, 'text', {
    enumerable: false,
    value: 'hidden',
  });
  assert.throws(() => parseSentenceDrafts(root(hidden)), errorCode('invalid-property'));
  assert.throws(
    () => parseSentenceDrafts(root({ ...draft(1), [Symbol('extra')]: true })),
    errorCode('invalid-fields'),
  );
  assert.throws(
    () =>
      parseSentenceDrafts(JSON.parse('{"version":1,"entries":[],"__proto__":{"authority":true}}')),
    errorCode('invalid-fields'),
  );
  assert.throws(
    () => parseSentenceDrafts(root(Object.assign(Object.create({ authority: true }), draft(1)))),
    errorCode('invalid-object'),
  );
  assert.equal(reads, 0);
});

test('results are deeply immutable, inputs stay unchanged and serialized restart is idempotent', () => {
  const base = draft(1, 'Base');
  const latest = draft(2, 'Latest');
  const conflict = entry(draft(3, 'Conflict', key(1)), draft(4, 'Missing base', key(1)));
  const durable = root(base);
  const pending = recovery(entry(latest, base), conflict);
  const before = { durable: clone(durable), pending: clone(pending) };
  const first = reconcileSentenceDraftRecovery(durable, pending);
  assert.deepEqual({ durable, pending }, before);
  const values = [first];
  while (values.length) {
    const value = values.pop();
    if (value === null || typeof value !== 'object') continue;
    assert(Object.isFrozen(value));
    values.push(...Object.values(value));
  }
  assert.equal(Reflect.set(first.drafts.entries[0], 'text', 'Changed'), false);
  assert.equal(Reflect.set(first.remaining.entries[0].key, 'mode', 'listening'), false);
  assert.deepEqual(reconcileSentenceDraftRecovery(clone(first.drafts), clone(pending)), {
    drafts: first.drafts,
    remaining: recovery(conflict),
    applied: [],
  });
  const consumed = consumeSentenceDraft(first.drafts, identity(latest));
  assert.deepEqual(reconcileSentenceDraftRecovery(clone(consumed), clone(pending)), {
    drafts: consumed,
    remaining: recovery(conflict),
    applied: [],
  });
  latest.text = 'Caller changes its text';
  conflict.base.text = 'Caller changes its recovery';
  assert.equal(first.drafts.entries[0].text, 'Latest');
  assert.equal(first.remaining.entries[0].base.text, 'Missing base');
});
