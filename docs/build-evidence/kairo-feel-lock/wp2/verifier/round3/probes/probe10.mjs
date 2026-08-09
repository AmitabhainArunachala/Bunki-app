/** Probe 10 (round 3) — the case probe 9 could not find naturally.
 *  2a  at rest, a GHOST standing on a hub -> the door must answer (dive)
 *  2b  THE ROUND-2 REGRESSION SCENARIO: with a bloom held, a word painted at or
 *      below ghost presence (bloom dims non-members to op*0.3) standing on a hub
 *      -> the release must free the constellation, not be eaten by that word.
 *      This is the case that defeated a collide-flag test.
 */
import pwc from '/home/user/Bunki-app/node_modules/playwright-core/index.js';
const { chromium } = pwc;
import http from 'node:http';
import fs from 'node:fs';
const SRC='/home/user/Bunki-app/.claude/worktrees/agent-aa8fa572d39c96ca3/prototypes/drift/drift-artifact.html';
const OUT='/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/probe-out10';
fs.mkdirSync(OUT,{recursive:true});
const PORT=9001;
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
async function tap(x,y){await touch('touchEnd',[]).catch(()=>{});await touch('touchStart',[{x,y}]);await wait(35);await touch('touchEnd',[]);await wait(450);}
async function swipeG(x0,y0,x1,y1,steps=12,hold=14){await touch('touchEnd',[]).catch(()=>{});await touch('touchStart',[{x:x0,y:y0}]);for(let i=1;i<=steps;i++){await touch('touchMove',[{x:x0+((x1-x0)*i)/steps,y:y0+((y1-y0)*i)/steps}]);await wait(hold);}await touch('touchEnd',[]);await wait(500);}
async function pinchG(cx,cy,from,to,steps=16){await touch('touchEnd',[]).catch(()=>{});let d=from;await touch('touchStart',[{x:cx,y:cy-d},{x:cx,y:cy+d}]);for(let i=1;i<=steps;i++){d=from+((to-from)*i)/steps;await touch('touchMove',[{x:cx,y:cy-d},{x:cx,y:cy+d}]);await wait(16);}await touch('touchEnd',[]);await wait(400);}
const st=()=>p.evaluate(()=>({stack:stack.length,depth:document.getElementById('depth').textContent,focus:FOCUS.length,lockOn,ctr:focusN?focusN.w:null}));
const water=()=>p.evaluate(()=>{const c=[[30,120],[360,120],[360,700],[30,700],[195,760]];
  for(const[x,y] of c){const e=document.elementFromPoint(x,y);
    if((!e||!e.closest('.word,.glyph,.part,#card,#theme,#lvl,#hint,#brand,#depth,#tray,#radoc'))&&(typeof hubAt!=='function'||hubAt(x,y)==null))return[x,y];}
  return [195,760];});
const reset=async()=>{for(let i=0;i<6;i++){const s=await st();if(s.stack===0&&s.focus===0)break;const[x,y]=await water();await tap(x,y);}await wait(700);};
const scanGhostOnHub=()=>p.evaluate(()=>{
  const gf=ghostFloor, res=[];
  for(let x=20;x<=370;x+=4) for(let y=90;y<=730;y+=4){
    if(!(typeof hubAt==='function'&&hubAt(x,y)!=null)) continue;
    const e=document.elementFromPoint(x,y);
    const wEl=e&&e.closest?e.closest('.word'):null;
    const n=wEl?nodeOf.get(wEl):null;
    if(!n||n.kind!=='word'||n.gone||n.removed) continue;
    const op=parseFloat(getComputedStyle(n.el).opacity);
    if(op<=gf+0.01) res.push({x,y,w:n.w.slice(0,8),seqId:n.seqId,op:+op.toFixed(3),collide:n.collide==null?null:+n.collide.toFixed(2)});
  }
  return res;
});

await p.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:'networkidle'});
await wait(3600);

// ---- 2a: search camera states until a ghost stands on a hub ----
let found=null, tried=[];
const moves=[
  async()=>{},
  async()=>{await swipeG(195,600,195,300);},
  async()=>{await swipeG(300,400,120,400);},
  async()=>{await pinchG(195,420,45,150);},
  async()=>{await swipeG(195,300,195,620);},
  async()=>{await pinchG(195,420,150,45);await swipeG(120,400,320,400);},
  async()=>{await pinchG(195,420,45,200);},
];
for (let i=0;i<moves.length && !found;i++){
  await reset(); await moves[i](); await wait(1600);
  const hits=await scanGhostOnHub();
  tried.push({move:i, hits:hits.length, z:(await p.evaluate(()=>+cam.z.toFixed(2)))});
  if(hits.length) found={...hits[0], move:i};
}
log('2a-search', {tried, found});
if (found){
  const before=await st();
  const pre=await p.evaluate(id=>{const n=nodes.find(n=>n.seqId===id);return {op:+parseFloat(getComputedStyle(n.el).opacity).toFixed(3),collide:+n.collide.toFixed(2)};},found.seqId);
  await tap(found.x,found.y);
  const after=await st();
  const gAfter=await p.evaluate(id=>{const n=nodes.find(n=>n.seqId===id);return n?{isFocus:focusN===n,unfolded:n.el.classList.contains('unfolded')}:null;},found.seqId);
  log('2a-ghost-on-hub-door-answers', {point:found, preTap:pre, before:{stack:before.stack,depth:before.depth},
    after:{stack:after.stack,depth:after.depth,ctr:after.ctr}, ghostAfter:gAfter,
    PASS: after.stack>before.stack && !(gAfter&&(gAfter.isFocus||gAfter.unfolded))});
}

// ---- 2b: THE REGRESSION SCENARIO — bloom held, dimmed word on a hub ----
await reset();
// raise a bloom: tap a loud word
const seed = await p.evaluate(()=>{
  let best=null,bd=1e9;
  for(const n of nodes){ if(n.kind!=='word'||n.gone||n.removed) continue;
    const op=parseFloat(getComputedStyle(n.el).opacity); if(op<0.5) continue;
    const r=n.el.getBoundingClientRect(); const cx=r.left+r.width/2, cy=r.top+r.height/2;
    if(cx<70||cx>320||cy<140||cy>600) continue;
    const d=Math.hypot(cx-195,cy-420); if(d<bd){bd=d;best={cx,cy,w:n.w};}}
  return best;});
if (seed){
  await tap(seed.cx,seed.cy); await wait(1500);
  const held=await st();
  // with FOCUS up, non-members paint at op*0.3 — find one on a hub
  const hits=await scanGhostOnHub();
  log('2b-bloom-state', {seed:seed.w.slice(0,8), held:{focus:held.focus,ctr:held.ctr&&held.ctr.slice(0,8),lockOn:held.lockOn}, dimmedOnHub:hits.length, sample:hits.slice(0,3)});
  if (hits.length){
    const h=hits[0];
    const pre=await p.evaluate(id=>{const n=nodes.find(n=>n.seqId===id);
      return {op:+parseFloat(getComputedStyle(n.el).opacity).toFixed(3), collide:+n.collide.toFixed(2),
              isMember:!!n.hlDom, isCentre:focusN===n};},h.seqId);
    await tap(h.x,h.y);
    const after=await st();
    log('2b-release-over-hub-with-dimmed-word', {point:h, preTap:pre,
      before:{focus:held.focus, ctr:held.ctr&&held.ctr.slice(0,8)},
      after:{focus:after.focus, ctr:after.ctr&&after.ctr.slice(0,8), stack:after.stack, depth:after.depth},
      PASS_constellationReleasedOrDoorOpened: (after.focus===0) || (after.stack>held.stack),
      FAIL_wordAteTheRelease: after.ctr!=null && after.ctr===h.w});
  }
}
log('ERRORS',errs);
fs.writeFileSync(`${OUT}/probe10.json`,JSON.stringify(out,null,2));
console.log('\n-> '+OUT+'/probe10.json');
await b.close();server.close();process.exit(0);
