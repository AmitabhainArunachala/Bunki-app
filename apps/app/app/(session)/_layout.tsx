import { Stack } from 'expo-router';
import { type ReactNode } from 'react';

import { SessionWorkspaceProvider } from '@/screens/session-workspace';
import { createRuntimeContext } from '@/state/runtime';

/**
 * The session group's layout (WP-10, applying COORD-B8-3 as revised).
 *
 * One workspace for all three routes beneath it. B8's first version of this
 * request gave each route its own `createRuntimeContext()`, which would have
 * closed the routing gap by opening a state-sharing one: pressing "Open the
 * passage" from a session would have landed on a canvas that had started a
 * session of its own. B8 caught that themselves and shipped
 * `SessionWorkspaceProvider` to fix it; this layout is the other half.
 *
 * It is deliberately *not* in `app/_layout.tsx`. Bootstrapping a session
 * captures the seeded target through the same store the capture screen writes
 * to, on purpose, so the sitting runs over a real thread — at the app root that
 * would put an encounter nobody captured into the capture list on every launch.
 */
const context = createRuntimeContext();

export default function SessionGroupLayout(): ReactNode {
  return (
    <SessionWorkspaceProvider context={context}>
      <Stack screenOptions={{ headerShown: false }} />
    </SessionWorkspaceProvider>
  );
}
