/**
 * The one Learn-contract lineage for ordinary seed words (RENKAN R4-A, P1-18).
 *
 * ## The two lineages this file collapses into one
 *
 * Until R4-A the app had two ways to bring a retrieval contract into existence,
 * and they did not share a factory, an id shape, or a validation path:
 *
 *   - the **golden route** built a `LearnContractPairSpecification` in
 *     `golden-source.ts` and dispatched `activateLearn`, so the kernel's
 *     `createLearnContractPair` validated both graders before minting either
 *     event and `learnContractIdentity` derived the ids
 *     (`contract:learn:<thread>:<spec>:v<n>:<skill>`);
 *   - **every other session** got its pair from a "compatibility" mint in
 *     `session-loop.ts` that called `createTargetContract` twice with hand-built
 *     ids (`contract-reading-<lexeme>` / `contract-meaning-<lexeme>`) — reachable
 *     validation, but a different door, a different id shape, and no pair-level
 *     check that both graders were sound before the first was minted.
 *
 * Two doors into contract creation means two places for the rules to drift.
 * This module is the closure: it builds, for any seed lexeme, the same
 * specification object the golden route builds for its one word, so the capture
 * screen's "Take it up for study", the word page's `learn` button, and the
 * session bootstrap's legacy migration all reach `createLearnContractPair`
 * through `activateLearn`'s exact shape. There is now one validated path and
 * one id derivation, and the golden route is simply the caller with the richest
 * source anchor rather than the only caller with the validated factory.
 *
 * ## The migration story for the divergent ids that already exist
 *
 * Durable logs written before R4-A can hold `contract-reading-*` /
 * `contract-meaning-*` contracts. Those events are append-only history and are
 * **kept exactly as they are**: `bootstrapSessionWorkspace` reads any existing
 * pair through the domain's lineage projection (`bindRetrievalContract`) and
 * plans over it under its original ids, so the FSRS memory state attached to
 * those ids keeps its ancestry. No schema changed, nothing is rewritten, and
 * replay over an old log is byte-for-byte what it was (ADR-002 needs no
 * amendment). Only *creation* is unified: a thread that reaches a sitting with
 * no contracts at all — promoted under the old flow and never sat with — gains
 * its pair through this specification on the sitting's first gesture, in the
 * unified shape.
 */

import type { LearnContractPairSpecification } from '@bunki/domain';

import type { ActivateLearnCommand, ThreadView } from '../state/store.ts';
import { findLexemeById, findLexemeByHeadword, type SeedLexeme } from './catalog.ts';

/**
 * Version of the pair this module derives from a seed entry. Bumping it is a
 * new immutable pair with new ids, so it moves only when the *shape* of what is
 * asked (graders, policies, prompt families) changes — not when the seed data
 * itself is corrected, which is what `specificationId`'s lexeme id pins.
 */
export const SEED_LEARN_SPECIFICATION_VERSION = 1;

/**
 * The versioned reading + meaning pair for one seed word.
 *
 * Field for field the same decisions the golden route's specification makes —
 * text cue, text response, one hint, recorded reveal — because those were never
 * about 自分; they are what a Phase-0 Learn pair is. Both answer sets are read
 * off the seed entry, never typed here: a screen may read the dataset and may
 * not assert a lexical fact of its own.
 */
export function learnSpecificationForLexeme(lexeme: SeedLexeme): LearnContractPairSpecification {
  return Object.freeze({
    specificationId: `bunki:seed:${lexeme.id}`,
    specificationVersion: SEED_LEARN_SPECIFICATION_VERSION,
    reading: Object.freeze({
      cueModality: 'text',
      responseModality: 'text',
      gradingMethod: Object.freeze({
        kind: 'accepted_answers',
        acceptedAnswers: Object.freeze([lexeme.reading]),
      }),
      hintPolicy: Object.freeze({ hintsAllowed: true, maxHints: 1 }),
      revealPolicy: Object.freeze({ revealAllowed: true, revealIsRecorded: true }),
      promptFamilyVersion: 'bunki-seed-reading@1',
    }),
    meaning: Object.freeze({
      cueModality: 'text',
      responseModality: 'text',
      gradingMethod: Object.freeze({
        kind: 'accepted_answers',
        acceptedAnswers: Object.freeze([...lexeme.senses]),
      }),
      hintPolicy: Object.freeze({ hintsAllowed: true, maxHints: 1 }),
      revealPolicy: Object.freeze({ revealAllowed: true, revealIsRecorded: true }),
      promptFamilyVersion: 'bunki-seed-meaning@1',
    }),
  });
}

/**
 * The explicit learner gesture that takes an ordinary seed word up for study.
 *
 * The same command shape `goldenLearnCommand` produces, so the store applies
 * one handler (`applyActivateLearn`) to both: promotion laddering, pair
 * validation before any mint, stable-id idempotency across reloads. `userAction`
 * is the literal `true` — this function exists to be dispatched from a press
 * handler and from nothing else.
 */
export function seedLearnCommand(threadId: string, lexeme: SeedLexeme): ActivateLearnCommand {
  return {
    kind: 'activateLearn',
    userAction: true,
    threadId,
    specification: learnSpecificationForLexeme(lexeme),
  };
}

/**
 * The seed entry a thread is about, or `null`.
 *
 * `lexemeId` is the app-local link the capture screen recorded. A thread
 * rehydrated from the durable log may have lost it (the event carries the
 * learner's text, not a dictionary row), so the headword is the fallback — an
 * exact match only, because fuzzier matching would attach a study gesture to a
 * *different* word than the one the learner kept. One function, used by the
 * session bootstrap and by every screen that offers the Learn gesture, so the
 * two cannot resolve the same thread to different words.
 */
export function seedEntryForThread(thread: ThreadView): SeedLexeme | null {
  if (thread.lexemeId !== null) {
    const byId = findLexemeById(thread.lexemeId);
    if (byId !== null) return byId;
  }
  return findLexemeByHeadword(thread.displayText);
}
