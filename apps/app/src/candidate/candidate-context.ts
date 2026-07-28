/**
 * Choosing what a candidate request is allowed to say (WP-07; OD-08,
 * REQ-ARCH-07).
 *
 * Two pure functions, both about the same rule: **in Phase 0 only seeded
 * fixture content may reach the AI provider.**
 *
 * `seededContextFor` picks the one seeded sentence that contains a word and
 * builds the minimal context from it — the form, the sentence, and the seed
 * record's id. It returns `null` when the seed has no sentence containing the
 * form, and returning null is the point: the alternative is asking about a word
 * with the learner's own surrounding text, which is exactly what OD-08's
 * default forbids. A word we cannot ask about honestly is a word we do not ask
 * about.
 *
 * `seededContentPolicy` builds the allowlist the runtime enforces, from the
 * dataset rather than from a list somebody maintains. Adding a seed sentence
 * widens what may be sent; nothing else does.
 *
 * Neither function knows about React, the store, or the network. The screens
 * consume them; `test/candidate-context.test.ts` drives them directly.
 */

import { createSeededFixturePolicy, type AiContentPolicy, type AiThreadContext } from '@bunki/ai';

import {
  passageForLexeme,
  seedDataset,
  sentencesForLexeme,
  type SeedLexeme,
} from '../data/catalog.ts';

const fold = (text: string): string => text.trim().normalize('NFKC');

/**
 * Split a passage into sentences.
 *
 * Japanese full stop, keeping the delimiter, because an excerpt that ends
 * mid-clause reads as a transcription error and gives the model less to work
 * with than the sentence it came from.
 */
export function passageSentences(body: string): readonly string[] {
  return body
    .split(/(?<=。)/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * The minimal context for one seeded word, or `null`.
 *
 * Sentence first, passage second: a seed sentence is short and was written to
 * show one construction, which is more useful context than a line lifted out of
 * a longer narrative.
 */
export function seededContextFor(lexeme: SeedLexeme): AiThreadContext | null {
  const form = lexeme.headword;

  for (const sentence of sentencesForLexeme(lexeme.id)) {
    if (fold(sentence.japanese).includes(fold(form))) {
      return {
        contentClass: 'seeded-fixture',
        targetForm: form,
        excerpt: sentence.japanese,
        seedRef: sentence.id,
      };
    }
  }

  const passage = passageForLexeme(lexeme.id);
  if (passage !== null) {
    const line = passageSentences(passage.body).find((part) => fold(part).includes(fold(form)));
    if (line !== undefined) {
      return {
        contentClass: 'seeded-fixture',
        targetForm: form,
        excerpt: line,
        seedRef: passage.id,
      };
    }
  }

  return null;
}

/** Why a word cannot be asked about, in the words a screen should render. */
export const NO_SEEDED_CONTEXT_NOTE =
  'No seed sentence contains this word, so there is nothing to ask about. In this phase the app sends only seeded example text to the AI provider — never your own encounters.';

/**
 * The allowlist, derived from the dataset.
 *
 * Forms: every seed headword and every seed kanji character. Excerpts: every
 * seed sentence, plus every sentence of the integration passage. Nothing here
 * is hand-listed, so the policy cannot fall behind the data — and it cannot
 * quietly widen either, because widening it means adding seed records.
 */
export function seededContentPolicy(): AiContentPolicy {
  const targetForms = [
    ...seedDataset.lexemes.map((lexeme) => lexeme.headword),
    ...seedDataset.kanji.map((kanji) => kanji.character),
  ];
  const excerpts = [
    ...seedDataset.sentences.map((sentence) => sentence.japanese),
    ...seedDataset.passages.flatMap((passage) => passageSentences(passage.body)),
  ];

  return createSeededFixturePolicy({
    targetForms,
    excerpts,
    name: 'seeded-fixture-allowlist(@bunki/seed)',
  });
}
