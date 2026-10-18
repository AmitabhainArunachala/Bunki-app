// Real packaged dictionary and shared host store, synthetic public passage.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chromium,webkit} from 'playwright-core';
import {fixture,enrichmentFixture} from './personal-fixture.mjs';
import {resolveCorridorEvidence,resolveCorridorSite} from '../../../scripts/resolve-corridor-site.mjs';
const root=resolveCorridorSite();
const evidence=resolveCorridorEvidence(),runId=process.env.KAIRO_GATE_RUN_ID||randomUUID();
const identity=JSON.parse(readFileSync(path.join(root,'build-identity.json')));
let receiptResult=null,receiptError=null,browser;
const browserName=process.env.PERSONAL_HOST_BROWSER||'chromium';
let releaseDictionary;
let dictionaryPending=false;
const dictionaryWait=new Promise(resolve=>{releaseDictionary=resolve;});
const server=createServer(async(req,res)=>{try{
 const requestPath=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const f=path.resolve(root,'.'+(requestPath.endsWith('/')?requestPath+'index.html':requestPath));
 if(!f.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 if(requestPath.endsWith('/dict-v2/index.json')){dictionaryPending=true;await dictionaryWait;}
 const data=await readFile(f);
 res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.woff2':'font/woff2'})[path.extname(f)]||'application/octet-stream');
 res.end(data);
}catch{res.writeHead(404);res.end('missing');}});
try {
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
assert(['chromium','webkit'].includes(browserName),'Unknown host browser');
browser=await (browserName==='webkit'?webkit:chromium).launch({headless:true,...(browserName==='chromium'&&process.env.PERSONAL_CHROMIUM?{executablePath:process.env.PERSONAL_CHROMIUM}:{})});
// Read committed rows independently of the host's in-memory publication. The
// legacy localStorage record is no longer the shared learner write target.
async function sharedRecord(page) {
 return JSON.parse(await page.evaluate(async()=>{
  const binding=JSON.parse(localStorage.getItem('kairo-local-record-binding-v1'));
  if(!binding?.databaseName)throw new Error('The shared learner installation has not opened');
  const db=await new Promise((resolve,reject)=>{
   const request=indexedDB.open(binding.databaseName);
   request.onupgradeneeded=()=>{request.transaction.abort();reject(new Error('Expected an existing shared learner database'));};
   request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  try {
   const rows=await new Promise((resolve,reject)=>{
    const tx=db.transaction('kairo_replication_rows','readonly');
    const request=tx.objectStore('kairo_replication_rows').getAll();
    tx.oncomplete=()=>resolve(request.result);tx.onabort=()=>reject(tx.error);
   });
   const document=rows.filter(row=>row.kind==='document').map(row=>JSON.parse(row.text))
    .find(row=>row.collection==='learner-record'&&row.id==='current');
   if(!document)throw new Error('No committed shared learner record');
   return JSON.stringify(document.value);
  } finally {db.close();}
 }));
}
 const page=await browser.newPage({viewport:{width:390,height:844}}), errors=[],reqs=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>reqs.push({url:r.url(),method:r.method()}));
 await page.goto(origin+'/?deck=personal');
 const data=await fixture();data.enrichment=await enrichmentFixture(data);
 await page.locator('.pc-file').setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
 await page.locator('[data-action="confirm-import"]').click();await page.locator('[data-card]').waitFor();
 assert.equal(reqs.filter(r=>/\/data\/share_alike\/(dict\.json|dict-v2\/)/u.test(r.url)).length,0,'the assessment front loads no dictionary');
 assert.equal(dictionaryPending,false,'the assessment front starts no full-dictionary worker request');
 const before=await page.evaluate(async id=>{window.privateRoot=document.querySelector('.pc');const {openStore}=await import('./decks/personal/store.mjs');let s=await openStore();let r=await s.get(id);s.close();return {id:document.querySelector('[data-card]').dataset.card,progress:JSON.stringify(r.progress)};},data.id);
 await page.locator('[data-action="reveal"]').click();await page.locator('.pc-japanese [data-lookup]').first().waitFor();
 await page.locator('.pc-answer-tools [data-lookup]').filter({hasText:'図書館'}).first().click();await page.locator('#sheet').waitFor();
 assert.equal(await page.locator('#sheet .headword').innerText(),'図書館');
 assert.equal(await page.locator('#sheet .gloss').first().isVisible(),false);
 await page.locator('.personal-dictionary-meaning > summary').click();assert((await page.locator('#sheet .senses').innerText()).includes('library'));
 assert.equal((await sharedRecord(page)).taken.length,0,'dictionary lookup does not enroll a card');
 // S · the page keeps through its one Save in the bar (#sheet-take): one press keeps and opens its own menu (review, lists, Copy)
 // as a drawer under the bar; it pinned the foot's #take and a list popover that opened only on request
 await page.locator('#sheet-take').click();
 await page.locator('#sheet-take[aria-pressed="true"]').waitFor();
 assert.equal(await page.locator('#take-chooser, #take-save, #take').count(),0,'Save commits in one tap without a destination chooser, and the page has one Save');
 await page.locator('#vocabulary-list-popover.is-drawer').waitFor();
 await page.keyboard.press('Escape');
 const savedWord=(await sharedRecord(page)).taken.find(t=>t.t==='word'&&t.id==='図書館');
 assert(savedWord,'one tap saves the canonical word to the shared learner record');
 assert(Number.isFinite(savedWord.started),'one-tap 覚える keeps the host explicit-review enrollment contract');
 assert.equal(savedWord.from,null);assert.equal(savedWord.ctx,undefined);assert.equal(savedWord.sourceContextRef,undefined);
 // S · the lists live in the one Save's menu (it pinned the foot's "Add to list…", #personal-add-list): Saved ✓ opens it,
 // and its New list… asks the name once
 await page.locator('#sheet-take').click();
 await page.locator('#vocabulary-list-popover.is-drawer #vocabulary-list-new').click();
 await page.locator('#vocabulary-list-name').fill('Synthetic host list');
 await page.locator('#sheet .dictionary-opening').waitFor();
 assert(dictionaryPending,'the full dictionary is still loading when the list draft is entered');
 releaseDictionary();await page.locator('#sheet .dictionary-opening').waitFor({state:'detached'});
 assert.equal(await page.locator('#vocabulary-list-name').inputValue(),'Synthetic host list','a background dictionary refresh must preserve the typed list name');
 await page.locator('#vocabulary-list-create').click();
 await page.locator('[data-list="Synthetic host list"]:checked').waitFor();
 const canonical=await sharedRecord(page);
 assert(canonical.taken.some(t=>t.id==='図書館'));assert(canonical.lists['Synthetic host list'].some(t=>t.id==='図書館'));
 assert.equal(canonical.taken.filter(t=>t.t==='word'&&t.id==='図書館').length,1,'adding a list does not duplicate the saved card');
 assert.deepEqual(canonical.taken.find(t=>t.t==='word'&&t.id==='図書館'),savedWord,'list membership preserves the enrolled card');
 assert.deepEqual(canonical.srs,{});assert.deepEqual(canonical.revlog,[]);
 // S · in the Save's menu the name field folds back into its row once the list is made, and the keyboard stays in the menu
 // on the new list's box, where Escape closes it (this pressed Escape in the old popover's always-open name field)
 await page.waitForFunction(()=>document.activeElement?.matches?.('#vocabulary-list-popover input[data-list="Synthetic host list"]'));
 await page.keyboard.press('Escape');await page.locator('#vocabulary-list-popover').waitFor({state:'detached'});
 await page.locator('[data-kanjirow="図"]').click();await page.locator('#sheet[data-node="kanji:図"]').waitFor();await page.locator('#sheet-back').click();await page.locator('#sheet[data-node="word:図書館"]').waitFor();
 await page.goBack();await page.locator('#sheet').waitFor({state:'detached'});
 assert.equal(new URL(page.url()).searchParams.get('deck'),'personal');
 const after=await page.evaluate(async id=>{const {openStore}=await import('./decks/personal/store.mjs');let s=await openStore();let r=await s.get(id);s.close();return {sameRoot:window.privateRoot===document.querySelector('.pc'),id:document.querySelector('[data-card]').dataset.card,progress:JSON.stringify(r.progress),inert:document.querySelector('.pc').inert};},data.id);
 assert(after.sameRoot);assert.equal(after.id,before.id);assert.equal(after.progress,before.progress);assert.equal(after.inert,false);
 await page.locator('.pc-answer-tools [data-lookup]').filter({hasText:'にあたって'}).first().click();await page.locator('#sheet[data-node^=\"grammar:\"]').waitFor();
 const grammarId=(await page.locator('#sheet').getAttribute('data-node')).slice('grammar:'.length);
 await page.locator('#sheet-take').click();
 await page.locator('#sheet-take[aria-pressed="true"]').waitFor();
 // S · the lists live in the one Save's menu (it pinned #personal-add-list): the press that kept the point opened it
 await page.locator('#vocabulary-list-popover.is-drawer').waitFor();await page.locator('[data-list="Synthetic host list"]').click();
 await page.locator('[data-list="Synthetic host list"]:checked').waitFor();
 await page.waitForFunction(()=>document.querySelector('.vocabulary-list-status')?.textContent.includes('Synthetic host list'));
 const grammarSaved=await sharedRecord(page);
 const grammarCard=grammarSaved.taken.find(t=>t.t==='grammar'&&t.id===grammarId);
 assert(grammarCard);assert(Number.isFinite(grammarCard.started));assert.equal(grammarCard.from,null);
 assert(grammarSaved.lists['Synthetic host list'].some(t=>t.t==='grammar'&&t.id===grammarId));
 assert.deepEqual(grammarSaved.srs,{});assert.deepEqual(grammarSaved.revlog,[]);
 // S · the keyboard is on the list's box it just ticked, in the menu; Escape closes it (the name field was never opened)
 await page.waitForFunction(()=>document.activeElement?.matches?.('#vocabulary-list-popover input[data-list="Synthetic host list"]'));
 await page.keyboard.press('Escape');await page.locator('#vocabulary-list-popover').waitFor({state:'detached'});
 await page.setViewportSize({width:1440,height:900});
 // S · the one Save toggles its own menu (it pinned #personal-add-list's popover): a press on Saved ✓ opens it, the next press
 // folds it — after the Save's breath (SAVE_PRESS_MS: a second press within it is the same press)
 await page.locator('#sheet-take').click();await page.locator('#vocabulary-list-popover').waitFor();
 await page.waitForTimeout(650);
 await page.locator('#sheet-take').click();
 assert.equal(await page.locator('#vocabulary-list-popover').count(),0,'pressing Save again folds its own menu');
 assert.equal(await page.locator('#sheet-take').getAttribute('aria-expanded'),'false');
 await page.setViewportSize({width:390,height:844});
 await page.locator('#sheet').press('Escape');await page.locator('#sheet').waitFor({state:'detached'});
 const finalProgress=await page.evaluate(async id=>{const {openStore}=await import('./decks/personal/store.mjs');const store=await openStore();try{return JSON.stringify((await store.get(id)).progress);}finally{store.close();}},data.id);
 assert.equal(finalProgress,before.progress,'word, grammar and list capture leave personal assessment history unchanged');
 assert.equal(reqs.filter(r=>/\/data\/articles\/index\.json$/u.test(new URL(r.url).pathname)).length,0,'the private deck loads no article index');
 assert(reqs.every(r=>r.method==='GET'));assert(reqs.every(r=>r.url.startsWith(origin)||r.url.startsWith('data:')));assert.deepEqual(errors,[]);
 receiptResult={status:'PASS',realCoreDictionary:true,sharedRememberAndNamedList:true,oneTapSave:true,optionalListPopover:true,addToListPointerToggle:true,dictionaryRefreshPreservesListDraft:true,explicitReviewEnrollment:true,recursiveKanjiBack:true,privateRootAndAssessmentPreserved:true,englishDeliberateReveal:true,frontLoadsNoDictionary:true,requestsAllSameOriginGet:true,deviceBackClosesHost:true,sharedGrammarCapture:true,errors};
}catch(error){receiptError=String(error.stack||error);process.exitCode=1;}finally{
 const receipt={...receiptResult,schemaVersion:2,runId,status:receiptError?'FAIL':receiptResult?.status||'FAIL',error:receiptError,completed:!!receiptResult&&!receiptError,
  engine:browserName,browserVersion:browser?.version()||null,artifactSha256:identity.artifactSha256,gitSha:identity.gitSha,
  verifierSha256:createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex')};
 writeFileSync(path.join(evidence,'personal-host.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
 releaseDictionary();await browser?.close();if(server.listening)await new Promise(r=>server.close(r));
}
