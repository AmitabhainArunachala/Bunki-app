/** Probe 14 — the calm gate, measured cleanly.
 * Press OPEN WATER (raises no bloom, glides no camera) and hold still.
 * If the calm gate is honest, ambient drift stops for the WHOLE field, not just
 * for a held word, and resumes on lift. Runs on any --src for pristine control.
 */
import pwc from '/home/user/Bunki-app/node_modules/playwright-core/index.js';
const { chromium } = pwc;
import http from 'node:http';
import fs from 'node:fs';
import { resolve } from 'node:path';
const SRC=resolve(process.argv[2]), TAG=process.argv[3]||'run', PORT=Number(process.argv[4]||9401);
const OUT='/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/probe-out14';
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
const out={};const log=(k,v)=>{out[k]=v;console.log('### '+k+' :: '+JSON.stringify(v));};
await p.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:'networkidle'});
await wait(3600);

// state that must NOT change during the hold, or the measurement is contaminated
const state=()=>p.evaluate(()=>({focus:FOCUS.length, stack:stack.length, lockOn,
  camX:+cam.x.toFixed(2), camY:+cam.y.toFixed(2), camT: typeof camT!=='undefined' && camT?1:0,
  calm: typeof calm!=='undefined'?+calm.toFixed(4):null}));
const pos=()=>p.evaluate(()=>{const o={};
  for(const n of nodes){ if(n.kind!=='word'||n.gone||n.removed||!n.el||n.mode!=='free') continue;
    const r=n.el.getBoundingClientRect(); o[n.seqId]={x:r.left+r.width/2,y:r.top+r.height/2};}
  return {t:performance.now(),o};});
const d=(a,bb)=>{const v=[];for(const k of Object.keys(a.o)){const q=bb.o[k];if(!q)continue;
  v.push(Math.hypot(q.x-a.o[k].x,q.y-a.o[k].y));} v.sort((x,y)=>x-y);
  return {n:v.length, medianPx:v.length?+v[Math.floor(v.length/2)].toFixed(3):null,
    maxPx:v.length?+v[v.length-1].toFixed(3):null,
    medianPxPerSec:v.length?+(v[Math.floor(v.length/2)]/((bb.t-a.t)/1000)).toFixed(3):null};};
const water=()=>p.evaluate(()=>{
  const cand=[]; for(let x=25;x<=365;x+=10) for(let y=110;y<=720;y+=10) cand.push([x,y]);
  const rects=[...document.querySelectorAll('.word,.glyph,.part')].map(e=>e.getBoundingClientRect());
  let best=null,bc=-1;
  for(const[x,y] of cand){ const e=document.elementFromPoint(x,y);
    if(e&&e.closest&&e.closest('.word,.glyph,.part,#card,#theme,#lvl,#hint,#brand,#depth,#tray,#radoc')) continue;
    if(typeof hubAt==='function'&&hubAt(x,y)!=null) continue;
    let c=1e9; for(const r of rects){const dx=Math.max(r.left-x,0,x-r.right),dy=Math.max(r.top-y,0,y-r.bottom);c=Math.min(c,Math.hypot(dx,dy));}
    if(c>bc){bc=c;best=[x,y];}}
  return {pt:best, clearance:+bc.toFixed(1)};});

const A0=await pos(); await wait(3000); const A1=await pos();
log('1-REST-3s', {...d(A0,A1), state:await state()});

const w=await water();
await T('touchStart',[[w.pt[0],w.pt[1]]]);
await wait(400);                                  // let calm decay
const sBefore=await state();
const B0=await pos(); await wait(3000); const B1=await pos();
const sAfter=await state();
log('2-FINGER-DOWN-on-open-water-3s', {waterPoint:w.pt, clearancePx:w.clearance, ...d(B0,B1),
  stateBefore:sBefore, stateAfter:sAfter,
  contaminated: sBefore.focus!==sAfter.focus||sBefore.stack!==sAfter.stack||
                Math.abs(sBefore.camX-sAfter.camX)>0.5||Math.abs(sBefore.camY-sAfter.camY)>0.5});
await T('touchEnd',[]);
await wait(900);
const C0=await pos(); await wait(3000); const C1=await pos();
log('3-AFTER-LIFT-3s', {...d(C0,C1), state:await state()});
log('ERRORS',errs);
fs.writeFileSync(`${OUT}/probe14-${TAG}.json`,JSON.stringify(out,null,2));
console.log('\n-> '+OUT+`/probe14-${TAG}.json`);
await b.close();server.close();process.exit(0);
