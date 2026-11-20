import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { judgeContrastArrival, judgeContrastArrivals } from './vh-contrast-arrival.mjs';

const fixture = () => ({
  name: 'read-mini-rise', animationType: 'CSSAnimation', motionPreference: 'no-preference',
  documentId: '4b60dc24-b05a-4546-8341-9b76d7368f06', sameDocument: true,
  timeOrigin: 1000, frameCalibration: { method: 'median-of-12-pre-arrival-raf-intervals', timeOrigin: 1000,
    documentId: '4b60dc24-b05a-4546-8341-9b76d7368f06', sameDocument: true,
    timestamps: Array.from({ length: 13 }, (_, index) => index * 16) },
  startTime: 500, authoredDuration: 220, authoredDelay: 0, authoredEndDelay: 0, authoredIterations: 1, authoredEnd: 220,
  playbackRate: 1, observedAt: 740, rafTime: 733, elapsed: 233, currentTime: 220, opacity: 1, playState: 'finished',
});
test('named natural arrival meets the independent deadline, including the exact boundary', () => {
  const row = fixture();
  assert.deepEqual(judgeContrastArrival(row), { passed: true, errors: [], frameMs: 16, deadlineMs: 236 });
  row.rafTime = 736; row.elapsed = 236;
  assert.equal(judgeContrastArrival(row).passed, true);
});
test('missing, arbitrary opacity, zero-duration and reduced-motion arrivals cannot substitute', () => {
  assert.equal(judgeContrastArrival(null).passed, false);
  for (const mutate of [
    row => { row.missingAnimation = true; },
    row => { row.noAnimation = true; },
    row => { row.name = 'feel-fade'; },
    row => { row.name = 'unrelated-opacity'; },
    row => { row.animationType = 'Animation'; },
    row => { row.authoredDuration = 0; row.authoredEnd = 0; },
    row => { row.motionPreference = 'reduce'; },
  ]) { const row = fixture(); mutate(row); row.completed = true; assert.equal(judgeContrastArrival(row).passed, false); }
});
test('delayed and stalled opacity fail even with a producer claiming completion or a giant final frame', () => {
  for (const mutate of [
    row => { row.rafTime = 736.001; row.elapsed = row.rafTime - row.startTime; },
    row => { row.observedAt = 901; row.rafTime = 900; row.elapsed = 400; row.frameMs = 400; },
    row => { row.opacity = 0.99; },
    row => { row.playState = 'paused'; },
    row => { row.playState = 'running'; },
    row => { row.currentTime = 219; },
    row => { row.playbackRate = 0.5; },
  ]) { const row = fixture(); mutate(row); row.completed = true; assert.equal(judgeContrastArrival(row).passed, false); }
});
test('callback delivery telemetry cannot change the same-timeline animation verdict', () => {
  const row = fixture();
  row.observedAt = 1000;
  assert.equal(judgeContrastArrival(row).passed, true);
  row.rafTime = 900; row.elapsed = 400;
  assert.equal(judgeContrastArrival(row).passed, false);
});
test('late observer start cannot reset the deadline or replace the independent calibration', () => {
  for (const mutate of [
    row => { row.elapsed = 220; },
    row => { delete row.startTime; },
    row => { row.frameCalibration.timestamps = [0, 400]; },
    row => { row.frameCalibration.timestamps[12] = 600; },
    row => { row.frameCalibration.timestamps[4] = row.frameCalibration.timestamps[3]; },
    row => { row.frameCalibration.documentId = '4b60dc24-b05a-4546-8341-9b76d7368f07'; },
    row => { row.sameDocument = false; },
    row => { row.frameCalibration.sameDocument = false; },
    row => { row.authoredEnd = 500; },
    row => { row.rafTime = row.observedAt + 1; },
  ]) { const row = fixture(); mutate(row); assert.equal(judgeContrastArrival(row).passed, false); }
});
test('numeric origin telemetry can vary while actual window/document identity stays proved', () => {
  const row = fixture(); row.frameCalibration.timeOrigin += 2;
  assert.equal(judgeContrastArrival(row).passed, true);
  row.documentId = 'different-document';
  assert.equal(judgeContrastArrival(row).passed, false);
});

const mount = (mountSequence, current, shift = 0) => {
  const row = fixture();
  Object.assign(row, { mountSequence, current, startTime: row.startTime + shift, observedAt: row.observedAt + shift, rafTime: row.rafTime + shift });
  row.elapsed = row.rafTime - row.startTime;
  return row;
};
const healthyPair = () => [mount(0, false), mount(1, true, 300)];
test('every displayed mount is judged: a healthy finished predecessor and a healthy current mount pass', () => {
  assert.equal(judgeContrastArrivals([mount(0, true)]).passed, true);
  const judged = judgeContrastArrivals(healthyPair());
  assert.deepEqual(judged.errors, []);
  assert.deepEqual(judged.mounts.map((item) => [item.mountSequence, item.current, item.passed]), [[0, false, true], [1, true, true]]);
});
test('a missing, wrong, late, stalled or unfinished superseded first mount stays red behind a healthy current mount', () => {
  for (const mutate of [
    (first) => { first.missingAnimation = true; },
    (first) => { delete first.startTime; delete first.elapsed; },
    (first) => { first.name = 'feel-fade'; },
    (first) => { first.rafTime = 736.001; first.elapsed = first.rafTime - first.startTime; },
    (first) => { first.opacity = 0.997243; first.playState = 'running'; first.currentTime = 166.747; first.rafTime = 666.747; first.elapsed = 166.747; },
    (first) => { first.playState = 'running'; },
    (first) => { first.superseded = true; first.supersededBeforeFinish = true; },
    (first) => { first.supersededBeforeFinish = true; },
  ]) {
    const rows = healthyPair(); mutate(rows[0]);
    const judged = judgeContrastArrivals(rows);
    assert.equal(judged.passed, false);
    assert.equal(judged.mounts[0].passed, false); assert.equal(judged.mounts[1].passed, true);
  }
});
test('empty, no-current, two-current, dropped, reordered and foreign-document collections fail', () => {
  for (const rows of [
    [], null, undefined,
    [mount(0, false)],
    [mount(0, true), mount(1, true, 300)],
    [mount(1, true, 300)],
    [mount(1, false), mount(0, true, 300)],
    [mount(0, false), mount(2, true, 300)],
    [{ ...mount(0, false), current: undefined }, mount(1, true, 300)],
  ]) assert.equal(judgeContrastArrivals(rows).passed, false);
  const foreign = healthyPair(); foreign[0].documentId = foreign[0].frameCalibration.documentId = '4b60dc24-b05a-4546-8341-9b76d7368f07';
  assert.equal(judgeContrastArrivals(foreign).passed, false);
  const recalibrated = healthyPair(); recalibrated[1].frameCalibration = { ...recalibrated[1].frameCalibration, timestamps: recalibrated[1].frameCalibration.timestamps.map((stamp) => stamp * 2) };
  assert.equal(judgeContrastArrival(recalibrated[1]).passed, true);
  assert.equal(judgeContrastArrivals(recalibrated).passed, false);
});
test('retained real Hokusai/keyblock receipts are re-adjudicated red because their first displayed mount never finished', () => {
  const { retained } = JSON.parse(readFileSync(new URL('./vh-contrast-arrival-retained.json', import.meta.url), 'utf8'));
  assert.deepEqual(retained.map(({ rowId, file, sha256 }) => [rowId, file.split('/VH1/')[1], sha256]), [
    ['chromium/hokusai/fresh-demo.arrival', 'visual/final-arrival-document-chromium/contrast-sweep.json', '827adfca1df834fe4e4b088500f3da6f35fb188f146b30c06e934b508f172083'],
    ['webkit/keyblock/fresh-demo.arrival', 'visual/final-arrival-document-webkit/contrast-sweep.json', '2719128a828330d15aba71902bdb3ebc0ca4d0fdc4ddc8080bb66523db3e9fe0'],
  ]);
  for (const { observed, producerRowOk } of retained) {
    assert.equal(producerRowOk, true);
    assert.deepEqual(observed.map((row) => [row.current, row.superseded === true, row.playState]), [[false, true, 'running'], [true, false, 'finished']]);
    assert.equal(judgeContrastArrivals(observed).passed, false);
    const sequenced = observed.map((row, mountSequence) => ({ ...row, mountSequence }));
    const judged = judgeContrastArrivals(sequenced);
    assert.equal(judged.passed, false);
    assert.deepEqual(judged.mounts.map((item) => item.passed), [false, true]);
    assert(judged.mounts[0].errors.includes('Arrival did not finish at full opacity'));
    assert.equal(judgeContrastArrivals([{ ...observed[1], mountSequence: 0 }]).passed, true, 'only the current mount was what the old producer judged');
  }
});
