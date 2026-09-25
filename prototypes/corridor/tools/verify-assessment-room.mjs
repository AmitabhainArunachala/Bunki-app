/** Isolated real-browser UI and offline delivery checks. All questions and
 * review markers in this fixture are synthetic and never enter a public bank. */
/* global fixture */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import { buildCorridorModules } from '../../../scripts/build-reading-module.mjs';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const base = process.env.KAIRO_EVIDENCE_DIR ? resolveCorridorEvidence() : resolve(homedir(), '.dharma/bunki_assessment/2026-09-23/room');
mkdirSync(base, { recursive: true });
const evidence = mkdtempSync(resolve(base, 'run-'));
const transitionOnly = process.argv.includes('--offline-transition-only');
assert(process.argv.slice(2).every(arg => arg === '--offline-transition-only'), 'Unsupported room verification argument');
const assets = new Map();
const site = process.env.KAIRO_SITE_DIR ? resolveCorridorSite() : null;
const identity = site ? JSON.parse(readFileSync(resolve(site, 'build-identity.json'))) : null;
const modules = site ? identity.files.filter(file => file.path.startsWith('modules/')).map(file => ({
  path: file.path, bytes: readFileSync(resolve(site, file.path)),
})) : buildCorridorModules(root);
for (const module of modules) {
  assets.set(module.path, module.bytes);
  mkdirSync(dirname(resolve(evidence, module.path)), { recursive: true });
  writeFileSync(resolve(evidence, module.path), module.bytes);
}
for (const name of ['assessment-view.mjs', 'assessment-delivery.mjs', 'assessment-v2-controller.mjs', 'corridor.css'])
  assets.set(name, readFileSync(site ? resolve(site, name) : resolve(root, 'prototypes/corridor', name)));
const core = await import(pathToFileURL(resolve(evidence, 'modules/assessment-core.mjs')));
const recordCore = await import(pathToFileURL(resolve(evidence, 'modules/record-core.mjs')));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const wav = Buffer.alloc(44 + 8000);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(8000, 40);
const rights = core.unknownAssessmentRights();
const provenance = { kind: 'original-human', authorRef: 'synthetic-browser-fixture', processRef: null, sources: [] };
const makeMedia = (id, assetId) => core.createMediaVersion({ format: 'kairo-assessment-media', v: 1, id, provenance, rights,
  kind: 'audio', assetId, bytesSha256: sha(wav), mimeType: 'audio/wav', durationMs: 500,
  transcript: '回答前に表示してはいけない合成音声台本', transcriptSha256: sha('回答前に表示してはいけない合成音声台本'), speakers: ['synthetic-silence'] });
const exampleMedia = makeMedia('fixture-example', 'fixture-example-wave');
const media = makeMedia('fixture-audio', 'fixture-wave');
const nextMedia = makeMedia('fixture-next', 'fixture-next-wave');
const items = ['grammar', 'grammar', 'listening', 'listening', 'listening'].map((skill, i) => core.createItemVersion({
  format: 'kairo-assessment-item', v: 1, id: `item-${i}`, provenance, rights, skill, task: 'fixture-choice',
  prompt: `合成問題${i}。答えを選んでください。`, translatedInstruction: 'Choose one answer.',
  rationale: 'Synthetic fixture explanation.', subjects: [], passages: [], media: i === 2
    ? [core.artifactReference(exampleMedia), core.artifactReference(media)] : i === 3
      ? [core.artifactReference(media)] : i === 4 ? [core.artifactReference(nextMedia)] : [],
  response: { kind: 'selected', options: [{ id: 'a', text: '正しい選択肢' }, { id: 'b', text: '違う選択肢' }], answerOptionId: 'a' },
}));
const sections = ['grammar', 'listening'].map(skill => ({ id: skill, title: skill, skill, itemIds: items.filter(item => item.skill === skill).map(item => item.id) }));
const form = core.createFormVersion({ format: 'kairo-assessment-form', v: 1, id: 'synthetic-room-form', provenance, rights,
  title: 'Synthetic browser test', exam: { family: 'jlpt', track: 'N2' }, scope: 'short-practice', blueprintId: null,
  items, passages: [], media: [exampleMedia, media, nextMedia], sections,
  timingBlocks: sections.map(section => ({ id: section.id, sectionIds: [section.id], durationMs: 60_000,
    clock: 'elapsed-including-interruptions', authority: { kind: 'authoring-rule', ruleId: 'fixture-only' } })),
  authoring: { policyVersion: 'fixture-only', countsAre: 'authoring-rules', requirements: [] },
});
const delivery = { schema: 'kairo-assessment-bank-delivery/1', form: core.artifactReference(form),
  assets: [exampleMedia, media, nextMedia].map(row => ({ assetId: row.assetId, path: `audio/${row.assetId}.wav`, bytesSha256: row.bytesSha256, mimeType: row.mimeType })),
  units: [
    { id: 'example', kind: 'example', itemIds: ['item-2'], media: core.artifactReference(exampleMedia), printedOptions: false, stimulusPlayCount: 1 },
    { id: 'shared-audio', kind: 'question', itemIds: ['item-2', 'item-3'], media: core.artifactReference(media), printedOptions: false, stimulusPlayCount: 1 },
    { id: 'next-audio', kind: 'question', itemIds: ['item-4'], media: core.artifactReference(nextMedia), printedOptions: false, stimulusPlayCount: 1 },
  ] };
const entry = { id: form.id, level: 'N2', mode: 'short', titleJa: '合成テスト', titleEn: form.title, questionCount: 5, durationMinutes: 2,
  sourceClass: 'original-human', sourceIds: [], formPath: 'forms/fixture.json', formSha256: form.sha256,
  deliveryPath: 'delivery/fixture.json', deliverySha256: recordCore.encodeLocalJson(delivery).sha256,
  availability: { ready: true }, review: { status: 'ai-reviewed' },
  editorialAtStart: { status: 'ai-reviewed-practice', policyVersion: 'synthetic-only', decisionRevisionIds: ['fixture-no-content-approval'] } };
assets.set('data/assessment/forms/fixture.json', Buffer.from(JSON.stringify(form)));
assets.set('data/assessment/delivery/fixture.json', Buffer.from(JSON.stringify(delivery)));
for (const row of delivery.assets) assets.set(`data/assessment/${row.path}`, wav);
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Assessment room browser fixture</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/corridor.css"><main id="main"></main><script type="module">
import * as engine from '/assessment-v2-controller.mjs';
import {createAssessmentView} from '/assessment-view.mjs';
import {createAssessmentDelivery} from '/assessment-delivery.mjs';
const entry=${JSON.stringify(entry)};
const scope={accountId:'fixture',learnerId:'fixture'};
const saved=JSON.parse(localStorage.getItem('synthetic-room')||'null');
let library=saved?engine.parseAssessmentLibraryV2(saved.library,{scope}):null, elapsed=saved?.elapsed||0, busy=false, prepared=null, owner=true, delayMedia=false, delayAudioStart=false, expireOnAudioStart=false;
const startWall=saved?.startWall||Date.now();let now=startWall+elapsed;
const persist=()=>localStorage.setItem('synthetic-room',JSON.stringify({library,elapsed,startWall}));
const actions=[], heldMedia=[], heldStarts=[], nativeEvents=[], nativeElements=[];let audioElements=0, writesAfterLoss=0, playCalls=0, blockedPlayCall=null;
const NativeAudio=window.Audio;
window.Audio=function(...args){const el=new NativeAudio(...args),id=++audioElements;nativeElements.push(el);for(const kind of ['playing','ended'])el.addEventListener(kind,()=>nativeEvents.push({kind,id}));const play=el.play.bind(el);el.play=()=>{playCalls++;if(playCalls===blockedPlayCall)return Promise.reject(new DOMException('Synthetic autoplay refusal','NotAllowedError'));return play();};return el;};
const packs=createAssessmentDelivery({baseUrl:location.origin+'/'});
const current=()=>library&&engine.selectAssessmentV2(library);
const draw=()=>{document.getElementById('main').replaceChildren();room.render(document.getElementById('main'));};
const mediaErrors=[];
const host={english:()=>true,owned:()=>owner,render:draw,pending:()=>busy,notice:()=>null,library:()=>library,selection:id=>library&&engine.selectAssessmentV2(library,id||library.activeAttemptId),onMediaError:error=>mediaErrors.push(error.name+': '+error.message),
catalog:async()=>({entries:[entry],sources:[]}),
start:async(value,mode)=>{busy=true;try{prepared=await packs.prepare(value,engine.parseFormVersion);library=engine.startAssessmentV2(engine.createAssessmentLibraryV2({scope}),prepared.form,{scope,attemptId:'synthetic-attempt',mode,now,monotonicMs:elapsed,clockSessionId:'clock',editorialAtStart:entry.editorialAtStart});persist();return true;}finally{busy=false;}},
action:async action=>{if(!owner){writesAfterLoss++;return false;}actions.push(action);elapsed+=1000;if(expireOnAudioStart&&action.kind==='audio'&&action.action==='start'){elapsed+=60000;expireOnAudioStart=false;}now=startWall+elapsed;library=engine.commandAssessmentV2(library,{scope,attemptId:library.activeAttemptId,expectedRevisionId:current().attempt.revisionId,now,monotonicMs:elapsed,clockSessionId:'clock',action});persist();if(delayAudioStart&&action.kind==='audio'&&action.action==='start'){delayAudioStart=false;await new Promise(done=>heldStarts.push(done));}return true;},
mediaBytes:async(_selected,id)=>{const asset=await packs.mediaBytes(id);if(delayMedia)await new Promise(done=>heldMedia.push(done));return asset;},
mediaBlob:(_selected,id)=>packs.mediaBlob(id),delivery:()=>prepared?.delivery,remaining:()=>current()?.remainingMs||0,
leave:()=>{document.getElementById('main').textContent='Fixture shelf';},dismiss:async()=>{library={...library,activeAttemptId:null};},followup:()=>null,sensei:()=>{},undo:()=>{},received:()=>[]};
await navigator.serviceWorker.register('/fixture-sw.js');await navigator.serviceWorker.ready;
if(!navigator.serviceWorker.controller)await new Promise(done=>navigator.serviceWorker.addEventListener('controllerchange',done,{once:true}));
if(library)prepared=await packs.prepare(entry,engine.parseFormVersion);
const room=createAssessmentView(host);draw();window.fixture={host,room,entry,packs,current,draw,engine,mediaErrors,actions,nativeEvents,createAssessmentDelivery,
get audioElements(){return audioElements;},get heldCount(){return heldMedia.length;},get writesAfterLoss(){return writesAfterLoss;},
get playCalls(){return playCalls;},expireOnAudioStart:()=>{expireOnAudioStart=true;},
get nativeSources(){return nativeElements.map(el=>({scheme:el.src.split(':')[0],readyState:el.readyState}));},
get heldStartCount(){return heldStarts.length;},delayAudioStart:()=>{delayAudioStart=true;},releaseAudioStart:()=>{for(const done of heldStarts.splice(0))done();},
returnToRoom:()=>draw(),
delayMedia:()=>{delayMedia=true;},loseOwner:()=>{owner=false;room.dispose();draw();},releaseMedia:()=>{delayMedia=false;for(const done of heldMedia.splice(0))done();},
blockSecondPlay:()=>{blockedPlayCall=2;},
expire:()=>{elapsed+=60000;return host.action({kind:'tick'}).then(draw);}};
</script></html>`;
const shellPaths=['/',...assets.keys()].filter(path=>path==='/'||/\.(mjs|css)$/u.test(path)).map(path=>path.startsWith('/')?path:'/'+path);
assets.set('fixture-sw.js',Buffer.from(`self.addEventListener('install',event=>event.waitUntil(caches.open('synthetic-shell').then(cache=>cache.addAll(${JSON.stringify(shellPaths)})).then(()=>self.skipWaiting())));self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));self.addEventListener('fetch',event=>event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request))));`));
let originAvailable = true;
const server = createServer((request, response) => {
  if (!originAvailable) { response.destroy(); return; }
  const name = new URL(request.url, 'http://localhost').pathname.slice(1);
  if (!name) { response.setHeader('content-type', 'text/html'); response.end(html); return; }
  const bytes = assets.get(name);
  if (!bytes) { response.writeHead(404).end(); return; }
  response.setHeader('content-type', name.endsWith('.css') ? 'text/css' : name.endsWith('.wav') ? 'audio/wav' : name.endsWith('.json') ? 'application/json' : 'text/javascript');
  response.end(bytes);
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const checks = [];
try {
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch({ headless: true });
    try {
      const transitionContext = await browser.newContext(), transitionPage = await transitionContext.newPage();
      const transitionErrors = [], transition = { engine: name, fixtureBytesSha256: sha(wav), before: null, after: null, passed: false };
      transitionPage.on('pageerror', error => transitionErrors.push(error.message));
      try {
        await transitionPage.goto(origin); await transitionPage.waitForSelector('[data-exam-start]');
        await transitionPage.click('[data-exam-start]'); await transitionPage.click('#exam-confirm-start');
        await transitionPage.waitForSelector('#exam-next');
        await transitionPage.evaluate(async () => {
          await fixture.host.action({ kind: 'close-block', blockId: 'grammar' });
          await fixture.host.action({ kind: 'start-next-block' }); fixture.draw(); fixture.delayAudioStart();
        });
        await transitionPage.click('#exam-example-audio-play');
        // This acknowledgement comes AFTER exact bytes were read, hashed, and
        // assigned to the native audio element, but BEFORE native play().
        await transitionPage.waitForFunction(() => fixture.heldStartCount === 1);
        transition.before = await transitionPage.evaluate(async () => {
          const asset = await fixture.packs.mediaBytes('fixture-example-wave');
          const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', asset.bytes))]
            .map(value => value.toString(16).padStart(2, '0')).join('');
          return { online: navigator.onLine, playCalls: fixture.playCalls, nativeSources: fixture.nativeSources,
            bytes: asset.bytes.byteLength, sha256: digest, events: [...fixture.nativeEvents] };
        });
        assert.equal(transition.before.online, true); assert.equal(transition.before.playCalls, 0);
        assert.deepEqual(transition.before.events, []); assert.equal(transition.before.bytes, wav.length);
        assert.equal(transition.before.sha256, sha(wav)); assert.equal(transition.before.nativeSources.length, 1);
        assert(['blob', 'data'].includes(transition.before.nativeSources[0].scheme));
        originAvailable = false; await transitionContext.setOffline(true);
        await transitionPage.evaluate(() => fixture.releaseAudioStart());
        await transitionPage.waitForFunction(() => fixture.current().attempt.audio.every(row => row.status === 'ended'), null, { timeout: 10_000 });
        transition.after = await transitionPage.evaluate(() => ({ online: navigator.onLine,
          starts: fixture.current().attempt.audio.map(row => row.starts), playCalls: fixture.playCalls,
          events: [...fixture.nativeEvents], audioElements: fixture.audioElements, mediaErrors: [...fixture.mediaErrors] }));
        assert.equal(transition.after.online, false); assert.deepEqual(transition.after.starts, [1, 1, 1]);
        assert.equal(transition.after.playCalls, 3); assert.equal(transition.after.audioElements, 1);
        assert.equal(transition.after.events.filter(row => row.kind === 'playing').length, 3);
        assert.equal(transition.after.events.filter(row => row.kind === 'ended').length, 3);
        assert.deepEqual(transition.after.mediaErrors, []); assert.deepEqual(transitionErrors, []);
        transition.passed = true;
        checks.push(`${name}: actual verified audio source prepared online survives network loss before native play and three recordings end exactly once`);
      } finally {
        if (!transition.passed) transition.after = await transitionPage.evaluate(() => ({ online: navigator.onLine,
          audio: fixture.current()?.attempt.audio, playCalls: fixture.playCalls, nativeSources: fixture.nativeSources,
          events: [...fixture.nativeEvents], mediaErrors: [...fixture.mediaErrors], text: document.querySelector('main').innerText })).catch(error => ({ error: String(error) }));
        writeFileSync(resolve(evidence, `${name}-online-offline-transition.json`), JSON.stringify({ ...transition, pageErrors: transitionErrors }, null, 2));
        originAvailable = true; await transitionContext.close();
      }
      if (transitionOnly) continue;
      for (const width of [320, 1280]) {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(origin); await page.waitForSelector('[data-exam-start]');
        assert.equal(await page.locator('.exam-intro').evaluate(el => getComputedStyle(el).letterSpacing), 'normal');
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: resolve(evidence, `${name}-${width}-catalog.png`), fullPage: true });
        await page.click('[data-exam-start]'); await page.click('#exam-confirm-start');
        await page.waitForSelector('#exam-next');
        const questionA11y = await new AxeBuilder({ page }).analyze();
        writeFileSync(resolve(evidence, `${name}-${width}-question-axe.json`), JSON.stringify(questionA11y, null, 2));
        assert.deepEqual(questionA11y.violations.filter(row => ['serious', 'critical'].includes(row.impact)), []);
        await page.click('[data-exam-option="b"]'); await page.click('#exam-flag');
        await page.click('#exam-next'); await page.click('#exam-finish-block');
        assert.match(await page.locator('.exam-confirm').innerText(), /1 questions are unanswered/u);
        await page.click('#exam-confirm-finish'); await page.waitForSelector('#exam-next-block');
        assert.equal(await page.evaluate(() => fixture.current().attempt.blocks[1].elapsedMs), 0);
        await page.click('#exam-next-block');
        assert.equal(await page.locator('[data-exam-option]').count(), 0);
        assert.equal(await page.locator('.exam-prompt').count(), 0);
        assert.match(await page.locator('.exam-example-title').innerText(), /instructions and example/u);
        assert(!(await page.locator('main').innerText()).includes(media.transcript));
        await page.screenshot({ path: resolve(evidence, `${name}-${width}-example.png`), fullPage: true });
        // Playwright's WebKit network-offline emulation rejects navigation before
        // service-worker dispatch. Make the real fixture origin unavailable for
        // reload, then also disable the browser network for playback.
        originAvailable = false;
        if (name !== 'webkit') await context.setOffline(true);
        await page.reload(); await page.waitForSelector('#exam-example-audio-play');
        await context.setOffline(true);
        assert.equal(await page.locator('[data-exam-option]').count(), 0);
        assert.equal(await page.evaluate(() => fixture.current().attempt.answers[0].flagged), true);
        await page.click('#exam-example-audio-play');
        try {
        await page.waitForFunction(() => fixture.current().attempt.audio[0].status === 'ended', null, { timeout: 10_000 });
        await page.waitForSelector('.exam-prompt');
        assert.deepEqual(await page.locator('[data-exam-option]').allTextContents(), ['1', '2']);
        assert(await page.locator('.exam-question-grid [data-exam-visit="item-4"]').isDisabled());
        await page.screenshot({ path: resolve(evidence, `${name}-${width}-listening.png`), fullPage: true });
        await page.waitForFunction(() => fixture.current().attempt.audio.every(row => row.status === 'ended'), null, { timeout: 10_000 }); }
        catch (error) {
          writeFileSync(resolve(evidence, `${name}-${width}-audio-failure.json`), JSON.stringify(await page.evaluate(async () => {
            const probes = [];
            for (const cacheName of await caches.keys()) {
              const cache = await caches.open(cacheName);
              for (const request of await cache.keys()) {
                if (!request.url.endsWith('.wav')) continue;
                try {
                  const response = await cache.match(request), bytes = await response.arrayBuffer();
                  probes.push({ stage: 'cache-array-buffer', bytes: bytes.byteLength });
                  const blob = new Blob([bytes], { type: 'audio/wav' });
                  try { probes.push({ stage: 'blob-array-buffer', bytes: (await blob.arrayBuffer()).byteLength }); }
                  catch (error) { probes.push({ stage: 'blob-array-buffer', error: error.name + ': ' + error.message }); }
                } catch (error) { probes.push({ stage: 'cache-array-buffer', error: error.name + ': ' + error.message }); }
              }
            }
            return { audio: fixture.current().attempt.audio, text: document.querySelector('main').innerText, errors: fixture.mediaErrors, probes };
          }), null, 2)); throw error;
        }
        assert.deepEqual(await page.evaluate(() => fixture.current().attempt.audio.map(row => row.starts)), [1, 1, 1]);
        assert.equal(await page.evaluate(() => fixture.audioElements), 1);
        assert.equal(await page.evaluate(() => fixture.nativeEvents.filter(row => row.kind === 'ended').length), 3);
        assert.equal(await page.evaluate(() => fixture.current().attempt.cursor.itemId), 'item-4');
        assert(await page.locator('#exam-audio-play').isDisabled());
        await page.click('[data-exam-option="a"]');
        await page.evaluate(() => fixture.expire());
        assert.match(await page.locator('.exam-score').innerText(), /1 of 5 correct/u);
        const score = await page.evaluate(() => fixture.current().score);
        assert.deepEqual([score.correct, score.incorrect, score.unanswered, score.notReached], [1, 1, 2, 1]);
        assert.equal(score.officialScore, null); assert.equal(score.passPrediction, null);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: resolve(evidence, `${name}-${width}-result.png`), fullPage: true });
        const resultA11y = await new AxeBuilder({ page }).analyze();
        writeFileSync(resolve(evidence, `${name}-${width}-result-axe.json`), JSON.stringify(resultA11y, null, 2));
        assert.deepEqual(resultA11y.violations.filter(row => ['serious', 'critical'].includes(row.impact)), []);
        const offline = await page.evaluate(async () => {
          const pack = fixture.createAssessmentDelivery({baseUrl:location.origin+'/',fetchAsset:()=>{throw Error('network forbidden');}});
          const ready=await pack.prepare(fixture.entry,fixture.engine.parseFormVersion);
          return [ready.form.items.length,(await pack.mediaBytes('fixture-wave')).bytes.byteLength];
        });
        assert.deepEqual(offline, [5, wav.length]);
        assert.deepEqual(await page.evaluate(() => fixture.mediaErrors), []);
        assert.deepEqual(errors, []);
        checks.push(`${name}/${width}: responsive catalog/example/listening/results, origin-unavailable page reload, offline audio, hidden example question, fixed order, three native audio-ended events on one element, deadline counts and exact cached bytes`);
        await context.close();
        originAvailable = true;
      }
      const context = await browser.newContext(), page = await context.newPage();
      await page.goto(origin); await page.waitForFunction(() => !!window.fixture);
      const negatives = await page.evaluate(async () => {
        const f=fixture, results=[];
        for(const kind of ['quota','changed-bytes','private','changed-delivery']){
          const pack=f.createAssessmentDelivery({baseUrl:location.origin+'/',
            cacheStorage:kind==='quota'?{open:async()=>({match:async()=>null,put:async()=>{throw Error('quota');}})}:caches,
            fetchAsset:async url=>kind==='changed-bytes'&&url.endsWith('.wav')?new Response('changed') : fetch(url)});
          try{await pack.prepare(kind==='private'?{...f.entry,availability:{ready:false}}:kind==='changed-delivery'?{...f.entry,deliverySha256:'0'.repeat(64)}:f.entry,f.engine.parseFormVersion);results.push(kind+':unexpected');}
          catch{results.push(kind+':rejected');}
        } return results;
      });
      assert.deepEqual(negatives, ['quota:rejected', 'changed-bytes:rejected', 'private:rejected','changed-delivery:rejected']);
      checks.push(`${name}: quota, altered media and unadmitted pack rejected before starting`);
      const repeated = await page.evaluate(async () => {
        const steps=[], f=fixture;let quota=false;
        const pack=f.createAssessmentDelivery({baseUrl:location.origin+'/',cacheStorage:{open:async name=>{
          const cache=await caches.open(name);return {match:cache.match.bind(cache),delete:cache.delete.bind(cache),put:async(...args)=>{if(quota)throw Error('quota');return cache.put(...args);}};
        }}});
        const ready=await pack.prepare(f.entry,f.engine.parseFormVersion);
        const cache=await caches.open((await caches.keys()).find(name=>name.startsWith('kairo-assessment-public:')));
        const address=path=>new URL('data/assessment/'+path,location.origin+'/').href;
        const mediaPath=ready.delivery.assets[0].path, mediaUrl=address(mediaPath);
        await cache.delete(mediaUrl);await pack.prepare(f.entry,f.engine.parseFormVersion);
        steps.push((await cache.match(mediaUrl))?'repeat-eviction-recovered':'missing');
        for (const [label,path] of [['media',mediaPath],['form',f.entry.formPath],['delivery',f.entry.deliveryPath]]) {
          await cache.put(address(path),new Response('corrupted'));
          try { await pack.prepare(f.entry,f.engine.parseFormVersion);steps.push(label+':unexpected'); }
          catch { steps.push(label+':'+((await cache.match(address(path)))?'retained':'evicted')); }
          await pack.prepare(f.entry,f.engine.parseFormVersion);
        }
        quota=true;try {await pack.prepare(f.entry,f.engine.parseFormVersion);steps.push('quota:unexpected');}catch{steps.push('quota:rejected');}quota=false;
        await cache.delete(mediaUrl);await pack.mediaBytes(ready.delivery.assets[0].assetId);
        steps.push((await cache.match(mediaUrl))?'media-read-recovered':'missing');
        await cache.put(mediaUrl,new Response('corrupted'));
        try{await pack.mediaBytes(ready.delivery.assets[0].assetId);steps.push('media-read:unexpected');}catch{steps.push((await cache.match(mediaUrl))?'media-read:retained':'media-read:evicted');}
        await pack.mediaBytes(ready.delivery.assets[0].assetId);
        return {steps,library:f.host.library()};
      });
      assert.deepEqual(repeated,{steps:['repeat-eviction-recovered','media:evicted','form:evicted','delivery:evicted','quota:rejected','media-read-recovered','media-read:evicted'],library:null});
      checks.push(`${name}: repeat admission rechecks durable bytes, evicts corruption, rejects quota, and restores exact missing assets online before any attempt`);
      await context.close();
      const lostContext = await browser.newContext(), lostPage = await lostContext.newPage();
      await lostPage.goto(origin); await lostPage.waitForSelector('[data-exam-start]');
      await lostPage.click('[data-exam-start]'); await lostPage.click('#exam-confirm-start');
      await lostPage.waitForSelector('#exam-next');
      await lostPage.evaluate(async()=>{await fixture.host.action({kind:'close-block',blockId:'grammar'});await fixture.host.action({kind:'start-next-block'});fixture.draw();fixture.delayMedia();});
      await lostPage.click('#exam-example-audio-play');await lostPage.waitForFunction(()=>fixture.heldCount===1);
      await lostPage.evaluate(()=>{fixture.loseOwner();fixture.releaseMedia();});
      await lostPage.waitForTimeout(100);
      assert.deepEqual(await lostPage.evaluate(()=>({starts:fixture.current().attempt.audio.map(row=>row.starts),writes:fixture.writesAfterLoss,played:fixture.nativeEvents.length})),{starts:[0,0,0],writes:0,played:0});
      checks.push(`${name}: late media load cannot play or write after owner loss`);
      await lostContext.close();
      for (const interruption of ['background-media', 'leave-media', 'background-ack']) {
        const pausedContext = await browser.newContext(), pausedPage = await pausedContext.newPage();
        await pausedPage.goto(origin); await pausedPage.waitForSelector('[data-exam-start]');
        await pausedPage.click('[data-exam-start]'); await pausedPage.click('#exam-confirm-start');
        await pausedPage.waitForSelector('#exam-next');
        await pausedPage.evaluate(async kind=>{
          await fixture.host.action({kind:'close-block',blockId:'grammar'});
          await fixture.host.action({kind:'start-next-block'});fixture.draw();
          if(kind==='background-ack')fixture.delayAudioStart();else fixture.delayMedia();
        },interruption);
        await pausedPage.click('#exam-example-audio-play');
        await pausedPage.waitForFunction(kind=>kind==='background-ack'?fixture.heldStartCount===1:fixture.heldCount===1,interruption);
        await pausedPage.evaluate(async kind=>{
          if(kind==='leave-media')await fixture.room.suspend();else await fixture.room.interrupt();
          if(kind==='background-ack')fixture.releaseAudioStart();else fixture.releaseMedia();
          fixture.draw();
        },interruption);
        await pausedPage.waitForTimeout(100);
        assert.equal(await pausedPage.evaluate(()=>fixture.playCalls),0,`${interruption} must cancel pending native playback`);
        assert.equal(await pausedPage.evaluate(()=>fixture.nativeEvents.length),0);
        if(interruption==='background-media')
          assert.deepEqual(await pausedPage.evaluate(()=>fixture.current().attempt.audio.map(row=>row.starts)),[0,0,0]);
        await pausedPage.click('#exam-example-audio-play');
        await pausedPage.waitForFunction(()=>fixture.current().attempt.audio.every(row=>row.status==='ended'));
        assert.deepEqual(await pausedPage.evaluate(()=>fixture.current().attempt.audio.map(row=>row.starts)),[1,1,1]);
        assert.equal(await pausedPage.evaluate(()=>fixture.nativeEvents.filter(row=>row.kind==='ended').length),3);
        assert.equal(await pausedPage.evaluate(()=>fixture.audioElements),1);
        checks.push(`${name}: ${interruption} cancels pending playback and explicit resume completes each recording once`);
        await pausedContext.close();
      }
      const playingContext = await browser.newContext(), playingPage = await playingContext.newPage();
      await playingPage.goto(origin); await playingPage.waitForSelector('[data-exam-start]');
      await playingPage.click('[data-exam-start]'); await playingPage.click('#exam-confirm-start');
      await playingPage.waitForSelector('#exam-next');
      await playingPage.evaluate(async()=>{await fixture.host.action({kind:'close-block',blockId:'grammar'});await fixture.host.action({kind:'start-next-block'});fixture.draw();});
      await playingPage.click('#exam-example-audio-play');
      await playingPage.waitForFunction(()=>fixture.nativeEvents.some(row=>row.kind==='playing'));
      await playingPage.evaluate(()=>fixture.loseOwner());
      await playingPage.waitForTimeout(650);
      assert.deepEqual(await playingPage.evaluate(()=>({starts:fixture.current().attempt.audio.map(row=>row.starts),writes:fixture.writesAfterLoss,ended:fixture.nativeEvents.filter(row=>row.kind==='ended').length})),{starts:[1,0,0],writes:0,ended:0});
      checks.push(`${name}: owner loss stops native playback and prevents advancement or late writes`);
      await playingContext.close();
      const resumedContext = await browser.newContext(), resumedPage = await resumedContext.newPage();
      await resumedPage.goto(origin); await resumedPage.waitForSelector('[data-exam-start]');
      await resumedPage.click('[data-exam-start]'); await resumedPage.click('#exam-confirm-start');
      await resumedPage.waitForSelector('#exam-next');
      await resumedPage.evaluate(async()=>{await fixture.host.action({kind:'close-block',blockId:'grammar'});await fixture.host.action({kind:'start-next-block'});fixture.draw();fixture.blockSecondPlay();});
      await resumedPage.click('#exam-example-audio-play');
      await resumedPage.waitForFunction(()=>fixture.actions.some(row=>row.kind==='interruption'&&row.reason==='audio-autoplay-blocked'));
      assert.match(await resumedPage.locator('.exam-notice').innerText(),/Resume playback/u);
      assert.equal(await resumedPage.locator('#exam-audio-play').innerText(),'Resume audio');
      assert.equal(await resumedPage.locator('#exam-audio-play').isEnabled(),true);
      assert.equal(await resumedPage.locator('[data-exam-visit="item-4"]').isDisabled(),true);
      await resumedPage.click('#exam-audio-play');
      await resumedPage.waitForFunction(()=>fixture.current().attempt.audio.every(row=>row.status==='ended'));
      assert.deepEqual(await resumedPage.evaluate(()=>fixture.current().attempt.audio.map(row=>row.starts)),[1,1,1]);
      assert.equal(await resumedPage.evaluate(()=>fixture.actions.filter(row=>row.kind==='audio'&&row.action==='start').length),4);
      assert.equal(await resumedPage.evaluate(()=>fixture.nativeEvents.filter(row=>row.kind==='ended').length),3);
      assert.equal(await resumedPage.evaluate(()=>fixture.audioElements),1);
      assert.equal(await resumedPage.evaluate(()=>fixture.current().attempt.conditions.some(row=>row==='interrupted')),true);
      assert.equal(await resumedPage.evaluate(()=>fixture.current().attempt.conditions.some(row=>row==='audio-interrupted')),true);
      assert.equal(await resumedPage.evaluate(()=>fixture.current().attempt.clock.interrupted),false);
      checks.push(`${name}: controlled autoplay refusal records interruption, keeps order and resumes actual native playback`);
      await resumedContext.close();
      const expiredContext = await browser.newContext(), expiredPage = await expiredContext.newPage();
      await expiredPage.goto(origin); await expiredPage.waitForSelector('[data-exam-start]');
      await expiredPage.click('[data-exam-start]'); await expiredPage.click('#exam-confirm-start');
      await expiredPage.waitForSelector('#exam-next');
      await expiredPage.evaluate(async()=>{await fixture.host.action({kind:'close-block',blockId:'grammar'});await fixture.host.action({kind:'start-next-block'});fixture.draw();fixture.expireOnAudioStart();});
      await expiredPage.click('#exam-example-audio-play');
      await expiredPage.waitForSelector('.exam-score');
      assert.deepEqual(await expiredPage.evaluate(()=>({status:fixture.current().attempt.status,starts:fixture.current().attempt.audio.map(row=>row.starts),playCalls:fixture.playCalls,events:fixture.nativeEvents.length})),{status:'submitted',starts:[0,0,0],playCalls:0,events:0});
      checks.push(`${name}: deadline during audio-start transaction closes the test without calling native play`);
      await expiredContext.close();
      const timingContext=await browser.newContext(),timingPage=await timingContext.newPage();
      await timingPage.goto(origin);await timingPage.waitForSelector('[data-exam-start]');
      await timingPage.click('[data-exam-start]');await timingPage.click('#exam-confirm-start');await timingPage.waitForSelector('#exam-next');
      for(const selector of ['[data-exam-option="a"]','#exam-flag','#exam-next']) {
        await timingPage.evaluate(async()=>{await fixture.host.action({kind:'interruption',reason:'fixture-background'});fixture.draw();});
        await timingPage.click(selector);
        assert.equal(await timingPage.evaluate(()=>fixture.current().attempt.clock.interrupted),false);
        assert.equal(await timingPage.evaluate(()=>fixture.actions.at(-2).kind),'resume');
      }
      assert(await timingPage.evaluate(()=>fixture.current().attempt.answers[0].elapsedMs>0));
      await timingPage.click('#exam-leave');
      assert.equal(await timingPage.locator('main').innerText(),'Fixture shelf');
      assert.equal(await timingPage.evaluate(()=>fixture.current().attempt.clock.interrupted),true);
      const beforeReturn=await timingPage.evaluate(()=>fixture.current().attempt.blocks[0].elapsedMs);
      await timingPage.evaluate(()=>fixture.returnToRoom());
      await timingPage.waitForSelector('#exam-flag');
      assert.equal(await timingPage.evaluate(()=>fixture.current().attempt.clock.interrupted),false);
      assert(await timingPage.evaluate(previous=>fixture.current().attempt.blocks[0].elapsedMs>previous,beforeReturn));
      assert.equal(await timingPage.evaluate(()=>fixture.current().attempt.conditions.includes('interrupted')),true);
      checks.push(`${name}: answer/flag/visit and same-session return resume dwell timing without resetting wall deadline or removing interruption evidence`);
      await timingContext.close();
    } finally { await browser.close(); }
  }
} finally { await new Promise(done => server.close(done)); }
writeFileSync(resolve(evidence, 'receipt.json'), JSON.stringify({ status: 'passed', site, artifactSha256: identity?.artifactSha256 || null, checks, fixture: 'synthetic-not-editorial-approval' }, null, 2));
console.log(JSON.stringify({ status: 'passed', checks: checks.length, evidence }));
