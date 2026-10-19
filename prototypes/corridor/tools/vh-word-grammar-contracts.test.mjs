import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { grammarSelection, foldGeometryEqual, grammarAcceptance, grammarControlRows, grammarControlVerdicts, WG_CANDIDATE_ROSTER, WG_CONTROL_EVIDENCE } from './vh-word-grammar-contracts.mjs';
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
      const spec = WG_CONTROL_EVIDENCE[id];
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
