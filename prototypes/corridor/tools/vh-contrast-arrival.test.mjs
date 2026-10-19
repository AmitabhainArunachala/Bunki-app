import test from 'node:test';
import assert from 'node:assert/strict';
import { judgeContrastArrival } from './vh-contrast-arrival.mjs';

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
