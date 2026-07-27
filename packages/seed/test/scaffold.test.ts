import { describe, expect, it } from 'vitest';

import { DEFAULT_CANONICAL_TARGET, PACKAGE_NAME, SEED_COVERAGE_DISCLOSURE } from '../src/index.ts';

describe('@bunki/seed scaffold (WP-01)', () => {
  it('exposes its package identity', () => {
    expect(PACKAGE_NAME).toBe('@bunki/seed');
  });

  it('carries the OD-02 default canonical target', () => {
    expect(DEFAULT_CANONICAL_TARGET).toBe('分岐');
  });

  it('never describes the seed as complete coverage', () => {
    expect(SEED_COVERAGE_DISCLOSURE).toMatch(/not a complete dictionary/);
  });
});
