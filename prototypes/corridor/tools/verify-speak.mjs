#!/usr/bin/env node
/** 話す · Speak — the room walked in real browsers against a built site (DESIGN §5.3).
 *
 * WebKit (the referee) and Chromium at 390×844. The partner is the mock (speak-mock-partner.mjs): no live call, no key,
 * no spend. A shipped Kore clip stands in for his microphone: an init script answers getUserMedia with a stream made
 * from the clip through the page's own Web Audio, so the room's real capture graph (MediaStreamSource → AudioWorklet →
 * 16 kHz WAV) runs. Each case is a fresh browser context with a seeded record; every case writes a named row; the JSON
 * receipt is written from the finally, so a crash still leaves one; an uncaught page error fails the run.
 *
 *   S1 doors · S2 rest · S3 microphone · S4 a turn · S5 every word · S6 one sound · S7 Bridge · S8 look back ·
 *   S9 voice lock · S10 Japanese · S11 memory · S12 offline · S13 key hygiene and cost · S14 interruption ·
 *   S15 motion and contrast · S16 access · S17 leaving retires voice work · S18 a pending microphone · S19 accounting and
 *   settings fail closed · S20 an unsaved note · S21 an untyped correction · S22 one turn at a time · S23 影 end to end
 *   A full run (no SPEAK_CASES) adds one row per engine: no request tried any origin but the site and the provider.
 *
 * Usage:
 *   KAIRO_EVIDENCE_DIR=~/.dharma/… KAIRO_SITE_DIR=<built site> KAIRO_BROWSER=all|webkit|chromium \
 *     node prototypes/corridor/tools/verify-speak.mjs
 *   SPEAK_CASES=S4,S9 runs only those cases. SPEAK_FAULT=<name> serves one one-line mutant (below).
 *   --negatives runs every mutant (WebKit, its named cases) in a child and reports whether each was caught: caught means
 *   the named case ran to its end with no page error and its own witness check went red; a setup failure is "not run".
 *   SPEAK_NEGATIVES=a,b picks mutants; SPEAK_NEGATIVES_PARALLEL=n runs n at once; SPEAK_NEGATIVES_BREAK_SETUP=1 is the
 *   runner's own control (every child's setup fails, so every row must read "not run").
 *   SPEAK_SHOTS_DIR=<dir> also takes the WebKit shots (藍, 墨) and records one mock conversation (webm).
 *
 * Negative controls (each must fail the case named):
 *   device-voice  a reply spoken through speechSynthesis            → S2, S9
 *   charon-main   the main role voiced by Charon                    → S9
 *   revlog        a revlog row written when a planted word is used  → S4
 *   auto-save     reached-for words saved automatically             → S8
 *   mic-on-entry  getUserMedia called when the room opens           → S3
 *   tracks-kept   tracks not stopped at the end of a take           → S3
 *   key-in-url    the key placed in the request URL                 → S13
 *   no-gate       the evidence gate removed (an invented word kept) → S4
 *   late-opening-voice  the opening voiced after Back                → S17
 *   queued-voice  sentence two dispatched after End                 → S17
 *   pending-mic   a microphone granted after the page hid is kept   → S18
 *   spend-unchecked  an unrecorded cost leaves the next turn open   → S19
 *   settings-claim   "Saved" for a write the device refused         → S19
 *   notes-claim   a note the record refused called remembered       → S20
 *   untyped-word  an untyped correction admitted as a word          → S21
 *   overlap       a second turn sent while one is in flight         → S22
 *   pin-only      the room keeps to its pin over V's lock in the app → S9
 *   token-dropped the top bar's Save given the base alone           → S5
 *   blob-kept     a kept line played from a blob: URL               → S12 (WebKit offline refuses it)
 *   no-his-pitch  his pitch line not drawn                          → S23
 *   residue-target  a corrected line checked against its kana alone → S23
 *   ended-no-shadow shadowing refused once the talk has ended       → S23
 *
 * Claim boundary: this proves the room's behaviour against a mock partner in headless engines. It does not prove a
 * live model's answers, latency, forgiveness or Kore's readings (LIVE-1), nor the iPhone's microphone prompt, audio
 * session or volume after a take (LIVE-2). Frame times are a headless proxy; the phone is the truth.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { startMockPartner } from './speak-mock-partner.mjs';
import * as core from '../speak-core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(HERE, '..');
const require = createRequire(import.meta.url);

const FAULTS = {
  'device-voice': { file: 'speak.js', witness: { S2: /no device voice after a line/u, S9: /device voice is never asked/u },
    from: '    host.stopAudio();\n    const clips = line.voice || voiceLine(line);',
    to: '    host.stopAudio(); window.speechSynthesis?.speak(new SpeechSynthesisUtterance(line.text));\n    const clips = line.voice || voiceLine(line);' },
  'charon-main': { file: 'speak-core.mjs', witness: { S9: /said by Kore/u },
    from: '  return lock.mainVoice.prebuilt;\n}', to: '  return lock.secondaryVoice.prebuilt;\n}' },
  revlog: { file: 'corridor.js', witness: { S4: /byte-identical/u },
    from: 'const ok = await commitStorePatch((latest) => (evidence.length ? { obslog: [...latest.obslog, ...evidence] } : {}), archiveRows);',
    to: 'const ok = await commitStorePatch((latest) => (evidence.length ? { obslog: [...latest.obslog, ...evidence], revlog: [...latest.revlog, [Date.now(), evidence[0][2], 3, 2, null, null, null, null, 0, 0, 0, 0]] } : {}), archiveRows);' },
  'auto-save': { file: 'speak.js', witness: { S8: /nothing is saved without his tap/u },
    from: '    for (const r of tr.reached) if (!s.reached.some((x) => x.word === r.word)) s.reached.push(r);',
    to: '    for (const r of tr.reached) if (!s.reached.some((x) => x.word === r.word)) { s.reached.push(r); host.saveOne({ word: r.word, reading: r.reading }).click(); }' },
  'mic-on-entry': { file: 'speak.js', witness: { S3: /never called on entry/u },
    from: '    st.offline = navigator.onLine === false;\n    st.sceneAsked = scene;',
    to: '    st.offline = navigator.onLine === false; navigator.mediaDevices?.getUserMedia({ audio: true }).catch(() => {});\n    st.sceneAsked = scene;' },
  'tracks-kept': { file: 'speak.js', witness: { S3: /all tracks stopped/u },
    from: '    for (const track of take.stream.getTracks()) track.stop();', to: '    for (const track of take.stream.getTracks()) void track;' },
  'key-in-url': { file: 'speak.js', witness: { S13: /absent from every URL/u },
    from: '        res = await fetch(`${tp.endpoint}${path}`, {', to: '        res = await fetch(`${tp.endpoint}${path}?key=${tp.key}`, {' },
  'no-gate': { file: 'corridor.js', witness: { S4: /none invented|gates agree/u },
    from: 'function speakGateEvidence(found, xid, now = Date.now()) {\n  const subjectKey = (raw, type) => {',
    to: 'function speakGateEvidence(found, xid, now = Date.now()) {\n  const subjectKey = (raw, type) => (String(raw || \'\').trim() ? `${type || \'word\'}:${String(raw).trim()}` : null);\n  const subjectKeyGated = (raw, type) => {' },
  // Codex at acb125d2, the six groups: each fix with its own witness
  'late-opening-voice': { file: 'speak.js', witness: { S17: /Back while the opening waits/u },
    from: '      if (epoch !== st.epoch || s !== st.session || s.ended) return;\n      voiceLine(line);', to: '      voiceLine(line);' },
  'queued-voice': { file: 'speak.js', witness: { S17: /sentence two/u },
    from: '        if (gen !== st.voiceGen) { line.aborted = true; return null; }', to: '        void gen;' },
  'pending-mic': { file: 'speak.js', witness: { S18: /hidden while the microphone was pending/u },
    from: "    const wanted = () => capture === st.captureGen && epoch === st.epoch && st.phase === 'listening' && !document.hidden;",
    to: '    const wanted = () => true;' },
  'spend-unchecked': { file: 'speak.js', witness: { S19: /could not record/u },
    from: "    if (!flushSpend()) { setStatus('accounting'); return false; }", to: '    flushSpend();' },
  'settings-claim': { file: 'speak.js', witness: { S19: /say Saved only/u },
    from: '      if (!saved) {\n        // nothing is claimed and nothing typed is lost', to: '      if (false) {\n        // nothing is claimed and nothing typed is lost' },
  'notes-claim': { file: 'speak.js', witness: { S20: /not kept/u },
    from: '    if (!result?.ok) { s.notesFailed = pending; return false; }', to: '    void result;' },
  'untyped-word': { file: 'speak.js', witness: { S21: /untyped correction/u },
    from: 'subjectType: c.subjectType, polarity: 1, code: c.code });', to: "subjectType: c.subjectType || 'word', polarity: 1, code: c.code });" },
  // the canonical lock: the room must read V's lock where the app carries it, not keep to its own pin
  'pin-only': { file: 'corridor.js', witness: { S9: /not its own pin/u },
    from: "    voiceLock: () => (typeof VOICE_LOCK !== 'undefined' ? VOICE_LOCK : null),", to: '    voiceLock: () => null,' },
  // 影 end to end: his pitch line over hers, and shadowing still listening after End
  'no-his-pitch': { file: 'speak.js', witness: { S23: /shadowing Kore's line/u },
    from: '    if (hisLine) pic.append(hisLine);', to: '    void hisLine;' },
  'residue-target': { file: 'speak.js', witness: { S23: /after End/u },
    from: "    const targetKana = tokened ? readingOf(line) : tr.targetKana || '';", to: '    const targetKana = readingOf(line);' },
  // the top bar's Save takes the whole token (Codex: the surface was dropped before R could derive identity)
  'token-dropped': { file: 'corridor.js', witness: { S5: /whole token he touched/u },
    from: '      speakKeepWord = word ? { word, surface: surface || word, reading } : null;', to: "      speakKeepWord = word ? { word, surface: word, reading: '' } : null;" },
  'blob-kept': { file: 'speak.js', witness: { S12: /plays on, not only starts/u },
    from: "  const keptUrl = (wav) => `data:audio/wav;base64,${core.bytesToBase64(wav)}`;", to: "  const keptUrl = (wav) => URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));" },
  'ended-no-shadow': { file: 'speak.js', witness: { S23: /after End/u },
    from: "    const open = () => !s.ended || mode === 'shadow';", to: '    const open = () => !s.ended;' },
  overlap: { file: 'speak.js', witness: { S22: /never overlap/u },
    from: '    if (st.turnBusy) return false;\n    const token = ++st.turnToken;', to: '    const token = ++st.turnToken;' },
};

/* ---------------------------------------------------------------- the negative-control runner
 * A mutant counts as caught only when its child ran every named case to its end with no page error, and the intended
 * witness check went red. A setup failure, a timeout, a page error or a red elsewhere is "not run", never a kill. */
if (process.argv.includes('--negatives')) {
  const only = process.env.SPEAK_NEGATIVES ? new Set(process.env.SPEAK_NEGATIVES.split(',')) : null;
  const jobs = Object.entries(FAULTS).filter(([name]) => !only || only.has(name));
  const parallel = Math.max(1, Math.min(4, Number(process.env.SPEAK_NEGATIVES_PARALLEL) || 1));
  /** One mutant in its own child: its named cases only, its own evidence folder. */
  const runOne = ([name, fault]) => new Promise((done) => {
    const cases = Object.keys(fault.witness);
    const evidence = join(resolveCorridorEvidence(), `negative-${name}`);
    mkdirSync(evidence, { recursive: true });
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], {
      env: { ...process.env, SPEAK_FAULT: name, SPEAK_CASES: cases.join(','), KAIRO_BROWSER: process.env.KAIRO_BROWSER || 'webkit',
        KAIRO_EVIDENCE_DIR: evidence, SPEAK_SHOTS_DIR: '', SPEAK_BREAK_SETUP: process.env.SPEAK_NEGATIVES_BREAK_SETUP === '1' ? '1' : '' },
      stdio: 'ignore',
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), 900_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      let receipt = null;
      try { receipt = JSON.parse(readFileSync(join(evidence, 'verify-speak.json'), 'utf8')); } catch { /* no receipt */ }
      const reds = (receipt?.checks || []).filter((c) => !c.pass);
      const perCase = cases.map((id) => {
        const ran = (receipt?.cases || []).some((c) => c.case === id && c.checks > 0) && !reds.some((c) => c.case === id && c.name === 'the case ran to its end');
        const witness = reds.find((c) => c.case === id && fault.witness[id].test(c.name));
        return { case: id, ran, witness: witness ? witness.name : null };
      });
      const clean = !!receipt && !receipt.error && (receipt.pageErrors || []).length === 0;
      const status = !clean || perCase.some((c) => !c.ran) ? 'not-run' : code !== 0 && perCase.every((c) => c.witness) ? 'caught' : 'missed';
      const row = { fault: name, file: fault.file, status, exit: code, cases: perCase,
        otherReds: reds.filter((c) => !perCase.some((p) => p.witness === c.name)).map((c) => `${c.case}: ${c.name}`) };
      console.log(`  ${status.padEnd(7)} ${name} (${fault.file}) → ${perCase.map((c) => `${c.case} ${c.witness ? `red at "${c.witness}"` : c.ran ? 'witness green' : 'did not run'}`).join('; ')}; exit ${code}`);
      done(row);
    });
  });
  const rows = [];
  const queue = [...jobs];
  await Promise.all(Array.from({ length: parallel }, async () => { while (queue.length) rows.push(await runOne(queue.shift())); }));
  rows.sort((a, b) => jobs.findIndex(([n]) => n === a.fault) - jobs.findIndex(([n]) => n === b.fault));
  const out = join(resolveCorridorEvidence(), 'verify-speak-negatives.json');
  writeFileSync(out, `${JSON.stringify({ at: new Date().toISOString(), parallel, rows }, null, 2)}\n`);
  const caught = rows.filter((r) => r.status === 'caught').length;
  console.log(`negatives: ${caught}/${rows.length} caught · ${rows.filter((r) => r.status === 'not-run').length} not run · ${out}`);
  process.exit(caught === rows.length ? 0 : 1);
}

/* ---------------------------------------------------------------- the run */
const SITE = resolveCorridorSite();
const EVIDENCE = resolveCorridorEvidence();
const WHICH = process.env.KAIRO_BROWSER || 'all';
const ONLY = process.env.SPEAK_CASES ? new Set(process.env.SPEAK_CASES.split(',').map((x) => x.trim()).filter(Boolean)) : null;
const FAULT_NAME = process.env.SPEAK_FAULT || '';
const FAULT = FAULT_NAME ? FAULTS[FAULT_NAME] : null;
assert(!FAULT_NAME || FAULT, `unknown SPEAK_FAULT ${FAULT_NAME}`);
const SHOTS = process.env.SPEAK_SHOTS_DIR || '';
const OVERLAY = process.env.SPEAK_OVERLAY_SOURCE === '1';
const KEY = 'speak-test-dummy-key-7f3a';
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' };
const WORLDS = ['hokusai', 'sumi', 'shu', 'akafuji', 'iwa', 'keyblock', 'rokusho', 'yoru', 'nami', 'hakuu', 'kaku'];
// Google's published rates (pricing page, 2026-10-15), written here independently of speak-core's table
const RATE = { 'gemini-3.5-flash-lite': { in: 0.30, out: 2.50 }, 'gemini-3.1-flash-tts-preview': { in: 1.00, out: 20.00 }, 'gemini-3.8-flash-tts': { in: 0.50, out: 9.00 } };
const SITE_LOCK = (() => {
  try { return core.voiceLockFrom(JSON.parse(readFileSync(join(SITE, 'audio/voice-lock.json'), 'utf8'))); } catch { return core.VOICE_LOCK; }
})();
const SILENT_WAV = `data:audio/wav;base64,${core.bytesToBase64(core.wavFromInt16(new Int16Array(24000), 24000))}`;

const results = [];
const engines = { offOrigin: [], served: {} };
const pageErrors = [];
let current = '';
function check(name, pass, detail = '') {
  results.push({ engine: current.split(' ')[0], case: current.split(' ')[1], name, pass: !!pass, detail: String(detail).slice(0, 600) });
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${current} · ${name}${detail ? `  — ${String(detail).slice(0, pass ? 220 : 1400)}` : ''}`);
  return !!pass;
}

/** The test's hands inside the app: existing functions, reached from the page (appended to corridor.js as served). */
const BRIDGE = `
;{
  const speakCommits = [];
  const realCommit = commitStorePatch;
  let holdGate = null, releaseHold = null, refuseNotes = false;
  commitStorePatch = async (patch, appendArchive = []) => {
    if (appendArchive.length) speakCommits.push({ archive: appendArchive.map((r) => ({ surface: r.surface, role: r.role, xid: r.xid || null })), at: Date.now() });
    if (refuseNotes && appendArchive.some((r) => r.surface === 'speak-notes')) return false;
    if (holdGate && appendArchive.length) await holdGate;
    return realCommit(patch, appendArchive);
  };
  window.__SPEAK_TEST__ = {
    ready: () => !!S.ready && recordWritable(),
    view: () => S.view,
    snap: () => (speakRoom ? speakRoom.snapshot() : null),
    record: () => JSON.parse(JSON.stringify({ srs: S.srs, revlog: S.revlog, obslog: S.obslog, taken: S.taken.map((t) => ({ t: t.t, id: t.id })) })),
    commits: () => speakCommits.slice(),
    archive: async (surface) => JSON.parse(JSON.stringify(await aiLogAll(surface || null))),
    open: (scene) => openSpeakRoom(scene && scene.kind === 'article' ? { reader: scene.id } : 'dojo', scene || null),
    visit: (view) => { S.stack = []; S.view = view; render(); window.scrollTo(0, 0); },
    layout: (id) => { setLayout(id); render(); },
    theme: (id) => setKairoTheme(id),
    lang: (id) => { S.lang = id; render(); },
    reader: async (id) => { const p = D.passages.find((x) => x.id === id); await ensureArticle(p); openPassage(id); },
    back: () => back(),
    owned: () => !!recAudioEl,
    // while her voice is actually sounding, is it the app's one playback owner? null between sentences (nothing sounds)
    ownedNow: () => { const s = speakRoom?.snapshot(); return s && s.phase === 'speaking' && !s.audioPaused ? !!recAudioEl : null; },
    otherSound: (uri) => { void playRecClip(uri, null); },
    keepWord: () => document.getElementById('speak-keep')?.dataset.saveWord || '',
    keepToken: () => (speakKeepWord ? { ...speakKeepWord } : null),
    soundState: () => (recAudioEl ? { src: String(recAudioEl.currentSrc || '').slice(0, 24), t: recAudioEl.currentTime, d: recAudioEl.duration, paused: recAudioEl.paused,
      ended: recAudioEl.ended, error: recAudioEl.error?.code || null, ready: recAudioEl.readyState } : null),
    hold: (on) => { if (on && !holdGate) holdGate = new Promise((done) => { releaseHold = done; }); if (!on && holdGate) { holdGate = null; releaseHold(); } },
    refuseNotes: (on) => { refuseNotes = !!on; },
    gateAgree: async (fixture) => {
      const xid = 'xgate-1';
      const speak = speakGateEvidence(fixture, xid).map((row) => row.slice(1));
      const realAsk = aiAsk, realKey = aiKey;
      aiAsk = async () => JSON.stringify(fixture);
      aiKey = () => 'gate-agreement';
      const before = S.obslog.length;
      try { await aiMineObservations('chat', 'learner ink', 'reply', xid); } finally { aiAsk = realAsk; aiKey = realKey; }
      const mine = S.obslog.slice(before).map((row) => row.slice(1));
      return { speak, mine };
    },
  };
}
`;

/** The record a learner brings: words missed, marked not yet, looked up twice, one due; the sky's own order. */
function seedRecord() {
  const t = Date.now();
  const day = 86400000;
  return {
    v: 1,
    taken: [{ t: 'word', id: '内閣', label: '内閣', ts: t - 3 * day, started: t - 3 * day }],
    srs: {}, revlog: [],
    obslog: [
      [t - 2 * day, 'lesson', 'word:加工', 1, 'N2-1'],
      [t - 1 * day, 'reveal', 'word:大正', 0],
      [t - 5 * 3600000, 'tap', 'word:寺院', 2, 'seed'],
      [t - 2 * 3600000, 'tap', 'word:寺院', 2, 'seed'],
    ],
  };
}

async function newRoom(browser, { key = true, cap = 10, usd = 0, reducedMotion = 'no-preference', deny = false, video = null, theme = null, mirror = null } = {}) {
  // the runner's own control (SPEAK_NEGATIVES_BREAK_SETUP=1): a case whose setup fails must count as not run, never a kill
  if (process.env.SPEAK_BREAK_SETUP === '1') throw new Error('the room could not be set up (the runner\'s control)');
  const context = await browser.newContext({ ...PHONE, reducedMotion, ...(video ? { recordVideo: { dir: video, size: { width: 390, height: 844 } } } : {}) });
  const f = { context, page: null, console: [], requests: [], errors: [] };
  await silenceBrowserAudio(context);
  const base = engines.origin;
  // the site: corridor.js carries the test's hands; a fault serves its one-line mutant; nothing leaves 127.0.0.1
  await context.route((url) => url.origin !== base && url.origin !== engines.mock.origin, (route) => {
    const request = route.request();
    engines.offOrigin.push({ case: current, method: request.method(), url: request.url().slice(0, 300), body: (request.postData() || '').slice(0, 4000) });
    return route.abort();
  });
  await context.route((url) => url.origin === base && /\/(corridor\.js|speak\.js|speak-core\.mjs|rooms\/speak\.css)$/u.test(url.pathname), async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\//u, '');
    const name = path.split('/').pop();
    // SPEAK_OVERLAY_SOURCE=1 (development only, marked in the receipt): the room's own files come from the worktree
    let body = OVERLAY ? readFileSync(join(SOURCE, path), 'utf8') : await (await route.fetch()).text();
    if (FAULT && FAULT.file === name) {
      assert.equal(body.split(FAULT.from).length, 2, `fault anchor must occur once in ${name}`);
      body = body.replace(FAULT.from, FAULT.to);
    }
    // V's lock as the app carries it: its generated mirror in corridor.js (replaced where the merge brought it, else added)
    if (name === 'corridor.js' && mirror) {
      const block = `/* === VOICE_LOCK · generated from audio/voice-lock.json by tools/sync-voice-lock.mjs — do not hand-edit === */\nconst VOICE_LOCK = ${JSON.stringify(mirror, null, 2)};\n/* === end VOICE_LOCK === */\n`;
      const at = /\/\* === VOICE_LOCK[^\n]*\n[\s\S]*?\/\* === end VOICE_LOCK === \*\/\n?/u;
      body = at.test(body) ? body.replace(at, block) : `${body}\n${block}`;
    }
    (engines.served[name] ||= new Set()).add(createHash('sha256').update(body).digest('hex'));
    if (name === 'corridor.js') body += BRIDGE;
    await route.fulfill({ status: 200, body, contentType: name.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8' });
  });
  await context.addInitScript(({ seed, key, cap, usd, endpoint, origin, deny, theme }) => {
    const spy = window.__SPEAK_SPY__ = { speech: 0, plays: [], fetches: [], gum: [], streams: [], contexts: [], deny, clip: '003' };
    // the device voice: it must never be asked
    const speechProto = window.SpeechSynthesis?.prototype;
    if (speechProto) {
      const real = speechProto.speak;
      Object.defineProperty(speechProto, 'speak', { configurable: true, writable: true, value(...args) { spy.speech += 1; return real.apply(this, args); } });
    }
    const media = HTMLMediaElement.prototype;
    // how far any sound actually played: each element that plays reports its own time (the room's <audio> need not be in
    // the document, where a document listener would never hear it)
    const timed = new WeakSet();
    const realPlay = media.play;
    media.play = function play(...args) {
      if (!timed.has(this)) {
        timed.add(this);
        this.addEventListener('timeupdate', () => { spy.advanced = Math.max(spy.advanced || 0, this.currentTime || 0); });
        // a clip that played through: its whole length counts (an element ends only after playing, never on an error)
        this.addEventListener('ended', () => { spy.ends = (spy.ends || 0) + 1; spy.advanced = Math.max(spy.advanced || 0, this.currentTime || 0, Number.isFinite(this.duration) ? this.duration : 0); });
        this.addEventListener('error', () => { spy.mediaErrors = [...(spy.mediaErrors || []), this.error?.code || 0]; });
      }
      spy.plays.push({ at: performance.now(), src: String(this.currentSrc || this.src || '').slice(0, 24), rate: this.playbackRate });
      return realPlay.apply(this, args);
    };
    // device storage that can refuse: the meter's write, the key's write, the key's removal (inert unless a case asks)
    const store = Storage.prototype, realSet = store.setItem, realRemove = store.removeItem;
    store.setItem = function setItem(key, value) {
      if ((spy.failSpend && key === 'kairo-speak-spend-v1') || (spy.failDevice && key === 'kairo-speak-device-v1')) throw new DOMException('refused (test)', 'QuotaExceededError');
      return realSet.call(this, key, value);
    };
    store.removeItem = function removeItem(key) {
      if (spy.failRemove && key === 'kairo-speak-device-v1') throw new DOMException('refused (test)', 'SecurityError');
      return realRemove.call(this, key);
    };
    const realFetch = window.fetch;
    window.fetch = function fetchSpy(input, init = {}) {
      const url = String(input?.url || input);
      if (url.includes('/v1beta/')) spy.fetches.push({ url, credentials: init.credentials || null, redirect: init.redirect || null, referrerPolicy: init.referrerPolicy || null });
      return realFetch.call(this, input, init);
    };
    const RealContext = window.AudioContext;
    spy.RealAudioContext = RealContext;
    window.AudioContext = function AudioContext(...args) { const ctx = new RealContext(...args); spy.contexts.push(ctx); return ctx; };
    window.AudioContext.prototype = RealContext.prototype;
    // the learner's microphone is a shipped Kore clip (test only). Its own audio graph starts on his first tap or key,
    // as a real microphone needs no graph: WebKit lets an AudioContext run only from a gesture, and the ring opens to
    // listen on its own after her line, outside one
    const primeMic = () => {
      try { spy.micContext ||= new RealContext(); if (spy.micContext.state !== 'running') spy.micContext.resume().catch(() => {}); } catch { /* no audio */ }
    };
    addEventListener('click', primeMic, true);
    addEventListener('keydown', primeMic, true);
    if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { value: {} });
    spy.gumErrors = [];
    // on the prototype: WebKit can hand the page a fresh MediaDevices object later, which an own property would miss
    const standIn = async (constraints) => {
      spy.gum.push({ at: performance.now(), constraints: JSON.stringify(constraints) });
      if (spy.deny) throw new DOMException('Permission denied', 'NotAllowedError');
      // a permission still being asked: the stream comes only when the case releases it
      if (spy.holdMic) await new Promise((done) => { spy.releaseMic = done; });
      let step = 'context';
      try {
        const ctx = spy.micContext ||= new RealContext();
        step = `resume(${ctx.state})`;
        if (ctx.state !== 'running') await ctx.resume();
        const clip = spy.clip || '003';
        step = 'fetch';
        const bytes = await (await fetch(`audio/narration/kore/jawiki_5294446-${clip}.m4a`)).arrayBuffer();
        step = 'decode';
        const buffer = await ctx.decodeAudioData(bytes);
        step = 'graph';
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const dest = ctx.createMediaStreamDestination();
        source.connect(dest);
        source.start();
        spy.streams.push(dest.stream);
        return dest.stream;
      } catch (error) {
        spy.gumErrors.push(`${step}: ${error?.name}: ${String(error?.message || '').slice(0, 80)}`);
        throw error;
      }
    };
    const devicesProto = window.MediaDevices?.prototype;
    if (devicesProto) Object.defineProperty(devicesProto, 'getUserMedia', { configurable: true, writable: true, value: function getUserMedia(constraints) { return standIn(constraints); } });
    else navigator.mediaDevices.getUserMedia = standIn;
    spy.standIn = true;
    window.__KAIRO_SPEAK_ENDPOINT__ = endpoint;
    if (sessionStorage.getItem('speak-seeded')) return;
    sessionStorage.setItem('speak-seeded', '1');
    localStorage.setItem('kairo-corridor-v1', JSON.stringify(seed));
    if (theme) localStorage.setItem('kairo-theme', theme);
    if (key) localStorage.setItem('kairo-speak-device-v1', JSON.stringify({ v: 1, configId: crypto.randomUUID(), credential: { origin, key }, models: { ears: 'gemini-3.5-flash-lite' } }));
    if (cap) {
      const now = new Date();
      localStorage.setItem('kairo-speak-spend-v1', JSON.stringify({ v: 1, month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, usd, cap }));
    }
  }, { seed: seedRecord(), key: key ? KEY : null, cap, usd, endpoint: engines.mock.endpoint, origin: engines.mock.origin, deny, theme });
  const page = await context.newPage();
  f.page = page;
  engines.last = f;
  page.on('console', (message) => f.console.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => { f.errors.push(String(error?.message || error)); pageErrors.push(`${current}: ${String(error?.message || error)}`); });
  page.on('request', (request) => f.requests.push(request.url()));
  await page.goto(`${base}/index.html`);
  await page.waitForFunction(() => window.__SPEAK_TEST__?.ready(), null, { timeout: 30000 });
  return f;
}
const T = (page) => ({
  snap: () => page.evaluate(() => window.__SPEAK_TEST__.snap()),
  record: () => page.evaluate(() => window.__SPEAK_TEST__.record()),
  view: () => page.evaluate(() => window.__SPEAK_TEST__.view()),
  spy: () => page.evaluate(() => { const s = window.__SPEAK_SPY__; return { speech: s.speech, plays: s.plays, fetches: s.fetches, gum: s.gum.length,
    tracks: s.streams.flatMap((stream) => stream.getTracks().map((track) => track.readyState)) }; }),
});
/** What the page looked like when a wait gave up: the room's state, the view, a room error, the console, the mock. */
async function diag(page) {
  let state = null;
  try {
    state = await page.evaluate(() => ({ view: window.__SPEAK_TEST__?.view(), snap: window.__SPEAK_TEST__?.snap(),
      roomError: document.querySelector('[data-room-error]')?.textContent?.slice(0, 160) || null,
      status: document.querySelector('.speak-status')?.textContent?.slice(0, 160) || null }));
  } catch (error) { state = { closed: String(error.message).slice(0, 80) }; }
  const f = engines.last;
  const consoleTail = (f?.console || []).filter((line) => /^(error|warning)/u.test(line)).slice(-5).join(' | ').slice(0, 500);
  const mock = engines.mock.requests.slice(-6).map((r) => `${r.kind}:${r.mode || r.voiceName || ''}`).join(' ');
  let mic = null;
  try {
    mic = await page.evaluate(() => ({ calls: window.__SPEAK_SPY__.gum.length, errors: window.__SPEAK_SPY__.gumErrors,
      gumIsStub: String(navigator.mediaDevices?.getUserMedia).includes('standIn'), own: !!Object.getOwnPropertyDescriptor(navigator.mediaDevices || {}, 'getUserMedia'),
      spySame: !!window.__SPEAK_SPY__ }));
  } catch { /* gone */ }
  return `state ${JSON.stringify(state).slice(0, 700)} · mic ${JSON.stringify(mic)} · mock [${mock}] · console [${consoleTail}] · pageerrors [${(f?.errors || []).slice(-3).join(' | ').slice(0, 300)}]`;
}
/** A page-level wait that, when it gives up, says which step it was and what the page looked like. */
async function waitPage(page, fn, arg, timeout, label) {
  try { await page.waitForFunction(fn, arg, { timeout, polling: 50 }); }
  catch (error) { throw new Error(`${label}: ${String(error.message).split('\n')[0]} · ${await diag(page)}`); }
}
async function until(page, expression, timeout = 15000) {
  try {
    await page.waitForFunction((src) => {
      const s = window.__SPEAK_TEST__.snap();
      try { return !!s && Function('s', `return (${src});`)(s); } catch { return false; }
    }, expression, { timeout, polling: 50 });
  } catch (error) {
    throw new Error(`waited ${timeout} ms for ${expression} · ${await diag(page)}`);
  }
}
async function enter(page, scene = null) {
  try {
    await page.evaluate((sc) => window.__SPEAK_TEST__.open(sc), scene);
    await page.waitForFunction(() => window.__SPEAK_TEST__.view() === 'speak', null, { timeout: 10000 });
    await page.waitForSelector('#speak-enso', { timeout: 15000 });
  } catch (error) {
    throw new Error(`entering the room: ${String(error.message).split('\n')[0]} · ${await diag(page)}`);
  }
}
async function opened(page) {
  await until(page, "s.session && s.session.lines.some((l) => l.kind === 'opening')");
}
const ensoLocator = (page) => page.locator('#speak-enso');
/** His thumb on the ring; a refused click says what stands over the ring and why. */
const ring = (page) => ({
  click: async () => {
    try { await ensoLocator(page).click({ timeout: 8000 }); }
    catch (error) {
      const over = await page.evaluate(() => {
        const ring = document.getElementById('speak-enso');
        if (!ring) return 'no ring';
        const r = ring.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], over: top ? `${top.tagName}#${top.id}.${String(top.className?.baseVal ?? top.className).slice(0, 40)}` : null,
          disabled: ring.getAttribute('aria-disabled'), phase: ring.dataset.phase, vh: innerHeight };
      }).catch(() => 'page gone');
      throw new Error(`the ring refused a tap: ${String(error.message).split('\n')[0]} · ${JSON.stringify(over)} · ${await diag(page)}`);
    }
  },
  focus: () => ensoLocator(page).focus(),
  getAttribute: (name) => ensoLocator(page).getAttribute(name),
  evaluate: (fn) => ensoLocator(page).evaluate(fn),
});
/** One turn: the clip is "said" for holdMs, his tap ends the take, Kore answers and (her voice done) the ring listens again. */
async function talk(page, clip, holdMs = 1800, { expectReply = true, mockClip = clip } = {}) {
  engines.mock.set({ clip: mockClip });
  await page.evaluate((c) => { window.__SPEAK_SPY__.clip = c; }, clip);
  let s = await T(page).snap();
  if (s.phase !== 'listening') {
    if (s.phase === 'speaking') await until(page, "s.phase === 'listening'", 20000);
    else { await ring(page).click(); await until(page, "s.phase === 'listening' && s.take", 20000); }
  }
  await until(page, 's.take', 10000);
  const before = (await T(page).snap()).session.lines.length;
  await page.waitForTimeout(holdMs);
  await ring(page).click();
  if (expectReply) await until(page, `s.session.lines.length >= ${before + 2}`, 20000);
}
/** Kore's voice for the last line has finished and the ring listens again (within the minute). */
const settled = (page) => until(page, "s.phase === 'listening' || s.phase === 'rest'", 25000);
const mockSince = (n) => engines.mock.requests.slice(n);
/** Wait (in node) until the mock has received a request that matches. */
async function mockSaw(match, timeout = 15000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (engines.mock.requests.some(match)) return true; await new Promise((done) => setTimeout(done, 40)); }
  throw new Error(`the mock never saw the expected request · ${engines.mock.requests.slice(-4).map((r) => `${r.kind}:${r.mode || r.text || ''}`).join(' ')}`);
}
const hide = (page, hidden) => page.evaluate((h) => {
  if (h) {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  } else { delete document.hidden; delete document.visibilityState; }
  document.dispatchEvent(new Event('visibilitychange'));
}, hidden);
function contrast(a, b) {
  const lum = (rgb) => {
    const [r, g, bl] = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/* ---------------------------------------------------------------- the cases */
const CASES = {
  async S1(browser) {
    const f = await newRoom(browser);
    const { page } = f;
    try {
      // the Learn room's study door (current layout), and back
      await page.evaluate(() => window.__SPEAK_TEST__.visit('dojo'));
      await page.waitForTimeout(1200);
      const door = page.locator('[data-study-door="speak"]');
      check('the Learn room has one Speak door, a study-door row', (await door.count()) === 1 && (await page.locator('button.study-door[data-study-door="speak"]').count()) === 1);
      await door.click();
      await until(page, "s.scene === 'free' && s.session");
      check('the Learn door opens the room on free talk', (await T(page).view()) === 'speak' && (await T(page).snap()).scene === 'free');
      await page.evaluate(() => window.__SPEAK_TEST__.back());
      await page.waitForFunction(() => window.__SPEAK_TEST__.view() !== 'speak', null, { timeout: 8000 });
      check('Back returns to Learn', (await T(page).view()) === 'dojo', await T(page).view());
      // the layout under test: the Tests place holds it
      await page.evaluate(() => { window.__SPEAK_TEST__.layout('places'); window.__SPEAK_TEST__.visit('tests'); });
      await page.waitForTimeout(1200);
      const tdoor = page.locator('[data-study-door="speak"]');
      check('the Tests place (layout under test) has the Speak door', (await tdoor.count()) === 1);
      await tdoor.click();
      await until(page, 's.session');
      await page.evaluate(() => window.__SPEAK_TEST__.back());
      await page.waitForFunction(() => window.__SPEAK_TEST__.view() !== 'speak', null, { timeout: 8000 });
      check('Back returns to Tests', (await T(page).view()) === 'tests', await T(page).view());
      await page.evaluate(() => window.__SPEAK_TEST__.layout('current'));
      // the article's foot: the chip beside 読み終えた opens the article's scene; Back returns to the same line
      const id = 'jawiki:5294446';
      await page.evaluate((x) => window.__SPEAK_TEST__.reader(x), id);
      await page.waitForSelector('#read-speak', { timeout: 15000 });
      const chip = page.locator('#read-speak');
      await chip.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      const before = await page.evaluate(() => Math.round(window.scrollY));
      const besideFin = await chip.evaluate((c) => c.parentElement?.classList.contains('read-done') && !!c.parentElement.querySelector('#read-fin'));
      check('the article foot carries one quiet chip beside 読み終えた', besideFin && (await chip.count()) === 1, await chip.textContent());
      await chip.click();
      await until(page, `s.scene === 'article:${id}' && s.session`);
      check('the chip opens the room with the article\'s scene', (await T(page).snap()).scene === `article:${id}`);
      await page.evaluate(() => window.__SPEAK_TEST__.back());
      await page.waitForFunction(() => window.__SPEAK_TEST__.view() === 'reader', null, { timeout: 8000 });
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => Math.round(window.scrollY));
      check('Back returns to the article\'s line, scroll within 4 px', Math.abs(after - before) <= 4, `before ${before} · after ${after}`);
    } finally { await f.context.close(); }
  },

  async S2(browser) {
    // without a key: the room makes no request at all
    {
      const f = await newRoom(browser, { key: false });
      const n = engines.mock.requests.length;
      await enter(f.page);
      await f.page.waitForTimeout(1200);
      const s = await T(f.page).snap();
      check('with no key, entering makes no request and says why in one line', mockSince(n).length === 0 && s.status === 'no-key', `requests ${mockSince(n).length} · status ${s.status}`);
      check('with no key, the ensō is drawn open', (await ring(f.page).getAttribute('data-phase')) === 'open');
      await f.context.close();
    }
    const f = await newRoom(browser);
    const { page } = f;
    try {
      const n = engines.mock.requests.length;
      await enter(page);
      await opened(page);
      await page.waitForTimeout(1500);
      const reqs = mockSince(n);
      const brains = reqs.filter((r) => r.kind === 'brain');
      const voices = reqs.filter((r) => r.kind === 'voice');
      const openingSentences = core.splitSentences((await T(page).snap()).session.lines[0].text).length;
      check('entering makes only the opening line\'s requests: its text, then its voice', brains.length === 1 && brains[0].mode === 'open' && voices.length === openingSentences && reqs.every((r) => r.kind),
        reqs.map((r) => `${r.kind}:${r.mode || r.voiceName}`).join(' '));
      check('no audio leaves the phone on entry', brains.every((r) => !r.body.contents.at(-1).parts.some((p) => p.inlineData)));
      const spy = await T(page).spy();
      check('nothing plays before his first tap', spy.plays.length === 0, `plays ${spy.plays.length}`);
      check('the device voice is never asked', spy.speech === 0, `speech ${spy.speech}`);
      const shape = await page.evaluate(() => ({
        bars: document.querySelectorAll('#app > .chrome').length,
        saves: document.querySelectorAll('#app > .chrome [data-save-bar]').length,
        keep: !!document.getElementById('speak-keep'),
        enso: document.querySelectorAll('#speak-enso').length,
        head: !!document.querySelector('.speak-head .speak-title') && !!document.querySelector('.speak-head .speak-role'),
        saveOnes: document.querySelectorAll('#app main button.save-one').length,
      }));
      check('one top bar, one Save in it (the room\'s keep), the ensō, the scene head', shape.bars === 1 && shape.saves === 1 && shape.keep && shape.enso === 1 && shape.head && shape.saveOnes === 0, JSON.stringify(shape));
      const moving = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && document.querySelector('.speak-room')?.contains(a.effect?.target)).map((a) => a.animationName || a.constructor.name));
      check('nothing animates at rest', moving.length === 0, moving.join(','));
      check('the ring is at rest, unpressed', (await ring(page).getAttribute('data-phase')) === 'rest' && (await ring(page).getAttribute('aria-pressed')) === 'false');
      // his first tap: her line plays through the one owner
      await ring(page).click();
      await until(page, "s.phase === 'speaking' || s.phase === 'listening'", 10000);
      await settled(page);
      const after = await T(page).spy();
      // the first play is the 50 ms silence that unlocks the one element (iOS); her line is the play after it
      check('his first tap unlocks the voice and plays her opening', after.plays.length >= 2 && after.plays.slice(1).some((p) => p.src.startsWith('blob:')), JSON.stringify(after.plays.slice(0, 3)));
      check('still no device voice after a line was spoken', after.speech === 0, `speech ${after.speech}`);
    } finally { await f.context.close(); }
  },

  async S3(browser) {
    const f = await newRoom(browser);
    const { page } = f;
    try {
      await enter(page);
      await opened(page);
      await page.waitForTimeout(600);
      check('getUserMedia is never called on entry', (await T(page).spy()).gum === 0, `calls ${(await T(page).spy()).gum}`);
      await ring(page).click();
      await until(page, "s.phase === 'listening' && s.take", 20000);
      const during = await T(page).spy();
      check('the ring opens to listen on its own after her line, and only then asks for the microphone', during.gum === 1 && during.tracks.every((x) => x === 'live'), JSON.stringify(during.tracks));
      await page.waitForTimeout(1200);
      await ring(page).click();
      await until(page, '!s.take', 10000);
      const ended = await T(page).spy();
      check('every take ends with all tracks stopped', ended.tracks.length > 0 && ended.tracks.every((x) => x === 'ended'), JSON.stringify(ended.tracks));
      await until(page, "s.phase === 'listening' && s.take", 30000);
      await page.evaluate(() => window.__SPEAK_TEST__.back());
      await page.waitForFunction(() => window.__SPEAK_TEST__.view() !== 'speak', null, { timeout: 8000 });
      await page.waitForTimeout(300);
      const left = await T(page).spy();
      check('leaving the room stops every track', left.tracks.every((x) => x === 'ended'), JSON.stringify(left.tracks));
    } finally { await f.context.close(); }
    // a denied permission: one plain line and the typed way, never a dead end
    const g = await newRoom(browser, { deny: true });
    try {
      await enter(g.page);
      await opened(g.page);
      await ring(g.page).click();
      await until(g.page, "s.status === 'mic-denied'", 20000);
      const typed = await g.page.locator('.speak-type-input').count();
      check('a denied microphone leads to one plain line and the typed way', typed === 1 && (await g.page.locator('.speak-status-t').count()) === 1);
      const n = engines.mock.requests.length;
      await g.page.fill('.speak-type-input', 'How do I say pearl processing?');
      await g.page.locator('.speak-type button[type="submit"]').click();
      await until(g.page, 's.session.lines.length >= 3', 15000);
      check('a typed line goes as Bridge and Kore answers', mockSince(n).some((r) => r.kind === 'brain' && r.typed && r.mode === 'bridge'));
    } finally { await g.context.close(); }
  },

  async S4(browser) {
    const f = await newRoom(browser);
    const { page } = f;
    try {
      await enter(page);
      await opened(page);
      const before = await T(page).record();
      const commitsBefore = (await page.evaluate(() => window.__SPEAK_TEST__.commits())).length;
      const n = engines.mock.requests.length;
      await talk(page, '003', 2000);
      const s = await T(page).snap();
      const brain = mockSince(n).find((r) => r.kind === 'brain' && r.mode === 'talk');
      const wav = brain?.wav;
      check('the mock receives a 16 kHz mono 16-bit WAV', wav?.mimeType === 'audio/wav' && wav.sampleRate === 16000 && wav.channels === 1 && wav.bits === 16, JSON.stringify(wav));
      check('the take carries his voice, not silence (RMS of the received WAV)', wav && wav.rms > 0.01, `rms ${wav?.rms?.toFixed(4)}`);
      check('the WAV\'s length matches the take', wav && s.wav && Math.abs(wav.seconds - s.wav.seconds) < 0.01 && Math.abs(s.wav.seconds - s.wav.tookMs / 1000) <= 0.35,
        `wav ${wav?.seconds?.toFixed(2)} s · take ${(s.wav?.tookMs / 1000).toFixed(2)} s · input ${s.wav?.inputRate} Hz`);
      const lines = s.session.lines;
      check('the page shows what Kore heard and her reply', lines.at(-2)?.who === 'me' && lines.at(-1)?.who === 'kore' && lines.at(-2).text.includes('名付けた'));
      const doors = await page.evaluate(() => [...document.querySelectorAll('.speak-line')].slice(-2).map((li) => li.querySelectorAll('.speak-text button').length));
      check('both lines are doors', doors.length === 2 && doors.every((x) => x > 2), JSON.stringify(doors));
      // sampled while her voice sounds: every sounding moment has the one owner
      const samples = [];
      for (let i = 0; i < 40 && samples.filter((x) => x !== null).length < 6; i += 1) {
        samples.push(await page.evaluate(() => window.__SPEAK_TEST__.ownedNow()));
        await page.waitForTimeout(40);
      }
      const sounding = samples.filter((x) => x !== null);
      check('her reply plays through the one playback owner', sounding.length > 0 && sounding.every((x) => x === true), JSON.stringify(samples));
      await settled(page);
      const after = await T(page).record();
      const commits = (await page.evaluate(() => window.__SPEAK_TEST__.commits())).slice(commitsBefore);
      const turnCommits = commits.filter((c) => c.archive.some((r) => r.role === 'user'));
      const xid = turnCommits[0]?.archive[0]?.xid;
      check('one atomic write carries the turn: three archive rows sharing one xid', turnCommits.length === 1 && turnCommits[0].archive.length === 3 &&
        turnCommits[0].archive.every((r) => r.surface === 'speak' && r.xid === xid) && ['user', 'assistant', 'app'].every((role) => turnCommits[0].archive.some((r) => r.role === role)),
        JSON.stringify(turnCommits));
      const added = after.obslog.slice(before.obslog.length).filter((row) => row[1] !== 'tap');
      const sensei = added.filter((row) => row[1] === 'sensei');
      check('the evidence is gated sensei rows of that exchange (≤ 4, codes valid, none invented)',
        sensei.length >= 1 && sensei.length <= 4 && sensei.every((row) => row[5] === xid && core.SENSEI_CODES.includes(row[4]) && [1, 3].includes(row[3])) &&
        !sensei.some((row) => String(row[2]).includes('ないかくゑ')) && added.every((row) => row[1] === 'sensei'), JSON.stringify(added));
      check('a planted word said unaided is prod-gap 3', sensei.some((row) => row[2] === 'word:内閣' && row[3] === 3 && row[4] === 'prod-gap'), JSON.stringify(sensei));
      check('S.srs and revlog are byte-identical before and after', JSON.stringify(before.srs) === JSON.stringify(after.srs) && JSON.stringify(before.revlog) === JSON.stringify(after.revlog));
      const archive = await page.evaluate(() => window.__SPEAK_TEST__.archive('speak'));
      check('the archive holds the turn under its session', archive.filter((r) => r.xid === xid).length === 3 && archive.every((r) => r.contextRef?.startsWith('speak:')));
      const fixture = [
        { kind: 'sensei', subject: '名付ける', subjectType: 'word', polarity: 1, code: 'form-miss' },
        { kind: 'sensei', subject: 'ないかくゑ', subjectType: 'word', polarity: 1, code: 'particle-drop' },
        { kind: 'sensei', subject: '内閣', subjectType: 'word', polarity: 3, code: 'invented-code' },
        { kind: 'sensei', subject: '内', subjectType: 'kanji', polarity: 1, code: 'misread' },
        { kind: 'sensei', subject: '命名', subjectType: 'word', polarity: 1, code: 'prod-gap' },
        { kind: 'sensei', subject: '内閣', subjectType: 'other', polarity: 1, code: 'misread' },
        { kind: 'confuse', subject: '歩', subjectType: 'kanji', other: '足', otherType: 'kanji' },
        { kind: 'sensei', subject: 'その', subjectType: 'word', polarity: 1, code: 'collocation' },
        { kind: 'sensei', subject: '内閣', subjectType: 'word', polarity: 3, code: 'prod-gap' },
      ];
      const agree = await page.evaluate((fx) => window.__SPEAK_TEST__.gateAgree(fx), fixture);
      check('the room\'s gate and the sensei mine\'s gate agree on one fixture', JSON.stringify(agree.speak) === JSON.stringify(agree.mine) && agree.speak.length === 4,
        `speak ${JSON.stringify(agree.speak)} · mine ${JSON.stringify(agree.mine)}`);
    } finally { await f.context.close(); }
  },

  async S5(browser) {
    const f = await newRoom(browser);
    const { page } = f;
    try {
      await enter(page);
      await opened(page);
      await talk(page, '003', 1500);
      await settled(page);
      const bare = await page.evaluate(() => {
        const out = [];
        for (const text of document.querySelectorAll('.speak-line .speak-text')) {
          const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const node = walker.currentNode;
            // named exemption (G3's ruling): the reading in parentheses after a word annotates that word
            if (node.parentElement.closest('button, .visually-hidden, .speak-shu-reading, .speak-row-reading')) continue;
            if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(node.textContent)) out.push(node.textContent);
          }
        }
        return out;
      });
      check('every Japanese word in every line is a door', bare.length === 0, JSON.stringify(bare));
      const before = await T(page).record();
      // a word in Kore's line: the slip opens, the look-up counts under the conversation, the top bar names it
      const koreWord = page.locator('.speak-line[data-who="kore"] .speak-text button.sentence-tok').first();
      const b = await koreWord.getAttribute('data-speak-b');
      await koreWord.click();
      await page.waitForSelector('#mini', { timeout: 8000 });
      await page.waitForTimeout(400);
      const keep = await page.evaluate(() => window.__SPEAK_TEST__.keepWord());
      check('a word in Kore\'s line opens the slip, and the top bar\'s Save names it', !!b && keep === b, `word ${b} · keep ${keep}`);
      const mid = await T(page).record();
      const taps = mid.obslog.slice(before.obslog.length).filter((row) => row[1] === 'tap');
      check('a look-up in Kore\'s line counts, under the conversation\'s id', taps.length >= 1 && taps.every((row) => String(row[4]).startsWith('speak:')), JSON.stringify(taps));
      const taken = (await T(page).record()).taken.length;
      const save = page.locator('#mini #mini-take');
      if (await save.count()) {
        await save.click();
        await page.waitForTimeout(900);
      }
      const saved = (await T(page).record()).taken;
      check('Save from the slip writes exactly one taken row', saved.length === taken + 1, `${taken} → ${saved.length}`);
      await page.keyboard.press('Escape');
      await page.evaluate(() => document.getElementById('mini')?.remove());
      // a word in his own line: the slip opens, nothing is counted
      const beforeMine = await T(page).record();
      const myWord = page.locator('.speak-line[data-who="me"] .speak-text button.japanese-lookup-word').first();
      const mine = await myWord.getAttribute('data-speak-b');
      await myWord.click();
      await page.waitForSelector('#mini', { timeout: 8000 });
      await page.waitForTimeout(300);
      const afterMine = await T(page).record();
      check('a word in his own line opens the slip and counts nothing', afterMine.obslog.length === beforeMine.obslog.length);
      check('the top bar\'s Save names the last word touched, in any line', (await page.evaluate(() => window.__SPEAK_TEST__.keepWord())) === mine, mine);
      // an inflected word (入 of 入れた, base 入れる): the top bar's Save is handed the whole token he touched — surface, base
      // and reading — so the reading's owner can derive its identity (Codex at acb125d2: the surface was dropped)
      await page.keyboard.press('Escape');
      await page.evaluate(() => document.getElementById('mini')?.remove());
      const inflected = page.locator('.speak-line[data-who="kore"] .speak-text [data-speak-s="入"][data-speak-b="入れる"]').last();
      const door = await inflected.evaluate((node) => ({ s: node.dataset.speakS, b: node.dataset.speakB, r: node.dataset.speakR }));
      await inflected.click();
      await page.waitForTimeout(400);
      const handed = await page.evaluate(() => window.__SPEAK_TEST__.keepToken());
      check('the top bar\'s Save is handed the whole token he touched: surface, base and reading', !!handed && handed.word === door.b && handed.surface === door.s && handed.reading === door.r && door.s !== door.b,
        JSON.stringify({ door, handed }));
    } finally { await f.context.close(); }
  },

  async S6(browser) {
    const f = await newRoom(browser);
    const { page } = f;
    try {
      await enter(page);
      await opened(page);
      engines.mock.set({ voiceDelayMs: 0 });
      await ring(page).click();
      await until(page, "s.phase === 'speaking'", 10000);
      await page.evaluate((uri) => window.__SPEAK_TEST__.otherSound(uri), SILENT_WAV);
      await until(page, "s.phase !== 'speaking'", 5000);
      const s = await T(page).snap();
      check('another sound stops Kore: one sound at a time', s.audioPaused && s.phase === 'rest', JSON.stringify({ paused: s.audioPaused, phase: s.phase }));
      await talk(page, '002', 1000, { expectReply: true });
      await until(page, "s.phase === 'speaking'", 10000);
      await page.evaluate(() => window.__SPEAK_TEST__.back());
      await page.waitForFunction(() => window.__SPEAK_TEST__.view() !== 'speak', null, { timeout: 8000 });
      await page.waitForTimeout(300);
      const left = await page.evaluate(() => [...document.querySelectorAll('audio')].every((a) => a.paused) && !window.__SPEAK_TEST__.owned());
      const snap = await T(page).snap();
      check('leaving the room stops her voice', left && snap.audioPaused, JSON.stringify({ paused: snap.audioPaused }));
    } finally { await f.context.close(); }
  },

  async S7(browser) {
    const f = await newRoom(browser);
    const { page } = f;
    try {
      await enter(page);
      await opened(page);
      await page.locator('[data-foot="bridge"]').click();
      await until(page, "s.mode === 'bridge'");
      const label = () => page.locator('.speak-enso-label').textContent();
      check('Bridge is one tap away and the ring says so', ['橋', 'Bridge'].includes((await label()).trim()), await label());
      const n = engines.mock.requests.length;
      await talk(page, '001', 1200);
      await until(page, "s.mode === 'sayit'", 15000);
      const brainBridge = mockSince(n).find((r) => r.kind === 'brain' && r.mode === 'bridge');
      await until(page, "s.phase === 'listening' || s.phase === 'rest'", 20000);
      check('the mock returns a bridge line; Kore says it; the ring reads 言ってみる', !!brainBridge && ['言ってみる', 'Say it'].includes((await label()).trim()), await label());
      // a mismatching take earns one slower replay
      engines.mock.set({ sayit: 'mismatch' });
      const m = engines.mock.requests.length;
      await until(page, 's.take', 20000);
      await page.waitForTimeout(900);
      await ring(page).click();
      await until(page, "s.session.bridgeTries === 1", 15000);
      await until(page, "s.playing && s.playing.rate", 10000).catch(() => {});
      const plays = (await T(page).spy()).plays;
      check('a mismatch: Kore says it once more at 0.85×', plays.some((p) => Math.abs(p.rate - 0.85) < 1e-6) && (await T(page).snap()).mode === 'sayit',
        JSON.stringify(plays.map((p) => p.rate)));
      check('the kana check names the missing sound', await page.locator('.speak-bridge .kana-missing').count() >= 1);
      await until(page, "s.phase === 'listening' && s.take", 25000);
      await page.waitForTimeout(900);
      const lines = (await T(page).snap()).session.lines.length;
      await ring(page).click();
      await until(page, `s.mode === 'talk' && s.session.lines.length >= ${lines + 2}`, 20000);
      check('after two tries the talk goes on anyway', (await T(page).snap()).mode === 'talk' && mockSince(m).filter((r) => r.mode === 'sayit').length === 2);
    } finally { await f.context.close(); }
  },

  async S8(browser) {
    const f = await newRoom(browser);
    const { page } = f;
    try {
      await enter(page);
      await opened(page);
      // the record as the talk begins: nothing he reached for may be kept without his tap, during the talk or after
      const start = await T(page).record();
      await talk(page, '003', 1500);
      await settled(page);
      await talk(page, '004', 1200);
      await settled(page);
      const before = await T(page).record();
      await page.locator('[data-foot="end"]').click();
      await until(page, "s.layer === 'lookback'", 10000);
      await page.waitForSelector('.speak-reached', { timeout: 5000 });
      const rows = await page.evaluate(() => [...document.querySelectorAll('.speak-reached')].map((row) => ({ word: row.querySelector('.speak-row-word')?.textContent || '', save: !!row.querySelector('button.save-one') })));
      check('the words he reached for are listed, each with the one Save ▾', rows.length === 2 && rows.every((r) => r.save), JSON.stringify(rows));
      const mid = await T(page).record();
      check('nothing is saved without his tap, during the talk or in the look back', JSON.stringify(start.taken) === JSON.stringify(before.taken) &&
        JSON.stringify(mid.taken) === JSON.stringify(start.taken), `${start.taken.length} at the start · ${before.taken.length} before 了 · ${mid.taken.length} in the look back`);
      const sensei = mid.obslog.filter((row) => row[1] === 'sensei');
      check('the evidence rows were written on their own, during the talk', sensei.length >= 2 && sensei.some((row) => row[2] === 'word:命名'), JSON.stringify(sensei));
      check('FSRS untouched: no review row, no card state', JSON.stringify(mid.srs) === '{}' && mid.revlog.length === 0);
      await page.locator('.speak-reached button.save-one').first().click();
      await page.waitForTimeout(900);
      const after = await T(page).record();
      check('one tap on Save makes the card', after.taken.length === before.taken.length + 1, `${before.taken.length} → ${after.taken.length}`);
      check('the look back names his planted words with their reasons', (await page.locator('.speak-page-lookback .speak-row-why').count()) >= 3);
    } finally { await f.context.close(); }
  },

  async S9(browser) {
    const f = await newRoom(browser);
    const { page } = f;
    try {
      const n = engines.mock.requests.length;
      await enter(page);
      await opened(page);
      await talk(page, '000', 1200);
      await settled(page);
      const voices = mockSince(n).filter((r) => r.kind === 'voice');
      check('every voice request names the lock\'s model', voices.length >= 2 && voices.every((r) => r.model === SITE_LOCK.model), [...new Set(voices.map((r) => r.model))].join(','));
      check('every line in a one-person scene is said by Kore', voices.every((r) => r.voiceName === SITE_LOCK.mainVoice.prebuilt), [...new Set(voices.map((r) => r.voiceName))].join(','));
      check('a reading trap is said in kana (令和8年 → ねん)', voices.some((r) => r.text.includes('ねん') && !r.text.includes('年')), voices.map((r) => r.text).join(' | '));
      const spy = await T(page).spy();
      check('the device voice is never asked', spy.speech === 0, `speech ${spy.speech}`);
    } finally { await f.context.close(); }
    // V's lock, where the app carries it (corridor.js's generated mirror), is the room's lock and the pin only its fallback.
    // The control: a mirror naming another model is followed — so the room reads the lock, never its own pin.
    const other = SITE_LOCK.approvedReference?.model && SITE_LOCK.approvedReference.model !== SITE_LOCK.model ? SITE_LOCK.approvedReference.model : 'gemini-3.1-flash-tts-preview';
    const mirror = { model: other, voices: { [SITE_LOCK.mainVoice.id]: SITE_LOCK.mainVoice.prebuilt, [SITE_LOCK.secondaryVoice.id]: SITE_LOCK.secondaryVoice.prebuilt },
      main: SITE_LOCK.mainVoice.id, second: SITE_LOCK.secondaryVoice.id,
      roles: { narrator: SITE_LOCK.mainVoice.id, word: SITE_LOCK.mainVoice.id, example: SITE_LOCK.mainVoice.id, 'speaker-b': SITE_LOCK.secondaryVoice.id } };
    const m = await newRoom(browser, { mirror });
    try {
      const n = engines.mock.requests.length;
      await enter(m.page);
      await opened(m.page);
      await talk(m.page, '003', 1000);
      await settled(m.page);
      const voices = mockSince(n).filter((r) => r.kind === 'voice');
      check('with V\'s lock in the app, the room voices in the lock\'s model, not its own pin', voices.length >= 2 && voices.every((r) => r.model === other && r.voiceName === SITE_LOCK.mainVoice.prebuilt),
        [...new Set(voices.map((r) => `${r.model}/${r.voiceName}`))].join(','));
    } finally { await m.context.close(); }
    // the two-person scene: Charon only as the second character
    const g = await newRoom(browser);
    try {
      const n = engines.mock.requests.length;
      await enter(g.page, { id: 'two-shelf' });
      await opened(g.page);
      await talk(g.page, '001', 1200);
      await settled(g.page);
      const voices = mockSince(n).filter((r) => r.kind === 'voice');
      const lines = (await T(g.page).snap()).session.lines;
      const charon = voices.filter((r) => r.voiceName === SITE_LOCK.secondaryVoice.prebuilt);
      check('a two-person scene uses Charon only for the second character', lines.some((l) => l.who === 'second') && charon.length >= 1 &&
        charon.every((r) => r.text.includes('棚')) && voices.filter((r) => r.voiceName === SITE_LOCK.mainVoice.prebuilt).length >= 1, voices.map((r) => `${r.voiceName}:${r.text}`).join(' | '));
    } finally { await g.context.close(); }
    // a failed voice: the line is visibly silent — never Charon, never the device
    const h = await newRoom(browser);
    try {
      await enter(h.page);
      await opened(h.page);
      engines.mock.set({ fault: 'voice-fail' });
      const n = engines.mock.requests.length;
      await talk(h.page, '002', 1000);
      await until(h.page, 's.session.lines.at(-1).silent', 15000);
      const voices = mockSince(n).filter((r) => r.kind === 'voice');
      const spy = await T(h.page).spy();
      check('a failed voice leaves the line visibly silent ("声を出せませんでした"), never Charon, never the device',
        (await h.page.locator('.speak-line:last-child .speak-silent').count()) === 1 && voices.every((r) => r.voiceName === 'Kore') && spy.speech === 0,
        `voices ${voices.map((r) => r.voiceName).join(',')} · speech ${spy.speech}`);
      // the model gone (Nov 17): one plain line, and the voice stops
      engines.mock.set({ fault: 'voice-gone' });
      await talk(h.page, '005', 900);
      await until(h.page, 's.voiceRetired', 15000);
      check('model not found: "Kore\'s voice is being replaced", and the voice stops', (await T(h.page).snap()).status === 'voice-replaced');
      engines.mock.set({ fault: null });
      const m = engines.mock.requests.length;
      await talk(h.page, '000', 900);
      await h.page.waitForTimeout(800);
      check('after the model is gone, no voice is asked again', mockSince(m).filter((r) => r.kind === 'voice').length === 0, `${mockSince(m).filter((r) => r.kind === 'voice').length} voice requests`);
    } finally { engines.mock.set({ fault: null }); await h.context.close(); }
  },

  async S10(browser) {
    const f = await newRoom(browser);
    const { page } = f;
    try {
      await enter(page);
      await opened(page);
      engines.mock.set({ fault: 'english' });
      const n = engines.mock.requests.length;
      await talk(page, '003', 1000);
      const brains = mockSince(n).filter((r) => r.kind === 'brain');
      check('an English reply outside Bridge is asked once more', brains.length === 2 && !!brains[1].nudge, JSON.stringify(brains.map((r) => r.nudge)));
      check('then shown as text with a quiet note', (await page.locator('.speak-line[data-who="kore"]:last-child .speak-note').count()) === 1);
      engines.mock.set({ fault: 'busy' });
      await settled(page);
      await talk(page, '002', 800, { expectReply: false });
      await until(page, "s.status === 'busy'", 10000);
      check('a 429 says so plainly, with its wait', (await page.locator('.speak-status-t').textContent()).match(/2/u) !== null);
      engines.mock.set({ fault: 'malformed' });
      await ring(page).click();
      await until(page, 's.take', 10000);
      await page.waitForTimeout(700);
      await ring(page).click();
      await until(page, "s.status === 'unclear'", 10000);
      check('JSON that is not JSON fails closed with one plain line', (await T(page).snap()).status === 'unclear');
    } finally { engines.mock.set({ fault: null }); await f.context.close(); }
  },

  async S11(browser) {
    const f = await newRoom(browser);
    const { page } = f;
    try {
      await enter(page);
      await opened(page);
      await talk(page, '003', 1200);
      await settled(page);
      await talk(page, '004', 1200);
      await settled(page);
      await page.locator('[data-foot="end"]').click();
      await until(page, "s.layer === 'lookback'", 10000);
      const notes = await page.locator('.speak-note-row').count();
      check('Kore\'s notes appear in the look back, each with 消す', notes === 2 && (await page.locator('.speak-note-row button').count()) === 2);
      await page.locator('.speak-note-row button').first().click();
      await until(page, 's.session.notes.some((n) => n.removed)', 8000);
      const rows = await page.evaluate(() => window.__SPEAK_TEST__.archive('speak-notes'));
      check('a removal is a row, never a deletion', rows.length === 3 && rows.filter((r) => JSON.parse(r.content).op === 'remove').length === 1);
      // the next session's prompt folds the removal in
      const n = engines.mock.requests.length;
      await page.evaluate(() => window.__SPEAK_TEST__.back());
      await page.locator('.speak-scene-door').click();
      await until(page, "s.layer === 'scenes'", 5000);
      await page.locator('.speak-scene').last().click();
      await until(page, "s.session && s.session.lines.some((l) => l.kind === 'opening')", 15000);
      const open = mockSince(n).find((r) => r.kind === 'brain' && r.mode === 'open');
      const system = open?.body?.systemInstruction?.parts?.[0]?.text || '';
      check('the removal folds into the next session\'s prompt', system.includes('皇居の行事に興味がある') && !system.includes('政治のニュースをよく読む'), system.slice(system.indexOf('NOTEBOOK'), system.indexOf('NOTEBOOK') + 120));
    } finally { await f.context.close(); }
  },

  async S12(browser) {
    const f = await newRoom(browser);
    const { page, context } = f;
    try {
      await enter(page);
      await opened(page);
      await talk(page, '003', 1000);
      await settled(page);
      // keep one line for 影 while online: with the one Save ▾, as everything is kept (MASTER_SPEC: one Save everywhere)
      await page.locator('[data-foot="shadow"]').click();
      await until(page, "s.layer === 'shadow'", 5000);
      const lineSave = '.speak-shadow .speak-keep-line button.save-one[data-save-one]';
      await page.waitForSelector(lineSave, { timeout: 8000 });
      const before = await page.evaluate((sel) => ({ pressed: document.querySelector(sel)?.getAttribute('aria-pressed'),
        others: [...document.querySelectorAll('.speak-shadow button:not(.save-one)')].map((b) => (b.textContent || '').trim()).filter((x) => /keep|残す|保存/iu.test(x)) }), lineSave);
      await page.locator(lineSave).click();
      await waitPage(page, (sel) => document.querySelector(sel)?.getAttribute('aria-pressed') === 'true', lineSave, 15000, 'S12 keep a line');
      const after = await page.evaluate(() => ({ rows: document.querySelectorAll('.speak-saved .speak-row').length, menu: !!document.getElementById('speak-line-remove') }));
      check('a line is kept for 影 by the one Save ▾ alone: Saved once the store holds it, its menu open with Remove',
        before.pressed === 'false' && before.others.length === 0 && after.rows === 1 && after.menu, JSON.stringify({ before, after }));
      await page.keyboard.press('Escape');
      await waitPage(page, () => !document.getElementById('vocabulary-list-popover'), null, 5000, 'S12 the menu closes');
      await page.evaluate(() => window.__SPEAK_TEST__.back());
      await until(page, '!s.layer', 5000);
      await page.evaluate(() => window.__SPEAK_TEST__.back());
      await waitPage(page, () => window.__SPEAK_TEST__.view() !== 'speak', null, 8000, 'S12 leave the room');
      await context.setOffline(true);
      const n = engines.mock.requests.length;
      await enter(page);
      await until(page, "s.status === 'offline'", 10000);
      await page.waitForTimeout(800);
      check('offline: the ensō is open, with one line', (await ring(page).getAttribute('data-phase')) === 'open' && (await page.locator('.speak-status-t').count()) === 1);
      check('offline: zero requests', mockSince(n).length === 0, `${mockSince(n).length}`);
      await page.locator('.speak-status button', { hasText: /Past conversations|これまでの会話/u }).click();
      await until(page, "s.layer === 'past'", 5000);
      await waitPage(page, () => !!document.querySelector('.speak-past'), null, 8000, 'S12 past conversations listed');
      check('past conversations open', (await page.locator('.speak-past').count()) >= 1);
      await page.locator('.speak-past').first().click();
      await until(page, "s.layer === 'past-session'", 5000);
      check('a past conversation\'s words are doors', (await page.locator('.speak-page-past-session .speak-text button').count()) >= 3);
      await page.evaluate(() => window.__SPEAK_TEST__.back());
      await page.evaluate(() => window.__SPEAK_TEST__.back());
      await page.locator('[data-foot="shadow"]').click();
      await waitPage(page, () => document.querySelectorAll('.speak-saved .speak-row').length >= 1, null, 8000, 'S12 saved lines listed');
      const plays = (await T(page).spy()).plays.length;
      await page.evaluate(() => { const spy = window.__SPEAK_SPY__; spy.advanced = 0; spy.ends = 0; spy.mediaErrors = []; });
      await page.locator('.speak-saved .speak-row button', { hasText: /Listen|聞く/u }).first().click();
      await waitPage(page, () => (window.__SPEAK_SPY__.advanced || 0) > 0.2, null, 8000, 'S12 the saved line plays').catch(() => {});
      const sound = await page.evaluate(() => ({ advanced: window.__SPEAK_SPY__.advanced || 0, ends: window.__SPEAK_SPY__.ends || 0, errors: window.__SPEAK_SPY__.mediaErrors || [],
        now: window.__SPEAK_TEST__.soundState() }));
      check('saved lines open and play offline: her kept voice plays on, not only starts', (await T(page).spy()).plays.length > plays && sound.advanced > 0.2 && !sound.errors.length && mockSince(n).length === 0,
        `played to ${sound.advanced.toFixed(2)} s · ended ${sound.ends} · media errors ${JSON.stringify(sound.errors)} · now ${JSON.stringify(sound.now)} · requests ${mockSince(n).length}`);
      // the kept line outlives the page: after a reload (online: this harness serves no offline app shell) it is still kept
      await context.setOffline(false);
      await page.reload();
      await page.waitForFunction(() => window.__SPEAK_TEST__?.ready(), null, { timeout: 30000 });
      await enter(page);
      await opened(page);
      await page.locator('[data-foot="shadow"]').click();
      await until(page, "s.layer === 'shadow'", 5000);
      const reloaded = await waitPage(page, () => document.querySelectorAll('.speak-saved .speak-row').length === 1, null, 8000, 'S12 the kept line after a reload').then(() => true, () => false);
      check('a kept line outlives the page: after a reload it is still in the saved lines', reloaded);
      await page.evaluate(() => { const spy = window.__SPEAK_SPY__; spy.advanced = 0; spy.ends = 0; spy.mediaErrors = []; });
      await page.locator('.speak-saved .speak-row button', { hasText: /Listen|聞く/u }).first().click();
      await waitPage(page, () => (window.__SPEAK_SPY__.advanced || 0) > 0.2, null, 8000, 'S12 the saved line plays after the reload').catch(() => {});
      const again = await page.evaluate(() => ({ advanced: window.__SPEAK_SPY__.advanced || 0, ends: window.__SPEAK_SPY__.ends || 0, errors: window.__SPEAK_SPY__.mediaErrors || [], now: window.__SPEAK_TEST__.soundState() }));
      check('and after the reload it plays on', again.advanced > 0.2 && !again.errors.length, JSON.stringify(again));
      // Remove, in the Save's menu, is the one way a kept line is un-kept
      await page.locator('.speak-saved .speak-row button', { hasText: /^(Shadow|影)$/u }).first().click();
      await waitPage(page, (sel) => document.querySelector(sel)?.getAttribute('aria-pressed') === 'true', lineSave, 8000, 'S12 the kept line shows Saved');
      await page.locator(lineSave).click();
      await page.locator('#speak-line-remove').click();
      await waitPage(page, (sel) => document.querySelectorAll('.speak-saved .speak-row').length === 0 && document.querySelector(sel)?.getAttribute('aria-pressed') === 'false', lineSave, 8000, 'S12 remove the line');
      const stored = await page.evaluate(() => new Promise((done) => {
        const open = indexedDB.open('kairo-speak-audio');
        open.onsuccess = () => { const db = open.result; const req = db.transaction('lines').objectStore('lines').count(); req.onsuccess = () => { done(req.result); db.close(); }; };
        open.onerror = () => done(-1);
      }));
      check('Remove in its menu un-keeps the line: the store holds none and the Save stands unpressed', stored === 0, `stored ${stored}`);
    } finally { await context.setOffline(false).catch(() => {}); await f.context.close(); }
  },

  async S13(browser) {
    const f = await newRoom(browser);
    const { page } = f;
    try {
      const n = engines.mock.requests.length;
      await enter(page);
      await opened(page);
      await talk(page, '003', 1200);
      await settled(page);
      await page.waitForTimeout(1500);
      const reqs = mockSince(n);
      const urls = [...f.requests, ...reqs.map((r) => `${r.path}${r.search}`)];
      check('the key is absent from every URL', urls.every((u) => !u.includes(KEY)) && reqs.every((r) => !r.search), urls.filter((u) => u.includes(KEY)).slice(0, 2).join(' '));
      check('the key travels in its header, to the configured provider only', reqs.length > 0 && reqs.every((r) => r.keyHeader === KEY && !r.cookie));
      const archive = JSON.stringify(await page.evaluate(() => window.__SPEAK_TEST__.archive(null)));
      const exported = await page.evaluate(async () => JSON.stringify(await window.__KAIRO_AI__.exportRecord()));
      check('the key is absent from the archive, the export and the console', !archive.includes(KEY) && !exported.includes(KEY) && f.console.every((line) => !line.includes(KEY)));
      const fetches = (await T(page).spy()).fetches;
      check('requests carry credentials:\'omit\' and redirect:\'error\'', fetches.length === reqs.length && fetches.every((x) => x.credentials === 'omit' && x.redirect === 'error' && x.referrerPolicy === 'no-referrer'),
        JSON.stringify(fetches.slice(0, 2)));
      const unpriced = reqs.filter((r) => r.usage && !RATE[r.model]).map((r) => r.model);
      const expected = reqs.reduce((sum, r) => (r.usage && RATE[r.model]
        ? sum + (r.usage.promptTokenCount * RATE[r.model].in + r.usage.candidatesTokenCount * RATE[r.model].out) / 1e6 : sum), 0);
      check('every metered request has a published rate here', unpriced.length === 0, unpriced.join(','));
      const spend = await page.evaluate(() => JSON.parse(localStorage.getItem('kairo-speak-spend-v1')));
      check('the meter equals the mock\'s usage × the official rates', Math.abs(spend.usd - expected) < 1e-5, `meter ${spend.usd} · expected ${expected.toFixed(6)}`);
      // the cap: the next turn is blocked with one plain line
      await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('kairo-speak-spend-v1')); s.cap = s.usd; localStorage.setItem('kairo-speak-spend-v1', JSON.stringify(s)); });
      const m = engines.mock.requests.length;
      const s = await T(page).snap();
      if (s.take) { await ring(page).click(); await page.waitForTimeout(800); }
      await until(page, "s.phase === 'rest' || s.phase === 'listening'", 15000);
      if ((await T(page).snap()).phase !== 'listening') await ring(page).click();
      await page.waitForTimeout(800);
      check('the cap blocks the next turn with one plain line', (await T(page).snap()).status === 'cap' && mockSince(m).filter((r) => r.kind === 'brain').length === 0, `status ${(await T(page).snap()).status}`);
    } finally { await f.context.close(); }
  },

  async S14(browser) {
    const f = await newRoom(browser);
    const { page } = f;
    try {
      await enter(page);
      await opened(page);
      await ring(page).click();
      await until(page, "s.phase === 'listening' && s.take", 20000);
      const n = engines.mock.requests.length;
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await until(page, "!s.take && s.phase === 'rest'", 5000);
      const spy = await T(page).spy();
      check('a hidden page discards the take and the ring rests', mockSince(n).length === 0 && spy.tracks.every((x) => x === 'ended'), JSON.stringify(spy.tracks));
      await page.evaluate(() => { delete document.hidden; delete document.visibilityState; });
      // an AudioContext the system interrupted: the take is dropped, the next tap recovers
      await ring(page).click();
      await until(page, "s.phase === 'listening' && s.take", 15000);
      await page.evaluate(() => {
        const contexts = window.__SPEAK_SPY__.contexts;
        const ctx = contexts.at(-1);
        Object.defineProperty(ctx, 'state', { configurable: true, get: () => 'interrupted' });
        ctx.dispatchEvent(new Event('statechange'));
      });
      await until(page, "!s.take && s.phase === 'rest' && s.status === 'interrupted'", 5000);
      check('an interrupted AudioContext drops the take and says so', true);
      const gum = (await T(page).spy()).gum;
      await ring(page).click();
      await until(page, "s.phase === 'listening' && s.take", 15000);
      const s = await T(page).snap();
      check('the next tap recovers: a new context, a new take', (await T(page).spy()).gum === gum + 1 && s.ctxState === 'running', JSON.stringify({ ctx: s.ctxState }));
    } finally { await f.context.close(); }
  },

  async S15(browser, name) {
    // contrast in all eleven worlds (both engines measure; WebKit's frames gate motion)
    const f = await newRoom(browser);
    const { page } = f;
    const sheet = [];
    try {
      await enter(page);
      await opened(page);
      await talk(page, '003', 900);
      await settled(page);
      const rows = [];
      for (const world of WORLDS) {
        await page.evaluate((w) => window.__SPEAK_TEST__.theme(w), world);
        await page.waitForTimeout(150);
        const m = await page.evaluate(() => {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 1;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          const rgba = (color) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data]; };
          const css = (selector, prop) => getComputedStyle(document.querySelector(selector) || document.body)[prop];
          const bodyBg = rgba(getComputedStyle(document.body).backgroundColor);
          const page = rgba(getComputedStyle(document.body).getPropertyValue('--color-page').trim() || '#fff');
          return { bg: bodyBg[3] === 255 ? bodyBg : page, text: rgba(css('.speak-line[data-who="kore"] .speak-text', 'color')),
            mine: rgba(css('.speak-line[data-who="me"] .speak-text', 'color')), ring: rgba(css('.enso-closed', 'fill')),
            red: rgba(css('.enso-red', 'fill')), shu: rgba(css('.speak-shu-right', 'color')), seal: rgba(css('.speak-line[data-who="kore"] .speak-seal', 'color')) };
        });
        const bg = m.bg.slice(0, 3);
        const row = { world, text: contrast(m.text.slice(0, 3), bg), mine: contrast(m.mine.slice(0, 3), bg), ring: contrast(m.ring.slice(0, 3), bg), red: contrast(m.red.slice(0, 3), bg),
          shu: contrast(m.shu.slice(0, 3), bg), seal: contrast(m.seal.slice(0, 3), bg) };
        rows.push(row);
        if (SHOTS && name === 'webkit') {
          const file = join(SHOTS, `contact-${world}.png`);
          await page.screenshot({ path: file });
          sheet.push(file);
        }
      }
      const low = rows.filter((r) => r.text < 4.5 || r.mine < 4.5 || r.shu < 4.5 || r.seal < 4.5 || r.ring < 3 || r.red < 3);
      check('text ≥ 4.5:1 (her line, his line, the red pen, the seal) and the ring ≥ 3:1 (ink and red) in all eleven worlds', rows.length === 11 && low.length === 0,
        rows.map((r) => `${r.world} t${r.text.toFixed(2)} m${r.mine.toFixed(2)} s${r.shu.toFixed(2)} k${r.seal.toFixed(2)} r${r.ring.toFixed(2)} R${r.red.toFixed(2)}`).join(' · '));
      receipt.contrast = rows;
      await page.evaluate(() => window.__SPEAK_TEST__.theme('hokusai'));
      // motion: frames across the ensō's states
      engines.mock.set({ brainDelayMs: 1400 });
      await page.evaluate(() => {
        const out = window.__SPEAK_FRAMES__ = [];
        let last = performance.now();
        const tick = (now) => { out.push(now - last); last = now; if (out.length < 2000 && !window.__SPEAK_FRAMES_STOP__) requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      });
      await until(page, "s.phase === 'listening' && s.take", 20000);
      await page.waitForTimeout(1500);
      await ring(page).click();
      await until(page, "s.phase === 'thinking'", 5000);
      await page.waitForTimeout(1000);
      await until(page, "s.phase === 'speaking'", 10000);
      await page.waitForTimeout(800);
      await page.evaluate(() => { window.__SPEAK_FRAMES_STOP__ = true; });
      const frames = (await page.evaluate(() => window.__SPEAK_FRAMES__)).slice(3);
      const sorted = [...frames].sort((a, b) => a - b);
      const worst = sorted.at(-1), p95 = sorted[Math.floor(sorted.length * 0.95)];
      engines.mock.set({ brainDelayMs: 0 });
      if (name === 'webkit') check('WebKit\'s worst frame ≤ 24 ms across the ensō\'s states (headless proxy)', worst <= 24, `worst ${worst.toFixed(1)} · p95 ${p95.toFixed(1)} · frames ${frames.length}`);
      else check('Chromium frames across the ensō\'s states (reported; WebKit gates)', true, `worst ${worst.toFixed(1)} · p95 ${p95.toFixed(1)} · frames ${frames.length}`);
    } finally { engines.mock.set({ brainDelayMs: 0 }); await f.context.close(); }
    if (sheet.length && existsSync(engines.ffmpeg || '')) {
      try {
        execFileSync(engines.ffmpeg, ['-v', 'error', '-y', ...sheet.flatMap((file) => ['-i', file]), '-filter_complex',
          `${sheet.map((_, i) => `[${i}:v]scale=390:-1[v${i}]`).join(';')};${sheet.map((_, i) => `[v${i}]`).join('')}xstack=inputs=${sheet.length}:layout=${sheet.map((_, i) => `${(i % 6) * 390}_${Math.floor(i / 6) * 844}`).join('|')}:fill=white`,
          join(SHOTS, 'contact-sheet-11-worlds.png')]);
      } catch (error) { console.log(`  (contact sheet not assembled: ${String(error.message).slice(0, 120)})`); }
    }
    // reduced motion: the ring stands still; a change is a fade ≤ 120 ms
    const g = await newRoom(browser, { reducedMotion: 'reduce' });
    try {
      await enter(g.page);
      await opened(g.page);
      engines.mock.set({ brainDelayMs: 1500 });
      await ring(g.page).click();
      await until(g.page, "s.phase === 'listening' && s.take", 20000);
      await g.page.waitForTimeout(600);
      await ring(g.page).click();
      await until(g.page, "s.phase === 'thinking'", 5000);
      const rm = await g.page.evaluate(() => {
        const arc = getComputedStyle(document.querySelector('.enso-arc'));
        const art = getComputedStyle(document.querySelector('.enso-art'));
        const ink = getComputedStyle(document.querySelector('.enso-ink'));
        const ms = (v) => Math.max(...v.split(',').map((x) => parseFloat(x) * (x.trim().endsWith('ms') ? 1 : 1000)));
        const live = document.getAnimations().filter((a) => a.playState === 'running' && document.querySelector('.speak-enso').contains(a.effect?.target));
        // a fade the state change started is allowed (≤ 120 ms); a looping or moving animation is not
        const loops = live.filter((a) => !('transitionProperty' in a));
        const fades = live.filter((a) => 'transitionProperty' in a);
        return { arcAnim: arc.animationName, arcDur: arc.animationDuration, artTransform: art.transform, inkTransition: ms(ink.transitionDuration),
          loops: loops.length, fades: fades.map((a) => `${a.transitionProperty}:${Math.round(a.effect.getTiming().duration)}`) };
      });
      check('reduced motion: the ring is still, changes fade in ≤ 120 ms', rm.arcAnim === 'none' && rm.loops === 0 && (rm.artTransform === 'none' || rm.artTransform === '') &&
        rm.inkTransition <= 120 && rm.fades.every((x) => x.startsWith('opacity:') && Number(x.split(':')[1]) <= 120), JSON.stringify(rm));
    } finally { engines.mock.set({ brainDelayMs: 0 }); await g.context.close(); }
  },

  async S16(browser) {
    const f = await newRoom(browser);
    const { page } = f;
    try {
      await enter(page);
      await opened(page);
      const tag = await ring(page).evaluate((b) => ({ tag: b.tagName, pressed: b.getAttribute('aria-pressed'), label: b.getAttribute('aria-label') }));
      check('the ensō is a button with aria-pressed and a label', tag.tag === 'BUTTON' && tag.pressed === 'false' && !!tag.label, JSON.stringify(tag));
      await ring(page).focus();
      await page.keyboard.press('Space');
      await until(page, "s.phase !== 'rest'", 8000);
      check('Space toggles the ensō', true);
      await until(page, "s.phase === 'listening' && s.take", 20000);
      const listening = await ring(page).evaluate((b) => ({ pressed: b.getAttribute('aria-pressed'), label: b.getAttribute('aria-label') }));
      check('its state is pressed while it listens, and its label says so', listening.pressed === 'true' && listening.label !== tag.label, JSON.stringify(listening));
      await page.waitForTimeout(900);
      await page.keyboard.press('Space');
      await until(page, "s.session.lines.length >= 3", 20000);
      const stops = await page.evaluate(() => [...document.querySelectorAll('.speak-line .speak-text')].map((p) => [...p.querySelectorAll('button')].filter((b) => b.tabIndex === 0).length));
      check('lines are prose: one focus stop per paragraph', stops.length >= 3 && stops.every((n) => n === 1), JSON.stringify(stops));
      const last = (await T(page).snap()).session.lines.filter((l) => l.who !== 'me').at(-1).text;
      await page.waitForTimeout(200);
      check('a new Kore line is announced politely', (await page.locator('.speak-announce').getAttribute('aria-live')) === 'polite' && (await page.locator('.speak-announce').textContent()) === last);
      const roving = await page.evaluate(() => {
        const p = document.querySelector('.speak-line[data-who="kore"] .speak-text');
        const first = p.querySelector('button[tabindex="0"]');
        first.focus();
        first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        return document.activeElement !== first && p.contains(document.activeElement);
      });
      check('arrow keys move inside a line', roving);
    } finally { await f.context.close(); }
  },

  // ---- Codex at acb125d2, group 1: leaving retires every voice job, by session and by generation
  async S17(browser) {
    // Back while the opening's record write is still unanswered: when the record answers, no voice is asked
    {
      const f = await newRoom(browser);
      const { page } = f;
      try {
        await page.evaluate(() => window.__SPEAK_TEST__.hold(true));
        await enter(page);
        await mockSaw((r) => r.kind === 'brain' && r.mode === 'open');
        await page.waitForTimeout(400);
        const n = engines.mock.requests.length;
        await page.evaluate(() => window.__SPEAK_TEST__.back());
        await waitPage(page, () => window.__SPEAK_TEST__.view() !== 'speak', null, 8000, 'S17 leave the room');
        await page.evaluate(() => window.__SPEAK_TEST__.hold(false));
        await page.waitForTimeout(1600);
        const late = mockSince(n).filter((r) => r.kind === 'voice');
        check('Back while the opening waits on the record: no voice is asked after he left', late.length === 0, late.map((r) => r.text).join(' | '));
      } finally { await f.context.close(); }
    }
    // End while sentence one is still being made: sentence two is never asked
    {
      const f = await newRoom(browser);
      const { page } = f;
      try {
        await enter(page);
        await opened(page);
        await page.waitForTimeout(600);
        engines.mock.set({ voiceDelayMs: 2600 });
        await talk(page, '003', 1200);
        await mockSaw((r) => r.kind === 'voice' && r.text.startsWith('名前に'));
        const n = engines.mock.requests.length;
        await page.locator('[data-foot="end"]').click();
        await until(page, "s.layer === 'lookback'", 10000);
        await page.waitForTimeout(3200);
        const late = mockSince(n).filter((r) => r.kind === 'voice');
        check('End while sentence one is being made: sentence two is never asked', late.length === 0, late.map((r) => r.text).join(' | '));
      } finally { engines.mock.set({ voiceDelayMs: 0 }); await f.context.close(); }
    }
    // a new scene while the old opening waits on the record: only the new scene's line is voiced
    {
      const f = await newRoom(browser);
      const { page } = f;
      try {
        await page.evaluate(() => window.__SPEAK_TEST__.hold(true));
        await enter(page);
        await mockSaw((r) => r.kind === 'brain' && r.mode === 'open');
        await page.waitForTimeout(300);
        await page.locator('.speak-scene-door').click();
        await until(page, "s.layer === 'scenes'", 5000);
        const n = engines.mock.requests.length;
        await page.locator('.speak-scene', { hasText: /shelf|棚/u }).first().click();
        await mockSaw((r, i) => engines.mock.requests.indexOf(r) >= n && r.kind === 'brain' && r.mode === 'open');
        await page.evaluate(() => window.__SPEAK_TEST__.hold(false));
        await page.waitForTimeout(1800);
        const voices = mockSince(n).filter((r) => r.kind === 'voice');
        const old = voices.filter((r) => r.text.includes('話をしましょう') || r.text.includes('はなしをしましょう'));
        check('a new scene while the old opening waits: the old line is never voiced, the new one is', old.length === 0 && voices.length >= 1,
          voices.map((r) => r.text).join(' | '));
      } finally { await f.context.close(); }
    }
  },

  // ---- group 2: a microphone still being granted when the page hides is withdrawn, and its stream stopped
  async S18(browser) {
    const f = await newRoom(browser);
    const { page } = f;
    try {
      await enter(page);
      await opened(page);
      await page.evaluate(() => { window.__SPEAK_SPY__.holdMic = true; });
      await ring(page).click();
      await waitPage(page, () => window.__SPEAK_SPY__.gum.length >= 1 && typeof window.__SPEAK_SPY__.releaseMic === 'function', null, 20000, 'S18 the microphone is asked');
      await hide(page, true);
      await until(page, "s.phase !== 'listening'", 5000);
      await page.evaluate(() => { window.__SPEAK_SPY__.holdMic = false; window.__SPEAK_SPY__.releaseMic(); });
      await page.waitForTimeout(900);
      const snap = await T(page).snap();
      const spy = await T(page).spy();
      check('hidden while the microphone was pending: no take starts, and the stream that came back is stopped',
        !snap.take && snap.phase === 'rest' && spy.tracks.length >= 1 && spy.tracks.every((x) => x === 'ended'), JSON.stringify({ take: snap.take, phase: snap.phase, tracks: spy.tracks }));
      await hide(page, false);
      // whatever the first half left (a live take, if the fix is gone) is ended before the second half's tap
      if ((await T(page).snap()).take) { await ring(page).click(); await page.waitForTimeout(600); await settled(page).catch(() => {}); }
      await until(page, "s.phase === 'rest'", 15000).catch(() => {});
      await ring(page).click();
      const listens = await until(page, "s.phase === 'listening' && s.take", 15000).then(() => true, () => false);
      check('in view again, the next tap listens as before', listens);
    } finally { await f.context.close(); }
  },

  // ---- group 3: accounting fails closed; settings say Saved only for what the device holds
  async S19(browser) {
    const f = await newRoom(browser, { cap: 1, usd: 0.99 });
    const { page } = f;
    try {
      await enter(page);
      await opened(page);
      // the opening's voice is made ahead: arm the fault only once its cost is written, so only the turn's costs meet it
      await mockSaw((r) => r.kind === 'voice' && r.usage);
      await waitPage(page, () => (JSON.parse(localStorage.getItem('kairo-speak-spend-v1'))?.usd || 0) > 0.9901, null, 8000, 'S19 the opening\'s cost written');
      await page.evaluate(() => { window.__SPEAK_SPY__.failSpend = true; });
      engines.mock.set({ usageBoost: 40 });
      await talk(page, '003', 900);
      await settled(page);
      await page.waitForTimeout(400);
      if ((await T(page).snap()).take) { await ring(page).click(); await page.waitForTimeout(600); }
      const n = engines.mock.requests.length;
      await ring(page).click();
      await page.waitForTimeout(700);
      check('a cost the device could not record keeps the next turn closed', (await T(page).snap()).status === 'accounting' &&
        mockSince(n).filter((r) => r.kind === 'brain').length === 0, `status ${(await T(page).snap()).status}`);
      // the control: once the device takes the owed cost, it counts — past the cap the next turn is refused for the cap
      await page.evaluate(() => { window.__SPEAK_SPY__.failSpend = false; });
      await ring(page).click();
      await page.waitForTimeout(700);
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('kairo-speak-spend-v1')));
      check('written at last, the owed cost counts: past the cap the next turn is refused', (await T(page).snap()).status === 'cap' && stored.usd >= stored.cap &&
        mockSince(n).filter((r) => r.kind === 'brain').length === 0, JSON.stringify({ status: (await T(page).snap()).status, stored }));
      engines.mock.set({ usageBoost: 1 });
      // settings: a key and a limit the device refused are not "Saved", and what he typed stays
      await page.locator('.speak-cost').click();
      await until(page, "s.layer === 'connect'", 5000);
      const before = await page.evaluate(() => ({ device: localStorage.getItem('kairo-speak-device-v1'), spend: localStorage.getItem('kairo-speak-spend-v1') }));
      await page.evaluate(() => { window.__SPEAK_SPY__.failDevice = true; });
      await page.fill('.speak-connect input[name="speak-key"]', 'test-new-key-not-real');
      await page.fill('.speak-connect input[type="number"]', '7');
      await page.locator('.speak-connect button[type="submit"]').click();
      await page.waitForTimeout(300);
      const refused = await page.evaluate(() => ({ note: document.querySelector('.speak-connect [role="status"]')?.textContent || '',
        typed: document.querySelector('.speak-connect input[name="speak-key"]')?.value || '', device: localStorage.getItem('kairo-speak-device-v1'),
        spend: localStorage.getItem('kairo-speak-spend-v1') }));
      check('settings say Saved only for what the device holds: a refused key is not "Saved", and what he typed stays',
        !/Saved|保存しました/u.test(refused.note) && refused.typed === 'test-new-key-not-real' && refused.device === before.device && refused.spend === before.spend, JSON.stringify(refused));
      await page.evaluate(() => { window.__SPEAK_SPY__.failDevice = false; window.__SPEAK_SPY__.failRemove = true; });
      await page.locator('.speak-connect button', { hasText: /Remove the key|鍵を消す/u }).click();
      await page.waitForTimeout(300);
      const kept = await page.evaluate(() => ({ note: document.querySelector('.speak-connect [role="status"]')?.textContent || '', device: !!localStorage.getItem('kairo-speak-device-v1') }));
      check('a removal the device refused is not called a removal', kept.device && !/The key is removed|鍵を消しました/u.test(kept.note), JSON.stringify(kept));
      await page.evaluate(() => { window.__SPEAK_SPY__.failRemove = false; });
      await page.locator('.speak-connect button[type="submit"]').click();
      await page.waitForTimeout(300);
      const ok = await page.evaluate(() => ({ note: document.querySelector('.speak-connect [role="status"]')?.textContent || '',
        typed: document.querySelector('.speak-connect input[name="speak-key"]')?.value || '', cap: JSON.parse(localStorage.getItem('kairo-speak-spend-v1')).cap,
        key: JSON.parse(localStorage.getItem('kairo-speak-device-v1')).credential.key }));
      check('and when the device takes them, Saved — the key and the limit are both held', /Saved|保存しました/u.test(ok.note) && ok.typed === '' && ok.cap === 7 && ok.key === 'test-new-key-not-real',
        JSON.stringify({ ...ok, key: ok.key === 'test-new-key-not-real' }));
    } finally { engines.mock.set({ usageBoost: 1 }); await f.context.close(); }
  },

  // ---- group 4: a note the record did not take is not "remembered"
  async S20(browser) {
    const f = await newRoom(browser);
    const { page } = f;
    try {
      await enter(page);
      await opened(page);
      await talk(page, '003', 1100);
      await settled(page);
      await talk(page, '004', 1100);
      await settled(page);
      await page.evaluate(() => window.__SPEAK_TEST__.refuseNotes(true));
      await page.locator('[data-foot="end"]').click();
      await until(page, "s.layer === 'lookback'", 10000);
      const failed = await page.evaluate(() => ({ pending: document.querySelectorAll('.speak-note-row.is-pending').length,
        kept: document.querySelectorAll('.speak-note-row:not(.is-pending)').length, retry: !!document.querySelector('.speak-notes-retry') }));
      const rows = await page.evaluate(() => window.__SPEAK_TEST__.archive('speak-notes'));
      check('a note the record did not take is shown as not kept, with a way to try again; none is called remembered',
        failed.pending === 2 && failed.kept === 0 && failed.retry && rows.length === 0 && (await T(page).snap()).session.notes.length === 0, JSON.stringify({ ...failed, rows: rows.length }));
      await page.evaluate(() => window.__SPEAK_TEST__.refuseNotes(false));
      let retried = false;
      if (await page.locator('.speak-notes-retry').count()) {
        await page.locator('.speak-notes-retry').click();
        retried = await waitPage(page, () => document.querySelectorAll('.speak-note-row:not(.is-pending) button').length === 2, null, 8000, 'S20 the notes kept on the retry').then(() => true, () => false);
      }
      const after = await page.evaluate(() => window.__SPEAK_TEST__.archive('speak-notes'));
      check('trying again keeps them, once each', retried && after.length === 2 && new Set(after.map((r) => JSON.parse(r.content).id)).size === 2, `retried ${retried} · rows ${after.length}`);
    } finally { await f.context.close(); }
  },

  // ---- group 5: an untyped correction is not evidence; only what the gate admits is
  async S21(browser) {
    const f = await newRoom(browser);
    const { page } = f;
    try {
      await enter(page);
      await opened(page);
      const before = await T(page).record();
      await talk(page, '002', 1100, { mockClip: 'untyped' });
      await settled(page);
      const added = (await T(page).record()).obslog.slice(before.obslog.length).filter((row) => row[1] === 'sensei');
      check('an untyped correction never becomes evidence; the typed one beside it does',
        !added.some((row) => row[2] === 'word:日本') && added.some((row) => row[2] === 'word:勤める' && row[4] === 'collocation'), JSON.stringify(added));
    } finally { await f.context.close(); }
  },

  // ---- group 6: turns never overlap; a line typed while Kore answers stays unsent in its field
  async S22(browser) {
    const f = await newRoom(browser, { deny: true });
    const { page } = f;
    try {
      await enter(page);
      await opened(page);
      await ring(page).click();
      await until(page, "s.status === 'mic-denied'", 20000);
      engines.mock.set({ brainDelayMs: 1600 });
      const n = engines.mock.requests.length;
      await page.fill('.speak-type-input', 'First, a line in English.');
      await page.locator('.speak-type button[type="submit"]').click();
      // the first line's request has arrived (its answer is still 1.6 s away)
      await mockSaw((r) => engines.mock.requests.indexOf(r) >= n && r.kind === 'brain');
      await page.fill('.speak-type-input', 'Second, while she answers.');
      await page.locator('.speak-type button[type="submit"]').click();
      await page.waitForTimeout(300);
      const during = { brains: mockSince(n).filter((r) => r.kind === 'brain').length, field: await page.inputValue('.speak-type-input'), status: (await T(page).snap()).status,
        busy: (await T(page).snap()).turnBusy, sent: mockSince(n).filter((r) => r.kind === 'brain').map((r) => (r.body.contents.at(-1).parts.find((p) => (p.text || '').startsWith('TYPED'))?.text || '').slice(0, 60)) };
      check('turns never overlap: a second line while Kore answers is not sent, and stays in its field',
        during.brains === 1 && during.field === 'Second, while she answers.' && during.status === 'still-answering', JSON.stringify(during));
      await until(page, 's.session.lines.length >= 3', 15000);
      const first = mockSince(n).find((r) => r.kind === 'brain');
      await page.waitForTimeout(400);
      await page.locator('.speak-type button[type="submit"]').click();
      await mockSaw((r) => engines.mock.requests.indexOf(r) > engines.mock.requests.indexOf(first) && r.kind === 'brain');
      const second = mockSince(n).filter((r) => r.kind === 'brain')[1];
      check('the kept line goes once the answer is in, after it, never beside it', !!second && second.at - first.at >= 1500, `gap ${second ? second.at - first.at : '—'} ms`);
    } finally { engines.mock.set({ brainDelayMs: 0 }); await f.context.close(); }
  },

  // ---- 影 end to end (DESIGN §1, Codex's coverage note): Kore's line during the talk, a corrected line from the look back
  // after End, and a saved line from the saved list each give the three honest things — the kana heard with what was
  // missing, his pitch line over hers, both times — and never a score
  async S23(browser) {
    const f = await newRoom(browser);
    const { page } = f;
    const shadowOnce = async (label) => {
      await until(page, "s.layer === 'shadow' && s.phase === 'rest' && s.mode === 'shadow'", 10000);
      await ring(page).click();
      await until(page, "s.phase === 'listening' && s.take", 25000);
      await page.waitForTimeout(1800);
      await ring(page).click();
      // a result never drawn is a red check below, not a broken case: the case goes on to its end
      try { await waitPage(page, () => !!document.querySelector('.speak-shadow-result .speak-pitch'), null, 15000, `S23 ${label}: the result drawn`); } catch {
        return { drawn: false, kana: '', missing: 0, extra: 0, hers: 0, his: 0, times: '', seconds: 0, score: false };
      }
      return page.evaluate(() => {
        const r = document.querySelector('.speak-shadow-result');
        const points = (sel) => (r.querySelector(sel)?.getAttribute('d') || '').split(/[ML]/u).filter((x) => x.trim()).length;
        const times = r.querySelector('.speak-times')?.textContent || '';
        return { kana: (r.querySelector('.speak-kana')?.textContent || '').trim(), missing: r.querySelectorAll('.speak-kana .kana-missing').length,
          extra: r.querySelectorAll('.speak-kana .kana-extra').length,
          hers: points('path.pitch-hers'), his: points('path.pitch-his'), times, seconds: (times.match(/\d+\.\d\s*s/gu) || []).length,
          score: /%|score|点数|正解|✓|✗/iu.test(r.textContent || '') };
      });
    };
    const honest = (x) => x.kana.length > 0 && x.missing === 1 && x.extra === 0 && x.hers >= 5 && x.his >= 5 && x.seconds === 2 && !x.score;
    try {
      await enter(page);
      await opened(page);
      await talk(page, '003', 1100);
      await settled(page);
      if ((await T(page).snap()).take) { await ring(page).click(); await page.waitForTimeout(600); await settled(page); }
      await page.locator('[data-foot="shadow"]').click();
      const a = await shadowOnce('Kore\'s line');
      check('shadowing Kore\'s line: the kana heard with what was missing, both pitch lines, both times — and no score', honest(a), JSON.stringify(a));
      await page.evaluate(() => window.__SPEAK_TEST__.back());
      await until(page, '!s.layer', 5000);
      await page.locator('[data-foot="end"]').click();
      await until(page, "s.layer === 'lookback'", 10000);
      await page.locator('.speak-page-lookback .speak-acts button', { hasText: /^(Shadow|影)$/u }).first().click();
      const b = await shadowOnce('a corrected line');
      // its kanji's sounds are in the reading it is checked against (ないかく for 内閣), not only its kana
      check('a corrected line, shadowed from the look back after End: the same three things, against its whole reading', honest(b) && b.kana.includes('ないかく'), JSON.stringify(b));
      const lineSave = '.speak-shadow .speak-keep-line button.save-one[data-save-one]';
      await page.waitForSelector(lineSave, { timeout: 8000 });
      await page.locator(lineSave).click();
      await waitPage(page, (sel) => document.querySelector(sel)?.getAttribute('aria-pressed') === 'true', lineSave, 15000, 'S23 keep the corrected line');
      await page.keyboard.press('Escape');
      await page.locator('.speak-saved .speak-row button', { hasText: /^(Shadow|影)$/u }).first().click();
      const c = await shadowOnce('a saved line');
      check('a saved line, shadowed from the saved list: the same three things, her line from the kept audio', honest(c), JSON.stringify(c));
    } finally { await f.context.close(); }
  },
};

/* ---------------------------------------------------------------- shots and the recording (WebKit) */
async function shots(browser) {
  mkdirSync(SHOTS, { recursive: true });
  for (const [world, seal] of [['hokusai', 'ai'], ['sumi', 'sumi']]) {
    const f = await newRoom(browser, { theme: world });
    const { page } = f;
    const shot = (name) => page.screenshot({ path: join(SHOTS, `${seal}-${name}.png`) });
    try {
      await enter(page, { kind: 'article', id: 'jawiki:5294446' });
      await opened(page);
      await page.waitForTimeout(500);
      await shot('01-rest');
      await ring(page).click();
      await until(page, "s.phase === 'listening' && s.take", 20000);
      await page.waitForTimeout(900);
      await shot('02-turn-listening');
      engines.mock.set({ clip: '003' });
      await page.evaluate(() => { window.__SPEAK_SPY__.clip = '003'; });
      await ring(page).click();
      await until(page, 's.session.lines.length >= 3', 20000);
      await until(page, "s.phase === 'speaking'", 10000).catch(() => {});
      await page.waitForTimeout(400);
      await shot('03-turn-kore-speaking');
      await settled(page);
      await page.evaluate(() => document.querySelector('.speak-line[data-who="me"]')?.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(450);
      await shot('04-corrections');
      // Bridge: the line, then 言ってみる with a kana check
      if ((await T(page).snap()).take) { await ring(page).click(); await page.waitForTimeout(600); }
      await page.locator('[data-foot="bridge"]').click();
      await talk(page, '001', 900);
      await until(page, "s.mode === 'sayit'", 15000);
      engines.mock.set({ sayit: 'mismatch' });
      await until(page, 's.take', 20000);
      await page.waitForTimeout(700);
      await ring(page).click();
      await until(page, 's.session.bridgeTries === 1', 15000);
      await page.waitForTimeout(500);
      await page.evaluate(() => document.querySelector('.speak-bridge')?.scrollIntoView({ block: 'center' }));
      await shot('05-bridge');
      engines.mock.set({ sayit: 'match' });
      await until(page, 's.take', 25000);
      await page.waitForTimeout(600);
      await ring(page).click();
      await until(page, "s.mode === 'talk'", 15000);
      await settled(page);
      // shadowing: Kore says it, he says it after her, three honest things
      if ((await T(page).snap()).take) { await ring(page).click(); await page.waitForTimeout(700); await settled(page); }
      if ((await T(page).snap()).take) { await page.evaluate(() => window.__SPEAK_TEST__.snap()); }
      await page.locator('[data-foot="shadow"]').click();
      await until(page, "s.layer === 'shadow'", 5000);
      await until(page, "s.phase === 'rest' || s.phase === 'listening'", 10000);
      if ((await T(page).snap()).phase === 'listening') { await ring(page).click(); await page.waitForTimeout(500); }
      await ring(page).click();
      await until(page, "s.phase === 'listening' && s.take", 25000);
      await page.waitForTimeout(1800);
      await ring(page).click();
      await until(page, 's.shadow', 15000);
      await waitPage(page, () => !!document.querySelector('.speak-shadow-result .speak-pitch'), null, 8000, 'shots: the shadowing result drawn');
      await page.evaluate(() => document.querySelector('.speak-shadow-result')?.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(300);
      await shot('06-shadowing');
      await page.evaluate(() => window.__SPEAK_TEST__.back());
      // the look back and the save-on-tap card
      await page.locator('[data-foot="end"]').click();
      await until(page, "s.layer === 'lookback'", 10000);
      await page.waitForTimeout(300);
      await shot('07-lookback');
      await page.locator('.speak-reached button.save-one').first().click();
      await page.waitForTimeout(900);
      await shot('08-save-on-tap');
    } catch (error) {
      console.log(`  shots ${seal}: ${String(error.message).slice(0, 200)}`);
      await shot('zz-error').catch(() => {});
    } finally { engines.mock.reset(); await f.context.close(); }
  }
  // one recorded mock conversation, about 25 s, converted to mp4
  const videoDir = join(SHOTS, 'video-raw');
  mkdirSync(videoDir, { recursive: true });
  const f = await newRoom(browser, { video: videoDir, theme: 'hokusai' });
  const { page } = f;
  const started = Date.now();
  try {
    await enter(page, { kind: 'article', id: 'jawiki:5294446' });
    await opened(page);
    await page.waitForTimeout(1200);
    await ring(page).click();
    await until(page, "s.phase === 'listening' && s.take", 20000);
    await talk(page, '003', 2200);
    await settled(page);
    await page.waitForTimeout(800);
    const word = page.locator('.speak-line[data-who="kore"] .speak-text button.sentence-tok').nth(2);
    await word.click().catch(() => {});
    await page.waitForTimeout(1600);
    await page.keyboard.press('Escape').catch(() => {});
    await page.evaluate(() => document.getElementById('mini')?.remove());
    await talk(page, '004', 2000);
    await settled(page);
    await page.waitForTimeout(800);
    if ((await T(page).snap()).take) { await ring(page).click(); await page.waitForTimeout(400); }
    await page.locator('[data-foot="end"]').click();
    await until(page, "s.layer === 'lookback'", 10000);
    await page.waitForTimeout(2400);
  } finally {
    const video = page.video();
    await f.context.close();
    const raw = video ? await video.path() : null;
    const seconds = (Date.now() - started) / 1000;
    if (raw && engines.ffmpeg) {
      const mp4 = join(SHOTS, 'speak-mock-conversation.mp4');
      execFileSync(engines.ffmpeg, ['-v', 'error', '-y', '-i', raw, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
      console.log(`  recording: ${mp4} (${seconds.toFixed(1)} s)`);
    }
  }
}

/* ---------------------------------------------------------------- main */
const receipt = { at: new Date().toISOString(), site: SITE, overlay: OVERLAY, fault: FAULT_NAME || null, only: ONLY ? [...ONLY] : null, engines: {}, cases: [], checks: results, pageErrors };
let host = null;
try {
  const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');
  host = await startStaticHost({ site: SITE, port: 0 });
  engines.origin = host.origin;
  engines.mock = await startMockPartner({ corridorDir: SITE });
  engines.ffmpeg = [process.env.FFMPEG, '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'].find((p) => p && existsSync(p)) || null;
  receipt.mock = engines.mock.endpoint;
  // the instruments themselves, by digest, so a receipt names the verifier and the mock that judged it
  receipt.instruments = Object.fromEntries(['verify-speak.mjs', 'speak-mock-partner.mjs'].map((f) => [f, createHash('sha256').update(readFileSync(join(HERE, f))).digest('hex')]));
  try { receipt.artifact = JSON.parse(readFileSync(join(SITE, 'build-identity.json'), 'utf8')).artifactSha256 || null; } catch { receipt.artifact = null; }
  const names = WHICH === 'all' ? ['webkit', 'chromium'] : [WHICH];
  for (const name of names) {
    const browser = await ({ chromium, webkit })[name].launch();
    receipt.engines[name] = browser.version();
    console.log(`${name} ${browser.version()}`);
    try {
      for (const [id, run] of Object.entries(CASES)) {
        if (ONLY && !ONLY.has(id)) continue;
        current = `${name} ${id}`;
        const started = Date.now();
        const before = results.length;
        engines.mock.reset();
        try {
          await Promise.race([run(browser, name), new Promise((_, reject) => setTimeout(() => reject(new Error('case timed out (240 s)')), 240_000))]);
        } catch (error) {
          let snap = null;
          try { snap = await engines.last?.page?.evaluate(() => window.__SPEAK_TEST__?.snap()); } catch { /* the page is gone */ }
          const tail = (engines.last?.console || []).filter((line) => /^(error|warning)/u.test(line)).slice(-6);
          const mock = engines.mock.requests.slice(-6).map((r) => `${r.kind}:${r.mode || r.voiceName || ''}`);
          check('the case ran to its end', false, `${String(error?.message || error).split('\n')[0]} · snap ${JSON.stringify(snap)?.slice(0, 400)} · mock ${mock.join(' ')} · console ${tail.join(' | ').slice(0, 400)}`);
        }
        const rows = results.slice(before);
        receipt.cases.push({ engine: name, case: id, pass: rows.length > 0 && rows.every((r) => r.pass), checks: rows.length, ms: Date.now() - started });
      }
      if (!ONLY) {
        // across every case: nothing left for any origin but the site and his configured provider (the harness blocks such a
        // request; this says whether the app ever tried, with what)
        current = `${name} egress`;
        const tried = engines.offOrigin.filter((x) => x.case.startsWith(`${name} `));
        check('across every case, the app tried no request to any origin but the site and his configured provider', tried.length === 0,
          `${tried.length} tried${tried.length ? `: ${tried.slice(0, 4).map((x) => `${x.case} ${x.method} ${x.url}${x.body ? ` (${x.body.length} bytes)` : ''}`).join(' | ')}` : ''}`);
        receipt.cases.push({ engine: name, case: 'egress', pass: tried.length === 0, checks: 1, ms: 0 });
      }
      if (SHOTS && name === 'webkit' && !FAULT) { current = `${name} shots`; await shots(browser); }
    } finally { await browser.close(); }
  }
} catch (error) {
  receipt.error = String(error?.stack || error);
  console.error(error);
} finally {
  if (pageErrors.length) receipt.cases.push({ engine: 'all', case: 'late page errors', pass: false, checks: pageErrors.length });
  receipt.served = Object.fromEntries(Object.entries(engines.served).map(([name, digests]) => [name, [...digests]]));
  receipt.pass = !receipt.error && receipt.cases.length > 0 && receipt.cases.every((c) => c.pass);
  writeFileSync(join(EVIDENCE, 'verify-speak.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  await engines.mock?.close().catch(() => {});
  await host?.close().catch(() => {});
  const failed = receipt.cases.filter((c) => !c.pass);
  console.log(`\nverify-speak: ${receipt.cases.length - failed.length}/${receipt.cases.length} cases green${failed.length ? ` · red: ${failed.map((c) => `${c.engine} ${c.case}`).join(', ')}` : ''}`);
  console.log(`receipt: ${join(EVIDENCE, 'verify-speak.json')}`);
  process.exitCode = receipt.pass ? 0 : 1;
}
