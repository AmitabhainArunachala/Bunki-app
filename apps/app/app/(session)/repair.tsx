import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { SessionRepairScreen } from '@/screens/session-repair-screen';
import { createRuntimeContext } from '@/state/runtime';
import { RouteTitle } from '@/ui/route-title';

/**
 * Route `/repair` — the minimal repair branch (controller §10 screen 7).
 *
 * See `session.tsx` for why the module-scope context is a fallback rather than
 * the live one.
 */
const context = createRuntimeContext();

export default function RepairRoute(): ReactNode {
  const router = useRouter();
  return (
    <>
      <RouteTitle href="/repair" />
      <SessionRepairScreen context={context} onBack={() => router.push('/session')} />
    </>
  );
}
