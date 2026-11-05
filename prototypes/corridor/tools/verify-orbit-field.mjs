#!/usr/bin/env node
// verify-orbit-field.mjs — behavioural probe of prototypes/corridor/modules/orbit-field.mjs (G2 assertion [5]: the Meguri
// mechanics are present as the corridor's own module; nothing of the standalone UI is). Exit 0 only when every check passes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as O from '../modules/orbit-field.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const results = [];
const check = (id, fn) => { try { results.push({ id, pass: true, detail: fn() }); } catch (e) { results.push({ id, pass: false, error: e.message.split('\n')[0] }); } };
const WORDS = [{ w: '関与', g: 'mind' }, { w: '企画', g: 'ai' }, { w: '態勢', g: 'history' }, { w: '結束', g: 'language' }, { w: '移行', g: 'india' }, { w: '連日', g: 'mind' }];

check('O1 geometry: ringPoint is a tilted ellipse scaled by depth', () => {
  const r = { cx: 100, cy: 200, rx: 50, ry: 20, tilt: 0 };
  const p0 = O.ringPoint(r, 0); assert.ok(Math.abs(p0.x - 150) < 1e-9 && Math.abs(p0.y - 200) < 1e-9);
  const p1 = O.ringPoint(r, Math.PI / 2); assert.ok(Math.abs(p1.x - 100) < 1e-9 && Math.abs(p1.y - 220) < 1e-9);
  const q = O.ringPoint({ ...r, tilt: Math.PI / 2 }, 0); assert.ok(Math.abs(q.x - 100) < 1e-9 && Math.abs(q.y - 250) < 1e-9, 'tilt rotates the ellipse');
  const h = O.ringPoint(r, 0, .5); assert.ok(Math.abs(h.x - 125) < 1e-9, 'depth k scales the radius');
  return 'untilted, tilted and scaled points land where the ellipse puts them';
});
check('O2 rings: five rings, one per group, normalised to the field, phases kept across resize', () => {
  const f = O.createOrbitField({ words: WORDS, width: 400, height: 800 });
  assert.equal(f.rings.length, 5); assert.deepEqual(f.rings.map((r) => r.g), O.GROUPS);
  assert.ok(Math.abs(f.rings[0].cx - 200) < 1e-9 && Math.abs(f.rings[0].cy - 320) < 1e-9 && Math.abs(f.rings[0].rx - 176) < 1e-9);
  const phis = f.rings.map((r) => r.phi); O.resizeOrbitField(f, 800, 1600);
  assert.deepEqual(f.rings.map((r) => r.phi), phis); assert.ok(Math.abs(f.rings[0].cx - 400) < 1e-9);
  return 'geometry scales with the field; playhead phases survive a resize';
});
check('O3 seeding: deterministic per seed; a station sits on its group ring at a spread, jittered angle', () => {
  const a = O.createOrbitField({ words: WORDS }), b = O.createOrbitField({ words: WORDS });
  assert.deepEqual(a.stations.map((s) => s.t), b.stations.map((s) => s.t));
  const c = O.createOrbitField({ words: WORDS, seed: 7 }); assert.notDeepEqual(c.stations.map((s) => s.t), a.stations.map((s) => s.t));
  for (const s of a.stations) { assert.equal(s.ring, O.GROUPS.indexOf(s.g)); assert.ok(s.t > 0 && s.t < O.TAU + 2); }
  const mind = a.stations.filter((s) => s.g === 'mind'); assert.equal(mind.length, 2); assert.ok(Math.abs(Math.abs(mind[0].t - mind[1].t) - Math.PI) < .25, 'two words on one ring sit half a turn apart (± jitter)');
  return 'the same seed gives the same field; another seed another; stations are spread on their ring';
});
check('O4 depth: no passes = the ring itself; eight passes = .55; monotone; a pass pulls and the position eases 6 % per step', () => {
  assert.equal(O.depthK(0), 1); assert.ok(Math.abs(O.depthK(8) - .55) < 1e-12); assert.ok(Math.abs(O.depthK(100) - .55) < 1e-12);
  for (let p = 0; p < 12; p++) assert.ok(O.depthK(p + 1) <= O.depthK(p));
  const f = O.createOrbitField({ words: WORDS }); const s = f.stations[0]; assert.equal(s.k, 1);
  O.recordPass(f, s); assert.equal(f.passes[s.w.w], 1); assert.ok(Math.abs(s.kT - O.depthK(1)) < 1e-12);
  O.advanceOrbitField(f, 0, { playing: false }); assert.ok(Math.abs((1 - s.k) - .06 * (1 - s.kT)) < 1e-9, 'one step closes 6 % of the gap');
  const g = O.createOrbitField({ words: WORDS, passes: { '関与': 4 } }); const t = g.stations.find((x) => x.w.w === '関与'); assert.ok(Math.abs(t.k - O.depthK(4)) < 1e-12, 'a field created with passes starts at its depth');
  return 'depthK(0)=1, depthK(8)=.55, monotone; recordPass pulls; placeStations eases .06';
});
check('O5 crossing: over one full period at 72 bpm every station on the ring fires exactly once; stopped, nothing fires', () => {
  const f = O.createOrbitField({ words: WORDS }); const ring = f.rings[4]; // mind: period 26 s, two stations
  const steps = Math.round(ring.period / O.DT_MAX); const counts = {};   // exactly one period
  for (let i = 0; i < steps; i++) for (const s of O.advanceOrbitField(f, O.DT_MAX, { playing: true, bpm: 72, grow: false })) counts[s.w.w] = (counts[s.w.w] || 0) + 1;
  for (const s of f.stations.filter((x) => x.ring === 4)) assert.equal(counts[s.w.w], 1, `${s.w.w} fires once per period`);
  const g = O.createOrbitField({ words: WORDS }); let n = 0;
  for (let i = 0; i < 400; i++) n += O.advanceOrbitField(g, .05, { playing: false }).length; assert.equal(n, 0);
  const h = O.createOrbitField({ words: WORDS }); const before = h.rings.map((r) => r.phi);
  O.advanceOrbitField(h, 1, { playing: true }); // dt is clamped to DT_MAX
  h.rings.forEach((r, i) => assert.ok(Math.abs(O.normalise(r.phi - before[i]) - O.DT_MAX * O.TAU / r.period) < 1e-9, 'the clock never jumps more than .05 s'));
  return 'one fire per station per period; none when stopped; dt clamped at .05 s';
});
check('O6 grow + tempo: a crossing records a pass and pulls the station; 144 bpm runs the playhead twice as fast', () => {
  const f = O.createOrbitField({ words: WORDS }); const ring = f.rings[3]; // language: period 10 s, one station
  const st = f.stations.find((s) => s.ring === 3); let fired = 0;
  for (let i = 0; i < Math.round(ring.period / O.DT_MAX); i++) fired += O.advanceOrbitField(f, O.DT_MAX, { playing: true, grow: true }).filter((s) => s.ring === 3).length;
  assert.equal(fired, 1); assert.equal(f.passes[st.w.w], 1); assert.ok(st.kT < 1 && st.k < 1);
  const slow = O.createOrbitField({ words: WORDS }), fast = O.createOrbitField({ words: WORDS });
  O.advanceOrbitField(slow, .05, { bpm: 72 }); O.advanceOrbitField(fast, .05, { bpm: 144 });
  const d0 = O.normalise(slow.rings[1].phi - ((1 * 1.37) % O.TAU)), d1 = O.normalise(fast.rings[1].phi - ((1 * 1.37) % O.TAU));
  assert.ok(Math.abs(d1 - 2 * d0) < 1e-9, 'double tempo, double advance');
  return 'a crossing is a pass; tempo scales the playhead';
});
check('O6b debounce + manual: a station fires at most once per 400 ms of field time; a manual tap fires but never grows', () => {
  const f = O.createOrbitField({ words: WORDS }); const s = f.stations[0];
  assert.deepEqual(O.fireStation(f, s, { manual: true }), { fired: true, grew: false }); assert.equal(O.passesOf(f, s), 0, 'a manual tap is not a pass');
  assert.deepEqual(O.fireStation(f, s), { fired: false, grew: false }, 'refused inside 400 ms');
  for (let i = 0; i < 8; i++) O.advanceOrbitField(f, .05, { playing: false });   // 400 ms of field time
  assert.deepEqual(O.fireStation(f, s), { fired: true, grew: true }); assert.equal(O.passesOf(f, s), 1);
  assert.deepEqual(O.fireStation(f, s, { grow: false }), { fired: false, grew: false });
  return 'fire(s, manual): 400 ms debounce on the field clock; manual never grows';
});
check('O6c long gap: the debounce runs on raw time while physics stays capped — a 1 s stopped frame allows the next manual fire and moves a ring by only .05 s', () => {
  const f = O.createOrbitField({ words: WORDS }); const s = f.stations[0]; const phi0 = f.rings.map((r) => r.phi);
  assert.deepEqual(O.fireStation(f, s, { manual: true }), { fired: true, grew: false }, 'first fire always allowed (last = -Infinity)');
  O.advanceOrbitField(f, 1, { playing: true });   // a 1 s frame gap
  assert.ok(Math.abs(f.timeMs - 1000) < 1e-9, 'the field clock took the raw second');
  f.rings.forEach((r, i) => assert.ok(Math.abs(O.normalise(r.phi - phi0[i]) - O.DT_MAX * O.TAU / r.period) < 1e-9, 'physics advanced by the capped .05 s'));
  assert.deepEqual(O.fireStation(f, s, { manual: true }), { fired: true, grew: false }, 'the next fire is allowed after a real second');
  assert.equal(O.passesOf(f, s), 0, 'manual fires never grow');
  const g = O.createOrbitField({ words: WORDS }); O.advanceOrbitField(g, -3, { playing: false }); assert.equal(g.timeMs, 0, 'a negative dt is ignored'); 
  return 'raw time feeds the 400 ms window; the ring step is still capped at .05 s';
});
check('O7 drift: odd rings turn forward, even rings back, at .012 rad/s; angles stay normalised', () => {
  const f = O.createOrbitField({ words: WORDS }); const t0 = f.stations.map((s) => s.t);
  O.advanceOrbitField(f, .05, { playing: false, drift: true });
  f.stations.forEach((s, i) => assert.ok(Math.abs(O.normalise(s.t - t0[i] - .05 * O.DRIFT * (s.ring % 2 ? 1 : -1))) < 1e-9 || Math.abs(O.normalise(s.t - t0[i] - .05 * O.DRIFT * (s.ring % 2 ? 1 : -1)) - O.TAU) < 1e-9));
  for (const s of f.stations) assert.ok(s.t >= 0 && s.t < O.TAU);
  return 'drift moves each station by .012·dt with its ring parity, normalised';
});
check('O8 purity: the module names no DOM, audio, storage or timer; it exports only mechanics', () => {
  const src = readFileSync(join(HERE, '..', 'modules', 'orbit-field.mjs'), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const bad of ['document', 'window', 'localStorage', 'AudioContext', 'requestAnimationFrame', 'setTimeout', 'performance.now', 'speechSynthesis', 'posters', 'MEGURI_']) assert.ok(!src.includes(bad), `no ${bad}`);
  const names = Object.keys(O).sort();
  assert.deepEqual(names, ['DEBOUNCE_MS', 'DEPTH_FULL', 'DEPTH_PULL', 'DRIFT', 'DT_MAX', 'EASE', 'GROUPS', 'RING_DEF', 'SEED', 'TAU', 'advanceOrbitField', 'createOrbitField', 'depthK', 'fireStation', 'layoutRings', 'mulberry32', 'normalise', 'passesOf', 'placeStations', 'recordPass', 'resizeOrbitField', 'ringPoint', 'syncDepth']);
  return 'pure module, mechanics-only surface';
});

for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id}${r.pass ? ' — ' + r.detail : ' — ' + r.error}`);
const passed = results.filter((r) => r.pass).length;
console.log(`${passed}/${results.length} checks · ${passed === results.length ? 'passed' : 'failed'}`);
process.exit(passed === results.length ? 0 : 1);
