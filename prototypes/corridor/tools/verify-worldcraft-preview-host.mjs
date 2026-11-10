/** Worldcraft preview host (worldcraft-host.mjs) against the real model and the five real source files.
 * Proves the memory journey answers the model's lifecycle port for Keep, Remove and the 16 pool, that the host's
 * lines follow M4-WORLDCRAFT-PASSAGE.md §2.4, and that the core reaches no storage or network.
 * It does NOT prove the dialog, the door or the page: tools/worldcraft-preview-walk.mjs drives those in a browser.
 * node prototypes/corridor/tools/verify-worldcraft-preview-host.mjs
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SOURCE_PINS } from '../m4-worldcraft.mjs';
import { createWorldcraftPreviewHost } from '../worldcraft-host.mjs';

const canonical = value => JSON.stringify(value, (key, row) => row && typeof row === 'object' && !Array.isArray(row)
  ? Object.fromEntries(Object.keys(row).sort().map(name => [name, row[name]])) : row);
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const sources = () => Object.fromEntries(Object.entries(SOURCE_PINS).map(([field, pin]) =>
  [field, readFileSync(new URL('../data/share_alike/' + pin.file, import.meta.url))]));
const strokes = JSON.parse(readFileSync(new URL('../data/share_alike/strokes.json', import.meta.url), 'utf8')).strokes;

// Any reach for storage or the network fails the run: the core is handed bytes and a digest, nothing else.
const reached = [];
for (const name of ['fetch', 'localStorage', 'sessionStorage', 'indexedDB']) {
  Object.defineProperty(globalThis, name, { configurable: true, get() { reached.push(name); throw new Error(`reached ${name}`); } });
}

let passed = 0;
async function test(name, body) { await body(); passed++; console.log('PASS ' + name); }
function open(host, form) {
  const renders = [], closes = [];
  const visit = host.visit(form, { render: dto => renders.push(dto), close: () => closes.push(true) });
  visit.paint();
  return { ...visit, renders, closes, last: () => renders.at(-1) };
}

const host = await createWorldcraftPreviewHost({ bytes: sources(), digest });

await test('a build: two parts inside the form, assembled to the whole character, nothing kept', async () => {
  for (const [form, left] of [['職', '耳'], ['識', '言'], ['織', '糸']]) {
    const v = open(host, form);
    assert.deepEqual(v.last().parts.map(part => part.label), [left, '戠']);
    assert.equal(v.last().phase, 'new'); assert.equal(v.last().assembledPaths, null);
    await v.actions.assemble();
    assert.equal(v.last().phase, 'assembled');
    assert.deepEqual(v.last().assembledPaths, strokes[form]);
    assert.deepEqual(v.last().parts.flatMap(part => part.paths), strokes[form]);
    assert.equal(v.last().message, null); assert.equal(host.kept(), 0);
    v.end();
  }
});

await test('Keep is W-09 and a saved row; Remove is W-15 and a fresh draft; ids are never reused', async () => {
  const v = open(host, '職');
  await v.actions.assemble(); await v.actions.keep();
  assert.deepEqual(v.last().message, { code: 'W-09' }); assert.equal(v.last().phase, 'saved');
  assert.deepEqual(v.last().kept.map(row => [row.host, row.actionable]), [['職', true]]);
  const first = v.last().kept[0].id;
  await v.actions.keep(); // the same build again is not a second row
  assert.equal(v.last().kept.length, 1); assert.deepEqual(v.last().message, { code: 'W-09' });
  await v.actions.confirmRemove(first);
  assert.deepEqual(v.last().message, { code: 'W-15' }); assert.equal(v.last().kept.length, 0);
  assert.equal(v.last().phase, 'new'); assert.equal(v.last().assembledPaths, null);
  await v.actions.assemble(); await v.actions.keep();
  assert.notEqual(v.last().kept[0].id, first);
  await v.actions.confirmRemove('worldcraft-preview/projects/999');
  assert.equal(v.last().message, null); assert.equal(v.last().kept.length, 1); // absent: no removal is claimed
  v.end();
});

await test('a kept character is viewed in place; Leave returns to this page’s build, then closes', async () => {
  const v = open(host, '識');
  const kept = v.last().kept[0];
  assert.equal(kept.host, '職');
  await v.actions.assemble(); // an unkept 識 must survive the look at 職
  v.actions.inspect(kept.id);
  assert.equal(v.last().host, '職'); assert.equal(v.last().phase, 'saved'); assert.equal(v.last().viewing, '職');
  await v.actions.assemble(); await v.actions.keep(); // no build action reaches the page's draft from the kept view
  assert.equal(v.last().kept.length, 1);
  v.actions.leave();
  assert.equal(v.closes.length, 0); assert.equal(v.last().host, '識'); assert.equal(v.last().phase, 'assembled');
  assert.equal(v.last().viewing, null);
  v.actions.leave();
  assert.equal(v.closes.length, 1);
  v.end();
});

await test('an ended visit does nothing more, and its build is not kept', async () => {
  const v = open(host, '織'), before = host.kept();
  await v.actions.assemble(); v.end();
  const count = v.renders.length;
  await v.actions.keep(); await v.actions.assemble(); v.actions.inspect('x'); v.actions.leave();
  assert.equal(v.renders.length, count); assert.equal(v.closes.length, 0); assert.equal(host.kept(), before);
});

await test('the pool holds 16: the next Keep is W-12 and adds nothing', async () => {
  while (host.kept() < 16) {
    const v = open(host, ['職', '識', '織'][host.kept() % 3]);
    await v.actions.assemble(); await v.actions.keep();
    assert.deepEqual(v.last().message, { code: 'W-09' }); v.end();
  }
  const v = open(host, '織');
  await v.actions.assemble(); await v.actions.keep();
  assert.deepEqual(v.last().message, { code: 'W-12' }); assert.equal(v.last().phase, 'assembled');
  assert.equal(host.kept(), 16); assert.equal(v.last().kept.length, 16);
  await v.actions.confirmRemove(v.last().kept[0].id);
  await v.actions.keep();
  assert.deepEqual(v.last().message, { code: 'W-09' }); assert.equal(host.kept(), 16);
  v.end();
});

await test('a form outside 職 / 識 / 織 gets no parts and no draft', async () => {
  const v = open(host, '門');
  assert.deepEqual(v.last().parts, []); assert.equal(v.last().host, '門');
  await v.actions.assemble(); await v.actions.keep();
  assert.equal(v.last().assembledPaths, null);
  v.end();
});

await test('negative control: one changed source byte is refused by the model’s pin', async () => {
  const bytes = sources();
  bytes.strokesBytes = Buffer.from(bytes.strokesBytes); bytes.strokesBytes[100] ^= 1;
  await assert.rejects(createWorldcraftPreviewHost({ bytes, digest }), /source-hash-mismatch:strokesBytes/);
});

await test('negative control: a digest that disagrees with itself never shows W-09', async () => {
  let n = 0;
  const lying = await createWorldcraftPreviewHost({ bytes: sources(), digest: value => digest([value, n++]) });
  const v = open(lying, '職');
  await v.actions.assemble(); await v.actions.keep();
  assert.deepEqual(v.last().message, { code: 'W-11' }); assert.equal(v.last().uncertain, true);
  v.end();
});

assert.deepEqual(reached, [], 'the preview core reached storage or the network');
console.log(`${passed} passed; storage and network untouched`);
