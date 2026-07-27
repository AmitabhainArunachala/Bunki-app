import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { SessionScreen } from '@/screens/session-screen';
import { createRuntimeContext } from '@/state/runtime';

/**
 * Route `/session` — the finite sitting (controller §10 screen 4).
 *
 * The `context` here is a fallback, not the live one. With `(session)/_layout`
 * mounted, `useSessionLoop` returns the layout's shared workspace and this
 * context is used only for a bootstrap that is then discarded — which appends
 * nothing, because `AppStore.execute` short-circuits on the command's content
 * key. Routes are written this way so each stays valid rendered on its own.
 */
const context = createRuntimeContext();

export default function SessionRoute(): ReactNode {
  const router = useRouter();

  return (
    <SessionScreen
      context={context}
      onBack={() => router.push('/')}
      onOpenCanvas={() => router.push('/canvas')}
      onOpenRepair={() => router.push('/repair')}
    />
  );
}
