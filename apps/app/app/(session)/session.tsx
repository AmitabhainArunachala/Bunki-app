import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { SessionScreen } from '@/screens/session-screen';
import { isGoldenSourceReturn } from '@/data/golden-source';
import { createRuntimeContext } from '@/state/runtime';
import { RouteTitle } from '@/ui/route-title';

/**
 * Route `/session` — the finite sitting (controller §10 screen 4).
 *
 * The `context` here is a fallback, not the live one. With `(session)/_layout`
 * mounted, `useSessionLoop` returns the layout's shared workspace and this
 * context is used only for a bootstrap that is then discarded — which appends
 * nothing, because `bootstrapSessionWorkspace` only reads the store. Routes are
 * written this way so each stays valid rendered on its own.
 */
const context = createRuntimeContext();

export default function SessionRoute(): ReactNode {
  const router = useRouter();
  const { thread, source, anchor } = useLocalSearchParams<{
    thread?: string;
    source?: string;
    anchor?: string;
  }>();
  const guided = isGoldenSourceReturn(
    typeof source === 'string' ? source : undefined,
    typeof anchor === 'string' ? anchor : undefined,
  );
  const suffix =
    guided && typeof thread === 'string'
      ? `?thread=${encodeURIComponent(thread)}&source=${encodeURIComponent(source as string)}&anchor=${encodeURIComponent(anchor as string)}`
      : '';
  const back = guided
    ? () => router.push(`/source?focus=${encodeURIComponent(anchor as string)}`)
    : () => router.push('/');

  return (
    <>
      <RouteTitle href="/session" />
      <SessionScreen
        context={context}
        newBudget={guided ? 2 : undefined}
        onBack={back}
        onInspectEvidence={(threadId) =>
          router.push(
            guided
              ? `/evidence?thread=${encodeURIComponent(threadId)}&source=${encodeURIComponent(source as string)}&anchor=${encodeURIComponent(anchor as string)}`
              : `/evidence?thread=${encodeURIComponent(threadId)}`,
          )
        }
        onOpenCanvas={() => router.push(`/canvas${suffix}`)}
        onOpenRepair={() => router.push('/repair')}
      />
    </>
  );
}
