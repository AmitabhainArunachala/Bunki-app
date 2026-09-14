/** Whole-user QA: clean context, visible controls, no internal mutators or HTTP mocks.
 * node prototypes/corridor/tools/verify-experience.mjs
 * EXPERIENCE_ROOT=/other/tree/prototypes/corridor EXPERIENCE_OUT=/evidence node ...
 * EXPERIENCE_URL=http://127.0.0.1:3015/ optionally reuses a real server.
 * --require-skip / EXPERIENCE_REQUIRE_SKIP=1 makes combined SKIP coverage required.
 * Evaluation is READ ONLY: storage/DOM observations, never application interaction.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const HERE=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(process.env.EXPERIENCE_ROOT||resolve(HERE,'..'));
const OUT=resolve(process.env.EXPERIENCE_OUT||resolve(HERE,'../../../docs/build-evidence/experience'));
const REQUIRE_SKIP=process.argv.includes('--require-skip')||process.env.EXPERIENCE_REQUIRE_SKIP==='1';
mkdirSync(resolve(OUT,'screenshots'),{recursive:true});
const started=new Date().toISOString();
const runId=started.replace(/[^0-9]/g,'').slice(0,14);
const checks=[],shots=[],errors=[],requests=[],observations=[];
const result={started,root:ROOT,method:'One clean primary context; normal Playwright input only. Read-only evaluate for evidence. No state staging. No fake HTTP responses.',checks,screenshots:shots,pageErrors:errors,observations,requiredSkip:REQUIRE_SKIP};
try{result.revision=execFileSync('git',['-C',ROOT,'rev-parse','HEAD'],{encoding:'utf8'}).trim();result.dirty=execFileSync('git',['-C',ROOT,'status','--short'],{encoding:'utf8'});}catch{}
const trackedAssets=['index.html','corridor.js','corridor.css','drift-layer.js','drift-layer.css','reference-ui.js','reference-ui.css','reference-core.js','data/share_alike/reference-extra.json'];
result.assetHashes=Object.fromEntries(trackedAssets.map(f=>[f,createHash('sha256').update(readFileSync(resolve(ROOT,f))).digest('hex')]));
let server;
let base=process.env.EXPERIENCE_URL;
if(!base){const mime={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'};
server=createServer((req,res)=>{const clean=decodeURIComponent((req.url||'/').split('?')[0]);const f=resolve(ROOT,'.'+(clean==='/'?'/index.html':clean));if(!f.startsWith(ROOT+sep)||!existsSync(f)){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':mime[extname(f)]||'application/octet-stream'});res.end(readFileSync(f));});await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}/`;}
result.url=base;
const executablePath=[process.env.CHROMIUM_PATH,'/home/user/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome','/opt/pw-browsers/chromium-1194/chrome-linux/chrome','/usr/bin/chromium'].filter(Boolean).find(existsSync);
const browser=await chromium.launch({executablePath,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,acceptDownloads:true});
const page=await context.newPage();page.setDefaultTimeout(6500);
page.on('pageerror',e=>errors.push({at:new Date().toISOString(),error:String(e)}));
page.on('request',r=>{if(/anthropic|openai|generativelanguage/.test(r.url()))requests.push({url:r.url(),method:r.method()});});
page.on('dialog',async d=>{observations.push({type:'native-dialog',message:d.message()});await d.dismiss();});
let serial=0;
const sleep=ms=>page.waitForTimeout(ms);
const visible=async s=>await page.locator(s).first().isVisible().catch(()=>false);
const click=async s=>{await page.locator(s).first().click();await sleep(280);};
const role=async name=>{await page.getByRole('button',{name}).first().click();await sleep(280);};
const text=()=>page.locator('body').innerText();
const state=()=>page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('kairo-corridor-v1')||'{}');return Object.fromEntries(['taken','srs','revlog','obslog','lessonsDone','mockDone','lists','suspended'].map(k=>[k,s[k]??(k==='taken'||k.endsWith('log')?[]:{})]));});
const debt=s=>JSON.stringify({taken:s.taken,srs:s.srs,revlog:s.revlog,suspended:s.suspended});
const flush=()=>writeFileSync(resolve(OUT,'results.json'),JSON.stringify({...result,updated:new Date().toISOString()},null,2)+'\n');
function note(id,status,expected,observed,extra={}){const c={id,status,expected,observed,...extra};checks.push(c);console.log(`${status.toUpperCase()} ${id}: ${observed}`);flush();return c;}
async function check(id,expected,fn){try{const obs=await fn();note(id,'pass',expected,typeof obs==='string'?obs:'Observed expected outcome');return true;}catch(e){note(id,'fail',expected,String(e).split('\n').slice(0,8).join('\n'));return false;}}
async function shot(name,expected,observed='Captured actual visible state; visual review pending',status='recorded'){
 const file=`screenshots/${runId}-${String(++serial).padStart(2,'0')}-${name}.png`;await page.screenshot({path:resolve(OUT,file),fullPage:false});
 const info=await page.evaluate(()=>({viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,scrollY,theme:document.documentElement.dataset.theme||'hokusai',view:document.body.dataset.view||document.body.className,focus:{id:document.activeElement?.id,tag:document.activeElement?.tagName,text:document.activeElement?.textContent?.slice(0,60)}}));
 shots.push({file,name,expected,observed,status,...info});flush();return file;
}
async function segment(id,fn){try{await fn();}catch(e){note(id,'fail','Journey segment completes through actual UI',String(e));await shot(`failure-${id}`,'Usable intended segment',String(e),'failure').catch(()=>{});writeFileSync(resolve(OUT,`failure-${id}.txt`),await page.locator('body').ariaSnapshot().catch(()=>''));page.setDefaultTimeout(6500);await recoverShelf();}}
async function recoverShelf(){
 for(let i=0;i<10;i++){
  if(await visible('#stroke-page')){await page.keyboard.press('Escape');await sleep(400);continue;}
  if(await visible('.world-picker')){await page.keyboard.press('Escape');await sleep(300);continue;}
  if(await visible('.sheet')){await click('#sheet-close');await sleep(650);continue;}
  if(await visible('#search')){if(await page.locator('#search').inputValue())await page.locator('#search').fill('');return;}
  if(await visible('.nav-symbol')){await click('.nav-symbol');if(await visible('.bubble-shelf')){await click('.bubble-shelf');await sleep(600);}continue;}
  if(await page.getByRole('button',{name:'leave the session',exact:true}).isVisible().catch(()=>false)){await role('leave the session');continue;}
  if(await visible('#back')){await click('#back');continue;}break;
 }
}
async function closeSheet(){await sleep(800);await click('#sheet-close');await sleep(350);}
async function sheetHop(name){await role(name);await sleep(850);}
async function noOverflow(id){await check(id,'No horizontal document overflow',async()=>{const d=await page.evaluate(()=>({w:innerWidth,sw:document.documentElement.scrollWidth}));assert.ok(d.sw<=d.w+1,JSON.stringify(d));return JSON.stringify(d);});}
let initial,captured,afterReview,lessonBefore,mockBefore;
try{
 await page.goto(base,{waitUntil:'load'});await page.waitForSelector('#drift-layer.active',{timeout:30000});await sleep(1600);initial=await state();
 await check('E01-clean','Primary starts with zero saved, scheduled or reviewed items',()=>{assert.equal(initial.taken.length,0);assert.equal(Object.keys(initial.srs).length,0);assert.equal(initial.revlog.length,0);return 'Clean actual app, no init scripts or staged store';});
 await check('E01-closed-radoc','Closed radical explanation is absent from the accessibility tree',async()=>{assert.ok(!(await page.locator('body').ariaSnapshot()).includes('THE SHAPES A KANJI IS FILED UNDER'));});await shot('drift-clean','Fresh default landing with discoverable navigation');
 await click('.nav-symbol');await shot('drift-navigation','Expanded normal navigation reveals shelf door');
 await click('.bubble-shelf');await page.locator('.shelf-open').first().waitFor();await shot('shelf-mobile','Bilingual shelf doors and real texts are legible at 390px');
 await segment('E02-search',async()=>{
  await page.locator('#search').fill('意見');await page.locator('.search-syn .sem-row').first().waitFor();await shot('search-synonyms','Word hits plus semantic neighbors');
  await click('.search-syn .sem-row');await sleep(900);await check('E02-neighbor','Semantic-neighbor result opens full entry',async()=>{assert.ok(await visible('.sheet .headword'));return await page.locator('.sheet .headword').innerText();});await closeSheet();
  await page.locator('#search').fill('<img src=x onerror=alert(1)>');await sleep(600);await shot('search-literal-empty','Malformed-looking input is harmless literal text with honest no-results feedback');
  await check('E02-literal','Search treats markup-looking text literally',async()=>{assert.equal(await page.locator('main img').count(),0);assert.equal(await page.locator('#search').inputValue(),'<img src=x onerror=alert(1)>');return (await text()).slice(-700);});
  await page.locator('#search').fill('森林');await sleep(650);await click('main .entry-row');await sleep(850);await shot('word-entry','Correct 森林 full entry, readings, kanji and semantic/provenance content');
 });
 await segment('E03-recursive',async()=>{
  await sheetHop('森 Forest ›');await shot('kanji-mori','森 kanji detail includes readings, components and compounds');
  await sheetHop('林 component — used in 11 kanji ›');await shot('component-hayashi','A component is a traversable node, not a dead label');
  await page.getByRole('button',{name:'林 view as a kanji',exact:true}).click();await sleep(850);await shot('component-to-kanji','Containing-kanji door returns to canonical kanji detail');
  await page.locator('.sheet .compound').first().click();await sleep(850);await shot('kanji-to-compound','A compound reopens full word entry through the same sheet');
  await check('E03-browse-no-debt','Recursive browsing does not enroll or grade',async()=>{assert.equal(debt(await state()),debt(initial));});
  await closeSheet();await page.locator('#search').fill('森林');await sleep(500);await click('main .entry-row');await sleep(850);await sheetHop('森 Forest ›');
 });
 await segment('E04-writing',async()=>{
  page.setDefaultTimeout(20000);await click('#strokes-door');await page.locator('#stroke-page').waitFor();await sleep(1100);await shot('writing-dormant','Current writing room, live glyph, usable return; constitutional/control policy mismatch recorded separately');
  observations.push({type:'writing-room-governance',note:'Constitution §6 kanji+ellipsis differs from later inline operator redirects dated 2026-08-15 and 2026-08-24: visible back, world seal and corner controls. Main directs testing usability, not declaring a definitive bug from older constitution.',controls:await page.locator('#stroke-page button:visible').allTextContents()});
  const wakeStart=Date.now();const wakeBox=await page.locator('.stroke-chrome-trigger').boundingBox();await page.mouse.click(wakeBox.x+wakeBox.width/2,wakeBox.y+wakeBox.height/2);await page.locator('.stroke-chrome-trigger[aria-expanded="true"]').waitFor();observations.push({type:'writing-wake-latency',milliseconds:Date.now()-wakeStart,note:'Headless software-rendered living ink; diagnostic, not physical-device latency signoff'});await shot('writing-awake','Awake room exposes complete readings and controls');
  await click('#stroke-world-seal');await check('E04-palette-roster','Ten public palettes in constitution order',async()=>{const seals=(await page.locator('.world-picker .world-stone').allTextContents()).map(x=>x.trim());assert.deepEqual(seals,['墨','朱','柿','漆','金','藍','赤','浪','板','雷']);return seals.join(' ');});
  await page.locator('.world-picker .world-stone').nth(4).click();await sleep(600);
  const numbers=page.locator('#stroke-numbers');if(await numbers.count()){await numbers.click();}else{await page.getByRole('button',{name:/stroke numbers|筆順の番号|numbers/}).first().click();}await sleep(500);
  await shot('writing-dark-numbers','Dark world, readable glyph and working number control');
  await page.keyboard.press('Escape');await sleep(350);await page.keyboard.press('Escape');await sleep(600);
  await check('E04-return','Two Escapes return from awake room to originating 森 sheet',async()=>{assert.equal(await page.locator('.sheet .hero-glyph').innerText(),'森');assert.equal(await page.locator('#stroke-page').count(),0);});
  await shot('writing-return-context','Original kanji restored rather than generic home');page.setDefaultTimeout(6500);await closeSheet();
  await click('#theme-seal');await page.locator('.world-picker .world-stone').nth(5).click();await sleep(400);await page.locator('#search').fill('');
 });
 await segment('E05-reader-capture',async()=>{
  await click('.details-toggle');await shot('shelf-source-details','Source and difficulty detail disclosure stays distinct from mastery');
  await page.locator('.shelf-open').filter({hasText:'静かな朝'}).click();await page.locator('.reader .tok.content').first().waitFor();await sleep(900);await shot('reader-initial','Actual Japanese text, reading controls, and clear return');
  await role(/text settings/);await click('[data-dial="spacing:1"]');await click('[data-dial="furigana:2"]');await click('[data-dial="kanji:2"]');await shot('reader-settings','Independent kanji, furigana and spacing settings all accept deliberate input');await click('[data-dial="kanji:0"]');await click('[data-dial="furigana:1"]');await click('[data-dial="spacing:0"]');await role(/text settings/);
  const token=page.locator('.reader .tok.content').first();await token.click();await sleep(350);await shot('reader-reading-rung','First activation reveals reading without opening full entry');await token.click();await sleep(350);await shot('reader-gloss-rung','Second activation reveals meaning without taking over the reading');
  await token.click({delay:2500});await sleep(850);
  await check('E06-pre-capture-no-debt','Passive reading/lookups create no review debt',async()=>{assert.equal(debt(await state()),debt(initial));});
  await page.locator('#sheet-take').waitFor();const label=await page.locator('#sheet-take').getAttribute('aria-label');
  await check('E06-explicit-enrollment-label','The chosen take control explicitly says memorize, not an innocent save',()=>{assert.match(label,/memorize|覚える/);return `User explicitly chose ${label}. Current app has no separate save-only door on this sheet.`;});
  await click('#sheet-take');await sleep(600);captured=await state();await shot('reader-explicit-memorize','Chosen word is visibly marked memorizing and offers list filing');
  await check('E06-enrollment','Only explicit memorize adds one learning item; no retrieval grade is fabricated',()=>{assert.equal(captured.taken.length,1);assert.equal(captured.revlog.length,0);assert.equal(Object.keys(captured.srs).length,0);return `One explicitly memorized item: ${captured.taken[0].id}; started=${!!captured.taken[0].started}; no FSRS grade yet`;});
  await closeSheet();await page.mouse.wheel(0,350);await sleep(950);await shot('reader-resumed','Reader context and learner mark remain after entry close');await click('#back');await sleep(350);
 });
 await segment('E07-study-review',async()=>{
  await click('#tray');await shot('my-study-enrolled','My Study shows the one explicitly memorized item and review availability');
  await check('E07-study-visible','Study reflects exactly the chosen item',async()=>{assert.ok((await text()).includes(captured.taken[0].id));assert.equal(await page.locator('#review-start').isEnabled(),true);});
  await click('#list-maker-make');await check('E07-list-empty-validation','Empty list name rejected without creating a list',async()=>{assert.equal(await page.locator('#list-maker-field').getAttribute('aria-invalid'),'true');assert.deepEqual((await state()).lists,{});});
  await page.locator('#list-maker-field').fill('Evening Japanese');await page.locator('#list-maker-field').press('Enter');await sleep(350);
  await check('E07-list-create','Normal typed list creation persists an empty named list',async()=>{assert.deepEqual((await state()).lists['Evening Japanese'],[]);});
  await page.getByRole('button',{name:'rename Evening Japanese',exact:true}).click();await sleep(250);await page.getByRole('textbox',{name:'new name',exact:true}).fill('Uncommitted rename');await page.getByRole('textbox',{name:'new name',exact:true}).press('Escape');await sleep(250);await check('E07-list-cancel','Escape cancels rename without saving typed draft',async()=>{assert.equal(await page.getByRole('textbox',{name:'new name',exact:true}).count(),0);assert.ok(Object.hasOwn((await state()).lists,'Evening Japanese'));assert.ok(!Object.hasOwn((await state()).lists,'Uncommitted rename'));});
  await shot('my-study-list-created','Named list created, rename canceled safely');
  await click('#review-start');await page.locator('#declare-recalled').waitFor();await shot('review-recall','Review asks learner for honest recall before revealing the answer');
  await click('#declare-recalled');await page.locator('.grade.g-good').waitFor();await sleep(1600);await shot('review-revealed-grade','Answer and explicit grade control precede FSRS scheduling');await click('.grade.g-good');let gradeActions=1;
  for(let i=0;i<12&&!await visible('.review-summary');i++){await page.locator('#declare-recalled').waitFor();await click('#declare-recalled');await click('.grade.g-good');gradeActions++;}
  await page.locator('.review-summary').waitFor();await shot('review-summary','Explicit review produces visible completion summary');
  afterReview=await state();await check('E07-review-record','Every explicit grade produces a durable outcome; only the chosen item is scheduled',()=>{assert.equal(afterReview.revlog.length,gradeActions);assert.equal(Object.keys(afterReview.srs).length,1);return `${gradeActions} deliberate grades, including short-learning repeats, on one explicitly enrolled word`;});
  await role(/back to lists|リストへ/);await check('E07-review-trace','Return to study displays review trace',async()=>{assert.ok(await visible('.srs-trace'));return await page.locator('.srs-trace').innerText();});
  const dlPromise=page.waitForEvent('download');await click('#export-store');const dl=await dlPromise;const path=resolve(OUT,'learner-export.json');await dl.saveAs(path);const exported=JSON.parse(readFileSync(path,'utf8'));result.export={filename:dl.suggestedFilename(),file:'learner-export.json',keys:Object.keys(exported)};
  await check('E15-export','Export downloads parseable real learner envelope',()=>{assert.ok(exported&&Object.keys(exported).length);return JSON.stringify(result.export);});
  await shot('study-export-trace','Study after real export: durable trace and export control');await click('#back');
 });
 await segment('E08-lesson',async()=>{
  lessonBefore=await state();await click('#lessons-link');await shot('lesson-catalog','Lessons are separate from reference catalog and personal study');await click('.lesson-row');await page.locator('#lesson-next').waitFor();await shot('lesson-learning','Lesson teaches one word at a time');
  for(let i=0;i<12&&!await visible('.lesson-option');i++)await click('#lesson-next');await page.locator('.lesson-option').first().waitFor();await shot('lesson-quiz','Quiz requires an explicit answer');
  for(let i=0;i<12&&!await visible('#lesson-enroll-all');i++){await click('.lesson-option:not([disabled])');await click('#lesson-next');}
  await page.locator('#lesson-enroll-all').waitFor();await shot('lesson-complete-not-enrolled','Completion honestly reports practice and offers optional enrollment');
  await check('E08-no-auto-enrollment','Completing a real lesson changes practice evidence, not deck/schedule',async()=>{const s=await state();assert.equal(debt(s),debt(lessonBefore));assert.ok(Object.keys(s.lessonsDone).length>Object.keys(lessonBefore.lessonsDone).length);return `Deck=${s.taken.length}; lessons=${Object.keys(s.lessonsDone).length}; no enrollment button clicked`;});
  await role(/back to lessons|レッスン一覧/);await click('#back');
 });
 await segment('E09-mock',async()=>{
  mockBefore=await state();await click('#mock-link');await page.locator('.mock-row').first().waitFor();await shot('mock-catalog','Bundled mock papers clearly separate score evidence from scheduling');await click('.mock-row');await page.locator('[data-mock-opt]').first().waitFor();await shot('mock-question','Paper starts with unselected answer and next disabled');
  await check('E09-requires-answer','Cannot advance without choosing an answer',async()=>assert.equal(await page.locator('#mock-next').isDisabled(),true));
  await click('[data-mock-opt="0"]');await shot('mock-selected-answer','Selection is visible and still editable; no instant correctness');
  await click('#mock-next');await click('#mock-prev');await check('E09-answer-persists-back','Previous returns to original chosen answer',async()=>assert.equal(await page.locator('[data-mock-opt="0"]').getAttribute('aria-pressed'),'true'));
  for(let i=0;i<40&&!await visible('#mock-done');i++){await click('[data-mock-opt="0"]');await click('#mock-next');}
  await page.locator('#mock-done').waitFor();await shot('mock-results','Submitted paper has score, explanations and deliberate optional enrollment');
  await check('E09-no-auto-enrollment','Paper submission records score without altering deck or scheduler',async()=>{const s=await state();assert.equal(debt(s),debt(mockBefore));assert.ok(Object.keys(s.mockDone).length>Object.keys(mockBefore.mockDone).length);return `Deck remains ${s.taken.length}; completed papers ${Object.keys(s.mockDone).length}`;});await click('#mock-done');await click('#back');
 });
 await segment('E10-reference',async()=>{
  const before=await state();await click('#levels-link');await page.locator('#reference-library').waitFor();await shot('reference-overview','Reference includes complete bundled level collections independently of lessons');
  await click('[data-reference-collection="jlpt:N1"]');await shot('reference-n1','N1 vocabulary is reachable from reference even when lesson inventory differs');
  await click('#reference-page-next');await page.locator('[data-entry-id]').nth(6).click();await sleep(850);await shot('reference-detail','Canonical reference entry opens without enrollment');await closeSheet();
  await check('E10-reference-return','Detail close preserves reference page',async()=>assert.equal(await page.locator('#reference-results-count').getAttribute('data-page'),'2'));
  await page.locator('#reference-search').fill('not-a-bunki-entry-zzzzz');await shot('reference-empty','Reference empty search explains recovery');await click('#reference-empty-clear');await click('#reference-back');await click('[data-reference-collection="jlpt:N3"]');await shot('reference-n3','N3 remains independently reachable');
  await click('#reference-back');await click('#reference-tab-kanji');await click('[data-reference-collection="kanken:1級"]');await shot('reference-kentei-advanced','Advanced Kentei is an honest reference collection, not a personal-study level');
  await page.locator('[data-entry-id]').first().click();await sleep(850);await shot('advanced-reference-detail','Supplementary source entry exposes honest detail or canonical sheet without invented mastery');await closeSheet();
  await page.setViewportSize({width:320,height:844});await page.keyboard.press('Control+Home');await sleep(350);await noOverflow('E19-reference-320');await shot('reference-320','Dense reference remains readable and operable at 320px');
  await page.setViewportSize({width:1280,height:900});await noOverflow('E19-reference-1280');await shot('reference-1280','Desktop reference respects line length and hierarchy');
  await page.setViewportSize({width:390,height:844});await check('E10-browse-no-enrollment','Reference browsing changes no deck, FSRS or review record',async()=>assert.equal(debt(await state()),debt(before)));await click('#reference-back');await click('#back');
 });
 await segment('E11-additional-rooms',async()=>{
  await click('#grammar-link');await page.locator('[data-grammar]').first().waitFor();await shot('grammar-index','Grammar is reachable with useful named entries');await click('[data-grammar]');await sleep(850);await shot('grammar-entry','Grammar detail has explanation, examples and same close/back model');await closeSheet();await click('#back');
  await click('#thesaurus-link');await page.locator('.thes-block').first().waitFor();await shot('thesaurus','Semantic differences can be compared side by side');await click('#back');
  await click('#yoji-link');await page.locator('[data-yoji]').first().waitFor();await click('[data-yoji]');await sleep(850);await shot('idiom-entry','Four-character idiom has a real recursive detail door');await closeSheet();await click('#back');
  await click('#kanjidex-link');await page.locator('[data-kdx-part="木"]').click();await role('画数 by strokes');await click('[data-kdx-st="8"]');await role('部品 by its parts');await shot('shape-wood-eight','Current parts+strokes flow finds 林 without relying on stale controls');
  await check('E13-current-shape-flow','木 and eight total strokes find 林 through actual lenses',async()=>{assert.ok(await visible('[data-kdx-hit="林"]'));return 'Legacy journey omitted the by-strokes lens; selector exists there. Returned to parts for actual combined filter.';});await click('[data-kdx-hit="林"]');await sleep(850);assert.equal(await page.locator('.sheet .hero-glyph').innerText(),'林');await closeSheet();
  const skip=page.locator('.kdx-lens').filter({hasText:'SKIP'});
  if(await skip.count()){
   const s=await state();await skip.click();await page.locator('.skip-hit').first().waitFor();await shot('skip-integrated','SKIP is a normal shape-finder lens within the same journey');
   await page.locator('.skip-hit').first().click();await sleep(850);await click('#sheet-search');await page.locator('#nav-search-input').fill('1-3-8');await page.locator('.skip-code').waitFor();await sleep(350);await shot('skip-code-search','Typed SKIP code gives real candidates');
   assert.equal((await page.locator('.skip-code').innerText()).trim(),'1-3-8');await page.locator('.skip-hit').first().click();await sleep(850);await click('#sheet-back');await sleep(350);await check('E13-skip-context','SKIP detail Back retains typed code and no learning side effects',async()=>{assert.equal(await page.locator('#nav-search-input').inputValue(),'1-3-8');assert.equal(debt(await state()),debt(s));});await recoverShelf();
  }else{note('E13-skip',REQUIRE_SKIP?'fail':'skipped','SKIP integrated lens when combined build is required','Reference-only branch has no SKIP lens; optional here, mandatory with --require-skip');await click('#back');}
  await click('#kagami-link');await shot('learner-mirror','Mirror reflects honest practice/retrieval dimensions without assigning false level');await check('E14-mirror','Mirror explicitly distinguishes evidence from qualification',async()=>{assert.match(await text(),/evidence|record|記録/);return (await page.locator('main').innerText()).slice(0,1200);});await click('#back');
 });
 await segment('E16-settings',async()=>{
  await click('#theme-seal');await shot('world-picker','Exactly ten public worlds in consistent order');await page.locator('.world-picker .world-stone').nth(4).click();await sleep(450);await shot('shelf-dark','Dark world changes the whole shelf with legible controls');
  await role('日本語');await shot('shelf-japanese','Japanese-only chrome is deliberate and reversible');await role('EN');await check('E16-language-cycle','EN → 日本語 → EN preserves usable shelf',async()=>{assert.ok((await text()).includes('the bookshelf'));assert.equal(await page.getByRole('button',{name:'EN',exact:true}).getAttribute('aria-pressed'),'true');});
  await page.keyboard.press('Tab');await shot('keyboard-focus-dark','Keyboard focus remains perceivable in dark palette');await page.setViewportSize({width:1280,height:900});await shot('shelf-desktop-dark','Desktop dark shelf has coherent hierarchy');await noOverflow('E19-shelf-desktop');await page.setViewportSize({width:390,height:844});
  await page.reload({waitUntil:'load'});await sleep(1200);await check('E18-palette-reload','Chosen dark world survives reload',async()=>assert.equal(await page.locator('html').getAttribute('data-theme'),'yoru'));await recoverShelf();await click('#tray');await shot('study-reloaded','Personal evidence and cards survive normal reload');
  await check('E18-state-reload','Review, lesson, mock and chosen card persist',async()=>{const s=await state();assert.equal(s.taken.length,1);assert.equal(s.revlog.length,afterReview.revlog.length);assert.ok(Object.keys(s.lessonsDone).length);assert.ok(Object.keys(s.mockDone).length);return `1 chosen item, ${s.revlog.length} review, ${Object.keys(s.lessonsDone).length} lesson, ${Object.keys(s.mockDone).length} mock`;});await click('#back');
 });
 await segment('E17-tutor-offline',async()=>{
  await click('#ai-link');await shot('tutor-unconfigured','No key means honest setup, not a fabricated conversation');const before=await state();await click('#ai-key-save');await check('E17-empty-key','Empty tutor-key action cannot enable AI or alter learning state',async()=>{assert.equal(debt(await state()),debt(before));assert.ok(await visible('#ai-link'));assert.equal(await page.evaluate(()=>localStorage.getItem('kairo-ai-key')),null);assert.equal(requests.length,0);return 'Empty save deliberately returns to shelf; key remains absent, no provider request or fabricated response';});
  await click('#ai-link');await context.setOffline(true);await click('#ai-key-save');await click('#ai-link');await shot('tutor-offline-no-key','Offline/unconfigured tutor stays safe; no provider reliability claim');await check('E17-offline-safe','No-key offline tutor action leaves canonical state unchanged',async()=>assert.equal(debt(await state()),debt(before)));await click('#back');
  await click('#levels-link');await click('[data-reference-collection="jlpt:N3"]');await page.locator('#reference-search').fill('water');await shot('offline-reference-warm','Warm loaded reference remains usable while network is disabled');await check('E18-warm-offline','Reference search works offline from already loaded assets',async()=>assert.ok(await visible('#reference-results-count')));
  await context.setOffline(false);await click('#reference-back');await click('#back');await click('#theme-seal');await page.locator('.world-picker .world-stone').nth(5).click();await sleep(400);
  await page.setViewportSize({width:320,height:844});await noOverflow('E19-shelf-320');await shot('shelf-narrow-final','Narrow header retains 44px controls and unwrapped language labels');await check('E19-header-44','At 320px each language segment has a 44px touch height and a single line',async()=>{const dims=await page.locator('#lang button').evaluateAll(es=>es.map(e=>({text:e.textContent,h:e.getBoundingClientRect().height,whiteSpace:getComputedStyle(e).whiteSpace})));assert.ok(dims.length===2);for(const d of dims){assert.ok(d.h>=44);assert.equal(d.whiteSpace,'nowrap');}return JSON.stringify(dims);});await page.setViewportSize({width:390,height:844});await click('#back');await page.locator('#drift-layer.active').waitFor();await shot('home-return','Whole continuous journey closes at Drift with personal state retained');await check('E18-home','Return home succeeds after learning/reference/settings/offline work',async()=>assert.ok(await visible('#drift-layer.active')));
 });
 await check('E20-no-page-errors','No uncaught JavaScript errors during whole journey',()=>{assert.deepEqual(errors,[]);return 'No uncaught page exceptions';});
 result.finalState=await state();result.providerRequests=requests;
}catch(e){note('HARNESS','fail','Harness finishes and records evidence',String(e));}
finally{
 result.assetHashesAtEnd=Object.fromEntries(Object.keys(result.assetHashes).map(f=>[f,createHash('sha256').update(readFileSync(resolve(ROOT,f))).digest('hex')]));result.assetsChangedDuringRun=JSON.stringify(result.assetHashes)!==JSON.stringify(result.assetHashesAtEnd);
 note('E20-frozen-assets',result.assetsChangedDuringRun?'fail':'pass','All nine tracked runtime/data assets stay unchanged throughout signoff',result.assetsChangedDuringRun?'Runtime assets changed; this run cannot sign off a frozen build':'Nine runtime/data hashes identical before and after journey');
 result.finished=new Date().toISOString();result.summary={passed:checks.filter(x=>x.status==='pass').length,failed:checks.filter(x=>x.status==='fail').length,skipped:checks.filter(x=>x.status==='skipped').length,screenshots:shots.length};
 flush();console.log(JSON.stringify(result.summary));await browser.close();if(server)await new Promise(r=>server.close(r));
}
process.exitCode=result.summary.failed?1:0;
