/** Executable identity/admission verifier; no storage, network or browser. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as subject from '../m4-worldcraft.mjs';

const base = new URL('../', import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceNames = {
  familyBytes: 'kanji-family.json', structureBytes: 'kanji-structure.json',
  kanjiBytes: 'kanji.json', wordsBytes: 'words.json', strokesBytes: 'strokes.json',
};
const expectedPins = {
  familyBytes: 'd164ec7b2fe39c5920d7fc05f4731c79db535815c5495aea7c2904b59532499b',
  structureBytes: '1d20c18a662734f84eb6b718457de35536d51952b56328cefa7eaa111251537a',
  kanjiBytes: '8ce7ad0151a2bf487bda72c384460eca908fc1bdc2a4073042b9e3db7342d2ce',
  wordsBytes: 'd21ff76508a3ed88cec9c096510feac9b5ff2df639061a3be46cb85c6fdf985b',
  strokesBytes: '435c37c0063fba4180d3cb444ef54cfa2430e71a650a4032cc481ada29627f2b',
};
const bytes = Object.fromEntries(Object.entries(sourceNames).map(([key, file]) =>
  [key, readFileSync(new URL('data/share_alike/' + file, base))]));
const fresh = () => Object.fromEntries(Object.entries(bytes).map(([key, value]) => [key, new Uint8Array(value)]));
const actual = result => { assert.equal(result.ok, true, result.reason); return result.value; };
const refused = (result, reason) => { assert.equal(result.ok, false); if (reason) assert.equal(result.reason, reason); };
let cases = 0;
async function test(name, body) { await body(); cases++; console.log('PASS ' + name); }

await test('all five original JSON pins and both protected implementation pins', () => {
  for (const [key, value] of Object.entries(bytes)) {
    assert.equal(sha(value), expectedPins[key]);
    assert.equal(subject.SOURCE_PINS[key].sha256, expectedPins[key]);
  }
  for (const [file, pin] of [
    ['kanji-family.js', '4ef1f820d7ec996d75e0e0be6a322707745e2a234064afed5d3f85e3a980ceb8'],
    ['kanji-structure.js', '8016d951b0ccc3f018b408697195986a7eaa6e67f39c66e9001374515d2c1a42'],
  ]) assert.equal(sha(readFileSync(new URL(file, base))), pin);
});
const catalog = actual(await subject.createWorldcraftCatalog(bytes));
const expected = {
  職: { left: '耳', groups: ['kvg:08077-g1', 'kvg:08077-g2'], count: 18, split: 6,
    source: 'c004baafee3021780fa772c6da927bc30cf40c379da96e8ae5b41e927337f1ee',
    recipe: 'e456fc1e51299a078a4d7894283264487876f4009b50c618fe579d2d01febe3a' },
  識: { left: '言', groups: ['kvg:08b58-g1', 'kvg:08b58-g3'], count: 19, split: 7,
    source: '4fb80f7684e1299ddea6e056cc65fed76599e584ac06330d29bf6ecf22f90abd',
    recipe: '8c28a39718d314a46b763f3d64654c264ef59e4056c9e1f9a5d586018d235904' },
  織: { left: '糸', groups: ['kvg:07e54-g1', 'kvg:07e54-g2'], count: 18, split: 6,
    source: '464a97cde3a8cba2aff6c5eeefa99a377526bde24ce8d53cbbd9d1e1350233d1',
    recipe: 'a9857ec7993cdcac3fd36b2b827c7a8c50e80906df8af1314b41c60351326d6c' },
};
const family = JSON.parse(bytes.familyBytes);
await test('three exact recipes use glyph root, own slots, source paths and digest', () => {
  for (const [host, e] of Object.entries(expected)) {
    const built = actual(subject.resolveBuild(catalog, { host, left: e.left, right: '戠' }));
    assert.equal(built.recipe.rootOccurrenceId, JSON.stringify(['kanjivg-occurrence',
      '61e39cfc29724132a6f8823b166296932985a0ff', host, e.source, '$/0']));
    assert.equal(built.recipe.sourceSHA256, e.source);
    assert.equal(built.recipe.paths.length, e.count);
    assert.deepEqual(built.recipe.strokeIndices, Array.from({ length: e.count }, (_, i) => i));
    assert.equal(built.ref.recipeSHA256, e.recipe);
    assert.equal(sha(JSON.stringify(built.recipe)), e.recipe);
    built.ref.slots.forEach((slot, i) => {
      const row = family.nodes.find(n => n.reference.id === slot.occurrenceId);
      assert.equal(row.host.id, host); assert.equal(row.sourceGroupId, e.groups[i]);
      assert.equal(row.sourceSha256, e.source);
      assert.equal(row.groupPath, i ? '$/0/1' : '$/0/0');
      assert.equal(row.strokeIndices.length, i ? 12 : e.split);
      assert.equal(slot.roleEdgeId, (i ? '戠:phonetic-component-of:' : e.left + ':semantic-component-of:') + host);
      assert.equal(slot.occurrenceEdgeId, host + ':' + slot.part + ':source-occurrence');
    });
    assert.throws(() => { built.recipe.paths[0] = 'invented'; }, TypeError);
    assert.throws(() => { built.ref.slots[0].occurrenceId = 'borrowed'; }, TypeError);
  }
});
function wrongPart(api, admitted) {
  refused(api.resolveBuild(admitted, { host: '識', left: '耳', right: '戠' }), 'part-host-role-mismatch');
}
function borrowedPart(api, admitted) {
  const own = actual(api.resolveBuild(admitted, { host: '識', left: '言', right: '戠' }));
  const other = actual(api.resolveBuild(admitted, { host: '織', left: '糸', right: '戠' }));
  refused(api.resolveBuild(admitted, { host: '識', left: '言', right: '戠',
    occurrenceIds: [own.ref.slots[0].occurrenceId, other.ref.slots[1].occurrenceId] }), 'occurrence-host-mismatch');
}
await test('borrowed-host 12-stroke 戠 cannot substitute for 識 g3', () => borrowedPart(subject, catalog));
await test('wrong left, invented part, unsupported host and wrapper witness refuse', () => {
  wrongPart(subject, catalog);
  refused(subject.resolveBuild(catalog, { host: '識', left: 'invented', right: '戠' }));
  refused(subject.resolveBuild(catalog, { host: '__proto__', left: '耳', right: '戠' }));
  const built = actual(subject.resolveBuild(catalog, { host: '職', left: '耳', right: '戠' }));
  refused(subject.resolveBuild(catalog, { host: '職', left: '耳', right: '戠',
    occurrenceIds: [built.recipe.rootOccurrenceId, built.ref.slots[1].occurrenceId] }));
});
await test('all five individually changed sources refuse against fixed pins', async () => {
  for (const key of Object.keys(bytes)) {
    const changed = fresh(); changed[key][changed[key].length - 1] ^= 1;
    refused(await subject.createWorldcraftCatalog(changed), 'source-hash-mismatch:' + key);
    refused(await subject.createWorldcraftCatalog({ ...changed, expectedPins: { [key]: sha(changed[key]) } }), 'source-input-shape');
  }
});
await test('parsed maps, strings, extra models, incomplete and shared-memory inputs refuse', async () => {
  for (const replacement of [JSON.parse(bytes.structureBytes), bytes.structureBytes.toString(), null]) {
    refused(await subject.createWorldcraftCatalog({ ...bytes, structureBytes: replacement }));
  }
  const incomplete = { ...bytes }; delete incomplete.strokesBytes;
  refused(await subject.createWorldcraftCatalog(incomplete));
  refused(await subject.createWorldcraftCatalog({ ...bytes, structure: { project() {} } }));
  const shared = new Uint8Array(new SharedArrayBuffer(bytes.familyBytes.length)); shared.set(bytes.familyBytes);
  refused(await subject.createWorldcraftCatalog({ ...bytes, familyBytes: shared }));
});
await test('all bytes copied before await; caller overwrite does not alter admission', async () => {
  const changed = fresh(), pending = subject.createWorldcraftCatalog(changed);
  Object.values(changed).forEach(value => value.fill(0));
  const saved = actual(await pending);
  assert.equal(actual(subject.resolveBuild(saved, { host: '識', left: '言', right: '戠' })).ref.recipeSHA256, expected.識.recipe);
});
async function bufferCopy(api) {
  const input = fresh(), buffer = input.familyBytes.buffer;
  let sliceCalls = 0;
  buffer.slice = () => { sliceCalls++; return buffer; };
  input.familyBytes = buffer;
  const pending = api.createWorldcraftCatalog(input);
  // Still valid JSON and an admissible family title, but not the pinned bytes.
  const index = bytes.familyBytes.indexOf('Characters');
  assert.ok(index > 0);
  new Uint8Array(buffer)[index] = 'c'.charCodeAt(0);
  const saved = actual(await pending);
  assert.equal(actual(api.inspectWorldcraftCatalog(saved)).family.titleEn, family.family.titleEn);
  assert.equal(sliceCalls, 0);
}
await test('ArrayBuffer slice override cannot alias the hashed and decoded bytes', () => bufferCopy(subject));
async function byteBrands(api) {
  for (const kind of ['iterator', 'length', 'typed-prototype', 'buffer-proxy', 'view-proxy']) {
    let callbacks = 0;
    const get = () => { callbacks++; return bytes.familyBytes.length; };
    let forged = Object.create(kind === 'typed-prototype' ? Uint8Array.prototype : ArrayBuffer.prototype);
    if (kind === 'iterator') {
      Object.defineProperty(forged, Symbol.iterator, { get() {
        callbacks++;
        return function () { callbacks++; return bytes.familyBytes[Symbol.iterator](); };
      } });
    } else {
      Object.defineProperties(forged, { length: { get }, byteLength: { get }, 0: { get } });
    }
    if (kind.endsWith('-proxy')) {
      const data = new Uint8Array(bytes.familyBytes);
      forged = new Proxy(kind === 'buffer-proxy' ? data.buffer : data, {
        get(target, key) { callbacks++; return Reflect.get(target, key); },
        getPrototypeOf(target) { callbacks++; return Reflect.getPrototypeOf(target); },
      });
    }
    refused(await api.createWorldcraftCatalog({ ...bytes, familyBytes: forged }), 'source-bytes-required');
    assert.equal(callbacks, 0, kind + ' must not invoke caller callbacks');
  }
}
await test('3A-I1 forged buffer/view brands and iterator/length/proxy callbacks refuse untouched', () => byteBrands(subject));
await test('real byte spans ignore shadow getters; shared backing cannot disguise its brand', async () => {
  for (const kind of ['buffer', 'view']) {
    let callbacks = 0;
    const data = new Uint8Array(bytes.familyBytes), value = kind === 'buffer' ? data.buffer : data;
    for (const key of ['buffer', 'length', 'byteLength', Symbol.iterator, Symbol.toStringTag]) {
      Object.defineProperty(value, key, { get() { callbacks++; throw new Error('shadow getter'); } });
    }
    actual(await subject.createWorldcraftCatalog({ ...bytes, familyBytes: value }));
    assert.equal(callbacks, 0);
  }
  const shared = new Uint8Array(new SharedArrayBuffer(bytes.familyBytes.length));
  shared.set(bytes.familyBytes);
  Object.setPrototypeOf(shared.buffer, ArrayBuffer.prototype);
  refused(await subject.createWorldcraftCatalog({ ...bytes, familyBytes: shared }), 'source-bytes-required');
});
await test('exact spans and ordinary ArrayBuffers admit; surrounding bytes do not', async () => {
  const spans = Object.fromEntries(Object.entries(bytes).map(([key, value]) => {
    const padded = new Uint8Array(value.length + 12).fill(99);
    padded.set(value, 5); return [key, padded.subarray(5, 5 + value.length)];
  }));
  actual(await subject.createWorldcraftCatalog(spans));
  actual(await subject.createWorldcraftCatalog(Object.fromEntries(Object.entries(bytes).map(([key, value]) =>
    [key, new Uint8Array(value).buffer]))));
  refused(await subject.createWorldcraftCatalog({ ...spans, familyBytes: spans.familyBytes.buffer }));
});
await test('opaque custody rejects copied, proxied, prototype and foreign-module tokens', async () => {
  const foreign = await import(new URL('../m4-worldcraft.mjs?foreign-custody', import.meta.url));
  const foreignToken = actual(await foreign.createWorldcraftCatalog(bytes));
  for (const forged of [{}, { ...catalog }, JSON.parse(JSON.stringify(catalog)),
    Object.create(catalog), new Proxy(catalog, {}), foreignToken]) {
    refused(subject.inspectWorldcraftCatalog(forged), 'catalog-not-admitted');
    refused(subject.resolveBuild(forged, { host: '職', left: '耳', right: '戠' }));
  }
});
await test('accessor inputs refuse without invoking caller getters; revoked proxies refuse', async () => {
  let called = 0;
  const getter = () => { called++; throw new Error('getter must not execute'); };
  const input = { ...bytes };
  Object.defineProperty(input, 'familyBytes', { get: getter });
  refused(await subject.createWorldcraftCatalog(input), 'source-input-shape');
  const request = { left: '言', right: '戠' };
  Object.defineProperty(request, 'host', { get: getter });
  refused(subject.resolveBuild(catalog, request), 'build-request-shape');
  const ids = ['left', 'right'];
  Object.defineProperty(ids, 0, { get: getter });
  refused(subject.resolveBuild(catalog, { host: '識', left: '言', right: '戠', occurrenceIds: ids }), 'occurrence-host-mismatch');
  const reference = { type: 'word', id: '知識' };
  Object.defineProperty(reference, 'reading', { get: getter });
  refused(subject.resolveWorldcraftWord(catalog, reference), 'word-reference-shape');
  const { proxy, revoke } = Proxy.revocable({}, {}); revoke();
  refused(subject.resolveBuild(catalog, proxy), 'build-request-shape');
  refused(subject.resolveWorldcraftWord(catalog, proxy), 'word-reference-shape');
  assert.equal(called, 0);
});
await test('word spelling plus exact reading and real contextual example identity survive', () => {
  for (const [id, reading] of [['職業', 'しょくぎょう'], ['知識', 'ちしき'], ['組織', 'そしき']]) {
    const reference = { type: 'word', id, reading }, word = actual(subject.resolveWorldcraftWord(catalog, reference));
    assert.deepEqual(word.reference, reference); assert.ok(word.evidence.length);
    assert.equal(word.examples.length, 1);
    const example = word.examples[0];
    assert.deepEqual(example.word, reference);
    assert.equal(example.rawRow[0][example.tokenIndex][0], id);
    assert.ok(example.reference.id.startsWith('["bundled-example",'));
    refused(subject.resolveWorldcraftWord(catalog, { type: 'word', id, reading: 'wrong' }));
    refused(subject.resolveWorldcraftWord(catalog, { type: 'word', id }));
    refused(subject.resolveWorldcraftWord(catalog, { type: 'word', id: '', reading }), 'word-reference-shape');
    refused(subject.resolveWorldcraftWord(catalog, { type: 'word', id, reading: '' }), 'word-reference-shape');
  }
});
await test('typed edge requires the correct direction, endpoints and authored role', () => {
  const from = { type: 'kanji', id: '職' }, to = { type: 'kanji', id: '戠' };
  const hop = { edgeId: '戠:phonetic-component-of:職', from, to, direction: 'incoming' };
  assert.equal(actual(subject.resolveWorldcraftHop(catalog, hop)).relation, 'phonetic-component');
  assert.equal(actual(subject.resolveWorldcraftHop(catalog, { ...hop,
    from: { id: '職', type: 'kanji' }, to: { id: '戠', type: 'kanji' } })).relation, 'phonetic-component');
  let called = 0;
  refused(subject.resolveWorldcraftHop(catalog, { ...hop,
    from: { type: 'kanji', id: { toJSON() { called++; return '職'; } } } }), 'hop-request-shape');
  assert.equal(called, 0);
  refused(subject.resolveWorldcraftHop(catalog, { ...hop, direction: 'outgoing' }), 'edge-direction-mismatch');
  refused(subject.resolveWorldcraftHop(catalog, { ...hop, to: { type: 'kanji', id: '糸' } }));
  refused(subject.resolveWorldcraftHop(catalog, { ...hop, edgeId: '職:戠:source-occurrence' }), 'unsupported-edge');
});
async function mutant(before, after) {
  const original = readFileSync(new URL('m4-worldcraft.mjs', base), 'utf8');
  assert.equal(original.split(before).length, 2, 'mutation target unique');
  const source = original.replace(before, after)
    .replace("'./kanji-family.js'", JSON.stringify(new URL('kanji-family.js', base).href))
    .replace("'./kanji-structure.js'", JSON.stringify(new URL('kanji-structure.js', base).href));
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}
let killed = 0;
for (const [name, before, after, oracle] of [
  ['borrowed occurrence admission removed',
    "if (Object.hasOwn(request, 'occurrenceIds')) {", 'if (false) {', borrowedPart],
  ['wrong requested part admitted',
    "if (request.left !== hosts[request.host] || request.right !== '戠')", 'if (false)', wrongPart],
  ['caller ArrayBuffer slice aliases admitted bytes',
    'view = new Uint8Array(value);', 'return new Uint8Array(value.slice(0));', bufferCopy],
  ['prototype membership substitutes for ArrayBuffer brand',
    'const bufferSize = arrayBufferSize(value);',
    'const bufferSize = value instanceof ArrayBuffer ? 0 : null;', byteBrands],
]) {
  const api = await mutant(before, after), admitted = actual(await api.createWorldcraftCatalog(bytes));
  await assert.rejects(async () => oracle(api, admitted), { code: 'ERR_ASSERTION' }, name);
  killed++; console.log('KILLED ' + name);
}
console.log(JSON.stringify({ verifier: 'worldcraft-identity', cases, mutantsKilled: killed,
  forms: 3, ownHostSlots: 6, sourcePins: 5, protectedCodePins: 2, passed: true }));
