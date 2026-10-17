#!/usr/bin/env node
/** The shipped Kore narration, played by the app through REAL media elements (V, 2026-10-17).
 *
 * Every other playback check replaces Audio with a double, so none of them ever proved that the
 * clips this build ships decode and play in a real engine. This one opens the narrated article on
 * the staged build, presses the reader's own play control and watches the native elements the app
 * creates: each of the shipped clips must be the exact bytes the manifest names (digest and
 * length), load that file, decode to the duration the manifest states, reach `playing`, and play
 * through to `ended` at its full duration before the app hands over to the next clip. Playback is
 * sped to 4x on the app's own element so a run takes seconds; nothing is skipped by seeking, and the
 * position must advance continuously (no jump over 2 s of media time between progress events, and
 * no less wall time than the sped-up clip needs): WebKit reports `ended` at the full duration for a
 * clip truncated to a third of its bytes, so reaching the end alone proves nothing there. Each clip
 * is therefore also decoded whole by the engine's own audio decoder (OfflineAudioContext
 * .decodeAudioData on the served bytes), and the decoded length must match the manifest. The read must finish idle, with zero device
 * speech and no page error.
 *
 * Output is muted by the shared test helper (browser-audio-silence): this proves decoding and the
 * app's sequencing in the engine, never audibility or voice quality — that is the operator's ear.
 *
 *   KAIRO_SITE_DIR=/abs/site [KAIRO_BROWSER=chromium|webkit] [KAIRO_EVIDENCE_DIR=/abs/out] node tools/verify-narration-media.mjs
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, isAbsolute, join, resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { silenceBrowserAudio, TEST_AUDIO_OUTPUT } from './browser-audio-silence.mjs';

const SITE = process.env.KAIRO_SITE_DIR;
assert(SITE && isAbsolute(SITE), 'Supply a staged KAIRO_SITE_DIR');
const OUT = resolve(process.env.KAIRO_EVIDENCE_DIR || resolve(homedir(), '.dharma/bunki_audit/narration-media'));
mkdirSync(OUT, { recursive: true });
const identity = JSON.parse(readFileSync(join(SITE, 'build-identity.json'), 'utf8'));
const narration = JSON.parse(readFileSync(join(SITE, 'audio/article-narration.json'), 'utf8'));
assert.equal(narration.v, 2, 'the shipped narration manifest is v2');
const [ARTICLE, { clips: CLIPS }] = Object.entries(narration.articles)[0];
assert(CLIPS.length > 0, 'the build ships at least one narrated article');
const integrity = CLIPS.map((clip) => {
  const bytes = readFileSync(join(SITE, clip.src));
  return { src: clip.src, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    matches: bytes.length === clip.bytes && createHash('sha256').update(bytes).digest('hex') === clip.sha256 };
});
const engines = process.env.KAIRO_BROWSER && process.env.KAIRO_BROWSER !== 'all' ? [process.env.KAIRO_BROWSER] : ['chromium', 'webkit'];
assert(engines.every((engine) => ['chromium', 'webkit'].includes(engine)), `unknown engine ${process.env.KAIRO_BROWSER}`);

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.m4a': 'audio/mp4', '.webmanifest': 'application/manifest+json' };
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = resolve(SITE, path === '/' ? 'index.html' : path.slice(1));
  try {
    assert(file.startsWith(`${SITE}/`) && statSync(file).isFile());
    const bytes = readFileSync(file);
    const range = /^bytes=(\d+)-(\d*)$/u.exec(request.headers.range || '');
    if (range) {   // media elements ask for ranges; answer them as a real static host does
      const start = Number(range[1]), end = range[2] ? Number(range[2]) : bytes.length - 1;
      response.writeHead(206, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'accept-ranges': 'bytes',
        'content-range': `bytes ${start}-${end}/${bytes.length}`, 'content-length': end - start + 1 });
      response.end(bytes.subarray(start, end + 1));
      return;
    }
    response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'accept-ranges': 'bytes' });
    response.end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const results = [];
for (const engine of engines) {
  const result = { engine, passed: false, clips: [], errors: [] };
  results.push(result);
  // the engine KAIRO_BROWSER names; CHROMIUM_PATH pins CI's Chromium build, as verify-playback does
  const browser = await ({ chromium, webkit }[engine]).launch(engine === 'chromium'
    ? { executablePath: process.env.CHROMIUM_PATH || undefined } : {});
  result.browserVersion = browser.version();
  console.log(`engine ${engine} ${result.browserVersion}`);
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 }, serviceWorkers: 'block' });
  try {
    for (const clip of integrity) assert(clip.matches, `${clip.src} is not the bytes the manifest names`);
    await silenceBrowserAudio(context);
    await context.addInitScript(() => {
      // observe the app's own native elements; nothing about them is replaced
      const NativeAudio = window.Audio;
      window.__media = [];
      window.Audio = new Proxy(NativeAudio, { construct(target, args, newTarget) {
        const audio = Reflect.construct(target, args, newTarget);
        const row = { src: String(args[0] || ''), events: [], duration: null, maxTime: 0, endedAt: null, error: null,
          samples: [], playingWall: null, endedWall: null };
        window.__media.push(row);
        window.__mediaElements = (window.__mediaElements || []).concat(audio);
        for (const name of ['loadedmetadata', 'playing', 'timeupdate', 'ended', 'error', 'pause']) audio.addEventListener(name, () => {
          if (name !== 'timeupdate') row.events.push(name);
          if (Number.isFinite(audio.duration)) row.duration = audio.duration;
          row.maxTime = Math.max(row.maxTime, audio.currentTime);
          if (name === 'ended') { row.endedAt = audio.currentTime; row.endedWall = performance.now(); }
          if (name === 'playing' && row.playingWall === null) row.playingWall = performance.now();
          if (name === 'timeupdate' || name === 'ended') row.samples.push(audio.currentTime);
          if (name === 'error') row.error = audio.error?.code ?? 'unknown';
        });
        return audio;
      } });
      window.__deviceSpeech = 0;
      if (window.speechSynthesis) {
        const speak = window.speechSynthesis.speak.bind(window.speechSynthesis);
        window.speechSynthesis.speak = (utterance) => { window.__deviceSpeech += 1; return speak(utterance); };
      }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', (error) => result.errors.push(error.message));
    await page.goto(`${ORIGIN}/index.html?entry=shelf&ui=bi`);
    await page.waitForFunction(() => document.body.dataset.ready === '1');
    // the engine's own decoder, on the bytes the site serves: the whole clip must decode
    const decoded = await page.evaluate(async (srcs) => Promise.all(srcs.map(async (src) => {
      try {
        const bytes = await (await fetch(src)).arrayBuffer();
        const buffer = await new OfflineAudioContext(1, 24000, 24000).decodeAudioData(bytes);
        return { src, seconds: buffer.duration };
      } catch (error) { return { src, error: String(error?.message || error) }; }
    })), CLIPS.map((clip) => clip.src));
    for (const [index, clip] of CLIPS.entries()) {
      const d = decoded[index];
      assert(!d.error, `clip ${index} does not decode in ${engine}: ${d.error}`);
      assert(Math.abs(d.seconds - clip.seconds) < 0.25, `clip ${index} decodes to ${d.seconds.toFixed(2)}s; the manifest says ${clip.seconds}s`);
    }
    result.decoded = decoded.map((d) => ({ src: d.src, seconds: +d.seconds.toFixed(3) }));
    await page.locator(`[data-passage="${ARTICLE}"]:not([data-recommendation]) .shelf-open`).first().click();
    await page.waitForSelector('#reader .tok');
    await page.waitForFunction((id) => document.querySelector('.listen-row[data-passage]')?.dataset.passage === id, ARTICLE);
    await page.waitForFunction(() => !document.querySelector('.listen-row')?.classList.contains('is-pending'));
    await page.locator('#listen-open').click();
    await page.waitForSelector('.listen-row.play-bar[data-open="true"]');
    await page.locator('#listen-toggle').click();
    for (const [index, clip] of CLIPS.entries()) {
      await page.waitForFunction((n) => window.__media.length > n && window.__media[n].events.includes('playing'), index, { timeout: 15000 });
      // the whole clip plays, sped up; it is never seeked, so missing data cannot be skipped over
      await page.evaluate((n) => { window.__mediaElements[n].playbackRate = 4; }, index);
      await page.waitForFunction((n) => window.__media[n].events.includes('ended') || window.__media[n].error !== null, index, { timeout: 30000 });
      const row = await page.evaluate((n) => ({ ...window.__media[n], currentSrc: window.__mediaElements[n].currentSrc }), index);
      assert.equal(row.error, null, `clip ${index} failed to play (media error ${row.error})`);
      assert(row.currentSrc.endsWith(`/${clip.src}`), `clip ${index} loaded ${row.currentSrc}, not ${clip.src}`);
      assert(Math.abs(row.duration - clip.seconds) < 0.25, `clip ${index} decodes to ${row.duration}s; the manifest says ${clip.seconds}s`);
      assert(row.endedAt >= row.duration - 0.15, `clip ${index} ended at ${row.endedAt}s of ${row.duration}s`);
      const points = [0, ...row.samples].sort((a, b) => a - b);
      const maxGap = Math.max(...points.slice(1).map((t, i) => t - points[i]));
      const wallSeconds = (row.endedWall - row.playingWall) / 1000;
      assert(maxGap <= 2, `clip ${index} jumped ${maxGap.toFixed(2)}s of media time: it did not play through`);
      assert(wallSeconds >= 0.6 * row.duration / 4, `clip ${index} "played" ${row.duration}s in ${wallSeconds.toFixed(2)}s at 4x`);
      result.clips.push({ index, src: clip.src, duration: +row.duration.toFixed(3), manifestSeconds: clip.seconds,
        reachedPlaying: true, endedAt: +row.endedAt.toFixed(3), maxGap: +maxGap.toFixed(3), wallSeconds: +wallSeconds.toFixed(2),
        progressEvents: row.samples.length });
    }
    await page.waitForFunction(() => document.querySelector('#listen-toggle')?.getAttribute('aria-pressed') !== 'true', null, { timeout: 15000 });
    const final = await page.evaluate(() => ({ elements: window.__media.length, deviceSpeech: window.__deviceSpeech }));
    assert.equal(final.elements, CLIPS.length, 'one element per clip, no extra and none repeated');
    assert.equal(final.deviceSpeech, 0, 'the device voice is never called');
    assert.deepEqual(result.errors, [], 'no uncaught page error');
    result.passed = true;
  } catch (error) {
    result.failure = error?.stack || String(error);
    console.error(` FAIL ${engine}: ${error.message}`);
  } finally { await context.close(); await browser.close(); }
}
await new Promise((done) => server.close(done));
const receipt = { version: 1, site: SITE, gitSha: identity.gitSha, artifactSha256: identity.artifactSha256, article: ARTICLE, integrity,
  audioOutput: TEST_AUDIO_OUTPUT, enginesCovered: engines, results,
  claim: 'the shipped narration clips load, decode to their stated durations and play in sequence through the app in each engine named; muted, so no audibility or quality claim' };
writeFileSync(join(OUT, 'verify-narration-media.json'), `${JSON.stringify(receipt, null, 2)}\n`);
for (const r of results) console.log(`${r.passed ? '  ok ' : ' FAIL'} ${r.engine} ${r.browserVersion}: ${r.clips.length}/${CLIPS.length} clips`);
process.exitCode = results.every((r) => r.passed) ? 0 : 1;
