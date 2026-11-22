/** Study voice bridge (ENGINE-ONE.6): connects Nihongo Study's canonical speech hooks
 * (`window.nihongoSpeak` inside the embedded study frame) to Bunki's paired voice client
 * (`bunki-voice`) and shared device clip store (voice-clip-store.mjs).
 *
 * Unpaired: `openBunkiStudyVoice()` resolves `null` without creating a database or touching
 * the network. The embedded study screen stays 100% silent with `audioOrigin: 'about:blank'`
 * and never falls back to device `speechSynthesis`.
 *
 * Paired: card speakers, speak-on-reveal, and the ear mark call `POST <server>/v1/audio/speak`
 * with Bunki's speak-only bearer token (`bunki-<32 hex>`), sharing the offline clip cache and
 * stopping any parent Bunki playback before study speaks (single-voice arbitration). Every
 * in-flight request aborts cleanly on card change, leave, or frame unload. */
import { createClipStore, createIndexedDbClipStorage } from './voice-clip-store.mjs';
import { createDeviceTokenStore, isVoiceServer } from './voice-client.mjs';
import { isVoiceKey } from './nihongo-speech/audio/speech-text.mjs';
import { activeVoiceLayer } from './voice-layer.mjs';

export const SPEAK_DEADLINE_MS = 20000;
const STORE_WAIT_MS = 1500;
const VOICE_TOKEN = /^nsrs_(dev|prod)_([A-Za-z0-9_-]{4,512})\.([a-f0-9]{64})$/;
const VOICE_INSTALLATION = /^bunki-[a-f0-9]{32}$/;
const CARD_GUID = /^nsrs-[a-z]-[0-9a-f]{12}$/;
const NO_ANSWER = Symbol('no-answer');

const failure = (error) => ({ ok: false, error });

function base64Bytes(bytes) {
  let binary = '';
  for (let at = 0; at < bytes.length; at += 32768) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 32768));
  }
  return globalThis.btoa(binary);
}

/** Verify that a stored voice token is a real scoped `bunki-` speak-only credential. */
export function isValidVoiceCredential(token, scope) {
  const match = typeof token === 'string' && token.length <= 2048 ? VOICE_TOKEN.exec(token) : null;
  if (!match || !scope || typeof scope !== 'object' || !VOICE_INSTALLATION.test(scope.installation || '')) return false;
  if (match[1] !== (scope.environment === 'prod' ? 'prod' : 'dev')) return false;
  try {
    const encoded = match[2].replace(/-/g, '+').replace(/_/g, '/');
    const tuple = JSON.parse(globalThis.atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
    return (
      Array.isArray(tuple) &&
      tuple.length === 3 &&
      tuple[0] === scope.environment &&
      tuple[1] === scope.learner &&
      tuple[2] === scope.installation
    );
  } catch {
    return false;
  }
}

/** Share Bunki's `${voiceKey}|${text}` clip key for single-segment speech so clips heard in
 * Bunki's Reader/Dictionary replay offline inside Study (and vice versa). */
export function clipKeyForSpeak(target, speechInput) {
  if (typeof target !== 'string' || !speechInput || !Array.isArray(speechInput.segments) || !speechInput.segments.length) {
    return null;
  }
  const voiceKey = isVoiceKey(target) ? target : CARD_GUID.test(target) ? `card:${target}` : null;
  if (!voiceKey) return null;
  if (speechInput.segments.length === 1 && typeof speechInput.segments[0]?.text === 'string' && speechInput.segments[0].text) {
    return `${voiceKey}|${speechInput.segments[0].text}`;
  }
  return typeof speechInput.inputKey === 'string' && speechInput.inputKey ? `${voiceKey}|${speechInput.inputKey}` : null;
}

const settled = (work, ms) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(NO_ANSWER), ms);
    Promise.resolve()
      .then(work)
      .then(
        (value) => {
          clearTimeout(timer);
          resolve(value ?? null);
        },
        () => {
          clearTimeout(timer);
          resolve(null);
        },
      );
  });

function watchDeadline({ ms, now, setTimer, clearTimer, onWake }, expire) {
  const at = now() + ms;
  let timer = null;
  let unwatch = null;
  let done = false;
  const end = () => {
    if (done) return;
    done = true;
    if (timer !== null) clearTimer(timer);
    timer = null;
    try {
      unwatch?.();
    } catch {
      /* ignore wake cleanup errors */
    }
    unwatch = null;
  };
  const arm = (wait) => {
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      check();
    }, wait);
  };
  function check() {
    if (done) return;
    const left = at - now();
    if (left <= 0) {
      end();
      expire();
      return;
    }
    arm(left);
  }
  try {
    unwatch = onWake(check) ?? null;
  } catch {
    unwatch = null;
  }
  arm(ms);
  return end;
}

function pageWakes(win) {
  return (listener) => {
    if (!win) return () => {};
    const visible = () => {
      try {
        if (win.document?.visibilityState !== 'hidden') listener();
      } catch {
        /* ignore */
      }
    };
    const targets = [
      [win.document, 'visibilitychange', visible],
      [win, 'pageshow', listener],
      [win, 'focus', listener],
      [win, 'online', listener],
    ].filter(([target]) => typeof target?.addEventListener === 'function');
    for (const [target, type, fn] of targets) target.addEventListener(type, fn);
    return () => {
      for (const [target, type, fn] of targets) target.removeEventListener(type, fn);
    };
  };
}

/** Build the `window.nihongoSpeak`-compatible bridge for an embedded study frame. */
export function createStudyVoiceBridge({
  origin,
  getCredential,
  fetch: request = globalThis.fetch?.bind(globalThis),
  clips = null,
  online = () => globalThis.navigator?.onLine !== false,
  onBeforeSpeak = null,
  onAuthEnded = null,
  storeWaitMs = STORE_WAIT_MS,
  timeoutMs = SPEAK_DEADLINE_MS,
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  onWake = pageWakes(globalThis),
} = {}) {
  let disposed = false;
  let storeOff = false;
  const inflight = new Set();
  const saving = new Map();

  function keep(key, bytes, contentType, voiceId) {
    if (!clips || storeOff || !key) return;
    try {
      const save = Promise.resolve(clips.put(key, { bytes, contentType, voiceId }))
        .catch(() => {})
        .finally(() => {
          if (saving.get(key) === save) saving.delete(key);
        });
      saving.set(key, save);
    } catch {
      /* clip cache is best-effort */
    }
  }

  async function ask(target, speechInput, key, credential, { signal, over }) {
    if (disposed) return failure('aborted');
    if (!isVoiceServer(origin) || typeof request !== 'function') return failure('server-missing');
    const lost = () => failure(disposed ? 'aborted' : over() ? 'voice-timeout' : 'network-failed');
    let response;
    try {
      response = await request(`${origin}/v1/audio/speak`, {
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal,
        headers: {
          Authorization: `Bearer ${credential}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...speechInput,
          ...(isVoiceKey(target) ? { voiceKey: target } : { cardGuid: target }),
        }),
      });
    } catch {
      return lost();
    }
    const contentType = response.headers.get('Content-Type') || '';
    if (response.status === 200 && /^audio\//i.test(contentType)) {
      let bytes;
      try {
        bytes = new Uint8Array(await response.arrayBuffer());
      } catch {
        return lost();
      }
      if (!bytes.length) return failure('invalid-response');
      const voice = response.headers.get('X-NSRS-Audio-Voice-Id') || null;
      if (key && !storeOff) keep(key, bytes, contentType, voice);
      if (disposed) return failure('aborted');
      if (over()) return failure('voice-timeout');
      const cache = response.headers.get('X-NSRS-Audio-Cache');
      return {
        ok: true,
        contentType,
        bytes: base64Bytes(bytes),
        voice,
        ...(cache === 'miss' || cache === 'hit' ? { cache } : {}),
      };
    }
    if (response.status === 426) return failure('update-required');
    if (response.status === 401) {
      try {
        await onAuthEnded?.();
      } catch {
        /* pairing state cleanup is best-effort */
      }
      return failure('authentication-required');
    }
    let body;
    try {
      body = await response.json();
    } catch {
      return failure(disposed ? 'aborted' : over() ? 'voice-timeout' : 'speak-failed');
    }
    if (body && typeof body.error === 'string' && body.error) return failure(body.error);
    return failure('speak-failed');
  }

  return Object.freeze({
    web: true,
    async speak(target, speechInput) {
      if (disposed) return failure('aborted');
      try {
        onBeforeSpeak?.();
      } catch {
        /* never let parent stop fault block speech */
      }
      if (typeof target !== 'string' || (!isVoiceKey(target) && !CARD_GUID.test(target))) {
        return failure('not-speakable');
      }
      const controller = new AbortController();
      inflight.add(controller);
      const due = now() + timeoutMs;
      let late = false;
      let end = () => {};
      const deadline = new Promise((resolve) => {
        end = watchDeadline({ ms: timeoutMs, now, setTimer, clearTimer, onWake }, () => {
          late = true;
          try {
            controller.abort();
          } catch {
            /* ignore */
          }
          resolve(failure(disposed ? 'aborted' : 'voice-timeout'));
        });
      });
      const over = () => disposed || late || now() >= due;
      const work = (async () => {
        let key = null;
        if (clips && !storeOff) {
          try {
            key = clipKeyForSpeak(target, speechInput);
          } catch {
            key = null;
          }
        }
        if (key) {
          const kept = await settled(() => clips.get(key), storeWaitMs);
          if (kept === NO_ANSWER) {
            storeOff = true;
            key = null;
          } else if (kept?.bytes instanceof Uint8Array && kept.bytes.length) {
            if (disposed) return failure('aborted');
            return over()
              ? failure('voice-timeout')
              : {
                  ok: true,
                  contentType: kept.contentType || 'audio/mpeg',
                  bytes: base64Bytes(kept.bytes),
                  voice: kept.voiceId ?? null,
                  cache: 'local',
                };
          }
        }
        if (disposed) return failure('aborted');
        if (!online()) return failure('offline');
        let credential = null;
        try {
          credential = await getCredential();
        } catch {
          return failure(disposed ? 'aborted' : over() ? 'voice-timeout' : 'not-paired');
        }
        if (disposed) return failure('aborted');
        if (over()) return failure('voice-timeout');
        if (typeof credential !== 'string' || !credential) return failure('not-paired');
        return ask(target, speechInput, key, credential, { signal: controller.signal, over });
      })();
      try {
        return await Promise.race([work, deadline]);
      } finally {
        end();
        inflight.delete(controller);
      }
    },
    async forget(target, speechInput) {
      if (!clips) return;
      let key = null;
      try {
        key = clipKeyForSpeak(target, speechInput);
      } catch {
        key = null;
      }
      if (!key) return;
      try {
        await saving.get(key);
      } catch {
        /* ignore */
      }
      try {
        await clips.drop(key);
      } catch {
        /* miss next time either way */
      }
    },
    abortAll() {
      disposed = true;
      for (const controller of [...inflight]) {
        try {
          controller.abort();
        } catch {
          /* ignore */
        }
      }
      inflight.clear();
    },
  });
}

/** Resolve an active study voice bridge when Bunki's voice client is paired on this device.
 * Returns `null` when unpaired so the embedded study frame stays completely silent and makes
 * zero network requests. */
export async function openBunkiStudyVoice({ env = globalThis } = {}) {
  const store = createDeviceTokenStore(env);
  let kept;
  try {
    kept = await store.read();
  } catch {
    return null;
  }
  const server = isVoiceServer(kept?.server) ? kept.server : null;
  if (!server || !isValidVoiceCredential(kept?.token, kept?.scope)) return null;
  const active = activeVoiceLayer();
  const clips = active?.clips ?? createClipStore({ storage: createIndexedDbClipStorage(env) });
  return createStudyVoiceBridge({
    origin: server,
    clips,
    fetch: env.fetch?.bind(env),
    online: () => env.navigator?.onLine !== false,
    onWake: pageWakes(env),
    onBeforeSpeak: () => activeVoiceLayer()?.stopAll?.(),
    async getCredential() {
      const current = await store.read();
      if (current?.server !== server || !isValidVoiceCredential(current?.token, current?.scope)) {
        return null;
      }
      return current.token;
    },
    async onAuthEnded() {
      try {
        if (store.durable !== false && typeof store.end === 'function') {
          await store.end({ ended: true, at: Date.now() });
        } else {
          await store.clear();
        }
      } catch {
        /* best effort */
      }
      activeVoiceLayer()?.authEnded?.();
    },
  });
}
