/* 声の選択 — the device-voice picker tells the truth (operator, 2026-09-17:
 * "despite changing the voice input choice the voice DOES NOT CHANGE AT
 * ALL. and the basic computer voice needs to NOT BE AN OPTION AT ALL").
 *
 * With the recorded reader absent (audio/manifest.json → 404) and a
 * synthetic voice list installed before boot, open the reader and ASSERT on
 * the rendered picker: novelty/Eloquence voices never appear, the compact
 * default hides behind a better voice, and choosing a voice speaks a preview
 * in THAT voice (spy on speechSynthesis.speak, no audio leaves the box).
 *
 * Claim boundary: proves the list and the utterance's voice binding in
 * Chromium; it cannot judge how a voice sounds — that is the operator's ear.
 *
 * Usage: KAIRO_SITE_DIR=<site> KAIRO_ARTIFACT_SHA256=<digest> KAIRO_EVIDENCE_DIR=<dir>
 *        node prototypes/corridor/tools/verify-voice-picker.mjs
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { resolveCorridorSite, resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';

const CORRIDOR = resolveCorridorSite();
const OUT = resolveCorridorEvidence();
mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const { server, base } = await new Promise((ok, fail) => {
  const s = createServer((req, res) => {
    const p = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (p === '/audio/manifest.json') { res.writeHead(404).end(); return; } // no recorded reader tonight
    const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
    const f = resolve(CORRIDOR, rel);
    if (!f.startsWith(CORRIDOR) || !existsSync(f)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' });
    res.end(readFileSync(f));
  });
  s.once('error', fail);
  s.listen(0, '127.0.0.1', () => ok({ server: s, base: `http://127.0.0.1:${s.address().port}` }));
});

const VOICES = [
  { name: 'Eddy', voiceURI: 'com.apple.eloquence.ja-JP.Eddy', lang: 'ja-JP', localService: true },
  { name: 'Grandma', voiceURI: 'com.apple.eloquence.ja-JP.Grandma', lang: 'ja-JP', localService: true },
  { name: 'Kyoko', voiceURI: 'com.apple.voice.compact.ja-JP.Kyoko', lang: 'ja-JP', localService: true },
  { name: 'Kyoko (Enhanced)', voiceURI: 'com.apple.voice.enhanced.ja-JP.Kyoko', lang: 'ja-JP', localService: true },
  { name: 'Google 日本語', voiceURI: 'Google 日本語', lang: 'ja-JP', localService: false },
  { name: 'Samantha', voiceURI: 'com.apple.voice.compact.en-US.Samantha', lang: 'en-US', localService: true },
];
const STUB = `(() => {
  const voices = ${JSON.stringify(VOICES)}.map((v) => ({ ...v, default: false }));
  const spoken = [];
  const synth = {
    getVoices: () => voices,
    speak: (u) => { spoken.push({ text: u.text, voiceURI: u.voice ? u.voice.voiceURI : null, lang: u.lang }); },
    cancel: () => {}, pause: () => {}, resume: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    speaking: false, pending: false, paused: false,
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.__spoken = spoken;
  // the real utterance refuses a plain object as its voice (TypeError on the
  // setter); the app then falls back honestly, which is not what is under
  // test here — so the utterance is faked along with the voice list
  window.SpeechSynthesisUtterance = function (text) { this.text = text; this.voice = null; this.lang = ''; this.rate = 1; };
})();`;

const failures = [];
const receipt = { schemaVersion: 1, site: CORRIDOR, stubVoices: VOICES.map((v) => v.name) };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
await silenceBrowserAudio(context);
await context.addInitScript(STUB);
const page = await context.newPage();
await page.goto(`${base}/?entry=shelf`);
await page.waitForSelector('#tray', { timeout: 30000 });
const card = await page.$('#shelf-body [data-passage]');
if (!card) { failures.push('no passage card on the shelf'); }
else {
  await card.click();
  await page.waitForSelector('#reader', { timeout: 30000 });
  await page.waitForTimeout(600);
  const options = await page.evaluate(`(() => {
    const s = document.querySelector('#listen-voice');
    return s ? [...s.options].map((o) => ({ name: o.textContent, uri: o.value })) : null;
  })()`);
  receipt.options = options;
  if (!options) failures.push('#listen-voice picker absent although the recorded reader is unavailable');
  else {
    const names = options.map((o) => o.name);
    for (const bad of ['Eddy', 'Grandma', 'Samantha']) if (names.includes(bad)) failures.push(`novelty/foreign voice offered: ${bad}`);
    if (names.includes('Kyoko')) failures.push('compact default offered while an enhanced voice exists');
    for (const good of ['Kyoko (Enhanced)', 'Google 日本語']) if (!names.includes(good)) failures.push(`expected voice missing: ${good}`);
    await page.screenshot({ path: join(OUT, 'picker.png') });
    await page.selectOption('#listen-voice', 'Google 日本語');
    await page.waitForTimeout(300);
    const spoken = await page.evaluate('window.__spoken');
    receipt.spokenAfterChange = spoken;
    const preview = spoken.find((s) => s.voiceURI === 'Google 日本語');
    if (!preview) failures.push(`no preview utterance in the picked voice; spoken=${JSON.stringify(spoken)}`);
    const note = await page.evaluate(`document.querySelector('#listen-note')?.textContent || ''`);
    receipt.noteAfterChange = note;
    if (!/Google 日本語/.test(note)) failures.push(`listen note does not name the picked voice: "${note}"`);
    const pref = await page.evaluate(`localStorage.getItem('kairo-voice-pref-v1')`);
    if (pref !== 'Google 日本語') failures.push(`preference not persisted: ${pref}`);
    await page.screenshot({ path: join(OUT, 'picker-after.png') });
  }
}
await browser.close();
server.close();
receipt.failures = failures;
receipt.status = failures.length ? 'failed' : 'passed';
writeFileSync(join(OUT, 'voice-picker.json'), JSON.stringify(receipt, null, 2) + '\n');
if (failures.length) { console.log('VOICE PICKER FAILURES:'); failures.forEach((f) => console.log(' -', f)); process.exit(1); }
console.log(`VOICE PICKER CLEAN — novelty voices hidden, compact hidden behind enhanced, preview speaks in the picked voice; evidence ${OUT}`);
