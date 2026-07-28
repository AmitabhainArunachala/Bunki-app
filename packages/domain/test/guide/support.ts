/**
 * Fixtures for the guide suite (Campaign E / B6).
 *
 * Real seed vocabulary, transcribed rather than imported: `@bunki/domain` may
 * not import `@bunki/seed` (controller §5), and a road built from invented words
 * would test the arithmetic while hiding the thing the road is for. Every form
 * and every sentence below is in `packages/seed/data/`.
 */

import type { RouteWaypointCandidate } from '../../src/guide/records.ts';
import type { GuidePrompt } from '../../src/guide/assessment.ts';

export const AT = '2026-07-28T09:00:00.000Z';
export const LATER = '2026-07-28T09:05:00.000Z';

/**
 * Eight stations across the three era layers.
 *
 * 道 and 分かれる are the native stratum; 岐路, 分岐点 and 道路 are the 漢語 of
 * the highway era; 駅, 線路 and 分岐 are the rail era — with 駅 the character
 * that walked all three roads for real (map document §3.2).
 */
export const CANDIDATES: readonly RouteWaypointCandidate[] = [
  {
    id: 'wp-michi',
    layer: 'kodo',
    name: '道',
    targetForm: '道',
    lens: 'reading',
    note: 'the native word for a road',
  },
  {
    id: 'wp-wakareru',
    layer: 'kodo',
    name: '分かれる',
    targetForm: '分かれる',
    lens: 'meaning',
    note: 'the native verb the product is named after',
  },
  {
    id: 'wp-kiro',
    layer: 'kaido',
    name: '岐路',
    targetForm: '岐路',
    lens: 'meaning',
    note: 'a literary word for a forked road',
  },
  {
    id: 'wp-bunkiten',
    layer: 'kaido',
    name: '分岐点',
    targetForm: '分岐点',
    lens: 'reading',
    note: 'the place a road divides',
  },
  {
    id: 'wp-douro',
    layer: 'kaido',
    name: '道路',
    targetForm: '道路',
    lens: 'reading',
    note: 'the made road, as a compound',
  },
  {
    id: 'wp-eki',
    layer: 'tetsudo',
    name: '駅',
    targetForm: '駅',
    lens: 'reading',
    note: 'the post-station word the railways took back up',
  },
  {
    id: 'wp-senro',
    layer: 'tetsudo',
    name: '線路',
    targetForm: '線路',
    lens: 'reading',
    note: 'the rail line itself',
  },
  {
    id: 'wp-bunki',
    layer: 'tetsudo',
    name: '分岐',
    targetForm: '分岐',
    lens: 'meaning',
    note: 'the railway term the product is named for',
  },
];

export const PROMPTS: readonly (GuidePrompt & { readonly turnId: string })[] = [
  {
    turnId: 'turn-senro',
    targetForm: '線路',
    excerpt: '線路はこの先で二つに分かれる。',
    seedRef: 'sen-01',
  },
  {
    turnId: 'turn-bunkiten',
    targetForm: '分岐点',
    excerpt: '分岐点まで来て、右の道を行くことにした。',
    seedRef: 'sen-02',
  },
  {
    turnId: 'turn-kiro',
    targetForm: '岐路',
    excerpt: '岐路に立ったときは、自分で決めるしかない。',
    seedRef: 'sen-03',
  },
];
