import { describe, expect, it } from 'vitest';

import { EVENT_SCHEMA_VERSION, PACKAGE_NAME } from '../src/index.ts';

describe('@bunki/domain scaffold (WP-01)', () => {
  it('exposes its package identity', () => {
    expect(PACKAGE_NAME).toBe('@bunki/domain');
  });

  it('pins the v1 event schema version the controller §6.1 table assumes', () => {
    expect(EVENT_SCHEMA_VERSION).toBe(1);
  });
});
