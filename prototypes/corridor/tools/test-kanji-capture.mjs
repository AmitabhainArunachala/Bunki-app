/** Exercise the actual capture, backup-row validation and grade producers. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const skipContext = vm.createContext({});
vm.runInContext(readFileSync(new URL('../skip-ui.js', import.meta.url), 'utf8'), skipContext);
const skipUI = skipContext.BunkiSkipUI;
const source = readFileSync(new URL('../corridor.js', import.meta.url), 'utf8');
const data = JSON.parse(readFileSync(new URL('../data/share_alike/skip.json', import.meta.url), 'utf8'));
const canonical = JSON.parse(readFileSync(new URL('../data/share_alike/kanji.json', import.meta.url), 'utf8')).kanji;
const byChar = new Map(data.entries.map(entry => [entry.literal, entry]));
const inputState = { data, byChar };
function actualFunction(name) {
  const match = source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^\\}`, 'm'));
  assert(match, `Missing actual app function ${name}`);
  return match[0];
}
function app() {
  const context = vm.createContext({
    S: { taken: [], skipUi: inputState, focus: false },
    D: { dict: {}, kanji: structuredClone(canonical) },
    NODE_KIND: { kanji: ['漢字', 'kanji'] }, window: { BunkiSkipUI: skipUI },
    commitReviewAction: async (_rv, _item, producer) => producer(context.latest),
  });
  const validators = source.slice(source.indexOf('function plainRecord('), source.indexOf('\nfunction validListItem('));
  vm.runInContext(validators + '\n' + ['captureStorePatch', 'reviewBack', 'commitDrillGrade', 'commitStandardGrade'].map(actualFunction).join('\n'), context);
  return context;
}
const literal = '㐆';
assert(!canonical[literal]);
assert(byChar.has(literal));

test('capture retains complete dictionary answer and release through cold JSON reload', () => {
  const runtime = app();
  const before = JSON.stringify(inputState.data);
  const patch = runtime.captureStorePatch({ taken: [] }, { t: 'kanji', id: literal }, literal, 1234);
  const saved = JSON.parse(JSON.stringify(patch.taken[0]));
  assert(runtime.validTakenItem(saved));
  assert.deepEqual(saved.kanjiRecord.meanings, byChar.get(literal).meanings);
  assert.deepEqual(saved.kanjiRecord.on, []);
  assert.deepEqual(saved.kanjiRecord.kun, []);
  assert.equal(saved.kanjiRecord.sourceVersion.archiveSha256, '5dfb850ee88c7bccecf4694cc4d7b1338e608440c5edcb8fefc93216b3471fe6');
  runtime.S = { taken: [saved], skipUi: null };
  assert(runtime.kanjiAnswerAvailable(saved));
  const answer = runtime.reviewBack(saved);
  assert.equal(answer.reading, '');
  assert.equal(answer.senses[0], saved.kanjiRecord.meanings.join('; '));
  runtime.D.kanji[literal] = { m: 'later changed source', on: ['invented'], kun: [] };
  assert.equal(runtime.reviewBack(saved).senses[0], answer.senses[0]);
  assert.equal(JSON.stringify(inputState.data), before, 'Capture cannot mutate source data');
});

test('every supplied answer outside the canonical layer fits the retained-record contract', () => {
  const runtime = app();
  let count = 0;
  for (const entry of data.entries) {
    if (canonical[entry.literal] || !entry.meanings?.length) continue;
    const row = runtime.captureStorePatch({ taken: [] }, { t: 'kanji', id: entry.literal }, entry.literal, 1234).taken[0];
    assert(runtime.validTakenItem(row), entry.literal);
    count++;
  }
  assert(count > 1000);
});

test('backup-row validator rejects substituted identities, missing answers and malformed source pins', () => {
  const runtime = app();
  const row = JSON.parse(JSON.stringify(runtime.captureStorePatch({ taken: [] }, { t: 'kanji', id: literal }, literal).taken[0]));
  const corruptions = [
    item => { item.id = '別'; }, item => { item.t = 'word'; },
    item => { item.kanjiRecord.meanings = []; }, item => { item.kanjiRecord.meanings = [' ']; },
    item => { item.kanjiRecord.meanings = [42]; }, item => { item.kanjiRecord.on = null; },
    item => { item.kanjiRecord.st = 0; }, item => { item.kanjiRecord.rad = 215; },
    item => { item.kanjiRecord.sourceVersion.archiveSha256 = 'receipt-is-not-authority'; },
    item => { item.kanjiRecord.sourceVersion = null; },
    item => { item.id = item.kanjiRecord.c = '\uD800'; },
  ];
  for (const corrupt of corruptions) {
    const altered = structuredClone(row); corrupt(altered);
    assert.equal(runtime.validTakenItem(altered), false);
  }
  const astral = structuredClone(row); astral.id = astral.kanjiRecord.c = '𠀀';
  assert(runtime.validTakenItem(astral), 'One complete astral scalar is valid');
});

test('missing dictionary answers cannot create a taken row or write either kind of grade', async () => {
  const runtime = app();
  runtime.S.skipUi = null;
  const item = { t: 'kanji', id: literal, label: literal, started: 1234 };
  assert.throws(() => runtime.captureStorePatch({ taken: [] }, item, literal), /kanji-answer-unavailable/);
  runtime.latest = { taken: [item], obslog: [], srs: {}, revlog: [] };
  assert.equal(runtime.kanjiAnswerAvailable(item, runtime.latest), false);
  const props = { rv: { revealed: true, declared: 1 }, item, rating: 3, key: 'good', skey: `kanji:${literal}`, now: new Date(), day: '2026-09-14' };
  await assert.rejects(runtime.commitDrillGrade(props), /kanji-answer-unavailable/);
  await assert.rejects(runtime.commitStandardGrade(props), /kanji-answer-unavailable/);
  assert.deepEqual(runtime.latest.obslog, []);
  assert.deepEqual(runtime.latest.revlog, []);
  assert.deepEqual(runtime.latest.srs, {});
});
