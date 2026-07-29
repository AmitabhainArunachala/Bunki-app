/**
 * Loading a stage, and keeping it away from the operator's own data (lane L1).
 *
 * ## The separation argument, which is the part worth reading
 *
 * A demonstration that could touch the learner's real log would be worse than
 * no demonstration. The separation here is **structural rather than careful**,
 * and it rests on one property of `AppProvider`: it opens the durable event
 * store *only when no store is injected*. Read `state/app-context.tsx` — the
 * effect that calls `createDurableAppStore` returns immediately when
 * `store !== undefined`.
 *
 * So when a stage is loaded, `DemoBoundary` renders the provider with the store
 * this module built, and three things follow, in order of how hard they are to
 * break:
 *
 * 1. **No `EventStorePort` exists in the process.** The durable adapter is
 *    never opened, so there is nothing to write to. This is not a rule anybody
 *    has to remember; it is the absence of an object.
 * 2. **The demo store has no journal.** `createMemoryAppStore` writes durably
 *    only through its `journal` callback, and {@link buildDemoStage} does not
 *    pass one. A command executed against a loaded stage — a capture, a sitting
 *    — lands in that store's own array and nowhere else.
 * 3. **The stage is a separate object with a separate log.** Returning to the
 *    operator's own data unmounts the provider and drops it; the durable store
 *    is then opened afresh and rehydrates from the bytes it always had, which
 *    the demonstration never had a way to reach.
 *
 * `test/demo-isolation.test.ts` drives all three.
 *
 * ## Why the stage ends today
 *
 * `startDay` is computed backwards from the current instant, so a two-year
 * stage ends on today's date. The alternative — a pinned start day — would show
 * the learner's state as it stood in 2024 with two years of decay applied on
 * top, which is a picture of nothing. The determinism claim is unaffected and
 * unchanged: it is *given a start day*, and the harness pins one.
 *
 * ## Why the build is timed and the numbers are surfaced
 *
 * `replay` is quadratic in (events × contracts) — measured, in
 * `packages/domain/src/demo/generate.ts` — and the largest stage is the first
 * thing in this repository big enough to feel it. Rather than hide that behind
 * a spinner, the build measures itself and the switcher renders what it
 * measured. A number a learner can see is a better answer than a promise
 * nobody checked, and it is the same discipline the rest of this build applies
 * to a latency it has not measured: report it or say nothing.
 */

import {
  demoStageById,
  generateScriptedLearner,
  startOfUtcDay,
  addMs,
  MS_PER_DAY,
  type DemoStageId,
  type DemoStageScript,
  type ScriptedLearnerLog,
} from '@bunki/domain';

import { findLexemeByHeadword } from '../../data/catalog.ts';
import { createMemoryAppStore } from '../memory-store.ts';
import { createRuntimeContext } from '../runtime.ts';
import type { AppStore } from '../store.ts';
import { demoContractIdFor, demoCorpus } from './demo-corpus.ts';

/** What one loaded stage is. */
export interface DemoStageBuild {
  readonly stageId: DemoStageId;
  readonly script: DemoStageScript;
  /** The store every surface reads while this stage is loaded. */
  readonly store: AppStore;
  readonly log: ScriptedLearnerLog;
  /** Milliseconds spent generating the log, on this device. */
  readonly generateMs: number;
  /** Milliseconds spent folding it into derived state, on this device. */
  readonly replayMs: number;
}

export interface BuildDemoStageOptions {
  /** The instant the stage should end on. The app passes now; a test pins it. */
  readonly today: string;
  /**
   * A monotonic counter, in milliseconds.
   *
   * Injected for the reason the store's is: a module that reached for
   * `performance.now()` could not be tested, and a duration measured on a wall
   * clock can come out negative across an adjustment.
   */
  readonly elapsedMs?: (() => number) | undefined;
}

/**
 * Build one stage: generate its log, open a store over it, and warm the fold.
 *
 * The `readDerived()` call at the end is not a cache-priming trick — it is
 * where the cost is *paid*, deliberately, inside the step the switcher is
 * showing a build state for. Without it the same work happens on the first
 * render of whichever surface the learner is standing on, which is a frame
 * budget rather than a progress state.
 */
export function buildDemoStage(
  stageId: DemoStageId,
  options: BuildDemoStageOptions,
): DemoStageBuild {
  const script = demoStageById(stageId);
  if (script === null) throw new Error(`no demonstration stage named ${stageId}`);

  const elapsed = options.elapsedMs ?? (() => 0);
  const startedAt = elapsed();

  const log = generateScriptedLearner({
    script,
    corpus: demoCorpus(),
    // Backwards from today, so the last day of the script is today.
    startDay: addMs(startOfUtcDay(options.today), -(script.days - 1) * MS_PER_DAY),
    idPrefix: `demo-${stageId}`,
    contractIdFor: demoContractIdFor,
  });

  const generatedAt = elapsed();

  const store = createMemoryAppStore({
    // A context of the stage's own, so an event minted by a sitting *inside* a
    // loaded stage can never collide with one the operator's own store minted.
    context: createRuntimeContext({ sessionPrefix: `live${stageId}` }),
    // The truth about this store and the only word any surface may render for
    // it: nothing here survives a reload, and nothing here is meant to.
    durability: 'in-memory-session-only',
    initialEvents: log.events,
    // No `journal`. This is the line that makes the isolation structural rather
    // than careful — see this file's header.
    resolveLexemeId: (text) => findLexemeByHeadword(text)?.id ?? null,
  });

  // Pay the fold here, where a build state is on screen.
  store.readDerived();
  const replayedAt = elapsed();

  return {
    stageId,
    script,
    store,
    log,
    generateMs: Math.max(0, generatedAt - startedAt),
    replayMs: Math.max(0, replayedAt - generatedAt),
  };
}
