/**
 * Observability without content, and the no-live-calls guarantee (WP-07
 * closure predicate item 5; controller §9, §12, §15, REQ-ARCH-07).
 *
 * The first suite proves a negative the only way a negative can be proved
 * cheaply: drive a full request cycle with distinctive text on both sides, then
 * assert none of it appears anywhere in the serialised ring. A field-list
 * assertion alone would pass a record that had grown a nested object.
 *
 * The second is the standing guarantee behind "no live calls in tests": this
 * package never reaches an ambient network, so the suite is offline-safe by
 * construction and the OD-08 live-call gate stays honestly open.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  AiTelemetryContentError,
  assertNoMessageContent,
  combineTelemetrySinks,
  createAiRouteRing,
  createAiRuntime,
  createAnthropicProvider,
  API_KEY_ENV_VAR,
  MAX_MODEL_ID_CHARS,
  NULL_TELEMETRY_SINK,
  toCandidateEnvelopeMetadata,
  type AiRouteRecord,
  type AiThreadContext,
} from '../src/index.ts';
import {
  createFakeFetch,
  createIdSequence,
  createScriptedClock,
  createTestPlatform,
  messagesResponse,
} from './support/harness.ts';

const LEARNER_TEXT = 'ZZ-the-learner-typed-this-sentence-ZZ';
const MODEL_TEXT = 'ZZ-the-model-answered-this-ZZ';

const CONTEXT: AiThreadContext = {
  contentClass: 'seeded-fixture',
  targetForm: '分岐',
  excerpt: LEARNER_TEXT,
  seedRef: 'pas-bunki-01',
};

describe('the observability ring records route metadata and nothing else', () => {
  it('holds no trace of the request or the answer', async () => {
    const fake = createFakeFetch({ kind: 'json', body: messagesResponse(`分岐 ${MODEL_TEXT}`) });
    const ring = createAiRouteRing();
    const runtime = createAiRuntime({
      provider: createAnthropicProvider({ fetch: fake.fetch, env: { [API_KEY_ENV_VAR]: 'k' } }),
      clock: createScriptedClock(),
      nextCandidateId: createIdSequence(),
      platform: createTestPlatform(fake.fetch),
      telemetry: ring,
      // The excerpt is deliberately un-seeded text; permit it so the live route
      // runs and the ring gets a live record to be searched.
      contentPolicy: { name: 'test-permit-all', assertPermitted: () => undefined },
    });

    const outcome = await runtime.requestCandidate({ context: CONTEXT });
    const serialised = JSON.stringify(ring.entries());

    expect(ring.entries()).toHaveLength(1);
    expect(serialised).not.toContain(LEARNER_TEXT);
    expect(serialised).not.toContain(MODEL_TEXT);
    // What it does hold: the four things controller §9 asks to be logged.
    expect(ring.entries()[0]?.taskClass).toBe('T2');
    expect(ring.entries()[0]?.latencyMs).toBeTypeOf('number');
    expect(ring.entries()[0]?.inputTokens).toBe(210);
    expect(ring.entries()[0]?.outcome).toBe('live');
    expect(outcome.route).toEqual(ring.entries()[0]);
  });

  it('records fallback use as its own outcome with a named reason', async () => {
    const fake = createFakeFetch({ kind: 'throw', error: new Error('offline') });
    const ring = createAiRouteRing();
    const runtime = createAiRuntime({
      provider: createAnthropicProvider({ fetch: fake.fetch, env: { [API_KEY_ENV_VAR]: 'k' } }),
      clock: createScriptedClock(),
      nextCandidateId: createIdSequence(),
      platform: createTestPlatform(fake.fetch),
      telemetry: ring,
    });

    await runtime.requestCandidate({
      context: { ...CONTEXT, excerpt: '子どものころ、私はこの分岐点が好きだった。' },
    });

    expect(ring.entries()[0]?.outcome).toBe('fallback');
    expect(ring.entries()[0]?.fallbackReason).toBe('offline');
    expect(ring.entries()[0]?.inputTokens).toBeNull();
  });

  it('holds no trace of a marker the provider stuffed into an identifier field', async () => {
    // V6's probe, turned into a standing test. `model` is copied out of the
    // provider's own answer and flows into the ring *and* into
    // `CandidateAttached.envelope.model`, which is persisted and exported. It
    // was `nonEmptyString` with no ceiling, so this exact response put 5029
    // characters of provider-chosen text into a log controller §12 says must
    // never hold message content.
    const stuffed = `${MODEL_TEXT}${'A'.repeat(5000)}`;
    const fake = createFakeFetch({
      kind: 'json',
      body: messagesResponse('分岐 marks where a line divides.', { model: stuffed }),
    });
    const ring = createAiRouteRing();
    const runtime = createAiRuntime({
      provider: createAnthropicProvider({ fetch: fake.fetch, env: { [API_KEY_ENV_VAR]: 'k' } }),
      clock: createScriptedClock(),
      nextCandidateId: createIdSequence(),
      platform: createTestPlatform(fake.fetch),
      telemetry: ring,
      contentPolicy: { name: 'test-permit-all', assertPermitted: () => undefined },
    });

    const outcome = await runtime.requestCandidate({ context: CONTEXT });

    // The envelope ceiling rejects it, so it is not a live candidate at all —
    // the same treatment as any other oversized answer (controller §17.2).
    expect(outcome.route.outcome).toBe('fallback');
    expect(outcome.route.fallbackReason).toBe('invalid_response');

    // Not in the ring, not in the envelope, not in the metadata that reaches
    // the event log.
    expect(JSON.stringify(ring.entries())).not.toContain(MODEL_TEXT);
    expect(ring.entries()[0]?.model.length).toBeLessThanOrEqual(MAX_MODEL_ID_CHARS);
    expect(outcome.envelope.model).not.toContain(MODEL_TEXT);
    expect(toCandidateEnvelopeMetadata(outcome.request, outcome.envelope).model).not.toContain(
      MODEL_TEXT,
    );
  });

  it('refuses an over-long identifier even in a record built through `any`', () => {
    const base = {
      taskClass: 'T2',
      outcome: 'live',
      fallbackReason: null,
      provider: 'anthropic',
      model: 'claude-opus-5',
      promptFamilyId: 'f',
      promptVersion: 'v',
      inputHash: 'h',
      latencyMs: 1,
      maxTokens: 1,
      inputTokens: 1,
      outputTokens: 1,
      targetFormPresent: true,
      createdAt: '2026-07-27T09:00:00.000Z',
    };

    const oversized = { ...base, model: 'x'.repeat(MAX_MODEL_ID_CHARS + 1) };
    expect(() => assertNoMessageContent(oversized as unknown as AiRouteRecord)).toThrow(
      AiTelemetryContentError,
    );
    expect(() => createAiRouteRing().record(oversized as unknown as AiRouteRecord)).toThrow(
      AiTelemetryContentError,
    );

    // The rejection names the field and the lengths — never the value, or the
    // control would move the leak into its own error message.
    try {
      assertNoMessageContent(oversized as unknown as AiRouteRecord);
      expect.unreachable('the oversized record should have been refused');
    } catch (error) {
      expect(error).toBeInstanceOf(AiTelemetryContentError);
      expect((error as AiTelemetryContentError).violation).toBe('oversized-value');
      expect((error as Error).message).not.toContain('xxxx');
    }

    // A nested object in an identifier field is refused too: a closed field set
    // that admitted `{ model: { leak } }` would serialise the leak into the ring.
    const nested = { ...base, model: { leak: LEARNER_TEXT } };
    expect(() => assertNoMessageContent(nested as unknown as AiRouteRecord)).toThrow(
      AiTelemetryContentError,
    );
  });

  it('refuses a record that grew a content field', () => {
    const record = {
      taskClass: 'T2',
      outcome: 'live',
      fallbackReason: null,
      provider: 'anthropic',
      model: 'm',
      promptFamilyId: 'f',
      promptVersion: 'v',
      inputHash: 'h',
      latencyMs: 1,
      maxTokens: 1,
      inputTokens: 1,
      outputTokens: 1,
      targetFormPresent: true,
      createdAt: '2026-07-27T09:00:00.000Z',
      prompt: LEARNER_TEXT,
    } as unknown as AiRouteRecord;

    expect(() => assertNoMessageContent(record)).toThrow(AiTelemetryContentError);
    expect(() => createAiRouteRing().record(record)).toThrow(AiTelemetryContentError);
  });

  it('bounds itself so a long session cannot grow without limit', () => {
    const ring = createAiRouteRing(2);
    const base: AiRouteRecord = {
      taskClass: 'T2',
      outcome: 'fallback',
      fallbackReason: 'offline',
      provider: 'offline-fallback',
      model: 'm',
      promptFamilyId: 'f',
      promptVersion: 'v',
      inputHash: 'h',
      latencyMs: 1,
      maxTokens: 1,
      inputTokens: null,
      outputTokens: null,
      targetFormPresent: true,
      createdAt: '2026-07-27T09:00:00.000Z',
    };
    for (const hash of ['a', 'b', 'c']) ring.record({ ...base, inputHash: hash });

    expect(ring.entries().map((entry) => entry.inputHash)).toEqual(['b', 'c']);
    ring.clear();
    expect(ring.entries()).toEqual([]);
  });

  it('fans out to several sinks, so WP-09 can attach without this package knowing', () => {
    const a = createAiRouteRing();
    const b = createAiRouteRing();
    const combined = combineTelemetrySinks(a, b, NULL_TELEMETRY_SINK);
    combined.record({
      taskClass: 'T2',
      outcome: 'live',
      fallbackReason: null,
      provider: 'anthropic',
      model: 'm',
      promptFamilyId: 'f',
      promptVersion: 'v',
      inputHash: 'h',
      latencyMs: 1,
      maxTokens: 1,
      inputTokens: 1,
      outputTokens: 1,
      targetFormPresent: true,
      createdAt: '2026-07-27T09:00:00.000Z',
    });
    expect(a.entries()).toHaveLength(1);
    expect(b.entries()).toHaveLength(1);
  });

  it('rejects a nonsensical capacity rather than silently choosing one', () => {
    expect(() => createAiRouteRing(0)).toThrow(RangeError);
    expect(() => createAiRouteRing(1.5)).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// No live calls
// ---------------------------------------------------------------------------

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const TEST = resolve(dirname(fileURLToPath(import.meta.url)), '.');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (['.ts'].includes(extname(full))) out.push(full);
  }
  return out;
}

const code = (file: string): string =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('no test in this package can reach the network (OD-08 stays open)', () => {
  it('never calls a bare fetch — every call goes through the injected one', () => {
    const offenders = walk(SRC)
      .filter((file) => /(^|[^.\w])fetch\s*\(/.test(code(file)))
      .filter((file) => !code(file).includes('options.fetch('))
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it('reads the ambient platform in exactly one module, behind a guard', () => {
    const readers = walk(SRC)
      .filter((file) => code(file).includes('globalThis'))
      .map((file) => relative(SRC, file));
    expect(readers).toEqual(['platform.ts']);
  });

  it('never injects the ambient platform from a test', () => {
    const offenders = walk(TEST)
      .filter((file) => /ambientPlatform\s*\(|ambientFetch\s*\(/.test(code(file)))
      .map((file) => relative(TEST, file));
    expect(offenders).toEqual([]);
  });

  it('has no real endpoint anywhere in the test tree', () => {
    const offenders = walk(TEST)
      .filter((file) => /https?:\/\/(?!example)/.test(code(file)))
      .map((file) => relative(TEST, file));
    expect(offenders).toEqual([]);
  });
});
