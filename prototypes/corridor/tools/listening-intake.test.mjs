import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

assert(process.env.KAIRO_SITE_DIR, 'Supply a staged KAIRO_SITE_DIR');
const site = resolve(process.env.KAIRO_SITE_DIR), manifest = JSON.parse(readFileSync(resolve(site, 'build-identity.json')));
for (const path of ['source-inbox.mjs', 'modules/reading-core.mjs'])
  assert.equal(createHash('sha256').update(readFileSync(resolve(site, path))).digest('hex'), manifest.files.find((file) => file.path === path)?.sha256);
const m = await import(pathToFileURL(resolve(site, 'source-inbox.mjs')));
const id = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const now = '2026-09-13T01:00:00.000Z', url = 'https://www.youtube.com/watch?v=R23fixture1&t=73#original';
const clone = (value) => JSON.parse(JSON.stringify(value));
const source = m.createSourceCapture({ id: id(1), capturedAt: now, title: '日本語の会話', url, text: '' });
const legacy = m.acceptSourceCapture(null, source);
const listening = () => m.registerListeningSource(legacy, { sourceId: id(1), kind: 'video', creator: 'Learner-entered channel' });
const position = (overrides = {}) => ({ sourceId: id(1), seconds: 73, revision: id(3), confirmedAt: now, expectedRevision: null, ...overrides });
const ink = '  町の図書館で本を読む。🚀\r\n次の話題へ。e\u0301  ';
const excerpt = (overrides = {}) => ({ id: id(2), capturedAt: now, text: ink, startSeconds: 73, endSeconds: 90, ...overrides });

test('v1 remains exact; listening upgrade adds declarations without changing captured pointers or rights', () => {
  assert.deepEqual(m.parseSourceInbox(clone(legacy)), legacy); assert.equal(legacy.version, 1);
  const next = listening(); assert.equal(next.version, 2); assert.deepEqual(next.entries, legacy.entries);
  assert.equal(next.listening[0].position, null); assert.deepEqual(next.excerpts, []);
  assert.deepEqual(m.parseSourceInbox(clone(next)), next); assert(Object.isFrozen(next.listening[0]));
  for (const op of ['ai-transform', 'retain-offline', 'display-body', 'generate-audio', 'sync-body'])
    assert.notEqual(next.entries[0].candidate.article.capabilities[op]?.status, 'allowed');
});
test('confirmed position needs the current revision, permits replaying earlier material and does not mutate source bytes', () => {
  const first = m.confirmListeningPosition(listening(), position());
  assert.deepEqual(first.entries, legacy.entries); assert.equal(first.listening[0].position.seconds, 73);
  const replay = m.confirmListeningPosition(first, position({ seconds: 0, revision: id(4), expectedRevision: id(3) }));
  assert.equal(replay.listening[0].position.seconds, 0); assert.equal(first.listening[0].position.seconds, 73);
  assert.throws(() => m.confirmListeningPosition(first, position({ seconds: 10, revision: id(5) })), /listening-position-conflict/u);
  assert.throws(() => m.confirmListeningPosition(first, position({ expectedRevision: id(3) })), /listening-position-conflict/u);
  assert.throws(() => m.confirmListeningPosition(legacy, position()), /listening-source-required/u);
  const changed = m.registerListeningSource(first, { sourceId: id(1), kind: 'podcast', creator: 'Corrected label' });
  assert.deepEqual(changed.listening[0].position, first.listening[0].position);
});
test('transcript excerpt preserves exact Unicode, original URL and learner-declared range independently of playback progress', () => {
  const before = m.confirmListeningPosition(listening(), position({ seconds: 200 }));
  const next = m.addListeningExcerpt(before, id(1), excerpt());
  assert.equal(next.entries[1].candidate.article.body.text, ink); assert.equal(next.entries[1].encounterUrl, url);
  assert.equal(next.listening[0].position.seconds, 200);
  assert.deepEqual(next.excerpts[0], { captureId: id(2), sourceId: id(1), startSeconds: 73, endSeconds: 90,
    provenance: { kind: 'user-supplied', suppliedAt: now } });
  assert.deepEqual(m.parseSourceInbox(clone(next)), next);
  assert.equal(next.entries[1].candidate.article.capabilities['ai-transform'].status, 'unknown');
  assert(Object.isFrozen(next.excerpts[0].provenance)); assert.equal(before.entries.length, 1);
});
test('exact excerpt retry is idempotent; changed text or time under its identity cannot overwrite a saved version', () => {
  const next = m.addListeningExcerpt(listening(), id(1), excerpt());
  assert.strictEqual(m.addListeningExcerpt(next, id(1), excerpt()), next);
  for (const input of [excerpt({ text: 'Changed prose.' }), excerpt({ startSeconds: 74 }), excerpt({ endSeconds: 91 })])
    assert.throws(() => m.addListeningExcerpt(next, id(1), input), /capture-conflict/u);
  assert.throws(() => m.registerListeningSource(next, { sourceId: id(2), kind: 'video', creator: '' }), /invalid-listening-excerpt/u);
});
test('malformed v2 metadata, foreign references and forged transcript authority are refused', () => {
  const valid = m.addListeningExcerpt(listening(), id(1), excerpt());
  const mutations = [
    (v) => { v.listening[0].sourceId = id(9); }, (v) => { v.listening[0].kind = 'verified-video'; },
    (v) => { v.listening[0].position = { seconds: 1, revision: id(5), confirmedAt: 'yesterday' }; },
    (v) => { v.excerpts[0].sourceId = id(9); }, (v) => { v.excerpts[0].captureId = id(1); },
    (v) => { v.excerpts[0].endSeconds = 73; }, (v) => { v.excerpts[0].provenance.kind = 'official-provider'; },
    (v) => { v.excerpts[0].provenance.suppliedAt = '2026-09-13T02:00:00.000Z'; },
    (v) => { v.excerpts[0].permission = 'allowed'; }, (v) => { v.listening.push(v.listening[0]); },
    (v) => { v.excerpts.push(v.excerpts[0]); }, (v) => { v.positions = []; },
  ];
  for (const change of mutations) { const value = clone(valid); change(value); assert.throws(() => m.parseSourceInbox(value)); }
  assert.throws(() => m.parseSourceInbox({ version: 2, entries: [] }));
  assert.throws(() => m.parseSourceInbox({ version: 3, entries: [], listening: [], excerpts: [] }));
  const foreign = clone(valid); foreign.entries[1] = m.createSourceCapture({ id: id(2), capturedAt: now, title: foreign.entries[1].candidate.article.title, text: ink, url: 'https://example.org/another' });
  assert.throws(() => m.parseSourceInbox(foreign), /invalid-listening-excerpt/u);
});
test('time input accepts bounded explicit seconds or clock notation and refuses ambiguous/invalid values', () => {
  for (const [input, seconds] of [['0', 0], ['73', 73], ['1:13', 73], ['1:02:30', 3750], ['168:00:00', 604800]])
    assert.equal(m.parseMediaTime(input), seconds);
  assert.equal(m.formatMediaTime(73), '1:13'); assert.equal(m.formatMediaTime(3750), '1:02:30');
  for (const input of ['', '-1', '1:3', '1:60', '1.5', 'NaN', '999999:00:00', '\ud800']) assert.throws(() => m.parseMediaTime(input));
  for (const seconds of [-0, -1, 1.5, Infinity, 604801]) assert.throws(() => m.confirmListeningPosition(listening(), position({ seconds })));
  for (const input of [excerpt({ endSeconds: 73 }), excerpt({ startSeconds: -1 }), excerpt({ text: ' ' })])
    assert.throws(() => m.addListeningExcerpt(listening(), id(1), input));
});
test('external-link adapter targets the same recognized YouTube video; unknown sources retain their exact link and manual time', () => {
  for (const input of [url, 'https://youtu.be/R23fixture1?si=original', 'https://m.youtube.com/shorts/R23fixture1'])
    assert.deepEqual(m.listeningResumeLink(input, 90), { url: 'https://www.youtube.com/watch?v=R23fixture1&t=90s', timestampLink: true });
  for (const input of ['https://podcast.example.org/episode#original', 'https://youtube.com.example.org/watch?v=R23fixture1', 'https://www.youtube.com/watch?v=R23fixture1&v=R23fixture2'])
    assert.deepEqual(m.listeningResumeLink(input, 90), { url: input, timestampLink: false });
  for (const input of ['javascript:alert(1)', 'https://u:p@youtube.com/watch?v=R23fixture1']) assert.throws(() => m.listeningResumeLink(input, 90));
  assert.equal(source.encounterUrl, url);
});
function recoveryFixture(sourceId = id(1), values = new Map()) {
  let current = true, writable = true;
  const options = { sourceId, storage: { getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { if (!writable) throw new Error('quota'); values.set(key, value); },
    removeItem: (key) => { if (!writable) throw new Error('quota'); values.delete(key); } },
    installationText: 'synthetic installation', databaseName: 'synthetic database', assertCurrent: () => current };
  return { values, options, open: () => m.createListeningExcerptRecovery(options), stop: () => { current = false; }, deny: () => { writable = false; } };
}
test('unfinished exact excerpt and partial time edits recover per source, and late consumption cannot erase newer input', () => {
  const f = recoveryFixture(), input = { text: ink, start: '1:', end: '' }; f.open().edit(input, id(7), now);
  assert.deepEqual(f.open().read().input, input); assert.equal(recoveryFixture(id(9), f.values).open().read(), null);
  f.open().edit({ ...input, start: '1:13' }, id(8), now); assert.equal(f.open().consume(id(7)), false);
  assert.equal(f.open().read().input.start, '1:13'); assert.equal(f.open().consume(id(8)), true);
});
test('foreign/malformed recovery and failed writes remain exact; a departed owner cannot reuse the slot', () => {
  const input = { text: ink, start: '1:13', end: '' };
  for (const corrupt of ['{broken', JSON.stringify({ version: 1, installation: 'foreign', revision: id(7), editedAt: now, input })]) {
    const f = recoveryFixture(); f.open().edit(input, id(7), now); const key = [...f.values.keys()][0]; f.values.set(key, corrupt);
    for (const action of [() => f.open().read(), () => f.open().edit(input, id(8), now), () => f.open().consume(id(7))]) assert.throws(action);
    assert.equal(f.values.get(key), corrupt);
  }
  const f = recoveryFixture(); f.open().edit(input, id(7), now); const before = [...f.values]; f.deny();
  assert.throws(() => f.open().edit(input, id(8), now), /quota/u); assert.deepEqual([...f.values], before);
  f.stop(); assert.throws(() => f.open().consume(id(7)), /capture-owner-changed/u); assert.deepEqual([...f.values], before);
});
test('v2 getters and cyclic provenance cannot run code while being parsed', () => {
  let touched = false; const value = clone(listening());
  Object.defineProperty(value.listening[0], 'position', { get() { touched = true; return null; }, enumerable: true });
  assert.throws(() => m.parseSourceInbox(value)); assert.equal(touched, false);
  const cycle = clone(listening()); cycle.excerpts.push(cycle); assert.throws(() => m.parseSourceInbox(cycle));
});
