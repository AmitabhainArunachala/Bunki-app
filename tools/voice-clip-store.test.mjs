/**
 * Heard clips play offline (B3, speech lane, 2026-11-11). The owner chose "real voices or silence": offline he wants
 * the real voice for anything he has heard, and silence with one plain line otherwise.
 *
 * A clip never changes once the server has made it, so a kept copy is always the current clip: it plays without asking
 * the server, online or offline, and no freshness check exists. The device store (modules/voice-clip-store.mjs) stands
 * behind the seam's own key for a clip (the voice key and the text). These tests run it over its in-memory storage;
 * its IndexedDB storage is proved in a muted browser by the lane's proof.
 *
 * No test makes a sound or calls the real server: the server is tools/fake-voice-server.mjs on a loopback port.
 */
/* global fetch, setTimeout, TextEncoder */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';

import { describe, expect, it } from 'vitest';

import * as clipStore from '../prototypes/corridor/modules/voice-clip-store.mjs';
import {
  CLIP_CAP_BYTES,
  CLIP_DB,
  createClipStore,
  createMemoryClipStorage,
} from '../prototypes/corridor/modules/voice-clip-store.mjs';

const { CLIP_STORE_VERSION } = clipStore;
import {
  VoiceError,
  createMemoryTokenStore,
  createVoiceClient,
} from '../prototypes/corridor/modules/voice-client.mjs';
import * as layer from '../prototypes/corridor/modules/voice-layer.mjs';
import { createVoiceSeam } from '../prototypes/corridor/modules/voice-seam.mjs';
import { startFakeVoiceServer } from '../prototypes/corridor/tools/fake-voice-server.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = 'http://127.0.0.1:18841';
const S = { text: '猫が窓の外を見ている。' };
const T = { text: '駅の前で友達を待った。' };
/** What the stand-in client answers for one sentence: bytes that name the sentence, so a mix-up shows. */
const bytesOf = (voiceKey, text) => new TextEncoder().encode(`clip ${voiceKey}|${text}`);

/** One page of Bunki: a seam over a client and a player that make no sound, and a store over `storage` (the device). */
function page({
  storage = createMemoryClipStorage(),
  online = true,
  paired = true,
  fail = [],
  store = null,
  // plays the player cannot make, in order: each rejects with this error (a media error: speech-player.mjs's
  // Error('audio-error'), or WebKit's play() refusing a source it cannot load: NotSupportedError)
  unplayable = [],
} = {}) {
  const calls = { speak: [], played: [] };
  const client = {
    configured: () => true,
    ready: async () => {},
    paired: () => paired,
    scope: () => (paired ? { installation: `bunki-${'c'.repeat(32)}` } : null),
    async speak({ text, voiceKey }) {
      calls.speak.push({ text, voiceKey });
      const next = fail.shift();
      if (next) throw new VoiceError(next.code, next.status);
      return {
        bytes: bytesOf(voiceKey, text),
        contentType: 'audio/wav',
        voiceId: 'fake-voice-a',
        inputKey: `k:${text}`,
      };
    },
    async budget() {
      return { capCents: 2500, spentCents: 0, reservedCents: 0, remainingCents: 2500 };
    },
  };
  const left = [...unplayable];
  const player = {
    play(clip) {
      if (left.length) {
        calls.refused = (calls.refused || 0) + 1;
        return Promise.reject(left.shift());
      }
      calls.played.push({ bytes: [...clip.bytes], contentType: clip.contentType });
      return Promise.resolve('ended');
    },
    pause() {},
    resume() {},
    stop() {},
    setRate() {},
  };
  const kept = store || createClipStore({ storage });
  const net = { online };
  const seam = createVoiceSeam({
    client,
    player,
    store: kept,
    sleep: async () => {},
    online: () => net.online,
  });
  return { seam, calls, store: kept, storage, net };
}
/** Read to the end and say how it ended. */
const run = (seam, options) =>
  new Promise((done) => {
    const states = [];
    seam.read({
      ...options,
      onState: (state, code) => {
        states.push(code ? `${state}:${code}` : state);
        if (['done', 'stopped', 'error'].includes(state)) done(states);
      },
    });
  });
const settle = (store) => (typeof store.idle === 'function' ? store.idle() : Promise.resolve());

describe('B3: heard clips play offline', () => {
  it('(a) after one play, the same sentence after a reload and offline plays with zero requests', async () => {
    const storage = createMemoryClipStorage();
    const first = page({ storage });
    expect((await run(first.seam, { voiceKey: 'article:a1', sentences: [S] })).at(-1)).toBe('done');
    expect(first.calls.speak).toHaveLength(1);
    await settle(first.store);
    // a reload: a new page, a new seam and a new store over the same device storage; and no connection
    const second = page({ storage, online: false });
    const states = await run(second.seam, { voiceKey: 'article:a1', sentences: [S] });
    expect(states.at(-1)).toBe('done');
    expect(second.calls.speak).toHaveLength(0);
    expect(second.calls.played).toEqual([
      { bytes: [...bytesOf('article:a1', S.text)], contentType: 'audio/wav' },
    ]);
    // online too, a kept clip is played without asking the server: a clip never changes
    const third = page({ storage });
    expect((await run(third.seam, { voiceKey: 'article:a1', sentences: [S] })).at(-1)).toBe('done');
    expect(third.calls.speak).toHaveLength(0);
    expect(third.calls.played).toHaveLength(1);
  });

  const mediaError = () => new Error('audio-error');
  const unsupported = () =>
    Object.assign(new Error('The operation is not supported.'), { name: 'NotSupportedError' });
  for (const [label, refusal] of [
    ['a media error', mediaError],
    ['WebKit refusing its source (NotSupportedError)', unsupported],
  ]) {
    it(`(h) a kept clip that will not play (${label}): the read ends saying it could not play (not that the server refused), the clip leaves the page and the device, and the next tap asks again`, async () => {
      const storage = createMemoryClipStorage();
      const key = `article:a1|${S.text}`;
      const first = page({ storage });
      await run(first.seam, { voiceKey: 'article:a1', sentences: [S] });
      await settle(first.store);
      expect(first.store.has(key)).toBe(true);
      // a reload; the kept clip will not play
      const second = page({ storage, unplayable: [refusal()] });
      const states = await run(second.seam, { voiceKey: 'article:a1', sentences: [S] });
      expect(second.calls.refused).toBe(1);
      expect(second.calls.speak).toHaveLength(0);
      // the speech team's queue names every failed play 'decode' (speech-queue.mjs, unchanged): the layer's line for it
      // says the clip could not play (voice-layer.mjs silenceLine), not that the voice server could not say it
      expect(states.at(-1)).toBe('error:decode');
      expect(second.seam.status().silent).toMatchObject({ reason: 'decode' });
      await settle(second.store);
      expect(second.store.has(key)).toBe(false);
      expect(second.store.size()).toEqual({ clips: 0, bytes: 0 });
      expect(await storage.readIndex()).toEqual([]);
      expect(await storage.readBytes(key)).toBe(null);
      // the next tap asks the server again (the clip is not in this page's memory either), plays, and keeps the answer
      expect((await run(second.seam, { voiceKey: 'article:a1', sentences: [S] })).at(-1)).toBe(
        'done',
      );
      expect(second.calls.speak).toHaveLength(1);
      expect(second.calls.played).toHaveLength(1);
      await settle(second.store);
      expect(second.store.has(key)).toBe(true);
    });
  }

  it('(i) a play the browser does not allow (no tap yet: NotAllowedError) is not the clip’s fault: the clip stays kept', async () => {
    const storage = createMemoryClipStorage();
    const key = `article:a1|${S.text}`;
    const first = page({ storage });
    await run(first.seam, { voiceKey: 'article:a1', sentences: [S] });
    await settle(first.store);
    const notAllowed = Object.assign(new Error('play() needs a user gesture'), {
      name: 'NotAllowedError',
    });
    const second = page({ storage, unplayable: [notAllowed] });
    expect((await run(second.seam, { voiceKey: 'article:a1', sentences: [S] })).at(-1)).toBe(
      'error:decode',
    );
    await settle(second.store);
    expect(second.store.has(key)).toBe(true);
    expect((await run(second.seam, { voiceKey: 'article:a1', sentences: [S] })).at(-1)).toBe(
      'done',
    );
    expect(second.calls.speak).toHaveLength(0);
  });

  it('(b) an unheard sentence offline is silence with the reason: nothing played, nothing asked, the store asked first', async () => {
    const storage = createMemoryClipStorage();
    const first = page({ storage });
    await run(first.seam, { voiceKey: 'article:a1', sentences: [S] });
    await settle(first.store);
    const asked = [];
    const real = createClipStore({ storage });
    const store = {
      ...real,
      get: (key) => {
        asked.push(key);
        return real.get(key);
      },
    };
    const offline = page({ storage, online: false, store });
    const states = await run(offline.seam, { voiceKey: 'article:a1', sentences: [T] });
    expect(states.at(-1)).toBe('error:offline');
    expect(offline.calls.speak).toHaveLength(0);
    expect(offline.calls.played).toHaveLength(0);
    expect(asked).toEqual([`article:a1|${T.text}`]);
    expect(offline.seam.status().silent).toMatchObject({ reason: 'offline' });
  });

  it('(c) errors are never kept: a refusal, a failure or a clip that is not audio leaves nothing on the device', async () => {
    const answers = [
      [
        { code: 'voice-unavailable', status: 503 },
        { code: 'voice-unavailable', status: 503 },
      ],
      [{ code: 'server-failed', status: 500 }],
      [{ code: 'day-budget', status: 429 }],
      [{ code: 'request-rate-limit', status: 429 }],
      [{ code: 'budget-exhausted', status: 402 }],
      [{ code: 'not-in-release', status: 404 }],
      [{ code: 'authentication-required', status: 401 }],
      [{ code: 'network-failed', status: 0 }],
      [{ code: 'invalid-response', status: 200 }],
    ];
    for (const fail of answers) {
      const d = page({ fail: [...fail] });
      const states = await run(d.seam, { voiceKey: 'article:a1', sentences: [S] });
      expect(states.at(-1)).toBe(`error:${fail[0].code}`);
      await settle(d.store);
      expect(await d.storage.readIndex()).toEqual([]);
    }
    // and through the real client: the stand-in server refusing, then answering
    const fake = await startFakeVoiceServer({ origins: [PAGE] });
    try {
      const { seam, storage, store } = await pairedPage(fake);
      fake.failNext(
        { status: 503, error: 'voice-unavailable' },
        { status: 503, error: 'voice-unavailable' },
      );
      expect((await run(seam, { voiceKey: 'article:a1', sentences: [S] })).at(-1)).toBe(
        'error:voice-unavailable',
      );
      await settle(store);
      expect(await storage.readIndex()).toEqual([]);
      // only a successful audio answer is kept
      expect((await run(seam, { voiceKey: 'article:a1', sentences: [T] })).at(-1)).toBe('done');
      await settle(store);
      expect((await storage.readIndex()).map((row) => row.key)).toEqual([`article:a1|${T.text}`]);
      // and a refusal after it adds nothing
      fake.set({ daySpent: 300 });
      expect(
        (
          await run(seam, { voiceKey: 'article:a1', sentences: [{ text: '雨の日は本を読む。' }] })
        ).at(-1),
      ).toBe('error:day-budget');
      await settle(store);
      expect((await storage.readIndex()).map((row) => row.key)).toEqual([`article:a1|${T.text}`]);
    } finally {
      await fake.close();
    }
  });

  it('(d) past the cap the least recently played clip goes and the newest stays', async () => {
    expect(CLIP_CAP_BYTES).toBe(300 * 1024 * 1024);
    let clock = 1000;
    const storage = createMemoryClipStorage();
    const store = createClipStore({ storage, capBytes: 10, now: () => clock });
    const clip = (n) => ({
      bytes: new Uint8Array(4).fill(n),
      contentType: 'audio/wav',
      voiceId: 'v',
    });
    await store.put('word:一|いち', clip(1));
    clock += 10;
    await store.put('word:二|に', clip(2));
    clock += 10;
    // the first is played again: the second is now the one least recently played
    expect([...(await store.get('word:一|いち')).bytes]).toEqual([1, 1, 1, 1]);
    clock += 10;
    await store.put('word:三|さん', clip(3));
    await settle(store);
    const keys = (await storage.readIndex()).map((row) => row.key).sort();
    expect(keys).toEqual(['word:一|いち', 'word:三|さん']);
    expect(await store.get('word:二|に')).toBe(null);
    expect([...(await store.get('word:三|さん')).bytes]).toEqual([3, 3, 3, 3]);
    // a clip larger than the whole cap is not kept, and it pushes nothing out
    await store.put('word:大|だい', { bytes: new Uint8Array(11), contentType: 'audio/wav' });
    await settle(store);
    expect((await storage.readIndex()).map((row) => row.key).sort()).toEqual([
      'word:一|いち',
      'word:三|さん',
    ]);
  });

  it('(e) a store that throws, or does not answer within 1.5 s, does not break a play the server answers', async () => {
    const asked = { get: 0, put: 0 };
    const throwing = {
      get: async () => {
        asked.get += 1;
        throw new Error('broken store');
      },
      put: async () => {
        asked.put += 1;
        throw new Error('broken store');
      },
      has: () => {
        throw new Error('broken store');
      },
      touch: () => {
        throw new Error('broken store');
      },
    };
    const d = page({ store: throwing });
    expect((await run(d.seam, { voiceKey: 'article:a1', sentences: [S] })).at(-1)).toBe('done');
    expect(d.calls.speak).toHaveLength(1);
    expect(d.calls.played).toHaveLength(1);
    expect(asked).toEqual({ get: 1, put: 1 });
    // a read by itself that asks whether it can be voiced is not broken by it either
    expect(d.seam.cannot('article:a1', S.text)).toBe(null);
    // a storage that fails under the real store
    const failing = {
      readIndex: async () => {
        throw new Error('quota');
      },
      readBytes: async () => {
        throw new Error('quota');
      },
      write: async () => {
        throw new Error('quota');
      },
      touch: async () => {
        throw new Error('quota');
      },
      remove: async () => {
        throw new Error('quota');
      },
    };
    const f = page({ storage: failing });
    expect((await run(f.seam, { voiceKey: 'article:a1', sentences: [S] })).at(-1)).toBe('done');
    expect(f.calls.played).toHaveLength(1);
  });

  it('(6) a store that does not answer in time is switched off for the page after its first wait: no later sentence waits', async () => {
    let hung = 0,
      puts = 0;
    const hanging = {
      get: () => {
        hung += 1;
        return new Promise(() => {});
      },
      put: () => {
        puts += 1;
        return new Promise(() => {});
      },
      has: () => true,
    };
    const h = page({ store: hanging });
    // the first sentence waits once, up to 1.5 s, then the server is asked as now
    let started = Date.now();
    expect((await run(h.seam, { voiceKey: 'article:a1', sentences: [S] })).at(-1)).toBe('done');
    const first = Date.now() - started;
    expect(first).toBeGreaterThanOrEqual(1400);
    expect(first).toBeLessThan(4000);
    // every later sentence, in this read or the next, does not wait at all and the store is not asked again
    started = Date.now();
    expect(
      (
        await run(h.seam, {
          voiceKey: 'article:a1',
          sentences: [T, { text: '雨の日は本を読む。' }],
        })
      ).at(-1),
    ).toBe('done');
    expect(Date.now() - started).toBeLessThan(300);
    expect(hung).toBe(1);
    expect(puts).toBe(0);
    expect(h.calls.speak).toHaveLength(3);
    // and a store that is off is not counted as a voice for a read by itself
    h.net.online = false;
    expect(h.seam.cannot('article:a1', 'まだ聞いていない文です。')).toBe('offline');
  });

  it('(7) a write refused for lack of space evicts the least recently played until the clip fits, tries once more, then gives up', async () => {
    let clock = 1000;
    /** a device with room for `room` bytes: a write past it is refused as the browser refuses it */
    const tight = (room) => {
      const inner = createMemoryClipStorage();
      let used = 0,
        refused = 0;
      const sizes = new Map();
      return {
        refused: () => refused,
        storage: {
          ...inner,
          async write(row, data) {
            const before = sizes.get(row.key) || 0;
            if (used - before + data.length > room) {
              refused += 1;
              throw Object.assign(new Error('The quota has been exceeded.'), {
                name: 'QuotaExceededError',
              });
            }
            await inner.write(row, data);
            used += data.length - before;
            sizes.set(row.key, data.length);
          },
          async remove(keys) {
            await inner.remove(keys);
            for (const key of keys) {
              used -= sizes.get(key) || 0;
              sizes.delete(key);
            }
          },
        },
      };
    };
    const clip = (n, size = 4) => ({
      bytes: new Uint8Array(size).fill(n),
      contentType: 'audio/wav',
      voiceId: 'v',
    });
    const device = tight(10);
    const store = createClipStore({ storage: device.storage, now: () => clock });
    await store.put('k1', clip(1));
    clock += 10;
    await store.put('k2', clip(2));
    clock += 10;
    await store.get('k1'); // k1 played again: k2 is the least recently played
    clock += 10;
    expect(await store.put('k3', clip(3))).toBe(true);
    expect(device.refused()).toBe(1);
    expect((await device.storage.readIndex()).map((row) => row.key).sort()).toEqual(['k1', 'k3']);
    // a clip that cannot fit even after evicting: one more refusal, then it gives up, silently
    clock += 10;
    expect(await store.put('k4', clip(4, 11))).toBe(false);
    expect(device.refused()).toBe(3);
    // and speech is never delayed or broken by it
    const d = page({ store: createClipStore({ storage: tight(0).storage }) });
    expect((await run(d.seam, { voiceKey: 'article:a1', sentences: [S] })).at(-1)).toBe('done');
    expect(d.calls.played).toHaveLength(1);
  });

  it('(8) the store’s name carries a version, to change whenever the voice roster or the voice profile changes', () => {
    expect(Number.isSafeInteger(CLIP_STORE_VERSION) && CLIP_STORE_VERSION >= 1).toBe(true);
    expect(CLIP_DB).toBe(`bunki-voice-clips-v${CLIP_STORE_VERSION}`);
    const source = readFileSync(
      join(ROOT, 'prototypes/corridor/modules/voice-clip-store.mjs'),
      'utf8',
    );
    const at = source.indexOf('export const CLIP_STORE_VERSION');
    expect(at).toBeGreaterThan(0);
    expect(source.slice(Math.max(0, at - 600), at)).toMatch(/voice roster/u);
    expect(source.slice(Math.max(0, at - 600), at)).toMatch(/voice profile/u);
  });

  it('(8) only OLDER clip databases go when the store loads: a newer version, the pairing and the record stay', async () => {
    /** A browser's IndexedDB as far as the clean-up sees it: the databases it lists, and each delete it is asked for. */
    const browser = (names, outcome = {}) => {
      const asked = [];
      const indexedDB = {
        open() {
          const request = {};
          setTimeout(() => request.onerror?.(), 0);
          return request;
        },
        async databases() {
          return names.map((name) => ({ name, version: 1 }));
        },
        deleteDatabase(name) {
          asked.push(name);
          if (outcome[name] === 'throws') throw new Error('refused');
          const request = {};
          setTimeout(
            () =>
              (outcome[name] === 'error'
                ? request.onerror
                : outcome[name] === 'blocked'
                  ? request.onblocked
                  : request.onsuccess)?.(),
            0,
          );
          return request;
        },
      };
      return { asked, env: { indexedDB } };
    };
    const settle = () => new Promise((done) => setTimeout(done, 30));
    const planted = [
      'bunki-voice-clips',
      CLIP_DB,
      `bunki-voice-clips-v${CLIP_STORE_VERSION + 1}`,
      'bunki-voice',
      'bunki-voice-clips-proof',
      'bunki-personal-collections-v1',
    ];
    // a load of this build's store: only the unversioned name of the first builds goes
    const one = browser(planted);
    await createClipStore({ storage: clipStore.createIndexedDbClipStorage(one.env) }).ready();
    await settle();
    expect(one.asked).toEqual(['bunki-voice-clips']);
    // a store of a later version removes the lower ones and leaves a newer one (a rollback, or two builds on one origin)
    const later = browser([
      'bunki-voice-clips',
      'bunki-voice-clips-v1',
      'bunki-voice-clips-v2',
      'bunki-voice-clips-v3',
      'bunki-voice-clips-v4',
      'bunki-voice',
    ]);
    await clipStore
      .createIndexedDbClipStorage(later.env, { name: 'bunki-voice-clips-v3' })
      .dropOlder();
    expect(later.asked).toEqual([
      'bunki-voice-clips',
      'bunki-voice-clips-v1',
      'bunki-voice-clips-v2',
    ]);
    // a storage under any other name (the proof's own) removes nothing
    const other = browser(planted);
    await clipStore
      .createIndexedDbClipStorage(other.env, { name: 'bunki-voice-clips-proof' })
      .dropOlder();
    expect(other.asked).toEqual([]);
    // a delete that fails, is blocked or throws still lets the clean-up end, quietly
    for (const outcome of ['error', 'blocked', 'throws']) {
      const stuck = browser(['bunki-voice-clips', 'bunki-voice-clips-v0'], {
        'bunki-voice-clips': outcome,
      });
      await expect(
        clipStore.createIndexedDbClipStorage(stuck.env).dropOlder(),
      ).resolves.toBeUndefined();
      expect(stuck.asked).toEqual(['bunki-voice-clips', 'bunki-voice-clips-v0']);
    }
  });

  it('(f) the stored bytes equal the served bytes', async () => {
    const fake = await startFakeVoiceServer({ origins: [PAGE] });
    try {
      const { seam, storage, store, served } = await pairedPage(fake);
      expect((await run(seam, { voiceKey: 'article:a1', sentences: [S, T] })).at(-1)).toBe('done');
      await settle(store);
      expect(served).toHaveLength(2);
      const rows = await storage.readIndex();
      expect(rows.map((row) => row.key).sort()).toEqual(
        [`article:a1|${S.text}`, `article:a1|${T.text}`].sort(),
      );
      for (const { text, bytes, voice } of served) {
        const row = rows.find((r) => r.key === `article:a1|${text}`);
        expect(row).toMatchObject({ contentType: 'audio/wav', voice, size: bytes.length });
        expect(Number.isFinite(row.savedAt) && Number.isFinite(row.lastPlayedAt)).toBe(true);
        expect([...(await storage.readBytes(row.key))]).toEqual([...bytes]);
      }
    } finally {
      await fake.close();
    }
  });

  it('(g) a read by itself (the 声 switch) and a tap share the one kept clip, both ways', async () => {
    const request = layer.wordVoiceRequest;
    expect(typeof request).toBe('function');
    // a tap on 音 and the answer saying itself ask the seam the same thing for the same word
    const ask = request('きかい', '機械');
    expect(ask).toEqual({ text: 'きかい', voiceKey: 'word:機械' });
    // his tap, online: one request, and the clip is kept
    const storage = createMemoryClipStorage();
    const online = page({ storage });
    await run(online.seam, { voiceKey: ask.voiceKey, sentences: [{ text: ask.text }] });
    await settle(online.store);
    // after a reload, offline: a read by itself asks first whether it can be voiced; the kept clip says yes
    const offline = page({ storage, online: false });
    await offline.store.ready();
    expect(offline.seam.cannot(ask.voiceKey, ask.text)).toBe(null);
    expect(offline.seam.cannot(ask.voiceKey, 'ほかのことば')).toBe('offline');
    expect(offline.seam.cannot(ask.voiceKey)).toBe('offline');
    expect(
      (await run(offline.seam, { voiceKey: ask.voiceKey, sentences: [{ text: ask.text }] })).at(-1),
    ).toBe('done');
    expect(offline.calls.speak).toHaveLength(0);
    // the other way: the answer said by itself keeps the clip, and his tap offline plays it
    const other = request('ねこ', '猫');
    const storage2 = createMemoryClipStorage();
    const byItself = page({ storage: storage2 });
    expect(byItself.seam.cannot(other.voiceKey, other.text)).toBe(null);
    await run(byItself.seam, { voiceKey: other.voiceKey, sentences: [{ text: other.text }] });
    await settle(byItself.store);
    const tap = page({ storage: storage2, online: false });
    expect(
      (await run(tap.seam, { voiceKey: other.voiceKey, sentences: [{ text: other.text }] })).at(-1),
    ).toBe('done');
    expect(tap.calls.speak).toHaveLength(0);
    expect(tap.calls.played[0].bytes).toEqual([...bytesOf('word:猫', 'ねこ')]);
  });

  it('the store is not read by any export of the learner’s record: its database is named by its own module only', () => {
    // the name's stem, which every version of the name carries
    const stem = 'bunki-voice-clips';
    expect(CLIP_DB.startsWith(stem)).toBe(true);
    const named = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name.startsWith('.')) continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(m?js|ts)$/u.test(name) && readFileSync(path, 'utf8').includes(stem))
          named.push(path.slice(ROOT.length + 1));
      }
    };
    walk(join(ROOT, 'prototypes/corridor'));
    walk(join(ROOT, 'packages'));
    expect(named.filter((path) => !path.startsWith('prototypes/corridor/tools/'))).toEqual([
      'prototypes/corridor/modules/voice-clip-store.mjs',
    ]);
  });
});

/** A seam over the real client, paired with the stand-in server; `served` holds every audio answer as it was sent. */
async function pairedPage(fake) {
  const served = [];
  const fetchFn = async (input, init = {}) => {
    const response = await fetch(input, {
      ...init,
      headers: { ...(init.headers || {}), Origin: PAGE },
    });
    if (String(input).endsWith('/v1/audio/speak') && response.status === 200) {
      const body = JSON.parse(init.body);
      served.push({
        text: body.segments[0].text,
        bytes: new Uint8Array(await response.clone().arrayBuffer()),
        voice: response.headers.get('X-NSRS-Audio-Voice-Id'),
      });
    }
    return response;
  };
  const client = createVoiceClient({ fetch: fetchFn, store: createMemoryTokenStore() });
  const line = `Bunki voice code: ${fake.issue({ learner: 'test-learner' })} (10 minutes) · learner: test-learner · server: ${fake.origin}`;
  expect((await client.pair({ learner: line, code: '' })).ok).toBe(true);
  const storage = createMemoryClipStorage();
  const store = createClipStore({ storage });
  const player = {
    play: () => Promise.resolve('ended'),
    pause() {},
    resume() {},
    stop() {},
    setRate() {},
  };
  const seam = createVoiceSeam({
    client,
    player,
    store,
    sleep: (ms) => new Promise((done) => setTimeout(done, Math.min(ms, 5))),
    online: () => true,
  });
  return { seam, storage, store, served };
}

describe('the store behind the ear’s shared requests (the combine, 2026-11-12)', () => {
  /** A page whose server answers each request only when told to; the store over `storage` counts its writes. */
  function heldPage({ storage = createMemoryClipStorage(), online = true } = {}) {
    const asked = [];
    const played = [];
    const client = {
      configured: () => true,
      ready: async () => {},
      paired: () => true,
      scope: () => ({ installation: `bunki-${'c'.repeat(32)}` }),
      speak({ text, voiceKey, signal }) {
        return new Promise((resolve, reject) => {
          const row = { text, voiceKey, aborted: false };
          asked.push(row);
          row.answer = () =>
            resolve({
              bytes: bytesOf(voiceKey, text),
              contentType: 'audio/wav',
              voiceId: 'v',
              inputKey: `${voiceKey}|${text}`,
            });
          signal?.addEventListener('abort', () => {
            row.aborted = true;
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        });
      },
      async budget() {
        return { capCents: 2500, spentCents: 0, reservedCents: 0, remainingCents: 2500 };
      },
    };
    const player = {
      play: (clip) => (played.push(new TextDecoder().decode(clip.bytes)), Promise.resolve('ended')),
      pause() {},
      resume() {},
      stop() {},
      setRate() {},
    };
    const real = createClipStore({ storage });
    const puts = [];
    const store = { ...real, put: (key, clip) => (puts.push(key), real.put(key, clip)) };
    const seam = createVoiceSeam({
      client,
      player,
      store,
      sleep: async () => {},
      online: () => online,
    });
    return { seam, asked, played, puts, store, storage };
  }
  const tick = () => new Promise((done) => setTimeout(done, 10));

  it('a kept clip answers before any request is sent, online, even with a request for it able to travel', async () => {
    const storage = createMemoryClipStorage();
    const first = heldPage({ storage });
    const one = run(first.seam, { voiceKey: 'article:a1', sentences: [S], prefetch: 0 });
    await tick();
    first.asked[0].answer();
    expect((await one).at(-1)).toBe('done');
    await settle(first.store);
    const second = heldPage({ storage });
    const states = await run(second.seam, { voiceKey: 'article:a1', sentences: [S], prefetch: 0 });
    expect(states.at(-1)).toBe('done');
    expect(second.asked).toHaveLength(0);
    expect(second.played).toEqual([`clip article:a1|${S.text}`]);
  });

  it('a shared request is still one request with the store asked first: the same sentence twice in one read, and a second read after a give-up', async () => {
    const { seam, asked, played, puts, store } = heldPage();
    // two asks of one sentence in one read (the queue asks ahead): each looks in the store first, then they share one request
    const twice = run(seam, { voiceKey: 'article:a1', sentences: [S, S], prefetch: 2 });
    await tick();
    expect(asked).toHaveLength(1);
    asked[0].answer();
    expect((await twice).at(-1)).toBe('done');
    expect(played).toEqual([`clip article:a1|${S.text}`, `clip article:a1|${S.text}`]);
    await settle(store);
    expect(puts).toEqual([`article:a1|${S.text}`]);
    // the ear's give-up (cut): a later read of the same sentence joins the request still on its way
    const first = seam.read({ voiceKey: 'word:ear', sentences: [T], prefetch: 0 });
    await tick();
    expect(asked).toHaveLength(2);
    first.cut();
    await tick();
    const again = run(seam, { voiceKey: 'word:ear', sentences: [T], prefetch: 0 });
    await tick();
    expect(asked).toHaveLength(2);
    expect(asked[1].aborted).toBe(false);
    asked[1].answer();
    expect((await again).at(-1)).toBe('done');
  });

  it('a request given up on that later succeeds reaches the store: after a reload, offline, it plays with no request', async () => {
    const storage = createMemoryClipStorage();
    const first = heldPage({ storage });
    const states = [];
    const read = first.seam.read({
      voiceKey: 'word:ear',
      sentences: [T],
      prefetch: 0,
      onState: (state) => states.push(state),
    });
    await tick();
    expect(first.asked).toHaveLength(1);
    read.cut();
    await tick();
    expect(states.at(-1)).toBe('stopped');
    first.asked[0].answer();
    await tick();
    await settle(first.store);
    expect(first.puts).toEqual([`word:ear|${T.text}`]);
    expect(first.played).toEqual([]);
    const offline = heldPage({ storage, online: false });
    const after = await run(offline.seam, { voiceKey: 'word:ear', sentences: [T], prefetch: 0 });
    expect(after.at(-1)).toBe('done');
    expect(offline.asked).toHaveLength(0);
    expect(offline.played).toEqual([`clip word:ear|${T.text}`]);
  });
});
