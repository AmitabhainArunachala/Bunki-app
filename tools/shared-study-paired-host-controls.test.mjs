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
const PAIRING = 'shared-study-pairing.mjs';
const HOST = 'shared-study-paired-host.mjs';
const BOOT = 'shared-study-boot.mjs';

const T = {
  pair: 'pair: one request to the configured server, the credential kept, the host bound to the server’s identity',
  line: 'the pairing line: the code, the learner and the device in any order, in one box or two; a code alone cannot pair',
  server: 'pairing goes to the server this device is set up for, or nowhere',
  transport:
    'the transport carries the credential to the one server and refuses every other address',
  crossing: 'a grade crosses both ways between Bunki and a second device of the same learner',
  firstOpen:
    'a first open needs the record: with no connection it is refused, and the next try with one goes through',
  missingCopy: 'a copy of the record that has gone missing is not replaced by an empty one',
  revoked:
    '401 after a revocation: sync stops, the credential is dropped, the screen says so, and nothing loops',
  permit401: '401 on a permit request ends the pairing the same way',
  unpair: 'unpair: the credential and the flag go, sync stops, the copy of the record stays unused',
  flag: 'pair refused: a flag this browser cannot keep undoes the pairing, so nothing is half kept',
  twoTabs:
    'two tabs: a pairing forgotten in one tab stops the other at once, and a new pairing is out of its reach',
  deaf: 'a tab that heard nothing finds out before its next request and before its next answer',
  rows: 'a change to the stored pairing names the row it means: a late refusal and a late first open leave a new pairing alone',
  ended:
    'after the pairing has ended an answer is refused in plain words, nothing is saved, and what was waiting is counted and kept',
  forgetting:
    'forgetting is made durable first: a page that closes midway leaves a pairing that is ended, never one that comes back',
  unwritten:
    'a refusal the device could not write down stays a refusal: tried again, marked for page start, never asked again',
  start:
    'page start: no flag binds nothing; a flag binds the host; a flag with no pairing behind it is taken away',
  startEnded: 'page start honours the mark of an ended pairing: the flag alone does not bind it',
  settings:
    'Settings: Nihongo Study with no form, “Not connected” in the page’s language, and a connection made by a link shown at once',
  settingsPaired:
    'Settings on a paired page: connected, when it last synced, a pairing the server ended, and Disconnect in two presses',
  link: 'a connect link asks one question: nothing is kept or sent before Connect, Not now keeps and sends nothing, and one click on Connect pairs',
  linkServer:
    'a connect link that names another server than the one this browser knows is refused with nothing sent',
  linkHeld:
    'an already-connected browser cannot be re-pointed by a link: it is told so and offered Close only',
  linkCode: 'the code of a connect link never reaches storage, a log or the words on the page',
  linkAddress:
    'page start: a connect link leaves the address before anything else runs, a malformed one too, and no other address is touched',
  settingsChanged:
    'Settings in a tab whose pairing was changed elsewhere: it stops saying it is the pairing’s page',
  either: 'the channel and the marks: both tell the other tabs, and either alone is enough',
  firstRefused:
    'a first open the server refuses ends the pairing: it says so, never “open this again while online”, and asks nothing more',
  standInFailsClosed:
    'the stand-in answers a page as the server does: a browser-class token paired with no listed origin answers no page',
};
const refusedFor = (what, code) => `pair refused: ${what} says ${code} and keeps nothing`;

/** [guarantee, file, the text to find exactly once, the fault, the test that must go red] */
const FAULTS = [
  // ---- pairing
  [
    'a pairing line that names another server is refused before anything is sent',
    PAIRING,
    "if (parsed.server && configured && parsed.server !== configured) return refuse('server-mismatch');",
    '',
    T.server,
  ],
  [
    'a paired device does not pair over itself',
    PAIRING,
    "if (kept.device) return refuse('already-paired');",
    '',
    T.server,
  ],
  [
    'a refusal names its own cause (wrong or expired code)',
    PAIRING,
    'if (response.status !== 200) return refuse(',
    'if (response.status >= 500) return refuse(',
    refusedFor('a wrong code', 'code-invalid-or-expired'),
  ],
  [
    'a speak-only install is never kept as a study device',
    PAIRING,
    "if (!STUDY_INSTALLATION.test(installation)) return { error: 'not-a-study-device' };",
    '',
    refusedFor('a code minted for a speak-only install', 'not-a-study-device'),
  ],
  [
    'the identity is what the server said for the learner that was asked for',
    PAIRING,
    "if (!validScope(scope) || ['environment', 'learner', 'installation'].some((key) => scope[key] !== asked[key])) return refuse('invalid-response');",
    "if (!validScope(scope)) return refuse('invalid-response');",
    refusedFor('an answer for another learner than the one asked for', 'invalid-response'),
  ],
  [
    'the answer must name the device that was asked for',
    PAIRING,
    "if (!validScope(scope) || ['environment', 'learner', 'installation'].some((key) => scope[key] !== asked[key])) return refuse('invalid-response');",
    "if (!validScope(scope) || ['environment', 'learner'].some((key) => scope[key] !== asked[key])) return refuse('invalid-response');",
    refusedFor('an answer for another device than the one asked for', 'invalid-response'),
  ],
  [
    'a credential that names another scope is not kept',
    PAIRING,
    "try { checkStudyCredential(body.token, scope); } catch { return refuse('invalid-response'); }",
    '',
    refusedFor('a token that names another scope', 'invalid-response'),
  ],
  [
    'a pairing that cannot be flagged is taken back whole',
    PAIRING,
    'try { await store.remove(ref); } catch { /* nothing more can be undone */ }',
    '',
    T.flag,
  ],
  [
    'unpairing forgets the credential',
    PAIRING,
    "try { await store.forget(ref, { at: now() }); await store.remove(ref); } catch { announce(); return refuse('storage-unavailable'); }",
    '',
    T.unpair,
  ],
  [
    'a code alone cannot pair: the installation is the admin’s to name and is never made up here',
    PAIRING,
    "if (installation === null) return { error: 'pairing-line-required' };",
    '',
    T.line,
  ],
  [
    'a server is the learner’s Worker or this machine, and no other https host',
    PAIRING,
    'const LOCAL_HTTPS = /^https:\\/\\/(?:127\\.0\\.0\\.1|localhost):\\d{1,5}$/;',
    'const LOCAL_HTTPS = /^https:\\/\\/[^/]+$/;',
    T.line,
  ],
  // ---- the host
  [
    'the credential goes to its own server only',
    HOST,
    "if (typeof url !== 'string' || !url.startsWith(`${alias}/`)) throw new Error('study-origin-refused');",
    '',
    T.transport,
  ],
  [
    'an answer is handed to the engine under the address it asked for, a stray one as it is',
    HOST,
    'url: response.url === real ? url : response.url };',
    'url };',
    T.transport,
  ],
  [
    'paired study has a database of its own, never the preview’s',
    HOST,
    'export const pairedReplicaName = (installation) => `bunki-shared-study-paired-${installation}`;',
    "export const pairedReplicaName = () => 'bunki-shared-study-preview-v1';",
    T.pair,
  ],
  [
    'a first open fetches the record before anyone grades',
    HOST,
    "if (result?.state !== 'up-to-date') {",
    'if (false) {',
    T.firstOpen,
  ],
  [
    'a missing copy of the record is not replaced by an empty one',
    HOST,
    "catch (error) { throw error?.message === 'missing-store' ? hostError('study-replica-missing') : error; }",
    "catch { adapter = await open('fresh'); }",
    T.missingCopy,
  ],
  [
    'a 401 ends the pairing: the credential is dropped and the screen is told',
    HOST,
    "if (next.getSyncError() === 'authentication-required' && closed === null) void endPairing(currentAdapter());",
    '',
    T.revoked,
  ],
  [
    'an ended pairing is not reported as paired',
    HOST,
    'permits: { isPaired: () => closed === null, reserve: reservePermits },',
    'permits: { isPaired: () => true, reserve: reservePermits },',
    T.revoked,
  ],
  // The fault takes the whole line: a 401 on a permit request is then one more ordinary failure. Dropping only the
  // call to endPairing() from that line is not a fault the suite can see, and rightly: the refusal is still named
  // `authentication-required`, the sync session publishes it, and the host's watcher ends the pairing by that name.
  [
    'a 401 on a permit request ends the pairing too',
    HOST,
    "if (response.status === 401) { await endPairing(); throw new Error('authentication-required'); }",
    '',
    T.permit401,
  ],
  [
    'permits are asked of the server with the replica’s own capability',
    HOST,
    "headers: { 'Content-Type': 'application/json', ...compatibilityHeaders(), Authorization: `Bearer ${token}` },",
    "headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },",
    T.crossing,
  ],
  [
    'a pairing the server ended keeps no credential on the device',
    PAIRING,
    "? { ...row, sealed: null, ended: { at: row.ended?.at ?? at, by: 'server', unsent } } : null),",
    "? { ...row, ended: { at: row.ended?.at ?? at, by: 'server', unsent } } : null),",
    T.revoked,
  ],
  // ---- page start
  [
    'with no flag, page start binds nothing',
    BOOT,
    'if (!env.bunkiSharedStudyHost && marked()) {',
    'if (!env.bunkiSharedStudyHost) {',
    T.start,
  ],
  [
    'a flag with no pairing behind it is taken away',
    BOOT,
    "if (error?.code === 'study-pairing-missing' || error?.code === 'study-pairing-ended') unbind(lazy);",
    '',
    T.start,
  ],
  // ---- Settings
  [
    'Settings says when the record was last brought up to date',
    HOST,
    "if (next.getSyncState() === 'up-to-date' && !next.getSyncError() && closed === null) noteSynced();",
    '',
    T.settingsPaired,
  ],
  [
    'a page that has not opened study says when from the pairing’s own row',
    PAIRING,
    'synced: (row, ref, { at }) => (isStudyRow(row, ref) && !row.ended && Number.isFinite(at) && !(row.syncedAt >= at) ? { ...row, syncedAt: at } : null),',
    'synced: () => null,',
    T.settingsPaired,
  ],
  // ---- the connect link
  [
    'a connect link leaves the address before anything else runs',
    BOOT,
    "try { env.history.replaceState(env.history.state, '', `${env.location.pathname}${env.location.search}`); offered = address.slice(LINK.length); }",
    "try { setTimeout(() => env.history.replaceState(env.history.state, '', `${env.location.pathname}${env.location.search}`), 0); offered = address.slice(LINK.length); }",
    T.linkAddress,
  ],
  [
    'a malformed connect link leaves the address too',
    BOOT,
    'if (address.startsWith(LINK)) {',
    'if (/^#study-connect=[A-Za-z0-9_-]+={0,2}$/.test(address)) {',
    T.linkAddress,
  ],
  [
    'nothing is kept or sent before Connect',
    PAIRING,
    "yes.addEventListener('click', go);",
    'void go();',
    T.link,
  ],
  [
    'Not now keeps nothing and sends nothing',
    PAIRING,
    "no.addEventListener('click', close);",
    "no.addEventListener('click', go);",
    T.link,
  ],
  [
    'a connect link naming another server is refused before anything is sent',
    PAIRING,
    "if (parsed.server && configured && parsed.server !== configured) return refuse('server-mismatch');",
    '',
    T.linkServer,
  ],
  [
    'a browser that is already connected cannot be re-pointed by a link',
    PAIRING,
    "if (kept.device) return refuse('already-paired');",
    '',
    T.linkHeld,
  ],
  [
    'the code of a connect link is kept in memory only, never in storage',
    PAIRING,
    'let link = text;',
    "let link = text; try { env.sessionStorage?.setItem('bunki-study-connect', text); } catch { /* none */ }",
    T.linkCode,
  ],
  [
    'the code of a connect link is never logged',
    PAIRING,
    'let link = text;',
    "let link = text; console.info('study-connect', text);",
    T.linkCode,
  ],
  [
    'the code of a connect link is never shown',
    PAIRING,
    "const server = el('p', 'study-connect-server', vetted.ok ? say(ASK.server(vetted.host)) : '');",
    "const server = el('p', 'study-connect-server', vetted.ok ? say(ASK.server(`${vetted.host} (${parseStudyConnect(text).code})`)) : '');",
    T.linkCode,
  ],
  [
    'Settings speaks the page’s language',
    PAIRING,
    'const words = (pair) => tx(pair[0], pair[1]);',
    'const words = (pair) => tx(pair[1], pair[1]);',
    T.settings,
  ],
  [
    'forgetting a pairing stops sync before the credential goes',
    PAIRING,
    'try { await host?.dispose?.(); } catch { /* the page is about to be reopened */ }',
    '',
    T.settingsPaired,
  ],
  // (That the block says "ended" the moment the page's host knows has two legs, the host's own word and the
  // device's record read again; taking either away is not a fault the suite can see, and rightly. The count has one.)
  [
    'Settings counts what was never sent as soon as the page’s host knows',
    PAIRING,
    'const unsent = ended ? current.unsent ?? live?.unsent ?? null : null;',
    'const unsent = ended ? current.unsent ?? null : null;',
    T.settingsPaired,
  ],
  // ---- 1. two tabs
  [
    'a tab is told at once when the pairing is forgotten or changed in another tab',
    HOST,
    'const stopWatch = watchStudyPairing(env, () => { void verify(); });',
    'const stopWatch = () => {};',
    T.twoTabs,
  ],
  [
    'the channel alone tells the other tabs',
    PAIRING,
    'channel.onmessage = () => onSignal();',
    '',
    T.either,
  ],
  [
    'the marks changing alone tells the other tabs',
    PAIRING,
    "env.addEventListener('storage', changed);",
    '',
    T.either,
  ],
  [
    'a tab that heard nothing checks the stored row before every request',
    HOST,
    'getCredential: async () => ((await verify()) ? token : null),',
    'getCredential: async () => token,',
    T.deaf,
  ],
  [
    'a tab that heard nothing checks the stored row before every answer',
    HOST,
    "if (!(await verify())) throw hostError('study-answer-not-saved');",
    "if (closed) throw hostError('study-answer-not-saved');",
    T.deaf,
  ],
  [
    'Settings in another tab follows the device, not the host it was drawn with',
    PAIRING,
    'const bound = !!host && !live?.closed;',
    'const bound = !!host;',
    T.settingsChanged,
  ],
  // ---- 2. a change names its row
  [
    'ending a pairing names the row it means',
    PAIRING,
    "end: (row, ref, { at, unsent = null }) => (isStudyRow(row, ref) && (!row.ended || (row.ended.by === 'server' && row.ended.unsent === null && unsent !== null))",
    "end: (row, ref, { at, unsent = null }) => (row && (!row.ended || (row.ended.by === 'server' && row.ended.unsent === null && unsent !== null))",
    T.rows,
  ],
  [
    'marking a pairing ready names the row it means',
    PAIRING,
    "ready: (row, ref) => (isStudyRow(row, ref) && !row.ended ? { ...row, phase: 'ready' } : null),",
    "ready: (row, ref) => (row && !row.ended ? { ...row, phase: 'ready' } : null),",
    T.rows,
  ],
  [
    'a row is one pairing: the same installation written again is another row',
    PAIRING,
    'row.scope?.installation === ref.installation && (row.generation ?? FIRST_GENERATION) === ref.generation;',
    'row.scope?.installation === ref.installation;',
    T.rows,
  ],
  [
    'a refusal that arrives after the pairing was replaced ends nothing',
    HOST,
    "if (current !== undefined && !(current && current.scope.installation === ref.installation && current.generation === ref.generation)) { shut('study-pairing-changed'); return; }",
    '',
    T.rows,
  ],
  // ---- 3. answers after the pairing has ended
  [
    'an answer after the pairing has ended is refused, not saved',
    HOST,
    'return guarded(adapter);',
    'return adapter;',
    T.ended,
  ],
  [
    'every way of writing an answer is refused, not only the first',
    HOST,
    "const WRITES = ['submitCommand', 'resumeCommand', 'mutate', 'capture', 'practice', 'addNewToday', 'setNewTodayTotal', 'createManualCard'];",
    "const WRITES = ['submitCommand'];",
    T.ended,
  ],
  [
    'what was still waiting when the pairing ended is counted',
    HOST,
    "unsent = Object.values(journal.local).filter((row) => row.ackedSeq === null && row.event.type === 'review').length;",
    'unsent = null;',
    T.ended,
  ],
  // ---- 4. the order of forgetting
  [
    'forgetting is made durable before the row is removed',
    PAIRING,
    "try { await store.forget(ref, { at: now() }); await store.remove(ref); } catch { announce(); return refuse('storage-unavailable'); }",
    "try { await store.remove(ref); } catch { announce(); return refuse('storage-unavailable'); }",
    T.forgetting,
  ],
  [
    'the mark page start reads is written before the row is touched',
    PAIRING,
    "endedMark.set(ref.installation, 'learner');",
    '',
    T.forgetting,
  ],
  [
    'a flag is never put back for a pairing that has ended',
    PAIRING,
    'else if (kept.token !== null && !marker.get()) marker.set();',
    'if (device && !marker.get()) marker.set();',
    T.forgetting,
  ],
  [
    'a forgetting that was cut short is finished, not undone',
    PAIRING,
    'if (await finishForgetting(studyRowRef(device))) device = null;',
    '',
    T.forgetting,
  ],
  // ---- 5. a refusal that could not be written down
  [
    'the mark page start reads is written as soon as the server refuses',
    HOST,
    "endedMark.set(ref.installation, 'server');",
    '',
    T.unwritten,
  ],
  [
    'the write of an ended pairing is tried again',
    HOST,
    'for (const pause of [0, ...endRetryMs]) {',
    'for (const pause of [0]) {',
    T.unwritten,
  ],
  [
    'a first open the server refuses ends the pairing and says so',
    HOST,
    "if (!closed && result?.error === 'authentication-required') await endPairing(adapter);",
    '',
    T.firstRefused,
  ],
  [
    'an ended pairing is never bound again, whatever the row still holds',
    HOST,
    'if (!isLiveStudyDevice(device, endedMark.get()) || token === null) {',
    'if (device.ended || token === null) {',
    T.unwritten,
  ],
  [
    'page start honours the mark of an ended pairing',
    BOOT,
    "const marked = () => kept(MARKER) === '1' && kept(ENDED) === '';",
    "const marked = () => kept(MARKER) === '1';",
    T.startEnded,
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
function run(folder, file = suite, extra = {}) {
  const env = { ...process.env, BUNKI_PAIRED_HOST_ROOT: folder, ...extra };
  for (const name of Object.keys(env))
    if (/^(VITEST|NODE_TEST_CONTEXT|NODE_OPTIONS)/.test(name)) delete env[name];
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ['--test', '--test-reporter=tap', file],
      { env, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout) => {
        const failed = [...stdout.matchAll(/^not ok \d+ - (.*)$/gm)].map((match) => match[1]);
        const passed = [...stdout.matchAll(/^ok \d+ - (.*)$/gm)].map((match) => match[1]);
        resolve({ code: error ? (error.code ?? 1) : 0, failed, passed });
      },
    );
  });
}
async function control(file, find, fault, suiteFile = suite, extra = {}) {
  const folder = plant(file, find, fault);
  try {
    return await run(folder, suiteFile, extra);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

test(
  'every planted fault turns the test of its guarantee red, and the unplanted copy is green',
  { timeout: 600000 },
  async () => {
    const clean = await control(null, '', '');
    assert.deepEqual(clean.failed, [], 'the unplanted copy must be green');
    assert.equal(clean.code, 0);
    assert.ok(clean.passed.length >= 39);
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

test(
  'the stand-in fails closed as the server does: a planted lenient rule turns its test red',
  { timeout: 300000 },
  async () => {
    const original = fileURLToPath(new URL('./support/study-server-double.mjs', import.meta.url));
    const planted = original.replace(/\.mjs$/, `.planted-${process.pid}.mjs`);
    // the rule for a token with no stored origin; the planted one lets a browser-class token answer any page
    const find =
      '(device.origin ? origin !== device.origin : BROWSER_CLASS.test(device.scope.installation))';
    const text = readFileSync(original, 'utf8');
    assert.equal(
      text.split(find).length - 1,
      1,
      `the fault's text must occur exactly once in the stand-in: ${find}`,
    );
    // beside the original, so that its own imports resolve; removed whatever happens
    writeFileSync(
      planted,
      text.replace(find, () => '(device.origin ? origin !== device.origin : false)'),
    );
    try {
      const result = await run(corridor, suite, { BUNKI_STUDY_DOUBLE: planted });
      assert.notEqual(result.code, 0, 'the lenient stand-in survived');
      assert.ok(
        result.failed.includes(T.standInFailsClosed),
        `not caught by its own test (red: ${result.failed.join(' | ') || 'none'})`,
      );
    } finally {
      rmSync(planted, { force: true });
    }
  },
);

/** Faults only a browser can see: the credential's place in IndexedDB, the flag a page start reads, the voice
 * client's own store, a second page of the same profile. Each must turn the browser test red
 * (tools/shared-study-paired-browser.test.mjs, which serves the planted folder's files to the page). A browser run
 * apiece, so this is asked for by name. */
const browserSuite = fileURLToPath(
  new URL('./shared-study-paired-browser.test.mjs', import.meta.url),
);
const BROWSER_TEST =
  'a browser connects from a link with one click, studies on the paired record, exchanges a grade both ways, restarts, loses its pairing to the server and to the learner';
const BROWSER_FAULTS = [
  [
    'the credential is sealed with a key the browser will not export',
    PAIRING,
    "const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);",
    "const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);",
  ],
  [
    'a pairing leaves the flag the next page start binds the host by',
    PAIRING,
    "set() { try { storage().setItem(PAIRED_MARKER, '1'); return storage().getItem(PAIRED_MARKER) === '1'; } catch { return false; } },",
    'set() { return true; },',
  ],
  [
    'the server is the one the voice client keeps',
    PAIRING,
    'return isStudyServer(address) ? address : null;',
    'return null;',
  ],
  [
    'a pairing the server ended keeps no credential on the device',
    PAIRING,
    "? { ...row, sealed: null, ended: { at: row.ended?.at ?? at, by: 'server', unsent } } : null),",
    "? { ...row, ended: { at: row.ended?.at ?? at, by: 'server', unsent } } : null),",
  ],
  [
    'looking for a database never makes one (an empty `bunki-voice` would break the voice client)',
    PAIRING,
    'request.onupgradeneeded = () => { absent = true; try { request.transaction.abort(); } catch { /* the open fails below */ } };',
    'request.onupgradeneeded = () => { absent = true; };',
  ],
  // In a page the word reaches an open host by two ways (the host listens itself, and the page-start module tells
  // it), so taking the host's own listening away is a fault only the unit suite sees. Both ways end in the host
  // asking the device whether its row is still the stored one: that question answered wrongly is the fault here.
  [
    'a second page of the same profile stops when the pairing is forgotten in the first',
    HOST,
    'if (mine && isLiveStudyDevice(current, mark)) return true;',
    'return true;',
  ],
  [
    'a stored pairing is changed only by the page that means it, in the browser’s own store too',
    PAIRING,
    'row.scope?.installation === ref.installation && (row.generation ?? FIRST_GENERATION) === ref.generation;',
    'true;',
  ],
];

test(
  'faults only a browser can see turn the browser test red (asked for with BUNKI_PAIRED_BROWSER_CONTROLS=1)',
  { skip: !process.env.BUNKI_PAIRED_BROWSER_CONTROLS, timeout: 1200000 },
  async () => {
    const browser = { BUNKI_TEST_CHROME: process.env.BUNKI_TEST_CHROME || '1' };
    const clean = await control(null, '', '', browserSuite, browser);
    assert.deepEqual(clean.failed, [], 'the unplanted copy must be green in the browser');
    assert.ok(clean.passed.includes(BROWSER_TEST), 'the browser test did not run');
    const outcomes = [];
    for (const [guarantee, file, find, fault] of BROWSER_FAULTS)
      outcomes.push({ guarantee, ...(await control(file, find, fault, browserSuite, browser)) });
    if (process.env.BUNKI_PAIRED_HOST_CONTROLS_REPORT)
      writeFileSync(
        `${process.env.BUNKI_PAIRED_HOST_CONTROLS_REPORT}.browser.json`,
        `${JSON.stringify({ clean: { code: clean.code, passed: clean.passed.length }, faults: outcomes }, null, 2)}\n`,
      );
    for (const { guarantee, code, failed } of outcomes) {
      assert.notEqual(code, 0, `the fault survived the browser test: ${guarantee}`);
      assert.ok(failed.includes(BROWSER_TEST), `the browser test stayed green: ${guarantee}`);
    }
  },
);
