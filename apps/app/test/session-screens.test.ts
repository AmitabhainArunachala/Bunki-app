/**
 * Source-level guarantees about WP-08's three screens (controller §10.4/5/7,
 * REQ-UI-05, REQ-UI-09, REQ-GATE-03).
 *
 * File scans rather than renders, for the reason `screen-contract.test.ts`
 * gives: several of WP-08's obligations are about what a screen must *never*
 * contain, and a render test can only show that one path did not produce
 * something. A scan shows it is not in the tree.
 *
 * There is a second reason here. This project ships no React Native test
 * renderer, so the behavioural half of these screens is proved in
 * `session-canvas.test.ts` against the exact functions they call. What is left
 * to check is that the screens *call those functions* and render *those
 * strings* rather than re-typing a rule in copy that can drift away from the
 * rule it paraphrases.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CANVAS_IMMERSION_PROMISE, REJOIN_CRITERION, REPAIR_UNTAKEN_POLICY } from '@bunki/domain';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const screen = (name: string): string =>
  readFileSync(resolve(APP_ROOT, 'src/screens', name), 'utf8');

/** Source with comments stripped: what the screen *does*, not what it explains. */
const code = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const SESSION = screen('session-screen.tsx');
const CANVAS = screen('canvas-screen.tsx');
const REPAIR = screen('session-repair-screen.tsx');
const LOOP = screen('session-loop.ts');
const CLOZE = screen('canvas-cloze.ts');
const TIMING = screen('session-timing.ts');

const ALL: readonly (readonly [string, string])[] = [
  ['session', SESSION],
  ['canvas', CANVAS],
  ['repair', REPAIR],
];

/** Everything that helps build a graded attempt, screens included. */
const ATTEMPT_BUILDERS: readonly (readonly [string, string])[] = [
  ...ALL,
  ['cloze', CLOZE],
  ['timing', TIMING],
];

describe('every WP-08 screen defines all four REQ-UI-09 states', () => {
  it.each(ALL)('%s screen', (_name, source) => {
    expect(source).toContain('LoadingPanel');
    expect(source).toContain('ErrorPanel');
    expect(source).toContain('EmptyPanel');
    // Offline is the shell's, so no screen can omit it — asserted centrally in
    // screen-contract.test.ts. What is asserted here is that these screens do
    // sit in the shell rather than rendering their own frame.
    expect(source).toContain('ScreenShell');
  });
});

describe('the session screen leads with the finite plan (REQ-UI-05)', () => {
  it('renders the plan, its recipe, and every step', () => {
    expect(code(SESSION)).toContain('plan.recipe');
    expect(code(SESSION)).toContain('plan.steps.map');
    expect(code(SESSION)).toContain('session-plan');
  });

  it('renders progress as steps, and separates answered from skipped', () => {
    expect(code(SESSION)).toContain('sessionProgress');
    expect(code(SESSION)).toContain('answeredCount');
    expect(code(SESSION)).toContain('skippedCount');
  });

  it('renders an explicit completion state and names the closing event', () => {
    expect(code(SESSION)).toContain('session-completion-state');
    expect(code(SESSION)).toContain('runtime.completionState');
    expect(SESSION).toContain('SessionClosed');
  });

  it('puts the backlog one level deeper rather than leading with it', () => {
    const source = code(SESSION);
    expect(source).toContain('session-backlog-toggle');
    const toggleAt = source.indexOf('session-backlog-toggle');
    const planAt = source.indexOf('session-plan');
    // The plan is rendered before the disclosure that reveals the backlog — the
    // ordering REQ-SCH-04 asks for ("leads with what fits the budget, never an
    // unbounded due count").
    expect(planAt).toBeGreaterThan(-1);
    expect(planAt).toBeLessThan(toggleAt);
    expect(source).toContain('deferredDueCount');
  });

  it('takes the step purpose from the domain rather than writing its own', () => {
    expect(code(SESSION)).toContain('SESSION_STEP_PURPOSE');
  });
});

describe('the canvas screen renders the judgement rather than making one', () => {
  it('submits interactions and renders the classification that comes back', () => {
    const source = code(CANVAS);
    expect(source).toContain("kind: 'canvasInteraction'");
    expect(source).toContain('canvasLedger');
    expect(source).toContain('declared_probe');
  });

  it('shows the REQ-SCH-06 promise from the domain, not a retyped copy', () => {
    expect(code(CANVAS)).toContain('CANVAS_IMMERSION_PROMISE');
    expect(CANVAS).not.toContain(CANVAS_IMMERSION_PROMISE);
  });

  it('hides the target until it is attempted, which is the priming rule', () => {
    expect(code(CANVAS)).toContain('targetHidden');
    expect(code(CANVAS)).toContain('CLOZE_MASK');
    // The mask, the label, the `disabled` props and the `targetWasHidden` the
    // kernel is told all read the same predicate, so they cannot disagree.
    expect(code(CLOZE)).toContain('targetIsHidden');
    expect(code(CLOZE)).toContain('targetWasHidden');
  });

  it('declares a contract only on the target, and never on a plain tap', () => {
    const source = code(CLOZE);
    // Four interactions are built in this file. The two that name a contract
    // are the cloze and the reveal; the tap and the read share one builder that
    // passes `null`.
    const declared = source.match(/declaredContractId: target\.probeContractId/g) ?? [];
    const undeclared = source.match(/declaredContractId: null/g) ?? [];
    expect(declared).toHaveLength(2);
    expect(undeclared).toHaveLength(1);
  });

  it('never claims immersion reduces review burden (REQ-SCH-06 H4, REQ-GATE-03)', () => {
    expect(CANVAS).not.toMatch(/reduce[sd]?\s+(your\s+)?(standalone\s+)?review/i);
    expect(CANVAS).not.toMatch(/instead\s+of\s+reviewing|fewer\s+reviews/i);
  });
});

/**
 * The repair round's three source-level rules.
 *
 * Each of these is a defect that shipped and was invisible to a suite of 145
 * tests, because every one of them supplied the field it was checking. A source
 * scan cannot be fooled that way: it asks whether the literal is in the tree.
 */
describe('the screens report what happened, not what they wish had (WP-08 repair)', () => {
  it('never states targetWasHidden as a literal', () => {
    // `targetWasHidden: true` on the cloze and reveal paths is the P0: it told
    // the kernel the word was hidden while the screen's own state said it was
    // printed in the passage, so recognition under priming was admitted as a
    // tier-A review (REQ-SCH-06, DL-19).
    ATTEMPT_BUILDERS.forEach(([name, source]) => {
      expect(code(source), name).not.toMatch(/targetWasHidden:\s*(true|false)\b/);
    });
    expect(code(CLOZE)).toMatch(/targetWasHidden: targetIsHidden\(presentation\)/);
  });

  it('never writes a latency nobody measured', () => {
    // `latencyMs: 0` was a constant in all three screens. REQ-SCH-06 makes a
    // logged latency a precondition for an embedded probe to count; REQ-SCH-05
    // licenses never *reading* it, not writing a fabricated one.
    ATTEMPT_BUILDERS.forEach(([name, source]) => {
      expect(code(source), name).not.toMatch(/latencyMs:\s*\d/);
    });
    expect(code(CLOZE)).toContain('elapsedMs(presentation.presentedAt, answer.at)');
    expect(code(SESSION)).toContain('elapsedMs(presentedAt, loop.now())');
    expect(code(REPAIR)).toContain('elapsedMs(presentedAt, loop.now())');
  });

  it('measures time through the injected clock and never an ambient one', () => {
    // REQ-ARCH-02 at the app seam: `loop.now()` is `DomainContext.clock`, so a
    // test and the screenshot harness pin time without patching a global.
    ATTEMPT_BUILDERS.forEach(([name, source]) => {
      expect(code(source), name).not.toMatch(/\bDate\.now\b|new Date\(/);
    });
    expect(code(TIMING)).toContain('usePresentedAt');
  });

  it('lets one blank produce at most one declared probe', () => {
    const source = code(CANVAS);
    // The reveal button already had this; the four grade buttons did not, so a
    // settled cloze stayed gradable with the answer printed on the page.
    expect(source.match(/disabled=\{settled\}/g) ?? []).toHaveLength(2);
    expect(source).toContain('canAttempt');
    // `canAttempt` is the only thing that decides it, in one place.
    expect(code(CLOZE)).toMatch(/export function canAttempt/);
  });
});

describe('the repair screen shows the criterion before it is met (REQ-JRN-02)', () => {
  it('renders the domain’s criterion verbatim rather than paraphrasing it', () => {
    expect(code(REPAIR)).toContain('REJOIN_CRITERION');
    expect(REPAIR).not.toContain(REJOIN_CRITERION);
  });

  it('renders the untaken-path policy from the domain too', () => {
    expect(code(REPAIR)).toContain('REPAIR_UNTAKEN_POLICY');
    expect(REPAIR).not.toContain(REPAIR_UNTAKEN_POLICY);
  });

  it('offers both hypotheses and marks one as recommended, never as chosen', () => {
    const source = code(REPAIR);
    expect(source).toContain('repair.offered.map');
    expect(source).toContain('recommended');
    expect(source).toContain("kind: 'chooseRepairBranch'");
  });

  it('never makes a step count the criterion', () => {
    const source = code(REPAIR);
    // The attempt count is displayed — the learner may want it — but it must
    // not appear in a conditional that could end the branch.
    expect(source).toContain('countProbes');
    expect(source).not.toMatch(/countProbes\([^)]*\)\s*[><=]/);
    expect(source).not.toMatch(/attempts?\s*[><]=?\s*\d/i);
    expect(REPAIR).toMatch(/does not decide anything/i);
  });

  it('phrases every cause the domain gives it, and asserts none of its own', () => {
    // The hypotheses come from `REPAIR_BRANCHES` through `repair.offered`; the
    // screen prints `option.hypothesis` and writes no diagnosis of its own.
    expect(code(REPAIR)).toContain('option.hypothesis');
    expect(REPAIR).not.toMatch(/you (don’t|do not|can’t|cannot) (know|read|remember)/i);
  });
});

describe('the app end of the loop stays inside controller §5', () => {
  it('mints no event of its own', () => {
    const source = code(LOOP);
    expect(source).not.toContain('createDomainEvent');
    expect(source).not.toMatch(/type:\s*['"](EncounterCaptured|ReviewGraded|ExposureLogged)['"]/);
    // Contracts are built through the kernel's named door — since R4-A the
    // same validated pair factory the `activateLearn` command uses (P1-18),
    // not the generic single-contract wrapper the compatibility mint called.
    expect(source).toContain('createLearnContractPair');
    expect(source).not.toContain('createTargetContract');
  });

  it('routes every session action through the domain command handler', () => {
    expect(code(LOOP)).toContain('applySessionCommand');
    ALL.forEach(([name, source]) => {
      expect(code(source), name).not.toContain('applySessionCommand(');
      expect(code(source), name).toContain('loop.dispatch');
    });
  });

  /**
   * This assertion replaces, and is strictly stronger than, the one that stood
   * here while COORD-B8-2 was open.
   *
   * The old version pinned that the loop *disclosed* an open seam: the note
   * existed, it named the coordination request, and the session screen rendered
   * it. That was the right assertion for a build in which a sitting's events did
   * not reach the durable log — the honest thing to hold was the disclosure.
   *
   * WP-10's export lane closed the seam, so pinning the disclosure would now pin
   * a sentence about a state of affairs that no longer exists. What replaces it
   * is not "the note is gone" (that would be weaker — it would pass for a build
   * that quietly stopped saying anything) but the mechanism itself: the loop
   * carries its events to the store, and it does so through the sealed batch,
   * which is the only route that cannot also carry a forged one. The note is
   * still required to exist and still required to be rendered; what it says is
   * asserted where the wording lives (`test/persist-minted-boundary.test.ts`).
   */
  it('carries the sitting to the durable store through the sealed persist seam', () => {
    const source = code(LOOP);
    expect(source).toContain('sealMintedEvents');
    expect(source).toContain('store.persistMinted');
    // Still no minting in the app: the events being persisted are the ones
    // `applySessionCommand` produced, which is asserted above.
    expect(source).not.toContain('createDomainEvent');

    // The note survives the closure — a screen that stopped describing what it
    // writes down would be a screen the learner cannot audit (REQ-UI-05).
    expect(source).toContain('SESSION_INTEGRATION_NOTE');
    expect(code(SESSION)).toContain('SESSION_INTEGRATION_NOTE');
  });

  it('writes nothing at bootstrap, so opening the Session tab records no event', () => {
    // The WP-10 repair round removed writes from the bootstrap because reaching
    // the Session link was enough to fabricate a capture and a promotion
    // (definition of done §2 item 6). Persisting the sitting must not put them
    // back: `bootstrapSessionWorkspace` still only reads, and the contracts it
    // mints are carried on the first *dispatch* instead.
    const source = code(LOOP);
    const start = source.indexOf('export function bootstrapSessionWorkspace');
    expect(start).toBeGreaterThan(-1);
    // To the *next* export, whatever it happens to be — naming the following
    // function would make this assertion break every time the file is reordered,
    // and an assertion that breaks for cosmetic reasons gets loosened.
    const next = source.indexOf('\nexport ', start + 1);
    const bootstrap = source.slice(start, next === -1 ? undefined : next);
    expect(bootstrap).toContain('SessionBootstrap');
    expect(bootstrap).not.toContain('persistMinted');
    expect(bootstrap).not.toContain('sealMintedEvents');
    expect(bootstrap).not.toContain('.execute(');
  });
});
