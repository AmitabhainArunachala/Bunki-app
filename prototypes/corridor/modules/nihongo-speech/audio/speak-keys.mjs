/** The single source of truth for what a card says aloud.
 *
 * Deliberately pure and runtime-neutral: no DOM, network, storage or provider
 * work. Only Japanese card fields are exposed; English translations, meanings
 * and notes never become speech inputs.
 */
import {createSpeechInput} from './speech-input.mjs';

const speakable = value => typeof value === 'string' && /\S/u.test(value) ? value : undefined;

/** Bind one Japanese card field to the on-demand speech identity. */
export function speechInputFor(text, profile) {
  return createSpeechInput({segments: [{language: 'ja', text, pronunciationDirectives: []}], profile});
}

/** Return the Japanese fields a card may speak, omitting missing/empty ones. */
export function cardSpeakTexts(card) {
  const term = speakable(card?.term);
  const passage = speakable(card?.passage?.ja);
  const texts = {};
  if (term !== undefined) texts.term = term;
  if (passage !== undefined) texts.passage = passage;
  return texts;
}

/** The one approved provider profile.
 *
 * The Worker accepts a speak only when its profile is canonically equal to
 * this record, and picks the card's voice itself from its roster by
 * sha256(cardGuid). The client never chooses a voice.
 */
export const SPEAK_PROFILE = Object.freeze({
  providerRoute: 'fal',
  model: 'elevenlabs/tts/eleven-v4',
  voice: 'EGPLqH9Wz2tNLu58EJVR',
  settings: Object.freeze({ language_code: 'ja' }),
});

/** Every card, including null, speaks under the one approved profile. */
export function cardVoiceProfile(card) {
  return SPEAK_PROFILE;
}

/** The full Japanese passage a card speaker should read, never its headword.
 *
 * Vocabulary cards speak their complete `ja` passage. Grammar cards speak the
 * example named by their passage id. Cards with no matching speakable passage
 * return null rather than falling back to `term`.
 */
export function cardSpeakTarget(entry) {
  if (entry === null || typeof entry !== 'object') return null;
  if (typeof entry.contractId === 'string' && entry.contractId.startsWith('grammar.')) {
    const examples = entry.grammarRecord?.examples;
    if (!Array.isArray(examples)) return null;
    const passageId = entry.passageId ?? entry.grammarTask?.passageId;
    if (passageId === undefined || passageId === null) return null;
    const index = examples.findIndex(example => example?.exampleId === passageId);
    if (index < 0) return null;
    const text = speakable(examples[index]?.ja);
    return text === undefined ? null : { field: `examples[${index}].ja`, text };
  }
  const text = speakable(entry.ja);
  return text === undefined ? null : { field: 'passage', text };
}

/** Tonight's production allowlist: ordinary vocabulary passages only.
 *
 * Grammar examples and factory-generated vocabulary cards wait for the
 * Worker's dynamic mode, so they stay ineligible even though `cardSpeakTarget`
 * still names their passage for tomorrow.
 */
export function cardSpeakEligible(entry) {
  const target = cardSpeakTarget(entry);
  return target?.field === 'passage' && entry.factoryGenerated !== true ? target : null;
}

/** The frozen speak plan for an eligible card, or null when it may not speak. */
export function cardSpeakInput(entry) {
  const target = cardSpeakEligible(entry);
  if (target === null) return null;
  return Object.freeze({field: target.field, text: target.text, speechInput: speechInputFor(target.text, cardVoiceProfile(entry))});
}
