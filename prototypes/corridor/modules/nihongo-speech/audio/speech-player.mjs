/** One hidden audio element for universal speech playback.
 *
 * The queue owns ordering; this module owns the single reusable <audio>
 * element so speed changes apply to the clip that is already playing.
 */

export function createAudioPlayer(document) {
  if (!document || typeof document.createElement !== 'function') {
    throw new TypeError('document is required');
  }
  const win = document.defaultView ?? globalThis;
  let audio = document.querySelector('audio[data-speak-audio]');
  if (!audio) {
    audio = document.createElement('audio');
    audio.setAttribute('data-speak-audio', '');
    audio.hidden = true;
    audio.preload = 'auto';
    document.body.append(audio);
  }

  let current = null;

  const cleanup = handle => {
    if (handle.url) {
      try { win.URL.revokeObjectURL(handle.url); } catch { /* already revoked */ }
      handle.url = null;
    }
  };

  const finish = (outcome, error) => {
    const handle = current;
    if (!handle) return;
    current = null;
    cleanup(handle);
    if (error) handle.reject(error);
    else handle.resolve(outcome);
  };

  audio.addEventListener('ended', () => finish('ended'));
  audio.addEventListener('error', () => finish('error', new Error('audio-error')));

  return {
    play({ bytes, contentType } = {}, rate = 1) {
      if (!(bytes instanceof Uint8Array)) {
        return Promise.reject(new TypeError('bytes must be a Uint8Array'));
      }
      if (current) finish('stopped');
      let url;
      try {
        url = win.URL.createObjectURL(new win.Blob([bytes], { type: contentType || 'audio/mpeg' }));
      } catch (error) {
        return Promise.reject(error);
      }
      audio.preservesPitch = true;
      audio.defaultPlaybackRate = rate;
      audio.playbackRate = rate;
      audio.src = url;
      audio.defaultPlaybackRate = rate;
      audio.playbackRate = rate;
      return new Promise((resolve, reject) => {
        const handle = { url, resolve, reject };
        current = handle;
        let pending;
        try {
          pending = audio.play();
        } catch (error) {
          if (current === handle) finish('error', error);
          return;
        }
        Promise.resolve(pending).catch(error => {
          if (current === handle) finish('error', error);
        });
      });
    },

    pause() {
      audio.pause();
    },

    resume() {
      try {
        Promise.resolve(audio.play()).catch(() => {});
      } catch { /* an ended clip cannot resume */ }
    },

    stop() {
      audio.pause();
      finish('stopped');
    },

    setRate(rate) {
      audio.preservesPitch = true;
      audio.defaultPlaybackRate = rate;
      audio.playbackRate = rate;
    },
  };
}
