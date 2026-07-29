/**
 * The demonstration strip's words (lane L1).
 *
 * Copy as data, in a module with no platform import, for one practical reason
 * and one that matters more.
 *
 * The practical one: this repository installs no React Native test renderer and
 * the unit suite runs in plain Node, so a test that wanted to assert on these
 * sentences could not import them from a component. It would have to re-type
 * them, and a copy of a sentence is a sentence that goes stale.
 *
 * The one that matters more: **these sentences are the labelling requirement.**
 * "Not your history" and "never survives a reload" are not decoration. They are
 * what stops a demonstration from being mistaken for the operator's own data,
 * which is the failure mode the whole surface exists to guard against. Putting
 * them where a test can read them is what makes a refactor that softened them
 * fail rather than ship.
 */

/** The strip's own words for the quiet state. Rendered, never inferred. */
export const OWN_DATA_LABEL = 'Your own data';

export const OWN_DATA_NOTE =
  'Everything on screen is what you have captured and studied on this device. Nothing is simulated.';

/**
 * Said in the loaded state, every time, in addition to the stage's name.
 *
 * Short enough to sit on one line at phone width. The full sentence — what is
 * real about the events and what is not — is `SCRIPTED_LEARNER_NOTE` in
 * `@bunki/domain`, kept beside the generator so the wording and the behaviour
 * cannot drift; it is rendered inside the panel a tap away rather than
 * compressed into the strip, because a strip nobody can read is not a label.
 */
export const DEMONSTRATION_LABEL = 'Demonstration data — not your history';

/** What a reload does, said in the panel so it is never a surprise. */
export const RELOAD_NOTE =
  'A demonstration is never written to this device and never survives a reload: refreshing this page puts you back in your own data. Nothing you do inside one can reach what you have captured yourself.';

/** While a stage is being generated. The operator's own data is still in use. */
export const BUILDING_LABEL = 'Building a demonstration learner…';

/** When a stage will not build. Says whose data is still intact. */
export const FAILED_LABEL = 'That demonstration could not be built.';
