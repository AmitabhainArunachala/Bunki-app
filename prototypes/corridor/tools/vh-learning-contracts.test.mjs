import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRecordArgs,recordCompletion,recordControlVerdict,RECORD_ROWS,reportCopyObservation,escapeObligations} from './vh-learning-contracts.mjs';
const rows=(cases=Object.keys(RECORD_ROWS))=>cases.flatMap(name=>RECORD_ROWS[name].map(id=>({id:`chromium/${id}`,ok:true})));
test('record selectors reject unknown, empty, missing, duplicate and conflicting schedules before browser setup',()=>{
  for(const args of [['--only','not-a-case'],['--only',''],['--only'],['--only','R,R'],['--only','R,'],['--only','R','--only','T'],['--controls','--only','R'],['--control','tutor-spelling-key','--only','R'],['--control'],['--unknown']])
    assert.throws(()=>parseRecordArgs(args),JSON.stringify(args));
  assert.deepEqual(parseRecordArgs(['--controls']),{only:null,control:null,controls:true});
  assert.deepEqual(parseRecordArgs(['--only','A,R']),{only:['A','R'],control:null,controls:false});
});
test('full record roster refuses zero, duplicate-hides-missing, unexpected, failed and missing-engine evidence',()=>{
  const good=rows(); assert.equal(good.length,17); assert.equal(recordCompletion(good,['chromium']).diagnosticPass,true);
  for(const bad of [[],good.slice(1),[good[0],...good.slice(0,-1)],[...good,{id:'chromium/fake',ok:true}],good.map((row,i)=>i?row:{...row,ok:false})])
    assert.equal(recordCompletion(bad,['chromium']).diagnosticPass,false);
  assert.equal(recordCompletion(good,['chromium','webkit']).diagnosticPass,false);
  assert.equal(recordCompletion(rows(['R']),['chromium'],['R']).diagnosticPass,true);
});
const proof=()=>({name:'kagami-spelling-only',engine:'chromium',candidate:{rows:rows()},restore:{rows:rows(['R'])},mutant:{rows:rows(['R']).map(row=>row.id.endsWith('/R.mirror')?{...row,ok:false,observed:{rowReading:'ねん',mirror:{reading:'とし',toshi:true}}}:row),control:{served:[{baseSha256:'abc',mutantSha256:'def',applied:[{key:'door'}]}]}}});
test('record kill requires clean full baseline, exact completed named witness and clean restore',()=>{
  assert.equal(recordControlVerdict(proof()).verdict,'killed');
  for(const mutate of [p=>p.candidate.rows.pop(),p=>p.restore.rows.pop(),p=>p.mutant.rows.pop(),p=>p.mutant.rows.push({...p.mutant.rows[0]}),p=>p.mutant.terminalError='timeout',p=>p.mutant.control.setupError='unmatched',p=>p.mutant.control.served=[],p=>p.mutant.rows[0].ok=false,p=>p.mutant.rows.find(row=>!row.ok).observed.mirror.toshi=false]) {
    const p=proof(); mutate(p); assert.notEqual(recordControlVerdict(p).verdict,'killed');
  }
});
test('fallback attributes cannot substitute for visible or accessible copy; pending may not advertise fallback',()=>{
  for(const locale of ['en','ja']) {
    const label=locale==='ja'?'送る':'Send', good={visible:label,accessible:label,visibleShown:true,disabled:false,delivery:'github'};
    assert.deepEqual(reportCopyObservation(good,{locale}),{label:true,delivery:true,enabled:true});
    for(const changes of [{visible:''},{visible:'Wrong label'},{accessible:'Wrong name'},{visibleShown:false}]) assert.equal(reportCopyObservation({...good,...changes},{locale}).label,false);
    assert.equal(reportCopyObservation({...good,disabled:true},{locale}).enabled,false);
    const pending={...good,visible:'Send report',accessible:'Send report',delivery:'service'};
    assert.equal(reportCopyObservation(pending,{pending:true,locale}).label,true);
    assert.equal(reportCopyObservation({...pending,delivery:'github'},{pending:true,locale}).delivery,false);
  }
});
test('Escape cannot pass if source pre-focused, another occurrence focused, popup remains or observation omitted',()=>{
  const good=()=>Array.from({length:3},()=>({premise:{inside:true,source:false,connected:true},back:true,popupGone:true}));
  assert.deepEqual(escapeObligations(good()),{premise:true,exactSource:true,popupAbsent:true});
  let sample=good();sample[0].premise={inside:false,source:true,connected:true};assert.equal(escapeObligations(sample).premise,false);
  sample=good();sample[0].back=false;sample[0].onDuplicate=true;assert.equal(escapeObligations(sample).exactSource,false);
  sample=good();sample[0].popupGone=false;assert.equal(escapeObligations(sample).popupAbsent,false);
  assert.equal(escapeObligations(good().slice(1)).exactSource,false);
});
test('report acceptance requires the independent exact per-engine assertion roster',async()=>{
 const {expectedReportChecks,exactNamedCompletion}=await import('./vh-learning-contracts.mjs');
 const expected=expectedReportChecks(['chromium','webkit']), good=expected.map(name=>({name,pass:true}));
 assert.equal(expected.length,107); assert.equal(new Set(expected).size,107); assert.equal(exactNamedCompletion(good,expected),true);
 for(const bad of [[],good.slice(1),[good[0],...good.slice(0,-1)],good.map((row,i)=>i?row:{...row,pass:false})]) assert.equal(exactNamedCompletion(bad,expected),false);
 assert.equal(exactNamedCompletion(expectedReportChecks(['chromium']).map(name=>({name,pass:true})),expected),false);
});
