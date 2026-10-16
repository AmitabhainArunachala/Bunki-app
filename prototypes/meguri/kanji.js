// 廻 Meguri — the word as a poster. Vector only.
// The letterform is the typeface, drawn as SVG text so it is crisp at any size. KanjiVG stroke data
// (Ulrich Apel, CC BY-SA 3.0) is used for one thing here: where the radicals of a compound sit, so the
// character can be cut into two colours along the gap between them, the way Minami splits a glyph at a
// stroke boundary. A sun may sit behind a 日/白 component. Nothing is drawn inside the character by hand.
// The modular construction (bands, slits, folds) lives in kakuji.js once it has passed the judge.
(function(){
'use strict';
const KVG=()=>window.MEGURI_KVG||{};
const NS='http://www.w3.org/2000/svg';
const PAL={
  black:{ground:'#0a0a0a',ivory:'#f1efd8',dim:'#8f8c7a',pig:['#d8432b','#d9a441','#6b57a8','#3f8f84','#8c9a3a','#a24242']},
  paper:{ground:'#ebe7dc',ivory:'#1a1816',dim:'#6c665a',pig:['#c4432c','#c47f3c','#5f4e92','#3e7d6a','#6f7f2e','#8f3c3c']}
};
const FACES={dela:["'Meguri Dela','Dela Gothic One',sans-serif",400],potta:["'Potta One','Meguri Dela',sans-serif",400],maru:["'Zen Maru Gothic','Meguri Dela',sans-serif",900]};
const FONT_JP="'Zen Old Mincho','Hiragino Mincho ProN',serif";
let uid=0;
function el(n,a){ const e=document.createElementNS(NS,n); for(const k in a) e.setAttribute(k,a[k]); return e; }
let meas=null;
function strokeBox(d){ if(!meas){ meas=el('svg',{viewBox:'0 0 109 109',style:'position:fixed;left:-2000px;top:0;width:109px;height:109px;visibility:hidden;pointer-events:none'}); document.body.appendChild(meas); }
  const p=el('path',{d}); meas.appendChild(p); let b; try{ b=p.getBBox(); }catch(e){ b={x:0,y:0,width:0,height:0}; } p.remove(); return [b.x,b.y,b.x+b.width,b.y+b.height]; }
function union(boxes){ return [Math.min(...boxes.map(b=>b[0])),Math.min(...boxes.map(b=>b[1])),Math.max(...boxes.map(b=>b[2])),Math.max(...boxes.map(b=>b[3]))]; }

// where the radicals sit, in the 109 box: the top-level groups and any 日/白 component
function analyse(ch){ const K=KVG()[ch]; if(!K) return null; const boxes=K.s.map(s=>strokeBox(s.d)); const ink=union(boxes);
  const groups=K.g.map((g,i)=>{ const bs=boxes.filter((b,j)=>K.s[j].g===i); return bs.length?{e:g.e,p:g.p,box:union(bs),n:bs.length}:null; }).filter(Boolean);
  let sun=null; const sunIdx=K.s.map((s,j)=>s.a.includes('日')||s.a.includes('白')?j:-1).filter(j=>j>=0); if(sunIdx.length>=4&&sunIdx.length<=6){ sun=union(sunIdx.map(j=>boxes[j])); }
  return {ink,groups,sun};
}

function build(word,o){ const opts=Object.assign({ground:'black',face:'dela',dots:0,reading:'',width:300},o||{}); const P=PAL[opts.ground==='paper'?'paper':'black']; const [family,weight]=FACES[opts.face]||FACES.dela;
  const pig=[opts.pigment||P.pig[0]].concat(P.pig.filter(c=>c!==opts.pigment));
  const chars=[...word]; const n=chars.length||1; const W=opts.width; const M=W*.07, G=W*.015, D=W*.07; const cell=W-M*2-D-W*.05; const CAP=opts.reading?W*.1:0; const H=M+n*cell+(n-1)*G+CAP+M;
  const svg=el('svg',{viewBox:`0 0 ${W} ${H}`,xmlns:NS,role:'img','aria-label':word}); svg.style.display='block'; svg.style.width='100%'; svg.style.borderRadius='6px';
  svg.appendChild(el('rect',{x:0,y:0,width:W,height:H,fill:P.ground}));
  const defs=el('defs',{}); svg.appendChild(defs); const parts=[];
  chars.forEach((ch,gi)=>{ const x=M, y=M+gi*(cell+G); const S=cell*.9; const A=analyse(ch); const g=el('g',{}); svg.appendChild(g);
    // the typeface's ink box is taken as the KanjiVG ink box: both fill the em the same way within a few percent
    const map=b=>{ if(!A) return null; const [ix0,iy0,ix1,iy1]=A.ink; const sx=S*.86/Math.max(1,ix1-ix0), sy=S*.86/Math.max(1,iy1-iy0); const ox=x+cell/2-(ix0+ix1)/2*sx, oy=y+cell/2-(iy0+iy1)/2*sy; return [ox+b[0]*sx,oy+b[1]*sy,ox+b[2]*sx,oy+b[3]*sy]; };
    if(A&&A.sun){ const b=map(A.sun); const r=Math.max(b[2]-b[0],b[3]-b[1])*.5; g.appendChild(el('circle',{cx:(b[0]+b[2])/2,cy:(b[1]+b[3])/2,r,fill:pig[0],opacity:.95})); }
    const text=(fill,clip)=>{ const t=el('text',{x:x+cell/2,y:y+cell/2,fill,'font-family':family,'font-weight':weight,'font-size':S,'text-anchor':'middle','dominant-baseline':'central'}); t.textContent=ch; if(clip) t.setAttribute('clip-path',`url(#${clip})`); return t; };
    g.appendChild(text(P.ivory)); parts.push(g);
    // two colours, cut straight along the gap between the two largest radicals
    if(A&&A.groups.length>=2){ const gs=A.groups.slice().sort((a,b)=>(b.box[2]-b.box[0])*(b.box[3]-b.box[1])-(a.box[2]-a.box[0])*(a.box[3]-a.box[1])).slice(0,2); const [a,b]=gs; const A1=map(a.box),B1=map(b.box);
      const horiz=Math.abs((A1[0]+A1[2])/2-(B1[0]+B1[2])/2)>Math.abs((A1[1]+A1[3])/2-(B1[1]+B1[3])/2); const id='mk'+(++uid); const cp=el('clipPath',{id});
      let rect; if(horiz){ const left=A1[0]<B1[0]?A1:B1, right=left===A1?B1:A1; const cut=(left[2]+right[0])/2; rect=el('rect',{x:cut,y:y-2,width:x+cell+2-cut,height:cell+4}); }
      else { const top=A1[1]<B1[1]?A1:B1, bottom=top===A1?B1:A1; const cut=(top[3]+bottom[1])/2; rect=el('rect',{x:x-2,y:cut,width:cell+4,height:y+cell+2-cut}); }
      cp.appendChild(rect); defs.appendChild(cp); g.appendChild(text(pig[(gi%2)===0?0:1],id)); } });
  // the dot column and the reading
  const dx=W-M-D/2; const dcols=[pig[0],P.pig[1],P.pig[2],P.pig[3],P.pig[5]]; for(let i=0;i<5;i++){ const cy=M+D/2+i*D*1.5; if(i<opts.dots) svg.appendChild(el('circle',{cx:dx,cy,r:D/2,fill:dcols[i%dcols.length]})); else svg.appendChild(el('circle',{cx:dx,cy,r:D/2-.6,fill:'none',stroke:P.dim,'stroke-width':1,opacity:.6})); }
  if(opts.sealed) svg.appendChild(el('rect',{x:dx-D/2,y:M+5*D*1.5,width:D,height:D,rx:2,fill:pig[0]}));
  if(opts.reading){ const t=el('text',{x:M,y:H-M-W*.02,fill:P.ivory,'font-family':FONT_JP,'font-size':W*.045,'letter-spacing':W*.003}); t.textContent=opts.reading; svg.appendChild(t); }
  return {svg,parts};
}
function render(container,word,o){ const m=build(word,o); container.textContent=''; container.appendChild(m.svg); return m; }
function animateIn(container,word,o){ const m=build(word,o); let cancelled=false; const timers=[];
  m.parts.forEach((g,i)=>{ g.style.opacity='0'; g.style.transform='translateY(6px)'; g.style.transition='opacity .36s ease, transform .5s cubic-bezier(.2,.8,.2,1)'; timers.push(setTimeout(()=>{ if(cancelled) return; g.style.opacity='1'; g.style.transform='none'; },120+i*160)); });
  container.textContent=''; container.appendChild(m.svg);
  return {cancel(){ cancelled=true; for(const t of timers) clearTimeout(t); for(const g of m.parts){ g.style.transition='none'; g.style.opacity='1'; g.style.transform='none'; } },model:m};
}
window.MeguriKanji={build,render,animateIn,has:ch=>!!KVG()[ch],PAL,FACES};
})();
