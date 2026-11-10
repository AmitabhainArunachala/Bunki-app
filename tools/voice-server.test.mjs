/**
 * Bunki's voice: one seam with the voice server in front of the device voice (John, 2026-11-10 21:07:
 * "complete all surfaces from articles to cards to grammar points to words, end to end").
 *
 * The law these tests hold:
 *  - source order per sentence: an approved recorded clip, then the voice server, then the device voice;
 *  - the device voice speaks only as that fallback (unpaired, offline, out of budget, server refusing);
 *    the unbound legacy call still utters nothing;
 *  - the request the browser sends is the one the speech team's contract v1 describes, built with their own
 *    modules, which are carried here unchanged from their commit;
 *  - every error code of the contract has one behaviour, and a 401 drops the token;
 *  - one sound at a time.
 *
 * No test calls the real server or makes a sound: the server is tools/fake-voice-server.mjs on a loopback port.
 */
/* global AbortController, fetch, setTimeout */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDeviceVoice, REASONS } from '../prototypes/corridor/device-voice.mjs';
import { createSpeechInput } from '../prototypes/corridor/modules/nihongo-speech/audio/speech-input.mjs';
import { SPEAK_PROFILE } from '../prototypes/corridor/modules/nihongo-speech/audio/speak-keys.mjs';
import {
  VoiceError,
  createMemoryTokenStore,
  createVoiceClient,
  parsePairing,
  isVoiceServer,
} from '../prototypes/corridor/modules/voice-client.mjs';
import { japaneseSentences } from '../prototypes/corridor/modules/voice-layer.mjs';
import { createVoiceSeam, voiceKeyOf } from '../prototypes/corridor/modules/voice-seam.mjs';
import { startFakeVoiceServer } from '../prototypes/corridor/tools/fake-voice-server.mjs';

const CORRIDOR = resolve(dirname(fileURLToPath(import.meta.url)), '../prototypes/corridor');
const PAGE = 'http://127.0.0.1:18841';
const TOKEN = /^nsrs_prod_[A-Za-z0-9_-]{4,512}\.[a-f0-9]{64}$/;

/** fetch as a page at PAGE would send it: the Origin header a browser adds by itself */
const pageFetch = (input, init = {}) =>
  fetch(input, { ...init, headers: { ...(init.headers || {}), Origin: PAGE } });

describe('the speech modules are the speech team’s own, unchanged', () => {
  const source = JSON.parse(
    readFileSync(resolve(CORRIDOR, 'modules/nihongo-speech/SOURCE.json'), 'utf8'),
  );
  it('names the contract’s commit', () => {
    expect(source.repository).toBe('nihongo-srs');
    expect(source.commit).toBe('b77078781aeb307e8ac3a33786c4ac2756536b03');
    expect(source.files.map((file) => file.path).sort()).toEqual([
      'audio/speak-keys.mjs',
      'audio/speech-highlight.mjs',
      'audio/speech-input.mjs',
      'audio/speech-player.mjs',
      'audio/speech-queue.mjs',
      'audio/speech-text.mjs',
      'schema/event.mjs',
    ]);
  });
  it.each(source.files.map((file) => [file.path, file.sha256]))(
    '%s still has its recorded bytes',
    (path, sha) => {
      const bytes = readFileSync(resolve(CORRIDOR, 'modules/nihongo-speech', path));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha);
    },
  );
});

describe('the device voice is a fallback, never a first voice', () => {
  const env = (
    voices = [{ lang: 'ja-JP', localService: true, name: 'fixture', voiceURI: 'fixture' }],
  ) => {
    const spoken = [];
    let cancels = 0;
    return {
      spoken,
      cancels: () => cancels,
      speechSynthesis: {
        getVoices: () => voices,
        speak: (u) => spoken.push(u),
        cancel: () => {
          cancels += 1;
        },
      },
      SpeechSynthesisUtterance: class {
        constructor(text) {
          this.text = text;
        }
      },
    };
  };
  it('the unbound legacy call still utters nothing', () => {
    const e = env(),
      voice = createDeviceVoice(e);
    for (const text of ['日本語。', 'English only', '']) {
      const answer = voice.speak(text);
      expect(answer).toMatchObject({ spoken: false, source: 'none', reason: REASONS.DISABLED });
    }
    expect(e.spoken).toHaveLength(0);
  });
  it('the fallback speaks Japanese in a local Japanese voice at the asked speed', () => {
    const e = env(),
      voice = createDeviceVoice(e);
    const ended = [];
    const answer = voice.fallback('雨の日は本を読む。', {
      rate: 1.25,
      onEnd: () => ended.push('end'),
    });
    expect(answer).toMatchObject({ spoken: true, source: 'device' });
    expect(e.spoken).toHaveLength(1);
    expect(e.spoken[0]).toMatchObject({ text: '雨の日は本を読む。', lang: 'ja-JP', rate: 1.25 });
    expect(e.spoken[0].voice.localService).toBe(true);
    e.spoken[0].onend();
    expect(ended).toEqual(['end']);
  });
  it('the fallback refuses text that is not Japanese, and a device with no local Japanese voice', () => {
    const e = env(),
      voice = createDeviceVoice(e);
    expect(voice.fallback('English only')).toMatchObject({
      spoken: false,
      reason: REASONS.INVALID_TEXT,
    });
    expect(e.spoken).toHaveLength(0);
    const remote = env([{ lang: 'ja-JP', localService: false, name: 'network voice' }]);
    expect(createDeviceVoice(remote).fallback('日本語。')).toMatchObject({
      spoken: false,
      reason: REASONS.NO_JA_VOICE,
    });
    expect(remote.spoken).toHaveLength(0);
  });
  it('a cancel tells the fallback’s caller it was stopped, once', () => {
    const e = env(),
      voice = createDeviceVoice(e);
    const stops = [];
    voice.fallback('日本語。', {
      onStop: () => stops.push('stop'),
      onEnd: () => stops.push('end'),
    });
    voice.cancel();
    voice.cancel();
    expect(stops).toEqual(['stop']);
    expect(e.cancels()).toBeGreaterThan(0);
  });
});

describe('the voice server address', () => {
  it('is nowhere in the code this public repository ships', () => {
    for (const path of ['voice-client.mjs', 'voice-seam.mjs', 'voice-layer.mjs']) {
      const text = readFileSync(resolve(CORRIDOR, 'modules', path), 'utf8');
      expect(text.match(/https?:\/\/[a-z0-9.-]+\.workers\.dev/gi) || []).toEqual([]);
    }
  });
  it('is a Worker’s own https origin, or a stand-in on this machine', () => {
    for (const good of [
      'https://nihongo-srs.example.workers.dev',
      'https://a.workers.dev',
      'http://127.0.0.1:19472',
      'http://localhost:9',
    ])
      expect(isVoiceServer(good)).toBe(true);
    for (const bad of [
      'https://evil.example',
      'https://workers.dev',
      'https://x.workers.dev.evil.example',
      'http://x.workers.dev',
      'https://x.workers.dev/path',
      'https://user@x.workers.dev',
      'https://x.workers.dev:8443',
      'http://127.0.0.1.evil.example',
      'http://127.0.0.1:1/path',
      'http://127.0.0.1',
      'javascript:alert(1)',
      7,
      null,
    ])
      expect(isVoiceServer(bad)).toBe(false);
  });
});

describe('pairing input', () => {
  it('takes the code as typed and the learner id, or one pasted line', () => {
    expect(parsePairing({ code: ' ab12 cd34-ef56 ', learner: ' john.learner ' })).toEqual({
      code: 'AB12CD34EF56',
      learner: 'john.learner',
    });
    expect(parsePairing({ code: '', learner: 'john.learner AB12CD34EF56' })).toEqual({
      code: 'AB12CD34EF56',
      learner: 'john.learner',
    });
  });
  it('takes the server’s address from the pasted line, and refuses a line that names any other kind of host', () => {
    const line = (server) =>
      `Bunki voice code: AB12CD34EF56 (10 minutes) · learner: John.Learner-1 · server: ${server}`;
    expect(
      parsePairing({ code: '', learner: line('https://nihongo-srs.example.workers.dev') }),
    ).toEqual({
      code: 'AB12CD34EF56',
      learner: 'John.Learner-1',
      server: 'https://nihongo-srs.example.workers.dev',
    });
    expect(
      parsePairing({ code: '', learner: line('https://nihongo-srs.example.workers.dev/') }).server,
    ).toBe('https://nihongo-srs.example.workers.dev');
    expect(
      parsePairing({ code: 'ab12cd34ef56', learner: 'john server: http://127.0.0.1:19472' }),
    ).toEqual({ code: 'AB12CD34EF56', learner: 'john', server: 'http://127.0.0.1:19472' });
    for (const bad of ['https://evil.example', 'http://x.workers.dev', 'https://x.workers.dev/v1'])
      expect(parsePairing({ code: '', learner: line(bad) })).toEqual({ error: 'invalid-pairing' });
  });
  it('takes the release seat’s exact line shape: a learner id that itself holds 32 hex characters is not the code', () => {
    // the shape release confirmed at 22:25 (" · " separators, no trailing space), with stand-ins for the three values
    const line =
      'Bunki voice code: 0123456789AB (10 minutes) · learner: local-0123456789abcdef0123456789abcdef · server: https://nihongo-srs.example-account.workers.dev';
    const expected = {
      code: '0123456789AB',
      learner: 'local-0123456789abcdef0123456789abcdef',
      server: 'https://nihongo-srs.example-account.workers.dev',
    };
    expect(parsePairing({ code: '', learner: line })).toEqual(expected);
    expect(parsePairing({ code: line, learner: '' })).toEqual(expected);
    expect(parsePairing({ code: '', learner: `  ${line}  \n` })).toEqual(expected);
  });
  it('takes the line the speech team’s pairing command prints, pasted into either box', () => {
    const printed = 'Bunki voice code: AB12CD34EF56 (10 minutes) · learner: John.Learner-1';
    expect(parsePairing({ code: '', learner: printed })).toEqual({
      code: 'AB12CD34EF56',
      learner: 'John.Learner-1',
    });
    expect(parsePairing({ code: printed, learner: '' })).toEqual({
      code: 'AB12CD34EF56',
      learner: 'John.Learner-1',
    });
    expect(
      parsePairing({ code: '', learner: 'Bunki voice code: (10 minutes) · learner: john' }),
    ).toEqual({ error: 'invalid-pairing' });
  });
  it.each([
    [{ code: 'AB12CD34EF5', learner: 'john' }],
    [{ code: 'AB12CD34EF5G', learner: 'john' }],
    [{ code: 'AB12CD34EF56', learner: '' }],
    [{ code: 'AB12CD34EF56', learner: 'nsrs_prod_x' }],
    [{ code: 'AB12CD34EF56', learner: 'two words' }],
    [{}],
  ])('refuses %j before any request', (input) => {
    expect(parsePairing(input)).toEqual({ error: 'invalid-pairing' });
  });
});

describe('the client speaks the contract', () => {
  let fake;
  // every pairing here carries the stand-in's address, as the real pairing line carries the Worker's
  const client = (store = createMemoryTokenStore()) => {
    const c = createVoiceClient({ fetch: pageFetch, store });
    const pair = c.pair.bind(c);
    c.pair = (input) => pair({ ...input, learner: `${input.learner} server: ${fake.origin}` });
    return c;
  };
  const paired = async (store = createMemoryTokenStore()) => {
    const c = client(store);
    const answer = await c.pair({
      code: fake.issue({ learner: 'test-learner' }),
      learner: 'test-learner',
    });
    expect(answer.ok).toBe(true);
    return c;
  };
  beforeAll(async () => {
    fake = await startFakeVoiceServer({ origins: [PAGE] });
  });
  afterAll(async () => {
    await fake.close();
  });

  it('asks nothing of the server while unpaired', async () => {
    const before = fake.log.length;
    const c = client();
    await c.ready();
    expect(c.paired()).toBe(false);
    await expect(
      c.speak({ text: '雨の日は本を読む。', voiceKey: 'article:a1' }),
    ).rejects.toMatchObject({ code: 'not-paired' });
    await expect(c.budget()).rejects.toMatchObject({ code: 'not-paired' });
    expect(fake.log.length).toBe(before);
  });
  it('a malformed code never leaves the page', async () => {
    const before = fake.log.length;
    expect(await client().pair({ code: 'nope', learner: 'test-learner' })).toEqual({
      ok: false,
      code: 'invalid-pairing',
    });
    expect(fake.log.length).toBe(before);
  });
  it('pairs once: the exact body, no bearer, and the token kept only in the store', async () => {
    const store = createMemoryTokenStore();
    const c = client(store);
    const code = fake.issue({ learner: 'test-learner' });
    const answer = await c.pair({ code: code.toLowerCase(), learner: 'test-learner' });
    const row = fake.log.at(-1);
    expect(row).toMatchObject({
      method: 'POST',
      path: '/v1/pair/redeem-speak',
      status: 200,
      origin: PAGE,
      sentAuthorization: false,
    });
    expect(row.bodyKeys).toEqual(['code', 'environment', 'learner']);
    expect(answer).toEqual({ ok: true, installation: row.installation });
    expect(answer.installation).toMatch(/^bunki-[a-f0-9]{32}$/);
    expect(c.paired()).toBe(true);
    const kept = await store.read();
    expect(kept.server).toBe(fake.origin);
    expect(kept.token).toMatch(TOKEN);
    expect(kept.scope).toEqual({
      environment: 'prod',
      learner: 'test-learner',
      installation: row.installation,
    });
    // nothing the client hands out carries the token
    expect(JSON.stringify([answer, c.scope(), c])).not.toContain(kept.token);
    // a second client on the same store is paired without asking again
    const again = client(store);
    await again.ready();
    expect(again.paired()).toBe(true);
  });
  it.each([
    ['a wrong code', (f) => f.issue({ learner: 'someone-else' }), {}, 'authentication-required'],
    ['pairing switched off', (f) => f.issue(), { pairingOff: true }, 'pairing-unavailable'],
    ['too many tries', (f) => f.issue(), { pairLimited: true }, 'authentication-rate-limit'],
  ])('answers %s with its code', async (_name, issue, set, code) => {
    fake.set(set);
    try {
      expect(await client().pair({ code: issue(fake), learner: 'test-learner' })).toEqual({
        ok: false,
        code,
      });
    } finally {
      fake.set({ pairingOff: false, pairLimited: false });
    }
  });
  it('an install that is already paired answers installation-exists', async () => {
    const installation = `bunki-${'a'.repeat(32)}`;
    expect(
      (await client().pair({ code: fake.issue({ installation }), learner: 'test-learner' })).ok,
    ).toBe(true);
    expect(
      await client().pair({ code: fake.issue({ installation }), learner: 'test-learner' }),
    ).toEqual({ ok: false, code: 'installation-exists' });
  });
  it('a server that cannot be reached answers network-failed', async () => {
    const c = createVoiceClient({ fetch: pageFetch, store: createMemoryTokenStore() });
    expect(
      await c.pair({ code: 'AB12CD34EF56', learner: 'test-learner server: http://127.0.0.1:9' }),
    ).toEqual({ ok: false, code: 'network-failed' });
  });
  it('a device that was never given an address asks nobody: a code alone is not enough', async () => {
    const before = fake.log.length;
    const c = createVoiceClient({ fetch: pageFetch, store: createMemoryTokenStore() });
    await c.ready();
    expect(c.configured()).toBe(false);
    expect(await c.pair({ code: fake.issue(), learner: 'test-learner' })).toEqual({
      ok: false,
      code: 'server-missing',
    });
    expect(fake.log.length).toBe(before);
  });
  it('the address is kept on the device: pairing again needs only the learner id and a new code', async () => {
    const store = createMemoryTokenStore();
    const c = createVoiceClient({ fetch: pageFetch, store });
    const line = `Bunki voice code: ${fake.issue()} (10 minutes) · learner: test-learner · server: ${fake.origin}`;
    expect((await c.pair({ code: '', learner: line })).ok).toBe(true);
    await c.forget();
    expect(c.paired()).toBe(false);
    expect(c.configured()).toBe(true);
    const later = createVoiceClient({ fetch: pageFetch, store });
    await later.ready();
    expect(later.configured()).toBe(true);
    expect(later.paired()).toBe(false);
    expect((await later.pair({ code: fake.issue(), learner: 'test-learner' })).ok).toBe(true);
    expect(later.paired()).toBe(true);
  });

  it('speaks one sentence: the contract’s body, built by the speech team’s own function', async () => {
    const c = await paired();
    const text = '雨の日は本を読む。';
    const clip = await c.speak({ text, voiceKey: 'article:a1' });
    const row = fake.speaks().at(-1);
    expect(row).toMatchObject({
      status: 200,
      origin: PAGE,
      authorized: true,
      voiceKey: 'article:a1',
      text,
      inputKeyMatches: true,
    });
    expect(row.bodyKeys).toEqual([
      'format',
      'inputKey',
      'profile',
      'segments',
      'version',
      'voiceKey',
    ]);
    expect(clip.bytes).toBeInstanceOf(Uint8Array);
    expect(clip.bytes.length).toBeGreaterThan(44);
    expect(clip.contentType).toMatch(/^audio\//);
    expect(clip.voiceId).toBe(row.voice);
    // the same key as the speech team computes for the same text and profile
    const expected = createSpeechInput({
      segments: [{ language: 'ja', text, pronunciationDirectives: [] }],
      profile: SPEAK_PROFILE,
    });
    expect(clip.inputKey).toBe(expected.inputKey);
  });
  it('keeps one voice for one voice key', async () => {
    const c = await paired();
    const a = await c.speak({ text: '猫が窓の外を見ている。', voiceKey: 'article:a9' });
    const b = await c.speak({ text: '駅の前で友達を待った。', voiceKey: 'article:a9' });
    expect(a.voiceId).toBe(b.voiceId);
  });
  it.each([
    ['English', 'This is English only.', 'article:a1'],
    ['mostly Latin', 'JR東日本のSuica', 'article:a1'],
    ['a sentence over 400 code points', 'あ'.repeat(401), 'article:a1'],
    ['a voice key with a space', '日本語。', 'word:two words'],
    ['an unknown voice kind', '日本語。', 'grammar:x'],
  ])('refuses %s on the page, before any request', async (_name, text, voiceKey) => {
    const c = await paired();
    const before = fake.speaks().length;
    await expect(c.speak({ text, voiceKey })).rejects.toMatchObject({ code: 'not-speakable' });
    expect(fake.speaks().length).toBe(before);
  });
  it.each([
    [400, 'speech-input-invalid'],
    [400, 'japanese-only'],
    [400, 'profile-not-approved'],
    [402, 'budget-exhausted'],
    [404, 'not-in-release'],
    [413, 'speech-input-too-large'],
    [429, 'day-budget'],
    [429, 'request-rate-limit'],
    [500, 'server-failed'],
    [503, 'voice-unavailable'],
  ])('a %i %s is that code, and the token stays', async (status, error) => {
    const c = await paired();
    fake.failNext({ status, error });
    const failure = await c
      .speak({ text: '雨の日は本を読む。', voiceKey: 'article:a1' })
      .catch((e) => e);
    expect(failure).toBeInstanceOf(VoiceError);
    expect(failure).toMatchObject({ code: error, status });
    expect(c.paired()).toBe(true);
  });
  it('a 401 drops the token: pair again', async () => {
    const store = createMemoryTokenStore();
    const c = await paired(store);
    fake.revokeAll();
    await expect(
      c.speak({ text: '雨の日は本を読む。', voiceKey: 'article:a1' }),
    ).rejects.toMatchObject({ code: 'authentication-required', status: 401 });
    expect(c.paired()).toBe(false);
    expect(await store.read()).toMatchObject({ server: fake.origin, token: null, scope: null });
  });
  it('a stop aborts the request and is not an error code', async () => {
    const c = await paired();
    const controller = new AbortController();
    const pending = c.speak({
      text: '新しい靴を買いました。',
      voiceKey: 'article:a1',
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('reads the budget', async () => {
    const c = await paired();
    const budget = await c.budget();
    expect(Object.keys(budget).sort()).toEqual([
      'capCents',
      'remainingCents',
      'reservedCents',
      'spentCents',
    ]);
    expect(budget.capCents).toBe(2500);
  });
});

/* ------------------------------------------------------------------ the seam */
function rig({ paired = true, device = true, online = true } = {}) {
  const calls = {
    speak: [],
    played: [],
    deviceSaid: [],
    recorded: [],
    sleeps: [],
    quiet: 0,
    stops: 0,
    rates: [],
    status: [],
  };
  let clock = Date.parse('2026-11-10T12:00:00Z');
  const scripted = [];
  let isPaired = paired,
    held = null;
  const client = {
    configured: () => true,
    ready: async () => {},
    paired: () => isPaired,
    scope: () => (isPaired ? { installation: 'bunki-' + 'b'.repeat(32) } : null),
    async speak({ text, voiceKey }) {
      calls.speak.push({ text, voiceKey });
      const next = scripted.shift();
      if (next) {
        if (next.code === 'authentication-required') isPaired = false;
        throw new VoiceError(next.code, next.status);
      }
      return {
        bytes: new Uint8Array([1, 2, 3]),
        contentType: 'audio/wav',
        voiceId: 'v',
        inputKey: `${voiceKey}|${text}`,
      };
    },
    async budget() {
      return { capCents: 2500, spentCents: 10, reservedCents: 0, remainingCents: 2490 };
    },
  };
  const player = {
    play(clip, rate) {
      calls.played.push({ source: 'server', key: clip.inputKey, rate });
      return new Promise((done) => {
        held = done;
        if (!rigged.hold) done('ended');
      });
    },
    pause() {
      calls.pauses = (calls.pauses || 0) + 1;
    },
    resume() {
      calls.resumes = (calls.resumes || 0) + 1;
    },
    stop() {
      calls.stops += 1;
      held?.('stopped');
    },
    setRate(rate) {
      calls.rates.push(rate);
    },
  };
  const deviceVoice = {
    support: () =>
      device ? { ok: true, voice: { name: 'fixture' } } : { ok: false, reason: 'no-ja-voice' },
    fallback(text, { rate, onEnd, onStop } = {}) {
      if (!device) return { spoken: false, reason: 'no-ja-voice' };
      calls.deviceSaid.push({ text, rate });
      rigged.deviceHooks = { onEnd, onStop };
      if (!rigged.holdDevice) Promise.resolve().then(() => onEnd?.());
      return { spoken: true, source: 'device' };
    },
    cancel() {},
  };
  const rigged = {
    hold: false,
    calls,
    advance: (ms) => {
      clock += ms;
    },
    fail: (...answers) => scripted.push(...answers),
    release: (outcome = 'ended') => held?.(outcome),
    seam: createVoiceSeam({
      client,
      device: deviceVoice,
      player,
      recorded: (src, rate) => {
        calls.recorded.push({ src, rate });
        return rigged.holdRecorded
          ? new Promise((done) => (rigged.releaseRecorded = done))
          : Promise.resolve(true);
      },
      quiet: () => {
        calls.quiet += 1;
      },
      sleep: async (ms) => {
        calls.sleeps.push(ms);
      },
      now: () => clock,
      online: () => online,
      onStatus: (status) => calls.status.push(status),
    }),
  };
  return rigged;
}
/** Read to the end and say how it ended. */
const run = (seam, options) =>
  new Promise((done) => {
    const states = [];
    const session = seam.read({
      ...options,
      onState: (state, code) => {
        states.push(code ? `${state}:${code}` : state);
        if (['done', 'stopped', 'error'].includes(state)) done({ states, session });
      },
    });
  });
const S3 = [
  { text: '雨の日は本を読む。' },
  { text: '猫が窓の外を見ている。' },
  { text: '駅の前で友達を待った。' },
];

describe('the seam: recorded clip, then the server, then the device', () => {
  it('a recorded clip wins and the server is not asked for it', async () => {
    const r = rig();
    const { states } = await run(r.seam, {
      voiceKey: 'article:a1',
      sentences: [
        { text: S3[0].text, recorded: { src: 'audio/narration/sakura/x-000.m4a' } },
        S3[1],
      ],
    });
    expect(states.at(-1)).toBe('done');
    expect(r.calls.recorded).toEqual([{ src: 'audio/narration/sakura/x-000.m4a', rate: 1 }]);
    expect(r.calls.speak).toEqual([{ text: S3[1].text, voiceKey: 'article:a1' }]);
    expect(r.calls.deviceSaid).toHaveLength(0);
    expect(r.seam.status().last.source).toBe('server');
  });
  it('paired and online: every sentence comes from the server, in order, two fetched ahead', async () => {
    const r = rig();
    await run(r.seam, { voiceKey: 'article:a1', sentences: S3 });
    expect(r.calls.speak.map((c) => c.text)).toEqual(S3.map((s) => s.text));
    expect(r.calls.played.map((p) => p.source)).toEqual(['server', 'server', 'server']);
    expect(r.calls.deviceSaid).toHaveLength(0);
    expect(r.calls.sleeps.filter((ms) => ms === 260)).toHaveLength(2);
  });
  it('unpaired: the device voice, and the server is never asked', async () => {
    const r = rig({ paired: false });
    const { states } = await run(r.seam, { voiceKey: 'article:a1', sentences: S3 });
    expect(states.at(-1)).toBe('done');
    expect(r.calls.speak).toHaveLength(0);
    expect(r.calls.deviceSaid.map((d) => d.text)).toEqual(S3.map((s) => s.text));
    expect(r.seam.status()).toMatchObject({
      paired: false,
      last: { source: 'device', reason: 'not-paired' },
    });
  });
  it('offline: the device voice, and the server is never asked', async () => {
    const r = rig({ online: false });
    await run(r.seam, { voiceKey: 'article:a1', sentences: S3.slice(0, 1) });
    expect(r.calls.speak).toHaveLength(0);
    expect(r.seam.status().last).toMatchObject({ source: 'device', reason: 'offline' });
  });
  it('text the server would refuse as not Japanese goes to the device and never to the server', async () => {
    const r = rig();
    await run(r.seam, { voiceKey: 'word:Suica', sentences: [{ text: 'JR東日本のSuica' }] });
    expect(r.calls.speak).toHaveLength(0);
    expect(r.calls.deviceSaid).toHaveLength(1);
    expect(r.seam.status().last).toMatchObject({ source: 'device', reason: 'not-japanese' });
  });
  it('neither a server nor a device voice: the read ends with no-voice', async () => {
    const r = rig({ paired: false, device: false });
    const { states } = await run(r.seam, { voiceKey: 'article:a1', sentences: S3.slice(0, 1) });
    expect(states.at(-1)).toBe('error:no-voice');
  });
});

describe('the seam: one behaviour per error code', () => {
  it('503 voice-unavailable: once more after 2 s, then the device for that sentence only', async () => {
    const r = rig();
    r.fail({ code: 'voice-unavailable', status: 503 }, { code: 'voice-unavailable', status: 503 });
    await run(r.seam, { voiceKey: 'article:a1', sentences: S3.slice(0, 2), prefetch: 0 });
    expect(r.calls.sleeps).toContain(2000);
    expect(r.calls.speak.map((c) => c.text)).toEqual([S3[0].text, S3[0].text, S3[1].text]);
    expect(r.calls.deviceSaid.map((d) => d.text)).toEqual([S3[0].text]);
    expect(r.calls.played).toHaveLength(1);
  });
  it('503 then a good answer: the server’s clip plays', async () => {
    const r = rig();
    r.fail({ code: 'voice-unavailable', status: 503 });
    await run(r.seam, { voiceKey: 'article:a1', sentences: S3.slice(0, 1) });
    expect(r.calls.speak).toHaveLength(2);
    expect(r.calls.deviceSaid).toHaveLength(0);
    expect(r.calls.played).toHaveLength(1);
  });
  it('429 day-budget: the device until 00:00 UTC, then the server again', async () => {
    const r = rig();
    r.fail({ code: 'day-budget', status: 429 });
    await run(r.seam, { voiceKey: 'article:a1', sentences: S3, prefetch: 0 });
    expect(r.calls.speak).toHaveLength(1);
    expect(r.calls.deviceSaid).toHaveLength(3);
    expect(r.seam.status().blocked).toBe('day-budget');
    r.advance(11 * 3600 * 1000); // 23:00 UTC the same day
    await run(r.seam, { voiceKey: 'article:a2', sentences: S3.slice(0, 1) });
    expect(r.calls.speak).toHaveLength(1);
    r.advance(2 * 3600 * 1000); // past 00:00 UTC
    await run(r.seam, { voiceKey: 'article:a3', sentences: S3.slice(0, 1) });
    expect(r.calls.speak).toHaveLength(2);
    expect(r.seam.status().blocked).toBe(null);
  });
  it('429 request-rate-limit: no request for 60 s', async () => {
    const r = rig();
    r.fail({ code: 'request-rate-limit', status: 429 });
    await run(r.seam, { voiceKey: 'article:a1', sentences: S3.slice(0, 2), prefetch: 0 });
    expect(r.calls.speak).toHaveLength(1);
    expect(r.calls.deviceSaid).toHaveLength(2);
    r.advance(59_000);
    await run(r.seam, { voiceKey: 'article:a1', sentences: S3.slice(2) });
    expect(r.calls.speak).toHaveLength(1);
    r.advance(2_000);
    await run(r.seam, { voiceKey: 'article:a1', sentences: S3.slice(2) });
    expect(r.calls.speak).toHaveLength(2);
  });
  it.each([
    ['404 not-in-release', { code: 'not-in-release', status: 404 }, 'not-in-release'],
    ['402 budget-exhausted', { code: 'budget-exhausted', status: 402 }, 'budget-exhausted'],
  ])('%s: the device from then on', async (_name, failure, blocked) => {
    const r = rig();
    r.fail(failure);
    await run(r.seam, { voiceKey: 'article:a1', sentences: S3, prefetch: 0 });
    expect(r.calls.speak).toHaveLength(1);
    expect(r.calls.deviceSaid).toHaveLength(3);
    expect(r.seam.status().blocked).toBe(blocked);
    r.advance(48 * 3600 * 1000);
    await run(r.seam, { voiceKey: 'article:a1', sentences: S3.slice(0, 1) });
    expect(r.calls.speak).toHaveLength(1);
  });
  it('401: unpaired from then on, the device speaks, the status says pair again', async () => {
    const r = rig();
    r.fail({ code: 'authentication-required', status: 401 });
    await run(r.seam, { voiceKey: 'article:a1', sentences: S3, prefetch: 0 });
    expect(r.calls.speak).toHaveLength(1);
    expect(r.calls.deviceSaid).toHaveLength(3);
    expect(r.seam.status()).toMatchObject({ paired: false, pairAgain: true });
  });
  it.each([
    ['speech-input-invalid', 400],
    ['speech-input-not-normal', 400],
    ['japanese-only', 400],
    ['profile-not-approved', 400],
    ['server-failed', 500],
    ['network-failed', 0],
  ])(
    '%s: the device for that sentence, never asked twice, the next sentence asks again',
    async (code, status) => {
      const r = rig();
      r.fail({ code, status });
      await run(r.seam, { voiceKey: 'article:a1', sentences: S3.slice(0, 2), prefetch: 0 });
      expect(r.calls.speak.map((c) => c.text)).toEqual(
        code === 'network-failed' ? [S3[0].text] : [S3[0].text, S3[1].text],
      );
      expect(r.calls.deviceSaid[0].text).toBe(S3[0].text);
    },
  );
  it('413 speech-input-too-large: the sentence is split further and its parts are spoken in order', async () => {
    const r = rig();
    const long =
      'これは長い文で、' + 'とても'.repeat(20) + '長いので、' + 'さらに'.repeat(20) + '続きます。';
    r.fail({ code: 'speech-input-too-large', status: 413 });
    const { states } = await run(r.seam, { voiceKey: 'article:a1', sentences: [{ text: long }] });
    expect(states.at(-1)).toBe('done');
    const parts = r.calls.speak.slice(1).map((c) => c.text);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join('')).toBe(long);
    expect(r.calls.played).toHaveLength(parts.length);
    expect(r.calls.deviceSaid).toHaveLength(0);
  });
});

describe('the seam: one sound at a time, and the controls', () => {
  it('a new read stops the one before it and quiets the other lanes', async () => {
    const r = rig();
    r.hold = true;
    const first = [];
    const a = r.seam.read({ voiceKey: 'article:a1', sentences: S3, onState: (s) => first.push(s) });
    await new Promise((done) => setTimeout(done, 5));
    expect(a.state).toBe('playing');
    r.hold = false;
    const { states } = await run(r.seam, { voiceKey: 'word:猫', sentences: [{ text: 'ねこ' }] });
    expect(first.at(-1)).toBe('stopped');
    expect(states.at(-1)).toBe('done');
    expect(r.calls.quiet).toBeGreaterThanOrEqual(2);
    expect(r.seam.active()).toBe(null);
  });
  it('stop() ends the read and nothing plays after it', async () => {
    const r = rig();
    r.hold = true;
    const states = [];
    r.seam.read({ voiceKey: 'article:a1', sentences: S3, onState: (s) => states.push(s) });
    await new Promise((done) => setTimeout(done, 5));
    r.seam.stop();
    r.hold = false;
    await new Promise((done) => setTimeout(done, 5));
    expect(states.at(-1)).toBe('stopped');
    expect(r.calls.played).toHaveLength(1);
  });
  it('pause holds the sentence and resume carries on; a jump starts another sentence', async () => {
    const r = rig();
    r.hold = true;
    const seen = [];
    const session = r.seam.read({
      voiceKey: 'article:a1',
      sentences: S3,
      onSentence: (i) => seen.push(i),
    });
    await new Promise((done) => setTimeout(done, 5));
    session.pause();
    expect(session.state).toBe('paused');
    expect(r.calls.pauses).toBe(1);
    session.resume();
    expect(session.state).toBe('playing');
    expect(r.calls.resumes).toBe(1);
    session.jump(2);
    await new Promise((done) => setTimeout(done, 5));
    expect(session.index).toBe(2);
    expect(seen).toContain(2);
    session.stop();
  });
  it('the speeds are 0.75, 1 and 1.25 and reach the player', async () => {
    const r = rig();
    r.hold = true;
    const session = r.seam.read({ voiceKey: 'article:a1', sentences: S3, rate: 0.75 });
    await new Promise((done) => setTimeout(done, 5));
    expect(r.calls.played[0].rate).toBe(0.75);
    session.setRate(1.25);
    expect(r.calls.rates.at(-1)).toBe(1.25);
    expect(() => session.setRate(0.8)).toThrow();
    session.stop();
  });
  it('a device voice another lane silences ends the read, so it never stands playing with nothing to hear', async () => {
    const r = rig({ paired: false });
    r.holdDevice = true;
    const states = [];
    r.seam.read({ voiceKey: 'article:a1', sentences: S3, onState: (s) => states.push(s) });
    await new Promise((done) => setTimeout(done, 5));
    expect(states.at(-1)).toBe('playing');
    r.deviceHooks.onStop(); // what device-voice.mjs tells its caller when something else cancels the utterance
    await new Promise((done) => setTimeout(done, 5));
    expect(states.at(-1)).toBe('stopped');
    expect(r.calls.deviceSaid).toHaveLength(1);
    expect(r.seam.active()).toBe(null);
  });
  it('a recorded clip another lane stops ends the read; the seam’s own pause only holds it', async () => {
    const r = rig();
    r.holdRecorded = true;
    const states = [];
    const clip = { text: S3[0].text, recorded: { src: 'audio/narration/sakura/x-000.m4a' } };
    let stops = 0;
    const session = r.seam.read({
      voiceKey: 'article:a1',
      sentences: [clip, S3[1]],
      onState: (s) => states.push(s),
      stopRecorded: () => {
        stops += 1;
        r.releaseRecorded(null);
      },
    });
    await new Promise((done) => setTimeout(done, 5));
    session.pause(); // the seam stops the clip itself: the read is paused, not over
    await new Promise((done) => setTimeout(done, 5));
    expect(stops).toBe(1);
    expect(states.at(-1)).toBe('paused');
    session.resume(); // the sentence is said again from its start
    await new Promise((done) => setTimeout(done, 5));
    expect(r.calls.recorded).toHaveLength(2);
    expect(states.at(-1)).toBe('playing');
    r.releaseRecorded(null); // stopped from outside (the app's stopRecAudio)
    await new Promise((done) => setTimeout(done, 5));
    expect(states.at(-1)).toBe('stopped');
  });
  it('a sentence heard again is not asked of the server again', async () => {
    const r = rig();
    await run(r.seam, { voiceKey: 'word:猫', sentences: [{ text: 'ねこ' }] });
    await run(r.seam, { voiceKey: 'word:猫', sentences: [{ text: 'ねこ' }] });
    expect(r.calls.speak).toHaveLength(1);
    expect(r.calls.played).toHaveLength(2);
  });
});

describe('only the Japanese is read', () => {
  const texts = (text) => japaneseSentences(text).map((sentence) => sentence.text);
  it('Japanese text is read as it stands, sentence by sentence', () => {
    expect(texts('雨の日は本を読む。猫が窓の外を見ている。')).toEqual([
      '雨の日は本を読む。',
      '猫が窓の外を見ている。',
    ]);
    expect(texts('きかい')).toEqual(['きかい']);
  });
  it('from a tutor’s mixed reply only the Japanese is read; the English never reaches the server', () => {
    expect(
      texts(
        'Use it like this: 雨が降っているのに、出かけました。 The clause before のに is the surprise.',
      ),
    ).toEqual(['雨が降っているのに、出かけました。', 'のに']);
    expect(texts('Good session. 「機械」は「きかい」と読みます。 Review it tomorrow.')).toEqual([
      '「機械」は「きかい」と読みます。',
    ]);
  });
  it('English alone, a lone character and nothing at all give nothing to read', () => {
    expect(texts('Good session. Review it tomorrow.')).toEqual([]);
    expect(texts('The particle は marks the topic.')).toEqual([]);
    expect(texts('')).toEqual([]);
    expect(texts(null)).toEqual([]);
  });
});

describe('voice keys', () => {
  it('are a kind and an id the server accepts', () => {
    expect(voiceKeyOf('article', 'jawiki:5294446')).toBe('article:jawiki:5294446');
    expect(voiceKeyOf('word', '食べ る')).toBe('word:食べる');
    expect(voiceKeyOf('conv', 'mwanukq8-zv3k')).toBe('conv:mwanukq8-zv3k');
    expect([...voiceKeyOf('word', 'あ'.repeat(200)).slice('word:'.length)]).toHaveLength(120);
    expect(voiceKeyOf('word', '   ')).toBe('word:bunki');
    expect(voiceKeyOf('grammar', 'x')).toBe('word:x');
  });
});
