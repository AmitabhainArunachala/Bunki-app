import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { EvidenceInspectorScreen } from '@/screens/evidence-inspector-screen';

/**
 * Route `/evidence` — the evidence inspector (controller §10 screen 6).
 *
 * The route owns navigation and nothing else. `?thread=` selects which thread
 * to inspect so a chain is a shareable URL and the evidence harness can land on
 * one directly; without it the newest thread is shown.
 */
export default function EvidenceRoute(): ReactNode {
  const router = useRouter();
  const { thread } = useLocalSearchParams<{ thread?: string }>();

  return (
    <EvidenceInspectorScreen
      onBack={() => router.push('/')}
      onOpenDebug={() => router.push('/debug')}
      threadId={typeof thread === 'string' && thread !== '' ? thread : undefined}
    />
  );
}
