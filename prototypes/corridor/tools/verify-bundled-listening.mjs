/** Bundled reading, explicit text practice and native recorded listening through normal
 * controls. Persistent profiles, real record output, no injected learner state
 * or provider responses. This is a scoped technical subjourney. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:https';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { silenceBrowserAudio, TEST_AUDIO_OUTPUT } from './browser-audio-silence.mjs';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { readAppRecordSnapshot, waitForAppRecord } from './record-test-support.mjs';

assert(isAbsolute(process.env.KAIRO_SITE_DIR || ''), 'Supply an immutable staged KAIRO_SITE_DIR');
const SITE = resolveCorridorSite(), OUT = resolveCorridorEvidence();
assert(!existsSync(join(OUT, 'receipt.json')), 'Use a fresh evidence directory');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(readFileSync(join(SITE, 'build-identity.json')));
assert.equal(hash(JSON.stringify(manifest.files)), manifest.artifactSha256);
for (const file of manifest.files) assert.equal(hash(readFileSync(join(SITE, file.path))), file.sha256);
const verifierSha256 = hash(readFileSync(new URL(import.meta.url)));
const audioSilenceHelperSha256 = hash(readFileSync(new URL('./browser-audio-silence.mjs', import.meta.url)));
const sentencePracticeApi = await import(pathToFileURL(join(SITE, 'sentence-practice.mjs')));
const engines = process.env.KAIRO_BROWSER ? [process.env.KAIRO_BROWSER] : ['chromium', 'webkit'];
assert(engines.every((engine) => ['chromium', 'webkit'].includes(engine)));
const sizes = process.env.KAIRO_BUNDLED_LISTENING_VIEWPORT === 'desktop' ? [1440] : [1440, 390];
const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.m4a': 'audio/mp4' };
let disconnected = false;
const certificate = join(OUT, 'synthetic-localhost-cert.pem'), privateKey = join(OUT, 'synthetic-localhost-key.pem');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', privateKey, '-out', certificate,
  '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
const server = createServer({ key: readFileSync(privateKey), cert: readFileSync(certificate) }, (request, response) => {
  if (disconnected) { request.socket.destroy(); return; }
  const path = new URL(request.url, 'http://localhost').pathname;
  const file = resolve(SITE, path === '/' ? 'index.html' : path.slice(1));
  try {
    assert(file.startsWith(`${SITE}/`) && statSync(file).isFile());
    response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
rmSync(privateKey); rmSync(certificate);
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const ORIGIN = `https://127.0.0.1:${server.address().port}`;
const TITLE = '静かな朝', WORD = '窓', INDEX = 9;
const QUESTION = '「窓」の読み方と、この文での使い方を教えてください。';
const LISTENING = '  I understood an open window, a blue sky and a cool breeze.\n e\u0301 🚀  ';
const LISTENING_LATER = '聞こえたことを自分の言葉で説明したいです。';
const PRODUCTION = '  私の部屋の窓を開けます。\n e\u0301 🚀  ';
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
async function returned(page) {
  await page.waitForFunction(index => document.body.dataset.view === 'reader' &&
    document.activeElement?.matches(`#reader .tok[data-index="${index}"]`), INDEX);
  assert.equal(await page.locator('h1.view-title').textContent(), TITLE);
  assert(await sourceToken(page).evaluate(node => {
    const box = node.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight;
  }));
}
async function savedQuestion(page, ref, text) {
  await waitForAppRecord(page, record => record.teacherDrafts?.entries.some(draft => draft.contextRef === ref && !draft.consumed && draft.text === text));
  await page.waitForFunction(() => document.getElementById('teacher-draft-status')?.dataset.state === 'saved');
}
for (const engine of engines) for (const width of sizes) {
  const out = join(OUT, `${engine}-${width}`); mkdirSync(out, { recursive: true });
  const result = { engine, width, passed: false, observations: [], screenshots: [], videos: [], nativeAudio: [], errors: [], externalRequests: [] };
  results.push(result); let context, page, episode = 0, profile = 'profile';
  const open = async () => {
    const videos = join(out, `video-${++episode}`); mkdirSync(videos, { recursive: true });
    context = await ({ chromium, webkit }[engine]).launchPersistentContext(join(out, profile), {
      headless: true, viewport: { width, height: width === 390 ? 844 : 1050 }, locale: 'en-US', serviceWorkers: 'allow',
      acceptDownloads: true, ignoreHTTPSErrors: true, ...(engine === 'chromium' ? { args: ['--ignore-certificate-errors'] } : {}),
      recordVideo: { dir: videos, size: { width, height: width === 390 ? 844 : 1050 } },
    });
    result.browserVersion = context.browser()?.version();
    await silenceBrowserAudio(context);
    await context.addInitScript(() => {
      const NativeAudio = window.Audio; window.__observedNativeAudio = [];
      window.Audio = new Proxy(NativeAudio, {construct(target,args,newTarget) {
        const audio = Reflect.construct(target,args,newTarget);
        for (const name of ['loadedmetadata','playing','pause','ended','error']) audio.addEventListener(name, event => {
          window.__observedNativeAudio.push({event:name,src:audio.currentSrc||audio.src,currentTime:audio.currentTime,
            duration:Number.isFinite(audio.duration)?audio.duration:null,paused:audio.paused,ended:audio.ended,
            trusted:event.isTrusted,error:audio.error?.code||null,at:performance.now()});
        }); return audio;
      }});
    });

    await context.route('**/*', route => {
      const url = new URL(route.request().url()); if (url.origin === ORIGIN) return route.continue();
      result.externalRequests.push({ origin: url.origin, pathname: url.pathname }); return route.abort();
    });
    page = context.pages()[0] || await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => result.errors.push({ episode, message: error.message }));
  };
  const close = async () => {
    if (!context) return;
    for (const p of context.pages()) result.nativeAudio.push({ episode, events: await p.evaluate(() => window.__observedNativeAudio || []).catch(() => []) });
    const videos = context.pages().map(page => page.video()); await context.close(); context = null;
    for (const video of videos) if (video) result.videos.push(await video.path());
  };
  const screenshot = async name => {
    await settled(page); const file = join(out, `${name}.png`); await page.screenshot({ path: file, fullPage: false });
    result.screenshots.push({ name, path: file, sha256: hash(readFileSync(file)) });
  };
  const snapshot = async name => {
    const value = await readAppRecordSnapshot(page); writeFileSync(join(out, `${name}.json`), JSON.stringify(value, null, 2) + '\n');
    return value.record;
  };
  const openSaved = async () => {
    await shelf(page); await page.locator('#tray').click(); await page.locator('#sentence-practice-library summary').click();
    await page.locator('[data-sentence-practice-id]').first().click(); await page.locator('#sentence-production-text').waitFor();
  };
  try {
    await open(); await page.goto(`${ORIGIN}/index.html?ui=bi`); await ready(page); await shelf(page);
    const initial = await snapshot('initial'); assert.deepEqual(initial.taken, []); assert.deepEqual(initial.srs, {});
    await page.locator('#airead-link').click(); await page.locator('#airead-startingLevel').selectOption('N5');
    await waitForAppRecord(page, record => record.readingSettings?.startingLevel === 'N5');
    assert(await page.locator('#airead-make').isDisabled()); await screenshot('local-reading-preferences');
    await page.locator('#back').click();
    const item = page.locator('.shelf-item').filter({ has: page.locator('.shelf-title', { hasText: /^静かな朝$/u }) });
    assert.equal(await item.count(), 1); result.passageId = await item.getAttribute('data-passage');
    await item.locator('.shelf-open').click(); await sourceToken(page).waitFor(); await settled(page);
    assert(await page.locator('#reader-sentence-practice').isDisabled()); await sourceToken(page).click();
    await page.locator('#reader-sentence-practice').click(); await page.locator('#sentence-practice-confirm').waitFor();
    unchanged(initial, await snapshot('reader-choice-neutral')); await page.locator('#sentence-practice-back').click();
    await page.waitForFunction(() => document.body.dataset.view === 'reader' && document.activeElement?.id === 'reader-sentence-practice');
    const surfaces = await page.locator('#reader .tok[data-index]').evaluateAll(nodes => nodes.map(node => {
      const copy = (node.querySelector('.tok-word') || node).cloneNode(true); copy.querySelectorAll('rt,rp,.tok-en').forEach(node => node.remove());
      return copy.textContent;
    }));
    const token = sourceToken(page); await token.scrollIntoViewIfNeeded(); const box = await token.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    try { await page.locator('#sheet[data-node="word:窓"] .dictionary-entry').waitFor(); } finally { await page.mouse.up(); }
    await settled(page); await page.waitForTimeout(800); // The real sheet's same-gesture guard.
    await page.locator('#sheet [data-kanjirow="窓"]').click(); await page.locator('#sheet[data-node="kanji:窓"]').waitFor();
    await settled(page); await page.waitForTimeout(800); await page.locator('#entry-sentence-practice').click();
    await page.locator('#sentence-practice-confirm').waitFor(); unchanged(initial, await snapshot('recursive-choice-neutral'));
    await page.locator('#back').click(); await page.locator('#sheet[data-node="kanji:窓"]').waitFor();
    await page.waitForFunction(() => document.activeElement?.id === 'entry-sentence-practice');
    await page.locator('#sheet-back').click(); await page.locator('#sheet[data-node="word:窓"]').waitFor();
    await page.waitForTimeout(800); await page.locator('#sheet .teacher-save').click();
    await waitForAppRecord(page, record => record.teacherContexts?.entries.length === 1);
    const neutral = await snapshot('neutral-context'); unchanged(initial, neutral);
    assert.deepEqual(neutral.sentencePractice, initial.sentencePractice);
    assert.equal(sentencePracticeApi.parseSentencePractice(neutral.sentencePractice).entries.length, 0);
    await page.locator('#sheet .teacher-discuss').click(); await page.locator('#chat-input').waitFor();
    const source = neutral.teacherContexts.entries[0], ref = source.id;
    assert.equal(source.sourceKind, 'bundled-passage'); assert.equal(source.index, INDEX);
    assert.equal(source.sourceDigest, hash(JSON.stringify(surfaces)));
    assert.equal(source.quote, surfaces.slice(source.start, source.end).join(''));
    assert.equal(await page.locator('#teacher-context-select').inputValue(), ref);
    await page.locator('#chat-input').fill(QUESTION); await savedQuestion(page, ref, QUESTION);
    await page.locator('#teacher-sentence-practice').click(); await page.locator('#sentence-practice-confirm').waitFor();
    unchanged(initial, await snapshot('teacher-choice-neutral')); await screenshot('explicit-bundled-practice-choice');
    await page.locator('#sentence-practice-back').click(); await page.locator('#chat-input').waitFor();
    assert.equal(await page.locator('#chat-input').inputValue(), QUESTION);
    await page.locator('#teacher-sentence-practice').click(); await page.locator('#sentence-choose-production').check();
    await page.locator('#sentence-practice-confirm').click(); await page.locator('#sentence-production-text').waitFor();
    const chosen = await snapshot('explicit-choice'); const entry = chosen.sentencePractice.entries[0];
    assert.equal(chosen.taken.length, 1); assert.equal(chosen.sentencePractice.entries.length, 1);
    assert.deepEqual(entry.context, source); assert.deepEqual(entry.plan.origin.tokenSpan.surfaces, surfaces.slice(source.start, source.end));
    assert.equal(entry.plan.origin.tokenSpan.index, INDEX); assert.equal(entry.plan.origin.text.slice(entry.plan.origin.start, entry.plan.origin.end), WORD);
    assert.equal(entry.plan.contracts.length, 2); assert.equal(chosen.revlog.length, 0); assert.deepEqual(chosen.srs, {});
    await page.locator('#sentence-production-text').fill(PRODUCTION); await page.locator('#sentence-production-save').click();
    await waitForAppRecord(page, record => record.sentencePractice.responses.length === 1);
    const written = await snapshot('written-response'); unchanged(chosen, written);
    assert.equal(written.sentencePractice.responses[0].text, PRODUCTION); assert.equal(written.sentencePractice.responses[0].observation.tier, 'B');
    await page.locator('.learning-source summary').click(); await page.locator('#learning-source-return').click(); await returned(page);
    assert.match(await page.locator('#reader-source-back').textContent(), /Sentence practice/u);
    await page.locator('#reader-source-back').click(); await page.locator('#sentence-production-text').waitFor();
    unchanged(written, await snapshot('practice-source-return'), ['taken', 'srs', 'revlog', 'sentencePractice']);
    await page.locator('#sentence-review-start').click(); await page.locator('#sentence-recall-answer').fill(WORD);
    await page.locator('#sentence-recall-check').click(); await page.locator('.grade.g-easy').waitFor();
    const answered = await snapshot('answered'); unchanged(written, answered);
    await page.locator('#review-source-return').click(); await returned(page); await screenshot('original-token-and-review-return');
    assert.match(await page.locator('#reader-source-back').textContent(), /Resume review/u);
    await page.locator('#back').click(); await page.locator('.grade.g-easy').waitFor();
    unchanged(answered, await snapshot('review-resumed'), ['taken', 'srs', 'revlog', 'sentencePractice']);
    await page.locator('.grade.g-easy').click(); await page.locator('.review-summary').waitFor();
    const graded = await snapshot('finite-review'); assert.equal(graded.revlog.length, 1);
    assert.equal(graded.sentencePractice.grades[0].observation.grade, 'easy'); assert.equal(graded.srs[`sentence:${entry.plan.id}`].reps, 1);
    await page.locator('.close-doors .take').click(); await openSaved();
    await page.locator('[data-sentence-teacher-response]').first().click(); await page.locator('#chat-input').waitFor();
    let prepared = await page.locator('#chat-input').inputValue(); assert(prepared.startsWith(`${QUESTION}\n\n`)); assert(prepared.includes(PRODUCTION));
    await savedQuestion(page, ref, prepared); assert(await page.locator('#chat-send').isDisabled());
    await page.locator('#teacher-source-return').click(); await returned(page);
    assert.match(await page.locator('#reader-source-back').textContent(), /Back to tutor/u);
    await page.locator('#reader-source-back').click(); await page.locator('#chat-input').waitFor(); assert.equal(await page.locator('#chat-input').inputValue(), prepared);
    await screenshot('saved-writing-question-and-return');
    let completed = await snapshot('connected-segment'); unchanged(graded, completed, ['taken', 'srs', 'revlog', 'sentencePractice']);
    assert.equal(completed.aiChat.length, 0); assert.equal(completed.readingSettings.startingLevel, 'N5');
    result.observations.push({ name: 'one-profile-connected-segment', reading: result.passageId, contextRef: ref,
      explicitChoices: 1, exactToken: INDEX, recursiveCallerRestored: true, finiteRecall: true, uncheckedProduction: true,
      questionPreparedWithoutSending: true, sourceCallerReturns: ['practice', 'review', 'teacher'] });

    await openSaved(); const beforeListening = await snapshot('before-listening-choice');
    await page.locator('#sentence-add-listening').click(); await page.locator('#sentence-listening-start').waitFor();
    const chosenListening = await snapshot('listening-confirmed'); unchanged(beforeListening, chosenListening);
    assert.deepEqual(chosenListening.sentencePractice.responses, beforeListening.sentencePractice.responses);
    assert.deepEqual(chosenListening.sentencePractice.entries[0].plan.contracts.slice(0, 2), beforeListening.sentencePractice.entries[0].plan.contracts);
    assert.equal(chosenListening.sentencePractice.entries[0].plan.contracts[2].cueModality, 'audio');
    assert.equal(chosenListening.sentencePractice.entries[0].plan.listeningCue.transcriptStatus, 'unreviewed');
    await page.locator('#sentence-listening-start').click();
    assert(!(await page.locator('main').textContent()).includes(entry.context.quote), 'the listening exercise hides its transcript');
    await page.locator('#sentence-listening-text').fill(LISTENING); assert(await page.locator('#sentence-listening-save').isDisabled());
    await page.locator('#sentence-listening-play').click();
    await page.waitForFunction(() => window.__observedNativeAudio.some(row => row.event === 'playing' && row.src.startsWith('blob:')));
    await page.locator('#sentence-listening-play').click();
    assert(await page.locator('#sentence-listening-save').isDisabled(), 'stopped playback does not become completed listening');
    unchanged(chosenListening, await snapshot('listening-interrupted'), ['taken', 'srs', 'revlog', 'sentencePractice']);
    await page.locator('#sentence-practice-back').click(); await page.locator('#sentence-listening-start').click();
    assert.equal(await page.locator('#sentence-listening-text').inputValue(), LISTENING);
    const completedPlays = async () => page.evaluate(() => window.__observedNativeAudio.filter(row => row.event === 'ended' && row.src.startsWith('blob:')).length);
    const playToEnd = async () => {
      const before = await completedPlays(); await page.locator('#sentence-listening-play').click();
      await page.waitForFunction(count => window.__observedNativeAudio.filter(row => row.event === 'ended' && row.src.startsWith('blob:')).length > count, before, {timeout:30000});
      assert.match(await page.locator('#sentence-listening-audio-status').textContent(), /sentence finished/u);
    };
    await playToEnd(); await screenshot('listening-response-before-transcript');
    await page.locator('#sentence-listening-source').click(); await returned(page);
    await page.locator('#reader-source-back').click(); await page.locator('#sentence-listening-text').waitFor();
    assert.equal(await page.locator('#sentence-listening-text').inputValue(), LISTENING);
    assert.equal(await page.locator('#sentence-listening-transcript').textContent(), entry.context.quote);
    assert(await page.locator('#sentence-listening-reveal').isDisabled());
    await page.locator('#sentence-listening-save').click(); await page.locator('#sentence-listening-start').waitFor();
    const listened = await snapshot('listening-response-saved'); unchanged(chosenListening, listened);
    const response = listened.sentencePractice.responses.at(-1);
    assert.equal(response.mode, 'listening'); assert.equal(response.text, LISTENING); assert.equal(response.revealed, true);
    assert.equal(response.observation.tier, 'B'); assert.equal(response.observation.rubricId, 'kairo-source-listening');
    assert.equal(response.listening.completedPlays, 1);
    assert.deepEqual(listened.sentencePractice.grades, chosenListening.sentencePractice.grades);
    await screenshot('listening-history-and-tutor-door');
    await page.locator('#sentence-listening-start').click();
    assert.equal(await page.locator('#sentence-listening-text').inputValue(), '');
    assert.equal(await page.locator('#sentence-listening-transcript').count(), 0);
    await playToEnd(); await page.locator('#sentence-listening-text').fill(LISTENING_LATER);
    await page.locator('#sentence-listening-save').click(); await page.locator('#sentence-listening-start').waitFor();
    const laterListening = (await snapshot('second-listening-response')).sentencePractice.responses.at(-1);
    assert.equal(laterListening.revealed, false); assert.equal(laterListening.text, LISTENING_LATER);
    await page.locator(`[data-sentence-teacher-response="${laterListening.id}"]`).click(); await page.locator('#chat-input').waitFor();
    const listeningQuestion = await page.locator('#chat-input').inputValue();
    assert(listeningQuestion.startsWith(`${prepared}\n\n`)); assert(listeningQuestion.includes(LISTENING_LATER));
    prepared = listeningQuestion; await savedQuestion(page, ref, prepared); assert(await page.locator('#chat-send').isDisabled());
    await page.locator('#teacher-source-return').click(); await returned(page); await page.locator('#reader-source-back').click();
    await page.locator('#chat-input').waitFor(); assert.equal(await page.locator('#chat-input').inputValue(), prepared);
    await screenshot('listening-question-and-original-source');
    completed = await snapshot('listening-connected-segment'); unchanged(graded, completed);
    assert.equal(completed.sentencePractice.responses.filter(row => row.mode === 'listening').length, 2);
    result.observations.push({name:'recorded-listening-connected-to-existing-practice', actualPlayback:true,
      interruptedPlaybackNeutral:true, completedNativePlays:await completedPlays(), savedListeningResponses:2,
      transcriptUseRecorded:true, ownWritingPreserved:true, questionPreserved:true, listeningGraded:false});

    await close(); await open(); await page.goto(`${ORIGIN}/index.html?ui=bi`); await ready(page); await openSaved();
    const restarted = await snapshot('restarted'); unchanged(completed, restarted,
      ['taken', 'srs', 'revlog', 'sentencePractice', 'teacherContexts', 'teacherDrafts', 'readingSettings']);
    await page.locator('#sentence-practice-back').click();
    const pendingDownload = page.waitForEvent('download'); await page.locator('#export-store').click();
    const backup = await pendingDownload, backupPath = join(out, 'bundled-listening-backup.json'); await backup.saveAs(backupPath);
    assert.deepEqual(JSON.parse(readFileSync(backupPath)).record.sentencePractice, completed.sentencePractice);
    await close(); profile = 'profile-restored'; await open(); await page.goto(`${ORIGIN}/index.html?ui=bi`); await ready(page);
    await shelf(page); await page.locator('#tray').click(); const timeOrigin = await page.evaluate(() => performance.timeOrigin);
    await page.locator('#import-file').setInputFiles(backupPath);
    await page.waitForFunction(old => performance.timeOrigin !== old && document.body?.dataset.ready === '1', timeOrigin, { timeout: 30000 });
    // Warm the original source through its actual action before disconnecting.
    await openSaved(); await page.locator('.learning-source summary').click(); await page.locator('#learning-source-return').click(); await returned(page);
    await page.locator('#reader-source-back').click(); await page.locator('#sentence-production-text').waitFor();
    await page.locator('#sentence-listening-start').click(); await playToEnd(); await page.locator('#sentence-practice-back').click();
    await close(); await open(); await page.goto(`${ORIGIN}/index.html?ui=bi`); await ready(page);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
    if (engine === 'webkit') disconnected = true; else await context.setOffline(true);
    await page.reload(); await ready(page); await openSaved();
    await page.locator('[data-sentence-teacher-response]').first().click(); await page.locator('#chat-input').waitFor();
    assert.equal(await page.locator('#chat-input').inputValue(), prepared);
    await page.locator('#teacher-source-return').click(); await returned(page); await page.locator('#reader-source-back').click();
    await page.locator('#chat-input').waitFor(); assert.equal(await page.locator('#chat-input').inputValue(), prepared);
    await page.locator('#teacher-practice-return').click(); await page.locator('#sentence-production-text').waitFor();
    await page.locator('#sentence-listening-start').click(); await playToEnd(); await screenshot('offline-native-listening');
    await page.locator('#sentence-practice-back').click();
    const restored = await snapshot('restored-offline'); unchanged(completed, restored,
      ['taken', 'srs', 'revlog', 'sentencePractice', 'teacherContexts', 'teacherDrafts', 'readingSettings']);
    assert.equal(await page.locator('#sentence-review-start').isDisabled(), true);
    await screenshot('restored-offline-practice'); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.equal(result.errors.length, 0); assert.equal(result.externalRequests.length, 0);
    result.passed = true; result.entryId = entry.plan.id; result.contextRef = ref;
    result.offline = engine === 'webkit' ? 'local HTTPS listener disconnected; actual worker-controlled reload' : 'Chromium context offline; actual worker-controlled reload';
  } catch (error) {
    result.failure = error?.stack || String(error);
    try { if (page) await screenshot('failure'); } catch { /* Preserve the original failure. */ }
  } finally { disconnected = false; await close(); }
}
await new Promise(done => server.close(done));
const receipt = { version: 1, startedAt, finishedAt: new Date().toISOString(), artifactSha256: manifest.artifactSha256,
  sourceAssetSha256: manifest.sourceAssetSha256, site: SITE, verifierSha256,
  audioOutput: TEST_AUDIO_OUTPUT, audioSilenceHelperSha256,
  qualification: 'Ordinary controls on bundled authored text and root-authored writing in headless persistent profiles. Connected segment with actual pinned synthetic audio and observed native Audio events, plus restarts, UI restore and worker offline. Written understanding is root-authored test input, not proof of hearing/comprehension. Recording/transcript alignment remains unreviewed. No provider response, native GUI, physical device or complete learner acceptance.',
  passed: results.filter(result => result.passed).length, failed: results.filter(result => !result.passed).length, results };
writeFileSync(join(OUT, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ passed: receipt.passed, failed: receipt.failed, failures: results.filter(result => !result.passed)
  .map(result => ({ engine: result.engine, width: result.width, failure: result.failure })), receipt: join(OUT, 'receipt.json') }, null, 2));
if (receipt.failed) process.exitCode = 1;
