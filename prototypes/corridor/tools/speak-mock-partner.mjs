#!/usr/bin/env node
/** 話す · Speak — the mock partner (DESIGN §5.2). Test only: no network beyond 127.0.0.1, no key, no spend.
 *
 * A local HTTP server that speaks the two adapters' shapes (Generative Language API v1beta):
 *   POST /v1beta/models/<model>:generateContent        ears and brain (JSON schema out) — or the voice, when the body
 *                                                       asks for AUDIO (24 kHz 16-bit PCM, as the TTS models answer)
 *   POST /v1beta/models/<model>:streamGenerateContent  the voice, streamed (server-sent events)
 * with CORS for the page's origin, exactly as a browser meets the real endpoint (a preflight for x-goog-api-key).
 *
 * Canned turns are keyed by the clip that was "said" (the verifier plays a shipped Kore clip into the room's microphone
 * and names it here with set({ clip })). Kore's reply audio is cut from the same shipped clips, decoded once with
 * ffmpeg: test fixtures only — the 3.8 clips never play as the partner in the product. Every request is recorded
 * (path, model, origin, headers seen, the body, the WAV it carried) so the verifier can assert the model and voice,
 * the key's absence from URLs, kana forcing, and where text went.
 *
 * Fault modes (set({ fault })): busy (429 + retryDelay) · server (500) · timeout (never answers) · malformed (JSON that
 * is not JSON) · english (a reply in English, twice) · english-once · voice-gone (the voice model not found, as on
 * 2026-11-17) · voice-fail (500 on the voice) · slow-voice (the voice answers after voiceDelayMs).
 *
 * Run alone: node prototypes/corridor/tools/speak-mock-partner.mjs [--port 8787]  (prints its endpoint)
 */
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as core from '../speak-core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(HERE, '..');
const CLIPS = ['000', '001', '002', '003', '004', '005'];

/** A canned line, with its tokens (s, b, r) so the room can make every word a door and the voice can be checked. */
const line = (...parts) => {
  const tokens = parts.map((p) => (Array.isArray(p) ? { s: p[0], b: p[2] || p[0], r: p[1] ?? p[0] } : { s: p, b: p, r: /[\p{Script=Han}]/u.test(p) ? '' : p }));
  return { text: tokens.map((t) => t.s).join(''), tokens };
};
const OPENINGS = {
  free: line(['今日', 'きょう'], 'は', ['何', 'なん'], 'の', ['話', 'はなし'], 'を', 'しましょう', 'か', '。'),
  article: line('「', ['決断', 'けつだん'], 'と', ['挑戦', 'ちょうせん'], '、', ['実行', 'じっこう'], 'の', ['内閣', 'ないかく'], '」', 'って', ['名前', 'なまえ'], '、', 'どう', ['思', 'おも', '思う'], 'います', 'か', '？'),
  two: line('お', ['世話', 'せわ'], 'に', 'なっ', 'て', 'おり', 'ます', '。', ['棚', 'たな'], 'の', ['高', 'たか', '高い'], 'さ', 'の', ['件', 'けん'], 'です', 'ね', '。'),
};
/** Each clip's canned turn: what was heard, Kore's reply, the red pen, what he reached for, what he used. */
const TURNS = {
  '000': { heard: '第2次高市改造内閣は、2026年に成立した日本の内閣です。',
    reply: line(['令和', 'れいわ'], ['8', 'はち'], ['年', 'ねん'], 'の', ['秋', 'あき'], 'です', 'ね', '。', ['覚', 'おぼ', '覚える'], 'えて', 'い', 'ます', 'か', '？') },
  '001': { heard: '自由民主党と日本維新の会を与党とする連立内閣です。',
    reply: line(['連立', 'れんりつ'], 'は', ['初', 'はじ', '初めて'], 'めて', 'でした', 'か', '？'),
    second: line(['棚', 'たな'], 'は', ['少', 'すこ', '少し'], 'し', ['高', 'たか', '高い'], 'め', 'に', 'し', 'ましょう', '。') },
  '002': { heard: '内閣改造は三年ぶりです。',
    reply: line(['三', 'さん'], ['年', 'ねん'], 'ぶり', 'です', 'か', '。', ['長', 'なが', '長い'], 'い', 'です', 'ね', '。') },
  '003': { heard: '高市総理は、この内閣を「決断と挑戦、実行の内閣」と名付けた。',
    reply: line(['名前', 'なまえ'], 'に', ['三', 'みっ'], 'つ', 'の', ['言葉', 'ことば'], 'を', ['入', 'い', '入れる'], 'れた', 'ん', 'です', 'ね', '。', 'どれ', 'が', ['大事', 'だいじ'], 'だ', 'と', ['思', 'おも', '思う'], 'います', 'か', '？'),
    corrections: [
      { wrong: '名付けた', right: '名付けました', rightReading: 'なづけました', code: 'form-miss', subject: '名付ける', subjectType: 'word' },
      { wrong: '内閣を', right: '内閣に', rightReading: 'ないかくに', code: 'particle-drop', subject: 'ないかくゑ', subjectType: 'word' },
      { wrong: 'この', right: 'その', rightReading: 'その', code: 'collocation', subject: 'その', subjectType: 'word' },
    ],
    reached: [{ word: '命名', reading: 'めいめい' }],
    used: ['内閣'],
    remember: ['政治のニュースをよく読む'] },
  '004': { heard: 'えっと、LEDの工事で、竹の間を使いました。',
    reply: line(['竹', 'たけ'], 'の', ['間', 'ま'], 'に', ['変', 'か', '変わる'], 'わった', 'ん', 'です', 'ね', '。'),
    reached: [{ word: '認証', reading: 'にんしょう' }],
    remember: ['皇居の行事に興味がある'] },
  '005': { heard: '国務大臣の任命は、一生に一度の晴れ舞台です。',
    reply: line(['晴', 'は', '晴れる'], 'れ', ['舞台', 'ぶたい'], '、', 'いい', ['言葉', 'ことば'], 'です', 'ね', '。') },
};
const BRIDGE = line(['真珠', 'しんじゅ'], 'の', ['加工', 'かこう'], 'の', 'ため', 'です', '。');
const BRIDGE_KANA = 'しんじゅのかこうのためです';
const SAYIT_REPLY = line('そう', 'です', 'ね', '。', ['加工', 'かこう'], 'の', ['話', 'はなし'], 'を', 'もっと', ['聞', 'き', '聞く'], 'かせて', 'ください', '。');
const ENGLISH = { text: 'That sounds interesting. What did you think of it?', tokens: [{ s: 'That sounds interesting. What did you think of it?', b: 'That sounds interesting. What did you think of it?', r: '' }] };

/** The kana of a canned line, for the shadowing case (what was "heard" when he repeats it, one sound short). */
const kanaOf = (l) => l.tokens.map((t) => core.kana(t.r || t.s)).join('').replace(/[^\p{Script=Hiragana}ー]/gu, '');
const KNOWN_LINES = [...Object.values(OPENINGS), ...Object.values(TURNS).flatMap((t) => [t.reply, t.second].filter(Boolean)), BRIDGE, SAYIT_REPLY];

function findFfmpeg() {
  return [process.env.FFMPEG, '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg'].find((path) => path && (path === 'ffmpeg' || existsSync(path)));
}
/** Kore's reply audio: each shipped clip decoded once to 24 kHz mono 16-bit PCM (test fixtures only). */
function decodeClips(corridorDir) {
  const ffmpeg = findFfmpeg();
  const out = {};
  for (const id of CLIPS) {
    const clip = resolve(corridorDir, `audio/narration/kore/jawiki_5294446-${id}.m4a`);
    out[id] = execFileSync(ffmpeg, ['-v', 'error', '-i', clip, '-ac', '1', '-ar', '24000', '-f', 's16le', '-'], { maxBuffer: 64 * 1024 * 1024 });
  }
  return out;
}

export async function startMockPartner({ port = 0, corridorDir = CORRIDOR } = {}) {
  const pcm = decodeClips(corridorDir);
  const state = { requests: [], clip: '003', fault: null, sayit: 'match', voiceDelayMs: 0, brainDelayMs: 0, hung: [], englishLeft: 0, voiceN: 0 };
  const cors = (req) => ({
    'access-control-allow-origin': req.headers.origin || '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-goog-api-key',
    'access-control-max-age': '600',
    vary: 'origin',
  });
  const send = (req, res, status, json) => {
    res.writeHead(status, { 'content-type': 'application/json', ...cors(req) });
    res.end(JSON.stringify(json));
  };
  const error = (req, res, status, statusText, message, details = []) => send(req, res, status, { error: { code: status, message, status: statusText, details } });

  function brain(req, res, body, record) {
    const system = body.systemInstruction?.parts?.map((p) => p.text).join('\n') || '';
    const last = body.contents?.at(-1)?.parts || [];
    const directive = last.map((p) => p.text || '').find((text) => text.startsWith('MODE: ')) || 'MODE: {"mode":"talk"}';
    let mode = 'talk', target = null, note = null;
    try { ({ mode, target = null, note = null } = JSON.parse(directive.slice(6))); } catch { /* talk */ }
    const audio = last.find((p) => p.inlineData);
    record.mode = mode;
    record.nudge = note;
    if (audio) {
      const bytes = core.base64ToBytes(audio.inlineData.data);
      record.wav = { mimeType: audio.inlineData.mimeType, ...core.readWavHeader(bytes) };
    }
    record.typed = last.some((p) => (p.text || '').startsWith('TYPED'));
    if (state.fault === 'busy') return error(req, res, 429, 'RESOURCE_EXHAUSTED', 'Quota exceeded (mock).', [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '2s' }]);
    if (state.fault === 'server') return error(req, res, 500, 'INTERNAL', 'Internal error (mock).');
    if (state.fault === 'timeout') { state.hung.push(res); return null; }
    const two = /speaker "second"/u.test(system);
    let turn;
    if (mode === 'open') {
      const opening = /SOURCE \(quoted data/u.test(system) ? OPENINGS.article : two ? OPENINGS.two : OPENINGS.free;
      turn = { heard: '', heardKana: '', reply: { ...opening, speaker: 'main' }, corrections: [], reached: [], used: [], remember: [] };
    } else if (mode === 'bridge') {
      turn = { heard: 'How do I say pearl processing?', heardKana: '', reply: { ...BRIDGE, speaker: 'main' }, bridge: { ...BRIDGE, kana: BRIDGE_KANA },
        corrections: [], reached: [{ word: '加工', reading: 'かこう' }], used: [], remember: [] };
    } else if (mode === 'sayit') {
      const heardKana = state.sayit === 'match' ? BRIDGE_KANA : 'しんじゅのかこのためです';
      turn = { heard: state.sayit === 'match' ? BRIDGE.text : '真珠のかこのためです。', heardKana, reply: { ...SAYIT_REPLY, speaker: 'main' }, corrections: [], reached: [], used: [], remember: [] };
    } else if (mode === 'shadow') {
      const known = KNOWN_LINES.find((l) => l.text === target);
      const kana = known ? kanaOf(known) : core.kana(String(target || ''));
      // he repeated it one sound short: the third sound is missing
      const heardKana = kana.length > 3 ? kana.slice(0, 2) + kana.slice(3) : kana;
      turn = { heard: heardKana, heardKana, reply: { text: '', tokens: [] }, corrections: [], reached: [], used: [], remember: [] };
    } else {
      const canned = TURNS[state.clip] || TURNS['003'];
      const second = two && canned.second;
      turn = { heard: canned.heard, heardKana: '', reply: { ...(second ? canned.second : canned.reply), speaker: second ? 'second' : 'main' },
        corrections: canned.corrections || [], reached: canned.reached || [], used: canned.used || [], remember: canned.remember || [] };
    }
    if (state.fault === 'english' || (state.fault === 'english-once' && state.englishLeft > 0)) {
      state.englishLeft -= 1;
      if (mode !== 'bridge') turn = { ...turn, reply: { ...ENGLISH, speaker: 'main' } };
    }
    const text = state.fault === 'malformed' ? '{"heard": "まだ", "reply": ' : JSON.stringify(turn);
    const audioTokens = record.wav ? Math.round(record.wav.seconds * core.AUDIO_TOKENS_PER_SECOND_IN) : 0;
    const textTokens = 900 + Math.round(system.length / 4);
    const usageMetadata = { promptTokenCount: textTokens + audioTokens, candidatesTokenCount: 220, totalTokenCount: textTokens + audioTokens + 220,
      promptTokensDetails: [{ modality: 'TEXT', tokenCount: textTokens }, ...(audioTokens ? [{ modality: 'AUDIO', tokenCount: audioTokens }] : [])] };
    record.usage = usageMetadata;
    return send(req, res, 200, { candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }], usageMetadata, modelVersion: record.model });
  }

  async function voice(req, res, body, record, streamed) {
    const text = body.contents?.[0]?.parts?.map((p) => p.text).join('') || '';
    record.text = text;
    record.voiceName = body.generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName || null;
    if (state.fault === 'voice-gone') return error(req, res, 404, 'NOT_FOUND', `models/${record.model} is not found for API version v1beta, or is not supported for generateContent.`);
    if (state.fault === 'voice-fail') return error(req, res, 500, 'INTERNAL', 'Internal error (mock voice).');
    if (state.fault === 'slow-voice' || state.voiceDelayMs) await new Promise((resolve) => setTimeout(resolve, state.voiceDelayMs || 3000));
    // a short cut of a shipped clip, about 0.11 s a character, between 0.6 s and 2.4 s
    const seconds = Math.max(0.6, Math.min(2.4, [...text].length * 0.11));
    const clip = pcm[CLIPS[state.voiceN++ % CLIPS.length]];
    const bytes = clip.subarray(0, Math.min(clip.length, Math.round(seconds * 24000) * 2));
    const data = Buffer.from(bytes).toString('base64');
    const usageMetadata = { promptTokenCount: [...text].length, candidatesTokenCount: Math.round(seconds * core.AUDIO_TOKENS_PER_SECOND_OUT),
      candidatesTokensDetails: [{ modality: 'AUDIO', tokenCount: Math.round(seconds * core.AUDIO_TOKENS_PER_SECOND_OUT) }] };
    record.usage = usageMetadata;
    record.seconds = seconds;
    const reply = { candidates: [{ content: { role: 'model', parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data } }] }, finishReason: 'STOP' }], usageMetadata };
    if (!streamed) return send(req, res, 200, reply);
    res.writeHead(200, { 'content-type': 'text/event-stream', ...cors(req) });
    res.end(`data: ${JSON.stringify(reply)}\r\n\r\n`);
    return null;
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'OPTIONS') { res.writeHead(204, cors(req)); res.end(); return; }
    const match = /^\/v1beta\/models\/([^/:]+):(generateContent|streamGenerateContent)$/u.exec(url.pathname);
    if (req.method !== 'POST' || !match) { error(req, res, 404, 'NOT_FOUND', 'Not a mock route.'); return; }
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      let body = null;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* answered below */ }
      const record = {
        at: Date.now(), path: url.pathname, search: url.search, model: match[1], method: match[2], origin: req.headers.origin || null,
        hasKey: !!req.headers['x-goog-api-key'], keyHeader: req.headers['x-goog-api-key'] || null, cookie: req.headers.cookie || null,
        referer: req.headers.referer || null, kind: null, body,
      };
      state.requests.push(record);
      if (!body) { error(req, res, 400, 'INVALID_ARGUMENT', 'Body is not JSON.'); return; }
      const isVoice = Array.isArray(body.generationConfig?.responseModalities) && body.generationConfig.responseModalities.includes('AUDIO');
      record.kind = isVoice ? 'voice' : 'brain';
      if (isVoice) void voice(req, res, body, record, match[2] === 'streamGenerateContent');
      else if (state.brainDelayMs) setTimeout(() => brain(req, res, body, record), state.brainDelayMs);
      else brain(req, res, body, record);
    });
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    endpoint: `${origin}/v1beta`,
    state,
    get requests() { return state.requests; },
    set(options = {}) {
      Object.assign(state, options);
      if (options.fault === 'english-once') state.englishLeft = 1;
      if (options.fault !== 'timeout') { for (const res of state.hung.splice(0)) { try { res.destroy(); } catch { /* gone */ } } }
    },
    reset() {
      state.requests.length = 0;
      for (const res of state.hung.splice(0)) { try { res.destroy(); } catch { /* gone */ } }
      Object.assign(state, { clip: '003', fault: null, sayit: 'match', voiceDelayMs: 0, brainDelayMs: 0, englishLeft: 0, voiceN: 0 });
    },
    close: () => new Promise((resolve) => {
      for (const res of state.hung.splice(0)) { try { res.destroy(); } catch { /* gone */ } }
      server.closeAllConnections?.();
      server.close(() => resolve());
    }),
  };
}

export const MOCK_LINES = Object.freeze({ OPENINGS, TURNS, BRIDGE, BRIDGE_KANA, SAYIT_REPLY });

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--port');
  const mock = await startMockPartner({ port: at > 0 ? Number(process.argv[at + 1]) : 8787 });
  console.log(JSON.stringify({ status: 'ready', endpoint: mock.endpoint, note: 'test only: canned turns, Kore clips as reply audio, no key, no spend' }));
}
