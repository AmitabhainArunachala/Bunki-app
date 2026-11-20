/** Full node:test execution with actual framework completion, never exit-code-only evidence. */
import assert from 'node:assert/strict';
import { run } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { digest, requireNodeSuite } from './verification-admission.mjs';

const args = process.argv.slice(2);
const operand = (value) => typeof value === 'string' && value.length > 0 && !value.startsWith('-');
assert(
  args[0] === '--out' && operand(args[1]) && args[2] === '--',
  'Usage: run-node-suite --out report.json -- full-file-list',
);
const requested = args.slice(3);
assert(
  requested.length && requested.every(operand) && new Set(requested).size === requested.length,
  'Nonempty unique test file roster required',
);
const out = resolve(args[1]),
  files = requested.map((file) => resolve(file));
assert(new Set(files).size === files.length, 'Nonempty unique test file roster required');
const receipt = {
  schemaVersion: 1,
  kind: 'bunki-node-test-suite',
  runId: process.env.KAIRO_GATE_RUN_ID || randomUUID(),
  requestedFiles: files,
  files: [],
  scheduled: [],
  tests: [],
  summary: null,
  fullAcceptance: false,
  startedAt: new Date().toISOString(),
};
try {
  for await (const event of run({ files, concurrency: 1 })) {
    const data = event.data;
    if (event.type === 'test:stdout' || event.type === 'test:stderr')
      process.stdout.write(data.message);
    if (event.type === 'test:enqueue' && data.file && !files.includes(data.name))
      receipt.scheduled.push({
        file: data.file,
        name: data.name,
        nesting: data.nesting,
        line: data.line,
      });
    if (event.type === 'test:pass' || event.type === 'test:fail')
      receipt.tests.push({
        file: data.file,
        name: data.name,
        nesting: data.nesting,
        number: data.testNumber,
        line: data.line,
        status: event.type === 'test:pass' ? 'passed' : 'failed',
        skip: !!data.skip,
        todo: !!data.todo,
        error: data.details?.error ? String(data.details.error.stack || data.details.error) : null,
      });
    if (event.type === 'test:summary') {
      if (data.file)
        receipt.files.push({
          file: resolve(data.file),
          sha256: digest(readFileSync(data.file)),
          summary: data,
        });
      else receipt.summary = data;
    }
  }
  receipt.fullAcceptance = true;
  requireNodeSuite(receipt, files, process.cwd());
} catch (error) {
  receipt.fullAcceptance = false;
  receipt.error = String(error.stack || error);
} finally {
  receipt.completedAt = new Date().toISOString();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`);
}
console.log(
  `Node suite ${receipt.fullAcceptance ? 'PASS' : 'FAIL'}: ${receipt.tests.length} named completions; ${out}`,
);
process.exitCode = receipt.fullAcceptance ? 0 : 1;
