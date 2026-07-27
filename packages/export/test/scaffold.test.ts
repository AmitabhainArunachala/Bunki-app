import { describe, expect, it } from 'vitest';

import { EXPORT_VERSION, PACKAGE_NAME } from '../src/index.ts';

describe('@bunki/export scaffold (WP-01)', () => {
  it('exposes its package identity', () => {
    expect(PACKAGE_NAME).toBe('@bunki/export');
  });

  it('pins exportVersion 1 per controller §11', () => {
    expect(EXPORT_VERSION).toBe(1);
  });
});
