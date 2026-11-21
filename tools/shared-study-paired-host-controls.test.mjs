/* global process, URL */
/** Negative controls for the paired study host (ENGINE-ONE.3): one planted fault per guarantee, each of which the
 * suite tools/shared-study-paired-host.test.mjs must turn red, in the test that names the guarantee.
 *
 * A control copies the three study pairing modules into a scratch folder (everything else they import is linked to
 * the repository's own copy), plants one fault by exact text, and runs the suite against that folder. The unplanted
 * copy runs first and must be green, so a red below is the fault's and not the harness's. A fault whose text is not
 * found exactly once fails here: a control that plants nothing proves nothing. */
import assert from 'node:assert/strict';
const { test } = await import(
  process.env.VITEST === 'true' && !process.env.NODE_TEST_CONTEXT ? 'vitest' : 'node:test'
);
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const corridor = fileURLToPath(new URL('../prototypes/corridor/', import.meta.url));
const suite = fileURLToPath(new URL('./shared-study-paired-host.test.mjs', import.meta.url));
const COPIED = [
  'shared-study-boot.mjs',
  'shared-study-pairing.mjs',
  'shared-study-paired-host.mjs',
];
const LINKED = [
  'shared-study-sync.mjs',
  'shared-study-storage.mjs',
  'shared-study-audio-preparation.mjs',
  'modules',
  'vendor',
];

/** [guarantee, file, the text to find exactly once, the fault, the test that must go red] */
const FAULTS = [
  [
    'a pairing line that names another server is refused before anything is sent',
    'shared-study-pairing.mjs',
    "if (parsed.server && configured && parsed.server !== configured) return refuse('server-mismatch');",
    '',
    'pairing goes to the server this device is set up for, or nowhere',
  ],
  [
    'a paired device does not pair over itself',
    'shared-study-pairing.mjs',
    "if (kept.device) return refuse('already-paired');",
    '',
    'pairing goes to the server this device is set up for, or nowhere',
  ],
  [
    'a refusal names its own cause (wrong or expired code)',
    'shared-study-pairing.mjs',
    'if (response.status !== 200) return refuse(',
    'if (response.status >= 500) return refuse(',
    'pair refused: a wrong code says code-invalid-or-expired and keeps nothing',
  ],
  [
    'a speak-only install is never kept as a study device',
    'shared-study-pairing.mjs',
    "if (!STUDY_INSTALLATION.test(scope.installation)) return refuse('not-a-study-device');",
    '',
    'pair refused: a code minted for a speak-only install says not-a-study-device and keeps nothing',
  ],
  [
    'the identity is what the server said for the learner that was asked for',
    'shared-study-pairing.mjs',
    "if (!validScope(scope) || scope.environment !== environment || scope.learner !== parsed.learner) return refuse('invalid-response');",
    "if (!validScope(scope)) return refuse('invalid-response');",
    'pair refused: an answer for another learner than the one asked for says invalid-response and keeps nothing',
  ],
  [
    'a credential that names another scope is not kept',
    'shared-study-pairing.mjs',
    "try { checkStudyCredential(body.token, scope); } catch { return refuse('invalid-response'); }",
    '',
    'pair refused: a token that names another scope says invalid-response and keeps nothing',
  ],
  [
    'a pairing that cannot be flagged is taken back whole',
    'shared-study-pairing.mjs',
    'try { await store.clear(); } catch { /* nothing more can be undone */ }',
    '',
    'pair refused: a flag this browser cannot keep undoes the pairing, so nothing is half kept',
  ],
  [
    'unpairing forgets the credential',
    'shared-study-pairing.mjs',
    "try { await store.clear(); } catch { return refuse('storage-unavailable'); }",
    '',
    'unpair: the credential and the flag go, sync stops, the copy of the record stays unused',
  ],
  [
    'the credential goes to its own server only',
    'shared-study-paired-host.mjs',
    "if (typeof url !== 'string' || !url.startsWith(`${alias}/`)) throw new Error('study-origin-refused');",
    '',
    'the transport carries the credential to the one server and refuses every other address',
  ],
  [
    'an answer is handed to the engine under the address it asked for, a stray one as it is',
    'shared-study-paired-host.mjs',
    'url: response.url === real ? url : response.url };',
    'url };',
    'the transport carries the credential to the one server and refuses every other address',
  ],
  [
    'paired study has a database of its own, never the preview’s',
    'shared-study-paired-host.mjs',
    'export const pairedReplicaName = (installation) => `bunki-shared-study-paired-${installation}`;',
    "export const pairedReplicaName = () => 'bunki-shared-study-preview-v1';",
    'pair: one request to the configured server, the credential kept, the host bound to the server’s identity',
  ],
  [
    'a first open fetches the record before anyone grades',
    'shared-study-paired-host.mjs',
    "if (result?.state !== 'up-to-date') {",
    'if (false) {',
    'a first open needs the record: with no connection it is refused, and the next try with one goes through',
  ],
  [
    'a missing copy of the record is not replaced by an empty one',
    'shared-study-paired-host.mjs',
    "catch (error) { throw error?.message === 'missing-store' ? hostError('study-replica-missing') : error; }",
    "catch { adapter = await open('fresh'); }",
    'a copy of the record that has gone missing is not replaced by an empty one',
  ],
  [
    'a 401 ends the pairing: the credential is dropped and the screen is told',
    'shared-study-paired-host.mjs',
    "if (next.getSyncError() === 'authentication-required') void endPairing();",
    '',
    '401 after a revocation: sync stops, the credential is dropped, the screen says so, and nothing loops',
  ],
  [
    'an ended pairing is not reported as paired',
    'shared-study-paired-host.mjs',
    'permits: { isPaired: () => !ended, reserve: reservePermits },',
    'permits: { isPaired: () => true, reserve: reservePermits },',
    '401 after a revocation: sync stops, the credential is dropped, the screen says so, and nothing loops',
  ],
  // The fault takes the whole line: a 401 on a permit request is then one more ordinary failure. Dropping only the
  // call to endPairing() from that line is not a fault the suite can see, and rightly: the refusal is still named
  // `authentication-required`, the sync session publishes it, and the host's watcher ends the pairing by that name.
  [
    'a 401 on a permit request ends the pairing too',
    'shared-study-paired-host.mjs',
    "if (response.status === 401) { await endPairing(); throw new Error('authentication-required'); }",
    '',
    '401 on a permit request ends the pairing the same way',
  ],
  [
    'permits are asked of the server with the replica’s own capability',
    'shared-study-paired-host.mjs',
    "headers: { 'Content-Type': 'application/json', ...compatibilityHeaders(), Authorization: `Bearer ${token}` },",
    "headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },",
    'a grade crosses both ways between Bunki and a second device of the same learner',
  ],
  [
    'with no flag, page start binds nothing',
    'shared-study-boot.mjs',
    'if (!env.bunkiSharedStudyHost && marked()) {',
    'if (!env.bunkiSharedStudyHost) {',
    'page start: no flag binds nothing; a flag binds the host; a flag with no pairing behind it is taken away',
  ],
  [
    'a flag with no pairing behind it is taken away',
    'shared-study-boot.mjs',
    "if (error?.code === 'study-pairing-missing') unbind(lazy);",
    '',
    'page start: no flag binds nothing; a flag binds the host; a flag with no pairing behind it is taken away',
  ],
];

function plant(file, find, fault) {
  const folder = mkdtempSync(join(tmpdir(), 'bunki-paired-host-control-'));
  for (const name of LINKED) symlinkSync(join(corridor, name), join(folder, name));
  for (const name of COPIED) {
    let text = readFileSync(join(corridor, name), 'utf8');
    if (name === file) {
      assert.equal(
        text.split(find).length - 1,
        1,
        `the fault's text must occur exactly once in ${file}: ${find}`,
      );
      text = text.replace(find, () => fault);
    }
    writeFileSync(join(folder, name), text);
  }
  return folder;
}
function run(folder) {
  const env = { ...process.env, BUNKI_PAIRED_HOST_ROOT: folder };
  for (const name of Object.keys(env))
    if (/^(VITEST|NODE_TEST_CONTEXT|NODE_OPTIONS)/.test(name)) delete env[name];
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ['--test', '--test-reporter=tap', suite],
      { env, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout) => {
        const failed = [...stdout.matchAll(/^not ok \d+ - (.*)$/gm)].map((match) => match[1]);
        const passed = [...stdout.matchAll(/^ok \d+ - (.*)$/gm)].map((match) => match[1]);
        resolve({ code: error ? (error.code ?? 1) : 0, failed, passed });
      },
    );
  });
}
async function control(file, find, fault) {
  const folder = plant(file, find, fault);
  try {
    return await run(folder);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

test(
  'every planted fault turns the test of its guarantee red, and the unplanted copy is green',
  { timeout: 300000 },
  async () => {
    const clean = await control(null, '', '');
    assert.deepEqual(clean.failed, [], 'the unplanted copy must be green');
    assert.equal(clean.code, 0);
    assert.ok(clean.passed.length >= 25);
    const outcomes = [];
    const queue = FAULTS.map((fault, index) => ({ fault, index }));
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          const [guarantee, file, find, fault, expected] = next.fault;
          const result = await control(file, find, fault);
          outcomes[next.index] = { guarantee, expected, ...result };
        }
      }),
    );
    if (process.env.BUNKI_PAIRED_HOST_CONTROLS_REPORT)
      writeFileSync(
        process.env.BUNKI_PAIRED_HOST_CONTROLS_REPORT,
        `${JSON.stringify({ clean: { code: clean.code, passed: clean.passed.length }, faults: outcomes }, null, 2)}\n`,
      );
    for (const { guarantee, expected, code, failed, passed } of outcomes) {
      assert.ok(clean.passed.includes(expected), `no such test in the suite: ${expected}`);
      assert.notEqual(code, 0, `the fault survived: ${guarantee}`);
      assert.ok(
        failed.includes(expected),
        `the fault was not caught by its own test: ${guarantee} (red: ${failed.join(' | ') || 'none'}; green: ${passed.length})`,
      );
    }
  },
);
