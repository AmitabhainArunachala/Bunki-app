/**
 * The scripted fallback (WP-07 closure predicate item 3; T-10, T-11).
 *
 * The predicate says the fixtures must "cover the seeded target". That is
 * checked here against `@bunki/seed` itself rather than against a copy of the
 * expected answer: the fixture excerpts are quoted text, and quoted text drifts.
 * If a seed sentence is reworded and a fixture is not, this fails.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CANDIDATE_LABEL,
  FALLBACK_FIXTURES,
  FALLBACK_MODEL_ID,
  fallbackFixtureFor,
  isOfflineFallback,
  noFixtureText,
  OFFLINE_FALLBACK_LABEL,
  OFFLINE_FALLBACK_PROVIDER,
  parseAiRequestEnvelope,
  serveFallbackCandidate,
  TASK_CLASS,
  type AiRequestEnvelope,
  type AiThreadContext,
} from '../src/index.ts';

const SEED_DATA = resolve(dirname(fileURLToPath(import.meta.url)), '../../seed/data');

const readSeed = (file: string): { records: Record<string, unknown>[] } =>
  JSON.parse(readFileSync(resolve(SEED_DATA, file), 'utf8')) as {
    records: Record<string, unknown>[];
  };

const context = (overrides: Partial<AiThreadContext> = {}): AiThreadContext => ({
  contentClass: 'seeded-fixture',
  targetForm: '分岐',
  excerpt: '子どものころ、私はこの分岐点が好きだった。',
  seedRef: 'pas-bunki-01',
  ...overrides,
});

const requestFor = (ctx: AiThreadContext): AiRequestEnvelope =>
  parseAiRequestEnvelope({
    taskClass: TASK_CLASS,
    inputHash: 'hash',
    promptFamilyId: 'family',
    promptVersion: 'v1',
    threadContext: ctx,
    maxTokens: 400,
  });

const serve = (ctx: AiThreadContext = context()) =>
  serveFallbackCandidate(requestFor(ctx), {
    now: () => '2026-07-27T09:00:00.000Z',
    nextCandidateId: () => 'candidate-0001',
  });

describe('the fixtures cover the seeded 分岐 target (OD-02)', () => {
  it('answers for the default canonical target', () => {
    expect(fallbackFixtureFor('分岐')).not.toBeNull();
  });

  it('answers for every 分岐-family word the seed passage uses', () => {
    for (const form of ['分岐', '分岐点', '岐路', '分かれる']) {
      expect(fallbackFixtureFor(form), form).not.toBeNull();
    }
  });

  it('quotes seed text verbatim, so a reworded seed fails here', () => {
    const sentences = readSeed('sentences.json').records;
    const passages = readSeed('passages.json').records;

    for (const fixture of FALLBACK_FIXTURES) {
      const sentence = sentences.find((record) => record['id'] === fixture.seedRef);
      if (sentence !== undefined) {
        expect(sentence['japanese'], fixture.seedRef).toBe(fixture.excerpt);
        continue;
      }
      const passage = passages.find((record) => record['id'] === fixture.seedRef);
      expect(passage, `seedRef ${fixture.seedRef} names no seed record`).toBeDefined();
      expect(String(passage?.['body']), fixture.seedRef).toContain(fixture.excerpt);
    }
  });

  it('writes each explanation so the deterministic check passes on its merits', () => {
    for (const fixture of FALLBACK_FIXTURES) {
      expect(fixture.explanation, fixture.targetForm).toContain(fixture.targetForm);
      expect(fixture.excerpt, fixture.targetForm).toContain(fixture.targetForm);
    }
  });

  it('makes no claim REQ-GATE-03 forbids', () => {
    const text = FALLBACK_FIXTURES.map((f) => f.explanation).join('\n');
    expect(text).not.toMatch(/scientifically\s+optimi[sz]ed/i);
    expect(text).not.toMatch(/\bguaranteed\b/i);
    expect(text).not.toMatch(/\byour\s+level\b/i);
    expect(text).not.toMatch(/\bfluency\s+score\b/i);
    expect(text).not.toMatch(/\d+\s*%/);
    // REQ-SRC-05: never generate etymology, not even in hand-written fixtures.
    expect(text).not.toMatch(/\betymolog|\boriginally\s+meant|\bderives\s+from\b/i);
  });

  it('matches a form NFKC-folded and trimmed', () => {
    expect(fallbackFixtureFor('  分岐 ')).not.toBeNull();
  });
});

describe('a fixture-served candidate is a complete, labelled envelope', () => {
  it('validates against the same schema as a live one', () => {
    const envelope = serve();
    expect(envelope.candidateId).toBe('candidate-0001');
    expect(envelope.checks.isLabeled).toBe(true);
    expect(envelope.createdAt).toBe('2026-07-27T09:00:00.000Z');
  });

  it('records the fallback in the provider field, which reaches the event log', () => {
    const envelope = serve();
    expect(envelope.provider).toBe(OFFLINE_FALLBACK_PROVIDER);
    expect(envelope.provider).toBe(OFFLINE_FALLBACK_LABEL);
    expect(envelope.model).toBe(FALLBACK_MODEL_ID);
    expect(isOfflineFallback(envelope)).toBe(true);
  });

  it('is never mistaken for a live candidate', () => {
    expect(OFFLINE_FALLBACK_LABEL).not.toBe(CANDIDATE_LABEL);
  });

  it('computes targetFormPresent rather than asserting it', () => {
    expect(serve().checks.targetFormPresent).toBe(true);
  });

  it('serves an honest empty answer for an uncovered form instead of failing', () => {
    const envelope = serve(
      context({ targetForm: '線路', excerpt: '線路はこの先で二つに分かれる。' }),
    );
    expect(envelope.payload.explanation).toBe(noFixtureText('線路'));
    expect(envelope.payload.explanation).toMatch(/nothing to show/i);
    expect(envelope.provider).toBe(OFFLINE_FALLBACK_PROVIDER);
  });

  it('is deterministic — two servings of one request are identical', () => {
    expect(JSON.stringify(serve())).toBe(JSON.stringify(serve()));
  });
});
