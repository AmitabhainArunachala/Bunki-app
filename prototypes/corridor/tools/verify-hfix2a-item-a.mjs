/** Item A: device-local activity refuses cross-learner adoption, with exact bytes retained. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {chromium,webkit} from 'playwright-core';
import {startCorridorDev} from '../../../scripts/serve-corridor-dev.mjs';
import {resolveCorridorEvidence} from '../../../scripts/resolve-corridor-site.mjs';
import {readAppRecordSnapshot} from './record-test-support.mjs';
import {restoreAppFixture,selectBackupFile} from './record-fixture-support.mjs';
import {fixture} from './personal-fixture.mjs';
const engine=process.env.KAIRO_BROWSER, mode=process.env.HFIX2A_MODE||'branch';
assert(['webkit','chromium'].includes(engine));assert(['base','branch','control'].includes(mode));
const out=resolveCorridorEvidence();mkdirSync(out,{recursive:true});
const identity=JSON.parse(readFileSync(join(process.env.KAIRO_SITE_DIR,'build-identity.json')));
const host=await startCorridorDev(0), browser=await ({webkit,chromium}[engine]).launch();
const hash=s=>createHash('sha256').update(s).digest('hex'), uptime=()=>execFileSync('uptime',{encoding:'utf8'}).trim();
const report={engine,mode,identity,rows:[],mutations:[],errors:[],uptimeStart:uptime()};
const file=b=>({name:'item-a.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(b))});
async function ready(page){await page.waitForFunction(()=>document.body.dataset.ready==='1');}
async function open(mutant=false){
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.route('**/*',r=>new URL(r.request().url()).origin===host.origin?r.continue():r.abort());
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(String(e)));
 if(mutant)await page.route('**/corridor.js',async r=>{const response=await r.fetch(),original=await response.text();
  const seam='async function emptyRecordForAdoption(snapshot) {';assert.equal(original.split(seam).length,2);
  const body=original.replace(seam,seam+'\n  return true; // deliberate activity-blind control');
  report.mutations.push({original:hash(original),served:hash(body)});await r.fulfill({response,body});});
 await page.goto(host.origin+'/index.html?entry=shelf&ui=bi');await ready(page);
 return {context,page};
}
async function tray(page){await page.locator('#tray').click();await page.locator('#import-file').waitFor({state:'attached'});}
async function seed(page,kind){
 const collection=kind==='personal'?await fixture():null;
 return page.evaluate(async({kind,collection})=>{
  if(kind==='context'){
   const e=await import('./decks/context-dense/engine.js'),api=await import('./vendor/ts-fsrs.mjs');
   const deck=await(await fetch('decks/context-dense/deck.json')).json(),pin=await(await fetch('data/fsrs-pin.json')).json();
   const state=e.grade(api,e.createScheduler(api,pin),e.emptyState(deck.id),deck.cards[0].id,e.RATINGS.good,new Date('2026-10-19T01:00:00.000Z'));
   if(Object.keys(state.cards).length!==1)throw Error('one context review');
   localStorage.setItem('bunki-srs-deck:'+deck.id,JSON.stringify(state));
  }else if(kind==='guided'){
   const e=await import('./guided-session-engine.mjs'),id='kairo-guided-n2-living-thread-01',q='kairo-original-jlpt-n2-short-01:q01';
   let state=e.createGuidedState(id,[q]);state=e.reduceGuidedState(state,{type:'START',ts:1700000000000});
   state=e.reduceGuidedState(state,{type:'COMMIT',id:q,choice:0,correct:true,ts:1700000000001});
   if(state.answers[q].choice!==0)throw Error('one guided answer');
   if(!e.saveGuidedState(localStorage,'kairo-guided-session-v1:'+id,state).ok)throw Error('guided save');
  }else if(kind==='personal'||kind==='empty-personal'){
   const {openStore}=await import('./decks/personal/store.mjs');const store=await openStore();
   try{if(collection){const {createEngine}=await import('./decks/personal/engine.mjs'),api=await import('./vendor/ts-fsrs.mjs');
    const progress=createEngine(collection,api).fresh('item-a-device');await store.update(collection.id,null,()=>({id:collection.id,collection,progress}));}}
   finally{store.close();}
  }
 },{kind,collection});
}
async function external(page){return page.evaluate(async()=>{
 const local=Object.fromEntries(Object.entries(localStorage).filter(([k])=>/^(bunki-srs-deck:|kairo-guided-session-v1:)/u.test(k)));
 const names=(await indexedDB.databases()).map(d=>d.name).sort();let personal=null;
 if(names.includes('bunki-personal-collections-v1')){const {openStore}=await import('./decks/personal/store.mjs');const s=await openStore();try{personal=await s.list();}finally{s.close();}}
 return {local,personal,personalDb:names.includes('bunki-personal-collections-v1')};
});}
function check(name,pass,observed){report.rows.push({name,pass:!!pass,observed,uptime:uptime()});console.log(`${pass?'PASS':'RED'} ${name}`);}
try{
 const donor=await open();let backup;
 try{
  const initial=await readAppRecordSnapshot(donor.page);
  const journal=await donor.page.evaluate(async()=>{
   const core=await import('./modules/record-core.mjs'),installation=JSON.parse(localStorage.getItem('kairo-local-record-binding-v1'));
   const policy={binding:installation.binding,schemaEpoch:1,deletionEpoch:0,mergePolicy:'kairo-conservative-merge/1'};
   const store=await core.IndexedDbReplicationStore.open({databaseName:'item-a-donor:'+crypto.randomUUID(),policy,actor:{deviceId:'item-a-donor',incarnationId:crypto.randomUUID()}});
   try{await store.commitLocal({changeId:'item-a-note',binding:policy.binding,expectedRevision:(await store.snapshot()).revision,occurredAt:'2026-10-19T01:00:00.000Z',mutations:[],operations:[{dependencies:[],payload:{kind:'note.version',noteId:'item-a-note',versionId:'item-a-v1',generation:null,supersedes:[],segments:[{kind:'original',text:'Item A donor note.'}]}}]});return core.exportOperationJournal((await store.snapshot()).replica);}finally{await store.close();}
  });
  await restoreAppFixture(donor.page,{...initial.record,taken:[{t:'word',id:'元気',ts:1700000000000}]},{journal});
  await tray(donor.page);const downloading=donor.page.waitForEvent('download');await donor.page.locator('#export-store').click();
  const path=join(out,'donor.json');await(await downloading).saveAs(path);backup=JSON.parse(readFileSync(path));assert.equal(backup.version,2);
 }finally{await donor.context.close();}
 for(const kind of ['context','guided','personal','fresh','empty-personal','cancel']){
  const {context,page}=await open(mode==='control'&&['context','guided','personal'].includes(kind));
  try{
   await seed(page,kind);await tray(page);const before=await readAppRecordSnapshot(page),stores=await external(page),pointer=await page.evaluate(()=>localStorage.getItem('kairo-local-record-binding-v1'));let dialogs=0;
   page.on('dialog',()=>dialogs++);
   if(kind==='cancel'){
    const databases=await page.evaluate(async()=>(await indexedDB.databases()).map(d=>d.name).sort());
    const dialog=page.waitForEvent('dialog');await page.locator('#import-file').setInputFiles(file(backup));await(await dialog).dismiss();
    await page.waitForFunction(()=>!document.querySelector('#import-store').disabled);
    check(kind,dialogs===1&&JSON.stringify(await readAppRecordSnapshot(page))===JSON.stringify(before)&&JSON.stringify(await external(page))===JSON.stringify(stores)&&JSON.stringify(await page.evaluate(async()=>(await indexedDB.databases()).map(d=>d.name).sort()))===JSON.stringify(databases),{dialogs,stores});
    continue;
   }
   await selectBackupFile(page,file(backup));
   await page.waitForFunction(old=>localStorage.getItem('kairo-local-record-binding-v1')!==old||!!document.querySelector('#record-portability-status')?.textContent,pointer);
   // Import completion is signalled by a refused status or the navigation to the new binding.
   await page.waitForLoadState('load');await ready(page);
   const after=await readAppRecordSnapshot(page),afterStores=await external(page),status=await page.evaluate(()=>document.querySelector('#record-portability-status')?.textContent||'');
   const refused=['context','guided','personal'].includes(kind);
   check(kind,refused?dialogs===0&&/different learner/u.test(status||'')&&JSON.stringify(after)===JSON.stringify(before)&&JSON.stringify(afterStores)===JSON.stringify(stores):dialogs===1&&after.installation.binding.learnerId!==before.installation.binding.learnerId&&JSON.stringify(after.record)===JSON.stringify(backup.record)&&JSON.stringify(afterStores)===JSON.stringify(stores),{dialogs,status,before,after,stores,afterStores});
   await page.screenshot({path:join(out,kind+'.png')});
  }finally{await context.close();}
 }
}catch(error){report.errors.push(error.stack);console.error(error);}
finally{await browser.close();await host.close();}
report.pass=report.rows.length===6&&!report.errors.length&&report.rows.every(r=>['context','guided','personal'].includes(r.name)&&mode!=='branch'?!r.pass:r.pass);
report.uptimeEnd=uptime();report.verifierSha256=hash(readFileSync(new URL(import.meta.url)));
writeFileSync(join(out,'result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass:report.pass,errors:report.errors}));process.exitCode=report.pass?0:1;
