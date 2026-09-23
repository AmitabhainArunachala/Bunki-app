'use strict';

const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { createPublisherReader } = require('../lib/publisher-reader.cjs');
const { loadPublisherFixtures } = require('./publisher-fixtures.cjs');

let core, fixture, output;
const receipts = [];
before(async () => { ({ core, fixture, output } = await loadPublisherFixtures('publisher-reader')); });
after(() => { if (output) fs.writeFileSync(path.join(output, 'reader-receipt.json'), JSON.stringify({ mode: 'actual compiled core with trusted in-memory selected entries and controlled network outcomes', publicNetwork: false, events: receipts }, null, 2)); });

function setup(options = {}) {
  const entry = fixture.entry();
  const entries = new Map([[entry.id, entry]]);
  let permitted = true;
  let responder = async () => ({ status: 200, ...fixture.response(), durationMs: 3 });
  const requests = [];
  const events = [];
  const reader = createPublisherReader({ core, resolveEntry: (selected) => entries.get(selected.entryId), enabled: () => permitted,
    now: () => Date.parse(fixture.NOW), onEvent: (value) => { events.push(value); receipts.push(value); },
    network: { fetchArticle: async (...args) => { requests.push(args); return responder(...args); } }, ...options });
  return { reader, entry, entries, selection: core.publisherArticleRequest(entry).selection, requests, events,
    permitted: (value) => { permitted = value; }, respond: (value) => { responder = value; } };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
const pendingResponse = (fx) => {
  let finish;
  fx.respond(() => new Promise((resolve) => { finish = resolve; }));
  return () => finish({ status: 200, ...fixture.response() });
};

test('one explicitly selected trusted entry becomes an immutable shared reader result and bounded metadata event', async () => {
  const fx = setup();
  const result = await fx.reader.read(fx.selection);
  assert.equal(result.status, 'full-reader');
  assert.equal(fx.requests.length, 1);
  assert.deepEqual(fx.requests[0][0], fx.entry);
  assert.deepEqual(fx.requests[0][1], fx.selection);
  assert.equal(result.sourceDocument.authors[0].name, 'Fixture Author');
  assert.equal(result.sourceDocument.translators[0].name, '翻訳者');
  assert.deepEqual(core.parsePublisherReadResult(JSON.parse(JSON.stringify(result)), fx.selection), result);
  assert(Object.isFrozen(result.candidate.article.body));
  assert.equal(fx.events[0].characters, result.candidate.article.body.text.length);
  for (const forbidden of [fixture.BODY, 'Fixture Author', '翻訳者', '<html', 'https://']) assert.equal(JSON.stringify(fx.events).includes(forbidden), false);
  await fx.reader.close();
});

test('renderer URLs, unknown entries, forged source IDs and stale revisions cannot cause a request', async () => {
  const fx = setup();
  for (const input of [{ ...fx.selection, url: fixture.URL }, { ...fx.selection, sourceId: 'asahi' }, { sourceId: 'global-voices', entryId: 'wrong', revisionId: 'wrong' }])
    assert.throws(() => fx.reader.read(input), /invalid-reader-selection/u);
  await assert.rejects(fx.reader.read({ ...fx.selection, entryId: 'feed:' + '0'.repeat(64) }), /entry-unavailable/u);
  await assert.rejects(fx.reader.read({ ...fx.selection, revisionId: 'feedv:' + '0'.repeat(64) }), /entry-revised/u);
  assert.equal(fx.requests.length, 0);
  await fx.reader.close();
});

test('duplicate clicks share one pending request, while distinct selections have a bounded concurrency limit', async () => {
  const fx = setup();
  const releases = [];
  fx.respond(() => new Promise((resolve) => releases.push(resolve)));
  const first = fx.reader.read(fx.selection);
  assert.equal(fx.reader.read(fx.selection), first);
  const secondEntry = fixture.entry({ url: fixture.URL.replace('65560', '65561') });
  const thirdEntry = fixture.entry({ url: fixture.URL.replace('65560', '65562') });
  fx.entries.set(secondEntry.id, secondEntry); fx.entries.set(thirdEntry.id, thirdEntry);
  const second = fx.reader.read(core.publisherArticleRequest(secondEntry).selection);
  assert.throws(() => fx.reader.read(core.publisherArticleRequest(thirdEntry).selection), /reader-busy/u);
  await tick(); assert.equal(fx.requests.length, 2);
  for (const release of releases) release({ status: 403 });
  const results = await Promise.all([first, second]);
  for (const result of results) assert.equal(result.reason, 'http-forbidden');
  await fx.reader.close();
});

test('policy disable before fetching supplies a link and performs no network operation', async () => {
  const fx = setup(); fx.permitted(false);
  const result = await fx.reader.read(fx.selection);
  assert.equal(result.reason, 'policy-disabled'); assert.equal(result.candidate.article.body, null);
  assert.equal(fx.requests.length, 0);
  await fx.reader.close();
});

test('revocation while a response is in flight discards its body before it reaches the renderer', async () => {
  const fx = setup(); const release = pendingResponse(fx);
  const result = fx.reader.read(fx.selection); await tick();
  fx.permitted(false); release();
  const selected = await result;
  assert.equal(selected.reason, 'policy-disabled'); assert.equal(selected.candidate.article.body, null);
  assert.equal(selected.sourceDocument, null);
  assert.equal(JSON.stringify(selected).includes(fixture.BODY), false);
  await fx.reader.close();
});

test('an entry replaced or removed during fetching cannot attach a body to a stale shelf selection', async () => {
  for (const mode of ['replaced', 'removed']) {
    const fx = setup(); const release = pendingResponse(fx);
    const result = fx.reader.read(fx.selection); await tick();
    if (mode === 'replaced') fx.entries.set(fx.entry.id, fixture.entry({ title: '更新された見出し' }));
    else fx.entries.delete(fx.entry.id);
    release();
    const selected = await result;
    assert.equal(selected.reason, mode === 'replaced' ? 'entry-revised' : 'entry-unavailable');
    assert.equal(selected.candidate.article.body, null); assert.deepEqual(selected.selection, fx.selection);
    await fx.reader.close();
  }
});

test('closing cancels in-flight I/O, drains requests and prevents later fetches', async () => {
  const fx = setup(); let aborted = false;
  fx.respond((_entry, _selection, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new core.PublisherReaderError('cancelled')); }, { once: true })));
  const pending = fx.reader.read(fx.selection); await tick();
  await fx.reader.close();
  assert.equal(aborted, true);
  assert.equal((await pending).reason, 'cancelled');
  assert.equal((await fx.reader.read(fx.selection)).reason, 'cancelled');
  assert.equal(fx.requests.length, 1);
});

test('HTTP refusal, throttling, parser failures and transport errors return explicit links without auto retry', async () => {
  const cases = [
    [async () => ({ status: 403 }), 'http-forbidden'],
    [async () => ({ status: 429, retryAfter: '7200' }), 'http-rate-limited'],
    [async () => ({ status: 404 }), 'http-not-found'],
    [async () => ({ status: 500 }), 'http-failed'],
    [async () => ({ status: 200, ...fixture.response(fixture.html().replace('class="entry"', 'class="changed-template"')) }), 'template-changed'],
    [async () => ({ status: 200, ...fixture.response(fixture.html().replace('/licenses/by/3.0/', '/licenses/by-nc-nd/4.0/')) }), 'license-unreviewed'],
    [async () => { throw new core.PublisherReaderError('network-timeout'); }, 'network-timeout'],
    [async () => { throw new Error('arbitrary upstream private error'); }, 'network-error'],
  ];
  for (const [respond, reason] of cases) {
    const fx = setup(); fx.respond(respond);
    const result = await fx.reader.read(fx.selection);
    assert.equal(result.status, 'publisher-link'); assert.equal(result.reason, reason);
    assert.equal(result.candidate.article.body, null); assert.equal(fx.requests.length, 1);
    assert.equal(JSON.stringify(result).includes('arbitrary upstream private error'), false);
    await fx.reader.close();
  }
});
