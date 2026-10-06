import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
assert(process.env.KAIRO_SITE_DIR, 'Supply a staged KAIRO_SITE_DIR');
const site = resolve(process.env.KAIRO_SITE_DIR), manifest = JSON.parse(readFileSync(resolve(site, 'build-identity.json')));
for (const path of ['source-inbox.mjs', 'modules/reading-core.mjs']) assert.equal(createHash('sha256').update(readFileSync(resolve(site, path))).digest('hex'), manifest.files.find(f => f.path === path)?.sha256);
const module = await import(pathToFileURL(resolve(site, 'source-inbox.mjs')));
const id = 'b1432bf6-67f7-43ed-8077-c41c5d413cc8', child = 'c62d6bfd-dc84-45ad-8898-7cbcb485a4ee', other = '780cc847-b359-4f43-9521-120e2b546079', now = '2026-09-12T20:00:00.000Z';
const file = { name: '読む.pdf', sha256: 'a'.repeat(64), bytes: 1300, mimeType: 'application/pdf', kind: 'pdf', pageCount: 5 };
const observation = { version: 1, file, pages: [{ page: 3, width: 800, height: 600, rotation: 0, coordinateSpace: 'normalized-top-left-unrotated-media-box',
  unit: 'utf16-code-unit', provider: 'apple-pdfkit-text', text: '町の図書館。', regions: [] }] };
const document = module.reviewFileText(observation, [{ page: 3, text: '町の図書館で読む。' }]);
const input = { id, capturedAt: now, title: '読む本', sourceId: null, file, document: null };
const pointer = () => module.addFileCapture(null, input);
const added = () => module.addFileCapture(pointer(), { ...input, id: child, sourceId: id, document });
const clone = raw => JSON.parse(JSON.stringify(raw));
test('file pointers remain neutral, without invented URLs, text or learning capabilities', () => {
  const inbox = pointer(), saved = module.selectSourceCapture(inbox, id);
  assert.equal(inbox.version, 4); assert.equal(saved.encounterUrl, null); assert.equal(saved.candidate.article.body, null);
  assert.equal(saved.candidate.article.capabilities['display-body'].status, 'unknown');
  assert.deepEqual(module.parseSourceInbox(clone(inbox)), inbox); assert.deepEqual(module.addFileCapture(inbox, input), inbox);
  assert.equal(module.selectFileCapture(inbox, id).file.sha256, file.sha256);
});
test('reviewed pages form an immutable child reading with original extraction and exact source page', () => {
  const inbox = added(), saved = module.selectSourceCapture(inbox, child);
  assert.equal(inbox.entries.length, 2); assert.equal(saved.candidate.article.body.text, document.body);
  assert.equal(module.selectFileCapture(inbox, child).document.observation.pages[0].text, observation.pages[0].text);
  assert.deepEqual(module.selectFileTextRange(inbox, child, { sourceDigest: document.bodySha256, start: 0, end: 1, quote: '町' }), { pages: [{ page: 3, changed: true, regions: [] }] });
  for (const op of ['ai-transform', 'sync-body', 'synthesize-audio']) assert.equal(saved.candidate.article.capabilities[op].status, 'unknown');
  assert.deepEqual(module.parseSourceInbox(clone(inbox)), inbox);
});
test('unbound references, fabricated rights, parent cycles and changed byte identities fail closed', () => {
  for (const edit of [d => { d.files[1].sourceId = child; }, d => { d.files[1].file.sha256 = 'b'.repeat(64); },
    d => { d.files[1].provenance.kind = 'publisher'; }, d => { d.files[0].captureId = other; },
    d => { d.entries[1].candidate.article.capabilities['ai-transform'].status = 'allowed'; }, d => { d.files[1].document.pages[0].page = 1; },
    d => { d.entries[1].encounterUrl = 'file:///private/file.pdf'; }, d => { d.files.push(clone(d.files[0])); }]) {
    const changed = clone(added()); edit(changed); assert.throws(() => module.parseSourceInbox(changed));
  }
  assert.throws(() => module.addFileCapture(added(), { ...input, id: child, sourceId: id, document: module.reviewFileText(observation, [{ page: 3, text: '違う。' }]) }));
});
test('legacy source and transcript writes preserve file evidence in v4', () => {
  const before = added(); let next = module.acceptSourceCapture(before, module.createSourceCapture({ id: other, capturedAt: now, title: '映像', url: 'https://example.org/video', text: '' }));
  next = module.registerListeningSource(next, { sourceId: other, kind: 'video', creator: '' });
  next = module.addListeningTranscript(next, other, { id: 'f3a5347f-c90a-4ec4-bd9e-415427b95b38', capturedAt: now,
    input: { origin: 'paste', name: '字幕.srt', format: 'srt', text: '1\n00:00:00,000 --> 00:00:02,000\n町。' } });
  assert.equal(next.version, 4); assert.deepEqual(next.files, before.files); assert.equal(next.transcripts.length, 1);
  assert.deepEqual(module.parseSourceInbox(clone(next)), next);
});
test('file draft recovery survives a restart and consumes only the submitted revision', () => {
  const storage = new Map(); let current = true;
  const options = { storage: { getItem: key => storage.get(key) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: key => storage.delete(key) },
    installationText: 'one-installation', databaseName: 'file-test', assertCurrent: () => current };
  const draft = { title: '読む', sourceId: id, file, observation, reviewedPages: [{ page: 3, text: '途中まで直した。' }] };
  const recovery = module.createFileCaptureRecovery(options); recovery.edit(draft, child, now);
  assert.equal(module.createFileCaptureRecovery(options).read().input.reviewedPages[0].text, draft.reviewedPages[0].text);
  recovery.edit({ ...draft, title: '次の編集' }, other, now); assert.equal(recovery.consume(child), false);
  assert.throws(() => module.createFileCaptureRecovery({ ...options, installationText: 'other' }).read());
  const before = [...storage]; current = false; assert.throws(() => recovery.consume(other)); assert.deepEqual([...storage], before);
});
