'use strict';
// Framing-only fixture. The owning Electron test supplies synthetic replies;
// this executable has no account, CloudKit, pairing or production capability.
const { Buffer } = require('node:buffer');
let bytes = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  bytes = Buffer.concat([bytes, chunk]);
  if (bytes.length > 2 * 1024 * 1024 + 4) process.exit(2);
  while (bytes.length >= 4 && bytes.length >= bytes.readUInt32BE(0) + 4) {
    const size = bytes.readUInt32BE(0);
    const request = JSON.parse(bytes.subarray(4, size + 4));
    bytes = bytes.subarray(size + 4);
    process.send({ kind: 'request', request });
  }
});
process.on('message', (message) => {
  if (message.kind !== 'reply') return;
  const body = Buffer.from(JSON.stringify(message.value));
  const frame = Buffer.alloc(body.length + 4);
  frame.writeUInt32BE(body.length); body.copy(frame, 4); process.stdout.write(frame);
});
process.stdin.on('end', () => process.exit(0));
process.on('disconnect', () => process.exit(0));
process.stdout.on('error', () => process.exit(0));
process.send({ kind: 'ready' });
