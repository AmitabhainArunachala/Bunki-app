import { describe, expect, it } from 'vitest';
import { canPerformArticleOperation, normalizeArticleIntake } from '../src/index.ts';
import { BODY, NOW, context, metadata } from './fixtures.ts';

describe('user-supplied source semantics', () => {
  const local = { status: 'allowed' as const, basis: { kind: 'user-action' as const,
    reference: 'local-capture:test', checkedAt: NOW } };
  it('admits exact personal text without publisher, original-author or editorial claims', () => {
    const candidate = normalizeArticleIntake(metadata({ canonicalUrl: null }), context({
      lineage: { kind: 'user-supplied' },
      capabilities: { 'display-body': local, 'retain-offline': local, 'quote-extract': local },
    }));
    expect(candidate.article.body?.text).toBe(BODY);
    expect(candidate.article.lineage).toEqual({ kind: 'user-supplied' });
    expect(candidate.editorial.status).toBe('pending');
    expect(candidate.automaticChecks.factualAccuracy).toBe('not-checked');
    expect(canPerformArticleOperation(candidate.article, 'quote-extract')).toBe(true);
    expect(canPerformArticleOperation(candidate.article, 'ai-transform')).toBe(false);
  });
  for (const operation of ['sync-body', 'ai-transform', 'synthesize-audio', 'redistribute-audio']) {
    it(`a capture action cannot grant ${operation}`, () => {
      expect(() => normalizeArticleIntake(metadata(), context({ lineage: { kind: 'user-supplied' },
        capabilities: { 'display-body': local, [operation]: local },
      }))).toThrow('operation-not-permitted');
    });
  }
});
