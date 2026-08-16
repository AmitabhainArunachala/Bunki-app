/** Probe 8 — (a) is #lvl occlusion opacity-independent (the equivalence claim)?
 *            (b) ghost/winner ratio for TANGLE ghosts, measured under zoom. */
import pwc from '/home/user/Bunki-app/node_modules/playwright-core/index.js';
const { chromium } = pwc;
import http from 'node:http';
import fs from 'node:fs';
const SRC='/home/user/Bunki-app/.claude/worktrees/agent-aa8fa572d39c96ca3/prototypes/drift/drift-artifact.html';
const OUT='/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/probe-out8';
fs.mkdirSync(OUT,{recursive:true});
const PORT=8997;
const body=fs.readFileSync(SRC,'utf8');
const html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"></head><body>${body}</body></html>`;
const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end(html);}).listen(PORT);
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
const p=await ctx.newPage();
const errs=[];p.on('pageerror',e=>errs.push('PAGEERROR '+e.message.slice(0,160)));
const cdp=await ctx.newCDPSession(p);
const touch=(t,pts)=>cdp.send('Input.dispatchTouchEvent',{type:t,touchPoints:pts});
const wait=ms=>p.waitForTimeout(ms);
const out={};const log=(k,v)=>{out[k]=v;console.log('### '+k+' :: '+JSON.stringify(v));};
async function pinchG(cx,cy,from,to,steps=16){await touch('touchEnd',[]).catch(()=>{});let d=from;await touch('touchStart',[{x:cx,y:cy-d},{x:cx,y:cy+d}]);for(let i=1;i<=steps;i++){d=from+((to-from)*i)/steps;await touch('touchMove',[{x:cx,y:cy-d},{x:cx,y:cy+d}]);await wait(16);}await touch('touchEnd',[]);await wait(400);}
await p.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:'networkidle'});
await wait(3600);

// (a) #lvl occlusion: same sample points, ghost opacity vs FORCED opacity 1
log('A-lvl-occlusion-is-opacity-independent', await p.evaluate(()=>{
  const lvl=document.getElementById('lvl'); const lr=lvl.getBoundingClientRect();
  const cs=getComputedStyle(lvl);
  const wordZ=(()=>{const w=document.querySelector('.word');return w?getComputedStyle(w).zIndex:'?';})();
  const rows=[];
  for(const n of nodes){
    if(n.kind!=='word'||n.gone||n.removed||!n.el) continue;
    const rr=n.el.getBoundingClientRect();
    if(!(rr.right>lr.left&&rr.left<lr.right&&rr.bottom>lr.top&&rr.top<lr.bottom)) continue;
    const sample=[];
    for(let gx=1;gx<=5;gx++)for(let gy=1;gy<=5;gy++){
      const x=rr.left+rr.width*gx/6, y=rr.top+rr.height*gy/6;
      if(x<1||x>innerWidth-1||y<1||y>innerHeight-1) continue;
      sample.push([x,y]);
    }
    const resolve=()=>{let self=0,tolvl=0;for(const[x,y] of sample){const e=document.elementFromPoint(x,y);
      if(e&&e.closest&&e.closest('.word')===n.el) self++; else if(e&&e.closest&&e.closest('#lvl')) tolvl++;}
      return {self,tolvl};};
    const asGhost=resolve();
    const prev=n.el.style.opacity;
    n.el.style.opacity='1';               // force full presence, same geometry
    const asFull=resolve();
    n.el.style.opacity=prev;
    rows.push({w:n.w.slice(0,6), ghosted:!!(n.collide!=null&&n.collide<0.5),
      renderedOp:+parseFloat(getComputedStyle(n.el).opacity).toFixed(3),
      pts:sample.length, asGhost, asFull,
      identical: asGhost.self===asFull.self && asGhost.tolvl===asFull.tolvl});
  }
  return { lvlPointerEvents:cs.pointerEvents, lvlZIndex:cs.zIndex, wordZIndex:wordZ,
    allIdentical: rows.every(r=>r.identical), rows };
}));

// (b) tangle ghosts under zoom: ghost / quietest-winner ratio
await pinchG(195,420,45,200); await wait(1600);
log('B-tangle-ghost-ratio-at-zoom', await p.evaluate(()=>{
  const cz=cam.z, arr=[];
  for(const n of nodes){
    if(n.kind!=='word'||n.gone||n.removed) continue;
    if(n.mode!=='free'&&n.mode!=='glide') continue;
    const fpx=(n.fpx||14)*n.s*cz;
    const cx=n.x+n.dragX, cy=n.y+n.dragY, hw=n.w.length*fpx*0.55, hh=fpx*0.62;
    if(cx+hw<0||cx-hw>innerWidth||cy+hh<0||cy-hh>innerHeight) continue;
    arr.push({n,cx,cy,hw,hh,eff:n.op});
  }
  const rows=[];
  for(const a of arr){
    if(!(a.n.collide!=null&&a.n.collide<0.5)) continue;
    let qw=Infinity;
    for(const k of arr){
      if(k===a||!(k.n.collide!=null&&k.n.collide>0.95)) continue;
      const ox=Math.min(a.cx+a.hw,k.cx+k.hw)-Math.max(a.cx-a.hw,k.cx-k.hw); if(ox<=0) continue;
      const oy=Math.min(a.cy+a.hh,k.cy+k.hh)-Math.max(a.cy-a.hh,k.cy-k.hh); if(oy<=0) continue;
      if(ox*oy>Math.min(4*a.hw*a.hh,4*k.hw*k.hh)*0.12 && k.eff<qw) qw=k.eff;
    }
    if(qw<Infinity) rows.push({w:a.n.w.slice(0,6), ghostOp:+(a.n.ghostOp||0).toFixed(3),
      renderedOp:+parseFloat(getComputedStyle(a.n.el).opacity).toFixed(3),
      quietestWinner:+qw.toFixed(3), ratio:+((a.n.ghostOp||0)/qw).toFixed(3)});
  }
  return { z:+cam.z.toFixed(2), floor:+ghostFloor.toFixed(3), winMin:+(ghostFloor/0.53).toFixed(3),
    n:rows.length, maxRatio:rows.length?Math.max(...rows.map(r=>r.ratio)):null,
    overClaimed045: rows.filter(r=>r.ratio>0.45).length,
    over053: rows.filter(r=>r.ratio>0.53).length, rows:rows.slice(0,10) };
}));
// min rendered opacity anywhere under zoom + pointer-events audit
log('C-zoom-presence-audit', await p.evaluate(()=>{
  let minOp=1, peNone=0, n=0, minBase=1;
  for(const el of document.querySelectorAll('.word')){
    const cs=getComputedStyle(el); const op=parseFloat(cs.opacity);
    if(!(op>0.002)) continue;
    const r=el.getBoundingClientRect();
    if(r.right<0||r.left>innerWidth||r.bottom<0||r.top>innerHeight) continue;
    n++; minOp=Math.min(minOp,op); if(cs.pointerEvents==='none') peNone++;
    const nd=typeof nodeOf!=='undefined'?nodeOf.get(el):null; if(nd&&nd.op!=null) minBase=Math.min(minBase,nd.op);
  }
  return { z:+cam.z.toFixed(2), rendered:n, minRenderedOp:+minOp.toFixed(4), minUnarbitratedOp:+minBase.toFixed(4), peNone };
}));
log('ERRORS',errs);
fs.writeFileSync(`${OUT}/probe8.json`,JSON.stringify(out,null,2));
console.log('\n-> '+OUT+'/probe8.json');
await b.close();server.close();process.exit(0);
