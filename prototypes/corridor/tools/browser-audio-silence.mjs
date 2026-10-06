/** Test-only output policy. Native decoding/speech and completion/error paths
 * remain active; this cannot establish audibility, voice quality, understanding
 * or unmuted autoplay acceptance. Install before the first app navigation. */
export const TEST_AUDIO_OUTPUT = Object.freeze({
  mode: 'test-silenced',
  media: 'HTMLMediaElement.muted before programmatic play',
  speech: 'SpeechSynthesisUtterance.volume=0 before native speak',
  excludes: ['audibility', 'audio-quality', 'comprehension', 'unmuted-autoplay'],
});

export async function silenceBrowserAudio(context) {
  await context.addInitScript(() => {
    const marker = Symbol.for('kairo.test.silent-audio.v1');
    if (globalThis[marker]) return;
    const media = globalThis.HTMLMediaElement?.prototype;
    const play = media && Object.getOwnPropertyDescriptor(media, 'play');
    const muted = media && Object.getOwnPropertyDescriptor(media, 'muted');
    if (typeof play?.value !== 'function' || typeof muted?.get !== 'function' || typeof muted?.set !== 'function')
      throw new Error('Test audio silencing: native media descriptors unavailable');
    Object.defineProperty(media, 'play', { ...play, value: new Proxy(play.value, {
      apply(target, receiver, args) {
        // Use the native brand check. Invalid receivers still reach native play
        // unchanged, retaining its original exception/rejection behavior.
        try { Reflect.apply(muted.get, receiver, []); }
        catch { return Reflect.apply(target, receiver, args); }
        Reflect.apply(muted.set, receiver, [true]);
        return Reflect.apply(target, receiver, args);
      },
    }) });
    if (globalThis.speechSynthesis !== undefined) {
      const speech = globalThis.SpeechSynthesis?.prototype;
      const speak = speech && Object.getOwnPropertyDescriptor(speech, 'speak');
      const pending = speech && Object.getOwnPropertyDescriptor(speech, 'pending');
      const utterance = globalThis.SpeechSynthesisUtterance?.prototype;
      const volume = utterance && Object.getOwnPropertyDescriptor(utterance, 'volume');
      if (typeof speak?.value !== 'function' || typeof pending?.get !== 'function' ||
          typeof volume?.get !== 'function' || typeof volume?.set !== 'function')
        throw new Error('Test audio silencing: native speech descriptors unavailable');
      Object.defineProperty(speech, 'speak', { ...speak, value: new Proxy(speak.value, {
        apply(target, receiver, args) {
          // Preserve native validation for a wrong receiver/missing utterance.
          try { Reflect.apply(pending.get, receiver, []); Reflect.apply(volume.get, args[0], []); }
          catch { return Reflect.apply(target, receiver, args); }
          Reflect.apply(volume.set, args[0], [0]);
          return Reflect.apply(target, receiver, args);
        },
      }) });
    }
    Object.defineProperty(globalThis, marker, { value: true });
  });
  return TEST_AUDIO_OUTPUT;
}
