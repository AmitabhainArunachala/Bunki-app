/** Ephemeral browser speech. No audio assets, persistence, or provider requests. */
export const MAX_UTTERANCE_CHARS = 2000;
export const REASONS = Object.freeze({
  READY: 'ready', UNSUPPORTED: 'unsupported', NO_JA_VOICE: 'no-ja-voice',
  DISABLED: 'disabled', INVALID_TEXT: 'invalid-text', FAILED: 'speech-failed',
});

export function speakableText(value) {
  if (typeof value !== 'string') return null;
  const text = value.normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (!text || text.length > MAX_UTTERANCE_CHARS || /[<>\p{Cc}\p{Cf}]/u.test(text) ||
      !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(text)) return null;
  return text;
}

export function japaneseVoices(voices = []) {
  return Array.from(voices).filter(voice => /^ja(?:[-_]|$)/iu.test(voice?.lang || ''))
    .sort((a, b) => Number(!!b.localService) - Number(!!a.localService) ||
      Number(!!b.default) - Number(!!a.default));
}

function environment(env) {
  return { synth: env.synth ?? env.speechSynthesis, Utterance: env.Utterance ?? env.SpeechSynthesisUtterance };
}

export function deviceVoiceSupport(env = globalThis) {
  try {
    const { synth, Utterance } = environment(env);
    if (!synth || typeof synth.getVoices !== 'function' || typeof synth.speak !== 'function' ||
        typeof synth.cancel !== 'function' || typeof Utterance !== 'function')
      return { ok: false, reason: REASONS.UNSUPPORTED };
    // A browser-listed voice may use a remote service; speech must stay on this device.
    const ref = japaneseVoices(synth.getVoices()).find(voice => voice.localService === true);
    if (!ref) return { ok: false, reason: REASONS.NO_JA_VOICE };
    return { ok: true, reason: REASONS.READY, voice: {
      name: ref.name, voiceURI: ref.voiceURI, lang: ref.lang, localService: !!ref.localService, ref,
    } };
  } catch { return { ok: false, reason: REASONS.UNSUPPORTED }; }
}

export function voiceDecision({ hasApprovedClip = false, enabled = true, support, text } = {}) {
  if (!enabled) return { source: 'none', reason: REASONS.DISABLED };
  if (hasApprovedClip) return { source: 'approved', reason: REASONS.READY };
  const normalized = speakableText(text);
  if (!normalized) return { source: 'none', reason: REASONS.INVALID_TEXT };
  if (!support?.ok) return { source: 'none', reason: support?.reason || REASONS.UNSUPPORTED };
  return { source: 'device', reason: REASONS.READY, text: normalized, voice: support.voice };
}

export function createDeviceVoice(env = globalThis) {
  // Keep the active utterance alive until completion, and detach stale callbacks before cancellation.
  let active = null, stopped = null;
  function cancel() {
    if (active) active.onstart = active.onend = active.onerror = null;
    active = null;
    const tell = stopped;
    stopped = null;
    try { environment(env).synth?.cancel(); } catch { /* unavailable device */ }
    tell?.();
  }
  function speak(text, { onStart, onEnd, onError } = {}) {
    cancel();
    // UNBOUND legacy speech stays disabled: never infer a language or start a device utterance.
    return { spoken: false, source: 'none', reason: REASONS.DISABLED };
  }
  /** The voice seam's last source (modules/voice-seam.mjs): Japanese text the seam could not get from a recorded clip or
   * the voice server (unpaired, offline, out of budget, the server refusing). A local Japanese voice only; `onStop`
   * tells the caller a cancel ended it, so a queue never waits on an utterance that will not finish. */
  function fallback(text, { rate = 1, onStart, onEnd, onError, onStop } = {}) {
    cancel();
    const decision = voiceDecision({ support: deviceVoiceSupport(env), text });
    if (decision.source !== 'device') return { spoken: false, ...decision };
    try {
      const { synth, Utterance } = environment(env);
      const utterance = new Utterance(decision.text);
      utterance.lang = 'ja-JP';
      // a browser that will not take this voice object still speaks Japanese by the language alone
      try { utterance.voice = decision.voice.ref; } catch { /* the language chooses */ }
      utterance.rate = rate;
      active = utterance;
      stopped = onStop || null;
      const settle = (tell, ...args) => { if (active !== utterance) return; active = null; stopped = null; tell?.(...args); };
      utterance.onstart = () => { if (active === utterance) onStart?.(); };
      utterance.onend = () => settle(onEnd);
      utterance.onerror = () => settle(onError, REASONS.FAILED);
      synth.speak(utterance);
      return { spoken: true, ...decision };
    } catch {
      cancel();
      return { spoken: false, source: 'none', reason: REASONS.FAILED };
    }
  }
  return { support: () => deviceVoiceSupport(env), speak, fallback, cancel };
}
