/** Probe 13 (WP7) — the calm gate's honesty, and frame timing.
 *  A. Does the field GENUINELY still under a resting finger (global), or is the
 *     stillness special-cased to the held word (which would game the two hunt
 *     checks that assert <8px)?  Measures: held word displacement, OTHER words'
 *     displacement, and calm's decay curve.
 *  B. Frame timing p95 over 10 s at rest.
 * Usage: node probe13.mjs <src.html> <tag> <port>
 */
import pwc from '/home/user/Bunki-app/node_modules/playwright-core/index.js';
const { chromium } = pwc;
import http from 'node:http';
import fs from 'node:fs';
import { resolve } from 'node:path';
const SRC=resolve(process.argv[2]), TAG=process.argv[3]||'run', PORT=Number(process.argv[4]||9301);
const OUT='/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/probe-out13';
fs.mkdirSync(OUT,{recursive:true});
const body=fs.readFileSync(SRC,'utf8');
const html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"></head><body>${body}</body></html>`;
const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end(html);}).listen(PORT);
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
const p=await ctx.newPage();
const errs=[];p.on('pageerror',e=>errs.push('PAGEERROR '+e.message.slice(0,140)));
p.on('console',m=>{if(m.type()==='error')errs.push('console.error '+m.text().slice(0,140));});
const cdp=await ctx.newCDPSession(p);
const T=(t,pts)=>cdp.send('Input.dispatchTouchEvent',{type:t,touchPoints:pts.map(([x,y])=>({x,y}))});
const wait=ms=>p.waitForTimeout(ms);
const out={};const log=(k,v)=>{out[k]=v;console.log('### '+k+' :: '+JSON.stringify(v));};
await p.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:'networkidle'});
await wait(3600);

const positions=()=>p.evaluate(()=>{
  const o={}; for(const n of nodes){ if(n.kind!=='word'||n.gone||n.removed||!n.el) continue;
    if(n.mode!=='free') continue; const r=n.el.getBoundingClientRect();
    o[n.seqId]={x:r.left+r.width/2,y:r.top+r.height/2}; }
  return {t:performance.now(), o, calm: typeof calm!=='undefined'?+calm.toFixed(4):null};});
const delta=(a,b)=>{const d=[];for(const k of Object.keys(a.o)){const q=b.o[k];if(!q)continue;
  d.push(Math.hypot(q.x-a.o[k].x, q.y-a.o[k].y));} d.sort((x,y)=>x-y);
  return {n:d.length, median:d.length?+d[Math.floor(d.length/2)].toFixed(3):null,
          max:d.length?+d[d.length-1].toFixed(3):null,
          perSec:d.length?+(d[Math.floor(d.length/2)]/((b.t-a.t)/1000)).toFixed(3):null};};

// ---- baseline: 3 s at rest, no touch ----
const r0=await positions(); await wait(3000); const r1=await positions();
log('A1-at-rest-3s', {...delta(r0,r1), calmStart:r0.calm, calmEnd:r1.calm});

// ---- pick a word, press and HOLD still for 3 s ----
const target=await p.evaluate(()=>{
  let best=null,bd=1e9;
  for(const n of nodes){ if(n.kind!=='word'||n.gone||n.removed) continue;
    const cs=getComputedStyle(n.el); if(parseFloat(cs.opacity)<0.4||cs.pointerEvents==='none') continue;
    const r=n.el.getBoundingClientRect(); const cx=r.left+r.width/2, cy=r.top+r.height/2;
    if(cx<80||cx>310||cy<200||cy>600) continue;
    const d=Math.hypot(cx-195,cy-400); if(d<bd){bd=d;best={cx,cy,seqId:n.seqId,w:n.w};}}
  return best;});
await T('touchStart',[[target.cx,target.cy]]);
// calm's decay curve, sampled每 frame-ish
const decay=[];
for(let i=0;i<14;i++){ await wait(17); decay.push(await p.evaluate(()=>typeof calm!=='undefined'?+calm.toFixed(4):null)); }
const h0=await positions(); await wait(3000); const h1=await positions();
const heldMove=await p.evaluate(id=>{const n=nodes.find(n=>n.seqId===id);
  return n?{dragX:+n.dragX.toFixed(2),dragY:+n.dragY.toFixed(2)}:null;},target.seqId);
const dHeld=delta(h0,h1);
// separate the held word from everybody else
const others=await p.evaluate(([a,bb,id])=>{
  const d=[]; let held=null;
  for(const k of Object.keys(a)){ const q=bb[k]; if(!q) continue;
    const m=Math.hypot(q.x-a[k].x,q.y-a[k].y);
    if(+k===id) held=+m.toFixed(3); else d.push(m); }
  d.sort((x,y)=>x-y);
  return {heldWordMovedPx:held, othersN:d.length,
    othersMedianPx:d.length?+d[Math.floor(d.length/2)].toFixed(3):null,
    othersMaxPx:d.length?+d[d.length-1].toFixed(3):null};
},[h0.o,h1.o,target.seqId]);
log('A2-finger-DOWN-3s', {word:target.w.slice(0,6), ...dHeld, calmStart:h0.calm, calmEnd:h1.calm,
  calmDecay14frames:decay, heldWordDrag:heldMove, ...others});
await T('touchEnd',[]);
await wait(200);
const u0=await positions(); await wait(3000); const u1=await positions();
log('A3-after-LIFT-3s', {...delta(u0,u1), calmStart:u0.calm, calmEnd:u1.calm});

// ---- B: frame timing, 10 s at rest ----
log('B-frame-timing-10s', await p.evaluate(()=>new Promise(res=>{
  const d=[]; let last=performance.now(); const t0=last;
  function step(t){ d.push(t-last); last=t;
    if(t-t0<10000) requestAnimationFrame(step);
    else { d.shift(); d.sort((a,b)=>a-b);
      const q=f=>+d[Math.min(d.length-1,Math.floor(d.length*f))].toFixed(2);
      res({frames:d.length, median:q(0.5), p95:q(0.95), p99:q(0.99),
        max:+d[d.length-1].toFixed(2), over20ms:d.filter(x=>x>20).length,
        over50ms:d.filter(x=>x>50).length}); } }
  requestAnimationFrame(step);
})));

// ---- trance boundary: no scoring/gamification added by WP7 ----
log('C-trance-tokens', await p.evaluate(()=>{
  const src=document.documentElement.innerHTML;
  const pats={streak:/\bstreak\b/gi,confetti:/confetti/gi,xp:/\bXP\b/g,combo:/\bcombo\b/gi,
    leaderboard:/leaderboard/gi,alertfn:/\balert\(/g,points:/\bpoints\b/gi};
  const r={}; for(const[k,re] of Object.entries(pats)){const m=src.match(re);r[k]=m?m.length:0;} return r;}));
log('ERRORS',errs);
fs.writeFileSync(`${OUT}/probe13-${TAG}.json`,JSON.stringify(out,null,2));
console.log('\n-> '+OUT+`/probe13-${TAG}.json`);
await b.close();server.close();process.exit(0);
