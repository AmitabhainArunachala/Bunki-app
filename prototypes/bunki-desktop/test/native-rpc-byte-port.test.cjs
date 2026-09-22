'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawn } = require('node:child_process');
const { Buffer } = require('node:buffer');
const { setTimeout } = require('node:timers');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const { createNativeRpcPipePort, NativeRpcPipeError } = require('../lib/native-rpc-byte-port.cjs');

// Test-only process control uses the separate Node IPC descriptor. Production
// transport consumes only stdin/stdout and cannot infer authorization from it.
const script = `
process.on('message', mode => {
  if (mode === 'echo') process.stdin.pipe(process.stdout);
  if (mode === 'end-output') process.stdout.end();
  if (mode === 'exit') process.exit(0);
  if (mode === 'output') process.stdout.write(Buffer.alloc(150000, 23));
  process.send('mode-ready');
});
process.send('ready');
`;
function frame(text) {
  const body = Buffer.from(text);
  const bytes = Buffer.alloc(body.length + 4);
  bytes.writeUInt32BE(body.length); body.copy(bytes, 4);
  return bytes;
}
async function until(check) {
  for (let n = 0; n < 500; n += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('fixture condition did not arrive');
}
async function fixture(t, { mode = 'echo', limits, captureThrows = false } = {}) {
  const child = spawn(process.execPath, ['-e', script], { stdio: ['pipe', 'pipe', 'ignore', 'ipc'] });
  const exited = once(child, 'close');
  await once(child, 'message');
  const ready = once(child, 'message'); child.send(mode); await ready;
  const state = { current: true, closeCodes: [], closed: 0, data: [], child, port: null };
  t.after(async () => {
    state.port?.close(); child.kill('SIGKILL');
    await exited;
  });
  const options = { child, connectionId: randomUUID(), limits,
    assertCurrent: () => { if (captureThrows) throw new Error('private authority detail'); return state.current; },
    onClosed: (code) => { state.current = false; state.closeCodes.push(code); child.kill('SIGTERM'); } };
  state.options = options;
  state.port = createNativeRpcPipePort(options);
  state.receiver = { data: (bytes) => state.data.push(Buffer.from(bytes)), close: () => {
    assert.equal(state.current, false, 'embedding owner revoked before subscriber close');
    state.closed += 1;
  } };
  return state;
}
const errorCode = (code) => (error) => error instanceof NativeRpcPipeError && error.code === code && error.message === 'Native RPC pipe: ' + code;

test('real OS pipes preserve two ordered frames and copy caller bytes before write', async (t) => {
  const s = await fixture(t); s.port.subscribe(s.receiver);
  const first = frame('first: 猫 é 😀'); const expectedFirst = Buffer.from(first);
  const second = frame('second');
  const offered = s.port.send(first); first.fill(0);
  await Promise.all([offered, s.port.send(second)]);
  await until(() => Buffer.concat(s.data).length === expectedFirst.length + second.length);
  assert.deepEqual(Buffer.concat(s.data), Buffer.concat([expectedFirst, second]));
  assert.equal(s.closed, 0);
});

test('real OS output is held until subscription and each delivered chunk is bounded', async (t) => {
  const s = await fixture(t, { mode: 'hold', limits: { maxChunkBytes: 17 } });
  s.child.send('output');
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(s.data.length, 0);
  s.port.subscribe(s.receiver);
  await until(() => s.data.reduce((n, bytes) => n + bytes.length, 0) === 150000);
  assert(s.data.every((bytes) => bytes.length <= 17));
  assert.deepEqual(Buffer.concat(s.data), Buffer.alloc(150000, 23));
});

test('queue bounds include a blocked native write; overflow is refused without dropping admitted bytes', async (t) => {
  const s = await fixture(t, { mode: 'hold' }); s.port.subscribe(s.receiver);
  const large = frame('x'.repeat(2 * 1024 * 1024));
  const a = s.port.send(large), b = s.port.send(frame('control'));
  const pending = Promise.allSettled([a, b]);
  await assert.rejects(s.port.send(frame('excess')), errorCode('limits-exceeded'));
  s.child.send('echo');
  assert.deepEqual((await pending).map((r) => r.status), ['fulfilled', 'fulfilled']);
  await until(() => Buffer.concat(s.data).length === large.length + frame('control').length);
  assert.deepEqual(Buffer.concat(s.data), Buffer.concat([large, frame('control')]));
});

test('closing a blocked real write rejects active and queued sends once and revokes first', async (t) => {
  const s = await fixture(t, { mode: 'hold' }); s.port.subscribe(s.receiver);
  const a = s.port.send(frame('x'.repeat(2 * 1024 * 1024)));
  const b = s.port.send(frame('queued'));
  const result = Promise.allSettled([a, b]);
  s.port.close(); s.port.close();
  for (const row of await result) { assert.equal(row.status, 'rejected'); assert(errorCode('closed')(row.reason)); }
  assert.equal(s.closed, 1); assert.deepEqual(s.closeCodes, ['closed']);
  await assert.rejects(s.port.send(frame('late')), errorCode('closed'));
  s.child.stdout.emit('data', frame('late output'));
  assert.equal(s.data.length, 0);
});

test('native process exit with blocked pipe rejects pending work and discards private errors', async (t) => {
  const s = await fixture(t, { mode: 'hold' }); s.port.subscribe(s.receiver);
  const pending = s.port.send(frame('x'.repeat(2 * 1024 * 1024)));
  const result = Promise.allSettled([pending]); s.child.kill('SIGKILL');
  const [row] = await result;
  assert.equal(row.status, 'rejected');
  assert(['closed', 'io-failure'].some((code) => errorCode(code)(row.reason)));
  assert.equal(s.closed, 1); assert.equal(s.closeCodes.length, 1);
});

test('real stdout EOF closes the owner even while the child process still exists', async (t) => {
  const s = await fixture(t, { mode: 'hold' }); s.port.subscribe(s.receiver);
  s.child.send('end-output'); await until(() => s.closed === 1);
  assert.equal(s.current, false); assert.equal(s.closeCodes.length, 1);
  await assert.rejects(s.port.send(frame('later')), errorCode('closed'));
});

test('owner loss before send closes without writing any frame', async (t) => {
  const s = await fixture(t); s.port.subscribe(s.receiver); s.current = false;
  await assert.rejects(s.port.send(frame('private text')), errorCode('stale-owner'));
  assert.equal(s.closed, 1); assert.equal(s.data.length, 0);
});

test('owner loss during chunk delivery suppresses every subsequent byte', async (t) => {
  const s = await fixture(t, { limits: { maxChunkBytes: 8 } });
  s.port.subscribe({ ...s.receiver, data: (bytes) => { s.data.push(Buffer.from(bytes)); s.current = false; } });
  // Deterministic coalesced platform read; real OS chunk sizes are not promised.
  s.child.stdout.emit('data', Buffer.alloc(25, 7));
  assert.deepEqual(s.data, [Buffer.alloc(8, 7)]);
  assert.equal(s.closed, 1); assert.deepEqual(s.closeCodes, ['stale-owner']);
});

test('owner freshness is rechecked when the pending write callback completes', async (t) => {
  const s = await fixture(t); s.port.subscribe(s.receiver);
  let finish;
  s.child.stdin.write = (_bytes, callback) => { finish = callback; return false; };
  const result = Promise.allSettled([s.port.send(frame('held'))]);
  s.current = false; finish();
  const [row] = await result; assert.equal(row.status, 'rejected'); assert(errorCode('stale-owner')(row.reason));
  assert.equal(s.closed, 1);
});

test('a partial-write error poisons the connection and rejects queued work without retry', async (t) => {
  const s = await fixture(t); s.port.subscribe(s.receiver); let finish, calls = 0;
  s.child.stdin.write = (_bytes, callback) => { calls += 1; finish = callback; return false; };
  const result = Promise.allSettled([s.port.send(frame('first')), s.port.send(frame('second'))]);
  finish(new Error('secret native path and user payload'));
  for (const row of await result) { assert.equal(row.status, 'rejected'); assert(errorCode('io-failure')(row.reason)); }
  assert.equal(calls, 1); assert.equal(s.closed, 1);
});

test('authority and subscriber exceptions close with fixed local codes', async (t) => {
  const revoked = await fixture(t, { captureThrows: true }); revoked.port.subscribe(revoked.receiver);
  assert.equal(revoked.closed, 1); assert.deepEqual(revoked.closeCodes, ['stale-owner']);
  const broken = await fixture(t); broken.port.subscribe({ ...broken.receiver, data: () => { throw new Error('private text'); } });
  broken.child.stdout.emit('data', Buffer.from('x'));
  assert.deepEqual(broken.closeCodes, ['io-failure']); assert.equal(broken.closed, 1);
});

test('unsubscription is terminal and cannot be replaced by another receiver', async (t) => {
  const s = await fixture(t); const unsubscribe = s.port.subscribe(s.receiver); unsubscribe(); unsubscribe();
  assert.equal(s.closed, 1); assert.throws(() => s.port.subscribe(s.receiver), errorCode('invalid-port'));
  await assert.rejects(s.port.send(frame('later')), errorCode('closed'));
});

test('malformed frames, oversized frames, and shared mutable backing are refused', async (t) => {
  const s = await fixture(t, { limits: { maxFrameBytes: 16 } }); s.port.subscribe(s.receiver);
  for (const value of [null, 'text', Buffer.alloc(4), frame('x'.repeat(17)), new Uint8Array(new SharedArrayBuffer(8))]) {
    await assert.rejects(s.port.send(value), errorCode('limits-exceeded'));
  }
  await assert.rejects(s.port.send(Buffer.from([0, 0, 0, 3, 1])), errorCode('invalid-frame'));
  await s.port.send(frame('valid'));
  await until(() => s.data.length > 0); assert.deepEqual(Buffer.concat(s.data), frame('valid'));
});

test('invalid identity and widened budgets are rejected before accepting process ownership', async (t) => {
  const s = await fixture(t);
  for (const change of [{ child: {} }, { connectionId: 'wire-reply-id' }, { assertCurrent: null }, { onClosed: null },
    { limits: { maxFrameBytes: 2097153 } }, { limits: { maxChunkBytes: 65537 } }, { limits: { maxQueuedFrames: 3 } },
    { limits: { maxChunkBytes: 0 } }, { limits: { other: 1 } }]) {
    assert.throws(() => createNativeRpcPipePort({ ...s.options, ...change }), errorCode('invalid-port'));
  }
  assert.equal(s.closeCodes.length, 0);
});

test('bad inbound type or an excessive platform chunk closes without subscriber delivery', async (t) => {
  for (const value of ['decoded text', Buffer.alloc(2 * 1024 * 1024 + 5)]) {
    const s = await fixture(t); s.port.subscribe(s.receiver); s.child.stdout.emit('data', value);
    assert.equal(s.data.length, 0); assert.equal(s.closed, 1); assert.deepEqual(s.closeCodes, ['io-failure']);
  }
});

test('early close before subscribing is observed once, and send requires the sole subscriber', async (t) => {
  const s = await fixture(t);
  await assert.rejects(s.port.send(frame('early')), errorCode('invalid-port'));
  s.port.close(); s.port.subscribe(s.receiver);
  assert.equal(s.closed, 1); assert.equal(s.closeCodes.length, 1);
});

test('shadowed byte array properties cannot change checked bytes, allocate padding, or execute getters', async (t) => {
  const s = await fixture(t, { limits: { maxFrameBytes: 8 } }); s.port.subscribe(s.receiver);
  const exact = frame('x');
  let reads = 0;
  for (const key of ['byteLength', 'byteOffset', 'buffer', 'length', 'subarray', Symbol.iterator]) {
    Object.defineProperty(exact, key, { get() { reads += 1; throw new Error('private shadow getter'); } });
  }
  await s.port.send(exact);
  await until(() => s.data.length > 0);
  assert.deepEqual(Buffer.concat(s.data), frame('x')); assert.equal(reads, 0);
  const malformed = new Uint8Array([0, 0, 0, 1, 65, 66, 67, 68, 69, 70]);
  Object.defineProperty(malformed, 'byteLength', { value: 5 });
  await assert.rejects(s.port.send(malformed), errorCode('invalid-frame'));
  const oversized = frame('x'.repeat(9));
  Object.defineProperty(oversized, 'byteLength', { value: 5 });
  await assert.rejects(s.port.send(oversized), errorCode('limits-exceeded'));
  const padded = frame('y'); Object.defineProperty(padded, 'length', { value: 1000000 });
  await s.port.send(padded);
  await until(() => Buffer.concat(s.data).length === 10);
  assert.deepEqual(Buffer.concat(s.data), Buffer.concat([frame('x'), frame('y')]));
});

test('inbound shadowed slices and lengths never enter subscriber delivery', async (t) => {
  const s = await fixture(t, { limits: { maxChunkBytes: 3 } }); s.port.subscribe(s.receiver);
  const bytes = Buffer.from('abcdefg'); let getters = 0;
  for (const key of ['byteLength', 'byteOffset', 'buffer', 'subarray']) {
    Object.defineProperty(bytes, key, { get() { getters += 1; throw new Error('private read getter'); } });
  }
  s.child.stdout.emit('data', bytes);
  assert.equal(getters, 0); assert.deepEqual(s.data, [Buffer.from('abc'), Buffer.from('def'), Buffer.from('g')]);
});

test('subscriber accessors are refused without execution and accepted callback methods are snapshotted', async (t) => {
  const s = await fixture(t); let reads = 0;
  assert.throws(() => s.port.subscribe({ get data() { reads += 1; throw new Error('private callback'); }, close() {} }), errorCode('invalid-port'));
  assert.equal(reads, 0);
  s.port.subscribe(s.receiver);
  s.receiver.data = () => { throw new Error('replaced callback'); };
  await s.port.send(frame('kept'));
  await until(() => s.data.length > 0); assert.deepEqual(Buffer.concat(s.data), frame('kept'));
  assert.equal(s.closed, 0);
});

test('authority callback closing the port cannot enqueue an unresolved write after terminal close', async (t) => {
  // This fixture needs an authority closure that can change after boot.
  const child = spawn(process.execPath, ['-e', script], { stdio: ['pipe', 'pipe', 'ignore', 'ipc'] });
  const exited = once(child, 'close'); await once(child, 'message');
  let terminal = false, arm = false, closed = 0, port;
  t.after(async () => { port?.close(); child.kill('SIGKILL'); await exited; });
  port = createNativeRpcPipePort({ child, connectionId: randomUUID(), assertCurrent: () => {
    if (arm) port.close(); return true;
  }, onClosed: () => { terminal = true; child.kill('SIGTERM'); } });
  port.subscribe({ data() {}, close() { assert(terminal); closed += 1; } });
  arm = true;
  await assert.rejects(port.send(frame('must settle')), errorCode('closed'));
  assert.equal(closed, 1);
});
