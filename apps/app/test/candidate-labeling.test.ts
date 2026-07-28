/**
 * T-12, structural half: candidate content is labelled (WP-07 closure
 * predicate item 4; controller §9, §19 WP-07).
 *
 * T-12's E2E half — that the label is visible in the rendered DOM of the
 * exported web build — is WP-10's, which owns `apps/app/e2e/`. What can be
 * proven here without a renderer is the part a render test would prove badly
 * anyway: that **there is no code path that produces an unlabelled candidate**,
 * and that no screen holds a label string of its own that could drift from the
 * package that defines it.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CANDIDATE_LABEL, OFFLINE_FALLBACK_LABEL, OFFLINE_FALLBACK_PROVIDER } from '@bunki/ai';
import type { CandidateEnvelopeMetadata } from '@bunki/domain';

import {
  checkLine,
  isOfflineFallbackCandidate,
  labelsFor,
  originLine,
  statusLine,
} from '../src/candidate/candidate-view-model.ts';
import type { CandidateView } from '../src/state/store.ts';

const envelope = (
  overrides: Partial<CandidateEnvelopeMetadata> = {},
): CandidateEnvelopeMetadata => ({
  taskClass: 'T2',
  inputHash: 'hash-1',
  promptFamilyId: 'bunki.candidate.bounded-explanation',
  promptVersion: '2026-07-27.1',
  model: 'claude-opus-5',
  provider: 'anthropic',
  createdAt: '2026-07-27T09:00:00.000Z',
  checks: { targetFormPresent: true, isLabeled: true },
  ...overrides,
});

const candidate = (overrides: Partial<CandidateView> = {}): CandidateView => ({
  candidateId: 'candidate-0001',
  threadId: 'thread-0001',
  status: 'generated',
  envelope: envelope(),
  text: '分岐 is the noun for a split into branches.',
  acceptedAt: null,
  ...overrides,
});

describe('every candidate carries the generated label', () => {
  it('labels a live candidate', () => {
    const labels = labelsFor(candidate());
    expect(labels.primary).toBe(CANDIDATE_LABEL);
    expect(labels.primary).toBe('AI candidate / generated');
    expect(labels.secondary).toBeNull();
  });

  it('labels a fallback candidate twice, never instead', () => {
    const fallback = candidate({
      envelope: envelope({ provider: OFFLINE_FALLBACK_PROVIDER, model: 'scripted-fixture@x' }),
    });
    const labels = labelsFor(fallback);

    expect(labels.primary).toBe(CANDIDATE_LABEL);
    expect(labels.secondary).toBe(OFFLINE_FALLBACK_LABEL);
    expect(isOfflineFallbackCandidate(fallback)).toBe(true);
  });

  it('labels an accepted candidate exactly as it labelled the unaccepted one', () => {
    const kept = candidate({ status: 'accepted', acceptedAt: '2026-07-27T09:01:00.000Z' });
    expect(labelsFor(kept).primary).toBe(CANDIDATE_LABEL);
    expect(statusLine(kept)).toMatch(/stays labelled as generated/i);
  });

  it('speaks the label to a screen reader that cannot see the badges', () => {
    expect(labelsFor(candidate()).accessibilityLabel).toContain(CANDIDATE_LABEL);
    expect(
      labelsFor(candidate({ envelope: envelope({ provider: OFFLINE_FALLBACK_PROVIDER }) }))
        .accessibilityLabel,
    ).toContain(OFFLINE_FALLBACK_LABEL);
  });

  it('says what a fallback is rather than implying a live model answered', () => {
    const note = labelsFor(
      candidate({ envelope: envelope({ provider: OFFLINE_FALLBACK_PROVIDER }) }),
    ).standingNote;
    expect(note).toMatch(/pre-written|not from a live model/i);
  });
});

describe('the panel states what it knows about the candidate', () => {
  it('renders the origin from the envelope the event log holds', () => {
    expect(originLine(candidate())).toContain('anthropic');
    expect(originLine(candidate())).toContain('claude-opus-5');
    expect(originLine(candidate())).toContain('2026-07-27.1');
    expect(originLine(candidate())).toContain('T2');
  });

  it('reports the deterministic check either way, not only when it passes', () => {
    expect(checkLine(candidate())).toMatch(/contains the word/i);
    const failing = candidate({
      envelope: envelope({ checks: { targetFormPresent: false, isLabeled: true } }),
    });
    expect(checkLine(failing)).toMatch(/failed/i);
    expect(checkLine(failing)).toMatch(/off-target/i);
  });

  it('never claims an unaccepted note is part of the record', () => {
    expect(statusLine(candidate())).toMatch(/nothing about this note is in your record/i);
  });
});

// ---------------------------------------------------------------------------
// Source-level: nothing retypes a label, nothing renders without one
// ---------------------------------------------------------------------------

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (['.ts', '.tsx'].includes(extname(full))) out.push(full);
  }
  return out;
}

const sourceFiles = ['app', 'src'].flatMap((dir) => walk(resolve(APP_ROOT, dir)));
const rel = (file: string): string => relative(APP_ROOT, file);
const read = (file: string): string => readFileSync(file, 'utf8');

/**
 * Source with comments removed.
 *
 * This file's subject is a label, and the modules that own it have to *name* it
 * to be documented at all. Scanning raw text would make every explanation of
 * the rule a violation of it — the sort of test that gets deleted rather than
 * fixed. Strings survive, so a retyped label in rendered copy is still caught.
 */
const code = (file: string): string =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const panel = code(resolve(APP_ROOT, 'src/candidate/candidate-panel.tsx'));
const viewModel = read(resolve(APP_ROOT, 'src/candidate/candidate-view-model.ts'));

describe('the label strings come from @bunki/ai, not from a screen', () => {
  it('is not retyped anywhere in the app', () => {
    const offenders = sourceFiles.filter(
      (file) =>
        code(file).includes(`'${CANDIDATE_LABEL}'`) || code(file).includes(`"${CANDIDATE_LABEL}"`),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it('reaches the view model by import', () => {
    expect(viewModel).toContain('@bunki/ai');
    expect(viewModel).toContain('CANDIDATE_LABEL');
  });

  it('is applied by the panel through labelsFor, so no branch can omit it', () => {
    expect(panel).toContain('labelsFor');
    expect(panel).toContain('candidate-label');
    // The panel renders text, never a label it computed itself.
    expect(panel).not.toMatch(/AI\s+candidate/);
  });
});

describe('the candidate slice respects the app-wide boundaries', () => {
  const slice = sourceFiles.filter((file) => rel(file).startsWith('src/candidate/'));

  it('exists and is a slice, not a screen', () => {
    expect(slice.length).toBeGreaterThan(0);
    expect(readdirSync(resolve(APP_ROOT, 'src/screens')).sort()).not.toContain('candidate');
  });

  it('never mints an event itself — every append goes through the store', () => {
    for (const file of slice) {
      expect(code(file), rel(file)).not.toContain('createDomainEvent');
    }
  });

  it('never names a network API directly', () => {
    for (const file of slice) {
      expect(code(file), rel(file)).not.toMatch(/\bglobalThis\b|\bXMLHttpRequest\b/);
      expect(code(file), rel(file)).not.toMatch(/(^|[^.\w])fetch\s*\(/);
    }
  });

  it('renders all four REQ-UI-09 states', () => {
    expect(panel).toContain('LoadingPanel');
    expect(panel).toContain('ErrorPanel');
    expect(panel).toContain('EmptyPanel');
    expect(panel).toContain('offline');
  });
});
