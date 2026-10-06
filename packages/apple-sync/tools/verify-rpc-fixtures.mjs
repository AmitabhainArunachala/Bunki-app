import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { URL, pathToFileURL } from 'node:url';

/** Dependency injection here is test tooling only, never native authority. It
 * lets an external package overlay use the actual unchanged repository core. */
export function verifyRpcFixtures(core) {
  const rows = JSON.parse(
    readFileSync(
      new URL('../Tests/KairoAppleSyncTests/Fixtures/rpc.json', import.meta.url),
      'utf8',
    ),
  );
  assert.equal(rows.format, 'kairo-journal-rpc-fixtures');
  assert.equal(rows.v, 1);
  assert.deepEqual(
    rows.positives.map((row) => row.name),
    [
      'first',
      'second',
      'conflict',
      'foreign',
      'unicode-composed',
      'unicode-account',
      'unicode-learner',
      'local-logical-scope',
      'escaped',
      'large',
    ],
  );
  assert.deepEqual(
    rows.negatives.map((row) => row.name),
    [
      'accountId-high',
      'accountId-low',
      'learnerId-high',
      'learnerId-low',
      'noteId-high',
      'noteId-low',
      'text-high',
      'text-low',
    ],
  );
  for (const row of [...rows.positives, ...rows.negatives]) {
    const bytes = Buffer.from(row.envelopeBase64, 'base64');
    assert.equal(bytes.toString('base64'), row.envelopeBase64);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256);
    const raw = JSON.parse(bytes.toString('utf8'));
    assert.equal(core.canonicalJson(raw), bytes.toString('utf8'));
    if (rows.positives.includes(row)) {
      const parsed = core.parseSyncOperation(raw);
      assert.deepEqual(core.operationReference(parsed), { opId: row.opId, sha256: row.sha256 });
    } else {
      assert.throws(
        () => core.parseSyncOperation(raw),
        (error) => error.code === 'invalid-input' && error.paths.includes('non-json-text'),
      );
    }
  }
  return {
    positive: rows.positives.length,
    negative: rows.negatives.length,
    exactCanonicalBytes: true,
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const canonical = await import(
    new URL('../../domain/src/replay/canonical-json.ts', import.meta.url)
  );
  const operations = await import(new URL('../../sync/src/operations.ts', import.meta.url));
  process.stdout.write(JSON.stringify(verifyRpcFixtures({ ...canonical, ...operations })) + '\n');
}
