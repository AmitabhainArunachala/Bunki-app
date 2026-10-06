/**
 * The guided session's moments — the samurai cut, the rematch, and the paper crane that
 * carries a saved word. Ported from Codex's samurai-effect.js (bunki_experience/2026-09-23).
 *
 * Presentation only: a moment never answers, grades, saves or schedules anything. The
 * learner chooses quiet · playful · dramatic (quiet plays no samurai on its own), may turn
 * the moments off, and may opt in to sound. prefers-reduced-motion suppresses automatic
 * playback; an explicit replay still plays, briefly. Escape, Skip or any navigation ends it.
 * The sprite sheet and its provenance live in guided/ (SAMURAI-PROVENANCE.md).
 */

export const MOMENT_MODES = ['quiet', 'playful', 'dramatic'];
const PREFERENCE_KEY = 'kairo-moments-v1';
const DEFAULTS = { on: true, mode: 'playful', sound: false };
/* A sibling's address, or the one the single-file handoff supplies: there this module runs from
 * a blob: URL, which no relative address resolves against (build-standalone.mjs). */
const sibling = (path, supplied) => globalThis[supplied] || new URL(path, import.meta.url).href;

let stylesheet = null;
function ensureStylesheet() {
  stylesheet ||= new Promise((resolve, reject) => {
    const present = document.querySelector('link[data-guided-moments-style]');
    if (present?.sheet) {
      resolve(true);
      return;
    }
    const link = present || document.createElement('link');
    link.rel = 'stylesheet';
    link.href = sibling('./guided-moments.css', '__KAIRO_GUIDED_MOMENTS_STYLE_URL__');
    link.dataset.guidedMomentsStyle = '';
    link.addEventListener('load', () => resolve(true), { once: true });
    link.addEventListener(
      'error',
      () => {
        link.remove();
        stylesheet = null;
        reject(new Error('moments-style-unavailable'));
      },
      { once: true },
    );
    if (!present) document.head.append(link);
  });
  return stylesheet;
}

/** The moments with their stylesheet in place: nothing plays before it can be drawn. */
export async function loadMoments(options = {}) {
  await ensureStylesheet();
  return createMoments({
    spriteUrl: sibling('./guided/samurai-sprites-v2.png', '__KAIRO_GUIDED_SPRITE_URL__'),
    ...options,
  });
}

const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/gu,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

export function createMoments(options = {}) {
  const storage = options.storage || null;
  const english = options.english || (() => true);
  const openReport = typeof options.openReport === 'function' ? options.openReport : null;
  const observed = () => options.observe?.() || document.getElementById('app');
  const spriteUrl = options.spriteUrl || null;
  let memory = null;
  let active = null;
  let sprite = null;

  function preferences() {
    if (memory) return memory;
    let stored;
    try {
      stored = JSON.parse(storage?.getItem(PREFERENCE_KEY) || 'null');
    } catch {
      stored = null;
    }
    memory = {
      on: typeof stored?.on === 'boolean' ? stored.on : DEFAULTS.on,
      mode: MOMENT_MODES.includes(stored?.mode) ? stored.mode : DEFAULTS.mode,
      sound: typeof stored?.sound === 'boolean' ? stored.sound : DEFAULTS.sound,
    };
    return memory;
  }
  function remember(patch) {
    memory = { ...preferences(), ...patch };
    try {
      storage?.setItem(PREFERENCE_KEY, JSON.stringify(memory));
    } catch {
      /* the choice still holds for this visit */
    }
  }
  const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const enabled = () => preferences().on;
  const mode = () => preferences().mode;
  const soundEnabled = () => preferences().sound;
  function setEnabled(value) {
    remember({ on: !!value });
    if (!value) stop();
    return !!value;
  }
  function setMode(value) {
    if (!MOMENT_MODES.includes(value)) return mode();
    remember({ mode: value });
    if (value === 'quiet') stop();
    return value;
  }
  function setSoundEnabled(value) {
    remember({ sound: !!value });
    if (!value) silence(active);
    return !!value;
  }

  /** Decode the sheet before the first strike, so the stage never opens empty. */
  function preload() {
    if (!spriteUrl) return Promise.resolve(false);
    if (!sprite) {
      const image = new Image();
      image.src = spriteUrl;
      sprite = (typeof image.decode === 'function' ? image.decode() : Promise.resolve())
        .then(() => true)
        .catch(() => false);
    }
    return sprite;
  }

  function safeFocus(node) {
    try {
      if (node?.isConnected && typeof node.focus === 'function')
        node.focus({ preventScroll: true });
    } catch {
      /* a removed control needs no restoration */
    }
  }
  function silence(scene) {
    if (!scene?.audio) return;
    const context = scene.audio;
    scene.audio = null;
    try {
      context.close()?.catch(() => {});
    } catch {
      /* sound is optional */
    }
  }
  function finish(restoreFocus = true) {
    const scene = active;
    if (!scene) return;
    active = null;
    scene.timers.forEach(clearTimeout);
    if (scene.frame) cancelAnimationFrame(scene.frame);
    scene.observer?.disconnect();
    silence(scene);
    document.removeEventListener('keydown', scene.onKey, true);
    scene.root.remove();
    if (scene.modal) {
      if (scene.overflow.value) {
        document.body.style.setProperty('overflow', scene.overflow.value, scene.overflow.priority);
      } else document.body.style.removeProperty('overflow');
      for (const [node, hadInert] of scene.inert) if (!hadInert) node.removeAttribute('inert');
    }
    if (restoreFocus && (scene.modal || document.activeElement === document.body)) {
      safeFocus(scene.returnFocus);
    }
  }
  function stop() {
    finish();
  }
  function schedule(scene, fn, ms) {
    scene.timers.push(
      setTimeout(() => {
        if (active === scene) fn();
      }, ms),
    );
  }
  function focusTarget(request) {
    if (request.returnFocus instanceof Element) return request.returnFocus;
    if (active?.root.contains(document.activeElement)) return active.returnFocus;
    return document.activeElement;
  }
  function mount(root, request, modal) {
    const target = focusTarget(request);
    finish(false);
    if (!modal && document.activeElement === document.body) safeFocus(target);
    const scene = {
      root,
      modal,
      returnFocus: target,
      timers: [],
      frame: null,
      observer: null,
      audio: null,
      inert: [],
    };
    active = scene;
    scene.onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        stop();
      } else if (modal && event.key === 'Tab') {
        event.preventDefault();
        const controls = [...root.querySelectorAll('[data-moment-control]')].filter(
          (n) => !n.disabled,
        );
        const current = controls.indexOf(document.activeElement);
        const step = event.shiftKey ? -1 : 1;
        const next =
          current < 0
            ? event.shiftKey
              ? controls.length - 1
              : 0
            : (current + step + controls.length) % controls.length;
        safeFocus(controls[next]);
      }
    };
    document.addEventListener('keydown', scene.onKey, true);
    if (modal) {
      scene.overflow = {
        value: document.body.style.getPropertyValue('overflow'),
        priority: document.body.style.getPropertyPriority('overflow'),
      };
      for (const node of document.body.children) {
        if (/^(SCRIPT|STYLE|LINK)$/u.test(node.tagName)) continue;
        scene.inert.push([node, node.hasAttribute('inert')]);
        node.setAttribute('inert', '');
      }
      document.body.style.overflow = 'hidden';
    }
    document.body.append(root);
    if (modal) safeFocus(root.querySelector('[data-moment-skip]'));
    scene.frame = requestAnimationFrame(() => {
      scene.frame = null;
      if (active === scene) root.classList.add('samurai-effect--run');
    });
    const watched = observed();
    if (watched && window.MutationObserver) {
      scene.observer = new MutationObserver(() => stop());
      scene.observer.observe(watched, { childList: true });
    }
    return scene;
  }

  /* A stored opt-in AND a live user gesture are required for the stage foley. */
  function sound(scene, outcome, impactAt) {
    if (!soundEnabled() || navigator.userActivation?.isActive !== true) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    try {
      const context = new Context();
      scene.audio = context;
      const start = context.currentTime + Math.max(0.05, impactAt / 1000 - 0.08);
      const master = context.createGain();
      master.gain.value = 0.065;
      master.connect(context.destination);
      const buffer = context.createBuffer(
        1,
        Math.floor(context.sampleRate * 0.14),
        context.sampleRate,
      );
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length);
      }
      const sweep = context.createBufferSource();
      sweep.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(950, start);
      filter.frequency.exponentialRampToValueAtTime(2600, start + 0.12);
      sweep.connect(filter);
      filter.connect(master);
      sweep.start(start);
      sweep.stop(start + 0.14);
      const notes = outcome === 'rematch' ? [660, 990] : [185];
      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const at = start + 0.1 + index * 0.08;
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.7, at + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.25);
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start(at);
        oscillator.stop(at + 0.27);
      });
      if (context.state === 'suspended') context.resume()?.catch(() => silence(scene));
    } catch {
      silence(scene);
    }
  }

  function overlay(outcome, selectedMode, forced, demo) {
    const rematch = outcome === 'rematch';
    const en = english();
    const root = document.createElement('div');
    root.className = `samurai-effect samurai-effect--${selectedMode} samurai-effect--${outcome}${forced ? ' samurai-effect--forced' : ''}`;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'samurai-effect-title');
    root.setAttribute('aria-describedby', 'samurai-effect-description');
    root.dataset.outcome = outcome;
    root.dataset.mode = selectedMode;
    root.dataset.demo = String(demo);
    const pieces = Array.from({ length: 12 }, (_, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const turn = (i % 2 ? 1 : -1) * (38 + i * 13);
      return `<i style="--piece:${i};--col:${col};--row:${row};--dx:${(col - 1.5) * 51}px;--dy:${(row - 1) * 52 + 25}px;--turn:${turn}deg"></i>`;
    }).join('');
    const eyebrow = demo
      ? en
        ? 'Demo · no result recorded'
        : '見本 · 結果は記録しない'
      : rematch
        ? en
          ? 'The rematch'
          : '再戦'
        : en
          ? 'A moment of practice'
          : '稽古のひととき';
    const verdict = rematch ? (en ? 'Correct.' : '正解。') : en ? 'Incorrect.' : '不正解。';
    const verdictJa = rematch ? '正解' : '不正解';
    const line = demo
      ? en
        ? 'A preview of the moment. Your progress is unchanged.'
        : 'この場面の見本。進み具合は変わらない。'
      : rematch
        ? en
          ? 'You found the right answer. The samurai yields.'
          : '正しい答えを見つけた。侍は一礼して退く。'
        : en
          ? 'A wrong turn is part of the way. Return to the explanation.'
          : '間違いも道のうち。解説へ戻ろう。';
    root.innerHTML = `
      <div class="samurai-effect__frame" aria-hidden="true"></div>
      <div class="samurai-effect__header">
        <span class="samurai-effect__eyebrow">${esc(eyebrow)}</span>
        <h2 class="samurai-effect__verdict" id="samurai-effect-title">${esc(verdict)}</h2>
        ${en ? `<span class="samurai-effect__verdict-ja" lang="ja" aria-hidden="true">${verdictJa}</span>` : ''}
      </div>
      <div class="samurai-effect__stage" aria-hidden="true">
        <div class="samurai-effect__sun"></div>
        <div class="samurai-effect__horizon"></div>
        <span class="samurai-effect__stage-label" lang="ja">${rematch ? '受ける' : 'もう一度'}</span>
        <div class="samurai-effect__samurai"><div class="samurai-effect__samurai-art"></div></div>
        <div class="samurai-effect__learner"><div class="samurai-effect__learner-art"></div></div>
        <div class="samurai-effect__stroke"></div>
        <div class="samurai-effect__spark"><i></i><i></i><i></i><i></i></div>
        <div class="samurai-effect__scraps">${pieces}</div>
        <div class="samurai-effect__blackout"></div>
      </div>
      <div class="samurai-effect__footer">
        <p id="samurai-effect-description">${esc(line)}</p>
        <div class="samurai-effect__actions">
          ${openReport ? `<button class="samurai-effect__report" type="button" data-moment-control data-moment-report>${en ? 'Report a problem' : '問題を報告'}</button>` : ''}
          <button class="samurai-effect__skip" type="button" data-moment-control data-moment-skip>${en ? 'Skip' : '閉じる'} <span aria-hidden="true">Esc</span></button>
        </div>
      </div>`;
    root.querySelector('[data-moment-skip]').addEventListener('click', stop);
    root.querySelector('[data-moment-report]')?.addEventListener('click', () => {
      stop();
      openReport();
    });
    return root;
  }

  /** The samurai (outcome 'incorrect') or the rematch ('rematch'). Returns whether it plays. */
  function play(request = {}) {
    const forced = request.force === true;
    const selectedMode = mode();
    const automaticOff = !enabled() || reducedMotion() || selectedMode === 'quiet';
    if (!document.body || (!forced && automaticOff)) return false;
    const outcome = request.outcome === 'rematch' ? 'rematch' : 'incorrect';
    const quiet = selectedMode === 'quiet';
    void preload();
    const scene = mount(
      overlay(outcome, selectedMode, forced, request.demo === true),
      request,
      true,
    );
    const impactAt = quiet ? 200 : selectedMode === 'dramatic' ? 1020 : 850;
    scene.root.style.setProperty('--se-anticipation', `${impactAt}ms`);
    if (outcome === 'rematch') {
      schedule(
        scene,
        () => scene.root.classList.add('samurai-effect--guard'),
        Math.max(40, impactAt - 220),
      );
    }
    schedule(scene, () => scene.root.classList.add('samurai-effect--impact'), impactAt);
    schedule(
      scene,
      () => scene.root.classList.add('samurai-effect--resolve'),
      impactAt + (quiet ? 120 : 180),
    );
    schedule(scene, () => scene.root.classList.add('samurai-effect--settle'), quiet ? 720 : 2240);
    schedule(scene, stop, quiet ? 1400 : selectedMode === 'dramatic' ? 3250 : 2950);
    sound(scene, outcome, impactAt);
    return true;
  }

  /** The paper crane carries a deliberately saved word to its target (the 覚 door). It never
   * takes focus; reduced motion and quiet keep only the still confirmation line. */
  function carry(request = {}) {
    if (!document.body) return false;
    const root = document.createElement('div');
    const still = reducedMotion() || mode() === 'quiet' || !enabled();
    root.className = `bunki-moment${still ? ' bunki-moment--still' : ''}`;
    root.dataset.moment = 'crane';
    root.innerHTML = `<div class="bunki-moment__flight" aria-hidden="true"><svg class="bunki-moment__crane" viewBox="0 0 160 100" fill="none"><path class="bunki-moment__wing bunki-moment__wing--back" d="M78 55 21 5 44 65Z" fill="#c6b38b"/><path d="m78 55 29-25 15 2-14 9-12 27-30 3-21 19 8-29Z" fill="#f4e7ca"/><path class="bunki-moment__wing bunki-moment__wing--front" d="M76 57 145 3 107 66Z" fill="#fffbec"/><path d="m52 61 26-6 29 11-41 5Z" fill="#d8c7a2"/><path d="m107 30 15 2-14 9" fill="#ae644c"/><path d="m76 57 31 9M78 55l18 13" stroke="#9e8862" stroke-width="1"/></svg><span class="bunki-moment__note"></span></div><p class="bunki-moment__message" role="status" aria-live="polite" aria-atomic="true"></p>`;
    root.querySelector('.bunki-moment__message').textContent = String(request.text || '').slice(
      0,
      220,
    );
    let target = request.target;
    if (typeof target === 'string') {
      try {
        target = document.querySelector(target);
      } catch {
        target = null;
      }
    }
    const rect = target instanceof Element ? target.getBoundingClientRect() : null;
    const startX = innerWidth * 0.47;
    const startY = innerHeight * 0.66;
    const endX = rect
      ? Math.max(30, Math.min(innerWidth - 30, rect.left + rect.width / 2))
      : innerWidth - 65;
    const endY = rect ? Math.max(30, Math.min(innerHeight - 30, rect.top + rect.height / 2)) : 55;
    root.style.setProperty('--crane-x', `${startX}px`);
    root.style.setProperty('--crane-y', `${startY}px`);
    root.style.setProperty('--crane-dx', `${endX - startX}px`);
    root.style.setProperty('--crane-dy', `${endY - startY}px`);
    const scene = mount(root, request, false);
    schedule(scene, () => root.classList.add('bunki-moment--settle'), still ? 1500 : 1700);
    schedule(scene, stop, still ? 1850 : 2150);
    return true;
  }

  window.addEventListener('pagehide', stop);
  window.addEventListener('popstate', stop);
  window.addEventListener('bunki:reports-open', stop);

  return Object.freeze({
    modes: MOMENT_MODES,
    enabled,
    setEnabled,
    mode,
    setMode,
    soundEnabled,
    setSoundEnabled,
    reducedMotion,
    preload,
    play,
    carry,
    stop,
    active: () => !!active,
  });
}
