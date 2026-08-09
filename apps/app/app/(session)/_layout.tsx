import { Stack, useLocalSearchParams } from 'expo-router';
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
 * It is deliberately *not* in `app/_layout.tsx`, and since the WP-10 repair round
 * that is a scoping choice rather than a safety one. Bootstrapping a session used
 * to *write* a capture and a promotion through the store, which made mounting
 * this provider at the root — or reaching the Session link at all — enough to
 * fabricate evidence in the learner's durable log. It now only reads: the sitting
 * is planned over threads the learner promoted themselves, and there is no target
 * until they have. Keeping the provider scoped to the three session routes stays
 * right anyway, because a workspace mounted above the capture screen would hold a
 * plan composed before the learner had done anything to plan over.
 */
const context = createRuntimeContext();

export default function SessionGroupLayout(): ReactNode {
  const { thread } = useLocalSearchParams<{ thread?: string }>();
  return (
    <SessionWorkspaceProvider
      context={context}
      preferredThreadId={typeof thread === 'string' && thread !== '' ? thread : undefined}
    >
      <Stack screenOptions={{ headerShown: false }} />
    </SessionWorkspaceProvider>
  );
}
