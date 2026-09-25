#!/usr/bin/env node
/** Publish the one exact reviewed written section; never assemble or promote a native mock. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  PUBLIC_BANK,
  REPOSITORY,
  hash,
  publishReviewedWrittenPractice,
} from './assessment/bank.mjs';

const args = new Map();
for (let index = 2; index < process.argv.length; index++) {
  const key = process.argv[index];
  if (key === '--publish') args.set(key, true);
  else if (['--form', '--config', '--runs', '--evidence', '--public-directory'].includes(key)) {
    const value = process.argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing ${key}`);
    args.set(key, value);
  } else throw new Error(`Unknown argument: ${key}`);
}
for (const key of ['--form', '--config', '--runs', '--evidence'])
  if (!args.get(key)) throw new Error(`Required: ${key}`);

const evidenceRoot = resolve(args.get('--evidence'));
const privateRoot = await realpath(join(homedir(), '.dharma'));
const assertPrivate = (path) => {
  const difference = relative(privateRoot, path);
  if (isAbsolute(difference) || difference === '..' || difference.startsWith(`..${sep}`))
    throw new Error('Admission evidence must remain under ~/.dharma');
};
assertPrivate(evidenceRoot);
let ancestor = evidenceRoot;
while (true) {
  try {
    assertPrivate(await realpath(ancestor));
    break;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    ancestor = dirname(ancestor);
  }
}
await mkdir(evidenceRoot, { recursive: true });
assertPrivate(await realpath(evidenceRoot));
const evidence = await mkdtemp(join(evidenceRoot, 'written-admission-'));
const formPath = await realpath(resolve(args.get('--form')));
const configPath = await realpath(resolve(args.get('--config')));
const runsPath = await realpath(resolve(args.get('--runs')));
const publicDirectory = resolve(args.get('--public-directory') ?? PUBLIC_BANK);
const collector = join(REPOSITORY, 'scripts/review-assessment-bank.mjs');
const collectorBytes = await readFile(collector);
const configBytes = await readFile(configPath);
const runtimeIndex = async () =>
  Promise.all(
    (await readdir(runsPath))
      .filter((name) => name.endsWith('.runtime.json'))
      .sort()
      .map(async (name) => ({ name, sha256: hash(await readFile(join(runsPath, name))) })),
  );
const runtimeHashes = await runtimeIndex();
const collected = join(evidence, 'current-host-review');
const run = promisify(execFile);
const formBytes = await readFile(formPath);
const result = await publishReviewedWrittenPractice({
  formBytes,
  publicDirectory,
  publish: args.get('--publish') === true,
  reviewForm: async () => {
    // This command only validates saved requests/responses/runtime identity. No provider calls.
    await run(process.execPath, [
      collector,
      'collect',
      '--form',
      formPath,
      '--config',
      configPath,
      '--runs',
      runsPath,
      '--out',
      collected,
    ]);
    if (!(await readFile(formPath)).equals(formBytes))
      throw new Error('Form changed during host verification');
    if (
      !(await readFile(configPath)).equals(configBytes) ||
      !(await readFile(collector)).equals(collectorBytes) ||
      JSON.stringify(await runtimeIndex()) !== JSON.stringify(runtimeHashes)
    )
      throw new Error('Host verification inputs changed during admission');
    return JSON.parse(await readFile(join(collected, 'review.json'), 'utf8'));
  },
});
const receipt = {
  schema: 'kairo-reviewed-written-publication/1',
  at: new Date().toISOString(),
  published: result.published,
  entry: result.entry,
  originalFormBytesSha256: result.formBytesSha256,
  sourceFormPath: formPath,
  currentHostReview: collected,
  collectorSha256: hash(collectorBytes),
  policySha256: hash(configBytes),
  publisherSha256: hash(await readFile(new URL(import.meta.url))),
  bankToolSha256: hash(await readFile(new URL('./assessment/bank.mjs', import.meta.url))),
  runtimeHashes,
  modelRequestsIssued: 0,
  publicDirectory,
  scope:
    'Exact 12-question media-free N2 written practice only; existing native mocks remain unchanged.',
};
await writeFile(join(evidence, 'publication.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ published: result.published, entry: result.entry, evidence }));
