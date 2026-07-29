/**
 * What a scripted learner does, as data (lane L1).
 *
 * ## Why the behaviour is a table and not a function
 *
 * Four stages have to be **different in kind**, not in count. A generator with
 * one behaviour and a `days` argument produces a Day 3 that is a Year 2 with
 * the end cut off, which demonstrates nothing: the interesting facts about a
 * learner at month 8 are that intake stopped, that everything due is easy, and
 * that four of the five capability lenses never moved — none of which is a
 * smaller number of anything.
 *
 * So a stage is a list of **phases**, each a stretch of days with its own
 * temperament, and the shape of a stage is the shape of that list. A reader can
 * see the plateau in {@link MONTH_8} without running it: two phases, the second
 * with `captureDayChance: 0.02` and a grade mix with no `again` in it.
 *
 * ## These numbers are a script, not a measurement
 *
 * Nothing here was derived from a study, a corpus, or a real learner, and
 * nothing in the app presents them as if it were (REQ-GATE-03). They are the
 * behaviour of a character in a demonstration, chosen so the resulting state
 * exercises the branches the surfaces have to be able to draw. The *events*
 * they produce are real — minted by the kernel's own factories, judged by the
 * real evidence gate, scheduled by the pinned reducer — and the reasons a
 * particular review was refused, or a particular contract went fragile, are the
 * kernel's own reasons. Only the learner is invented.
 *
 * ## The two rungs, and why production is scarce everywhere
 *
 * `SKILLS_ACTIVATED_BY_PROMOTION` is the reason the capability lenses diverge
 * without any parameter having to say so: `learn` activates reading, meaning
 * and listening contracts; `meaning_to_production` needs `master`. A learner
 * who promotes almost everything to `learn` and almost nothing to `master` has
 * a bright reading lens and a dark production lens *because of the promotion
 * ladder*, not because a number here dimmed it. That is the divergence the
 * fractal-dive document asks the surfaces to make legible, arriving through the
 * domain rule that causes it.
 */

/** The grade mix a stretch of sittings draws from. Weights, not probabilities. */
export interface GradeMix {
  readonly again: number;
  readonly hard: number;
  readonly good: number;
  readonly easy: number;
}

/**
 * One stretch of days with a single temperament.
 *
 * Every chance is per day unless the field name says otherwise. A phase runs
 * from the previous phase's end through `throughDay` inclusive.
 */
export interface ScriptPhase {
  /** Human name for the stretch. Rendered on the stage card, never computed from. */
  readonly name: string;
  /** Last day index this phase covers, counting the first day as 0. */
  readonly throughDay: number;

  // --- intake -------------------------------------------------------------
  /** Chance this is a day the learner met and kept anything at all. */
  readonly captureDayChance: number;
  readonly capturesPerDay: readonly [number, number];
  /** Chance a fresh capture is marked uncertain in the same gesture. */
  readonly uncertaintyChance: number;
  /** Chance a fresh capture is promoted to `keep` the day it arrives. */
  readonly keepChance: number;
  /**
   * Chance a kept thread is promoted to `learn` on a later day.
   *
   * Deliberately a separate, later decision: promotion is not capture (DL-05),
   * and a script that promoted in the same gesture would produce a log in which
   * the two are indistinguishable.
   */
  readonly learnChance: number;
  /** Chance a learning thread is promoted again to `master`. */
  readonly masterChance: number;
  /**
   * Chance a `learn` thread also gets a meaning contract beside its reading one.
   *
   * Below 1 on purpose. A learner who activates reading on everything and
   * meaning on most of it has a reading lens and a meaning lens that are
   * *different pictures*, which is what REQ-UI-07's five lenses are for. Set it
   * to 1 and two of the five chips draw the same map, which would make the lens
   * row look decorative when it is not.
   */
  readonly meaningContractChance: number;
  /** Chance a `learn` thread also gets a listening contract. */
  readonly listeningContractChance: number;

  // --- sittings -----------------------------------------------------------
  readonly sitDayChance: number;
  /**
   * The most this learner will review in one sitting, drawn per sitting.
   *
   * A **cap**, not a target: the sitting takes whatever the scheduler has made
   * due, up to this. That distinction is the difference between a plausible
   * completion mix and a nonsense one — a fixed count under the due rate makes
   * every sitting end `budget_exhausted` forever, which is the mirror image of
   * the "sessions recorded abandoned 16/16" defect this project has already
   * shipped once.
   */
  readonly reviewsPerSitting: readonly [number, number];
  readonly gradeMix: GradeMix;
  /** Chance a probe is revealed before recall — the reveal rule forces `again`. */
  readonly revealChance: number;
  /** Chance an `easy` is submitted without the confirmation the gate requires. */
  readonly unconfirmedEasyChance: number;
  /** Chance a sitting is left rather than finished. */
  readonly abandonChance: number;

  // --- everything that is not a review ------------------------------------
  /** Chance of a passage reading that logs exposure (tier D, never retrieval). */
  readonly exposureDayChance: number;
  /** Chance of a lookup during reading (friction, never a grade). */
  readonly lookupDayChance: number;
  /** Chance of a spontaneous production observation (tier C, never FSRS). */
  readonly productionObservedChance: number;
  /** Chance an admitted review is later corrected by the learner. */
  readonly correctionChance: number;
  /** Chance of a demotion — an item the learner decided to stop drilling. */
  readonly demotionChance: number;
  /** Chance the learner exports on this day. */
  readonly exportDayChance: number;
}

export interface DemoStageScript {
  readonly id: DemoStageId;
  /** Short name, as a surface renders it. */
  readonly label: string;
  /** The Japanese name, set beside the English wherever the stage is named. */
  readonly ja: string;
  readonly yomi: string;
  /** One sentence: what this learner's state is *like*. Never a claim of typicality. */
  readonly blurb: string;
  /** Seed for the stream. Named rather than numeric so it can be checked by eye. */
  readonly seed: string;
  /** Total days the script runs. */
  readonly days: number;
  /** How many distinct words this learner ever meets. Bounds the corpus slice. */
  readonly corpusBudget: number;
  readonly phases: readonly ScriptPhase[];
}

export const DEMO_STAGE_IDS = ['day-3', 'month-2', 'month-8', 'year-2'] as const;
export type DemoStageId = (typeof DEMO_STAGE_IDS)[number];

/**
 * The baseline temperament, so each phase below states only what it changes.
 *
 * Spreading a base is a readability decision with a cost — a phase's full value
 * is not visible at its declaration — and it is taken because the alternative
 * was four twenty-line records whose differences nobody could find. The
 * differences are what the stages *are*.
 */
const BASE: ScriptPhase = Object.freeze({
  name: 'steady',
  throughDay: 0,
  captureDayChance: 0.55,
  capturesPerDay: [1, 3] as const,
  uncertaintyChance: 0.22,
  keepChance: 0.55,
  learnChance: 0.35,
  masterChance: 0.04,
  meaningContractChance: 0.74,
  listeningContractChance: 0.12,
  sitDayChance: 0.6,
  reviewsPerSitting: [10, 26] as const,
  gradeMix: Object.freeze({ again: 6, hard: 16, good: 62, easy: 16 }),
  revealChance: 0.05,
  unconfirmedEasyChance: 0.04,
  abandonChance: 0.06,
  exposureDayChance: 0.3,
  lookupDayChance: 0.25,
  productionObservedChance: 0.05,
  correctionChance: 0.01,
  demotionChance: 0.004,
  exportDayChance: 0.01,
});

const phase = (over: Partial<ScriptPhase> & { name: string; throughDay: number }): ScriptPhase =>
  Object.freeze({ ...BASE, ...over });

/**
 * Two evenings and a morning.
 *
 * The point of this stage is that **nothing has settled**: a handful of
 * threads, one sitting, no interval longer than a day, and a map with almost
 * nothing lit on it. It is the state a real person is in when they decide
 * whether the app is worth a third evening, and it is the state every surface
 * in this build is least tested against.
 */
export const DAY_3: DemoStageScript = Object.freeze({
  id: 'day-3',
  label: 'Day 3',
  ja: '三日目',
  yomi: 'みっかめ',
  blurb:
    'Two evenings and a morning. Seven or so words met, a few kept, one sitting. Nothing has an interval yet and the map is nearly dark — which is what a real third day looks like.',
  seed: 'bunki:demo:day-3',
  days: 3,
  corpusBudget: 12,
  phases: Object.freeze([
    phase({
      name: 'the first three days',
      throughDay: 2,
      captureDayChance: 1,
      capturesPerDay: [2, 4],
      keepChance: 0.7,
      learnChance: 0.55,
      masterChance: 0,
      listeningContractChance: 0.15,
      sitDayChance: 0.65,
      reviewsPerSitting: [4, 9],
      // A beginner's mix: more misses, no confident `easy` yet.
      gradeMix: { again: 14, hard: 26, good: 58, easy: 2 },
      revealChance: 0.16,
      unconfirmedEasyChance: 0.3,
      abandonChance: 0.1,
      exposureDayChance: 0.4,
      lookupDayChance: 0.5,
      productionObservedChance: 0,
      correctionChance: 0,
      demotionChance: 0,
      exportDayChance: 0,
    }),
  ]),
});

/**
 * Two months in: the habit exists and the first cracks show.
 *
 * A few hundred contracts, the first lapses, a fragile item or two, one sitting
 * left unfinished, and a scattering of uncertainty marks. Reading runs well
 * ahead of production because production needs the `master` rung and this
 * learner has barely used it — which is what actually happens.
 */
export const MONTH_2: DemoStageScript = Object.freeze({
  id: 'month-2',
  label: 'Month 2',
  ja: '二ヶ月',
  yomi: 'にかげつ',
  blurb:
    'The habit has taken. A few hundred contracts, the first lapses, one sitting left unfinished, and reading running well ahead of production — because production needs the rung this learner has barely used.',
  seed: 'bunki:demo:month-2',
  days: 62,
  corpusBudget: 420,
  phases: Object.freeze([
    phase({
      name: 'the first fortnight',
      throughDay: 13,
      captureDayChance: 0.95,
      capturesPerDay: [3, 7],
      keepChance: 0.75,
      learnChance: 0.86,
      masterChance: 0.01,
      sitDayChance: 0.85,
      reviewsPerSitting: [12, 28],
      gradeMix: { again: 12, hard: 24, good: 58, easy: 6 },
      revealChance: 0.11,
      unconfirmedEasyChance: 0.16,
      abandonChance: 0.12,
    }),
    phase({
      name: 'settling into it',
      throughDay: 61,
      captureDayChance: 0.82,
      capturesPerDay: [2, 6],
      keepChance: 0.7,
      learnChance: 0.8,
      masterChance: 0.05,
      sitDayChance: 0.85,
      reviewsPerSitting: [22, 48],
      gradeMix: { again: 9, hard: 20, good: 60, easy: 11 },
      revealChance: 0.06,
      unconfirmedEasyChance: 0.06,
      abandonChance: 0.05,
      correctionChance: 0.02,
      demotionChance: 0.01,
      exportDayChance: 0.02,
    }),
  ]),
});

/**
 * The plateau, which is the state the operator complained about in other apps.
 *
 * Four months of real intake, then four months in which **everything due is
 * easy and nothing new enters**. The second phase's parameters are the
 * complaint, written down: `captureDayChance` near zero, a grade mix with no
 * `again` in it at all, and no promotions to `master`.
 *
 * What makes it legible rather than merely true is what the surfaces then draw:
 * the map's accumulation stops moving while its lit nodes climb into the long
 * intervals, the reading lens saturates while listening and production stay
 * where they were, and the dive shows bright words sitting on components that
 * were never contracted. A queue cannot show any of that, which is the round-2
 * research's point about why the plateau is invisible in every other tool.
 */
export const MONTH_8: DemoStageScript = Object.freeze({
  id: 'month-8',
  label: 'Month 8 — the plateau',
  ja: '停滞',
  yomi: 'ていたい',
  blurb:
    'Four months of intake, then four in which everything due is easy and nothing new enters. The queue still empties every day and the map has stopped growing — the plateau, made visible instead of felt.',
  seed: 'bunki:demo:month-8',
  days: 245,
  corpusBudget: 760,
  phases: Object.freeze([
    phase({
      name: 'the climb',
      throughDay: 34,
      captureDayChance: 0.95,
      capturesPerDay: [3, 6],
      keepChance: 0.72,
      learnChance: 0.78,
      masterChance: 0.02,
      sitDayChance: 0.85,
      reviewsPerSitting: [10, 24],
      gradeMix: { again: 12, hard: 24, good: 58, easy: 6 },
      revealChance: 0.1,
      unconfirmedEasyChance: 0.1,
      abandonChance: 0.1,
    }),
    phase({
      name: 'four good months',
      throughDay: 120,
      captureDayChance: 0.78,
      capturesPerDay: [2, 5],
      keepChance: 0.66,
      learnChance: 0.66,
      masterChance: 0.06,
      listeningContractChance: 0.1,
      sitDayChance: 0.82,
      reviewsPerSitting: [20, 46],
      gradeMix: { again: 8, hard: 19, good: 60, easy: 13 },
      revealChance: 0.05,
      unconfirmedEasyChance: 0.05,
      abandonChance: 0.05,
      correctionChance: 0.02,
      demotionChance: 0.008,
      exportDayChance: 0.02,
    }),
    phase({
      name: 'the plateau',
      throughDay: 244,
      // Intake all but stops. This one line is the plateau.
      captureDayChance: 0.05,
      capturesPerDay: [1, 1],
      uncertaintyChance: 0.05,
      keepChance: 0.35,
      learnChance: 0.08,
      masterChance: 0,
      listeningContractChance: 0,
      // The sittings continue, and they are effortless.
      sitDayChance: 0.72,
      reviewsPerSitting: [12, 30],
      gradeMix: { again: 0, hard: 4, good: 42, easy: 54 },
      revealChance: 0.01,
      unconfirmedEasyChance: 0.02,
      abandonChance: 0.03,
      exposureDayChance: 0.12,
      lookupDayChance: 0.06,
      productionObservedChance: 0.01,
      correctionChance: 0.004,
      demotionChance: 0.002,
      exportDayChance: 0.01,
    }),
  ]),
});

/**
 * Two years: deep, uneven, and with a real gap in the middle.
 *
 * The shape that distinguishes this stage is not size — it is that the learner
 * *stopped for three months and came back*. A lapsed return is where FSRS
 * actually earns its keep, and it is the only way to produce genuine decay: a
 * long tail of words met once and never again, contracts whose intervals ran
 * out while nobody was looking, and a burst of `again` on the return that opens
 * branch points the journey surface can show.
 *
 * The size is bounded deliberately and the bound is measured rather than
 * guessed — see `generate.ts` §cost. Replay is quadratic in
 * (events × contracts), so a stage twice this size does not take twice as long
 * to open; it takes four times.
 */
export const YEAR_2: DemoStageScript = Object.freeze({
  id: 'year-2',
  label: 'Year 2',
  ja: '二年目',
  yomi: 'にねんめ',
  blurb:
    'Two years, including three months away and the return. Thousands of encounters, a long tail met once and never again, real decay, branch points opened by misses, and corrections in the ledger.',
  seed: 'bunki:demo:year-2',
  days: 730,
  corpusBudget: 1250,
  phases: Object.freeze([
    phase({
      name: 'year one, the climb',
      throughDay: 60,
      captureDayChance: 0.92,
      capturesPerDay: [2, 6],
      keepChance: 0.62,
      learnChance: 0.4,
      masterChance: 0.02,
      sitDayChance: 0.82,
      reviewsPerSitting: [8, 18],
      gradeMix: { again: 12, hard: 24, good: 58, easy: 6 },
      revealChance: 0.1,
      unconfirmedEasyChance: 0.09,
      abandonChance: 0.09,
    }),
    phase({
      name: 'year one, in the swing of it',
      throughDay: 200,
      captureDayChance: 0.7,
      capturesPerDay: [1, 5],
      keepChance: 0.55,
      learnChance: 0.3,
      masterChance: 0.07,
      sitDayChance: 0.72,
      reviewsPerSitting: [18, 44],
      gradeMix: { again: 8, hard: 19, good: 60, easy: 13 },
      revealChance: 0.05,
      unconfirmedEasyChance: 0.05,
      abandonChance: 0.05,
      correctionChance: 0.02,
      demotionChance: 0.006,
      exportDayChance: 0.02,
    }),
    phase({
      name: 'the first plateau',
      throughDay: 300,
      captureDayChance: 0.18,
      capturesPerDay: [1, 2],
      keepChance: 0.4,
      learnChance: 0.12,
      masterChance: 0,
      sitDayChance: 0.7,
      reviewsPerSitting: [14, 34],
      gradeMix: { again: 1, hard: 7, good: 46, easy: 46 },
      revealChance: 0.02,
      abandonChance: 0.04,
      exposureDayChance: 0.14,
      lookupDayChance: 0.08,
    }),
    phase({
      name: 'three months away',
      throughDay: 392,
      // Not zero. A learner who has drifted still reads occasionally, and an
      // exposure that reaches no scheduler is exactly what that looks like in
      // the ledger (T-08).
      captureDayChance: 0.03,
      capturesPerDay: [1, 1],
      keepChance: 0.2,
      learnChance: 0,
      masterChance: 0,
      listeningContractChance: 0,
      sitDayChance: 0.02,
      reviewsPerSitting: [2, 5],
      gradeMix: { again: 30, hard: 30, good: 38, easy: 2 },
      revealChance: 0.2,
      abandonChance: 0.4,
      exposureDayChance: 0.08,
      lookupDayChance: 0.06,
      productionObservedChance: 0.01,
      correctionChance: 0,
      demotionChance: 0,
      exportDayChance: 0,
    }),
    phase({
      name: 'the return',
      throughDay: 470,
      captureDayChance: 0.5,
      capturesPerDay: [1, 3],
      keepChance: 0.6,
      learnChance: 0.24,
      masterChance: 0.03,
      sitDayChance: 0.84,
      reviewsPerSitting: [22, 50],
      // Everything that ran out while they were away comes back at once.
      gradeMix: { again: 26, hard: 30, good: 40, easy: 4 },
      revealChance: 0.12,
      unconfirmedEasyChance: 0.06,
      abandonChance: 0.14,
      correctionChance: 0.04,
      demotionChance: 0.02,
      exportDayChance: 0.02,
    }),
    phase({
      name: 'year two, steadier',
      throughDay: 729,
      captureDayChance: 0.55,
      capturesPerDay: [1, 4],
      keepChance: 0.55,
      learnChance: 0.24,
      masterChance: 0.09,
      listeningContractChance: 0.14,
      sitDayChance: 0.72,
      reviewsPerSitting: [18, 44],
      gradeMix: { again: 7, hard: 18, good: 58, easy: 17 },
      revealChance: 0.04,
      unconfirmedEasyChance: 0.04,
      abandonChance: 0.05,
      correctionChance: 0.015,
      demotionChance: 0.008,
      exportDayChance: 0.015,
    }),
  ]),
});

export const DEMO_STAGES: readonly DemoStageScript[] = Object.freeze([
  DAY_3,
  MONTH_2,
  MONTH_8,
  YEAR_2,
]);

export function demoStageById(id: string): DemoStageScript | null {
  return DEMO_STAGES.find((stage) => stage.id === id) ?? null;
}

/** The phase covering a day index, or the last one for a day past the end. */
export function phaseForDay(script: DemoStageScript, day: number): ScriptPhase {
  for (const candidate of script.phases) {
    if (day <= candidate.throughDay) return candidate;
  }
  const last = script.phases[script.phases.length - 1];
  if (last === undefined) {
    throw new RangeError(`demo stage ${script.id} declares no phases`);
  }
  return last;
}
