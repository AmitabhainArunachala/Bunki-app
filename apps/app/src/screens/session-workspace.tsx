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
 * Bootstrapping a session *captures* the seeded target through the same store
 * the capture screen writes to, deliberately, so the sitting runs over the
 * learner's own thread. At the root that would put an encounter nobody captured
 * into the capture list on every launch. It belongs around the session routes
 * and nowhere else — an `app/(session)/_layout.tsx` group, which adds a file
 * rather than changing one.
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
