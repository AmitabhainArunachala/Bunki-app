/* global process, URL */
/** Negative controls for the voice link (LEAN, 2026-11-22): one planted fault per guarantee, each of which the suite
 * tools/voice-connect.test.mjs must turn red, in the test that names the guarantee.
 *
 * A control copies the files the link runs through into a scratch folder laid out as the corridor folder is (the
 * speech team's carried modules are linked), plants one fault by exact text, and runs the suite against that folder.
 * The unplanted copy runs first and must be green, so a red below is the fault's and not the harness's. A fault whose
 * text is not found exactly once fails here: a control that plants nothing proves nothing. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { test } = await import(
  process.env.VITEST === 'true' && !process.env.NODE_TEST_CONTEXT ? 'vitest' : 'node:test'
);
const corridor = fileURLToPath(new URL('../prototypes/corridor/', import.meta.url));
const suite = fileURLToPath(new URL('./voice-connect.test.mjs', import.meta.url));
const BOOT = 'shared-study-boot.mjs';
const CLIENT = 'modules/voice-client.mjs';
const CONNECT = 'modules/voice-connect.mjs';
const COPIED = [BOOT, 'shared-study-pairing.mjs', CLIENT, CONNECT, 'modules/voice-lines.mjs'];
const T = {
  parse: "a voice link is read under the pairing line's rules, and anything else is refused",
  address:
    'page start: a voice link leaves the address before anything else runs, a malformed one too',
  offer:
    'a voice link asks one question: nothing is sent before Turn on, and one click turns the voice on',
  notNow: 'Not now keeps nothing and sends nothing',
  held: 'a browser whose voice is on already is told so, with Close, and is never paired again',
  server:
    "a voice link naming another server than this browser's voice or study server is refused with nothing sent",
  secret: 'the code never reaches storage, a log or the words on the panel',
};
/** [guarantee, file, the text to find exactly once, the fault, the test that must go red] */
const FAULTS = [
  [
    'the link leaves the address before anything else runs',
    BOOT,
    "try { env.history.replaceState(env.history.state, '', `${env.location.pathname}${env.location.search}`); offeredVoice = address.slice(VOICE_LINK.length); }",
    "try { setTimeout(() => env.history.replaceState(env.history.state, '', `${env.location.pathname}${env.location.search}`), 0); offeredVoice = address.slice(VOICE_LINK.length); }",
    T.address,
  ],
  [
    'a malformed link leaves the address too',
    BOOT,
    '} else if (address.startsWith(VOICE_LINK)) {',
    '} else if (/^#voice-connect=[A-Za-z0-9_-]+={0,2}$/.test(address)) {',
    T.address,
  ],
  [
    'nothing is sent before Turn on',
    CONNECT,
    "yes.addEventListener('click', go);",
    'void go();',
    T.offer,
  ],
  [
    'Not now keeps nothing and sends nothing',
    CONNECT,
    "no.addEventListener('click', close);",
    "no.addEventListener('click', go);",
    T.notNow,
  ],
  [
    'a paired browser is never paired again',
    CLIENT,
    "    if (link && pairing) return { ok: false, code: 'already-paired' };\n",
    '',
    T.held,
  ],
  [
    'a link naming another server is refused',
    CLIENT,
    "    if (link && configured && parsed.server !== configured) return { ok: false, code: 'server-mismatch' };\n",
    '',
    T.server,
  ],
  [
    'the code is never logged',
    CONNECT,
    '  let link = text;\n',
    "  let link = text; console.info('voice-connect', text);\n",
    T.secret,
  ],
  [
    'the code is never stored',
    CONNECT,
    '  let link = text;\n',
    "  let link = text; try { env.sessionStorage?.setItem('bunki-voice-connect', text); } catch { /* none */ }\n",
    T.secret,
  ],
  [
    "the code is never in the panel's words",
    CONNECT,
    'say(VOICE_PAIRING.askServer(vetted.host))',
    'say(VOICE_PAIRING.askServer(`${vetted.host} ${text}`))',
    T.secret,
  ],
  [
    'the link keeps the server rule of the pairing line',
    CLIENT,
    '/^nsrs_/i.test(learner) || !isVoiceServer(server)) return bad;',
    '/^nsrs_/i.test(learner)) return bad;',
    T.parse,
  ],
];

function plant(file, find, fault) {
  const folder = mkdtempSync(join(tmpdir(), 'bunki-voice-link-control-'));
  mkdirSync(join(folder, 'modules'));
  symlinkSync(join(corridor, 'modules/nihongo-speech'), join(folder, 'modules/nihongo-speech'));
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
  const env = { ...process.env, BUNKI_VOICE_LINK_ROOT: folder };
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
    const clean = await control(BOOT, 'const VOICE_LINK = ', 'const VOICE_LINK = ');
    assert.deepEqual(clean.failed, [], 'the unplanted copy must be green');
    assert.equal(clean.passed.length, 9);
    const outcomes = [];
    for (let at = 0; at < FAULTS.length; at += 3) {
      outcomes.push(
        ...(await Promise.all(
          FAULTS.slice(at, at + 3).map(async ([guarantee, file, find, fault, expected]) => ({
            guarantee,
            expected,
            ...(await control(file, find, fault)),
          })),
        )),
      );
    }
    for (const { guarantee, expected, code, failed } of outcomes) {
      assert.notEqual(code, 0, `the fault survived: ${guarantee}`);
      assert.ok(
        failed.includes(expected),
        `the fault was not caught by its own test: ${guarantee} (red: ${failed.join(' | ') || 'none'})`,
      );
    }
  },
);
