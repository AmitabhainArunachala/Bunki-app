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
const results={identity,scope:'Independent real browser UI. Unchanged real N1 cards selected by valid suspended ledger in a disposable context; actual native trusted grade/remove/Undo. Safe-area values use Chromium CDP env emulation, not an iOS hardware claim.',first:{id:first.id,length:first.ja.length},second:{id:second.id,length:second.ja.length,targetOffset:second.ja.indexOf(second.form)},undo:[],fold:[]};
async function resting(page){await page.evaluate(async()=>{await document.fonts.ready;await Promise.allSettled(document.querySelector('.kp').getAnimations({subtree:true}).filter(a=>a.effect?.getComputedTiming().endTime!==Infinity).map(a=>a.finished));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});}
const geometry=()=>{const u=document.querySelector('#kp-undo'),reveal=document.querySelector('#kp-reveal'),target=document.querySelector('#kp-card .kp-target,#kp-card .kp-blank'),card=document.querySelector('#kp-card');const rect=n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,top:r.top,bottom:r.bottom,right:r.right,left:r.left}};const us=getComputedStyle(u),ps=getComputedStyle(u,'::before'),ur=rect(u),rr=rect(reveal),tr=rect(target);const p=document.createElement('div');p.style.paddingBottom='env(safe-area-inset-bottom,0px)';document.body.append(p);const safe=getComputedStyle(p).paddingBottom;p.remove();const all=[];const walk=document.createTreeWalker(card,NodeFilter.SHOW_TEXT);for(let n=walk.nextNode();n;n=walk.nextNode()){if(!n.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(n);for(const r of range.getClientRects())if(r.bottom>ur.top&&r.top<ur.bottom&&r.right>ur.left&&r.left<ur.right)all.push({text:n.textContent,top:r.top,bottom:r.bottom});}const points=[['centre',0,0],['top-left',-21,-21],['top-right',21,-21],['bottom-left',-21,21],['bottom-right',21,21]].map(([name,dx,dy])=>{const x=ur.x+ur.width/2+dx,y=ur.y+ur.height/2+dy,hit=document.elementFromPoint(x,y);return{name,x,y,owns:!!hit&&u.contains(hit),hit:hit?.tagName}});return{card:card.dataset.card,scrollY,undo:ur,reveal:rr,target:tr,gap:rr.top-ur.bottom,background:us.backgroundColor,band:{content:ps.content,background:ps.backgroundColor,top:ps.top,bottom:ps.bottom,left:ps.left,right:ps.right},overlappingInk:all,points,clearTarget:tr.bottom<=ur.top-16+1,safeArea:safe,hasPrimaryTabs:document.body.classList.contains('has-primary-tabs'),navClearance:getComputedStyle(document.querySelector('.kp')).getPropertyValue('--nav-clearance'),overflow:document.documentElement.scrollWidth-innerWidth};};
try{
for(const width of [320,390]) for(const lang of ['bi','ja']) for(const bottom of [0,34]) for(const action of ['remove','grade']){
 const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce',serviceWorkers:'block'});try{
  await context.addInitScript(({seed})=>{localStorage.setItem('bunki-cloze:n1',JSON.stringify(seed));localStorage.setItem('kairo-theme','hokusai');localStorage.setItem('bunki-cloze:prefs:v3:n1',JSON.stringify({look:'world',ruleSeen:true,sittings:3,newPerDay:15,mode:'read',zoom:'full'}));},{seed});
  const page=await context.newPage(); const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{bottom}});await cdp.send('DOM.enable');await cdp.send('CSS.enable');await page.goto(host.origin+'/index.html?deck=n1&ui='+lang);await page.locator('#kp-start').click();await resting(page);assert.equal(await page.locator('#kp-card').getAttribute('data-card'),first.id);
  for(const point of ['centre','top-left','top-right','bottom-left','bottom-right']){
  if(action==='grade'){if(await page.locator('#kp-reveal').count()){await page.locator('#kp-reveal').click();await resting(page);}await page.locator('#kp-grade-good').click();}else await page.locator('#kp-delete').click();await resting(page);assert.equal(await page.locator('#kp-card').getAttribute('data-card'),second.id);
  const g=await page.evaluate(geometry);if(point==='centre')await page.screenshot({path:OUT+`/long-n1-${width}-${lang}-${bottom}-${action}.png`});const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('bunki-cloze:n1')));
  await page.locator('#kp-undo').evaluate(n=>n.addEventListener('click',e=>window.__undoTrusted=e.isTrusted,{once:true,capture:true}));const {root:doc}=await cdp.send('DOM.getDocument',{depth:0}),{nodeId}=await cdp.send('DOM.querySelector',{nodeId:doc.nodeId,selector:'#kp-undo'}),{fonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});const p=g.points.find(p=>p.name===point);await page.mouse.click(p.x,p.y);await resting(page);const after=await page.evaluate(()=>({ledger:JSON.parse(localStorage.getItem('bunki-cloze:n1')),card:document.querySelector('#kp-card').dataset.card,trusted:window.__undoTrusted}));const restored=JSON.stringify(after.ledger)===JSON.stringify(seed)&&after.card===first.id&&after.trusted===true;
  results.undo.push({width,lang,bottom,action,point,fonts,geometry:g,changedLedger:JSON.stringify(before)!==JSON.stringify(seed),restored});console.log('UNDO',width,lang,bottom,action,point,JSON.stringify({targetBottom:g.target.bottom,undoTop:g.undo.top,clear:g.clearTarget,gap:g.gap,safe:g.safeArea,background:g.background,overlappingInk:g.overlappingInk.length,owned:g.points.filter(p=>p.owns).length,restored}));
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
}
finally{await browser.close();await host.close();writeFileSync(OUT+'/proof.json',JSON.stringify(results,null,2)+'\n');}

const opaque=colour=>/^rgb\(/u.test(colour)||/^rgba\([^,]+,[^,]+,[^,]+,\s*1\)$/u.test(colour);
const failures=[];
const check=(name,passed,detail)=>{if(!passed)failures.push({name,detail});};
check('all long front native point cases executed',results.undo.length===80,results.undo.length);
for(const r of results.undo){
 const g=r.geometry, name=`${r.width}/${r.lang}/${r.bottom}/${r.action}/${r.point}`;
 check(name+' marked word clears whole dock',g.clearTarget,{target:g.target,undo:g.undo});
 check(name+' opaque full-width Undo band',opaque(g.background)&&opaque(g.band.background)&&g.band.content!=='none'&&g.undo.left+parseFloat(g.band.left)<=.1&&g.undo.right-parseFloat(g.band.right)>=r.width-.1,g.band);
 check(name+' safe area counted once',g.hasPrimaryTabs&&g.safeArea===r.bottom+'px'&&Math.abs(g.gap-16)<.1,{safeArea:g.safeArea,gap:g.gap,navClearance:g.navClearance});
 check(name+' actual 44-square point owns Undo',g.undo.width>=44&&g.undo.height>=44&&g.points.every(p=>p.owns),g.points);
 check(name+' trusted Undo restores last real card and exact ledger',r.changedLedger&&r.restored,{changed:r.changedLedger,restored:r.restored});
 check(name+' only bundled Undo glyphs',r.fonts.length>0&&r.fonts.every(f=>f.isCustomFont),r.fonts);
 check(name+' no horizontal overflow',g.overflow===0,g.overflow);
}
check('both actual reduced-motion open-fold grades executed',results.fold.length===2,results.fold.length);
for(const r of results.fold){
 check(r.lang+' trusted grade persists once and held frame retires',r.trusted&&r.grades===1&&r.remainingHolds===0,r);
 check(r.lang+' outgoing open fold never replays or blinks',r.samples.length>=3&&r.samples.every(s=>s.animationName==='none'&&s.opacity==='1'&&s.active.length===0&&s.inert&&s.ariaHidden==='true'),r.samples);
}
results.failures=failures;results.status=failures.length?'failed':'passed';
writeFileSync(OUT+'/proof.json',JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify({status:results.status,identity,cases:results.undo.length,folds:results.fold.length,failures}));
if(failures.length)process.exitCode=1;
