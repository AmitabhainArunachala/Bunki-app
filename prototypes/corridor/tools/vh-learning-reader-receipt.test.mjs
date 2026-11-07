/** The reader producer's restore-delivery recorder and final receipt, exercised without launching another full browser run. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {serveRecorded,deliveredAsBuilt,readerDoorsReceipt,READER_D1_DAY} from './vh-learning-contracts.mjs';
import {learningReportContracts,READER_CASES,READER_D1_DAY as ADMITTED_D1_DAY} from '../../../scripts/ci/vh-learning-report-contracts.mjs';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const ORIGIN='http://127.0.0.1:4100';
const cases=[['corridor.js',Buffer.from('fixture restored application bytes')],['data/articles/aozora-046605.json',Buffer.from('{"tokens":[{"reading":"たにがわ"}]}')]];
function fakeContext(serve){
 const routes=[];
 return {routes,route:async(matcher,handler)=>{routes.push({matcher,handler});},
  async load(path,origin=ORIGIN){
   const url=new URL(path,origin), handlers=routes.filter(row=>row.matcher(url));
   if(!handlers.length)return {unrouted:true};
   const result={};
   await handlers.at(-1).handler({fetch:async()=>serve(url),fulfill:async(options)=>{result.fulfilled=options;},abort:async()=>{result.aborted=true;}});
   return result;
  }};
}
const server=url=>{const bytes=cases.find(([path])=>`/${path}`===url.pathname)?.[1];if(!bytes)throw new Error(`404 ${url.pathname}`);
 return {status:()=>200,body:async()=>bytes,headers:()=>({'content-type':'text/plain','content-length':String(bytes.length+7),'content-encoding':'gzip','cache-control':'no-cache'})};};
test('restore recorder serves each declared file unedited and records the digest of the exact bytes the page was given',async()=>{
 const delivered=[], context=fakeContext(server);
 await serveRecorded(context,{origin:ORIGIN,files:[...cases.map(([file])=>file),'corridor.js'],delivered});
 assert.equal(context.routes.length,2);
 const loads=[];
 for(const path of ['/corridor.js','/data/articles/aozora-046605.json','/corridor.js?v=2'])loads.push(await context.load(path));
 for(const [index,file] of ['corridor.js','data/articles/aozora-046605.json','corridor.js'].entries()){
  const bytes=cases.find(([path])=>path===file)[1];
  assert(loads[index].fulfilled.body.equals(bytes));
  assert.equal(loads[index].fulfilled.status,200);
  assert.deepEqual(loads[index].fulfilled.headers,{'content-type':'text/plain','cache-control':'no-cache'});
  assert.deepEqual(delivered[index],{file,status:200,sha256:sha256(bytes)});
 }
 for(const [path,origin] of [['/index.html',ORIGIN],['/corridor.js','http://127.0.0.1:9999'],['/modules/corridor.js',ORIGIN]])
  assert.deepEqual(await context.load(path,origin),{unrouted:true},`${origin}${path}`);
 assert.equal(delivered.length,3);
 const manifest=new Map(cases.map(([path,bytes])=>[path,sha256(bytes)]));
 assert.equal(deliveredAsBuilt({files:cases.map(([file])=>file),rows:delivered,manifest}),delivered);
});
test('restore recorder keeps a failed delivery as an error row, and the judge refuses foreign, missing, failed or partial deliveries',async()=>{
 const delivered=[], context=fakeContext(()=>{throw new Error('connection refused');});
 await serveRecorded(context,{origin:ORIGIN,files:['corridor.js'],delivered});
 assert.deepEqual(await context.load('/corridor.js'),{aborted:true});
 assert.equal(delivered[0].sha256,null); assert.match(delivered[0].error,/connection refused/u);
 const manifest=new Map(cases.map(([path,bytes])=>[path,sha256(bytes)]));
 const good=cases.map(([file,bytes])=>({file,status:200,sha256:sha256(bytes)}));
 const files=cases.map(([file])=>file);
 assert.throws(()=>deliveredAsBuilt({files:['corridor.js'],rows:delivered,manifest}),/corridor\.js: delivered bytes are not the manifest's/u);
 for(const [rows,pattern] of [
  [[],/corridor\.js was never delivered/u],
  [good.slice(1),/corridor\.js was never delivered/u],
  [good.map((row,i)=>i?row:{...row,sha256:'f'.repeat(64)}),/corridor\.js: delivered bytes/u],
  [good.map((row,i)=>i?row:{...row,status:304}),/corridor\.js: delivered bytes/u],
  [[...good,{...good[0],error:'aborted'}],/corridor\.js: delivered bytes/u],
  [[...good,{file:'speak.js',status:200,sha256:'a'.repeat(64)}],/outside the declared files/u],
 ]) assert.throws(()=>deliveredAsBuilt({files,rows,manifest}),pattern);
 assert.throws(()=>deliveredAsBuilt({files,rows:good,manifest:new Map()}),/delivered bytes/u);
});
const identity={gitSha:'a'.repeat(40),artifactSha256:'b'.repeat(64)};
const receipt=(extra={})=>readerDoorsReceipt({runId:'gate-run',servedIdentity:identity,verifierGitSha:'a'.repeat(40),verifierSha256:'c'.repeat(64),engine:'chromium',browserVersion:'fixture-version',origin:'http://fixture',d1Day:READER_D1_DAY,
 results:[{name:'D0 served build is the expected clean commit',pass:true},{id:'D2.fixture',name:'fixture',pass:true}],controls:[{name:'m8',verdict:'killed'},{name:'r1',verdict:'killed'}],pageErrors:[],expectedControls:2,lastCase:'D6',...extra});
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
test('reader receipt never promotes execution-failure markers or non-boolean mutant rows',()=>{
 for(const marker of [{skip:true},{skipped:true},{unexecuted:true},{timedOut:true},{harnessError:'setup failed'},{status:'not-run'}])for(const location of ['result','control','mutant-row','observation','restore','restore-row']){
  const input={results:[{id:'result',pass:true}],controls:[{name:'control',verdict:'killed',rows:[{id:'intended',pass:false,observed:{popup:null}}],restore:{rows:[{id:'intended',pass:true}]}}],expectedControls:1};
  assert.equal(receipt(input).fullAcceptance,true);
  const c=input.controls[0],target=location==='result'?input.results[0]:location==='control'?c:location==='mutant-row'?c.rows[0]:location==='observation'?c.rows[0].observed:location==='restore'?c.restore:c.restore.rows[0];
  Object.assign(target,marker);assert.equal(receipt(input).fullAcceptance,false,`${location}/${JSON.stringify(marker)}`);
 }
 for(const pass of [undefined,null,'skip',0])assert.equal(receipt({controls:[{name:'control',verdict:'killed',rows:[{id:'intended',pass}]}],expectedControls:1}).fullAcceptance,false);
});
