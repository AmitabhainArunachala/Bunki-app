/** FIXR a0 (W2 1046, lead 1048, W2 1051) · the entity-tail rule of looksClipped: the extractor's
 * cut inside an HTML entity is repaired; an ordinary ampersand, a legitimate ampersand tail and
 * a complete entity are never called clipped. Pure unit probes, no DOM, no browser:
 * node prototypes/corridor/tools/test-gloss-text.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CLIP_CAP, looksClipped, tidyGloss } from './gloss-text.mjs';
import { installOracle, repairedGloss } from './repair-drift-glosses.mjs';

installOracle();
const capWith = (body) => `${'x'.repeat(CLIP_CAP - 2 - body.length)}, ${body}`;

test('positive: a 32-character cut inside an HTML entity is clipped and repaired from words.json', () => {
  const clipped = 'to protect someone, to&nbsp;&nbs'; // 庇う's row: the cut lands inside &nbsp;
  assert.equal(clipped.length, CLIP_CAP);
  assert.equal(looksClipped(clipped), true);
  const words = { 庇う: { g: 'to protect (someone), to look after (e.g. an injured leg), to defend' } };
  const repaired = repairedGloss('庇う', clipped, words);
  assert.equal(repaired, 'to protect (someone), to look after (e.g. an injured leg), to defend');
  assert.equal(looksClipped(repaired), false);
});

test('negative: ampersand abbreviations are never clipped (W2 1046)', () => {
  for (const whole of ['R&D', 'R&B', 'AT&T', 'Q&A', 'P&L', 'M&A']) {
    assert.equal(looksClipped(whole), false, whole);
    assert.equal(tidyGloss(whole), whole, whole);
  }
});

test('negative: legitimate ampersand tails at exactly the cap are not clipped (W2 1051)', () => {
  for (const tail of ['fish&chips', 'rock&roll']) {
    const s = capWith(tail);
    assert.equal(s.length, CLIP_CAP, s);
    assert.equal(looksClipped(s), false, s);
  }
});

test('negative: a string ending in a complete &amp; entity is not clipped, short or at the cap', () => {
  assert.equal(looksClipped('to eat fish &amp; chips &amp;'), false);
  const s = capWith('&amp;');
  assert.equal(s.length, CLIP_CAP, s);
  assert.equal(looksClipped(s), false, s);
});

test('negative: a 32-character string with a mid & ending on a word boundary is not clipped', () => {
  const s = capWith('to sing & dance at night');
  assert.equal(s.length, CLIP_CAP, s);
  assert.equal(looksClipped(s), false, s);
});

test('a repair never writes an empty gloss', () => {
  assert.notEqual(repairedGloss('missing-headword', 'to take up, to pick up; to confi', {}), '');
});
