/** Exact unit gate for the living brush's public stroke-number clock. */

import assert from 'node:assert/strict';

import { makeWriterFor } from '../corridor-ink.js';

const stroke = {
  dur: 100,
  L: 100,
  type: 'sweep',
  medPts: [
    [0, 0],
    [100, 0],
  ],
  cum: [0, 100],
};
const writer = makeWriterFor([stroke, stroke]);

writer.start(0);
assert.equal(writer.advance(599).beginStroke, null, 'stroke 1 must not announce in lead-in');
const first = writer.advance(600);
assert.equal(first.beginStroke, 0, 'stroke 1 announces on its first sampling tick');
assert.ok(first.splats.length > 0, 'stroke 1 announcement shares a tick with real ink');

writer.advance(700);
assert.equal(writer.advance(960).beginStroke, null, 'stroke 2 must not announce at scheduling');
assert.equal(writer.advance(1079).beginStroke, null, 'stroke 2 must stay quiet through its gap');
const second = writer.advance(1080);
assert.equal(second.beginStroke, 1, 'stroke 2 announces on its first sampling tick');
assert.ok(second.splats.length > 0, 'stroke 2 announcement shares a tick with real ink');

process.stdout.write('writing-room brush clock verified: 2 first-splat callbacks\n');
