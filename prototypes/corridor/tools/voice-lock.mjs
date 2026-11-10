/** The legacy Corridor voice lock, read by the renderer, validators, runtime mirror and tests.
 * Legacy rendering and playback take their model and role assignments from `audio/voice-lock.json`
 * through this reader. Swapping the voice is one edit there plus `sync-voice-lock.mjs
 * --write` (which carries it into corridor.js's mirror) plus a re-render. */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const corridor = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const VOICE_LOCK_PATH = resolve(corridor, 'audio/voice-lock.json');

/** Parse and validate the lock. A malformed lock is fatal: silence is better than a wrong voice. */
export function readVoiceLock(path = VOICE_LOCK_PATH) {
  const lock = JSON.parse(readFileSync(path, 'utf8'));
  if (lock.v !== 1) throw new Error(`voice-lock: unknown version ${lock.v}`);
  for (const key of ['provider', 'endpoint', 'roleLaw']) {
    if (typeof lock[key] !== 'string' || !lock[key].trim()) throw new Error(`voice-lock: ${key} missing`);
  }
  if (typeof lock.render?.model !== 'string' || !lock.render.model.trim()) throw new Error('voice-lock: render.model missing');
  // The corpus plan is live unless the lock retires it, and it says so in one of two words: a typo
  // must not read as either.
  if (lock.render.plan !== undefined && lock.render.plan !== 'active' && lock.render.plan !== 'retired')
    throw new Error('voice-lock: render.plan must be "active" or "retired"');
  // The speaking room's model is a SEPARATE slot and starts unapproved. 'Kore' on the Live model
  // is not the Kore he auditioned; one model field for both would let the room inherit an
  // approval nobody gave it.
  if (lock.live !== undefined) {
    if (typeof lock.live?.model !== 'string' || !lock.live.model.trim()) throw new Error('voice-lock: live.model malformed');
    if (typeof lock.live.approved !== 'boolean') throw new Error('voice-lock: live.approved must be stated explicitly');
    if (lock.live.approved && lock.live.model === lock.render.model) throw new Error('voice-lock: live and render must be approved separately');
  }
  // The narration provider is a second, separate admission. Stated in full or not at all: a model,
  // and each listed voice with the name the learner is shown and the provider's own voice id.
  if (lock.narration !== undefined) {
    const n = lock.narration;
    if (typeof n?.provider !== 'string' || !n.provider.trim() || typeof n.model !== 'string' || !n.model.trim())
      throw new Error('voice-lock: narration.provider or narration.model missing');
    if (n.model === lock.render.model) throw new Error('voice-lock: narration and render must name different models');
    const listed = Object.entries(n.voices || {});
    if (!listed.length) throw new Error('voice-lock: narration lists no voice');
    for (const [id, voice] of listed) {
      if (!/^[a-z][a-z0-9-]*$/u.test(id) || typeof voice?.name !== 'string' || !voice.name.trim()
        || typeof voice.voiceId !== 'string' || !voice.voiceId.trim())
        throw new Error(`voice-lock: narration voice ${id} malformed`);
      if ([lock.voices?.main?.id, lock.voices?.second?.id].includes(id))
        throw new Error(`voice-lock: narration voice ${id} is already a render voice`);
    }
  }
  for (const slot of ['main', 'second']) {
    const v = lock.voices?.[slot];
    if (!v || typeof v.id !== 'string' || typeof v.prebuilt !== 'string' || !Array.isArray(v.roles))
      throw new Error(`voice-lock: voices.${slot} malformed`);
  }
  if (lock.voices.main.id === lock.voices.second.id) throw new Error('voice-lock: the two voices must differ');
  return lock;
}

/** The runtime's own shape: { model, voices: { <id>: Prebuilt }, roles: { <role>: <voiceId> } }.
 * This exact object is mirrored into corridor.js, so the browser needs no fetch and no race. */
export function runtimeLock(lock = readVoiceLock()) {
  const roles = {};
  for (const slot of ['main', 'second']) for (const role of lock.voices[slot].roles) roles[role] = lock.voices[slot].id;
  return {
    model: lock.render.model,
    voices: { [lock.voices.main.id]: lock.voices.main.prebuilt, [lock.voices.second.id]: lock.voices.second.prebuilt },
    main: lock.voices.main.id,
    second: lock.voices.second.id,
    roles,
    // the provider whose narration clips may play: its model, and each listed voice by its shown name
    ...(lock.narration ? { narration: { model: lock.narration.model,
      voices: Object.fromEntries(Object.entries(lock.narration.voices).map(([id, voice]) => [id, voice.name])) } } : {}),
  };
}

/** Whether the lock retires its corpus plan. A retired plan owes nothing: no further clip is rendered
 * to this lock. The clips already on disk stay under it and are checked exactly as before. */
export function planRetired(lock = readVoiceLock()) {
  return lock.render.plan === 'retired';
}

/** Which voice a role may use — the role law in one function. Unknown role → the main voice,
 * because an unnamed surface is single-speaker by default; never the second voice. */
export function voiceForRole(role, lock = runtimeLock()) {
  return lock.roles[role] || lock.main;
}
