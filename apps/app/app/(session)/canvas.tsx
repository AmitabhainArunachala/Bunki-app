import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { CanvasScreen } from '@/screens/canvas-screen';
import { createRuntimeContext } from '@/state/runtime';
import { RouteTitle } from '@/ui/route-title';

/**
 * Route `/canvas` — the integration canvas (controller §10 screen 5).
 *
 * See `session.tsx` for why the module-scope context is a fallback rather than
 * the live one.
 */
const context = createRuntimeContext();

export default function CanvasRoute(): ReactNode {
  const router = useRouter();
  return (
    <>
      <RouteTitle href="/canvas" />
      <CanvasScreen context={context} onBack={() => router.push('/session')} />
    </>
  );
}
