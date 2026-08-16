/** Probe 22 (WP6) — my own seeded default-parity differential.
 * Math.random is replaced by a seeded PRNG BEFORE the page script runs, so both
 * trees build the identical field. The same gesture script is driven against
 * each, and a SEMANTIC state trace (not pixel positions) is compared after every
 * gesture. Any single differing field refutes default parity.
 */
import pwc from '/home/user/Bunki-app/node_modules/playwright-core/index.js';
const { chromium } = pwc;
import http from 'node:http';
import fs from 'node:fs';
import { resolve } from 'node:path';
const A=resolve(process.argv[2]), B=resolve(process.argv[3]);
const SEEDS=(process.argv[4]||'1,2,3,4').split(',').map(Number);
const OUT='/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/probe-out22';
fs.mkdirSync(OUT,{recursive:true});
const serve=(src,port)=>{const body=fs.readFileSync(src,'utf8');
  const html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"></head><body>${body}</body></html>`;
  return http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end(html);}).listen(port);};
const sA=serve(A,9801), sB=serve(B,9802);
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});

const PRNG = (seed)=>`(()=>{let s=${seed}>>>0;Math.random=function(){s^=s<<13;s>>>=0;s^=s>>17;s^=s<<5;s>>>=0;return s/4294967296;};})()`;

// the semantic state the trace compares — deliberately excludes animated
// positions, which differ by frame timing on any two loads
const TRACE = `(() => {
  const words=[...document.querySelectorAll('.word')];
  const cls=(c)=>words.filter(e=>e.classList.contains(c)).map(e=>e.querySelector('.base')?.textContent??'').sort();
  const styleOf=(sel)=>words.map(e=>{const q=e.querySelector(sel);
    return q?(e.querySelector('.base')?.textContent??'')+':'+Math.round(parseFloat(getComputedStyle(q).opacity)*100):null;})
    .filter(Boolean).sort();
  return {
    stack: stack.length,
    depth: document.getElementById('depth').textContent,
    ctr: focusN ? focusN.w : null,
    focusN_gone: focusN ? !!focusN.gone : null,
    FOCUS: FOCUS.length,
    members: FOCUS.map(w=>w.node?w.node.w:(w.w??'?')).sort(),
    unfolded: cls('unfolded'),
    glossed: cls('glossed'),
    lockOn: lockOn,
    tray: document.getElementById('tray').textContent,
    cardOpen: document.getElementById('card').classList.contains('open'),
    tapped: (()=>{ const t=window.__TAPPED__; if(!t) return null;
      const el=words.find(e=>(e.querySelector('.base')?.textContent??'')===t);
      if(!el) return {w:t, present:false};
      const y=el.querySelector('.yomi'), g=el.querySelector('.gloss');
      return {w:t, present:true,
        readingOp: y?Math.round(parseFloat(getComputedStyle(y).opacity)*100):null,
        glossOp: g?Math.round(parseFloat(getComputedStyle(g).opacity)*100):null,
        wordOp: Math.round(parseFloat(getComputedStyle(el).opacity)*100)}; })(),
  };
})()`;

async function run(port, seed){
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message.slice(0,120)));
  p.on('console',m=>{if(m.type()==='error')errs.push('console.error '+m.text().slice(0,120));});
  await p.addInitScript(PRNG(seed));
  const cdp=await ctx.newCDPSession(p);
  const T=(t,pts)=>cdp.send('Input.dispatchTouchEvent',{type:t,touchPoints:pts.map(([x,y])=>({x,y}))});
  const wait=ms=>p.waitForTimeout(ms);
  await p.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await wait(3400);
  // freeze the field so both sides see identical geometry for hit-testing
  await p.evaluate(()=>{ refreshActive=function(){}; window.__pins=nodes.map(n=>({n,x:n.x,y:n.y}));
    window.__pl=setInterval(()=>{for(const q of window.__pins){q.n.x=q.x;q.n.y=q.y;}},8); });
  await wait(400);
  const trace=[];
  const snap=async(label)=>{ trace.push({label, s:await p.evaluate(TRACE)}); };
  const tap=async(x,y,label)=>{ await T('touchEnd',[]).catch(()=>{}); await T('touchStart',[[x,y]]);
    await wait(35); await T('touchEnd',[]); await wait(1000); await snap(label); };
  const longPress=async(x,y,label)=>{ await T('touchEnd',[]).catch(()=>{}); await T('touchStart',[[x,y]]);
    await wait(560); await T('touchEnd',[]); await wait(900); await snap(label); };
  await snap('rest');
  // a fixed grid of gesture targets — identical coordinates on both sides,
  // which is only meaningful because the field is seeded AND pinned
  const targets = await p.evaluate(()=>{
    const out=[];
    for(const n of nodes){ if(n.kind!=='word'||n.gone||n.removed) continue;
      const cs=getComputedStyle(n.el); if(parseFloat(cs.opacity)<0.4||cs.pointerEvents==='none') continue;
      const r=n.el.getBoundingClientRect(); const cx=r.left+r.width/2, cy=r.top+r.height/2;
      if(cx<80||cx>310||cy<200||cy>600) continue;
      out.push({cx:+cx.toFixed(1),cy:+cy.toFixed(1),w:n.w});
      if(out.length>=4) break; }
    return out;});
  let i=0;
  for(const t of targets){
    i++;
    await p.evaluate(w=>{window.__TAPPED__=w;},t.w);
    await tap(t.cx,t.cy,`tap1@${i}`);
    await tap(t.cx,t.cy,`tap2@${i}`);
    await tap(t.cx,t.cy,`tap3@${i}`);
    // back to water between targets
    const w=await p.evaluate(()=>{const c=[[30,120],[360,120],[360,700],[30,700],[195,760]];
      for(const[x,y] of c){const e=document.elementFromPoint(x,y);
        if((!e||!e.closest('.word,.glyph,.part,#card,#theme,#lvl,#hint,#brand,#depth,#tray,#radoc'))&&(typeof hubAt!=='function'||hubAt(x,y)==null))return[x,y];}
      return [195,760];});
    await tap(w[0],w[1],`water@${i}`);
  }
  if(targets[0]) await longPress(targets[0].cx,targets[0].cy,'longpress');
  await snap('final');
  await p.evaluate(()=>clearInterval(window.__pl));
  await ctx.close();
  return {trace, errs, targets};
}

const report={seeds:[],totalStates:0,differing:0};
for(const seed of SEEDS){
  const ra=await run(9801,seed), rb=await run(9802,seed);
  const fieldSame = JSON.stringify(ra.targets)===JSON.stringify(rb.targets);
  let diffs=[];
  const n=Math.min(ra.trace.length, rb.trace.length);
  for(let k=0;k<n;k++){
    const x=ra.trace[k], y=rb.trace[k];
    for(const key of Object.keys(x.s)){
      if(JSON.stringify(x.s[key])!==JSON.stringify(y.s[key]))
        diffs.push({state:x.label, field:key, base:x.s[key], wp6:y.s[key]});
    }
  }
  report.totalStates+=n; report.differing+=diffs.length;
  report.seeds.push({seed, states:n, sameFieldTargets:fieldSame,
    targets:ra.targets.map(t=>t.w), differingFields:diffs.length,
    diffs:diffs.slice(0,6), errsBase:ra.errs, errsWp6:rb.errs});
  console.log(`seed ${seed}: ${n} states · sameField=${fieldSame} · targets=[${ra.targets.map(t=>t.w).join(', ')}] · differing fields=${diffs.length}` +
    (diffs.length?'\n   '+JSON.stringify(diffs.slice(0,3)):''));
}
console.log(`\n### PARITY :: ${report.totalStates} states across ${SEEDS.length} seeds · ${report.differing} differing fields`);
fs.writeFileSync(`${OUT}/parity.json`,JSON.stringify(report,null,2));
await b.close(); sA.close(); sB.close(); process.exit(0);
