import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  TeacherContextError,
  activateTeacherContext,
  createTeacherContext,
  digestText,
  parseTeacherContext,
  parseTeacherContexts,
  selectTeacherContext,
  sourceSentenceContext,
  verifyTeacherContext,
} from '../teacher-context.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));
const digest = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const source = '朝、駅へ歩いた。';
const input = (overrides = {}) => ({
  sourceKind: 'bundled-passage',
  sourceId: 'morning-walk',
  sourceDigest: digest(source),
  unit: 'token-index',
  start: 0,
  end: 6,
  index: 2,
  quote: source,
  title: '朝の散歩',
  attribution: 'Bunki example',
  url: null,
  target: { type: 'word', id: '駅' },
  ...overrides,
});
const rejects = (code) => (error) => error instanceof TeacherContextError && error.code === code;

async function textEncounter(text, quote, overrides = {}) {
  const start = text.indexOf(quote);
  return createTeacherContext(input({ sourceKind: 'personal-reading', unit: 'utf16-code-unit',
    sourceDigest: digest(text), start, end: start + quote.length, index: start, quote, ...overrides }));
}

test('learning sentence retains exact Unicode bytes, selected index and source metadata', async () => {
  const text = '前の文。🚀駅で e\u0301 を見た。\n次の文。';
  const original = await textEncounter(text, '駅');
  const expanded = await sourceSentenceContext(original, text);
  assert.equal(expanded.quote, '🚀駅で e\u0301 を見た。');
  assert.equal(expanded.index, original.index);
  assert.equal(expanded.start, text.indexOf('🚀'));
  assert.equal(expanded.end, expanded.start + expanded.quote.length);
  for (const key of ['target', 'sourceKind', 'sourceId', 'sourceDigest', 'title', 'attribution', 'url'])
    assert.deepEqual(expanded[key], original[key]);
  assert.equal(original.quote, '駅');
  assert.deepEqual(await verifyTeacherContext(expanded), expanded);
});

test('learning sentence respects lines and selections spanning sentence endings', async () => {
  const text = '前\r\n駅へ！次も行く？\n後';
  assert.equal((await sourceSentenceContext(await textEncounter(text, '駅'), text)).quote, '駅へ！');
  assert.equal((await sourceSentenceContext(await textEncounter(text, '駅へ！次'), text)).quote, '駅へ！次も行く？');
  assert.equal((await sourceSentenceContext(await textEncounter(text, '駅へ！'), text)).quote, '駅へ！');
});

test('an overlong sentence keeps the bounded encounter rather than truncating source text', async () => {
  const text = 'あ'.repeat(4000) + '駅。';
  const original = await textEncounter(text, '駅');
  assert.deepEqual(await sourceSentenceContext(original, text), original);
});

test('sentence expansion refuses changed source bytes, forged ids and the wrong coordinate unit', async () => {
  const original = await textEncounter('駅へ行く。', '駅');
  await assert.rejects(sourceSentenceContext(original, '駅へ来る。'), rejects('source-mismatch'));
  await assert.rejects(sourceSentenceContext({ ...original, title: 'forged' }, '駅へ行く。'), rejects('digest-mismatch'));
  await assert.rejects(sourceSentenceContext(await createTeacherContext(input()), source), rejects('invalid-unit'));
});

test('constructs and verifies an exact immutable record with independent SHA-256 evidence', async () => {
  const initial = input();
  const before = clone(initial);
  const context = await createTeacherContext(initial);
  const content = { ...before, version: 1 };
  const canonical = {};
  for (const key of Object.keys(content).sort()) {
    canonical[key] =
      key === 'target' ? { id: content.target.id, type: content.target.type } : content[key];
  }
  assert.equal(context.id, `teacher-context:${digest(JSON.stringify(canonical))}`);
  assert.equal(
    await digestText('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  assert.deepEqual(await verifyTeacherContext(context), context);
  assert.deepEqual(await verifyTeacherContext(JSON.stringify(context)), context);
  assert.deepEqual(initial, before);
  initial.target.id = 'changed outside';
  assert.equal(context.target.id, '駅');
  assert(Object.isFrozen(context));
  assert(Object.isFrozen(context.target));
  assert.throws(() => {
    context.title = 'changed';
  }, TypeError);
  assert.throws(() => {
    context.target.id = 'changed';
  }, TypeError);
});

test('canonical identity ignores property order and changes with every content field', async () => {
  const original = await createTeacherContext(input());
  const reordered = Object.fromEntries(Object.entries(input()).reverse());
  reordered.target = { id: '駅', type: 'word' };
  assert.equal((await createTeacherContext(reordered)).id, original.id);
  assert.equal((await createTeacherContext({ version: 1, ...input() })).id, original.id);
  const changes = [
    { sourceId: 'another-passage' },
    { sourceDigest: digest(`${source}次。`) },
    { start: 1 },
    { end: 7 },
    { index: 3 },
    { quote: `${source}次。` },
    { title: '別の題' },
    { attribution: 'Another author' },
    { url: 'https://example.test/reading?part=1#station' },
    { target: { type: 'word', id: '歩く' } },
    { target: { type: 'kanji', id: '駅' } },
    { target: null },
  ];
  for (const change of changes)
    assert.notEqual(
      (await createTeacherContext(input(change))).id,
      original.id,
      JSON.stringify(change),
    );
});

test('parsing checks structure while verification detects corrupted content-derived ids', async () => {
  const context = await createTeacherContext(input());
  const altered = { ...clone(context), title: 'Altered title' };
  assert.equal(parseTeacherContext(altered).title, 'Altered title');
  await assert.rejects(verifyTeacherContext(altered), rejects('digest-mismatch'));
  await assert.rejects(
    verifyTeacherContext({ ...context, id: `teacher-context:${'0'.repeat(64)}` }),
    rejects('digest-mismatch'),
  );
  assert.equal(
    (await createTeacherContext(input({ sourceDigest: '0'.repeat(64) }))).sourceDigest,
    '0'.repeat(64),
    'this data contract does not validate or admit source content',
  );
});

test('personal and publisher spans preserve exact UTF-16 emoji and normalization distinctions', async () => {
  const fullSource = '前文。猫🐈がいる。後文。';
  const quote = '猫🐈がいる。';
  const start = fullSource.indexOf(quote);
  const personalInput = input({
    sourceKind: 'personal-reading',
    sourceId: 'personal:1',
    sourceDigest: digest(fullSource),
    unit: 'utf16-code-unit',
    start,
    end: start + quote.length,
    index: start + 1,
    quote,
    target: { type: 'kanji', id: '猫' },
  });
  const personal = await createTeacherContext(personalInput);
  assert.equal(fullSource.slice(personal.start, personal.end), personal.quote);
  assert.equal(personal.quote.length, 7);
  assert.equal(personal.index, start + 1);
  assert.deepEqual(await verifyTeacherContext(JSON.stringify(personal)), personal);
  const publisher = await createTeacherContext({
    ...personalInput,
    sourceKind: 'publisher-reading',
    url: 'https://example.test/記事',
    attribution: '掲載者',
  });
  assert.notEqual(publisher.id, personal.id);
  await assert.rejects(
    createTeacherContext({ ...personalInput, end: start + [...quote].length }),
    rejects('invalid-span'),
  );
  await assert.rejects(
    createTeacherContext({ ...personalInput, index: start + 2 }),
    rejects('invalid-span'),
  );
  const decomposed = 'か\u3099';
  assert.notEqual(await digestText(decomposed), await digestText(decomposed.normalize('NFC')));
  const exact = await createTeacherContext(input({ quote: ` ${decomposed}\n` }));
  assert.equal(exact.quote, ` ${decomposed}\n`);
});

test('all kind and span-unit mappings are enforced', async () => {
  for (const sourceKind of ['bundled-passage', 'personal-reading', 'publisher-reading']) {
    const unit = sourceKind === 'bundled-passage' ? 'token-index' : 'utf16-code-unit';
    const context = await createTeacherContext(
      input({
        sourceKind,
        unit,
        start: 0,
        end: sourceKind === 'bundled-passage' ? 6 : source.length,
      }),
    );
    assert.equal(context.unit, unit);
    await assert.rejects(
      createTeacherContext(
        input({ sourceKind, unit: unit === 'token-index' ? 'utf16-code-unit' : 'token-index' }),
      ),
      rejects('invalid-unit'),
    );
  }
  for (const sourceKind of ['unknown', '__proto__', 'constructor', null, 1])
    await assert.rejects(
      createTeacherContext(input({ sourceKind })),
      rejects('invalid-source-kind'),
    );
});

test('constructor rejects permission/provider flags and every unknown or missing field', async () => {
  for (const field of [
    'allowAI',
    'aiAllowed',
    'provider',
    'providerAllowed',
    'sourcePermission',
    'sourceProcessingAllowed',
    'consent',
    'verified',
    'timestamp',
    'id',
  ]) {
    await assert.rejects(
      createTeacherContext({ ...input(), [field]: true }),
      rejects('invalid-fields'),
    );
  }
  for (const field of Object.keys(input())) {
    const missing = input();
    delete missing[field];
    await assert.rejects(createTeacherContext(missing), rejects('invalid-fields'), field);
  }
  for (const version of [undefined, null, 0, 2, '1'])
    await assert.rejects(createTeacherContext({ ...input(), version }), rejects('invalid-version'));
});

test('bounds reject oversized records and preserve exact maximum-size values', async () => {
  const bounds = [
    ['sourceId', 4096],
    ['quote', 4000],
    ['title', 500],
    ['attribution', 1000],
  ];
  for (const [field, limit] of bounds) {
    const value = '字'.repeat(limit);
    assert.equal((await createTeacherContext(input({ [field]: value })))[field], value);
    await assert.rejects(
      createTeacherContext(input({ [field]: `${value}字` })),
      rejects('invalid-text'),
    );
  }
  for (const [field, value] of [
    ['sourceId', ''],
    ['quote', ''],
    ['quote', null],
    ['title', undefined],
    ['attribution', 1],
  ])
    await assert.rejects(createTeacherContext(input({ [field]: value })), rejects('invalid-text'));
  assert.equal(
    (await createTeacherContext(input({ title: '', attribution: '', target: null }))).title,
    '',
  );
  assert.equal(
    (await createTeacherContext(input({ target: { type: 'grammar', id: '字'.repeat(160) } })))
      .target.id.length,
    160,
  );
  await assert.rejects(
    createTeacherContext(input({ target: { type: 'word', id: '字'.repeat(161) } })),
    rejects('invalid-text'),
  );
});

test('unsafe scalars and impossible spans are rejected without numeric coercion', async () => {
  for (const field of ['start', 'end', 'index']) {
    for (const value of [
      -0,
      -1,
      0.5,
      Number.NaN,
      Infinity,
      -Infinity,
      Number.MAX_SAFE_INTEGER + 1,
      '1',
      null,
      undefined,
      1n,
    ])
      await assert.rejects(
        createTeacherContext(input({ [field]: value })),
        rejects('invalid-integer'),
      );
  }
  for (const span of [
    { start: 3, end: 3, index: 3 },
    { start: 4, end: 3, index: 4 },
    { start: 3, end: 6, index: 2 },
    { start: 0, end: 6, index: 6 },
  ])
    await assert.rejects(createTeacherContext(input(span)), rejects('invalid-span'));
  for (const field of ['sourceId', 'quote', 'title', 'attribution']) {
    for (const value of ['\ud800', '\udc00', 'bad\u0000text', 'bad\u007ftext'])
      await assert.rejects(
        createTeacherContext(input({ [field]: value })),
        rejects('invalid-text'),
      );
  }
  for (const value of ['\ud800', '\udc00', null, 1])
    await assert.rejects(digestText(value), rejects('invalid-text'));
});

test('digest, id and target values use a strict closed shape', async () => {
  const context = await createTeacherContext(input());
  for (const sourceDigest of [
    'a'.repeat(63),
    'a'.repeat(65),
    'A'.repeat(64),
    'g'.repeat(64),
    null,
    1,
  ])
    await assert.rejects(createTeacherContext(input({ sourceDigest })), rejects('invalid-digest'));
  for (const id of [
    'a'.repeat(64),
    `teacher-context:${'A'.repeat(64)}`,
    `teacher-context:${'a'.repeat(63)}`,
    null,
    1,
  ])
    assert.throws(() => parseTeacherContext({ ...context, id }), rejects('invalid-reference'));
  for (const type of ['word', 'kanji', 'grammar', 'particle'])
    assert.equal(
      (await createTeacherContext(input({ target: { type, id: '駅' } }))).target.type,
      type,
    );
  for (const target of [
    undefined,
    [],
    'word',
    { type: 'word' },
    { type: 'word', id: '駅', allowAI: true },
  ])
    await assert.rejects(createTeacherContext(input({ target })), TeacherContextError);
  for (const target of [
    { type: 'other', id: '駅' },
    { type: 'word', id: '' },
    { type: 'word', id: '駅\n' },
    { type: 'word', id: '\ud800' },
  ])
    await assert.rejects(createTeacherContext(input({ target })), TeacherContextError);
});

test('URLs are exact explicit HTTP(S) links without credentials or parser ambiguities', async () => {
  for (const url of [
    null,
    'http://example.test/reading',
    'https://example.test/記事?q=猫#一',
    'HTTPS://EXAMPLE.TEST:443/reading?x=%20',
  ])
    assert.equal((await createTeacherContext(input({ url }))).url, url);
  for (const url of [
    '',
    '/relative',
    '//example.test',
    'javascript:alert(1)',
    'file:///reading',
    'data:text/html,test',
    'https://user:pass@example.test/',
    'https://user@example.test/',
    'https://@example.test/',
    'https:///missing-authority',
    'https://example.test/space here',
    'https://example.test\n/path',
    'https:\\example.test',
    'https://example.test\\other',
    ' https://example.test/',
    'https://',
    1,
    'https://example.test/' + 'x'.repeat(4096),
  ])
    await assert.rejects(createTeacherContext(input({ url })), TeacherContextError, String(url));
});

test('parsers reject duplicate JSON fields, permission flags and prototype pollution', async () => {
  const context = await createTeacherContext(input());
  const serialized = JSON.stringify(context);
  for (const raw of [
    serialized.replace('"version":1', '"version":1,"version":1'),
    serialized.replace('"version":1', '"version":1,"\\u0076ersion":1'),
    serialized.replace('"type":"word"', '"type":"word","type":"kanji"'),
  ])
    assert.throws(() => parseTeacherContext(raw), rejects('duplicate-field'));
  for (const field of ['__proto__', 'constructor', 'prototype', 'allowAI', 'sourceAllowed']) {
    const unsafe = JSON.parse(serialized.slice(0, -1) + `,"${field}":{"polluted":true}}`);
    assert.throws(() => parseTeacherContext(unsafe), rejects('invalid-fields'));
  }
  assert.equal({}.polluted, undefined);
  assert.throws(() => parseTeacherContext('{broken'), rejects('invalid-json'));
  assert.throws(
    () => parseTeacherContext(JSON.stringify({ ...context, allowAI: true })),
    rejects('invalid-fields'),
  );
});

test('accessors, symbols, hidden fields and unexpected prototypes never enter a record', async () => {
  const context = await createTeacherContext(input());
  const getter = { ...context };
  let reads = 0;
  Object.defineProperty(getter, 'title', {
    enumerable: true,
    get() {
      reads += 1;
      return 'unsafe';
    },
  });
  assert.throws(() => parseTeacherContext(getter), rejects('invalid-property'));
  assert.equal(reads, 0);
  const hidden = { ...context };
  Object.defineProperty(hidden, 'title', { enumerable: false, value: 'hidden' });
  assert.throws(() => parseTeacherContext(hidden), rejects('invalid-property'));
  assert.throws(
    () => parseTeacherContext({ ...context, [Symbol('permission')]: true }),
    rejects('invalid-fields'),
  );
  assert.throws(
    () => parseTeacherContext(Object.assign(Object.create({ allowAI: true }), context)),
    rejects('invalid-object'),
  );
  const plain = Object.assign(Object.create(null), clone(context));
  assert.deepEqual(parseTeacherContext(plain), context);
  const parsed = parseTeacherContext(clone(context));
  assert(Object.isFrozen(parsed.target));
});

test('a missing legacy root is empty; every present root is strict', async () => {
  const empty = { version: 1, activeRef: null, entries: [] };
  for (const raw of [null, undefined, 'null']) assert.deepEqual(parseTeacherContexts(raw), empty);
  assert.deepEqual(parseTeacherContexts(), empty);
  assert(Object.isFrozen(parseTeacherContexts().entries));
  for (const raw of [
    {},
    { entries: [] },
    { ...empty, version: 2 },
    { ...empty, consent: true },
    { ...empty, activeRef: undefined },
    { ...empty, entries: null },
    '',
    [],
    false,
  ])
    assert.throws(() => parseTeacherContexts(raw), TeacherContextError);
  assert.throws(
    () => parseTeacherContexts('{"version":1,"activeRef":null,"entries":[],"entries":[]}'),
    rejects('duplicate-field'),
  );
});

test('selection appends, deduplicates identical records, preserves history and does not mutate inputs', async () => {
  const first = await createTeacherContext(input());
  const second = await createTeacherContext(input({ sourceId: 'second-reading' }));
  const empty = { version: 1, activeRef: null, entries: [] };
  const one = selectTeacherContext(empty, first);
  const two = selectTeacherContext(one, second);
  const back = selectTeacherContext(two, clone(first));
  assert.deepEqual(empty, { version: 1, activeRef: null, entries: [] });
  assert.equal(one.entries.length, 1);
  assert.deepEqual(
    two.entries.map((row) => row.id),
    [first.id, second.id],
  );
  assert.equal(two.activeRef, second.id);
  assert.deepEqual(back.entries, two.entries);
  assert.equal(back.activeRef, first.id);
  assert.deepEqual(parseTeacherContexts(JSON.stringify(back)), back);
  assert(Object.isFrozen(back));
  assert(Object.isFrozen(back.entries));
  assert(Object.isFrozen(back.entries[0]));
  assert(Object.isFrozen(back.entries[0].target));
  assert.throws(() => {
    back.entries.push(second);
  }, TypeError);
  assert.throws(() => {
    back.entries[0].target.type = 'particle';
  }, TypeError);
  assert.throws(
    () => selectTeacherContext(two, { ...first, quote: 'Different content, reused id' }),
    rejects('context-conflict'),
  );
});

test('activation and deselection change only the active reference', async () => {
  const first = await createTeacherContext(input());
  const second = await createTeacherContext(input({ sourceId: 'second-reading' }));
  const selected = selectTeacherContext(selectTeacherContext(null, first), second);
  const activated = activateTeacherContext(selected, first.id);
  const cleared = activateTeacherContext(activated, null);
  assert.deepEqual(cleared.entries, selected.entries);
  assert.equal(activated.activeRef, first.id);
  assert.equal(cleared.activeRef, null);
  assert.equal(selected.activeRef, second.id);
  assert.throws(
    () => activateTeacherContext(selected, `teacher-context:${'0'.repeat(64)}`),
    rejects('dangling-reference'),
  );
  assert.throws(() => activateTeacherContext(selected, undefined), rejects('invalid-reference'));
});

test('duplicate entries and dangling selection are rejected, never repaired or discarded', async () => {
  const first = await createTeacherContext(input());
  const other = await createTeacherContext(input({ sourceId: 'other' }));
  assert.throws(
    () => parseTeacherContexts({ version: 1, activeRef: null, entries: [JSON.stringify(first)] }),
    rejects('invalid-object'),
  );
  assert.throws(
    () => parseTeacherContexts({ version: 1, activeRef: first.id, entries: [first, first] }),
    rejects('duplicate-context'),
  );
  assert.throws(
    () => parseTeacherContexts({ version: 1, activeRef: other.id, entries: [first] }),
    rejects('dangling-reference'),
  );
  const sparse = new Array(1);
  const augmented = [first];
  augmented.allowAI = true;
  const accessor = [first];
  Object.defineProperty(accessor, '0', {
    enumerable: true,
    get() {
      throw new Error('must not read');
    },
  });
  for (const entries of [sparse, augmented, accessor])
    assert.throws(
      () => parseTeacherContexts({ version: 1, activeRef: null, entries }),
      rejects('invalid-array'),
    );
});

test('selection has no historical retention cap and all prior context ids survive round-trip', async () => {
  const contexts = await Promise.all(
    Array.from({ length: 1201 }, (_, index) =>
      createTeacherContext(input({ sourceId: `reading-${index}` })),
    ),
  );
  const oldRoot = parseTeacherContexts({
    version: 1,
    activeRef: contexts[0].id,
    entries: contexts.slice(0, 1200),
  });
  const appended = selectTeacherContext(oldRoot, contexts[1200]);
  const restored = parseTeacherContexts(JSON.stringify(appended));
  assert.equal(oldRoot.entries.length, 1200);
  assert.equal(restored.entries.length, 1201);
  assert.deepEqual(
    restored.entries.map((entry) => entry.id),
    contexts.map((entry) => entry.id),
  );
  assert.equal(restored.activeRef, contexts[1200].id);
  assert.equal(selectTeacherContext(restored, contexts[0]).entries.length, 1201);
});
