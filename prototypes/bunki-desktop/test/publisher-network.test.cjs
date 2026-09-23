'use strict';

const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { createPublisherNetwork } = require('../lib/publisher-network.cjs');
const { loadPublisherFixtures } = require('./publisher-fixtures.cjs');

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
let core, fixture, output, server, handler, cert, port;
const captures = [];
before(async () => {
  ({ core, fixture, output } = await loadPublisherFixtures('publisher-network'));
  const key = path.join(output, 'key.pem');
  const pem = path.join(output, 'cert.pem');
  const result = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', key, '-out', pem, '-subj', '/CN=jp.globalvoices.org', '-addext', 'subjectAltName=DNS:jp.globalvoices.org'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  cert = fs.readFileSync(pem);
  server = https.createServer({ key: fs.readFileSync(key), cert }, (req, res) => handler(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});
after(async () => {
  if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  if (output) fs.writeFileSync(path.join(output, 'transport-receipt.json'), JSON.stringify({ mode: 'actual isolated HTTPS with controlled public-DNS and TLS transport seams', publicNetwork: false, requests: captures }, null, 2));
});

function client(options = {}) {
  return createPublisherNetwork({ core, lookup: publicLookup, request: (args, listener) => {
    captures.push({ hostname: args.hostname, port: args.port, method: args.method, path: args.path, headers: args.headers, rejectUnauthorized: args.rejectUnauthorized });
    assert.equal(args.hostname, 'jp.globalvoices.org');
    assert.equal(args.port, 443);
    assert.equal(args.rejectUnauthorized, true);
    assert.equal(args.method, 'GET');
    args.lookup(args.hostname, {}, (error, address, family) => { assert.ifError(error); assert.equal(address, '93.184.216.34'); assert.equal(family, 4); });
    return https.request({ ...args, port, ca: cert, lookup: (_host, _opts, callback) => callback(null, '127.0.0.1', 4) }, listener);
  }, ...options });
}
function selection(entry = fixture.entry()) { return core.publisherArticleRequest(entry).selection; }
function fetch(options = {}) { return client(options).fetchArticle(fixture.entry(), selection()); }

test('selected article crosses actual HTTPS as exact UTF-8 bytes without cookies, auth or arbitrary headers', async () => {
  const body = fixture.html();
  handler = (req, res) => {
    assert.equal(req.headers.accept, 'text/html');
    assert.equal(req.headers['accept-encoding'], 'identity');
    for (const name of ['cookie', 'authorization', 'if-none-match', 'if-modified-since']) assert.equal(req.headers[name], undefined);
    res.writeHead(200, { 'content-type': 'text/html; charset=UTF-8', 'set-cookie': 'never-store=1' }); res.end(body);
  };
  const result = await fetch();
  assert.equal(result.html, body);
  assert.equal(result.responseBytes, Buffer.byteLength(body));
  assert.equal(result.responseSha256, createHash('sha256').update(body).digest('hex'));
  const parsed = core.createGlobalVoicesArticle(fixture.entry(), { html: result.html, finalUrl: result.finalUrl, contentType: result.contentType, fetchedAt: fixture.NOW, responseSha256: result.responseSha256, responseBytes: result.responseBytes });
  assert.equal(parsed.status, 'full-reader');
  assert.equal(parsed.candidate.article.body.text.includes('𠮷'), true);
});

test('only the selected article slash redirect is accepted, with fresh public DNS on each hop', async () => {
  let count = 0;
  handler = (req, res) => {
    if (req.url.endsWith('/')) { res.writeHead(302, { location: req.url.slice(0, -1) }); res.end(); }
    else { res.writeHead(200, { 'content-type': 'text/html' }); res.end(fixture.html()); }
  };
  const result = await fetch({ lookup: async () => { count += 1; return publicLookup(); } });
  assert.equal(result.finalUrl, fixture.URL.slice(0, -1)); assert.equal(count, 2);
  for (const location of ['https://jp.globalvoices.org/2026/08/03/999/', fixture.URL + '?next=1', 'https://jp.globalvoices.org.attacker.invalid/', 'https://user:pass@jp.globalvoices.org/2026/08/03/65560/', 'http://jp.globalvoices.org/2026/08/03/65560/', 'https://127.0.0.1/private']) {
    handler = (_req, res) => { res.writeHead(302, { location }); res.end(); };
    await assert.rejects(fetch(), /redirect-rejected/u);
  }
});

test('a redirect loop terminates, and public-to-private DNS changes cannot send the next request', async () => {
  handler = (_req, res) => { res.writeHead(302, { location: fixture.URL.slice(0, -1) }); res.end(); };
  await assert.rejects(fetch(), /redirect-rejected/u);
  let count = 0;
  await assert.rejects(fetch({ lookup: async () => ++count === 1 ? publicLookup() : [{ address: '127.0.0.1', family: 4 }] }), /network-error/u);
  assert.equal(count, 2);
});

test('invalid selection and a mixed private/public DNS answer cause no network request', async () => {
  let requested = 0;
  const network = client({ lookup: async () => [{ address: '10.0.0.1', family: 4 }, ...await publicLookup()], request: () => { requested += 1; throw new Error('must not request'); } });
  await assert.rejects(network.fetchArticle(fixture.entry(), selection()), /network-error/u);
  await assert.rejects(network.fetchArticle(fixture.entry(), { ...selection(), url: fixture.URL }), /invalid-reader-selection/u);
  await assert.rejects(network.fetchArticle(fixture.entry(), { ...selection(), revisionId: 'feedv:' + 'f'.repeat(64) }), /entry-revised/u);
  assert.equal(requested, 0);
});

test('absolute timeout covers stalled DNS and stalled HTTPS bodies; caller cancellation aborts real I/O', async () => {
  await assert.rejects(fetch({ lookup: () => new Promise(() => {}), timeoutMs: 30 }), /network-timeout/u);
  handler = (_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.write('<html>'); };
  await assert.rejects(fetch({ timeoutMs: 60 }), /network-timeout/u);
  const controller = new AbortController();
  handler = (_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.write('<html>'); controller.abort(); };
  await assert.rejects(client().fetchArticle(fixture.entry(), selection(), controller.signal), /cancelled/u);
});

test('oversize, compression, non-UTF8 and non-HTML never become a reader response', async () => {
  handler = (_req, res) => { res.writeHead(200, { 'content-type': 'text/html', 'content-length': 101 }); res.end('x'.repeat(101)); };
  await assert.rejects(fetch({ maxBytes: 100 }), /html-size-limit/u);
  handler = (_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.write('x'.repeat(60)); res.end('y'.repeat(60)); };
  await assert.rejects(fetch({ maxBytes: 100 }), /html-size-limit/u);
  for (const contentType of ['application/javascript', 'text/html; charset=Shift_JIS', 'text/plain']) {
    handler = (_req, res) => { res.writeHead(200, { 'content-type': contentType }); res.end(fixture.html()); };
    await assert.rejects(fetch(), /unsupported-mime/u);
  }
  handler = (_req, res) => { res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' }); res.end('compressed'); };
  await assert.rejects(fetch(), /invalid-encoding/u);
  handler = (_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(Buffer.from([0xc3, 0x28])); };
  await assert.rejects(fetch(), /invalid-encoding/u);
});

test('UTF-8 BOM preserves the exact raw-response digest while extracting the same article', async () => {
  const body = '\uFEFF' + fixture.html();
  handler = (_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(body); };
  const result = await fetch();
  assert.equal(result.html, body);
  assert.equal(result.responseSha256, createHash('sha256').update(body).digest('hex'));
  assert.equal(core.createGlobalVoicesArticle(fixture.entry(), { ...fixture.response(body) }).status, 'full-reader');
});

test('403 and 429 return truthful status with no retained error-page body or automatic retry', async () => {
  for (const status of [403, 404, 429, 500]) {
    const before = captures.length;
    handler = (_req, res) => { res.writeHead(status, { 'retry-after': '7200' }); res.end('UPSTREAM_PRIVATE_BODY'); };
    const result = await fetch();
    assert.equal(result.status, status); assert.equal(result.html, null);
    assert.equal(result.retryAfter, '7200'); assert.equal(captures.length, before + 1);
    assert.equal(JSON.stringify(result).includes('UPSTREAM_PRIVATE_BODY'), false);
  }
});
