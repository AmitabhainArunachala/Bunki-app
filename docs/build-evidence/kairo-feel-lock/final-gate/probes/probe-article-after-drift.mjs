// Does an article still open after a session has been out in the drift universe?
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
const tapAt=async(x,y,h=0)=>{await clear();await touch('touchStart',[{x,y}]);if(h)await wait(h);await touch('touchEnd',[]);await wait(220);};
const tapSel=async(sel,i=0,h=0)=>{const loc=page.locator(sel).nth(i);await loc.scrollIntoViewIfNeeded().catch(()=>{});await wait(150);
  const b=await loc.evaluate(n=>{const r=n.getClientRects()[0]??n.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};});
  await tapAt(b.x+b.w/2,b.y+b.h/2,h);};
const state=()=>page.evaluate(`(()=>({view:document.body.dataset.view??'',drift:document.getElementById('drift-layer')?.classList.contains('active')??false,
  driftDisplay:getComputedStyle(document.getElementById('drift-layer')).display,
  shelf:document.querySelectorAll('.shelf-item').length,toks:document.querySelectorAll('#reader button.tok').length,
  title:document.querySelector('.view-title')?.textContent??'',scrollY:Math.round(scrollY),
  note:document.querySelector('#reader ~ .note, .note')?.textContent?.slice(0,60)??''}))()`);

console.log('A boot(drift):', await state());
// 1. into the shelf, open an article, scroll deep — a normal session
await page.evaluate(`document.getElementById('enter-shelf-door')?.click()`); await wait(1200);
console.log('B shelf:', await state());
await page.evaluate(`scrollTo(0, Math.round(document.body.scrollHeight*0.74))`); await wait(500);
await tapSel('.shelf-item', 20); await wait(1500);
console.log('C reader(deep):', await state());
await page.locator('#back').click().catch(()=>{}); await wait(1000);
console.log('D back to shelf:', await state());
// 2. out to the drift universe the way the strip + 戻る does it
await page.evaluate(`document.querySelector('button[data-variant="entry:drift"]')?.click()`); await wait(600);
console.log('E after entry:drift click:', await state());
await page.locator('#back').click().catch(()=>{}); await wait(1400);
console.log('F after 戻る:', await state());
// 3. raise a constellation out there, then come back to the shelf and open an article
const seed=await page.evaluate(`(()=>{for(const el of document.querySelectorAll('#drift-layer .word')){const b=el.querySelector('.base')?.textContent??'';const r=el.getBoundingClientRect();
 if(b&&r.width&&r.left>46&&r.right<innerWidth-46&&r.top>175&&r.bottom<innerHeight-155)return {w:b,x:r.x+r.width/2,y:r.y+r.height/2};}return null;})()`);
if(seed){await tapAt(seed.x,seed.y);await wait(1500);}
console.log('G constellation up:', await state());
await page.evaluate(`document.getElementById('enter-shelf-door')?.click()`); await wait(1400);
console.log('H back on shelf:', await state());
await tapSel('.shelf-item', 0); await wait(2500);
console.log('I article after drift trip:', await state());
if((await state()).toks<=5){
  console.log('  retry with locator click...');
  await page.locator('.shelf-item').nth(0).click({timeout:5000}).catch(e=>console.log('  click err', e.message.slice(0,80)));
  await wait(2500);
  console.log('J after locator click:', await state());
  console.log('  reader html', await page.evaluate(`document.getElementById('reader')?.outerHTML?.slice(0,300)`));
  console.log('  main text', await page.evaluate(`document.querySelector('main')?.textContent?.slice(0,200)`));
}
console.log('errors', errs);
await browser.close();server.close();
