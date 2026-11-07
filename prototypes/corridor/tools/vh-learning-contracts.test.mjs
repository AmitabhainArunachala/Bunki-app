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
const delivered=()=>[{file:'corridor.js',status:200,sha256:'a'.repeat(64)}];
const proof=()=>({name:'kagami-spelling-only',engine:'chromium',candidate:{rows:rows(),delivered:delivered()},restore:{rows:rows(['R']),delivered:delivered()},mutant:{rows:rows(['R']).map(row=>row.id.endsWith('/R.mirror')?{...row,ok:false,observed:{rowReading:'ねん',mirror:{reading:'とし',toshi:true}}}:row),control:{served:[{baseSha256:'abc',mutantSha256:'def',applied:[{key:'door'}]}]}}});
test('record kill requires clean full baseline, exact completed named witness and clean restore',()=>{
  assert.equal(recordControlVerdict(proof()).verdict,'killed');
  for(const mutate of [p=>p.candidate.rows.pop(),p=>p.restore.rows.pop(),p=>p.mutant.rows.pop(),p=>p.mutant.rows.push({...p.mutant.rows[0]}),p=>p.mutant.terminalError='timeout',p=>p.mutant.control.setupError='unmatched',p=>p.mutant.control.served=[],p=>p.mutant.rows[0].ok=false,p=>p.mutant.rows.find(row=>!row.ok).observed.mirror.toshi=false,p=>delete p.candidate.delivered,p=>p.restore.delivered=[],p=>p.restore.deliveryError='corridor.js: delivered bytes are not the manifest\'s']) {
    const p=proof(); mutate(p); assert.notEqual(recordControlVerdict(p).verdict,'killed');
  }
});
test('record producer requires exact false intended failure and exact true unrelated rows',()=>{
  for(const value of [undefined,null,0,1,'skip','false'])for(const target of ['intended','unrelated']){
    const p=proof(),row=p.mutant.rows.find(r=>target==='intended'?r.ok===false:r.ok===true);
    if(value===undefined)delete row.ok;else row.ok=value;
    assert.notEqual(recordControlVerdict(p).verdict,'killed',`${target}/${String(value)}`);
  }
});
const executionMarkers=[{skip:true},{skipped:true},{unexecuted:true},{timedOut:true},{harnessError:'setup failed'},{error:'observation failed'},{status:'not-run'}];
test('record producer rejects execution-failure markers in every phase, semantic row and witness',()=>{
  for(const phase of ['candidate','mutant','restore'])for(const marker of executionMarkers)for(const location of ['phase','row','observation']){
    const p=proof(),receipt=p[phase],row=phase==='mutant'?receipt.rows.find(r=>r.ok===false):receipt.rows[0];
    Object.assign(location==='phase'?receipt:location==='row'?row:(row.observed||={}),marker);
    assert.notEqual(recordControlVerdict(p).verdict,'killed',`${phase}/${location}/${JSON.stringify(marker)}`);
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
test('report copy observation cannot create a single intended red from absent, incomplete or failed execution',()=>{
  const good={visible:'Wrong send label',accessible:'Send',visibleShown:true,disabled:false,delivery:'github'};
  assert.deepEqual(reportCopyObservation(good),{label:false,delivery:true,enabled:true});
  for(const invalid of [null,undefined,{},...executionMarkers.map(marker=>({...good,...marker})),{...good,visible:undefined}])
    assert.deepEqual(reportCopyObservation(invalid),{label:false,delivery:false,enabled:false});
});
test('Escape cannot pass if source pre-focused, another occurrence focused, popup remains or observation omitted',()=>{
  const good=()=>Array.from({length:3},()=>({premise:{inside:true,source:false,connected:true},back:true,popupGone:true}));
  assert.deepEqual(escapeObligations(good()),{premise:true,exactSource:true,popupAbsent:true});
  let sample=good();sample[0].premise={inside:false,source:true,connected:true};assert.equal(escapeObligations(sample).premise,false);
  sample=good();sample[0].back=false;sample[0].onDuplicate=true;assert.equal(escapeObligations(sample).exactSource,false);
  sample=good();sample[0].popupGone=false;assert.equal(escapeObligations(sample).popupAbsent,false);
  assert.equal(escapeObligations(good().slice(1)).exactSource,false);
  for(const marker of executionMarkers){const broken=good();Object.assign(broken[0],marker);assert.deepEqual(escapeObligations(broken),{premise:false,exactSource:false,popupAbsent:false});}
});
test('report acceptance requires the independent exact per-engine assertion roster',async()=>{
 const {expectedReportChecks,exactNamedCompletion}=await import('./vh-learning-contracts.mjs');
 const expected=expectedReportChecks(['chromium','webkit']), good=expected.map(name=>({name,pass:true}));
 // INT-VH (2026-10-19): + Hfix-1B's six H0-4 rows per engine (107 → 119)
 assert.equal(expected.length,119); assert.equal(new Set(expected).size,119); assert.equal(exactNamedCompletion(good,expected),true);
 for(const bad of [[],good.slice(1),[good[0],...good.slice(0,-1)],good.map((row,i)=>i?row:{...row,pass:false})]) assert.equal(exactNamedCompletion(bad,expected),false);
 assert.equal(exactNamedCompletion(expectedReportChecks(['chromium']).map(name=>({name,pass:true})),expected),false);
});
test('report-delivery claims full acceptance only for a complete both-engine run; a single-engine run is a diagnostic',async()=>{
 const {reportDeliveryAcceptance,expectedReportChecks,REPORT_COPY_CONTROLS,REPORT_SCENARIOS}=await import('./vh-learning-contracts.mjs');
 const run=engines=>({engines,checks:expectedReportChecks(engines).map(name=>({name,pass:true})),scenarios:engines.flatMap(engine=>REPORT_SCENARIOS.map(name=>({name:`${engine} · ${name}`,completed:true}))),
  controls:engines.flatMap(engine=>['en','ja'].flatMap(locale=>REPORT_COPY_CONTROLS.map(name=>({engine,locale,name,verdict:'killed'}))))});
 const both=reportDeliveryAcceptance(run(['chromium','webkit']));
 assert.deepEqual([both.scope,both.diagnosticPass,both.fullAcceptance],['full-engine',true,true]);
 assert.equal(both.expectedChecks.length,119); assert.equal(both.expectedControls.length,20); assert.equal(both.expectedScenarios.length,18);
 for(const engine of ['chromium','webkit']){
  const one=reportDeliveryAcceptance(run([engine]));
  assert.deepEqual([one.scope,one.diagnosticPass,one.fullAcceptance],['diagnostic',true,false],engine);
 }
 assert.equal(reportDeliveryAcceptance(run(['chromium','chromium'])).fullAcceptance,false);
 for(const mutate of [x=>x.checks[0].pass=false,x=>x.checks.pop(),x=>x.checks.push({...x.checks[0]}),x=>x.scenarios[3].completed=false,x=>x.scenarios.pop(),x=>x.controls[2].verdict='incomplete',x=>x.controls.pop(),x=>x.controls.push({...x.controls[0]})]){
  const bad=run(['chromium','webkit']); mutate(bad);
  const judged=reportDeliveryAcceptance(bad);
  assert.equal(judged.fullAcceptance,false); assert.equal(judged.diagnosticPass,false);
 }
 for(const marker of executionMarkers)for(const location of ['control','before','mutant','restored','observation','check','scenario']){
  const bad=run(['chromium','webkit']),control=bad.controls[0];
  const target=location==='control'?control:location==='check'?bad.checks[0]:location==='scenario'?bad.scenarios[0]
   :location==='observation'?(control.mutant={observed:{}}).observed:(control[location]={});
  Object.assign(target,marker);assert.equal(reportDeliveryAcceptance(bad).fullAcceptance,false,`${location}/${JSON.stringify(marker)}`);
 }
});
