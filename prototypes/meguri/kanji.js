// 廻 Meguri — constructed kanji posters, after Kenichi Minami's grammar.
// The letterform comes from a real display typeface, so it is never a drawing. KanjiVG stroke data
// (Ulrich Apel, CC BY-SA 3.0) tells the renderer which pixels belong to which stroke, which strokes are
// horizontals, verticals, hooks and dots, and which radical each belongs to. From that, per glyph:
// horizontals and verticals are rebuilt as bands of one width on a grid, hooks become L-shapes,
// a bundle of three or more parallel bars becomes machine stripes, dots become discs, square counters
// become rings with a disc, radicals take their own colour, hairlines rise past the top, and the word
// writes itself in stroke order.
(function(){
'use strict';
const KVG=()=>window.MEGURI_KVG||{};
const NS='http://www.w3.org/2000/svg';
const PAL={
  black:{ground:'#080808',ivory:'#f1efd8',dim:'#8f8c7a',pig:['#d8432b','#d9a441','#6b57a8','#3f8f84','#8c9a3a','#a24242']},
  paper:{ground:'#ebe7dc',ivory:'#1a1816',dim:'#6c665a',pig:['#c4432c','#c47f3c','#5f4e92','#3e7d6a','#6f7f2e','#8f3c3c']}
};
const FACES={dela:["'Meguri Dela','Dela Gothic One'",400],potta:["'Potta One'",400],maru:["'Zen Maru Gothic'",900],mplus:["'M PLUS Rounded 1c'",900],rock:["'RocknRoll One'",400]};
const FONT_JP="'Zen Old Mincho','Hiragino Mincho ProN',serif";
const E=256;            // working raster per glyph
const U=E/17;           // Minami's unit: one stroke width ≈ 1/17 of the compound width
const GRID=U/2;
function cv(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; }
let meas=null;
function strokePoints(d,n){ if(!meas){ meas=document.createElementNS(NS,'svg'); meas.setAttribute('viewBox','0 0 109 109'); meas.setAttribute('style','position:fixed;left:-2000px;top:0;width:109px;height:109px;visibility:hidden;pointer-events:none'); document.body.appendChild(meas); }
  const p=document.createElementNS(NS,'path'); p.setAttribute('d',d); meas.appendChild(p); const pts=[]; try{ const L=p.getTotalLength(); for(let i=0;i<=n;i++){ const q=p.getPointAtLength(L*i/n); pts.push([q.x,q.y]); } }catch(e){} p.remove(); return pts; }
function hex2rgb(h){ return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]; }
const snapLo=v=>Math.round(v/GRID)*GRID, snapHi=v=>Math.round(v/GRID)*GRID;
function pct(arr,p){ if(!arr.length) return 0; const a=Float32Array.from(arr).sort(); return a[Math.min(a.length-1,Math.floor(p*(a.length-1)))]; }

function buildGlyph(ch,opts){ const K=KVG()[ch]; const [family,weight]=FACES[opts.face]||FACES.dela; const P=opts.P;
  // 1. the letterform, from the typeface
  const c=cv(E,E), g=c.getContext('2d',{willReadFrequently:true}); g.fillStyle='#000'; g.fillRect(0,0,E,E); g.fillStyle='#fff'; g.font=`${weight} ${Math.round(E*.78)}px ${family}`; g.textAlign='center'; g.textBaseline='middle'; g.fillText(ch,E/2,E/2+E*.03);
  const src=g.getImageData(0,0,E,E).data; const m=new Uint8Array(E*E); let x0=E,y0=E,x1=-1,y1=-1;
  for(let i=0;i<E*E;i++){ if(src[i*4]>127){ m[i]=1; const x=i%E,y=(i/E)|0; if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; } }
  if(x1<0) return null; const area=(x1-x0+1)*(y1-y0+1);
  // 2. stroke labels from KanjiVG, scaled onto the letterform's own box
  const grp=new Int16Array(E*E).fill(-1), ord=new Int16Array(E*E).fill(-1); let strokes=[]; let nTop=1;
  if(K){ strokes=K.s.map((s,i)=>({i,t:s.t,g:s.g,a:s.a,pts:strokePoints(s.d,18)})); nTop=K.g.length;
    const all=strokes.flatMap(s=>s.pts); const kx0=Math.min(...all.map(p=>p[0])),kx1=Math.max(...all.map(p=>p[0])),ky0=Math.min(...all.map(p=>p[1])),ky1=Math.max(...all.map(p=>p[1]));
    const sx=(x1-x0)/Math.max(1,kx1-kx0), sy=(y1-y0)/Math.max(1,ky1-ky0); const map=p=>[x0+(p[0]-kx0)*sx, y0+(p[1]-ky0)*sy];
    const keyOf=s=>nTop>1?'g'+s.g:(s.a[1]||'root'); const keys=[]; for(const s of strokes){ const k=keyOf(s); if(!keys.includes(k)) keys.push(k); s.ci=keys.indexOf(k); s.mp=s.pts.map(map); }
    const lc=cv(E,E), lg=lc.getContext('2d',{willReadFrequently:true}); lg.fillStyle='#000'; lg.fillRect(0,0,E,E); lg.lineCap='round'; lg.lineJoin='round';
    for(const w of [E*.46,E*.15]){ strokes.forEach((s,i)=>{ lg.strokeStyle=`rgb(${Math.min(240,(s.ci+1)*30)},${Math.min(248,(i+1)*8)},0)`; lg.lineWidth=w; lg.beginPath(); s.mp.forEach((q,j)=>{ j?lg.lineTo(q[0],q[1]):lg.moveTo(q[0],q[1]); }); lg.stroke(); }); }
    const lab=lg.getImageData(0,0,E,E).data; for(let i=0;i<E*E;i++){ if(lab[i*4]>=15){ grp[i]=Math.round(lab[i*4]/30)-1; ord[i]=Math.round(lab[i*4+1]/8)-1; } }
    for(let pass=0;pass<2;pass++){ const g2=new Int16Array(grp),o2=new Int16Array(ord); for(let y=2;y<E-2;y++) for(let x=2;x<E-2;x++){ const i=y*E+x; if(!m[i]) continue; const cnt=new Map(),oc=new Map(); for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++){ const j=i+dy*E+dx; if(m[j]&&grp[j]>=0){ cnt.set(grp[j],(cnt.get(grp[j])||0)+1); oc.set(ord[j],(oc.get(ord[j])||0)+1); } } let best=grp[i],bc=-1; for(const [k,v] of cnt){ if(v>bc){ bc=v; best=k; } } g2[i]=best; let bo=ord[i],boc=-1; for(const [k,v] of oc){ if(v>boc){ boc=v; bo=k; } } o2[i]=bo; } grp.set(g2); ord.set(o2); } }
  // 3. the construction: axis strokes become bands on the grid, hooks become L-shapes (off by default: label noise breaks dense glyphs; kept for the vector lane to replace)
  const bands=[]; // {i,ci,kind:'h'|'v',x0,y0,x1,y1}
  const pixOf=i=>{ const xs=[],ys=[]; for(let p=0;p<E*E;p++){ if(m[p]&&ord[p]===i){ xs.push(p%E); ys.push((p/E)|0); } } return {xs,ys}; };
  const clearOrd=i=>{ for(let p=0;p<E*E;p++) if(ord[p]===i) m[p]=0; };
  const paintRect=(rx0,ry0,rx1,ry1,ci,i)=>{ for(let y=Math.max(0,Math.round(ry0));y<Math.min(E,Math.round(ry1));y++) for(let x=Math.max(0,Math.round(rx0));x<Math.min(E,Math.round(rx1));x++){ const p=y*E+x; m[p]=1; grp[p]=ci; ord[p]=i; } };
  const stripes=[];
  if(opts.construct){
  for(const s of strokes){ if(!'㇐㇑㇕㇗'.includes(s.t)) continue; const {xs,ys}=pixOf(s.i); if(xs.length<area*.004) continue;
    const bx0=pct(xs,.03),bx1=pct(xs,.97)+1,by0=pct(ys,.03),by1=pct(ys,.97)+1; const w=bx1-bx0,h=by1-by0;
    if(s.t==='㇐'&&w>h*1.4){ const th=Math.max(U*.75,Math.min(U*1.3,snapLo(h))); const yy=snapLo(by0); clearOrd(s.i); paintRect(snapLo(bx0),yy,snapHi(bx1),yy+th,s.ci,s.i); bands.push({i:s.i,ci:s.ci,kind:'h',x0:snapLo(bx0),y0:yy,x1:snapHi(bx1),y1:yy+th}); }
    else if(s.t==='㇑'&&h>w*1.4){ const th=Math.max(U*.75,Math.min(U*1.3,snapLo(w))); const xx=snapLo(bx0); clearOrd(s.i); paintRect(xx,snapLo(by0),xx+th,snapHi(by1),s.ci,s.i); bands.push({i:s.i,ci:s.ci,kind:'v',x0:xx,y0:snapLo(by0),x1:xx+th,y1:snapHi(by1)}); }
    else if(s.t==='㇕'&&w>U*1.5&&h>U*1.5){ clearOrd(s.i); const th=U; paintRect(snapLo(bx0),snapLo(by0),snapHi(bx1),snapLo(by0)+th,s.ci,s.i); paintRect(snapHi(bx1)-th,snapLo(by0),snapHi(bx1),snapHi(by1),s.ci,s.i); bands.push({i:s.i,ci:s.ci,kind:'v',x0:snapHi(bx1)-th,y0:snapLo(by0),x1:snapHi(bx1),y1:snapHi(by1)}); }
    else if(s.t==='㇗'&&w>U*1.5&&h>U*1.5){ clearOrd(s.i); const th=U; paintRect(snapLo(bx0),snapLo(by0),snapLo(bx0)+th,snapHi(by1),s.ci,s.i); paintRect(snapLo(bx0),snapHi(by1)-th,snapHi(bx1),snapHi(by1),s.ci,s.i); bands.push({i:s.i,ci:s.ci,kind:'v',x0:snapLo(bx0),y0:snapLo(by0),x1:snapLo(bx0)+th,y1:snapHi(by1)}); } }
  // 4. one bundle of three or more parallel bars in the same radical becomes machine stripes
  const hb=bands.filter(b=>b.kind==='h'); const byCi=new Map(); for(const b of hb){ const arr=byCi.get(b.ci)||[]; arr.push(b); byCi.set(b.ci,arr); }
  for(const [ci,arr] of byCi){ if(arr.length<3) continue; arr.sort((a,b)=>a.y0-b.y0); let ok=true; for(let k=1;k<arr.length;k++){ if(Math.abs(arr[k].x0-arr[0].x0)>U*2.5||Math.abs(arr[k].x1-arr[0].x1)>U*2.5) ok=false; } if(!ok) continue;
    const sx0=Math.min(...arr.map(b=>b.x0)),sx1=Math.max(...arr.map(b=>b.x1)),sy0=arr[0].y0,sy1=arr[arr.length-1].y1; for(const b of arr) clearOrd(b.i); const lines=Math.min(9,Math.max(5,Math.round((sy1-sy0)/(U*.5)))); const t=Math.max(2,U*.22);
    for(let k=0;k<lines;k++){ const yy=sy0+(sy1-sy0-t)*k/(lines-1); paintRect(sx0,yy,sx1,yy+t,ci,arr[Math.min(arr.length-1,Math.floor(k*arr.length/lines))].i); } stripes.push(ci); break; }
  }
  // 3b. one gesture per word, chosen by meaning: the radical that carries the idea becomes geometry (sun → disc, thread → stripes, fire → sparks)
  const motifs=[]; if(opts.motif&&strokes.length){ const MOT={'日':'disc','月':'moon','糸':'stripes','口':'ring','田':'ring','目':'ring','白':'disc'};
    const groups=new Map(); for(const s of strokes){ const el=s.a.find(e=>MOT[e]); if(!el) continue; const key=el+'#'+s.a.slice(0,s.a.indexOf(el)+1).join('/'); const gq=groups.get(key)||{el,pts:[],idx:[],ci:s.ci}; gq.pts.push(...s.mp); gq.idx.push(s.i); groups.set(key,gq); }
    // three to six strokes: enough to be a component, never so much that the whole character turns into a target (品 is three 口 in one group)
    const cand=[...groups.values()].filter(gq=>gq.idx.length>=3&&gq.idx.length<=6).sort((a,b)=>b.pts.length-a.pts.length)[0];
    if(cand){ const xs=cand.pts.map(p=>p[0]),ys=cand.pts.map(p=>p[1]); const bx0=Math.min(...xs)-U*.45,bx1=Math.max(...xs)+U*.45,by0=Math.min(...ys)-U*.45,by1=Math.max(...ys)+U*.45; const w=bx1-bx0,h=by1-by0;
      if(w>U*2.2&&h>U*2.2&&w<E*.75&&h<E*.75){ for(let y=Math.max(0,by0|0);y<Math.min(E,by1);y++) for(let x=Math.max(0,bx0|0);x<Math.min(E,bx1);x++){ const p=y*E+x; if(m[p]&&cand.idx.includes(ord[p])) m[p]=0; }
        const cx=(bx0+bx1)/2,cy=(by0+by1)/2,r=Math.min(w,h)/2; const oi=Math.min(...cand.idx); const kind=MOT[cand.el];
        if(kind==='disc'){ fillDisc(m,grp,ord,cx,cy,r*.96,1,oi); motifs.push({kind,cx,cy,r}); }
        else if(kind==='moon'){ fillDisc(m,grp,ord,cx,cy,r*.96,1,oi); clearDisc(m,cx+r*.55,cy-r*.25,r*.78); motifs.push({kind,cx,cy,r}); }
        else if(kind==='ring'){ fillDisc(m,grp,ord,cx,cy,r*.96,cand.ci,oi); clearDisc(m,cx,cy,r*.96-U); fillDisc(m,grp,ord,cx,cy,r*.42,1,oi); motifs.push({kind,cx,cy,r}); }
        else if(kind==='stripes'){ const lines=Math.max(5,Math.round(h/(U*.55))),t=Math.max(2,U*.22); for(let k=0;k<lines;k++){ const yy=by0+(h-t)*k/(lines-1); paintRect(bx0,yy,bx1,yy+t,3,oi); } motifs.push({kind,cx,cy,r}); } } } }
  // 5. dots become discs
  const dots=strokes.filter(s=>s.t==='㇔'); for(const d of dots){ const q=d.mp[Math.floor(d.mp.length/2)]; const seed=nearestInk(m,q[0],q[1],E*.07); if(seed<0) continue; const comp=component(m,seed,1); if(comp.length>area*.06) continue; let cx=0,cy=0; for(const i of comp){ cx+=i%E; cy+=(i/E)|0; m[i]=0; } cx/=comp.length; cy/=comp.length; const r=Math.max(U*.5,Math.sqrt(comp.length/Math.PI)*1.04); fillDisc(m,grp,ord,cx,cy,r,d.ci,d.i); }
  // 6. square counters become round: a circle cut from a filled block, with a sun inside when large
  const eyes=[]; const ext=component(m,0,0,true); const seen=new Uint8Array(E*E); for(const i of ext) seen[i]=1;
  for(let i=0;i<E*E;i++){ if(m[i]||seen[i]) continue; const hole=component(m,i,0); for(const j of hole) seen[j]=1; if(hole.length<area*.004) continue;
    let hx0=E,hy0=E,hx1=0,hy1=0,cx=0,cy=0; for(const j of hole){ const x=j%E,y=(j/E)|0; if(x<hx0)hx0=x; if(x>hx1)hx1=x; if(y<hy0)hy0=y; if(y>hy1)hy1=y; cx+=x; cy+=y; } cx/=hole.length; cy/=hole.length; const w=hx1-hx0+1,h=hy1-hy0+1,asp=w/h; if(asp<.55||asp>1.8) continue;
    const r=Math.sqrt(hole.length/Math.PI); const ringCi=ringColour(grp,hole), ringOrd=ringOrder(ord,hole);
    for(const j of hole){ m[j]=1; grp[j]=ringCi; ord[j]=ringOrd; } clearDisc(m,cx,cy,r*.9);
    if(r>U*.9) eyes.push({x:cx,y:cy,r:r*.56,ci:ringCi,ord:ringOrd}); }
  // 7. colour
  const out=new ImageData(E,E); const o=out.data; const cols=[hex2rgb(P.ivory)].concat(opts.pig.map(hex2rgb)); const stripeCol=hex2rgb(opts.pig[2]);
  for(let i=0;i<E*E;i++){ if(!m[i]) continue; const ci=Math.max(0,grp[i]); const col=stripes.includes(ci)&&false?stripeCol:cols[ci%cols.length]; o[i*4]=col[0]; o[i*4+1]=col[1]; o[i*4+2]=col[2]; o[i*4+3]=255; }
  for(let i=0;i<E*E;i++){ if(m[i]&&ord[i]<0){ let best=-1; for(let r=1;r<6&&best<0;r++){ for(let dy=-r;dy<=r&&best<0;dy++) for(let dx=-r;dx<=r;dx++){ const j=i+dy*E+dx; if(j>=0&&j<E*E&&ord[j]>=0){ best=ord[j]; break; } } } ord[i]=best<0?0:best; } }
  const tallest=bands.filter(b=>b.kind==='v').sort((a,b)=>(b.y1-b.y0)-(a.y1-a.y0)).slice(0,2);
  return {img:out,ord,n:Math.max(1,strokes.length),eyes,box:[x0,y0,x1,y1],hair:tallest.map(b=>({x:(b.x0+b.x1)/2,y:b.y0}))};
}
function nearestInk(m,x,y,R){ let best=-1,bd=R*R; const X=Math.round(x),Y=Math.round(y); for(let dy=-R;dy<=R;dy++) for(let dx=-R;dx<=R;dx++){ const px=X+dx,py=Y+dy; if(px<0||py<0||px>=E||py>=E) continue; const i=py*E+px; if(m[i]){ const d=dx*dx+dy*dy; if(d<bd){ bd=d; best=i; } } } return best; }
function component(m,seed,val,fromBorder){ const out=[]; const seen=new Uint8Array(E*E); const stack=[]; if(fromBorder){ for(let x=0;x<E;x++){ stack.push(x,(E-1)*E+x); } for(let y=0;y<E;y++){ stack.push(y*E,y*E+E-1); } } else stack.push(seed);
  while(stack.length){ const i=stack.pop(); if(seen[i]||m[i]!==val) continue; seen[i]=1; out.push(i); const x=i%E; if(x>0) stack.push(i-1); if(x<E-1) stack.push(i+1); if(i>=E) stack.push(i-E); if(i<E*E-E) stack.push(i+E); } return out; }
function fillDisc(m,grp,ord,cx,cy,r,ci,oi){ const R=Math.ceil(r); for(let y=Math.max(0,Math.floor(cy-R));y<=Math.min(E-1,Math.ceil(cy+R));y++) for(let x=Math.max(0,Math.floor(cx-R));x<=Math.min(E-1,Math.ceil(cx+R));x++){ if((x-cx)**2+(y-cy)**2<=r*r){ const i=y*E+x; m[i]=1; grp[i]=ci; ord[i]=oi; } } }
function clearDisc(m,cx,cy,r){ const R=Math.ceil(r); for(let y=Math.max(0,Math.floor(cy-R));y<=Math.min(E-1,Math.ceil(cy+R));y++) for(let x=Math.max(0,Math.floor(cx-R));x<=Math.min(E-1,Math.ceil(cx+R));x++){ if((x-cx)**2+(y-cy)**2<=r*r) m[y*E+x]=0; } }
function ringColour(grp,hole){ const cnt={}; for(const j of hole){ for(const k of [j-1,j+1,j-E,j+E]){ if(k<0||k>=E*E) continue; const g=grp[k]; if(g>=0) cnt[g]=(cnt[g]||0)+1; } } let best=0,bc=-1; for(const k in cnt){ if(cnt[k]>bc){ bc=cnt[k]; best=+k; } } return best; }
function ringOrder(ord,hole){ let best=-1; for(const j of hole){ for(const k of [j-1,j+1,j-E,j+E]){ if(k<0||k>=E*E) continue; if(ord[k]>best) best=ord[k]; } } return Math.max(0,best); }

// the poster: glyphs stacked on the ground, a dot column, the reading
function build(word,o){ const opts=Object.assign({ground:'black',face:'dela',dots:0,reading:'',width:300},o||{}); const P=PAL[opts.ground==='paper'?'paper':'black']; opts.P=P;
  opts.pig=[opts.pigment||P.pig[0]].concat(P.pig.filter(c=>c!==opts.pigment));
  const glyphs=[...word].map(ch=>buildGlyph(ch,opts)).filter(Boolean); const n=glyphs.length||1;
  const dpr=Math.max(1,Math.min(3,window.devicePixelRatio||1)); const W=opts.width; const M=Math.round(W*.06), G=Math.round(W*.02), D=Math.round(W*.07); const cell=W-M*2-D-Math.round(W*.04); const CAP=opts.reading?Math.round(W*.09):0; const H=M+n*cell+(n-1)*G+CAP+M;
  const c=cv(Math.round(W*dpr),Math.round(H*dpr)); c.style.width=W+'px'; c.style.height=H+'px'; c.style.display='block'; c.style.borderRadius='6px'; c.setAttribute('role','img'); c.setAttribute('aria-label',word);
  const g=c.getContext('2d');
  function paint(upTo){ g.save(); g.setTransform(dpr,0,0,dpr,0,0); g.fillStyle=P.ground; g.fillRect(0,0,W,H); const s=cell/E;
    glyphs.forEach((gl,gi)=>{ const y=M+gi*(cell+G); const t=cv(E,E); const tg=t.getContext('2d'); if(upTo==null){ tg.putImageData(gl.img,0,0); } else { const k=upTo-gi*1000; const id=new ImageData(new Uint8ClampedArray(gl.img.data),E,E); const d=id.data; for(let i=0;i<E*E;i++){ if(gl.ord[i]>k) d[i*4+3]=0; } tg.putImageData(id,0,0); }
      // drafting hairlines rise from the tallest verticals past the top of the glyph
      g.strokeStyle=P.dim; g.lineWidth=Math.max(.6,W*.003); g.globalAlpha=.85; for(const h of gl.hair){ if(upTo!=null&&upTo<gi*1000) continue; g.beginPath(); g.moveTo(M+h.x*s,y+h.y*s-cell*.16); g.lineTo(M+h.x*s,y+h.y*s-cell*.02); g.stroke(); } g.globalAlpha=1;
      g.imageSmoothingEnabled=true; g.imageSmoothingQuality='high'; g.drawImage(t,0,0,E,E,M,y,cell,cell);
      for(const e of gl.eyes){ if(upTo!=null&&e.ord>upTo-gi*1000) continue; g.fillStyle=e.ci===0?opts.pig[0]:P.ivory; g.beginPath(); g.arc(M+e.x*s,y+e.y*s,e.r*s,0,Math.PI*2); g.fill(); } });
    const dx=W-M-D/2; const dcols=[opts.pig[0],P.pig[1],P.pig[2],P.pig[3],P.pig[5]]; for(let i=0;i<5;i++){ const cy=M+D/2+i*D*1.5; g.beginPath(); g.arc(dx,cy,D/2,0,Math.PI*2); if(i<opts.dots){ g.fillStyle=dcols[i%dcols.length]; g.fill(); } else { g.strokeStyle=P.dim; g.lineWidth=1; g.globalAlpha=.6; g.stroke(); g.globalAlpha=1; } }
    if(opts.sealed){ g.fillStyle=P.pig[0]; g.fillRect(dx-D/2,M+5*D*1.5,D,D); }
    if(opts.reading){ g.fillStyle=P.ivory; g.font=`${Math.round(W*.045)}px ${FONT_JP}`; g.textAlign='left'; g.fillText(opts.reading,M,H-M-Math.round(W*.02)); }
    g.restore(); }
  return {canvas:c,glyphs,paint,steps:glyphs.map(gl=>gl.n)};
}
function render(container,word,o){ const m=build(word,o); m.paint(null); container.textContent=''; container.appendChild(m.canvas); return m; }
function animateIn(container,word,o){ const m=build(word,o); const per=(o&&o.per)||75; let stopped=false; container.textContent=''; container.appendChild(m.canvas); m.paint(-1);
  const seq=[]; m.steps.forEach((n,gi)=>{ for(let k=0;k<n;k++) seq.push(gi*1000+k); }); let i=0;
  const timer=setInterval(()=>{ if(stopped) return; if(i>=seq.length){ clearInterval(timer); m.paint(null); return; } m.paint(seq[i++]); },per);
  return {cancel(){ stopped=true; clearInterval(timer); m.paint(null); },model:m};
}
window.MeguriKanji={build,render,animateIn,has:ch=>!!KVG()[ch],PAL,FACES};
})();
