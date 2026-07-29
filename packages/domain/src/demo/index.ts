/**
 * `src/demo/` — the scripted learner (lane L1).
 *
 * A pure, deterministic, seeded generator that drives this kernel's own command
 * path to produce a populated learner state. Nothing here is a fixture: every
 * event is minted by `src/events/factories.ts` or by `src/evidence/mint.ts`,
 * judged by `src/evidence/gate.ts`, and scheduled by
 * `src/reducers/memory-state.ts`. The resulting log replays, exports, and
 * verifies exactly like a log a person produced, because it went through the
 * same code.
 *
 * It lives in the kernel rather than in the app for the same reason
 * `src/context/deterministic.ts` does: it has to be usable from every runtime
 * that has to show a populated state — the web app, a test, a screenshot
 * harness — and a copy per runtime would be a copy per runtime of the thing
 * that is supposed to be one behaviour.
 *
 * It reads no dictionary. `@bunki/domain` may not import `@bunki/seed`
 * (ADR-001 boundary 1) and should not want to: the corpus is an argument, so
 * the caller decides which real entries the scripted learner met, and the
 * kernel never asserts a lexical fact.
 */

export * from './calendar.ts';
export * from './rng.ts';
export * from './script.ts';
export * from './generate.ts';
