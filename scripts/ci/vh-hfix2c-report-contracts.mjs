import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { contrastExpectedCases } from './vh-existing-report-contracts.mjs';

export const HFIX2C = JSON.parse(readFileSync(new URL('./vh-hfix2c-rosters.json', import.meta.url), 'utf8'));
export const hfix2cNarrowingEnvironment = Object.freeze(['HFIX2C_MODE', 'HFIX2C_CASE', 'HFIX2C_BASE', 'SWEEP_DEBUG']);
export const hfixDigest = bytes => createHash('sha256').update(bytes).digest('hex');
const sha = value => assert.match(value || '', /^[a-f0-9]{64}$/u, 'Missing SHA-256 pin');
const nonempty = value => assert(typeof value === 'string' && value.length > 0, 'Missing identity');
const exact = (actual, expected, label) => assert.deepEqual(actual, expected, label);
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const sourcePaths = {
  focused: 'prototypes/corridor/tools/verify-hfix2c.mjs',
  adapter: 'prototypes/corridor/tools/verify-hfix2c-contrast.mjs',
  shared: 'prototypes/corridor/tools/verify-contrast-sweep.mjs',
  arrival: 'prototypes/corridor/tools/vh-contrast-arrival.mjs',
  record: 'prototypes/corridor/tools/record-test-support.mjs',
  diversity: 'prototypes/corridor/tools/hfix2c-diversity.json',
  audio: 'prototypes/corridor/tools/browser-audio-silence.mjs',
  shelf: 'prototypes/corridor/tools/shelf-tools-support.mjs',
  wrapper: 'scripts/ci/run-hfix2c-contrast-gate.mjs',
  validator: 'scripts/ci/vh-hfix2c-report-contracts.mjs',
  roster: 'scripts/ci/vh-hfix2c-rosters.json',
};
export function loadHfix2cPins({ root, siteDir, engine, runId }) {
  assert(['chromium', 'webkit'].includes(engine)); nonempty(runId);
  const site = realpathSync(siteDir), identity = json(join(site, 'build-identity.json'));
  assert.equal(identity.schemaVersion, 1); assert.equal(identity.product, 'KAIRO');
  assert.equal(identity.sourceDirty, false); sha(identity.artifactSha256);
  const artifact = file => {
    const bytes = readFileSync(join(site, file));
    const expected = identity.files.find(row => row.path === file)?.sha256;
    sha(expected); assert.equal(hfixDigest(bytes), expected, `Artifact file changed: ${file}`);
    return bytes;
  };
  const lesson = JSON.parse(artifact('data/share_alike/kanji.json')).kanji['生'];
  const file = 'data/share_alike/reference-extra.json', bytes = artifact(file), extra = JSON.parse(bytes);
  const row = extra.kanjiReadings.find(([glyph]) => glyph === '生'); assert(row && lesson);
  const officialReadings = (extra.officialReadings || []).filter(([glyph]) => glyph === '生').map(([, reading]) => reading);
  const isOn = reading => /[ァ-ヺ]/u.test(reading.replace(/[.-]/gu, ''));
  const canonical = { on: [...new Set([...lesson.on, ...row[1], ...officialReadings.filter(isOn)])],
    kun: [...new Set([...lesson.kun, ...row[2], ...officialReadings.filter(reading => !isOn(reading))])],
    lessonOn: lesson.on, lessonKun: lesson.kun, officialReadings, readingsState: 'complete' };
  return { engine, runId, siteDir: site, identity, artifactSha256: identity.artifactSha256,
    canonical, sidecar: { file, bytes: bytes.length, sha256: hfixDigest(bytes) },
    sources: Object.fromEntries(Object.entries(sourcePaths).map(([key, path]) => [key, hfixDigest(readFileSync(resolve(root, path)))])),
    originalUrl: pathToFileURL(resolve(root, sourcePaths.shared)).href,
    fullContrastIds: contrastExpectedCases(engine) };
}
function common(p) {
  assert(['chromium', 'webkit'].includes(p.engine)); nonempty(p.runId); sha(p.artifactSha256);
  assert.equal(p.identity.schemaVersion, 1); assert.equal(p.identity.product, 'KAIRO');
  assert.equal(p.identity.sourceDirty, false); assert.equal(p.identity.artifactSha256, p.artifactSha256);
  for (const key of Object.keys(sourcePaths)) sha(p.sources[key]);
}
function review(snapshot, record, state) {
  assert.equal(snapshot.state, state); assert.equal(snapshot.overflow, 0);
  exact(snapshot.lines, ['on', 'kun'].map((key, index) => ({ label: index ? 'Kun readings · ' : 'On readings · ', readings: record[key] })), 'Reading lines');
  exact(snapshot.readings, [...record.on, ...record.kun].map(reading => {
    const lesson = [...record.lessonOn, ...record.lessonKun].includes(reading);
    return { reading, text: reading + (lesson ? ' (lesson)' : '') + (record.officialReadings.includes(reading) ? '*' : ''), lesson };
  }), 'Exact canonical readings');
  assert(snapshot.text.includes('On readings') && snapshot.text.includes('Kun readings'));
  if (state === 'pending') assert(snapshot.text.includes('Loading the complete reading set'));
  else assert(!/unavailable|Loading/u.test(snapshot.text));
  if (record.officialReadings.length) assert(snapshot.text.includes('* Reading supplied by the Jōyō Kanji Table.'));
}
export function validateHfix2cFocused(value, p) {
  common(p); assert.equal(value.schemaVersion, 2); assert.equal(value.suite, 'hfix2c');
  assert.equal(value.runId, p.runId); assert.equal(value.mode, 'branch');
  assert.equal(value.scope, 'full'); assert.equal(value.selectedCase, null);
  assert.equal(value.engine, p.engine); nonempty(value.browserVersion);
  exact(value.identity, p.identity, 'Foreign Hfix artifact');
  assert.equal(value.verifierSha256, p.sources.focused);
  exact(value.helperSha256, { 'record-test-support.mjs': p.sources.record, 'hfix2c-diversity.json': p.sources.diversity });
  exact(value.sources, { nativeRecordHelper: p.sources.record });
  assert.equal(value.pass, true); exact(value.errors, []);
  exact(value.rows.map(row => `${row.group}/${row.name}`), HFIX2C.focused, 'Exact focused roster');
  assert(value.rows.every(row => row.pass === true && row.observed !== undefined));
  exact(value.groups, Object.fromEntries(Object.entries(HFIX2C.groups).map(([key, rows]) => [key, { rows, red: 0 }])));
  const corridor = p.identity.files.find(row => row.path === 'corridor.js')?.sha256; sha(corridor);
  assert.equal(value.mutations.length, 5);
  for (const mutation of value.mutations) {
    assert.equal(mutation.label, 'canonical Kanji-trust display contract fixture');
    assert.equal(mutation.file, 'corridor.js'); assert.equal(mutation.originalSha256, corridor);
    sha(mutation.servedSha256); assert.notEqual(mutation.servedSha256, corridor);
  }
  const first = value.rows.find(row => row.name === '生/390/complete: actual merged canonical readings').observed;
  review(first.observed, p.canonical, 'complete'); assert.equal(first.unchanged, true);
  const row = value.rows.find(row => row.name === HFIX2C.transition).observed;
  exact(row.expected, p.canonical); exact(row.protectedKeys, HFIX2C.protectedRoots);
  for (const phase of ['before', 'during', 'after']) exact(Object.keys(row.roots[phase]), HFIX2C.protectedRoots);
  exact(row.roots.before, row.roots.during); exact(row.roots.before, row.roots.after);
  assert(row.roots.before.taken.some(item => item.t === 'kanji' && item.id === '生'));
  for (const key of ['unchanged', 'sameDocument', 'wasHeld']) assert.equal(row[key], true);
  assert.equal(row.forcedRelease, false); assert.equal(row.requests, 1);
  assert(Number.isFinite(row.releasedAfterMs) && row.releasedAfterMs >= 0 && row.releasedAfterMs < 6500);
  exact(row.response, { file: p.sidecar.file, bytes: p.sidecar.bytes, expectedSha256: p.sidecar.sha256,
    servedSha256: p.sidecar.sha256, receivedSha256: p.sidecar.sha256, status: 200 });
  review(row.pending, { ...p.canonical, on: p.canonical.lessonOn, kun: p.canonical.lessonKun, officialReadings: [] }, 'pending');
  review(row.complete, p.canonical, 'complete'); exact(row.pending.document, row.complete.document);
  nonempty(row.pending.document.url); assert(Number.isFinite(row.pending.document.timeOrigin) && row.pending.document.timeOrigin > 0);
  assert.equal(row.pending.view, 'review'); assert.equal(row.complete.view, 'review');
  assert.equal(row.afterReleaseActions, 'wait for public completion, observe; no click, reload, navigation or app helper');
  return true;
}
const chromeClear = chrome => chrome && ['fades', 'invalid', 'through', 'translucent'].every(key => Array.isArray(chrome[key])) &&
  !chrome.invalid.length && !chrome.through.length && !chrome.translucent.length &&
  chrome.fades.every(fade => fade.side === 'foot' && Number.isFinite(fade.edge) && fade.edge > 0 && fade.edge <= 24);
const band = chrome => chromeClear(chrome) && chrome.fades.some(fade => fade.bar === 'kp-foot-band');
export function validateHfix2cContrastScene(scene) {
  assert(scene.pairs.length > 0); exact(scene.unresolved, []);
  const lines = new Set(); let movedLines = 0;
  for (const pair of scene.pairs) {
    const required = pair.fontPx >= 24 || pair.fontPx >= 18.67 && pair.weight >= 700 ? 3 : 4.5;
    assert(Number.isFinite(pair.fontPx) && Number.isFinite(pair.weight));
    assert.equal(pair.required, required); assert.equal(pair.ok, true);
    assert(Number.isFinite(pair.ratio) && pair.ratio >= required);
    assert(pair.occurrence !== undefined && pair.lines.length > 0);
    for (const line of pair.lines) {
      const key = `${pair.occurrence}:${line.line}`;
      assert(Number.isInteger(line.line) && line.line >= 0 && !lines.has(key), 'Duplicate or missing native line');
      lines.add(key); assert.equal(line.ok, true);
      assert(Number.isFinite(line.ratio) && line.ratio >= required);
      assert(line.at === 'stood' || line.at && Number.isFinite(line.at.doc));
      if (line.at !== 'stood') movedLines++;
    }
    assert.equal(pair.ratio, Math.min(...pair.lines.map(line => line.ratio)));
  }
  for (const key of ['figures', 'kanji', 'banding']) assert(Array.isArray(scene[key]) && scene[key].every(row => row.ok === true));
  assert(scene.figures.every(row => Number.isFinite(row.best) && row.best >= 3));
  assert(scene.banding.every(row => Number.isFinite(row.steps) && row.steps <= 1));
  assert(scene.kanji.every(row => row.radial === true && row.rootsOk === true && Number.isFinite(row.wash) && row.wash >= 2 && Number.isFinite(row.glyphRatio) && row.glyphRatio >= 4.5));
  assert(Number.isFinite(scene.pigmentCount) && scene.pigmentCount >= 24);
  exact(scene.roots, []); assert(Array.isArray(scene.muddy));
  // C6 applies only to day worlds; the shared sweep emits no C6 obligation at night.
  if (!['rokusho', 'yoru', 'nami', 'hakuu', 'kaku'].includes(scene.world)) exact(scene.muddy, []);
  const { reread, census } = scene;
  for (const key of ['waiting', 'passes', 'read']) assert(Number.isSafeInteger(reread[key]) && reread[key] >= 0);
  assert(Array.isArray(reread.barred) && Array.isArray(reread.positions) && Array.isArray(census.waiting));
  assert.equal(reread.waiting, reread.read + reread.barred.length, 'Unfinished native lines');
  assert.equal(reread.read, movedLines); assert.equal(census.lines.wait, census.waiting.length);
  assert.equal(census.waiting.length, reread.waiting);
  assert.equal(new Set(census.waiting.map(line => `${line.occurrence}:${line.line}`)).size, census.waiting.length);
  if (scene.chrome) assert(chromeClear(scene.chrome));
  return true;
}
export function validateHfix2cContrast(raw, adapter, p) {
  common(p); sha(p.runnerSha256);
  assert.equal(raw.schemaVersion, 2); assert.equal(raw.runId, p.runId); assert.equal(adapter.runId, p.runId);
  assert.equal(raw.artifactSha256, p.artifactSha256); assert.equal(raw.gitSha, p.identity.gitSha); assert.equal(raw.sourceDirty, false);
  exact(raw.identity, { gitSha: p.identity.gitSha, artifactSha256: p.artifactSha256 });
  assert.equal(raw.verifierSha256, p.runnerSha256); assert.equal(raw.arrivalPredicateSha256, p.sources.arrival);
  assert.equal(adapter.original, p.originalUrl); assert.equal(adapter.originalSha256, p.sources.shared);
  assert.equal(adapter.adapterSha256, p.sources.adapter); assert.equal(adapter.runnerSha256, p.runnerSha256);
  assert.equal(adapter.arrivalPredicateSha256, p.sources.arrival); assert.equal(adapter.expectedRows, 255); assert.equal(adapter.expectedScenes, 33);
  assert.equal(adapter.scope, HFIX2C.adapterScope);
  assert.equal(raw.partial, true); assert.equal(raw.requestedScope, 'diagnostic');
  assert.equal(raw.selectedPassed, true); assert.equal(raw.fullAcceptance, false);
  exact(raw.selectors, { worlds: null, states: HFIX2C.states, demoOnly: false });
  exact(raw.worlds, HFIX2C.worlds); exact(raw.states, HFIX2C.states);
  assert.equal(raw.settledMotion, 'reduce'); assert.equal(raw.freshDemoMotion, 'no-preference');
  exact(Object.keys(raw.engines), [p.engine]); nonempty(raw.engines[p.engine]); assert.equal(raw.error, undefined);
  exact(raw.rows.map(row => row.id), HFIX2C.contrast[p.engine]); exact(raw.observedCases, HFIX2C.contrast[p.engine]);
  exact(raw.expectedCases, p.fullContrastIds, 'Shared app-wide obligation must remain intact');
  assert(raw.rows.every(row => row.ok === true)); assert(raw.source.length > 0 && raw.source.every(row => row.ok === true));
  exact(raw.results.map(row => `${row.engine}/${row.world}/${row.state}`), HFIX2C.worlds.flatMap(world => HFIX2C.states.map(state => `${p.engine}/${world}/${state}`)));
  for (const scene of raw.results) {
    validateHfix2cContrastScene(scene);
    const text = scene.pairs.map(pair => pair.text).join(' ');
    assert(text.includes({ page: 'lesson', 'deck-front': 'Undo', 'deck-back': 'If the answer was new' }[scene.state]));
  }
  exact(raw.controls.map(row => row.id), ['c8-fade-undeclared', 'c8-fade-overdeclared', 'c8-fade-translucent-below']);
  const candidate = raw.results.find(row => row.world === 'hokusai' && row.state === 'deck-front').chrome;
  assert(band(candidate));
  for (const control of raw.controls) {
    assert.equal(control.engine, p.engine); assert.equal(control.scene, 'hokusai/deck-front');
    exact(control.candidate, candidate); exact(control.restored, candidate);
    assert(control.styleBefore !== undefined); exact(control.styleBefore, control.styleAfter);
    assert(control.recordBefore && control.recordAfter); exact(control.recordBefore, control.recordAfter);
    const mutant = control.mutant;
    assert(!chromeClear(mutant));
    if (control.id === 'c8-fade-undeclared') {
      assert(!mutant.fades.some(row => row.bar === 'kp-foot-band'));
      assert(!mutant.invalid.some(row => row.bar === 'kp-foot-band'));
      assert(mutant.through.some(row => row.bar === 'kp-foot-band' && row.pixels > 0));
    } else if (control.id === 'c8-fade-overdeclared')
      assert(mutant.invalid.some(row => row.bar === 'kp-foot-band' && /^\d+(?:\.\d+)?px$/u.test(row.declared) && parseFloat(row.declared) > 24));
    else assert(mutant.fades.some(row => row.bar === 'kp-foot-band' && row.side === 'foot' && row.edge > 0 && row.edge <= 24) &&
      mutant.translucent.some(row => row.bar === 'kp-foot-band' && row.pixels > 0));
  }
  return true;
}
export function readHfix2cContrastEvidence(out, p) {
  const read = name => {
    const file = join(out, name), stat = lstatSync(file);
    assert(stat.isFile() && !stat.isSymbolicLink(), 'Receipt must be a regular file');
    return readFileSync(file);
  };
  const rawBytes = read('contrast-sweep.json'), adapterBytes = read('adapter.json');
  const raw = JSON.parse(rawBytes), adapter = JSON.parse(adapterBytes);
  exact(JSON.parse(read(`sweep-${p.engine}.json`)), raw);
  const runnerSha256 = hfixDigest(read('hfix2c-contrast-runner.mjs'));
  validateHfix2cContrast(raw, adapter, { ...p, runnerSha256 });
  return { raw, rawReportSha256: hfixDigest(rawBytes), adapterReceiptSha256: hfixDigest(adapterBytes), runnerSha256 };
}
export function hfix2cLaneAdmission(evidence, p) {
  return { schemaVersion: 1, suite: 'hfix2c-three-state-contrast', laneAcceptance: true, appWideAcceptance: false,
    scope: '11-worlds/3-changed-states', childExitCode: 3, runId: p.runId, engine: p.engine,
    browserVersion: evidence.raw.engines[p.engine], identity: p.identity, sources: p.sources,
    states: HFIX2C.states, worlds: HFIX2C.worlds, rowCount: 255, sceneCount: 33,
    rawReportSha256: evidence.rawReportSha256, adapterReceiptSha256: evidence.adapterReceiptSha256, runnerSha256: evidence.runnerSha256 };
}
export function validateHfix2cLaneAdmission(value, out, p) {
  exact(value, hfix2cLaneAdmission(readHfix2cContrastEvidence(out, p), p));
  return true;
}
