import test from 'node:test';
import assert from 'node:assert/strict';
import { grammarSelection, foldGeometryEqual, grammarAcceptance, grammarControlRows, grammarCandidateRows, WG_CANDIDATE_ROSTER, WG_WALKS } from './vh-word-grammar-contracts.mjs';
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
function clean() {
  const engines = ['chromium', 'webkit'];
  return { selection: grammarSelection(['--controls']), engines, g6Completed: engines,
    rows: [...engines.flatMap(engine=>grammarCandidateRows(engine).map(row=>({...row,ok:true}))),...engines.flatMap(grammarControlRows).map(id => ({ id, phase:'control',walk:null,ok: true }))],
    walks: engines.flatMap(engine => WG_WALKS.map(name => ({ engine, name, phase: 'candidate', complete: true }))) };
}
test('full admission rejects omission of every slice, duplicate rows and partial promotion', () => {
  assert.equal(grammarAcceptance(clean()).fullAcceptance, true);
  for (const slice of ['G1','G2','G3','G4','G5','G6']) {
    const c = clean(); c.rows = c.rows.filter(r => !r.id.includes(`/${slice}.`));
    assert.equal(grammarAcceptance(c).fullAcceptance, false, slice);
  }
  const omitted = clean(); omitted.walks.pop(); assert.equal(grammarAcceptance(omitted).fullAcceptance, false);
  const dupe = clean(); dupe.rows[1] = dupe.rows[0]; assert.equal(grammarAcceptance(dupe).fullAcceptance, false);
  const partial = clean(); partial.selection = grammarSelection(['--g5-only','--controls']);
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
 const c=clean();c.engines=['chromium'];c.g6Completed=['chromium'];c.rows=c.rows.filter(row=>row.id.startsWith('chromium/'));c.walks=c.walks.filter(row=>row.engine==='chromium');
 assert.equal(grammarAcceptance(c).fullAcceptance,true);
 const missingNative={...c,rows:c.rows.filter(row=>!row.walk?.startsWith('G6.sky.native.'))};assert.equal(grammarAcceptance(missingNative).fullAcceptance,false);
 const diagnostic={...c,selection:grammarSelection(['--controls','--g3-only']),rows:c.rows.filter(row=>row.id.includes('/G3.')),walks:c.walks.filter(row=>row.name.startsWith('G3'))};
 assert.equal(grammarAcceptance(diagnostic).selectedPassed,true);assert.equal(grammarAcceptance(diagnostic).fullAcceptance,false);
 const restored=clean();restored.rows.push({...restored.rows[0],phase:'restore:reviewed-control'});assert.equal(grammarAcceptance(restored).fullAcceptance,true);
});
