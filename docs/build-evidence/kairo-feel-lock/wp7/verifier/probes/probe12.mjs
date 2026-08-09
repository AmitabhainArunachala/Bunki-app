/** Probe 12 (WP7) — motion, reduced-motion, and the law checks.
 * Runs against any --src so pristine and WP7 are measured on ONE instrument.
 * Usage: node probe12.mjs <src.html> <tag> <port>
 */
import pwc from '/home/user/Bunki-app/node_modules/playwright-core/index.js';
const { chromium } = pwc;
import http from 'node:http';
import fs from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(process.argv[2]);
const TAG = process.argv[3] || 'run';
const PORT = Number(process.argv[4] || 9201);
const OUT = '/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/probe-out12';
fs.mkdirSync(OUT, { recursive: true });
const body = fs.readFileSync(SRC, 'utf8');
const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"></head><body>${body}</body></html>`;
const server = http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end(html);}).listen(PORT);
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const out={}; const log=(k,v)=>{out[k]=v;console.log('### '+k+' :: '+JSON.stringify(v));};

// ---- motion sampler, reusable for normal and reduced contexts ----
async function sample(reduced) {
  const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:1,
    hasTouch:true, isMobile:true, ...(reduced?{reducedMotion:'reduce'}:{}) });
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message.slice(0,140)));
  p.on('console',m=>{if(m.type()==='error')errs.push('console.error '+m.text().slice(0,140));});
  const cdp = await ctx.newCDPSession(p);
  const T=(t,pts)=>cdp.send('Input.dispatchTouchEvent',{type:t,touchPoints:pts.map(([x,y])=>({x,y}))});
  const wait=ms=>p.waitForTimeout(ms);
  await p.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:'networkidle'});
  await wait(3600);

  const snap = () => p.evaluate(()=>{
    const o=[]; const t=performance.now();
    for(const n of nodes){
      if(n.kind!=='word'||n.gone||n.removed||!n.el) continue;
      if(n.mode!=='free') continue;
      const r=n.el.getBoundingClientRect();
      o.push({id:n.seqId, x:r.left+r.width/2, y:r.top+r.height/2});
    }
    return {t, o};
  });
  // 4 s of rest, sampled every 500 ms
  const snaps=[];
  for(let i=0;i<9;i++){ snaps.push(await snap()); await wait(500); }

  const speeds = p.evaluate(([snaps])=>{
    const first=snaps[0], last=snaps[snaps.length-1];
    const dt=(last.t-first.t)/1000;
    const m=new Map(first.o.map(w=>[w.id,w]));
    const sp=[], disp=[];
    for(const w of last.o){ const a=m.get(w.id); if(!a) continue;
      const dx=w.x-a.x, dy=w.y-a.y; const d=Math.hypot(dx,dy);
      sp.push(d/dt); disp.push({id:w.id, x:a.x, y:a.y, dx, dy, d}); }
    sp.sort((p,q)=>p-q);
    const med=sp.length?sp[Math.floor(sp.length/2)]:null;
    // neighbour agreement: cosine of displacement vectors, by distance band
    const bands={'<100':[], '100-200':[], '200-300':[], '>300':[]};
    for(let i=0;i<disp.length;i++) for(let j=i+1;j<disp.length;j++){
      const A=disp[i], B=disp[j];
      if(A.d<0.5||B.d<0.5) continue;
      const sep=Math.hypot(A.x-B.x, A.y-B.y);
      const cos=(A.dx*B.dx+A.dy*B.dy)/(A.d*B.d);
      const k = sep<100?'<100' : sep<200?'100-200' : sep<300?'200-300' : '>300';
      bands[k].push(cos);
    }
    const mean=a=>a.length? a.reduce((x,y)=>x+y,0)/a.length : null;
    return { n:sp.length, dtSec:+dt.toFixed(2), medianSpeedPxPerSec:med==null?null:+med.toFixed(2),
      maxSpeedPxPerSec: sp.length?+sp[sp.length-1].toFixed(2):null,
      agreement: Object.fromEntries(Object.entries(bands).map(([k,v])=>[k, v.length?+mean(v).toFixed(3):null])),
      pairCounts: Object.fromEntries(Object.entries(bands).map(([k,v])=>[k,v.length])) };
  }, [snaps]);
  const sp = await speeds;

  // LAW: excursion + containment. Track over 12 s whether any word leaves the
  // glass or sits under chrome at reading presence.
  const law = await p.evaluate(async ()=>{
    const chromeIds=['brand','depth','theme','tray','hint','lvl'];
    let maxOx=0,maxOy=0, offScreen=0, underChromeAtReading=0, minOp=1;
    const offWords=new Set(), chromeWords=new Set();
    const READ=0.44;
    for(let k=0;k<60;k++){
      await new Promise(r=>setTimeout(r,200));
      if (typeof WORDS!=='undefined') for(const wr of WORDS){
        if(wr.ox!=null){ maxOx=Math.max(maxOx,Math.abs(wr.ox)); maxOy=Math.max(maxOy,Math.abs(wr.oy)); }
      }
      const cr=[];
      for(const id of chromeIds){ const e=document.getElementById(id); if(!e) continue;
        const cs=getComputedStyle(e); if(cs.display==='none'||cs.visibility==='hidden') continue;
        if(parseFloat(cs.opacity||'1')<=0.05) continue;
        const r=e.getBoundingClientRect(); if(r.width<1||r.height<1) continue; cr.push(r); }
      for(const n of nodes){
        if(n.kind!=='word'||n.gone||n.removed||!n.el) continue;
        const op=parseFloat(getComputedStyle(n.el).opacity);
        if(!(op>0.002)) continue;
        minOp=Math.min(minOp,op);
        const r=n.el.getBoundingClientRect();
        // fully outside the glass = the word has left the screen entirely
        if(r.right<0||r.left>innerWidth||r.bottom<0||r.top>innerHeight){ offScreen++; offWords.add(n.w); }
        if(op>=READ) for(const c of cr)
          if(r.right>c.left&&r.left<c.right&&r.bottom>c.top&&r.top<c.bottom){ underChromeAtReading++; chromeWords.add(n.w); break; }
      }
    }
    return { maxExcursionOx:+maxOx.toFixed(2), maxExcursionOy:+maxOy.toFixed(2),
      wanderBox:'±16/±12', offScreenSamples:offScreen, offScreenWords:[...offWords].slice(0,8),
      underChromeAtReadingSamples:underChromeAtReading, underChromeWords:[...chromeWords].slice(0,8),
      minRenderedOp:+minOp.toFixed(3) };
  });

  // interactions still work (tap ladder + flick), important under reduced motion
  const inter = await (async ()=>{
    const near = await p.evaluate(()=>{
      let best=null,bd=1e9;
      for(const n of nodes){ if(n.kind!=='word'||n.gone||n.removed) continue;
        const cs=getComputedStyle(n.el); if(parseFloat(cs.opacity)<0.4||cs.pointerEvents==='none') continue;
        const r=n.el.getBoundingClientRect(); const cx=r.left+r.width/2, cy=r.top+r.height/2;
        if(cx<70||cx>320||cy<200||cy>600) continue;
        const d=Math.hypot(cx-195,cy-420); if(d<bd){bd=d;best={cx,cy,seqId:n.seqId,w:n.w};}}
      return best;});
    if(!near) return {note:'no target'};
    const cls=()=>p.evaluate(id=>{const n=nodes.find(n=>n.seqId===id);return n?n.el.className:null;},near.seqId);
    await T('touchStart',[[near.cx,near.cy]]); await wait(30); await T('touchEnd',[]); await wait(900);
    const t1=await cls();
    const fp=await p.evaluate(()=>focusN&&!focusN.gone?{cx:focusN.x+focusN.dragX,cy:focusN.y+focusN.dragY}:null);
    await T('touchStart',[[fp?fp.cx:near.cx,fp?fp.cy:near.cy]]); await wait(30); await T('touchEnd',[]); await wait(900);
    const t2=await cls();
    // flick a different word
    const f = await p.evaluate(id=>{
      for(const n of nodes){ if(n.kind!=='word'||n.gone||n.removed||n.seqId===id) continue;
        const cs=getComputedStyle(n.el); if(parseFloat(cs.opacity)<0.4||cs.pointerEvents==='none') continue;
        const r=n.el.getBoundingClientRect(); const cx=r.left+r.width/2, cy=r.top+r.height/2;
        if(cx<90||cx>250||cy<250||cy>560) continue;
        return {cx,cy,w:n.w,seqId:n.seqId};}
      return null;},near.seqId);
    let flick=null;
    if(f){ const trayB=await p.evaluate(()=>document.getElementById('tray').textContent);
      await T('touchStart',[[f.cx,f.cy]]); await T('touchMove',[[f.cx+65,f.cy]]); await T('touchMove',[[f.cx+130,f.cy]]); await T('touchEnd',[]);
      await wait(1200);
      const trayA=await p.evaluate(()=>document.getElementById('tray').textContent);
      flick={word:f.w.slice(0,6), trayBefore:trayB, trayAfter:trayA, graded: trayA!==trayB && trayA!==''}; }
    return { word:near.w.slice(0,6), afterTap1:t1, afterTap2:t2,
      ladderOk: !!(t1&&t1.includes('unfolded')) && !!(t2&&t2.includes('glossed')), flick };
  })();

  const calmProbe = await p.evaluate(async ()=>{
    if (typeof calm==='undefined') return {note:'no calm gate in this build'};
    const before=+calm.toFixed(3);
    return {calmAtRest:before};
  });
  await ctx.close();
  return { motion:sp, law, interactions:inter, calm:calmProbe, errs };
}

log('NORMAL', await sample(false));
log('REDUCED-MOTION', await sample(true));
fs.writeFileSync(`${OUT}/probe12-${TAG}.json`, JSON.stringify(out,null,2));
console.log('\n-> '+OUT+`/probe12-${TAG}.json`);
await b.close(); server.close(); process.exit(0);
