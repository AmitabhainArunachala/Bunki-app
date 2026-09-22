/** Pure capture/display adapter checks. Structural view fixtures below do not
 * authenticate a replica; the sync and native integration suites cover that. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

assert(process.env.KAIRO_SITE_DIR, 'Supply a staged KAIRO_SITE_DIR');
const site = resolve(process.env.KAIRO_SITE_DIR);
const manifest = JSON.parse(readFileSync(resolve(site, 'build-identity.json')));
for (const path of ['source-inbox.mjs', 'modules/reading-core.mjs', 'modules/record-core.mjs']) {
  const bytes = readFileSync(resolve(site, path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.files.find(row => row.path === path)?.sha256);
}
const { acceptSourceCapture, createSourceCapture, createSourceReferenceCapture, parseSourceReferenceInput,
  prepareSourceReferenceCapture, sourceReferenceInputForCapture, sourceReferenceIntent, sourceReferenceShelf,
  registerListeningSource, confirmListeningPosition, selectListeningSource } =
  await import(pathToFileURL(resolve(site, 'source-inbox.mjs')));
const { parseSourceReferencePayload } = await import(pathToFileURL(resolve(site, 'modules/record-core.mjs')));
const id = 'f258c99d-9ff4-471f-8199-3fe94843d661';
const secondId = 'c0c574d7-9e26-4d72-857b-b60906055bce';
const now = '2026-09-13T23:45:12.345Z';
const input = { captureId: id, encounterUrl: 'HTTPS://Example.org:443/watch?v=%2f%2F&name=%E9%A2%A8#t=1m13s', capturedAt: now };
const clone = value => JSON.parse(JSON.stringify(value));
const capture = overrides => createSourceCapture({ id, capturedAt: now, title: '', text: '', url: input.encounterUrl, ...overrides });
const payload = overrides => parseSourceReferencePayload({ kind: 'source.reference', ...input, generation: null, ...overrides });
const view = (payloads = [payload()], overrides = {}) => ({ captureId: id,
  headReferences: payloads.map(value => ({ payload: value, operationRefs: [] })),
  projection: { tombstones: [], requiresChoice: payloads.length > 1, ...overrides } });

test('exact encountered URL bytes and original instant survive the link round trip', () => {
  const saved = createSourceReferenceCapture(input);
  assert.equal(saved.encounterUrl, input.encounterUrl);
  assert.equal(saved.capturedAt, now);
  assert.equal(saved.candidate.article.title, 'example.org');
  assert.equal(saved.candidate.article.body, null);
  assert.deepEqual(sourceReferenceInputForCapture(saved), input);
  assert.deepEqual(createSourceReferenceCapture(sourceReferenceInputForCapture(clone(saved))), saved);
  assert(Object.isFrozen(saved.candidate.article));
});

test('interior Unicode whitespace accepted by source capture remains exact', () => {
  for (const space of ['\u00a0', '\u2003', '\u3000']) {
    const original = { ...input, encounterUrl: `https://example.org/a${space}b?q=${space}#a${space}b` };
    assert.equal(createSourceReferenceCapture(original).encounterUrl, original.encounterUrl);
    assert.deepEqual(sourceReferenceInputForCapture(createSourceReferenceCapture(original)), original);
  }
});

test('wire metadata cannot acquire a body, custom title, editorial review or processing permission', () => {
  const saved = createSourceReferenceCapture(input), article = saved.candidate.article;
  assert.equal(article.body, null);
  assert.equal(saved.candidate.editorial.status, 'pending');
  assert.equal(saved.candidate.generationJob, null);
  for (const [operation, capability] of Object.entries(article.capabilities))
    if (operation !== 'discover-metadata') assert.notEqual(capability.status, 'allowed', operation);
  assert.equal(sourceReferenceInputForCapture(capture({ title: 'My private title' })), null);
  assert.equal(sourceReferenceInputForCapture(capture({ text: '  私の文章。\r\n次の行。  ' })), null);
  assert.equal(sourceReferenceInputForCapture(capture({ url: '', text: 'No URL here.' })), null);
});

test('serializing with a different object key order does not change transfer eligibility', () => {
  const reverse = value => Array.isArray(value) ? value.map(reverse) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverse(item)])) : value;
  assert.deepEqual(sourceReferenceInputForCapture(reverse(capture())), input);
});

test('named input rejects extra authority, body, generation and mutable-source fields', () => {
  for (const [key, value] of Object.entries({ actor: {}, accountId: 'foreign', source: {}, title: 'private', text: 'private',
    capabilities: {}, generation: null, permission: 'allowed', kind: 'source.reference' }))
    assert.throws(() => parseSourceReferenceInput({ ...input, [key]: value }), key);
  for (const key of Object.keys(input)) {
    const missing = { ...input }; delete missing[key];
    assert.throws(() => parseSourceReferenceInput(missing), key);
  }
  let touched = false;
  const getter = { ...input, get actor() { touched = true; return {}; } };
  assert.throws(() => parseSourceReferenceInput(getter)); assert.equal(touched, false);
});

test('invalid pointers and ambiguous dates are refused without normalization', () => {
  for (const encounterUrl of ['javascript:alert(1)', 'file:///private', 'https://u:p@example.org',
    ' https://example.org', 'https://example.org ', 'https://example.org/a b', 'https://example.org/a\tb',
    'https://example.org/a\u0085b', 'https://example.org/a\\b', '\u3000https://example.org', 'https://example.org/\ud800'])
    assert.throws(() => parseSourceReferenceInput({ ...input, encounterUrl }), encounterUrl);
  for (const capturedAt of ['2026-09-13', '2026-09-13T23:45:12Z', '2026-09-14T08:45:12.345+09:00'])
    assert.throws(() => parseSourceReferenceInput({ ...input, capturedAt }), capturedAt);
  assert.throws(() => parseSourceReferenceInput({ ...input, captureId: id.toUpperCase() }));
});

test('initial named intent contains only the exact pointer and cannot revive a generation', () => {
  assert.deepEqual(sourceReferenceIntent(input), { payload: payload(), dependencies: [] });
  assert(Object.isFrozen(sourceReferenceIntent(input).dependencies));
  assert.throws(() => sourceReferenceIntent({ ...input, generation: { opId: 'claim', sha256: '0'.repeat(64) } }));
});

test('preparing an exact duplicate preserves one local capture and refuses identity replacement', () => {
  const initial = prepareSourceReferenceCapture(null, [], input);
  const duplicate = prepareSourceReferenceCapture(initial.inbox, [view()], input);
  assert.equal(duplicate.inbox.entries.length, 1);
  assert.strictEqual(duplicate.inbox, initial.inbox);
  assert.deepEqual(duplicate.intent, initial.intent);
  assert.throws(() => prepareSourceReferenceCapture(initial.inbox, [], { ...input, encounterUrl: 'https://different.invalid/' }), /capture-conflict/u);
  assert.equal(initial.inbox.entries[0].encounterUrl, input.encounterUrl);
});

test('received identities with distinct URL, time or concurrent heads cannot be overwritten', () => {
  for (const received of [view([payload({ encounterUrl: 'https://different.invalid/' })]),
    view([payload({ capturedAt: '2026-09-13T23:45:12.346Z' })]), view([payload(), payload({ encounterUrl: 'https://different.invalid/' })])])
    assert.throws(() => prepareSourceReferenceCapture(null, [received], input), /source-reference-conflict/u);
});

test('hidden and restored histories cannot be revived by a new initial-generation capture', () => {
  for (const received of [view([]), view([], { tombstones: [{}] }), view([payload()], { tombstones: [{}] })])
    assert.throws(() => prepareSourceReferenceCapture(null, [received], input), /source-reference-hidden/u);
});

test('received pointers join the shelf without materializing or changing local captures', () => {
  const local = acceptSourceCapture(null, capture({ id: secondId, text: 'この端末に残る文章。' }));
  const before = JSON.stringify(local), shelf = sourceReferenceShelf(local, [view()]);
  assert.equal(shelf.entries.length, 2);
  assert.equal(shelf.entries.find(entry => entry.id === id).encounterUrl, input.encounterUrl);
  assert.equal(JSON.stringify(local), before);
  assert.equal(local.entries.length, 1);
  assert.equal(shelf.conflicts.length, 0);
  assert(Object.isFrozen(shelf.entries));
});

test('equal payload provenance projects to one visible item and retains existing local identity', () => {
  const local = acceptSourceCapture(null, capture()), received = view();
  received.headReferences[0].operationRefs = [{ opId: 'first-observation' }, { opId: 'second-observation' }];
  const shelf = sourceReferenceShelf(local, [received]);
  assert.equal(shelf.entries.length, 1);
  assert.strictEqual(shelf.entries[0], local.entries[0]);
  assert.deepEqual(shelf.conflicts, []);
});

test('conflicting received links keep explicit choices and never choose by timestamp', () => {
  const local = acceptSourceCapture(null, capture());
  const later = payload({ encounterUrl: 'https://different.invalid/', capturedAt: '2026-09-14T00:00:00.000Z' });
  for (const heads of [[payload(), later], [later, payload()]]) {
    const shelf = sourceReferenceShelf(local, [view(heads)]);
    assert.equal(shelf.entries.length, 0);
    assert.equal(shelf.conflicts.length, 1);
    assert.equal(shelf.conflicts[0].captures.length, 2);
    assert.deepEqual(new Set(shelf.conflicts[0].captures.map(entry => entry.encounterUrl)),
      new Set([input.encounterUrl, later.encounterUrl]));
    assert.equal(local.entries[0].encounterUrl, input.encounterUrl);
  }
});

test('hidden or conflicting remote metadata does not remove a local body or custom title', () => {
  for (const original of [capture({ text: '私が保存した文章。' }), capture({ title: 'My title' })]) {
    const local = acceptSourceCapture(null, original);
    const hidden = sourceReferenceShelf(local, [view([])]);
    assert.strictEqual(hidden.entries[0], local.entries[0]);
    assert.deepEqual(hidden.hiddenIds, [id]);
    const conflicting = sourceReferenceShelf(local, [view()]);
    assert.strictEqual(conflicting.entries[0], local.entries[0]);
    assert.equal(conflicting.conflicts.length, 1);
  }
  assert.equal(sourceReferenceShelf(acceptSourceCapture(null, capture()), [view([])]).entries.length, 0);
});

test('a head for a different capture identity cannot be displayed under this capture', () => {
  assert.throws(() => sourceReferenceShelf(null, [view([payload({ captureId: secondId })])]), /source-reference-conflict/u);
});

test('remote pointer deletion or conflict preserves the ordinary local media route and saved position', () => {
  const registered = registerListeningSource(acceptSourceCapture(null, capture()), { sourceId: id, kind: 'video', creator: 'Local creator' });
  const positioned = confirmListeningPosition(registered, { sourceId: id, seconds: 73, revision: secondId,
    confirmedAt: now, expectedRevision: null });
  for (const local of [registered, positioned]) {
    const before = JSON.stringify(local);
    for (const received of [view([]), view([payload({ encounterUrl: 'https://different.invalid/' })]),
      view([payload(), payload({ encounterUrl: 'https://different.invalid/' })])]) {
      const shelf = sourceReferenceShelf(local, [received]);
      assert.strictEqual(shelf.entries[0], local.entries[0]);
      assert.equal(shelf.entries[0].encounterUrl, input.encounterUrl);
      assert.equal(JSON.stringify(local), before);
    }
  }
  assert.equal(selectListeningSource(positioned, id).position.seconds, 73);
});
