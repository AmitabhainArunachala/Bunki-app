/** The reader producer's restore-byte loop and final receipt, exercised without launching another full browser run. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {restoreServedDigests,readerDoorsReceipt,READER_D1_DAY} from './vh-learning-contracts.mjs';
import {learningReportContracts,READER_CASES,READER_D1_DAY as ADMITTED_D1_DAY} from '../../../scripts/ci/vh-learning-report-contracts.mjs';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const cases=[['corridor.js',Buffer.from('fixture restored application bytes')],['data/articles/aozora-046605.json',Buffer.from('{"tokens":[{"reading":"たにがわ"}]}')]];
async function exercise(manifest){
 const fetched=[],served=[];
 await restoreServedDigests({files:[...cases.map(([file])=>file),'corridor.js'],manifest,served,fetchBytes:async file=>{fetched.push(file);const bytes=cases.find(([path])=>path===file)?.[1];assert(bytes,'requested only declared restored files');return bytes;}});
 return {fetched,served};
}
const identity={gitSha:'a'.repeat(40),artifactSha256:'b'.repeat(64)};
const receipt=(extra={})=>readerDoorsReceipt({runId:'gate-run',servedIdentity:identity,verifierGitSha:'a'.repeat(40),verifierSha256:'c'.repeat(64),engine:'chromium',browserVersion:'fixture-version',origin:'http://fixture',d1Day:READER_D1_DAY,
 results:[{name:'D0 served build is the expected clean commit',pass:true},{id:'D2.fixture',name:'fixture',pass:true}],controls:[{name:'m8',verdict:'killed'},{name:'r1',verdict:'killed'}],pageErrors:[],expectedControls:2,lastCase:'D6',...extra});
test('actual restored-byte loop retains exact SHA per served file, once per file',async()=>{
 const manifest=new Map(cases.map(([path,bytes])=>[path,sha256(bytes)]));
 const {served,fetched}=await exercise(manifest);
 assert.deepEqual(fetched,cases.map(([path])=>path));
 assert.deepEqual(served,cases.map(([file,bytes])=>({file,sha256:sha256(bytes)})));
});
test('actual restored-byte loop rejects a changed body or missing manifest digest',async()=>{
 for(const manifest of [new Map(cases.map(([path])=>[path,'0'.repeat(64)])),new Map()])await assert.rejects(()=>exercise(manifest),/restore digest mismatch: corridor\.js/u);
});
test('final reader receipt binds run, served identity, verifier and the declared D1 day, and claims acceptance only for a complete clean run',()=>{
 const good=receipt();
 assert.equal(good.fullAcceptance,true);
 assert.deepEqual([good.schema,good.runId,good.gitSha,good.artifactSha256,good.verifierSha256,good.d1Day],['vh-reader-doors/1','gate-run','a'.repeat(40),'b'.repeat(64),'c'.repeat(64),READER_D1_DAY]);
 assert.deepEqual(JSON.parse(JSON.stringify(good)),good);
 for(const extra of [{results:[]},{results:[{name:'x',pass:true},{name:'y',pass:false}]},{pageErrors:[{message:'boom'}]},{controls:[{name:'m8',verdict:'killed'}]},{controls:[{name:'m8',verdict:'killed'},{name:'r1',verdict:'incomplete'}]},{expectedControls:0,controls:[]},{runId:''},{runId:undefined},{servedIdentity:null},{servedIdentity:{gitSha:'short',artifactSha256:'b'.repeat(64)}},{verifierSha256:'C'.repeat(64)}])
  assert.equal(receipt(extra).fullAcceptance,false,JSON.stringify(Object.keys(extra)));
});
test('the producer and the independent admission declare the same D1 day',()=>{
 assert.equal(READER_D1_DAY,ADMITTED_D1_DAY);
 const report=receipt({results:READER_CASES.map(id=>({id,pass:true}))});
 const judged=learningReportContracts['reader-doors'].validate(report,{engine:'chromium',runId:'gate-run',gitSha:identity.gitSha,artifactSha256:identity.artifactSha256,verifierSha256:'c'.repeat(64)});
 assert(judged.errors.some(error=>/D1 1728: shelf not observed/u.test(error)),judged.errors.join(';'));
});
