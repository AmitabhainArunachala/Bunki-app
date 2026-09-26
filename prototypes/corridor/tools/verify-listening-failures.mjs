/** Explicit corrupt-transport and native-quota fixtures around ordinary
 * listening controls. These establish refusal/recovery behavior, not a
 * fault-free learner journey, hearing quality or comprehension. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:https';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import { chromium, webkit } from 'playwright-core';
import { silenceBrowserAudio, TEST_AUDIO_OUTPUT } from './browser-audio-silence.mjs';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { armRecordWriteFailure, clearRecordWriteFailure, readAppRecordSnapshot } from './record-test-support.mjs';

assert(isAbsolute(process.env.KAIRO_SITE_DIR || ''), 'Supply an immutable staged KAIRO_SITE_DIR');
const SITE = resolveCorridorSite(), OUT = resolveCorridorEvidence();
assert(!existsSync(join(OUT, 'receipt.json')), 'Use a fresh evidence directory');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(readFileSync(join(SITE, 'build-identity.json')));
assert.equal(hash(JSON.stringify(manifest.files)), manifest.artifactSha256);
for (const file of manifest.files) assert.equal(hash(readFileSync(join(SITE, file.path))), file.sha256);
const verifierSha256 = hash(readFileSync(new URL(import.meta.url)));
const audioSilenceHelperSha256 = hash(readFileSync(new URL('./browser-audio-silence.mjs', import.meta.url)));
const engines = process.env.KAIRO_BROWSER ? [process.env.KAIRO_BROWSER] : ['chromium', 'webkit'];
assert(engines.every((engine) => ['chromium', 'webkit'].includes(engine)));
const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.m4a': 'audio/mp4' };
let disconnected = false; const fault = { corruptAudio: false, served: 0 };
const certificate = join(OUT, 'synthetic-localhost-cert.pem'), privateKey = join(OUT, 'synthetic-localhost-key.pem');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', privateKey, '-out', certificate,
  '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
const server = createServer({ key: readFileSync(privateKey), cert: readFileSync(certificate) }, (request, response) => {
  if (disconnected) { request.socket.destroy(); return; }
  const path = new URL(request.url, 'http://localhost').pathname;
  const file = resolve(SITE, path === '/' ? 'index.html' : path.slice(1));
  try {
    assert(file.startsWith(`${SITE}/`) && statSync(file).isFile());
    const bytes = readFileSync(file);
    if (fault.corruptAudio && path === '/audio/s/ami/bunki-graded-n5-morning-001.m4a') { bytes[bytes.length - 1] ^= 1; fault.served++; }
    response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(bytes);
  } catch { response.writeHead(404).end(); }
});
rmSync(privateKey); rmSync(certificate);
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const ORIGIN = `https://127.0.0.1:${server.address().port}`;
const WORD = '窓', INDEX = 9;
const LISTENING = '  I understood an open window, a blue sky and a cool breeze.\n e\u0301 🚀  ';
const results = [], startedAt = new Date().toISOString();
async function ready(page) {
  await page.waitForFunction(() => document.body?.dataset.ready === '1', null, { timeout: 30000 });
  assert.equal(await page.locator('#store-alert').isVisible(), false);
}
async function shelf(page) {
  for (let step = 0; step < 12; step++) {
    const view = await page.locator('body').getAttribute('data-view');
    if (view === 'shelf') return;
    if (view === 'drift') {
      await page.locator('#ginga-symbol').focus(); await page.keyboard.press('Enter');
      await page.locator('.bubble-shelf').click();
    } else await page.locator('#back').click();
    await page.waitForFunction(previous => document.body.dataset.view !== previous, view);
  }
  assert.fail('Ordinary Back controls did not reach the bookshelf');
}
function unchanged(before, after, keys = ['taken', 'srs', 'revlog', 'stats', 'lists']) {
  for (const key of keys) assert.deepEqual(after[key], before[key], `${key} remains unchanged`);
}
async function settled(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.race([Promise.allSettled(document.getAnimations().filter(animation =>
      Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished)),
    new Promise(done => setTimeout(done, 2000))]);
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
}
const sourceToken = page => page.locator(`#reader .tok[data-index="${INDEX}"][data-word="${WORD}"]`);
for (const engine of engines) {
  const out = join(OUT, engine); mkdirSync(out, {recursive:true});
  const result = {engine,width:390,passed:false,errors:[],externalRequests:[],observations:[],screenshots:[]};results.push(result);
  const context = await ({chromium,webkit}[engine]).launchPersistentContext(join(out,'profile'), {
    headless:true,viewport:{width:390,height:844},locale:'en-US',serviceWorkers:'allow',ignoreHTTPSErrors:true,
    ...(engine==='chromium'?{args:['--ignore-certificate-errors']}:{}),recordVideo:{dir:join(out,'video'),size:{width:390,height:844}}
  });
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===ORIGIN)return route.continue();
    result.externalRequests.push({origin:url.origin,path:url.pathname});return route.abort();});
  const page=context.pages()[0]||await context.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',error=>result.errors.push(error.message));
  const snapshot=async name=>{const v=await readAppRecordSnapshot(page);writeFileSync(join(out,`${name}.json`),JSON.stringify(v,null,2)+'\n');return v.record;};
  const shot=async name=>{await settled(page);const path=join(out,`${name}.png`);await page.screenshot({path});result.screenshots.push({path,sha256:hash(readFileSync(path))});};
  try {
    await silenceBrowserAudio(context);
    await page.goto(`${ORIGIN}/index.html?ui=bi`);await ready(page);await shelf(page);
    await page.locator('.shelf-item:not([data-recommendation])').filter({has:page.locator('.shelf-title',{hasText:/^静かな朝$/u})}).locator('.shelf-open').click();
    await sourceToken(page).click();await page.locator('#reader-sentence-practice').click();
    await page.locator('#sentence-choose-cloze').uncheck();await page.locator('#sentence-choose-listening').check();
    const before=await snapshot('before-corrupt-audio');const count=fault.served;fault.corruptAudio=true;
    await page.locator('#sentence-practice-confirm').click();
    await page.waitForFunction(()=>/could not be verified/u.test(document.getElementById('sentence-practice-status')?.textContent||''));
    assert(fault.served>count,'The corrupt-byte server fault actually fired');
    unchanged(before,await snapshot('corrupt-audio-refused'),['taken','srs','revlog','stats','sentencePractice','teacherContexts']);
    assert.equal(await page.locator('#sentence-listening-start').count(),0);await shot('corrupt-audio-keeps-choice-neutral');
    result.observations.push({name:'synthetic-corrupt-audio-bytes',requests:fault.served-count,practiceEnrolled:false});
    fault.corruptAudio=false;await page.locator('#sentence-practice-confirm').click();await page.locator('#sentence-listening-start').waitFor();
    const confirmed=await snapshot('retry-confirmed');assert.deepEqual(confirmed.taken,[]);assert.equal(confirmed.sentencePractice.entries[0].plan.contracts.length,1);
    await page.locator('#sentence-listening-start').click();await page.locator('#sentence-listening-text').fill(LISTENING);
    await page.locator('#sentence-listening-reveal').click();assert.equal(await page.locator('#sentence-listening-text').inputValue(),LISTENING);
    await page.locator('#sentence-listening-play').click();
    await page.waitForFunction(()=>/sentence finished/u.test(document.getElementById('sentence-listening-audio-status')?.textContent||''),null,{timeout:30000});
    await armRecordWriteFailure(page,'quota',{roots:['sentencePractice']});
    await page.locator('#sentence-listening-save').click();await page.locator('#store-alert').waitFor({state:'visible'});
    const quota=await clearRecordWriteFailure(page);assert(quota.fired>0);
    unchanged(confirmed,await snapshot('failed-response-save'),['taken','srs','revlog','stats','sentencePractice','teacherContexts']);
    assert.equal(await page.locator('#sentence-listening-text').inputValue(),LISTENING);
    assert(await page.locator('#sentence-listening-save').isDisabled());await shot('quota-keeps-response-copyable');
    result.observations.push({name:'synthetic-quota-after-real-native-puts',quota,earlierRecordsUnchanged:true,unsavedTextVisible:true});
    assert.deepEqual(result.errors,[]);assert.deepEqual(result.externalRequests,[]);result.passed=true;
  } catch(error){result.failure=error.stack||String(error);await shot('failure').catch(()=>{});}
  finally {
    fault.corruptAudio=false;await page.evaluate(()=>window.__recordTestFault?.disarm()).catch(()=>{});
    const video=page.video();await context.close();result.video=await video?.path();
  }
}
server.closeAllConnections();await new Promise(done=>server.close(done));
const receipt={version:1,startedAt,finishedAt:new Date().toISOString(),artifactSha256:manifest.artifactSha256,
  sourceAssetSha256:manifest.sourceAssetSha256,site:SITE,verifierSha256,
  audioOutput:TEST_AUDIO_OUTPUT,audioSilenceHelperSha256,
  qualification:'Separate synthetic transport-corruption and native-transaction-quota fixtures. Source files remain the exact staged build; HTTP corruption is intentional and counted. Real browser audio completion precedes the save fault. No editorial, live teacher, device or full learner acceptance.',
  passed:results.filter(row=>row.passed).length,failed:results.filter(row=>!row.passed).length,results};
writeFileSync(join(OUT,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({passed:receipt.passed,failed:receipt.failed,failures:results.filter(row=>!row.passed).map(row=>({engine:row.engine,failure:row.failure})),receipt:join(OUT,'receipt.json')},null,2));
if(receipt.failed)process.exitCode=1;
