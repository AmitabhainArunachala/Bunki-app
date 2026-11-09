/** Actual ordinary Corridor route and canonical mounted controller; isolated QA only. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join,extname} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {verifyBundledArtifact} from '../prototypes/bunki-desktop/lib/artifact.cjs';
import {fileURLToPath} from 'node:url';
import * as presentation from '../prototypes/corridor/shared-study-presentation.mjs';
const {test}=await import(process.env.VITEST==='true'&&!process.env.NODE_TEST_CONTEXT?'vitest':'node:test');
const repo=process.env.BUNKI_R4_SOURCE_REPO||resolve(fileURLToPath(new URL('..',import.meta.url)));
const candidate=process.env.BUNKI_R4_CANDIDATE||repo;
const output=process.env.BUNKI_R4_EVIDENCE||join(homedir(),'.dharma/bunki/r4-viewport');
const owned=new Set(['shared-study-presentation.mjs','decks/player/shared-frame.mjs','decks/player/shared-mount.mjs']);
const qaOnly=new Set(['study-engine-adapter.mjs','shared-study-runtime.mjs','shared-study-audio-preparation.mjs','shared-study-test-host.mjs','shared-study-test-bootstrap.mjs','shared-study-sync.mjs']);

test('viewport observer follows a settled new card only and disposes pending callbacks',()=>{
 const bind=presentation.bindSharedStudyViewport;assert.equal(typeof bind,'function');
 const frames=new Map();let sequence=0,observe,disconnects=0,calls=0;
 const win={MutationObserver:class{constructor(fn){observe=fn;}observe(){}disconnect(){disconnects++;}},requestAnimationFrame(fn){const id=++sequence;frames.set(id,fn);return id;},cancelAnimationFrame(id){frames.delete(id);}};
 const root={isConnected:true,ownerDocument:{defaultView:win}};
 let state={screen:'today',busy:false,current:null};const app={read:()=>state};
 const dispose=bind({app,root,onCardStart:()=>calls++});
 const flush=()=>{for(let i=0;i<4&&frames.size;i++){const list=[...frames.values()];frames.clear();list.forEach(fn=>fn());}};
 const first={entry:{taskKey:'one'},revealed:false};state={screen:'study',busy:false,current:first};observe();flush();assert.equal(calls,1);
 observe();flush();assert.equal(calls,1,'same card DOM/status rerenders do not reset reading');
 first.revealed=true;observe();flush();assert.equal(calls,1,'Reveal and in-card disclosure do not reset');
 state.busy=true;observe();flush();state.busy=false;observe();flush();assert.equal(calls,1,'failed action leaves same current card');
 state.current={entry:{taskKey:'two'},revealed:false};observe();state.busy=true;flush();assert.equal(calls,1,'busy intermediate layout must not scroll');
 state.busy=false;observe();flush();assert.equal(calls,2);
 state.current={entry:{taskKey:'one'},revealed:true};observe();flush();assert.equal(calls,3,'Undo restoring a distinct current resets its prompt');
 state.current={entry:{taskKey:'three'},revealed:false};observe();dispose();flush();assert.equal(calls,3);assert.equal(disconnects,1);
});

test('older or custom frame port without optional scroll callback remains usable',()=>{for(const onCardStart of [undefined,null,{}]){const dispose=presentation.bindSharedStudyViewport({app:{read(){throw Error('unrequested observer read');}},root:null,onCardStart});assert.equal(typeof dispose,'function');dispose();dispose();}});

test('actual ordinary n2 iframe keeps first prompt line visible after all four grades and Undo at1280/375/320',{
 skip:!process.env.BUNKI_R4_BROWSER,timeout:240000,
},async()=>{
 const {chromium}=createRequire(join(repo,'package.json'))('playwright-core');
 const site=process.env.BUNKI_R4_SITE;
 const root=site||process.env.BUNKI_R4_BASE_SITE;assert(root,'Explicit authenticated built base or fresh QA site required for browser proof');
 const baseIdentity=site?null:verifyBundledArtifact(root);
 if(!site)for(const path of ['index.html','corridor.js','modules/study-host.mjs','decks/player/mount.js','shared-study-content.mjs','shared-study-storage.mjs','shared-study-audio-preparation.mjs']){const hash=bytes=>createHash('sha256').update(bytes).digest('hex');assert.equal(hash(readFileSync(join(root,path))),hash(readFileSync(join(repo,'prototypes/corridor',path))),`Frozen non-overlay route input must match current source: ${path}`);}
 const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.m4a':'audio/mp4'};
 const server=createServer((req,res)=>{
  try{const path=decodeURIComponent(new URL(req.url,'http://fixture.invalid').pathname).replace(/^\/+/, '')||'index.html';
   const file=resolve(root,path);assert(file.startsWith(resolve(root)+'/'));
   let bytes;
   if(!site&&owned.has(path)&&existsSync(join(candidate,'prototypes/corridor',path)))bytes=readFileSync(join(candidate,'prototypes/corridor',path));
   else if(!site&&qaOnly.has(path))bytes=readFileSync(join(repo,'prototypes/corridor',path));
   else bytes=readFileSync(file);
   if(!site&&path==='index.html')bytes=Buffer.from(bytes.toString().replace('<script type="module" src="corridor.js"></script>','<script type="module" src="shared-study-test-bootstrap.mjs"></script>').replace('</head>','<meta name="bunki-shared-study-qa" content="bunki-isolated-shared-study-qa/v1"><meta name="bunki-shared-study-qa-run" content="viewport-regression"></head>'));
   res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
  }catch{res.writeHead(404);res.end('missing fixture resource');}
 });
 mkdirSync(output,{recursive:true});const receipt={kind:site?'fresh-built-ordinary-route-viewport':'authenticated-base-ordinary-router-overlay-fixture',sourceRepo:repo,candidate,site:site||null,baseArtifact:baseIdentity?{root,gitSha:baseIdentity.gitSha,artifactSha256:baseIdentity.artifactSha256}:null,viewports:[],errors:[]};let browser;
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true});receipt.browser=browser.version();
  for(const viewport of [{width:1280,height:820},{width:375,height:812},{width:320,height:568}]){
   const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),row={viewport,actions:[],injectedFaults:[]};let failureArmed=false;receipt.viewports.push(row);
   page.on('pageerror',e=>{if(failureArmed&&e.message==='Synthetic viewport failed write')row.injectedFaults.push(e.message);else receipt.errors.push(e.message);});await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
   await context.addInitScript(()=>{window.__failViewportWrite=false;for(const method of ['put','add']){const original=IDBObjectStore.prototype[method];IDBObjectStore.prototype[method]=function(...args){if(window.__failViewportWrite&&this.transaction.db.name.startsWith('bunki-shared-study-qa-'))throw new DOMException('Synthetic viewport failed write','QuotaExceededError');return original.apply(this,args);};}});
   await page.goto(origin+'/?deck=n2&ui=en',{waitUntil:'domcontentloaded'});await page.locator('[data-shared-study-frame]').waitFor({timeout:90000});
   const frame=await(await page.locator('[data-shared-study-frame]').elementHandle()).contentFrame();await frame.waitForFunction(()=>!!window.bunkiSharedStudy,null,{timeout:90000});
   assert.equal(new URL(page.url()).searchParams.has('sharedStudy'),false);assert.equal(await frame.evaluate(()=>frameElement.bunkiStudyPort.adapter.identity.learner),'test-shared-audio');
   const settle=async()=>{await frame.waitForFunction(()=>bunkiSharedStudy.app.read().screen==='study'&&!bunkiSharedStudy.app.read().busy&&!!bunkiSharedStudy.app.read().current);await page.waitForTimeout(300);};
   const firstLine=async label=>{
    assert.equal(await page.locator('#record-band:not([hidden])').count(),0,'Source/build fixture must not hide text behind a protection banner');
    const local=await frame.evaluate(()=>{
     const passage=document.querySelector('[data-passage]');if(!passage)throw Error('actual prompt passage missing');const walker=document.createTreeWalker(passage,NodeFilter.SHOW_TEXT);let node;
     while(node=walker.nextNode()){if(!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(node.textContent)||node.parentElement.closest('rt,[hidden],.visually-hidden'))continue;const range=document.createRange();range.setStart(node,0);range.setEnd(node,Math.min(node.length,1));const r=range.getBoundingClientRect();if(r.width<=0||r.height<=0)continue;const x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);return{text:node.textContent.slice(0,20),rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom},childHit:!!hit&&(hit===node.parentElement||node.parentElement.contains(hit)||hit.contains(node.parentElement)),taskKey:bunkiSharedStudy.app.read().current.entry.taskKey,ja:bunkiSharedStudy.app.read().current.entry.ja};}throw Error('first Japanese prompt character missing');
    });
    const facts=await page.evaluate(local=>{const f=document.querySelector('[data-shared-study-frame]'),r=f.getBoundingClientRect(),chrome=document.querySelector('.chrome')?.getBoundingClientRect(),x=r.left+(local.rect.left+local.rect.right)/2,y=r.top+(local.rect.top+local.rect.bottom)/2;return{...local,parentScrollY:scrollY,frameTop:r.top,top:r.top+local.rect.top,bottom:r.top+local.rect.bottom,chromeBottom:chrome?.bottom??0,parentHit:document.elementFromPoint(x,y)===f,viewportHeight:innerHeight};},local);
    row.actions.push({label,...facts});await page.screenshot({path:join(output,`${viewport.width}-${label}.png`),fullPage:false});assert.equal(await page.locator('#record-band:not([hidden])').count(),0,'No late protection banner may invalidate visible-text evidence');
    assert(facts.childHit,`${label} child first line must receive hit tests: ${JSON.stringify(facts)}`);assert(facts.parentHit,`${label} parent chrome must not intercept first line: ${JSON.stringify(facts)}`);assert(facts.top>=facts.chromeBottom&&facts.bottom<=facts.viewportHeight,`${label} first line must be visible below chrome: ${JSON.stringify(facts)}`);
   };
   await frame.locator('[data-start]:not(:disabled)').click();await settle();await firstLine('start');
   for(const rating of [1,2,3,4]){
    const before=await frame.evaluate(()=>{const p=bunkiSharedStudy.backend.readProjection();return{taskKey:bunkiSharedStudy.app.read().current.entry.taskKey,ja:bunkiSharedStudy.app.read().current.entry.ja,count:p.reviews.length};});
    await frame.locator('[data-reveal]').click();await frame.waitForFunction(()=>bunkiSharedStudy.app.read().current.revealed&&!bunkiSharedStudy.app.read().busy);
    await page.evaluate(()=>scrollTo(0,Math.min(369,document.documentElement.scrollHeight-innerHeight)));const readingScroll=await page.evaluate(()=>scrollY);
    await frame.evaluate(()=>bunkiSharedStudy.app.refreshStatus({presentation:true}));await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>scrollY),readingScroll,'same-card status does not reset parent scroll');
    // Disclosure is an intentional in-card render, not a new prompt.
    const word=frame.locator('[data-passage] [data-word]').first();if(await word.count()){await word.evaluate(n=>n.click());await page.waitForTimeout(100);const disclosureY=await page.evaluate(()=>scrollY);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>scrollY),disclosureY,'dictionary disclosure does not trigger parent reset');await frame.locator('body').press('Escape');}
    await frame.locator(`[data-grade="${rating}"]`).click();await frame.waitForFunction(n=>bunkiSharedStudy.backend.readProjection().reviews.length===n+1,before.count);await settle();
    const review=await frame.evaluate(()=>{const p=bunkiSharedStudy.backend.readProjection(),r=p.reviews.at(-1);return{review:r,outcome:p.outcomes[r.id]};});assert.equal(review.review.taskKey,before.taskKey);assert.equal(review.review.rawRating,rating);assert.equal(review.outcome.status,'applied');row.actions.push({label:`grade-${rating}-command`,review});await firstLine(`grade-${rating}`);
   }
   const last=await frame.evaluate(()=>bunkiSharedStudy.backend.readProjection().reviews.at(-1));await frame.locator('[data-undo]').click();await settle();assert.equal(await frame.evaluate(()=>bunkiSharedStudy.app.read().current.entry.taskKey),last.taskKey);assert(await frame.evaluate(id=>bunkiSharedStudy.backend.readProjection().reviews.find(r=>r.id===id).undoneAt!==null,last.id));await firstLine('undo');
   assert.equal(await frame.evaluate(()=>bunkiSharedStudy.app.read().current.revealed),true,'Undo preserves the canonical revealed answer');failureArmed=true;await page.evaluate(()=>{scrollTo(0,Math.min(200,document.documentElement.scrollHeight-innerHeight));window.__failViewportWrite=true;});const failedBefore=await page.evaluate(()=>scrollY),count=await frame.evaluate(()=>bunkiSharedStudy.backend.readProjection().reviews.length),key=await frame.evaluate(()=>bunkiSharedStudy.app.read().current.entry.taskKey);
   await frame.locator('[data-grade="3"]').evaluate(n=>n.click());await page.waitForTimeout(350);await frame.waitForFunction(()=>!bunkiSharedStudy.app.read().busy);assert.equal(await page.evaluate(()=>scrollY),failedBefore,'failed storage action must not reset reading position');assert.equal(await frame.evaluate(()=>bunkiSharedStudy.backend.readProjection().reviews.length),count);assert.equal(await frame.evaluate(()=>bunkiSharedStudy.app.read().current.entry.taskKey),key);row.actions.push({label:'failed-action-preserves-scroll',parentScrollY:failedBefore});assert.deepEqual(row.injectedFaults,['Synthetic viewport failed write'],'each deliberate failed-save negative produces exactly its named fault');failureArmed=false;await page.evaluate(()=>window.__failViewportWrite=false);
   await context.close();
  }
  assert.deepEqual(receipt.errors,[]);receipt.status='passed';
 }catch(error){receipt.status='failed';receipt.failure=error.stack;throw error;}
 finally{writeFileSync(join(output,'viewport-receipt.json'),JSON.stringify(receipt,null,2)+'\n');await browser?.close();await new Promise(r=>{server.close(r);server.closeAllConnections();});}
});
