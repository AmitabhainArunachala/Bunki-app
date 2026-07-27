import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { InspectorDebugScreen } from '@/screens/inspector-debug-screen';
import { RouteTitle } from '@/ui/route-title';

/**
 * Route `/debug` — the local diagnostic buffer (controller §12).
 *
 * Reachable from the evidence inspector rather than from the home screen: it is
 * a diagnostic surface, not a learning one, and putting it on the main path
 * would make the app's front door a dashboard.
 */
export default function DebugRoute(): ReactNode {
  const router = useRouter();
  return (
    <>
      <RouteTitle href="/debug" />
      <InspectorDebugScreen onBack={() => router.push('/evidence')} />
    </>
  );
}
