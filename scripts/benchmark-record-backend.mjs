/** CPU diagnostic, not an interaction or phone-performance release receipt.
 * node scripts/benchmark-record-backend.mjs [--baseline /path/record-core.mjs]
 */
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const args = process.argv.slice(2);
assert(args.length === 0 || (args.length === 2 && args[0] === '--baseline'));
const built = await build({
  entryPoints: ['scripts/corridor-record-entry.ts'],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  metafile: true,
});
const bytes = built.outputFiles[0].contents;
const current = await import(
  `data:text/javascript;base64,${Buffer.from(bytes).toString('base64')}`
);
const baseline = args[1] ? await import(pathToFileURL(args[1]).href) : null;
const digest = (value) => createHash('sha256').update(value).digest('hex');
const sample = (run) => {
  run();
  const times = [];
  for (let i = 0; i < 9; i++) {
    const start = performance.now();
    run();
    times.push(performance.now() - start);
  }
  const sorted = [...times].sort((a, b) => a - b);
  return { medianMs: sorted[4], minMs: sorted[0], maxMs: sorted[8], samplesMs: times };
};
const rows = [];
for (const count of [100, 1000, 10000, 50000]) {
  const raw = {
    v: 1,
    taken: [],
    srs: {},
    revlog: Array.from({ length: count }, (_, i) => [
      1791850000000 + i * 1000,
      'word:語彙' + (i % 2000),
      3,
    ]),
    obslog: Array.from({ length: count }, (_, i) => [
      1791850000000 + i * 1000,
      'tap',
      'word:語彙' + (i % 2000),
    ]),
    lists: {},
    readerPos: { article: 0 },
  };
  const checked = current.encodeLocalJson(raw);
  assert.equal(checked.sha256, digest(checked.text));
  if (baseline) assert.deepEqual(current.encodeLocalJson(raw), baseline.encodeLocalJson(raw));
  // Untrusted raw values always get checked again. Only the admitted immutable
  // value or a wrapper containing it can use structural sharing.
  rows.push({
    reviewRows: count,
    observationRows: count,
    encodedBytes: Buffer.byteLength(checked.text),
    coldEncode: sample(() => current.encodeLocalJson(raw)),
    checkedEncode: sample(() => current.encodeLocalJson(checked.value)),
    checkedCopy: sample(() => current.copyLocalJson({ record: checked.value })),
    ...(baseline
      ? {
          baselineEncode: sample(() => baseline.encodeLocalJson(raw)),
          baselineCopy: sample(() => baseline.encodeLocalJson({ record: checked.value }).value),
        }
      : {}),
  });
}
console.log(
  JSON.stringify(
    {
      kind: 'synthetic-node-cpu-diagnostic',
      node: process.version,
      cpu: cpus()[0].model,
      moduleSha256: digest(bytes),
      baselineSha256: args[1] ? digest(readFileSync(args[1])) : null,
      inputs: Object.keys(built.metafile.inputs)
        .filter((path) => !path.includes('node_modules/'))
        .sort()
        .map((path) => ({ path, sha256: digest(readFileSync(path)) })),
      limitations: [
        'Synthetic JSON, not a real learner record.',
        'Nine samples after one warmup per case; medians/ranges, not reliable tail percentiles.',
        'CPU only: excludes browser rendering, IndexedDB, worker messaging and physical-phone latency.',
        'Checked cases require this module’s own immutable values; do not apply their timing to arbitrary input.',
      ],
      rows,
    },
    null,
    2,
  ),
);
