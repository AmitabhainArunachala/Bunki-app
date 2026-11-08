#!/usr/bin/env node
/** Fresh synthetic browser profile; actual Corridor routes, never live learner data. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {startStaticHost} from '../prototypes/bunki-desktop/lib/static-host.cjs';
import {verifyEngineDistribution} from '../prototypes/corridor/vendor/shared-study-engine/tools/verify_engine.mjs';

const site=process.env.BUNKI_QA_SITE, out=process.env.BUNKI_QA_EVIDENCE;
assert(site&&out,'BUNKI_QA_SITE and BUNKI_QA_EVIDENCE required');
assert(resolve(out).startsWith('/Users/dhyana/.dharma/'),'External runtime evidence required');
const require=createRequire(resolve(process.env.BUNKI_DEPENDENCY_ROOT||'.','package.json'));
const {chromium}=require('playwright-core');
const html=readFileSync(resolve(site,'index.html'),'utf8');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const derivation=JSON.parse(readFileSync(resolve(site,'qa-host-receipt.json')));
assert.equal(hash(Buffer.from(html)),derivation.derivedIndex.sha256,'QA entry must match derivation receipt');
for(const module of derivation.modules){
 assert.equal(hash(readFileSync(resolve(site,module.path))),module.sha256,`QA overlay differs from receipt: ${module.path}`);
 assert.equal(hash(readFileSync(new URL(`../prototypes/corridor/${module.path}`,import.meta.url))),module.sha256,`QA overlay differs from selected source: ${module.path}`);
}
const expectedClosure=process.env.BUNKI_QA_ENGINE_CLOSURE;
assert(expectedClosure,'Explicit independently selected BUNKI_QA_ENGINE_CLOSURE required');
const engine=verifyEngineDistribution(resolve(site,'vendor/shared-study-engine'),{expectedClosureSha256:expectedClosure});
assert.match(html,/shared-study-test-bootstrap\.mjs/);
assert(!html.includes('sharedStudy=preview'));
const host=await startStaticHost({site:resolve(site),port:0});
const receipt={kind:'isolated-ordinary-corridor-route-proof',site:resolve(site),derivationSha256:hash(readFileSync(resolve(site,'qa-host-receipt.json'))),engine:{closure:engine.closureSha256,source:engine.source},checks:[],errors:[],routes:[]};
let browser;
let page;
const profile=resolve(out,'synthetic-browser-profile');
assert(!existsSync(profile),'Fresh synthetic profile required; choose a new evidence directory');
mkdirSync(out,{recursive:true});
try{
 const launch=async()=>{
  const context=await chromium.launchPersistentContext(profile,{headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,viewport:{width:1280,height:820},serviceWorkers:'block'});
  browser=context.browser();
  await context.route('**/*',route=>route.request().url().startsWith(host.origin+'/')?route.continue():route.abort());
  await context.addInitScript(()=>{
  globalThis.__qaLegacyWrites=[];
  const set=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
   if(key.startsWith('bunki-cloze:')||key==='kairo-corridor-v1')globalThis.__qaLegacyWrites.push({kind:'localStorage',key,value});
   return set.call(this,key,value);
  };
  for(const method of ['put','add','delete','clear']){
   const operation=IDBObjectStore.prototype[method];
   IDBObjectStore.prototype[method]=function(...args){
    if(!this.transaction.db.name.startsWith('bunki-shared-study-qa-'))globalThis.__qaLegacyWrites.push({kind:'indexedDB',database:this.transaction.db.name,store:this.name,method});
    return operation.apply(this,args);
   };
  }
  });
  return context;
 };
 let context=await launch();
 receipt.browser=browser.version();
 page=await context.newPage();
 page.on('pageerror',error=>receipt.errors.push(error.message));
 async function route(deck){
  await page.goto(`${host.origin}/?deck=${deck}&ui=en`,{waitUntil:'domcontentloaded'});
  await page.locator('[data-shared-study-frame]').waitFor({timeout:90000});
  const frame=await(await page.locator('[data-shared-study-frame]').elementHandle()).contentFrame();
  await frame.waitForFunction(()=>!!window.bunkiSharedStudy||!!document.querySelector('[role=alert]'),null,{timeout:90000});
  assert(await frame.evaluate(()=>!!window.bunkiSharedStudy),await frame.locator('body').innerText());
  assert.equal(await page.evaluate(()=>new URL(location.href).searchParams.has('sharedStudy')),false);
  const identity=await frame.evaluate(()=>({...frameElement.bunkiStudyPort.adapter.identity}));
  assert.equal(identity.learner,'test-shared-audio');
  assert.equal(identity.environment,'test-shared-audio');
  assert.match(identity.installation,/^test-shared-audio-bunki-/);
  return {frame,identity};
 }
 let first=null;
 for(const deck of ['n2','n1','senmon','kotoba-master','shared-grammar']){
  const {frame,identity}=await route(deck);
  assert.equal(await frame.evaluate(()=>bunkiSharedStudy.app.read().module),deck==='kotoba-master'?'kotoba':deck==='shared-grammar'?'grammar':deck);
  if(first)assert.equal(identity.installation,first.identity.installation);
  const before=await page.evaluate(()=>({writes:structuredClone(__qaLegacyWrites),ledgers:Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('bunki-cloze:')||k==='kairo-corridor-v1'))}));
  const count=await frame.evaluate(()=>bunkiSharedStudy.backend.readProjection().reviews.length);
  await frame.locator('[data-start]:not(:disabled)').click();
  await frame.locator('[data-reveal]').click();
  await frame.locator('[data-grade="3"]').click();
  await frame.waitForFunction(n=>bunkiSharedStudy.backend.readProjection().reviews.length===n+1,count);
  const after=await page.evaluate(()=>({writes:structuredClone(__qaLegacyWrites),ledgers:Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('bunki-cloze:')||k==='kairo-corridor-v1'))}));
  assert.deepEqual(after,before,'Mapped grade must not write any legacy ledger');
  const evidence=await frame.evaluate(()=>{
   const p=bunkiSharedStudy.backend.readProjection(),r=p.reviews.at(-1);
   return {review:r,task:p.tasks[r.taskKey],outcome:p.outcomes[r.id]};
  });
  evidence.status=await frame.evaluate(()=>bunkiSharedStudy.store.status());
  evidence.outbox=await frame.evaluate(()=>bunkiSharedStudy.store.outbox());
  assert.equal(evidence.status.pending,count+1);
  assert.equal(evidence.outbox.filter(r=>r.event.type==='review').length,count+1);
  assert.equal(evidence.review.rawRating,3);
  receipt.routes.push({deck,identity,...evidence,legacyBootstrapWrites:before.writes.map(({value,...row})=>row)});
  first||={identity};
 }
 receipt.checks.push('five-ordinary-query-routes-through-existing-corridor-router','canonical-reveal-and-grade-on-each-route','one-canonical-command-per-grade','no-legacy-grade-writes');
 const checkpoint=await page.evaluate(async()=>{const a=await(await import('./shared-study-runtime.mjs')).sharedStudyRuntime();return {identity:a.identity,projection:a.backend.readProjection(),status:await a.store.status(),outbox:await a.store.outbox()};});
 // Close the browser process, then reopen only this task's isolated profile.
 await context.close();
 context=await launch();
 const reopened=await context.newPage();
 await reopened.goto(`${host.origin}/?deck=n2&ui=en`);
 await reopened.locator('[data-shared-study-frame]').waitFor({timeout:90000});
 const restarted=await(await reopened.locator('[data-shared-study-frame]').elementHandle()).contentFrame();
 await restarted.waitForFunction(()=>!!window.bunkiSharedStudy,null,{timeout:90000});
 const retained=await restarted.evaluate(async()=>{const a=frameElement.bunkiStudyPort.adapter;return {identity:a.identity,projection:a.backend.readProjection(),status:await a.store.status(),outbox:await a.store.outbox()};});
 assert.equal(retained.identity.installation,checkpoint.identity.installation);
 assert.equal(retained.identity.mode,'open');
 assert.deepEqual(retained.projection,checkpoint.projection);
 assert.deepEqual(retained.outbox,checkpoint.outbox);
 receipt.checks.push('same-installation-and-exact-journal-reopened-after-browser-process-restart');
 receipt.restart={installation:retained.identity.installation,pending:retained.status.pending};
 await reopened.goto(`${host.origin}/?deck=kotoba&ui=en`);
 await reopened.waitForTimeout(800);
 assert.equal(await reopened.locator('[data-shared-study-frame]').count(),0);
 receipt.checks.push('unmapped-personal-route-does-not-mount-canonical-guess');
 assert.deepEqual(receipt.errors,[]);
 receipt.status='passed';
 await context.close();
}catch(error){receipt.status='failed';receipt.failure=error.stack;receipt.lastPage=page?{url:page.url(),body:await page.locator('body').innerText().catch(()=>null)}:null;process.exitCode=1;}
finally{await browser?.close();await host.close();writeFileSync(resolve(out,'ordinary-routes.json'),JSON.stringify(receipt,null,2));}
console.log(JSON.stringify({status:receipt.status,checks:receipt.checks,routes:receipt.routes.map(r=>r.deck),failure:receipt.failure}));
