/**
 * The five capability lenses are five, disjoint, and complete
 * (Campaign E / A2; REQ-UI-07, REQ-LM-02).
 */

import { describe, expect, it } from 'vitest';

import {
  CAPABILITY_LENSES,
  LENS_SKILLS,
  lensForSkill,
  NO_COLLAPSED_LIGHT_RULE,
  RETRIEVAL_SKILLS,
  SKILLS_OUTSIDE_THE_FIVE_LENSES,
  WRITING_LENS_DISCLOSURE,
} from '../../src/index.ts';

describe('the lens set', () => {
  it('is exactly the five REQ-UI-07 names, in the order the requirement gives them', () => {
    expect([...CAPABILITY_LENSES]).toEqual([
      'reading',
      'meaning',
      'listening',
      'production',
      'writing',
    ]);
  });

  it('never lets one skill show under two lenses', () => {
    const seen = new Set<string>();
    CAPABILITY_LENSES.forEach((lens) => {
      LENS_SKILLS[lens].forEach((skill) => {
        expect(seen.has(skill), `${skill} appears under more than one lens`).toBe(false);
        seen.add(skill);
      });
    });
  });

  it('accounts for every scheduled skill — mapped, or visibly excluded', () => {
    const mapped = CAPABILITY_LENSES.flatMap((lens) => [...LENS_SKILLS[lens]]);
    const accounted = new Set([...mapped, ...SKILLS_OUTSIDE_THE_FIVE_LENSES]);
    RETRIEVAL_SKILLS.forEach((skill) => {
      expect(
        accounted.has(skill),
        `${skill} is neither mapped to a lens nor listed as excluded`,
      ).toBe(true);
    });
  });

  it('excludes discrimination rather than folding it into meaning', () => {
    expect([...SKILLS_OUTSIDE_THE_FIVE_LENSES]).toEqual(['discrimination']);
    expect(lensForSkill('discrimination')).toBeNull();
    expect(LENS_SKILLS.meaning).not.toContain('discrimination');
  });

  it('leaves writing empty in Phase 0 and says why', () => {
    expect(LENS_SKILLS.writing).toEqual([]);
    expect(WRITING_LENS_DISCLOSURE).toMatch(/not measured/i);
  });

  it('resolves each mapped skill to its own lens', () => {
    expect(lensForSkill('orthography_to_reading')).toBe('reading');
    expect(lensForSkill('form_to_meaning')).toBe('meaning');
    expect(lensForSkill('audio_to_meaning')).toBe('listening');
    expect(lensForSkill('meaning_to_production')).toBe('production');
  });

  it('states the no-collapse rule in words a surface can render', () => {
    expect(NO_COLLAPSED_LIGHT_RULE).toMatch(/never averaged/i);
    expect(NO_COLLAPSED_LIGHT_RULE).toMatch(/no single score/i);
  });
});
