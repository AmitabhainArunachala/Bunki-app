/** The one voice lock, read by the renderer, the validators, the runtime mirror and the tests.
 * Nothing else in the tree may name a model or a voice: `audio/voice-lock.json` is the value and
 * this module is its only reader. Swapping the voice is one edit there plus `sync-voice-lock.mjs
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
  // The speaking room's model is a SEPARATE slot and starts unapproved. 'Kore' on the Live model
  // is not the Kore he auditioned; one model field for both would let the room inherit an
  // approval nobody gave it.
  if (lock.live !== undefined) {
    if (typeof lock.live?.model !== 'string' || !lock.live.model.trim()) throw new Error('voice-lock: live.model malformed');
    if (typeof lock.live.approved !== 'boolean') throw new Error('voice-lock: live.approved must be stated explicitly');
    if (lock.live.approved && lock.live.model === lock.render.model) throw new Error('voice-lock: live and render must be approved separately');
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
  };
}

/** Which voice a role may use — the role law in one function. Unknown role → the main voice,
 * because an unnamed surface is single-speaker by default; never the second voice. */
export function voiceForRole(role, lock = runtimeLock()) {
  return lock.roles[role] || lock.main;
}
