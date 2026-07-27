import { describe, expect, it } from 'vitest';

import {
  CANDIDATE_LABEL,
  DEFAULT_TIMEOUT_MS,
  OFFLINE_FALLBACK_LABEL,
  PACKAGE_NAME,
} from '../src/index.ts';

describe('@bunki/ai scaffold (WP-01)', () => {
  it('exposes its package identity', () => {
    expect(PACKAGE_NAME).toBe('@bunki/ai');
  });

  it('defaults to the controller §9 ten-second timeout', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(10_000);
  });

  it('keeps the fallback label distinct from the generic candidate label', () => {
    expect(OFFLINE_FALLBACK_LABEL).toBe('offline-fallback');
    expect(CANDIDATE_LABEL).not.toBe(OFFLINE_FALLBACK_LABEL);
  });
});
