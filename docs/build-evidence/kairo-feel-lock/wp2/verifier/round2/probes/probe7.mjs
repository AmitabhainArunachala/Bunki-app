/** Verifier probe 7 — rest-watch, ghost/winner ratio, 夜 #lvl equivalence,
 * and the residual-signal test re-run on the ghost revision (my own method). */
import pwc from '/home/user/Bunki-app/node_modules/playwright-core/index.js';
const { chromium } = pwc;
import http from 'node:http';
import fs from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(process.argv[2]);
const TAG = process.argv[3] || 'run';
const PORT = Number(process.argv[4] || 8995);
const OUT = '/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/probe-out7';
fs.mkdirSync(OUT, { recursive: true });
const body = fs.readFileSync(SRC, 'utf8');
const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"></head><body>${body}</body></html>`;
const server = http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end(html);}).listen(PORT);
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:1, hasTouch:true, isMobile:true });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message.slice(0,160)));
const cdp = await ctx.newCDPSession(p);
const touch=(t,pts)=>cdp.send('Input.dispatchTouchEvent',{type:t,touchPoints:pts});
const wait=ms=>p.waitForTimeout(ms);
const out={}; const log=(k,v)=>{out[k]=v;console.log('### '+k+' :: '+JSON.stringify(v));};
async function tap(x,y){await touch('touchEnd',[]).catch(()=>{});await touch('touchStart',[{x,y}]);await wait(30);await touch('touchEnd',[]);await wait(300);}
const hasGhost = () => p.evaluate(()=>typeof ghostFloor!=='undefined');

await p.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:'networkidle'});
await wait(3600);
log('build', { src: SRC, tag: TAG, hasGhostFloor: await hasGhost() });

// ===== C: 45 s at rest, NO input at all, from a clean field (no bloom) =====
const track = await p.evaluate(()=>nodes.filter(n=>n.kind==='word'&&n.collide!=null&&n.collide<0.5).map(n=>n.w).slice(0,6));
const series=[];
for(let i=0;i<15;i++){ await wait(3000); series.push(await p.evaluate(ws=>ws.map(w=>{const n=nodes.find(n=>n.kind==='word'&&n.w===w);return n?+parseFloat(getComputedStyle(n.el).opacity).toFixed(3):null;}),track)); }
log('C-45s-rest-no-input', { words: track, series });

// ===== D: ghost / quietest-winner ratio (is the claimed <=0.45 bound the real one?) =====
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
      if(k===a||!(k.n.collide!=null&&k.n.collide>0.95)) continue;
      const ox=Math.min(a.cx+a.hw,k.cx+k.hw)-Math.max(a.cx-a.hw,k.cx-k.hw); if(ox<=0) continue;
      const oy=Math.min(a.cy+a.hh,k.cy+k.hh)-Math.max(a.cy-a.hh,k.cy-k.hh); if(oy<=0) continue;
      if(ox*oy>Math.min(4*a.hw*a.hh,4*k.hw*k.hh)*0.12 && k.eff<qw) qw=k.eff;
    }
    if(qw<Infinity) rows.push({w:a.n.w.slice(0,6), ghostOp:+(a.n.ghostOp||0).toFixed(3), quietestWinner:+qw.toFixed(3), ratio:+((a.n.ghostOp||0)/qw).toFixed(3)});
  }
  return { n:rows.length, maxRatio: rows.length?Math.max(...rows.map(r=>r.ratio)):null,
    GHOST_REL_claimed:0.45, CONTEND_MAX:0.53, floor:+ghostFloor.toFixed(3), winMin:+(ghostFloor/0.53).toFixed(3), rows };
}));

// ===== E: #lvl occlusion, EVERY theme — the equivalence claim =====
const themeBox = await p.evaluate(()=>{const r=document.getElementById('theme').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};});
const lvlPerTheme = {};
for (let i=0;i<5;i++){
  await wait(1400);
  const r = await p.evaluate(()=>{
    const lvl=document.getElementById('lvl'); if(!lvl) return {note:'no #lvl'};
    const lr=lvl.getBoundingClientRect();
    const res=[];
    for(const n of nodes){
      if(n.kind!=='word'||n.gone||n.removed||!n.el) continue;
      const rr=n.el.getBoundingClientRect();
      if(!(rr.right>lr.left&&rr.left<lr.right&&rr.bottom>lr.top&&rr.top<lr.bottom)) continue;
      let self=0,tolvl=0,pts=0;
      for(let gx=1;gx<=5;gx++)for(let gy=1;gy<=5;gy++){
        const x=rr.left+rr.width*gx/6, y=rr.top+rr.height*gy/6;
        if(x<1||x>innerWidth-1||y<1||y>innerHeight-1) continue;
        pts++;
        const e=document.elementFromPoint(x,y);
        if(e&&e.closest&&e.closest('.word')===n.el) self++;
        else if(e&&e.closest&&e.closest('#lvl')) tolvl++;
      }
      res.push({w:n.w.slice(0,6), op:+parseFloat(getComputedStyle(n.el).opacity).toFixed(3),
        ghosted:!!(n.collide!=null&&n.collide<0.5), pts, self, tolvl,
        fullyInside: rr.left>=lr.left&&rr.right<=lr.right&&rr.top>=lr.top&&rr.bottom<=lr.bottom,
        unreachable: self===0});
    }
    return { theme:document.getElementById('theme').textContent, words:res,
      unreachableCount:res.filter(x=>x.self===0).length };
  });
  lvlPerTheme[r.theme||i]=r;
  await tap(themeBox.x, themeBox.y); await wait(600);
}
log('E-lvl-occlusion-per-theme', Object.fromEntries(Object.entries(lvlPerTheme).map(([k,v])=>[k,{unreachable:v.unreachableCount,words:v.words}])));

// ===== F: residual signal, MY method, ghosts vs kept controls =====
await wait(1600);
const resid = await (async () => {
  await p.evaluate(()=>{ window.__pins=nodes.map(n=>({n,x:n.x,y:n.y})); window.__pl=setInterval(()=>{for(const q of window.__pins){q.n.x=q.x;q.n.y=q.y;}},8); });
  await wait(700);
  const picks = await p.evaluate(()=>{
    const g=[],k=[];
    for(const n of nodes){
      if(n.kind!=='word'||n.gone||n.removed||!n.el) continue;
      const r=n.el.getBoundingClientRect();
      if(r.width<6||r.left<0||r.top<0||r.right>innerWidth||r.bottom>innerHeight) continue;
      const rec={id:n.seqId,w:n.w.slice(0,6),op:+parseFloat(getComputedStyle(n.el).opacity).toFixed(4),
        box:{x:Math.round(r.left),y:Math.round(r.top),ww:Math.round(r.width),hh:Math.round(r.height)}};
      if(n.collide!=null&&n.collide<0.5) g.push(rec); else if(n.collide>0.95) k.push(rec);
    }
    return {ghost:g.slice(0,4), keep:k.slice(0,4)};
  });
  const baseBuf = await p.screenshot();
  const baseD = 'data:image/png;base64,'+baseBuf.toString('base64');
  const rows=[];
  for(const grp of ['ghost','keep']) for(const it of picks[grp]){
    await p.evaluate(id=>{const n=nodes.find(n=>n.seqId===id); if(n) n.el.style.display='none';}, it.id);
    await wait(260);
    const buf = await p.screenshot();
    const d = await p.evaluate(async ([a,bb,r])=>{
      const load=s=>new Promise(res=>{const i=new Image();i.onload=()=>res(i);i.src=s;});
      const [ia,ib]=await Promise.all([load(a),load(bb)]);
      const c=document.createElement('canvas');c.width=ia.width;c.height=ia.height;
      const g=c.getContext('2d',{willReadFrequently:true});
      g.drawImage(ia,0,0);const A=g.getImageData(0,0,c.width,c.height).data;
      g.clearRect(0,0,c.width,c.height);g.drawImage(ib,0,0);const B=g.getImageData(0,0,c.width,c.height).data;
      let maxD=0,sum=0,n=0,gt8=0,gt3=0;
      for(let y=r.y;y<Math.min(c.height,r.y+r.hh);y++)for(let x=r.x;x<Math.min(c.width,r.x+r.ww);x++){
        const i=(y*c.width+x)*4;
        const dd=Math.max(Math.abs(A[i]-B[i]),Math.abs(A[i+1]-B[i+1]),Math.abs(A[i+2]-B[i+2]));
        maxD=Math.max(maxD,dd);sum+=dd;n++;if(dd>8)gt8++;if(dd>3)gt3++;
      }
      return {maxD,mean:+(sum/Math.max(1,n)).toFixed(2),pctGt8:+(100*gt8/Math.max(1,n)).toFixed(1),pctGt3:+(100*gt3/Math.max(1,n)).toFixed(1)};
    }, [baseD,'data:image/png;base64,'+buf.toString('base64'),it.box]);
    rows.push({kind:grp==='ghost'?'GHOST':'KEPT', w:it.w, op:it.op, ...d});
    await p.evaluate(id=>{const n=nodes.find(n=>n.seqId===id); if(n) n.el.style.display='';}, it.id);
    await wait(200);
  }
  await p.evaluate(()=>clearInterval(window.__pl));
  return rows;
})();
for(const r of resid) console.log('    '+r.kind.padEnd(6)+' '+r.w.padEnd(7)+' op='+String(r.op).padEnd(7)+' maxΔ='+String(r.maxD).padStart(3)+' meanΔ='+String(r.mean).padStart(6)+' %px>8='+String(r.pctGt8).padStart(5));
log('F-residual-signal', resid);
log('ERRORS', errs);
fs.writeFileSync(`${OUT}/probe7-${TAG}.json`, JSON.stringify(out,null,2));
console.log('\n-> '+OUT+`/probe7-${TAG}.json`);
await b.close(); server.close(); process.exit(0);
