/** Real UI regression for long front Undo and reduced-motion open folds.
 * Same strict checks reject the preserved pre-repair immutable artifact.
 * Safe-area env values use disclosed Chromium emulation (not physical iOS). */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCorridorSite, resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SITE=resolveCorridorSite(), OUT=resolveCorridorEvidence();
mkdirSync(OUT,{recursive:true});
const { chromium }=createRequire(ROOT+'/package.json')('playwright');
const { startStaticHost }=createRequire(ROOT+'/package.json')(ROOT+'/prototypes/bunki-desktop/lib/static-host.cjs');
const { emptyState }=await import(pathToFileURL(ROOT+'/prototypes/corridor/decks/player/engine.js'));
const identity=Object.fromEntries(Object.entries(JSON.parse(readFileSync(SITE+'/build-identity.json'))).filter(([k])=>['gitSha','sourceDirty','artifactSha256','sourceAssetSha256'].includes(k)));
const n1=JSON.parse(readFileSync(SITE+'/decks/n1/deck.json'));
const longWord=n1.words[1];
assert(longWord); const first=n1.words[0].cards[0], second=longWord.cards[0];
const seed=emptyState('n1');
for(const w of n1.words) for(const c of w.cards) if(![first.id,second.id].includes(c.id)) seed.suspended[c.id]={at:'2026-10-10T00:00:00.000Z',by:'delete'};
const host=await startStaticHost({site:SITE,port:0}), browser=await chromium.launch();
const results={slip:[],identity,scope:'Independent real browser UI. Unchanged real N1 cards selected by valid suspended ledger in a disposable context; actual native trusted grade/remove/Undo. Safe-area values use Chromium CDP env emulation, not an iOS hardware claim.',first:{id:first.id,length:first.ja.length},second:{id:second.id,length:second.ja.length,targetOffset:second.ja.indexOf(second.form)},undo:[],fold:[],paintNegativeControl:[]};
async function resting(page){await page.evaluate(async()=>{await document.fonts.ready;await Promise.allSettled(document.querySelector('.kp').getAnimations({subtree:true}).filter(a=>a.effect?.getComputedTiming().endTime!==Infinity).map(a=>a.finished));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});}
const geometry=()=>{const u=document.querySelector('#kp-undo'),reveal=document.querySelector('#kp-reveal'),target=document.querySelector('#kp-card .kp-target,#kp-card .kp-blank'),card=document.querySelector('#kp-card');const rect=n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,top:r.top,bottom:r.bottom,right:r.right,left:r.left}};const us=getComputedStyle(u),ps=getComputedStyle(u,'::before'),ur=rect(u),rr=rect(reveal),tr=rect(target);const p=document.createElement('div');p.style.paddingBottom='env(safe-area-inset-bottom,0px)';document.body.append(p);const safe=getComputedStyle(p).paddingBottom;p.remove();const all=[];const walk=document.createTreeWalker(card,NodeFilter.SHOW_TEXT);for(let n=walk.nextNode();n;n=walk.nextNode()){if(!n.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(n);for(const r of range.getClientRects())if(r.bottom>ur.top&&r.top<ur.bottom&&r.right>ur.left&&r.left<ur.right){const x=(Math.max(r.left,ur.left)+Math.min(r.right,ur.right))/2,y=(Math.max(r.top,ur.top)+Math.min(r.bottom,ur.bottom))/2,hit=document.elementFromPoint(x,y);all.push({text:n.textContent,top:r.top,bottom:r.bottom,left:r.left,right:r.right,x,y,owns:!!hit&&u.contains(hit),hit:hit?.tagName});}}const points=[['centre',0,0],['top-left',-21,-21],['top-right',21,-21],['bottom-left',-21,21],['bottom-right',21,21]].map(([name,dx,dy])=>{const x=ur.x+ur.width/2+dx,y=ur.y+ur.height/2+dy,hit=document.elementFromPoint(x,y);return{name,x,y,owns:!!hit&&u.contains(hit),hit:hit?.tagName}});return{card:card.dataset.card,cardRect:rect(card),scrollY,undo:ur,reveal:rr,target:tr,gap:rr.top-ur.bottom,revealFromBottom:innerHeight-rr.bottom,background:us.backgroundColor,band:{content:ps.content,background:ps.backgroundColor,top:ps.top,bottom:ps.bottom,left:ps.left,right:ps.right},overlappingInk:all,points,clearTarget:tr.bottom<=ur.top-16+1,safeArea:safe,hasPrimaryTabs:document.body.classList.contains('has-primary-tabs'),navClearance:getComputedStyle(document.querySelector('.kp')).getPropertyValue('--nav-clearance'),overflow:document.documentElement.scrollWidth-innerWidth};};
// A pointer-events:none overpaint can pass every native hit point. Compare the
// settled painted band against a card-hidden control without changing layout.
let paintSequence=0;
async function paintedBand(page,g,width){
 const sequence=++paintSequence;
 const clip={x:0,y:Math.floor(g.undo.top),width,height:Math.ceil(g.undo.bottom)-Math.floor(g.undo.top)};
 const ledgerBefore=await page.evaluate(()=>localStorage.getItem('bunki-cloze:n1'));
 const baseline=await page.screenshot({clip}),repeat=await page.screenshot({clip});
 const oldStyle=await page.locator('#kp-card').getAttribute('style');
 let hidden,hiddenGeometry,visibleDescendants;
 try{
  await page.locator('#kp-card').evaluate(n=>n.style.setProperty('visibility','hidden','important'));
  await resting(page);
  hiddenGeometry=await page.evaluate(geometry);
  visibleDescendants=await page.locator('#kp-card').evaluate(n=>[n,...n.querySelectorAll('*')].filter(n=>getComputedStyle(n).visibility!=='hidden').length);
  hidden=await page.screenshot({clip});
 }finally{
  await page.locator('#kp-card').evaluate((n,style)=>style===null?n.removeAttribute('style'):n.setAttribute('style',style),oldStyle);
 }
 await resting(page);
 const restored=await page.screenshot({clip}),restoredGeometry=await page.evaluate(geometry);
 const sameGeometry=other=>JSON.stringify(g.cardRect)===JSON.stringify(other.cardRect)&&JSON.stringify(g.undo)===JSON.stringify(other.undo)&&g.scrollY===other.scrollY;
 const ledgerAfter=await page.evaluate(()=>localStorage.getItem('bunki-cloze:n1'));
 const captures={};
 if(!baseline.equals(repeat)||!baseline.equals(hidden)||!baseline.equals(restored)){
  for(const [label,buffer] of Object.entries({visible:baseline,repeat,hidden,restored})){
   captures[label]=OUT+`/undo-paint-${sequence}-${label}.png`;writeFileSync(captures[label],buffer);
  }
 }
 return{sequence,captures,clip,baselineRepeatEqual:baseline.equals(repeat),cardInkOccluded:baseline.equals(hidden),restoredEqual:baseline.equals(restored),cardOutsideUndo:await page.locator('#kp-undo').evaluate(n=>!n.closest('#kp-card')),visibleDescendants,unchangedGeometry:sameGeometry(hiddenGeometry)&&sameGeometry(restoredGeometry),ledgerUnchanged:ledgerBefore===ledgerAfter,hiddenGeometry,restoredGeometry};
}
async function overpaintNegativeControl(page,g,width){
 const oldStyle=await page.locator('#kp-card').getAttribute('style');
 try{
  await page.locator('#kp-card').evaluate((card,u)=>{
   const n=document.createElement('span');n.id='paint-oracle-negative-control';n.textContent='OVERPAINT';
   Object.assign(n.style,{position:'fixed',left:`${u.x+8}px`,top:`${u.top+6}px`,font:'bold 24px sans-serif',lineHeight:'28px',color:'rgb(255,0,255)',background:'transparent',zIndex:'2147483600',pointerEvents:'none'});
   card.append(n);
  },g.undo);
  await resting(page);
  const controlGeometry=await page.evaluate(geometry);
  const paint=await paintedBand(page,controlGeometry,width);
  return{geometry:controlGeometry,paint};
 }finally{
  await page.locator('#kp-card').evaluate((n,style)=>{n.querySelector('#paint-oracle-negative-control')?.remove();if(style===null)n.removeAttribute('style');else n.setAttribute('style',style);},oldStyle);
  await resting(page);
 }
}
try{
for(const width of [320,390]) for(const lang of ['bi','ja']) for(const bottom of [0,34]) for(const action of ['remove','grade']){
 const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce',serviceWorkers:'block'});try{
  await context.addInitScript(({seed})=>{localStorage.setItem('bunki-cloze:n1',JSON.stringify(seed));localStorage.setItem('kairo-theme','hokusai');localStorage.setItem('bunki-cloze:prefs:v3:n1',JSON.stringify({look:'world',ruleSeen:true,sittings:3,newPerDay:15,mode:'read',zoom:'full'}));},{seed});
  const page=await context.newPage(); const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{bottom}});await cdp.send('DOM.enable');await cdp.send('CSS.enable');await page.goto(host.origin+'/index.html?deck=n1&ui='+lang);await page.locator('#kp-start').click();await resting(page);assert.equal(await page.locator('#kp-card').getAttribute('data-card'),first.id);
  for(const point of ['centre','top-left','top-right','bottom-left','bottom-right']){
  if(action==='grade'){if(await page.locator('#kp-reveal').count()){await page.locator('#kp-reveal').click();await resting(page);}await page.locator('#kp-grade-good').click();}else await page.locator('#kp-delete').click();await resting(page);assert.equal(await page.locator('#kp-card').getAttribute('data-card'),second.id);
  const g=await page.evaluate(geometry);if(point==='centre')await page.screenshot({path:OUT+`/long-n1-${width}-${lang}-${bottom}-${action}.png`});const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('bunki-cloze:n1')));
  const paint=await paintedBand(page,g,width);
  if(width===320&&lang==='bi'&&bottom===0&&action==='remove'&&point==='centre')results.paintNegativeControl.push(await overpaintNegativeControl(page,g,width));
  await page.locator('#kp-undo').evaluate(n=>n.addEventListener('click',e=>window.__undoTrusted=e.isTrusted,{once:true,capture:true}));const {root:doc}=await cdp.send('DOM.getDocument',{depth:0}),{nodeId}=await cdp.send('DOM.querySelector',{nodeId:doc.nodeId,selector:'#kp-undo'}),{fonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});const p=g.points.find(p=>p.name===point);await page.mouse.click(p.x,p.y);await resting(page);const after=await page.evaluate(()=>({ledger:JSON.parse(localStorage.getItem('bunki-cloze:n1')),card:document.querySelector('#kp-card').dataset.card,trusted:window.__undoTrusted}));const restored=JSON.stringify(after.ledger)===JSON.stringify(seed)&&after.card===first.id&&after.trusted===true;
  results.undo.push({width,lang,bottom,action,point,fonts,geometry:g,paint,changedLedger:JSON.stringify(before)!==JSON.stringify(seed),restored});console.log('UNDO',width,lang,bottom,action,point,JSON.stringify({targetBottom:g.target.bottom,undoTop:g.undo.top,clear:g.clearTarget,gap:g.gap,safe:g.safeArea,background:g.background,overlappingInk:g.overlappingInk.length,owned:g.points.filter(p=>p.owns).length,restored}));
  }
 }finally{await context.close();}
}
for(const lang of ['bi','ja']){
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});try{
  await context.addInitScript(()=>localStorage.setItem('bunki-cloze:prefs:v3:kotoba-mcd',JSON.stringify({look:'world',ruleSeen:true,sittings:3,zoom:'full'})));
  const page=await context.newPage();await page.goto(host.origin+'/index.html?deck=mcd&ui='+lang);await page.locator('#kp-start').click();await page.locator('#kp-reveal').click();await resting(page);await page.locator('.kp-f-gloss > summary').click();await resting(page);
  await page.evaluate(()=>{window.__foldSamples=[];window.__gradeTrusted=false;document.querySelector('#kp-grade-good').addEventListener('click',e=>window.__gradeTrusted=e.isTrusted,{once:true,capture:true});const sample=(at)=>{const h=document.querySelector('.kp-reveal-hold,.kp-screen-hold'),f=h?.querySelector('.kp-fold[open] > :not(summary)');if(f){const s=getComputedStyle(f);window.__foldSamples.push({at,animationName:s.animationName,duration:s.animationDuration,opacity:s.opacity,heldOpacity:getComputedStyle(h).opacity,active:f.getAnimations().map(a=>({name:a.animationName,state:a.playState,frames:a.effect.getKeyframes()})),inert:h.inert,ariaHidden:h.getAttribute('aria-hidden')});}};new MutationObserver(()=>{if(document.querySelector('.kp-reveal-hold,.kp-screen-hold')){sample('mutation');requestAnimationFrame(()=>{sample('raf1');requestAnimationFrame(()=>sample('raf2'));});}}).observe(document.querySelector('.kp'),{childList:true});});
  await page.locator('#kp-grade-good').click();await page.waitForTimeout(150);const r=await page.evaluate(()=>({samples:window.__foldSamples,trusted:window.__gradeTrusted,remainingHolds:document.querySelectorAll('.kp-reveal-hold,.kp-screen-hold').length,grades:JSON.parse(localStorage.getItem('bunki-cloze:kotoba-mcd')).log.length}));results.fold.push({lang,...r});console.log('FOLD',lang,JSON.stringify(r));
 }finally{await context.close();}
}
for(const lang of ['bi','ja']) for(const bottom of [0,34]){
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});try{
  await context.addInitScript(()=>localStorage.setItem('bunki-cloze:prefs:v3:kotoba-mcd',JSON.stringify({look:'world',ruleSeen:true,sittings:3,zoom:'full'})));
  const page=await context.newPage(); const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{bottom}});
  await page.goto(host.origin+'/index.html?deck=mcd&ui='+lang);await page.locator('#kp-start').click();await page.locator('#kp-reveal').click();await page.locator('#kp-card .kp-sentence .kp-tok').first().waitFor({timeout:15000});await resting(page);
  // the word nearest the dock that the finger can still own: the slip has the least room under it there
  const pick=await page.evaluate(()=>{const dock=document.querySelector('.kp-grades').getBoundingClientRect();let best=null;for(const t of document.querySelectorAll('#kp-card .kp-tok:not(.kp-target)')){const r=t.getClientRects()[0];if(!r||!r.width||r.bottom>dock.top-4||r.top<80)continue;const x=(r.left+r.right)/2,y=(r.top+r.bottom)/2;const hit=document.elementFromPoint(x,y);if(!hit||!t.contains(hit))continue;if(!best||r.bottom>best.bottom)best={x,y,top:r.top,bottom:r.bottom,text:t.textContent};}return best;});
  assert(pick,'a tappable word above the dock');
  await page.mouse.click(pick.x,pick.y);await page.locator('#mini[data-from="deck"]').waitFor({timeout:5000});await resting(page);
  const g=await page.evaluate(()=>{const rect=n=>{const r=n.getBoundingClientRect();return{top:r.top,bottom:r.bottom,left:r.left,right:r.right}};const m=document.getElementById('mini'),d=document.querySelector('.kp-grades'),u=document.getElementById('kp-undo');const mr=rect(m),dr=rect(d);const own=document.elementFromPoint((dr.left+dr.right)/2,(dr.top+dr.bottom)/2);return{mini:mr,dock:dr,dockFixed:getComputedStyle(d).position,undo:u?rect(u):null,dockOwnsCentre:!!own&&d.contains(own),overflow:document.documentElement.scrollWidth-innerWidth}});
  await page.screenshot({path:OUT+`/slip-over-dock-${lang}-${bottom}.png`});
  results.slip.push({lang,bottom,pick,geometry:g});console.log('SLIP',lang,bottom,JSON.stringify({word:pick.text,wordBottom:pick.bottom,miniBottom:g.mini.bottom,dockTop:g.dock.top}));
 }finally{await context.close();}
}
}
finally{await browser.close();await host.close();writeFileSync(OUT+'/proof.json',JSON.stringify(results,null,2)+'\n');}

// a colour mixed from the world's pigments (color-mix) computes to CSS Color 4's color(srgb r g b): opaque unless it carries
// an alpha under 1, as rgb() is
const opaque=colour=>/^rgb\(/u.test(colour)||/^rgba\([^,]+,[^,]+,[^,]+,\s*1\)$/u.test(colour)||/^color\(srgb(?: [-\d.e]+){3}(?: \/ 1)?\)$/u.test(colour);
const failures=[];
const check=(name,passed,detail)=>{if(!passed)failures.push({name,detail});};
check('all long front native point cases executed',results.undo.length===80,results.undo.length);
for(const r of results.undo){
 const g=r.geometry, name=`${r.width}/${r.lang}/${r.bottom}/${r.action}/${r.point}`;
 check(name+' marked word clears whole dock',g.clearTarget,{target:g.target,undo:g.undo});
 check(name+' Undo paints over every card text rectangle it intersects',g.overlappingInk.every(i=>i.owns),g.overlappingInk.filter(i=>!i.owns));
 check(name+' settled painted band is stable across repeated captures',r.paint.baselineRepeatEqual,r.paint);
 check(name+' no actual card ink survives over Undo',r.paint.cardInkOccluded,r.paint);
 check(name+' card-hidden control preserves geometry, ledger, and restored paint',r.paint.cardOutsideUndo&&r.paint.visibleDescendants===0&&r.paint.unchangedGeometry&&r.paint.ledgerUnchanged&&r.paint.restoredEqual,r.paint);
 check(name+' opaque full-width Undo band',opaque(g.background)&&opaque(g.band.background)&&g.band.content!=='none'&&g.undo.left+parseFloat(g.band.left)<=.1&&g.undo.right-parseFloat(g.band.right)>=r.width-.1,g.band);
 // The app opens its decks in the focus room (John, 2026-10-13: "Simply tapping the right of the screen
 // should show back of card. No need for 'reveal answer' button"): Reveal is the right half of the
 // screen, not a slab above the tabs, and Undo stands alone at the foot.
 check(name+' safe area counted once: Undo stands 10px off the viewport bottom plus the inset exactly once',g.hasPrimaryTabs&&g.safeArea===r.bottom+'px'&&Math.abs(844-g.undo.bottom-(10+r.bottom))<.1,{safeArea:g.safeArea,undoFromBottom:844-g.undo.bottom,inset:r.bottom,navClearance:g.navClearance});
 check(name+' Reveal is the right half of the screen from below the session bar to the viewport bottom, at every inset',g.revealFromBottom===0&&Math.abs(g.reveal.left-r.width/2)<.5&&Math.abs(g.reveal.right-r.width)<.5&&g.reveal.top>=60,{reveal:g.reveal,revealFromBottom:g.revealFromBottom,inset:r.bottom});
 check(name+' actual 44-square point owns Undo',g.undo.width>=44&&g.undo.height>=44&&g.points.every(p=>p.owns),g.points);
 check(name+' trusted Undo restores last real card and exact ledger',r.changedLedger&&r.restored,{changed:r.changedLedger,restored:r.restored});
 check(name+' only bundled Undo glyphs',r.fonts.length>0&&r.fonts.every(f=>f.isCustomFont),r.fonts);
 check(name+' no horizontal overflow',g.overflow===0,g.overflow);
}
check('one bounded actual pointer-events-none overpaint negative control executed',results.paintNegativeControl.length===1,results.paintNegativeControl.length);
for(const r of results.paintNegativeControl){
 check('paint oracle rejects actual overpaint while native Undo hit points still pass',r.geometry.points.every(p=>p.owns)&&r.paint.baselineRepeatEqual&&!r.paint.cardInkOccluded&&r.paint.restoredEqual&&r.paint.cardOutsideUndo&&r.paint.visibleDescendants===0&&r.paint.unchangedGeometry&&r.paint.ledgerUnchanged,r);
}
check('both actual reduced-motion open-fold grades executed',results.fold.length===2,results.fold.length);
check('all four slip-over-dock cases executed',results.slip.length===4,results.slip.length);
for(const r of results.slip){
 const g=r.geometry,name=`${r.lang}/${r.bottom} slip on ${r.pick.text}`;
 // the one-hand pass (slice B): the app's slip beside a word in the lower third sits above the fixed grade dock,
 // never over it, never over its word, inside the screen; the dock still owns its centre
 check(name+' never covers the grade dock',g.dockFixed==='fixed'&&g.mini.bottom<=g.dock.top+.5&&g.dockOwnsCentre,{mini:g.mini,dock:g.dock,fixed:g.dockFixed,owns:g.dockOwnsCentre});
 check(name+' never covers its own word',g.mini.bottom<=r.pick.top+.5||g.mini.top>=r.pick.bottom-.5,{mini:g.mini,word:r.pick});
 check(name+' sits inside the screen with no horizontal overflow',g.mini.top>=0&&g.mini.left>=0&&g.mini.right<=390.5&&g.overflow===0,{mini:g.mini,overflow:g.overflow});
}
for(const r of results.fold){
 check(r.lang+' trusted grade persists once and held frame retires',r.trusted&&r.grades===1&&r.remainingHolds===0,r);
 check(r.lang+' outgoing open fold never replays or blinks',r.samples.length>=3&&r.samples.every(s=>s.animationName==='none'&&s.opacity==='1'&&s.active.length===0&&s.inert&&s.ariaHidden==='true'),r.samples);
}
results.failures=failures;results.status=failures.length?'failed':'passed';
writeFileSync(OUT+'/proof.json',JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify({status:results.status,identity,cases:results.undo.length,folds:results.fold.length,failures}));
if(failures.length)process.exitCode=1;
