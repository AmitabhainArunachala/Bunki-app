/** Synthetic browser mechanics only; no bank admission or media review authority. */
/* global fixture, window, document, navigator, innerWidth, getComputedStyle */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const stagedSource = process.env.KAIRO_QUESTION_STAGED_SOURCE === '1';
const caseSelection = process.env.KAIRO_QUESTION_VIEW_CASES || 'all';
assert(['all', 'offline'].includes(caseSelection), 'Unknown question-view case selection');
const evidence = mkdtempSync(resolve(resolveCorridorEvidence(), 'question-view-'));
const site = resolveCorridorSite(), identity = JSON.parse(readFileSync(resolve(site, 'build-identity.json')));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const verifierSha256 = sha(readFileSync(fileURLToPath(import.meta.url)));
const assets = new Map(), sourcePins = [];
for (const row of identity.files.filter(row => row.path.startsWith('modules/') || row.path === 'corridor.css')) {
  const bytes = readFileSync(resolve(site, row.path)); assert.equal(sha(bytes), row.sha256);
  assets.set(row.path, bytes); mkdirSync(dirname(resolve(evidence, row.path)), { recursive: true });
  writeFileSync(resolve(evidence, row.path), bytes);
}
// Release checks use only the selected immutable artifact. Interim development
// can explicitly stage new source beside an older core, with separate hashes.
for (const name of ['assessment-question-practice.mjs', 'assessment-question-view.mjs', 'corridor.css']) {
  const bytes = readFileSync(stagedSource ? resolve(root, 'prototypes/corridor', name) : resolve(site, name));
  if (!stagedSource) assert.equal(sha(bytes), identity.files.find(row => row.path === name)?.sha256);
  assets.set(name, bytes); writeFileSync(resolve(evidence, name), bytes);
  sourcePins.push({ path: name, sha256: sha(bytes), provenance: stagedSource ? 'staged-source-snapshot' : 'selected-immutable-artifact' });
}
const core = await import(pathToFileURL(resolve(evidence, 'modules/assessment-core.mjs')));
const api = await import(pathToFileURL(resolve(evidence, 'assessment-question-practice.mjs')));
const rights = Object.fromEntries(Object.keys(core.unknownAssessmentRights()).map(operation =>
  [operation, { status: 'allowed', basisRef: 'synthetic-browser-fixture', policyVersion: 'fixture/1' }]));
const provenance = { kind: 'original-human', authorRef: 'synthetic-browser-fixture', processRef: null, sources: [] };
const editorialAtStart = { status: 'ai-reviewed-practice', policyVersion: 'synthetic-only', decisionRevisionIds: ['not-content-approval'] };
const at = '2026-09-23T00:00:00.000Z';
const ref = (value, kind) => ({ kind, id: value.id, revisionId: value.revisionId, sha256: value.sha256 });
const passage = core.createPassageVersion({ format: 'kairo-assessment-passage', v: 1, id: 'fixture-passage', provenance, rights,
  title: '合成資料', text: '図書館は月曜が休みで、火曜は開いています。', textSha256: sha('図書館は月曜が休みで、火曜は開いています。'),
  language: 'ja', locationUnit: 'utf16-code-unit' });
function tone(frequency, durationMs) {
  const samples = Math.round(8000 * durationMs / 1000), bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) bytes.writeInt16LE(Math.round(Math.sin(index * frequency * Math.PI / 4000) * 1600), 44 + index * 2);
  return bytes;
}
const media = [350, 600].map((durationMs, index) => {
  const bytes = tone(330 + index * 220, durationMs), assetId = `fixture-sound-${index}`;
  assets.set(`audio/${assetId}.wav`, bytes);
  return core.createMediaVersion({ format: 'kairo-assessment-media', v: 1, id: assetId, provenance, rights, kind: 'audio', assetId,
    bytesSha256: sha(bytes), mimeType: 'audio/wav', durationMs, transcript: `SECRET_TRANSCRIPT_${index}`,
    transcriptSha256: sha(`SECRET_TRANSCRIPT_${index}`), speakers: ['synthetic-tone'] });
});
function makeItem(overrides = {}) {
  return core.createItemVersion({ format: 'kairo-assessment-item', v: 1, id: 'fixture-question', provenance, rights,
    skill: 'reading', task: 'short-reading', prompt: '図書館が開いているのはいつですか。', translatedInstruction: null,
    rationale: 'SECRET_RATIONALE: 本文に火曜は開いていると書いてある。', subjects: [], passages: [ref(passage, 'passage')], media: [],
    response: { kind: 'selected', options: [{ id: 'a', text: '月曜' }, { id: 'b', text: '火曜' }], answerOptionId: 'b' }, ...overrides });
}
function makeForm(item, media = []) {
  return core.createFormVersion({ format: 'kairo-assessment-form', v: 1, id: 'fixture-question-form', provenance, rights,
    title: 'Synthetic question review', exam: { family: 'jlpt', track: 'N2' }, scope: 'short-practice', blueprintId: null,
    items: [item], passages: item.passages.length ? [passage] : [], media,
    sections: [{ id: 'section', title: item.skill, skill: item.skill, itemIds: [item.id] }],
    timingBlocks: [{ id: 'block', sectionIds: ['section'], durationMs: 60000, clock: 'elapsed-including-interruptions',
      authority: { kind: 'authoring-rule', ruleId: 'synthetic-only' } }],
    authoring: { policyVersion: 'synthetic-only', countsAre: 'authoring-rules', requirements: [] } });
}
const item = makeItem(), form = makeForm(item);
const listening = makeItem({ id: 'fixture-listening', skill: 'listening', task: 'listening-response', passages: [],
  media: media.map(row => ref(row, 'media')), prompt: '音声を聞いて答えてください。', response: { kind: 'selected',
    options: [{ id: 'a', text: 'SECRET_SPOKEN_OPTION_A' }, { id: 'b', text: 'SECRET_SPOKEN_OPTION_B' }], answerOptionId: 'b' } });
const listeningForm = makeForm(listening, media);
const delivery = { schema: 'kairo-assessment-bank-delivery/1', form: ref(listeningForm, 'form'),
  assets: media.map(row => ({ assetId: row.assetId, path: `audio/${row.assetId}.wav`, bytesSha256: row.bytesSha256, mimeType: row.mimeType })),
  units: media.map((row, index) => ({ id: `unit-${index}`, kind: index ? 'question' : 'example', itemIds: [listening.id],
    media: ref(row, 'media'), printedOptions: false, stimulusPlayCount: 1 })) };
const presentation = { delivery, reviewedSha256: core.createAiReviewPresentation(listeningForm, delivery).deliverySha256 };
const fullEditorial = { ...editorialAtStart, status: 'ai-reviewed-full' };
const cases = {
  reading: { plan: api.deriveAssessmentQuestion({ form, item, editorialAtStart, completedAt: at }).question,
    source: { form, editorialAtStart, visible: true } },
  listening: { plan: api.deriveAssessmentQuestion({ form: listeningForm, item: listening, editorialAtStart: fullEditorial, completedAt: at, presentation }).question,
    source: { form: listeningForm, editorialAtStart: fullEditorial, visible: true, presentation } },
};
// Match the application's default contrast variant and its existing main layout.
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic question view verifier</title><link rel="stylesheet" href="/corridor.css"><body class="v-contrast-wcag"><main id="surface"></main><script type="module">
import {createAssessmentQuestionView} from '/assessment-question-view.mjs';
import * as api from '/assessment-question-practice.mjs';
const cases=${JSON.stringify(cases)}, surface=document.getElementById('surface');
let view, selectedCase, options, owner=true, heldLoad=false, corrupt=false, heldPlay=false, history, networkReads=0, cacheHits=0;
const cachedMedia=new Map();
const heldLoads=[], heldPlays=[], native=[], calls=[], events=[], urls=[], revoked=[], submissions=[], errors=[];
const NativeAudio=window.Audio, createURL=URL.createObjectURL.bind(URL), revokeURL=URL.revokeObjectURL.bind(URL);
URL.createObjectURL=blob=>{const url=createURL(blob);urls.push(url);return url;};
URL.revokeObjectURL=url=>{revoked.push(url);revokeURL(url);};
window.Audio=function(...args){const audio=new NativeAudio(...args),index=native.length;native.push(audio);
for(const kind of ['playing','ended','pause','error'])audio.addEventListener(kind,()=>events.push({kind,index,src:audio.src,...(audio.error?{code:audio.error.code,message:audio.error.message}:{})}));
const play=audio.play.bind(audio);audio.play=()=>{calls.push({index,src:audio.src});const result=play();result.catch(error=>events.push({kind:'play-rejected',index,name:error.name,message:error.message}));return heldPlay?result.then(()=>new Promise(done=>heldPlays.push(done))):result;};return audio;};
window.addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
function mount(){view.mount(surface,options);}
function choose(name,settings={}){
delete document.hidden;
view?.dispose();surface.replaceChildren();selectedCase=cases[name];owner=true;heldLoad=!!settings.heldLoad;corrupt=!!settings.corrupt;heldPlay=!!settings.heldPlay;
native.length=0;calls.length=0;events.length=0;urls.length=0;revoked.length=0;submissions.length=0;errors.length=0;
networkReads=0;cacheHits=0;
history=api.acceptAssessmentQuestionPractice(null,selectedCase.plan);
options={revealed:false,busy:false,error:'',onSkip:()=>{view.dispose();owner=false;surface.textContent='Skipped without grading';},onSubmit:async(input,proof)=>{
history=api.appendAssessmentQuestionResponse(history,{id:'actual-response',planId:selectedCase.plan.id,at:${JSON.stringify(at)},...input},{...selectedCase.source,mediaProof:proof});
const judged=api.checkAssessmentQuestionResponse(selectedCase.plan,history.responses[0]);submissions.push({input,judged,mediaVerified:!!proof});
options={...options,revealed:true,mustRepeat:judged.mustRepeat};mount();}};
view=createAssessmentQuestionView({plan:selectedCase.plan,current:()=>owner,loadMedia:async plan=>{
const values=await Promise.all(plan.media.map(async row=>{let bytes;if(settings.cached){cacheHits++;if(!cachedMedia.has(row.assetId))throw Error('Fixture media cache is empty');bytes=new Uint8Array(cachedMedia.get(row.assetId));}else{networkReads++;bytes=new Uint8Array(await(await fetch('/audio/'+row.assetId+'.wav')).arrayBuffer());}return{assetId:row.assetId,mimeType:row.mimeType,bytes};}));
if(heldLoad)await new Promise(done=>heldLoads.push(done));if(corrupt)values[0].bytes[45]^=255;return values;}});mount();}
window.fixture={choose,calls,events,urls,revoked,submissions,errors,native,
cacheMedia:async()=>{for(const row of cases.listening.plan.media)cachedMedia.set(row.assetId,new Uint8Array(await(await fetch('/audio/'+row.assetId+'.wav')).arrayBuffer()));},
get networkReads(){return networkReads;},get cacheHits(){return cacheHits;},
get heldLoads(){return heldLoads.length;},get heldPlays(){return heldPlays.length;},
releaseLoad:()=>{heldLoad=false;for(const done of heldLoads.splice(0))done();},
releasePlay:()=>{heldPlay=false;for(const done of heldPlays.splice(0))done();},
fixBytes:()=>{corrupt=false;},suspend:()=>{view.suspend();mount();},
dispatchLifecycle:kind=>{if(kind==='visibilitychange'){Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event(kind));}else window.dispatchEvent(new Event(kind));},
restoreVisibility:()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));},
dispose:()=>{view.dispose();owner=false;surface.replaceChildren();},
get source(){return selectedCase;},get history(){return history;},get proof(){return view.mediaProof();}};
choose('reading');
</script></html>`;
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname.slice(1);
  if (!path) { response.setHeader('content-type', 'text/html'); response.end(html); return; }
  const bytes = assets.get(path); if (!bytes) { response.writeHead(404).end(); return; }
  response.setHeader('content-type', path.endsWith('.wav') ? 'audio/wav' : path.endsWith('.css') ? 'text/css' : 'text/javascript'); response.end(bytes);
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`, checks = [];
try {
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const width of [320, 1280]) {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        const page = await context.newPage(), pageErrors = []; page.on('pageerror', error => pageErrors.push(error.message));
        await page.goto(origin); await page.waitForFunction(() => !!window.fixture);
        async function check(label, run) {
          if (caseSelection === 'offline' && !label.startsWith('offline-')) return;
          try { const observation = await run(); checks.push({ browser: name, width, name: label, pass: true, ...(observation ? { observation } : {}) }); }
          catch (error) { checks.push({ browser: name, width, name: label, pass: false, error: error.stack });
            await page.screenshot({ path: resolve(evidence, `${name}-${width}-${label}-failure.png`), fullPage: true });
            writeFileSync(resolve(evidence, `${name}-${width}-${label}-diagnostics.json`), JSON.stringify(await page.evaluate(() => ({
              viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth,
              overflowing: [...document.querySelectorAll('main, main *')].map(node => ({ tag: node.tagName, className: node.className,
                left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right, width: node.getBoundingClientRect().width,
                minWidth: getComputedStyle(node).minWidth })).filter(row => row.right > innerWidth || row.left < 0),
              calls: fixture.calls, events: fixture.events, errors: fixture.errors,
            })), null, 2)); }
        }
        const choose = async (variant, settings = {}) => { await page.evaluate(({ variant, settings }) => fixture.choose(variant, settings), { variant, settings }); };
        const play = async () => {
          const before = await page.evaluate(() => fixture.events.filter(row => row.kind === 'ended').length);
          await page.click('#assessment-question-play');
          await page.waitForFunction(before => fixture.events.filter(row => row.kind === 'ended').length > before, before, { timeout: 10000 });
          await page.waitForFunction(() => !document.querySelector('#assessment-question-play')?.disabled);
        };
        for (const beforeCreation of [false, true]) await check(`offline-${beforeCreation ? 'before-source-creation' : 'after-preparation'}`, async () => {
          await choose('reading'); await page.evaluate(() => fixture.cacheMedia());
          try {
            if (beforeCreation) await context.setOffline(true);
            await choose('listening', { cached: true }); await page.waitForFunction(() => !!fixture.proof);
            if (!beforeCreation) await context.setOffline(true);
            assert.equal(await page.evaluate(() => navigator.onLine), false);
            assert.equal(await page.evaluate(() => fixture.networkReads), 0);
            assert.equal(await page.evaluate(() => fixture.cacheHits), 2);
            assert.equal(await page.locator('input[type="radio"]').count(), 0);
            assert(!(await page.locator('main').innerText()).includes('SECRET_'));
            await play(); await play();
            assert(!(await page.locator('main').innerText()).includes('SECRET_'));
            await play(); await play();
            const sources = await page.evaluate(() => fixture.calls.map(row => row.src));
            assert.equal(sources.length, 4); assert.equal(sources[0], sources[2]); assert.equal(sources[1], sources[3]);
            assert.notEqual(sources[0], sources[1]);
            for (const [index, source] of sources.slice(0, 2).entries()) if (source.startsWith('data:'))
              assert.equal(sha(Buffer.from(source.split(',')[1], 'base64')), media[index].bytesSha256);
            await page.check('input[value="b"]'); await page.click('#assessment-question-check');
            await page.waitForSelector('#assessment-question-feedback');
            assert.deepEqual(await page.evaluate(() => fixture.submissions[0].input.audio.map(row => [row.startedPlays, row.completedPlays])), [[2, 2], [2, 2]]);
            assert.equal(await page.evaluate(() => fixture.submissions[0].judged.mustRepeat), true);
            assert.equal(await page.evaluate(() => fixture.history.grades.length), 0);
            assert.deepEqual(await page.evaluate(() => fixture.errors), []);
            return { networkDisabled: true, networkMediaReads: 0, verifiedCachedAssets: 2,
              sourceKinds: sources.slice(0, 2).map(source => source.split(':')[0]), nativeCompletedPlays: 4 };
          } finally { await context.setOffline(false); }
        });
        await check('selected-and-reveal', async () => {
          await choose('reading'); assert.equal(await page.locator('.assessment-question-passage').innerText(), passage.text);
          assert(!(await page.locator('main').innerText()).includes('SECRET_RATIONALE'));
          assert.equal(await page.locator('.assessment-question-key').count(), 0);
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          await page.screenshot({ path: resolve(evidence, `${name}-${width}-reading-front.png`), fullPage: true });
          assert(await page.locator('#assessment-question-check').isDisabled());
          await page.check('input[value="b"]'); await page.click('#assessment-question-check');
          await page.waitForSelector('#assessment-question-feedback');
          assert.deepEqual(await page.evaluate(() => fixture.submissions[0].input.response), { kind: 'selected', optionId: 'b' });
          assert.equal(await page.evaluate(() => fixture.submissions[0].input.revealed), false);
          assert.equal(await page.locator('.assessment-question-key').count(), 1);
          assert((await page.locator('.assessment-question-rationale').innerText()).includes('SECRET_RATIONALE'));
          assert.equal(await page.evaluate(() => fixture.history.grades.length), 0);
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          await page.screenshot({ path: resolve(evidence, `${name}-${width}-reading-result.png`), fullPage: true });
          const axe = await new AxeBuilder({ page }).analyze();
          writeFileSync(resolve(evidence, `${name}-${width}-axe.json`), JSON.stringify(axe, null, 2));
          assert.deepEqual(axe.violations.filter(row => ['serious', 'critical'].includes(row.impact)), []);
        });
        await check('give-up-is-not-an-answer', async () => {
          await choose('reading'); await page.click('#assessment-question-reveal'); await page.waitForSelector('#assessment-question-feedback');
          assert.deepEqual(await page.evaluate(() => fixture.submissions[0].input.response), null);
          assert.equal(await page.evaluate(() => fixture.submissions[0].input.revealed), true);
          assert.equal(await page.evaluate(() => fixture.submissions[0].judged.mustRepeat), true);
          assert.equal(await page.evaluate(() => fixture.history.grades.length), 0);
        });
        await check('real-audio-example-and-replay', async () => {
          await choose('listening'); await page.waitForFunction(() => !!fixture.proof);
          assert.equal(await page.locator('input[type="radio"]').count(), 0);
          assert(!(await page.locator('main').innerText()).includes('SECRET_'));
          await play(); assert.equal(await page.locator('input[type="radio"]').count(), 2);
          assert.deepEqual((await page.locator('.assessment-question-option').allTextContents()).map(text => text.trim()), ['1', '2']);
          await page.check('input[value="b"]'); assert(await page.locator('#assessment-question-check').isDisabled());
          await play(); assert.equal(await page.evaluate(() => fixture.events.filter(row => row.kind === 'ended').length), 2);
          assert(!(await page.locator('main').innerText()).includes('SECRET_'));
          await play(); await play();
          const sources = await page.evaluate(() => fixture.calls.map(row => row.src));
          assert.equal(sources.length, 4); assert.equal(sources[0], sources[2]); assert.equal(sources[1], sources[3]);
          assert.notEqual(sources[0], sources[1]);
          for (const [index, source] of sources.slice(0, 2).entries()) {
            assert(source.startsWith('data:audio/wav;base64,'));
            assert.equal(sha(Buffer.from(source.split(',')[1], 'base64')), media[index].bytesSha256);
          }
          await page.check('input[value="b"]'); await page.click('#assessment-question-check'); await page.waitForSelector('#assessment-question-feedback');
          assert.equal(await page.evaluate(() => fixture.submissions[0].judged.mustRepeat), true);
          assert.deepEqual(await page.evaluate(() => fixture.submissions[0].input.audio.map(row => [row.startedPlays, row.completedPlays])), [[2, 2], [2, 2]]);
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          await page.screenshot({ path: resolve(evidence, `${name}-${width}-listening-result.png`), fullPage: true });
        });
        await check('first-listen-is-genuine-recall', async () => {
          await choose('listening'); await page.waitForFunction(() => !!fixture.proof);
          await play(); await play(); await page.check('input[value="b"]'); await page.click('#assessment-question-check');
          await page.waitForSelector('#assessment-question-feedback');
          assert.equal(await page.evaluate(() => fixture.submissions[0].judged.mustRepeat), false);
          assert.deepEqual(await page.evaluate(() => fixture.submissions[0].input.audio.map(row => [row.startedPlays, row.completedPlays])), [[1, 1], [1, 1]]);
          assert.equal(await page.evaluate(() => fixture.history.grades.length), 0);
        });
        await check('changed-media-refused-and-retried', async () => {
          await choose('listening', { corrupt: true }); await page.waitForSelector('#assessment-question-retry');
          assert.equal(await page.evaluate(() => fixture.proof), null);
          assert(await page.locator('#assessment-question-play').isDisabled()); assert.equal(await page.evaluate(() => fixture.calls.length), 0);
          await page.evaluate(() => fixture.fixBytes()); await page.click('#assessment-question-retry');
          await page.waitForFunction(() => !!fixture.proof); await play();
        });
        await check('pending-load-disposal-does-not-revive', async () => {
          await choose('listening', { heldLoad: true }); await page.waitForFunction(() => fixture.heldLoads === 1);
          await page.evaluate(() => { fixture.dispose(); fixture.releaseLoad(); });
          await page.waitForTimeout(150);
          assert.equal(await page.evaluate(() => fixture.proof), null);
          assert.equal(await page.evaluate(() => fixture.calls.length), 0);
          assert.equal(await page.evaluate(() => fixture.urls.length), 0);
          assert.equal(await page.locator('#surface').innerText(), '');
        });
        await check('actual-play-suspend-remount-and-stale-promise', async () => {
          await choose('listening', { heldPlay: true }); await page.waitForFunction(() => !!fixture.proof);
          await page.click('#assessment-question-play'); await page.waitForFunction(() => fixture.heldPlays === 1);
          await page.evaluate(() => fixture.suspend());
          assert(await page.evaluate(() => fixture.native.every(audio => audio.paused)));
          await page.evaluate(() => fixture.releasePlay()); await page.waitForTimeout(100);
          assert.equal(await page.evaluate(() => fixture.calls.length), 1);
          await play(); await play(); await page.check('input[value="b"]'); await page.click('#assessment-question-check');
          await page.waitForSelector('#assessment-question-feedback');
          assert.equal(await page.evaluate(() => fixture.submissions[0].input.audio[0].interrupted), true);
          assert.equal(await page.evaluate(() => fixture.submissions[0].judged.mustRepeat), true);
          await page.evaluate(() => fixture.dispose());
          assert(await page.evaluate(() => fixture.urls.every(url => fixture.revoked.includes(url))));
        });
        for (const lifecycle of ['pagehide', 'visibilitychange']) await check(`${lifecycle}-handler-stops-real-audio`, async () => {
          await choose('listening', { heldPlay: true }); await page.waitForFunction(() => !!fixture.proof);
          await page.click('#assessment-question-play'); await page.waitForFunction(() => fixture.heldPlays === 1);
          // Dispatch the lifecycle notification under controlled conditions;
          // playing/ended/pause continue to come from actual browser audio.
          await page.evaluate(kind => fixture.dispatchLifecycle(kind), lifecycle);
          assert(await page.evaluate(() => fixture.native.every(audio => audio.paused)));
          await page.evaluate(() => fixture.releasePlay()); await page.waitForTimeout(100);
          assert.equal(await page.evaluate(() => fixture.calls.length), 1);
          await page.evaluate(() => fixture.restoreVisibility());
          await play(); await play(); await page.check('input[value="b"]'); await page.click('#assessment-question-check');
          await page.waitForSelector('#assessment-question-feedback');
          assert.equal(await page.evaluate(() => fixture.submissions[0].input.audio[0].interrupted), true);
          assert.equal(await page.evaluate(() => fixture.submissions[0].judged.mustRepeat), true);
        });
        await check('no-browser-errors', async () => { assert.deepEqual(pageErrors, []); assert.deepEqual(await page.evaluate(() => fixture.errors), []); });
        await context.close();
      }
    } finally { await browser.close(); }
  }
} finally { await new Promise(done => server.close(done)); }
const receipt = { format: 'kairo-question-view-browser-observation/1', artifactSha256: identity.artifactSha256,
  sourcePins, verifierSha256, runtimeMode: stagedSource ? 'explicit-staged-source' : 'immutable-artifact', caseSelection,
  syntheticOnly: true, readinessAssertion: false,
  nativeEditorialAudioInspection: false, lifecycleNotificationsAreSynthetic: true,
  mediaEventsAreNative: true, checks, passed: checks.filter(row => row.pass).length, total: checks.length };
writeFileSync(resolve(evidence, 'receipt.json'), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ passed: receipt.passed, total: receipt.total, evidence }));
if (checks.some(row => !row.pass)) process.exitCode = 1;
