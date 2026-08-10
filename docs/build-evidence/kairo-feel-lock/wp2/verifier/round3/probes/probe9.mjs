/** Probe 9 (round 3) — the hub-vs-ghost rule, on my own instrument.
 *  1. ghost in OPEN WATER (no hub)      -> must promote to bloom centre
 *  2. ghost standing ON A HUB           -> tap must be answered by the DOOR
 *  3. FULL-PRESENCE word standing on a hub -> word must keep its tap (the
 *     "ratified satellite" behaviour they invoke for the run-5 outlier)
 */
import pwc from '/home/user/Bunki-app/node_modules/playwright-core/index.js';
const { chromium } = pwc;
import http from 'node:http';
import fs from 'node:fs';
const SRC='/home/user/Bunki-app/.claude/worktrees/agent-aa8fa572d39c96ca3/prototypes/drift/drift-artifact.html';
const OUT='/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/probe-out9';
fs.mkdirSync(OUT,{recursive:true});
const PORT=8999;
const body=fs.readFileSync(SRC,'utf8');
const html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"></head><body>${body}</body></html>`;
const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end(html);}).listen(PORT);
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
const p=await ctx.newPage();
const errs=[];p.on('pageerror',e=>errs.push('PAGEERROR '+e.message.slice(0,160)));
p.on('console',m=>{if(m.type()==='error')errs.push('console.error '+m.text().slice(0,160));});
const cdp=await ctx.newCDPSession(p);
const touch=(t,pts)=>cdp.send('Input.dispatchTouchEvent',{type:t,touchPoints:pts});
const wait=ms=>p.waitForTimeout(ms);
const out={};const log=(k,v)=>{out[k]=v;console.log('### '+k+' :: '+JSON.stringify(v));};
async function tap(x,y){await touch('touchEnd',[]).catch(()=>{});await touch('touchStart',[{x,y}]);await wait(35);await touch('touchEnd',[]);await wait(450);}
const st=()=>p.evaluate(()=>({stack:stack.length,depth:document.getElementById('depth').textContent,focus:FOCUS.length,lockOn,ctr:focusN?focusN.w:null}));
const reset=async()=>{ for(let i=0;i<6;i++){ const s=await st(); if(s.stack===0&&s.focus===0) break;
  const [x,y]=await p.evaluate(()=>{const c=[[30,120],[360,120],[360,700],[30,700],[195,760]];
    for(const[x,y] of c){const e=document.elementFromPoint(x,y);
      if((!e||!e.closest('.word,.glyph,.part,#card,#theme,#lvl,#hint,#brand,#depth,#tray,#radoc'))&&(typeof hubAt!=='function'||hubAt(x,y)==null))return[x,y];}
    return [195,760];});
  await tap(x,y); } await wait(600); };

await p.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:'networkidle'});
await wait(3600);
log('floor', await p.evaluate(()=>({ghostFloor:+ghostFloor.toFixed(3), GHOST_REL_still_defined: typeof GHOST_REL!=='undefined'})));

// classify every grid point: hub? word under? that word's rendered opacity?
const scan = () => p.evaluate(()=>{
  const gf = ghostFloor;
  const ghostOnHub=[], fullOnHub=[], ghostOpenWater=[];
  for(let x=20;x<=370;x+=6) for(let y=90;y<=720;y+=6){
    const onHub = typeof hubAt==='function' && hubAt(x,y)!=null;
    const e=document.elementFromPoint(x,y);
    const wEl=e&&e.closest?e.closest('.word'):null;
    const n=wEl?nodeOf.get(wEl):null;
    if(!n||n.kind!=='word'||n.gone||n.removed) continue;
    const op=parseFloat(getComputedStyle(n.el).opacity);
    const isGhost = op<=gf+0.01;
    const rec={x,y,w:n.w.slice(0,8),seqId:n.seqId,op:+op.toFixed(3),collide:n.collide==null?null:+n.collide.toFixed(2)};
    if(onHub&&isGhost) ghostOnHub.push(rec);
    else if(onHub&&op>gf+0.05) fullOnHub.push(rec);
    else if(!onHub&&isGhost) ghostOpenWater.push(rec);
  }
  return {ghostOnHub:ghostOnHub.slice(0,4), fullOnHub:fullOnHub.slice(0,4), ghostOpenWater:ghostOpenWater.slice(0,4),
    counts:{ghostOnHub:ghostOnHub.length, fullOnHub:fullOnHub.length, ghostOpenWater:ghostOpenWater.length}};
});

// ---- 1. ghost in open water must promote ----
await reset();
let s = await scan();
log('scan-rest', s.counts);
if (s.ghostOpenWater.length){
  const g=s.ghostOpenWater[0];
  const before=await st();
  await tap(g.x,g.y);
  const after=await p.evaluate(id=>{const n=nodes.find(n=>n.seqId===id);
    return {stack:stack.length, isFocus:focusN===n, unfolded:n?n.el.classList.contains('unfolded'):null,
      op:n?+parseFloat(getComputedStyle(n.el).opacity).toFixed(3):null, collide:n?+n.collide.toFixed(2):null};}, g.seqId);
  log('1-ghost-open-water-promotes', {point:g, stackBefore:before.stack, after,
    PASS: !!(after.isFocus||after.unfolded) && after.stack===0});
} else log('1-ghost-open-water-promotes', {note:'no ghost in open water this frame'});

// ---- 2. ghost standing on a hub: the DOOR must answer ----
await reset();
s = await scan();
if (s.ghostOnHub.length){
  const g=s.ghostOnHub[0];
  const before=await st();
  const hub=await p.evaluate(([x,y])=>{const h=hubAt(x,y);return h?(h.ch||h.k||h.w||String(h)):null;},[g.x,g.y]);
  await tap(g.x,g.y);
  const after=await st();
  const ghostAfter=await p.evaluate(id=>{const n=nodes.find(n=>n.seqId===id);
    return n?{isFocus:focusN===n, unfolded:n.el.classList.contains('unfolded'), op:+parseFloat(getComputedStyle(n.el).opacity).toFixed(3)}:null;}, g.seqId);
  log('2-ghost-on-hub-door-answers', {point:g, hub, before:{stack:before.stack,depth:before.depth},
    after:{stack:after.stack,depth:after.depth,ctr:after.ctr}, ghostAfter,
    PASS: after.stack>before.stack && !(ghostAfter&&(ghostAfter.isFocus||ghostAfter.unfolded))});
} else log('2-ghost-on-hub-door-answers', {note:'no ghost standing on a hub this frame'});

// ---- 3. full-presence word on a hub: the WORD must keep its tap ----
await reset();
s = await scan();
if (s.fullOnHub.length){
  const f=s.fullOnHub[0];
  const before=await st();
  await tap(f.x,f.y);
  const after=await st();
  const wAfter=await p.evaluate(id=>{const n=nodes.find(n=>n.seqId===id);
    return n?{isFocus:focusN===n, unfolded:n.el.classList.contains('unfolded'), op:+parseFloat(getComputedStyle(n.el).opacity).toFixed(3)}:null;}, f.seqId);
  log('3-full-presence-on-hub-word-keeps-tap', {point:f, before:{stack:before.stack},
    after:{stack:after.stack,depth:after.depth,ctr:after.ctr}, wAfter,
    PASS: !!(wAfter&&(wAfter.isFocus||wAfter.unfolded)) && after.stack===before.stack});
} else log('3-full-presence-on-hub-word-keeps-tap', {note:'no full-presence word on a hub this frame'});

log('ERRORS', errs);
fs.writeFileSync(`${OUT}/probe9.json`,JSON.stringify(out,null,2));
console.log('\n-> '+OUT+'/probe9.json');
await b.close();server.close();process.exit(0);
