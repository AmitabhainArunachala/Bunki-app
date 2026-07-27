import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME, RUNTIME_LABELS } from '../src/index.ts';

describe('@bunki/persistence scaffold (WP-01)', () => {
  it('exposes its package identity', () => {
    expect(PACKAGE_NAME).toBe('@bunki/persistence');
  });

  it('keeps ci-substitute distinct from native so a CI pass cannot be read as device proof', () => {
    expect(RUNTIME_LABELS).toContain('ci-substitute');
    expect(RUNTIME_LABELS).toContain('native');
  });
});
