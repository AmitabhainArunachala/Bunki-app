/**
 * The candidate panel's React binding (WP-07).
 *
 * Thin on purpose: every decision worth testing lives in
 * `candidate-view-model.ts` (what the labels say), `candidate-context.ts` (what
 * may be sent), or `@bunki/ai` (timeout, fallback, validation). This hook only
 * wires them to a component's lifecycle.
 *
 * Two lifecycle rules it does enforce, because React is where they can go
 * wrong:
 *
 * **Asking is never automatic.** There is no effect that fires a request on
 * mount. The learner presses a button. An auto-request would spend the
 * operator's budget on every page view (OD-08) and would make "the app asked a
 * model about this" something that happened without anyone deciding it.
 *
 * **Unmounting cancels.** The abort signal is wired to the effect's cleanup, so
 * navigating away aborts the in-flight call rather than leaving it to finish
 * into a component that is gone. The store is never written after unmount
 * either — a late resolution finds `active.current` false and drops.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { toCandidateEnvelopeMetadata, type AiRuntime, type AiThreadContext } from '@bunki/ai';

import { useAppStore } from '../state/app-context.tsx';
import type { AppStore, CandidateView } from '../state/store.ts';
import { NO_SEEDED_CONTEXT_NOTE } from './candidate-context.ts';
import type { CandidatePanelState } from './candidate-view-model.ts';

export interface UseCandidateOptions {
  readonly runtime: AiRuntime;
  readonly threadId: string | null;
  /** `null` when the seed has no sentence for this word — see OD-08. */
  readonly context: AiThreadContext | null;
  /** The candidate already attached to this thread, if any. */
  readonly existing: CandidateView | null;
  /** Injected by tests; the app uses its provider's store. */
  readonly store?: AppStore | undefined;
}

export interface UseCandidateResult {
  readonly state: CandidatePanelState;
  /** Ask for a candidate. Safe to call twice; the second call is ignored. */
  readonly request: () => void;
  /** Accept the current candidate as a note. An explicit user action, always. */
  readonly accept: () => void;
  readonly busy: boolean;
}

const NO_THREAD_NOTE =
  'Keep this word first. A note is attached to a thread, and there is no thread until you keep it.';

export function useCandidate(options: UseCandidateOptions): UseCandidateResult {
  const contextStore = useAppStore();
  const store = options.store ?? contextStore;
  const { runtime, threadId, context, existing } = options;

  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ message: string; detail: string } | null>(null);

  const active = useRef(true);
  const abort = useRef<(() => void) | null>(null);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      abort.current?.();
    };
  }, []);

  const request = useCallback(() => {
    if (busy || threadId === null || context === null) return;
    setBusy(true);
    setFailure(null);

    const controller = new AbortController();
    abort.current = () => controller.abort();

    void runtime
      .requestCandidate({ context, signal: controller.signal })
      .then((outcome) => {
        if (!active.current) return;
        store.execute({
          kind: 'attachCandidate',
          threadId,
          candidateId: outcome.envelope.candidateId,
          // Built by `@bunki/ai`, not assembled here: re-deriving the metadata
          // in the app would create a second definition of what a candidate
          // envelope is, and the two would drift.
          envelope: toCandidateEnvelopeMetadata(outcome.request, outcome.envelope),
          text: outcome.envelope.payload.explanation,
        });
      })
      .catch((error: unknown) => {
        // The runtime resolves for every runtime condition, so reaching here
        // means a caller bug — a context this build cannot form a request from.
        // Say so rather than presenting it as an unavailable network.
        if (!active.current) return;
        setFailure({
          message: 'This note could not be requested.',
          detail: error instanceof Error ? error.message : 'The request could not be built.',
        });
      })
      .finally(() => {
        if (active.current) setBusy(false);
        abort.current = null;
      });
  }, [busy, context, runtime, store, threadId]);

  const accept = useCallback(() => {
    if (existing === null || existing.status === 'accepted') return;
    store.execute({ kind: 'acceptCandidate', candidateId: existing.candidateId });
  }, [existing, store]);

  const state: CandidatePanelState =
    failure !== null
      ? { kind: 'error', message: failure.message, detail: failure.detail }
      : busy
        ? { kind: 'loading' }
        : existing !== null
          ? { kind: 'ready', candidate: existing }
          : threadId === null
            ? { kind: 'unavailable', message: NO_THREAD_NOTE }
            : context === null
              ? { kind: 'unavailable', message: NO_SEEDED_CONTEXT_NOTE }
              : { kind: 'idle' };

  return { state, request, accept, busy };
}
