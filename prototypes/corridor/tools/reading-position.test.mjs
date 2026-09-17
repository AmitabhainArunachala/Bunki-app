import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import test from 'node:test';
import { chromium } from 'playwright-core';
import {
  ReadingPositionError,
  createBundledReadingAnchor,
  resolveBundledReadingAnchor,
  sourceTokenSpans,
} from '../reading-position.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));
const hash = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const passage = (
  text = '猫。\n\n猫。',
  surfaces = ['猫', '。', '猫', '。'],
  id = 'test-reading',
) => ({
  id,
  text,
  tokens: surfaces.map((s) => ({ s })),
});
const errorCode = (code) => (error) => error instanceof ReadingPositionError && error.code === code;

test('creates canonical immutable anchors against exact text including paragraph gaps', async () => {
  const p = passage();
  const before = clone(p);
  const anchor = await createBundledReadingAnchor(p, 2);
  assert.deepEqual(anchor, {
    source: {
      sourceId: 'bundled-reading:test-reading',
      versionId: `bundled-text-sha256:${hash(p.text)}`,
      sha256: hash(p.text),
    },
    position: { kind: 'text', unit: 'utf16', start: 4, end: 5, bodyLength: 6 },
  });
  assert.notEqual(anchor.source.sha256, hash(p.tokens.map((token) => token.s).join('')));
  assert.deepEqual(sourceTokenSpans(p), [
    { index: 0, start: 0, end: 1 },
    { index: 1, start: 1, end: 2 },
    { index: 2, start: 4, end: 5 },
    { index: 3, start: 5, end: 6 },
  ]);
  assert.deepEqual(await resolveBundledReadingAnchor(p, anchor), { index: 2, start: 4, end: 5 });
  assert.deepEqual(p, before);
  assert(Object.isFrozen(anchor));
  assert(Object.isFrozen(anchor.source));
  assert(Object.isFrozen(anchor.position));
  assert.equal(Reflect.set(anchor.position, 'start', 0), false);
  assert.equal(Reflect.set(anchor.source, 'sha256', '0'.repeat(64)), false);
  const spans = sourceTokenSpans(p);
  assert(Object.isFrozen(spans));
  assert(spans.every(Object.isFrozen));
  assert.equal(Reflect.set(spans[0], 'end', 20), false);
  const resolved = await resolveBundledReadingAnchor(p, anchor);
  assert(Object.isFrozen(resolved));
  assert.equal(Reflect.set(resolved, 'index', 0), false);
});

test('maps repeated surfaces monotonically and allows only whitespace gaps and suffixes', async () => {
  const p = passage(' \t猫 猫\r\n猫　\n', ['猫', '猫', '猫']);
  assert.deepEqual(sourceTokenSpans(p), [
    { index: 0, start: 2, end: 3 },
    { index: 1, start: 4, end: 5 },
    { index: 2, start: 7, end: 8 },
  ]);
  for (let index = 0; index < p.tokens.length; index += 1) {
    const anchor = await createBundledReadingAnchor(p, index);
    assert.deepEqual(await resolveBundledReadingAnchor(p, anchor), sourceTokenSpans(p)[index]);
  }
  assert.deepEqual(sourceTokenSpans(passage('猫 猫', ['猫', ' ', '猫'])), [
    { index: 0, start: 0, end: 1 },
    { index: 1, start: 1, end: 2 },
    { index: 2, start: 2, end: 3 },
  ]);
  for (const invalid of [
    passage('猫犬猫', ['猫', '猫']),
    passage('犬猫', ['猫']),
    passage('猫。', ['猫']),
    passage('猫\u200b猫', ['猫', '猫']),
    passage('猫猫', ['猫']),
    passage('猫犬', ['犬', '猫']),
    passage('猫。', ['鳥']),
    passage('abc', ['ab', 'bc']),
  ]) {
    assert.throws(() => sourceTokenSpans(invalid), errorCode('token-source-mismatch'));
    await assert.rejects(
      createBundledReadingAnchor(invalid, 0),
      errorCode('token-source-mismatch'),
    );
  }
});

test('retains UTF-16 emoji positions and exact normalization without splitting codepoints', async () => {
  const p = passage('😀猫 e\u0301é', ['😀', '猫', 'e\u0301', 'é'], '声😀');
  assert.deepEqual(sourceTokenSpans(p), [
    { index: 0, start: 0, end: 2 },
    { index: 1, start: 2, end: 3 },
    { index: 2, start: 4, end: 6 },
    { index: 3, start: 6, end: 7 },
  ]);
  const emoji = await createBundledReadingAnchor(p, 0);
  assert.equal(emoji.position.bodyLength, 7);
  assert.equal(emoji.source.sha256, hash(p.text));
  assert.equal(emoji.source.sourceId, 'bundled-reading:声😀');
  for (const position of [
    { ...emoji.position, start: 1 },
    { ...emoji.position, end: 1 },
    { ...emoji.position, start: 1, end: 1 },
  ]) {
    assert.equal(await resolveBundledReadingAnchor(p, { ...emoji, position }), null);
  }
  const combining = await createBundledReadingAnchor(p, 2);
  assert.deepEqual(
    await resolveBundledReadingAnchor(p, {
      ...combining,
      position: { ...combining.position, start: 5, end: 5 },
    }),
    { index: 2, start: 4, end: 6 },
    'codepoint boundaries are not Unicode normalization or grapheme rewriting',
  );
  const normalized = passage(p.text.normalize('NFC'), ['😀', '猫', 'é', 'é'], p.id);
  assert.equal(await resolveBundledReadingAnchor(normalized, combining), null);
});

test('rejects unavailable source data, invalid identities, empty tokens and lone surrogates', async () => {
  const cases = [
    [null, 'source-unavailable'],
    [[], 'source-unavailable'],
    [{}, 'invalid-source-id'],
    [{ ...passage(), id: '' }, 'invalid-source-id'],
    [{ ...passage(), id: 'two ids' }, 'invalid-source-id'],
    [{ ...passage(), id: 'bad\u0000id' }, 'invalid-source-id'],
    [{ ...passage(), id: 'bad\ud800' }, 'invalid-source-id'],
    [{ ...passage(), id: 'x'.repeat(201 - 'bundled-reading:'.length) }, 'invalid-source-id'],
    [{ ...passage(), text: null }, 'invalid-source-text'],
    [passage('', []), 'invalid-source-text'],
    [passage('\ud800', ['\ud800']), 'invalid-source-text'],
    [passage('\udc00', ['\udc00']), 'invalid-source-text'],
    [{ ...passage(), tokens: null }, 'invalid-tokens'],
    [passage('猫', []), 'invalid-tokens'],
    [passage('猫', ['猫', '猫']), 'invalid-tokens'],
    [passage('猫', ['']), 'invalid-token'],
    [passage('😀', ['\ud83d', '\ude00']), 'invalid-token'],
    [{ ...passage(), tokens: [{}] }, 'invalid-token'],
    [{ ...passage(), tokens: [null] }, 'invalid-token'],
    [{ ...passage(), tokens: [{ s: 1 }] }, 'invalid-token'],
    [{ ...passage(), tokens: Array(1) }, 'invalid-token'],
  ];
  const validAnchor = await createBundledReadingAnchor(passage(), 0);
  for (const [invalid, code] of cases) {
    assert.throws(() => sourceTokenSpans(invalid), errorCode(code));
    await assert.rejects(createBundledReadingAnchor(invalid, 0), errorCode(code));
    assert.equal(await resolveBundledReadingAnchor(invalid, validAnchor), null);
  }
  for (const index of [
    -1,
    -0,
    0.5,
    NaN,
    Infinity,
    '0',
    null,
    undefined,
    4,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    await assert.rejects(createBundledReadingAnchor(passage(), index), errorCode('invalid-index'));
  }
  const longestId = passage('猫', ['猫'], 'x'.repeat(200 - 'bundled-reading:'.length));
  assert.equal((await createBundledReadingAnchor(longestId, 0)).source.sourceId.length, 200);
});

test('fails closed for malformed anchor shape, ranges, units and identity claims', async () => {
  const p = passage();
  const anchor = await createBundledReadingAnchor(p, 2);
  const invalid = [null, {}, [], JSON.stringify(anchor), { ...anchor, allowed: true }];
  for (const source of [
    { ...anchor.source, sourceId: 'bundled-reading:another' },
    { ...anchor.source, versionId: `bundled-text-sha256:${'0'.repeat(64)}` },
    { ...anchor.source, sha256: '0'.repeat(64) },
    { ...anchor.source, sha256: anchor.source.sha256.toUpperCase() },
    { ...anchor.source, permissions: { sourceProcessing: true } },
    { ...anchor.source, text: p.text },
  ])
    invalid.push({ ...anchor, source });
  for (const change of [
    { start: -1 },
    { start: -0 },
    { start: 0.5 },
    { start: NaN },
    { start: '4' },
    { start: 6 },
    { end: 3 },
    { end: 7 },
    { end: Infinity },
    { end: -0 },
    { bodyLength: 7 },
    { bodyLength: NaN },
    { bodyLength: Number.MAX_SAFE_INTEGER + 1 },
    { unit: 'token-index' },
    { kind: 'audio' },
    { quote: '猫' },
  ])
    invalid.push({ ...anchor, position: { ...anchor.position, ...change } });
  invalid.push(
    JSON.parse(
      `{"source":${JSON.stringify(anchor.source)},"position":${JSON.stringify(anchor.position)},"__proto__":{}}`,
    ),
  );
  for (const value of invalid) assert.equal(await resolveBundledReadingAnchor(p, value), null);
  let reads = 0;
  assert.equal(
    await resolveBundledReadingAnchor(p, {
      get source() {
        reads += 1;
        throw new Error('serialized anchors cannot contain accessors');
      },
      position: anchor.position,
    }),
    null,
  );
  assert.equal(reads, 0);
});

test('never rebases changed text, whitespace, source identity or missing token coverage', async () => {
  const p = passage();
  const anchor = await createBundledReadingAnchor(p, 2);
  const changed = [
    passage('猫。\n\n犬。', ['猫', '。', '犬', '。']),
    passage('猫。 猫。', ['猫', '。', '猫', '。']),
    passage('猫。\r\n猫。', ['猫', '。', '猫', '。']),
    passage(p.text, ['猫', '。', '猫', '。'], 'new-identity'),
    passage(p.text, ['猫', '。', '猫']),
  ];
  for (const current of changed)
    assert.equal(await resolveBundledReadingAnchor(current, anchor), null);
  assert.deepEqual(await resolveBundledReadingAnchor(clone(p), clone(anchor)), {
    index: 2,
    start: 4,
    end: 5,
  });
  p.tokens[2].s = '犬';
  assert.equal(await resolveBundledReadingAnchor(p, anchor), null);
});

test('resolves changed tokenization only within exact original text', async () => {
  const original = passage('東京へ。\n\n東京へ。', [
    '東',
    '京',
    'へ',
    '。',
    '東',
    '京',
    'へ',
    '。',
  ]);
  const saved = await createBundledReadingAnchor(original, 5);
  const merged = passage(original.text, ['東京', 'へ。', '東京へ', '。']);
  assert.deepEqual(await resolveBundledReadingAnchor(merged, saved), {
    index: 2,
    start: 6,
    end: 9,
  });
  const larger = await createBundledReadingAnchor(merged, 2);
  assert.deepEqual(await resolveBundledReadingAnchor(original, larger), {
    index: 4,
    start: 6,
    end: 7,
  });
  assert.equal(larger.source.sha256, saved.source.sha256);
  assert.equal(larger.source.versionId, saved.source.versionId);
  assert.deepEqual(
    await resolveBundledReadingAnchor(merged, {
      ...saved,
      position: { ...saved.position, start: 8, end: 8 },
    }),
    { index: 2, start: 6, end: 9 },
  );
});

test('maps saved whitespace to the following token and does not invent a token at EOF', async () => {
  const p = passage(' \t猫\n\n犬 \n', ['猫', '犬']);
  const anchor = await createBundledReadingAnchor(p, 0);
  for (const [start, expected] of [
    [0, { index: 0, start: 2, end: 3 }],
    [2, { index: 0, start: 2, end: 3 }],
    [3, { index: 1, start: 5, end: 6 }],
    [4, { index: 1, start: 5, end: 6 }],
    [5, { index: 1, start: 5, end: 6 }],
    [6, null],
    [7, null],
    [8, null],
  ]) {
    assert.deepEqual(
      await resolveBundledReadingAnchor(p, {
        ...anchor,
        position: { ...anchor.position, start, end: start },
      }),
      expected,
    );
  }
});

test('does not return an anchor or resolved token after the source changes while hashing', async () => {
  const p = passage();
  const creating = createBundledReadingAnchor(p, 2);
  p.text = '犬。\n\n犬。';
  p.tokens = ['犬', '。', '犬', '。'].map((s) => ({ s }));
  await assert.rejects(creating, errorCode('source-changed'));
  const stable = passage();
  const anchor = await createBundledReadingAnchor(stable, 2);
  const resolving = resolveBundledReadingAnchor(stable, anchor);
  stable.tokens = ['猫。', '猫。'].map((s) => ({ s }));
  assert.equal(await resolving, null);
  assert.deepEqual(await resolveBundledReadingAnchor(stable, anchor), {
    index: 1,
    start: 4,
    end: 6,
  });
});

test('ignores source metadata and returns only anchor coordinates and identity', async () => {
  const p = { ...passage(), permission: true, quote: 'Not part of an anchor', srs: { due: 1 } };
  const before = clone(p);
  const anchor = await createBundledReadingAnchor(p, 0);
  assert.deepEqual(anchor, await createBundledReadingAnchor(passage(), 0));
  assert.deepEqual(Object.keys(anchor).sort(), ['position', 'source']);
  assert.deepEqual(Object.keys(anchor.source).sort(), ['sha256', 'sourceId', 'versionId']);
  assert.deepEqual(Object.keys(anchor.position).sort(), [
    'bodyLength',
    'end',
    'kind',
    'start',
    'unit',
  ]);
  assert.deepEqual(p, before);
});

test('maps every current indexed bundled body against its complete exact source text', async (t) => {
  const root = new URL('../data/articles/', import.meta.url);
  const index = JSON.parse(await readFile(new URL('index.json', root), 'utf8'));
  assert(index.articles.length > 0);
  let tokenCount = 0;
  let gapCount = 0;
  for (const entry of index.articles) {
    const p = JSON.parse(await readFile(new URL(entry.file, root), 'utf8'));
    assert.equal(p.id, entry.id);
    const spans = sourceTokenSpans(p);
    assert.equal(spans.length, p.tokens.length, p.id);
    let cursor = 0;
    for (const span of spans) {
      assert.equal(p.text.slice(span.start, span.end), p.tokens[span.index].s, p.id);
      assert.match(p.text.slice(cursor, span.start), /^\s*$/u, p.id);
      if (span.start > cursor) gapCount += 1;
      cursor = span.end;
    }
    assert.match(p.text.slice(cursor), /^\s*$/u, p.id);
    for (const tokenIndex of new Set([0, Math.floor(spans.length / 2), spans.length - 1])) {
      const anchor = await createBundledReadingAnchor(p, tokenIndex);
      assert.equal(anchor.source.sha256, hash(p.text), p.id);
      assert.equal(anchor.position.bodyLength, p.text.length, p.id);
      assert.deepEqual(await resolveBundledReadingAnchor(p, anchor), spans[tokenIndex], p.id);
    }
    if (p.id === 'bunki-graded-n5-morning') {
      assert.equal(p.text.length, 301);
      assert.equal(p.tokens.map((token) => token.s).join('').length, 295);
      assert.equal(p.tokens[9].s, '窓');
      assert.deepEqual(
        await resolveBundledReadingAnchor(p, await createBundledReadingAnchor(p, 9)),
        spans[9],
      );
    }
    tokenCount += spans.length;
  }
  assert(gapCount > 0);
  t.diagnostic(
    `Mapped ${index.articles.length} indexed bodies, ${tokenCount} token spans, ${gapCount} whitespace gaps.`,
  );
});

test('native browser ESM and Web Crypto match Node exact-source results', async (t) => {
  const moduleBytes = await readFile(new URL('../reading-position.mjs', import.meta.url));
  const server = createServer((request, response) => {
    if (request.url === '/reading-position.mjs') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' });
      response.end(moduleBytes);
    } else if (request.url === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<!doctype html><title>Reading anchor parity</title>');
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  t.after(() => browser.close());
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const blocked = [];
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    blocked.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin);
  const p = passage('😀猫。\n\n猫é。', ['😀', '猫', '。', '猫', 'é', '。']);
  const expected = await createBundledReadingAnchor(p, 3);
  const actual = await page.evaluate(async (p) => {
    const api = await import('/reading-position.mjs');
    const anchor = await api.createBundledReadingAnchor(p, 3);
    const resolved = await api.resolveBundledReadingAnchor(p, anchor);
    const changed = await api.resolveBundledReadingAnchor({ ...p, id: 'another-source' }, anchor);
    let rejected = '';
    try {
      await api.createBundledReadingAnchor({ ...p, text: '\ud800' }, 0);
    } catch (error) {
      rejected = error.code;
    }
    return {
      anchor,
      resolved,
      changed,
      rejected,
      frozen: [anchor, anchor.source, anchor.position, resolved].every(Object.isFrozen),
      secure: globalThis.isSecureContext,
    };
  }, p);
  assert.deepEqual(actual, {
    anchor: expected,
    resolved: { index: 3, start: 6, end: 7 },
    changed: null,
    rejected: 'invalid-source-text',
    frozen: true,
    secure: true,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  t.diagnostic(`Native browser parity: Chromium ${browser.version()}; external requests sent: 0.`);
});
