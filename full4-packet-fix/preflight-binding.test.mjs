import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validatePreparedRoutes,validateCompletedPreflight,validateRuntime} from './validate-packet.mjs';
import {currentFootprintPins,SUCCESSOR_TOOLS} from './freeze-descriptors.mjs';

const HERE=dirname(fileURLToPath(import.meta.url)),ROOT=dirname(HERE);
const expected=JSON.parse(readFileSync(join(HERE,'SOURCE-BINDING.EXPECTED.json'),'utf8'));
const toolPins=Object.fromEntries(JSON.parse(readFileSync(join(HERE,'RUNNER-PINS.json'),'utf8')).rows.map(row=>[row.path,row.sha256]));
const write=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n');
const pin=path=>{const bytes=readFileSync(path);return {path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};};
const startedAt='2026-10-25T04:00:01.000Z',completedAt='2026-10-25T04:00:02.000Z';
// Fixtures exercise real route/source/tool validation. Their tiny identity,
// contract, pending review and progress are synthetic controls, never approvals
// or claims that an artifact build, native preflight, or OS closure occurred.
function fixture() {
  const directory=mkdtempSync(join(HERE,'preflight-binding-controls-'));
  const suffix=randomUUID(),preflightOut=join(ROOT,'preflight-binding-control-'+suffix);
  const nativeOut=join(ROOT,'native-binding-control-'+suffix),custodyEvidence=join(ROOT,'custody-binding-control-'+suffix);
  const site=join(directory,'synthetic-site'),contract=join(directory,'synthetic-contract.json'),review=join(directory,'synthetic-review.PENDING.json');
  mkdirSync(site);
  const artifact='a'.repeat(64);
  write(join(site,'build-identity.json'),{syntheticControl:true,gitSha:expected.head,artifactSha256:artifact,sourceDirty:false});
  write(contract,{syntheticControl:true,sourceHead:expected.head,artifactSha256:artifact});
  write(review,{syntheticControl:true,status:'pending',sourceHead:expected.head,artifactSha256:artifact,contractSha256:pin(contract).sha256});
  const command=out=>[process.execPath,join(SUCCESSOR_TOOLS,'run-full-r1.mjs'),'--worktree',expected.worktree,'--site',site,'--out',out,
    '--expected-head',expected.head,'--expected-artifact',artifact,'--engine-contract',contract,'--contract-review',review,'--retention','keep-all'];
  const plan={syntheticControl:true,status:'PREPARED',head:expected.head,tree:expected.tree,cwd:expected.worktree,tools:SUCCESSOR_TOOLS,
    toolPins,argv:command(nativeOut),preflight:[...command(preflightOut),'--preflight-only'],nativeOut,custodyEvidence,
    preflightProgress:join(preflightOut,'progress.json'),retentionMode:'keep-all',site,artifact,contract,review,preflightBinding:null};
  const progress={syntheticControl:true,schemaVersion:1,kind:'bunki-full-battery-orchestration',status:'preflight-passed-no-gates-run',
    startedAt,completedAt,root:plan.cwd,site,out:preflightOut,expectedHead:plan.head,expectedArtifact:artifact,
    fullAcceptance:false,allFinalGateOutcomesPassed:false,active:[],stop:null,settlementBlock:null,
    gates:[{name:'synthetic-unrun-gate',phase:'canonical',outcome:'pending',attempts:[]}],
    footprintPins:currentFootprintPins(SUCCESSOR_TOOLS,plan.cwd),
    pins:{head:plan.head,tree:plan.tree,artifactSha256:artifact,identity:pin(join(site,'build-identity.json')),
      orchestrator:pin(join(SUCCESSOR_TOOLS,'run-full-r1.mjs')),engineContract:pin(contract),contractReview:pin(review)}};
  const closurePath=join(directory,'synthetic-command-closure.json');
  const closure={syntheticControl:true,schemaVersion:1,kind:'bunki-full4-preflight-closure',scope:'preflight-command-exit-and-no-active-gates',
    status:'closed',exitCode:0,argv:plan.preflight,cwd:plan.cwd,startedAt:'2026-10-25T04:00:00.000Z',completedAt:'2026-10-25T04:00:03.000Z',active:[]};
  function saveClosure(){write(closurePath,closure);plan.preflightBinding.closure=pin(closurePath);}
  function saveProgress(){
    if(!existsSync(preflightOut))mkdirSync(preflightOut);
    write(plan.preflightProgress,progress);
    plan.preflightBinding={schemaVersion:1,kind:'bunki-full4-preflight-binding',progress:pin(plan.preflightProgress),closure:null};
    closure.progress=plan.preflightBinding.progress;saveClosure();
  }
  return {directory,preflightOut,nativeOut,custodyEvidence,plan,progress,closure,closurePath,saveProgress,saveClosure};
}
async function control(t,run) {
  const f=fixture();let passed=false;
  try{await run(f);passed=true;}
  finally{
    if(passed)for(const path of [f.directory,f.preflightOut,f.nativeOut,f.custodyEvidence])rmSync(path,{recursive:true,force:true});
    else t.diagnostic('FAILED fixture retained: '+JSON.stringify({directory:f.directory,preflightOut:f.preflightOut,nativeOut:f.nativeOut,custodyEvidence:f.custodyEvidence}));
  }
}
function refuses(run,pattern) {
  assert.throws(run,error=>{assert.equal(error.name,'AssertionError','refusal must be deliberate, not an accidental runtime exception');assert.match(error.message,pattern);return true;});
}
function cli(f,mode,plan=f.plan){const path=join(f.directory,'synthetic-plan.json');write(path,plan);return spawnSync(process.execPath,[join(HERE,'validate-packet.mjs'),mode,path],{encoding:'utf8',timeout:30000});}

test('preparation requires an absent preflight directory; completed binding stays nonlaunch and preserves evidence',t=>control(t,f=>{
  assert.equal(validatePreparedRoutes(f.plan).status,'prepared-source-and-routes-passed-only');
  refuses(()=>validateCompletedPreflight(f.plan),/preflight binding schema required/);
  f.saveProgress();const original=readFileSync(f.plan.preflightProgress);
  const result=validateCompletedPreflight(f.plan);
  assert.equal(result.status,'completed-preflight-bindings-passed-only');assert.equal(result.launchAuthorized,false);
  assert.equal(result.scope,'preflight-command-exit-and-no-active-gates');assert.deepEqual(result.progress,pin(f.plan.preflightProgress));
  refuses(()=>validatePreparedRoutes(f.plan),/fresh preflight path already exists/);
  refuses(()=>validateRuntime(f.plan),/FULL4 packet is prepared, not released/);
  assert.deepEqual(readFileSync(f.plan.preflightProgress),original);
  assert.equal(existsSync(f.nativeOut),false);assert.equal(existsSync(f.custodyEvidence),false);
}));

test('actual CLI completed route passes; actual RELEASED route reaches absent release key without fabricated approvals',t=>control(t,f=>{
  f.saveProgress();const original=readFileSync(f.plan.preflightProgress);
  const completed=cli(f,'--completed-preflight');assert.equal(completed.error,undefined);assert.equal(completed.status,0,completed.stderr);
  assert.equal(JSON.parse(completed.stdout).launchAuthorized,false);
  const released={...f.plan,status:'RELEASED'};
  refuses(()=>validateRuntime(released),/leadRelease exact binding required/);
  const runtime=cli(f,'--runtime',released);assert.equal(runtime.error,undefined);assert.equal(runtime.status,1);
  assert.match(runtime.stderr,/leadRelease exact binding required/);assert.doesNotMatch(runtime.stderr,/fresh preflight path already exists|ReferenceError|TypeError/);
  assert.equal(JSON.parse(readFileSync(f.plan.review)).status,'pending');
  assert.deepEqual(readFileSync(f.plan.preflightProgress),original);
  assert.equal(existsSync(f.nativeOut),false);assert.equal(existsSync(f.custodyEvidence),false);
}));

test('full runtime CLI passes an explicitly synthetic completed control with real source, tools and materialization',t=>control(t,f=>{
  // Only this isolated control supplies approval-shaped values. These files
  // explicitly deny real authority and are never installed in the packet plan.
  const review=JSON.parse(readFileSync(f.plan.review,'utf8'));
  Object.assign(review,{status:'approved',reviewer:'SYNTHETIC CONTROL: NOT W2 APPROVAL',authority:'none',
    footprint:{status:'approved',retentionMode:'keep-all',scope:'keep-all-no-deletion',pins:f.progress.footprintPins}});
  write(f.plan.review,review);f.progress.pins.contractReview=pin(f.plan.review);f.saveProgress();
  const plan={...f.plan,status:'RELEASED',authority:'SYNTHETIC CONTROL ONLY; NO RELEASE',pins:{}};
  for(const key of ['leadRelease','w2LaunchKey','slotRelease','custodyRecovery']){
    const path=join(f.directory,'synthetic-'+key+'.json');write(path,{syntheticControl:true,authority:'none',message:'TEST INPUT ONLY; NOT A RELEASE OR REVIEW KEY'});
    plan[key]=pin(path);
  }
  for(const path of [f.plan.contract,f.plan.review,join(f.plan.site,'build-identity.json'),f.plan.preflightProgress,f.closurePath])plan.pins[path]=pin(path).sha256;
  const runtime=cli(f,'--runtime',plan);assert.equal(runtime.error,undefined);assert.equal(runtime.status,0,runtime.stderr);
  const result=JSON.parse(runtime.stdout);
  assert.equal(result.status,'runtime-bindings-passed; fresh resource admission still required');
  assert.equal(result.preflight.status,'completed-preflight-bindings-passed-only');assert.equal(result.preflight.launchAuthorized,false);
  f.progress.expectedArtifact='b'.repeat(64);f.saveProgress();plan.preflightBinding=f.plan.preflightBinding;
  refuses(()=>validateRuntime(plan),/preflight artifact stale/);
  assert.equal(existsSync(f.nativeOut),false);assert.equal(existsSync(f.custodyEvidence),false);
}));

test('runtime rejects changed progress bytes and a binding to another progress path',t=>control(t,f=>{
  f.saveProgress();writeFileSync(f.plan.preflightProgress,readFileSync(f.plan.preflightProgress,'utf8').replace('synthetic-unrun-gate','synthetic-wrong-gate'));
  refuses(()=>validateRuntime({...f.plan,status:'RELEASED'}),/preflight progress hash changed/);
  f.saveProgress();f.plan.preflightBinding.progress.path=join(f.directory,'other-progress.json');
  refuses(()=>validateCompletedPreflight(f.plan),/preflight progress exact file pin required/);
}));

for(const [label,change,pattern] of [
  ['old source HEAD',f=>{f.progress.expectedHead='0'.repeat(40);},/preflight source HEAD stale/],
  ['old artifact',f=>{f.progress.expectedArtifact='b'.repeat(64);},/preflight artifact stale/],
  ['unfinished status',f=>{f.progress.status='running';},/preflight not completed successfully/],
  ['missing completion time',f=>{delete f.progress.completedAt;},/preflight completion timestamps invalid/],
  ['active gate',f=>{f.progress.active=['unexpected'];},/preflight has active gates/],
  ['gate execution',f=>{f.progress.gates[0].attempts=[{syntheticControl:true}];},/preflight ran native gates/],
  ['stale tool or native pins',f=>{f.progress.footprintPins={tools:{},native:{}};},/preflight tool\/native pins stale/],
  ['wrong contract receipt',f=>{f.progress.pins.engineContract.sha256='0'.repeat(64);},/preflight engineContract hash changed/],
  ['wrong review receipt',f=>{f.progress.pins.contractReview.sha256='0'.repeat(64);},/preflight contractReview hash changed/],
  ['wrong wrapper receipt',f=>{f.progress.pins.orchestrator.sha256='0'.repeat(64);},/preflight orchestrator hash changed/],
])test('actual runtime refuses rebound progress with '+label,t=>control(t,f=>{
  change(f);f.saveProgress();refuses(()=>validateRuntime({...f.plan,status:'RELEASED'}),pattern);
}));

test('real source and wrapper admission remain in the completed-preflight route',t=>control(t,f=>{
  f.saveProgress();refuses(()=>validateCompletedPreflight({...f.plan,head:'0'.repeat(40)}),/FULL4 stale candidate HEAD/);
  const preflight=[...f.plan.preflight];preflight[1]=join(f.directory,'old-wrapper.mjs');
  refuses(()=>validateCompletedPreflight({...f.plan,preflight}),/FULL4 preflight wrapper route differs/);
  const argv=[...f.plan.argv];argv[argv.indexOf('--expected-artifact')+1]='b'.repeat(64);
  refuses(()=>validateCompletedPreflight({...f.plan,argv}),/preflight\/runtime --expected-artifact binding differs/);
}));

test('closure pin, bound progress, command, exit, scope, active gates and completion are independently enforced',t=>control(t,f=>{
  f.saveProgress();const original=structuredClone(f.closure);
  writeFileSync(f.closurePath,readFileSync(f.closurePath,'utf8')+' ');
  refuses(()=>validateCompletedPreflight(f.plan),/preflight closure bytes changed/);f.saveClosure();
  for(const [change,pattern] of [
    [c=>{c.progress={...c.progress,sha256:'0'.repeat(64)};},/closure binds a different preflight progress/],
    [c=>{c.argv=[...c.argv,'--unexpected'];},/preflight command argv differs/],
    [c=>{c.exitCode=1;},/preflight command did not exit successfully/],
    [c=>{c.scope='claimed-browser-closure';},/preflight-command-exit-and-no-active-gates/],
    [c=>{c.active=['unexpected'];},/preflight closure has active gates/],
    [c=>{c.completedAt='2026-10-25T04:00:01.500Z';},/preflight command times do not enclose progress/],
  ]){
    Object.assign(f.closure,structuredClone(original));change(f.closure);f.saveClosure();
    refuses(()=>validateRuntime({...f.plan,status:'RELEASED'}),pattern);
  }
}));

test('completed preflight never permits existing native or custody output',t=>control(t,f=>{
  f.saveProgress();const original=readFileSync(f.plan.preflightProgress);
  mkdirSync(f.nativeOut);refuses(()=>validateCompletedPreflight(f.plan),/FULL4 fresh path already exists/);rmSync(f.nativeOut,{recursive:true});
  mkdirSync(f.custodyEvidence);refuses(()=>validateRuntime({...f.plan,status:'RELEASED'}),/FULL4 fresh path already exists/);
  assert.deepEqual(readFileSync(f.plan.preflightProgress),original);
}));
