import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';

import { canonicalJson } from '../../domain/src/replay/canonical-json.ts';
import { operationReference, parseSyncOperation } from '../../sync/src/operations.ts';

// Cross-language contract: Swift transports the exact domain canonical bytes.
// Compact persistence JSON has a different hash and must not be substituted.
const rows = JSON.parse(
  readFileSync(
    new URL('../Tests/KairoAppleSyncTests/Fixtures/operations.json', import.meta.url),
    'utf8',
  ),
);
assert.deepEqual(
  rows.map((row) => row.name),
  [
    'first',
    'second',
    'conflict',
    'foreign',
    'unicode-composed',
    'unicode-account',
    'unicode-learner',
  ],
);
for (const row of rows) {
  const bytes = Buffer.from(row.envelopeBase64, 'base64');
  assert.equal(bytes.toString('base64'), row.envelopeBase64);
  const operation = parseSyncOperation(JSON.parse(bytes.toString('utf8')));
  assert(bytes.toString('utf8') === canonicalJson(operation), 'canonical-bytes-mismatch');
  assert.deepEqual(operationReference(operation), { opId: row.opId, sha256: row.sha256 });
  assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256);
}
assert.equal(rows[0].opId, rows[2].opId);
assert.notEqual(rows[0].sha256, rows[2].sha256);
const unicode = rows
  .slice(4)
  .map((row) =>
    parseSyncOperation(JSON.parse(Buffer.from(row.envelopeBase64, 'base64').toString('utf8'))),
  );
for (const [index, key] of [
  [1, 'accountId'],
  [2, 'learnerId'],
]) {
  assert.notEqual(unicode[0].scope[key], unicode[index].scope[key]);
  // Test-only equivalence check. Production identity never normalizes IDs.
  assert.equal(unicode[0].scope[key].normalize('NFC'), unicode[index].scope[key].normalize('NFC'));
  assert.notEqual(unicode[0].opId, unicode[index].opId);
}
process.stdout.write('7 canonical TypeScript-to-Swift journal fixtures verified.\n');
