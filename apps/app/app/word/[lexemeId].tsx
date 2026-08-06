import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { findLexemeById } from '@/data/catalog';
import { findDriftWord } from '@/data/drift-lexicon';
import { DriftWordScreen } from '@/screens/drift-word-screen';
import { WordScreen } from '@/screens/word-screen';
import { RouteTitle } from '@/ui/route-title';

/** Route `/word/:lexemeId` — the layered word page (controller §10 screen 2). */
export default function WordRoute(): ReactNode {
  const router = useRouter();
  const { lexemeId } = useLocalSearchParams<{ lexemeId: string }>();

  const resolved = typeof lexemeId === 'string' ? lexemeId : '';
  // Seed first — the sixteen curated entries stay the richer page. A miss
  // falls through to the Drift lexical tier keyed by the headword itself
  // (BUNKI_ONE_APP_CONVERGENCE_SPEC_2026-08-06.md §2); seed ids (`lex-…`)
  // and headwords cannot collide, so the one param serves both.
  const seedLexeme = findLexemeById(resolved);
  const driftWord = seedLexeme === null ? findDriftWord(resolved) : null;
  // The headword, not the id: "Word — 分岐" is a bookmark someone can use, and
  // "Word — lex-bunki" is the internal-identifier leak this wave also fixed on
  // the session prompt. `undefined` when the id resolves to nothing, which
  // leaves the title as the plain route label rather than inventing a word.
  const headword = seedLexeme?.headword ?? driftWord?.headword;

  if (seedLexeme === null && driftWord !== null) {
    return (
      <>
        <RouteTitle detail={headword} href="/word/[lexemeId]" />
        <DriftWordScreen
          headword={driftWord.headword}
          onBack={() => router.push('/')}
          onOpenKanji={(character) => router.push(`/kanji/${encodeURIComponent(character)}`)}
          onOpenWord={(next) => router.push(`/word/${encodeURIComponent(next)}`)}
        />
      </>
    );
  }

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
