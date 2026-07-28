/**
 * Accepting a candidate is an explicit user action (WP-07 closure predicate
 * item 4; controller §9, §6.1, REQ-ARCH-04).
 *
 * The predicate has three parts and this file takes each in turn:
 *
 *  1. accepting produces `CandidateAcceptedAsNote` **through the domain command
 *     flow** — the store's validated factory, not an object literal;
 *  2. it is an **explicit** action — nothing attaches, times, or infers it;
 *  3. nothing about the candidate reaches canonical or memory state.
 *
 * The third is the one worth being careful about, because it is a negative: the
 * assertion is over the *whole event log* the flow produced, not over the one
 * event the test happened to look at.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  assertNotCandidate,
  CandidateEvidenceBoundaryError,
  createDeterministicContext,
  isEvidenceEventType,
  parseEvent,
  type CandidateEnvelopeMetadata,
  type DomainContext,
} from '@bunki/domain';

import { createMemoryAppStore } from '../src/state/memory-store.ts';
import type { AppStore } from '../src/state/store.ts';

const SOURCE = { sourceId: 'manual-entry', kind: 'manual', locator: 'capture-screen' } as const;
const PROVENANCE = {
  source: 'user_encounter',
  license: 'user_owned',
  modificationStatus: 'unmodified',
  reviewStatus: 'unreviewed',
} as const;

const ENVELOPE: CandidateEnvelopeMetadata = {
  taskClass: 'T2',
  inputHash: 'hash-1',
  promptFamilyId: 'bunki.candidate.bounded-explanation',
  promptVersion: '2026-07-27.1',
  model: 'claude-opus-5',
  provider: 'anthropic',
  createdAt: '2026-07-27T09:00:02.000Z',
  checks: { targetFormPresent: true, isLabeled: true },
};

const TEXT = '分岐 is the noun for a split into branches.';

function newContext(): DomainContext {
  return createDeterministicContext({
    instants: Array.from(
      { length: 40 },
      (_v, index) => `2026-07-27T09:00:${String(index).padStart(2, '0')}.000Z`,
    ),
    seed: 7,
  });
}

/** A store holding one kept thread with one attached candidate. */
function storeWithCandidate(): { store: AppStore; threadId: string; candidateId: string } {
  const store = createMemoryAppStore({ context: newContext() });
  const { threadId } = store.execute({
    kind: 'capture',
    text: '分岐',
    sourceRef: SOURCE,
    provenance: PROVENANCE,
    uncertainty: null,
    lexemeId: 'lex-bunki',
  });

  const candidateId = 'candidate-0001';
  store.execute({ kind: 'attachCandidate', threadId, candidateId, envelope: ENVELOPE, text: TEXT });
  return { store, threadId, candidateId };
}

describe('attaching a candidate', () => {
  it('records the envelope metadata and not the text', () => {
    const { store, candidateId } = storeWithCandidate();
    const attached = store.readAll().find((event) => event.type === 'CandidateAttached');

    expect(attached).toBeDefined();
    expect(JSON.stringify(attached)).not.toContain(TEXT);
    expect(JSON.stringify(attached)).toContain(candidateId);
  });

  it('keeps the text in the snapshot, marked as not yet accepted', () => {
    const { store, threadId, candidateId } = storeWithCandidate();
    const view = store.getSnapshot().candidatesByThread[threadId]?.[0];

    expect(view?.candidateId).toBe(candidateId);
    expect(view?.text).toBe(TEXT);
    expect(view?.status).toBe('generated');
    expect(view?.acceptedAt).toBeNull();
  });

  it('is not an acceptance — no CandidateAcceptedAsNote is written', () => {
    const { store } = storeWithCandidate();
    expect(store.readAll().map((event) => event.type)).toEqual([
      'EncounterCaptured',
      'CandidateAttached',
    ]);
  });

  it('collapses a repeated attach of the same candidate', () => {
    const { store, threadId, candidateId } = storeWithCandidate();
    const ack = store.execute({
      kind: 'attachCandidate',
      threadId,
      candidateId,
      envelope: ENVELOPE,
      text: TEXT,
    });

    expect(ack.deduplicated).toBe(true);
    expect(ack.events).toEqual([]);
    expect(store.getSnapshot().candidates).toHaveLength(1);
  });

  it('refuses a thread that does not exist', () => {
    const store = createMemoryAppStore({ context: newContext() });
    expect(() =>
      store.execute({
        kind: 'attachCandidate',
        threadId: 'thread-nope',
        candidateId: 'c-1',
        envelope: ENVELOPE,
        text: TEXT,
      }),
    ).toThrow(/unknown thread/);
  });
});

describe('accepting a candidate is an explicit user action', () => {
  it('produces CandidateAcceptedAsNote with userAction true', () => {
    const { store, candidateId } = storeWithCandidate();
    const ack = store.execute({ kind: 'acceptCandidate', candidateId });

    const [event] = ack.events;
    expect(event?.type).toBe('CandidateAcceptedAsNote');
    expect(event).toMatchObject({ candidateId, userAction: true });
  });

  it('emits an event the kernel parser accepts', () => {
    const { store, candidateId } = storeWithCandidate();
    const [event] = store.execute({ kind: 'acceptCandidate', candidateId }).events;
    expect(() => parseEvent(event)).not.toThrow();
  });

  it('marks the candidate accepted with the injected clock', () => {
    const { store, candidateId } = storeWithCandidate();
    store.execute({ kind: 'acceptCandidate', candidateId });

    const view = store.getSnapshot().candidates[0];
    expect(view?.status).toBe('accepted');
    expect(view?.acceptedAt).toMatch(/^2026-07-27T09:00:\d\d\.000Z$/);
  });

  it('collapses a double tap to one acceptance', () => {
    const { store, candidateId } = storeWithCandidate();
    store.execute({ kind: 'acceptCandidate', candidateId });
    const second = store.execute({ kind: 'acceptCandidate', candidateId });

    expect(second.deduplicated).toBe(true);
    expect(
      store.readAll().filter((event) => event.type === 'CandidateAcceptedAsNote'),
    ).toHaveLength(1);
  });

  it('refuses a candidate that was never attached', () => {
    const store = createMemoryAppStore({ context: newContext() });
    expect(() => store.execute({ kind: 'acceptCandidate', candidateId: 'c-nope' })).toThrow(
      /unknown candidate/,
    );
  });
});

describe('nothing in the flow reaches canonical or memory state (T-09)', () => {
  it('writes only non-evidence families across the whole log', () => {
    const { store, candidateId } = storeWithCandidate();
    store.execute({ kind: 'acceptCandidate', candidateId });

    for (const event of store.readAll()) {
      expect(isEvidenceEventType(event.type), event.type).toBe(false);
    }
  });

  it('produces candidate events the gate guard refuses on sight', () => {
    const { store, candidateId } = storeWithCandidate();
    store.execute({ kind: 'acceptCandidate', candidateId });

    for (const event of store.readAll()) {
      if (!event.type.startsWith('Candidate')) continue;
      expect(() => assertNotCandidate(event), event.type).toThrow(CandidateEvidenceBoundaryError);
    }
  });

  it('leaves no grade, interval, or learner-state field anywhere in the log', () => {
    const { store, candidateId } = storeWithCandidate();
    store.execute({ kind: 'acceptCandidate', candidateId });

    const serialised = JSON.stringify(store.readAll());
    for (const forbidden of ['grade', 'stability', 'difficulty', 'interval', 'tier']) {
      expect(serialised, forbidden).not.toContain(`"${forbidden}"`);
    }
  });
});

describe('the acceptance cannot be triggered by anything but a press', () => {
  const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const read = (file: string): string => readFileSync(resolve(APP_ROOT, file), 'utf8');
  const hook = read('src/candidate/use-candidate.ts');
  const panel = read('src/candidate/candidate-panel.tsx');

  it('is dispatched from exactly one place in the slice', () => {
    expect(hook).toContain("kind: 'acceptCandidate'");
    expect(panel).not.toContain('acceptCandidate');
  });

  it('is not wired to any effect, timer, or arrival', () => {
    // The accept callback must not appear inside a useEffect body: the hook's
    // only effect is the unmount cleanup.
    const effects = hook.match(/useEffect\([\s\S]*?\n {2}\}, \[[^\]]*\]\);/g) ?? [];
    for (const effect of effects) {
      expect(effect).not.toContain('accept');
      expect(effect).not.toContain('requestCandidate');
    }
    expect(hook).not.toMatch(/setTimeout|setInterval/);
  });

  it('is a no-op once the candidate is already accepted', () => {
    expect(hook).toContain("existing.status === 'accepted'");
  });

  it('never requests a candidate on mount — the learner presses a button', () => {
    expect(panel).toContain('candidate-request');
    expect(hook).not.toMatch(/useEffect\([^)]*\{\s*request\(\)/);
  });
});
