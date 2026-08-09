/** Independent verifier probe 2 — law evidence + remaining checks. */
import pwc from '/home/user/Bunki-app/node_modules/playwright-core/index.js';
const { chromium } = pwc;
import http from 'node:http';
import fs from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(process.argv[2] || '/home/user/Bunki-app/.claude/worktrees/agent-aa8fa572d39c96ca3/prototypes/drift/drift-artifact.html');
const OUTDIR = '/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/probe-out2';
fs.mkdirSync(OUTDIR, { recursive: true });
const PORT = 8973;
const body = fs.readFileSync(SRC, 'utf8');
const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"></head><body>${body}</body></html>`;
const server = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); }).listen(PORT);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 160)));
p.on('console', m => { if (m.type() === 'error') errs.push('console.error ' + m.text().slice(0, 160)); });
const cdp = await ctx.newCDPSession(p);
const touch = (t, pts) => cdp.send('Input.dispatchTouchEvent', { type: t, touchPoints: pts });
const wait = ms => p.waitForTimeout(ms);
const out = {};
const log = (k, v) => { out[k] = v; console.log('### ' + k + ' :: ' + JSON.stringify(v)); };
async function tap(x, y) { await touch('touchEnd', []).catch(()=>{}); await touch('touchStart', [{ x, y }]); await wait(30); await touch('touchEnd', []); await wait(260); }
async function longPressG(x, y, ms = 560) { await touch('touchEnd', []).catch(()=>{}); await touch('touchStart', [{ x, y }]); await wait(ms); await touch('touchEnd', []); await wait(340); }
async function swipeG(x0,y0,x1,y1,steps=14,hold=12){ await touch('touchEnd',[]).catch(()=>{}); await touch('touchStart',[{x:x0,y:y0}]); for(let i=1;i<=steps;i++){await touch('touchMove',[{x:x0+((x1-x0)*i)/steps,y:y0+((y1-y0)*i)/steps}]);await wait(hold);} await touch('touchEnd',[]); await wait(240); }
async function flickG(x0,y0,x1,y1,steps=6,hold=8){ await touch('touchEnd',[]).catch(()=>{}); await touch('touchStart',[{x:x0,y:y0}]); for(let i=1;i<=steps;i++){await touch('touchMove',[{x:x0+((x1-x0)*i)/steps,y:y0+((y1-y0)*i)/steps}]);await wait(hold);} await touch('touchEnd',[]); await wait(600); }
async function pinchG(cx,cy,from,to,steps=16){ await touch('touchEnd',[]).catch(()=>{}); let d=from; await touch('touchStart',[{x:cx,y:cy-d},{x:cx,y:cy+d}]); for(let i=1;i<=steps;i++){d=from+((to-from)*i)/steps;await touch('touchMove',[{x:cx,y:cy-d},{x:cx,y:cy+d}]);await wait(16);} await touch('touchEnd',[]); await wait(300); }
const st = () => p.evaluate(() => ({ z:+cam.z.toFixed(3), rot:+cam.rot.toFixed(3), stack:stack.length, lockOn, focus:FOCUS.length, unfolded:document.querySelectorAll('.word.unfolded').length }));

await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
await wait(3500);

// ===== L1: what disappears — arbiter ON vs OFF screenshots at rest =====
await p.screenshot({ path: `${OUTDIR}/L1-arbiter-ON.png` });
const recNames = await p.evaluate(() => nodes.filter(n => n.kind==='word' && !n.gone && !n.removed && n.collide != null && n.collide < 0.4).map(n => n.w));
// freeze the arbiter and force everything back to full presence
await p.evaluate(() => { window.__ARB_OFF = true; const orig = resolveCollisions; window.resolveCollisions = function(){ if (window.__ARB_OFF) { for (const n of nodes) if (n.kind==='word') { n.collideTarget=1; } return; } return orig(); }; });
await wait(2500);
await p.screenshot({ path: `${OUTDIR}/L1-arbiter-OFF.png` });
log('L1-receded-word-list', { count: recNames.length, words: recNames });

// pixel diff of the two shots
const PNG_A = fs.readFileSync(`${OUTDIR}/L1-arbiter-ON.png`);
const PNG_B = fs.readFileSync(`${OUTDIR}/L1-arbiter-OFF.png`);
log('L1-shot-bytes', { on: PNG_A.length, off: PNG_B.length });

// ===== L2: does a receded word return when the tangle clears (camera pan)? =====
await p.evaluate(() => { window.__ARB_OFF = false; });
await wait(2500);
const before = await p.evaluate(() => nodes.filter(n=>n.kind==='word'&&n.collide!=null&&n.collide<0.4).map(n=>n.w));
await swipeG(195, 620, 195, 200);   // pan the camera: geometry changes
await wait(2500);
const after = await p.evaluate(w => ({ recededNow: nodes.filter(n=>n.kind==='word'&&n.collide!=null&&n.collide<0.4).map(n=>n.w), restoredOfOld: w.filter(x => !nodes.some(n=>n.w===x && n.collide<0.4)).length }), before);
log('L2-recede-lifts-on-pan', { recededBefore: before.length, recededAfter: after.recededNow.length, restoredOfOld: after.restoredOfOld });

// ===== L3: does a receded word return at REST (no input) over a long window? =====
await p.evaluate(() => recenterCam()); await wait(2500);
const trackList = await p.evaluate(() => nodes.filter(n=>n.kind==='word'&&n.collide!=null&&n.collide<0.4).map(n=>n.w).slice(0,5));
const series = [];
for (let i=0;i<15;i++){ await wait(3000); series.push(await p.evaluate(ws => ws.map(w => { const n = nodes.find(n=>n.kind==='word'&&n.w===w); return n ? +parseFloat(getComputedStyle(n.el).opacity).toFixed(3) : null; }), trackList)); }
log('L3-45s-at-rest-no-input', { words: trackList, series });

// ===== H1: is the hint pill ever actually rendered at opacity 1? =====
const hintProbe = await p.evaluate(async () => {
  const h = document.getElementById('hint');
  setHint('テスト hint');
  await new Promise(r => setTimeout(r, 120));
  const cs = getComputedStyle(h);
  return { afterSetHint: { computedOpacity: cs.opacity, styleOpacity: h.style.opacity, text: h.textContent, color: cs.color, bg: cs.backgroundColor } };
});
await p.screenshot({ path: `${OUTDIR}/H1-hint-shown.png`, clip: { x: 100, y: 755, width: 200, height: 60 } });
// sample real pixels from the shot region
log('H1-hint-when-shown', hintProbe);
const hintFade = [];
for (let i=0;i<8;i++){ await wait(900); hintFade.push(await p.evaluate(() => getComputedStyle(document.getElementById('hint')).opacity)); }
log('H1-hint-opacity-decay', hintFade);

// ===== H2: independent hint contrast, all 5 themes, using real composited pixels =====
const themeBox = await p.evaluate(() => { const r=document.getElementById('theme').getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; });
const hintCr = {};
for (let i=0;i<5;i++){
  await p.evaluate(async () => { setHint('あいうえお テスト'); await new Promise(r=>setTimeout(r,150)); });
  await wait(250);
  hintCr[i] = await p.evaluate(() => {
    const lin=c=>{c/=255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4;};
    const L=([r,g,b])=>0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
    const parse=s=>{const m=String(s).match(/rgba?\(([^)]+)\)/);if(!m)return[0,0,0,1];const q=m[1].split(',').map(parseFloat);return[q[0],q[1],q[2],q[3]==null?1:q[3]];};
    const over=(f,a,bg)=>[f[0]*a+bg[0]*(1-a),f[1]*a+bg[1]*(1-a),f[2]*a+bg[2]*(1-a)];
    const ratio=(a,b)=>{const la=L(a),lb=L(b);return (Math.max(la,lb)+0.05)/(Math.min(la,lb)+0.05);};
    const gh=(getComputedStyle(document.documentElement).getPropertyValue('--ground').trim()||'#FBFAF5').replace('#','');
    const gr=[parseInt(gh.slice(0,2),16),parseInt(gh.slice(2,4),16),parseInt(gh.slice(4,6),16)];
    const h=document.getElementById('hint'); const cs=getComputedStyle(h);
    const eop=parseFloat(cs.opacity);
    const bgc=parse(cs.backgroundColor);
    const plate=over([bgc[0],bgc[1],bgc[2]],bgc[3],gr);
    const tc=parse(cs.color);
    const textOnPlate=over([tc[0],tc[1],tc[2]],tc[3],plate);
    // element opacity applies to the WHOLE pill (text and plate together) — so
    // the honest measure is text-vs-plate BOTH faded onto the ground
    const plateFaded=over(plate,eop,gr);
    const textFaded=over(textOnPlate,eop,gr);
    return { theme: document.getElementById('theme').textContent, elementOpacity:eop,
      crTextVsPlate_full:+ratio(textOnPlate,plate).toFixed(2),
      crTextVsPlate_asRendered:+ratio(textFaded,plateFaded).toFixed(2),
      crTextVsGround_asRendered:+ratio(textFaded,gr).toFixed(2) };
  });
  await tap(themeBox.x, themeBox.y); await wait(500);
}
log('H2-hint-contrast-independent', hintCr);

// ===== G1: lock B folds A, satellites full presence =====
await p.evaluate(() => recenterCam()); await wait(1500);
const near = (x,y,notT) => p.evaluate(([x,y,notT]) => { let best=null,bd=1e9; for(const el of document.querySelectorAll('.word')){const cs=getComputedStyle(el); if(parseFloat(cs.opacity)<0.35||cs.pointerEvents==='none')continue; if(notT&&el.textContent===notT)continue; const r=el.getBoundingClientRect(); const cx=r.left+r.width/2,cy=r.top+r.height/2; if(cx<60||cx>innerWidth-20||cy<70||cy>innerHeight-120)continue; const d=Math.hypot(cx-x,cy-y); if(d<bd){bd=d;best={cx,cy,t:el.textContent};}} return best; }, [x,y,notT||null]);
const A = await near(140,380);
if (A) { await tap(A.cx,A.cy); await wait(1500); }
const u1 = (await st()).unfolded;
const B = A ? await near(280,540,A.t) : null;
if (A&&B) {
  await longPressG(B.cx,B.cy,560);
  const sl = await st();
  const memb = await p.evaluate(() => FOCUS.map(n => ({ w:(n.w||n.ch||n.txt||'?').toString().slice(0,6), collide:n.collide==null?null:+n.collide.toFixed(3), domOp:+parseFloat(getComputedStyle(n.el).opacity).toFixed(3), pe:getComputedStyle(n.el).pointerEvents })));
  log('G1-lock-B-folds-A', { A:A.t.slice(0,8), B:B.t.slice(0,8), unfoldedBefore:u1, unfoldedAfter:sl.unfolded, lockOn:sl.lockOn, members:sl.focus, faintMembers:memb.filter(m=>m.domOp<0.3).length, peNoneMembers:memb.filter(m=>m.pe==='none').length, sample: memb.slice(0,4) });
  await pinchG(195,420,200,45); await pinchG(195,420,200,45); await wait(800);
  const s8=await st(); const vis=await p.evaluate(()=>FOCUS.filter(n=>n.vis===frameCount).length);
  log('G1-lock-minzoom', { z:s8.z, lockOn:s8.lockOn, focus:s8.focus, visible:vis });
  const [rx,ry] = await p.evaluate(()=>{ const cand=[[30,120],[360,120],[360,700],[30,700],[195,700]]; for(const [x,y] of cand){const e=document.elementFromPoint(x,y); if((!e||!e.closest('.word,.glyph,.part,#card,#theme,#lvl,#hint,#brand,#depth,#tray,#radoc'))&&(typeof hubAt!=='function'||hubAt(x,y)==null))return[x,y];} return [195,700]; });
  await tap(rx,ry); await wait(600);
  log('G1-lock-release', await st());
}

// ===== G2: tap ladder + flick judgment still work =====
await p.evaluate(()=>recenterCam()); await wait(1500);
const W = await near(195,420);
if (W) {
  const cls = () => p.evaluate(t => { const el=[...document.querySelectorAll('.word')].find(e=>e.textContent.startsWith(t.slice(0,3))); return el?{cls:el.className,txt:el.textContent.slice(0,24)}:null; }, W.t);
  const l0 = await cls();
  await tap(W.cx,W.cy); await wait(900); const l1 = await cls();
  const fp1 = await p.evaluate(()=> focusN&&!focusN.gone?{cx:focusN.x+focusN.dragX,cy:focusN.y+focusN.dragY}:null);
  await tap(fp1?fp1.cx:W.cx, fp1?fp1.cy:W.cy); await wait(900); const l2 = await cls();
  const fp2 = await p.evaluate(()=> focusN&&!focusN.gone?{cx:focusN.x+focusN.dragX,cy:focusN.y+focusN.dragY}:null);
  await tap(fp2?fp2.cx:W.cx, fp2?fp2.cy:W.cy); await wait(1100); const s3 = await st();
  log('G2-tap-ladder', { word:W.t.slice(0,8), rest:l0, tap1:l1, tap2:l2, tap3_stack:s3.stack });
  for(let i=0;i<5&&(await st()).stack>0;i++){ await tap(30,700); }
}
await p.evaluate(()=>recenterCam()); await wait(1500);
const F = await near(195,420);
if (F) {
  const trayBefore = await p.evaluate(()=>document.getElementById('tray').textContent);
  const nBefore = await p.evaluate(()=>nodes.filter(n=>n.kind==='word'&&!n.gone&&!n.removed).length);
  await flickG(F.cx,F.cy,F.cx+170,F.cy-60);
  await wait(1400);
  const nAfter = await p.evaluate(()=>nodes.filter(n=>n.kind==='word'&&!n.gone&&!n.removed).length);
  const trayAfter = await p.evaluate(()=>document.getElementById('tray').textContent);
  log('G2-flick-judgment', { word:F.t.slice(0,8), nodesBefore:nBefore, nodesAfter:nAfter, trayBefore, trayAfter });
}

// ===== T1: trance boundary token scan =====
log('T1-trance-tokens', await p.evaluate(() => {
  const src = document.documentElement.innerHTML;
  const pats = { score:/\bscore\b/gi, streak:/\bstreak\b/gi, confetti:/confetti/gi, badge:/\bbadge\b/gi, xp:/\bXP\b/g, combo:/\bcombo\b/gi, leaderboard:/leaderboard/gi, alert:/\balert\(/g, modal:/\bmodal\b/gi };
  const r = {}; for (const [k,re] of Object.entries(pats)) { const m = src.match(re); r[k] = m?m.length:0; } return r;
}));

// ===== T2: red audit =====
log('T2-red-elements', await p.evaluate(() => {
  const reds=[];
  for (const el of document.querySelectorAll('*')) {
    const cs=getComputedStyle(el);
    for (const [prop,val] of [['color',cs.color],['background',cs.backgroundColor]]) {
      const m=String(val).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
      if(!m) continue; const r=+m[1],g=+m[2],bl=+m[3],a=m[4]==null?1:+m[4];
      if(a<0.05) continue;
      if(r>140&&r>g*1.7&&r>bl*1.7) reds.push({tag:el.tagName,id:el.id,cls:String(el.className).slice(0,30),text:(el.textContent||'').slice(0,12),prop,val});
    }
  }
  return reds.slice(0,25);
}));

log('ERRORS', errs);
fs.writeFileSync(`${OUTDIR}/probe2.json`, JSON.stringify(out,null,2));
console.log('\n-> ' + OUTDIR + '/probe2.json');
await b.close(); server.close(); process.exit(0);
