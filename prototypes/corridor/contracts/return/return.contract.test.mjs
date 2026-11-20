/** G4 judge: one return contract — interface, stubs and door registry (campaign/contracts/G4.json; SPEC S9-R10, S9-R12, S9-R13).
 * Pinned by the contract; the worker implements ./return.mjs, ./door-registry.mjs and two stub consumers under ./stubs/ so
 * every fixture passes, and may not edit this file. No browser: the consumers act on an in-memory surface model and a stub
 * clock. The legacy mechanisms (assertion [4]) are scanned from the real corridor.js and modules/ at test time, so the
 * registry cannot list fewer than exist. Authored by the Bunki lead 2026-11-06; TESTS_SOUND by a second family before pinning. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';
import { entryId, readingId, componentOccurrenceId } from '../identity/identity.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = join(HERE, '..', '..');                     // prototypes/corridor
const REQUIRED = ['origin', 'object', 'anchor', 'scroll', 'focus', 'drafts', 'runs', 'purpose'];
const LEGACY_FUNCTIONS = ['returnScroll', 'returnFromNavigation', 'returnToScaleBead', 'closeSealStrip'];

// ---- the real legacy mechanisms, scanned from the tree (never trusted from the registry alone) ------------------------
function sourceFiles() {
  const files = [join(CORRIDOR, 'corridor.js')];
  const mods = join(CORRIDOR, 'modules');
  if (existsSync(mods)) for (const n of readdirSync(mods)) if (/\.m?js$/u.test(n) && !/^verify-/u.test(n)) files.push(join(mods, n));
  return files;
}
function scanLegacy() {
  const found = { functions: new Map(), historyBack: [] };
  for (const file of sourceFiles()) {
    const source = readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    for (const st of sf.statements) {
      if (ts.isFunctionDeclaration(st) && st.name && LEGACY_FUNCTIONS.includes(st.name.text)) {
        const text = st.getText(sf);
        found.functions.set(st.name.text, { file: relative(CORRIDOR, file), line: sf.getLineAndCharacterOfPosition(st.getStart(sf)).line + 1,
          declaration: true });
      }
    }
    source.split('\n').forEach((line, i) => { if (/\bhistory\.back\(\)/u.test(line)) found.historyBack.push(`${relative(CORRIDOR, file)}:${i + 1}`); });
  }
  return found;
}

// ---- a full, valid return record for a word occurrence in a reading -------------------------------------------------
function fullRecord(impl, overrides = {}) {
  const entry = entryId({ seq: '1522150', spelling: '本', reading: 'ほん' });
  return impl.createReturnRecord({
    origin: { surface: 'reader', passageId: 'p-42', paragraph: 7 },
    object: entry,
    anchor: { kind: 'token', index: 12 },
    scroll: { x: 0, y: 1840 },
    focus: { target: 'word:本:12' },
    drafts: [{ id: 'draft-1', text: '本 … something I wanted to ask' }],
    runs: [{ id: 'run-1', kind: 'teacher', state: 'open' }],
    purpose: { kind: 'word-entry', question: 'which sense of 本 is this?' },
    ...overrides,
  });
}

function surfaceModel() {
  return { paragraph: 7, selection: { start: 40, end: 42 }, focus: 'word:本:12', scroll: { x: 0, y: 1840 }, media: { positionMs: 0 } };
}
function stubClock() {
  let now = 0;
  return { now: () => now, advance: (ms) => { now += ms; }, elapsedSince: (t) => now - t };
}
/** the restore assertion every consumer must satisfy (S9-R12): same paragraph, same selection range, same focus target */
function assertRestored(consumer, record, surface) {
  const before = structuredClone(surface);
  consumer.leave(record);                                               // the surface moves on: the consumer must not rely on it
  surface.paragraph = 0; surface.selection = { start: 0, end: 0 }; surface.focus = null; surface.scroll = { x: 0, y: 0 };
  consumer.returnTo(record);
  assert.equal(surface.paragraph, before.paragraph, 'same paragraph');
  assert.deepEqual(surface.selection, before.selection, 'same selection range');
  assert.equal(surface.focus, before.focus, 'same focus target');
  assert.deepEqual(surface.scroll, before.scroll, 'same scroll');
}

test('return contract · G4', async (t) => {
  let impl, registry, consumers;
  await t.test('the interface, the registry and two stub consumers exist', async () => {
    impl = await import('./return.mjs');
    registry = await import('./door-registry.mjs');
    consumers = { reading: await import('./stubs/reading-consumer.mjs'), world: await import('./stubs/world-consumer.mjs') };
    for (const name of ['createReturnRecord', 'validateReturnRecord', 'PURPOSES', 'ANCHOR_KINDS']) assert.equal(typeof impl[name] === 'function' || Array.isArray(impl[name]) || impl[name] instanceof Set, true, `return.mjs exports ${name}`);
    assert.equal(typeof registry.doorRegistry, 'function', 'door-registry.mjs exports doorRegistry()');
    assert.equal(typeof registry.validateRegistry, 'function', 'door-registry.mjs exports validateRegistry()');
    for (const [k, m] of Object.entries(consumers)) assert.equal(typeof m.createConsumer, 'function', `${k} consumer exports createConsumer()`);
  });

  await t.test('[0] a return record carries every field; a record missing any is refused; anchors are typed', () => {
    const rec = fullRecord(impl);
    for (const f of REQUIRED) assert.ok(f in rec, `record has ${f}`);
    assert.ok(Object.isFrozen(rec), 'a record is frozen');
    assert.equal(impl.validateReturnRecord(rec), true);
    for (const f of REQUIRED) {
      const input = { ...fullRecord(impl) }; delete input[f];
      assert.throws(() => impl.createReturnRecord(input), new RegExp(f, 'u'), `missing ${f} is refused by name`);
    }
    assert.throws(() => fullRecord(impl, { object: '本|ほん' }), /object|identity/u, 'the object must be a G9 id, not the base key');
    assert.throws(() => fullRecord(impl, { purpose: { kind: 'wander' } }), /purpose/u, 'an unknown purpose is refused');
    assert.throws(() => fullRecord(impl, { anchor: { kind: 'pixel', x: 3 } }), /anchor/u, 'an unknown anchor kind is refused');
    for (const anchor of [{ kind: 'token', index: 0 }, { kind: 'utf16', offset: 88 }, { kind: 'media', ms: 61200 }]) assert.ok(fullRecord(impl, { anchor }), `anchor ${anchor.kind} accepted`);
    assert.throws(() => fullRecord(impl, { anchor: { kind: 'token' } }), /index/u, 'a token anchor needs its index');
    assert.throws(() => fullRecord(impl, { anchor: { kind: 'media', ms: -5 } }), /ms|media/u, 'media milliseconds are non-negative');
    // the object may also be a reading id or a component occurrence id (S9-R12: word, sense, kanji or source occurrence)
    assert.ok(fullRecord(impl, { object: readingId({ kanji: '本', reading: 'ほん' }) }));
    assert.ok(fullRecord(impl, { object: componentOccurrenceId({ kanji: '森', position: 1, part: '木' }).id }));
    assert.ok(fullRecord(impl, { object: 'occ:transcript-7:12' }), 'a source occurrence id is an object');
  });

  await t.test('[1] leave, then return: both stub consumers restore paragraph, selection and focus; owned media within 250 ms on the stub clock', () => {
    for (const [name, m] of Object.entries(consumers)) {
      const surface = surfaceModel();
      const consumer = m.createConsumer(surface);
      assertRestored(consumer, fullRecord(impl), surface);
      // owned media: the record anchors at 61,200 ms; after returnTo the surface's media position is within 250 ms, within 250 ms of stub time
      const clock = stubClock();
      const media = m.createConsumer(surface, { clock });
      const rec = fullRecord(impl, { anchor: { kind: 'media', ms: 61200 }, origin: { surface: 'source-reader', passageId: 'p-9', paragraph: 2 } });
      const t0 = clock.now();
      media.leave(rec); surface.media.positionMs = 0;
      media.returnTo(rec);
      assert.ok(Math.abs(surface.media.positionMs - 61200) <= 250, `${name}: media returns within 250 ms of 61,200 (got ${surface.media.positionMs})`);
      assert.ok(clock.elapsedSince(t0) <= 250, `${name}: the seek completes within 250 ms of stub time (${clock.elapsedSince(t0)} ms)`);
    }
    // negative control: a consumer that restores scroll only must fail the focus assertion
    const surface = surfaceModel();
    const scrollOnly = { leave() {}, returnTo(rec) { surface.scroll = { ...rec.scroll }; surface.paragraph = rec.origin.paragraph; } };
    assert.throws(() => assertRestored(scrollOnly, fullRecord(impl), surface), /focus|selection/u, 'scroll-only restore fails');
  });

  await t.test('[2] the two consumers compile and import no private corridor.js symbol', () => {
    for (const file of ['stubs/reading-consumer.mjs', 'stubs/world-consumer.mjs', 'return.mjs', 'door-registry.mjs']) {
      const path = join(HERE, file);
      execFileSync(process.execPath, ['--check', path], { stdio: 'pipe' });
      const src = readFileSync(path, 'utf8');
      const specs = [...src.matchAll(/^\s*import\b[^'"]*['"]([^'"]+)['"]/gmu)].map((m) => m[1]);
      for (const s of specs) assert.ok(!/corridor\.js|\/modules\//u.test(s), `${file} imports ${s}: no private corridor symbol`);
    }
  });

  await t.test('[3] the door registry: every door that leaves a surface has an origin and a return kind; a door without a return implementation fails', () => {
    const reg = registry.doorRegistry();
    assert.ok(Array.isArray(reg.doors) && reg.doors.length >= 3, 'the registry lists the doors that leave a surface');
    for (const d of reg.doors) {
      assert.ok(typeof d.door === 'string' && d.door, 'door name');
      assert.ok(typeof d.origin === 'string' && d.origin, `${d.door}: origin surface`);
      assert.ok(['contract', 'to adopt'].includes(d.returnKind), `${d.door}: return kind`);
      if (d.returnKind === 'contract') assert.ok(typeof d.implementation === 'string' && d.implementation, `${d.door}: names its return implementation`);
    }
    assert.equal(registry.validateRegistry(reg), true);
    const planted = { ...reg, doors: [...reg.doors, { door: 'planted-door', origin: 'reader', returnKind: 'contract' }] };
    assert.throws(() => registry.validateRegistry(planted), /implementation/u, 'a door added without a return implementation fails');
    const unknownKind = { ...reg, doors: [...reg.doors, { door: 'odd', origin: 'reader', returnKind: 'someday', implementation: 'x' }] };
    assert.throws(() => registry.validateRegistry(unknownKind), /return kind|returnKind/u);
  });

  await t.test("[4] the existing mechanisms are all listed as 'to adopt' with their current behaviour, none dropped, and the registry records the real count", () => {
    const reg = registry.doorRegistry();
    const found = scanLegacy();
    const realCount = found.functions.size + found.historyBack.length;
    assert.ok(realCount >= 6, `the tree holds at least six legacy mechanisms (${realCount})`);
    assert.equal(reg.legacyCount, realCount, 'the registry records the real count');
    const byName = new Map(reg.legacy.map((l) => [l.name, l]));
    for (const [name, info] of found.functions) {
      const entry = byName.get(name);
      assert.ok(entry, `${name} (${info.file}:${info.line}) is listed`);
      assert.equal(entry.returnKind, 'to adopt', `${name} is 'to adopt'`);
      assert.ok(typeof entry.currentBehaviour === 'string' && entry.currentBehaviour.length > 10, `${name} records its current behaviour`);
      assert.ok(Array.isArray(entry.restores), `${name} lists what it restores`);
      assert.ok(!entry.restores.includes('selection'), `${name}: registry makes no selection restoration guarantee`);
    }
    execFileSync(process.execPath, ['--test', '--test-name-pattern=registry restoration claims', join(CORRIDOR, 'tools/test-navigation-returns.mjs')], { stdio: 'pipe' });
    for (const site of found.historyBack) {
      assert.ok(reg.legacy.some((l) => l.name === 'history.back' && Array.isArray(l.sites) && l.sites.includes(site)), `history.back at ${site} is listed`);
    }
    // the documented disagreement (the reason the contract exists): at least two mechanisms restore different things, and one restores no focus
    const sets = reg.legacy.filter((l) => l.returnKind === 'to adopt').map((l) => [...(l.restores || [])].sort().join(','));
    assert.ok(new Set(sets).size >= 2, 'the mechanisms disagree on what they restore');
    assert.ok(reg.legacy.some((l) => !(l.restores || []).includes('focus')), 'at least one mechanism loses focus');
  });
});
