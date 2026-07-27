/**
 * The contract→thread link, as a projection (WP-06).
 *
 * Conductor disposition (W2, `ORCHESTRATION_LOG.md`): WP-06 builds a
 * target→thread projection from `EncounterCaptured` events; **no ADR-002 schema
 * change**. This file is that projection. `component-identity.ts` explains why
 * a captured target determines a component id; this file turns the resulting
 * edges into an index the gate can ask questions of.
 *
 * Two properties matter more than the code.
 *
 * **It is built forward, in log order.** The gate must judge a review against
 * the promotion state that held *when the review happened*, not the one that
 * holds at the end of the log. So the index is folded alongside everything else
 * during replay rather than precomputed over the whole log; a capture that
 * arrives after a review does not retroactively make that review schedulable.
 *
 * **Ambiguity fails closed, loudly.** If two different threads capture the same
 * target text, the component no longer names one thread, and the honest answer
 * is "I do not know which learning thread this contract belongs to" — not a
 * coin flip between them. The gate then refuses the evidence and records the
 * reason. Picking the first (or the last) would silently attach a learner's
 * reviews to whichever thread happened to be captured first, which is a data
 * corruption nobody would ever see.
 */

import type { DomainEvent, EncounterCapturedEvent } from '../events/catalog.ts';
import type { ComponentId, ThreadId } from '../primitives.ts';
import { componentIdOfEncounter } from './component-identity.ts';

/**
 * `null` records a component that two or more threads claim. It is stored
 * rather than dropped: forgetting the collision would let a third capture of a
 * different target re-establish a false single owner.
 */
type Binding = ThreadId | null;

export interface TargetThreadIndex {
  readonly bindings: ReadonlyMap<ComponentId, Binding>;
}

export type ThreadLinkResolution =
  | { readonly linked: true; readonly threadId: ThreadId }
  | {
      readonly linked: false;
      readonly reason: 'component_never_captured' | 'component_ambiguous';
      readonly detail: string;
    };

/** A mutable index, for folds that own it exclusively (replay). */
export type MutableTargetThreadIndex = Map<ComponentId, Binding>;

export function emptyTargetThreadIndex(): MutableTargetThreadIndex {
  return new Map<ComponentId, Binding>();
}

/**
 * Record one capture's component→thread edge.
 *
 * Mutates the caller's own map. That is not a purity violation: the map is
 * local to a single replay, never shared, and never read from module scope —
 * the same discipline the existing thread/contract accumulators use.
 */
export function indexEncounter(
  index: MutableTargetThreadIndex,
  event: EncounterCapturedEvent,
): void {
  const componentId = componentIdOfEncounter(event);
  if (!index.has(componentId)) {
    index.set(componentId, event.threadId);
    return;
  }
  const existing = index.get(componentId);
  // A re-encounter on the same thread is the normal case and changes nothing.
  if (existing !== event.threadId) index.set(componentId, null);
}

export function freezeTargetThreadIndex(index: MutableTargetThreadIndex): TargetThreadIndex {
  return Object.freeze({ bindings: new Map(index) });
}

/** Build the index over a whole log. For callers outside the replay fold. */
export function buildTargetThreadIndex(events: readonly DomainEvent[]): TargetThreadIndex {
  const index = emptyTargetThreadIndex();
  events.forEach((event) => {
    if (event.type === 'EncounterCaptured') indexEncounter(index, event);
  });
  return freezeTargetThreadIndex(index);
}

export function resolveComponentThread(
  index: TargetThreadIndex | MutableTargetThreadIndex,
  componentId: ComponentId,
): ThreadLinkResolution {
  const bindings = index instanceof Map ? index : index.bindings;
  if (!bindings.has(componentId)) {
    return {
      linked: false,
      reason: 'component_never_captured',
      detail: `no EncounterCaptured in this log instantiates ${JSON.stringify(componentId)}`,
    };
  }
  const threadId = bindings.get(componentId);
  if (threadId === null || threadId === undefined) {
    return {
      linked: false,
      reason: 'component_ambiguous',
      detail: `${JSON.stringify(componentId)} was captured on more than one thread; the owning thread is not determined by the log`,
    };
  }
  return { linked: true, threadId };
}
