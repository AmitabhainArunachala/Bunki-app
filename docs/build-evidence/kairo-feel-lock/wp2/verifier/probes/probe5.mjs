/** Probe 5 — residual signal test.
 * For a receded word: screenshot, then display:none THAT WORD ONLY, screenshot,
 * diff its own box. If deleting it changes ~nothing, it is not perceptibly present.
 * Control: the same measurement on a KEPT (full-presence) word. */
import pwc from '/home/user/Bunki-app/node_modules/playwright-core/index.js';
const { chromium } = pwc;
import http from 'node:http';
import fs from 'node:fs';

const SRC = '/home/user/Bunki-app/.claude/worktrees/agent-aa8fa572d39c96ca3/prototypes/drift/drift-artifact.html';
const OUT = '/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/probe-out5';
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8979;
const body = fs.readFileSync(SRC, 'utf8');
const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"></head><body>${body}</body></html>`;
const server = http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end(html);}).listen(PORT);
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:1, hasTouch:true, isMobile:true });
const p = await ctx.newPage();
const wait = ms => p.waitForTimeout(ms);
const cdp = await ctx.newCDPSession(p);
const touch=(t,pts)=>cdp.send('Input.dispatchTouchEvent',{type:t,touchPoints:pts});
async function tap(x,y){await touch('touchEnd',[]).catch(()=>{});await touch('touchStart',[{x,y}]);await wait(30);await touch('touchEnd',[]);await wait(260);}
await p.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:'networkidle'});
await wait(3500);

const diffBox = async (fa, fb, box) => p.evaluate(async ([a,bb,r]) => {
  const load = s => new Promise(res=>{const i=new Image();i.onload=()=>res(i);i.src=s;});
  const [ia,ib]=await Promise.all([load(a),load(bb)]);
  const c=document.createElement('canvas');c.width=ia.width;c.height=ia.height;
  const g=c.getContext('2d',{willReadFrequently:true});
  g.drawImage(ia,0,0);const A=g.getImageData(0,0,c.width,c.height).data;
  g.clearRect(0,0,c.width,c.height);g.drawImage(ib,0,0);const B=g.getImageData(0,0,c.width,c.height).data;
  let maxD=0,sum=0,n=0,gt3=0,gt8=0;
  for(let y=r.y;y<Math.min(c.height,r.y+r.hh);y++)for(let x=r.x;x<Math.min(c.width,r.x+r.ww);x++){
    const i=(y*c.width+x)*4;
    const d=Math.max(Math.abs(A[i]-B[i]),Math.abs(A[i+1]-B[i+1]),Math.abs(A[i+2]-B[i+2]));
    maxD=Math.max(maxD,d);sum+=d;n++;if(d>3)gt3++;if(d>8)gt8++;
  }
  return {maxD,mean:+(sum/Math.max(1,n)).toFixed(2),pctGt3:+(100*gt3/Math.max(1,n)).toFixed(1),pctGt8:+(100*gt8/Math.max(1,n)).toFixed(1)};
}, [fa, bb_(fb), box]);
function bb_(x){return x;}

const themeBox = await p.evaluate(()=>{const r=document.getElementById('theme').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};});
const all = {};
for (let ti=0; ti<5; ti++) {
  await wait(1500);
  const theme = await p.evaluate(()=>document.getElementById('theme').textContent);
  // pin positions so only the hidden element differs
  await p.evaluate(()=>{ window.__pins=nodes.map(n=>({n,x:n.x,y:n.y})); window.__pl=setInterval(()=>{for(const q of window.__pins){q.n.x=q.x;q.n.y=q.y;}},8); });
  await wait(600);
  const picks = await p.evaluate(()=>{
    const rec=[],keep=[];
    for(const n of nodes){
      if(n.kind!=='word'||n.gone||n.removed) continue;
      const r=n.el.getBoundingClientRect();
      if(r.width<4||r.left<0||r.top<0||r.right>innerWidth||r.bottom>innerHeight) continue;
      const rec_={id:n.seqId,w:n.w.slice(0,6),op:+parseFloat(getComputedStyle(n.el).opacity).toFixed(4),
        box:{x:Math.round(r.left),y:Math.round(r.top),ww:Math.round(r.width),hh:Math.round(r.height)}};
      if(n.collide!=null&&n.collide<0.4) rec.push(rec_); else if(n.collide>0.95&&parseFloat(getComputedStyle(n.el).opacity)>0.4) keep.push(rec_);
    }
    return {rec:rec.slice(0,4), keep:keep.slice(0,3)};
  });
  const base = `${OUT}/${ti}-base.png`;
  await p.screenshot({path:base});
  const baseD = 'data:image/png;base64,'+fs.readFileSync(base).toString('base64');
  const rows=[];
  for (const grp of ['rec','keep']) for (const it of picks[grp]) {
    await p.evaluate(id=>{const n=nodes.find(n=>n.seqId===id); if(n) n.el.style.display='none';}, it.id);
    await wait(260);
    const f=`${OUT}/${ti}-hide-${grp}-${it.id}.png`;
    await p.screenshot({path:f});
    const d = await diffBox(baseD, 'data:image/png;base64,'+fs.readFileSync(f).toString('base64'), it.box);
    rows.push({kind:grp==='rec'?'RECEDED':'KEPT(control)', w:it.w, domOpacity:it.op, boxPx:`${it.box.ww}x${it.box.hh}`, ...d});
    await p.evaluate(id=>{const n=nodes.find(n=>n.seqId===id); if(n) n.el.style.display='';}, it.id);
    await wait(200);
    fs.unlinkSync(f);
  }
  all[theme]=rows;
  console.log('### '+theme);
  for(const r of rows) console.log('    '+r.kind.padEnd(16)+' '+r.w.padEnd(7)+' op='+String(r.domOpacity).padEnd(7)+' hiding-it-changes: maxDelta='+String(r.maxD).padStart(3)+' mean='+String(r.mean).padStart(6)+' %px>3='+String(r.pctGt3).padStart(5)+' %px>8='+String(r.pctGt8).padStart(5));
  await p.evaluate(()=>clearInterval(window.__pl));
  await tap(themeBox.x, themeBox.y); await wait(800);
}
fs.writeFileSync(`${OUT}/probe5.json`, JSON.stringify(all,null,2));
console.log('\n-> '+OUT+'/probe5.json');
await b.close(); server.close(); process.exit(0);
