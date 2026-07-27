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

const ALL: readonly (readonly [string, string])[] = [
  ['session', SESSION],
  ['canvas', CANVAS],
  ['repair', REPAIR],
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
    const source = code(CANVAS);
    expect(source).toContain('targetHidden');
    expect(source).toContain('targetWasHidden');
    expect(source).toContain('CLOZE_MASK');
  });

  it('declares a contract only on the target, and never on a plain tap', () => {
    const source = code(CANVAS);
    // Three interactions are built in this file. The two that name a contract
    // are the cloze and the reveal; the tap and the read pass `null`.
    const declared = source.match(/declaredContractId: target\.probeContractId/g) ?? [];
    const undeclared = source.match(/declaredContractId: null/g) ?? [];
    expect(declared).toHaveLength(2);
    expect(undeclared).toHaveLength(2);
  });

  it('never claims immersion reduces review burden (REQ-SCH-06 H4, REQ-GATE-03)', () => {
    expect(CANVAS).not.toMatch(/reduce[sd]?\s+(your\s+)?(standalone\s+)?review/i);
    expect(CANVAS).not.toMatch(/instead\s+of\s+reviewing|fewer\s+reviews/i);
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
    // Contracts are built through the kernel's named door.
    expect(source).toContain('createTargetContract');
  });

  it('routes every session action through the domain command handler', () => {
    expect(code(LOOP)).toContain('applySessionCommand');
    ALL.forEach(([name, source]) => {
      expect(code(source), name).not.toContain('applySessionCommand(');
      expect(code(source), name).toContain('loop.dispatch');
    });
  });

  it('records the integration seam instead of implying the log is durable', () => {
    expect(code(LOOP)).toContain('SESSION_INTEGRATION_NOTE');
    expect(LOOP).toMatch(/COORD-B8-2/);
    expect(code(SESSION)).toContain('SESSION_INTEGRATION_NOTE');
  });
});
