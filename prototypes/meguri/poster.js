/* MeguriPoster — constructed kanji posters on canvas (no dependencies).
   A glyph is rasterised, thinned to its skeleton, vectorised into polylines snapped to a grid,
   then every stroke is redrawn at ONE width with round caps; enclosed counters become circles;
   the strokes are cut into 2–3 colour regions along the quietest row or column. */
(function(){
'use strict';
const BLACK={ground:'#121212',palette:['#efe4c9','#d8432b','#d9a441','#6b57a8','#3f8f84','#8c9a3a']};
const PAPER={ground:'#eee7d6',palette:['#262321','#c4432c','#c3882f','#604f93','#3f7f6c','#8c9a3a']};
const DEF={cells:56,stroke:.10,snap:2,gap:.14,dots:6,dotsFilled:3,bullseye:true,split:true,weight:700,
  font:"'Noto Sans JP','Dela Gothic One',sans-serif",
  capFont:"italic 11px 'Cormorant Garamond','Zen Old Mincho',serif",
  kanaFont:"11px 'Zen Old Mincho','Hiragino Mincho ProN','Yu Mincho',serif"};
const cache=new Map();
function options(o){ o=o||{}; const base=o.ground==='paper'?PAPER:BLACK; return Object.assign({},DEF,base,o,o.ground==='paper'?{ground:PAPER.ground}:{}); }

/* ---------- raster → fine grid ---------- */
function rasterize(ch,cells,font,weight){
  const key=ch+'|'+cells+'|'+font+'|'+weight; if(cache.has(key)) return cache.get(key);
  const E=cells*6, S=Math.ceil(E*1.4); const c=document.createElement('canvas'); c.width=S; c.height=S; const g=c.getContext('2d',{willReadFrequently:true});
  g.fillStyle='#000'; g.font=`${weight} ${E}px ${font}`; g.textBaseline='middle'; g.textAlign='center'; g.fillText(ch,S/2,S/2);
  const d=g.getImageData(0,0,S,S).data; let x0=S,y0=S,x1=-1,y1=-1;
  for(let y=0;y<S;y++) for(let x=0;x<S;x++) if(d[(y*S+x)*4+3]>120){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
  if(x1<0){ cache.set(key,null); return null; }
  const cs=E/cells, gw=Math.max(2,Math.round((x1-x0+1)/cs))+2, gh=Math.max(2,Math.round((y1-y0+1)/cs))+2; // one empty cell of padding all round
  const sx=(x1-x0+1)/(gw-2), sy=(y1-y0+1)/(gh-2); const ink=new Uint8Array(gw*gh);
  for(let cy=1;cy<gh-1;cy++) for(let cx=1;cx<gw-1;cx++){ let n=0,t=0; const px0=x0+(cx-1)*sx,py0=y0+(cy-1)*sy; for(let y=Math.floor(py0);y<py0+sy;y++) for(let x=Math.floor(px0);x<px0+sx;x++){ t++; if(d[(y*S+x)*4+3]>120) n++; } ink[cy*gw+cx]=n/t>=.5?1:0; }
  const r={gw,gh,ink}; cache.set(key,r); return r;
}

/* ---------- skeleton (Zhang–Suen), spur pruning, paths ---------- */
function thin(ink,gw,gh){ const a=Uint8Array.from(ink); const at=(x,y)=>(x<0||y<0||x>=gw||y>=gh)?0:a[y*gw+x]; let changed=true;
  while(changed){ changed=false; for(let pass=0;pass<2;pass++){ const del=[];
    for(let y=0;y<gh;y++) for(let x=0;x<gw;x++){ if(!at(x,y)) continue; const p2=at(x,y-1),p3=at(x+1,y-1),p4=at(x+1,y),p5=at(x+1,y+1),p6=at(x,y+1),p7=at(x-1,y+1),p8=at(x-1,y),p9=at(x-1,y-1);
      const B=p2+p3+p4+p5+p6+p7+p8+p9; if(B<2||B>6) continue; const s=[p2,p3,p4,p5,p6,p7,p8,p9,p2]; let A=0; for(let i=0;i<8;i++) if(s[i]===0&&s[i+1]===1) A++; if(A!==1) continue;
      if(pass===0){ if(p2*p4*p6!==0||p4*p6*p8!==0) continue; } else { if(p2*p4*p8!==0||p2*p6*p8!==0) continue; } del.push(y*gw+x); }
    for(const i of del){ a[i]=0; changed=true; } } }
  return a; }
const N8=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
function degree(sk,gw,gh,x,y){ let n=0; for(const [dx,dy] of N8){ const a=x+dx,b=y+dy; if(a>=0&&b>=0&&a<gw&&b<gh&&sk[b*gw+a]) n++; } return n; }
function prune(sk,gw,gh,maxLen){ for(let round=0;round<2;round++){ const kill=[];
  for(let y=0;y<gh;y++) for(let x=0;x<gw;x++){ if(!sk[y*gw+x]||degree(sk,gw,gh,x,y)!==1) continue; const walk=[[x,y]]; let px=-9,py=-9,cx=x,cy=y,ok=false;
    for(let i=0;i<maxLen;i++){ let nx=null; for(const [dx,dy] of N8){ const a=cx+dx,b=cy+dy; if(a>=0&&b>=0&&a<gw&&b<gh&&sk[b*gw+a]&&!(a===px&&b===py)&&!(a===cx&&b===cy)){ nx=[a,b]; break; } } if(!nx) break; const dg=degree(sk,gw,gh,nx[0],nx[1]); if(dg>=3){ ok=true; break; } walk.push(nx); px=cx; py=cy; cx=nx[0]; cy=nx[1]; }
    if(ok) for(const [a,b] of walk) kill.push(b*gw+a); }
  if(!kill.length) break; for(const i of kill) sk[i]=0; } return sk; }
function tracePaths(sk,gw,gh){ const paths=[]; const used=new Set(); const ek=(a,b)=>a<b?a+'-'+b:b+'-'+a; const idx=(x,y)=>y*gw+x;
  const nbrs=(x,y)=>{ const o=[]; for(const [dx,dy] of N8){ const a=x+dx,b=y+dy; if(a>=0&&b>=0&&a<gw&&b<gh&&sk[idx(a,b)]) o.push([a,b]); } return o; };
  const trace=(sx,sy,nx,ny)=>{ const p=[[sx,sy],[nx,ny]]; used.add(ek(idx(sx,sy),idx(nx,ny))); let px=sx,py=sy,cx=nx,cy=ny;
    for(let guard=0;guard<4000;guard++){ const nb=nbrs(cx,cy); if(nb.length!==2) break; const nxt=nb.find(([a,b])=>!(a===px&&b===py)); if(!nxt) break; const k=ek(idx(cx,cy),idx(nxt[0],nxt[1])); if(used.has(k)) break; used.add(k); p.push(nxt); px=cx; py=cy; cx=nxt[0]; cy=nxt[1]; }
    return p; };
  for(let y=0;y<gh;y++) for(let x=0;x<gw;x++){ if(!sk[idx(x,y)]) continue; const nb=nbrs(x,y); if(nb.length===2) continue; for(const [a,b] of nb){ if(used.has(ek(idx(x,y),idx(a,b)))) continue; paths.push(trace(x,y,a,b)); } }
  for(let y=0;y<gh;y++) for(let x=0;x<gw;x++){ if(!sk[idx(x,y)]) continue; const nb=nbrs(x,y); if(nb.length!==2) continue; const [a,b]=nb[0]; if(used.has(ek(idx(x,y),idx(a,b)))) continue; paths.push(trace(x,y,a,b)); }
  return paths; }
function simplify(pts,eps){ if(pts.length<3) return pts; const [a,b]=[pts[0],pts[pts.length-1]]; let md=0,mi=0; const dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy)||1;
  for(let i=1;i<pts.length-1;i++){ const d=Math.abs(dy*pts[i][0]-dx*pts[i][1]+b[0]*a[1]-b[1]*a[0])/L; if(d>md){ md=d; mi=i; } }
  if(md>eps){ const l=simplify(pts.slice(0,mi+1),eps), r=simplify(pts.slice(mi),eps); return l.slice(0,-1).concat(r); } return [a,b]; }
function straighten(pts){ // near-axis segments become exactly horizontal or vertical, as the reference builds them
  const o=pts.map(p=>[p[0],p[1]]); for(let i=1;i<o.length;i++){ const dx=o[i][0]-o[i-1][0],dy=o[i][1]-o[i-1][1]; if(Math.abs(dx)>=3.2*Math.abs(dy)) o[i][1]=o[i-1][1]; else if(Math.abs(dy)>=3.2*Math.abs(dx)) o[i][0]=o[i-1][0]; } return o; }

/* ---------- colour regions ---------- */
function label(ink,gw,gh,want,conn8){ const id=new Int16Array(gw*gh).fill(-1); let n=0; const st=[];
  for(let i=0;i<gw*gh;i++){ if(ink[i]!==want||id[i]>=0) continue; id[i]=n; st.push(i); while(st.length){ const k=st.pop(),x=k%gw,y=(k-x)/gw; const nb=conn8?N8:[[1,0],[-1,0],[0,1],[0,-1]]; for(const [dx,dy] of nb){ const a=x+dx,b=y+dy; if(a<0||b<0||a>=gw||b>=gh) continue; const j=b*gw+a; if(ink[j]===want&&id[j]<0){ id[j]=n; st.push(j); } } } n++; }
  return {id,n}; }
function bbox(id,gw,gh,k){ let x0=gw,y0=gh,x1=-1,y1=-1,c=0; for(let y=0;y<gh;y++) for(let x=0;x<gw;x++) if(id[y*gw+x]===k){ c++; if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; } return {x0,y0,x1,y1,w:x1-x0+1,h:y1-y0+1,c}; }
function quietCut(sk,gw,gh,b){ // measured on the skeleton: a crossing stroke adds one cell, a parallel stroke adds many, so radical gaps show as deep valleys
  const axis=(vert)=>{ const len=vert?b.w:b.h, lo=Math.floor(len*.22), hi=Math.ceil(len*.78); if(hi-lo<4) return null; const counts=[]; let sum=0;
    for(let i=0;i<len;i++){ let n=0; for(let j=0;j<(vert?b.h:b.w);j++){ const x=vert?b.x0+i:b.x0+j, y=vert?b.y0+j:b.y0+i; if(sk[y*gw+x]) n++; } counts.push(n); sum+=n; }
    const mean=sum/len; let best=null; for(let i=lo;i<hi;i++){ const sc=counts[i]/Math.max(1,mean); if(!best||sc<best.sc) best={sc,vert,pos:i+(vert?b.x0:b.y0)+.5}; } return best; };
  return [axis(false),axis(true)].filter(Boolean); }
function assignRegions(paths,ink,sk,gw,gh,opt){
  const {id,n}=label(sk,gw,gh,1,true); const comp=paths.map(p=>id[p[0][1]*gw+p[0][0]]); const len=paths.map(p=>p.length); const total=len.reduce((a,b)=>a+b,0);
  const csize=new Map(); comp.forEach((c,i)=>csize.set(c,(csize.get(c)||0)+len[i]));
  const bigComps=[...csize.keys()].filter(c=>csize.get(c)>=total*.14).sort((a,b)=>csize.get(b)-csize.get(a));
  let reg;
  if(bigComps.length>=2){ // the radicals are already apart: colour by component, specks join the nearest big one
    const rank=new Map(bigComps.map((c,i)=>[c,Math.min(i,2)]));
    reg=comp.map((c,i)=>{ if(rank.has(c)) return rank.get(c); const q=paths[i][0]; let best=0,bd=1e9; for(const [bc,r] of rank){ for(let j=0;j<paths.length;j++){ if(comp[j]!==bc) continue; for(const v of paths[j]){ const d=Math.hypot(v[0]-q[0],v[1]-q[1]); if(d<bd){ bd=d; best=r; } } } } return best; }); }
  else { reg=comp.map(()=>0);
    if(opt.split){ const b=bbox(id,gw,gh,bigComps[0]??0);
      // a cut is only taken when almost no stroke crosses it: that is what makes it a radical boundary and not a slice
      const cands=quietCut(sk,gw,gh,b).filter(c=>c.sc<=.45).map(c=>{ let cross=0,s1=0; const side=paths.map(p=>{ let a=0; for(const q of p) if((c.vert?q[0]:q[1])>c.pos) a++; const f=a/p.length; if(f>.25&&f<.75&&p.length>4) cross++; return f>=.5; }); side.forEach((b2,i)=>{ if(b2) s1+=len[i]; }); return {c,cross,side,frac:s1/total}; })
        .filter(x=>x.cross<=1&&x.frac>=.15&&x.frac<=.85).sort((a,b)=>(a.cross-b.cross)||(a.c.sc-b.c.sc));
      if(cands.length){ const best=cands[0]; reg=best.side.map(b2=>b2?1:0); } } }
  return reg; }
/* ---------- holes → counters ---------- */
function holes(ink,gw,gh,tf,st){ const {id,n}=label(ink,gw,gh,0,false); const border=new Set(); for(let x=0;x<gw;x++){ border.add(id[x]); border.add(id[(gh-1)*gw+x]); } for(let y=0;y<gh;y++){ border.add(id[y*gw]); border.add(id[y*gw+gw-1]); }
  const out=[]; for(let k=0;k<n;k++){ if(border.has(k)) continue; const b=bbox(id,gw,gh,k); if(b.c<4) continue; const asp=b.w/b.h; if(asp<.6||asp>1.7) continue; if(b.c/(b.w*b.h)<.6) continue;
    const inner=(Math.max(b.w,b.h)+tf-st); out.push({cx:b.x0+b.w/2,cy:b.y0+b.h/2,ri:inner/2,hw:b.w/2+(tf-st)/2,hh:b.h/2+(tf-st)/2}); } return out; }
/* ---------- model ---------- */
function build(word,o){ const opt=options(o); const glyphs=[]; let gi=0;
  for(const ch of word){ if(/\s/.test(ch)) continue; const ras=rasterize(ch,opt.cells,opt.font,opt.weight); if(!ras){ gi++; continue; } const {gw,gh,ink}=ras;
    const sk=prune(thin(ink,gw,gh),gw,gh,Math.round(opt.cells*.09)); let inkN=0,skN=0; for(let i=0;i<ink.length;i++){ inkN+=ink[i]; skN+=sk[i]; } const tf=skN?inkN/skN:3;
    const st=opt.stroke*opt.cells, q=opt.snap;
    const raw=tracePaths(sk,gw,gh).filter(p=>p.length>=2);
    const paths=raw.map(p=>straighten(simplify(p,opt.cells*.05).map(v=>[Math.round(v[0]/q)*q,Math.round(v[1]/q)*q]))); // index-aligned with raw, so region ids stay with their strokes
    const reg=assignRegions(raw,ink,sk,gw,gh,opt);
    const H=holes(ink,gw,gh,tf,st); const pal=opt.palette, base=pal[(gi*2)%pal.length];
    const colors=[base]; for(let r=1;r<6;r++){ let c=pal[(gi*2+r*3)%pal.length]; if(c===base) c=pal[(gi*2+r*3+1)%pal.length]; colors.push(c); }
    const accent=pal[(gi*2+1)%pal.length]===base?pal[(gi*2+2)%pal.length]:pal[(gi*2+1)%pal.length];
    const items=paths.map((p,i)=>({p,r:reg[i],o:Math.min(...p.map(v=>v[1]))*gw+Math.min(...p.map(v=>v[0]))})).filter(it=>it.p.length>=2&&(it.p.length>2||it.p[0][0]!==it.p[1][0]||it.p[0][1]!==it.p[1][1])).sort((a,b)=>(a.r-b.r)||(a.o-b.o));
    glyphs.push({ch,gw,gh,st,paths:items,holes:H,colors,accent}); gi++; }
  return {word,glyphs,opt}; }

/* ---------- drawing ---------- */
function drawPath(g,p,s,col,st,k){ g.strokeStyle=col; g.lineWidth=st*s; g.lineCap='round'; g.lineJoin='round'; g.beginPath(); const pts=p;
  if(k==null||k>=1){ g.moveTo(pts[0][0]*s,pts[0][1]*s); for(let i=1;i<pts.length;i++) g.lineTo(pts[i][0]*s,pts[i][1]*s); g.stroke(); return; }
  let L=0; const seg=[]; for(let i=1;i<pts.length;i++){ const d=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]); seg.push(d); L+=d; } let want=L*k; g.moveTo(pts[0][0]*s,pts[0][1]*s);
  for(let i=1;i<pts.length;i++){ if(want>=seg[i-1]){ g.lineTo(pts[i][0]*s,pts[i][1]*s); want-=seg[i-1]; } else { const t=want/seg[i-1]; g.lineTo((pts[i-1][0]+(pts[i][0]-pts[i-1][0])*t)*s,(pts[i-1][1]+(pts[i][1]-pts[i-1][1])*t)*s); break; } } g.stroke(); }
function drawHoles(g,gl,s,opt){ const st=gl.st*s; const col=gl.colors[0];
  for(const h of gl.holes){ const hw=h.hw*s+st+.6, hh=h.hh*s+st+.6; g.fillStyle=opt.ground; g.beginPath(); g.rect(h.cx*s-hw,h.cy*s-hh,hw*2,hh*2); g.fill(); }
  for(const h of gl.holes){ const rc=h.ri*s+st/2; g.strokeStyle=col; g.lineWidth=st; g.beginPath(); g.arc(h.cx*s,h.cy*s,rc,0,Math.PI*2); g.stroke();
    const d=h.ri*2; if(opt.bullseye&&d>=opt.cells*.16){ const R=h.ri*s; g.fillStyle=gl.accent; g.beginPath(); g.arc(h.cx*s,h.cy*s,R*.62,0,Math.PI*2); g.fill(); g.fillStyle=opt.ground; g.beginPath(); g.arc(h.cx*s,h.cy*s,R*.36,0,Math.PI*2); g.fill(); g.fillStyle=col; g.beginPath(); g.arc(h.cx*s,h.cy*s,R*.17,0,Math.PI*2); g.fill(); } } }
function layout(model,W,H){ const opt=model.opt; const colW=W*.60, left=W*.07, top=H*.07, avail=H*.74; const gap=colW*opt.gap;
  const items=model.glyphs.map(gl=>{ const s=colW/gl.gw; return {gl,s,h:gl.gh*s}; }); const total=items.reduce((a,b)=>a+b.h,0)+gap*(items.length-1);
  const f=total>avail?avail/total:1; let y=top+(avail-total*f)/2; const placed=[]; for(const it of items){ const s=it.s*f; placed.push({gl:it.gl,s,x:left,y}); y+=it.gl.gh*s+gap*f; }
  return {placed,left,top,colW,dotsX:W*.86,capY:H*.86}; }
function frame(canvas,model,progress,fade){
  const opt=model.opt, dpr=Math.max(1,window.devicePixelRatio||1); const W=canvas.width/dpr, H=canvas.height/dpr; const g=canvas.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0);
  g.fillStyle=opt.ground; g.fillRect(0,0,W,H); const L=layout(model,W,H); const total=model.glyphs.reduce((a,b)=>a+b.paths.length,0); const upto=progress==null?Infinity:progress*total; let idx=0; const fa=fade==null?1:fade;
  for(const pl of L.placed){ const gl=pl.gl; g.save(); g.translate(pl.x,pl.y); let done=true; for(const it of gl.paths){ if(idx+1<=upto) drawPath(g,it.p,pl.s,gl.colors[it.r]||gl.colors[0],gl.st); else if(idx<upto){ drawPath(g,it.p,pl.s,gl.colors[it.r]||gl.colors[0],gl.st,upto-idx); done=false; } else done=false; idx++; } if(done) drawHoles(g,gl,pl.s,opt); g.restore(); }
  const n=opt.dots, r=W*.042; for(let i=0;i<n;i++){ const cy=L.top+r+i*r*2.7; const col=opt.palette[(i+1)%opt.palette.length]; g.beginPath(); g.arc(L.dotsX,cy,r,0,Math.PI*2); if(i<opt.dotsFilled){ g.globalAlpha=fa; g.fillStyle=col; g.fill(); } else { g.globalAlpha=fa*.5; g.strokeStyle=col; g.lineWidth=1.2; g.stroke(); } }
  const cap=opt.caption||{}; g.globalAlpha=fa; g.fillStyle=opt.palette[0]; g.textAlign='left'; let cy=L.capY; if(cap.reading){ g.font=opt.kanaFont; g.fillText(cap.reading,L.left,cy); cy+=15; } g.font=opt.capFont; if(cap.romaji){ g.globalAlpha=fa*.75; g.fillText(cap.romaji,L.left,cy); cy+=14; g.globalAlpha=fa; } if(cap.meaning) g.fillText(cap.meaning,L.left,cy);
  if(cap.tag){ g.globalAlpha=fa*.6; g.textAlign='right'; g.fillText(cap.tag,W-L.left,H*.95); } g.globalAlpha=1; return L; }
function render(canvas,word,o){ const model=build(word,o); frame(canvas,model,null,1); return model; }
function animateIn(canvas,word,o){ const model=build(word,o); const dur=(o&&o.duration)||900; let raf=0,t0=0,stopped=false; const ease=t=>1-Math.pow(1-t,3);
  const step=(now)=>{ if(stopped) return; if(!t0) t0=now; const u=Math.min(1,(now-t0)/dur); frame(canvas,model,ease(u),Math.min(1,u*1.6)); if(u<1) raf=requestAnimationFrame(step); else if(o&&o.onDone) o.onDone(); };
  raf=requestAnimationFrame(step); return {cancel(){ stopped=true; cancelAnimationFrame(raf); },model}; }
window.MeguriPoster={render,build,animateIn,frame,PAPER,BLACK,_dbg:{rasterize,thin,prune,label,bbox,quietCut}};
})();
