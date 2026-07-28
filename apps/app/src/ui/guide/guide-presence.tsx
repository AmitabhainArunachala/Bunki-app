/**
 * The 案内人's presence in the shell (Wave D; map document §4.1).
 *
 * ## The problem this solves
 *
 * The map document is specific about what the guide is: *"not a bubble in the
 * corner. It is somewhere on the road, ahead of you. It walks."* Two shapes were
 * available and both contradict that sentence.
 *
 * A **tab** makes the guide a room. You go in, you come out, and while you are
 * anywhere else it does not exist — which is the opposite of a constant
 * presence, and is also how the shell reached seven destinations.
 *
 * A **floating chat bubble** is worse. It is the Todaii "Tomo Chat" placement
 * the frozen spec rejects by name (§10.4: *"AI as bolt-on — explains but
 * remembers, updates, and schedules nothing"*), and a bubble that follows you
 * around asking to be tapped is a solicitation rather than a companion.
 *
 * ## What this is instead
 *
 * One quiet line, carried by the shell on every surface, that says **where the
 * guide is standing relative to the surface you are on**. It moves as you move,
 * because that is what walking with someone looks like when you can only draw
 * one line of it. Tapping it opens the guide's own surface, where the real road,
 * the real position and the conversation live.
 *
 * ## What it deliberately is not
 *
 * - **It is not learner state.** Every stance below is a fact about the
 *   *surface*, not about the person: "at the fork" is true of the branches
 *   screen whether or not the learner has any branches open. The guide's real
 *   position on a real road — `positionHeadline`, station _n_ of _m_ — is
 *   computed from records and lives on the guide's own screen, because that is
 *   a claim and a claim belongs where it can be inspected. A shell rail that
 *   quietly asserted a station number on every screen would be exactly the
 *   ambient-claim failure this build keeps refusing.
 * - **It reads no store and executes nothing.** It takes a pathname and returns
 *   a string. `test/guide-boundary.test.ts` walks this directory and asserts no
 *   file in it can write; this one could not if it tried.
 * - **It never asks for anything.** No count, no dot, no pip — nothing that
 *   grows or lights up to be noticed. The line is the same size whether the
 *   guide has something to say or not, because a presence that pulls is a
 *   notification. (The word this paragraph avoids is one `guide-boundary.test.ts`
 *   forbids anywhere on the guide surface, and it is right to: the thing it
 *   names is a reward token, and a comment mentioning one is how the first one
 *   arrives.)
 */

import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SPACE, TYPE } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';

/** The 案内人's name, in the script it is a word of. */
export const GUIDE_NAME = '案内人';

/**
 * Where the guide stands, per surface.
 *
 * Keyed by the destination's `href`, with dynamic routes matched by prefix. A
 * surface with no entry gets {@link DEFAULT_STANCE}, which is the map
 * document's own sentence — so an unrouted or future screen still gets a true
 * line rather than an empty rail.
 */
export const GUIDE_STANCES: Readonly<Record<string, string>> = {
  '/': 'on the road with you, looking over the country you have walked',
  '/capture': 'beside you while you pick something up',
  '/session': 'waiting at the far end of the sitting',
  '/journey': 'at the fork, where the evidence opened one',
  '/read': 'reading over your shoulder, and it will not interrupt',
  '/evidence': 'standing back — the record belongs to the gate, not to the guide',
  '/debug': 'standing back — it does not speak for the sources',
  '/word': 'one station on, if you want to know where this word goes',
  '/kanji': 'one station on, if you want to know where this character came in on',
  '/canvas': 'just outside the passage',
  '/repair': 'at the detour, waiting for the rejoin',
  '/style-guide': 'not here — this surface is for the builders',
};

/** The map document's own sentence, for any surface with no entry above. */
export const DEFAULT_STANCE = 'somewhere on the road, ahead of you';

/** What the rail says when the learner is already on the guide's surface. */
export const HERE_STANCE = 'here, with the road and the conversation open';

/**
 * Longest-prefix match, so `/word/1234` gets the word stance.
 *
 * `/` is matched exactly — a `startsWith` test would give the map's stance to
 * every route in the app, which is the same defect `isCurrent` avoids in the
 * shell and for the same reason.
 */
export function stanceFor(pathname: string): string {
  if (pathname === '/' || pathname === '') return GUIDE_STANCES['/'] as string;
  let best: string | null = null;
  let bestLength = 0;
  for (const [href, stance] of Object.entries(GUIDE_STANCES)) {
    if (href === '/') continue;
    if ((pathname === href || pathname.startsWith(`${href}/`)) && href.length > bestLength) {
      best = stance;
      bestLength = href.length;
    }
  }
  return best ?? DEFAULT_STANCE;
}

export interface GuidePresenceProps {
  /** The route the learner is on, from `usePathname()`. */
  readonly pathname: string;
  /** Open the guide's own surface. Not called when already there. */
  readonly onOpen: () => void;
  /** True on `/guide` itself, where the rail states presence and does not link. */
  readonly here: boolean;
  readonly testID?: string | undefined;
}

/**
 * The rail.
 *
 * On the guide's own surface it is a plain line rather than a control: a link to
 * the page you are on is a dead tap, and a rail that stayed pressable there
 * would be the shell asserting there is somewhere else to go when there is not.
 */
export function GuidePresence({
  pathname,
  onOpen,
  here,
  testID = 'guide-presence',
}: GuidePresenceProps): ReactNode {
  const theme = useTheme();
  const stance = here ? HERE_STANCE : stanceFor(pathname);

  const body = (
    <View style={styles.row}>
      <Text style={[styles.name, { color: theme.color.inkMuted, fontFamily: theme.font.mincho }]}>
        {GUIDE_NAME}
      </Text>
      <Text
        numberOfLines={2}
        style={[styles.stance, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}
      >
        {stance}
      </Text>
    </View>
  );

  if (here) {
    return (
      <View
        style={[
          styles.rail,
          { backgroundColor: theme.color.paper, borderBottomColor: theme.color.rule },
        ]}
        testID={`${testID}-here`}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityHint="Opens the guide’s road, its plan, and the conversation behind them."
      accessibilityLabel={`The guide, ${GUIDE_NAME} — ${stance}`}
      accessibilityRole="link"
      onPress={onOpen}
      style={({ pressed }) => [
        styles.rail,
        {
          // Painted, never transparent. A transparent rail sits on the
          // document's default white, and in the dark scheme axe measured its
          // text at 2.29:1 on every route (WCAG 1.4.3).
          backgroundColor: theme.color.paper,
          borderBottomColor: theme.color.rule,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
      testID={testID}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  name: {
    // Never wrapped. 案内人 broken over two lines is not a name, it is damage,
    // and at 390 CSS px it was breaking after the second character.
    flexShrink: 0,
    fontSize: TYPE.meta,
    letterSpacing: 1,
  },
  rail: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    // 44, like every other control in the app. It is a link, and REQ-UI-09's
    // touch minimum has no exemption for chrome — the shell is on every screen,
    // so its controls are the most-tapped in the app and the last place to
    // spend a target. The quietness lives in the type and the colour, which is
    // where quietness belongs, rather than in a target a thumb cannot find.
    minHeight: 44,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.xs,
  },
  row: {
    alignItems: 'baseline',
    flexDirection: 'row',
    flexShrink: 1,
    gap: SPACE.sm,
  },
  stance: {
    flexShrink: 1,
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.4,
  },
});
