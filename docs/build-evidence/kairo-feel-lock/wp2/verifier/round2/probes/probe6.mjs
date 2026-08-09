/** Verifier probe 6 — re-ruling the LAW on the ghost revision.
 * Written independently of verify-v11.mjs. Runs against any --src so the
 * revision and the f433edf baseline can be compared on the SAME instrument. */
import pwc from '/home/user/Bunki-app/node_modules/playwright-core/index.js';
const { chromium } = pwc;
import http from 'node:http';
import fs from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(process.argv[2]);
const TAG = process.argv[3] || 'run';
const PORT = Number(process.argv[4] || 8990);
const OUT = '/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/probe-out6';
fs.mkdirSync(OUT, { recursive: true });
const body = fs.readFileSync(SRC, 'utf8');
const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"></head><body>${body}</body></html>`;
const server = http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end(html);}).listen(PORT);
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:1, hasTouch:true, isMobile:true });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message.slice(0,160)));
p.on('console',m=>{if(m.type()==='error')errs.push('console.error '+m.text().slice(0,160));});
const cdp = await ctx.newCDPSession(p);
const touch=(t,pts)=>cdp.send('Input.dispatchTouchEvent',{type:t,touchPoints:pts});
const wait=ms=>p.waitForTimeout(ms);
const out={}; const log=(k,v)=>{out[k]=v;console.log('### '+k+' :: '+JSON.stringify(v));};
async function tap(x,y){await touch('touchEnd',[]).catch(()=>{});await touch('touchStart',[{x,y}]);await wait(30);await touch('touchEnd',[]);await wait(300);}
async function dbltap(x,y){await touch('touchEnd',[]).catch(()=>{});await touch('touchStart',[{x,y}]);await wait(30);await touch('touchEnd',[]);await wait(90);await touch('touchStart',[{x,y}]);await wait(30);await touch('touchEnd',[]);await wait(300);}
async function longPressG(x,y,ms=560){await touch('touchEnd',[]).catch(()=>{});await touch('touchStart',[{x,y}]);await wait(ms);await touch('touchEnd',[]);await wait(340);}
async function pinchG(cx,cy,from,to,steps=16){await touch('touchEnd',[]).catch(()=>{});let d=from;await touch('touchStart',[{x:cx,y:cy-d},{x:cx,y:cy+d}]);for(let i=1;i<=steps;i++){d=from+((to-from)*i)/steps;await touch('touchMove',[{x:cx,y:cy-d},{x:cx,y:cy+d}]);await wait(16);}await touch('touchEnd',[]);await wait(300);}
async function twistG(cx,cy,deg,steps=14){await touch('touchEnd',[]).catch(()=>{});const r=130;await touch('touchStart',[{x:cx-r,y:cy},{x:cx+r,y:cy}]);for(let i=1;i<=steps;i++){const a=(deg*Math.PI/180)*i/steps;await touch('touchMove',[{x:cx-r*Math.cos(a),y:cy-r*Math.sin(a)},{x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)}]);await wait(14);}await touch('touchEnd',[]);await wait(220);}
const st=()=>p.evaluate(()=>({z:+cam.z.toFixed(3),rot:+cam.rot.toFixed(3),stack:stack.length,lockOn,focus:FOCUS.length,unfolded:document.querySelectorAll('.word.unfolded').length}));

await p.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:'networkidle'});
await wait(3500);

// helper: is this build the ghost revision?
const hasGhost = await p.evaluate(()=>typeof ghostFloor!=='undefined');
log('build', { src: SRC, tag: TAG, hasGhostFloor: hasGhost });

// ===== A: ghost census, MY OWN arithmetic, per theme =====
const censusMine = () => p.evaluate(()=>{
  const lin=c=>{c/=255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4;};
  const L=([r,g,b])=>0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
  const parse=s=>{const m=String(s).match(/rgba?\(([^)]+)\)/);if(!m)return[0,0,0,1];const q=m[1].split(',').map(parseFloat);return[q[0],q[1],q[2],q[3]==null?1:q[3]];};
  const gh=(getComputedStyle(document.documentElement).getPropertyValue('--ground').trim()||'#FBFAF5').replace('#','');
  const gr=[parseInt(gh.slice(0,2),16),parseInt(gh.slice(2,4),16),parseInt(gh.slice(4,6),16)];
  const ratio=(a,bg)=>{const la=L(a),lb=L(bg);return (Math.max(la,lb)+0.05)/(Math.min(la,lb)+0.05);};
  const G=[],K=[];
  for(const n of nodes){
    if(n.kind!=='word'||n.gone||n.removed||!n.el) continue;
    const cs=getComputedStyle(n.el); const op=parseFloat(cs.opacity);
    if(!(op>0.002)) continue;
    const r=n.el.getBoundingClientRect();
    if(r.right<0||r.left>innerWidth||r.bottom<0||r.top>innerHeight) continue;
    const c=parse(cs.color); const a=(c[3]==null?1:c[3])*op;
    const comp=[c[0]*a+gr[0]*(1-a),c[1]*a+gr[1]*(1-a),c[2]*a+gr[2]*(1-a)];
    const rec={w:n.w.slice(0,6),op:+op.toFixed(4),baseOp:+n.op.toFixed(4),cr:+ratio(comp,gr).toFixed(3),
      pe:cs.pointerEvents,collide:n.collide==null?null:+n.collide.toFixed(3),
      ghostOp:n.ghostOp==null?null:+n.ghostOp.toFixed(3)};
    if(n.collide!=null&&n.collide<0.5) G.push(rec); else K.push(rec);
  }
  const mn=(a,k)=>a.length?Math.min(...a.map(x=>x[k])):null;
  const mx=(a,k)=>a.length?Math.max(...a.map(x=>x[k])):null;
  return {theme:document.getElementById('theme').textContent, nGhost:G.length, nKept:K.length,
    ghostMinOp:mn(G,'op'), ghostMaxOp:mx(G,'op'), ghostMinCr:mn(G,'cr'), ghostMaxCr:mx(G,'cr'),
    keptMinOp:mn(K,'op'), keptMinCr:mn(K,'cr'),
    minBaseOpAll:Math.min(...[...G,...K].map(x=>x.baseOp)),
    peNone:[...G,...K].filter(x=>x.pe==='none').length,
    liveFloor: typeof ghostFloor!=='undefined'? +ghostFloor.toFixed(3):null,
    ghosts:G.slice(0,6)};
});
const themeBox = await p.evaluate(()=>{const r=document.getElementById('theme').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};});
const perTheme={};
for(let i=0;i<5;i++){ await wait(1400); const c=await censusMine(); perTheme[c.theme]=c; await tap(themeBox.x,themeBox.y); await wait(500); }
log('A-ghost-census-per-theme', Object.fromEntries(Object.entries(perTheme).map(([k,v])=>[k,{nGhost:v.nGhost,ghostOp:[v.ghostMinOp,v.ghostMaxOp],ghostCr:[v.ghostMinCr,v.ghostMaxCr],keptMinOp:v.keptMinOp,keptMinCr:v.keptMinCr,minBaseOpAll:v.minBaseOpAll,peNone:v.peNone,liveFloor:v.liveFloor}])));

// ===== B: MY OWN live tap on a ghost (independent point selection) =====
await wait(1500);
const ghostPick = await p.evaluate(()=>{
  for(const n of nodes){
    if(n.kind!=='word'||n.gone||n.removed||!n.el) continue;
    if(!(n.collide!=null&&n.collide<0.5)) continue;
    const r=n.el.getBoundingClientRect();
    const x=r.left+r.width/2, y=r.top+r.height/2;
    if(x<25||x>innerWidth-25||y<80||y>innerHeight-130) continue;
    return {seqId:n.seqId, w:n.w, x, y, op:+parseFloat(getComputedStyle(n.el).opacity).toFixed(3),
      elementAtPoint:(()=>{const e=document.elementFromPoint(x,y);return e?(e.id?'#'+e.id:e.tagName+'.'+String(e.className||'').slice(0,20)):'null';})()};
  }
  return null;
});
if (ghostPick) {
  await tap(ghostPick.x, ghostPick.y);
  await wait(700);
  const after = await p.evaluate(id=>{const n=nodes.find(n=>n.seqId===id);return n?{collide:+n.collide.toFixed(2),op:+parseFloat(getComputedStyle(n.el).opacity).toFixed(3),isFocus:focusN===n,unfolded:n.el.classList.contains('unfolded'),hl:!!n.hlDom}:null;}, ghostPick.seqId);
  log('B-my-own-tap-on-ghost', { picked: ghostPick, after, promoted: !!(after&&(after.isFocus||after.unfolded||after.hl)) });
} else log('B-my-own-tap-on-ghost', { picked: null, note: 'no ghost in a tappable position' });

// ===== C: does a ghost lift at rest, no input? (they admit no — confirm) =====
await p.evaluate(()=>{ if(typeof recenterCam==='function') recenterCam(); }); await wait(2000);
const track = await p.evaluate(()=>nodes.filter(n=>n.kind==='word'&&n.collide!=null&&n.collide<0.5).map(n=>n.w).slice(0,5));
const series=[];
for(let i=0;i<10;i++){ await wait(3000); series.push(await p.evaluate(ws=>ws.map(w=>{const n=nodes.find(n=>n.kind==='word'&&n.w===w);return n?+parseFloat(getComputedStyle(n.el).opacity).toFixed(3):null;}),track)); }
log('C-30s-rest-no-input', { words: track, series });

// ===== D: ghost / winner ratio — is the claimed <=0.45 upper bound real? =====
log('D-ghost-vs-winner-ratio', await p.evaluate(()=>{
  if (typeof ghostFloor==='undefined') return {n:0,note:'baseline build, no arbiter'};
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
      if(k===a) continue;
      if(!(k.n.collide!=null&&k.n.collide>0.95)) continue;
      const ox=Math.min(a.cx+a.hw,k.cx+k.hw)-Math.max(a.cx-a.hw,k.cx-k.hw); if(ox<=0) continue;
      const oy=Math.min(a.cy+a.hh,k.cy+k.hh)-Math.max(a.cy-a.hh,k.cy-k.hh); if(oy<=0) continue;
      if(ox*oy>Math.min(4*a.hw*a.hh,4*k.hw*k.hh)*0.12 && k.eff<qw) qw=k.eff;
    }
    if(qw<Infinity) rows.push({w:a.n.w.slice(0,6), ghostOp:+(a.n.ghostOp||0).toFixed(3), quietestWinner:+qw.toFixed(3), ratio:+((a.n.ghostOp||0)/qw).toFixed(3)});
  }
  return { n: rows.length, maxRatio: rows.length?Math.max(...rows.map(r=>r.ratio)):null, GHOST_REL_claimed:0.45, rows };
}));

// ===== E: the 夜 / #lvl equivalence claim — is a word under #lvl reachable AT ALL? =====
log('E-under-lvl-reachability', await p.evaluate(()=>{
  const lvl=document.getElementById('lvl');
  if(!lvl) return {note:'no #lvl'};
  const lr=lvl.getBoundingClientRect();
  const cs=getComputedStyle(lvl);
  const res=[];
  for(const n of nodes){
    if(n.kind!=='word'||n.gone||n.removed||!n.el) continue;
    const r=n.el.getBoundingClientRect();
    if(!(r.right>lr.left&&r.left<lr.right&&r.bottom>lr.top&&r.top<lr.bottom)) continue;
    // sample the word's own box: does ANY point resolve to the word?
    let self=0, tolvl=0, pts=0;
    for(let gx=1;gx<=5;gx++)for(let gy=1;gy<=5;gy++){
      const x=r.left+r.width*gx/6, y=r.top+r.height*gy/6;
      if(x<1||x>innerWidth-1||y<1||y>innerHeight-1) continue;
      pts++;
      const e=document.elementFromPoint(x,y);
      if(e&&e.closest&&e.closest('.word')===n.el) self++;
      else if(e&&e.closest&&e.closest('#lvl')) tolvl++;
    }
    res.push({w:n.w.slice(0,6), op:+parseFloat(getComputedStyle(n.el).opacity).toFixed(3),
      collide:n.collide==null?null:+n.collide.toFixed(2), pts, resolvesToSelf:self, resolvesToLvl:tolvl,
      fullyInsideLvl: r.left>=lr.left&&r.right<=lr.right&&r.top>=lr.top&&r.bottom<=lr.bottom});
  }
  return { lvlRect:{x:Math.round(lr.x),y:Math.round(lr.y),w:Math.round(lr.width),h:Math.round(lr.height)},
    lvlPointerEvents:cs.pointerEvents, lvlZIndex:cs.zIndex, wordsOverlappingLvl:res };
}));

// ===== F: spot-check the three confirmed mechanisms =====
await p.evaluate(()=>{ if(typeof recenterCam==='function') recenterCam(); else {cam.z=1;cam.rot=0;} }); await wait(1600);
const near=(x,y,notT)=>p.evaluate(([x,y,notT])=>{let best=null,bd=1e9;for(const el of document.querySelectorAll('.word')){const cs=getComputedStyle(el);if(parseFloat(cs.opacity)<0.4||cs.pointerEvents==='none')continue;if(notT&&el.textContent===notT)continue;const r=el.getBoundingClientRect();const cx=r.left+r.width/2,cy=r.top+r.height/2;if(cx<60||cx>innerWidth-20||cy<70||cy>innerHeight-120)continue;const d=Math.hypot(cx-x,cy-y);if(d<bd){bd=d;best={cx,cy,t:el.textContent};}}return best;},[x,y,notT||null]);
const fp=()=>p.evaluate(()=>focusN&&!focusN.gone?{cx:focusN.x+focusN.dragX,cy:focusN.y+focusN.dragY}:null);
const water=()=>p.evaluate(()=>{const cand=[[30,120],[360,120],[360,700],[30,700],[195,700]];for(const[x,y]of cand){const e=document.elementFromPoint(x,y);if((!e||!e.closest('.word,.glyph,.part,#card,#theme,#lvl,#hint,#brand,#depth,#tray,#radoc'))&&(typeof hubAt!=='function'||hubAt(x,y)==null))return[x,y];}return[195,700];});
const w1=await near(195,420);
if(w1){ await tap(w1.cx,w1.cy); for(let i=0;i<2;i++){const q=(await fp())||w1; await tap(q.cx,q.cy);} }
const inDive=await st();
let latch={enteredDive:inDive.stack};
if(inDive.stack>=1){ await pinchG(195,420,150,45); const a=await st(); latch={enteredDive:inDive.stack,zBefore:inDive.z,zAfter:a.z,stackBefore:inDive.stack,stackAfter:a.stack}; }
log('F1-pinch-dive-latch', latch);
for(let i=0;i<5&&(await st()).stack>0;i++){const[x,y]=await water();await tap(x,y);}
await p.evaluate(()=>{ if(typeof recenterCam==='function') recenterCam(); else {cam.z=1;cam.rot=0;} }); await wait(1600);
await pinchG(195,420,45,200); await twistG(195,420,150); await wait(1300);
const messy=await st();
let [ex,ey]=await water(); await tap(ex,ey); await wait(1900); const single=await st();
await dbltap(ex,ey); await wait(2300); const dbl=await st();
log('F2-single-vs-double-tap', { messy, afterSingle: single, afterDouble: dbl });
await p.evaluate(()=>{ if(typeof recenterCam==='function') recenterCam(); else {cam.z=1;cam.rot=0;} }); await wait(1600);
const A=await near(140,380); if(A){await tap(A.cx,A.cy); await wait(1500);}
const u1=(await st()).unfolded;
const B=A?await near(280,540,A.t):null;
if(A&&B){ await longPressG(B.cx,B.cy,560); const sl=await st();
  await pinchG(195,420,200,45); await pinchG(195,420,200,45); await wait(900);
  const s8=await st(); const vis=await p.evaluate(()=>FOCUS.filter(n=>n.vis===frameCount).length);
  log('F3-lock', { A:A.t.slice(0,8), B:B.t.slice(0,8), unfoldedBefore:u1, unfoldedAfter:sl.unfolded, lockOn:sl.lockOn, members:sl.focus, minzoom:{z:s8.z,lockOn:s8.lockOn,focus:s8.focus,visible:vis} });
}
log('ERRORS', errs);
fs.writeFileSync(`${OUT}/probe6-${TAG}.json`, JSON.stringify(out,null,2));
console.log('\n-> '+OUT+`/probe6-${TAG}.json`);
await b.close(); server.close(); process.exit(0);
