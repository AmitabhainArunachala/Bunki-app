/**
 * T4 — truth-label and forbidden-claim audit (REQ-GATE-03, controller §20;
 * definition-of-done §2 items 3, 6 and 7).
 *
 * Two questions, asked of the *shipped bundle* rather than of the source:
 *
 *   1. **Does anything the app can say cross the claim boundary?** Controller
 *      §20 forbids "reduced review burden", comprehension percentages, a global
 *      level, "scientifically optimized", and citing FSRS as efficacy. The grep
 *      runs over `apps/app/dist` — every JS chunk and every pre-rendered page —
 *      because a string that never reaches the bundle cannot be said, and a
 *      string that reaches it can, whether or not any test happened to render
 *      the screen holding it.
 *
 *   2. **Is generated or unreviewed content labelled wherever it renders?** The
 *      seed disclosure on the surfaces that could pass for a dictionary; the
 *      candidate labels on every candidate; and — the case a screen-level check
 *      misses — no candidate reaching the durable log without its provider.
 *
 * ## Why the grep is over `dist` and not over `src`
 *
 * A source grep tests the repository. This tests the artefact. They differ
 * exactly when it matters: a phrase introduced by a dependency, a bundler
 * transform, or a file nobody remembered is in the shipped product and absent
 * from a naive source scan.
 *
 * ## Why the forbidden list is patterns rather than words
 *
 * "Level" is a legitimate English word and "N3" is a legitimate string; the
 * claim is not the token but the assertion. Each pattern below is written to
 * match the *claim* and is accompanied by the reason it is forbidden, so a
 * reader can tell a false positive from a real finding without guessing.
 */

import { readFileSync } from 'node:fs';

import {
  expect,
  test,
  openApp,
  keepWord,
  candidateEvents,
  exportFiles,
  visibleTestId,
} from './support/adv-harness.ts';

/**
 * A claim the build may not make, and why.
 *
 * Sourced from the definition of done's forbidden list and controller §20. The
 * `why` is not decoration: a future reader deciding whether a match is a false
 * positive needs the reason, not just the regex.
 */
interface ForbiddenClaim {
  readonly id: string;
  readonly pattern: RegExp;
  readonly why: string;
}

const FORBIDDEN_CLAIMS: readonly ForbiddenClaim[] = [
  {
    id: 'scientifically-optimized',
    pattern: /scientifical(ly)?[\s-]*optimi[sz]/i,
    why: 'Controller §20: no "scientifically optimized". H1 is untested; nothing here is optimised against a measured outcome.',
  },
  {
    id: 'you-will-understand',
    pattern: /you\s+will\s+(understand|remember|know|master|be\s+able\s+to\s+read)/i,
    why: 'A promise about a future cognitive state. Phase 0 measures desire to continue (H2) and nothing else.',
  },
  {
    id: 'reduced-review-burden',
    pattern:
      /(reduc\w*|less|lower\w*|cut\w*|fewer)\s+(your\s+)?(review|study|revision)\s+(burden|load|time|workload)/i,
    why: 'Controller §20 names this exactly: H4 is untested, so no burden claim may be made.',
  },
  {
    id: 'mastery-percentage',
    pattern:
      /\d{1,3}\s*%\s*(of\s+)?(mastery|mastered|comprehension|understood|understanding|known|retention|recall)/i,
    why: 'Controller §20: no comprehension percentages. The app has no measurement that could produce one.',
  },
  {
    id: 'comprehension-percentage-prose',
    pattern: /(comprehension|retention|mastery)\s+(rate|score|percentage|level)\s*[:=]/i,
    why: 'Same boundary, stated as a labelled figure rather than a percent sign.',
  },
  {
    id: 'global-level',
    pattern: /\b(your|overall|global|current)\s+(japanese\s+)?(level|proficiency)\s+(is|:)/i,
    why: 'Controller §20: no global level. The domain models per-component evidence and deliberately never aggregates it into one number.',
  },
  {
    id: 'jlpt-level-claim',
    // The *level*, not the acronym. The app legitimately says it has no
    // JLPT/Kanken mappings because they need a licensed source — an honest
    // statement of absence, and the first version of this pattern flagged it.
    // A rule that punishes a build for disclosing a gap teaches the build to
    // stop disclosing, which is the opposite of what REQ-GATE-03 wants.
    pattern:
      /\bJLPT[\s:–—-]*N\s?[1-5]\b|\bN[1-5]\s+(level|word|kanji|grammar|vocabulary)\b|\b日本語能力試験[\s:]*N?[1-5]/i,
    why: 'A JLPT level is a claim about a standardised examination this build has never measured against, and the seed carries no JLPT metadata.',
  },
  {
    id: 'fsrs-as-efficacy',
    pattern:
      /(fsrs|spaced\s+repetition)[^.]{0,80}(proven|scientifically|guarantee|ensures?\s+you|optimal\s+for\s+you)/i,
    why: 'Controller §20: FSRS presence is never cited as product efficacy.',
  },
  {
    id: 'ai-grade-as-fact',
    pattern: /\bAI\s+(says|confirms|verified|determined)\s+(you|that\s+you)\b/i,
    why: 'REQ-ARCH-04: AI output is a candidate. It never becomes a statement about what the learner knows.',
  },
];

/**
 * Files whose text the shipped app can put on a screen.
 *
 * Source maps are excluded: they contain the original sources verbatim, so
 * grepping them would report every comment in this repository — including the
 * forbidden phrases quoted *in order to forbid them*, in this very file.
 * `.map` files are also never parsed by the app; they exist for a debugger.
 */
function shippedText(distDir: string): { file: string; text: string }[] {
  return exportFiles(distDir)
    .filter((file) => /\.(js|html|json|css)$/.test(file) && !file.endsWith('.map'))
    .map((file) => ({ file: file.slice(distDir.length + 1), text: readFileSync(file, 'utf8') }));
}

/** A little context around a match, so a failure is readable without a debugger. */
function excerpt(text: string, index: number): string {
  return text
    .slice(Math.max(0, index - 90), index + 110)
    .replace(/\s+/g, ' ')
    .trim();
}

test('claims: the shipped bundle makes none of the forbidden claims', async ({ app }) => {
  const files = shippedText(app.distDir);
  expect(files.length, 'no shipped text was scanned, so this check proved nothing').toBeGreaterThan(
    0,
  );

  const hits: string[] = [];
  for (const { file, text } of files) {
    for (const claim of FORBIDDEN_CLAIMS) {
      const match = claim.pattern.exec(text);
      if (match !== null) {
        hits.push(
          `${claim.id} in ${file}\n    why forbidden: ${claim.why}\n    …${excerpt(text, match.index)}…`,
        );
      }
    }
  }

  expect(hits, `REQ-GATE-03 forbidden claims in the shipped bundle:\n${hits.join('\n')}`).toEqual(
    [],
  );
});

test('claims: the audit itself can fail — every pattern matches its own example', async ({
  app,
}) => {
  // A grep suite is worthless if the patterns silently stopped matching. Each
  // example is a sentence the build must never contain, checked against the
  // pattern meant to catch it, so a broken regex fails here rather than passing
  // the audit above by matching nothing.
  const examples: Readonly<Record<string, string>> = {
    'scientifically-optimized': 'A scientifically optimized review schedule.',
    'you-will-understand': 'After this session you will understand every branch.',
    'reduced-review-burden': 'Bunki reduces your review burden by half.',
    'mastery-percentage': 'You are at 82% mastery of this word.',
    'comprehension-percentage-prose': 'Comprehension rate: high.',
    'global-level': 'Your Japanese level is upper intermediate.',
    'jlpt-level-claim': 'This word is JLPT N3.',
    'fsrs-as-efficacy': 'FSRS scheduling is scientifically proven to work for you.',
    'ai-grade-as-fact': 'The AI confirms you know this reading.',
  };

  expect(Object.keys(examples).sort()).toEqual(FORBIDDEN_CLAIMS.map((c) => c.id).sort());
  for (const claim of FORBIDDEN_CLAIMS) {
    expect(
      claim.pattern.test(examples[claim.id] as string),
      `the pattern for ${claim.id} no longer matches the claim it exists to catch`,
    ).toBe(true);
  }

  // The other half of a usable grep: sentences the app *should* be free to say.
  // The first version of the JLPT pattern flagged the app for disclosing that it
  // has no JLPT data — a rule that punishes a build for naming a gap teaches the
  // build to stop naming gaps, which inverts REQ-GATE-03. These are the honest
  // sentences that must keep passing.
  const mustPass = [
    'Full character-database fields, school grade, frequency and JLPT/Kanken mappings need a licensed source.',
    'This is a Phase-0 seed dataset, not a complete dictionary.',
    'Readings and senses in this seed are representative, not exhaustive, and are not verified against a published dictionary.',
    'This checks the export, not durability or storage.',
    'Nothing here changes what the app has stored until you accept it as a note.',
    'The scheduler is FSRS with pinned parameters; its presence is not evidence that this app works.',
    'Your level of certainty is yours to mark; the app records the mark, not a judgement.',
  ];
  for (const sentence of mustPass) {
    for (const claim of FORBIDDEN_CLAIMS) {
      expect(
        claim.pattern.test(sentence),
        `${claim.id} flags an honest sentence the app must stay free to say:\n    ${sentence}`,
      ).toBe(false);
    }
  }

  // And the shipped bundle really is where the other test looked.
  expect(exportFiles(app.distDir).length).toBeGreaterThan(0);
});

/* ------------------------------------------------------------------ *
 * Truth labels, where generated or unreviewed content renders
 * ------------------------------------------------------------------ */

/** Verbatim from `@bunki/seed` and `@bunki/ai` — the packages that own the wording. */
const SEED_ENTRY_DISCLOSURE =
  'Readings and senses in this seed are representative, not exhaustive, and are not verified against a published dictionary.';
const SEED_COVERAGE_DISCLOSURE = 'This is a Phase-0 seed dataset, not a complete dictionary.';
const CANDIDATE_LABEL = 'AI candidate / generated';
const OFFLINE_FALLBACK_LABEL = 'offline-fallback';

test('labels: the seed entry disclosure is on every surface that could pass for a dictionary', async ({
  page,
  app,
}) => {
  for (const route of [
    '/word/lex-bunki',
    '/word/lex-wakareru',
    `/kanji/${encodeURIComponent('岐')}`,
  ]) {
    await openApp(page, app.origin, route);
    const disclosure = visibleTestId(page, 'seed-entry-disclosure');
    await expect(disclosure, `${route} renders seed data with no entry disclosure`).toBeVisible();
    await expect(disclosure).toHaveText(SEED_ENTRY_DISCLOSURE);
  }
});

test('labels: an unmatched search says the seed is not a dictionary', async ({ page, app }) => {
  await openApp(page, app.origin);
  await visibleTestId(page, 'capture-search-input').fill('ざぶんぶんきき');
  const coverage = visibleTestId(page, 'seed-coverage-disclosure');
  await expect(coverage).toBeVisible();
  await expect(coverage).toHaveText(SEED_COVERAGE_DISCLOSURE);
});

test('labels: a candidate cannot render without its label, and cannot reach the log without its provider', async ({
  page,
  app,
}) => {
  await openApp(page, app.origin);
  await keepWord(page, '分岐');
  await visibleTestId(page, 'capture-open-word').click();
  await expect(visibleTestId(page, 'screen-word')).toBeVisible();

  // Before: the panel says what asking sends, so the learner knows before they
  // press rather than after (REQ-AI-03, OD-08).
  await expect(visibleTestId(page, 'word-candidate-panel')).toContainText('never your own text');

  await visibleTestId(page, 'candidate-request').click();
  await expect(visibleTestId(page, 'candidate-card')).toBeVisible();

  // On screen: both badges, as text.
  await expect(visibleTestId(page, 'candidate-label')).toHaveText(CANDIDATE_LABEL);
  await expect(visibleTestId(page, 'candidate-fallback-label')).toHaveText(OFFLINE_FALLBACK_LABEL);

  // In the record: the provider travels with the event, so the evidence
  // inspector and any export say the same thing the screen said. This is the
  // half a screen-level assertion cannot reach.
  const attached = await candidateEvents(page);
  expect(attached.length, 'asking for a note wrote no CandidateAttached event').toBeGreaterThan(0);
  for (const event of attached) {
    expect(event.envelope.provider).toBe(OFFLINE_FALLBACK_LABEL);
    expect(
      event.status,
      'a candidate entered the log already accepted, with no user action behind it (§2 item 6)',
    ).toBe('generated');
  }

  // Accepting is one press and changes only the status — it never removes the label.
  await visibleTestId(page, 'candidate-accept').click();
  await expect(visibleTestId(page, 'candidate-label')).toHaveText(CANDIDATE_LABEL);
  await expect(visibleTestId(page, 'candidate-status')).toContainText(
    'stays labelled as generated',
  );
});

test('labels: the capture acknowledgment states its own durability rather than implying it', async ({
  page,
  app,
}) => {
  // Definition-of-done §2 item 7 and P0-CAP-15: a bare "Saved" would be read as
  // a durability guarantee. The notice has to be present and has to say which
  // store made the promise.
  await openApp(page, app.origin);
  await keepWord(page, '分岐');
  const notice = visibleTestId(page, 'durability-notice');
  await expect(notice).toBeVisible();
  expect((await notice.innerText()).trim().length).toBeGreaterThan(0);
});

test('labels: the export badge qualifies what it checked', async ({ page, app }) => {
  // "Verified" unqualified would be a claim about durability and about future
  // schema versions, neither of which a replay check establishes.
  await openApp(page, app.origin);
  await keepWord(page, '分岐');
  await visibleTestId(page, 'nav-evidence').click();
  await visibleTestId(page, 'evidence-export-button').click();
  const badge = visibleTestId(page, 'evidence-export-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toContainText('This checks the export, not durability or storage.');
});
