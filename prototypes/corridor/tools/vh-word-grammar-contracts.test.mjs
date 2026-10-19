import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { grammarSelection, grammarWalkNames, grammarControlSpec, foldGeometryEqual, foldShiftBites, grammarAcceptance, grammarControlRows, grammarControlVerdicts, sharedHoverDiverges, WG_CANDIDATE_ROSTER, WG_CONTROL_EVIDENCE } from './vh-word-grammar-contracts.mjs';
import { grammarFixture, sha } from './vh-word-grammar-fixture.mjs';
const geometry = x => [{ id: 'p1', top: x, height: 24, tokens: [{ id: '76', left: 4, top: 9 }] }];
test('WG-1 raw boundary rejects old rounded false green and malformed observations', () => {
  assert.equal(foldGeometryEqual(geometry(10.51), geometry(12.49)), false);
  assert.equal(foldGeometryEqual(geometry(10.49), geometry(11.49)), false);
  assert.equal(foldGeometryEqual(geometry(10.49), geometry(11.48)), true);
  assert.equal(foldGeometryEqual([], []), false);
  assert.equal(foldGeometryEqual(geometry(NaN), geometry(0)), false);
  const other = geometry(0); other[0].tokens[0].id = '77';
  assert.equal(foldGeometryEqual(geometry(0), other), false);
});
test('unknown, duplicate, incomplete and conflicting schedules fail before launch', () => {
  for (const args of [['--typo'], ['--controls', '--controls'], ['--g2-control'], ['--g2-control', 'unknown'], ['--g3-only','--g5-only']])
    assert.throws(() => grammarSelection(args));
  assert.equal(grammarSelection(['--controls']).fullRequested, true);
  for (const flag of ['--g1-only','--g2-only','--g3-only','--g4-only','--g5-only','--g6-only','--controls-only'])
    assert.equal(grammarSelection(['--controls', flag]).fullRequested, false);
});
const clean = () => grammarFixture();
test('full admission rejects omission of every slice, duplicate rows and partial promotion', () => {
  assert.equal(grammarAcceptance(clean()).fullAcceptance, true);
  for (const slice of ['G1','G2','G3','G4','G5','G6']) {
    const c = clean(); c.rows = c.rows.filter(r => !r.id.includes(`/${slice}.`));
    assert.equal(grammarAcceptance(c).fullAcceptance, false, slice);
  }
  const omitted = clean(); omitted.walks.pop(); assert.equal(grammarAcceptance(omitted).fullAcceptance, false);
  const dupe = clean(); dupe.rows[1] = dupe.rows[0]; assert.equal(grammarAcceptance(dupe).fullAcceptance, false);
  const partial = clean(); partial.argv = ['--g5-only','--controls'];
  assert.equal(grammarAcceptance(partial).fullAcceptance, false);
  const bad = clean(); bad.rows[0].ok = false; assert.equal(grammarAcceptance(bad).fullAcceptance, false);
});

test('full admission rejects control-only fabricated green and wrong candidate provenance',()=>{
 const only=clean();only.rows=only.rows.filter(row=>row.phase==='control');
 assert.equal(grammarAcceptance(only).selectedPassed,true);
 assert.equal(grammarAcceptance(only).fullAcceptance,false);
 for(const mutate of [
  row=>delete row.phase,row=>delete row.walk,row=>row.phase='restore:renamed-candidate',
  row=>row.walk='another-walk',row=>row.id='chromium/unknown-assertion',row=>row.ok=false
 ]){const value=clean();mutate(value.rows[0]);assert.equal(grammarAcceptance(value).fullAcceptance,false);}
 const dupe=clean();dupe.rows[1]={...dupe.rows[0]};assert.equal(grammarAcceptance(dupe).fullAcceptance,false);
 const extra=clean();extra.rows.push({id:'chromium/not-reviewed',phase:'control',walk:null,ok:true});assert.equal(grammarAcceptance(extra).fullAcceptance,false);
 const mislabel=clean();mislabel.rows.find(row=>row.phase==='control').phase='candidate';assert.equal(grammarAcceptance(mislabel).fullAcceptance,false);
});
test('every normal and G6 walk independently requires its candidate assertions',()=>{
 for(const engine of ['chromium','webkit'])for(const [walk,ids]of Object.entries(WG_CANDIDATE_ROSTER[engine])){
  const missing=clean();const id=`${engine}/${ids[0]}`;
  missing.rows=missing.rows.filter(row=>!(row.phase==='candidate'&&row.walk===walk&&row.id===id));
  assert.equal(grammarAcceptance(missing).fullAcceptance,false,`${engine}/${walk}`);
 }
});
test('engine-specific candidate obligations and diagnostic status remain honest',()=>{
 const c=grammarFixture(['chromium']);
 assert.equal(grammarAcceptance(c).fullAcceptance,true);
 const missingNative={...c,rows:c.rows.filter(row=>!row.walk?.startsWith('G6.sky.native.'))};assert.equal(grammarAcceptance(missingNative).fullAcceptance,false);
 const diagnostic={...c,argv:['--controls','--g3-only'],rows:c.rows.filter(row=>row.id.includes('/G3.')),walks:c.walks.filter(row=>row.name.startsWith('G3'))};
 assert.equal(grammarAcceptance(diagnostic).selectedPassed,true);assert.equal(grammarAcceptance(diagnostic).fullAcceptance,false);
 const restored=clean();restored.rows.push({...restored.rows[0],phase:'restore:reviewed-control'});assert.equal(grammarAcceptance(restored).fullAcceptance,true);
});

const rejects = (value, id) => {
  const result = grammarAcceptance(value);
  assert.equal(result.fullAcceptance, false);
  if (id) assert.ok(result.unverifiedControls.includes(id), `${id} not re-adjudicated`);
};
const control = (value, engine, id) => value.controls.find(row => row.engine === engine && row.id === id);
test('every declared control row has exactly one independent evidence obligation whose kills are reviewed candidate rows', () => {
  for (const engine of ['chromium', 'webkit']) {
    const local = grammarControlRows(engine).map(id => id.slice(engine.length + 1));
    assert.deepEqual(local.filter(id => !WG_CONTROL_EVIDENCE[id]), []);
    for (const id of local) {
      const spec = grammarControlSpec(engine, id);
      if (spec.kind !== 'served-edit' || spec.local) continue;
      for (const kill of spec.kills) assert.ok(Object.values(WG_CANDIDATE_ROSTER[engine]).some(ids => ids.includes(kill)), `${engine}/${id}: ${kill}`);
    }
  }
  const c = clean(); assert.equal(grammarAcceptance(c).controlsVerified, true); assert.deepEqual(grammarAcceptance(c).unverifiedControls, []);
});
test('fullRequested is recomputed from the invocation argv, never read from a receipt scope', () => {
  const c = clean(); c.selection = { fullRequested: true }; c.argv = ['--controls', '--g4-only'];
  assert.equal(grammarAcceptance(c).fullAcceptance, false);
  const missing = clean(); delete missing.argv; assert.throws(() => grammarAcceptance(missing));
  const typo = clean(); typo.argv = ['--controls', '--every-thing']; assert.throws(() => grammarAcceptance(typo));
});
test('a passing control row without its evidence record, or with a stale or foreign record, is rejected', () => {
  const missing = clean(); missing.controls = missing.controls.filter(row => !(row.engine === 'chromium' && row.id === 'stalled-second'));
  rejects(missing, 'chromium/G3.negative.stalled-second');
  const none = clean(); delete none.controls; rejects(none, 'webkit/G1.negative.page-capped');
  const foreign = clean(); control(foreign, 'webkit', 'missing-final-stroke').engine = 'chromium';
  rejects(foreign, 'webkit/G4.negative.missing-final-stroke'); rejects(foreign, 'chromium/G4.negative.missing-final-stroke');
  const duplicate = clean(); duplicate.controls.push(structuredClone(control(duplicate, 'chromium', 'G2.tap-schedules')));
  rejects(duplicate, 'chromium/G2.negative.tap-schedules');
  const staleArtifact = clean(); control(staleArtifact, 'chromium', 'G6.touch.missing-reverse').served[0].baseSha256 = sha('older corridor.js');
  rejects(staleArtifact, 'chromium/G6.touch.negative.missing-reverse');
  const noManifest = clean(); delete noManifest.runtimeFiles; rejects(noManifest, 'chromium/G1.negative.scrim-appended');
  const staleBaseline = clean(); control(staleBaseline, 'chromium', 'G1.page-capped').baseline.pop();
  rejects(staleBaseline, 'chromium/G1.negative.page-capped');
  const reran = clean(); const scrim = control(reran, 'webkit', 'G1.scrim-appended'); scrim.rows = scrim.rows.map(row => ({ ...row, phase: 'candidate' }));
  rejects(reran, 'webkit/G1.negative.scrim-appended');
  const otherHover = clean(); control(otherHover, 'chromium', 'G5.room-keep-hover').baseline = { ...control(otherHover, 'chromium', 'G5.room-keep-hover').baseline, note: 'older sample' };
  rejects(otherHover, 'chromium/G5.negative.room-keep-hover');
  const otherFold = clean(); control(otherFold, 'webkit', 'fold-shift-one-pixel').baseline = [{ id: 'p1', top: 10.3, height: 24, tokens: [{ id: '76', left: 4, top: 11.3 }] }];
  rejects(otherFold, 'webkit/G5.negative.fold-shift-one-pixel');
});
test('a control marked killed whose restore failed, or whose fault never bit its named assertion, is rejected', () => {
  const restoreError = clean(); control(restoreError, 'chromium', 'second-hold-unkeeps').restore[0].ok = false;
  rejects(restoreError, 'chromium/G5.negative.second-hold-unkeeps');
  const g6Restore = clean(); control(g6Restore, 'webkit', 'G6.keyboard.lost-return-line').restore[1].ok = false;
  rejects(g6Restore, 'webkit/G6.keyboard.negative.lost-return-line');
  const lostRestore = clean(); control(lostRestore, 'chromium', 'G2.reading-check-dropped').restore.pop();
  rejects(lostRestore, 'chromium/G2.negative.reading-check-dropped');
  const foldRestore = clean(); control(foldRestore, 'chromium', 'fold-shift-one-quarter-over').restore = [{ id: 'p1', top: 11.5, height: 24, tokens: [{ id: '76', left: 4, top: 12.5 }] }];
  rejects(foldRestore, 'chromium/G5.negative.fold-shift-one-quarter-over');
  const scrolled = clean(); control(scrolled, 'chromium', 'fold-shift-one-pixel').afterScroll = [0, 121];
  rejects(scrolled, 'chromium/G5.negative.fold-shift-one-pixel');
  const hoverRestore = clean(); control(hoverRestore, 'webkit', 'G5.room-keep-hover').restore.peer.background = 'rgb(9, 9, 9)';
  rejects(hoverRestore, 'webkit/G5.negative.room-keep-hover');
  const survived = clean(); const front = control(survived, 'chromium', 'front-door'); front.rows = front.rows.map(row => ({ ...row, ok: true }));
  rejects(survived, 'chromium/G3.negative.front-door');
  const halfKill = clean(); const ghost = control(halfKill, 'webkit', 'empty-first-board'); ghost.rows.find(row => row.id === 'webkit/G4.ghost.first-pixels').ok = true;
  rejects(halfKill, 'webkit/G4.negative.empty-first-board');
  const contaminated = clean(); const glyph = control(contaminated, 'chromium', 'glyph-z-dropped');
  glyph.rows.find(row => row.ok && row.id !== 'chromium/G3.sky-ownership.centre').ok = false;
  rejects(contaminated, 'chromium/G3.negative.glyph-z-dropped');
  const notShifted = clean(); control(notShifted, 'webkit', 'fold-shift-one-pixel').shifted = control(notShifted, 'webkit', 'fold-shift-one-pixel').baseline;
  rejects(notShifted, 'webkit/G5.negative.fold-shift-one-pixel');
  const wrongAmount = clean(); control(wrongAmount, 'webkit', 'fold-shift-one-quarter-over').amount = 3;
  rejects(wrongAmount, 'webkit/G5.negative.fold-shift-one-quarter-over');
  const notMutated = clean(); control(notMutated, 'chromium', 'G5.room-keep-hover').mutant = control(notMutated, 'chromium', 'G5.room-keep-hover').restore;
  rejects(notMutated, 'chromium/G5.negative.room-keep-hover');
});
test('served edits, setup errors and verdicts are re-read rather than trusted', () => {
  const unapplied = clean(); control(unapplied, 'chromium', 'G6.touch.invented-fresh-source').served[0].applied = [];
  rejects(unapplied, 'chromium/G6.touch.negative.invented-fresh-source');
  const unserved = clean(); control(unserved, 'webkit', 'writing-blocks-tap').served = [];
  rejects(unserved, 'webkit/G4.negative.writing-blocks-tap');
  const identity = clean(); const same = control(identity, 'chromium', 'ruby-survives-back').served[0]; same.mutantSha256 = same.baseSha256;
  rejects(identity, 'chromium/G3.negative.ruby-survives-back');
  const setup = clean(); control(setup, 'webkit', 'G2.reading-check-dropped').setupError = 'corridor.js: edit matched 0 times';
  rejects(setup, 'webkit/G2.negative.reading-check-dropped');
  const pageError = clean(); control(pageError, 'chromium', 'layer-stays-open').pageErrors = ['TypeError'];
  rejects(pageError, 'chromium/G5.negative.layer-stays-open');
  const verdict = clean(); control(verdict, 'webkit', 'G1.word-not-travelling').verdict = 'contaminated';
  rejects(verdict, 'webkit/G1.negative.word-not-travelling');
});

const observedG6 = JSON.parse(readFileSync(new URL('./vh-g6-observed-controls.json', import.meta.url), 'utf8'));
const g6Spec = value => Object.entries(WG_CONTROL_EVIDENCE).find(([, spec]) => spec.local && spec.control === value.id);
const g6Primary = (value, phase = 'rows') => value[phase].find(row => row.id === g6Spec(value)[1].kills[0]);
function observedG6Verdict(value) {
  const [suffix] = g6Spec(value), id = `${value.engine}/${suffix}`;
  return grammarControlVerdicts({ engines: [value.engine], rows: [], controls: [value], runtimeFiles: observedG6.runtimeFiles }).find(row => row.id === id).ok;
}
test('all 22 exact retained G6 controls remain admissible as controls, without claiming full acceptance', () => {
  assert.equal(observedG6.controls.length, 22);
  assert.match(observedG6.provenance.receiptSha256, /^[a-f0-9]{64}$/u);
  assert.match(observedG6.provenance.artifactSha256, /^[a-f0-9]{64}$/u);
  for (const [engine, count] of [['chromium', 13], ['webkit', 9]]) {
    const records = observedG6.controls.filter(row => row.engine === engine);
    assert.equal(records.length, count);
    assert.deepEqual(records.map(row => `${engine}/${g6Spec(row)[0]}`).sort(), grammarControlRows(engine).filter(id => id.includes('/G6.')).sort());
    for (const value of records) assert.equal(observedG6Verdict(value), true, `${engine}/${value.id}`);
  }
});
test('all 66 reproduced G6 false accepts now reject console errors, missing and unexecuted primary observations', () => {
  let rejected = 0;
  for (const original of observedG6.controls) for (const mutate of [
    c => { c.consoleErrors = ['Synthetic setup console error']; },
    c => { delete g6Primary(c).observed; },
    c => { g6Primary(c).observed = { unexecuted: true, harnessError: 'Synthetic skipped primary witness' }; },
  ]) {
    const value = structuredClone(original); mutate(value);
    assert.equal(observedG6Verdict(value), false, `${value.engine}/${value.id}`); rejected++;
  }
  assert.equal(rejected, 66);
});
test('G6 all three phases reject absent primary samples and harness failures on any scheduled row', () => {
  for (const original of observedG6.controls) {
    for (const phase of ['baseline', 'rows', 'restore']) for (const mutate of [
      c => { g6Primary(c, phase).observed = null; },
      c => { g6Primary(c, phase).observed = []; },
      c => { g6Primary(c, phase).observed.unexecuted = true; },
      c => { c[phase].at(-1).observed = { harnessError: 'setup timed out before this observation' }; },
    ]) {
      const value = structuredClone(original); mutate(value);
      assert.equal(observedG6Verdict(value), false, `${value.engine}/${value.id}/${phase}`);
    }
    for (const field of ['pageErrors', 'consoleErrors']) for (const bad of [undefined, null, {}, 'error', ['error']]) {
      const value = structuredClone(original); value[field] = bad;
      assert.equal(observedG6Verdict(value), false, `${value.engine}/${value.id}/${field}`);
    }
  }
});
test('G6 synthetic and native input execution is recomputed from primary observations in every phase', () => {
  for (const original of observedG6.controls) {
    const name = original.id.split('.').at(-1);
    const synthetic = ['captured-text-pinch', 'touchmove-cancel'].includes(name);
    const native = ['late-bubble-pointer', 'touchmove-cancel-native'].includes(name);
    if (!synthetic && !native) continue;
    const mutations = synthetic ? [
      o => { o.events.pop(); },
      o => { o.events[0].id = 999; },
      o => { o.events[0].afterDispatch = false; },
      o => { o.events[0].accepted = !o.events[0].accepted; },
      o => { o.touch.events.pop(); },
      o => { o.touch.error = 'TouchEvent unavailable'; },
      o => { o.pointerAfter.stamp = 'foreign page'; },
      o => { delete o.before.node; delete o.pointerAfter.node; delete o.after.node; },
    ] : [
      o => { o.commands.pop(); },
      o => { o.commands[0].completed = false; },
      o => { o.events = o.events.filter(e => !['pointerup', 'pointercancel'].includes(e.type)); },
      o => { o.events = o.events.filter(e => e.family !== 'touch' || !['touchend', 'touchcancel'].includes(e.type)); },
      o => { o.events[0].trusted = false; },
      o => { o.events[0].stamp = 'foreign page'; },
      o => { o.inputError = 'CDP command failed'; },
      o => { o.inventory.remaining = 1; },
      o => { delete o.before.node; delete o.after.node; },
    ];
    for (const phase of ['baseline', 'rows', 'restore']) for (const mutate of mutations) {
      const value = structuredClone(original), sample = g6Primary(value, phase).observed;
      // A forged passing summary cannot override a missing command, event, or context.
      sample.inputIntegrity = { ok: true }; mutate(sample);
      assert.equal(observedG6Verdict(value), false, `${value.engine}/${value.id}/${phase}`);
    }
  }
});
test('G6 each fault must demonstrate its own named witness, including same-token and no-ref premises', () => {
  for (const original of observedG6.controls) {
    const name = original.id.split('.').at(-1), value = structuredClone(original), sample = g6Primary(value).observed;
    switch (name) {
      case 'missing-reverse': sample.arrived = true; break;
      case 'captured-text-pinch': for (const e of sample.events) { e.defaultPrevented = false; e.accepted = true; } break;
      case 'lost-return-line': sample.current.index = 'different token'; break;
      case 'late-bubble-pointer': sample.faults.latePointer = 0; break;
      case 'touchmove-cancel':
      case 'touchmove-cancel-native': sample.faults.touchmove = 0; break;
      case 'invented-fresh-source': sample.branch = 'has-ref'; break;
      default: assert.fail(`Unknown fixture control: ${name}`);
    }
    assert.equal(observedG6Verdict(value), false, `${value.engine}/${value.id}`);
    if (name === 'lost-return-line') for (const delta of [4, NaN, Infinity, '80']) {
      const broken = structuredClone(original); g6Primary(broken).observed.delta = delta;
      assert.equal(observedG6Verdict(broken), false);
    }
    if (name === 'invented-fresh-source') {
      const broken = structuredClone(original); g6Primary(broken, 'baseline').observed.branch = 'has-ref';
      assert.equal(observedG6Verdict(broken), false);
    }
  }
});

test('a fold-shift or shared-hover control whose mutant sample is absent or incomplete is rejected at admission', () => {
  for (const mutate of [c => { delete c.shifted; }, c => { c.shifted = []; }]) {
    const value = clean(); mutate(control(value, 'chromium', 'fold-shift-one-pixel'));
    rejects(value, 'chromium/G5.negative.fold-shift-one-pixel');
  }
  const noPeer = clean(); delete control(noPeer, 'webkit', 'G5.room-keep-hover').mutant.peer;
  rejects(noPeer, 'webkit/G5.negative.room-keep-hover');
});

const observedG5 = JSON.parse(readFileSync(new URL('./vh-g5-observed-controls.json', import.meta.url), 'utf8'));
const g5Control = (engine, id) => structuredClone(observedG5.engines[engine].controls.find(row => row.id === id));
const g5Plain = engine => observedG5.engines[engine].candidates.find(row => row.id === `${engine}/G5.layers.bare-again`).observed.plain;
function observedG5Verdict(engine, value) {
  const [suffix] = Object.entries(WG_CONTROL_EVIDENCE).find(([, spec]) => spec.kind !== 'served-edit' && spec.control === value.id);
  const rows = observedG5.engines[engine].candidates.map(row => ({ ...structuredClone(row), phase: 'candidate' }));
  return grammarControlVerdicts({ engines: [engine], rows, controls: [value], runtimeFiles: [] }).find(row => row.id === `${engine}/${suffix}`).ok;
}
const shiftFirst = (geometry, dy) => geometry.map((p, i) => i ? structuredClone(p) : { ...p, top: p.top + dy, tokens: p.tokens.map(t => ({ ...t, top: t.top + dy })) });
const FOLD_SHIFTS = ['fold-shift-one-pixel', 'fold-shift-one-quarter-over'];
test('retained real 1 px and 1.25 px fold shifts are admitted, and the unchanged raw <1 px law is what they bite', () => {
  assert.deepEqual(observedG5.sources.map(row => row.engine), ['chromium', 'webkit']);
  for (const source of observedG5.sources) assert.match(source.receiptSha256, /^[a-f0-9]{64}$/u);
  for (const engine of ['chromium', 'webkit']) {
    const plain = g5Plain(engine);
    assert.equal(plain.length > 1, true);
    for (const id of [...FOLD_SHIFTS, 'G5.room-keep-hover']) assert.equal(observedG5Verdict(engine, g5Control(engine, id)), true, `${engine}/${id}`);
    for (const id of FOLD_SHIFTS) {
      const { baseline, shifted, amount, direction } = g5Control(engine, id);
      assert.equal(foldGeometryEqual(baseline, plain), true);
      assert.equal(foldGeometryEqual(shifted, plain), false);
      assert.equal(foldShiftBites({ plain, baseline, shifted, amount, direction }), true);
      assert.deepEqual(shifted, shiftFirst(baseline, amount * direction));
    }
    const { baseline } = g5Control(engine, 'fold-shift-one-pixel');
    assert.equal(foldShiftBites({ plain, baseline, shifted: shiftFirst(baseline, 63 / 64), amount: 63 / 64, direction: 1 }), false);
    assert.equal(foldShiftBites({ plain, baseline, shifted: shiftFirst(baseline, 1), amount: 1, direction: 1 }), true);
  }
});
test('fold-shift kills require the authored shift of exactly the first paragraph, with complete identical geometry elsewhere', () => {
  let rejected = 0;
  for (const engine of ['chromium', 'webkit']) for (const id of FOLD_SHIFTS) for (const mutate of [
    c => { delete c.shifted; }, c => { c.shifted = null; }, c => { c.shifted = []; }, c => { c.shifted = 'shifted'; },
    c => { c.shifted = c.shifted.slice(0, 1); }, c => { c.shifted.push(structuredClone(c.shifted.at(-1))); },
    c => { c.shifted[0].id = 'renamed'; }, c => { c.shifted[4].id = 'renamed'; }, c => { c.shifted[0].tokens[0].id = 'renamed'; },
    c => { c.shifted[0].tokens.pop(); }, c => { c.shifted[0].tokens = []; }, c => { delete c.shifted[0].height; },
    c => { c.shifted[0].top = NaN; }, c => { c.shifted[0].tokens[3].left = Infinity; },
    c => { c.shifted = shiftFirst(c.baseline, c.amount * c.direction + 1); },
    c => { c.shifted = shiftFirst(c.baseline, -c.amount * c.direction); },
    c => { c.direction = -c.direction; },
    c => { c.shifted[0].top += 0.25; }, c => { c.shifted[0].tokens[2].top -= 0.25; }, c => { c.shifted[0].tokens[1].left += 0.5; }, c => { c.shifted[0].height += 1; },
    c => { c.shifted[3] = shiftFirst([c.shifted[3]], 2)[0]; }, c => { c.shifted[6].tokens[2].top += 0.25; },
  ]) {
    const value = g5Control(engine, id); mutate(value);
    assert.equal(observedG5Verdict(engine, value), false, `${engine}/${id}: ${mutate}`); rejected++;
  }
  assert.equal(rejected, 92);
  for (const id of FOLD_SHIFTS) {
    const value = g5Control('webkit', id), dy = value.amount * value.direction;
    value.shifted = [shiftFirst(value.baseline, dy)[0], ...structuredClone(g5Plain('webkit').slice(1))];
    assert.equal(observedG5Verdict('webkit', value), false, `webkit/${id}: unshifted paragraphs read from another sample`);
  }
});
test('the shared-hover mutant must observe the untouched peer still hovered, enabled and unchanged', () => {
  let rejected = 0;
  for (const engine of ['chromium', 'webkit']) for (const mutate of [
    c => { delete c.mutant.peer; }, c => { c.mutant.peer = null; }, c => { c.mutant.peer = {}; }, c => { c.mutant.peer.hover = false; },
    c => { delete c.mutant.peer.disabled; }, c => { c.mutant.peer.disabled = true; }, c => { delete c.mutant.peer.background; },
    c => { c.mutant.peer.background = 'rgb(9, 9, 9)'; }, c => { c.mutant.peer.background = 'rgb(255, 0, 255)'; },
    c => { c.mutant.held.hover = false; }, c => { delete c.mutant.held.disabled; }, c => { c.mutant.held.background = 'rgb(9, 9, 9)'; },
  ]) {
    const value = g5Control(engine, 'G5.room-keep-hover'); mutate(value);
    assert.equal(observedG5Verdict(engine, value), false, `${engine}: ${mutate}`); rejected++;
  }
  assert.equal(rejected, 24);
  const value = g5Control('webkit', 'G5.room-keep-hover');
  assert.equal(sharedHoverDiverges(value.mutant, value.baseline), true);
  assert.equal(sharedHoverDiverges({ held: value.mutant.held }, value.baseline), false);
});

const G6_REVIEWED_ROWS = {
  'missing-reverse': ['setup.article-sentence', 'setup.sentence-word', 'setup.word-kanji', 'setup.kanji-part', 'reverse.part-kanji', 'errors', 'schedule'],
  'captured-text-pinch': ['text.two-pointer', 'errors', 'schedule'], 'touchmove-cancel': ['text.two-pointer', 'errors', 'schedule'],
  'late-bubble-pointer': ['text.native-two-pointer', 'errors', 'schedule'], 'touchmove-cancel-native': ['text.native-two-pointer', 'errors', 'schedule'],
  'lost-return-line': ['setup.article-shelf', 'setup.shelf-sky', 'setup.sky-shelf', 'setup.shelf-article', 'return.line', 'errors', 'schedule'],
  'invented-fresh-source': ['kept.identity', 'kept.native-door', 'kept.source-provenance', 'kept.no-record-write', 'kept.list-only', 'kept.removed', 'errors', 'schedule'],
};
const PHASES = ['baseline', 'rows', 'restore'];
test('G6 local controls require their reviewed complete schedule, errors and schedule rows in every phase', () => {
  for (const original of observedG6.controls) {
    const name = original.id.split('.').at(-1), target = g6Spec(original)[1].kills[0];
    assert.deepEqual(g6Spec(original)[1].rows, G6_REVIEWED_ROWS[name]);
    for (const phase of PHASES) assert.deepEqual(original[phase].map(row => row.id), G6_REVIEWED_ROWS[name]);
    const mutations = [
      c => { for (const phase of PHASES) c[phase] = [c[phase].find(row => row.id === target), { id: 'x', title: 'x', ok: true, observed: {} }]; },
      c => { for (const phase of PHASES) c[phase] = c[phase].filter(row => row.id !== 'errors'); },
      c => { for (const phase of PHASES) c[phase] = c[phase].filter(row => row.id !== 'schedule'); },
      c => { for (const phase of PHASES) c[phase].push({ id: 'extra', title: 'extra', ok: true, observed: {} }); },
      c => { for (const phase of PHASES) c[phase].reverse(); },
      c => { c.baseline.find(row => row.id === 'errors').observed.pageErrors = ['TypeError: baseline']; },
      c => { c.restore.find(row => row.id === 'errors').observed.consoleErrors = ['restore console error']; },
      c => { c.baseline.find(row => row.id === 'errors').observed.diagnosticError = 'screenshot failed'; },
      c => { const observed = c.restore.find(row => row.id === 'schedule').observed; observed.expected = [...observed.expected, 'invented']; },
      c => { c.rows.find(row => row.id === 'schedule').observed.actual.pop(); },
      c => { c.baseline.find(row => row.id === 'schedule').observed.error = 'harness error'; },
      c => { delete c.restore.find(row => row.id === 'errors').observed; },
    ];
    if (G6_REVIEWED_ROWS[name].length > 3) mutations.push(c => { for (const phase of PHASES) c[phase] = c[phase].filter(row => row.id === target || ['errors', 'schedule'].includes(row.id)); });
    for (const mutate of mutations) {
      const value = structuredClone(original); mutate(value);
      assert.equal(observedG6Verdict(value), false, `${value.engine}/${value.id}: ${mutate}`);
    }
  }
});
test('G6 baseline and restore samples must each show their own fault absent, not only a passing row', () => {
  const faults = {
    'missing-reverse': [o => { o.arrived = false; o.after.scale = 'part'; }, o => { o.after.scale = 'part'; }, o => { o.arrived = false; }],
    'captured-text-pinch': [o => { o.faults.textPinch = 1; }, o => { delete o.faults; },
      o => { const e = o.events.find(e => e.type === 'pointermove'); e.defaultPrevented = true; e.accepted = false; }],
    'touchmove-cancel': [o => { o.faults.touchmove = 1; }, o => { delete o.faults.touchmove; },
      o => { const e = o.touch.events.find(e => e.type === 'touchmove'); e.defaultPrevented = true; e.accepted = false; }],
    'late-bubble-pointer': [o => { o.faults.latePointer = 1; }, o => { delete o.faults; },
      o => { o.events.find(e => e.family === 'pointer' && e.type === 'pointermove').defaultPrevented = true; }],
    'touchmove-cancel-native': [o => { o.faults.touchmove = 1; }, o => { o.faults.touchmove = '0'; },
      o => { o.events.find(e => e.family === 'touch' && e.type === 'touchmove').defaultPrevented = true; }],
    'lost-return-line': [o => { o.delta = 80; }, o => { o.delta = 4.5; }, o => { delete o.delta; }, o => { o.current.index = 'different token'; }],
    'invented-fresh-source': [o => { o.counts.door = 1; }, o => { o.markers.inventedSource = 1; }, o => { delete o.markers; }, o => { o.branch = 'has-ref'; }],
  };
  let rejected = 0;
  for (const original of observedG6.controls) {
    const name = original.id.split('.').at(-1);
    assert.equal(observedG6Verdict(structuredClone(original)), true);
    for (const phase of ['baseline', 'restore']) for (const mutate of faults[name]) {
      const value = structuredClone(original); mutate(g6Primary(value, phase).observed);
      assert.equal(g6Primary(value, phase).ok, true);
      assert.equal(observedG6Verdict(value), false, `${value.engine}/${value.id}/${phase}: ${mutate}`); rejected++;
    }
  }
  assert.equal(rejected, 144);
});

test('Ladder remains diagnostic, preserves the old stalled control, and admits exact engine-specific walks', () => {
  assert.equal(grammarSelection(['--ladder-only', '--controls']).fullRequested, false);
  assert.throws(() => grammarSelection(['--ladder-only', '--g1-only']));
  for (const engine of ['chromium', 'webkit']) {
    const value = grammarFixture([engine]);
    assert.equal(grammarAcceptance(value).fullAcceptance, true);
    assert.equal(grammarWalkNames(engine).filter(w => w.startsWith('L-')).length, engine === 'chromium' ? 9 : 16);
    assert.equal(grammarControlRows(engine).filter(id => id.includes('/L.negative.')).length, engine === 'chromium' ? 7 : 8);
    assert.ok(grammarControlRows(engine).includes(`${engine}/G3.negative.stalled-second`));
    value.argv = ['--ladder-only', '--controls'];
    value.rows = value.rows.filter(row => row.walk?.startsWith('L-') || row.id.includes('/L.negative.'));
    value.walks = value.walks.filter(w => w.name.startsWith('L-'));
    assert.equal(grammarAcceptance(value).selectedPassed, true);
    assert.equal(grammarAcceptance(value).fullAcceptance, false);
  }
});
test('each added Ladder/G3 obligation rejects missing rows, fabricated witnesses and failed restores', () => {
  for (const engine of ['chromium', 'webkit']) {
    for (const suffix of ['stalled-second', 'tap1-opens-box', 'no-gloss-on-tap2', 'stalled-third', 'box-over-ruby']) {
      const value = grammarFixture([engine]);
      value.controls = value.controls.filter(c => c.id !== suffix);
      rejects(value, `${engine}/G3.negative.${suffix}`);
    }
    const fresh = grammarFixture([engine]);
    for (const id of grammarControlRows(engine).filter(id => id.includes('/L.negative.'))) {
      const spec = grammarControlSpec(engine, id.slice(engine.length + 1));
      for (const mutate of [
        c => { c.rows.find(row => row.id === `${engine}/${spec.kills[0]}`).observed = {}; },
        c => { c.restore[0].ok = false; },
        c => { c.rows.pop(); },
        c => { c.served[0].baseSha256 = 'a'.repeat(64); },
        c => { c.rows[0].phase = 'candidate'; },
      ]) {
        const value = structuredClone(fresh); mutate(control(value, engine, spec.control)); rejects(value, id);
      }
      const missing = structuredClone(fresh); missing.rows = missing.rows.filter(row => row.id !== id);
      assert.equal(grammarAcceptance(missing).fullAcceptance, false);
    }
    for (const suffix of ['G3.control.gloss', 'G3.control.stage-clear', 'L.tap2', 'L.gloss.sense']) {
      const missing = structuredClone(fresh); missing.rows = missing.rows.filter(row => row.id !== `${engine}/${suffix}`);
      assert.equal(grammarAcceptance(missing).fullAcceptance, false);
    }
  }
});
