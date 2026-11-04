// 廻 Meguri — 角字 kakuji2, FIDELITY mode. Vector only.
// Every KanjiVG stroke is kept at its true position and length, so the character reads first; the geometry
// is regularised, not invented: horizontals and verticals become exactly straight, sweeps become one straight
// line, turning strokes and hooks become straight runs joined by circular arcs, dots become discs, closed boxes
// become rounded rings. Parallel bars in one radical take an even rhythm. Two radicals, two colours. Per word:
// one Disc behind a 日/白/口 (never instead of it), one stripe bundle only on a radical made of parallel bars.
// KanjiVG © Ulrich Apel, CC BY-SA 3.0.
(function(){
'use strict';
const NS='http://www.w3.org/2000/svg';
const KVG=()=>window.MEGURI_KVG||{};
const COL={
  black:{ground:'#0a0a0a',ink:'#f1efd8',dim:'#8a877a',accent:'#d8432b',stripe:'#2a9f9c',pig:['#d9a441','#6b57a8','#3f8f84','#a24242','#8c9a3a']},
  paper:{ground:'#ebe7dc',ink:'#0a0a0a',dim:'#6c665a',accent:'#d0342c',stripe:'#2a7f7c',pig:['#c47f3c','#5f4e92','#3e7d6a','#8f3c3c','#6f7f2e']}
};
const BOX=['口','日','目','田','囗','曰'];
const SUN=['日','白','口','曰'];
const AXIS_H='㇐', AXIS_V='㇑', SWEEP='㇒㇏㇀㇂㇃㇓', DOT='㇔';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
let meas=null;
function samplePath(d,n){ if(!meas){ meas=document.createElementNS(NS,'svg'); meas.setAttribute('viewBox','0 0 109 109'); meas.setAttribute('style','position:fixed;left:-2000px;top:0;width:109px;height:109px;visibility:hidden;pointer-events:none'); document.body.appendChild(meas); }
  const p=document.createElementNS(NS,'path'); p.setAttribute('d',d); meas.appendChild(p); const pts=[]; try{ const L=p.getTotalLength(); for(let i=0;i<=n;i++){ const q=p.getPointAtLength(L*i/n); pts.push([q.x,q.y]); } }catch(e){} p.remove(); return pts; }
function dp(pts,eps){ if(pts.length<3) return pts.slice(); const a=pts[0],b=pts[pts.length-1]; let idx=-1,dmax=0; const dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy)||1;
  for(let i=1;i<pts.length-1;i++){ const d=Math.abs(dy*pts[i][0]-dx*pts[i][1]+b[0]*a[1]-b[1]*a[0])/L; if(d>dmax){ dmax=d; idx=i; } }
  if(dmax>eps){ const l=dp(pts.slice(0,idx+1),eps),r=dp(pts.slice(idx),eps); return l.slice(0,-1).concat(r); } return [a,b]; }
const dist=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);

// one glyph -> strokes with regularised geometry in a unit box
function compileGlyph(ch){ const K=KVG()[ch]; if(!K) return null; const n=K.s.length; const nTop=K.g.length;
  let s=clamp(0.26/Math.sqrt(n),0.055,0.14);
  const raw=K.s.map((st,i)=>({i,t:st.t,g:st.g,anc:st.a||[],pts:samplePath(st.d,28)}));
  const all=raw.flatMap(r=>r.pts); const kx0=Math.min(...all.map(p=>p[0])),kx1=Math.max(...all.map(p=>p[0])),ky0=Math.min(...all.map(p=>p[1])),ky1=Math.max(...all.map(p=>p[1]));
  const pad=0.06; let sx=(1-2*pad)/Math.max(8,kx1-kx0), sy=(1-2*pad)/Math.max(8,ky1-ky0); const su=Math.min(sx,sy); sx=Math.min(sx,su*1.15); sy=Math.min(sy,su*1.15);
  const ox=(1-(kx1-kx0)*sx)/2, oy=(1-(ky1-ky0)*sy)/2; const map=p=>[ox+(p[0]-kx0)*sx,oy+(p[1]-ky0)*sy];
  // colour keys: top-level radicals, or second-level groups when there is only one
  const keyOf=r=>nTop>1?('g'+r.g):(r.anc[1]||'root'); const keys=[]; for(const r of raw){ const k=keyOf(r); if(!keys.includes(k)) keys.push(k); }
  const strokes=[];
  for(const r of raw){ const P=r.pts.map(map); const ci=keys.indexOf(keyOf(r)); const base={i:r.i,t:r.t,g:r.g,anc:r.anc,ci};
    if(r.t===DOT){ const c=P[Math.floor(P.length/2)]; strokes.push(Object.assign(base,{kind:'dot',c,pts:P})); continue; }
    if(r.t===AXIS_H){ const y=(P[0][1]+P[P.length-1][1])/2; strokes.push(Object.assign(base,{kind:'line',poly:[[Math.min(P[0][0],P[P.length-1][0]),y],[Math.max(P[0][0],P[P.length-1][0]),y]],axis:'h'})); continue; }
    if(r.t===AXIS_V){ const x=(P[0][0]+P[P.length-1][0])/2; strokes.push(Object.assign(base,{kind:'line',poly:[[x,Math.min(P[0][1],P[P.length-1][1])],[x,Math.max(P[0][1],P[P.length-1][1])]],axis:'v'})); continue; }
    if(SWEEP.includes(r.t)){ strokes.push(Object.assign(base,{kind:'line',poly:[P[0],P[P.length-1]],axis:'d'})); continue; }
    // turning strokes and hooks: straight runs; near-axis runs are snapped to the axis; the hook at the end is never dropped
    let poly=dp(P,0.028); if(poly.length>6) poly=dp(P,0.045); if(poly.length<2) poly=[P[0],P[P.length-1]];
    const out=[poly[0]]; for(let k=1;k<poly.length;k++){ const a=out[out.length-1],b=poly[k].slice(); const dx=b[0]-a[0],dy=b[1]-a[1]; const ang=Math.abs(Math.atan2(dy,dx))*180/Math.PI; if(ang<22||ang>158) b[1]=a[1]; else if(ang>68&&ang<112) b[0]=a[0]; out.push(b); }
    // a last run shorter than 1.1 strokes is a hook: give it its full length, and point it straight up when it rises (心 乚 气 end with a lift, never a curl)
    if(out.length>=2){ const a=out[out.length-2],b=out[out.length-1]; const L=dist(a,b); if(L<1.1*s&&L>0.001){ let ux=(b[0]-a[0])/L,uy=(b[1]-a[1])/L; if(uy<-0.3){ ux=0; uy=-1; } out[out.length-1]=[a[0]+ux*1.1*s,a[1]+uy*1.1*s]; } }
    strokes.push(Object.assign(base,{kind:'line',poly:out,axis:'turn'})); }
  // rhythm: parallel bars of one radical take an even pitch and aligned ends (never merged, never deleted)
  const byKey=new Map(); for(const st of strokes){ if(st.kind!=='line'||(st.axis!=='h'&&st.axis!=='v')) continue; const k=st.anc.join('/')+'|'+st.axis; const arr=byKey.get(k)||[]; arr.push(st); byKey.set(k,arr); }
  for(const arr of byKey.values()){ if(arr.length<3) continue; const ax=arr[0].axis; const pos=st=>ax==='h'?st.poly[0][1]:st.poly[0][0]; arr.sort((a,b)=>pos(a)-pos(b));
    const lo0=Math.min(...arr.map(st=>ax==='h'?st.poly[0][0]:st.poly[0][1])), hi0=Math.max(...arr.map(st=>ax==='h'?st.poly[1][0]:st.poly[1][1]));
    const first=pos(arr[0]),last=pos(arr[arr.length-1]); arr.forEach((st,k)=>{ const v=first+(last-first)*k/(arr.length-1); if(ax==='h'){ st.poly[0][1]=v; st.poly[1][1]=v; } else { st.poly[0][0]=v; st.poly[1][0]=v; } });
    for(const st of arr){ if(ax==='h'){ if(Math.abs(st.poly[0][0]-lo0)<0.08) st.poly[0][0]=lo0; if(Math.abs(st.poly[1][0]-hi0)<0.08) st.poly[1][0]=hi0; } else { if(Math.abs(st.poly[0][1]-lo0)<0.08) st.poly[0][1]=lo0; if(Math.abs(st.poly[1][1]-hi0)<0.08) st.poly[1][1]=hi0; } } }
  // closed boxes become rings: the box strokes of a 口/日/目/田 group
  const rings=[]; const used=new Set();
  { const runs=new Map(); for(const st of strokes){ const el=[...st.anc].reverse().find(e=>BOX.includes(e)); if(!el) continue; const key=st.anc.slice(0,st.anc.lastIndexOf(el)+1).join('/')+'#'+el; const r=runs.get(key)||{el,list:[]}; r.list.push(st); runs.set(key,r); }
    for(const r of runs.values()){ const boxy=r.list.filter(st=>st.kind==='line'&&('㇐㇑㇕㇗'.includes(st.t))); if(boxy.length<3) continue; const xs=boxy.flatMap(st=>st.poly.map(p=>p[0])),ys=boxy.flatMap(st=>st.poly.map(p=>p[1])); const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys); if(x1-x0<1.6*s||y1-y0<1.6*s) continue;
      // which strokes are the frame: those touching two or more edges of the box
      const frame=boxy.filter(st=>{ const px=st.poly.map(p=>p[0]),py=st.poly.map(p=>p[1]); let touch=0; if(Math.min(...px)<x0+0.4*s) touch++; if(Math.max(...px)>x1-0.4*s) touch++; if(Math.min(...py)<y0+0.4*s) touch++; if(Math.max(...py)>y1-0.4*s) touch++; return touch>=2&&st.t!=='㇐'||(st.t==='㇐'&&(Math.abs(st.poly[0][1]-y1)<0.4*s||Math.abs(st.poly[0][1]-y0)<0.4*s)&&touch>=2); });
      if(frame.length<2) continue; for(const st of frame) used.add(st); rings.push({x0,y0,x1,y1,ci:frame[0].ci,el:r.el,i:Math.min(...frame.map(st=>st.i)),eye:(r.el==='口'||r.el==='囗')&&Math.min(x1-x0,y1-y0)>=3.5*s}); } }
  // minimum gap between non-touching parallel bars; thin the stroke if the glyph cannot make room
  for(let round=0;round<3;round++){ let bad=0; const H=strokes.filter(st=>st.kind==='line'&&st.axis==='h'&&!used.has(st)); H.sort((a,b)=>a.poly[0][1]-b.poly[0][1]);
    for(let i=0;i<H.length;i++) for(let j=i+1;j<H.length;j++){ const a=H[i],b=H[j]; const ov=Math.min(a.poly[1][0],b.poly[1][0])-Math.max(a.poly[0][0],b.poly[0][0]); if(ov<=0.2*s) continue; const gap=(b.poly[0][1]-a.poly[0][1])-s; if(gap>0.35*s||gap<-0.5*s) continue; bad++; const need=(0.35*s-gap)/2; a.poly[0][1]-=need; a.poly[1][1]-=need; b.poly[0][1]+=need; b.poly[1][1]+=need; }
    const V=strokes.filter(st=>st.kind==='line'&&st.axis==='v'&&!used.has(st)); V.sort((a,b)=>a.poly[0][0]-b.poly[0][0]);
    for(let i=0;i<V.length;i++) for(let j=i+1;j<V.length;j++){ const a=V[i],b=V[j]; const ov=Math.min(a.poly[1][1],b.poly[1][1])-Math.max(a.poly[0][1],b.poly[0][1]); if(ov<=0.2*s) continue; const gap=(b.poly[0][0]-a.poly[0][0])-s; if(gap>0.35*s||gap<-0.5*s) continue; bad++; const need=(0.35*s-gap)/2; a.poly[0][0]-=need; a.poly[1][0]-=need; b.poly[0][0]+=need; b.poly[1][0]+=need; }
    if(!bad) break; if(round===2) s*=0.9; }
  return {ch,n,s,strokes:strokes.filter(st=>!used.has(st)),rings,keys,nTop};
}

// word-level moves that remove nothing: one Disc behind a 日/白/口, one stripe bundle on a radical of parallel bars
function wordMoves(glyphs){ const moves={disc:null,stripes:null};
  let best=null; glyphs.forEach((G,gi)=>{ const runs=new Map(); const consider=st=>{ const el=[...st.anc].reverse().find(e=>SUN.includes(e)); if(!el) return; const key=st.anc.slice(0,st.anc.lastIndexOf(el)+1).join('/')+'#'+el; const r=runs.get(key)||{el,pts:[],n:0}; r.pts.push(...(st.poly||[st.c])); r.n++; runs.set(key,r); };
    G.strokes.forEach(consider); for(const rg of G.rings){ const key='ring'+rg.i; runs.set(key,{el:rg.el,pts:[[rg.x0,rg.y0],[rg.x1,rg.y1]],n:3}); }
    // the Disc sits behind a component, never over the whole character: the component is a sixth to a half of the box, and the Disc never exceeds 0.42
    for(const r of runs.values()){ if(r.n<2) continue; const xs=r.pts.map(p=>p[0]),ys=r.pts.map(p=>p[1]); const x0=Math.min(...xs)-G.s/2,x1=Math.max(...xs)+G.s/2,y0=Math.min(...ys)-G.s/2,y1=Math.max(...ys)+G.s/2; const w=x1-x0,h=y1-y0; if(Math.max(w,h)<0.16||Math.max(w,h)>0.5) continue; const score=w*h*(r.el==='日'||r.el==='白'?1.3:1); if(!best||score>best.score) best={score,gi,cx:(x0+x1)/2,cy:(y0+y1)/2,r:Math.min(0.42,Math.max(w,h)*1.1)/2}; } });
  if(best) moves.disc=best;
  let sb=null; glyphs.forEach((G,gi)=>{ const groups=new Map(); for(const st of G.strokes){ const key=st.anc.join('/'); const g=groups.get(key)||{list:[]}; g.list.push(st); groups.set(key,g); }
    for(const g of groups.values()){ const L=g.list; if(L.length<3) continue; const allH=L.every(st=>st.kind==='line'&&st.axis==='h'); const allDot=L.every(st=>st.kind==='dot'); if(!allH&&!allDot) continue; if(L.length>0.6*G.n) continue;
      const pts=L.flatMap(st=>st.poly||[st.c]); const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]); const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
      const horizontalRow=allDot&&(x1-x0)>(y1-y0); const score=L.length+(moves.disc&&moves.disc.gi===gi?-0.5:0); if(!sb||score>sb.score) sb={score,gi,list:L,x0:x0-(allDot?G.s*.3:0),x1:x1+(allDot?G.s*.3:0),y0:y0-(allDot?G.s*.5:0),y1:y1+(allDot?G.s*.5:0),vertical:horizontalRow}; } });
  if(sb){ const G=glyphs[sb.gi]; const ids=new Set(sb.list); G.strokes=G.strokes.filter(st=>!ids.has(st)); const t=Math.max(0.006,G.s*0.22); const span=sb.vertical?(sb.x1-sb.x0):(sb.y1-sb.y0); const lines=clamp(Math.round(span/(t*2.4)),6,9); moves.stripes={gi:sb.gi,x0:sb.x0,x1:sb.x1,y0:sb.y0,y1:sb.y1,t,lines,vertical:sb.vertical,ci:sb.list[0].ci,i:Math.min(...sb.list.map(st=>st.i))}; }
  return moves; }

// a polyline with circular bends of radius r (r shrinks where runs are short), as an SVG path
function roundedPath(poly,r,S){ if(poly.length===2) return `M${(poly[0][0]*S).toFixed(2)},${(poly[0][1]*S).toFixed(2)} L${(poly[1][0]*S).toFixed(2)},${(poly[1][1]*S).toFixed(2)}`;
  let d=`M${(poly[0][0]*S).toFixed(2)},${(poly[0][1]*S).toFixed(2)}`;
  for(let k=1;k<poly.length-1;k++){ const a=poly[k-1],v=poly[k],b=poly[k+1]; const l1=dist(a,v),l2=dist(v,b); const rr=Math.min(r,l1/2,l2/2); if(rr<=0.0005){ d+=` L${(v[0]*S).toFixed(2)},${(v[1]*S).toFixed(2)}`; continue; }
    const p1=[v[0]+(a[0]-v[0])/l1*rr,v[1]+(a[1]-v[1])/l1*rr], p2=[v[0]+(b[0]-v[0])/l2*rr,v[1]+(b[1]-v[1])/l2*rr];
    d+=` L${(p1[0]*S).toFixed(2)},${(p1[1]*S).toFixed(2)} Q${(v[0]*S).toFixed(2)},${(v[1]*S).toFixed(2)} ${(p2[0]*S).toFixed(2)},${(p2[1]*S).toFixed(2)}`; }
  const e=poly[poly.length-1]; d+=` L${(e[0]*S).toFixed(2)},${(e[1]*S).toFixed(2)}`; return d; }

function build(word,o){ const opt=Object.assign({ground:'black',dots:0,reading:'',width:300},o||{}); const C=COL[opt.ground==='paper'?'paper':'black']; const pig=[opt.pigment&&/^#/.test(opt.pigment)?opt.pigment:C.pig[0]].concat(C.pig);
  const glyphs=[...word].map(compileGlyph).filter(Boolean); const n=glyphs.length||1; const moves=wordMoves(glyphs);
  const P=opt.width, B=P*0.74, top=P*0.07, gap=P*0.02, capH=opt.reading?P*0.08:P*0.03, left=P*0.07; const H=top+n*B+(n-1)*gap+capH+P*0.03;
  const el=(nm,at)=>{ const e=document.createElementNS(NS,nm); for(const k in at) e.setAttribute(k,at[k]); return e; };
  const svg=el('svg',{viewBox:`0 0 ${P} ${H}`,width:P,height:H,role:'img','aria-label':word}); svg.style.display='block'; svg.style.width='100%'; svg.style.height='auto';
  svg.appendChild(el('rect',{x:0,y:0,width:P,height:H,fill:C.ground}));
  const order=[]; const gTop=gi=>top+gi*(B+gap); const colour=ci=>ci===0?C.ink:pig[(ci-1)%pig.length];
  // hairlines continue the two tallest verticals of the first glyph to the top edge
  { const G=glyphs[0]; if(G){ const vs=G.strokes.filter(st=>st.kind==='line'&&st.axis==='v').sort((a,b)=>(b.poly[1][1]-b.poly[0][1])-(a.poly[1][1]-a.poly[0][1])).slice(0,2); const hl=el('g',{stroke:C.dim,'stroke-width':Math.max(.5,P*0.0025),opacity:.85}); svg.appendChild(hl); for(const v of vs){ const x=left+v.poly[0][0]*B; hl.appendChild(el('line',{x1:x,y1:top*0.3,x2:x,y2:gTop(0)+v.poly[0][1]*B-G.s*B*0.9})); } } }
  glyphs.forEach((G,gi)=>{ const g=el('g',{transform:`translate(${left},${gTop(gi)})`}); svg.appendChild(g); const S=B; const sw=G.s*S;
    if(moves.disc&&moves.disc.gi===gi){ const d=moves.disc; const e=el('circle',{cx:d.cx*S,cy:d.cy*S,r:d.r*S,fill:C.accent,opacity:.96}); g.appendChild(e); order.push({e,gi,i:-1}); }
    const items=[]; const dsc=moves.disc&&moves.disc.gi===gi?moves.disc:null;
    // whatever sits on the Disc is drawn in ink, never in a pigment: the character must stay the figure, the Disc the ground
    const onDisc=pts=>dsc&&pts.every(p=>Math.hypot(p[0]-dsc.cx,p[1]-dsc.cy)<dsc.r*1.02);
    for(const st of G.strokes){ let e; const c=onDisc(st.poly||[st.c])?C.ink:colour(st.ci); if(st.kind==='dot'){ e=el('circle',{cx:st.c[0]*S,cy:st.c[1]*S,r:sw*0.575,fill:c}); }
      else { e=el('path',{d:roundedPath(st.poly,G.s,S),fill:'none',stroke:c,'stroke-width':sw,'stroke-linecap':'round','stroke-linejoin':'round'}); } items.push({e,i:st.i}); }
    for(const rg of G.rings){ const w=(rg.x1-rg.x0)*S,h=(rg.y1-rg.y0)*S; const c=onDisc([[rg.x0,rg.y0],[rg.x1,rg.y1]])?C.ink:colour(rg.ci); const e=el('rect',{x:rg.x0*S,y:rg.y0*S,width:w,height:h,rx:Math.min(sw,w/2,h/2),fill:'none',stroke:c,'stroke-width':sw}); items.push({e,i:rg.i});
      // the eye only where no Disc already sits behind this ring: two marks in one counter read as bars over the character
      const d=moves.disc; const underDisc=d&&d.gi===gi&&Math.hypot(d.cx-(rg.x0+rg.x1)/2,d.cy-(rg.y0+rg.y1)/2)<d.r;
      if(rg.eye&&!underDisc){ const ee=el('circle',{cx:(rg.x0+rg.x1)/2*S,cy:(rg.y0+rg.y1)/2*S,r:Math.min(w,h)*0.17,fill:pig[0]}); items.push({e:ee,i:rg.i+0.5}); } }
    if(moves.stripes&&moves.stripes.gi===gi){ const st=moves.stripes; const sg=el('g',{fill:C.stripe}); for(let k=0;k<st.lines;k++){ let e; if(st.vertical){ const x=st.x0+(st.x1-st.x0-st.t)*k/(st.lines-1); e=el('rect',{x:x*S,y:st.y0*S,width:st.t*S,height:(st.y1-st.y0)*S,rx:st.t*S/2}); } else { const y=st.y0+(st.y1-st.y0-st.t)*k/(st.lines-1); e=el('rect',{x:st.x0*S,y:y*S,width:(st.x1-st.x0)*S,height:st.t*S,rx:st.t*S/2}); } sg.appendChild(e); } items.push({e:sg,i:st.i}); }
    items.sort((a,b)=>a.i-b.i); for(const it of items){ g.appendChild(it.e); order.push({e:it.e,gi,i:it.i}); } });
  const D=P*0.07, dx=P-P*0.07-D/2; for(let k=0;k<5;k++){ const cy=top+D/2+k*D*1.5; if(k<opt.dots) svg.appendChild(el('circle',{cx:dx,cy,r:D/2,fill:[pig[0],C.pig[0],C.pig[1],C.pig[2],C.pig[3]][k%5]})); else svg.appendChild(el('circle',{cx:dx,cy,r:D/2-.5,fill:'none',stroke:C.dim,'stroke-width':.8,opacity:.5})); }
  if(opt.sealed) svg.appendChild(el('rect',{x:dx-D/2,y:top+5*D*1.5,width:D,height:D,fill:C.accent}));
  if(opt.reading){ const t=el('text',{x:left,y:H-P*0.045,fill:C.ink,'font-family':"'Zen Old Mincho','Hiragino Mincho ProN',serif",'font-size':P*0.042,'letter-spacing':P*0.003}); t.textContent=opt.reading; svg.appendChild(t); }
  return {svg,order,moves,glyphs,W:P,H};
}
function render(container,word,o){ const m=build(word,o); container.textContent=''; container.appendChild(m.svg); return m; }
function animateIn(container,word,o){ const m=build(word,o); const per=(o&&o.per)||70; for(const q of m.order){ q.e.style.opacity='0'; q.e.style.transition='opacity .22s ease'; } container.textContent=''; container.appendChild(m.svg);
  const seq=m.order.slice().sort((a,b)=>a.gi-b.gi||a.i-b.i); const timers=seq.map((q,k)=>setTimeout(()=>{ q.e.style.opacity='1'; },80+k*per)); return {cancel(){ for(const t of timers) clearTimeout(t); for(const q of m.order) q.e.style.opacity='1'; },model:m}; }
window.MeguriKakuji2={build,render,animateIn,has:ch=>!!KVG()[ch],COL};
})();
