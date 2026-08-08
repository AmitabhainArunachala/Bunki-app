import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { EvidenceInspectorScreen } from '@/screens/evidence-inspector-screen';
import { goldenSourceStudy, isGoldenSourceReturn } from '@/data/golden-source';
import { RouteTitle } from '@/ui/route-title';

/**
 * Route `/evidence` — the evidence inspector (controller §10 screen 6).
 *
 * The route owns navigation and nothing else. `?thread=` selects which thread
 * to inspect so a chain is a shareable URL and the evidence harness can land on
 * one directly; without it the newest thread is shown.
 */
export default function EvidenceRoute(): ReactNode {
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
  const study = goldenSourceStudy();

  return (
    <>
      <RouteTitle href="/evidence" />
      <EvidenceInspectorScreen
        onBack={() => router.push('/')}
        onOpenDebug={() => router.push('/debug')}
        onReturnToSource={
          guided
            ? () => router.push(`/source?focus=${encodeURIComponent(study.anchor.id)}`)
            : undefined
        }
        returnSourceLabel={guided ? `${study.source.title} · ${study.targetText}` : undefined}
        threadId={typeof thread === 'string' && thread !== '' ? thread : undefined}
      />
    </>
  );
}
