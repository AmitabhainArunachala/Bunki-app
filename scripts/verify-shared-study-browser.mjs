#!/usr/bin/env node
/** Headless, fresh browser profile only. No native app, screenshots or live data. */
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {startStaticHost} from '../prototypes/bunki-desktop/lib/static-host.cjs';
import {silenceBrowserAudio} from '../prototypes/corridor/tools/browser-audio-silence.mjs';
const site=process.env.KAIRO_SITE_DIR,out=process.env.KAIRO_EVIDENCE_DIR;
assert(site&&out,'Explicit built site and external evidence directory required');
assert(resolve(out).startsWith(`${process.env.HOME}/.dharma/`),'Evidence must remain outside checkout');
mkdirSync(out,{recursive:true});
const host=await startStaticHost({site,port:0});let browser;const receipt={checks:[],errors:[],sourceBuild:JSON.parse(readFileSync(resolve(site,'build-identity.json'))).artifactSha256};
try {
  browser=await chromium.launch({headless:true});receipt.browser=browser.version();
  const context=await browser.newContext({viewport:{width:1280,height:820},serviceWorkers:'block'});await silenceBrowserAudio(context);
  const page=await context.newPage();page.on('pageerror',e=>receipt.errors.push(e.message));
  await page.addInitScript(()=>{window.__legacyWrites=[];for(const method of['put','add','delete','clear']){const original=IDBObjectStore.prototype[method];IDBObjectStore.prototype[method]=function(...args){if(!this.transaction.db.name.startsWith('bunki-shared-study-'))window.__legacyWrites.push({database:this.transaction.db.name,store:this.name,method});return original.apply(this,args);};}if(window===window.top&&!localStorage.getItem('bunki-cloze:n2'))localStorage.setItem('bunki-cloze:n2','{"format":"synthetic-preserved-legacy","cards":{"not-a-frozen-task":{}}}');});
  const legacy=()=>page.evaluate(()=>({keys:Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('bunki-cloze:')||k==='kairo-corridor-v1')),writes:structuredClone(window.__legacyWrites)}));
  async function shared(deck){await page.goto(`${host.origin}/?deck=${deck}&sharedStudy=preview&ui=en`,{waitUntil:'domcontentloaded'});await page.locator('[data-shared-study-frame]').waitFor({timeout:60000});const frame=await(await page.locator('[data-shared-study-frame]').elementHandle()).contentFrame();assert(frame,'Canonical iframe must be mounted');await frame.waitForURL(/shared-frame\.html/);try{await frame.waitForFunction(()=>!!window.bunkiSharedStudy||!!document.querySelector('[role="alert"]'),null,{timeout:60000});assert(await frame.evaluate(()=>!!window.bunkiSharedStudy),await frame.locator('body').innerText());}catch(error){receipt.frameFailure={url:frame.url(),text:await frame.locator('body').innerText()};throw error;}return frame;}
  let frame=await shared('n2');const before=await legacy();
  assert.equal(await frame.evaluate(()=>bunkiSharedStudy.catalog.length),8508);
  await frame.locator('[data-start]').click();await frame.locator('[data-reveal]').click();await frame.locator('[data-grade="3"]').click();
  await frame.waitForFunction(()=>bunkiSharedStudy.backend.readProjection().reviews.length===1);
  assert.deepEqual(await legacy(),before);receipt.checks.push('normal-deck-route-mounts-canonical-ui','full-8508-catalog','grade-durable-with-no-legacy-write');
  const due=await frame.evaluate(()=>{const p=bunkiSharedStudy.backend.readProjection(),r=p.reviews[0];return {taskKey:r.taskKey,card:p.tasks[r.taskKey].card,event:r.id,installation:bunkiSharedStudy.backend.installation};});
  frame=await shared('n1');assert.equal(await frame.evaluate(()=>bunkiSharedStudy.backend.readProjection().reviews.length),1);assert.equal(await frame.evaluate(()=>Object.values(bunkiSharedStudy.backend.readProjection().permits).filter(p=>!p.usedBy).length),19);
  assert.deepEqual(await frame.evaluate(key=>bunkiSharedStudy.backend.readProjection().tasks[key].card,due.taskKey),due.card);receipt.checks.push('deck-switch-and-restart-retain-history-and-budget');
  frame=await shared('shared-grammar');await frame.locator('[data-start]').click();assert.equal(await frame.evaluate(()=>bunkiSharedStudy.app.read().current.entry.module),'grammar');
  assert(await frame.locator('.grammar-card').count()||await frame.locator('[class*="grammar"]').count(),'Canonical grammar face');
  await frame.locator('[data-reveal]').click();await frame.locator('[data-grade="3"]').click();await frame.waitForFunction(()=>bunkiSharedStudy.backend.readProjection().reviews.length===2);receipt.checks.push('canonical-grammar-renderer-grades-shared-ledger');
  const secondContract=await frame.evaluate(()=>{const last=bunkiSharedStudy.backend.readProjection().reviews.at(-1),first=bunkiSharedStudy.catalog.find(e=>e.taskKey===last.taskKey),wanted=first.contractId==='grammar.cloze.v1'?'grammar.meaning.v1':'grammar.cloze.v1';const entry=bunkiSharedStudy.catalog.find(e=>e.contractId===wanted&&bunkiSharedStudy.backend.queue({module:'grammar'}).some(x=>x.taskKey===e.taskKey));bunkiSharedStudy.app.showTask(entry);return wanted;});
  assert.equal(await frame.locator(secondContract==='grammar.meaning.v1'?'.grammar-pattern':'.grammar-cue').count(),1);
  await frame.locator('[data-reveal]').click();await frame.locator('[data-grade="3"]').click();await frame.waitForFunction(()=>bunkiSharedStudy.backend.readProjection().reviews.length===3);receipt.checks.push('meaning-and-cloze-use-their-own-canonical-fronts');
  await page.goto(`${host.origin}/?deck=kotoba&sharedStudy=preview&ui=en`,{waitUntil:'domcontentloaded'});await page.getByText('This practice contract is not mapped to shared study.').waitFor();receipt.checks.push('unmapped-legacy-deck-fenced');
  const response=await fetch(`${host.origin}/decks/player/shared-frame.html`);assert.equal(response.headers.get('content-security-policy'),"frame-ancestors 'self'");
  const other=await fetch(`${host.origin}/index.html`);assert.equal(other.headers.get('content-security-policy'),"frame-ancestors 'none'");receipt.checks.push('only-shared-frame-allows-same-origin-embedding');
  const offlineContext=await browser.newContext({viewport:{width:393,height:852}});await silenceBrowserAudio(offlineContext);const offlinePage=await offlineContext.newPage();
  await offlinePage.goto(`${host.origin}/?deck=n2&sharedStudy=preview`,{waitUntil:'domcontentloaded'});
  // The product auto-registers only on HTTPS; this isolated loopback fixture
  // explicitly exercises the exact stamped service worker from the built site.
  await offlinePage.evaluate(()=>navigator.serviceWorker.register('/sw.js'));
  await offlinePage.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:60000});
  await offlineContext.setOffline(true);await offlinePage.reload({waitUntil:'domcontentloaded'});
  await offlinePage.locator('[data-shared-study-frame]').waitFor({timeout:60000});const offlineFrame=await(await offlinePage.locator('[data-shared-study-frame]').elementHandle()).contentFrame();await offlineFrame.waitForURL(/shared-frame\.html/);
  await offlineFrame.waitForFunction(()=>!!window.bunkiSharedStudy||!!document.querySelector('[role="alert"]'),null,{timeout:60000});
  assert(await offlineFrame.evaluate(()=>!!window.bunkiSharedStudy),await offlineFrame.locator('body').innerText());receipt.checks.push('stamped-shared-module-and-full-content-reopen-offline');
  await offlineContext.close();
  assert.equal(receipt.errors.length,0,receipt.errors.join('\n'));receipt.status='passed';
} catch(error){receipt.status='failed';receipt.failure=error.stack;throw error;}
finally {writeFileSync(resolve(out,'browser.json'),JSON.stringify(receipt,null,2)+'\n');await browser?.close();await host.close();console.log(JSON.stringify(receipt));}
