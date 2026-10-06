'use strict';
// Synthetic fixture helper only. Authorization is supplied by the host fixture,
// never by stdout. Production has no equivalent default grant or fake profile.
const { Buffer } = require('node:buffer');
const { setInterval } = require('node:timers');
const mode = process.argv[2] || 'plain';
let bytes = Buffer.alloc(0);
let request = null;
function write(body) {
  const json = Buffer.from(JSON.stringify(body));
  const frame = Buffer.alloc(json.length + 4); frame.writeUInt32BE(json.length); json.copy(frame, 4);
  process.stdout.write(frame);
}
process.stdin.on('data', (chunk) => {
  bytes = Buffer.concat([bytes, chunk]);
  if (bytes.length > 2 * 1024 * 1024 + 4) process.exit(2);
  while (bytes.length >= 4 && bytes.length >= bytes.readUInt32BE(0) + 4) {
    const size = bytes.readUInt32BE(0); request = JSON.parse(bytes.subarray(4, size + 4)); bytes = bytes.subarray(size + 4);
    process.send?.({ kind: 'request', request });
  }
});
process.stdout.on('error', () => {});
process.on('message', (message) => {
  if (message === 'eof') process.stdout.end();
  else if (message === 'exit') process.exit(0);
  else if (message === 'reply') write({ format: 'kairo-journal-rpc', v: 1, type: 'reply', id: request.id,
    method: request.method, leaseId: request.params.leaseId, ok: true,
    result: { previous: request.params.checkpoint, nextCheckpoint: 'synthetic-cursor', envelopes: [], hasMore: false } });
  else if (message === 'invalidate') write({ format: 'kairo-journal-rpc', v: 1, type: 'event',
    event: 'session-invalidated', leaseId: request.params.leaseId, code: 'native-session-lost' });
});
if (mode === 'ignore-term') {
  process.on('SIGTERM', () => {});
  setInterval(() => {}, 1000);
} else {
  process.stdin.on('end', () => process.exit(0));
  process.on('disconnect', () => process.exit(0));
}
process.send?.({ kind: 'ready' });
