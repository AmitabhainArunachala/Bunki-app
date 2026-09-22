'use strict';

const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { spawnSync } = require('node:child_process');
const { createFeedNetwork, isPublicAddress } = require('../lib/feed-network.cjs');
const { externalPath } = require('../lib/paths.cjs');

const output = externalPath(process.env.KAIRO_EVIDENCE_DIR || path.join(os.homedir(), '.dharma', 'bunki-desktop', 'feed-network-tests'));
fs.mkdirSync(output, { recursive: true });
const root = fs.mkdtempSync(path.join(output, 'network-'));
const source = { feed: { url: 'https://feed.example.com/news', redirectUrls: ['https://feed.example.com/next'] } };
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const captures = [];
let server;
let handler;
let cert;
let port;

before(async () => {
  const key = path.join(root, 'key.pem');
  const pem = path.join(root, 'cert.pem');
  const result = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', key, '-out', pem, '-subj', '/CN=feed.example.com', '-addext', 'subjectAltName=DNS:feed.example.com'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  cert = fs.readFileSync(pem);
  server = https.createServer({ key: fs.readFileSync(key), cert }, (req, res) => handler(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});
after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.writeFileSync(path.join(root, 'transport-receipt.json'), JSON.stringify({ mode: 'real-loopback-HTTPS-with-controlled-DNS-and-transport', publicNetwork: false, requests: captures }, null, 2));
});

function client(options = {}) {
  return createFeedNetwork({ lookup: publicLookup, request: (args, listener) => {
    captures.push({ hostname: args.hostname, port: args.port, method: args.method, path: args.path, headers: args.headers, rejectUnauthorized: args.rejectUnauthorized });
    assert.equal(args.hostname, 'feed.example.com');
    assert.equal(args.port, 443);
    assert.equal(args.rejectUnauthorized, true);
    assert.equal(args.method, 'GET');
    args.lookup(args.hostname, {}, (error, address, family) => { assert.ifError(error); assert.equal(address, '93.184.216.34'); assert.equal(family, 4); });
    // Only this test transport maps an already-checked public address to our
    // temporary TLS server. Production has no environment bypass or test CA.
    return https.request({ ...args, port, ca: cert, lookup: (_host, _opts, callback) => callback(null, '127.0.0.1', 4) }, listener);
  }, ...options });
}

test('public address policy rejects local, reserved, mixed/mapped and documentation addresses', () => {
  for (const address of ['8.8.8.8', '93.184.216.34', '2001:4860:4860::8888', '2606:4700:4700::1111']) assert.equal(isPublicAddress(address), true, address);
  for (const address of ['0.0.0.0', '10.1.2.3', '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.16.2.1', '192.168.1.1', '192.0.0.1', '192.0.2.1', '198.18.1.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '2001::1', '2001:db8::1', '2002:7f00:1::', '3fff::1', 'invalid']) assert.equal(isPublicAddress(address), false, address);
});

test('actual HTTPS preserves UTF-8 bytes and conditional validators, without cookies or credentials', async () => {
  const body = '<rss>科学と日本語</rss>';
  handler = (req, res) => {
    assert.equal(req.headers['if-none-match'], '"old"');
    assert.equal(req.headers['accept-encoding'], 'identity');
    assert.equal(req.headers.cookie, undefined);
    assert.equal(req.headers.authorization, undefined);
    res.writeHead(200, { 'content-type': 'text/html', etag: '"new"', 'set-cookie': 'do-not-store=1' });
    res.end(body);
  };
  const result = await client().fetchSource(source, { 'if-none-match': '"old"' });
  assert.equal(result.xml, body);
  assert.equal(result.bytes, Buffer.byteLength(body));
  assert.equal(result.responseSha256.length, 64);
  assert.equal(result.headers['set-cookie'], undefined);
  assert.equal(result.headers.etag, '"new"');
});

test('redirects must be exact registered URLs and each hop receives fresh checked DNS', async () => {
  let lookups = 0;
  handler = (req, res) => {
    if (req.url === '/news') { res.writeHead(302, { location: '/next' }); res.end('ignored redirect'); }
    else res.end('<rss/>');
  };
  const result = await client({ lookup: async () => { lookups += 1; return publicLookup(); } }).fetchSource(source);
  assert.equal(result.finalUrl, 'https://feed.example.com/next');
  assert.equal(lookups, 2);
  const bad = ['https://feed.example.com/next?different=1', 'https://feed.example.com.evil.invalid/news', 'http://feed.example.com/next', 'https://user:pass@feed.example.com/next', 'https://127.0.0.1/next'];
  for (const location of bad) {
    handler = (_req, res) => { res.writeHead(302, { location }); res.end(); };
    await assert.rejects(client().fetchSource(source), /unregistered-feed-url/u);
  }
});

test('redirect loops terminate, and changed-to-private DNS cannot reach the next request', async () => {
  handler = (_req, res) => { res.writeHead(302, { location: '/next' }); res.end(); };
  await assert.rejects(client().fetchSource(source), /feed-redirect-limit/u);
  let calls = 0;
  await assert.rejects(client({ lookup: async () => ++calls === 1 ? publicLookup() : [{ address: '127.0.0.1', family: 4 }] }).fetchSource(source), /non-public-feed-address/u);
  assert.equal(calls, 2);
});

test('a DNS result containing any private address or an invalid family makes no request', async () => {
  for (const answer of [[], [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }], [{ address: '93.184.216.34', family: 6 }]]) {
    let requested = false;
    const network = createFeedNetwork({ lookup: async () => answer, request: () => { requested = true; throw new Error('must not run'); } });
    await assert.rejects(network.fetchSource(source), /non-public-feed-address/u);
    assert.equal(requested, false);
  }
});

test('request headers are fixed and reject injection/arbitrary overrides before DNS', async () => {
  for (const headers of [{ cookie: 'private=1' }, { authorization: 'Bearer secret' }, { host: 'elsewhere' }, { 'if-none-match': 'x\r\nHost: private' }]) {
    let lookedUp = false;
    const network = createFeedNetwork({ lookup: async () => { lookedUp = true; return publicLookup(); } });
    await assert.rejects(network.fetchSource(source, headers), /invalid-feed-headers/u);
    assert.equal(lookedUp, false);
  }
});

test('absolute timeout covers both a stalled DNS lookup and a stalled response body', async () => {
  await assert.rejects(client({ lookup: () => new Promise(() => {}), timeoutMs: 50 }).fetchSource(source), /feed-timeout/u);
  handler = (_req, res) => { res.writeHead(200); res.write('<rss>'); };
  await assert.rejects(client({ timeoutMs: 100 }).fetchSource(source), /feed-timeout/u);
});

test('caller cancellation aborts the actual in-flight response', async () => {
  const controller = new AbortController();
  handler = (_req, res) => { res.writeHead(200); res.write('<rss>'); controller.abort(); };
  await assert.rejects(client().fetchSource(source, {}, controller.signal), /feed-cancelled/u);
});

test('oversized declared and chunked bodies, compression and invalid UTF-8 are rejected', async () => {
  handler = (_req, res) => { res.writeHead(200, { 'content-length': 101 }); res.end('x'.repeat(101)); };
  await assert.rejects(client({ maxBytes: 100 }).fetchSource(source), /feed-size-limit/u);
  handler = (_req, res) => { res.writeHead(200); res.write('x'.repeat(60)); res.end('y'.repeat(60)); };
  await assert.rejects(client({ maxBytes: 100 }).fetchSource(source), /feed-size-limit/u);
  handler = (_req, res) => { res.writeHead(200, { 'content-encoding': 'gzip' }); res.end('not accepted'); };
  await assert.rejects(client().fetchSource(source), /unexpected-content-encoding/u);
  handler = (_req, res) => { res.end(Buffer.from([0xc3, 0x28])); };
  await assert.rejects(client().fetchSource(source), /invalid-feed-encoding/u);
});

test('403/429/304 return their truthful status and policy headers, with no response body', async () => {
  for (const status of [403, 429, 304]) {
    handler = (_req, res) => { res.writeHead(status, { 'retry-after': '7200', etag: '"one"' }); res.end('do not expose upstream error body'); };
    const result = await client().fetchSource(source);
    assert.equal(result.status, status);
    assert.equal(result.xml, null);
    assert.equal(result.headers['retry-after'], '7200');
  }
});
