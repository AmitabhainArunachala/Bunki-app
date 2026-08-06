/**
 * Emit the corridor's FSRS-6 parameters by READING packages/domain's pin file,
 * so the schedule preview can never drift from the domain kernel's scheduler.
 * The verifier re-runs this and fails if the emitted JSON differs from the
 * committed one.
 *
 * Usage: node build_fsrs_pin.mjs [--check]
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(HERE, '..');
const REPO = resolve(CORRIDOR, '..', '..');
const PIN_TS = resolve(REPO, 'packages/domain/src/reducers/fsrs-pin.ts');

const src = readFileSync(PIN_TS, 'utf8');

const scalar = (name) => {
  const m = src.match(new RegExp(`export const ${name}[^=]*=\\s*([^;]+);`));
  if (!m) throw new Error(`fsrs-pin.ts: ${name} not found`);
  return m[1].trim();
};
const num = (name) => Number(scalar(name).replace(/[^0-9.eE+-]/g, ''));
const str = (name) => scalar(name).replace(/^['"]|['"]$/g, '');
const bool = (name) => scalar(name) === 'true';
const list = (name) => {
  const m = src.match(new RegExp(`export const ${name}[^=]*=\\s*Object\\.freeze\\(\\[([^\\]]+)\\]`));
  if (!m) throw new Error(`fsrs-pin.ts: ${name} not found`);
  return m[1]
    .split(',')
    .map((v) => v.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
};

const pin = {
  source: 'packages/domain/src/reducers/fsrs-pin.ts',
  algorithm: str('FSRS_ALGORITHM'),
  package: str('FSRS_PACKAGE'),
  pinnedVersion: str('FSRS_PINNED_VERSION'),
  parameterSetId: str('FSRS_PARAMETER_SET_ID'),
  requestRetention: num('FSRS_DESIRED_RETENTION'),
  w: list('FSRS_WEIGHTS').map(Number),
  maximumInterval: num('FSRS_MAXIMUM_INTERVAL_DAYS'),
  enableFuzz: bool('FSRS_ENABLE_FUZZ'),
  enableShortTerm: bool('FSRS_ENABLE_SHORT_TERM'),
  learningSteps: list('FSRS_LEARNING_STEPS'),
  relearningSteps: list('FSRS_RELEARNING_STEPS'),
  statePrecision: num('FSRS_STATE_PRECISION'),
  reviewTimePolicyId: str('FSRS_REVIEW_TIME_POLICY_ID'),
};

if (pin.w.length !== 21) throw new Error(`expected 21 FSRS-6 weights, got ${pin.w.length}`);

const outPath = resolve(CORRIDOR, 'data/fsrs-pin.json');
const rendered = `${JSON.stringify(pin, null, 2)}\n`;

if (process.argv.includes('--check')) {
  const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';
  if (current !== rendered) {
    console.error('FSRS pin drift: prototypes/corridor/data/fsrs-pin.json != packages/domain pin');
    process.exit(1);
  }
  console.log('fsrs pin: in sync with packages/domain');
} else {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, rendered);
  mkdirSync(resolve(CORRIDOR, 'vendor'), { recursive: true });
  const vendored = resolve(REPO, 'node_modules/ts-fsrs/dist/index.mjs');
  copyFileSync(vendored, resolve(CORRIDOR, 'vendor/ts-fsrs.mjs'));
  console.log(`wrote ${outPath} + vendor/ts-fsrs.mjs (ts-fsrs ${pin.pinnedVersion})`);
}
