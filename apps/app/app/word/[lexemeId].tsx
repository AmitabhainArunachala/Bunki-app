import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { WordScreen } from '@/screens/word-screen';

/** Route `/word/:lexemeId` — the layered word page (controller §10 screen 2). */
export default function WordRoute(): ReactNode {
  const router = useRouter();
  const { lexemeId } = useLocalSearchParams<{ lexemeId: string }>();

  return (
    <WordScreen
      lexemeId={typeof lexemeId === 'string' ? lexemeId : ''}
      onBack={() => router.push('/')}
      onOpenKanji={(character) => router.push(`/kanji/${encodeURIComponent(character)}`)}
      onOpenWord={(next) => router.push(`/word/${encodeURIComponent(next)}`)}
    />
  );
}
