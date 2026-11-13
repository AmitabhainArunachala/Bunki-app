/**
 * One vocabulary for the voice (speech lane, 2026-11-13): Bunki says the true cause of a silence in the same words as
 * Nihongo Study. modules/voice-lines.mjs is the one place that holds the lines; these cases hold it to the lead's
 * ruling, string for string, and hold the app to it: the codes and the server's answers reach their true cause, the
 * ear's label names it as its line does, and no other source file keeps a voice line of its own.
 */
/* global Response, setTimeout, URL */
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import * as ear from '../prototypes/corridor/modules/ear.mjs';
import {
  VoiceError,
  createMemoryTokenStore,
  createVoiceClient,
} from '../prototypes/corridor/modules/voice-client.mjs';
import * as lines from '../prototypes/corridor/modules/voice-lines.mjs';

const CORRIDOR = new URL('../prototypes/corridor/', import.meta.url);
const ja = (ja_) => ja_;
const en = (_ja, en_) => en_;

/** The ruling's table (VOICE-VOCABULARY-RULED.md, with its 16:32 amendments), typed out here on purpose. */
const RULED = {
  'not-paired': [
    'No voice yet. Pair this device in Settings.',
    '声はまだ使えません。設定でこの端末をペアリングしてください。',
    'not paired',
    '未ペアリング',
  ],
  'pair-again': [
    'The voice pairing has ended. Pair this device again in Settings.',
    'ペアリングが切れました。設定でもう一度ペアリングしてください。',
    'pair again',
    '再ペアリング',
  ],
  'no-connection': [
    'No connection. Check your network, then tap again.',
    '通信できません。ネットワークを確かめて、もう一度タップしてください。',
    'no connection',
    '通信なし',
  ],
  offline: [
    "Offline. This one isn't saved on this device yet.",
    'オフラインのため、まだ保存されていない音声は再生できません。',
    'offline',
    'オフライン',
  ],
  'too-slow': [
    'The voice took too long. Try again in a moment.',
    '音声の準備に時間がかかりすぎました。少し待って、もう一度お試しください。',
    'too slow',
    '時間切れ',
  ],
  busy: [
    'The voice is busy. Try again in a moment.',
    '音声サーバーが混み合っています。少し待って、もう一度お試しください。',
    'busy',
    '混雑中',
  ],
  'wait-a-minute': [
    'Too many new sentences in one minute. Wait a minute, then tap again.',
    '1分間に新しい文が多すぎます。1分ほど待って、もう一度タップしてください。',
    'wait a minute',
    '1分待ち',
  ],
  'day-limit': [
    "Today's voice limit is reached. It resets at 09:00.",
    '今日の音声の上限に達しました。09:00にリセットされます。',
    "today's limit",
    '今日の上限',
  ],
  limit: [
    'The voice limit is reached. Voices you have already heard here still play.',
    '音声の上限に達しました。この端末で一度聞いた音声は再生できます。',
    'limit reached',
    '上限到達',
  ],
  'could-not-play': [
    "This one couldn't play. Tap to try again.",
    '再生できませんでした。もう一度タップしてください。',
    'could not play',
    '再生エラー',
  ],
  'nothing-to-read': [
    "There's no Japanese here to read aloud.",
    'ここには読み上げる日本語がありません。',
    'nothing to read',
    '日本語なし',
  ],
  'several-readings': [
    'Not read aloud: this has more than one reading.',
    '読み方が一つに決まらないため、読み上げません。',
    null,
    null,
  ],
  update: [
    'Update the app to use the voice.',
    '声を使うには、アプリを更新してください。',
    'update needed',
    '要更新',
  ],
  'no-new-sentences': [
    "New sentences can't be read aloud right now.",
    'いまは新しい文を読み上げられません。',
    'no new sentences',
    '新規は停止中',
  ],
  failed: [
    "This couldn't be read aloud. Tap to try again.",
    '読み上げられませんでした。もう一度タップしてください。',
    'voice error',
    '音声エラー',
  ],
  'no-voice-here': [
    "The voice isn't available in this version of the app.",
    'このバージョンでは声を使えません。',
    null,
    null,
  ],
};
const WORDS = {
  listen: ['Listen', '聞く'],
  pause: ['Pause', '一時停止'],
  resume: ['Resume', '続きを聞く'],
  stop: ['Stop', '止める'],
  earOff: ['Ear: off', '耳：オフ'],
  earArmed: ['Ear: reads your next tap', '耳：次のタップを読み上げます'],
  earHeld: ['Ear: on', '耳：オン'],
  earSpeaking: ['Ear: speaking', '耳：読み上げ中'],
  speed: ['Reading speed', '読む速さ'],
  selection: ['Read the selected Japanese', '選んだ日本語を読む'],
  speakOnReveal: ['Say answers aloud when shown', '答えを表示したら読み上げる'],
};

describe('every cause, in both languages and both forms, exactly as ruled', () => {
  for (const [cause, [line, lineJa, short, shortJa]] of Object.entries(RULED)) {
    it(`${cause}: the line and the short form`, () => {
      const [gotJa, gotEn] = lines.voiceLineOf(cause, { time: '09:00' });
      expect(gotEn).toBe(line);
      expect(gotJa).toBe(lineJa);
      if (short !== null) expect(lines.voiceShortOf(cause)).toEqual([shortJa, short]);
      // a Bunki-only cause is never on the bar or the ear's label; were it shown there, C17's short form stands in
      else expect(lines.voiceShortOf(cause)).toEqual(['音声エラー', 'voice error']);
    });
  }
  it('the state words', () => {
    for (const [word, [english, japanese]] of Object.entries(WORDS))
      expect([...lines.VOICE_WORDS[word]]).toEqual([japanese, english]);
  });
  it('the ear: its five labels, the short form of the cause inside its no-voice label', () => {
    expect(lines.voiceEarLabel('off')).toEqual(['耳：オフ', 'Ear: off']);
    expect(lines.voiceEarLabel('armed')).toEqual([
      '耳：次のタップを読み上げます',
      'Ear: reads your next tap',
    ]);
    expect(lines.voiceEarLabel('held')).toEqual(['耳：オン', 'Ear: on']);
    expect(lines.voiceEarLabel('speaking')).toEqual(['耳：読み上げ中', 'Ear: speaking']);
    expect(lines.voiceEarLabel('novoice', 'authentication-required')).toEqual([
      '耳：声なし（再ペアリング）',
      'Ear: no voice (pair again)',
    ]);
    expect(lines.voiceEarLabel('novoice', 'ear-too-slow')).toEqual([
      '耳：声なし（時間切れ）',
      'Ear: no voice (too slow)',
    ]);
  });
  it('C8 without a time is its first sentence alone', () => {
    expect(lines.voiceLineOf('day-budget')).toEqual([
      '今日の音声の上限に達しました。',
      "Today's voice limit is reached.",
    ]);
  });
  it('a refusal a second tap cannot help is C17 without "Tap to try again"; any other C17 keeps it', () => {
    for (const code of [
      'speech-input-invalid',
      'speech-input-not-normal',
      'japanese-only',
      'profile-not-approved',
      'speech-input-too-large',
      'not-speakable',
    ])
      expect(lines.voiceLineOf(code)).toEqual([
        '読み上げられませんでした。',
        "This couldn't be read aloud.",
      ]);
    for (const code of ['server-failed', 'speak-failed', 'invalid-response', 'something-new', null])
      expect(lines.voiceLineOf(code)).toEqual([
        '読み上げられませんでした。もう一度タップしてください。',
        "This couldn't be read aloud. Tap to try again.",
      ]);
  });
  it('Settings keeps the dollar figure beside the two limit lines, when the server sent one', () => {
    expect(lines.voiceSettingsLine('day-budget', { time: '09:00', dayCapCents: 1000 })).toEqual([
      '今日の音声の上限に達しました。09:00にリセットされます。（1日10ドル）',
      "Today's voice limit is reached. It resets at 09:00. ($10 a day)",
    ]);
    expect(lines.voiceSettingsLine('budget-exhausted', { capCents: 10000 })).toEqual([
      '音声の上限に達しました。この端末で一度聞いた音声は再生できます。（合計100ドル）',
      'The voice limit is reached. Voices you have already heard here still play. ($100 in all)',
    ]);
    expect(lines.voiceSettingsLine('budget-exhausted', {})).toEqual(
      lines.voiceLineOf('budget-exhausted'),
    );
    expect(lines.voiceSettingsLine('not-in-release', { capCents: 10000 })).toEqual(
      lines.voiceLineOf('not-in-release'),
    );
  });
  it('rule 5: 接続 is in no line or word; ペアリング is the pairing, 通信 and ネットワーク the network', () => {
    const strings = [
      ...Object.values(lines.VOICE_CAUSES).flatMap((cause) => [cause.ja, ...(cause.short || [])]),
      ...Object.values(lines.VOICE_WORDS).flat(),
      ...lines.VOICE_EAR_HELP,
      ...lines.VOICE_SETTINGS.heading,
      ...lines.VOICE_SETTINGS.paired('1234'),
      ...lines.VOICE_SETTINGS.notKept,
      ...lines.VOICE_SETTINGS.lastTap(['通信なし', 'no connection'], '09:00'),
      ...lines.VOICE_SETTINGS.nothingYet,
      ...lines.VOICE_SETTINGS.lastSentence(lines.VOICE_SOURCES.server, '09:00'),
      ...Object.values(lines.VOICE_PAIRING)
        .filter((value) => Array.isArray(value))
        .flat(),
      ...Object.values(lines.VOICE_PAIRING.errors).flat(),
      ...Object.values(lines.VOICE_NOTES).flat(),
    ];
    expect(strings.length).toBeGreaterThan(70);
    expect(strings.filter((text) => text.includes('接続'))).toEqual([]);
    expect(strings.filter((text) => text.includes('ペアリング')).length).toBeGreaterThan(8);
  });
});

describe('the codes reach their true cause', () => {
  const CODES = {
    'not-paired': 'not-paired',
    'not-configured': 'not-paired',
    'authentication-required': 'pair-again',
    'network-failed': 'no-connection',
    offline: 'offline',
    'voice-timeout': 'too-slow',
    'ear-too-slow': 'too-slow',
    'voice-unavailable': 'busy',
    'request-rate-limit': 'wait-a-minute',
    'day-budget': 'day-limit',
    'budget-exhausted': 'limit',
    decode: 'could-not-play',
    'audio-error': 'could-not-play',
    'upgrade-required': 'update',
    'not-in-release': 'no-new-sentences',
    'nothing-to-say': 'nothing-to-read',
    'not-japanese': 'nothing-to-read',
    'several-readings': 'several-readings',
    'current-source-required': 'no-voice-here',
    'server-failed': 'failed',
    'speak-failed': 'failed',
    'invalid-response': 'failed',
    'japanese-only': 'failed',
  };
  it('each code names one cause; a timeout and a busy server are two', () => {
    for (const [code, cause] of Object.entries(CODES))
      expect([code, lines.voiceCauseOf(code)]).toEqual([code, cause]);
    expect(lines.voiceLineOf('voice-timeout')).not.toEqual(lines.voiceLineOf('voice-unavailable'));
  });

  /** One speak through the client against an answer of the server's (or a lost connection, or no answer in time). */
  const speakAgainst = async (answer, { late = false } = {}) => {
    const fetch = async (url, init) => {
      if (url.endsWith('/v1/pair/redeem-speak'))
        return new Response(
          JSON.stringify({
            // a made-up value of the token's shape, made here and now: no credential
            token: ['nsrs', 'prod', `test.${randomBytes(32).toString('hex')}`].join('_'),
            scope: {
              environment: 'prod',
              learner: 'test',
              installation: `bunki-${'b'.repeat(32)}`,
            },
          }),
          { status: 200 },
        );
      return answer(init);
    };
    // the client's deadline: for `late`, the speak request's runs out at once (the pairing's never does)
    let asked = 0;
    const after = (_ms, run) => {
      asked += 1;
      if (late && asked > 1) setTimeout(run, 0);
      return () => {};
    };
    const client = createVoiceClient({ fetch, store: createMemoryTokenStore(), after });
    // a code made here and now, for a stand-in that answers every pairing; the address is this machine's own
    const code = randomBytes(6).toString('hex').toUpperCase();
    const paired = await client.pair({ code, learner: 'test server: http://127.0.0.1:19609' });
    expect(paired.ok).toBe(true);
    try {
      await client.speak({ text: '今日は雨です。', voiceKey: 'word:雨' });
      return 'spoke';
    } catch (error) {
      expect(error).toBeInstanceOf(VoiceError);
      return error.code;
    }
  };
  const json = (status, body) => () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  const HTTP = [
    ['401', json(401, { error: 'authentication-required' }), 'pair-again'],
    ['402', json(402, { error: 'budget-exhausted' }), 'limit'],
    ['404 not taking new sentences', json(404, { error: 'not-in-release' }), 'no-new-sentences'],
    ['426 upgrade', json(426, { error: 'upgrade-required' }), 'update'],
    ['426 with no body', () => new Response('', { status: 426 }), 'update'],
    ['429 the minute', json(429, { error: 'request-rate-limit' }), 'wait-a-minute'],
    ['429 the day', json(429, { error: 'day-budget' }), 'day-limit'],
    ['503', json(503, { error: 'voice-unavailable' }), 'busy'],
    ['400 not Japanese', json(400, { error: 'japanese-only' }), 'failed'],
    ['500', json(500, { error: 'server-failed' }), 'failed'],
    [
      'bytes that are not audio',
      () => new Response('x', { status: 200, headers: { 'Content-Type': 'text/html' } }),
      'failed',
    ],
    [
      'a lost connection',
      () => {
        throw new TypeError('Failed to fetch');
      },
      'no-connection',
    ],
  ];
  for (const [name, answer, cause] of HTTP)
    it(`the server's answer: ${name}`, async () => {
      const code = await speakAgainst(answer);
      expect([name, lines.voiceCauseOf(code)]).toEqual([name, cause]);
    });
  it('no answer in time is "too slow", not "busy"', async () => {
    const held = (init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    const code = await speakAgainst(held, { late: true });
    expect(lines.voiceCauseOf(code)).toBe('too-slow');
  });
});

describe('the ear names the cause in its label as in its line', () => {
  const plain = { line: (reason) => en(...lines.voiceLineOf(reason, { time: '09:00' })) };
  it('a pairing the server ended (401) reads "pair again" on the label as on the line', () => {
    expect(ear.earLabel('novoice', 'authentication-required', en, plain)).toBe(
      'Ear: no voice (pair again)',
    );
    expect(ear.noVoiceLine('authentication-required', en, plain)).toBe(
      'The voice pairing has ended. Pair this device again in Settings.',
    );
    expect(ear.earLabel('novoice', 'authentication-required', ja, plain)).toBe(
      '耳：声なし（再ペアリング）',
    );
  });
  it('its own time limit is C5, in the line and in the label', () => {
    expect(ear.earLabel('novoice', ear.EAR_SLOW, en, plain)).toBe('Ear: no voice (too slow)');
    expect(ear.noVoiceLine(ear.EAR_SLOW, en, plain)).toBe(
      'The voice took too long. Try again in a moment.',
    );
  });
  it('its states in the ruled words', () => {
    expect(ear.earLabel('off', null, en, plain)).toBe('Ear: off');
    expect(ear.earLabel('armed', null, ja, plain)).toBe('耳：次のタップを読み上げます');
    expect(ear.earLabel('speaking', null, ja, plain)).toBe('耳：読み上げ中');
  });
});

/** The app's own sources: every file under prototypes/corridor but its tools, decks, data and vendored code. */
function appSources() {
  const out = [];
  const skip = new Set(['tools', 'decks', 'data', 'vendor', 'node_modules', 'design', 'guided']);
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (!skip.has(name)) walk(path);
      } else if (/\.(m?js|html)$/u.test(name) && !/standalone/u.test(name)) out.push(path);
    }
  };
  walk(new URL('.', CORRIDOR).pathname);
  return out;
}
/** Lines the inventory found in Bunki before the ruling (VOICE-LINES-INVENTORY.md, sections 1 and 2): none may stand. */
const OLD = [
  'No voice here. Pair the voice server in Settings, Writing and voice.',
  '声を出せません。設定の「筆と声」で音声サーバーとつなぐ。',
  'No voice: the voice server ended this pairing. Pair again in Settings, Writing and voice.',
  '声を出せません。音声サーバーがこの接続を終了しました。設定の「筆と声」でもう一度つなぐ。',
  'No voice: the voice server is out of reach. Check the connection, then tap again.',
  '声を出せません。音声サーバーに届きません。接続を確かめて、もう一度。',
  'No voice: the voice server is busy. Tap to try again.',
  '声を出せません。音声サーバーが混んでいます。もう一度。',
  'No voice: too many new sentences in one minute. Wait about a minute, then tap again.',
  '声を出せません。1分あたりの新しい文が多すぎました。1分ほど待って、もう一度。',
  'No voice: the voice server is not taking new sentences right now.',
  '声を出せません。音声サーバーはいま新しい文を受け付けていません。',
  'Nothing here can be read aloud.',
  'ここには読み上げられる日本語がありません。',
  'Could not play. Tap to try again.',
  '再生できませんでした。もう一度。',
  'No voice: the voice server could not say this. Tap to try again.',
  '声を出せません。音声サーバーがこの文を読めませんでした。もう一度。',
  'No voice: today’s voice limit is used.',
  '今日の音声の上限を使いました',
  'the voice budget’s total is used',
  '音声の予算の合計を使い切りました',
  'pair in Settings to hear this',
  '設定でつなぐと聞けます',
  '設定でもう一度つなぐ',
  'voice server not taking sentences',
  'サーバー停止中',
  'too many requests, wait a minute',
  '混雑、1分待つ',
  'voice server busy',
  'サーバー混雑',
  'voice server error',
  'サーバーエラー',
  '再接続が必要',
  'No voice yet: not paired',
  '声はまだつないでいません',
  'No voice: pair again in Settings',
  '声の接続が切れました',
  'No voice: no connection',
  '声が届きません。接続がありません',
  'today’s budget is used up',
  '今日の声の予算を使い切りました',
  'the voice budget is used up',
  '声の予算を使い切りました',
  'No voice: the voice took too long',
  '声が届くまでに時間がかかりすぎました',
  'the voice server is not answering',
  'サーバーが答えない',
  'No voice right now',
  'いま声を出せません',
  'ear: no voice',
  'ear: armed for the next tap',
  '耳：次のタップを読む',
  '耳：読んでいます',
  'Not paired. Nothing is spoken until you pair',
  '未接続。つなぐまで声は出ません',
  'The voice server ended this pairing. Pair Bunki again with a new code.',
  '音声サーバーがこの接続を終了しました。新しいコードでもう一度つないでください。',
  'Paired with the voice server',
  '音声サーバーに接続済み',
  'Current audio source required',
  '現在の音源が必要です',
  'Audio unavailable: no single reading for this answer',
  '読みを一つに決められないため、読み上げません',
  'No voice for this line',
  '声を出せませんでした',
  'Speak the answer and its sentence',
  'Speak this word',
  'Listen to the word and its sentence',
  'Listen to the word',
  "'Hear it'",
  'Playback failed · try again',
  'This device could not play the recording. You can try again.',
  'この端末で音声を再生できなかった。もう一度試せる。',
  'No recording for this excerpt',
  'Answer updated · tap audio to play',
  '答えが更新されました · 音で再生',
  'say a card’s answer and an opened word once',
  'カードの答えと開いた語を一度、自動で読む',
  '接続できませんでした。もう一度。',
  '接続コード（12文字）',
  'この端末の接続を消す',
  'このコードの端末はすでに接続済みです',
  'いま音声サーバーはつなげません',
  '音声サーバーに届きませんでした。接続を確かめてください。',
  '音声サーバーの返事が遅すぎました。もう一度。',
];

describe('one place: no other source file holds a voice line', () => {
  const module = new URL('modules/voice-lines.mjs', CORRIDOR).pathname;
  const sources = appSources().map((path) => [path, readFileSync(path, 'utf8')]);
  it('reads the app’s sources', () => {
    expect(sources.length).toBeGreaterThan(40);
    expect(sources.some(([path]) => path === module)).toBe(true);
  });
  it('no ruled line stands anywhere but the module', () => {
    const ruled = Object.values(RULED).flatMap(([line, lineJa]) => [
      line.replace(' It resets at 09:00.', ''),
      lineJa.replace('09:00にリセットされます。', ''),
    ]);
    const found = [];
    for (const [path, text] of sources)
      if (path !== module)
        for (const line of ruled) if (text.includes(line)) found.push(`${path}: ${line}`);
    expect(found).toEqual([]);
  });
  it('none of the old lines the inventory lists stands anywhere', () => {
    const found = [];
    for (const [path, text] of sources)
      for (const line of OLD) if (text.includes(line)) found.push(`${path}: ${line}`);
    expect(found).toEqual([]);
  });
  it('the voice files name the pairing ペアリング and the network 通信 or ネットワーク, never 接続', () => {
    for (const name of [
      'modules/voice-layer.mjs',
      'modules/ear.mjs',
      'modules/voice-lines.mjs',
      'modules/learner.mjs',
      'speak.js',
    ]) {
      const text = readFileSync(new URL(name, CORRIDOR), 'utf8');
      const strings = [...text.matchAll(/(['`])((?:\\.|(?!\1).)*)\1/gu)].map((match) => match[2]);
      expect([name, strings.filter((value) => value.includes('接続'))]).toEqual([name, []]);
    }
  });
});
