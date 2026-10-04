import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright-core';
import {fixture} from './personal-fixture.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const out=process.env.PERSONAL_QA_OUT || '/tmp/bunki-personal-qa';
const selected=(process.env.PERSONAL_BROWSERS || 'chromium,webkit').split(',');
assert(selected.length && selected.every(x=>['chromium','webkit'].includes(x)), 'Unknown browser selection');
await mkdir(out,{recursive:true});
const data=await fixture(), checks=[];
const server=createServer(async(req,res)=>{
  try {
    const requestPath=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(root,'.'+(requestPath.endsWith('/')?requestPath+'index.html':requestPath));
    if(!file.startsWith(root)){res.writeHead(403);res.end();return;}
    const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.woff2':'font/woff2','.png':'image/png'};
    res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
    res.end(await readFile(file));
  } catch {res.writeHead(404);res.end('not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`, url=origin+'/?deck=personal';
const payload=value=>({name:'collection.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
async function stored(page) {
  return page.evaluate(async id=>{
    const {openStore}=await import('./decks/personal/store.mjs');const s=await openStore();const r=await s.get(id);s.close();return r;
  },data.id);
}
async function importFile(page,value) {
  await page.locator('.pc-file').setInputFiles(payload(value));
  await page.locator('.pc-preview').waitFor();
  await page.locator('[data-action="confirm-import"]').click();
  await page.locator('[data-card]').waitFor();
}
async function openSaved(page) {await page.locator('[data-open]').click();await page.locator('[data-card]').waitFor();}
try {
  for(const [name,browserType] of [['chromium',chromium],['webkit',webkit]]) {
    if(!selected.includes(name)) continue;
    const browser=await browserType.launch({headless:true,...(name==='chromium'&&process.env.PERSONAL_CHROMIUM?{executablePath:process.env.PERSONAL_CHROMIUM}:{})});
    try {
      const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Tokyo',acceptDownloads:true});
      const page=await context.newPage(),errors=[],outbound=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('request',r=>{if(!r.url().startsWith(origin))outbound.push(r.url());assert.equal(r.method(),'GET','no content uploads');});
      await page.goto(url);await page.locator('.pc-file').waitFor({state:'attached'});
      await importFile(page,data);
      assert.equal((await stored(page)).progress.events.length,0);
      assert.equal(await page.locator('[data-grade]').count(),0);
      assert.equal((await page.locator('.pc-japanese').innerText()).split('。').length-1,3);
      checks.push(name+': full paragraph with no grade before reveal');
      for(const width of [320,390,1440]) {
        await page.setViewportSize({width,height:width>600?960:844});
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name}: overflow at ${width}`);
        await page.screenshot({path:path.join(out,`${name}-${width}-front.png`),fullPage:true});
      }
      await page.setViewportSize({width:390,height:844});
      const first=await page.locator('[data-card]').getAttribute('data-card');
      await page.locator('[data-action="reveal"]').click();
      assert(await page.locator('.pc-definition').isVisible());
      assert.equal((await stored(page)).progress.events.length,0);
      await page.screenshot({path:path.join(out,`${name}-390-answer.png`),fullPage:true});
      // Abort the real IndexedDB write path. The UI must retain this answer.
      await page.evaluate(()=>{window.savedPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('Injected full storage','QuotaExceededError');};});
      await page.locator('[data-grade="3"]').click();
      await page.waitForFunction(()=>document.querySelector('.pc-status').textContent.includes('Not saved'));
      assert.equal((await stored(page)).progress.events.length,0);
      assert.equal(await page.locator('[data-card]').getAttribute('data-card'),first);
      assert(await page.locator('[data-grade="3"]').isVisible());
      await page.evaluate(()=>{IDBObjectStore.prototype.put=window.savedPut;});
      await page.locator('[data-grade="3"]').click();
      await page.waitForFunction(()=>document.querySelector('.pc-status').textContent==='Review saved.');
      assert.equal((await stored(page)).progress.events.length,1);
      await page.reload();await openSaved(page);
      assert.notEqual((await page.locator('[data-card]').getAttribute('data-card')).split(':')[0],first.split(':')[0]);
      checks.push(name+': abort preserves answer; committed grade and sibling burial survive reload');
      await page.locator('[data-action="undo"]').click();
      await page.waitForFunction(()=>document.querySelector('.pc-status').textContent.includes('Original event preserved'));
      assert.equal((await stored(page)).progress.events.length,2);
      assert.equal(await page.locator('[data-card]').getAttribute('data-card'),first);
      checks.push(name+': durable undo preserves the original event');
      await page.locator('[data-screen="settings"]').click();
      await page.locator('.pc-file').setInputFiles(payload({}));
      await page.waitForFunction(()=>document.querySelector('.pc-status').textContent.includes('supported'));
      assert.equal((await stored(page)).progress.events.length,2);
      await page.locator('[data-screen="read"]').click();
      await page.locator('#pc-search').fill('図書館');
      assert.equal(await page.locator('.pc-tile').count(),8);
      await page.locator('.pc-tile').first().click();
      assert(await page.locator('.pc-translation').isVisible());
      assert.equal((await stored(page)).progress.events.length,2);
      await page.locator('[data-screen="connections"]').click();
      assert.equal(await page.locator('.pc-route').count(),1);
      checks.push(name+': malformed restore, free reading, search and routes preserve evidence');
      // Race two real windows against the same revision. Only one may commit.
      const second=await context.newPage();await second.goto(url);await openSaved(second);
      await page.locator('[data-screen="study"]').click();
      for(const p of [page,second])await p.locator('[data-action="reveal"]').click();
      await Promise.all([page.locator('[data-grade="3"]').click(),second.locator('[data-grade="3"]').click()]);
      await page.waitForTimeout(300);
      assert.equal((await stored(page)).progress.events.length,3);
      const messages=await Promise.all([page.locator('.pc-status').innerText(),second.locator('.pc-status').innerText()]);
      assert(messages.some(s=>s.includes('another window')));
      checks.push(name+': concurrent windows cannot overwrite or double-grade stale evidence');
      await second.close();
      await page.reload();await openSaved(page);
      await page.locator('[data-screen="settings"]').click();
      const download=page.waitForEvent('download');await page.locator('[data-action="export"]').click();
      const downloaded=await download; const exported=JSON.parse(await readFile(await downloaded.path(),'utf8'));
      assert.equal(exported.progress.events.length,3);assert.equal(exported.collection.lessons.length,8);
      const other=await browser.newContext({viewport:{width:390,height:844}}),otherPage=await other.newPage();
      await otherPage.goto(url);await importFile(otherPage,exported);
      assert.deepEqual((await stored(otherPage)).progress.events,exported.progress.events);
      await other.close();checks.push(name+': complete backup round-trips into a second device context');
      // Every palette comes from Bunki's existing public roster.
      assert.equal(await page.locator('.pc [data-theme]').count(),10);
      await page.locator('[data-theme="yoru"]').click();
      await page.screenshot({path:path.join(out,`${name}-390-settings-night.png`),fullPage:true});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.locator('[data-screen="study"]').click();
      // Explicit localhost registration tests production's HTTPS worker path.
      await page.evaluate(async()=>{await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;});
      await page.reload();await openSaved(page);
      await context.setOffline(true);
      await page.goto(url+'&cold=1');await openSaved(page);
      assert(await page.locator('.pc-japanese').isVisible());
      await page.locator('[data-action="reveal"]').click();await page.locator('[data-grade="3"]').click();
      await page.waitForFunction(()=>document.querySelector('.pc-status').textContent==='Review saved.');
      assert.equal((await stored(page)).progress.events.length,4);
      await context.setOffline(false);
      checks.push(name+': cold offline app route opens and commits a review');
      assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);
      checks.push(name+': no JavaScript exceptions or external requests');
      await context.close();
    } finally {await browser.close();}
  }
  await writeFile(path.join(out,'results.json'),JSON.stringify({status:'passed',browsers:selected,checks},null,2));
  console.log(JSON.stringify({passed:checks.length,checks},null,2));
} finally {server.close();}
