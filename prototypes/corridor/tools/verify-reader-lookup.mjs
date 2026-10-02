/** Narrow unmodified-artifact checks for September annotation lookup changes.
 * Derived fixtures: reader-doors D2/D3; particle behavior replaces the old
 * accessibility verifier's intentional inert short-tap assumption.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');
assert(process.env.KAIRO_SITE_DIR && process.env.KAIRO_ARTIFACT_SHA256, 'Choose an existing artifact and its exact digest');
const site = resolveCorridorSite(), evidence = resolveCorridorEvidence();
const manifest = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
const engines = process.env.KAIRO_BROWSER && process.env.KAIRO_BROWSER !== 'all' ? [process.env.KAIRO_BROWSER] : ['chromium', 'webkit'];
assert(engines.every(engine => ['chromium', 'webkit'].includes(engine)));
const article=JSON.parse(readFileSync(resolve(site,'data/articles/aozora-046605.json'),'utf8'));
assert.deepEqual(article.tokens[1],{s:'谷川',b:'谷川',p:'名詞',r:'たにがわ',f:[{t:'谷川',r:'たにがわ'}],c:false});
assert.deepEqual(article.tokens[159],{s:'五六',b:'五六',p:'名詞',r:'ごろく',f:[{t:'五六',r:'ごろく'}],c:false});
assert.deepEqual(article.tokens[1284], {s:'イサド',b:'イサド',p:'名詞',r:'いさど',f:[{t:'イサド'}],c:false});
assert.deepEqual(article.tokens[89], {s:'ます',b:'ます',p:'助動詞',r:'ます',f:[{t:'ます'}],c:false});
const missing = [
  {index:159, surface:'五六', reading:'ごろく', kind:'named'},
  {index:1284, surface:'イサド', reading:'いさど', kind:'plain'},
];
const core = {...JSON.parse(readFileSync(resolve(site,'data/share_alike/words.json'),'utf8')).words,
  ...JSON.parse(readFileSync(resolve(site,'data/share_alike/dict.json'),'utf8')).words};
const rows = JSON.parse(readFileSync(resolve(site,'data/share_alike/dict-v2/index.json'),'utf8')).entries;
for (const fixture of missing) {
  assert.equal(core[fixture.surface], undefined, 'Missing fixture must not be in the quick dictionary');
  assert(!rows.some(row => row[4].includes(fixture.surface) || row[5].includes(fixture.surface)),
    'Missing fixture must not have a full-dictionary row');
}
assert.equal(article.tokens[2].s,'の');
const host=await startStaticHost({site,port:0}), results=[];
const token=(page,index)=>page.locator(`#reader .tok[data-index="${index}"]`);
async function center(locator){
  await locator.scrollIntoViewIfNeeded();
  return locator.evaluate(node=>{const box=node.getBoundingClientRect(),x=box.left+box.width/2,y=box.top+box.height/2;
    if(!node.contains(document.elementFromPoint(x,y)))throw new Error('Token centre obscured');return{x,y};});
}
async function click(page,locator){const at=await center(locator);await page.mouse.click(at.x,at.y);}
async function open(page,dials){
  await page.goto(`${host.origin}/?entry=shelf&dials=${dials}&ui=bi`);
  await page.waitForFunction(()=>document.body.dataset.ready==='1');
  await page.locator('#shelf-reading-search').fill('やまなし');
  await page.locator('#shelf-reading-search').press('Enter');
  await page.locator('#shelf-reading-results [data-passage="aozora:046605"] .shelf-open').click();
  await token(page,1).waitFor();
  assert.equal(await page.locator('.listen-row').getAttribute('data-passage'),'aozora:046605');
}
async function mini(page){return page.locator('#mini').evaluate(node=>({word:node.querySelector('.mini-word')?.textContent,
  reading:node.querySelector('.mini-reading')?.textContent||'',gloss:node.querySelector('.mini-gloss')?.textContent||'',
  role:node.getAttribute('role')}));}
try{
 for(const engine of engines){
  const browserType={chromium,webkit}[engine];
  const browser=await browserType.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
  await silenceBrowserAudio(context);
  const page=await context.newPage(),errors=[];
  page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>new URL(route.request().url()).origin===host.origin?route.continue():route.abort());
  const run=async(name,body)=>{
   try{const observations=await body();results.push({engine,name,passed:true,observations});console.log(`PASS ${engine}/${name}`);}
   catch(error){const screenshot=resolve(evidence,`${engine}-${name}.png`);await page.screenshot({path:screenshot,fullPage:true,animations:'disabled'}).catch(()=>{});
    results.push({engine,name,passed:false,error:String(error.stack||error),screenshot});console.log(`FAIL ${engine}/${name}: ${error.message}`);}
  };
  try{
   for(const dials of ['0,1,0','0,0,0','0,2,0','2,1,0']){
    await run('named-known-'+dials.replaceAll(',','-'),async()=>{
     await open(page,dials);const named=token(page,1),neighbour=await token(page,2).textContent();
     assert.equal(await named.evaluate(n=>n.tagName),'BUTTON');assert(await named.getAttribute('aria-label'));
     await click(page,named);await page.locator('#mini .mini-reading').waitFor();
     const shown=await mini(page);assert.deepEqual(shown,{word:'谷川',reading:'たにがわ',gloss:'mountain stream',role:'dialog'});
     assert.equal(await token(page,2).textContent(),neighbour);assert.equal(await page.locator('#sheet').count(),0);
     assert.equal(await named.locator('.tok-en').count(),0,'Lookup must not inject another word’s inline gloss');
     for(const key of ['Enter','Space']){
      await page.locator('.listen-row').click({position:{x:2,y:2}});await named.focus();await page.keyboard.press(key);
      await page.locator('#mini .mini-reading').waitFor();assert.deepEqual(await mini(page),shown);
     }
     return{dials,shown,labelAfter:await named.getAttribute('aria-label')};
    });
    for(const fixture of missing) await run(fixture.kind+'-absent-'+dials.replaceAll(',','-'),async()=>{
     await open(page,dials);const control=token(page,fixture.index);
     assert.equal(await control.evaluate(node=>node.tagName),'BUTTON');
     assert(await control.evaluate((node,kind)=>node.classList.contains(kind),fixture.kind));
     await click(page,control);await page.locator('#mini').waitFor();
     const shown=await mini(page);assert.equal(shown.word,fixture.surface);
     assert.equal(shown.reading,fixture.reading,'A retained token reading must survive lookup even when the dictionary has no entry');
     assert.equal(await page.locator('#mini-take').isDisabled(),true,'Absent meanings cannot create an empty review card');return shown;
    });
    await run('auxiliary-identity-'+dials.replaceAll(',','-'),async()=>{
     await open(page,dials);const ending=token(page,89);
     await click(page,ending);await page.locator('#mini').waitFor();
     const shown=await mini(page);
     assert.equal(shown.word,'ます');assert.equal(shown.reading,'ます');
     assert.equal(shown.gloss,'(no gloss yet)','A polite ending must not borrow 升 or 増す');
     assert.equal(await page.locator('#mini-take').isDisabled(),true);
     assert.equal(await page.locator('#mini .mini-entry').isDisabled(),true,
      'An unresolved full-entry door must not reopen the rejected dictionary row');
     assert.equal(await page.locator('#sheet').count(),0);
     return{dials,shown,saveHeld:true,unresolvedEntryHeld:true};
    });
   }
   await run('particle-tap-keyboard-and-menu',async()=>{
    await open(page,'0,1,0');const particle=token(page,2);const before=await particle.textContent();
    for(const modality of ['pointer','Enter','Space']){
     if(modality==='pointer')await click(page,particle);else{await particle.focus();await page.keyboard.press(modality);}
     await page.locator('#mini .mini-gloss').waitFor();const shown=await mini(page);
     assert.equal(shown.word,'の');assert.equal(shown.gloss,'of · belonging');assert.equal(shown.role,'dialog');
     assert.equal(await page.locator('#sheet').count(),0);assert.equal(await particle.textContent(),before);
     await page.locator('.listen-row').click({position:{x:2,y:2}});
    }
    // the grammar entry is one choice in the word menu (reader lane 2026-10-02): a right-click, then Full entry
    const at=await center(particle);await page.mouse.click(at.x,at.y,{button:'right'});
    await page.locator('#reader-word-menu').waitFor();
    const items=await page.locator('#reader-word-menu [role="menuitem"]').allTextContents();
    assert.deepEqual(items,['Save the sentence','Full entry','Ask the tutor about this sentence','Copy'],'A particle offers its menu without a word save');
    assert.equal(await page.locator('#mini').count(),0,'The menu replaces a quick look, never sits over one');
    await page.locator('#reader-word-menu [data-menu-action="entry"]').click();
    await page.locator('#sheet[data-node="particle:no"]').waitFor();
    assert.equal(await page.locator('#mini').count(),0,'Opening grammar must not leave a quick look over it');
    assert.match(await page.locator('#sheet .headword').textContent(),/^の/u);
    assert.match(await page.locator('#sheet').innerText(),/Ties two nouns/u);
    return{shortTap:'lookup',keyboard:['Enter','Space'],menu:items,entry:'particle:no'};
   });
   results.push({engine,name:'no-page-errors',passed:errors.length===0,errors});
  }finally{await context.close();await browser.close();}
 }
}finally{
 await host.close();
 const receipt={artifactSha256:manifest.artifactSha256,gitSha:manifest.gitSha,sourceDirty:manifest.sourceDirty,
  verifierSha256:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
  scope:'Known named, dictionary-absent named/plain, and auxiliary identity lookup in four dial modes; particle short tap, keyboard and the word menu full entry. No broad lexical/capture regression claim',
  instrumentation:'Unmodified staged runtime, normal DOM controls, no export shim or model calls; native audio paths run silently',results,
  passed:results.length===engines.length*18&&results.every(row=>row.passed)};
 writeFileSync(resolve(evidence,'result.json'),JSON.stringify(receipt,null,2)+'\n');
 if(!receipt.passed)process.exitCode=1;
}
