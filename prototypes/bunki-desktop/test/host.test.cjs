'use strict';

const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { startStaticHost } = require('../lib/static-host.cjs');
const { externalPath } = require('../lib/paths.cjs');

let host;
let root;
const binary = Buffer.from(Array.from({ length: 1024 }, (_, i) => i % 256));
const output = externalPath(process.env.KAIRO_EVIDENCE_DIR || path.join(os.homedir(), '.dharma', 'bunki-desktop', 'http-tests'));

before(async () => {
  fs.mkdirSync(output, { recursive: true });
  root = fs.mkdtempSync(path.join(output, 'http-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<h1>exact staged bytes</h1>');
  fs.writeFileSync(path.join(root, 'voice.m4a'), binary);
  fs.writeFileSync(path.join(root, 'zero.bin'), '');
  fs.mkdirSync(path.join(root, 'folder'));
  fs.writeFileSync(path.join(root, 'folder', 'index.html'), '<h1>folder</h1>');
  fs.mkdirSync(path.join(root, 'empty'));
  fs.symlinkSync(path.join(root, 'voice.m4a'), path.join(root, 'linked.m4a'));
  const outside = fs.mkdtempSync(path.join(output, 'outside-'));
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'fixture outside the selected site');
  fs.symlinkSync(outside, path.join(root, 'escape'));
  host = await startStaticHost({ site: root, port: 0 });
});
after(async () => { await host?.close(); });

function request(target, { method = 'GET', headers = {}, setHost = true } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: host.port, path: target, method, headers, setHost }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('HTTP test timed out')));
    req.end();
  });
}

test('serves exact HTML and binary bytes with correct MIME/security headers', async () => {
  const html = await request('/?fixture=yes');
  assert.equal(html.status, 200);
  assert.equal(html.body.toString(), '<h1>exact staged bytes</h1>');
  assert.equal(html.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(html.headers['x-content-type-options'], 'nosniff');
  const audio = await request('/voice.m4a');
  assert.equal(audio.status, 200);
  assert.deepEqual(audio.body, binary);
  assert.equal(audio.headers['content-type'], 'audio/mp4');
  assert.equal(audio.headers['content-length'], String(binary.length));
  assert.equal((await request('/folder/')).body.toString(), '<h1>folder</h1>');
});

for (const target of ['/missing.js', '/missing.json', '/missing.m4a', '/missing-route', '/empty/', '/__live', '/linked.m4a', '/escape/secret.txt']) {
  test(`${target} is a real 404 without fallback HTML or escaped bytes`, async () => {
    const res = await request(target);
    assert.equal(res.status, 404);
    assert.equal(res.body.toString(), 'Not found');
    assert.equal(res.headers['content-type'], 'text/plain; charset=utf-8');
  });
}

for (const target of ['/../secret.txt', '/%2e%2e/secret.txt', '/folder/%2e%2e/voice.m4a', '/%00', '/%ZZ', '/%E0%A4%A', '/%5cescape/secret.txt', '//evil.example/file', 'https://evil.example/file', '/.hidden']) {
  test(`rejects invalid request target ${target}`, async () => {
    const res = await request(target);
    assert.equal(res.status, 400);
    assert.equal(res.body.toString(), 'Invalid request path');
  });
}

for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']) {
  test(`denies ${method} without reading application content`, async () => {
    const res = await request('/voice.m4a', { method });
    assert.equal(res.status, 405);
    assert.equal(res.headers.allow, 'GET, HEAD');
    assert.equal(res.body.toString(), 'Method not allowed');
  });
}

test('validates exact Host authority and rejects a missing Host', async () => {
  for (const value of ['localhost.evil.example', `localhost:${host.port + 1}`, 'attacker.example', `localhost:${host.port}@evil.example`]) {
    assert.equal((await request('/', { headers: { host: value } })).status, 421);
  }
  // Node rejects a missing mandatory HTTP/1.1 Host before dispatching a request.
  assert.equal((await request('/', { setHost: false })).status, 400);
  assert.equal((await request('/', { headers: { host: `LOCALHOST:${host.port}` } })).status, 200);
});

for (const [range, start, end] of [
  ['bytes=0-0', 0, 0], ['bytes=3-8', 3, 8], ['bytes=1020-', 1020, 1023],
  ['bytes=-4', 1020, 1023], ['bytes=-999999999999999999999999', 0, 1023],
  ['bytes=1000-999999999999999999999999', 1000, 1023], ['bytes=0-1023', 0, 1023],
]) {
  test(`streams the exact single byte range ${range}`, async () => {
    const res = await request('/voice.m4a', { headers: { range } });
    assert.equal(res.status, 206);
    assert.equal(res.headers['content-range'], `bytes ${start}-${end}/1024`);
    assert.equal(res.headers['content-length'], String(end - start + 1));
    assert.deepEqual(res.body, binary.subarray(start, end + 1));
  });
}

for (const range of ['bytes=1024-', 'bytes=99-2', 'bytes=-0', 'bytes=-', 'bytes=nope', 'bytes=999999999999999999999999-']) {
  test(`returns 416 for unsatisfiable or invalid bytes ${range}`, async () => {
    const res = await request('/voice.m4a', { headers: { range } });
    assert.equal(res.status, 416);
    assert.equal(res.headers['content-range'], 'bytes */1024');
    assert.equal(res.body.toString(), 'Range not satisfiable');
  });
}

test('zero-length, unsupported, multi-range, and If-Range behavior stays explicit', async () => {
  assert.equal((await request('/zero.bin', { headers: { range: 'bytes=0-' } })).status, 416);
  for (const headers of [{ range: 'items=0-1' }, { range: 'bytes=0-1,3-4' }, { range: 'bytes=0-1', 'if-range': '"unknown"' }]) {
    const res = await request('/voice.m4a', { headers });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, binary);
    assert.equal(res.headers['content-range'], undefined);
  }
});

test('HEAD never streams a body and ignores Range as RFC 9110 requires', async () => {
  for (const headers of [{}, { range: 'bytes=0-4' }, { range: 'bytes=99999-' }]) {
    const res = await request('/voice.m4a', { method: 'HEAD', headers });
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 0);
    assert.equal(res.headers['content-length'], '1024');
    assert.equal(res.headers['content-range'], undefined);
  }
  const missing = await request('/missing.json', { method: 'HEAD' });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.length, 0);
});

test('an occupied port rejects without reusing the other server or selecting a new origin', async () => {
  await assert.rejects(startStaticHost({ site: root, port: host.port }), { code: 'EADDRINUSE' });
  assert.equal((await request('/')).body.toString(), '<h1>exact staged bytes</h1>');
});
