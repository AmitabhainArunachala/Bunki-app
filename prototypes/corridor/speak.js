/** 話す · Speak — a room where he talks out loud with Kore (track C, 2026-10-17; one-hand/SPEAK/DESIGN.md).
 *
 * John, 2026-10-17: "if we could have our own verion of jumpseak also in the app it would make it 10x better".
 * One call per turn hears him and writes Kore's reply as JSON (ears and brain); Kore's voice comes from the voice
 * lock, one request per sentence; his words, missed and due, are woven in; what he couldn't say becomes a card on his
 * tap; every word on the page is a door. Loaded with import() by corridor.js (loadSpeakRoom), which hands it one
 * frozen host: the room never reaches into the app except through that host.
 *
 * Laws kept here: Kore main, Charon only as a two-person scene's second character, never a device voice; nothing
 * plays before his first tap; the microphone is on only while the ring listens, and every take ends with every track
 * stopped; the key lives on this device only and travels in a header, never a URL; the record is written additively
 * (archive rows and gated evidence in one atomic write; a card only on his tap); a month's spend has his cap.
 */
import * as core from './speak-core.mjs';

const DEVICE_KEY = 'kairo-speak-device-v1';
const SPEND_KEY = 'kairo-speak-spend-v1';
const AUDIO_DB = 'kairo-speak-audio';
const AUDIO_DB_MAX_BYTES = 50 * 1024 * 1024;
const AUTO_LISTEN_MS = 60_000;
const TURN_BUDGET_MS = 30_000;
const VOICE_BUDGET_MS = 30_000;
const SLOW_RATE = 0.85;
const VISIBLE_MARKS = 2;

/** The take's capture, in the audio thread: frames are collected and sent home in ~2048-sample batches with their
 * level; 'stop' flushes what is left. Loaded from a blob, so the room stays three files. */
const WORKLET_SOURCE = `
class SpeakTake extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = []; this.n = 0; this.on = true;
    this.port.onmessage = (event) => { if (event.data === 'stop') { this.flush(true); this.on = false; } };
  }
  flush(last) {
    const out = new Float32Array(this.n);
    let at = 0, sum = 0;
    for (const part of this.buf) { out.set(part, at); at += part.length; }
    for (let i = 0; i < out.length; i += 1) sum += out[i] * out[i];
    this.port.postMessage({ pcm: out, rms: out.length ? Math.sqrt(sum / out.length) : 0, last }, [out.buffer]);
    this.buf = []; this.n = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && this.on) {
      this.buf.push(new Float32Array(channel));
      this.n += channel.length;
      if (this.n >= 2048) this.flush(false);
    }
    return this.on;
  }
}
registerProcessor('speak-take', SpeakTake);
`;

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};
const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
};

/** The ensō: one brush stroke round a circle, landing thick and thinning to a dry tail. A closed ensō leaves a small
 * breath of paper; the open one (no connection, no key) leaves a wide gap. */
function ensoPath(sweepDeg, cx = 36, cy = 36, r = 27) {
  const steps = 72, start = (-104 * Math.PI) / 180, sweep = (sweepDeg * Math.PI) / 180;
  const outer = [], inner = [];
  for (let k = 0; k <= steps; k += 1) {
    const u = k / steps, a = start + u * sweep;
    const w = 5.6 * (u < 0.07 ? 0.5 + (u / 0.07) * 0.5 : 1 - Math.pow((u - 0.07) / 0.93, 2.4) * 0.8);
    outer.push([cx + (r + w / 2) * Math.cos(a), cy + (r + w / 2) * Math.sin(a)]);
    inner.push([cx + (r - w / 2) * Math.cos(a), cy + (r - w / 2) * Math.sin(a)]);
  }
  const pt = ([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  return `M${pt(outer[0])} ${outer.slice(1).map((p) => `L${pt(p)}`).join(' ')} ${inner.reverse().map((p) => `L${pt(p)}`).join(' ')} Z`;
}

export function createSpeakRoom(host) {
  const t = (ja, en) => (host.english() ? en : ja);
  const st = {
    scene: null, sceneAsked: null, session: null, phase: 'rest', mode: 'talk', layer: null, status: null,
    lastTakeEnd: 0, lastGesture: 0, voiceRetired: false, unlocked: false, ctx: null, workletReady: null, take: null,
    micDenied: false, offline: false, requests: new Set(), playToken: 0, playing: null, keep: null, pastOpen: null,
    shadow: null, savedLines: null, epoch: 0, wavInfo: null, lastHeard: null, gum: 0,
  };
  let els = {};
  let silentUrl = null;
  let audio = null;
  let workletUrl = null;
  let observer = null;

  /* ---------------------------------------------------------------- device settings, transport, spend */
  const readJson = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
  const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
  function device() {
    const config = readJson(DEVICE_KEY);
    if (!config || config.v !== 1 || typeof config.credential?.key !== 'string' || !config.credential.key ||
      typeof config.credential.origin !== 'string' || /[\r\n\0]/u.test(config.credential.key)) return null;
    return config;
  }
  function lockNow() { return core.voiceLockFrom(host.voiceLock?.()); }
  /** The test endpoint, honoured only when the page itself is on 127.0.0.1 and the endpoint is too. */
  function endpointOverride() {
    try {
      const value = window.__KAIRO_SPEAK_ENDPOINT__;
      if (typeof value !== 'string' || location.hostname !== '127.0.0.1') return null;
      const url = new URL(value);
      return url.protocol === 'http:' && url.hostname === '127.0.0.1' ? url.href.replace(/\/+$/u, '') : null;
    } catch { return null; }
  }
  /** One snapshot per turn: where requests go and with which key, so two settings can never be spliced. A key bound to
   * another origin is no key at all. */
  function transport() {
    const lock = lockNow();
    const endpoint = endpointOverride() || lock.endpoint;
    const origin = new URL(endpoint).origin;
    const config = device();
    const key = config && config.credential.origin === origin ? config.credential.key : '';
    const ears = core.EARS_MODELS.includes(config?.models?.ears) ? config.models.ears : core.EARS_MODEL;
    return Object.freeze({ endpoint, origin, key, ears, lock });
  }
  const spend = () => readJson(SPEND_KEY);
  function addCost(model, usage) {
    const usd = core.usageCost(model, usage);
    const next = core.addSpend(spend(), usd ?? 0);
    writeJson(SPEND_KEY, next);
    if (st.session) st.session.cost += usd ?? 0;
    paintCost();
    return usd;
  }

  /* ---------------------------------------------------------------- requests */
  function failure(status, json, kind) {
    const error = new Error(kind || `http-${status}`);
    error.status = status;
    error.kind = kind || (status === 429 ? 'busy' : status === 404 ? 'not-found' : [400, 401, 403].includes(status) ? 'key' : status >= 500 ? 'server' : 'error');
    const delay = Array.isArray(json?.error?.details) ? json.error.details.find((d) => d?.retryDelay)?.retryDelay : null;
    if (delay) error.retryDelay = Math.ceil(parseFloat(delay) || 0);
    return error;
  }
  /** One POST to the provider: the key in its header, never in a URL; no cookies, no redirects, no referrer; one
   * abort budget for headers and body. */
  async function post(tp, path, body, budgetMs) {
    const controller = new AbortController();
    st.requests.add(controller);
    const timer = setTimeout(() => controller.abort(), budgetMs);
    try {
      let res;
      try {
        res = await fetch(`${tp.endpoint}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': tp.key },
          body: JSON.stringify(body),
          signal: controller.signal,
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          cache: 'no-store',
        });
      } catch (error) {
        throw failure(0, null, controller.signal.aborted ? 'timeout' : 'network');
      }
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* answered below */ }
      if (!res.ok) throw failure(res.status, json);
      if (!json) throw failure(res.status, null, 'malformed');
      return json;
    } finally {
      clearTimeout(timer);
      st.requests.delete(controller);
    }
  }
  function abortRequests() {
    for (const controller of st.requests) controller.abort();
    st.requests.clear();
  }

  /** Ears and brain: one call per turn. Returns the parsed turn and its usage; an English reply outside Bridge is asked
   * once more, then shown as text with a quiet note. */
  async function brain({ mode, wav = null, typed = null, target = null }) {
    const tp = transport();
    if (!tp.key) throw failure(0, null, 'no-key');
    const s = st.session;
    const system = core.buildSystemInstruction({ scene: st.scene, plants: s.plants, notes: s.notes, avoidOpenings: s.avoid, level: s.level });
    const history = s.lines.filter((line) => line.text).map((line) => ({ who: line.who === 'me' ? 'me' : 'kore', text: line.text }));
    const wavBase64 = wav ? core.bytesToBase64(wav) : null;
    const ask = async (nudge) => {
      const started = performance.now();
      const json = await post(tp, `/models/${tp.ears}:generateContent`, core.buildTurnRequest({ system, history, mode, wavBase64, typed, target, nudge }), TURN_BUDGET_MS);
      const usd = addCost(tp.ears, json.usageMetadata);
      const text = (json.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('');
      return { turn: core.parseTurn(text, { mode }), usage: json.usageMetadata || null, ms: Math.round(performance.now() - started), usd };
    };
    let answer = await ask(null);
    if (!answer.turn) throw failure(0, null, 'unclear');
    let englishNote = false;
    const replyText = answer.turn.reply.text;
    if (mode !== 'bridge' && replyText && !core.isJapaneseLine(replyText)) {
      const again = await ask('Your last reply was not in Japanese. Reply only in Japanese.');
      if (again.turn) answer = { ...again, ms: answer.ms + again.ms, usd: (answer.usd || 0) + (again.usd || 0), asked: 2 };
      englishNote = !answer.turn.reply.text || !core.isJapaneseLine(answer.turn.reply.text);
    }
    return { ...answer, model: tp.ears, englishNote };
  }

  /** The voice of one line: one request per sentence, in the lock's model and the line's voice. Sentence two renders
   * while sentence one plays. A failure leaves that sentence silent; the model gone (Nov 17) stops the voice. */
  function voiceLine(line) {
    const tp = transport();
    const name = core.voiceFor(line.speaker || 'main', st.scene, tp.lock);
    const sentences = splitLine(line);
    line.voice = [];
    let previous = Promise.resolve();
    for (const sentence of sentences) {
      const job = previous.then(async () => {
        if (!name || st.voiceRetired || !tp.key || st.offline) return null;
        const text = core.voiceText(sentence.tokens, sentence.text, (token) => readingTrap(token));
        try {
          const json = await post(tp, `/models/${tp.lock.model}:generateContent`, core.buildVoiceRequest(text, name), VOICE_BUDGET_MS);
          addCost(tp.lock.model, json.usageMetadata);
          const part = (json.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
          if (!part) return null;
          const pcm = core.base64ToBytes(part.inlineData.data);
          const wavBytes = /wav/iu.test(part.inlineData.mimeType || '') ? pcm : core.wavFromPcm16Bytes(pcm, core.pcmRate(part.inlineData.mimeType));
          return { url: URL.createObjectURL(new Blob([wavBytes], { type: 'audio/wav' })), wav: wavBytes, text: sentence.text };
        } catch (error) {
          if (error.kind === 'not-found') {
            st.voiceRetired = true;
            setStatus('voice-replaced');
          }
          return null;
        }
      });
      line.voice.push(job);
      previous = job;
    }
    Promise.all(line.voice).then((clips) => {
      line.silent = clips.length > 0 && clips.every((clip) => !clip);
      if (line.silent) paintLineState(line);
    });
    return line.voice;
  }
  function splitLine(line) {
    const tokens = Array.isArray(line.tokens) ? line.tokens : null;
    if (!tokens) return core.splitSentences(line.text).map((text) => ({ text, tokens: null }));
    const out = [];
    let current = [];
    for (const token of tokens) {
      current.push(token);
      if (/[。！？!?]$/u.test(token.s)) { out.push(current); current = []; }
    }
    if (current.length) out.push(current);
    return out.map((tokens) => ({ text: tokens.map((token) => token.s).join(''), tokens }));
  }
  /** A reading the dictionary would read otherwise is given to the voice in kana: what is shown is what is said. */
  function readingTrap(token) {
    if (!token?.r || token.b !== token.s) return false;
    const usual = host.defaultReading?.(token.b);
    return !!usual && core.kana(usual) !== core.kana(token.r);
  }

  /* ---------------------------------------------------------------- playback: one element, one owner */
  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'auto';
    return audio;
  }
  /** Inside his tap: the one element plays a 50 ms silence, so it may speak later after a wait (iOS); the AudioContext
   * is made at the device's own rate and resumed in the same gesture. */
  function primeInGesture() {
    st.lastGesture = Date.now();
    const a = ensureAudio();
    if (!st.unlocked) {
      silentUrl ||= URL.createObjectURL(new Blob([core.wavFromInt16(new Int16Array(1200), 24000)], { type: 'audio/wav' }));
      a.src = silentUrl;
      st.playing = { kind: 'silent' };
      const played = a.play();
      st.unlocked = true;
      played?.catch?.(() => { st.unlocked = false; });
    }
    try {
      // a context the system interrupted is replaced here, inside the tap, where a new one may start
      if (st.ctx && (st.ctx.state === 'closed' || st.ctx.state === 'interrupted')) {
        if (st.ctx.state !== 'closed') st.ctx.close().catch(() => {});
        st.ctx = null;
      }
      if (!st.ctx) st.ctx = makeContext();
      if (st.ctx.state !== 'running') st.ctx.resume().catch(() => {});
    } catch { st.ctx = null; }
  }
  function makeContext() {
    const ctx = new AudioContext();
    st.workletReady = null;
    ctx.addEventListener('statechange', () => {
      // an interruption from outside the app (a call, Siri, another app's audio): the take is discarded, the ring rests
      if (st.ctx === ctx && ctx.state !== 'running' && st.take) interrupt('interrupted');
    });
    return ctx;
  }
  /** Play one line's sentences through the one element; resolves 'done', 'stopped' or 'silent'. */
  async function playLine(line, { rate = 1 } = {}) {
    const token = ++st.playToken;
    host.stopAudio();
    const clips = line.voice || voiceLine(line);
    let played = 0;
    setPhase('speaking');
    for (const clipPromise of clips) {
      const clip = await clipPromise;
      if (token !== st.playToken) return 'stopped';
      if (!clip) continue;
      const result = await playClip(clip.url, rate, token);
      if (result !== 'ended') return 'stopped';
      played += 1;
    }
    if (token !== st.playToken) return 'stopped';
    st.playing = null;
    if (!played) paintLineState(line);
    return played ? 'done' : 'silent';
  }
  function playClip(url, rate, token) {
    return new Promise((done) => {
      const a = ensureAudio();
      const finish = (why) => {
        a.removeEventListener('ended', onEnded); a.removeEventListener('pause', onPause); a.removeEventListener('error', onError);
        done(why);
      };
      const onEnded = () => finish('ended');
      const onPause = () => { if (!a.ended) finish('paused'); };
      const onError = () => finish('error');
      a.addEventListener('ended', onEnded);
      a.addEventListener('pause', onPause);
      a.addEventListener('error', onError);
      a.src = url;
      a.defaultPlaybackRate = rate;
      a.playbackRate = rate;
      st.playing = { kind: 'line', token, rate };
      host.ownAudio(a);
      const p = a.play();
      p?.catch?.(() => finish('error'));
    });
  }
  function stopVoice() {
    st.playToken += 1;
    st.playing = null;
    if (audio && !audio.paused) { try { audio.pause(); } catch { /* already quiet */ } }
  }

  /* ---------------------------------------------------------------- the microphone */
  async function ensureWorklet(ctx) {
    workletUrl ||= URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'text/javascript' }));
    st.workletReady ||= ctx.audioWorklet.addModule(workletUrl);
    await st.workletReady;
  }
  /** The ring opens to listen: getUserMedia now and only now; the track is stopped at the end of every take. */
  async function startListening() {
    if (st.take || st.phase === 'listening') return;
    if (!navigator.mediaDevices?.getUserMedia) { st.micDenied = true; setStatus('mic-missing'); setPhase('rest'); return; }
    const epoch = st.epoch;
    setPhase('listening');
    let stream = null;
    try {
      if (!st.ctx || st.ctx.state === 'closed') st.ctx = makeContext();
      if (st.ctx.state !== 'running') await st.ctx.resume().catch(() => {});
      if (st.ctx.state !== 'running') {
        // an interrupted context that will not resume is replaced on this tap
        try { st.ctx.close(); } catch { /* gone */ }
        st.ctx = makeContext();
        await st.ctx.resume().catch(() => {});
      }
      st.gum += 1;
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } });
      if (epoch !== st.epoch || st.phase !== 'listening') { stream.getTracks().forEach((track) => track.stop()); return; }
      await ensureWorklet(st.ctx);
      if (epoch !== st.epoch || st.phase !== 'listening') { stream.getTracks().forEach((track) => track.stop()); return; }
      const source = st.ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(st.ctx, 'speak-take');
      const take = { stream, source, node, chunks: [], rate: st.ctx.sampleRate, started: performance.now(), level: 0, flushed: null };
      take.flushed = new Promise((resolve) => { take.resolveFlush = resolve; });
      node.port.onmessage = (event) => {
        if (event.data?.pcm?.length) take.chunks.push(event.data.pcm);
        take.level = Math.min(1, (event.data?.rms || 0) * 6);
        if (event.data?.last) take.resolveFlush();
      };
      source.connect(node);
      for (const track of stream.getTracks()) {
        track.addEventListener('mute', () => { if (st.take === take) interrupt('interrupted'); });
        track.addEventListener('ended', () => { if (st.take === take) interrupt('interrupted'); });
      }
      st.take = take;
      st.micDenied = false;
      if (st.status?.kind === 'mic-denied' || st.status?.kind === 'interrupted') setStatus(null);
      levelLoop(take);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (epoch !== st.epoch) return;
      st.micDenied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
      setStatus(st.micDenied ? 'mic-denied' : 'mic-missing');
      setPhase('rest');
    }
  }
  function levelLoop(take) {
    const step = () => {
      if (st.take !== take) { els.enso?.style.removeProperty('--level'); return; }
      els.enso?.style.setProperty('--level', take.level.toFixed(3));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  /** End the take: every track stopped, the graph undone. keep returns the audio as a 16 kHz mono WAV. */
  async function endTake(keep) {
    const take = st.take;
    if (!take) return null;
    st.take = null;
    st.lastTakeEnd = Date.now();
    try { take.node.port.postMessage('stop'); } catch { /* the node is gone */ }
    for (const track of take.stream.getTracks()) track.stop();
    try { take.source.disconnect(); } catch { /* already apart */ }
    els.enso?.style.removeProperty('--level');
    if (!keep) { setTimeout(() => { try { take.node.disconnect(); } catch { /* apart */ } }, 0); return null; }
    await Promise.race([take.flushed, new Promise((resolve) => setTimeout(resolve, 250))]);
    try { take.node.disconnect(); } catch { /* apart */ }
    const length = take.chunks.reduce((n, chunk) => n + chunk.length, 0);
    const pcm = new Float32Array(length);
    let at = 0;
    for (const chunk of take.chunks) { pcm.set(chunk, at); at += chunk.length; }
    const pcm16k = core.resample(pcm, take.rate, 16000);
    const wav = core.wavFromInt16(core.floatToInt16(pcm16k), 16000);
    st.wavInfo = { seconds: pcm16k.length / 16000, sampleRate: 16000, bytes: wav.length, tookMs: Math.round(performance.now() - take.started), inputRate: take.rate };
    return { wav, pcm16k };
  }
  /** Something outside the room took the microphone or the page: the take is discarded and the ring rests. */
  function interrupt(kind) {
    if (st.take) void endTake(false);
    if (st.phase === 'listening') setPhase('rest');
    setStatus(kind);
  }

  /* ---------------------------------------------------------------- sessions and turns */
  async function startSession() {
    const scene = st.scene;
    const epoch = st.epoch;
    const id = core.sessionId();
    const learning = host.learning(scene?.articleId || null) || {};
    let notes = [], avoid = [];
    try { notes = core.foldNotes(await host.archive('speak-notes')); } catch { notes = []; }
    try { avoid = core.recentOpenings(await host.archive('speak')); } catch { avoid = []; }
    if (epoch !== st.epoch) return;
    st.session = {
      id, contextRef: `speak:${id}`, lines: [], plants: core.selectPlants(learning), notes, avoid, level: host.level?.() || null,
      reached: [], bridges: [], used: new Set(), looked: new Set(), remember: [], cost: 0, xid: 0, ended: false, opened: false, savedNotes: [],
    };
    paintAll();
    void openLine();
  }
  const nextXid = () => `${st.session.id}-${(st.session.xid += 1)}`;
  /** The opening: one request for her line, then its voice, made ahead and played on his first tap. */
  async function openLine() {
    const s = st.session;
    if (!s || s.opened || !canRequest()) return;
    s.opened = true;
    const epoch = st.epoch;
    try {
      const answer = await brain({ mode: 'open' });
      if (epoch !== st.epoch || s !== st.session) return;
      const line = addLine({ who: answer.turn.reply.speaker === 'second' ? 'second' : 'kore', kind: 'opening', text: answer.turn.reply.text,
        tokens: answer.turn.reply.tokens, speaker: answer.turn.reply.speaker, englishNote: answer.englishNote });
      const xid = nextXid();
      await host.commitTurn([
        row('assistant', line.text, answer.model, xid),
        row('app', JSON.stringify({ kind: 'opening', text: line.text, scene: st.scene.id, ms: answer.ms, usage: answer.usage }), answer.model, xid),
      ], [], xid);
      voiceLine(line);
      if (st.waitingForOpening) { st.waitingForOpening = false; void speakThenListen(line); }
    } catch (error) {
      s.opened = false;
      if (epoch === st.epoch) failTurn(error);
    }
  }
  const row = (role, content, model, xid) => ({ surface: 'speak', role, content: String(content || ''), model, ts: Date.now(), xid, contextRef: st.session.contextRef });
  function addLine(line) {
    const s = st.session;
    const full = { at: Date.now(), ...line, index: s.lines.length };
    s.lines.push(full);
    for (const plant of s.plants) if (full.who !== 'me' && full.text.includes(plant.word)) s.used.add(`heard:${plant.word}`);
    paintScript();
    if (full.who !== 'me') announce(full.text);
    return full;
  }
  /** Kore speaks; as she finishes the ring opens to listen on its own, if his last take or tap was within a minute. */
  async function speakThenListen(line, options) {
    const mine = st.playToken + 1;
    const result = await playLine(line, options);
    if (result === 'stopped') {
      // another sound took the one speaker (or her line was stopped from outside): the ring rests, unless his tap or a
      // newer line already moved it on
      if (st.playToken === mine && st.phase === 'speaking') setPhase('rest');
      return result;
    }
    if (st.phase === 'listening') return result;
    setPhase('rest');
    if (autoListenAllowed()) void startListening();
    return result;
  }
  // the ring opens on its own only when the next turn could be sent: never a microphone for a turn the cap or a missing
  // key would refuse
  const autoListenAllowed = () => !st.layer && Date.now() - Math.max(st.lastTakeEnd, st.lastGesture) < AUTO_LISTEN_MS && !st.micDenied &&
    st.session && !st.session.ended && !st.offline && !!transport().key && core.spendAllows(spend());
  function canRequest() {
    if (st.offline || navigator.onLine === false) { st.offline = true; setStatus('offline'); return false; }
    if (!transport().key) { setStatus('no-key'); return false; }
    if (!core.spendAllows(spend())) { setStatus(Number(spend()?.cap) > 0 ? 'cap' : 'no-cap'); return false; }
    if (!host.recordWritable()) { setStatus('record'); return false; }
    return true;
  }

  /** One turn: his take (or typed line) → ears and brain → his line as heard, her reply → one atomic write → her voice. */
  async function turn({ wav = null, pcm16k = null, typed = null }) {
    const s = st.session;
    if (!s || !canRequest()) { setPhase('rest'); return; }
    const epoch = st.epoch;
    const mode = st.mode === 'bridge' ? 'bridge' : st.mode === 'sayit' ? 'sayit' : st.mode === 'shadow' ? 'shadow' : 'talk';
    const target = mode === 'sayit' ? s.bridgeLine?.text : mode === 'shadow' ? st.shadow?.line?.text : null;
    setPhase('thinking');
    let answer;
    try {
      answer = await brain({ mode, wav, typed, target });
    } catch (error) {
      if (epoch === st.epoch) { setPhase('rest'); failTurn(error); }
      return;
    }
    if (epoch !== st.epoch || s !== st.session) return;
    setStatus(null);
    const tr = answer.turn;
    if (mode === 'shadow') return shadowResult(tr, pcm16k, answer);
    if (mode === 'sayit') {
      const check = core.moraDiff(tr.heardKana || core.kana(tr.heard), s.bridgeLine.kana || readingOf(s.bridgeLine), { targetTokens: s.bridgeLine.tokens });
      s.bridgeTries += 1;
      if (!check.match && s.bridgeTries < 2) {
        st.lastHeard = { heard: tr.heard, check };
        setPhase('rest');
        paintBridgeHint(check);
        // once more, slower: the same voice at 0.85×, never another voice
        await speakThenListen(s.bridgeLine, { rate: SLOW_RATE });
        return;
      }
      s.bridges.push({ line: s.bridgeLine.text, matched: check.match, tries: s.bridgeTries });
      st.mode = 'talk';
      paintBridgeHint(null);
    }
    const me = addLine({ who: 'me', kind: typed ? 'typed' : 'take', text: tr.heard, heardKana: tr.heardKana, corrections: tr.corrections });
    const replySpeaker = tr.reply.speaker === 'second' && st.scene.second ? 'second' : 'main';
    const reply = addLine({ who: replySpeaker === 'second' ? 'second' : 'kore', kind: mode === 'bridge' ? 'bridge' : 'reply', text: tr.reply.text,
      tokens: tr.reply.tokens, speaker: replySpeaker, englishNote: answer.englishNote });
    for (const r of tr.reached) if (!s.reached.some((x) => x.word === r.word)) s.reached.push(r);
    const plantWords = new Set(s.plants.map((p) => p.word));
    const usedNow = tr.used.filter((w) => plantWords.has(w));
    for (const w of usedNow) s.used.add(`said:${w}`);
    for (const note of tr.remember) if (s.remember.length < 3 && !s.remember.includes(note)) s.remember.push(note);
    if (mode === 'bridge') {
      s.bridgeLine = { ...reply, kana: tr.bridge?.kana || '' };
      s.bridgeTries = 0;
      st.mode = 'sayit';
    }
    // the evidence: what his own line proves, gated by the host (dictionary or deck confirms the subject) to four rows
    const found = [];
    for (const c of tr.corrections) if (c.subject) found.push({ kind: 'sensei', subject: c.subject, subjectType: c.subjectType || 'word', polarity: 1, code: c.code });
    for (const r of tr.reached) found.push({ kind: 'sensei', subject: r.word, subjectType: 'word', polarity: 1, code: 'prod-gap' });
    for (const w of usedNow) found.push({ kind: 'sensei', subject: w, subjectType: 'word', polarity: 3, code: 'prod-gap' });
    const xid = nextXid();
    const analysis = { kind: 'turn', mode, scene: st.scene.id, heardKana: tr.heardKana, corrections: tr.corrections, reached: tr.reached, used: usedNow,
      remember: tr.remember, bridge: tr.bridge ? { text: tr.bridge.text, kana: tr.bridge.kana } : null, ms: answer.ms, usage: answer.usage,
      take: st.wavInfo && wav ? { seconds: st.wavInfo.seconds, sampleRate: 16000 } : null, voice: { model: transport().lock.model } };
    const saved = await host.commitTurn([
      row('user', me.text, answer.model, xid),
      row('assistant', reply.text, answer.model, xid),
      row('app', JSON.stringify(analysis), answer.model, xid),
    ], found, xid);
    if (!saved?.ok) setStatus('not-saved');
    if (epoch !== st.epoch) return;
    voiceLine(reply);
    paintScript();
    await speakThenListen(reply);
  }
  function readingOf(line) {
    return Array.isArray(line?.tokens) ? line.tokens.map((token) => token.r || token.s).join('') : core.kana(line?.text || '');
  }
  function failTurn(error) {
    const kind = error?.kind || 'error';
    if (kind === 'network') { st.offline = !navigator.onLine; setStatus(st.offline ? 'offline' : 'error'); return; }
    if (kind === 'busy') { setStatus('busy', { seconds: error.retryDelay || 0 }); return; }
    setStatus({ 'no-key': 'no-key', key: 'key', unclear: 'unclear', timeout: 'timeout', 'not-found': 'ears-gone', server: 'error', malformed: 'unclear' }[kind] || 'error');
  }

  /* ---------------------------------------------------------------- the ring */
  function onRing(event) {
    event?.preventDefault?.();
    primeInGesture();
    if (st.layer && st.layer !== 'shadow') return;
    const phase = st.phase;
    if (phase === 'listening') { void finishTake(); return; }
    if (phase === 'speaking') { stopVoice(); void startListening(); return; }
    if (phase === 'thinking') return;
    if (!st.session) return;
    if (st.mode === 'shadow' && st.shadow) { void shadowPlay(); return; }
    const s = st.session;
    const opening = s.lines.find((line) => line.kind === 'opening');
    if (opening && !s.firstTapDone) {
      s.firstTapDone = true;
      void speakThenListen(opening);
      return;
    }
    if (!opening && !s.firstTapDone) {
      s.firstTapDone = true;
      if (canRequest()) { st.waitingForOpening = true; setPhase('thinking'); if (!s.opened) void openLine(); }
      return;
    }
    if (st.mode === 'sayit' || canRequest()) void startListening();
  }
  async function finishTake() {
    const result = await endTake(true);
    if (!result) { setPhase('rest'); return; }
    if (result.pcm16k.length < 1600) { setPhase('rest'); setStatus('too-short'); return; }
    if (st.mode === 'shadow' && st.shadow) st.shadow.mine = result.pcm16k;
    await turn(result);
  }
  function setPhase(phase) {
    st.phase = phase;
    paintRing();
  }

  /* ---------------------------------------------------------------- Bridge (橋) and shadowing (影) */
  function onBridge() {
    if (!st.session || st.session.ended) return;
    if (st.mode === 'bridge' || st.mode === 'sayit') {
      // one tap folds it back: the talk goes on
      st.mode = 'talk';
      st.session.bridgeLine = null;
      paintBridgeHint(null);
      paintRing();
      return;
    }
    if (st.phase === 'speaking') stopVoice();
    st.mode = 'bridge';
    st.shadow = null;
    paintRing();
    paintBridgeHint(null);
  }
  function onShadow(line = null) {
    const s = st.session;
    if (st.layer === 'shadow' && !line) { closeLayer(); return; }
    const target = line || [...(s?.lines || [])].reverse().find((l) => l.who !== 'me' && l.text);
    if (st.phase === 'speaking') stopVoice();
    if (st.take) void endTake(false);
    st.shadow = { line: target || null, result: null, mine: null };
    st.mode = target ? 'shadow' : st.mode;
    openLayer('shadow');
  }
  async function shadowPlay() {
    const line = st.shadow?.line;
    if (!line) return;
    if (!line.voice && line.audioUrl) { setPhase('speaking'); await playClip(line.audioUrl, 1, ++st.playToken); setPhase('rest'); void startListening(); return; }
    await speakThenListen(line);
    if (st.phase !== 'listening' && !st.micDenied) void startListening();
  }
  async function shadowResult(tr, mine, answer) {
    const line = st.shadow?.line;
    if (!line) { setPhase('rest'); return; }
    const targetKana = readingOf(line);
    const check = core.moraDiff(tr.heardKana || core.kana(tr.heard), targetKana, { targetTokens: line.tokens });
    let hers = null, herSeconds = null;
    try {
      const clips = await Promise.all(line.voice || []);
      const pcm = clips.filter(Boolean).map((clip) => pcmOfWav(clip.wav));
      if (pcm.length) {
        const joined = new Float32Array(pcm.reduce((n, p) => n + p.data.length, 0));
        let at = 0;
        for (const p of pcm) { joined.set(p.data, at); at += p.data.length; }
        const at16 = core.resample(joined, pcm[0].rate, 16000);
        hers = core.pitchTrack(at16, 16000);
        herSeconds = at16.length / 16000;
      }
    } catch { hers = null; }
    const his = mine ? core.pitchTrack(mine, 16000) : null;
    st.shadow.result = { heard: tr.heard, heardKana: tr.heardKana, check, his, hers, mySeconds: mine ? mine.length / 16000 : null, herSeconds };
    const xid = nextXid();
    await host.commitTurn([
      row('user', tr.heard, answer.model, xid),
      row('app', JSON.stringify({ kind: 'shadow', scene: st.scene.id, target: line.text, heardKana: tr.heardKana, missing: check.missing, extra: check.extra, swaps: check.swaps, ms: answer.ms, usage: answer.usage }), answer.model, xid),
    ], [], xid);
    setPhase('rest');
    paintLayer();
  }
  function pcmOfWav(bytes) {
    const header = core.readWavHeader(bytes);
    const view = new DataView(bytes.buffer, bytes.byteOffset + 44, header.dataBytes);
    const data = new Float32Array(header.dataBytes / 2);
    for (let i = 0; i < data.length; i += 1) data[i] = view.getInt16(i * 2, true) / 0x8000;
    return { data, rate: header.sampleRate };
  }

  /* ---------------------------------------------------------------- the look back (振り返り) */
  async function onEnd() {
    const s = st.session;
    if (!s) return;
    if (st.phase === 'speaking') stopVoice();
    if (st.take) await endTake(false);
    abortRequests();
    s.ended = true;
    st.mode = 'talk';
    // Kore will remember: what he said about himself, written as notebook rows he can take back with 消す
    if (!s.notesWritten && s.remember.length) {
      s.notesWritten = true;
      const rows = s.remember.slice(0, 3).map((text, i) => {
        const id = `${s.id}-${i}`;
        s.savedNotes.push({ id, text, removed: false });
        return { surface: 'speak-notes', role: 'app', content: JSON.stringify({ op: 'add', id, text }), ts: Date.now(), contextRef: s.contextRef };
      });
      await host.commitTurn(rows, [], null);
    }
    openLayer('lookback');
  }
  async function removeNote(note, button) {
    if (note.removed) return;
    button.disabled = true;
    const ok = await host.commitTurn([{ surface: 'speak-notes', role: 'app', content: JSON.stringify({ op: 'remove', id: note.id }), ts: Date.now(), contextRef: st.session.contextRef }], [], null);
    note.removed = !!ok?.ok;
    paintLayer();
  }

  /* ---------------------------------------------------------------- layers: one level deeper, Back recedes */
  function openLayer(layer) {
    st.layer = layer;
    if (layer !== 'shadow' && st.phase === 'listening') void endTake(false).then(() => setPhase('rest'));
    paintAll();
    els.root?.querySelector('[data-layer-title]')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  function closeLayer() {
    const was = st.layer;
    st.layer = was === 'past-session' ? 'past' : null;
    if (was === 'shadow') { st.shadow = null; st.mode = 'talk'; if (st.take) void endTake(false).then(() => setPhase('rest')); }
    if (was === 'past-session') st.pastOpen = null;
    paintAll();
    return true;
  }

  /* ---------------------------------------------------------------- painting */
  /** The room's skin, loaded the way the deck player loads its own (decks/player/mount.js ensureCss). */
  function ensureCss() {
    if (document.querySelector('link[data-speak-css]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('./rooms/speak.css', import.meta.url).href;
    link.dataset.speakCss = '1';
    document.head.append(link);
  }
  function render(main) {
    ensureCss();
    observe();
    const root = el('section', 'speak-room');
    root.setAttribute('aria-labelledby', 'speak-title');
    root.dataset.phase = st.phase;
    els = { root, main };
    root.append(head());
    const body = el('div', 'speak-body');
    els.body = body;
    root.append(body);
    const status = el('div', 'speak-status');
    status.setAttribute('role', 'status');
    els.status = status;
    root.append(status);
    const announcer = el('p', 'visually-hidden speak-announce');
    announcer.setAttribute('aria-live', 'polite');
    els.announce = announcer;
    root.append(announcer);
    root.append(dock());
    const cost = el('button', 'speak-cost');
    cost.type = 'button';
    cost.addEventListener('click', () => openLayer('connect'));
    els.cost = cost;
    root.append(cost);
    root.addEventListener('click', onRoomClick, true);
    root.addEventListener('keydown', onRoomKey);
    main.append(root);
    paintAll();
  }
  function head() {
    const header = el('header', 'speak-head');
    const sc = st.scene;
    const kind = el('p', 'eyebrow speak-kind', sc ? t(core.SCENE_KINDS[sc.kind]?.ja || '', core.SCENE_KINDS[sc.kind]?.en || '') : t('話す', 'Speak'));
    const title = el('h1', 'view-title speak-title');
    title.id = 'speak-title';
    const door = el('button', 'speak-scene-door');
    door.type = 'button';
    door.lang = 'ja';
    door.textContent = sc ? (sc.kind === 'article' ? `「${sc.title.ja}」` : t(sc.title.ja, sc.title.en)) : t('場面を選ぶ', 'Choose a scene');
    door.setAttribute('aria-label', t(`場面：${door.textContent} — 変える`, `Scene: ${door.textContent} — change`));
    door.addEventListener('click', () => openLayer('scenes'));
    title.append(door);
    const role = el('p', 'speak-role');
    if (sc) role.textContent = t(`相手：${sc.role.ja}${sc.second ? `・${sc.second.ja}` : ''}`, `Kore plays ${sc.role.en}${sc.second ? `, with ${sc.second.en}` : ''}`);
    header.append(kind, title, role);
    return header;
  }
  function dock() {
    const wrap = el('div', 'speak-dock');
    els.dock = wrap;
    const bridge = footMark('bridge', '橋', t('橋 — 英語でも言える', 'Bridge — say it any way'), onBridge);
    const enso = el('button', 'speak-enso');
    enso.type = 'button';
    enso.id = 'speak-enso';
    const art = svg('svg', { viewBox: '0 0 72 72', width: 72, height: 72, 'aria-hidden': 'true', focusable: 'false', class: 'enso-art' });
    const defs = svg('defs');
    const grad = svg('radialGradient', { id: 'speak-bokashi', cx: '50%', cy: '50%', r: '50%' });
    // あてなしぼかし (focus): the world's ink laid soft and edgeless from the centre — his voice, deepening
    grad.append(svg('stop', { offset: '0%', class: 'bokashi-core' }), svg('stop', { offset: '62%', class: 'bokashi-mid' }), svg('stop', { offset: '100%', class: 'bokashi-edge' }));
    defs.append(grad);
    art.append(defs);
    art.append(svg('circle', { cx: 36, cy: 36, r: 25, class: 'enso-wash', fill: 'url(#speak-bokashi)' }));
    art.append(svg('path', { d: ensoPath(338), class: 'enso-ink enso-closed' }));
    art.append(svg('path', { d: ensoPath(286), class: 'enso-ink enso-open' }));
    art.append(svg('path', { d: ensoPath(338), class: 'enso-red' }));
    const arc = svg('g', { class: 'enso-arc' });
    arc.append(svg('path', { d: 'M36 9 A27 27 0 0 1 57.4 19.4', class: 'enso-arc-stroke' }));
    art.append(arc);
    const label = el('span', 'speak-enso-label');
    enso.append(art, label);
    enso.addEventListener('click', onRing);
    els.enso = enso;
    els.ensoLabel = label;
    const shadow = footMark('shadow', '影', t('影 — あとについて言う', 'Shadow — say it after her'), () => onShadow());
    const end = footMark('end', '了', t('了 — 終えて振り返る', 'End — and look back'), () => void onEnd());
    const left = el('div', 'speak-foot speak-foot-left');
    left.append(bridge);
    const right = el('div', 'speak-foot speak-foot-right');
    right.append(shadow, end);
    els.foot = { bridge, shadow, end };
    wrap.append(left, enso, right);
    return wrap;
  }
  function footMark(id, glyph, name, run) {
    const b = el('button', 'icon-button speak-mark', glyph);
    b.type = 'button';
    b.lang = 'ja';
    b.dataset.foot = id;
    b.setAttribute('aria-label', name);
    b.title = name;
    b.addEventListener('click', run);
    return b;
  }
  function paintAll() {
    if (!els.root) return;
    els.root.dataset.layer = st.layer || '';
    els.root.dataset.mode = st.mode;
    paintBody();
    paintRing();
    paintStatus();
    paintCost();
  }
  function paintBody() {
    if (!els.body) return;
    els.body.replaceChildren();
    if (st.layer && st.layer !== 'shadow') { paintLayer(); return; }
    paintScript();
    if (st.layer === 'shadow') paintLayer();
  }
  function paintScript() {
    if (!els.body || (st.layer && st.layer !== 'shadow')) return;
    let script = els.body.querySelector('.speak-script');
    const drawn = !!script;
    if (!script) {
      script = el('ol', 'speak-script');
      script.setAttribute('aria-label', t('会話', 'Conversation'));
      els.body.prepend(script);
    }
    const lines = st.session?.lines || [];
    // a new line is added beside the old ones, never by redrawing them: a word slip open on an earlier line stays open
    const sid = st.session?.id || '';
    if (script.dataset.session !== sid) { script.replaceChildren(); script.dataset.session = sid; }
    const have = new Set([...script.children].map((node) => node.dataset.index).filter((index) => index != null));
    script.querySelector('.speak-waiting')?.remove();
    for (const line of lines) {
      if (have.has(String(line.index))) continue;
      const node = lineNode(line);
      // a line that arrives fades in once; a redrawn room does not replay it
      if (drawn) node.classList.add('is-new');
      script.append(node);
    }
    if (!lines.length) {
      const quiet = el('li', 'speak-line speak-waiting');
      quiet.setAttribute('aria-hidden', 'true');
      script.append(quiet);
    }
    paintBridgeHint(st.lastBridgeCheck || null);
  }
  function lineNode(line) {
    const li = el('li', 'speak-line');
    li.dataset.who = line.who;
    li.dataset.kind = line.kind;
    li.dataset.index = String(line.index);
    const seal = el('span', 'speak-seal', line.who === 'me' ? '私' : line.who === 'second' ? '二' : line.kind === 'bridge' ? '橋' : '相');
    seal.setAttribute('aria-hidden', 'true');
    seal.lang = 'ja';
    const said = el('div', 'speak-said');
    const partner = lockNow().mainVoice.prebuilt;
    said.append(el('span', 'visually-hidden', line.who === 'me' ? t('あなた：', 'You: ') : `${t(st.scene?.role?.ja || partner, st.scene?.role?.en || partner)}: `));
    const text = el('p', 'speak-text');
    text.lang = 'ja';
    text.dataset.japaneseLookup = 'true';
    text.dataset.lookupBlock = 'true';
    if (line.who === 'me') paintHeard(text, line);
    else if (Array.isArray(line.tokens) && line.tokens.length) host.sentence(text, doorTokens(line.tokens), { contextId: st.session.contextRef });
    else host.words(text, line.text);
    roving(text);
    said.append(text);
    if (line.who === 'me' && line.corrections?.length > VISIBLE_MARKS) said.append(moreMarks(line));
    if (line.englishNote) said.append(el('p', 'speak-note', t('この返事は英語でした。', 'This reply came in English.')));
    if (line.silent) said.append(el('p', 'speak-note speak-silent', t('声を出せませんでした', 'No voice for this line')));
    li.append(seal, said);
    return li;
  }
  /** His line as Kore heard it, word for word, every word a door that counts nothing; 朱入れ: at most two red marks,
   * each an underline in the world's red with the right form above it. */
  function paintHeard(container, line) {
    const text = line.text || '';
    const marks = [];
    for (const c of (line.corrections || []).slice(0, VISIBLE_MARKS)) {
      const at = text.indexOf(c.wrong.trim());
      if (at < 0 || marks.some((m) => at < m.at + m.len && m.at < at + c.wrong.trim().length)) continue;
      marks.push({ at, len: c.wrong.trim().length, c });
    }
    marks.sort((a, b) => a.at - b.at);
    let cursor = 0;
    for (const mark of marks) {
      if (mark.at > cursor) host.words(container, text.slice(cursor, mark.at));
      const shu = el('span', 'speak-shu');
      const right = el('span', 'speak-shu-right');
      right.lang = 'ja';
      host.words(right, mark.c.right);
      if (mark.c.rightReading && mark.c.rightReading !== mark.c.right) right.append(el('span', 'speak-shu-reading', `（${mark.c.rightReading}）`));
      const wrong = el('span', 'speak-shu-wrong');
      host.words(wrong, text.slice(mark.at, mark.at + mark.len));
      shu.append(right, wrong);
      shu.setAttribute('aria-label', t(`直し：${mark.c.right}`, `Correction: ${mark.c.right}`));
      container.append(shu);
      cursor = mark.at + mark.len;
    }
    if (cursor < text.length) host.words(container, text.slice(cursor));
  }
  function moreMarks(line) {
    const wrap = el('div', 'speak-shu-more');
    const rest = line.corrections.slice(VISIBLE_MARKS);
    const toggle = el('button', 'btn-tertiary speak-quiet', t(`ほかの直し ${rest.length}`, `${rest.length} more`));
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    const list = el('ul', 'speak-shu-list');
    list.hidden = true;
    for (const c of rest) {
      const item = el('li');
      item.lang = 'ja';
      host.words(item, c.wrong);
      item.append(' → ');
      host.words(item, c.right);
      list.append(item);
    }
    toggle.addEventListener('click', () => {
      list.hidden = !list.hidden;
      toggle.setAttribute('aria-expanded', String(!list.hidden));
    });
    wrap.append(toggle, list);
    return wrap;
  }
  /** G3's rule: one focus stop per paragraph, a roving word focus inside it. */
  function roving(block) {
    const words = [...block.querySelectorAll('button')].filter((b) => !b.closest('.speak-shu-more'));
    words.forEach((word, i) => { word.tabIndex = i === 0 ? 0 : -1; });
    block.addEventListener('focusin', (event) => {
      const word = event.target.closest?.('button');
      if (word && words.includes(word)) for (const other of words) other.tabIndex = other === word ? 0 : -1;
    });
    block.addEventListener('keydown', (event) => {
      const word = event.target.closest?.('button');
      const at = words.indexOf(word);
      if (at < 0 || event.altKey || event.ctrlKey || event.metaKey) return;
      const next = { ArrowRight: words[at + 1], ArrowLeft: words[at - 1], Home: words[0], End: words.at(-1) }[event.key];
      if (!next) return;
      event.preventDefault();
      event.stopPropagation();
      next.focus();
    });
  }
  function paintLineState(line) {
    const node = els.body?.querySelector(`.speak-line[data-index="${line.index}"] .speak-said`);
    if (!node || node.querySelector('.speak-silent') || !line.silent) return;
    node.append(el('p', 'speak-note speak-silent', t('声を出せませんでした', 'No voice for this line')));
  }
  function paintBridgeHint(check) {
    st.lastBridgeCheck = check;
    const body = els.body;
    if (!body || st.layer) return;
    body.querySelector('.speak-bridge')?.remove();
    if (st.mode !== 'bridge' && st.mode !== 'sayit') return;
    const box = el('div', 'speak-bridge');
    box.setAttribute('role', 'note');
    if (st.mode === 'bridge') {
      box.append(el('p', 'speak-bridge-t', t('言いたいことを、英語でも日本語でも。Kore が自然な一文にします。', 'Say what you mean, in English or mixed. Kore gives you the natural line.')));
    } else {
      box.append(el('p', 'speak-bridge-t', t('言ってみる — Kore の一文を、声に出して。', 'Say it — Kore’s line, out loud.')));
      if (check) {
        const diff = el('p', 'speak-kana');
        diff.lang = 'ja';
        paintKanaDiff(diff, check);
        box.append(diff);
      }
    }
    body.append(box);
  }
  /** The kana check, drawn: the sounds heard in order, a missing one in red brackets, an extra one struck. */
  function paintKanaDiff(node, check) {
    node.setAttribute('aria-label', t(`足りない音 ${check.missing} · 余分な音 ${check.extra} · 違う音 ${check.swaps}`,
      `${check.missing} missing · ${check.extra} extra · ${check.swaps} different`));
    for (const op of check.ops) {
      if (op.op === 'same') node.append(el('span', 'kana-same', op.h));
      else if (op.op === 'missing') node.append(el('span', `kana-missing${op.particle ? ' is-particle' : ''}`, op.t));
      else if (op.op === 'extra') node.append(el('span', 'kana-extra', op.h));
      else node.append(el('span', `kana-swap${op.particle ? ' is-particle' : ''}`, op.h), el('span', 'kana-missing kana-was', op.t));
    }
  }
  function paintRing() {
    const enso = els.enso;
    if (!enso) return;
    const closed = st.offline || !transport().key;
    const phase = closed && st.phase === 'rest' ? 'open' : st.phase;
    enso.dataset.phase = phase;
    els.root && (els.root.dataset.phase = phase);
    const listening = st.phase === 'listening';
    enso.setAttribute('aria-pressed', String(listening));
    const sayit = st.mode === 'sayit';
    const word = phase === 'listening' ? t('聞いています', 'Listening')
      : phase === 'speaking' ? t('話しています', 'Speaking')
      : phase === 'thinking' ? t('考えています', 'Thinking')
      : sayit ? t('言ってみる', 'Say it')
      : st.mode === 'bridge' ? t('橋', 'Bridge')
      : st.mode === 'shadow' ? t('影', 'Shadow') : t('話す', 'Speak');
    els.ensoLabel.textContent = word;
    els.ensoLabel.lang = host.english() ? 'en' : 'ja';
    const name = phase === 'listening' ? t('聞いています — 話し終えたら押す', 'Listening — tap when you’re done')
      : phase === 'speaking' ? t('Kore が話しています — 押すと止めて話せる', 'Kore is speaking — tap to stop her and talk')
      : phase === 'thinking' ? t('Kore が考えています', 'Kore is thinking')
      : phase === 'open' ? t('話す — いまは使えない', 'Speak — not available now')
      : sayit ? t('言ってみる — 押して、一文を声に出す', 'Say it — tap, then say the line')
      : t('話す — 押して始める', 'Speak — tap to begin');
    enso.setAttribute('aria-label', name);
    enso.setAttribute('aria-disabled', String(phase === 'open' || phase === 'thinking'));
    if (els.foot) {
      els.foot.bridge.setAttribute('aria-pressed', String(st.mode === 'bridge' || st.mode === 'sayit'));
      els.foot.shadow.setAttribute('aria-pressed', String(st.layer === 'shadow'));
    }
    if (els.dock) els.dock.hidden = !!(st.layer && st.layer !== 'shadow');
  }
  const STATUS = {
    offline: ['つながっていません。これまでの会話と保存した影は開けます。', 'Not connected. Past conversations and saved lines still open.'],
    'no-key': ['Kore と話すには、Google の鍵がこの端末に必要です。', 'To talk with Kore, this device needs a Google key.'],
    'no-cap': ['話す前に、月の上限を決めてください。', 'Set a monthly limit before you talk.'],
    cap: ['今月の上限に達しました。次の会話は上限を変えると始められます。', 'This month’s limit is reached. Raise it to talk again.'],
    record: ['記録の準備ができていません。少し待ってから、もう一度。', 'Your record is not ready yet. Try again in a moment.'],
    'mic-denied': ['マイクが使えません。文字で伝えることもできます。', 'The microphone is off for this site. You can type instead.'],
    'mic-missing': ['この端末ではマイクが使えません。文字で伝えられます。', 'No microphone here. You can type instead.'],
    interrupted: ['話す途中で止まりました。もう一度押すと続けられます。', 'Interrupted. Tap the ring to go on.'],
    'too-short': ['短すぎて聞き取れませんでした。もう一度。', 'Too short to hear. Try again.'],
    busy: ['Kore は少し待ってほしいそうです。', 'Kore needs a moment.'],
    unclear: ['Kore の返事がうまく届きませんでした。もう一度。', 'Kore’s answer didn’t come through. Try again.'],
    timeout: ['返事が遅すぎました。もう一度。', 'The answer took too long. Try again.'],
    key: ['Google がこの鍵を受けつけませんでした。', 'Google didn’t accept this key.'],
    'ears-gone': ['Kore の耳のモデルが見つかりません。', 'Kore’s listening model isn’t available.'],
    error: ['Kore と話せませんでした。言ったことは残っています。', 'Kore couldn’t answer. Nothing you said is lost.'],
    'voice-replaced': ['Kore の声は入れ替えの途中です。文字はそのまま続きます。', 'Kore’s voice is being replaced. The words go on.'],
    'not-saved': ['この一往復は記録に残せませんでした。', 'This turn wasn’t saved to your record.'],
  };
  function setStatus(kind, detail = {}) {
    st.status = kind ? { kind, ...detail } : null;
    paintStatus();
    paintRing();
  }
  function paintStatus() {
    const box = els.status;
    if (!box) return;
    box.replaceChildren();
    const kind = st.status?.kind;
    if (!kind || !STATUS[kind] || (st.layer && st.layer !== 'shadow')) { box.hidden = true; return; }
    box.hidden = false;
    let text = t(...STATUS[kind]);
    if (kind === 'busy' && st.status.seconds) text += t(` ${st.status.seconds}秒後にもう一度。`, ` Try again in ${st.status.seconds} s.`);
    box.append(el('p', 'speak-status-t', text));
    const door = (ja, en, run) => {
      const b = el('button', 'btn-tertiary speak-quiet', t(ja, en));
      b.type = 'button';
      b.addEventListener('click', run);
      box.append(b);
    };
    if (['no-key', 'no-cap', 'cap', 'key'].includes(kind)) door('設定', 'Settings', () => openLayer('connect'));
    if (kind === 'offline') door('これまでの会話', 'Past conversations', () => openLayer('past'));
    if (kind === 'mic-denied' || kind === 'mic-missing') box.append(typedForm());
  }
  /** Never a dead end: with no microphone he can type what he means, and Kore answers as if he had said it. */
  function typedForm() {
    const form = el('form', 'speak-type');
    const input = el('input', 'speak-type-input');
    input.type = 'text';
    input.lang = 'ja';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', t('言いたいこと', 'What you want to say'));
    input.placeholder = t('言いたいこと（英語でも）', 'What you want to say (any language)');
    const send = el('button', 'btn-tertiary speak-quiet', t('送る', 'Send'));
    send.type = 'submit';
    form.append(input, send);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const typed = input.value.trim();
      if (!typed || !st.session) return;
      if (!core.isJapaneseLine(typed)) st.mode = 'bridge';
      input.value = '';
      void turn({ typed });
    });
    return form;
  }
  function paintCost() {
    if (!els.cost) return;
    const s = spend();
    const month = s && s.month === core.spendMonth() ? s.usd : 0;
    const cap = Number(s?.cap) > 0 ? s.cap : null;
    els.cost.textContent = cap ? t(`今月 $${month.toFixed(2)} · 上限 $${cap}`, `This month $${month.toFixed(2)} · limit $${cap}`) : t('鍵と上限', 'Key and limit');
    els.cost.hidden = !!(st.layer && st.layer !== 'shadow');
  }
  function announce(text) {
    if (!els.announce) return;
    els.announce.textContent = '';
    requestAnimationFrame(() => { if (els.announce) els.announce.textContent = text; });
  }

  /* ---------------------------------------------------------------- the layers' pages */
  function paintLayer() {
    if (!els.body) return;
    const layer = st.layer;
    if (layer === 'shadow') { paintShadow(); return; }
    els.body.replaceChildren();
    const page = el('section', `speak-page speak-page-${layer}`);
    els.body.append(page);
    if (layer === 'lookback') paintLookback(page);
    else if (layer === 'connect') paintConnect(page);
    else if (layer === 'scenes') paintScenes(page);
    else if (layer === 'past') void paintPast(page);
    else if (layer === 'past-session') paintPastSession(page);
  }
  function pageTitle(page, ja, en) {
    const h = el('h2', 'speak-page-title', t(ja, en));
    h.tabIndex = -1;
    h.dataset.layerTitle = '';
    page.append(h);
    return h;
  }
  function section(page, ja, en) {
    const sec = el('section', 'speak-sec');
    sec.append(el('h3', 'speak-sec-title', t(ja, en)));
    page.append(sec);
    return sec;
  }
  function paintLookback(page) {
    const s = st.session;
    pageTitle(page, '振り返り', 'Look back');
    // 言えなかった言葉: each a door, each with the one Save ▾ — nothing is kept until he taps
    const reached = section(page, '言えなかった言葉', 'What you reached for');
    if (!s.reached.length) reached.append(el('p', 'speak-quiet-line', t('今日はありませんでした。', 'Nothing today.')));
    const list = el('ul', 'speak-rows');
    for (const r of s.reached) {
      const item = el('li', 'speak-row speak-reached');
      const word = el('p', 'speak-row-word');
      word.lang = 'ja';
      word.dataset.japaneseLookup = 'true';
      host.words(word, r.word);
      if (r.reading) word.append(el('span', 'speak-row-reading', `（${r.reading}）`));
      item.append(word, host.saveOne({ word: r.word, reading: r.reading }));
      list.append(item);
    }
    reached.append(list);
    // 朱: his lines beside the natural ones, each to hear and to shadow
    const fixed = section(page, '朱 · 直した文', 'Your lines, corrected');
    const mine = s.lines.filter((line) => line.who === 'me' && line.corrections?.length);
    if (!mine.length) fixed.append(el('p', 'speak-quiet-line', t('直しはありませんでした。', 'No corrections.')));
    for (const line of mine) {
      const item = el('div', 'speak-pair');
      const his = el('p', 'speak-pair-his');
      his.lang = 'ja';
      his.dataset.japaneseLookup = 'true';
      paintHeard(his, line);
      const natural = line.corrections.reduce((text, c) => text.replace(c.wrong.trim(), c.right), line.text);
      const nat = el('p', 'speak-pair-natural');
      nat.lang = 'ja';
      nat.dataset.japaneseLookup = 'true';
      host.words(nat, natural);
      const acts = el('div', 'speak-acts');
      const listen = el('button', 'btn-tertiary speak-quiet', t('聞く', 'Listen'));
      listen.type = 'button';
      const natLine = { who: 'kore', kind: 'natural', text: natural, tokens: null, speaker: 'main', index: -1 };
      listen.addEventListener('click', () => { primeInGesture(); void playLine(natLine).then(() => setPhase('rest')); });
      const shadow = el('button', 'btn-tertiary speak-quiet', t('影', 'Shadow'));
      shadow.type = 'button';
      shadow.addEventListener('click', () => { st.layer = null; onShadow(natLine); });
      acts.append(listen, shadow);
      item.append(his, nat, acts);
      fixed.append(item);
    }
    // 今日の言葉: his planted words, why each came, and what happened
    const words = section(page, '今日の言葉', 'Your words that came up');
    if (!s.plants.length) words.append(el('p', 'speak-quiet-line', t('今日はまだありません。', 'None yet today.')));
    const wl = el('ul', 'speak-rows');
    for (const p of s.plants) {
      const item = el('li', 'speak-row');
      const word = el('p', 'speak-row-word');
      word.lang = 'ja';
      word.dataset.japaneseLookup = 'true';
      host.words(word, p.word);
      const happened = [s.used.has(`said:${p.word}`) ? t('自分で言えた', 'you said it') : null,
        s.used.has(`heard:${p.word}`) ? t('聞いた', 'you heard it') : null,
        s.looked.has(p.word) ? t('調べた', 'you looked it up') : null].filter(Boolean);
      item.append(word, el('p', 'speak-row-why', [p.why, happened.join(' · ') || t('出なかった', 'didn’t come up')].filter(Boolean).join(' — ')));
      wl.append(item);
    }
    words.append(wl);
    // Kore will remember: zero to three notes, each one he can take back
    const notes = section(page, 'Kore が覚えておくこと', 'Kore will remember');
    if (!s.savedNotes.length) notes.append(el('p', 'speak-quiet-line', t('今日はありません。', 'Nothing new.')));
    for (const note of s.savedNotes) {
      const item = el('div', 'speak-row speak-note-row');
      const text = el('p', 'speak-row-word', note.text);
      text.lang = 'ja';
      if (note.removed) item.classList.add('is-removed');
      const remove = el('button', 'btn-tertiary speak-quiet', note.removed ? t('消しました', 'Removed') : t('消す', 'Remove'));
      remove.type = 'button';
      remove.disabled = note.removed;
      remove.addEventListener('click', () => void removeNote(note, remove));
      item.append(text, remove);
      notes.append(item);
    }
  }
  function paintConnect(page) {
    pageTitle(page, 'Kore と話すために', 'To talk with Kore');
    page.append(el('p', 'speak-para', t('話すには Google AI Studio の鍵を使います。設定と鍵はこの端末だけに残り、学習の記録には入りません。鍵は設定した提供元にだけ送られます。',
      'Speaking uses a Google AI Studio key. Provider settings and keys stay on this device, outside your learning record. A key is sent only to its configured provider.')));
    page.append(el('p', 'speak-para', t('話した声は一回ごとに Google に送られます。有料の鍵なら、Google が製品の改善に使うことはありません。',
      'Your voice goes to Google with each turn. Only a paid key keeps Google from using it to improve its products.')));
    const config = device();
    const form = el('form', 'speak-connect');
    const keyLabel = el('label', 'speak-field');
    keyLabel.append(el('span', 'speak-field-t', t('鍵', 'Key')));
    const key = el('input');
    key.type = 'password';
    key.autocomplete = 'off';
    key.spellcheck = false;
    key.name = 'speak-key';
    key.placeholder = config ? t('保存済み（変えるときだけ入力）', 'Saved (type only to change it)') : 'AIza…';
    keyLabel.append(key);
    const capLabel = el('label', 'speak-field');
    capLabel.append(el('span', 'speak-field-t', t('月の上限（ドル）', 'Monthly limit (USD)')));
    const cap = el('input');
    cap.type = 'number';
    cap.min = '1';
    cap.step = '1';
    cap.inputMode = 'numeric';
    cap.value = String(Number(spend()?.cap) > 0 ? spend().cap : 10);
    capLabel.append(cap);
    const save = el('button', 'chip', t('保存', 'Save'));
    save.type = 'submit';
    const note = el('p', 'speak-quiet-line');
    note.setAttribute('role', 'status');
    form.append(keyLabel, capLabel, save);
    if (config) {
      const forget = el('button', 'btn-tertiary speak-quiet', t('鍵を消す', 'Remove the key'));
      forget.type = 'button';
      forget.addEventListener('click', () => {
        try { localStorage.removeItem(DEVICE_KEY); } catch { /* nothing kept */ }
        note.textContent = t('鍵を消しました。', 'The key is removed.');
        paintRing();
      });
      form.append(forget);
    }
    form.append(note);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const limit = Math.max(1, Math.round(Number(cap.value) || 0));
      const typedKey = key.value.trim();
      const endpoint = endpointOverride() || lockNow().endpoint;
      if (typedKey) {
        if (typedKey.length > 512 || /[\s\0]/u.test(typedKey)) { note.textContent = t('鍵の形が違います。', 'That doesn’t look like a key.'); return; }
        writeJson(DEVICE_KEY, { v: 1, configId: crypto.randomUUID(), credential: { origin: new URL(endpoint).origin, key: typedKey }, models: { ears: core.EARS_MODEL } });
      }
      const current = spend();
      writeJson(SPEND_KEY, { ...core.addSpend(current, 0), cap: limit });
      key.value = '';
      note.textContent = t('保存しました。', 'Saved.');
      setStatus(null);
      paintCost();
    });
    page.append(form);
    const est = core.hourEstimate(lockNow().model);
    if (est != null) page.append(el('p', 'speak-quiet-line', t(`目安：一時間話して約 $${est.toFixed(2)}`, `About $${est.toFixed(2)} for an hour of talking`)));
  }
  function paintScenes(page) {
    pageTitle(page, '場面', 'Scenes');
    const pick = (sc, label) => {
      const b = el('button', 'study-door speak-scene');
      b.type = 'button';
      b.append(el('span', 'study-door-t', label || (sc.kind === 'article' ? `「${sc.title.ja}」` : t(sc.title.ja, sc.title.en))),
        el('span', 'study-door-sub', t(`${core.SCENE_KINDS[sc.kind].ja} · 相手：${sc.role.ja}`, `${core.SCENE_KINDS[sc.kind].en} · Kore plays ${sc.role.en}`)));
      b.addEventListener('click', () => void chooseScene(sc.id));
      return b;
    };
    const articles = host.recentArticles?.() || [];
    if (articles.length) {
      const sec = section(page, '読んだ記事', 'What you read');
      for (const a of articles) sec.append(pick(core.articleScene(a)));
    }
    for (const kind of ['field', 'life', 'two', 'free']) {
      const sec = section(page, core.SCENE_KINDS[kind].ja, core.SCENE_KINDS[kind].en);
      for (const sc of core.SCENE_TEMPLATES.filter((x) => x.kind === kind)) sec.append(pick(sc));
    }
    const past = el('button', 'btn-tertiary speak-quiet', t('これまでの会話', 'Past conversations'));
    past.type = 'button';
    past.addEventListener('click', () => openLayer('past'));
    page.append(past);
  }
  async function chooseScene(id) {
    const sc = await resolveScene(id);
    if (!sc) return;
    leaveSession();
    st.scene = sc;
    st.layer = null;
    paintHead();
    paintAll();
    void startSession();
  }
  function paintHead() {
    const old = els.root?.querySelector('.speak-head');
    if (old) old.replaceWith(head());
  }
  async function paintPast(page) {
    pageTitle(page, 'これまでの会話', 'Past conversations');
    let sessions = [];
    try { sessions = core.pastSessions(await host.archive('speak')); } catch { sessions = []; }
    if (st.layer !== 'past') return;
    if (!sessions.length) page.append(el('p', 'speak-quiet-line', t('まだありません。', 'None yet.')));
    for (const session of sessions.slice(0, 30)) {
      const b = el('button', 'study-door speak-past');
      b.type = 'button';
      const first = session.lines.find((line) => line.who === 'kore')?.text || session.lines[0].text;
      b.append(el('span', 'study-door-t', first.slice(0, 40)), el('span', 'study-door-sub', new Date(session.ts).toLocaleString(host.english() ? 'en' : 'ja')));
      b.addEventListener('click', () => { st.pastOpen = session; openLayer('past-session'); });
      page.append(b);
    }
    paintSavedLines(page);
  }
  function paintPastSession(page) {
    const session = st.pastOpen;
    pageTitle(page, '会話', 'Conversation');
    const script = el('ol', 'speak-script is-past');
    for (const line of session?.lines || []) {
      const li = el('li', 'speak-line');
      li.dataset.who = line.who;
      const seal = el('span', 'speak-seal', line.who === 'me' ? '私' : '相');
      seal.setAttribute('aria-hidden', 'true');
      const text = el('p', 'speak-text');
      text.lang = 'ja';
      text.dataset.japaneseLookup = 'true';
      host.words(text, line.text);
      roving(text);
      li.append(seal, text);
      script.append(li);
    }
    page.append(script);
  }
  function paintShadow() {
    const body = els.body;
    body.querySelector('.speak-shadow')?.remove();
    const sh = st.shadow;
    const box = el('section', 'speak-shadow');
    box.setAttribute('aria-label', t('影', 'Shadowing'));
    const title = el('h2', 'speak-page-title', t('影 · あとについて言う', 'Shadow · say it after her'));
    title.tabIndex = -1;
    title.dataset.layerTitle = '';
    box.append(title);
    if (sh?.line) {
      const target = el('p', 'speak-text speak-shadow-line');
      target.lang = 'ja';
      target.dataset.japaneseLookup = 'true';
      if (Array.isArray(sh.line.tokens) && sh.line.tokens.length) host.sentence(target, doorTokens(sh.line.tokens), { contextId: st.session?.contextRef || 'speak' });
      else host.words(target, sh.line.text);
      roving(target);
      box.append(target);
      box.append(el('p', 'speak-quiet-line', t('輪を押すと Kore が言います。あとについて言い、終わったらもう一度押す。', 'Tap the ring: Kore says it. Say it after her, then tap again.')));
      const keep = el('button', 'btn-tertiary speak-quiet', t('この文を残す', 'Keep this line'));
      keep.type = 'button';
      keep.addEventListener('click', () => void keepLine(sh.line, keep));
      box.append(keep);
    }
    if (sh?.result) box.append(shadowFigure(sh.result));
    paintSavedLines(box);
    body.append(box);
  }
  /** Three honest things, no score: the kana heard with what was missing or extra, his pitch line over hers, the time. */
  function shadowFigure(result) {
    const fig = el('figure', 'speak-shadow-result');
    const kanaLine = el('p', 'speak-kana');
    kanaLine.lang = 'ja';
    paintKanaDiff(kanaLine, result.check);
    fig.append(kanaLine);
    if (result.his || result.hers) fig.append(pitchPicture(result));
    const times = el('figcaption', 'speak-times');
    const fmt = (s) => (s == null ? '—' : `${s.toFixed(1)} s`);
    times.textContent = t(`あなた ${fmt(result.mySeconds)} · Kore ${fmt(result.herSeconds)}`, `You: ${fmt(result.mySeconds)} · Kore: ${fmt(result.herSeconds)}`);
    fig.append(times);
    return fig;
  }
  function pitchPicture({ his, hers }) {
    const w = 320, h = 96;
    const frames = Math.max(his?.length || 0, hers?.length || 0, 1);
    const y = (hz) => h - 6 - ((Math.log(hz) - Math.log(75)) / (Math.log(500) - Math.log(75))) * (h - 12);
    const line = (f0, cls) => {
      if (!f0) return null;
      let d = '', pen = false;
      f0.forEach((hz, i) => {
        if (!hz) { pen = false; return; }
        d += `${pen ? 'L' : 'M'}${((i / frames) * w).toFixed(1)} ${y(hz).toFixed(1)} `;
        pen = true;
      });
      return d ? svg('path', { d, class: cls }) : null;
    };
    const pic = svg('svg', { viewBox: `0 0 ${w} ${h}`, class: 'speak-pitch', role: 'img', 'aria-label': t('声の高さの線：Kore と あなた', 'Pitch lines: Kore and you') });
    const hersLine = line(hers, 'pitch-hers');
    const hisLine = line(his, 'pitch-his');
    if (hersLine) pic.append(hersLine);
    if (hisLine) pic.append(hisLine);
    return pic;
  }

  /* ---------------------------------------------------------------- saved lines (影 on this device) */
  function openAudioDb() {
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open(AUDIO_DB, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('lines', { keyPath: 'id' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = request.onblocked = () => resolve(null);
      } catch { resolve(null); }
    });
  }
  async function savedLines() {
    const db = await openAudioDb();
    if (!db) return [];
    return new Promise((resolve) => {
      const out = [];
      const tx = db.transaction('lines', 'readonly');
      tx.objectStore('lines').openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) { out.push(cursor.value); cursor.continue(); } else resolve(out);
      };
      tx.onerror = () => resolve(out);
      tx.oncomplete = () => db.close();
    });
  }
  async function keepLine(line, button) {
    button.disabled = true;
    const clips = (await Promise.all(line.voice || voiceLine(line))).filter(Boolean);
    const bytes = clips.reduce((n, clip) => n + clip.wav.length, 0);
    const existing = await savedLines();
    const used = existing.reduce((n, item) => n + (item.bytes || 0), 0);
    if (!clips.length || used + bytes > AUDIO_DB_MAX_BYTES) { button.textContent = t('残せませんでした', 'Couldn’t keep it'); return; }
    const db = await openAudioDb();
    if (!db) { button.textContent = t('残せませんでした', 'Couldn’t keep it'); return; }
    const item = { id: `${Date.now().toString(36)}`, text: line.text, tokens: line.tokens || null, bytes, ts: Date.now(),
      audio: clips.map((clip) => new Blob([clip.wav], { type: 'audio/wav' })) };
    await new Promise((resolve) => {
      const tx = db.transaction('lines', 'readwrite');
      tx.objectStore('lines').put(item);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
    button.textContent = t('残しました', 'Kept');
    st.savedLines = null;
  }
  function paintSavedLines(container) {
    const sec = el('section', 'speak-sec speak-saved');
    sec.append(el('h3', 'speak-sec-title', t('保存した影', 'Saved lines')));
    const list = el('ul', 'speak-rows');
    sec.append(list);
    container.append(sec);
    void savedLines().then((items) => {
      if (!items.length) { list.append(el('li', 'speak-quiet-line', t('まだありません。', 'None yet.'))); return; }
      for (const item of items.slice(-40).reverse()) {
        const row = el('li', 'speak-row');
        const text = el('p', 'speak-row-word');
        text.lang = 'ja';
        text.dataset.japaneseLookup = 'true';
        host.words(text, item.text);
        const play = el('button', 'btn-tertiary speak-quiet', t('聞く', 'Listen'));
        play.type = 'button';
        play.addEventListener('click', async () => {
          primeInGesture();
          const token = ++st.playToken;
          for (const blob of item.audio || []) {
            const url = URL.createObjectURL(blob);
            const result = await playClip(url, 1, token);
            URL.revokeObjectURL(url);
            if (result !== 'ended') break;
          }
          setPhase('rest');
        });
        const shadow = el('button', 'btn-tertiary speak-quiet', t('影', 'Shadow'));
        shadow.type = 'button';
        shadow.addEventListener('click', () => {
          const clips = (item.audio || []).map((blob) => Promise.resolve(null).then(async () => {
            const wav = new Uint8Array(await blob.arrayBuffer());
            return { url: URL.createObjectURL(blob), wav, text: item.text };
          }));
          onShadow({ who: 'kore', kind: 'saved', text: item.text, tokens: item.tokens, speaker: 'main', index: -1, voice: clips });
        });
        row.append(text, play, shadow);
        list.append(row);
      }
    });
  }

  /* ---------------------------------------------------------------- the room's own hands */
  function onRoomClick(event) {
    const word = event.target.closest?.('[data-speak-b], .japanese-lookup-word');
    if (!word || !els.root?.contains(word)) return;
    const b = word.dataset.speakB || word.dataset.lookupText || word.textContent || '';
    const r = word.dataset.speakR || '';
    if (st.session) {
      st.session.looked.add(b);
      for (const p of st.session.plants) if (p.word === b) st.session.looked.add(p.word);
    }
    host.setKeep({ word: b, reading: r });
  }
  function onRoomKey(event) {
    // Space toggles the ensō from anywhere in the room that is not itself a control
    if (event.key !== ' ' || event.target.closest?.('button, input, textarea, select, a, [contenteditable]')) return;
    event.preventDefault();
    els.enso?.click();
  }
  function observe() {
    if (observer) return;
    const app = document.getElementById('app');
    if (!app) return;
    // the room is left by any road (a tab, the dojo door, a search): the microphone and the voice go with it
    observer = new MutationObserver(() => {
      if (!host.isCurrent() && (st.take || st.phase !== 'rest' || st.requests.size || (audio && !audio.paused))) leave();
    });
    observer.observe(app, { childList: true });
  }
  function onVisibility() {
    if (document.hidden && st.take) interrupt('interrupted');
    if (document.hidden && st.phase === 'speaking') { stopVoice(); setPhase('rest'); }
  }
  function onOnline() {
    st.offline = navigator.onLine === false;
    if (!st.offline && st.status?.kind === 'offline') setStatus(null);
    if (st.offline) setStatus('offline');
    paintRing();
    if (!st.offline && st.session && !st.session.opened) void openLine();
  }
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOnline);

  function leaveSession() {
    st.epoch += 1;
    stopVoice();
    if (st.take) void endTake(false);
    abortRequests();
    st.session = null;
    st.mode = 'talk';
    st.shadow = null;
    st.waitingForOpening = false;
    st.phase = 'rest';
  }

  /** A scene by id: an article he read (its bounded excerpt quoted to Kore), or one of the generic templates. */
  async function resolveScene(id) {
    if (typeof id === 'string' && id.startsWith('article:')) {
      const article = await host.article(id.slice(8));
      return article ? core.articleScene(article) : null;
    }
    return core.sceneById(id);
  }
  /** Kore's tokens carry the corridor's furigana pairs before they become doors (the aligner, speak-core). */
  const doorTokens = (tokens) => tokens.map((token) => ({ ...token, f: core.alignFurigana(token.s, token.r) }));

  /* ---------------------------------------------------------------- the host's handles */
  /** A new visit: the scene it was opened with (an article) or today's story or free talk; a fresh session. */
  function enter(scene = null) {
    leaveSession();
    st.layer = null;
    st.status = null;
    st.offline = navigator.onLine === false;
    st.sceneAsked = scene;
    st.scene = null;
    const id = scene?.kind === 'article' && scene.id ? `article:${scene.id}` : scene?.id || 'free';
    const epoch = st.epoch;
    void resolveScene(id).then((sc) => sc || resolveScene('free')).then((sc) => {
      if (epoch !== st.epoch) return;
      st.scene = sc;
      paintHead();
      if (st.offline) { setStatus('offline'); paintAll(); return; }
      void startSession();
    });
  }
  /** Back inside the room: a layer recedes, a Bridge folds; false when the room itself should be left. */
  function back() {
    if (st.layer) { closeLayer(); return true; }
    if (st.mode === 'bridge' || st.mode === 'sayit') { onBridge(); return true; }
    return false;
  }
  function leave() {
    leaveSession();
    st.layer = null;
    if (st.ctx) { try { st.ctx.close(); } catch { /* closed */ } st.ctx = null; st.workletReady = null; }
    st.unlocked = false;
  }
  /** Read-only state for the verification suites (the __KAIRO_* idiom): never the key, never audio. */
  function snapshot() {
    const s = st.session;
    return JSON.parse(JSON.stringify({
      phase: st.phase, mode: st.mode, layer: st.layer, status: st.status?.kind || null, scene: st.scene?.id || null,
      session: s ? { id: s.id, lines: s.lines.map((l) => ({ who: l.who, kind: l.kind, text: l.text, silent: !!l.silent, corrections: l.corrections?.length || 0 })),
        plants: s.plants.map((p) => p.word), reached: s.reached.map((r) => r.word), ended: s.ended, bridgeTries: s.bridgeTries || 0, notes: s.savedNotes } : null,
      wav: st.wavInfo, gum: st.gum, take: !!st.take, voiceRetired: st.voiceRetired, offline: st.offline, micDenied: st.micDenied,
      playing: st.playing ? { kind: st.playing.kind, rate: st.playing.rate || 1 } : null, audioPaused: audio ? audio.paused : true,
      audioRate: audio ? audio.playbackRate : null, shadow: st.shadow?.result ? { missing: st.shadow.result.check.missing, extra: st.shadow.result.check.extra,
        swaps: st.shadow.result.check.swaps, his: !!st.shadow.result.his, hers: !!st.shadow.result.hers, mySeconds: st.shadow.result.mySeconds,
        herSeconds: st.shadow.result.herSeconds } : null,
      ctxState: st.ctx ? st.ctx.state : null,
    }));
  }
  return Object.freeze({ render, enter, back, leave, snapshot, interruptForTest: () => interrupt('interrupted') });
}
