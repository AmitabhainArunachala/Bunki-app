import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

assert(process.env.KAIRO_SITE_DIR, 'Supply a staged KAIRO_SITE_DIR');
const site = resolve(process.env.KAIRO_SITE_DIR);
const manifest = JSON.parse(readFileSync(resolve(site, 'build-identity.json')));
for (const path of ['source-inbox.mjs', 'modules/reading-core.mjs']) {
  const bytes = readFileSync(resolve(site, path)), file = manifest.files.find((entry) => entry.path === path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file?.sha256);
}
const module = await import(pathToFileURL(resolve(site, 'source-inbox.mjs')));
const now = '2026-09-12T18:00:00.000Z';
const parent = '29ee89c1-bca0-4c99-8579-137f4c226b06', child = '99de0109-e30f-49a6-a97a-dda7768a1518', other = '826be7fd-12aa-4e0f-87f2-fcf18f72339a';
const input = { origin: 'file', format: 'webvtt', name: '字幕.vtt', text: 'WEBVTT\r\n\r\n00:12.250 --> 00:19.500\r\n  町の図書館。e\u0301 🚀  \r\n\r\n00:18.000 --> 00:22.125\r\n別の字幕。\r\n' };
const clone = value => JSON.parse(JSON.stringify(value));
function library() {
 return module.registerListeningSource(module.acceptSourceCapture(null, module.createSourceCapture({ id: parent, capturedAt: now,
 title: '元の動画', url: 'https://www.youtube.com/watch?v=R24fixture1&t=70#original', text: '' })), { sourceId: parent, kind: 'video', creator: 'Supplied creator' });
}
const add = (raw = library(), changes = {}) => module.addListeningTranscript(raw, parent, { id: child, capturedAt: now, input, ...changes });
test('one full transcript is one capture, with exact original text and recomputed cue/body mappings', () => {
 const before = library(), saved = add(before); assert.equal(before.version, 2); assert.equal(saved.version, 3);
 assert.equal(saved.entries.length, 2); assert.equal(saved.transcripts.length, 1); assert.equal(saved.transcripts[0].document.cues.length, 2);
 assert.deepEqual(module.parseSourceInbox(clone(saved)), saved); assert.deepEqual(saved.listening, before.listening);
 const transcript = module.selectListeningTranscript(saved, child), capture = module.selectSourceCapture(saved, child);
 assert.equal(transcript.document.input.text, input.text); assert.equal(capture.candidate.article.body.text, transcript.document.body);
 assert.equal(capture.encounterUrl, before.entries[0].encounterUrl); assert.equal(transcript.provenance.kind, 'user-supplied');
 for (const op of ['sync-body','ai-transform','synthesize-audio','redistribute-audio']) assert.equal(capture.candidate.article.capabilities[op].status, 'unknown');
});
test('exact retry is idempotent; changed files/timings cannot replace an earlier capture', () => {
 const saved = add(); assert.strictEqual(add(saved), saved);
 assert.throws(() => add(saved, { input: { ...input, text: input.text.replace('12.250', '12.251') } }), /capture-conflict/u);
 const next = add(saved, { id: other, input: { ...input, text: input.text.replace('12.250', '12.251') } });
 assert.equal(next.transcripts.length, 2); assert.deepEqual(next.transcripts[0], saved.transcripts[0]);
});
test('portable timing, body, rights, provider and relationship tampering fails closed', () => {
 const saved = add();
 for (const edit of [
  d => { d.transcripts[0].document.cues[0].startMs++; },
  d => { d.transcripts[0].document.cues[0].start++; },
  d => { d.transcripts[0].document.provider = 'licensed-provider'; },
  d => { d.transcripts[0].provenance.kind = 'publisher-approved'; },
  d => { d.transcripts[0].sourceId = child; },
  d => { d.transcripts[0].captureId = parent; },
  d => { d.transcripts.push(clone(d.transcripts[0])); },
  d => { d.entries[1].candidate.article.capabilities['ai-transform'].status = 'allowed'; },
  d => { d.transcripts[0].document.input.text += 'bad block'; },
 ]) { const edited = clone(saved); edit(edited); assert.throws(() => module.parseSourceInbox(edited)); }
 assert.throws(() => module.registerListeningSource(saved, { sourceId: child, kind: 'video', creator: '' }));
 assert.throws(() => module.addListeningExcerpt(saved, parent, { id: child, capturedAt: now, text: saved.entries[1].candidate.article.body.text, startSeconds: 12, endSeconds: 19 }));
});
test('later pointer, position and excerpt writes retain all earlier transcript evidence', () => {
 const saved = add();
 let next = module.acceptSourceCapture(saved, module.createSourceCapture({ id: other, capturedAt: now, title: '別の出典', url: 'https://example.org/new', text: '' }));
 next = module.confirmListeningPosition(next, { sourceId: parent, seconds: 77, revision: other, confirmedAt: now, expectedRevision: null });
 assert.deepEqual(next.transcripts, saved.transcripts); assert.equal(next.entries.length, 3);
 const cue = saved.transcripts[0].document.cues[0], body = saved.transcripts[0].document.body;
 assert.deepEqual(module.selectListeningTranscriptRange(next, child, { sourceDigest: saved.entries[1].candidate.article.body.contentSha256,
 start: cue.start, end: cue.end, quote: body.slice(cue.start, cue.end) }), { startMs: 12250, endMs: 19500, cueIndexes: [0] });
});
test('installation-local draft recovery preserves incomplete files and consumes only the submitted revision', () => {
 const values = new Map(); let current = true;
 const options = { sourceId: parent, storage: { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) },
 databaseName: 'transcript-test', installationText: 'owner-A', assertCurrent: () => current };
 const recovery = module.createListeningTranscriptRecovery(options); recovery.edit({ ...input, text: 'WEBVTT\n\n00:' }, child, now);
 const opened = module.createListeningTranscriptRecovery(options); assert.equal(opened.read().input.text, 'WEBVTT\n\n00:');
 opened.edit(input, other, now); assert.equal(recovery.consume(child), false); assert.deepEqual(recovery.read().input, input);
 const foreign = module.createListeningTranscriptRecovery({ ...options, installationText: 'owner-B' }); assert.throws(() => foreign.read());
 const before = [...values]; current = false; assert.throws(() => recovery.consume(other)); assert.deepEqual([...values], before);
});
