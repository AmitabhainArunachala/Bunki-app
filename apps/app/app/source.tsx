import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { goldenSourceStudy } from '@/data/golden-source';
import { GoldenSourceScreen } from '@/screens/golden-source-screen';
import { RouteTitle } from '@/ui/route-title';

/** Route `/source` — the real A1 静かな朝 reading and exact 自分 anchor. */
export default function GoldenSourceRoute(): ReactNode {
  const router = useRouter();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const study = goldenSourceStudy();
  const source = encodeURIComponent(study.source.id);
  const anchor = encodeURIComponent(study.anchor.id);

  return (
    <>
      <RouteTitle detail={study.source.title} href="/source" />
      <GoldenSourceScreen
        focusAnchorId={typeof focus === 'string' ? focus : undefined}
        onBack={() => router.push('/')}
        onBeginDrill={(threadId) =>
          router.push(
            `/session?thread=${encodeURIComponent(threadId)}&source=${source}&anchor=${anchor}`,
          )
        }
        onInspectEvidence={(threadId) =>
          router.push(
            `/evidence?thread=${encodeURIComponent(threadId)}&source=${source}&anchor=${anchor}`,
          )
        }
        onOpenWord={(lexemeId) => router.push(`/word/${encodeURIComponent(lexemeId)}`)}
      />
    </>
  );
}
