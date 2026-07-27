/**
 * The deferred register (WP-05).
 *
 * Controller §16 asks a PR body to state "what is deliberately not done", and
 * §3.7 asks the capsule to carry unresolved risks. `DEFERRED_INTEGRATION` is
 * the machine-readable version of both, living in the code so it travels with
 * the branch. This test keeps it from being quietly emptied.
 */

import { describe, expect, it } from 'vitest';

import { DEFERRED_BY_ID, DEFERRED_INTEGRATION } from '../src/state/deferred.ts';

describe('deferred register', () => {
  it('is not empty', () => {
    expect(DEFERRED_INTEGRATION.length).toBeGreaterThan(0);
  });

  it.each(DEFERRED_INTEGRATION)('$id is fully populated', (item) => {
    expect(item.id).toMatch(/^WP05-D\d+$/);
    expect(item.title.length).toBeGreaterThan(10);
    expect(item.reason.length).toBeGreaterThan(40);
    expect(item.owner.length).toBeGreaterThan(3);
    expect(item.closesWith.length).toBeGreaterThan(40);
  });

  it('has unique ids and an index that matches', () => {
    const ids = DEFERRED_INTEGRATION.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(DEFERRED_BY_ID).sort()).toEqual([...ids].sort());
  });

  it('records the persistence swap-in as W4 work rather than as done', () => {
    const item = DEFERRED_BY_ID['WP05-D1'];
    expect(item?.title).toMatch(/persistence/i);
    expect(item?.owner).toMatch(/W4/);
    expect(item?.reason).toMatch(/parallel lane|lint-forbidden/i);
  });

  it('records the uncertainty-dimension gap as an ADR-002 decision, not an app edit', () => {
    const item = DEFERRED_BY_ID['WP05-D2'];
    expect(item?.reason).toMatch(/ADR-002/);
    expect(item?.owner).toMatch(/Conductor/i);
    expect(item?.closesWith).toMatch(/amendment/i);
  });

  it('names the licensing gate behind the thin layer 2–3 content', () => {
    const item = DEFERRED_BY_ID['WP05-D3'];
    expect(item?.reason).toMatch(/licen[sc]ed|LICENSES\.md/i);
    expect(item?.owner).toMatch(/operator/i);
  });
});
