/**
 * The words the UI must use for AI output (WP-07; controller §9, T-12).
 *
 * They live in this package, not in a screen, for the same reason the seed's
 * disclosure strings live in `@bunki/seed`: the package that knows what a thing
 * *is* should be the package that words it. A screen that retyped
 * "AI candidate" could drift into "AI explanation" in one refactor, and the
 * difference between those two phrasings is the whole claim.
 *
 * `test/labels.test.ts` and `apps/app/test/candidate-labeling.test.ts` assert
 * that the app renders these constants rather than literals of its own.
 */

/** The visible label on every candidate, live or fallback (controller §9, T-12). */
export const CANDIDATE_LABEL = 'AI candidate / generated';

/**
 * The additional label a fixture-served candidate carries (T-10, T-11).
 *
 * It is a *second* label, never a replacement: a fallback is still generated
 * content and still labelled as such. Presenting a scripted fixture as a live
 * candidate is explicitly forbidden (controller WP-12 trial rule), and this is
 * the string that prevents it.
 */
export const OFFLINE_FALLBACK_LABEL = 'offline-fallback';

/**
 * `provider` on a fallback envelope.
 *
 * Deliberately equal to the label. Controller §9 fixes the response envelope's
 * field set, so there is no room for an extra `origin` field — and there does
 * not need to be one: "which provider produced this" already answers "was this
 * live", it flows unchanged into `CandidateAttached.envelope.provider`, and the
 * evidence inspector therefore shows fallback use without any new schema.
 */
export const OFFLINE_FALLBACK_PROVIDER = OFFLINE_FALLBACK_LABEL;

/** One sentence a screen can render under the label, explaining what it means. */
export const CANDIDATE_STANDING_NOTE =
  'Generated text. It is a suggestion to read, not a checked fact and not part of your record — nothing here changes what the app has stored until you accept it as a note.';

/** The same, for a fixture-served candidate. */
export const OFFLINE_FALLBACK_STANDING_NOTE =
  'This came from a small set of pre-written fixtures in the app, not from a live model — the AI route was unavailable or timed out.';

/** What accepting does, stated before the learner taps it (controller §9). */
export const CANDIDATE_ACCEPT_NOTE =
  'Accepting keeps this text as your own note on the thread. It stays labelled as generated, and it never becomes a reading, a meaning, or a record of what you know.';
