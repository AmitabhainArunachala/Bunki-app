/** Probe 21 — is the 0.08 minimum a WP6 regression or the pre-existing bloom dim?
 * Measures the floor in THREE states on any --src: at rest, with a bloom up, and
 * back at rest after the bloom clears. Run on WP6 and on pristine 1bb7d3c. */
import pwc from '/home/user/Bunki-app/node_modules/playwright-core/index.js';
const { chromium } = pwc;
import http from 'node:http';
import fs from 'node:fs';
import { resolve } from 'node:path';
const SRC=resolve(process.argv[2]), TAG=process.argv[3], PORT=Number(process.argv[4]||9701), Q=process.argv[5]||'';
const OUT='/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/probe-out21';
fs.mkdirSync(OUT,{recursive:true});
const body=fs.readFileSync(SRC,'utf8');
const html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"></head><body>${body}</body></html>`;
const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end(html);}).listen(PORT);
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
const p=await ctx.newPage();
const errs=[];p.on('pageerror',e=>errs.push('PAGEERROR '+e.message.slice(0,140)));
const cdp=await ctx.newCDPSession(p);
const T=(t,pts)=>cdp.send('Input.dispatchTouchEvent',{type:t,touchPoints:pts.map(([x,y])=>({x,y}))});
const wait=ms=>p.waitForTimeout(ms);
const tap=async(x,y)=>{await T('touchEnd',[]).catch(()=>{});await T('touchStart',[[x,y]]);await wait(35);await T('touchEnd',[]);await wait(1000);};
const floor=()=>p.evaluate(()=>{
  let mn=1, who=null, dimmed=0;
  for(const el of document.querySelectorAll('.word')){
    const o=parseFloat(getComputedStyle(el).opacity); if(!(o>0.002)) continue;
    const n=nodeOf.get(el);
    if(o<mn){mn=o;who=n?n.w:el.textContent.slice(0,6);}
    if(n&&FOCUS.length&&n!==focusN&&!n.hlDom&&n.mode==='free') dimmed++;
  }
  return {minRenderedOp:+mn.toFixed(3), quietest:who, ghostFloor:+ghostFloor.toFixed(3),
    FOCUS:FOCUS.length, bloomDimmedWords:dimmed,
    predictedBloomFloor:+(ghostFloor*0.3).toFixed(3)};});
await p.goto(`http://127.0.0.1:${PORT}/${Q}`,{waitUntil:'networkidle'});
await wait(3400);
const atRest=await floor();
const w=await p.evaluate(()=>{let best=null,bd=1e9;
  for(const n of nodes){ if(n.kind!=='word'||n.gone||n.removed) continue;
    const cs=getComputedStyle(n.el); if(parseFloat(cs.opacity)<0.4||cs.pointerEvents==='none') continue;
    const r=n.el.getBoundingClientRect(); const cx=r.left+r.width/2, cy=r.top+r.height/2;
    if(cx<80||cx>310||cy<220||cy>580) continue;
    const d=Math.hypot(cx-195,cy-400); if(d<bd){bd=d;best={cx,cy,w:n.w};}} return best;});
await tap(w.cx,w.cy);
const bloomed=await floor();
// clear the bloom on open water and re-measure at rest
const water=await p.evaluate(()=>{const c=[[30,120],[360,120],[360,700],[30,700],[195,760]];
  for(const[x,y] of c){const e=document.elementFromPoint(x,y);
    if((!e||!e.closest('.word,.glyph,.part,#card,#theme,#lvl,#hint,#brand,#depth,#tray,#radoc'))&&(typeof hubAt!=='function'||hubAt(x,y)==null))return[x,y];}
  return [195,760];});
await tap(water[0],water[1]); await wait(2500);
const backAtRest=await floor();
const out={tag:TAG, src:SRC, query:Q, atRest, bloomed, backAtRest, errs};
console.log('### '+TAG+' :: '+JSON.stringify(out,null,1));
fs.writeFileSync(`${OUT}/floor-${TAG}.json`,JSON.stringify(out,null,2));
await b.close();server.close();process.exit(0);
