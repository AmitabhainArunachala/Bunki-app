/**
 * T-09, extended with an adapter-specific attempt (WP-07 closure predicate
 * item 4; controller §6.2, §19 WP-07 stop condition; REQ-ARCH-04).
 *
 * `packages/domain/test/evidence/gate.test.ts` already proves T-09 from the
 * kernel's side: hand-built candidate shapes are refused by the gate. What it
 * cannot prove is the thing WP-07 actually introduces — that **real output from
 * the real adapter**, produced by the real runtime, is refused too. A guard
 * written against an imagined shape and a guard written against the shipped one
 * are different guards, and only the second is worth anything.
 *
 * So every attempt below starts from a genuine `requestCandidate` result and
 * tries, in turn, to get it into the scheduler. This is the file that would go
 * red if `@bunki/ai` were widened in a way that made its output evidence-shaped
 * — which controller §19 makes a stop condition, not a defect to triage.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  admitToScheduler,
  assertNotCandidate,
  CandidateEvidenceBoundaryError,
  createDeterministicContext,
  createDomainEvent,
  emptyTargetThreadIndex,
  EvidenceFactoryBoundaryError,
  isEvidenceEventType,
  parseEvent,
  type DomainEvent,
  type EvidenceGateContext,
} from '@bunki/domain';

import {
  createAiRuntime,
  createAnthropicProvider,
  API_KEY_ENV_VAR,
  toCandidateEnvelopeMetadata,
  type AiCandidateOutcome,
  type AiThreadContext,
} from '../src/index.ts';
import {
  createFakeFetch,
  createIdSequence,
  createScriptedClock,
  createTestPlatform,
  messagesResponse,
} from './support/harness.ts';

const CONTEXT: AiThreadContext = {
  contentClass: 'seeded-fixture',
  targetForm: '分岐',
  excerpt: '子どものころ、私はこの分岐点が好きだった。',
  seedRef: 'pas-bunki-01',
};

/** A real outcome from the real runtime, through the real provider client. */
async function realOutcome(): Promise<AiCandidateOutcome> {
  const fake = createFakeFetch({
    kind: 'json',
    body: messagesResponse('分岐 marks where a line divides into branches.'),
  });
  const runtime = createAiRuntime({
    provider: createAnthropicProvider({ fetch: fake.fetch, env: { [API_KEY_ENV_VAR]: 'k' } }),
    clock: createScriptedClock(),
    nextCandidateId: createIdSequence(),
    platform: createTestPlatform(fake.fetch),
  });
  return runtime.requestCandidate({ context: CONTEXT });
}

const emptyGateContext = (): EvidenceGateContext => ({
  contracts: new Map(),
  invalidContractIds: new Set(),
  threadIndex: emptyTargetThreadIndex(),
  promotionByThread: new Map(),
  deletedThreadIds: new Set(),
  supersededEventIds: new Set(),
});

describe('T-09 (adapter): real @bunki/ai output cannot reach the scheduler', () => {
  it('is refused when the whole envelope is offered as an observation', async () => {
    const { envelope } = await realOutcome();
    expect(() => assertNotCandidate(envelope)).toThrow(CandidateEvidenceBoundaryError);
  });

  it('is refused after a JSON round trip, where classes do not survive', async () => {
    const { envelope } = await realOutcome();
    const smuggled: unknown = JSON.parse(JSON.stringify(envelope));
    expect(() => assertNotCandidate(smuggled)).toThrow(CandidateEvidenceBoundaryError);
  });

  it('is refused when dressed up as a graded review', async () => {
    const { envelope } = await realOutcome();
    const dressed = {
      type: 'ReviewGraded',
      contractId: 'contract-meaning',
      grade: 'easy',
      candidateId: envelope.candidateId,
      payload: envelope.payload,
    };
    expect(() => assertNotCandidate(dressed)).toThrow(CandidateEvidenceBoundaryError);
  });

  it('is refused when its request envelope is offered instead', async () => {
    const { request } = await realOutcome();
    expect(() => assertNotCandidate(request)).toThrow(CandidateEvidenceBoundaryError);
  });

  it('is refused when the CandidateAttached event it produces reaches the gate', async () => {
    const { request, envelope } = await realOutcome();
    const context = createDeterministicContext({
      instants: ['2026-07-27T09:00:00.000Z'],
      seed: 1,
    });
    const attached: DomainEvent = createDomainEvent(
      context,
      'CandidateAttached',
      {
        threadId: 'thread-1',
        candidateId: envelope.candidateId,
        envelope: toCandidateEnvelopeMetadata(request, envelope),
        status: 'generated',
      },
      { idempotencyKey: `candidate:${envelope.candidateId}` },
    );

    expect(() => admitToScheduler(attached, emptyGateContext())).toThrow(
      CandidateEvidenceBoundaryError,
    );
  });

  it('is refused when its telemetry record is offered as an observation', async () => {
    const { route } = await realOutcome();
    expect(() => assertNotCandidate(route)).toThrow(CandidateEvidenceBoundaryError);
  });
});

describe('T-09 (adapter): the metadata that IS allowed into the log is still not evidence', () => {
  it('parses as CandidateAttached, which is not an evidence family', async () => {
    const { request, envelope } = await realOutcome();
    const parsed = parseEvent({
      type: 'CandidateAttached',
      eventId: 'event-1',
      v: 1,
      occurredAt: '2026-07-27T09:00:00.000Z',
      idempotencyKey: 'k',
      threadId: 'thread-1',
      candidateId: envelope.candidateId,
      envelope: toCandidateEnvelopeMetadata(request, envelope),
      status: 'generated',
    });

    expect(isEvidenceEventType(parsed.type)).toBe(false);
  });

  it('cannot be turned into an evidence event by the kernel factory', () => {
    const context = createDeterministicContext({
      instants: ['2026-07-27T09:00:00.000Z'],
      seed: 1,
    });
    expect(() =>
      // @ts-expect-error — the factory's type parameter excludes evidence families.
      createDomainEvent(context, 'ReviewGraded', {}, { idempotencyKey: 'k' }),
    ).toThrow(EvidenceFactoryBoundaryError);
  });
});

// ---------------------------------------------------------------------------
// Source-level: the package has no way in
// ---------------------------------------------------------------------------

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (['.ts', '.tsx'].includes(extname(full))) out.push(full);
  }
  return out;
}

/** Source with comments stripped: this file's subjects must be nameable in prose. */
const code = (file: string): string =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const sources = walk(SRC);
const rel = (file: string): string => relative(SRC, file);

/**
 * Every module specifier in a file, across every import form.
 *
 * Static `from '…'`, side-effect `import '…'`, dynamic `import('…')` and
 * `require('…')`. Comments are already stripped by `code()`, so prose that
 * names a package cannot trip a scan built on this.
 */
const SPECIFIER_PATTERN =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;

function specifiersOf(file: string): string[] {
  return [...code(file).matchAll(SPECIFIER_PATTERN)].map(([, specifier]) => specifier ?? '');
}

describe('T-09 (adapter): the package constructs no evidence and reaches no canonical data', () => {
  it('never calls the kernel event factory', () => {
    expect(sources.filter((f) => code(f).includes('createDomainEvent')).map(rel)).toEqual([]);
  });

  it('never names an evidence-class family in code', () => {
    const families = [
      'ReviewGraded',
      'ProductionObserved',
      'ExposureLogged',
      'LookupFrictionLogged',
      'EvidenceSuperseded',
    ];
    for (const family of families) {
      expect(sources.filter((f) => code(f).includes(family)).map(rel), family).toEqual([]);
    }
  });

  it('never imports the evidence gate or a scheduler reducer', () => {
    for (const file of sources) {
      const source = code(file);
      expect(source, rel(file)).not.toMatch(/admitToScheduler|memoryStateReducer/);
      expect(source, rel(file)).not.toMatch(/\bfsrs\b/i);
    }
  });

  it('imports @bunki/domain only for a schema, a type, and a serialiser', () => {
    const importers = sources.filter((f) => code(f).includes('@bunki/domain'));
    expect(importers.map(rel).sort()).toEqual(['envelope.ts', 'hash.ts']);
    expect(code(resolve(SRC, 'hash.ts'))).toContain('canonicalJson');
    expect(code(resolve(SRC, 'envelope.ts'))).toContain('isoInstantSchema');
  });

  /**
   * The other half of controller §9's sentence — "nothing in `@bunki/ai` can
   * touch canonical fields" — which had no enforcement at all until V6's
   * verification pass said so.
   *
   * `@bunki/seed` is where the canonical fields live: headwords, readings,
   * meanings, kanji records. Its exports are live shared objects and are **not**
   * frozen, so a single `import { findLexeme } from '@bunki/seed'` in this
   * package would be enough to rewrite a headword for every reader in the
   * process. V6 proved that by doing it. Nothing in the shipped code does — but
   * "nothing does" and "nothing can" are different claims, and only the first
   * one was ever true here.
   *
   * This scan makes the first claim *enforced*: adding the import turns this
   * suite red, in CI, on the commit that adds it. It deliberately does not
   * claim to be the second: a source scan is a build-time gate inside one
   * package, not a capability bound. The two controls that would make it a
   * capability bound are filed as coordination requests in the capsule — an
   * eslint rule (CON owns `eslint.config.mjs`, locked this wave) and deep-frozen
   * seed exports (WP-04's surface).
   */
  it('never imports @bunki/seed, by specifier or by relative path', () => {
    const offenders = sources.filter((file) =>
      specifiersOf(file).some((specifier) => {
        if (specifier === '@bunki/seed' || specifier.startsWith('@bunki/seed/')) return true;
        if (!/^\.\.?(\/|$)/.test(specifier)) return false;
        const resolved = resolve(dirname(file), specifier).split(/[\\/]/).join('/');
        return resolved.includes('/packages/seed');
      }),
    );

    expect(offenders.map(rel)).toEqual([]);
  });

  it('names no seed accessor, so a re-export could not smuggle one in', () => {
    for (const file of sources) {
      expect(code(file), rel(file)).not.toMatch(
        /\b(findLexeme|findKanji|seedDataset|allSeedRecords)\b/,
      );
    }
  });

  it('makes no claim REQ-GATE-03 forbids', () => {
    const patterns = [
      /scientifically\s+optimi[sz]ed/i,
      /proven\s+to\s+(improve|increase|boost)/i,
      /reduce[sd]?\s+(your\s+)?review\s+burden/i,
      /guaranteed\s+(recall|retention|fluency)/i,
      /\bfluency\s+score\b/i,
    ];
    for (const pattern of patterns) {
      const offenders = sources.filter((f) => pattern.test(readFileSync(f, 'utf8')));
      expect(offenders.map(rel), String(pattern)).toEqual([]);
    }
  });
});
