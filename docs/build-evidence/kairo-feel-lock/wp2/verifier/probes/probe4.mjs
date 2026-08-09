/** Probe 4 — pixel-level proof of what the arbiter removes from the screen. */
import pwc from '/home/user/Bunki-app/node_modules/playwright-core/index.js';
const { chromium } = pwc;
import http from 'node:http';
import fs from 'node:fs';

const SRC = '/home/user/Bunki-app/.claude/worktrees/agent-aa8fa572d39c96ca3/prototypes/drift/drift-artifact.html';
const OUT = '/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/probe-out4';
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8977;
const body = fs.readFileSync(SRC, 'utf8');
const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"></head><body>${body}</body></html>`;
const server = http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end(html);}).listen(PORT);
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:1, hasTouch:true, isMobile:true });
const p = await ctx.newPage();
const wait = ms => p.waitForTimeout(ms);
const results = {};
const cdp = await ctx.newCDPSession(p);
const touch=(t,pts)=>cdp.send('Input.dispatchTouchEvent',{type:t,touchPoints:pts});
async function tap(x,y){await touch('touchEnd',[]).catch(()=>{});await touch('touchStart',[{x,y}]);await wait(30);await touch('touchEnd',[]);await wait(260);}

await p.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:'networkidle'});
await wait(3500);

// freeze all motion so the two captures are pixel-comparable
await p.evaluate(() => {
  window.__frozen = true;
  window.__origFluid = window.fluidStep;
  // pin every node's position and stop the fluid so only opacity can differ
  for (const n of nodes) { n.frozen = false; }
});

const themeBox = await p.evaluate(()=>{const r=document.getElementById('theme').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};});
const perTheme = {};

for (let ti = 0; ti < 5; ti++) {
  await wait(1400);
  // let the arbiter settle, then FREEZE positions
  const rects = await p.evaluate(() => {
    const out = [];
    for (const n of nodes) {
      if (n.kind !== 'word' || n.gone || n.removed) continue;
      if (!(n.collide != null && n.collide < 0.4)) continue;
      const r = n.el.getBoundingClientRect();
      out.push({ w: n.w.slice(0,6), x: Math.max(0,Math.round(r.left)), y: Math.max(0,Math.round(r.top)), ww: Math.round(r.width), hh: Math.round(r.height), op: +parseFloat(getComputedStyle(n.el).opacity).toFixed(4) });
    }
    // hard-freeze positions: stop fluid + world motion so ON/OFF shots align
    window.__pins = nodes.map(n => ({ n, x: n.x, y: n.y }));
    window.__pinLoop = setInterval(() => { for (const q of window.__pins) { q.n.x = q.x; q.n.y = q.y; } }, 8);
    return out;
  });
  const theme = await p.evaluate(()=>document.getElementById('theme').textContent);
  await wait(500);
  await p.screenshot({ path: `${OUT}/t${ti}-ON.png` });
  // now lift the arbiter only
  await p.evaluate(() => { window.__ARB = true; const o = window.resolveCollisions; window.resolveCollisions = function(){ for (const n of nodes) if (n.kind==='word') n.collideTarget = 1; }; });
  await wait(2200);
  await p.screenshot({ path: `${OUT}/t${ti}-OFF.png` });

  // pixel-diff the two shots inside a browser canvas
  const diff = await p.evaluate(async ([a64, b64, rects]) => {
    const load = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = src; });
    const [ia, ib] = await Promise.all([load(a64), load(b64)]);
    const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(ia,0,0); const A = g.getImageData(0,0,c.width,c.height).data;
    g.clearRect(0,0,c.width,c.height); g.drawImage(ib,0,0); const B = g.getImageData(0,0,c.width,c.height).data;
    const per = [];
    for (const r of rects) {
      let maxD = 0, sumD = 0, n = 0, over8 = 0, over3 = 0;
      for (let y = r.y; y < Math.min(c.height, r.y + r.hh); y++)
        for (let x = r.x; x < Math.min(c.width, r.x + r.ww); x++) {
          const i = (y * c.width + x) * 4;
          const d = Math.max(Math.abs(A[i]-B[i]), Math.abs(A[i+1]-B[i+1]), Math.abs(A[i+2]-B[i+2]));
          maxD = Math.max(maxD, d); sumD += d; n++; if (d > 8) over8++; if (d > 3) over3++;
        }
      per.push({ w: r.w, op: r.op, box: `${r.ww}x${r.hh}`, maxChannelDelta: maxD, meanDelta: +(sumD/Math.max(1,n)).toFixed(2), pctPixelsDelta_gt8: +(100*over8/Math.max(1,n)).toFixed(1), pctPixelsDelta_gt3: +(100*over3/Math.max(1,n)).toFixed(1) });
    }
    // whole-frame
    let wMax=0, wOver8=0, tot=c.width*c.height;
    for (let i=0;i<A.length;i+=4){ const d=Math.max(Math.abs(A[i]-B[i]),Math.abs(A[i+1]-B[i+1]),Math.abs(A[i+2]-B[i+2])); wMax=Math.max(wMax,d); if(d>8) wOver8++; }
    return { frameMaxDelta: wMax, framePctGt8: +(100*wOver8/tot).toFixed(2), per };
  }, ['data:image/png;base64,' + fs.readFileSync(`${OUT}/t${ti}-ON.png`).toString('base64'),
      'data:image/png;base64,' + fs.readFileSync(`${OUT}/t${ti}-OFF.png`).toString('base64'), rects]);

  perTheme[theme] = { recededCount: rects.length, ...diff, per: diff.per.slice(0,6) };
  console.log('### theme ' + theme + ' :: ' + JSON.stringify(perTheme[theme]));

  // restore arbiter + motion, advance theme
  await p.evaluate(() => { clearInterval(window.__pinLoop); location.hash=''; });
  await p.reload({ waitUntil: 'networkidle' });
  await wait(3200);
  for (let k=0;k<=ti;k++){ await tap(themeBox.x, themeBox.y); await wait(400); }
}
fs.writeFileSync(`${OUT}/probe4.json`, JSON.stringify(perTheme,null,2));
console.log('\n-> '+OUT+'/probe4.json');
await b.close(); server.close(); process.exit(0);
