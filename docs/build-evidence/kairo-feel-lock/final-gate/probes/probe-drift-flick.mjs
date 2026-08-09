// Does a flick on a drift word write a judgment to bunki-drift-v1?
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
const pick=()=>page.evaluate(`(()=>{for(const el of document.querySelectorAll('#drift-layer .word')){
 const b=el.querySelector('.base')?.textContent??''; const r=el.getBoundingClientRect();
 if(!b||!r.width) continue;
 if(r.left<60||r.right>innerWidth-140||r.top<200||r.bottom>innerHeight-200) continue;
 if(parseFloat(el.style.opacity||'1')<0.4) continue;
 return {w:b,x:r.x+r.width/2,y:r.y+r.height/2};} return null;})()`);
const state=()=>page.evaluate(`(()=>({tray:document.getElementById('drift-tray')?.textContent??'',
 store:localStorage.getItem('bunki-drift-v1'), words:document.querySelectorAll('#drift-layer .word').length}))()`);

async function flick(x,y,dx,steps,perStep){
  await clear();
  await touch('touchStart',[{x,y}]);
  for(let i=1;i<=steps;i++){ await touch('touchMove',[{x:x+dx*i/steps,y}]); if(perStep) await wait(perStep); }
  await touch('touchEnd',[]);
  await wait(900);
}
console.log('start', await state());
for (const cfg of [{steps:3,per:0,dx:120},{steps:6,per:8,dx:150},{steps:10,per:12,dx:200},{steps:4,per:0,dx:-140}]) {
  const p = await pick();
  if(!p){console.log('no word'); continue;}
  await flick(p.x,p.y,cfg.dx,cfg.steps,cfg.per);
  const s = await state();
  console.log(`flick ${JSON.stringify(cfg)} on "${p.w}" →`, {tray:s.tray, store:s.store?s.store.slice(0,80):null});
  if (s.store) break;
}
// mouse-driven drag as a control
const p2 = await pick();
if (p2) {
  await page.mouse.move(p2.x,p2.y); await page.mouse.down();
  for(let i=1;i<=5;i++) await page.mouse.move(p2.x+130*i/5, p2.y);
  await page.mouse.up(); await wait(900);
  console.log('mouse flick on "'+p2.w+'" →', await state());
}
console.log('errors', errs);
await browser.close();server.close();
