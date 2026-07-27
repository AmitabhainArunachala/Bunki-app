/**
 * The scripted fallback candidates (WP-07; controller §9, T-10, T-11).
 *
 * When the provider cannot be reached — no key, offline, a ten-second timeout,
 * a malformed answer — the bounded AI path still has to produce something,
 * because the requirement is not "AI usually works" but "capture, lookup,
 * review and export work with AI unavailable" (T-10) and "a timed-out call
 * neither loses nor blocks capture" (T-11). Silence would satisfy neither: a
 * panel that renders nothing is indistinguishable from one that is still
 * waiting, and a learner cannot tell an unavailable route from a broken app.
 *
 * ## What these are and are not
 *
 * They are **hand-written by this project**, exactly like the seed's example
 * sentences and its integration passage. They are not cached model output, and
 * nothing here was generated. They cover the default canonical fixture 分岐
 * (OD-02) and the seed words around it, so the Phase-0 loop can be walked
 * end-to-end with the network switched off.
 *
 * They are served **labelled twice**: as a candidate (`AI candidate /
 * generated`) and as a fallback (`offline-fallback`, carried in the envelope's
 * `provider` field and therefore into `CandidateAttached` and the export).
 * Presenting one as a live candidate is forbidden — controller WP-12 states it
 * for the operator trial, and it holds everywhere else for the same reason.
 *
 * ## Why the text is careful
 *
 * Every string here renders in the product, so REQ-GATE-03 binds it: no claim
 * about what the learner knows, no completeness claim, no etymology
 * (REQ-SRC-05), no number nobody measured. Each explanation contains its own
 * target form, so the deterministic `targetFormPresent` check passes for the
 * same reason it would pass on a good live answer rather than by exemption.
 */

/**
 * Excerpts are quoted verbatim from `@bunki/seed` records, and `seedRef` names
 * the record. The duplication is deliberate: this package must serve a fallback
 * on a runtime where nothing else loaded, so it cannot depend on the seed
 * package being reachable — and a fixture whose excerpt had drifted from the
 * seed would be a fixture for a sentence the app never shows.
 * `test/fallback.test.ts` pins the seed references so the drift is visible.
 */
export interface FallbackCandidateFixture {
  /** The written form this fixture answers for. Matched NFKC-folded. */
  readonly targetForm: string;
  /** The seeded excerpt the fixture was written against. */
  readonly excerpt: string;
  /** The `@bunki/seed` record id the excerpt comes from. */
  readonly seedRef: string;
  /** The candidate text. Hand-written; contains `targetForm`. */
  readonly explanation: string;
}

export const FALLBACK_FIXTURES: readonly FallbackCandidateFixture[] = [
  {
    targetForm: '分岐',
    excerpt: '子どものころ、私はこの分岐点が好きだった。',
    seedRef: 'pas-bunki-01',
    explanation:
      '分岐 is the noun for a split into two or more branches — a line, a road, a pipe, or a process that divides and continues as separate paths. It is the word for the division itself rather than the place it happens; 分岐点 in the sentence adds 点 to name that place. Elsewhere the passage says 分かれる, which describes the same event as a verb, where 分岐 is how a timetable or a map would label it. It also works as a する-verb: 線路が分岐する.',
  },
  {
    targetForm: '分岐点',
    excerpt: '分岐点まで来て、右の道を行くことにした。',
    seedRef: 'sen-02',
    explanation:
      '分岐点 is the point where something divides: a junction, a fork, the place a line or road splits. 点 makes it a location rather than the event, so 分岐点まで来て means arriving at the fork itself. Outside physical roads it is also used for a turning point in a plan or a life, in much the same way English uses "a fork in the road".',
  },
  {
    targetForm: '岐路',
    excerpt: '岐路に立ったときは、自分で決めるしかない。',
    seedRef: 'sen-03',
    explanation:
      '岐路 is a forked road, and in ordinary use it is nearly always the figurative one: 岐路に立つ, to stand at a crossroads, is said about a decision rather than about walking. It is more literary than 分岐点 and is not the word a road sign would use. The sentence uses it that way — standing at a crossroads, there is nobody but yourself to decide.',
  },
  {
    targetForm: '分かれる',
    excerpt: '線路はこの先で二つに分かれる。',
    seedRef: 'sen-01',
    explanation:
      '分かれる is intransitive: the thing itself divides, and no one is named as doing it. 線路が二つに分かれる is a line that forks; 線路を二つに分ける would be someone dividing it. The 〜に marks what it ends up as — a count of parts (二つに) or named branches. It is written with the same 分 as 分岐, and the two are used of the same event from different angles.',
  },
];

const fold = (text: string): string => text.trim().normalize('NFKC');

/**
 * The fixture for a target form, or `null`.
 *
 * Matching is on the form alone, not on the excerpt: a learner may meet 分岐 in
 * a different seeded sentence, and refusing to answer because the surrounding
 * text differs would make the fallback useless exactly when it is needed.
 */
export function fallbackFixtureFor(targetForm: string): FallbackCandidateFixture | null {
  const wanted = fold(targetForm);
  return FALLBACK_FIXTURES.find((fixture) => fold(fixture.targetForm) === wanted) ?? null;
}

/** Every form the scripted fallback can answer for. */
export const FALLBACK_TARGET_FORMS: readonly string[] = FALLBACK_FIXTURES.map(
  (fixture) => fixture.targetForm,
);

/** Every excerpt the fixtures were written against — the default OD-08 allowlist. */
export const FALLBACK_EXCERPTS: readonly string[] = FALLBACK_FIXTURES.map(
  (fixture) => fixture.excerpt,
);
