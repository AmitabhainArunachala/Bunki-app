/** Pure planning for the Mac app's tap-to-speak fallback.
 *
 * A card field that has no accepted release clip may still be spoken on demand.
 * This module resolves the exact Japanese text for the two contract fields,
 * reuses the canonical speech-input identity, and names the on-demand cache
 * entry. It performs no network, audio or storage work.
 */
import {createSpeechInput} from './speech-input.mjs';
import {voiceLine} from './voice-lines.mjs';

const CARD_GUID = /^nsrs-[a-z]-[0-9a-f]{12}$/;
const INPUT_KEY = /^[0-9a-f]{64}$/;
const VOICE = /^[A-Za-z0-9]{1,64}$/;
const ENGLISH_FIELDS = new Set([
  'en', 'meaning', 'defEn', 'passageEn', 'translation', 'english', 'exampleEn',
]);

/** Error codes the native bridge or Worker can return. */
export const SPEAK_ERRORS = new Set([
  'budget-exhausted',
  'day-budget',
  'request-rate-limit',
  'voice-unavailable',
  'voice-timeout',
  'not-in-release',
  'not-paired',
  'authentication-required',
  'invalid-response',
  'network-failed',
  'speak-failed',
  'offline',
  'update-required',
]);

const assertCardGuid = card => {
  if (card === null || typeof card !== 'object' || Array.isArray(card)) {
    throw new Error('on-demand-speech-card');
  }
  if (typeof card.guid !== 'string' || !CARD_GUID.test(card.guid)) {
    throw new Error('on-demand-speech-card-guid');
  }
  return card.guid;
};

const fieldText = (card, fieldId) => {
  if (fieldId === 'term') return card.term;
  if (fieldId === 'passage') {
    return card.passage !== null && typeof card.passage === 'object' && !Array.isArray(card.passage)
      ? card.passage.ja : undefined;
  }
  if (ENGLISH_FIELDS.has(fieldId) || /(?:^|[._-])en$/i.test(fieldId)) {
    throw new Error('on-demand-speech-japanese-only');
  }
  throw new Error('on-demand-speech-unknown-field');
};

/** Plan one Japanese field for native on-demand speech.
 *
 * `fieldId` is exactly `term` (the headword) or `passage` (the Japanese
 * passage). English and unknown fields are rejected rather than guessed.
 */
export function planOnDemandSpeech(card, fieldId, profile) {
  const cardGuid = assertCardGuid(card);
  if (typeof fieldId !== 'string' || fieldId.length === 0) {
    throw new Error('on-demand-speech-unknown-field');
  }
  const text = fieldText(card, fieldId);
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('on-demand-speech-japanese-only');
  }
  const speechInput = createSpeechInput({
    segments: [{language: 'ja', text, pronunciationDirectives: []}],
    profile,
  });
  return {cardGuid, speechInput};
}

/** Japanese and English text for a stable speak error code: the line of the cause it names, from the one vocabulary
 * (N7, voice-lines.mjs). */
export function describeSpeakError(code) {
  return voiceLine(code);
}

/** True only when an absent release clip may be replaced by on-demand speech.
 *
 * A missing clip is a coverage gap; a broken or stale release clip is an
 * integrity signal and must keep its existing failure path.
 */
export function shouldFallBackOnDemand(resolution) {
  return resolution !== null && typeof resolution === 'object' &&
    !Array.isArray(resolution) &&
    (resolution.status === 'pending' || resolution.status === 'missing-clip');
}

/** File-name-safe on-demand cache key: `<inputKey>-<voice>`. */
export function cacheKey(inputKey, voice) {
  if (typeof inputKey !== 'string' || !INPUT_KEY.test(inputKey)) {
    throw new Error('on-demand-speech-input-key');
  }
  if (typeof voice !== 'string' || !VOICE.test(voice)) {
    throw new Error('on-demand-speech-voice');
  }
  return `${inputKey}-${voice}`;
}
