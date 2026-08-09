import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
const TARGET='/home/user/Bunki-app/.claude/worktrees/agent-a404bdb39d0981050/prototypes/corridor/corridor-standalone.html';
const html=readFileSync(TARGET);
const server=createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end(html);});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const base=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
const page=await ctx.newPage();
const errs=[];page.on('console',m=>m.type()==='error'&&errs.push(m.text()));page.on('pageerror',e=>errs.push('PE:'+e.message));
await page.goto(base,{waitUntil:'load'});await page.waitForTimeout(2200);
const cdp=await ctx.newCDPSession(page);const wait=ms=>page.waitForTimeout(ms);
const touch=(t,pts)=>cdp.send('Input.dispatchTouchEvent',{type:t,touchPoints:pts});
const clear=async()=>{try{await touch('touchEnd',[]);}catch{}};
await page.evaluate(`document.getElementById('enter-shelf-door')?.click()`); await wait(1200);
await page.locator('.shelf-item').first().click(); await page.waitForSelector('#reader button.tok',{timeout:20000}); await wait(1200);

const info=()=>page.evaluate(`(()=>{const s=document.getElementById('sheet');
 return {sheet:!!s,node:s?.dataset?.node??'',head:s?.querySelector('.headword')?.textContent??'',
  mini:!!document.getElementById('mini'), miniWord:document.querySelector('#mini .mini-word')?.textContent??'',
  particles:document.querySelectorAll('#reader .tok.particle').length};})()`);
console.log('before', await info());

const box=await page.locator('#reader .tok.particle').first().evaluate(n=>{const r=n.getClientRects()[0]??n.getBoundingClientRect();
 return {x:r.x+r.width/2,y:r.y+r.height/2,txt:n.textContent,cls:n.className,tag:n.tagName,w:r.width,h:r.height};});
console.log('target', box);

// A: CDP touch hold 2600ms
await clear();
await touch('touchStart',[{x:box.x,y:box.y}]);
await wait(600); console.log('  at 600ms', await info());
await wait(1700); console.log('  at 2300ms', await info());
await wait(500);
await touch('touchEnd',[]);
await wait(900);
console.log('A cdp-hold result', await info());

// B: Playwright mouse hold (pointer events with a real device)
await page.evaluate(`document.getElementById('mini')?.remove()`);
await page.locator('#sheet-close').click({timeout:1000}).catch(()=>{});
await wait(500);
const b2=await page.locator('#reader .tok.particle').first().evaluate(n=>{const r=n.getClientRects()[0]??n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
await page.mouse.move(b2.x,b2.y); await page.mouse.down(); await wait(2600); await page.mouse.up(); await wait(900);
console.log('B mouse-hold result', await info());

// C: the mini quick-look's own 助詞へ button
await page.evaluate(`document.getElementById('mini')?.remove()`);
await page.locator('#sheet-close').click({timeout:1000}).catch(()=>{});
await wait(500);
const b3=await page.locator('#reader .tok.particle').first().evaluate(n=>{const r=n.getClientRects()[0]??n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
await page.mouse.move(b3.x,b3.y); await page.mouse.down(); await wait(700); await page.mouse.up(); await wait(500);
console.log('C after 700ms hold (quick look)', await info());
await page.locator('#mini .mini-entry').click({timeout:2000}).catch(e=>console.log('  mini-entry click err',e.message.slice(0,60)));
await wait(900);
console.log('C via 助詞へ button', await info());
console.log('errors', errs);
await browser.close();server.close();
