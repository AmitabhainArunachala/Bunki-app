/** Real user queries against the built app. No source-shape assertions. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { startStaticHost } from '../../bunki-desktop/lib/static-host.cjs';
const parent = join(homedir(), '.dharma/bunki/app-finish-20261108/search/browser-runs');
mkdirSync(parent, {recursive:true});
const out = mkdtempSync(join(parent, 'check-'));
const site = process.env.KAIRO_SITE_DIR || join(out, 'site');
if (!process.env.KAIRO_SITE_DIR) execFileSync(process.execPath, ['scripts/build-corridor-site.mjs', '--out', site], {stdio:'inherit', timeout:180000});
const host = await startStaticHost({site,port:0});
const browser = await chromium.launch({headless:true});
const results = [];
try {
 for (const mode of ['worker', 'missing']) {
  const context = await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.addInitScript(() => {
   window.__inflectionReplies = [];
   const add = Worker.prototype.addEventListener;
   Worker.prototype.addEventListener = function(type, listener, options) {
    return add.call(this,type,type==='message' ? function(event) {
     if (event.data?.result?.performance?.query) window.__inflectionReplies.push(event.data.result);
     return typeof listener === 'function' ? listener.call(this,event) : listener.handleEvent(event);
    } : listener, options);
   };
  });
  await context.route('**/*',route=> {
   const u=new URL(route.request().url());
   if(u.origin!==host.origin)return route.abort();
   if(mode==='missing' && u.pathname==='/data/share_alike/dict-v2/index.json')return route.fulfill({status:503,body:'unavailable'});
   return route.continue();
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(host.origin+'/index.html?entry=shelf&ui=bi');
  await page.waitForFunction(()=>document.body.dataset.ready==='1');
  await page.locator('#chrome-search').click();
  const examples=[['食べました','食べる'],['行った','行く'],['読んで','読む'],['書かなかった','書く'],['高かった','高い']];
  for(const [query,lemma] of examples){
   await page.locator('#nav-search-input').fill(query);
   await page.waitForFunction(lemma=>[...document.querySelectorAll('.nav-search-row .nsr-glyph')].some(e=>e.textContent===lemma),lemma,{timeout:12000});
   if(mode==='worker')await page.waitForFunction(({query,lemma})=>window.__inflectionReplies.some(r=>r.performance.query===query && r.results.some(x=>x.result.w===lemma)),{query,lemma},{timeout:15000});
   results.push({mode,query,lemma,found:true});
  }
  for(const exact of ['食べる','行く','学校','生物']){
   await page.locator('#nav-search-input').fill(exact);
   await page.waitForFunction(exact=>document.querySelector('.nav-search-row .nsr-glyph')?.textContent===exact,exact,{timeout:10000});
   results.push({mode,exact,first:true});
  }
  await page.locator('#nav-search-input').fill('zzzzzznotaword');
  await page.waitForFunction(()=>document.querySelectorAll('.nav-search-row').length===0,null,{timeout:10000});
  await page.locator('#nav-search-input').fill('食べました');
  const row=page.locator('.nav-search-row').filter({has:page.locator('.nsr-glyph',{hasText:/^食べる$/u})}).first();
  await row.click();
  await page.waitForFunction(()=>document.querySelector('#sheet')?.dataset.node?.startsWith('word:食べる'));
  assert.match(await page.locator('#sheet').innerText(),/食べる/u);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:join(out,mode+'-entry.png')});
  await context.close();
 }
 console.log(JSON.stringify({pass:true,results,out}));
} catch(error) {
 writeFileSync(join(out,'failure.txt'),String(error.stack));
 throw error;
} finally {
 writeFileSync(join(out,'results.json'),JSON.stringify(results,null,2));
 await browser.close();await host.close();
}
