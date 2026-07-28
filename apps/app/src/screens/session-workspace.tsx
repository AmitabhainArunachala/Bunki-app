/**
 * One session workspace, shared by the three WP-08 screens (WP-08 repair round).
 *
 * ## The problem this solves
 *
 * `useSessionLoop` holds the session's log in React state. Three screens each
 * calling it means three independent workspaces: pressing "Open the passage"
 * from a session would land on a canvas that had started a session of its own,
 * and the canvas's probe would never appear in the session the learner thought
 * they were in. That is not hypothetical — it is what the route files requested
 * as COORD-B8-3 would have produced, each building its own `DomainContext` at
 * module scope.
 *
 * Mounting this provider above the three routes fixes it without any screen
 * changing: `useSessionLoop` returns the provided workspace when there is one
 * and builds its own when there is not, so a screen rendered on its own (a test,
 * the screenshot harness) behaves exactly as before.
 *
 * ## Why it is not mounted at the app root
 *
 * Historically because it had to be: bootstrapping a session used to *write* a
 * capture and a promotion through the store, so mounting it at the root would
 * have put an encounter nobody captured into the capture list on every launch.
 * The WP-10 repair round removed the writes — the bootstrap is a pure read now,
 * and there is no target at all until the learner has promoted a thread
 * themselves. Scoping it to `app/(session)/_layout.tsx` is still right, because
 * a workspace mounted above the capture screen would hold a plan composed before
 * the learner had done anything to plan over; it is no longer what stops the
 * session from fabricating evidence.
 */

import { useContext, type ReactNode } from 'react';

import type { DomainContext, DomainEvent } from '@bunki/domain';

import { SessionWorkspaceContext, useOwnSessionLoop, type SessionLoop } from './session-loop.ts';

export interface SessionWorkspaceProviderProps {
  readonly children: ReactNode;
  readonly context: DomainContext;
  /** Handed every event the session produced, for the WP-10 integration. */
  readonly onEvents?: ((events: readonly DomainEvent[]) => void) | undefined;
}

export function SessionWorkspaceProvider({
  children,
  context,
  onEvents,
}: SessionWorkspaceProviderProps): ReactNode {
  const loop = useOwnSessionLoop({ context, onEvents });
  return (
    <SessionWorkspaceContext.Provider value={loop}>{children}</SessionWorkspaceContext.Provider>
  );
}

/**
 * The shared workspace, or `null` when this screen is rendered outside one.
 *
 * `null` is a supported answer rather than an error, which is the difference
 * between a provider that improves navigation and one that becomes a mandatory
 * dependency of every screen that touches a session.
 */
export function useSharedSessionLoop(): SessionLoop | null {
  return useContext(SessionWorkspaceContext);
}
