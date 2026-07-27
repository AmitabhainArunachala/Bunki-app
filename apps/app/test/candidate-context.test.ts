/**
 * What the app is allowed to send (WP-07; OD-08, REQ-ARCH-07).
 *
 * The privacy boundary has two halves and both live in
 * `src/candidate/candidate-context.ts`: choosing an excerpt (only ever a seed
 * record's own text) and building the allowlist the runtime enforces (derived
 * from the dataset, never hand-maintained). The tests below are mostly
 * negative, because the failure that matters is permission granted by accident.
 */

import { describe, expect, it } from 'vitest';

import { AiContentNotPermittedError } from '@bunki/ai';

import { findLexemeById, seedDataset } from '../src/data/catalog.ts';
import {
  NO_SEEDED_CONTEXT_NOTE,
  passageSentences,
  seededContentPolicy,
  seededContextFor,
} from '../src/candidate/candidate-context.ts';

const lexeme = (id: string) => {
  const found = findLexemeById(id);
  if (found === null) throw new Error(`seed lexeme ${id} is missing`);
  return found;
};

describe('the excerpt always comes from the seed', () => {
  it('finds a seeded sentence for the canonical target', () => {
    const context = seededContextFor(lexeme('lex-bunkiten'));
    expect(context).not.toBeNull();
    expect(context?.contentClass).toBe('seeded-fixture');
    expect(context?.targetForm).toBe('分岐点');
    expect(context?.excerpt).toContain('分岐点');
  });

  it('falls back to a passage line when no sentence contains the word', () => {
    const context = seededContextFor(lexeme('lex-bunki'));
    expect(context).not.toBeNull();
    expect(context?.seedRef).toBe('pas-bunki-01');
    expect(context?.excerpt).toContain('分岐');
  });

  it('quotes a whole sentence, never a fragment', () => {
    for (const seedLexeme of seedDataset.lexemes) {
      const context = seededContextFor(seedLexeme);
      if (context === null) continue;
      expect(context.excerpt.endsWith('。'), context.excerpt).toBe(true);
    }
  });

  it('names a real seed record every time', () => {
    const ids = new Set([
      ...seedDataset.sentences.map((sentence) => sentence.id),
      ...seedDataset.passages.map((passage) => passage.id),
    ]);
    for (const seedLexeme of seedDataset.lexemes) {
      const context = seededContextFor(seedLexeme);
      if (context === null) continue;
      expect(ids.has(context.seedRef), context.seedRef).toBe(true);
    }
  });

  it('returns null rather than inventing context for an unseeded word', () => {
    const orphan = { ...lexeme('lex-bunki'), id: 'lex-nowhere', headword: '存在しない語' };
    expect(seededContextFor(orphan)).toBeNull();
  });

  it('says why, in words a screen can render', () => {
    expect(NO_SEEDED_CONTEXT_NOTE).toMatch(/never your own encounters/i);
  });
});

describe('the allowlist is derived from the dataset', () => {
  const policy = seededContentPolicy();

  it('permits every context the app can actually build', () => {
    for (const seedLexeme of seedDataset.lexemes) {
      const context = seededContextFor(seedLexeme);
      if (context === null) continue;
      expect(() => policy.assertPermitted(context), seedLexeme.headword).not.toThrow();
    }
  });

  it('refuses a sentence the learner wrote', () => {
    expect(() =>
      policy.assertPermitted({
        contentClass: 'seeded-fixture',
        targetForm: '分岐',
        excerpt: '今日は分岐について考えた。',
        seedRef: 'pas-bunki-01',
      }),
    ).toThrow(AiContentNotPermittedError);
  });

  it('refuses a form the seed does not hold, even inside seeded text', () => {
    expect(() =>
      policy.assertPermitted({
        contentClass: 'seeded-fixture',
        targetForm: '好き',
        excerpt: '子どものころ、私はこの分岐点が好きだった。',
        seedRef: 'pas-bunki-01',
      }),
    ).toThrow(AiContentNotPermittedError);
  });

  it('is named, so a report can say which policy ran', () => {
    expect(policy.name).toContain('@bunki/seed');
  });
});

describe('passageSentences', () => {
  it('keeps the delimiter and drops nothing', () => {
    const parts = passageSentences('一つ目。二つ目。');
    expect(parts).toEqual(['一つ目。', '二つ目。']);
  });

  it('handles a passage with no final delimiter without losing the tail', () => {
    expect(passageSentences('一つ目。末尾')).toEqual(['一つ目。', '末尾']);
  });
});
