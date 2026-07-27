import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { findLexemeById } from '@/data/catalog';
import { WordScreen } from '@/screens/word-screen';
import { RouteTitle } from '@/ui/route-title';

/** Route `/word/:lexemeId` — the layered word page (controller §10 screen 2). */
export default function WordRoute(): ReactNode {
  const router = useRouter();
  const { lexemeId } = useLocalSearchParams<{ lexemeId: string }>();

  const resolved = typeof lexemeId === 'string' ? lexemeId : '';
  // The headword, not the id: "Word — 分岐" is a bookmark someone can use, and
  // "Word — lex-bunki" is the internal-identifier leak this wave also fixed on
  // the session prompt. `null` when the id resolves to nothing, which leaves the
  // title as the plain route label rather than inventing a word.
  const headword = findLexemeById(resolved)?.headword;

  return (
    <>
      <RouteTitle detail={headword} href="/word/[lexemeId]" />
      <WordScreen
        lexemeId={resolved}
        onBack={() => router.push('/')}
        onOpenKanji={(character) => router.push(`/kanji/${encodeURIComponent(character)}`)}
        onOpenWord={(next) => router.push(`/word/${encodeURIComponent(next)}`)}
      />
    </>
  );
}
