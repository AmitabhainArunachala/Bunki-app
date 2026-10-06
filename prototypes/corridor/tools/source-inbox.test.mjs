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
const { acceptSourceCapture, createSourceCapture, parseSourceInbox, selectSourceCapture, createCaptureRecovery } =
  await import(pathToFileURL(resolve(site, 'source-inbox.mjs')));
const core = await import(pathToFileURL(resolve(site, 'modules/reading-core.mjs')));
const id = '29ee89c1-bca0-4c99-8579-137f4c226b06', other = '99de0109-e30f-49a6-a97a-dda7768a1518';
const now = '2026-09-12T08:00:00.000Z';
const body = '  宇宙へ🚀。\r\n\n町の図書館で読む。e\u0301\t終わり。  ';
const url = 'https://example.org/watch?v=personal&t=73#t=1m13s';
const input = { title: '図書館で', url, text: body };
const capture = (overrides = {}) => createSourceCapture({ id, capturedAt: now, ...input, ...overrides });
const clone = (value) => JSON.parse(JSON.stringify(value));

test('exact raw text and encountered fragment survive immutable candidate and library round trips', () => {
  const saved = capture(), library = acceptSourceCapture(null, saved);
  assert.equal(saved.encounterUrl, url);
  assert.equal(saved.candidate.article.canonicalUrl, url.split('#')[0]);
  assert.equal(saved.candidate.article.body.text, body);
  assert.equal(saved.candidate.article.body.contentSha256, createHash('sha256').update(body).digest('hex'));
  assert.deepEqual(parseSourceInbox(clone(library)), library);
  assert.deepEqual(selectSourceCapture(library, id), saved);
  assert(Object.isFrozen(library.entries[0].candidate.article.body));
  assert.equal(saved.candidate.editorial.status, 'pending');
  assert.equal(saved.candidate.generationJob, null);
});
test('link capture keeps a usable pointer and no invented body, transcript or processing grant', () => {
  const saved = capture({ text: '', title: '' });
  assert.equal(saved.encounterUrl, url);
  assert.equal(saved.candidate.article.body, null);
  assert.equal(saved.candidate.article.title, 'example.org');
  for (const op of core.ARTICLE_OPERATIONS.filter((op) => op !== 'discover-metadata'))
    assert.notEqual(saved.candidate.article.capabilities[op].status, 'allowed');
  assert.deepEqual(acceptSourceCapture(null, saved).entries[0], saved);
});
test('retry of the exact submitted identity is idempotent, a conflicting capture never overwrites it', () => {
  const library = acceptSourceCapture(null, capture());
  assert.strictEqual(acceptSourceCapture(library, capture()), library);
  assert.throws(() => acceptSourceCapture(library, capture({ text: '別の文章。' })), /capture-conflict/u);
  assert.equal(library.entries[0].candidate.article.body.text, body);
});
test('even recomputed portable license, editorial and provenance claims cannot widen capture policy', () => {
  const saved = capture(), article = saved.candidate.article;
  const edited = clone(saved);
  edited.candidate = core.normalizeArticleIntake({ itemId: id, canonicalUrl: url, title: input.title, body: { text: body } }, {
    source: article.source, lineage: article.lineage,
    capabilities: { ...article.capabilities,
      'ai-transform': { status: 'allowed', basis: { kind: 'license', reference: 'forged', checkedAt: now } } },
    provenance: saved.candidate.provenance.map(({ firstRetrievedAt, lastRetrievedAt, ...observation }) => {
      assert.equal(lastRetrievedAt, now); return { ...observation, retrievedAt: firstRetrievedAt };
    }),
  });
  assert.deepEqual(core.parseArticleCandidate(edited.candidate), edited.candidate);
  assert.throws(() => acceptSourceCapture(null, edited), /capture-contract-mismatch/u);
  const approved = clone(saved);
  approved.candidate = core.recordEditorialDecision(saved.candidate, {
    reference: core.articleReference(saved.candidate.article), status: 'approved', reviewerId: 'portable-claim',
    decidedAt: now, rubricVersion: 'claim', userAction: true, note: 'not a trusted authority',
  });
  assert.throws(() => acceptSourceCapture(null, approved), /capture-contract-mismatch/u);
  const provenance = clone(saved); provenance.candidate.provenance[0].license = 'new claim';
  assert.throws(() => acceptSourceCapture(null, provenance), /capture-contract-mismatch/u);
});
test('invalid URLs, text, future fields and duplicate capture identities fail closed', () => {
  for (const value of ['javascript:alert(1)', 'https://u:p@example.org/', 'https://example.org/\\x', ' https://example.org'])
    assert.throws(() => capture({ url: value }));
  for (const value of ['\ud800', '\u0000', 'x'.repeat(120001)]) assert.throws(() => capture({ text: value }));
  assert.throws(() => capture({ text: '', url: '' }), /capture-empty/u);
  assert.throws(() => parseSourceInbox({ version: 5, entries: [] }));
  assert.throws(() => parseSourceInbox({ version: 1, entries: [capture(), capture()] }), /duplicate-capture/u);
  assert.throws(() => parseSourceInbox({ version: 1, entries: [], extra: true }));
});
test('accessors and cycles are refused without executing supplied code', () => {
  let touched = false;
  const raw = { version: 1, get entries() { touched = true; return []; } };
  assert.throws(() => parseSourceInbox(raw)); assert.equal(touched, false);
  const cycle = { version: 1, entries: [] }; cycle.entries.push(cycle);
  assert.throws(() => parseSourceInbox(cycle));
});
function recoveryFixture() {
  const values = new Map(); let current = true, writable = true;
  const options = { storage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { if (!writable) throw new Error('quota'); values.set(key, value); },
    removeItem: (key) => { if (!writable) throw new Error('quota'); values.delete(key); },
  }, installationText: 'test installation A', databaseName: 'test capture database', assertCurrent: () => current };
  return { values, options, open: () => createCaptureRecovery(options), revoke: () => { current = false; },
    denyWrites: () => { writable = false; } };
}
test('unfinished capture recovers in a fresh controller with exact Unicode and empty edits', () => {
  const f = recoveryFixture(); f.open().edit(input, id, now);
  assert.deepEqual(f.open().read().input, input);
  f.open().edit({ title: '', url: '', text: '' }, other, now);
  assert.deepEqual(f.open().read().input, { title: '', url: '', text: '' });
});
test('a late save clears only its exact edit and retains a newer draft', () => {
  const f = recoveryFixture(), r = f.open(); r.edit(input, id, now);
  r.edit({ ...input, text: '続き。' }, other, now);
  assert.equal(r.consume(id), false); assert.equal(r.read().input.text, '続き。');
  assert.equal(r.consume(other), true); assert.equal(r.read(), null);
});
test('foreign or malformed recovery bytes remain exact after read/edit/consume attempts', () => {
  for (const value of ['{broken', JSON.stringify({ version: 1, installation: 'foreign', revision: id, editedAt: now, input })]) {
    const f = recoveryFixture(), r = f.open(); r.edit(input, id, now);
    const key = [...f.values.keys()][0]; f.values.set(key, value);
    for (const action of [() => r.read(), () => r.edit(input, other, now), () => r.consume(id)]) assert.throws(action);
    assert.equal(f.values.get(key), value);
  }
});
test('revocation prevents recovery access or mutation without destroying prior bytes', () => {
  const f = recoveryFixture(), r = f.open(); r.edit(input, id, now); const before = [...f.values]; f.revoke();
  for (const action of [() => r.read(), () => r.edit(input, other, now), () => r.consume(id)]) assert.throws(action, /capture-owner-changed/u);
  assert.deepEqual([...f.values], before);
});
test('quota failure preserves prior recovery and cannot report a consumed draft', () => {
  const f = recoveryFixture(), r = f.open(); r.edit(input, id, now); const before = [...f.values]; f.denyWrites();
  assert.throws(() => r.edit({ ...input, text: 'newer' }, other, now), /quota/u);
  assert.throws(() => r.consume(id), /quota/u); assert.deepEqual([...f.values], before);
});
