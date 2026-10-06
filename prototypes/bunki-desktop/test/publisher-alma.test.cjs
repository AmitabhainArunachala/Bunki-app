'use strict';
const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const https = require('node:https');
const { createPublisherNetwork } = require('../lib/publisher-network.cjs');
const { createPublisherReader } = require('../lib/publisher-reader.cjs');
const { loadAlmaFixtures } = require('./publisher-alma-fixtures.cjs');
let core, URL, POLICY, NOW, RIGHTS, html, policyHtml, entry, selection, sha;
const records = [],
  events = [];
let output, server, handler, cert, port;
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
before(async () => {
  const loaded = await loadAlmaFixtures();
  ({ core, output } = loaded);
  ({ URL, POLICY, NOW, RIGHTS, html, policyHtml, entry, sha } = loaded.fixture);
  selection = (selected = entry()) => core.publisherArticleRequest(selected).selection;
  const key = resolve(output, 'synthetic-key.pem'),
    pem = resolve(output, 'synthetic-cert.pem');
  const generated = spawnSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-keyout',
      key,
      '-out',
      pem,
      '-subj',
      '/CN=alma-telescope.jp',
      '-addext',
      'subjectAltName=DNS:alma-telescope.jp',
    ],
    { encoding: 'utf8' },
  );
  assert.equal(generated.status, 0, generated.stderr);
  cert = readFileSync(pem);
  server = https.createServer({ key: readFileSync(key), cert }, (req, res) => handler(req, res));
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  port = server.address().port;
});
after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
  if (output)
    writeFileSync(
      resolve(output, 'receipt.json'),
      JSON.stringify(
        {
          version: 1,
          mechanism:
            'Actual isolated HTTPS and certificate verification; node-only DNS/connection seam directs the fixed public hostname to loopback. Original synthetic article. Real reviewed legal text in synthetic policy layout. No public network.',
          publicNetwork: false,
          records,
          events,
        },
        null,
        2,
      ) + '\n',
    );
});
function client(options = {}) {
  return createPublisherNetwork({
    core,
    now: () => Date.parse(NOW),
    lookup: publicLookup,
    request(args, listener) {
      records.push({
        hostname: args.hostname,
        port: args.port,
        path: args.path,
        method: args.method,
        headers: args.headers,
        rejectUnauthorized: args.rejectUnauthorized,
      });
      assert.equal(args.hostname, 'alma-telescope.jp');
      assert.equal(args.port, 443);
      assert.equal(args.method, 'GET');
      assert.equal(args.rejectUnauthorized, true);
      assert.equal(args.headers.accept, 'text/html');
      assert.equal(args.headers['accept-encoding'], 'identity');
      for (const key of ['cookie', 'authorization', 'if-none-match', 'if-modified-since'])
        assert.equal(args.headers[key], undefined);
      args.lookup(args.hostname, {}, (error, address, family) => {
        assert.ifError(error);
        assert.equal(address, '93.184.216.34');
        assert.equal(family, 4);
      });
      return https.request(
        {
          ...args,
          port,
          ca: cert,
          lookup: (_host, _options, callback) => callback(null, '127.0.0.1', 4),
        },
        listener,
      );
    },
    ...options,
  });
}
const send = (res, body) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=UTF-8', 'set-cookie': 'never-store=1' });
  res.end(body);
};
const normal = (req, res) => send(res, req.url === '/policy/' ? policyHtml() : html());
const fetch = (options = {}, selected = entry(), signal) =>
  client(options).fetchArticle(selected, selection(selected), signal);
const bodyResponse = (raw) => ({
  html: raw.html,
  finalUrl: raw.finalUrl,
  contentType: raw.contentType,
  responseSha256: raw.responseSha256,
  responseBytes: raw.responseBytes,
  fetchedAt: NOW,
});

test('ALMA actual HTTPS reads fixed policy first, then the selected article, with exact UTF-8 hashes and no credentials', async () => {
  handler = normal;
  const start = records.length;
  const raw = await fetch();
  assert.deepEqual(
    records.slice(start).map((r) => r.path),
    ['/policy/', '/news/fixture-202607.html'],
  );
  assert.equal(raw.policy.html, policyHtml());
  assert.equal(raw.policy.responseSha256, sha(policyHtml()));
  assert.equal(raw.html, html());
  assert.equal(raw.responseSha256, sha(html()));
  assert.equal(raw.responseBytes, Buffer.byteLength(html()));
  const result = core.createSelectedPublisherArticle(entry(), bodyResponse(raw), raw.policy);
  assert.equal(result.status, 'full-reader');
});

test('changed policy text or unknown policy shape stops before any article request', async () => {
  for (const content of [
    policyHtml(RIGHTS.replace('複製、再配布', '転載禁止、再配布')),
    policyHtml().replace('common_page_body', 'unknown_policy'),
  ]) {
    const start = records.length;
    handler = (_req, res) => send(res, content);
    await assert.rejects(fetch(), /license-(?:unreviewed|missing)/u);
    assert.deepEqual(
      records.slice(start).map((r) => r.path),
      ['/policy/'],
    );
  }
});

test('policy and article redirects reject aliases, other paths and domains before the redirected request', async () => {
  for (const [scope, location] of [
    ['policy', POLICY.slice(0, -1)],
    ['policy', 'https://www.nao.ac.jp/terms/'],
    ['article', URL.slice(0, -5)],
    ['article', URL + '?x=1'],
    ['article', 'https://alma-telescope.jp/publication/'],
    ['article', 'https://127.0.0.1/private'],
  ]) {
    const start = records.length;
    handler = (req, res) => {
      if (scope === 'article' && req.url === '/policy/') return send(res, policyHtml());
      res.writeHead(302, { location });
      res.end();
    };
    await assert.rejects(fetch(), /redirect-rejected/u);
    assert.equal(records.length - start, scope === 'policy' ? 1 : 2);
  }
});

test('forged renderer fields, wrong revision, unsupported source and private DNS cause zero requests', async () => {
  let requested = 0,
    resolved = 0;
  const network = client({
    lookup: async () => {
      resolved += 1;
      return [{ address: '10.0.0.1', family: 4 }, ...(await publicLookup())];
    },
    request() {
      requested += 1;
      throw new Error('must-not-request');
    },
  });
  await assert.rejects(
    network.fetchArticle(entry(), { ...selection(), url: URL }),
    /invalid-reader-selection/u,
  );
  await assert.rejects(
    network.fetchArticle(entry(), { ...selection(), revisionId: 'feedv:' + 'a'.repeat(64) }),
    /entry-revised/u,
  );
  await assert.rejects(
    network.fetchArticle(entry(), { ...selection(), sourceId: 'naoj' }),
    /invalid-reader-selection/u,
  );
  assert.equal(resolved, 0);
  await assert.rejects(network.fetchArticle(entry(), selection()), /network-error/u);
  assert.equal(resolved, 1);
  assert.equal(requested, 0);
});

test('policy HTTP refusal never requests the article and never exposes the error body or retries', async () => {
  for (const [status, code] of [
    [403, 'http-forbidden'],
    [404, 'http-not-found'],
    [429, 'http-rate-limited'],
    [500, 'http-failed'],
  ]) {
    const start = records.length;
    handler = (_req, res) => {
      res.writeHead(status, { 'retry-after': '7200' });
      res.end('PRIVATE_ERROR_BODY');
    };
    await assert.rejects(fetch(), (error) => {
      assert.equal(error.code, code);
      assert(!JSON.stringify(error).includes('PRIVATE_ERROR_BODY'));
      return true;
    });
    assert.equal(records.length - start, 1);
  }
});

test('article HTTP refusal retains exact status without error-page text or automatic retry', async () => {
  for (const status of [403, 404, 429, 500]) {
    const start = records.length;
    handler = (req, res) => {
      if (req.url === '/policy/') return send(res, policyHtml());
      res.writeHead(status, { 'retry-after': '7200' });
      res.end('PRIVATE_ERROR_BODY');
    };
    const raw = await fetch();
    assert.equal(raw.status, status);
    assert.equal(raw.html, null);
    assert(!JSON.stringify(raw).includes('PRIVATE_ERROR_BODY'));
    assert.equal(records.length - start, 2);
  }
});

test('one deadline spans the policy and article, including DNS stalls, and cancellation aborts actual I/O', async () => {
  await assert.rejects(
    fetch({ lookup: () => new Promise(() => {}), timeoutMs: 25 }),
    /network-timeout/u,
  );
  handler = (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.write('<html>');
  };
  await assert.rejects(fetch({ timeoutMs: 40 }), /network-timeout/u);
  const start = records.length,
    started = Date.now();
  handler = (req, res) =>
    setTimeout(() => send(res, req.url === '/policy/' ? policyHtml() : html()), 90);
  await assert.rejects(fetch({ timeoutMs: 150 }), /network-timeout/u);
  assert.equal(records.length - start, 2);
  assert(Date.now() - started < 220);
  const controller = new AbortController();
  handler = (req, res) => {
    if (req.url === '/policy/') return send(res, policyHtml());
    res.writeHead(200, { 'content-type': 'text/html' });
    res.write('<html>');
    controller.abort();
  };
  await assert.rejects(fetch({}, entry(), controller.signal), /cancelled/u);
});

test('MIME, encoding, compression and size refusals apply independently to policy and article', async () => {
  for (const stage of ['policy', 'article'])
    for (const [headers, bytes, options, code] of [
      [
        { 'content-type': 'text/html; charset=Shift_JIS' },
        Buffer.from('x'),
        {},
        'unsupported-mime',
      ],
      [{ 'content-type': 'text/html' }, Buffer.from([0xc3, 0x28]), {}, 'invalid-encoding'],
      [
        { 'content-type': 'text/html', 'content-encoding': 'gzip' },
        Buffer.from('x'),
        {},
        'invalid-encoding',
      ],
      [
        { 'content-type': 'text/html', 'content-length': 12001 },
        Buffer.from('x'.repeat(12001)),
        { maxBytes: 12000 },
        'html-size-limit',
      ],
    ]) {
      const start = records.length;
      handler = (req, res) => {
        if (stage === 'article' && req.url === '/policy/') return send(res, policyHtml());
        res.writeHead(200, headers);
        res.end(bytes);
      };
      await assert.rejects(fetch(options), new RegExp(code, 'u'));
      assert.equal(records.length - start, stage === 'policy' ? 1 : 2);
    }
});

test('BOMs preserve exact received policy and article hashes while normalizing identical prose', async () => {
  handler = (req, res) => send(res, '\uFEFF' + (req.url === '/policy/' ? policyHtml() : html()));
  const raw = await fetch();
  assert.equal(raw.policy.responseSha256, sha('\uFEFF' + policyHtml()));
  assert.equal(raw.responseSha256, sha('\uFEFF' + html()));
  const result = core.createSelectedPublisherArticle(entry(), bodyResponse(raw), raw.policy);
  assert.equal(result.status, 'full-reader');
});

test('actual native selected reader emits metadata-only evidence and preserves complete validated ALMA wrapper', async () => {
  handler = normal;
  const reader = createPublisherReader({
    core,
    network: client(),
    resolveEntry: () => entry(),
    now: () => Date.parse(NOW),
    onEvent: (event) => events.push(event),
  });
  try {
    const result = await reader.read(selection());
    assert.equal(result.status, 'full-reader');
    assert.deepEqual(
      core.parsePublisherReadResult(JSON.parse(JSON.stringify(result)), selection()),
      result,
    );
    const event = events.at(-1);
    assert.equal(event.policyResponseSha256, sha(policyHtml()));
    assert.equal(event.contentSha256, result.candidate.article.body.contentSha256);
    assert(!JSON.stringify(event).includes('試験専用'));
  } finally {
    await reader.close();
  }
});

test('policy revocation, removed selection and revised selection during actual I/O cannot publish the fetched body', async () => {
  for (const reason of ['policy-disabled', 'entry-unavailable', 'entry-revised']) {
    let enabled = true,
      current = entry();
    handler = (req, res) => {
      if (req.url === '/policy/') return send(res, policyHtml());
      if (reason === 'policy-disabled') enabled = false;
      else current = reason === 'entry-unavailable' ? null : entry({ title: '改訂された題名' });
      send(res, html());
    };
    const reader = createPublisherReader({
      core,
      network: client(),
      resolveEntry: () => current,
      enabled: () => enabled,
      now: () => Date.parse(NOW),
    });
    try {
      const result = await reader.read(selection());
      assert.equal(result.reason, reason);
      assert.equal(result.candidate.article.body, null);
    } finally {
      await reader.close();
    }
  }
});

test('native policy disable or malformed selected identity refuses before transport', async () => {
  const start = records.length;
  const reader = createPublisherReader({
    core,
    network: client(),
    resolveEntry: () => entry(),
    enabled: () => false,
    now: () => Date.parse(NOW),
  });
  try {
    assert.throws(() => reader.read({ ...selection(), url: URL }), /invalid-reader-selection/u);
    const result = await reader.read(selection());
    assert.equal(result.reason, 'policy-disabled');
    assert.equal(records.length, start);
  } finally {
    await reader.close();
  }
});

test('duplicate selections share a request, only two distinct reads run, and native close drains actual held requests', async () => {
  const entries = [
    entry(),
    entry({ url: URL.replace('fixture-', 'second-') }),
    entry({ url: URL.replace('fixture-', 'third-') }),
  ];
  const byId = new Map(entries.map((selected) => [selected.id, selected]));
  let held = 0,
    releaseHeld;
  const ready = new Promise((done) => {
    releaseHeld = done;
  });
  handler = (req, res) => {
    if (req.url === '/policy/') return send(res, policyHtml());
    res.writeHead(200, { 'content-type': 'text/html' });
    res.write('<html>');
    if (++held === 2) releaseHeld();
  };
  const reader = createPublisherReader({
    core,
    network: client(),
    resolveEntry: (selected) => byId.get(selected.entryId),
    now: () => Date.parse(NOW),
  });
  const first = reader.read(selection(entries[0]));
  assert.equal(reader.read(selection(entries[0])), first);
  const second = reader.read(selection(entries[1]));
  assert.throws(() => reader.read(selection(entries[2])), /reader-busy/u);
  await ready;
  await reader.close();
  const results = await Promise.all([first, second]);
  assert(
    results.every(
      (result) => result.reason === 'cancelled' && result.candidate.article.body === null,
    ),
  );
  assert.equal(held, 2);
});
