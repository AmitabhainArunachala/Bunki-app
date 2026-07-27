/**
 * The input fingerprint and the OD-08 content boundary (WP-07).
 *
 * Two things that are easy to write and hard to notice being wrong: a hash that
 * is not the hash it claims to be, and a privacy allowlist that quietly permits
 * everything. Both are pinned here against values that do not come from this
 * implementation — published SHA-256 vectors for the first, and explicit
 * negative cases for the second.
 */

import { describe, expect, it } from 'vitest';

import {
  AiContentNotPermittedError,
  createSeededFixturePolicy,
  DEFAULT_CONTENT_POLICY,
  DENY_ALL_CONTENT_POLICY,
  FALLBACK_EXCERPTS,
  FALLBACK_TARGET_FORMS,
  hashableInputOf,
  inputHashOf,
  PROMPT_VERSION,
  sha256Hex,
  type AiThreadContext,
} from '../src/index.ts';

const SEEDED: AiThreadContext = {
  contentClass: 'seeded-fixture',
  targetForm: '分岐',
  excerpt: '子どものころ、私はこの分岐点が好きだった。',
  seedRef: 'pas-bunki-01',
};

describe('sha256Hex matches the published FIPS 180-4 vectors', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
  ])('hashes %j', (input, expected) => {
    expect(sha256Hex(input)).toBe(expected);
  });

  it('hashes multibyte text as UTF-8', () => {
    // Independently checkable: `printf '分岐' | sha256sum`.
    expect(sha256Hex('分岐')).toBe(
      'f59bb90b09e0cf9d67693c6e6164017112d9e7b1b2855c2742eb13bacdc6bad1',
    );
  });

  it('replaces a lone surrogate with U+FFFD, as a conforming encoder does', () => {
    expect(sha256Hex('\ud800')).toBe(sha256Hex('�'));
  });
});

describe('inputHash identifies the input, not the object it arrived in', () => {
  it('is stable across key order', () => {
    const a = inputHashOf({ b: 2, a: 1, nested: { y: 1, x: 2 } });
    const b = inputHashOf({ a: 1, nested: { x: 2, y: 1 }, b: 2 });
    expect(a).toBe(b);
  });

  it('changes when the excerpt changes', () => {
    const other: AiThreadContext = {
      ...SEEDED,
      excerpt: '分岐点まで来て、右の道を行くことにした。',
    };
    expect(inputHashOf(hashableInputOf(SEEDED))).not.toBe(inputHashOf(hashableInputOf(other)));
  });

  it('changes when the prompt version changes, so an old candidate is not a repeat', () => {
    const current = inputHashOf(hashableInputOf(SEEDED));
    const revised = inputHashOf({ ...hashableInputOf(SEEDED), promptVersion: 'next' });
    expect(current).not.toBe(revised);
    expect(hashableInputOf(SEEDED).promptVersion).toBe(PROMPT_VERSION);
  });
});

describe('the OD-08 content policy', () => {
  it('permits a seeded fixture excerpt', () => {
    expect(() => DEFAULT_CONTENT_POLICY.assertPermitted(SEEDED)).not.toThrow();
  });

  it('refuses text the learner wrote themselves', () => {
    expect(() =>
      DEFAULT_CONTENT_POLICY.assertPermitted({
        ...SEEDED,
        excerpt: '昨日、駅で友達に会いました。',
      }),
    ).toThrow(AiContentNotPermittedError);
  });

  it('refuses a form outside the allowlist even with a seeded excerpt', () => {
    expect(() => DEFAULT_CONTENT_POLICY.assertPermitted({ ...SEEDED, targetForm: '会う' })).toThrow(
      AiContentNotPermittedError,
    );
  });

  it('never names the refused text in its message', () => {
    const secret = 'a private sentence about my landlord';
    try {
      DEFAULT_CONTENT_POLICY.assertPermitted({ ...SEEDED, excerpt: secret });
      expect.unreachable('un-seeded content must be refused');
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it('fails closed on an empty allowlist', () => {
    const empty = createSeededFixturePolicy({ targetForms: [], excerpts: [] });
    expect(() => empty.assertPermitted(SEEDED)).toThrow(AiContentNotPermittedError);
  });

  it('permits nothing at all under the deny-all policy', () => {
    expect(() => DENY_ALL_CONTENT_POLICY.assertPermitted(SEEDED)).toThrow(
      AiContentNotPermittedError,
    );
  });

  it('is scoped to the fallback fixtures by default', () => {
    expect(FALLBACK_TARGET_FORMS).toContain('分岐');
    expect(FALLBACK_EXCERPTS).toContain(SEEDED.excerpt);
  });
});
