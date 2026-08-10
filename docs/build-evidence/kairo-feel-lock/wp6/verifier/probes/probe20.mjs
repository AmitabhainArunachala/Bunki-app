/** Probe 20 (WP6) — the 2x2 ladder matrix, verified from RENDERED STYLE.
 * My own assertions. Reads getComputedStyle opacity of .yomi (reading) and
 * .gloss (English) — never class names — plus stack depth, FOCUS size and the
 * WP2 ghost floor. Also: switch away and back, and prove the state restores.
 */
import pwc from '/home/user/Bunki-app/node_modules/playwright-core/index.js';
const { chromium } = pwc;
import http from 'node:http';
import fs from 'node:fs';
import { resolve } from 'node:path';
const SRC=resolve(process.argv[2]), PORT=Number(process.argv[3]||9601);
const OUT='/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/probe-out20';
fs.mkdirSync(OUT,{recursive:true});
const body=fs.readFileSync(SRC,'utf8');
const html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"></head><body>${body}</body></html>`;
const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end(html);}).listen(PORT);
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const results=[]; const errsAll=[];
const R=(name,pass,detail)=>{results.push({name,pass,detail});console.log(`${pass?'PASS':'FAIL'}  ${name}: ${detail}`);};

async function combo(ladder, satTap){
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message.slice(0,140)));
  p.on('console',m=>{if(m.type()==='error')errs.push('console.error '+m.text().slice(0,140));});
  const cdp=await ctx.newCDPSession(p);
  const T=(t,pts)=>cdp.send('Input.dispatchTouchEvent',{type:t,touchPoints:pts.map(([x,y])=>({x,y}))});
  const wait=ms=>p.waitForTimeout(ms);
  await p.goto(`http://127.0.0.1:${PORT}/?ladder=${ladder}&sattap=${satTap}`,{waitUntil:'networkidle'});
  await wait(3400);
  const seeded=await p.evaluate(()=>window.__DRIFT_TAP__.get());
  const tap=async(x,y)=>{await T('touchEnd',[]).catch(()=>{});await T('touchStart',[[x,y]]);await wait(35);await T('touchEnd',[]);await wait(950);};
  // rendered-style reader for a specific node: reading + English opacity
  const read=(seqId)=>p.evaluate(id=>{
    const n=nodes.find(n=>n.seqId===id); if(!n||!n.el) return null;
    const y=n.el.querySelector('.yomi'), g=n.el.querySelector('.gloss');
    return { readingOp: y?+parseFloat(getComputedStyle(y).opacity).toFixed(3):null,
             englishOp: g?+parseFloat(getComputedStyle(g).opacity).toFixed(3):null,
             wordOp:+parseFloat(getComputedStyle(n.el).opacity).toFixed(3),
             isFocus: focusN===n, stack:stack.length, focusN_w: focusN?focusN.w:null,
             FOCUS: FOCUS.length };},seqId);
  const floor=()=>p.evaluate(()=>{
    let mn=1; for(const el of document.querySelectorAll('.word')){
      const o=parseFloat(getComputedStyle(el).opacity); if(o>0.002) mn=Math.min(mn,o);}
    return {minRenderedOp:+mn.toFixed(3), ghostFloor:+ghostFloor.toFixed(3)};});
  const pick=()=>p.evaluate(()=>{
    let best=null,bd=1e9;
    for(const n of nodes){ if(n.kind!=='word'||n.gone||n.removed) continue;
      const cs=getComputedStyle(n.el); if(parseFloat(cs.opacity)<0.4||cs.pointerEvents==='none') continue;
      if(!n.r) continue;                       // needs a reading to test the rungs
      const r=n.el.getBoundingClientRect(); const cx=r.left+r.width/2, cy=r.top+r.height/2;
      if(cx<80||cx>310||cy<220||cy>580) continue;
      const d=Math.hypot(cx-195,cy-400); if(d<bd){bd=d;best={cx,cy,seqId:n.seqId,w:n.w};}}
    return best;});
  const live=(id)=>p.evaluate(i=>{const n=nodes.find(n=>n.seqId===i);
    return n&&!n.gone?{cx:n.x+n.dragX,cy:n.y+n.dragY}:null;},id);
  const tag=`${ladder}+${satTap}`;
  R(`${tag}·seeded`, seeded.ladder===ladder&&seeded.satTap===satTap, JSON.stringify(seeded));

  // ---------- the word ladder ----------
  const w=await pick();
  if(!w){ R(`${tag}·ladder`,false,'no candidate word'); await ctx.close(); return errs; }
  const s0=await read(w.seqId);
  await tap(w.cx,w.cy);  const s1=await read(w.seqId);
  const f1=await live(w.seqId); await tap(f1?f1.cx:w.cx,f1?f1.cy:w.cy); const s2=await read(w.seqId);
  const f2=await live(w.seqId); await tap(f2?f2.cx:w.cx,f2?f2.cy:w.cy); const s3=await read(w.seqId);
  const f3=await live(w.seqId); await tap(f3?f3.cx:w.cx,f3?f3.cy:w.cy); const s4=await read(w.seqId);
  const seq={rest:s0,tap1:s1,tap2:s2,tap3:s3,tap4:s4};
  if(ladder==='stage3'){
    R(`${tag}·rung1 = forefront+family+reading`,
      s1.readingOp>0 && s1.englishOp===0 && s1.FOCUS>0 && s1.stack===0,
      `readingOp=${s1.readingOp} englishOp=${s1.englishOp} FOCUS=${s1.FOCUS} stack=${s1.stack}`);
    R(`${tag}·rung2 = English`, s2.englishOp>0 && s2.stack===0,
      `englishOp=${s2.englishOp} stack=${s2.stack}`);
    R(`${tag}·rung3 = dive`, s3.stack===1, `stack=${s3.stack}`);
    R(`${tag}·no early dive`, s1.stack===0&&s2.stack===0, `stack after t1/t2 = ${s1.stack}/${s2.stack}`);
  } else {
    R(`${tag}·rung1 = forefront+family, reading NOT shown`,
      s1.readingOp===0 && s1.englishOp===0 && s1.FOCUS>0 && s1.stack===0,
      `readingOp=${s1.readingOp} englishOp=${s1.englishOp} FOCUS=${s1.FOCUS} stack=${s1.stack}`);
    R(`${tag}·rung2 = reading`, s2.readingOp>0 && s2.englishOp===0 && s2.stack===0,
      `readingOp=${s2.readingOp} englishOp=${s2.englishOp} stack=${s2.stack}`);
    R(`${tag}·rung3 = English`, s3.englishOp>0 && s3.stack===0,
      `englishOp=${s3.englishOp} stack=${s3.stack}`);
    R(`${tag}·rung4 = dive`, s4.stack===1, `stack=${s4.stack}`);
    R(`${tag}·no early dive`, s1.stack===0&&s2.stack===0&&s3.stack===0,
      `stack after t1/t2/t3 = ${s1.stack}/${s2.stack}/${s3.stack}`);
    R(`${tag}·family 14->14 under the extra rung`, s1.FOCUS===s2.FOCUS,
      `FOCUS rung1=${s1.FOCUS} rung2=${s2.FOCUS}`);
  }
  const fl=await floor();
  R(`${tag}·nothing-disappears floor`, fl.minRenderedOp>=fl.ghostFloor-0.005,
    `minRenderedOp=${fl.minRenderedOp} vs ghostFloor=${fl.ghostFloor}`);

  // ---------- the satellite tap ----------
  await p.goto(`http://127.0.0.1:${PORT}/?ladder=${ladder}&sattap=${satTap}`,{waitUntil:'networkidle'});
  await wait(3400);
  const seed=await pick();
  if(seed){
    await tap(seed.cx,seed.cy); await wait(900);
    const sat=await p.evaluate(()=>{
      const c=focusN;
      for(const wr of FOCUS){ const n=wr.node; if(!n||n.gone||n===c||!n.el) continue;
        const r=n.el.getBoundingClientRect(); const cx=r.left+r.width/2, cy=r.top+r.height/2;
        if(cx<30||cx>360||cy<110||cy>720) continue;
        return {cx,cy,seqId:n.seqId,w:n.w,centre:c?c.w:null};}
      return null;});
    if(sat){
      const before=await p.evaluate(()=>focusN?focusN.w:null);
      await tap(sat.cx,sat.cy);
      const a1=await read(sat.seqId);
      if(satTap==='staged'){
        R(`${tag}·satellite tap1 reveals in place (does NOT recentre)`,
          a1.isFocus===false && a1.focusN_w===before,
          `focusN "${before}" -> "${a1.focusN_w}", satelliteIsFocus=${a1.isFocus}, readingOp=${a1.readingOp}`);
        const l2=await live(sat.seqId); await tap(l2?l2.cx:sat.cx,l2?l2.cy:sat.cy);
        const a2=await read(sat.seqId);
        R(`${tag}·satellite tap2 recentres`, a2.isFocus===true,
          `focusN -> "${a2.focusN_w}", satelliteIsFocus=${a2.isFocus}`);
      } else {
        R(`${tag}·satellite tap1 recentres at once`,
          a1.isFocus===true && a1.focusN_w===sat.w,
          `focusN "${before}" -> "${a1.focusN_w}", satelliteIsFocus=${a1.isFocus}`);
        const expectReading = ladder==='stage3';
        R(`${tag}·recentred satellite lands on rung 1 of the active ladder`,
          expectReading ? a1.readingOp>0 : true,
          `ladder=${ladder} readingOp=${a1.readingOp} (stage3 expects >0)`);
      }
    } else R(`${tag}·satellite`,false,'no satellite found');
  }
  await ctx.close();
  return errs;
}

for (const [l,s] of [['stage3','staged'],['stage4','staged'],['stage3','recenter'],['stage4','recenter']])
  errsAll.push(...await combo(l,s));

// ---------- switching back restores exactly ----------
{
  const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const p=await ctx.newPage();
  await p.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:'networkidle'});
  await p.waitForTimeout(2500);
  const seq=[];
  for(const o of [{ladder:'stage4',satTap:'recenter'},{ladder:'stage3',satTap:'staged'},
                  {ladder:'stage4',satTap:'staged'},{ladder:'stage3',satTap:'staged'}])
    seq.push(await p.evaluate(x=>window.__DRIFT_TAP__.set(x),o));
  const bad=await p.evaluate(()=>window.__DRIFT_TAP__.set({ladder:'nonsense',satTap:'junk'}));
  R('switch-back restores exactly', JSON.stringify(seq[1])===JSON.stringify(seq[3]) &&
      seq[3].ladder==='stage3'&&seq[3].satTap==='staged',
    `sequence ${seq.map(s=>s.ladder+'/'+s.satTap).join(' → ')}`);
  R('unknown values ignored', bad.ladder==='stage3'&&bad.satTap==='staged', JSON.stringify(bad));
  await ctx.close();
}
const pass=results.filter(r=>r.pass).length;
console.log(`\nERRORS: ${errsAll.length?JSON.stringify(errsAll):'none'}`);
console.log(`\n${pass}/${results.length} assertions passed`);
fs.writeFileSync(`${OUT}/matrix.json`,JSON.stringify({pass,total:results.length,results,errs:errsAll},null,2));
await b.close();server.close();process.exit(0);
