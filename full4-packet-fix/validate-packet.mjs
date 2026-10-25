import assert from 'node:assert/strict';
import {readFileSync,existsSync,lstatSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,join,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {admitSourceCandidate,inspectMaterialization,assertToolRoutes,currentFootprintPins,SUCCESSOR_TOOLS} from './freeze-descriptors.mjs';
import {validateAdmissionReceipt} from './admission.mjs';
const HERE=dirname(fileURLToPath(import.meta.url));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const json=p=>JSON.parse(readFileSync(p,'utf8'));
function argument(argv,key) {
  assert(Array.isArray(argv), 'FULL4 argv required');
  const positions=argv.flatMap((value,index)=>value===key?[index]:[]);
  assert.equal(positions.length,1,`FULL4 exactly one ${key} required`);
  const value=argv[positions[0]+1];assert(typeof value==='string'&&value&&!value.startsWith('--'),`FULL4 ${key} value required`);
  return value;
}
function validateRoutes(plan) {
  const source=admitSourceCandidate({head:plan.head,tree:plan.tree,worktree:plan.cwd});
  assertToolRoutes({tools:plan.tools,argv:plan.argv,preflight:plan.preflight,toolPins:plan.toolPins});
  assert.equal(argument(plan.argv,'--expected-head'),plan.head);
  assert.equal(argument(plan.preflight,'--expected-head'),plan.head);
  const fullOut=argument(plan.argv,'--out'),preOut=argument(plan.preflight,'--out');
  for(const path of [fullOut,preOut,plan.custodyEvidence])assert(typeof path==='string'&&isAbsolute(path),'FULL4 absolute output paths required');
  assert.equal(dirname(fullOut),dirname(HERE),'FULL4 native output must be direct child of FULLR1');
  assert.equal(dirname(preOut),dirname(HERE),'FULL4 preflight output must be direct child of FULLR1');
  assert.notEqual(fullOut,preOut); assert.notEqual(fullOut,plan.custodyEvidence);assert.notEqual(preOut,plan.custodyEvidence);
  if(plan.nativeOut!==undefined)assert.equal(plan.nativeOut,fullOut,'FULL4 native output route differs');
  assert.equal(plan.preflightProgress,join(preOut,'progress.json'),'FULL4 preflight progress route differs');
  for(const path of [fullOut,plan.custodyEvidence]) assert(!existsSync(path),'FULL4 fresh path already exists: '+path);
  assert.equal(plan.retentionMode,'keep-all');
  assert.equal(argument(plan.argv,'--retention'),'keep-all');
  assert.equal(argument(plan.preflight,'--retention'),'keep-all');
  assert(plan.preflight.includes('--preflight-only'));assert(!plan.argv.includes('--preflight-only'));
  return {status:'prepared-source-and-routes-passed-only',source,nativeOut:fullOut,preflightOut:preOut};
}
export function validatePreparedRoutes(plan) {
  const routes=validateRoutes(plan);
  assert(!existsSync(routes.preflightOut),'FULL4 fresh preflight path already exists: '+routes.preflightOut);
  return routes;
}
function pinnedBytes(pin,path,label) {
  assert(pin?.path===path&&/^[a-f0-9]{64}$/.test(pin.sha256)&&Number.isSafeInteger(pin.bytes)&&pin.bytes>0,`FULL4 ${label} exact file pin required`);
  assert(lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink()&&realpathSync(path)===path,`FULL4 ${label} must be a regular owned path`);
  const bytes=readFileSync(path);
  assert.equal(bytes.length,pin.bytes,`FULL4 ${label} bytes changed`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),pin.sha256,`FULL4 ${label} hash changed`);
  return bytes;
}
// This is reusable by preparation/review and runtime. It proves the completed
// preflight command's bound output, not FULL release or OS/browser custody.
export function validateCompletedPreflight(plan) {
  const routes=validateRoutes(plan),binding=plan.preflightBinding;
  assert.equal(binding?.schemaVersion,1,'FULL4 preflight binding schema required');
  assert.equal(binding?.kind,'bunki-full4-preflight-binding','FULL4 completed preflight binding required');
  const progress=JSON.parse(pinnedBytes(binding.progress,plan.preflightProgress,'preflight progress'));
  assert.equal(progress.schemaVersion,1);assert.equal(progress.kind,'bunki-full-battery-orchestration');
  assert.equal(progress.status,'preflight-passed-no-gates-run','FULL4 preflight not completed successfully');
  const started=Date.parse(progress.startedAt),completed=Date.parse(progress.completedAt);
  assert(Number.isFinite(started)&&Number.isFinite(completed)&&completed>=started,'FULL4 preflight completion timestamps invalid');
  assert.equal(progress.root,plan.cwd);assert.equal(progress.site,plan.site);assert.equal(progress.out,routes.preflightOut);
  assert.equal(progress.expectedHead,plan.head,'FULL4 preflight source HEAD stale');
  assert.equal(progress.expectedArtifact,plan.artifact,'FULL4 preflight artifact stale');
  assert(/^[a-f0-9]{64}$/.test(plan.artifact),'FULL4 preflight artifact unbound');
  assert.equal(progress.pins?.head,plan.head);assert.equal(progress.pins?.tree,plan.tree);
  assert.equal(progress.pins?.artifactSha256,plan.artifact);
  assert.equal(progress.fullAcceptance,false);assert.equal(progress.allFinalGateOutcomesPassed,false);
  assert.deepEqual(progress.active,[],'FULL4 preflight has active gates');
  assert.equal(progress.stop,null);assert.equal(progress.settlementBlock,null);
  assert(!progress.error&&!(progress.schedulerFailures?.length),'FULL4 preflight recorded failure');
  assert(Array.isArray(progress.gates)&&progress.gates.every(row=>row.outcome==='pending'&&Array.isArray(row.attempts)&&row.attempts.length===0),'FULL4 preflight ran native gates');
  for(const argv of [plan.argv,plan.preflight])for(const [key,value] of Object.entries({
    '--worktree':plan.cwd,'--site':plan.site,'--expected-artifact':plan.artifact,'--engine-contract':plan.contract,'--contract-review':plan.review,
  }))assert.equal(argument(argv,key),value,`FULL4 preflight/runtime ${key} binding differs`);
  const current=currentFootprintPins(SUCCESSOR_TOOLS,plan.cwd);
  assert.deepEqual(progress.footprintPins,current,'FULL4 preflight tool/native pins stale');
  for(const [key,path] of Object.entries({identity:join(plan.site,'build-identity.json'),orchestrator:join(SUCCESSOR_TOOLS,'run-full-r1.mjs'),engineContract:plan.contract,contractReview:plan.review}))
    pinnedBytes(progress.pins[key],path,'preflight '+key);
  const contract=json(plan.contract),review=json(plan.review),identity=json(join(plan.site,'build-identity.json'));
  assert.equal(contract.sourceHead,plan.head);assert.equal(contract.artifactSha256,plan.artifact);
  assert.equal(review.sourceHead,plan.head);assert.equal(review.artifactSha256,plan.artifact);assert.equal(review.contractSha256,hash(plan.contract));
  assert.equal(identity.gitSha,plan.head);assert.equal(identity.artifactSha256,plan.artifact);assert.equal(identity.sourceDirty,false);
  const closurePath=binding.closure?.path;
  assert(typeof closurePath==='string'&&isAbsolute(closurePath),'FULL4 preflight closure path required');
  assert.notEqual(closurePath,plan.preflightProgress,'FULL4 preflight closure must be a separate command receipt');
  const closure=JSON.parse(pinnedBytes(binding.closure,closurePath,'preflight closure'));
  assert.equal(closure.schemaVersion,1);assert.equal(closure.kind,'bunki-full4-preflight-closure');
  assert.equal(closure.scope,'preflight-command-exit-and-no-active-gates');
  assert.equal(closure.status,'closed');assert.equal(closure.exitCode,0,'FULL4 preflight command did not exit successfully');
  assert.deepEqual(closure.argv,plan.preflight,'FULL4 preflight command argv differs');assert.equal(closure.cwd,plan.cwd);
  assert.deepEqual(closure.progress,binding.progress,'FULL4 closure binds a different preflight progress');
  assert.deepEqual(closure.active,[],'FULL4 preflight closure has active gates');
  const commandStarted=Date.parse(closure.startedAt),commandCompleted=Date.parse(closure.completedAt);
  assert(Number.isFinite(commandStarted)&&Number.isFinite(commandCompleted)&&commandStarted<=started&&commandCompleted>=completed,'FULL4 preflight command times do not enclose progress');
  return {status:'completed-preflight-bindings-passed-only',launchAuthorized:false,head:plan.head,artifact:plan.artifact,
    preflightOut:routes.preflightOut,progress:binding.progress,closure:binding.closure,scope:closure.scope};
}
export function validateRuntime(plan) {
  assert.equal(plan.status,'RELEASED','FULL4 packet is prepared, not released');
  const preflight=validateCompletedPreflight(plan);
  for(const key of ['leadRelease','w2LaunchKey','slotRelease','custodyRecovery']) {
    const pin=plan[key]; assert(pin?.path&&pin.sha256,`${key} exact binding required`);
    assert.equal(hash(pin.path),pin.sha256,`${key} binding changed`);
  }
  for(const [path,want] of Object.entries(plan.pins))assert.equal(hash(path),want,'FULL4 packet pin changed: '+path);
  const source=inspectMaterialization({head:plan.head,tree:plan.tree,worktree:plan.cwd});
  assert.equal(source.status,'tracked-materialization-passed','FULL4 materialization incomplete');
  const current=currentFootprintPins(SUCCESSOR_TOOLS,plan.cwd);
  assert(/^[a-f0-9]{64}$/.test(plan.artifact),'FULL4 artifact unbound');
  const contract=json(plan.contract),review=json(plan.review),identity=json(join(plan.site,'build-identity.json'));
  assert.equal(contract.sourceHead,plan.head);assert.equal(contract.artifactSha256,plan.artifact);
  assert.equal(identity.gitSha,plan.head);assert.equal(identity.artifactSha256,plan.artifact);assert.equal(identity.sourceDirty,false);
  assert.equal(review.status,'approved');assert.equal(review.contractSha256,hash(plan.contract));
  assert.equal(review.sourceHead,plan.head);assert.equal(review.artifactSha256,plan.artifact);
  assert.equal(review.footprint.status,'approved');assert.equal(review.footprint.retentionMode,'keep-all');
  assert.equal(review.footprint.scope,'keep-all-no-deletion');assert.deepEqual(review.footprint.pins,current);
  return {status:'runtime-bindings-passed; fresh resource admission still required',preflight};
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  const [mode,path]=process.argv.slice(2);assert.equal(process.argv.length,4,'explicit mode and bound input required');
  if(mode==='--runtime') console.log(JSON.stringify(validateRuntime(json(path))));
  else if(mode==='--completed-preflight') console.log(JSON.stringify(validateCompletedPreflight(json(path))));
  else if(mode==='--fresh-admission') console.log(JSON.stringify(validateAdmissionReceipt(json(path),{nowMs:Date.now()})));
  else {assert.equal(mode,'--prepared');console.log(JSON.stringify(validatePreparedRoutes(json(path))));}
}
