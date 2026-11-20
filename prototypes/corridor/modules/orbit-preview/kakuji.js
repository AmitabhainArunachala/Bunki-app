// 廻 Meguri — 角字 kakuji: constructed kanji posters compiled from KanjiVG stroke data under the Minami grammar
// (GRAMMAR.md, HEAVY sub-style). Vector only. Each stroke is sampled, split into straight runs, and every run becomes
// a band of one width on a module grid: horizontals and verticals snap to module lines with exactly one slit between
// parallel bands, diagonals stay straight bands with square ends, dots become discs. Per word: one Disc where a
// 日/白/口/丶 was, one stripe bundle on the most-parallel component, hairlines, a dot column, a tiny caption.
// KanjiVG © Ulrich Apel, CC BY-SA 3.0.
(function(){
'use strict';
const NS='http://www.w3.org/2000/svg';
const KVG=()=>window.MEGURI_KVG||{};
const COL={
  black:{ground:'#0a0a0a',ink:'#f1efd8',dim:'#8a877a',accent:'#d8432b',stripe:'#2a9f9c',muted:['#a24242','#8c9a3a','#2a9f9c','#5c6b8a','#c48a3a']},
  paper:{ground:'#ebe7dc',ink:'#0a0a0a',dim:'#6c665a',accent:'#d0342c',stripe:'#0a0a0a',muted:['#a24242','#8c9a3a','#2a9f9c','#5c6b8a','#c48a3a']}
};
const DISC_EL=['日','白','曰','口','目','田'];
let meas=null;
function samplePath(d,n){ if(!meas){ meas=document.createElementNS(NS,'svg'); meas.setAttribute('viewBox','0 0 109 109'); meas.setAttribute('style','position:fixed;left:-2000px;top:0;width:109px;height:109px;visibility:hidden;pointer-events:none'); document.body.appendChild(meas); }
  const p=document.createElementNS(NS,'path'); p.setAttribute('d',d); meas.appendChild(p); const pts=[]; try{ const L=p.getTotalLength(); for(let i=0;i<=n;i++){ const q=p.getPointAtLength(L*i/n); pts.push([q.x,q.y]); } }catch(e){} p.remove(); return pts; }
function dp(pts,eps){ if(pts.length<3) return pts.slice(); const [a,b]=[pts[0],pts[pts.length-1]]; let idx=-1,dmax=0; const dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy)||1;
  for(let i=1;i<pts.length-1;i++){ const d=Math.abs(dy*pts[i][0]-dx*pts[i][1]+b[0]*a[1]-b[1]*a[0])/L; if(d>dmax){ dmax=d; idx=i; } }
  if(dmax>eps){ const l=dp(pts.slice(0,idx+1),eps),r=dp(pts.slice(idx),eps); return l.slice(0,-1).concat(r); } return [a,b]; }
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// one glyph -> parts in a unit box: {kind:'h'|'v'|'d'|'dot', ...}
function compileGlyph(ch,opt){ const K=KVG()[ch]; if(!K) return null; const n=K.s.length;
  // weight by density, as the prints do: sparse glyphs are slabs (0.40/√n), dense ones thin toward the LINE look (0.28/√n)
  const slit=opt.slit; const kf=n<=8?0.40:n>=13?0.28:0.40-(n-8)*(0.12/5); const sTarget=clamp(kf/Math.sqrt(n),0.055,0.25); const N=Math.max(4,Math.round(1/(sTarget+slit))+(n>=11?1:0)); const m=1/N; const s=m-slit;
  const raw=K.s.map((st,i)=>({i,t:st.t,g:st.g,a:st.a,pts:samplePath(st.d,24)}));
  const all=raw.flatMap(r=>r.pts); const kx0=Math.min(...all.map(p=>p[0])),kx1=Math.max(...all.map(p=>p[0])),ky0=Math.min(...all.map(p=>p[1])),ky1=Math.max(...all.map(p=>p[1]));
  // fill the square, but never stretch one axis more than a quarter beyond the other (一 must stay a band, not a slab)
  const pad=0.02; let sx=(1-2*pad)/Math.max(8,kx1-kx0), sy=(1-2*pad)/Math.max(8,ky1-ky0); const su=Math.min(sx,sy); sx=Math.min(sx,su*1.25); sy=Math.min(sy,su*1.25);
  const ox=(1-(kx1-kx0)*sx)/2, oy=(1-(ky1-ky0)*sy)/2; const map=p=>[ox+(p[0]-kx0)*sx,oy+(p[1]-ky0)*sy];
  const parts=[];
  for(const r of raw){ const P=r.pts.map(map); if(r.t==='㇔'){ const c=P[Math.floor(P.length/2)]; parts.push({kind:'dot',x:c[0],y:c[1],i:r.i,a:r.a,g:r.g}); continue; }
    // three families: axis strokes and sweeps are ONE straight band each; turning strokes split into axis-only runs
    const SWEEP='㇒㇏㇀㇂㇃㇓'; const AXIS='㇐㇑'; let use;
    if(AXIS.includes(r.t)||SWEEP.includes(r.t)){ use=[{a:P[0],b:P[P.length-1],L:Math.hypot(P[P.length-1][0]-P[0][0],P[P.length-1][1]-P[0][1])}]; }
    else { const segs=dp(P,0.06); const segList=[]; for(let k=0;k<segs.length-1;k++){ const a=segs[k],b=segs[k+1]; segList.push({a,b,L:Math.hypot(b[0]-a[0],b[1]-a[1])}); }
      const total=segList.reduce((q,e)=>q+e.L,0); const kept=segList.filter(e=>e.L>=0.6*m||e.L>0.3*total); use=(kept.length?kept:segList).slice(0,3); }
    for(const e of use){ const dx=e.b[0]-e.a[0],dy=e.b[1]-e.a[1]; let kind;
      if(r.t==='㇐') kind='h'; else if(r.t==='㇑') kind='v';
      else if(SWEEP.includes(r.t)){ kind=(Math.abs(dy)<0.42*Math.abs(dx))?'h':(Math.abs(dx)<0.42*Math.abs(dy))?'v':'d'; if(kind==='d'&&e.L<(n>=10?2.2:1.4)*m) kind=Math.abs(dx)>Math.abs(dy)?'h':'v'; }
      else { kind=Math.abs(dx)>=Math.abs(dy)?'h':'v'; if(r.t==='㇜'&&e===use[0]&&e.L>=1.4*m&&Math.abs(dx)>0.5*Math.abs(dy)&&Math.abs(dy)>0.5*Math.abs(dx)) kind='d'; }
      parts.push({kind,t:r.t,a:e.a,b:e.b,i:r.i,a_:r.a,g:r.g,c:[(e.a[0]+e.b[0])/2,(e.a[1]+e.b[1])/2]}); } }
  for(const p of parts) if(p.a_){ p.anc=p.a_; delete p.a_; } else p.anc=p.a||[];
  // snap axis bands to the grid, keeping one slit between parallel bands that overlap
  const laneOf=c=>clamp(Math.round((c-s/2)/m),0,N-1);
  const snapStart=v=>clamp(Math.round(v/m),0,N-1)*m, snapEnd=v=>clamp(Math.round((v-s)/m),0,N-1)*m+s;
  for(const kind of ['h','v']){ const list=parts.filter(p=>p.kind===kind); const along=kind==='h'?0:1, across=kind==='h'?1:0;
    for(const p of list){ p.lo=Math.min(p.a[along],p.b[along]); p.hi=Math.max(p.a[along],p.b[along]); p.cc=(p.a[across]+p.b[across])/2; p.k=laneOf(p.cc); }
    list.sort((x,y)=>x.cc-y.cc); const placed=[];
    for(const p of list){ let k=p.k; for(const q of placed){ const overlap=Math.min(p.hi,q.hi)-Math.max(p.lo,q.lo); if(overlap>0.25*m&&q.k>=k&&q.cc<p.cc) k=q.k+1; } p.k=Math.min(k,N-1); placed.push(p);
      p.s0=snapStart(p.lo); p.s1=snapEnd(p.hi); if(p.s1-p.s0<s) p.s1=p.s0+s; p.band=[p.k*m,p.k*m+s]; } }
  // diagonals: endpoints snap to lane centres so they meet the bands
  const lc=v=>laneOf(v)*m+s/2;
  for(const p of parts.filter(p=>p.kind==='d')){ p.A=[lc(p.a[0]),lc(p.a[1])]; p.B=[lc(p.b[0]),lc(p.b[1])]; if(Math.hypot(p.B[0]-p.A[0],p.B[1]-p.A[1])<m){ p.B=[p.A[0]+(p.b[0]>p.a[0]?m:-m),p.A[1]+m]; } }
  for(const p of parts.filter(p=>p.kind==='dot')){ p.cx=lc(p.x); p.cy=lc(p.y); p.r=s*0.58; }
  // the inner corner of an L-turn is a quarter circle of radius one stroke (革命, 単純): recorded here, drawn as a concave fillet
  const fillets=[]; const byStroke=new Map(); for(const p of parts){ if(p.kind==='h'||p.kind==='v'){ const arr=byStroke.get(p.i)||[]; arr.push(p); byStroke.set(p.i,arr); } }
  for(const [i,arr] of byStroke){ if(arr.length!==2||arr[0].kind===arr[1].kind) continue; const [first,second]=arr; const t=raw[i].t; if('㇐㇑'.includes(t)) continue;
    const H=first.kind==='h'?first:second, V=first.kind==='v'?first:second; const goesRight=(first.b[0]-first.a[0]>0), goesDown=(V.b[1]-V.a[1]>0)||(second.b[1]-second.a[1]>0);
    if(first.kind==='h'&&goesRight&&goesDown){ fillets.push({x:V.band[0],y:H.band[1],dx:-1,dy:1}); }          // 横折: top band then right band → inner corner at bottom-left of the join
    else if(first.kind==='v'&&goesDown&&(second.b[0]-second.a[0]>0)){ fillets.push({x:V.band[1],y:H.band[0],dx:1,dy:-1}); } } // 竖折: left band then bottom band → inner corner at top-right of the join
  return {ch,parts,n,N,m,s,slit,groups:K.g,fillets};
}
function partBox(p,s){ if(p.kind==='h') return [p.s0,p.band[0],p.s1,p.band[1]]; if(p.kind==='v') return [p.band[0],p.s0,p.band[1],p.s1]; if(p.kind==='dot') return [p.cx-p.r,p.cy-p.r,p.cx+p.r,p.cy+p.r]; return [Math.min(p.A[0],p.B[0])-s/2,Math.min(p.A[1],p.B[1])-s/2,Math.max(p.A[0],p.B[0])+s/2,Math.max(p.A[1],p.B[1])+s/2]; }

// word-level moves: the Disc and the stripe bundle
function wordMoves(glyphs,opt){ const moves={disc:null,stripes:null};
  // the Disc: the largest 日/白/口 component that is not the whole glyph; else a dot near the top
  let best=null;
  glyphs.forEach((G,gi)=>{ const runs=new Map(); G.parts.forEach(p=>{ const anc=p.anc||[]; const el=DISC_EL.find(e=>anc.includes(e)); if(!el) return; const key=gi+':'+anc.slice(0,anc.indexOf(el)+1).join('/')+':'+el; const r=runs.get(key)||{gi,el,parts:[],strokes:new Set()}; r.parts.push(p); r.strokes.add(p.i); runs.set(key,r); });
    for(const r of runs.values()){ if(r.strokes.size<3||r.strokes.size>6) continue; const bs=r.parts.map(p=>partBox(p,G.s)); const x0=Math.min(...bs.map(b=>b[0])),y0=Math.min(...bs.map(b=>b[1])),x1=Math.max(...bs.map(b=>b[2])),y1=Math.max(...bs.map(b=>b[3])); const w=x1-x0,h=y1-y0; const minSz=(r.el==='口')?0.30:0.14; if(w>0.66||h>0.66||w<minSz||h<minSz) continue; if(r.el==='口'&&G.parts.length-r.parts.length<6) continue; /* a 口 may become the Disc only when the glyph keeps enough of itself */ const score=w*h*(DISC_EL.indexOf(r.el)<3?1.4:1); if(!best||score>best.score) best={score,gi,r,x0,y0,x1,y1}; } });
  if(best){ const G=glyphs[best.gi]; const ids=new Set(best.r.parts); G.parts=G.parts.filter(p=>!ids.has(p)); const cx=(best.x0+best.x1)/2,cy=(best.y0+best.y1)/2; const d=clamp(Math.max(best.x1-best.x0,best.y1-best.y0)*1.12,0.30,0.50); moves.disc={gi:best.gi,cx,cy,r:d/2,eye:best.r.el==='日'||best.r.el==='目'}; }
  else { let dot=null; glyphs.forEach((G,gi)=>{ for(const p of G.parts){ if(p.kind==='dot'&&p.cy<0.36&&(!dot||p.cy<dot.p.cy)) dot={gi,p}; } }); if(dot){ const G=glyphs[dot.gi]; G.parts=G.parts.filter(p=>p!==dot.p); moves.disc={gi:dot.gi,cx:dot.p.cx,cy:dot.p.cy,r:0.15,eye:false}; } }
  // the stripe bundle: the component with the most parallel horizontals (3+), preferring the glyph without the disc
  let sb=null;
  glyphs.forEach((G,gi)=>{ const runs=new Map(); G.parts.forEach(p=>{ const key=gi+':'+(p.anc||[]).slice(0,2).join('/'); const r=runs.get(key)||{gi,parts:[],all:new Set(),pure:new Set()}; r.all.add(p.i); if(p.kind==='h'&&p.t==='㇐'){ r.parts.push(p); r.pure.add(p.i); } runs.set(key,r); });
    for(const r of runs.values()){ if(r.pure.size<3) continue; if(r.pure.size<0.5*r.all.size) continue; if(r.all.size>0.7*G.n) continue; // three or more true horizontals making at least half of a sub-component (青's top, 隹, 三), never the glyph's whole skeleton
      r.parts.sort((a,b)=>a.band[0]-b.band[0]); const x0=Math.max(...r.parts.map(p=>p.s0)),x1=Math.min(...r.parts.map(p=>p.s1)); if(x1-x0<0.12) continue; const score=r.parts.length+(moves.disc&&moves.disc.gi===gi?-0.5:0); if(!sb||score>sb.score) sb={score,gi,r,x0:Math.min(...r.parts.map(p=>p.s0)),x1:Math.max(...r.parts.map(p=>p.s1))}; } });
  if(sb){ const G=glyphs[sb.gi]; const ids=new Set(sb.r.parts); const y0=sb.r.parts[0].band[0],y1=sb.r.parts[sb.r.parts.length-1].band[1]; G.parts=G.parts.filter(p=>!ids.has(p)); const t=G.slit*1.4; const lines=clamp(Math.round((y1-y0)/(t*2.3)),6,12); moves.stripes={gi:sb.gi,x0:sb.x0,x1:sb.x1,y0,y1,t,lines}; }
  return moves; }

function build(word,o){ const opt=Object.assign({ground:'black',dots:0,reading:'',width:300,slit:0.012},o||{}); const C=COL[opt.ground==='paper'?'paper':'black']; const accent=opt.ground==='paper'?C.accent:(opt.pigment&&/^#/.test(opt.pigment)?C.accent:C.accent);
  const glyphs=[...word].map(ch=>compileGlyph(ch,opt)).filter(Boolean); const n=glyphs.length||1; const moves=wordMoves(glyphs,opt);
  const P=opt.width, W=P*0.70, B=W, top=P*0.08, gap=W*opt.slit*2, capH=opt.reading?P*0.08:P*0.03, left=P*0.085; const H=top+n*B+(n-1)*gap+capH+P*0.03;
  const svg=document.createElementNS(NS,'svg'); svg.setAttribute('viewBox',`0 0 ${P} ${H}`); svg.setAttribute('width',P); svg.setAttribute('height',H); svg.style.display='block'; svg.style.width='100%'; svg.style.height='auto'; svg.setAttribute('role','img'); svg.setAttribute('aria-label',word);
  const el=(nm,at)=>{ const e=document.createElementNS(NS,nm); for(const k in at) e.setAttribute(k,at[k]); return e; };
  svg.appendChild(el('rect',{x:0,y:0,width:P,height:H,fill:C.ground}));
  const order=[]; const gTop=gi=>top+gi*(B+gap);
  // hairlines: the two tallest verticals of the first glyph continue to the top edge; the widest horizontal of the last glyph runs to the right edge
  const hl=el('g',{stroke:C.dim,'stroke-width':Math.max(.5,W*0.003),opacity:.9}); svg.appendChild(hl);
  { const G=glyphs[0]; if(G){ const vs=G.parts.filter(p=>p.kind==='v').sort((a,b)=>(b.s1-b.s0)-(a.s1-a.s0)).slice(0,2); for(const v of vs){ for(const x of [v.band[0],v.band[1]]){ hl.appendChild(el('line',{x1:left+x*B,y1:top*0.35,x2:left+x*B,y2:gTop(0)+v.s0*B-W*0.01})); } } }
    const L=glyphs[n-1]; if(L){ const hs=L.parts.filter(p=>p.kind==='h').sort((a,b)=>(b.s1-b.s0)-(a.s1-a.s0))[0]; if(hs){ hl.appendChild(el('line',{x1:left+hs.s1*B+W*0.01,y1:gTop(n-1)+hs.band[1]*B,x2:P-P*0.03,y2:gTop(n-1)+hs.band[1]*B})); } } }
  glyphs.forEach((G,gi)=>{ const g=el('g',{transform:`translate(${left},${gTop(gi)})`,fill:C.ink}); svg.appendChild(g); const S=B; const sorted=G.parts.slice().sort((a,b)=>a.i-b.i);
    for(const p of sorted){ let e; if(p.kind==='h') e=el('rect',{x:p.s0*S,y:p.band[0]*S,width:(p.s1-p.s0)*S,height:(p.band[1]-p.band[0])*S});
      else if(p.kind==='v') e=el('rect',{x:p.band[0]*S,y:p.s0*S,width:(p.band[1]-p.band[0])*S,height:(p.s1-p.s0)*S});
      else if(p.kind==='dot') e=el('circle',{cx:p.cx*S,cy:p.cy*S,r:p.r*S});
      else { const dx=p.B[0]-p.A[0],dy=p.B[1]-p.A[1],L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,nx=-uy*G.s/2,ny=ux*G.s/2,ex=ux*G.s/2,ey=uy*G.s/2; const A=[p.A[0]-ex,p.A[1]-ey],Bp=[p.B[0]+ex,p.B[1]+ey]; e=el('polygon',{points:[[A[0]+nx,A[1]+ny],[Bp[0]+nx,Bp[1]+ny],[Bp[0]-nx,Bp[1]-ny],[A[0]-nx,A[1]-ny]].map(q=>(q[0]*S).toFixed(2)+','+(q[1]*S).toFixed(2)).join(' ')}); }
      e.dataset.i=p.i; g.appendChild(e); order.push({e,gi,i:p.i}); }
    for(const f of (G.fillets||[])){ const r=G.s*S; const x=f.x*S,y=f.y*S; const sweep=(f.dx*f.dy>0)?0:1; const d=`M${x},${y} L${x+r*f.dx},${y} A${r},${r} 0 0 ${sweep} ${x},${y+r*f.dy} Z`; const e=el('path',{d}); g.appendChild(e); }
    if(moves.stripes&&moves.stripes.gi===gi){ const st=moves.stripes; const sg=el('g',{fill:C.stripe}); g.appendChild(sg); for(let k=0;k<st.lines;k++){ const y=st.y0+(st.y1-st.y0-st.t)*k/(st.lines-1); const e=el('rect',{x:st.x0*S,y:y*S,width:(st.x1-st.x0)*S,height:st.t*S}); sg.appendChild(e); order.push({e,gi,i:9000+k}); } }
    if(moves.disc&&moves.disc.gi===gi){ const d=moves.disc; const dg=el('g',{}); g.appendChild(dg); dg.appendChild(el('circle',{cx:d.cx*S,cy:d.cy*S,r:d.r*S,fill:accent})); if(d.eye) dg.appendChild(el('circle',{cx:d.cx*S,cy:d.cy*S,r:d.r*S*0.55,fill:'none',stroke:C.ink,'stroke-width':G.slit*1.6*S})); order.push({e:dg,gi,i:9500}); } });
  // dot column to the right of the first glyph
  const D=W*0.13, dx=P-P*0.085-D/2; for(let k=0;k<5;k++){ const cy=top+D/2+k*D*1.5; if(k<opt.dots) svg.appendChild(el('circle',{cx:dx,cy,r:D/2,fill:C.muted[k%C.muted.length]})); else svg.appendChild(el('circle',{cx:dx,cy,r:D/2-.5,fill:'none',stroke:C.dim,'stroke-width':.8,opacity:.5})); }
  if(opt.sealed) svg.appendChild(el('rect',{x:dx-D/2,y:top+5*D*1.5,width:D,height:D,fill:C.accent}));
  if(opt.reading){ const t=el('text',{x:left,y:H-P*0.045,fill:C.dim,'font-family':"'Helvetica Neue',Helvetica,Arial,sans-serif",'font-size':P*0.028,'letter-spacing':P*0.002}); t.textContent=opt.reading; svg.appendChild(t); }
  return {svg,order,moves,glyphs,W:P,H};
}
function render(container,word,o){ const m=build(word,o); container.textContent=''; container.appendChild(m.svg); return m; }
function animateIn(container,word,o){ const m=build(word,o); const per=(o&&o.per)||70; for(const q of m.order){ q.e.style.opacity='0'; q.e.style.transition='opacity .22s ease'; } container.textContent=''; container.appendChild(m.svg);
  const seq=m.order.slice().sort((a,b)=>a.gi-b.gi||a.i-b.i); const timers=seq.map((q,k)=>setTimeout(()=>{ q.e.style.opacity='1'; },80+k*per)); return {cancel(){ for(const t of timers) clearTimeout(t); for(const q of m.order) q.e.style.opacity='1'; },model:m}; }
window.MeguriKakuji={build,render,animateIn,has:ch=>!!KVG()[ch],COL};
})();
