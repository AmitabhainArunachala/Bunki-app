// 廻 Meguri — constructed kanji posters from KanjiVG stroke data.
// Every stroke is a designed path with a type (㇐ horizontal, ㇑ vertical, ㇔ dot, sweeps, hooks) and a radical lineage;
// the poster draws them at one width with round ends, straightens the axis strokes, turns dots into discs,
// rebuilds enclosures (口 日 目 田 白) as rounded rings with an eye, and colours each radical from the palette.
(function(){
'use strict';
const NS='http://www.w3.org/2000/svg';
const KVG=()=>window.MEGURI_KVG||{};
let U=109/9;
// optical weight: a glyph of 7 strokes gets em/9; each stroke beyond that thins it a little, down to em/14 for the densest
const widthFor=n=>109/Math.max(9,Math.min(14,9+(n-7)*.42));
const PAL={
  black:{ground:'#080808',ivory:'#f1efd8',dim:'#8f8c7a',pig:['#d8432b','#d9a441','#6b57a8','#3f8f84','#8c9a3a','#a24242']},
  paper:{ground:'#ebe7dc',ivory:'#1a1816',dim:'#6c665a',pig:['#c4432c','#c47f3c','#5f4e92','#3e7d6a','#6f7f2e','#8f3c3c']}
};
const RING=new Set(['口','日','目','田','白','囗','曰']);
const FONT_JP="'Zen Old Mincho','Hiragino Mincho ProN',serif", FONT_LAB="'Cormorant Garamond',Georgia,serif";
function el(n,a){ const e=document.createElementNS(NS,n); for(const k in a) e.setAttribute(k,a[k]); return e; }
let meas=null;
function measure(d){ if(!meas){ meas=el('svg',{viewBox:'0 0 109 109',style:'position:fixed;left:-2000px;top:0;width:109px;height:109px;visibility:hidden;pointer-events:none'}); document.body.appendChild(meas); }
  const p=el('path',{d}); meas.appendChild(p); let b,a,z,L; try{ b=p.getBBox(); L=p.getTotalLength(); a=p.getPointAtLength(0); z=p.getPointAtLength(L); }catch(e){ b={x:0,y:0,width:0,height:0}; L=0; a=z={x:0,y:0}; } const m=L?p.getPointAtLength(L/2):a; p.remove();
  return {x0:b.x,y0:b.y,x1:b.x+b.width,y1:b.y+b.height,p0:a,p1:z,pm:m,L}; }
const snap=v=>Math.round(v/(U/2))*(U/2);

// one glyph -> a list of drawable parts in stroke order: {kind:'path'|'line'|'disc'|'ring', ...,colour key}
function buildGlyph(ch,opts){ const K=KVG()[ch]; if(!K) return null; U=widthFor(K.s.length); const u=U; const strokes=K.s.map((s,i)=>Object.assign({i},s,measure(s.d))); const nTop=K.g.length;
  const keyOf=s=>nTop>1?String(s.g):(s.a[1]||s.a[0]||'');
  // rings: runs of strokes whose innermost ring-ancestor is the same element instance (consecutive in stroke order)
  const parts=[]; let i=0;
  while(i<strokes.length){ const s=strokes[i]; const ringEl=[...s.a].reverse().find(e=>RING.has(e));
    if(ringEl){ let j=i; while(j<strokes.length&&[...strokes[j].a].reverse().find(e=>RING.has(e))===ringEl&&strokes[j].a.join('')===s.a.join('')) j++;
      // the ring box comes from the box-like strokes only; the rest stay as inner bars if they sit inside
      const run=strokes.slice(i,j); const boxy=run.filter(r=>'㇐㇑㇕㇗㇖'.includes(r.t)); const src=boxy.length>=2?boxy:run;
      const bx0=Math.min(...src.map(r=>r.x0)),by0=Math.min(...src.map(r=>r.y0)),bx1=Math.max(...src.map(r=>r.x1)),by1=Math.max(...src.map(r=>r.y1));
      const w=bx1-bx0,h=by1-by0; const key=keyOf(s);
      if(Math.min(w,h)>U*2.6){ parts.push({kind:'ring',x:bx0+U/2,y:by0+U/2,w:w-U,h:h-U,key,i,eye:(ringEl==='口'||ringEl==='囗')&&Math.min(w,h)>=U*4.2});
        for(const r of run){ const inner=(r.t==='㇐'&&r.pm.y>by0+U*.9&&r.pm.y<by1-U*.9)||(r.t==='㇑'&&r.pm.x>bx0+U*.9&&r.pm.x<bx1-U*.9); if(inner) parts.push(straight(r,key)); else if(!src.includes(r)&&r.t!=='㇐'&&r.t!=='㇑') parts.push(asPart(r,key)); }
        i=j; continue; } }
    parts.push(asPart(s,keyOf(s))); i++; }
  // colour keys in order of appearance: ivory, then the pigments
  const keys=[]; for(const p of parts){ if(!keys.includes(p.key)) keys.push(p.key); }
  for(const p of parts) p.ci=keys.indexOf(p.key);
  for(const p of parts) p.u=u; return {ch,parts,groups:K.g,u};
}
function straight(s,key){ if(s.t==='㇐'){ const y=snap((s.p0.y+s.p1.y)/2); return {kind:'line',x0:Math.min(s.p0.x,s.p1.x),y0:y,x1:Math.max(s.p0.x,s.p1.x),y1:y,key,i:s.i}; } if(s.t==='㇑'){ const x=snap((s.p0.x+s.p1.x)/2); return {kind:'line',x0:x,y0:Math.min(s.p0.y,s.p1.y),x1:x,y1:Math.max(s.p0.y,s.p1.y),key,i:s.i}; } return asPart(s,key); }
function asPart(s,key){ if(s.t==='㇔'&&s.L<U*2.4) return {kind:'disc',x:s.pm.x,y:s.pm.y,r:U*.62,key,i:s.i}; if(s.t==='㇐'||s.t==='㇑') return straight(s,key); return {kind:'path',d:s.d,key,i:s.i,L:s.L}; }

// the poster: glyphs stacked, a dot column, captions
function build(word,o){ const opts=Object.assign({ground:'black',dots:0,reading:'',meaning:'',hairlines:true,width:300},o||{}); const P=PAL[opts.ground==='paper'?'paper':'black'];
  const pig=[opts.pigment||P.pig[0]].concat(P.pig.filter(c=>c!==opts.pigment)); const colour=ci=>ci===0?P.ivory:pig[(ci-1)%pig.length];
  const glyphs=[...word].map(ch=>buildGlyph(ch,opts)).filter(Boolean); const n=glyphs.length||1;
  const U0=109/9; const M=16,G=14,CAP=opts.reading?26:0; const W=M+109+12+U0+M, H=M+n*109+(n-1)*G+CAP+M;
  const svg=el('svg',{viewBox:`0 0 ${W} ${H}`,xmlns:NS,role:'img','aria-label':word}); svg.style.display='block'; svg.style.width='100%';
  svg.appendChild(el('rect',{x:0,y:0,width:W,height:H,fill:P.ground,rx:3}));
  const order=[]; // animation order
  glyphs.forEach((gl,gi)=>{ const g=el('g',{transform:`translate(${M},${M+gi*(109+G)})`}); svg.appendChild(g);
    if(opts.hairlines){ const verts=gl.parts.filter(p=>p.kind==='line'&&p.x0===p.x1).sort((a,b)=>(b.y1-b.y0)-(a.y1-a.y0)).slice(0,2); for(const v of verts){ g.appendChild(el('line',{x1:v.x0,y1:v.y0-gl.u*2.2,x2:v.x0,y2:v.y0-gl.u*.2,stroke:P.dim,'stroke-width':gl.u*.07,opacity:.9})); } }
    for(const p of gl.parts){ const c=colour(p.ci); let e;
      if(p.kind==='path') e=el('path',{d:p.d,fill:'none',stroke:c,'stroke-width':p.u,'stroke-linecap':'round','stroke-linejoin':'round'});
      else if(p.kind==='line') e=el('line',{x1:p.x0,y1:p.y0,x2:p.x1,y2:p.y1,stroke:c,'stroke-width':p.u,'stroke-linecap':'round'});
      else if(p.kind==='disc') e=el('circle',{cx:p.x,cy:p.y,r:p.r,fill:c});
      else if(p.kind==='ring'){ e=el('g',{}); e.appendChild(el('rect',{x:p.x,y:p.y,width:p.w,height:p.h,rx:Math.min(p.u,p.w/2,p.h/2),fill:'none',stroke:c,'stroke-width':p.u})); if(p.eye){ const ec=pig[0]===c?P.ivory:pig[0]; e.appendChild(el('circle',{cx:p.x+p.w/2,cy:p.y+p.h/2,r:Math.min(p.u*.72,Math.min(p.w,p.h)*.22),fill:ec})); } }
      e.dataset.kind=p.kind; g.appendChild(e); order.push(e); } });
  // the dot column
  const dx=M+109+12+U0/2; const dotCols=[pig[0],P.pig[1],P.pig[2],P.pig[3],P.pig[5]]; for(let i=0;i<5;i++){ const cy=M+U0/2+i*(U0*1.5); if(i<opts.dots) svg.appendChild(el('circle',{cx:dx,cy,r:U0/2,fill:dotCols[i%dotCols.length]})); else svg.appendChild(el('circle',{cx:dx,cy,r:U0/2-.6,fill:'none',stroke:P.dim,'stroke-width':.9,opacity:.55})); }
  if(opts.sealed) svg.appendChild(el('rect',{x:dx-U0/2,y:M+5*(U0*1.5),width:U0,height:U0,rx:1.5,fill:P.pig[0]}));
  // captions
  // only the reading is set inside the poster; an English line this small in an italic face breaks up, so the page carries the meaning
  if(CAP){ const y=M+n*109+(n-1)*G+16; if(opts.reading){ const t=el('text',{x:M,y,fill:P.ivory,'font-family':FONT_JP,'font-size':7.5,'letter-spacing':.6}); t.textContent=opts.reading; svg.appendChild(t); } }
  return {svg,order,W,H};
}
function render(container,word,o){ const m=build(word,o); container.textContent=''; container.appendChild(m.svg); return m; }
function animateIn(container,word,o){ const m=build(word,o); const per=(o&&o.per)||70; let cancelled=false; const timers=[];
  for(const e of m.order){ const k=e.dataset.kind; if(k==='path'||k==='line'){ let L=0; try{ L=e.getTotalLength?e.getTotalLength():Math.hypot(+e.getAttribute('x2')-+e.getAttribute('x1'),+e.getAttribute('y2')-+e.getAttribute('y1')); }catch(err){} if(!L&&k==='line') L=Math.hypot(+e.getAttribute('x2')-+e.getAttribute('x1'),+e.getAttribute('y2')-+e.getAttribute('y1')); e.style.strokeDasharray=L+' '+L; e.style.strokeDashoffset=L; e.style.transition='stroke-dashoffset .42s cubic-bezier(.3,.7,.2,1)'; }
    else { e.style.transformBox='fill-box'; e.style.transformOrigin='center'; e.style.transform='scale(0)'; e.style.transition='transform .32s cubic-bezier(.3,.9,.3,1.2)'; } }
  container.textContent=''; container.appendChild(m.svg);
  // lengths must be read after the svg is in the document, so lines get real dash lengths
  requestAnimationFrame(()=>{ m.order.forEach((e,i)=>{ const k=e.dataset.kind; if(k==='path'||k==='line'){ let L=0; try{ L=e.getTotalLength(); }catch(err){} if(L){ e.style.strokeDasharray=L+' '+L; e.style.strokeDashoffset=L; } } timers.push(setTimeout(()=>{ if(cancelled) return; if(k==='path'||k==='line') e.style.strokeDashoffset='0'; else e.style.transform='scale(1)'; },120+i*per)); }); });
  return {cancel(){ cancelled=true; for(const t of timers) clearTimeout(t); for(const e of m.order){ e.style.transition='none'; e.style.strokeDashoffset='0'; e.style.transform='none'; } },model:m};
}
window.MeguriKanji={build,render,animateIn,has:ch=>!!KVG()[ch],PAL};
})();
