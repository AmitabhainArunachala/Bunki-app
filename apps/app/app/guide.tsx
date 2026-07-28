import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { GuideScreen } from '@/screens/guide-screen';
import { findLexemeByHeadword } from '@/data/catalog';
import { RouteTitle } from '@/ui/route-title';

/**
 * Route `/guide` — the 案内人 (Campaign E / B6).
 *
 * The one action the guide has is "go and look at this", and this is where that
 * verb is wired: a written form becomes the word page for it. There is no other
 * callback on the screen, because there is no other thing the guide is allowed
 * to ask the app to do — `GUIDE_ACTION_KINDS` in `@bunki/domain` has exactly one
 * member and a test asserts it by equality.
 *
 * The lookup happens here rather than in the screen for the same reason the
 * kanji route resolves its stroke data at the route: the screen stays
 * renderable without the catalog, and the route owns the href.
 *
 * `declaredBranches` is deliberately not passed. A fork is declared by the
 * evidence gate from a graded review, and the only surface that holds one in
 * this build is the session workspace, which is mounted inside the `(session)`
 * group. The screen renders the empty case and explains it rather than
 * inventing a fork so that the at-the-fork state has something to draw.
 */
export default function GuideRoute(): ReactNode {
  const router = useRouter();

  return (
    <>
      <RouteTitle href="/guide" />
      <GuideScreen
        onOpenWord={(targetForm) => {
          const lexeme = findLexemeByHeadword(targetForm);
          if (lexeme === null) return;
          router.push(`/word/${encodeURIComponent(lexeme.id)}`);
        }}
      />
    </>
  );
}
