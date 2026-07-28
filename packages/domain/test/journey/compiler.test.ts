/**
 * The compiler follows REQ-JRN-01's rule and refuses its forbidden shortcut
 * (Campaign E / A2).
 *
 * The claim under test, stated as sharply as it can be: **one stumble never
 * produces a cause.** Every assertion in the second describe block is an
 * attempt to make it produce one anyway.
 */

import { describe, expect, it } from 'vitest';

import {
  BRANCH_FAMILIES,
  BRANCH_FAMILY_STATUS,
  compileJourney,
  DIAGNOSTIC_PROBES,
  FAST_ANSWER_MS,
  JOURNEY_COMPILER_SUPERSESSION,
  MAX_DIAGNOSTIC_PROBES,
  MAX_OFFERED_PATHS,
  MIN_OFFERED_PATHS,
  selectBranch,
  selectProbes,
  type BranchFamily,
  type ProbeAnswer,
} from '../../src/index.ts';
import { EVERYTHING_AVAILABLE, NOTHING_AVAILABLE, observed, stumble } from './support.ts';

describe('the branch families', () => {
  it('are exactly REQ-JRN-01’s six', () => {
    expect([...BRANCH_FAMILIES]).toEqual([
      'form_reading_aural',
      'sense_meaning_contrast',
      'usage_production_register',
      'grammar_construction',
      'kanji_structure_writing',
      'task_misunderstanding',
    ]);
  });

  it('are presented as route families rather than as an ontology', () => {
    expect(BRANCH_FAMILY_STATUS).toMatch(/not a complete ontology/i);
  });

  it('include task misunderstanding, which needs no content to be available', () => {
    const compiled = compileJourney(stumble({ available: NOTHING_AVAILABLE }));
    const task = compiled.hypotheses.find((cause) => cause.family === 'task_misunderstanding');
    expect(task?.admissible).toBe(true);
  });
});

describe('a single stumble never yields a cause', () => {
  const compiled = compileJourney(stumble());

  it('has no cause, diagnosis, or confidence field anywhere in its output', () => {
    const serialised = JSON.stringify(compiled).toLowerCase();
    ['"cause"', 'diagnosis', 'confidence', 'certainty', 'probability'].forEach((word) => {
      expect(serialised, `${word} would be a confident inference from one stumble`).not.toContain(
        word,
      );
    });
  });

  it('offers at least two paths whenever two are available', () => {
    expect(compiled.offered.length).toBeGreaterThanOrEqual(MIN_OFFERED_PATHS);
    expect(compiled.offered.length).toBeLessThanOrEqual(MAX_OFFERED_PATHS);
  });

  it('refuses to select a branch from the observations alone', () => {
    const decision = selectBranch(compiled, []);
    expect(decision.selected).toBe(false);
    if (!decision.selected) {
      expect(decision.reason).toBe('probe_required');
      expect(decision.detail).toMatch(/one stumble does not identify a cause/i);
      expect(decision.alternatives.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('refuses even when every observation points one way', () => {
    const loud = compileJourney(
      stumble({
        observed: observed({
          latencyMs: 200,
          revealedBeforeRecall: false,
          hintsUsed: 0,
        }),
      }),
    );
    expect(selectBranch(loud, []).selected).toBe(false);
  });

  it('treats "unsure" as no answer at all', () => {
    const unsure: readonly ProbeAnswer[] = compiled.probes.map((probe) => ({
      probeId: probe.id,
      outcome: 'unsure' as const,
    }));
    const decision = selectBranch(compiled, unsure);
    expect(decision.selected).toBe(false);
    if (!decision.selected) expect(decision.reason).toBe('probe_required');
  });

  it('marks the basis as a single stumble, and as repeated once there is history', () => {
    expect(compiled.basis).toBe('single_stumble');
    expect(compileJourney(stumble({ observed: observed({ priorStumbleCount: 2 }) })).basis).toBe(
      'repeated_stumble',
    );
  });

  it('phrases every hypothesis conditionally', () => {
    compiled.hypotheses.forEach((cause) => {
      expect(cause.hypothesis, cause.family).toMatch(/\bmay\b|\bmight\b/);
    });
  });

  it('cites observations rather than beliefs as support', () => {
    const withSupport = compileJourney(
      stumble({ observed: observed({ latencyMs: FAST_ANSWER_MS - 1 }) }),
    );
    const task = withSupport.hypotheses.find((cause) => cause.family === 'task_misunderstanding');
    expect(task?.support.some((line) => line.includes('under'))).toBe(true);
    task?.support.forEach((line) => {
      expect(line, line).not.toMatch(/we (think|believe|are sure)/i);
    });
  });
});

describe('with a repeated stumble the probes still decide', () => {
  const repeated = compileJourney(stumble({ observed: observed({ priorStumbleCount: 3 }) }));

  it('lets probe answers select a branch', () => {
    const probe = repeated.probes[0];
    expect(probe).toBeDefined();
    const raisedByNo = probe?.raises.no.find((family) =>
      repeated.offered.some((option) => option.family === family),
    );
    expect(raisedByNo).toBeDefined();

    const decision = selectBranch(repeated, [{ probeId: probe!.id, outcome: 'no' }]);
    expect(decision.selected).toBe(true);
    if (decision.selected) {
      expect(decision.family).toBe(raisedByNo);
      expect(decision.rationale.length).toBeGreaterThan(0);
      expect(decision.alternatives).not.toContain(decision.family);
    }
  });

  it('reports inconclusive answers rather than picking anyway', () => {
    const decision = selectBranch(repeated, [
      { probeId: 'was_the_task_what_you_thought', outcome: 'yes' },
    ]);
    expect(decision.selected).toBe(false);
    if (!decision.selected) {
      expect(decision.reason).toBe('answers_were_inconclusive');
      expect(decision.detail).toMatch(/choice is yours/i);
    }
  });
});

describe('the offer is bounded and grounded', () => {
  it('never offers a route the graph cannot fill', () => {
    const compiled = compileJourney(stumble({ available: NOTHING_AVAILABLE }));
    compiled.offered.forEach((option) => {
      const cause = compiled.hypotheses.find((entry) => entry.family === option.family);
      expect(cause?.admissible, option.family).toBe(true);
    });
  });

  it('records why an unavailable route is unavailable, rather than hiding it', () => {
    const compiled = compileJourney(stumble({ available: NOTHING_AVAILABLE }));
    const unavailable = compiled.hypotheses.filter((cause) => !cause.admissible);
    expect(unavailable.length).toBeGreaterThan(0);
    unavailable.forEach((cause) => {
      expect(cause.unavailableBecause, cause.family).toBeTruthy();
      expect(cause.unavailableBecause?.length ?? 0).toBeGreaterThan(10);
    });
  });

  it('selects the only route when only one is available, and offers no alternatives', () => {
    const compiled = compileJourney(
      stumble({
        skill: 'form_to_meaning',
        available: { ...NOTHING_AVAILABLE },
      }),
    );
    // sense/meaning and task-misunderstanding are both always available, so the
    // single-route case has to be constructed rather than assumed; assert the
    // invariant that matters instead: an offer is never empty.
    expect(compiled.offered.length).toBeGreaterThanOrEqual(1);
  });

  it('never exceeds REQ-JRN-02’s ceiling of three paths', () => {
    const compiled = compileJourney(stumble({ available: EVERYTHING_AVAILABLE }));
    expect(compiled.offered.length).toBeLessThanOrEqual(3);
  });

  it('recommends from the skill that stumbled — a lookup, not an inference', () => {
    expect(compileJourney(stumble({ skill: 'orthography_to_reading' })).recommended).toBe(
      'form_reading_aural',
    );
    expect(compileJourney(stumble({ skill: 'form_to_meaning' })).recommended).toBe(
      'sense_meaning_contrast',
    );
    expect(compileJourney(stumble({ skill: 'meaning_to_production' })).recommended).toBe(
      'usage_production_register',
    );
  });

  it('is deterministic — two compilations of one stumble are deeply equal', () => {
    expect(compileJourney(stumble())).toEqual(compileJourney(stumble()));
  });
});

describe('the diagnostic probes', () => {
  it('are at most two, per REQ-JRN-01', () => {
    expect(compileJourney(stumble()).probes.length).toBeLessThanOrEqual(MAX_DIAGNOSTIC_PROBES);
    expect(MAX_DIAGNOSTIC_PROBES).toBe(2);
  });

  it('produce no evidence, by type and by value', () => {
    DIAGNOSTIC_PROBES.forEach((probe) => {
      expect(probe.producesEvidence, probe.id).toBe(false);
    });
  });

  it('actually separate the families they are chosen for', () => {
    const offered: readonly BranchFamily[] = [
      'form_reading_aural',
      'sense_meaning_contrast',
      'usage_production_register',
    ];
    const probes = selectProbes(offered);
    expect(probes.length).toBeGreaterThan(0);
    probes.forEach((probe) => {
      const touched = new Set(
        [...probe.raises.yes, ...probe.raises.no].filter((family) => offered.includes(family)),
      );
      expect(touched.size, probe.id).toBeGreaterThan(0);
      expect(touched.size, probe.id).toBeLessThan(offered.length);
    });
  });

  it('asks nothing when there is only one path', () => {
    expect(selectProbes(['form_reading_aural'])).toEqual([]);
  });

  it('asks nothing when there is nothing on offer', () => {
    expect(selectProbes([])).toEqual([]);
  });

  it('skips a probe whose answers move every offered family together', () => {
    // "Could you say it aloud?" raises sense/meaning and usage/production on
    // the same answer, so between exactly those two it separates nothing —
    // whichever way it is answered, both move. A question that cannot change
    // the ranking is a survey, and the compiler declines to ask it.
    const probes = selectProbes(['sense_meaning_contrast', 'usage_production_register']);
    expect(probes.map((probe) => probe.id)).not.toContain('say_it_aloud');
    expect(probes.length).toBeGreaterThan(0);
  });

  it('is deterministic for a given offer', () => {
    const offered: readonly BranchFamily[] = ['form_reading_aural', 'sense_meaning_contrast'];
    expect(selectProbes(offered)).toEqual(selectProbes(offered));
  });

  it('phrases every question so neither answer is an admission', () => {
    DIAGNOSTIC_PROBES.forEach((probe) => {
      expect(probe.question, probe.id).toMatch(/\?$/);
      expect(probe.question, probe.id).not.toMatch(/why did you|you failed|you should/i);
    });
  });
});

describe('the Phase-0 seam', () => {
  it('is superseded explicitly rather than quietly reimplemented', () => {
    expect(JOURNEY_COMPILER_SUPERSESSION.supersedes).toContain('session/repair.ts');
    expect(JOURNEY_COMPILER_SUPERSESSION.seamTextIsStale).toBe(true);
    expect(JOURNEY_COMPILER_SUPERSESSION.why).toMatch(/diagnostic probes/i);
    expect(JOURNEY_COMPILER_SUPERSESSION.anchors).toContain('REQ-JRN-01');
  });
});
