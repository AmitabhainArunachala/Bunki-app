/** Probe 11 (WP7) — instrument the flick-judgment failure.
 * Replicates verify-drift-hunt's flick gesture exactly and records, per trial:
 *   · the aim gap (how far the word moved between resolving it and pressing)
 *   · whether pointerdown captured the word at all (pn)
 *   · whether the app judged it a flick (moved / held / dx)
 *   · the tray outcome
 * Distinguishes HARNESS AIM-STALENESS (press missed a moving word) from a
 * BEHAVIOUR REGRESSION (press landed, grading failed).
 * Usage: node probe11.mjs <src.html> <tag> <port> [trials]
 */
import pwc from '/home/user/Bunki-app/node_modules/playwright-core/index.js';
const { chromium } = pwc;
import http from 'node:http';
import fs from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(process.argv[2]);
const TAG = process.argv[3] || 'run';
const PORT = Number(process.argv[4] || 9101);
const TRIALS = Number(process.argv[5] || 12);
const SETTLE = Number(process.argv[6] || 3200);
const OUT = '/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/probe-out11';
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
const T=(t,pts)=>cdp.send('Input.dispatchTouchEvent',{type:t,touchPoints:pts.map(([x,y])=>({x,y}))});
const wait=ms=>p.waitForTimeout(ms);

// mirror of the hunt's anyWord, against the standalone DOM
const anyWord = () => p.evaluate(()=>{
  for (const el of document.querySelectorAll('.word')) {
    const r = el.getBoundingClientRect();
    if (!r.width || el.style.pointerEvents === 'none') continue;
    if (parseFloat(el.style.opacity || '1') < 0.35) continue;
    if (/[一-鿿]/.test(el.textContent) && r.left > 70 && r.right < 310 && r.top > 300 && r.bottom < 600) {
      const n = nodeOf.get(el);
      return { w: el.querySelector('.base').textContent, x: r.left + r.width/2, y: r.top + r.height/2,
               seqId: n?n.seqId:null, op:+parseFloat(el.style.opacity||'1').toFixed(3),
               collide:n&&n.collide!=null?+n.collide.toFixed(2):null };
    }
  }
  return null;
});
const liveAt = (seqId) => p.evaluate(id=>{
  const n=nodes.find(n=>n.seqId===id); if(!n||!n.el) return null;
  const r=n.el.getBoundingClientRect();
  return { x:r.left+r.width/2, y:r.top+r.height/2, w:r.width, h:r.height,
           op:+parseFloat(getComputedStyle(n.el).opacity).toFixed(3),
           collide:+n.collide.toFixed(2), gone:!!n.gone, removed:!!n.removed };
}, seqId);
const tray = () => p.evaluate(()=>document.getElementById('tray').textContent);

const rows=[];
for (let t=0; t<TRIALS; t++){
  await p.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:'networkidle'});
  await wait(SETTLE);
  const w = await anyWord();
  if (!w){ rows.push({trial:t, skip:'no anyWord candidate'}); continue; }
  // the hunt re-resolves the live position immediately before pressing
  const fresh = await liveAt(w.seqId);
  const aimX = fresh ? fresh.x : w.x, aimY = fresh ? fresh.y : w.y;
  const trayBefore = await tray();
  const calmBefore = await p.evaluate(()=> typeof calm!=='undefined' ? +calm.toFixed(3) : null);
  const hubUnder = await p.evaluate(([x,y])=> (typeof hubAt==='function'&&hubAt(x,y)!=null), [aimX,aimY]);
  const gf = await p.evaluate(()=> typeof ghostFloor!=='undefined' ? +ghostFloor.toFixed(3) : null);

  // ---- the gesture, byte-for-byte as the hunt sends it ----
  await T('touchStart', [[aimX, aimY]]);
  // what did pointerdown actually capture, and how far had the word moved?
  const atPress = await p.evaluate(()=>({ pn: (typeof pn!=='undefined'&&pn)?pn.w:null,
                                          pnSeq:(typeof pn!=='undefined'&&pn)?pn.seqId:null,
                                          moved: typeof moved!=='undefined'?moved:null,
                                          calm: typeof calm!=='undefined'?+calm.toFixed(3):null }));
  const nowPos = await liveAt(w.seqId);
  const aimGap = nowPos ? Math.hypot(nowPos.x-aimX, nowPos.y-aimY) : null;
  const insideBox = nowPos ? (Math.abs(nowPos.x-aimX) <= nowPos.w/2 && Math.abs(nowPos.y-aimY) <= nowPos.h/2) : null;
  await T('touchMove', [[aimX+65, aimY]]);
  await T('touchMove', [[aimX+130, aimY]]);
  const preUp = await p.evaluate(()=>({ moved: typeof moved!=='undefined'?moved:null,
                                        heldMs: typeof pt!=='undefined'?Date.now()-pt:null,
                                        dx: typeof px!=='undefined'?null:null }));
  await T('touchEnd', []);
  await wait(1300);
  const trayAfter = await tray();
  const after = await liveAt(w.seqId);
  await wait(4200);
  const back = await liveAt(w.seqId);

  const pressLanded = atPress.pnSeq === w.seqId;
  const graded = trayAfter !== trayBefore && trayAfter !== '';
  rows.push({ trial:t, word:w.w, seqId:w.seqId, opAtPick:w.op, collideAtPick:w.collide, ghostFloor:gf,
    aimGapPx: aimGap==null?null:+aimGap.toFixed(2), pressInsideWordBox: insideBox, hubUnderAim: hubUnder,
    pnCaptured: atPress.pn, pressLanded, movedAtPress: atPress.moved, movedBeforeUp: preUp.moved,
    heldMs: preUp.heldMs, calmBefore, calmAtPress: atPress.calm,
    trayBefore, trayAfter, graded,
    wordBackAfter5s: !!(back && !back.gone && !back.removed && back.op>=0.05),
    CHECK_PASS: graded && !(back && !back.gone && !back.removed && back.op>=0.05),
    verdict: graded ? 'graded' : (pressLanded ? 'PRESS-LANDED-BUT-NO-GRADE' : 'press-did-not-capture-word') });
  console.log(`  t${t} ${w.w.padEnd(6)} op=${w.op} aimGap=${aimGap==null?'—':aimGap.toFixed(2)}px inBox=${insideBox} hub=${hubUnder} pn=${atPress.pn||'null'} landed=${pressLanded} tray"${trayBefore}"->"${trayAfter}" => ${rows[rows.length-1].verdict}`);
}
const done = rows.filter(r=>!r.skip);
const fails = done.filter(r=>!r.CHECK_PASS);
const summary = { tag:TAG, src:SRC, trials:done.length, checkFails:fails.length,
  failRate:+(fails.length/Math.max(1,done.length)).toFixed(2),
  failModes: fails.reduce((a,r)=>{a[r.verdict]=(a[r.verdict]||0)+1;return a;},{}),
  aimGapMax: done.length?Math.max(...done.map(r=>r.aimGapPx==null?0:r.aimGapPx)):null,
  aimGapMedian: (()=>{const v=done.map(r=>r.aimGapPx).filter(x=>x!=null).sort((a,b)=>a-b);return v.length?v[Math.floor(v.length/2)]:null;})(),
  pressAlwaysInsideBox: done.every(r=>r.pressInsideWordBox!==false),
  errs };
console.log('\n### SUMMARY '+TAG+' :: '+JSON.stringify(summary));
fs.writeFileSync(`${OUT}/probe11-${TAG}.json`, JSON.stringify({summary, rows}, null, 2));
await b.close(); server.close(); process.exit(0);
